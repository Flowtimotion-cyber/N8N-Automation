// TEAM: Office-Ausführer verwaltung-status – erster echter Ausführer des KI Office als n8n-Workflow (@n8n/workflow-sdk).
// Angelegt per MCP (create_workflow_from_code) am 17.10.2026; Credentials danach per update_workflow/setNodeCredential gesetzt.
//
// Ablauf: Office-API ruft bei auftrag_starten die ausfuehrer_url des Agenten auf (POST { art, run_id, agent_id, rueckmelde_schluessel }).
//  1) Webhook antwortet sofort, Einstellungen (Agent, Adressen, Glättung AUS) werden gesetzt.
//  2) Eigener Zugang: Token des Mitglieds agent-claude aus team_mitglieder (Supabase-Credential, nie im Workflow), Rückmelde-Schlüssel
//     muss zum Run passen (office_run_schluessel) – sonst wird der Aufruf verworfen.
//  3) lebenszeichen → laden (nur die Projekte des Agenten) → Wochenstand deterministisch bauen (kein Modell).
//  4) Optional gpt-5-mini zur sprachlichen Glättung (Einstellungen.glaettung, Standard false; Zahlenprüfung, sonst verworfen).
//  5) Notiz ins Projekt des Runs (Werkzeug notiz_speichern), Ereignisse (aufgaben_lesen, notiz_speichern), Artefakt (bericht), run_beenden abgeschlossen.
//  6) Jeder Fehler nach dem Lebenszeichen → run_beenden fehlgeschlagen mit Fehlertext.
// Regeln: keine Zugangsdaten im Code, keine externen Aktionen, Werkzeuge nur aus der Registry-Allowlist des Agenten.
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const OFFICE_API = 'https://n8n.hm-storage.de/webhook/office-api';
const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const supabaseAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi' };
const officeOptionen = { timeout: 30000 };

const CODE_ZUGANG = `// Identität und Auftrag prüfen. Token kommt aus Supabase (team_mitglieder), nicht aus dem Workflow.
const E = $('Einstellungen').first().json;
const m = $('Zugang laden').all().map(i => i.json).find(x => x && x.mitglied_id === E.mitglied_id);
if (!m || !m.token) throw new Error('Kein Token für ' + E.mitglied_id + ' in team_mitglieder.');
if (m.status !== 'aktiv') throw new Error('Mitglied ' + E.mitglied_id + ' ist nicht aktiv.');
const s = $('Schlüssel prüfen').all().map(i => i.json).find(x => x && x.run_id === E.run_id);
if (!s || !s.schluessel || String(s.schluessel) !== String(E.schluessel)) throw new Error('Rückmelde-Schlüssel passt nicht zum Run ' + E.run_id + '. Aufruf verworfen.');
return [{ json: { token: m.token, run_id: E.run_id, agent_id: E.agent_id, mitglied_id: E.mitglied_id } }];
`;

const CODE_WOCHENSTAND = `// Wochenstand deterministisch aus den Aufgaben, die die Office-API dem Agenten zeigt. Kein Modellaufruf.
const Z = $('Zugang prüfen').first().json;
const D = $('Daten laden').first().json || {};
if (D.ok === false) throw new Error('Office-API laden: ' + (D.fehler || 'fehlgeschlagen'));
const tz = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const heute = tz(Date.now());
const tagDate = s => new Date(String(s).slice(0, 10) + 'T12:00:00Z');
const plus = (s, n) => { const d = tagDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const bis7 = plus(heute, 7);
const isoWoche = ds => { const t = tagDate(ds); const w0 = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - w0 + 3); const j = t.getUTCFullYear(); const e = new Date(Date.UTC(j, 0, 4)); const w = 1 + Math.round(((t - e) / 864e5 - 3 + ((e.getUTCDay() + 6) % 7)) / 7); return { j, w }; };
const kw = isoWoche(heute);
const fmt = s => s ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) + '.' + String(s).slice(0, 4) : '';
const GEHEIM = /(passw|kennw|password|pwd|\\bpw\\b|token|api[\\s_-]?key|secret|zugangsdaten)/i;
const sauber = t => String(t || '').split('\\n').filter(z => !GEHEIM.test(z)).join(' ').replace(/\\s+/g, ' ').trim().slice(0, 120) || '(ohne Titel)';
const name = id => ((D.mitglieder || []).find(m => m.mitglied_id === id) || {}).name || id || '–';
const tag = a => a.deadline ? String(a.deadline).slice(0, 10) : '';
const A = (D.aufgaben || []).filter(a => a && a.aufgabe_id);
const P = (D.projekte || []).filter(p => p && p.name && p.status !== 'archiviert');
const offen = A.filter(a => a.status !== 'Erledigt');
const ueberfaellig = offen.filter(a => tag(a) && tag(a) < heute).sort((a, b) => tag(a).localeCompare(tag(b)));
const faellig = offen.filter(a => tag(a) && tag(a) >= heute && tag(a) <= bis7).sort((a, b) => tag(a).localeCompare(tag(b)));
const blockiert = offen.filter(a => a.status === 'Wartet' || /blockiert|wartet auf/i.test(a.label || ''));
const run = (D.runs || []).find(r => r && r.run_id === Z.run_id) || {};
const projekt = run.projekt || '';
const zeile = a => sauber(a.titel) + (a.projekt ? ' (' + a.projekt + ')' : '') + (a.verantwortlich ? ' – ' + name(a.verantwortlich) : '');
const liste = (arr, f, leer, max) => { const n = max || 30; return arr.length ? arr.slice(0, n).map(x => '- ' + f(x)).join('\\n') + (arr.length > n ? '\\n- … und ' + (arr.length - n) + ' weitere' : '') : '- ' + leer; };
const mitOffen = P.filter(p => offen.some(a => a.projekt === p.name));
const zaehle = (p, arr) => arr.filter(a => a.projekt === p.name).length;
const tabelle = ['| Projekt | offen | in Arbeit | wartet | überfällig | fällig bis ' + fmt(bis7) + ' |', '|---|---|---|---|---|---|']
  .concat(mitOffen.map(p => '| ' + p.name + ' | ' + zaehle(p, offen) + ' | ' + zaehle(p, offen.filter(a => a.status === 'In Arbeit')) + ' | ' + zaehle(p, blockiert) + ' | ' + zaehle(p, ueberfaellig) + ' | ' + zaehle(p, faellig) + ' |')).join('\\n');
const ohneProjekt = offen.filter(a => !P.some(p => p.name === a.projekt)).length;
const titel = 'Wochenstand KW ' + String(kw.w).padStart(2, '0') + '/' + kw.j;
const text = [
  '# ' + titel + ' (Stand ' + fmt(heute) + ')', '',
  'Automatisch erstellt vom Agenten „Verwaltungs-Status“ aus den Aufgaben des Team-Portals (Office-API, Aktion laden). Zählbare Daten, keine Bewertung von Personen.', '',
  '## Überblick', '',
  offen.length + ' offene Aufgaben in ' + mitOffen.length + ' Projekten, ' + ueberfaellig.length + ' überfällig, ' + faellig.length + ' fällig in den nächsten 7 Tagen, ' + blockiert.length + ' Blockaden (Status „Wartet“).' + (ohneProjekt ? ' ' + ohneProjekt + ' offene Aufgaben ohne sichtbares Projekt.' : ''), '',
  tabelle, '',
  '## Überfällig (' + ueberfaellig.length + ')', liste(ueberfaellig, a => 'seit ' + fmt(tag(a)) + ': ' + zeile(a), 'nichts überfällig'), '',
  '## Fällig in den nächsten 7 Tagen (' + faellig.length + ')', liste(faellig, a => fmt(tag(a)) + ': ' + zeile(a), 'keine Fristen'), '',
  '## Blockaden – Status „Wartet“ (' + blockiert.length + ')', liste(blockiert, a => zeile(a) + (a.label ? ' [' + sauber(a.label) + ']' : ''), 'keine Blockaden'), '',
  '## Offene Aufgaben je Projekt'
].concat(mitOffen.map(p => { const o = offen.filter(a => a.projekt === p.name).sort((a, b) => (Number(a.prio) || 2) - (Number(b.prio) || 2)); return '\\n### ' + p.name + ' (' + o.length + ')\\n' + liste(o, a => 'P' + (Number(a.prio) || 2) + ' ' + (a.status || 'Offen') + ': ' + sauber(a.titel) + (a.verantwortlich ? ' – ' + name(a.verantwortlich) : '') + (tag(a) ? ', bis ' + fmt(tag(a)) : ''), '–', 25); })).join('\\n');
const kurz = (titel + ': ' + offen.length + ' offene Aufgaben in ' + mitOffen.length + ' Projekten, ' + ueberfaellig.length + ' überfällig, ' + faellig.length + ' fällig bis ' + fmt(bis7) + ', ' + blockiert.length + ' Blockaden.'
  + (ueberfaellig.length ? ' Überfällig: ' + ueberfaellig.slice(0, 5).map(a => sauber(a.titel)).join('; ') + (ueberfaellig.length > 5 ? ' …' : '') + '.' : '')
  + (blockiert.length ? ' Blockaden: ' + blockiert.slice(0, 5).map(a => sauber(a.titel)).join('; ') + (blockiert.length > 5 ? ' …' : '') + '.' : '')).slice(0, 900);
const kennzahlen = { stand: heute, aufgaben_gesamt: A.length, offen: offen.length, ueberfaellig: ueberfaellig.length, faellig_7_tage: faellig.length, blockaden: blockiert.length, projekte_sichtbar: P.length, projekte_mit_offenen: mitOffen.length };
return [{ json: { titel, text, kurz, kennzahlen, projekt, notiz_id: 'n_office_wochenstand_' + kw.j + 'w' + String(kw.w).padStart(2, '0'), heute, n8n_execution_id: $execution.id } }];
`;

const CODE_GLAETTUNG = `// Antwort von gpt-5-mini übernehmen – nur wenn alle Zahlen unverändert sind. Sonst bleibt der deterministische Text.
const W = $('Wochenstand bauen').first().json;
const E = $('Einstellungen').first().json;
const r = $input.first().json || {};
const neu = r.choices && r.choices[0] && r.choices[0].message ? String(r.choices[0].message.content || '').trim() : '';
const zahlen = t => (String(t).match(/\\d+/g) || []).sort().join(',');
let text = W.text, hinweis;
if (neu && zahlen(neu) === zahlen(W.text)) { text = neu; hinweis = 'Glättung übernommen'; }
else if (neu) hinweis = 'Glättung verworfen: Zahlen weichen ab';
else hinweis = 'Glättung verworfen: keine Antwort' + (r.error ? ' (' + String(r.error.message || r.error).slice(0, 200) + ')' : '');
const u = r.usage || {};
return [{ json: { text, glaettung: { aktiv: true, hinweis, modell: r.model || E.modell, tokens_ein: Number(u.prompt_tokens) || 0, tokens_aus: Number(u.completion_tokens) || 0 } } }];
`;

const CODE_BERICHT = `// Endgültigen Bericht festlegen (mit oder ohne Glättung) und die Notiz fürs Team-Portal vorbereiten.
const W = $('Wochenstand bauen').first().json;
let text = W.text, g = { aktiv: false, hinweis: 'ohne Modell (deterministisch)' };
try { const x = $('Glättung übernehmen').first().json; if (x && x.text) { text = x.text; g = x.glaettung; } } catch (e) {}
let hash = null; try { hash = require('crypto').createHash('sha256').update(text, 'utf8').digest('hex'); } catch (e) {}
const jetzt = new Date().toISOString();
const notizTitel = W.titel + ' – KI Office (Verwaltungs-Status)';
return [{ json: { text, titel: W.titel, kurz: W.kurz, kennzahlen: W.kennzahlen, projekt: W.projekt, glaettung: g, n8n_execution_id: W.n8n_execution_id, groesse: text.length, inhalt_hash: hash, notiz_titel: notizTitel,
  notiz: { notiz_id: W.notiz_id, titel: notizTitel, projekt: W.projekt, inhalt: text, autor: 'agent-claude', geaendert_von: 'agent-claude', erstellt: jetzt, geaendert: jetzt } } }];
`;

const CODE_ABLAGE = `// Prüfen, ob die Notiz gespeichert wurde, und die drei Rückmeldungen an die Office-API vorbereiten.
const Z = $('Zugang prüfen').first().json;
const B = $('Bericht festlegen').first().json;
const r = $input.first().json || {};
const code = Number(r.statusCode) || 0;
const notizOk = code >= 200 && code < 300;
const ablageort = notizOk ? 'Notiz „' + B.notiz_titel + '“ im Projekt „' + B.projekt + '“ (Team-Portal)' : '';
const verbrauch = B.glaettung && B.glaettung.aktiv ? { tokens_ein: B.glaettung.tokens_ein, tokens_aus: B.glaettung.tokens_aus, modell: B.glaettung.modell } : null;
const zusammenfassung = (B.kurz + (notizOk ? ' Vollständiger Bericht: ' + ablageort + '.' : ' Notiz konnte nicht gespeichert werden (HTTP ' + code + ').') + ' ' + B.glaettung.hinweis + '.').slice(0, 3900);
const details = { kennzahlen: B.kennzahlen, glaettung: B.glaettung, notiz_gespeichert: notizOk, notiz_http: code, notiz_id: B.notiz.notiz_id, n8n_execution_id: B.n8n_execution_id, zeichen: B.groesse };
return [{ json: { token: Z.token, run_id: Z.run_id, notiz_ok: notizOk,
  ereignis: { run_id: Z.run_id, art: 'schritt', titel: notizOk ? 'Wochenstand erstellt und als Notiz gespeichert' : 'Wochenstand erstellt, Notiz nicht gespeichert (HTTP ' + code + ')', tool: notizOk ? 'notiz_speichern' : null, quelle_ref: notizOk ? 'team_notizen/' + B.notiz.notiz_id : null, details, idempotenz: 'ws-erstellt-' + Z.run_id },
  artefakt: { run_id: Z.run_id, art: 'bericht', titel: B.titel, zusammenfassung: B.kurz.slice(0, 1000), ablageort, inhalt_hash: B.inhalt_hash, groesse: B.groesse },
  beenden: { run_id: Z.run_id, status: 'abgeschlossen', zusammenfassung, verbrauch } } }];
`;

const CODE_FEHLER = `// Fehler aus einem der Schritte in einen Text fassen, den das Office anzeigen kann.
let Z = null; try { Z = $('Zugang prüfen').first().json; } catch (e) {}
if (!Z || !Z.token) throw new Error('Kein Zugang – Fehler kann nicht an die Office-API gemeldet werden.');
const j = $input.first().json || {};
const e = j.error || j;
const msg = typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e).slice(0, 500));
return [{ json: { token: Z.token, run_id: Z.run_id, fehler: ('Ausführer n8n (Execution ' + $execution.id + '): ' + msg).slice(0, 1900) } }];
`;

const eingang = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Auftrag vom Office', parameters: { httpMethod: 'POST', path: 'office-ausfuehrer-verwaltung', responseMode: 'onReceived', options: {} }, position: [0, 300] },
  output: [{ body: { art: 'start', run_id: 'run_test', agent_id: 'verwaltung-status', rueckmelde_schluessel: 'nur-im-test' } }] });

const einstellungen = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen', parameters: { mode: 'manual', assignments: { assignments: [
  { id: 'e1', name: 'run_id', type: 'string', value: expr('{{ $json.body?.run_id ?? "" }}') },
  { id: 'e2', name: 'agent_id', type: 'string', value: expr('{{ $json.body?.agent_id ?? "" }}') },
  { id: 'e3', name: 'art', type: 'string', value: expr('{{ $json.body?.art ?? "" }}') },
  { id: 'e4', name: 'schluessel', type: 'string', value: expr('{{ $json.body?.rueckmelde_schluessel ?? "" }}') },
  { id: 'e5', name: 'mitglied_id', type: 'string', value: 'agent-claude' },
  { id: 'e6', name: 'office_api', type: 'string', value: OFFICE_API },
  { id: 'e7', name: 'supabase', type: 'string', value: SUPABASE },
  { id: 'e8', name: 'glaettung', type: 'boolean', value: false },
  { id: 'e9', name: 'modell', type: 'string', value: 'gpt-5-mini' }
] }, options: {} }, position: [220, 300] },
  output: [{ run_id: 'run_test', agent_id: 'verwaltung-status', art: 'start', schluessel: 'nur-im-test', mitglied_id: 'agent-claude', office_api: OFFICE_API, supabase: SUPABASE, glaettung: false, modell: 'gpt-5-mini' }] });

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
  output: [{ token: 'nur-im-test', run_id: 'run_test', agent_id: 'verwaltung-status', mitglied_id: 'agent-claude' }] });

const lebenszeichen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Lebenszeichen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "lebenszeichen", daten: { run_id: $("Zugang prüfen").first().json.run_id } }) }}'), options: officeOptionen }, position: [1320, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const datenLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Daten laden', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "laden", daten: {} }) }}'), options: officeOptionen }, position: [1540, 200] },
  output: [{ ok: true, projekte: [], aufgaben: [], mitglieder: [], runs: [] }] });

const wochenstand = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Wochenstand bauen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_WOCHENSTAND }, position: [1760, 200] },
  output: [{ titel: 'Wochenstand KW 42/2026', text: '# …', kurz: '…', kennzahlen: {}, projekt: 'Momentum Office', notiz_id: 'n_office_wochenstand_2026w42', heute: '2026-10-17', n8n_execution_id: '1' }] });

const ereignisGelesen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Aufgaben gelesen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "ereignis", daten: { run_id: $("Zugang prüfen").first().json.run_id, art: "tool", tool: "aufgaben_lesen", titel: "Aufgaben und Projekte über die Office-API geladen (" + $json.kennzahlen.aufgaben_gesamt + " Aufgaben, " + $json.kennzahlen.projekte_sichtbar + " Projekte)", quelle_ref: "https://n8n.hm-storage.de/webhook/office-api#laden", details: { kennzahlen: $json.kennzahlen, n8n_execution_id: $json.n8n_execution_id, workflow: $workflow.name }, idempotenz: "ws-gelesen-" + $json.n8n_execution_id } }) }}'), options: officeOptionen }, position: [1980, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const glaettungAn = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Glättung an?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $("Einstellungen").first().json.glaettung }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [2200, 200] } });

const glaettung = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Glättung (gpt-5-mini)', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ model: $("Einstellungen").first().json.modell, max_completion_tokens: 6000, messages: [ { role: "system", content: "Du glättest einen deutschen Statusbericht sprachlich (Markdown bleibt erhalten). Ändere keine Zahlen, Daten, Namen, Projektnamen oder Listeneinträge. Füge nichts hinzu, lass nichts weg, bewerte niemanden. Antworte nur mit dem Bericht." }, { role: "user", content: $("Wochenstand bauen").first().json.text } ] }) }}'), options: { timeout: 90000 } }, position: [2420, 80] },
  output: [{ choices: [{ message: { content: '# …' } }], usage: { prompt_tokens: 0, completion_tokens: 0 }, model: 'gpt-5-mini' }] });

const glaettungUebernehmen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Glättung übernehmen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_GLAETTUNG }, position: [2640, 80] },
  output: [{ text: '# …', glaettung: { aktiv: true, hinweis: 'Glättung übernommen', modell: 'gpt-5-mini', tokens_ein: 0, tokens_aus: 0 } }] });

const berichtFestlegen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Bericht festlegen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_BERICHT }, position: [2860, 200] },
  output: [{ text: '# …', titel: 'Wochenstand KW 42/2026', kurz: '…', projekt: 'Momentum Office', glaettung: { aktiv: false }, groesse: 1, inhalt_hash: null, notiz_titel: '…', notiz: {} }] });

const notizSpeichern = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Notiz speichern', onError: 'continueRegularOutput', parameters: { method: 'POST', url: SUPABASE + 'team_notizen?on_conflict=notiz_id', ...supabaseAuth, sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.notiz) }}'), options: { response: { response: { fullResponse: true, neverError: true } } } }, position: [3080, 200] },
  output: [{ statusCode: 201, headers: {}, body: '' }] });

const ablagePruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ablage prüfen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ABLAGE }, position: [3300, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', notiz_ok: true, ereignis: {}, artefakt: {}, beenden: {} }] });

const ereignisErstellt = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Wochenstand erstellt', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "ereignis", daten: $("Ablage prüfen").first().json.ereignis }) }}'), options: officeOptionen }, position: [3520, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const artefaktMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Artefakt melden', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "artefakt", daten: $("Ablage prüfen").first().json.artefakt }) }}'), options: officeOptionen }, position: [3740, 200] },
  output: [{ ok: true, artefakt_id: 'art_test' }] });

const runAbschliessen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run abschließen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "run_beenden", daten: $("Ablage prüfen").first().json.beenden }) }}'), options: officeOptionen }, position: [3960, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'abgeschlossen', angenommen: true }] });

const fertig = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Fertig', parameters: {}, position: [4180, 200] }, output: [{}] });

const fehlertext = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fehlertext bauen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_FEHLER }, position: [3080, 520] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', fehler: 'Ausführer n8n: …' }] });

const fehlerMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run fehlgeschlagen melden', onError: 'continueRegularOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "run_beenden", daten: { run_id: $json.run_id, status: "fehlgeschlagen", fehler: $json.fehler } }) }}'), options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } } }, position: [3300, 520] },
  output: [{ statusCode: 200, body: { ok: true } }] });

const hinweise = sticky('## TEAM: Office-Ausführer verwaltung-status\nErster echter Ausführer des KI Office (docs/office/ARCHITEKTUR.md Abschnitt 10). Quelle: office/n8n/ausfuehrer-verwaltung-status.workflow.js.\n\n**Zugang:** Der Token des Mitglieds agent-claude wird zur Laufzeit aus team_mitglieder gelesen (Supabase-Credential). Der Rückmelde-Schlüssel aus dem Aufruf muss zu office_run_schluessel passen, sonst wird der Aufruf verworfen.\n\n**Deterministisch:** Der Wochenstand entsteht ohne Modell. „Glättung“ (gpt-5-mini) ist in „Einstellungen“ standardmäßig AUS und kostet Geld, wenn eingeschaltet.\n\n**Keine externen Aktionen.** Werkzeuge: aufgaben_lesen, notiz_speichern (Registry-Allowlist).', [], { color: 4, width: 460, height: 300, position: [0, -40] });

export default workflow('team-office-ausfuehrer-verwaltung-status', 'TEAM: Office-Ausführer verwaltung-status')
  .add(hinweise)
  .add(eingang.to(einstellungen))
  .add(einstellungen.to(startPruefen))
  .add(startPruefen.output(0).to(zugangLaden))
  .add(startPruefen.output(1).to(abbruch))
  .add(zugangLaden.to(schluesselPruefen))
  .add(schluesselPruefen.to(zugangPruefen))
  .add(zugangPruefen.to(lebenszeichen))
  .add(lebenszeichen.output(0).to(datenLaden))
  .add(datenLaden.output(0).to(wochenstand))
  .add(wochenstand.output(0).to(ereignisGelesen))
  .add(ereignisGelesen.output(0).to(glaettungAn))
  .add(glaettungAn.output(0).to(glaettung))
  .add(glaettung.to(glaettungUebernehmen))
  .add(glaettungUebernehmen.to(berichtFestlegen))
  .add(glaettungAn.output(1).to(berichtFestlegen))
  .add(berichtFestlegen.output(0).to(notizSpeichern))
  .add(notizSpeichern.to(ablagePruefen))
  .add(ablagePruefen.output(0).to(ereignisErstellt))
  .add(ereignisErstellt.output(0).to(artefaktMelden))
  .add(artefaktMelden.output(0).to(runAbschliessen))
  .add(runAbschliessen.output(0).to(fertig))
  .add(lebenszeichen.output(1).to(fehlertext))
  .add(datenLaden.output(1).to(fehlertext))
  .add(wochenstand.output(1).to(fehlertext))
  .add(ereignisGelesen.output(1).to(fehlertext))
  .add(berichtFestlegen.output(1).to(fehlertext))
  .add(ablagePruefen.output(1).to(fehlertext))
  .add(ereignisErstellt.output(1).to(fehlertext))
  .add(artefaktMelden.output(1).to(fehlertext))
  .add(runAbschliessen.output(1).to(fehlertext))
  .add(fehlertext.to(fehlerMelden));
