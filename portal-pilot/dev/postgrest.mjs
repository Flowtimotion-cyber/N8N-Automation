// PostgREST-Nachbildung für den Testserver: genau die Pfade und Methoden, die der Code der Portal-API benutzt.
//
// Was der Code „Anfrage prüfen“ an Supabase schickt (Stand des Abgleichs; Liste auch in portal-pilot/README.md):
//   POST   rpc/team_laden_plus                          Body {}                          (Knoten „Team-Daten laden“)
//   GET    team_einstellungen?select=schluessel,wert                                      (Knoten „Einstellungen laden“)
//   POST   <tabelle>                                     Body = Zeile, Prefer: return=minimal   (neu)
//   PATCH  <tabelle>?<pk>=eq.<id>                        Body = Felder                  (aend)
//   PATCH  <tabelle>?<pk>=in.(<id>,<id>,…)               Body = Felder                  (aendViele, nur Arbeitszeit)
//   DELETE <tabelle>?<pk>=eq.<id>                        Body {}                        (weg: Projekte, Abrechnung)
//   POST   rpc/team_loeschen                             Body { p_art, p_id, p_von }     (Papierkorb)
//   POST   rpc/team_wiederherstellen                     Body { p_eintrag }
//   POST   rpc/team_tn_haken                             Body { p_tn, p_spalte, p_wert, p_datum, p_von }   (nur Modul kurs)
// Tabellen: team_mitglieder, team_aufgaben, team_aufgaben_verlauf, team_projekte, team_notizen, team_vorschlaege, team_zeiten,
//   team_abrechnung, team_social, team_systeme, team_teilnehmer, team_tn_spalten, kurs_community.
// Antworten wie PostgREST: 200 mit JSON (GET, rpc), 201/204 ohne Body bei return=minimal, Fehler als { code, message, details, hint }
//   mit 400 (Prüfung, Funktion wirft), 404 (Tabelle/Funktion fehlt: PGRST205/PGRST202), 409 (Schlüssel doppelt).
//
// Zwei Betriebsarten:
//   SpeicherRest   Tabellen im Speicher (dev/testdaten.mjs), ohne Postgres. Bildet die Funktionen team_loeschen, team_wiederherstellen,
//                  team_laden_plus, team_einstellung_setzen und den Versions-Trigger der Notizen nach.
//   PostgresRest   echter lokaler PostgreSQL über das Programm psql (keine npm-Abhängigkeit); die Migrationen aus supabase/ laufen dort.
import { spawnSync } from 'node:child_process';

const NAME = /^[a-z_][a-z0-9_]*$/;
const antwort = (statusCode, json, text) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, json, text: text !== undefined ? text : (json === undefined ? '' : JSON.stringify(json)) });
const fehler = (statusCode, code, message, details) => antwort(statusCode, { code, message, details: details || null, hint: null });

/** Zerlegt „tabelle?select=a,b&pk=eq.x“ in { tabelle, select, filter: [{ spalte, op, werte }] }. */
export function pfadLesen(pfad) {
  const [tab, q] = pfad.split('?');
  const r = { tabelle: tab, select: null, filter: [] };
  if (!NAME.test(tab.replace(/^rpc\//, ''))) throw new Error('Ungültiger Pfad: ' + pfad);
  for (const [k, v] of new URLSearchParams(q || '')) {
    if (k === 'select') r.select = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'on_conflict' || k === 'order' || k === 'limit') r[k] = v;
    else {
      if (!NAME.test(k)) throw new Error('Ungültige Spalte: ' + k);
      const m = /^(eq|in)\.(.*)$/s.exec(v); if (!m) throw new Error('Filter nicht nachgebildet: ' + k + '=' + v);
      r.filter.push({ spalte: k, op: m[1], werte: m[1] === 'in' ? m[2].replace(/^\(|\)$/g, '').split(',').map(x => decodeURIComponent(x)) : [m[2]] });
    }
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// Betriebsart Speicher
// ---------------------------------------------------------------------------------------------------------------------
const PK = { team_mitglieder: 'mitglied_id', team_projekte: 'projekt_id', team_aufgaben: 'aufgabe_id', team_aufgaben_verlauf: 'id', team_notizen: 'notiz_id', team_notiz_versionen: 'version_id', team_vorschlaege: 'vorschlag_id', team_systeme: 'system_id', team_papierkorb: 'eintrag_id', team_einstellungen: 'schluessel', team_zeiten: 'zeit_id', team_abrechnung: 'abrechnung_id', team_social: 'post_id', team_teilnehmer: 'tn_id', team_tn_spalten: 'spalte_id', kurs_community: 'eintrag_id' };
const EINDEUTIG = { team_projekte: ['name'], team_mitglieder: ['token'] };
const PAPIERKORB_ZIEL = { aufgabe: ['team_aufgaben', 'aufgabe_id', 'titel'], notiz: ['team_notizen', 'notiz_id', 'titel'], vorschlag: ['team_vorschlaege', 'vorschlag_id', 'titel'], system: ['team_systeme', 'system_id', 'name'], social: ['team_social', 'post_id', 'thema'], zeit: ['team_zeiten', 'zeit_id', 'taetigkeit'], teilnehmer: ['team_teilnehmer', 'tn_id', 'name'], idee: ['team_social_ideen', 'idee_id', 'titel'] };
const kopie = o => JSON.parse(JSON.stringify(o));
let lauf = 0;
const zufallId = p => p + new Date().toISOString().replace(/\D/g, '').slice(0, 17) + (++lauf % 1000).toString(36).padStart(2, '0') + Math.random().toString(16).slice(2, 6);

export class SpeicherRest {
  /** T: Tabellen (aus testDaten), jetzt: () => ISO-Zeit. module: welche Optionen „eingespielt“ sind (Tabellen vorhanden). */
  constructor(T, jetzt) { this.T = T; this.jetzt = jetzt || (() => new Date().toISOString()); }
  tabelle(name) { if (!(name in this.T) || !PK[name]) return null; return this.T[name]; }
  async anfrage(methode, pfad, body, kopf) {
    try { return this._anfrage(methode, pfad, body || {}, kopf || {}); }
    catch (e) { if (e.rest) return e.rest; return fehler(500, 'TEST', 'Speicher-Nachbildung: ' + e.message); }
  }
  wirf(statusCode, code, message) { const e = new Error(message); e.rest = fehler(statusCode, code, message); throw e; }
  _anfrage(methode, pfad, body, kopf) {
    const p = pfadLesen(pfad);
    if (p.tabelle.startsWith('rpc/')) { if (methode !== 'POST') this.wirf(405, 'PGRST', 'Nur POST'); return antwort(200, this.rpc(p.tabelle.slice(4), body)); }
    const L = this.tabelle(p.tabelle);
    if (!L) this.wirf(404, 'PGRST205', "Could not find the table 'public." + p.tabelle + "' in the schema cache");
    const pk = PK[p.tabelle];
    const passt = z => p.filter.every(f => f.werte.map(String).includes(String(z[f.spalte])));
    const minimal = /return=minimal/.test(kopf.prefer || '');
    if (methode === 'GET') {
      const rows = L.filter(passt).map(z => p.select ? Object.fromEntries(p.select.map(s => [s, z[s] === undefined ? null : z[s]])) : kopie(z));
      return antwort(200, rows);
    }
    if (methode === 'POST') {
      const z = kopie(body);
      if (p.tabelle === 'team_aufgaben_verlauf' && z.id === undefined) z.id = L.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0) + 1;
      if (z[pk] === undefined) this.wirf(400, '23502', 'null value in column "' + pk + '" violates not-null constraint');
      if (L.some(x => String(x[pk]) === String(z[pk]))) this.wirf(409, '23505', 'duplicate key value violates unique constraint "' + p.tabelle + '_pkey"');
      for (const u of EINDEUTIG[p.tabelle] || []) if (z[u] != null && L.some(x => x[u] === z[u])) this.wirf(409, '23505', 'duplicate key value violates unique constraint "' + p.tabelle + '_' + u + '_key"');
      if (p.tabelle === 'team_aufgaben_verlauf' && !this.T.team_aufgaben.some(a => a.aufgabe_id === z.aufgabe_id)) this.wirf(409, '23503', 'insert or update on table "team_aufgaben_verlauf" violates foreign key constraint');
      this.vorgaben(p.tabelle, z);
      L.push(z);
      return minimal ? antwort(201, undefined, '') : antwort(201, [z]);
    }
    if (methode === 'PATCH') {
      const ziel = L.filter(passt); const neu = [];
      for (const z of ziel) {
        if (p.tabelle === 'team_notizen') this.notizVersion(z, body);
        for (const u of EINDEUTIG[p.tabelle] || []) if (body[u] !== undefined && L.some(x => x !== z && x[u] === body[u])) this.wirf(409, '23505', 'duplicate key value violates unique constraint "' + p.tabelle + '_' + u + '_key"');
        Object.assign(z, kopie(body)); neu.push(z);
      }
      return minimal ? antwort(204, undefined, '') : antwort(200, neu);
    }
    if (methode === 'DELETE') {
      const weg = L.filter(passt);
      for (const z of weg) L.splice(L.indexOf(z), 1);
      if (p.tabelle === 'team_aufgaben') this.T.team_aufgaben_verlauf = this.T.team_aufgaben_verlauf.filter(v => !weg.some(a => a.aufgabe_id === v.aufgabe_id));
      return minimal ? antwort(204, undefined, '') : antwort(200, weg);
    }
    this.wirf(405, 'PGRST', 'Methode nicht nachgebildet: ' + methode);
  }
  // Spaltenvorgaben wie in den Migrationen (nur die, die der Code nicht selbst setzt)
  vorgaben(tab, z) {
    const j = this.jetzt();
    const V = { team_projekte: { reihenfolge: 0, links: [], geaendert: j, status: 'aktiv' }, team_aufgaben: { status: 'Offen', prio: 2, agent_geeignet: false, erstellt: j, geaendert: j }, team_aufgaben_verlauf: { art: 'kommentar', erstellt: j },
      team_notizen: { erstellt: j, geaendert: j }, team_vorschlaege: { text: '', bereich: 'Sonstiges', status: 'neu', stimmen: [], antwort: '', erstellt: j, geaendert: j }, team_systeme: { geaendert: j }, team_mitglieder: { rolle: 'team', typ: 'mensch', status: 'eingeladen', whatsapp_ok: false },
      team_zeiten: { status: 'offen', geaendert: j }, team_social: { geaendert: j, versuche: 0 }, team_abrechnung: {} }[tab] || {};
    for (const [k, v] of Object.entries(V)) if (z[k] === undefined) z[k] = kopie(v);
  }
  // Trigger team_notiz_version: alte Fassung sichern, wenn Titel oder Inhalt sich ändern
  notizVersion(alt, neu) {
    if ((neu.inhalt !== undefined && neu.inhalt !== alt.inhalt) || (neu.titel !== undefined && neu.titel !== alt.titel)) {
      this.T.team_notiz_versionen.push({ version_id: zufallId('nv_'), notiz_id: alt.notiz_id, titel: alt.titel, inhalt: alt.inhalt, projekt: alt.projekt, geaendert_von: alt.geaendert_von, fassung_vom: alt.geaendert, gesichert_am: this.jetzt() });
      const meine = this.T.team_notiz_versionen.filter(v => v.notiz_id === alt.notiz_id).sort((a, b) => String(b.gesichert_am).localeCompare(String(a.gesichert_am)));
      for (const v of meine.slice(30)) this.T.team_notiz_versionen.splice(this.T.team_notiz_versionen.indexOf(v), 1);
    }
  }
  rpc(fn, b) {
    if (fn === 'team_laden_plus') return this.laden();
    if (fn === 'team_einstellung_setzen') {
      const E = this.T.team_einstellungen; const z = E.find(e => e.schluessel === b.p_schluessel);
      if (z) z.wert = b.p_wert; else E.push({ schluessel: b.p_schluessel, wert: b.p_wert });
      return { schluessel: b.p_schluessel, wert: b.p_wert };
    }
    if (fn === 'team_loeschen') {
      const z = PAPIERKORB_ZIEL[b.p_art]; if (!z) this.wirf(400, 'P0001', 'Unbekannte Art: ' + b.p_art);
      const L = this.tabelle(z[0]); if (!L) this.wirf(400, 'P0001', 'Der Bereich "' + b.p_art + '" ist in diesem Portal nicht eingespielt (Tabelle ' + z[0] + ' fehlt).');
      const i = L.findIndex(x => String(x[z[1]]) === String(b.p_id)); if (i < 0) this.wirf(400, 'P0001', 'Nicht gefunden: ' + b.p_art + ' ' + b.p_id);
      const zeile = kopie(L[i]);
      if (b.p_art === 'aufgabe') { zeile._verlauf = this.T.team_aufgaben_verlauf.filter(v => v.aufgabe_id === b.p_id).map(v => ({ id: v.id, aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt })); this.T.team_aufgaben_verlauf = this.T.team_aufgaben_verlauf.filter(v => v.aufgabe_id !== b.p_id); }
      const id = zufallId('pk_');
      this.T.team_papierkorb.push({ eintrag_id: id, art: b.p_art, objekt_id: b.p_id, titel: String(zeile[z[2]] || '').slice(0, 200), daten: zeile, geloescht_von: b.p_von, geloescht_am: this.jetzt() });
      L.splice(i, 1);
      const grenze = Date.now() - 30 * 864e5;
      this.T.team_papierkorb = this.T.team_papierkorb.filter(e => new Date(e.geloescht_am).getTime() >= grenze);
      return id;
    }
    if (fn === 'team_wiederherstellen') {
      const e = this.T.team_papierkorb.find(x => x.eintrag_id === b.p_eintrag); if (!e) this.wirf(400, 'P0001', 'Dieser Eintrag ist nicht mehr im Papierkorb.');
      const z = PAPIERKORB_ZIEL[e.art]; const L = z && this.tabelle(z[0]); if (!L) this.wirf(400, 'P0001', 'Der Bereich "' + e.art + '" ist in diesem Portal nicht eingespielt.');
      const zeile = kopie(e.daten); const verlauf = zeile._verlauf; delete zeile._verlauf;
      if (L.some(x => String(x[z[1]]) === String(e.objekt_id))) this.wirf(400, 'P0001', 'Das gibt es schon wieder (gleiche ID). Nichts geändert.');
      if (e.art === 'notiz' && L.some(n => String(n.titel).toLowerCase() === String(zeile.titel).toLowerCase())) zeile.titel = zeile.titel + ' (wiederhergestellt)';
      L.push(zeile);
      if (e.art === 'aufgabe' && Array.isArray(verlauf)) for (const v of verlauf) { const id = this.T.team_aufgaben_verlauf.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1; this.T.team_aufgaben_verlauf.push({ id, aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt }); }
      this.T.team_papierkorb.splice(this.T.team_papierkorb.indexOf(e), 1);
      return e.objekt_id;
    }
    this.wirf(404, 'PGRST202', "Could not find the function public." + fn + " in the schema cache");
  }
  // team_laden_plus() wie 003_team_laden.sql: alle Listen, fehlende optionale Tabellen = []
  laden() {
    const T = this.T; const tage = n => new Date(Date.now() - n * 864e5).toISOString();
    const liste = (name, f) => (T[name] ? kopie(f ? T[name].filter(f) : T[name]) : []);
    const einst = {}; for (const e of T.team_einstellungen) einst[e.schluessel] = e.wert;
    const stich = typeof einst.stichdatum_abrechnung === 'string' ? einst.stichdatum_abrechnung : tage(120).slice(0, 10);
    return {
      einstellungen: einst,
      mitglieder: liste('team_mitglieder').sort((a, b) => a.name.localeCompare(b.name)),
      projekte: liste('team_projekte').sort((a, b) => (a.reihenfolge - b.reihenfolge) || a.name.localeCompare(b.name)),
      aufgaben: liste('team_aufgaben').sort((a, b) => (a.prio - b.prio) || String(a.deadline || '~').localeCompare(String(b.deadline || '~'))),
      verlauf: liste('team_aufgaben_verlauf', v => v.erstellt > tage(120)).sort((a, b) => String(a.erstellt).localeCompare(String(b.erstellt))),
      notizen: liste('team_notizen').sort((a, b) => a.titel.localeCompare(b.titel)),
      systeme: liste('team_systeme').sort((a, b) => a.name.localeCompare(b.name)),
      vorschlaege: liste('team_vorschlaege').sort((a, b) => String(b.erstellt).localeCompare(String(a.erstellt))),
      zeiten: liste('team_zeiten', z => z.datum >= stich).sort((a, b) => String(b.datum).localeCompare(String(a.datum))),
      abrechnung: liste('team_abrechnung').sort((a, b) => String(a.monat).localeCompare(String(b.monat))),
      social: liste('team_social').sort((a, b) => String(a.datum).localeCompare(String(b.datum))),
      community: liste('kurs_community'),
      office_agenten: [], office_runs: [], office_run_schluessel: [], office_ereignisse: [], office_artefakte: [], office_freigaben: [], office_idempotenz: [],
      papierkorb: liste('team_papierkorb', e => e.geloescht_am > tage(30)).sort((a, b) => String(b.geloescht_am).localeCompare(String(a.geloescht_am))),
      notiz_versionen: liste('team_notiz_versionen', v => v.gesichert_am > tage(180)).sort((a, b) => String(b.gesichert_am).localeCompare(String(a.gesichert_am))),
      teilnehmer: liste('team_teilnehmer'), tn_spalten: liste('team_tn_spalten')
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Betriebsart Postgres (über psql)
// ---------------------------------------------------------------------------------------------------------------------
const SQLSTATE_HTTP = { '23505': 409, '23503': 409, '23502': 400, '42P01': 404, '42883': 404, '42703': 400, 'P0001': 400, '22P02': 400, '23514': 400 };

/** Führt SQL über psql aus (Verbindung über PGHOST/PGPORT/PGUSER/PGPASSWORD oder lokaler Socket). Liefert { ok, out, code, message }. */
export function psql(db, text, { darfFehlschlagen = false } = {}) {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', db], { input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(r.stderr || '');
    const f = { ok: false, code: m ? m[1] : 'XX000', message: m ? m[2] : String(r.stderr || '').trim(), stderr: r.stderr };
    if (!darfFehlschlagen) { const e = new Error('psql: ' + f.message); e.sql = f; throw e; }
    return f;
  }
  return { ok: true, out: r.stdout };
}
export function psqlDa(db = process.env.PILOT_ADMIN_DB || 'postgres') { try { return psql(db, 'select 1', { darfFehlschlagen: true }).ok; } catch { return false; } }

export class PostgresRest {
  constructor(db) { this.db = db; this.spalten = {}; this.funktionen = {}; }
  lit(v) { const tag = '$q' + Math.random().toString(36).slice(2, 8) + '$'; const s = String(v); if (s.includes(tag)) return this.lit(v); return tag + s + tag; }
  jsonb(o) { return this.lit(JSON.stringify(o)) + '::jsonb'; }
  sql(text) { const r = psql(this.db, text, { darfFehlschlagen: true }); if (!r.ok) { const e = new Error(r.message); e.rest = fehler(SQLSTATE_HTTP[r.code] || 400, r.code, r.message); throw e; } return r.out; }
  spaltenVon(tab) {
    if (!this.spalten[tab]) {
      const out = this.sql(`select coalesce(json_agg(column_name order by ordinal_position), '[]') from information_schema.columns where table_schema = 'public' and table_name = ${this.lit(tab)}`);
      const L = JSON.parse(out.trim()); if (!L.length) { const e = new Error('Tabelle fehlt'); e.rest = fehler(404, 'PGRST205', "Could not find the table 'public." + tab + "' in the schema cache"); throw e; }
      this.spalten[tab] = L;
    }
    return this.spalten[tab];
  }
  funktion(fn) {
    if (!this.funktionen[fn]) {
      const out = this.sql(`select coalesce(json_agg(json_build_object('namen', p.proargnames, 'typen', oidvectortypes(p.proargtypes))), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${this.lit(fn)}`);
      const L = JSON.parse(out.trim()); if (!L.length) { const e = new Error('Funktion fehlt'); e.rest = fehler(404, 'PGRST202', 'Could not find the function public.' + fn + ' in the schema cache'); throw e; }
      const namen = L[0].namen || [], typen = L[0].typen ? L[0].typen.split(',').map(s => s.trim()) : [];
      this.funktionen[fn] = namen.map((n, i) => ({ name: n, typ: typen[i] || 'text' }));
    }
    return this.funktionen[fn];
  }
  async anfrage(methode, pfad, body, kopf) {
    try { return this._anfrage(methode, pfad, body || {}, kopf || {}); }
    catch (e) { if (e.rest) return e.rest; return fehler(500, 'TEST', 'Postgres-Nachbildung: ' + e.message); }
  }
  _anfrage(methode, pfad, body, kopf) {
    const p = pfadLesen(pfad);
    if (p.tabelle.startsWith('rpc/')) {
      const fn = p.tabelle.slice(4); const params = this.funktion(fn);
      const j = this.jsonb(body);
      const args = params.filter(a => a.name in body).map(a => `${a.name} => (${j} ${/jsonb?/.test(a.typ) ? '->' : '->>'} ${this.lit(a.name)})::${a.typ}`).join(', ');
      const out = this.sql(`select coalesce(to_jsonb(${fn}(${args})), 'null'::jsonb)`);
      return antwort(200, JSON.parse(out.trim()));
    }
    const tab = p.tabelle; const spalten = this.spaltenVon(tab);
    const unbekannt = Object.keys(body).filter(k => !spalten.includes(k));
    if (['POST', 'PATCH'].includes(methode) && unbekannt.length) return fehler(400, 'PGRST204', "Could not find the '" + unbekannt[0] + "' column of '" + tab + "' in the schema cache");
    for (const f of p.filter) if (!spalten.includes(f.spalte)) return fehler(400, 'PGRST204', "Could not find the '" + f.spalte + "' column");
    const wo = p.filter.length ? ' where ' + p.filter.map(f => f.op === 'eq' ? `t.${f.spalte} = ${this.lit(f.werte[0])}` : `t.${f.spalte} = any(array[${f.werte.map(v => this.lit(v)).join(',')}]::text[])`).join(' and ') : '';
    const minimal = /return=minimal/.test(kopf.prefer || '');
    if (methode === 'GET') {
      const sel = p.select ? p.select.map(s => { if (!spalten.includes(s)) { const e = new Error(s); e.rest = fehler(400, 'PGRST204', "Could not find the '" + s + "' column"); throw e; } return 't.' + s; }).join(', ') : 't.*';
      return antwort(200, JSON.parse(this.sql(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select ${sel} from ${tab} t${wo}) x`).trim()));
    }
    if (methode === 'POST') {
      const keys = Object.keys(body); if (!keys.length) return fehler(400, 'PGRST102', 'Leerer Body');
      const cols = keys.join(', ');
      const out = this.sql(`insert into ${tab} (${cols}) select ${keys.map(k => 'r.' + k).join(', ')} from jsonb_populate_record(null::${tab}, ${this.jsonb(body)}) r returning to_jsonb(${tab}.*)`);
      return minimal ? antwort(201, undefined, '') : antwort(201, out.trim().split('\n').filter(Boolean).map(z => JSON.parse(z)));
    }
    if (methode === 'PATCH') {
      const keys = Object.keys(body); if (!keys.length) return minimal ? antwort(204, undefined, '') : antwort(200, []);
      const out = this.sql(`update ${tab} t set ${keys.map(k => `${k} = r.${k}`).join(', ')} from jsonb_populate_record(null::${tab}, ${this.jsonb(body)}) r${wo} returning to_jsonb(t.*)`);
      return minimal ? antwort(204, undefined, '') : antwort(200, out.trim().split('\n').filter(Boolean).map(z => JSON.parse(z)));
    }
    if (methode === 'DELETE') {
      if (!p.filter.length) return fehler(400, 'PGRST', 'DELETE ohne Filter wird nicht nachgebildet');
      const out = this.sql(`delete from ${tab} t${wo} returning to_jsonb(t.*)`);
      return minimal ? antwort(204, undefined, '') : antwort(200, out.trim().split('\n').filter(Boolean).map(z => JSON.parse(z)));
    }
    return fehler(405, 'PGRST', 'Methode nicht nachgebildet: ' + methode);
  }
  /** Ganze Tabelle als Liste (für /api/test/zustand). Fehlt sie, leere Liste. */
  tabelle(name) { if (!NAME.test(name)) return []; const r = psql(this.db, `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from ${name} t`, { darfFehlschlagen: true }); return r.ok ? JSON.parse(r.out.trim()) : []; }
}
