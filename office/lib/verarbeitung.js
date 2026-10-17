// KI Office: Verarbeitung einer Anfrage an die Office-API.
// Läuft identisch im n8n-Code-Knoten „Anfrage prüfen“ (TEAM: Office-API), im lokalen Testserver und in den Tests.
// Eingabe: { body, D, jetzt, zufall, quelle }  Ausgabe: { weiter: 0|1|2, code, antwort, ops, extern, ich }
//   weiter 0 = Fehler sofort melden, 1 = nur antworten (nichts schreiben), 2 = Schreibaufträge (ops) ausführen, dann antworten.
// Keine Gedankengänge, keine Prompts, keine Zugangsdaten werden gespeichert: Freitext wird gekürzt und von Schlüsselmustern bereinigt.
import { inhaltsHash } from './hash.js';
import { STATUS, STATUS_TEXT, ALLE_STATUS, UEBERGAENGE, FRISTEN, darfWechseln, istEndzustand, fristPruefen } from './zustand.js';
import { START_REGELN, FREIGABE_START, kostenstufe, KOSTENSTUFE_TEXT, agentSofortOk, tagesverbrauchEur, startPruefung } from './kosten.js';
import { EXTERNE_AKTIONEN, brauchtFreigabe, freigabeAnfordern, freigabeGueltig, freigabeEntscheiden } from './freigabe.js';
import { istAgent, istAdmin, istDozent, istMensch, darfAktion, darfProjekt, darfRunSehen, darfRunSteuern, darfFreigeben, darfTool, sichtbareProjekte, fuehrtAus, OHNE_TOKEN } from './rechte.js';
import { pruefeSignatur } from './signatur.js';
import { schluesselGueltig, frueherGesehen, merken } from './idempotenz.js';
import { neu, aend, weg } from './postgrest.js';

export const RAEUME = ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung'];
export const MODELLE = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5-mini', 'deepseek-v4-flash'];
export const AUSFUEHRER = ['n8n', 'claude-code', 'codex', 'hermes'];
export const EREIGNIS_ARTEN = ['schritt', 'tool', 'quelle', 'fehler', 'wiederholung', 'hinweis', 'status', 'rueckfrage', 'antwort', 'freigabe', 'artefakt', 'abnahme', 'entscheidung'];
export const ARTEFAKT_ARTEN = ['text', 'datei', 'link', 'commit', 'notiz', 'bericht'];
export const RUN_MARKER = id => '[run:' + id + ']';

const GEHEIMNIS_MUSTER = [/sk-[A-Za-z0-9_-]{16,}/g, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]{10,})?/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /\b[a-f0-9]{32,64}\b/g, /(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, /(passwor[dt]|kennwort|api[_-]?key|secret)\s*[:=]\s*\S+/gi];
/** Entfernt Zugangsdaten-Muster aus Freitext (Datensparsamkeit, Log-Hygiene). */
export function bereinige(text) {
  let s = String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '');
  for (const m of GEHEIMNIS_MUSTER) s = s.replace(m, (ganz, p1) => (p1 && /bearer/i.test(ganz) ? p1 : '') + '[entfernt]');
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
/** Woran die Startfreigabe gebunden ist: Agent, Projekt und Auftragstext des Runs (Hash über kanonisches JSON, siehe hash.js). */
const startInhalt = run => ({ agent_id: run.agent_id, projekt: run.projekt, auftrag: run.auftrag });
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
  const verlaufEintrag = (run, art, text) => run.aufgabe_id && aufgaben.some(a => a.aufgabe_id === run.aufgabe_id) ? [neu('team_aufgaben_verlauf', { aufgabe_id: run.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art, text: txt(text, 4000) + ' ' + RUN_MARKER(run.run_id), erstellt: jetzt })] : [];
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
    case 'auftrag_starten':
    case 'auftrag_delegieren': {
      // auftrag_delegieren = auftrag_starten mit eltern_run_id (Orchestrierung, ARCHITEKTUR.md Abschnitt 11): ein Teilauftrag an einen anderen Agenten,
      // nur aus einem laufenden Eltern-Run heraus, nur innerhalb der Projektgrenzen des delegierenden Agenten und des Zielagenten.
      const delegiert = aktion === 'auftrag_delegieren';
      const key = String(d.idempotenzschluessel || '');
      if (!schluesselGueltig(key)) return raus(400, 'Bitte gib einen Idempotenzschlüssel an (8 bis 120 Zeichen, Buchstaben, Ziffern, _ . : -).');
      const frueher = frueherGesehen(idem, 'auftrag', key) || (runs.find(r => r.idempotenzschluessel === key) ? { antwort: { run_id: runs.find(r => r.idempotenzschluessel === key).run_id } } : null);
      if (frueher) return nurAntwort(Object.assign({}, frueher.antwort, { wiederholt: true, hinweis: 'Dieser Auftrag wurde schon angelegt. Es wurde nichts doppelt gestartet.' }));
      let eltern = null, elternReg = null, team_id = null;
      if (delegiert) {
        eltern = runVon(d.eltern_run_id);
        if (!eltern) return raus(404, 'Den Eltern-Run gibt es nicht. Für auftrag_delegieren ist eltern_run_id Pflicht.');
        elternReg = agentVon(eltern);
        if (istAgent(ich)) { if (!fuehrtAus(ich, eltern.agent_id, agenten)) return raus(403, 'Der Eltern-Run gehört einem anderen Agenten. Delegieren darf nur der ausführende Agent des Eltern-Runs.'); }
        else if (!darfRunSteuern(ich, eltern, agenten)) return raus(403, 'Diesen Run darfst du nicht steuern, darum auch nicht aus ihm heraus delegieren.');
        if (!darfTool(elternReg, 'auftrag_delegieren')) return raus(403, 'Das Werkzeug „auftrag_delegieren“ ist für ' + (elternReg ? elternReg.name : eltern.agent_id) + ' nicht erlaubt. Erlaubt: ' + ((elternReg && elternReg.erlaubte_tools) || []).join(', ') + '.');
        if (eltern.status !== STATUS.IN_ARBEIT) return raus(409, 'Delegieren geht nur aus „in Arbeit“ heraus (Eltern-Run ist ' + STATUS_TEXT[eltern.status] + ').', { status: eltern.status });
        team_id = d.team_id ? String(d.team_id).slice(0, 80) : (eltern.team_id || null);
        if (team_id && !/^[A-Za-z0-9_.:-]{3,80}$/.test(team_id)) return raus(400, 'team_id: 3 bis 80 Zeichen, Buchstaben, Ziffern, _ . : -.');
        if (eltern.team_id && team_id !== eltern.team_id) return raus(409, 'Der Eltern-Run gehört schon zum Team „' + eltern.team_id + '“.');
      }
      const reg = agenten.find(a => a.agent_id === String(d.agent_id || ''));
      if (!reg) return raus(404, 'Diesen Agenten gibt es nicht in der Registry.');
      if (reg.aktiv === false) return raus(409, 'Dieser Agent ist deaktiviert.');
      if (!delegiert && istAgent(ich) && reg.mitglied_id !== ich.mitglied_id) return raus(403, 'Agenten dürfen nur Aufträge für sich selbst anlegen. Teilaufträge an andere Agenten laufen über auftrag_delegieren.');
      const projekt = txt(d.projekt || (eltern ? eltern.projekt : ''), 120);
      if (!projekte.some(p => p.name === projekt)) return raus(404, 'Dieses Projekt gibt es nicht.');
      if (!darfProjekt(ich, projekt, agenten)) return raus(403, 'Dieses Projekt siehst du nicht.');
      if (eltern && !(elternReg && Array.isArray(elternReg.projekte) && elternReg.projekte.includes(projekt))) return raus(403, 'Projektgrenze: ' + (elternReg ? elternReg.name : eltern.agent_id) + ' darf nur in die eigenen Projekte delegieren, nicht in „' + projekt + '“.');
      if (!(Array.isArray(reg.projekte) && reg.projekte.includes(projekt))) return raus(403, 'Der Agent „' + reg.name + '“ ist dem Projekt „' + projekt + '“ nicht zugeordnet. Timo kann das in der Registry ändern.');
      let aufgabe_id = d.aufgabe_id ? String(d.aufgabe_id) : null;
      if (aufgabe_id) { const a = aufgaben.find(x => x.aufgabe_id === aufgabe_id); if (!a) return raus(404, 'Diese Aufgabe gibt es nicht.'); if (a.projekt !== projekt) return raus(400, 'Die Aufgabe gehört zu einem anderen Projekt.'); }
      const auftrag = txt(d.auftrag, 2000);
      if (auftrag.length < 3) return raus(400, 'Bitte beschreib den Auftrag (mindestens 3 Zeichen).');
      // Kostenlimit dieses Runs (Euro). Ohne Angabe gilt der Standard; ein höheres Limit macht den Auftrag „nicht klein“ und braucht für Teammitglieder Timos Freigabe.
      const budgetWunsch = d.budget_eur == null || d.budget_eur === '' ? START_REGELN.klein_budget_eur : Number(d.budget_eur);
      if (!Number.isFinite(budgetWunsch) || budgetWunsch < 0 || budgetWunsch > 100) return raus(400, 'budget_eur muss eine Zahl zwischen 0 und 100 sein (Euro).');
      const budget_eur = Math.round(budgetWunsch * 10000) / 10000;
      // Startregel (ARCHITEKTUR.md Abschnitt 13): Menschen ohne Admin-Rolle starten nur günstige Agenten mit kleinen Aufträgen und freiem Tagesbudget sofort, alles andere erst nach Timos Freigabe.
      // Agenten (sie legen Aufträge nur für sich selbst an) und Admin starten immer sofort.
      const pruefung = startPruefung({ mensch_ohne_admin: istMensch(ich) && !istAdmin(ich), agent: reg, auftrag, budget_eur, runs, mitglied_id: ich.mitglied_id, jetztMs });
      const run_id = neueId('run');
      const schluessel = zufall(48);
      const timeout_sek = Math.min(86400, Math.max(60, Number(d.timeout_sek) || Number(reg.timeout_sek) || FRISTEN.timeout_sek));
      const max_versuche = Math.min(5, Math.max(1, Number(d.max_versuche) || Number(reg.max_versuche) || FRISTEN.max_versuche));
      const run = { run_id, projekt, aufgabe_id, auftraggeber: ich.mitglied_id, agent_id: reg.agent_id, ausfuehrer: reg.ausfuehrer || 'n8n', workflow_version: String(reg.workflow_version || ''), konfig_version: String(reg.konfig_version || ''),
        status: pruefung.sofort ? STATUS.WARTESCHLANGE : STATUS.WARTET_FREIGABE, auftrag, eingabe: d.eingabe == null ? null : klein(d.eingabe, 4000), idempotenzschluessel: key, n8n_execution_id: null, externe_id: null,
        erstellt: jetzt, gestartet: null, lebenszeichen: null, beendet: null, timeout_sek, versuche: 1, max_versuche, fehler: null,
        zusammenfassung: null, zusammenfassung_zeit: null, zusammenfassung_quelle: null, verbrauch: null, abgenommen: null, abgenommen_von: null, abgenommen_am: null, abnahme_kommentar: null, grund: null,
        eltern_run_id: eltern ? eltern.run_id : null, team_id, budget_eur };
      const antwort = { run_id, status: run.status, wiederholt: false, eltern_run_id: run.eltern_run_id, team_id };
      const ops = [neu('office_runs', run), neu('office_run_schluessel', { run_id, schluessel, erstellt: jetzt }),
        ereignis(run_id, 'status', (eltern ? 'Teilauftrag angelegt für ' : 'Auftrag angelegt für ') + reg.name + ' (Versuch 1 von ' + max_versuche + ')', { projekt, aufgabe_id, auftraggeber: ich.mitglied_id, eltern_run_id: run.eltern_run_id, team_id }),
        neu('office_idempotenz', merken({ art: 'auftrag', schluessel: key, run_id, antwort, jetzt }))];
      if (eltern) {
        // Beide Seiten sehen die Verbindung: am Kind „Teilauftrag von …“, am Eltern-Run „Teilauftrag delegiert an …“ mit der Kind-run_id.
        ops.push(ereignis(run_id, 'hinweis', 'Teilauftrag von ' + (elternReg ? elternReg.name : eltern.agent_id) + ' (Run ' + eltern.run_id + ')', { eltern_run_id: eltern.run_id, team_id }));
        ops.push(ereignis(eltern.run_id, 'tool', 'Teilauftrag delegiert an ' + reg.name + ': ' + auftrag.slice(0, 120), { kind_run_id: run_id, agent_id: reg.agent_id, projekt, team_id }, { tool: 'auftrag_delegieren' }));
        const elternRow = { lebenszeichen: jetzt }; if (team_id && !eltern.team_id) elternRow.team_id = team_id;
        ops.push(aend('office_runs', 'run_id', eltern.run_id, elternRow));
      }
      if (!pruefung.sofort) {
        // Wartet auf Timo: Freigabe „auftrag_start“ gebunden an den Hash von Agent, Projekt und Auftragstext. Den Ausführer anstoßen wir erst nach der Freigabe.
        const fr = freigabeAnfordern({ freigabe_id: neueId('frg'), run_id, aktion: FREIGABE_START.aktion, inhalt: startInhalt(run), vorschau: auftrag, jetzt, angefordert_von: ich.mitglied_id });
        ops.splice(1, 0, neu('office_freigaben', fr));   // nach dem Run (Fremdschlüssel), vor den Ereignissen
        ops.push(ereignis(run_id, 'freigabe', 'Start wartet auf Freigabe durch Timo: ' + pruefung.gruende.map(g => g.text).join(' '), { freigabe_id: fr.freigabe_id, inhalt_hash: fr.inhalt_hash, gruende: pruefung.gruende.map(g => g.code), kostenstufe: pruefung.stufe, budget_eur }));
        ops.push(...verlaufEintrag(run, 'kommentar', (eltern ? 'Teilauftrag an ' : 'Auftrag an ') + reg.name + ' angelegt, wartet auf Timos Freigabe: ' + auftrag.slice(0, 300)));
        return schreiben(ops, Object.assign({ freigabe_id: fr.freigabe_id, wartet_auf: 'Timo', gruende: pruefung.gruende, kostenstufe: pruefung.stufe, hinweis: 'Dein Auftrag ist angelegt und startet, sobald Timo ihn freigibt.' }, antwort), null);
      }
      ops.push(...verlaufEintrag(run, 'kommentar', (eltern ? 'Teilauftrag an ' : 'Auftrag an ') + reg.name + ' gestartet: ' + auftrag.slice(0, 300)));
      return schreiben(ops, Object.assign({ rueckmelde_schluessel: schluessel }, antwort), { art: 'start', run_id, agent_id: reg.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: reg.ausfuehrer_url || null, schluessel, eltern_run_id: run.eltern_run_id, team_id });
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
      if (fr.aktion === FREIGABE_START.aktion) return startEntscheiden(fr, run);
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
      const ungestartet = wartetAufStart(run);   // nie angestoßen: keine Abbruchmeldung an den Ausführer, offene Startfreigabe schließen
      const w = wechsel(run, STATUS.ABGEBROCHEN, 'mensch', grund || 'ohne Angabe'); if (w.fehler) return raus(409, w.fehler);
      const startFr = freigaben.filter(f => f.run_id === run.run_id && f.aktion === FREIGABE_START.aktion && f.status === 'offen').map(f => aend('office_freigaben', 'freigabe_id', f.freigabe_id, { status: 'verfallen', begruendung: 'Auftrag zurückgezogen.' }));
      return schreiben([...w.ops, ...startFr, aend('office_runs', 'run_id', run.run_id, { grund: grund || 'abgebrochen von ' + ich.name, abgebrochen_von: ich.mitglied_id }), ...verlaufEintrag(run, 'status', 'Run abgebrochen' + (grund ? ': ' + grund : ''))], { run_id: run.run_id, status: STATUS.ABGEBROCHEN }, ungestartet ? null : { art: 'abbruch', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer_url: (agentVon(run) || {}).ausfuehrer_url || null });
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
        // Teamregel: Ein Eltern-Run mit offenen Teilaufträgen wartet auf seine Kinder; sie sind sein Lebenszeichen. Erst wenn alle Kinder beendet sind
        // und danach timeout_sek ohne Lebenszeichen vergehen, gilt er als unbekannt (das letzte Kind-Ende zählt als Lebenszeichen).
        const kinder = runs.filter(k => k.eltern_run_id === run.run_id);
        let pruefRun = run;
        if (kinder.length && run.status === STATUS.IN_ARBEIT) {
          if (kinder.some(k => !istEndzustand(k.status))) continue;
          const letztes = kinder.map(k => k.beendet || k.lebenszeichen || '').concat([run.lebenszeichen || '']).sort().pop();
          pruefRun = Object.assign({}, run, { lebenszeichen: letztes || run.lebenszeichen });
        }
        const f = fristPruefen(pruefRun, jetztMs);
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
        auto_wiederholen: d.auto_wiederholen === true, freigabe_noetig: typeof d.freigabe_noetig === 'boolean' ? d.freigabe_noetig : (d.freigabe_noetig === null ? null : (alt && alt.freigabe_noetig != null ? alt.freigabe_noetig : null)), workflow_version: txt(d.workflow_version || (alt && alt.workflow_version), 40), konfig_version: String((Number(alt && alt.konfig_version) || 0) + 1), geaendert: jetzt, geaendert_von: ich.mitglied_id };
      return schreiben([alt ? aend('office_agenten', 'agent_id', id, row) : neu('office_agenten', row)], { agent_id: id, konfig_version: row.konfig_version });
    }
    case 'loeschen': {
      // Löschkonzept (docs/office/LOESCHKONZEPT.md): Run mit allen abgeleiteten Daten. Ablageorte der Artefakte werden zurückgemeldet, damit ein Mensch sie extern löscht.
      let ziel = [];
      if (d.run_id) { const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.'); if (!istEndzustand(run.status)) return raus(409, 'Nur beendete Runs können gelöscht werden. Brich den Run zuerst ab.'); ziel = [run]; }
      else if (d.aelter_als_tage) { const t = Number(d.aelter_als_tage); if (!(t >= 30)) return raus(400, 'aelter_als_tage muss mindestens 30 sein.'); const grenze = new Date(jetztMs - t * 86400 * 1000).toISOString(); ziel = runs.filter(r => istEndzustand(r.status) && (r.beendet || r.erstellt) < grenze); }
      else return raus(400, 'Gib run_id oder aelter_als_tage an.');
      // Teilaufträge hängen am Eltern-Run (Fremdschlüssel eltern_run_id): Einzellöschung nimmt alle Nachkommen mit (Kinder zuerst), sofern sie beendet sind;
      // die Sammellöschung lässt Eltern-Runs stehen, deren Kinder nicht selbst erfasst sind.
      const nachkommen = id => runs.filter(k => k.eltern_run_id === id).flatMap(k => [...nachkommen(k.run_id), k]);
      if (d.run_id) { const n = nachkommen(ziel[0].run_id); const offen = n.filter(k => !istEndzustand(k.status)); if (offen.length) return raus(409, 'Dieser Run hat noch ' + offen.length + ' laufende Teilaufträge. Brich sie zuerst ab.'); ziel = [...n, ...ziel]; }
      else { const zielIds = new Set(ziel.map(r => r.run_id)); ziel = ziel.filter(r => !runs.some(k => k.eltern_run_id === r.run_id && !zielIds.has(k.run_id))); ziel.sort((a, b) => (a.eltern_run_id ? 0 : 1) - (b.eltern_run_id ? 0 : 1)); }
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
  function wartetAufStart(run) {
    return run.status === STATUS.WARTET_FREIGABE && !run.gestartet && freigaben.some(f => f.run_id === run.run_id && f.aktion === FREIGABE_START.aktion && f.status === 'offen');
  }
  /** Timo (Admin) entscheidet über den Start eines Auftrags, den ein Teammitglied angelegt hat. Freigabe: Run → Warteschlange und Ausführer anstoßen; Ablehnung: Run → abgebrochen. */
  function startEntscheiden(fr, run) {
    if (!istAdmin(ich)) return raus(403, 'Den Start von Aufträgen gibt nur Timo (Admin) frei.');
    if (fr.status !== 'offen') return raus(409, 'Diese Freigabe ist nicht mehr offen (' + fr.status + ').');
    const entscheidung = String(d.entscheidung || '');
    if (!['erteilt', 'abgelehnt'].includes(entscheidung)) return raus(409, 'Entscheidung muss „erteilt“ oder „abgelehnt“ sein.');
    if (run.status !== STATUS.WARTET_FREIGABE || run.gestartet) return raus(409, 'Der Auftrag wartet nicht mehr auf den Start (' + STATUS_TEXT[run.status] + ').');
    const reg = agentVon(run);
    const begruendung = txt(d.begruendung, 600);
    if (entscheidung === 'abgelehnt') {
      const grund = 'Start von ' + ich.name + ' abgelehnt' + (begruendung ? ': ' + begruendung : '.');
      const w = wechsel(run, STATUS.ABGEBROCHEN, 'mensch', grund); if (w.fehler) return raus(409, w.fehler);
      return schreiben([aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'abgelehnt', entschieden_von: ich.mitglied_id, entschieden_am: jetzt, begruendung, gueltig_bis: null }),
        ereignis(run.run_id, 'freigabe', 'Start abgelehnt von ' + ich.name + (begruendung ? ': ' + begruendung : ''), { freigabe_id: fr.freigabe_id, begruendung }),
        ...w.ops, aend('office_runs', 'run_id', run.run_id, { grund, abgebrochen_von: ich.mitglied_id }),
        ...verlaufEintrag(run, 'status', 'Start des Auftrags abgelehnt' + (begruendung ? ': ' + begruendung : ''))], { freigabe_id: fr.freigabe_id, status: 'abgelehnt', run_id: run.run_id, run_status: STATUS.ABGEBROCHEN });
    }
    // Erteilen nur, wenn der Auftrag noch genau dem entspricht, was angefragt wurde. Sonst: alte Freigabe ungültig, neue Anfrage für den geänderten Text, nichts startet.
    const g = freigabeGueltig(Object.assign({}, fr, { status: 'erteilt' }), FREIGABE_START.aktion, startInhalt(run), jetztMs);
    if (!g.ok) {
      const neuFr = freigabeAnfordern({ freigabe_id: neueId('frg'), run_id: run.run_id, aktion: FREIGABE_START.aktion, inhalt: startInhalt(run), vorschau: run.auftrag, jetzt, angefordert_von: fr.angefordert_von });
      return { weiter: 2, code: 409, ich: ichKurz, antwort: { ok: false, fehler: 'Der Auftrag wurde nach der Anfrage geändert. Die Freigabe ist ungültig, bitte prüf den neuen Text und gib neu frei.', neue_freigabe_noetig: true, neue_freigabe_id: neuFr.freigabe_id }, extern: null,
        ops: [aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'ungueltig', begruendung: 'Auftragstext nach der Anfrage geändert.' }), neu('office_freigaben', neuFr),
          ereignis(run.run_id, 'freigabe', 'Startfreigabe ungültig: Auftragstext wurde nach der Anfrage geändert. Neue Anfrage angelegt.', { freigabe_id: fr.freigabe_id, neue_freigabe_id: neuFr.freigabe_id })] };
    }
    const w = wechsel(run, STATUS.WARTESCHLANGE, 'mensch', 'Start von ' + ich.name + ' freigegeben'); if (w.fehler) return raus(409, w.fehler);
    const schluesselRow = schluesselListe.find(x => x.run_id === run.run_id);
    return schreiben([aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'verwendet', entschieden_von: ich.mitglied_id, entschieden_am: jetzt, begruendung, gueltig_bis: null, verwendet_am: jetzt }),
      ereignis(run.run_id, 'freigabe', 'Start freigegeben von ' + ich.name + (begruendung ? ': ' + begruendung : ''), { freigabe_id: fr.freigabe_id, inhalt_hash: fr.inhalt_hash, begruendung }),
      ...w.ops, ...verlaufEintrag(run, 'kommentar', 'Start freigegeben von ' + ich.name + ' – der Agent legt los.')],
    { freigabe_id: fr.freigabe_id, status: 'erteilt', run_id: run.run_id, run_status: STATUS.WARTESCHLANGE },
    { art: 'start', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: (reg || {}).ausfuehrer_url || null, schluessel: schluesselRow ? schluesselRow.schluessel : null, eltern_run_id: run.eltern_run_id || null, team_id: run.team_id || null });
  }
  function zugriffAufRun(run) {
    if (wartetAufStart(run)) return raus(409, 'Dieser Auftrag wartet auf Timos Freigabe und ist noch nicht gestartet.', { status: run.status });
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
    // Teamregel: Ein Run gilt erst als technisch abgeschlossen, wenn alle seine Teilaufträge (Kind-Runs) in einem Endzustand sind. Fehlschlag darf er immer melden.
    if (ziel === STATUS.ABGESCHLOSSEN) {
      const offen = runs.filter(k => k.eltern_run_id === run.run_id && !istEndzustand(k.status));
      if (offen.length) return raus(409, 'Dieser Run hat noch ' + offen.length + ' offene Teilaufträge (' + offen.map(k => k.run_id + ': ' + STATUS_TEXT[k.status]).join(', ') + '). Er gilt erst als abgeschlossen, wenn alle Kind-Runs beendet sind.', { offene_kind_runs: offen.map(k => k.run_id) });
    }
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
      if (a && a.status === 'In Arbeit') ops.push(aend('team_aufgaben', 'aufgabe_id', a.aufgabe_id, { status: 'Wird getestet', geaendert: jetzt }), neu('team_aufgaben_verlauf', { aufgabe_id: a.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art: 'status', text: 'In Arbeit → Wird getestet (Run beendet) ' + RUN_MARKER(run.run_id), erstellt: jetzt }));
    } else ops.push(...verlaufEintrag(run, 'kommentar', 'Run fehlgeschlagen' + (fehler ? ': ' + fehler.slice(0, 300) : '') + (status === STATUS.WARTESCHLANGE ? ' – wird automatisch wiederholt.' : '')));
    // Teilauftrag beendet: der Eltern-Run (Orchestrierer) bekommt einen Hinweis in seine Zeitleiste, solange er noch läuft.
    if (run.eltern_run_id) { const el = runVon(run.eltern_run_id); if (el && !istEndzustand(el.status)) ops.push(ereignis(el.run_id, 'hinweis', 'Teilauftrag ' + STATUS_TEXT[status] + ': ' + run.auftrag.slice(0, 100), { kind_run_id: run.run_id, agent_id: run.agent_id, status, fehler })); }
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
  const projekte = (D.projekte || []).filter(p => p && p.projekt_id && projektOk(p.name)).map(p => ({ projekt_id: p.projekt_id, name: p.name, beschreibung: p.beschreibung || '', status: p.status || 'aktiv', farbe: /^#[0-9a-f]{3,8}$/i.test(String(p.farbe || '')) ? p.farbe : '', verantwortlich: p.verantwortlich || '', reihenfolge: Number(p.reihenfolge) || 0, links: Array.isArray(p.links) ? p.links.filter(l => l && istUrl(l.url)).map(l => ({ titel: String(l.titel || '').slice(0, 80), url: String(l.url).slice(0, 500) })) : [], geaendert: p.geaendert || '' }));
  const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id && projektOk(a.projekt)).map(a => ({ aufgabe_id: a.aufgabe_id, titel: a.titel, beschreibung: istAgent(ich) ? String(a.beschreibung || '').slice(0, 4000) : (a.beschreibung || ''), status: a.status, prio: Number(a.prio) || 2, label: a.label || '', projekt: a.projekt || '', verantwortlich: a.verantwortlich || '', erstellt_von: a.erstellt_von || '', deadline: a.deadline || '', agent_geeignet: a.agent_geeignet === true, erstellt: a.erstellt || '', geaendert: a.geaendert || '', erledigt_am: a.erledigt_am || '' }));
  const aufgabenIds = new Set(aufgaben.map(a => a.aufgabe_id));
  const verlauf = (D.verlauf || []).filter(v => v && aufgabenIds.has(v.aufgabe_id)).map(v => ({ id: v.id, aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt }));
  const notizen = (D.notizen || []).filter(n => n && n.notiz_id && n.projekt && projektOk(n.projekt)).map(n => ({ notiz_id: n.notiz_id, titel: n.titel, projekt: n.projekt, autor: n.autor || '', geaendert: n.geaendert || '', laenge: String(n.inhalt || '').length }));
  const alleRuns = (D.office_runs || []).filter(r => r && r.run_id);
  const sichtbar = new Set(alleRuns.filter(r => darfRunSehen(ich, r, agenten)).map(r => r.run_id));
  // Teilaufträge sind sichtbar, wenn ihr Eltern-Run sichtbar ist (der Orchestrierer sieht seine Kind-Runs), Projektgrenze bleibt.
  for (const r of alleRuns) if (r.eltern_run_id && sichtbar.has(r.eltern_run_id) && projektOk(r.projekt)) sichtbar.add(r.run_id);
  const runs = alleRuns.filter(r => sichtbar.has(r.run_id)).map(r => { const x = { ...r, eltern_run_id: r.eltern_run_id || null, team_id: r.team_id || null }; delete x.rueckmelde_schluessel; return x; });
  const runIds = new Set(runs.map(r => r.run_id));
  const ereignisse = (D.office_ereignisse || []).filter(e => e && runIds.has(e.run_id)).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)) || (Number(a.sequenz) || 0) - (Number(b.sequenz) || 0));
  const artefakte = (D.office_artefakte || []).filter(a => a && runIds.has(a.run_id));
  const freigaben = (D.office_freigaben || []).filter(f => f && runIds.has(f.run_id));
  const regs = agenten.map(a => { const x = { ...a, kostenstufe: kostenstufe(a), freigabe_noetig: a.freigabe_noetig == null ? null : a.freigabe_noetig, sofort_ok: agentSofortOk(a) }; if (!admin) delete x.ausfuehrer_url; delete x.geaendert_von; return x; });
  const mitglieder = (D.mitglieder || []).filter(m => m && m.mitglied_id).map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ || 'mensch', funktion: m.funktion || '', status: m.status }));
  return {
    ich: { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, typ: ich.typ || 'mensch', funktion: ich.funktion || '' },
    mitglieder, projekte, aufgaben, verlauf, notizen, agenten: regs, runs, ereignisse, artefakte, freigaben,
    sichtbare_projekte: sicht, raeume: RAEUME, status_text: STATUS_TEXT, uebergaenge: UEBERGAENGE, fristen: FRISTEN, externe_aktionen: Object.assign({}, EXTERNE_AKTIONEN, { [FREIGABE_START.aktion]: FREIGABE_START }),
    // Startregeln für Hinweise in der Oberfläche; entschieden wird serverseitig (kosten.js, startPruefung).
    start_regeln: Object.assign({}, START_REGELN, { kostenstufe_text: KOSTENSTUFE_TEXT, heute_verbraucht_eur: istAgent(ich) ? 0 : tagesverbrauchEur(alleRuns, ich.mitglied_id, new Date(o.jetzt || Date.now()).getTime()), startet_sofort: istAgent(ich) || istAdmin(ich) }),
    quelle: o.quelle || 'n8n', stand: o.jetzt || new Date().toISOString()
  };
}
