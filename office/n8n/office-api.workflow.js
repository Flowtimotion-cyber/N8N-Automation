// TEAM: Office-API als Code mit @n8n/workflow-sdk (Vorbild: assistent/workflow.js).
// Der Knoten „Anfrage prüfen“ enthält den aus office/lib/*.js generierten Code (office/n8n/bauen.mjs).
// Diese Datei beschreibt denselben Workflow wie office-api.workflow.json. In dieser Sitzung konnte sie nicht gegen eine
// n8n-Instanz ausgeführt werden (kein Zugang, SDK nicht installiert); die JSON-Datei ist der Importweg für Timo.
import { workflow, node, trigger } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(hier, 'code', 'anfrage-pruefen.js'), 'utf8');
const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// Credential wählt Timo in n8n aus; hier nur der Typ, keine IDs, keine Schlüssel.
const supabaseAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi' };

const eingang = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Office-API', parameters: { httpMethod: 'POST', path: 'office-api', responseMode: 'responseNode', options: { allowedOrigins: ORIGIN } }, position: [0, 300] },
  output: [{ body: { token: 'nur-im-test', aktion: 'laden', daten: {} } }] });
const zeitplan = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Wartung alle 5 Minuten', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, position: [0, 560] } });
const wartungsauftrag = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Wartungsauftrag', parameters: { assignments: { assignments: [{ id: 'a1', name: 'body', type: 'object', value: '={{ { "aktion": "wartung", "intern": true } }}' }] }, options: {} }, position: [200, 560] } });
const laden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Team-Daten laden', parameters: { method: 'POST', url: SUPABASE + 'rpc/team_laden', ...supabaseAuth, sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} }, position: [420, 300] } });
const pruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Anfrage prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE }, position: [640, 300] } });
const verzweigung = node({ type: 'n8n-nodes-base.switch', version: 3.2, config: { name: 'Was ist zu tun?', parameters: { mode: 'expression', numberOutputs: 3, output: '={{ $json.weiter }}' }, position: [860, 300] } });
const fehler = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Fehler melden', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.antwort) }}', options: { responseCode: '={{ $json.code }}' } }, position: [1080, 120] } });
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.antwort) }}', options: {} }, position: [1080, 300] } });
const auftraege = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Schreibaufträge', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: 'return ($input.first().json.ops || []).map(o => ({ json: o }));' }, position: [1080, 480] } });
const schreiben = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'In Supabase schreiben', parameters: { method: '={{ $json.methode }}', url: "={{ '" + SUPABASE + "' + $json.pfad }}", ...supabaseAuth, sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body || {}) }}', options: { batching: { batch: { batchSize: 1, batchInterval: 0 } }, response: { response: { fullResponse: true, neverError: true } } } }, position: [1300, 480] } });
const ergebnis = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ergebnis prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: readFileSync(join(hier, 'code', 'ergebnis-pruefen.js'), 'utf8') }, position: [1520, 480] } });
const gespeichert = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Gespeichert?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [1740, 480] } });
const wirkung = node({ type: 'n8n-nodes-base.switch', version: 3.2, config: { name: 'Externe Wirkung?', parameters: { mode: 'expression', numberOutputs: 3, output: "={{ !$json.extern ? 0 : ($json.extern.art === 'aktion' ? 2 : ($json.extern.ausfuehrer_url ? 1 : 0)) }}" }, position: [1960, 380] } });
const anstossen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ausführer anstoßen', parameters: { method: 'POST', url: '={{ $json.extern.ausfuehrer_url }}', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ art: $json.extern.art, run_id: $json.extern.run_id, agent_id: $json.extern.agent_id, rueckmelde_schluessel: $json.extern.schluessel || null }) }}', options: { timeout: 10000 } }, onError: 'continueRegularOutput', position: [2180, 260] } });
const platzhalter = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Externe Aktion ausführen (Platzhalter)', parameters: {}, position: [2180, 500] } });
const noetig = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Antwort nötig?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: "={{ $('Ergebnis prüfen').first().json.intern !== true }}", operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [2400, 380] } });
const ok = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Gespeichert', parameters: { respondWith: 'json', responseBody: "={{ JSON.stringify($('Ergebnis prüfen').first().json.antwort) }}", options: { responseCode: "={{ $('Ergebnis prüfen').first().json.code }}" } }, position: [2620, 300] } });
const fertig = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Wartung fertig', parameters: {}, position: [2620, 480] } });
const speicherfehler = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Speicherfehler melden', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, fehler: $json.fehler }) }}', options: { responseCode: '={{ $json.code || 500 }}' } }, position: [1960, 640] } });

export default workflow('team-office-api', 'TEAM: Office-API')
  .settings({ executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none', timezone: 'Europe/Berlin' })
  .add(eingang).to(laden)
  .add(zeitplan).to(wartungsauftrag).to(laden)
  .add(laden).to(pruefen).to(verzweigung)
  .add(verzweigung.output(0)).to(fehler)
  .add(verzweigung.output(1)).to(antwort)
  .add(verzweigung.output(2)).to(auftraege).to(schreiben).to(ergebnis).to(gespeichert)
  .add(gespeichert.output(0)).to(wirkung)
  .add(gespeichert.output(1)).to(speicherfehler)
  .add(wirkung.output(0)).to(noetig)
  .add(wirkung.output(1)).to(anstossen).to(noetig)
  .add(wirkung.output(2)).to(platzhalter).to(noetig)
  .add(noetig.output(0)).to(ok)
  .add(noetig.output(1)).to(fertig);
