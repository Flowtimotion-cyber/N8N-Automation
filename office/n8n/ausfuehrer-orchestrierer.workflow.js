// TEAM: Office-Ausführer orchestrierer – erster echter Ausführer des Orchestrierers als n8n-Workflow (@n8n/workflow-sdk).
// Angelegt per MCP (create_workflow_from_code) am 17.10.2026 nach dem Muster von ausfuehrer-verwaltung-status.workflow.js;
// Credential „Supabase account“ danach per update_workflow/setNodeCredential gesetzt.
//
// Zwei Pfade, beide deterministisch (kein Modellaufruf in dieser ersten Fassung):
//
// A) Webhook office-ausfuehrer-orchestrierer – Zerlegen und Delegieren
//  1) Office-API ruft bei auftrag_starten die ausfuehrer_url des Agenten auf (POST { art, run_id, agent_id, rueckmelde_schluessel }); Webhook antwortet sofort.
//  2) Eigener Zugang: Token des Mitglieds agent-claude aus team_mitglieder (Supabase-Credential, nie im Workflow), Rückmelde-Schlüssel muss zu
//     office_run_schluessel passen – sonst wird der Aufruf verworfen.
//  3) lebenszeichen → laden (Agenten-Token) → Zerlegen: Der Auftragstext des Runs wird an Zeilenumbrüchen oder Semikolons in Teilaufträge zerlegt.
//     Eine Zeile je Teil, optional „@agent-id:“ am Anfang. Ohne Angabe wählt der Workflow aus der Registry (laden.agenten) einen aktiven Agenten
//     desselben Projekts ohne das Werkzeug auftrag_delegieren, in Registry-Reihenfolge (mehrere Teile ohne Angabe gehen der Reihe nach an die Kandidaten).
//  4) Ereignisse tool aufgaben_lesen und tool registry_lesen; je Teil ein auftrag_delegieren (strikt nacheinander, Schleife „Nacheinander delegieren“) (eltern_run_id = run_id, team_id = team-<run_id>,
//     idempotenzschluessel deleg-<run_id>-<n>); Ereignis schritt „n Teilaufträge delegiert“. Danach endet der Webhook-Lauf: Der Orchestrierer wartet
//     nicht aktiv, offene Kind-Runs sind sein Lebenszeichen (Teamregel der Office-API).
//  5) Jeder Fehler nach dem Lebenszeichen → run_beenden fehlgeschlagen mit Fehlertext. Leere Zerlegung oder unbekannter @agent → fehlgeschlagen, nichts delegiert.
//
// B) Zeitplan alle 5 Minuten – Zusammenführen
//  1) Token von agent-claude laden → laden → alle Runs des Orchestrierers „in_arbeit“ mit Kind-Runs; nur wenn alle Kinder in einem Endzustand sind.
//  2) Zusammenfassung deterministisch aus den Kind-Zusammenfassungen (Status je Teil, Ergebnisse der Kinder), Notiz team_notizen „Teamergebnis <run_id>“ (Upsert),
//     Ereignis tool notiz_speichern, Artefakt (art notiz, nur einmal), run_beenden abgeschlossen – oder fehlgeschlagen mit Fehlertext, wenn ein Kind
//     nicht abgeschlossen ist oder ein Teil nicht delegiert werden konnte.
//  3) Scheitert ein Schritt, bleibt der Lauf ein n8n-Fehlerlauf und wird 5 Minuten später wiederholt (Notiz Upsert, Ereignis mit Idempotenz, Artefakt nur einmal).
// Regeln: keine Zugangsdaten im Code, keine externen Aktionen, Werkzeuge nur aus der Registry-Allowlist (aufgaben_lesen, registry_lesen, auftrag_delegieren, notiz_speichern).
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const OFFICE_API = 'https://n8n.hm-storage.de/webhook/office-api';
const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const supabaseAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi' };
const officeOptionen = { timeout: 30000 };
const antwortOptionen = { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } };

const CODE_ZUGANG = `// Identität und Auftrag prüfen. Token kommt aus Supabase (team_mitglieder), nicht aus dem Workflow.
const E = $('Einstellungen').first().json;
const m = $('Zugang laden').all().map(i => i.json).find(x => x && x.mitglied_id === E.mitglied_id);
if (!m || !m.token) throw new Error('Kein Token für ' + E.mitglied_id + ' in team_mitglieder.');
if (m.status !== 'aktiv') throw new Error('Mitglied ' + E.mitglied_id + ' ist nicht aktiv.');
const s = $('Schlüssel prüfen').all().map(i => i.json).find(x => x && x.run_id === E.run_id);
if (!s || !s.schluessel || String(s.schluessel) !== String(E.schluessel)) throw new Error('Rückmelde-Schlüssel passt nicht zum Run ' + E.run_id + '. Aufruf verworfen.');
return [{ json: { token: m.token, run_id: E.run_id, agent_id: E.agent_id, mitglied_id: E.mitglied_id } }];
`;

const CODE_ZERLEGEN = `// Auftrag des Runs in Teilaufträge zerlegen und je Teil einen Agenten wählen. Deterministisch, kein Modellaufruf.
// Format im Auftrag: eine Zeile (oder ein Semikolon-Abschnitt) je Teil, optional „@agent-id:“ am Anfang.
const Z = $('Zugang prüfen').first().json;
const D = $('Daten laden').first().json || {};
if (D.ok === false) throw new Error('Office-API laden: ' + (D.fehler || 'fehlgeschlagen'));
const run = (D.runs || []).find(r => r && r.run_id === Z.run_id);
if (!run) throw new Error('Run ' + Z.run_id + ' ist in den geladenen Daten nicht sichtbar.');
const reg = (D.agenten || []).filter(a => a && a.agent_id);
const projekt = String(run.projekt || '');
const kandidaten = reg.filter(a => a.aktiv !== false && a.agent_id !== run.agent_id && Array.isArray(a.projekte) && a.projekte.includes(projekt) && !(a.erlaubte_tools || []).includes('auftrag_delegieren'));
const zeilen = String(run.auftrag || '').split(/\\r?\\n|;/).map(s => s.replace(/^\\s*(?:[-*•]|\\d+[.)])\\s+/, '').trim()).filter(s => s.length >= 3);
const teile = [], fehler = [];
let frei = 0;
zeilen.forEach((z, i) => {
  const m = z.match(/^@([A-Za-z0-9][A-Za-z0-9_.-]{1,60})\\s*:\\s*(.*)$/);
  let agent = null, text = z;
  if (m) {
    text = m[2].trim();
    agent = reg.find(a => a.agent_id === m[1]);
    if (!agent) { fehler.push('Zeile ' + (i + 1) + ': Agent „' + m[1] + '“ steht nicht in der Registry.'); return; }
    if (agent.aktiv === false) { fehler.push('Zeile ' + (i + 1) + ': Agent „' + agent.name + '“ ist deaktiviert.'); return; }
    if (agent.agent_id === run.agent_id || (agent.erlaubte_tools || []).includes('auftrag_delegieren')) { fehler.push('Zeile ' + (i + 1) + ': „' + agent.name + '“ ist selbst Orchestrierer; Teilaufträge gehen nur an ausführende Agenten.'); return; }
    if (!(Array.isArray(agent.projekte) && agent.projekte.includes(projekt))) { fehler.push('Zeile ' + (i + 1) + ': „' + agent.name + '“ ist dem Projekt „' + projekt + '“ nicht zugeordnet.'); return; }
  } else {
    if (!kandidaten.length) { fehler.push('Zeile ' + (i + 1) + ': kein aktiver Agent ohne das Werkzeug auftrag_delegieren im Projekt „' + projekt + '“. Agenten per „@agent-id:“ angeben oder Registry anpassen.'); return; }
    agent = kandidaten[frei % kandidaten.length]; frei++;
  }
  if (text.length < 3) { fehler.push('Zeile ' + (i + 1) + ': Teilauftrag zu kurz (mindestens 3 Zeichen).'); return; }
  teile.push({ n: teile.length + 1, agent_id: agent.agent_id, agent_name: agent.name, text });
});
if (fehler.length) throw new Error('Zerlegung abgebrochen, nichts delegiert: ' + fehler.join(' '));
if (!teile.length) throw new Error('Zerlegung leer: Der Auftrag enthält keine Teilaufträge. Erwartet wird eine Zeile (oder ein Semikolon-Abschnitt) je Teil, optional mit „@agent-id:“ am Anfang.');
teile.forEach(t => { t.auftrag = ('Teil ' + t.n + ' von ' + teile.length + ': ' + t.text).slice(0, 1900); });
const gewaehlt = []; teile.forEach(t => { if (!gewaehlt.some(g => g.agent_id === t.agent_id)) gewaehlt.push({ agent_id: t.agent_id, name: t.agent_name }); });
const aufgabenProjekt = (D.aufgaben || []).filter(a => a && a.projekt === projekt);
return [{ json: { run_id: run.run_id, agent_id: run.agent_id, projekt, team_id: 'team-' + run.run_id, auftrag: String(run.auftrag || ''), teile, gewaehlt, kandidaten: kandidaten.map(a => a.agent_id),
  zeilen: zeilen.length, aufgaben_projekt: aufgabenProjekt.length, aufgaben_offen: aufgabenProjekt.filter(a => a.status !== 'Erledigt').length, aufgaben_gesamt: (D.aufgaben || []).length, agenten_gesamt: reg.length, n8n_execution_id: $execution.id } }];
`;

const CODE_TEILE = `// Je Teilauftrag ein Item für den HTTP-Knoten „Delegieren“.
const Z = $('Zugang prüfen').first().json;
const X = $('Zerlegen').first().json;
return X.teile.map(t => ({ json: { token: Z.token, run_id: X.run_id, projekt: X.projekt, team_id: X.team_id, n: t.n, agent_id: t.agent_id, agent_name: t.agent_name, auftrag: t.auftrag, idempotenzschluessel: 'deleg-' + X.run_id + '-' + t.n } }));
`;

const CODE_DELEGATION = `// Antworten der Office-API auf auftrag_delegieren auswerten (gleiche Reihenfolge wie die Teile) und das Abschluss-Ereignis vorbereiten.
const Z = $('Zugang prüfen').first().json;
const X = $('Zerlegen').first().json;
const T = $('Teile aufteilen').all().map(i => i.json);
const R = $input.all().map(i => i.json);
const parse = b => { if (typeof b !== 'string') return b || {}; try { return JSON.parse(b); } catch (e) { return { fehler: b.slice(0, 200) }; } };
const ok = [], fehl = [];
T.forEach((t, i) => {
  const r = R[i] || {}; const code = Number(r.statusCode) || 0; const b = parse(r.body);
  if (code >= 200 && code < 300 && b.ok !== false && b.run_id) ok.push({ n: t.n, agent_id: t.agent_id, agent_name: t.agent_name, kind_run_id: b.run_id, team_id: b.team_id || t.team_id, wiederholt: b.wiederholt === true });
  else fehl.push({ n: t.n, agent_id: t.agent_id, http: code, fehler: String(b.fehler || 'ohne Antwort').slice(0, 300) });
});
if (!ok.length) throw new Error('Keine Delegation gelungen: ' + fehl.map(f => 'Teil ' + f.n + ' (' + f.agent_id + '): HTTP ' + f.http + ' ' + f.fehler).join(' | '));
const titel = (ok.length + ' Teilaufträge delegiert' + (fehl.length ? ', ' + fehl.length + ' nicht delegiert' : '') + ' (Team ' + X.team_id + ': ' + ok.map(k => k.agent_name).join(', ') + ')').slice(0, 200);
return [{ json: { token: Z.token, run_id: Z.run_id, delegiert: ok.length, nicht_delegiert: fehl.length,
  ereignis: { run_id: Z.run_id, art: 'schritt', titel, details: { team_id: X.team_id, kinder: ok, fehlgeschlagen: fehl, n8n_execution_id: X.n8n_execution_id, workflow: $workflow.name }, idempotenz: 'orch-delegiert-' + Z.run_id + '-' + X.n8n_execution_id } } }];
`;

const CODE_FEHLER = `// Fehler aus einem der Schritte in einen Text fassen, den das Office anzeigen kann.
let Z = null; try { Z = $('Zugang prüfen').first().json; } catch (e) {}
if (!Z || !Z.token) throw new Error('Kein Zugang – Fehler kann nicht an die Office-API gemeldet werden.');
const j = $input.first().json || {};
const e = j.error || j;
const msg = typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e).slice(0, 500));
return [{ json: { token: Z.token, run_id: Z.run_id, fehler: ('Ausführer n8n (Execution ' + $execution.id + '): ' + msg).slice(0, 1900) } }];
`;

const CODE_TOKEN = `// Zeitplan-Pfad: Token des Mitglieds agent-claude aus team_mitglieder (Supabase-Credential, nie im Workflow).
const E = $('Einstellungen (Zeitplan)').first().json;
const m = $input.all().map(i => i.json).find(x => x && x.mitglied_id === E.mitglied_id);
if (!m || !m.token) throw new Error('Kein Token für ' + E.mitglied_id + ' in team_mitglieder.');
if (m.status !== 'aktiv') throw new Error('Mitglied ' + E.mitglied_id + ' ist nicht aktiv.');
return [{ json: { token: m.token, mitglied_id: E.mitglied_id, agent_id: E.agent_id } }];
`;

const CODE_TEAMS = `// Zeitplan-Pfad: fertige Teams finden und die Zusammenfassung deterministisch aus den Kind-Runs bauen. Kein Modellaufruf.
// Ein Team ist fertig, wenn der Run des Orchestrierers „in_arbeit“ ist, Kind-Runs hat und alle Kinder in einem Endzustand sind.
const Z = $('Token prüfen').first().json;
const D = $('Daten laden (Zeitplan)').first().json || {};
if (D.ok === false) throw new Error('Office-API laden: ' + (D.fehler || 'fehlgeschlagen'));
const END = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt'];
const TXT = D.status_text || {};
const runs = (D.runs || []).filter(r => r && r.run_id);
const GEHEIM = /(passw|kennw|password|pwd|\\bpw\\b|token|api[\\s_-]?key|secret|zugangsdaten)/i;
const sauber = (t, n) => String(t || '').split('\\n').filter(z => !GEHEIM.test(z)).join(' ').replace(/\\s+/g, ' ').trim().slice(0, n || 300);
const statusText = s => TXT[s] || s || '–';
const name = id => ((D.agenten || []).find(a => a && a.agent_id === id) || {}).name || id || '–';
const fmt = iso => { try { return new Date(iso || Date.now()).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso || ''); } };
const out = [];
for (const run of runs.filter(r => r.agent_id === Z.agent_id && r.status === 'in_arbeit')) {
  const kinder = runs.filter(k => k.eltern_run_id === run.run_id).sort((a, b) => String(a.erstellt).localeCompare(String(b.erstellt)));
  if (!kinder.length) continue;
  if (kinder.some(k => !END.includes(k.status))) continue;
  const ereignisse = (D.ereignisse || []).filter(e => e && e.run_id === run.run_id);
  // Die Office-API speichert verschachtelte Details als JSON-Text (klein(), höchstens 1000 Zeichen). Darum parsen; ist der Text gekürzt,
  // zählt die Anzahl aus dem Titel „n Teilaufträge delegiert, m nicht delegiert“.
  const nichtDelegiert = ereignisse.filter(e => e.art === 'schritt' && e.details && e.details.fehlgeschlagen != null).flatMap(e => {
    let v = e.details.fehlgeschlagen;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (x) { v = null; } }
    if (Array.isArray(v)) return v;
    const m = String(e.titel || '').match(/(\\d+) nicht delegiert/);
    return m ? Array.from({ length: Number(m[1]) }, (x, i) => ({ n: '?', agent_id: '?', fehler: 'Details gekürzt, siehe Ereignis „' + String(e.titel).slice(0, 80) + '“' })) : [];
  });
  const gut = kinder.filter(k => k.status === 'abgeschlossen');
  const schlecht = kinder.filter(k => k.status !== 'abgeschlossen');
  const artefakte = (D.artefakte || []).filter(a => a && kinder.some(k => k.run_id === a.run_id));
  const teile = kinder.map((k, i) => {
    const ak = artefakte.filter(a => a.run_id === k.run_id);
    return ['## Teil ' + (i + 1) + ' – ' + name(k.agent_id) + ' (' + statusText(k.status) + ')', 'Auftrag: ' + sauber(k.auftrag, 400),
      k.zusammenfassung ? 'Ergebnis: ' + sauber(k.zusammenfassung, 1500) : '', k.fehler ? 'Fehler: ' + sauber(k.fehler, 500) : '',
      ak.length ? 'Ergebnisse: ' + ak.map(a => sauber(a.titel, 120) + (a.ablageort ? ' (' + sauber(a.ablageort, 200) + ')' : '')).join('; ') : '', 'Run: ' + k.run_id].filter(Boolean).join('\\n');
  });
  const status = (schlecht.length || nichtDelegiert.length) ? 'fehlgeschlagen' : 'abgeschlossen';
  const fehler = status === 'fehlgeschlagen' ? [
    schlecht.length ? schlecht.length + ' von ' + kinder.length + ' Teilaufträgen nicht abgeschlossen: ' + schlecht.map(k => name(k.agent_id) + ' (' + statusText(k.status) + (k.fehler ? ': ' + sauber(k.fehler, 200) : '') + ')').join('; ') : '',
    nichtDelegiert.length ? nichtDelegiert.length + ' Teilaufträge konnten nicht delegiert werden: ' + nichtDelegiert.map(f => 'Teil ' + f.n + ' (' + f.agent_id + '): ' + sauber(f.fehler, 200)).join('; ') : ''
  ].filter(Boolean).join(' ').slice(0, 1900) : null;
  const titel = 'Teamergebnis ' + run.run_id;
  const text = ['# ' + titel + ' (Stand ' + fmt(D.stand) + ')', '',
    'Automatisch zusammengeführt vom Agenten „' + name(run.agent_id) + '“ (KI Office, deterministisch, kein Modellaufruf). Zählbare Ergebnisse der Teilaufträge, keine Bewertung.', '',
    'Auftrag: ' + sauber(run.auftrag, 800), '',
    'Projekt „' + run.projekt + '“, Team ' + (run.team_id || '–') + ': ' + kinder.length + ' Teilaufträge, ' + gut.length + ' abgeschlossen, ' + schlecht.length + ' nicht abgeschlossen.' + (nichtDelegiert.length ? ' ' + nichtDelegiert.length + ' Teile konnten nicht delegiert werden.' : ''), '']
    .concat(teile.join('\\n\\n')).concat(fehler ? ['', '## Fehler', fehler] : []).join('\\n');
  const kurz = ('Team mit ' + kinder.length + ' Teilaufträgen: ' + gut.length + ' abgeschlossen' + (schlecht.length ? ', ' + schlecht.length + ' nicht abgeschlossen' : '') + '. '
    + kinder.map((k, i) => 'Teil ' + (i + 1) + ' (' + name(k.agent_id) + ', ' + statusText(k.status) + '): ' + sauber(k.zusammenfassung || k.fehler || 'ohne Zusammenfassung', 400)).join(' ')).slice(0, 3400);
  const jetzt = new Date().toISOString();
  out.push({ json: { token: Z.token, run_id: run.run_id, projekt: run.projekt, team_id: run.team_id || null, status, fehler, titel, text, kurz,
    kinder: kinder.map(k => ({ run_id: k.run_id, agent_id: k.agent_id, status: k.status })), artefakt_noetig: !(D.artefakte || []).some(a => a && a.run_id === run.run_id && a.titel === titel),
    notiz: { notiz_id: 'n_office_teamergebnis_' + run.run_id.replace(/[^A-Za-z0-9_]/g, '_'), titel, projekt: run.projekt, inhalt: text, autor: Z.mitglied_id, geaendert_von: Z.mitglied_id, erstellt: jetzt, geaendert: jetzt },
    n8n_execution_id: $execution.id } });
}
return out;
`;

const CODE_ABLAGE = `// Zeitplan-Pfad: Prüfen, ob die Notiz gespeichert wurde (gleiche Reihenfolge wie die Teams), und die Rückmeldungen an die Office-API vorbereiten.
const T = $('Teams prüfen').all().map(i => i.json);
const R = $input.all().map(i => i.json);
return T.map((t, i) => {
  const r = R[i] || {}; const code = Number(r.statusCode) || 0; const notizOk = code >= 200 && code < 300;
  const ablageort = notizOk ? 'Notiz „' + t.titel + '“ im Projekt „' + t.projekt + '“ (Team-Portal)' : '';
  const zusammenfassung = (t.kurz + (notizOk ? ' Vollständiges Teamergebnis: ' + ablageort + '.' : ' Notiz konnte nicht gespeichert werden (HTTP ' + code + ').')).slice(0, 3900);
  const beenden = { run_id: t.run_id, status: t.status, zusammenfassung };
  if (t.fehler) beenden.fehler = t.fehler;
  return { json: { token: t.token, run_id: t.run_id, artefakt_noetig: t.artefakt_noetig === true,
    ereignis: { run_id: t.run_id, art: 'schritt', titel: ('Teilergebnisse zusammengeführt: ' + t.kinder.filter(k => k.status === 'abgeschlossen').length + ' von ' + t.kinder.length + ' Teilaufträgen abgeschlossen' + (notizOk ? ', Notiz gespeichert' : ', Notiz nicht gespeichert (HTTP ' + code + ')')).slice(0, 200),
      tool: notizOk ? 'notiz_speichern' : null, quelle_ref: notizOk ? 'team_notizen/' + t.notiz.notiz_id : null, details: { team_id: t.team_id, kinder: t.kinder, status: t.status, notiz_gespeichert: notizOk, notiz_http: code, n8n_execution_id: t.n8n_execution_id, zeichen: t.text.length }, idempotenz: 'orch-zusammen-' + t.run_id },
    artefakt: { run_id: t.run_id, art: 'notiz', titel: t.titel, zusammenfassung: t.kurz.slice(0, 1000), ablageort, groesse: t.text.length },
    beenden } };
});
`;

// ---------------------------------------------------------------- Pfad A: Webhook (zerlegen und delegieren)

const eingang = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Auftrag vom Office', parameters: { httpMethod: 'POST', path: 'office-ausfuehrer-orchestrierer', responseMode: 'onReceived', options: {} }, position: [0, 300] },
  output: [{ body: { art: 'start', run_id: 'run_test', agent_id: 'orchestrierer', rueckmelde_schluessel: 'nur-im-test' } }] });

const einstellungen = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen', parameters: { mode: 'manual', assignments: { assignments: [
  { id: 'e1', name: 'run_id', type: 'string', value: expr('{{ $json.body?.run_id ?? "" }}') },
  { id: 'e2', name: 'agent_id', type: 'string', value: expr('{{ $json.body?.agent_id ?? "" }}') },
  { id: 'e3', name: 'art', type: 'string', value: expr('{{ $json.body?.art ?? "" }}') },
  { id: 'e4', name: 'schluessel', type: 'string', value: expr('{{ $json.body?.rueckmelde_schluessel ?? "" }}') },
  { id: 'e5', name: 'mitglied_id', type: 'string', value: 'agent-claude' },
  { id: 'e6', name: 'office_api', type: 'string', value: OFFICE_API },
  { id: 'e7', name: 'supabase', type: 'string', value: SUPABASE }
] }, options: {} }, position: [220, 300] },
  output: [{ run_id: 'run_test', agent_id: 'orchestrierer', art: 'start', schluessel: 'nur-im-test', mitglied_id: 'agent-claude', office_api: OFFICE_API, supabase: SUPABASE }] });

const startPruefen = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Start?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [
  { leftValue: expr('{{ $json.art }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'start' },
  { leftValue: expr('{{ $json.run_id }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[A-Za-z0-9_.:-]{6,80}$' },
  { leftValue: expr('{{ $json.schluessel }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[A-Za-z0-9_-]{16,128}$' }
], combinator: 'and' } }, position: [440, 300] } });

const abbruch = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Abbruch zur Kenntnis', parameters: {}, position: [660, 520] }, output: [{}] });

const zugangLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Zugang laden', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $json.supabase }}team_mitglieder?mitglied_id=eq.{{ $json.mitglied_id }}&select=mitglied_id,status,token'), ...supabaseAuth, options: {} }, position: [660, 200] },
  output: [{ mitglied_id: 'agent-claude', status: 'aktiv', token: 'nur-im-test' }] });

const schluesselPruefen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Schlüssel prüfen', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $("Einstellungen").first().json.supabase }}office_run_schluessel?run_id=eq.{{ $("Einstellungen").first().json.run_id }}&select=run_id,schluessel'), ...supabaseAuth, options: {} }, position: [880, 200] },
  output: [{ run_id: 'run_test', schluessel: 'nur-im-test' }] });

const zugangPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Zugang prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ZUGANG }, position: [1100, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', agent_id: 'orchestrierer', mitglied_id: 'agent-claude' }] });

const lebenszeichen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Lebenszeichen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "lebenszeichen", daten: { run_id: $("Zugang prüfen").first().json.run_id } }) }}'), options: officeOptionen }, position: [1320, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const datenLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Daten laden', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "laden", daten: {} }) }}'), options: officeOptionen }, position: [1540, 200] },
  output: [{ ok: true, projekte: [], aufgaben: [], agenten: [], runs: [] }] });

const zerlegen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Zerlegen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ZERLEGEN }, position: [1760, 200] },
  output: [{ run_id: 'run_test', agent_id: 'orchestrierer', projekt: 'Momentum Office', team_id: 'team-run_test', auftrag: '…', teile: [], gewaehlt: [], kandidaten: [], zeilen: 0, aufgaben_projekt: 0, aufgaben_offen: 0, aufgaben_gesamt: 0, agenten_gesamt: 0, n8n_execution_id: '1' }] });

const ereignisGelesen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Aufgaben gelesen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "ereignis", daten: { run_id: $json.run_id, art: "tool", tool: "aufgaben_lesen", titel: "Auftrag und Aufgaben des Projekts „" + $json.projekt + "“ gelesen (" + $json.aufgaben_offen + " offene Aufgaben, " + $json.zeilen + " Zeilen im Auftrag, " + $json.teile.length + " Teilaufträge)", quelle_ref: "https://n8n.hm-storage.de/webhook/office-api#laden", details: { aufgaben_projekt: $json.aufgaben_projekt, aufgaben_offen: $json.aufgaben_offen, aufgaben_gesamt: $json.aufgaben_gesamt, zeilen: $json.zeilen, teile: $json.teile.length, n8n_execution_id: $json.n8n_execution_id, workflow: $workflow.name }, idempotenz: "orch-gelesen-" + $json.run_id + "-" + $json.n8n_execution_id } }) }}'), options: officeOptionen }, position: [1980, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const ereignisRegistry = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Registry gelesen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "ereignis", daten: { run_id: $("Zerlegen").first().json.run_id, art: "tool", tool: "registry_lesen", titel: "Registry gelesen (" + $("Zerlegen").first().json.agenten_gesamt + " Agenten), " + $("Zerlegen").first().json.gewaehlt.length + " für das Team gewählt: " + $("Zerlegen").first().json.gewaehlt.map(g => g.name).join(", "), quelle_ref: "https://n8n.hm-storage.de/webhook/office-api#laden", details: { gewaehlt: $("Zerlegen").first().json.gewaehlt, kandidaten: $("Zerlegen").first().json.kandidaten, teile: $("Zerlegen").first().json.teile.map(t => ({ n: t.n, agent_id: t.agent_id })), n8n_execution_id: $("Zerlegen").first().json.n8n_execution_id }, idempotenz: "orch-registry-" + $("Zerlegen").first().json.run_id + "-" + $("Zerlegen").first().json.n8n_execution_id } }) }}'), options: officeOptionen }, position: [2200, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const teileAufteilen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Teile aufteilen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_TEILE }, position: [2420, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', projekt: 'Momentum Office', team_id: 'team-run_test', n: 1, agent_id: 'verwaltung-status', agent_name: 'Verwaltungs-Status', auftrag: 'Teil 1 von 1: …', idempotenzschluessel: 'deleg-run_test-1' }] });

const schleife = node({ type: 'n8n-nodes-base.splitInBatches', version: 3, config: { name: 'Nacheinander delegieren', parameters: { batchSize: 1, options: {} }, position: [2530, 380] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', n: 1 }] });

const delegieren = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Delegieren', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "auftrag_delegieren", daten: { eltern_run_id: $json.run_id, agent_id: $json.agent_id, projekt: $json.projekt, auftrag: $json.auftrag, team_id: $json.team_id, idempotenzschluessel: $json.idempotenzschluessel } }) }}'), options: antwortOptionen }, position: [2640, 200] },
  output: [{ statusCode: 200, headers: {}, body: { ok: true, run_id: 'run_kind', status: 'warteschlange', eltern_run_id: 'run_test', team_id: 'team-run_test' } }] });

const delegationPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Delegation prüfen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_DELEGATION }, position: [2860, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', delegiert: 1, nicht_delegiert: 0, ereignis: {} }] });

const ereignisDelegiert = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Teilaufträge delegiert', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "ereignis", daten: $json.ereignis }) }}'), options: officeOptionen }, position: [3080, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const fertig = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Delegiert, wartet auf Kinder', parameters: {}, position: [3300, 200] }, output: [{}] });

const fehlertext = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fehlertext bauen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_FEHLER }, position: [2640, 520] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', fehler: 'Ausführer n8n: …' }] });

const fehlerMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run fehlgeschlagen melden', onError: 'continueRegularOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "run_beenden", daten: { run_id: $json.run_id, status: "fehlgeschlagen", fehler: $json.fehler } }) }}'), options: antwortOptionen }, position: [2860, 520] },
  output: [{ statusCode: 200, body: { ok: true } }] });

// ---------------------------------------------------------------- Pfad B: Zeitplan (zusammenführen)

const zeitplan = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Alle 5 Minuten', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, position: [0, 900] }, output: [{}] });

const einstellungenZeitplan = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen (Zeitplan)', parameters: { mode: 'manual', assignments: { assignments: [
  { id: 'z1', name: 'mitglied_id', type: 'string', value: 'agent-claude' },
  { id: 'z2', name: 'agent_id', type: 'string', value: 'orchestrierer' },
  { id: 'z3', name: 'office_api', type: 'string', value: OFFICE_API },
  { id: 'z4', name: 'supabase', type: 'string', value: SUPABASE }
] }, options: {} }, position: [220, 900] },
  output: [{ mitglied_id: 'agent-claude', agent_id: 'orchestrierer', office_api: OFFICE_API, supabase: SUPABASE }] });

const zugangLadenZeitplan = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Zugang laden (Zeitplan)', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $json.supabase }}team_mitglieder?mitglied_id=eq.{{ $json.mitglied_id }}&select=mitglied_id,status,token'), ...supabaseAuth, options: {} }, position: [440, 900] },
  output: [{ mitglied_id: 'agent-claude', status: 'aktiv', token: 'nur-im-test' }] });

const tokenPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Token prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_TOKEN }, position: [660, 900] },
  output: [{ token: 'nur-im-test', mitglied_id: 'agent-claude', agent_id: 'orchestrierer' }] });

const datenLadenZeitplan = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Daten laden (Zeitplan)', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "laden", daten: {} }) }}'), options: officeOptionen }, position: [880, 900] },
  output: [{ ok: true, projekte: [], aufgaben: [], agenten: [], runs: [], ereignisse: [], artefakte: [], status_text: {}, stand: '2026-10-17T12:00:00.000Z' }] });

const teamsPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Teams prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_TEAMS }, position: [1100, 900] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', projekt: 'Momentum Office', team_id: 'team-run_test', status: 'abgeschlossen', fehler: null, titel: 'Teamergebnis run_test', text: '# …', kurz: '…', kinder: [], artefakt_noetig: true, notiz: {}, n8n_execution_id: '1' }] });

const notizSpeichern = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Notiz speichern', parameters: { method: 'POST', url: SUPABASE + 'team_notizen?on_conflict=notiz_id', ...supabaseAuth, sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.notiz) }}'), options: antwortOptionen }, position: [1320, 900] },
  output: [{ statusCode: 201, headers: {}, body: '' }] });

const ablagePruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ablage prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ABLAGE }, position: [1540, 900] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', artefakt_noetig: true, ereignis: {}, artefakt: {}, beenden: {} }] });

const ereignisTeam = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Teamergebnis', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "ereignis", daten: $json.ereignis }) }}'), options: officeOptionen }, position: [1760, 900] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const artefaktNoetig = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Artefakt nötig?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $("Ablage prüfen").item.json.artefakt_noetig }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [1980, 900] } });

const artefaktMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Artefakt melden', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").item.json.token, aktion: "artefakt", daten: $("Ablage prüfen").item.json.artefakt }) }}'), options: officeOptionen }, position: [2200, 800] },
  output: [{ ok: true, artefakt_id: 'art_test' }] });

const runAbschliessen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run abschließen (Team)', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").item.json.token, aktion: "run_beenden", daten: $("Ablage prüfen").item.json.beenden }) }}'), options: officeOptionen }, position: [2420, 900] },
  output: [{ ok: true, run_id: 'run_test', status: 'abgeschlossen', angenommen: true }] });

const teamFertig = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Team fertig', parameters: {}, position: [2640, 900] }, output: [{}] });

const hinweise = sticky('## TEAM: Office-Ausführer orchestrierer\nAusführer des Orchestrierers (docs/office/ARCHITEKTUR.md Abschnitt 10b). Quelle: office/n8n/ausfuehrer-orchestrierer.workflow.js.\n\n**Oben (Webhook):** Auftrag zerlegen – eine Zeile oder ein Semikolon-Abschnitt je Teil, optional „@agent-id:“ am Anfang – und je Teil `auftrag_delegieren` (Team team-<run_id>). Danach wartet der Orchestrierer nicht aktiv: offene Kind-Runs sind sein Lebenszeichen.\n\n**Unten (alle 5 Minuten):** Sind alle Kind-Runs beendet, entsteht die Notiz „Teamergebnis <run_id>“ deterministisch aus den Kind-Zusammenfassungen; Ereignis, Artefakt, `run_beenden` (abgeschlossen oder fehlgeschlagen).\n\n**Zugang:** Token von agent-claude zur Laufzeit aus team_mitglieder (Supabase-Credential). Rückmelde-Schlüssel gegen office_run_schluessel. Kein Modellaufruf, keine externen Aktionen. Werkzeuge: aufgaben_lesen, registry_lesen, auftrag_delegieren, notiz_speichern.', [], { color: 4, width: 520, height: 360, position: [0, -120] });

export default workflow('team-office-ausfuehrer-orchestrierer', 'TEAM: Office-Ausführer orchestrierer')
  .add(hinweise)
  // Pfad A
  .add(eingang.to(einstellungen))
  .add(einstellungen.to(startPruefen))
  .add(startPruefen.output(0).to(zugangLaden))
  .add(startPruefen.output(1).to(abbruch))
  .add(zugangLaden.to(schluesselPruefen))
  .add(schluesselPruefen.to(zugangPruefen))
  .add(zugangPruefen.to(lebenszeichen))
  .add(lebenszeichen.output(0).to(datenLaden))
  .add(datenLaden.output(0).to(zerlegen))
  .add(zerlegen.output(0).to(ereignisGelesen))
  .add(ereignisGelesen.output(0).to(ereignisRegistry))
  .add(ereignisRegistry.output(0).to(teileAufteilen))
  // Ein auftrag_delegieren nach dem anderen (ein HTTP-Knoten schickt mehrere Items sonst gleichzeitig): Schleife, Fertig-Ausgang → Delegation prüfen
  .add(teileAufteilen.output(0).to(schleife))
  .add(schleife.output(1).to(delegieren))
  .add(delegieren.output(0).to(schleife))
  .add(schleife.output(0).to(delegationPruefen))
  .add(delegationPruefen.output(0).to(ereignisDelegiert))
  .add(ereignisDelegiert.output(0).to(fertig))
  .add(lebenszeichen.output(1).to(fehlertext))
  .add(datenLaden.output(1).to(fehlertext))
  .add(zerlegen.output(1).to(fehlertext))
  .add(ereignisGelesen.output(1).to(fehlertext))
  .add(ereignisRegistry.output(1).to(fehlertext))
  .add(teileAufteilen.output(1).to(fehlertext))
  .add(delegieren.output(1).to(fehlertext))
  .add(delegationPruefen.output(1).to(fehlertext))
  .add(ereignisDelegiert.output(1).to(fehlertext))
  .add(fehlertext.to(fehlerMelden))
  // Pfad B
  .add(zeitplan.to(einstellungenZeitplan))
  .add(einstellungenZeitplan.to(zugangLadenZeitplan))
  .add(zugangLadenZeitplan.to(tokenPruefen))
  .add(tokenPruefen.to(datenLadenZeitplan))
  .add(datenLadenZeitplan.to(teamsPruefen))
  .add(teamsPruefen.to(notizSpeichern))
  .add(notizSpeichern.to(ablagePruefen))
  .add(ablagePruefen.to(ereignisTeam))
  .add(ereignisTeam.to(artefaktNoetig))
  .add(artefaktNoetig.output(0).to(artefaktMelden))
  .add(artefaktMelden.to(runAbschliessen))
  .add(artefaktNoetig.output(1).to(runAbschliessen))
  .add(runAbschliessen.to(teamFertig));
