// KI Office: Verarbeitung einer Anfrage an die Office-API.
// Läuft identisch im n8n-Code-Knoten „Anfrage prüfen“ (TEAM: Office-API), im lokalen Testserver und in den Tests.
// Eingabe: { body, D, jetzt, zufall, quelle }  Ausgabe: { weiter: 0|1|2, code, antwort, ops, extern, ich }
//   weiter 0 = Fehler sofort melden, 1 = nur antworten (nichts schreiben), 2 = Schreibaufträge (ops) ausführen, dann antworten.
// Keine Gedankengänge, keine Prompts, keine Zugangsdaten werden gespeichert: Freitext wird gekürzt und von Schlüsselmustern bereinigt.
import { inhaltsHash } from './hash.js';
import { STATUS, STATUS_TEXT, ALLE_STATUS, UEBERGAENGE, FRISTEN, darfWechseln, istEndzustand, fristPruefen } from './zustand.js';
import { EXTERNE_AKTIONEN, brauchtFreigabe, freigabeAnfordern, freigabeGueltig, freigabeEntscheiden } from './freigabe.js';
import { istAgent, istAdmin, istDozent, istMensch, darfAktion, darfProjekt, darfRunSehen, darfRunSteuern, darfFreigeben, darfTool, sichtbareProjekte, fuehrtAus, OHNE_TOKEN } from './rechte.js';
import { pruefeSignatur } from './signatur.js';
import { schluesselGueltig, frueherGesehen, merken } from './idempotenz.js';
import { neu, aend, weg } from './postgrest.js';

export const RAEUME = ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung'];
export const MODELLE = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5-mini'];
export const AUSFUEHRER = ['n8n', 'claude-code', 'codex', 'hermes'];
export const EREIGNIS_ARTEN = ['schritt', 'tool', 'quelle', 'fehler', 'wiederholung', 'hinweis', 'status', 'rueckfrage', 'antwort', 'freigabe', 'artefakt', 'abnahme', 'entscheidung'];
export const ARTEFAKT_ARTEN = ['text', 'datei', 'link', 'commit', 'notiz', 'bericht'];
export const RUN_MARKER = id => '[run:' + id + ']';

const SCHLUESSEL_MUSTER = [/sk-[A-Za-z0-9_-]{16,}/g, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]{10,})?/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /\b[a-f0-9]{32,64}\b/g, /(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, /(passwor[dt]|kennwort|api[_-]?key|secret)\s*[:=]\s*\S+/gi];
/** Entfernt Zugangsdaten-Muster aus Freitext (Datensparsamkeit, Log-Hygiene). */
export function bereinige(text) {
  let s = String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '');
  for (const m of SCHLUESSEL_MUSTER) s = s.replace(m, (ganz, p1) => (p1 && /bearer/i.test(ganz) ? p1 : '') + '[entfernt]');
  return s;
}
const txt = (v, n) => bereinige(v).trim().slice(0, n);
const klein = (obj, maxZeichen) => {
  // Objekt datensparsam: nur einfache Werte, Strings bereinigt, insgesamt begrenzt
  const o = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (v == null) continue;
    o[String(k).slice(0, 60)] = typeof v === 'string' ? txt(v, 1000) : (typeof v === 'number' || typeof v === 'boolean') ? v : txt(JSON.stringify(v), 1000);
  }
  let s = JSON.stringify(o);
  if (s.length > maxZeichen) return { gekuerzt: true, text: s.slice(0, maxZeichen) };
  return o;
};
const istUrl = s => /^https?:\/\/[^\s]+$/i.test(String(s || ''));

export function verarbeiten(ctx) {
  const b = ctx.body || {};
  const D = ctx.D || {};
  const jetzt = ctx.jetzt || new Date().toISOString();
  const jetztMs = new Date(jetzt).getTime();
  const zufall = ctx.zufall || (n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; });
  const neueId = p => p + '_' + jetztMs.toString(36) + zufall(6);
  const quelle = ctx.quelle || 'n8n';

  const mitglieder = (D.mitglieder || []).filter(m => m && m.mitglied_id);
  const projekte = (D.projekte || []).filter(p => p && p.projekt_id);
  const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id);
  const agenten = (D.office_agenten || []).filter(a => a && a.agent_id);
  const runs = (D.office_runs || []).filter(r => r && r.run_id);
  const ereignisse = (D.office_ereignisse || []).filter(e => e && e.run_id);
  const artefakte = (D.office_artefakte || []).filter(a => a && a.artefakt_id);
  const freigaben = (D.office_freigaben || []).filter(f => f && f.freigabe_id);
  const idem = (D.office_idempotenz || []).filter(i => i && i.schluessel);
  const schluesselListe = (D.office_run_schluessel || []).filter(s => s && s.run_id);

  const raus = (code, fehler, extra) => ({ weiter: 0, code, antwort: Object.assign({ ok: false, fehler }, extra || {}) });
  const aktion = String(b.aktion || '');
  const d = (b.daten && typeof b.daten === 'object') ? b.daten : {};

  // ---- Wer fragt? ----
  let ich = null;
  const tok = String(b.token || '');
  if (b.intern === true && aktion === 'wartung' && !b.token) ich = { mitglied_id: 'system', name: 'Wartung', rolle: 'admin', typ: 'system', status: 'aktiv' };
  else if (OHNE_TOKEN.includes(aktion)) ich = null;
  else {
    if (tok.length < 20 || tok.length > 64) return raus(401, 'Dein Zugang ist ungültig. Bitte öffne das Portal über deinen persönlichen Link.');
    ich = mitglieder.find(m => m.token === tok) || null;
    if (!ich || ich.status === 'gesperrt') return raus(401, 'Dein Zugang ist ungültig. Bitte frag Timo nach einem neuen Link.');
    if (ich.status !== 'aktiv') return raus(403, 'Bitte richte zuerst dein Profil im Team-Portal ein.');
  }
  const ichKurz = ich ? { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, typ: ich.typ || (ich.rolle === 'agent' ? 'agent' : 'mensch'), funktion: ich.funktion || '' } : null;
  if (ich) { const r = darfAktion(ich, aktion); if (!r.ok) return raus(r.code, r.grund); }

  const agentVon = run => agenten.find(a => a.agent_id === run.agent_id) || null;
  const runVon = id => runs.find(r => r.run_id === String(id || '')) || null;
  const ereignis = (run_id, art, titel, details, extra) => neu('office_ereignisse', Object.assign({ run_id, zeit: jetzt, art, titel: txt(titel, 200), details: details == null ? null : klein(details, 2000), autor: ich ? ich.mitglied_id : 'system', sequenz: ereignisse.filter(e => e.run_id === run_id).length + 1 }, extra || {}));
  const verlaufEintrag = (run, art, text) => run.aufgabe_id && aufgaben.some(a => a.aufgabe_id === run.aufgabe_id) ? [neu('team_aufgaben_verlauf', { aufgabe_id: run.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art, text: txt(text, 4000) + ' ' + RUN_MARKER(run.run_id) })] : [];
  const wechsel = (run, nach, wer, grund) => {
    if (!darfWechseln(run.status, nach, wer)) return { fehler: 'Übergang von „' + STATUS_TEXT[run.status] + '“ nach „' + STATUS_TEXT[nach] + '“ ist nicht zulässig.' };
    const row = { status: nach, lebenszeichen: jetzt };
    if (nach === STATUS.IN_ARBEIT && !run.gestartet) row.gestartet = jetzt;
    if (istEndzustand(nach)) row.beendet = jetzt;
    return { ops: [aend('office_runs', 'run_id', run.run_id, row), ereignis(run.run_id, 'status', STATUS_TEXT[run.status] + ' → ' + STATUS_TEXT[nach] + (grund ? ': ' + grund : ''))], row };
  };
  const schreiben = (ops, antwort, extern, code) => ({ weiter: 2, code: code || 200, ich: ichKurz, ops, antwort: Object.assign({ ok: true }, antwort || {}), extern: extern || null });
  const nurAntwort = antwort => ({ weiter: 1, code: 200, ich: ichKurz, antwort: Object.assign({ ok: true }, antwort || {}) });

  // ---- Lesen ----
  if (aktion === 'laden') return nurAntwort(antwortBauen(ich, D, { jetzt, quelle }));

  // ---- Rückmeldung des Executors (signiert, ohne Token) ----
  if (aktion === 'rueckmeldung') {
    const run = runVon(d.run_id);
    if (!run) return raus(404, 'Diesen Run gibt es nicht.');
    const s = schluesselListe.find(x => x.run_id === run.run_id);
    const pr = pruefeSignatur({ schluessel: s && s.schluessel, zeit: d.zeit, nonce: d.nonce, ergebnis: d.ergebnis, signatur: d.signatur }, jetztMs, n => idem.some(i => i.art === 'nonce' && i.schluessel === n));
    if (!pr.ok) return raus(401, 'Rückmeldung abgelehnt: ' + pr.grund);
    const reg = agentVon(run);
    ich = { mitglied_id: reg ? reg.mitglied_id : run.agent_id, name: reg ? reg.name : run.agent_id, rolle: 'agent', typ: 'agent', status: 'aktiv' };
    const erg = beenden(run, d.ergebnis || {}, 'agent');
    if (erg.weiter === 0) return erg;
    erg.ops.push(neu('office_idempotenz', merken({ art: 'nonce', schluessel: String(d.nonce), run_id: run.run_id, antwort: { ok: true }, jetzt })));
    return erg;
  }

  switch (aktion) {
    case 'auftrag_starten': {
      const key = String(d.idempotenzschluessel || '');
      if (!schluesselGueltig(key)) return raus(400, 'Bitte gib einen Idempotenzschlüssel an (8 bis 120 Zeichen, Buchstaben, Ziffern, _ . : -).');
      const frueher = frueherGesehen(idem, 'auftrag', key) || (runs.find(r => r.idempotenzschluessel === key) ? { antwort: { run_id: runs.find(r => r.idempotenzschluessel === key).run_id } } : null);
      if (frueher) return nurAntwort(Object.assign({}, frueher.antwort, { wiederholt: true, hinweis: 'Dieser Auftrag wurde schon angelegt. Es wurde nichts doppelt gestartet.' }));
      const reg = agenten.find(a => a.agent_id === String(d.agent_id || ''));
      if (!reg) return raus(404, 'Diesen Agenten gibt es nicht in der Registry.');
      if (reg.aktiv === false) return raus(409, 'Dieser Agent ist deaktiviert.');
      if (istAgent(ich) && reg.mitglied_id !== ich.mitglied_id) return raus(403, 'Agenten dürfen nur Aufträge für sich selbst anlegen.');
      const projekt = txt(d.projekt, 120);
      if (!projekte.some(p => p.name === projekt)) return raus(404, 'Dieses Projekt gibt es nicht.');
      if (!darfProjekt(ich, projekt, agenten)) return raus(403, 'Dieses Projekt siehst du nicht.');
      if (!(Array.isArray(reg.projekte) && reg.projekte.includes(projekt))) return raus(403, 'Der Agent „' + reg.name + '“ ist dem Projekt „' + projekt + '“ nicht zugeordnet. Timo kann das in der Registry ändern.');
      let aufgabe_id = d.aufgabe_id ? String(d.aufgabe_id) : null;
      if (aufgabe_id) { const a = aufgaben.find(x => x.aufgabe_id === aufgabe_id); if (!a) return raus(404, 'Diese Aufgabe gibt es nicht.'); if (a.projekt !== projekt) return raus(400, 'Die Aufgabe gehört zu einem anderen Projekt.'); }
      const auftrag = txt(d.auftrag, 2000);
      if (auftrag.length < 3) return raus(400, 'Bitte beschreib den Auftrag (mindestens 3 Zeichen).');
      const run_id = neueId('run');
      const schluessel = zufall(48);
      const timeout_sek = Math.min(86400, Math.max(60, Number(d.timeout_sek) || Number(reg.timeout_sek) || FRISTEN.timeout_sek));
      const max_versuche = Math.min(5, Math.max(1, Number(d.max_versuche) || Number(reg.max_versuche) || FRISTEN.max_versuche));
      const run = { run_id, projekt, aufgabe_id, auftraggeber: ich.mitglied_id, agent_id: reg.agent_id, ausfuehrer: reg.ausfuehrer || 'n8n', workflow_version: String(reg.workflow_version || ''), konfig_version: String(reg.konfig_version || ''),
        status: STATUS.WARTESCHLANGE, auftrag, eingabe: d.eingabe == null ? null : klein(d.eingabe, 4000), idempotenzschluessel: key, n8n_execution_id: null, externe_id: null,
        erstellt: jetzt, gestartet: null, lebenszeichen: null, beendet: null, timeout_sek, versuche: 1, max_versuche, fehler: null,
        zusammenfassung: null, zusammenfassung_zeit: null, zusammenfassung_quelle: null, verbrauch: null, abgenommen: null, abgenommen_von: null, abgenommen_am: null, abnahme_kommentar: null, grund: null };
      const antwort = { run_id, status: run.status, wiederholt: false };
      const ops = [neu('office_runs', run), neu('office_run_schluessel', { run_id, schluessel, erstellt: jetzt }),
        ereignis(run_id, 'status', 'Auftrag angelegt für ' + reg.name + ' (Versuch 1 von ' + max_versuche + ')', { projekt, aufgabe_id, auftraggeber: ich.mitglied_id }),
        neu('office_idempotenz', merken({ art: 'auftrag', schluessel: key, run_id, antwort, jetzt }))];
      ops.push(...verlaufEintrag(run, 'kommentar', 'Auftrag an ' + reg.name + ' gestartet: ' + auftrag.slice(0, 300)));
      return schreiben(ops, Object.assign({ rueckmelde_schluessel: schluessel }, antwort), { art: 'start', run_id, agent_id: reg.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: reg.ausfuehrer_url || null, schluessel });
    }
    case 'lebenszeichen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      if (istEndzustand(run.status)) return raus(409, 'Dieser Run ist beendet (' + STATUS_TEXT[run.status] + '). Verspätete Lebenszeichen ändern nichts daran.', { status: run.status });
      const row = { lebenszeichen: jetzt };
      const ops = [];
      if (d.n8n_execution_id) { const e = String(d.n8n_execution_id).slice(0, 80); if (run.n8n_execution_id && run.n8n_execution_id !== e) return raus(409, 'Dieser Run gehört zu einer anderen n8n-Ausführung.'); if (!run.n8n_execution_id) { if (runs.some(r => r.n8n_execution_id === e)) return raus(409, 'Diese n8n-Ausführung ist schon einem anderen Run zugeordnet.'); row.n8n_execution_id = e; } }
      let status = run.status;
      if (run.status === STATUS.WARTESCHLANGE) { const w = wechsel(run, STATUS.IN_ARBEIT, 'agent', 'Executor hat übernommen'); if (w.fehler) return raus(409, w.fehler); ops.push(...w.ops); status = STATUS.IN_ARBEIT; }
      ops.push(aend('office_runs', 'run_id', run.run_id, row));
      return schreiben(ops, { run_id: run.run_id, status });
    }
    case 'ereignis': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const art = EREIGNIS_ARTEN.includes(d.art) ? d.art : 'schritt';
      if (['status', 'abnahme', 'freigabe'].includes(art)) return raus(400, 'Ereignisse der Art „' + art + '“ erzeugt nur der Server.');
      const titel = txt(d.titel, 200); if (titel.length < 2) return raus(400, 'Bitte gib dem Ereignis einen Titel.');
      const key = d.idempotenz ? String(d.idempotenz).slice(0, 120) : null;
      if (key && ereignisse.some(e => e.idempotenz === key)) return nurAntwort({ wiederholt: true });
      const reg = agentVon(run);
      if (d.tool && !darfTool(reg, d.tool)) return raus(403, 'Das Werkzeug „' + txt(d.tool, 60) + '“ ist für ' + (reg ? reg.name : run.agent_id) + ' nicht erlaubt. Erlaubt: ' + ((reg && reg.erlaubte_tools) || []).join(', ') + '.');
      const quelle_ref = d.quelle_ref ? txt(d.quelle_ref, 300) : null;
      const extra = { tool: d.tool ? txt(d.tool, 60) : null, quelle_ref, idempotenz: key };
      if (istEndzustand(run.status)) {
        return schreiben([ereignis(run.run_id, 'hinweis', 'Verspätetes Ereignis nach Ende (' + STATUS_TEXT[run.status] + '): ' + titel, d.details, extra)], { run_id: run.run_id, status: run.status, hinweis: 'verspaetet' });
      }
      return schreiben([ereignis(run.run_id, art, titel, d.details, extra), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })], { run_id: run.run_id, status: run.status });
    }
    case 'artefakt': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      if ([STATUS.ABGEBROCHEN, STATUS.UNBEKANNT].includes(run.status)) return raus(409, 'Dieser Run ist ' + STATUS_TEXT[run.status] + '. Ergebnisse werden nicht mehr angenommen.');
      const a = artefaktRow(run, d); if (a.fehler) return raus(400, a.fehler);
      return schreiben([neu('office_artefakte', a.row), ereignis(run.run_id, 'artefakt', 'Ergebnis: ' + a.row.titel, { artefakt_id: a.row.artefakt_id, art: a.row.art, ablageort: a.row.ablageort }), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })], { artefakt_id: a.row.artefakt_id });
    }
    case 'rueckfrage': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const frage = txt(d.frage, 2000); if (frage.length < 3) return raus(400, 'Bitte formulier die Rückfrage.');
      const w = wechsel(run, STATUS.WARTET_RUECKMELDUNG, 'agent'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, ereignis(run.run_id, 'rueckfrage', frage.slice(0, 200), { frage }), ...verlaufEintrag(run, 'kommentar', 'Rückfrage: ' + frage)], { run_id: run.run_id, status: STATUS.WARTET_RUECKMELDUNG });
    }
    case 'antwort': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Antworten kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const text = txt(d.text, 2000); if (text.length < 1) return raus(400, 'Bitte schreib eine Antwort.');
      const w = wechsel(run, STATUS.IN_ARBEIT, 'mensch'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, ereignis(run.run_id, 'antwort', text.slice(0, 200), { text }), ...verlaufEintrag(run, 'kommentar', 'Antwort an ' + run.agent_id + ': ' + text)], { run_id: run.run_id, status: STATUS.IN_ARBEIT });
    }
    case 'freigabe_anfordern': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const akt = String(d.aktion || '');
      if (!brauchtFreigabe(akt)) return raus(400, 'Unbekannte Aktion „' + txt(akt, 40) + '“. Freigabefähig: ' + Object.keys(EXTERNE_AKTIONEN).join(', ') + '.');
      if (d.inhalt == null) return raus(400, 'Bitte gib den Inhalt an, der freigegeben werden soll.');
      const hash = inhaltsHash(akt, d.inhalt);
      const ops = [];
      const vorhandene = freigaben.filter(f => f.run_id === run.run_id && f.aktion === akt && ['offen', 'erteilt'].includes(f.status));
      const gleiche = vorhandene.find(f => f.inhalt_hash === hash);
      if (gleiche) return nurAntwort({ freigabe_id: gleiche.freigabe_id, status: gleiche.status, wiederholt: true });
      for (const f of vorhandene) ops.push(aend('office_freigaben', 'freigabe_id', f.freigabe_id, { status: 'ungueltig', begruendung: 'Inhalt wurde geändert, neue Freigabe angefordert.' }), ereignis(run.run_id, 'freigabe', 'Frühere Freigabe ungültig (Inhalt geändert)', { freigabe_id: f.freigabe_id }));
      const fr = freigabeAnfordern({ freigabe_id: neueId('frg'), run_id: run.run_id, aktion: akt, inhalt: d.inhalt, vorschau: d.vorschau, jetzt, angefordert_von: ich.mitglied_id });
      ops.push(neu('office_freigaben', fr), ereignis(run.run_id, 'freigabe', 'Freigabe angefordert: ' + EXTERNE_AKTIONEN[akt].text, { freigabe_id: fr.freigabe_id, inhalt_hash: hash, vorschau: fr.inhalt_vorschau }));
      if (run.status === STATUS.IN_ARBEIT) { const w = wechsel(run, STATUS.WARTET_FREIGABE, 'agent'); if (w.fehler) return raus(409, w.fehler); ops.push(...w.ops); }
      else if (run.status !== STATUS.WARTET_FREIGABE) return raus(409, 'Freigaben können nur aus „in Arbeit“ angefordert werden (aktuell: ' + STATUS_TEXT[run.status] + ').');
      ops.push(...verlaufEintrag(run, 'kommentar', 'Freigabe angefordert (' + EXTERNE_AKTIONEN[akt].text + '): ' + fr.inhalt_vorschau.slice(0, 300) + ' – Entscheidung im KI Office.'));
      return schreiben(ops, { freigabe_id: fr.freigabe_id, status: 'offen', inhalt_hash: hash });
    }
    case 'freigabe_entscheiden': {
      const fr = freigaben.find(f => f.freigabe_id === String(d.freigabe_id || '')); if (!fr) return raus(404, 'Diese Freigabe gibt es nicht.');
      const run = runVon(fr.run_id); if (!run) return raus(404, 'Der zugehörige Run existiert nicht mehr.');
      const stufe = (EXTERNE_AKTIONEN[fr.aktion] || {}).stufe || 'extern';
      const r = darfFreigeben(ich, fr, run, stufe, agenten); if (!r.ok) return raus(403, r.grund);
      const e = freigabeEntscheiden(fr, String(d.entscheidung || ''), ich.mitglied_id, d.begruendung, jetzt); if (e.fehler) return raus(409, e.fehler);
      const ops = [aend('office_freigaben', 'freigabe_id', fr.freigabe_id, e.row), ereignis(run.run_id, 'freigabe', 'Freigabe ' + e.row.status + ' von ' + ich.name + ' (' + (EXTERNE_AKTIONEN[fr.aktion] || {}).text + ')', { freigabe_id: fr.freigabe_id, begruendung: e.row.begruendung })];
      if (run.status === STATUS.WARTET_FREIGABE && !freigaben.some(f => f.run_id === run.run_id && f.status === 'offen' && f.freigabe_id !== fr.freigabe_id)) { const w = wechsel(run, STATUS.IN_ARBEIT, 'mensch', 'Freigabe ' + e.row.status); if (!w.fehler) ops.push(...w.ops); }
      ops.push(...verlaufEintrag(run, 'kommentar', 'Freigabe ' + e.row.status + (e.row.begruendung ? ': ' + e.row.begruendung : '')));
      return schreiben(ops, { freigabe_id: fr.freigabe_id, status: e.row.status });
    }
    case 'aktion_ausfuehren': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const akt = String(d.aktion || '');
      if (!brauchtFreigabe(akt)) return raus(400, 'Unbekannte externe Aktion „' + txt(akt, 40) + '“.');
      const key = String(d.idempotenzschluessel || '');
      if (!schluesselGueltig(key)) return raus(400, 'Für externe Aktionen ist ein Idempotenzschlüssel Pflicht.');
      const frueher = frueherGesehen(idem, 'aktion', key);
      if (frueher) return nurAntwort(Object.assign({}, frueher.antwort, { wiederholt: true, hinweis: 'Diese Aktion wurde schon ausgeführt. Es wurde nichts doppelt ausgelöst.' }));
      if (run.status !== STATUS.IN_ARBEIT) return raus(409, 'Externe Aktionen laufen nur aus „in Arbeit“ (aktuell: ' + STATUS_TEXT[run.status] + ').');
      const fr = freigaben.find(f => f.freigabe_id === String(d.freigabe_id || '') && f.run_id === run.run_id);
      const g = freigabeGueltig(fr, akt, d.inhalt, jetztMs);
      if (!g.ok) {
        const ops = [ereignis(run.run_id, 'fehler', 'Externe Aktion abgelehnt: ' + g.grund, { aktion: akt, freigabe_id: fr ? fr.freigabe_id : null })];
        if (fr && g.inhalt_geaendert && ['offen', 'erteilt'].includes(fr.status)) ops.push(aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'ungueltig', begruendung: 'Inhalt nach der Freigabe geändert.' }));
        return { weiter: 2, code: 409, ich: ichKurz, ops, antwort: { ok: false, fehler: g.grund, neue_freigabe_noetig: !!g.neu_noetig }, extern: null };
      }
      const antwort = { run_id: run.run_id, aktion: akt, freigabe_id: fr.freigabe_id, ausgefuehrt: true };
      const ops = [aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'verwendet', verwendet_am: jetzt }),
        ereignis(run.run_id, 'tool', 'Externe Aktion ausgeführt: ' + EXTERNE_AKTIONEN[akt].text, { aktion: akt, freigabe_id: fr.freigabe_id, inhalt_hash: fr.inhalt_hash }, { tool: akt }),
        neu('office_idempotenz', merken({ art: 'aktion', schluessel: key, run_id: run.run_id, antwort, jetzt })), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })];
      return schreiben(ops, antwort, { art: 'aktion', aktion: akt, run_id: run.run_id, inhalt: klein(typeof d.inhalt === 'object' ? d.inhalt : { text: d.inhalt }, 8000), freigabe_id: fr.freigabe_id });
    }
    case 'run_beenden': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      return beenden(run, d, 'agent');
    }
    case 'run_abbrechen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Abbrechen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const grund = txt(d.grund, 600);
      const w = wechsel(run, STATUS.ABGEBROCHEN, 'mensch', grund || 'ohne Angabe'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, aend('office_runs', 'run_id', run.run_id, { grund: grund || 'abgebrochen von ' + ich.name, abgebrochen_von: ich.mitglied_id }), ...verlaufEintrag(run, 'status', 'Run abgebrochen' + (grund ? ': ' + grund : ''))], { run_id: run.run_id, status: STATUS.ABGEBROCHEN }, { art: 'abbruch', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer_url: (agentVon(run) || {}).ausfuehrer_url || null });
    }
    case 'run_wiederholen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Wiederholen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const versuche = Number(run.versuche) || 1, max = Number(run.max_versuche) || FRISTEN.max_versuche;
      if (versuche >= max) return raus(409, 'Die Höchstzahl von ' + max + ' Versuchen ist erreicht. Lege bei Bedarf einen neuen Auftrag an.');
      const w = wechsel(run, STATUS.WARTESCHLANGE, 'mensch', 'Wiederholung durch ' + ich.name); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, aend('office_runs', 'run_id', run.run_id, { versuche: versuche + 1, beendet: null, fehler: null, gestartet: null }), ereignis(run.run_id, 'wiederholung', 'Versuch ' + (versuche + 1) + ' von ' + max)], { run_id: run.run_id, status: STATUS.WARTESCHLANGE, versuche: versuche + 1 }, { art: 'start', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: (agentVon(run) || {}).ausfuehrer_url || null, schluessel: (schluesselListe.find(s => s.run_id === run.run_id) || {}).schluessel || null });
    }
    case 'run_abnehmen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Abnehmen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      if (run.status !== STATUS.ABGESCHLOSSEN) return raus(409, 'Fachlich abnehmen geht nur, wenn der Run technisch abgeschlossen ist (aktuell: ' + STATUS_TEXT[run.status] + ').');
      const ok = d.abgenommen === true;
      const kommentar = txt(d.kommentar, 1000);
      return schreiben([aend('office_runs', 'run_id', run.run_id, { abgenommen: ok, abgenommen_von: ich.mitglied_id, abgenommen_am: jetzt, abnahme_kommentar: kommentar }), ereignis(run.run_id, 'abnahme', ok ? 'Fachlich abgenommen von ' + ich.name : 'Fachlich zurückgewiesen von ' + ich.name, { kommentar }),
        ...verlaufEintrag(run, 'kommentar', (ok ? 'Ergebnis fachlich abgenommen' : 'Ergebnis zurückgewiesen') + (kommentar ? ': ' + kommentar : ''))], { run_id: run.run_id, abgenommen: ok });
    }
    case 'wartung': {
      const ops = [], veraltet = [], verfallen = [];
      for (const run of runs) {
        const f = fristPruefen(run, jetztMs);
        if (f) { const w = wechsel(run, f.nach, 'system', f.grund); if (!w.fehler) { ops.push(...w.ops, aend('office_runs', 'run_id', run.run_id, { grund: f.grund }), ereignis(run.run_id, 'hinweis', 'Automatisch als veraltet markiert: ' + f.grund)); veraltet.push(run.run_id); } }
      }
      for (const fr of freigaben) {
        const run = runVon(fr.run_id);
        const alt = (jetztMs - new Date(fr.angefordert_am || 0).getTime()) / 1000;
        if ((fr.status === 'offen' && alt > FRISTEN.wartefrist_mensch) || (fr.status === 'erteilt' && fr.gueltig_bis && new Date(fr.gueltig_bis).getTime() < jetztMs) || (['offen', 'erteilt'].includes(fr.status) && run && istEndzustand(run.status))) {
          ops.push(aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'verfallen' })); verfallen.push(fr.freigabe_id);
        }
      }
      const grenze = new Date(jetztMs - 30 * 86400 * 1000).toISOString();
      const alteIdem = idem.filter(i => i.erstellt && i.erstellt < grenze);
      if (alteIdem.length) ops.push({ methode: 'DELETE', pfad: 'office_idempotenz?erstellt=lt.' + encodeURIComponent(grenze), body: {} });
      if (!ops.length) return nurAntwort({ geprueft: runs.length, veraltet, verfallen, geloeschte_schluessel: 0 });
      return schreiben(ops, { geprueft: runs.length, veraltet, verfallen, geloeschte_schluessel: alteIdem.length });
    }
    case 'agent_speichern': {
      const id = String(d.agent_id || '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) return raus(400, 'agent_id: nur Kleinbuchstaben, Ziffern und Bindestriche (3 bis 41 Zeichen).');
      const alt = agenten.find(a => a.agent_id === id);
      const name = txt(d.name, 60); if (name.length < 2) return raus(400, 'Bitte gib dem Agenten einen Namen.');
      const raum = RAEUME.includes(d.raum) ? d.raum : (alt ? alt.raum : 'Verwaltung');
      const modell = MODELLE.includes(d.modell) ? d.modell : (alt ? alt.modell : 'claude-sonnet-5-5');
      const ausf = AUSFUEHRER.includes(d.ausfuehrer) ? d.ausfuehrer : (alt ? alt.ausfuehrer : 'n8n');
      const liste = (v, n, max) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => txt(s, n)).filter(Boolean).slice(0, max);
      const proj = liste(d.projekte, 120, 50).filter(p => projekte.some(x => x.name === p));
      const mitglied_id = d.mitglied_id ? String(d.mitglied_id) : (alt ? alt.mitglied_id : null);
      if (mitglied_id && !mitglieder.some(m => m.mitglied_id === mitglied_id && (m.typ === 'agent' || m.rolle === 'agent'))) return raus(400, 'mitglied_id muss ein Teammitglied vom Typ „agent“ sein.');
      const url = d.ausfuehrer_url ? String(d.ausfuehrer_url).trim() : (alt ? alt.ausfuehrer_url : null);
      if (url && !/^https:\/\/[^\s]+$/i.test(url)) return raus(400, 'ausfuehrer_url muss mit https:// beginnen.');
      const row = { agent_id: id, name, rolle: txt(d.rolle || (alt && alt.rolle), 120), raum, beschreibung: txt(d.beschreibung || (alt && alt.beschreibung), 1000), faehigkeiten: liste(d.faehigkeiten || (alt && alt.faehigkeiten), 80, 30), erlaubte_tools: liste(d.erlaubte_tools || (alt && alt.erlaubte_tools), 60, 40),
        modell, modell_grund: txt(d.modell_grund || (alt && alt.modell_grund), 300), ausfuehrer: ausf, ausfuehrer_url: url || null, mitglied_id, projekte: proj, aktiv: d.aktiv !== false,
        timeout_sek: Math.min(86400, Math.max(60, Number(d.timeout_sek) || (alt && alt.timeout_sek) || FRISTEN.timeout_sek)), max_versuche: Math.min(5, Math.max(1, Number(d.max_versuche) || (alt && alt.max_versuche) || FRISTEN.max_versuche)),
        auto_wiederholen: d.auto_wiederholen === true, workflow_version: txt(d.workflow_version || (alt && alt.workflow_version), 40), konfig_version: String((Number(alt && alt.konfig_version) || 0) + 1), geaendert: jetzt, geaendert_von: ich.mitglied_id };
      return schreiben([alt ? aend('office_agenten', 'agent_id', id, row) : neu('office_agenten', row)], { agent_id: id, konfig_version: row.konfig_version });
    }
    case 'loeschen': {
      // Löschkonzept (docs/office/LOESCHKONZEPT.md): Run mit allen abgeleiteten Daten. Ablageorte der Artefakte werden zurückgemeldet, damit ein Mensch sie extern löscht.
      let ziel = [];
      if (d.run_id) { const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.'); if (!istEndzustand(run.status)) return raus(409, 'Nur beendete Runs können gelöscht werden. Brich den Run zuerst ab.'); ziel = [run]; }
      else if (d.aelter_als_tage) { const t = Number(d.aelter_als_tage); if (!(t >= 30)) return raus(400, 'aelter_als_tage muss mindestens 30 sein.'); const grenze = new Date(jetztMs - t * 86400 * 1000).toISOString(); ziel = runs.filter(r => istEndzustand(r.status) && (r.beendet || r.erstellt) < grenze); }
      else return raus(400, 'Gib run_id oder aelter_als_tage an.');
      if (!ziel.length) return nurAntwort({ geloescht: 0, ablageorte: [] });
      const ops = [], ablageorte = [];
      for (const run of ziel) {
        for (const a of artefakte.filter(x => x.run_id === run.run_id)) if (a.ablageort) ablageorte.push({ artefakt_id: a.artefakt_id, ablageort: a.ablageort });
        ops.push(weg('office_ereignisse', 'run_id', run.run_id), weg('office_artefakte', 'run_id', run.run_id), weg('office_freigaben', 'run_id', run.run_id), weg('office_idempotenz', 'run_id', run.run_id), weg('office_run_schluessel', 'run_id', run.run_id));
        for (const v of (D.verlauf || []).filter(v => v && v.id != null && String(v.text || '').includes(RUN_MARKER(run.run_id)))) ops.push(weg('team_aufgaben_verlauf', 'id', v.id));
        ops.push(weg('office_runs', 'run_id', run.run_id));
      }
      return schreiben(ops, { geloescht: ziel.length, run_ids: ziel.map(r => r.run_id), ablageorte, hinweis: ablageorte.length ? 'Diese Ablageorte musst du außerhalb des Office selbst löschen.' : '' });
    }
    default:
      return raus(400, 'Unbekannte Aktion „' + txt(aktion, 40) + '“.');
  }

  // ---- Hilfsfunktionen mit Zugriff auf den Kontext ----
  function zugriffAufRun(run) {
    if (istAgent(ich)) { if (!fuehrtAus(ich, run.agent_id, agenten)) return raus(403, 'Dieser Run gehört einem anderen Agenten.'); return null; }
    if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Diesen Run darfst du nicht steuern.');
    return null;
  }
  function artefaktRow(run, d) {
    const art = ARTEFAKT_ARTEN.includes(d.art) ? d.art : 'text';
    const titel = txt(d.titel, 200); if (titel.length < 2) return { fehler: 'Bitte gib dem Ergebnis einen Titel.' };
    const ablageort = txt(d.ablageort, 500);
    if (ablageort && /^https?:/i.test(ablageort) && !istUrl(ablageort)) return { fehler: 'Der Ablageort sieht nicht wie eine gültige Adresse aus.' };
    const inhalt_hash = /^[a-f0-9]{64}$/i.test(String(d.inhalt_hash || '')) ? String(d.inhalt_hash).toLowerCase() : null;
    return { row: { artefakt_id: neueId('art'), run_id: run.run_id, aufgabe_id: run.aufgabe_id || null, projekt: run.projekt, art, titel, ablageort: ablageort || null, inhalt_hash, groesse: Number(d.groesse) > 0 ? Math.round(Number(d.groesse)) : null, zusammenfassung: txt(d.zusammenfassung, 1000) || null, erstellt: jetzt, erstellt_von: ich ? ich.mitglied_id : run.agent_id } };
  }
  function beenden(run, e, wer) {
    const ziel = e.status === STATUS.ABGESCHLOSSEN ? STATUS.ABGESCHLOSSEN : e.status === STATUS.FEHLGESCHLAGEN ? STATUS.FEHLGESCHLAGEN : null;
    if (!ziel) return raus(400, 'status muss „abgeschlossen“ oder „fehlgeschlagen“ sein.');
    const zusammenfassung = txt(e.zusammenfassung, 4000) || null;
    const fehler = txt(e.fehler, 2000) || null;
    const verbrauch = verbrauchAus(e.verbrauch);
    const ops = [];
    // Verspätete Rückmeldung: Run ist schon beendet oder veraltet. Festhalten, aber nie nachträglich als Erfolg werten.
    if (istEndzustand(run.status)) {
      ops.push(ereignis(run.run_id, 'hinweis', 'Verspätete Rückmeldung (' + STATUS_TEXT[ziel] + ') nach Ende (' + STATUS_TEXT[run.status] + '). Status bleibt unverändert.', { gemeldet: ziel, zusammenfassung: zusammenfassung ? zusammenfassung.slice(0, 500) : null, fehler }));
      return schreiben(ops, { run_id: run.run_id, status: run.status, hinweis: 'verspaetet', angenommen: false }, null, 200);
    }
    if (e.n8n_execution_id) { const x = String(e.n8n_execution_id).slice(0, 80); if (run.n8n_execution_id && run.n8n_execution_id !== x) return raus(409, 'Dieser Run gehört zu einer anderen n8n-Ausführung.'); if (!run.n8n_execution_id && runs.some(r => r.n8n_execution_id === x)) return raus(409, 'Diese n8n-Ausführung ist schon einem anderen Run zugeordnet.'); }
    const w = wechsel(run, ziel, wer, ziel === STATUS.FEHLGESCHLAGEN && fehler ? fehler.slice(0, 200) : undefined);
    if (w.fehler) return raus(409, w.fehler);
    ops.push(...w.ops);
    const ereignisIds = ereignisse.filter(x => x.run_id === run.run_id).map(x => x.id).filter(x => x != null);
    const row = { zusammenfassung, zusammenfassung_zeit: zusammenfassung ? jetzt : null, zusammenfassung_quelle: zusammenfassung ? { ereignisse: ereignisIds.slice(-50), stand: jetzt, von: ich ? ich.mitglied_id : run.agent_id } : null, fehler, verbrauch };
    if (e.n8n_execution_id && !run.n8n_execution_id) row.n8n_execution_id = String(e.n8n_execution_id).slice(0, 80);
    ops.push(aend('office_runs', 'run_id', run.run_id, row));
    if (ziel === STATUS.FEHLGESCHLAGEN) ops.push(ereignis(run.run_id, 'fehler', fehler || 'Fehler ohne Beschreibung', { versuch: run.versuche, max_versuche: run.max_versuche }));
    const artefaktIds = [];
    for (const a of (Array.isArray(e.artefakte) ? e.artefakte.slice(0, 20) : [])) { const r = artefaktRow(run, a || {}); if (!r.fehler) { ops.push(neu('office_artefakte', r.row)); artefaktIds.push(r.row.artefakt_id); } }
    const reg = agentVon(run);
    let status = ziel;
    if (ziel === STATUS.FEHLGESCHLAGEN && reg && reg.auto_wiederholen === true && (Number(run.versuche) || 1) < (Number(run.max_versuche) || FRISTEN.max_versuche)) {
      const r2 = { ...run, status: ziel };
      const w2 = wechsel(r2, STATUS.WARTESCHLANGE, 'system', 'automatische Wiederholung');
      if (!w2.fehler) { ops.push(...w2.ops, aend('office_runs', 'run_id', run.run_id, { versuche: (Number(run.versuche) || 1) + 1, beendet: null, gestartet: null }), ereignis(run.run_id, 'wiederholung', 'Automatischer Versuch ' + ((Number(run.versuche) || 1) + 1) + ' von ' + run.max_versuche)); status = STATUS.WARTESCHLANGE; }
    }
    if (ziel === STATUS.ABGESCHLOSSEN) {
      ops.push(...verlaufEintrag(run, 'bericht', (zusammenfassung || 'Run abgeschlossen (ohne Zusammenfassung)') + (artefaktIds.length ? ' – ' + artefaktIds.length + ' Ergebnis(se) im KI Office.' : '')));
      const a = run.aufgabe_id ? aufgaben.find(x => x.aufgabe_id === run.aufgabe_id) : null;
      if (a && a.status === 'In Arbeit') ops.push(aend('team_aufgaben', 'aufgabe_id', a.aufgabe_id, { status: 'Wird getestet', geaendert: jetzt }), neu('team_aufgaben_verlauf', { aufgabe_id: a.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art: 'status', text: 'In Arbeit → Wird getestet (Run beendet) ' + RUN_MARKER(run.run_id) }));
    } else ops.push(...verlaufEintrag(run, 'kommentar', 'Run fehlgeschlagen' + (fehler ? ': ' + fehler.slice(0, 300) : '') + (status === STATUS.WARTESCHLANGE ? ' – wird automatisch wiederholt.' : '')));
    return schreiben(ops, { run_id: run.run_id, status, angenommen: true, artefakte: artefaktIds }, status === STATUS.WARTESCHLANGE ? { art: 'start', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: (reg || {}).ausfuehrer_url || null, schluessel: (schluesselListe.find(s => s.run_id === run.run_id) || {}).schluessel || null } : null);
  }
}

/** Verbrauch nur, wenn messbar gemeldet. Sonst „unbekannt“. Kosten nur mit Quelle, sonst höchstens „geschätzt“. */
export function verbrauchAus(v) {
  if (!v || typeof v !== 'object') return { messbar: false, hinweis: 'unbekannt' };
  const n = x => (Number.isFinite(Number(x)) && Number(x) >= 0) ? Number(x) : null;
  const ein = n(v.tokens_ein), aus = n(v.tokens_aus);
  if (ein === null && aus === null) return { messbar: false, hinweis: 'unbekannt' };
  const o = { messbar: true, tokens_ein: ein || 0, tokens_aus: aus || 0, modell: v.modell ? String(v.modell).slice(0, 60) : null };
  if (n(v.kosten_eur) !== null) { o.kosten_eur = n(v.kosten_eur); o.kosten_art = v.kosten_quelle ? 'gemessen' : 'geschätzt'; o.kosten_quelle = v.kosten_quelle ? String(v.kosten_quelle).slice(0, 120) : null; }
  return o;
}

/** Antwort auf „laden“: nur, was die Rolle sehen darf. Nie: Tokens, Rückmelde-Schlüssel, Kontaktdaten, Zeiten, Kursdaten. */
export function antwortBauen(ich, D, opts) {
  const o = opts || {};
  const agenten = (D.office_agenten || []).filter(a => a && a.agent_id);
  const sicht = sichtbareProjekte(ich, agenten);
  const projektOk = name => sicht === null || sicht.includes(name);
  const admin = istAdmin(ich);
  const projekte = (D.projekte || []).filter(p => p && p.projekt_id && projektOk(p.name)).map(p => ({ projekt_id: p.projekt_id, name: p.name, beschreibung: p.beschreibung || '', status: p.status || 'aktiv', farbe: p.farbe || '', verantwortlich: p.verantwortlich || '', reihenfolge: Number(p.reihenfolge) || 0, links: Array.isArray(p.links) ? p.links.filter(l => l && istUrl(l.url)).map(l => ({ titel: String(l.titel || '').slice(0, 80), url: String(l.url).slice(0, 500) })) : [], geaendert: p.geaendert || '' }));
  const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id && projektOk(a.projekt)).map(a => ({ aufgabe_id: a.aufgabe_id, titel: a.titel, beschreibung: istAgent(ich) ? String(a.beschreibung || '').slice(0, 4000) : (a.beschreibung || ''), status: a.status, prio: Number(a.prio) || 2, label: a.label || '', projekt: a.projekt || '', verantwortlich: a.verantwortlich || '', erstellt_von: a.erstellt_von || '', deadline: a.deadline || '', agent_geeignet: a.agent_geeignet === true, erstellt: a.erstellt || '', geaendert: a.geaendert || '', erledigt_am: a.erledigt_am || '' }));
  const aufgabenIds = new Set(aufgaben.map(a => a.aufgabe_id));
  const verlauf = (D.verlauf || []).filter(v => v && aufgabenIds.has(v.aufgabe_id)).map(v => ({ id: v.id, aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt }));
  const notizen = (D.notizen || []).filter(n => n && n.notiz_id && n.projekt && projektOk(n.projekt)).map(n => ({ notiz_id: n.notiz_id, titel: n.titel, projekt: n.projekt, autor: n.autor || '', geaendert: n.geaendert || '', laenge: String(n.inhalt || '').length }));
  const runs = (D.office_runs || []).filter(r => r && r.run_id && darfRunSehen(ich, r, agenten)).map(r => { const x = { ...r }; delete x.rueckmelde_schluessel; return x; });
  const runIds = new Set(runs.map(r => r.run_id));
  const ereignisse = (D.office_ereignisse || []).filter(e => e && runIds.has(e.run_id)).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)) || (Number(a.sequenz) || 0) - (Number(b.sequenz) || 0));
  const artefakte = (D.office_artefakte || []).filter(a => a && runIds.has(a.run_id));
  const freigaben = (D.office_freigaben || []).filter(f => f && runIds.has(f.run_id));
  const regs = agenten.map(a => { const x = { ...a }; if (!admin) delete x.ausfuehrer_url; delete x.geaendert_von; return x; });
  const mitglieder = (D.mitglieder || []).filter(m => m && m.mitglied_id).map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ || 'mensch', funktion: m.funktion || '', status: m.status }));
  return {
    ich: { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, typ: ich.typ || 'mensch', funktion: ich.funktion || '' },
    mitglieder, projekte, aufgaben, verlauf, notizen, agenten: regs, runs, ereignisse, artefakte, freigaben,
    sichtbare_projekte: sicht, raeume: RAEUME, status_text: STATUS_TEXT, uebergaenge: UEBERGAENGE, fristen: FRISTEN, externe_aktionen: EXTERNE_AKTIONEN,
    quelle: o.quelle || 'n8n', stand: o.jetzt || new Date().toISOString()
  };
}
