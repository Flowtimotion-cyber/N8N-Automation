// Baut die n8n-SDK-Datei für „TEAM: ChatGPT-Werbung (Portal)“ (Webhook team-ads): node werbung/n8n/bauen-werbung.mjs → werbung/n8n/werbung.workflow.gen.js
// Eingebettet wird werbung/lib/kennzahlen.js (getestet: node --test werbung/test/kennzahlen.test.mjs).
// Ablauf: Browser (Team-Portal, Register „ChatGPT-Werbung“) schickt { token, daten: { tage } }
//   → Mitglied prüfen (Supabase, Rolle laut ADS_ROLLEN) → Zeitraum auf 1 bis 90 begrenzen → Zwischenspeicher (5 Minuten je Zeitraum, Workflow-Speicher)
//   → sonst Quelle abrufen: GET /webhook/ads-kpis?tage=N mit den Zugangsdaten „Team-Portal KPI“ (Header x-api-key) → Antwort zuschneiden → JSON ans Portal.
// Der Schlüssel steht nur in den n8n-Zugangsdaten, nie in dieser Datei, im Repo oder im Portal.
// Die Portal-API v2 und die Quelle „ChatGPT Ads – Kennzahlen-Schnittstelle (Team-Portal)“ bleiben unberührt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ADS_QUELLE } from '../lib/kennzahlen.js';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/kennzahlen.js'), 'utf8').replace(/\r\n/g, '\n').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import übernimmt nur diese Form (siehe vertrieb/n8n/bauen-diktat.mjs).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";
const CRED_QUELLE = "{ httpHeaderAuth: newCredential('Team-Portal KPI') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;

const eingangJs = `// Anfrage des Portals lesen: { token, daten: { tage } }. Der Token wird nur als Hex-Zeichenkette weitergereicht.
let b = $('Werbung-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', daten: (b.daten && typeof b.daten === 'object') ? b.daten : {} } }];`;

const anfrageJs = LIB + `
// Zugang und Zeitraum prüfen, Zwischenspeicher befragen (Workflow-Speicher, hält über Aufrufe hinweg)
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : ($('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null);
const sd = $getWorkflowStaticData('global');
return [{ json: adsAnfrage(ich, E.daten, sd.ads || {}, Date.now()) }];`;

const antwortJs = LIB + `
// Antwort der Quelle prüfen, zuschneiden und für fünf Minuten merken
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const sd = $getWorkflowStaticData('global');
const erg = adsAntwort({ statusCode: r.statusCode, body: r.body }, a.tage, sd.ads || {}, Date.now());
sd.ads = erg.cache;
return [{ json: { aktion: 'antwort', code: erg.code, antwort: erg.antwort } }];`;

const gen = `// GENERIERT von werbung/n8n/bauen-werbung.mjs – nicht von Hand ändern.
// TEAM: ChatGPT-Werbung (Portal). Webhook team-ads, aufgerufen vom Team-Portal (Register „ChatGPT-Werbung“).
// Eingabe: { token, daten: { tage } }. Zugriff: aktive Mitglieder mit einer Rolle aus ADS_ROLLEN (werbung/lib/kennzahlen.js).
// Ablauf: Mitglied prüfen (Supabase) → Zwischenspeicher (5 Minuten) → Quelle /webhook/ads-kpis mit den Zugangsdaten „Team-Portal KPI“ → JSON-Antwort. Speichert nichts außer dem Zwischenspeicher.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus werbung/lib/kennzahlen.js (getestet), in den Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Werbung-API', parameters: { httpMethod: 'POST', path: 'team-ads', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}' } } } });
const eingang = ${code('Eingang', eingangJs)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr("${SUPA}team_mitglieder?select=mitglied_id,rolle,status,typ&token=eq.{{ $json.token }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', anfrageJs)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { mode: 'expression', numberOutputs: 2, output: expr("{{ $json.aktion === 'abrufen' ? 0 : 1 }}") } } });
const quelle = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Kennzahlen abrufen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: '${ADS_QUELLE}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendQuery: true, queryParameters: { parameters: [{ name: 'tage', value: expr('{{ $json.tage }}') }] }, options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_QUELLE} } });
const antwortBauen = ${code('Antwort bauen', antwortJs)};
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

export default workflow('team-ads', 'TEAM: ChatGPT-Werbung (Portal)')
  .add(api).to(eingang).to(mitglied).to(anfrage)
  .to(wasTun
    .onCase(0, quelle.to(antwortBauen).to(antwort))
    .onCase(1, antwort));
`;
writeFileSync(join(hier, 'werbung.workflow.gen.js'), gen);
console.log('Geschrieben: werbung/n8n/werbung.workflow.gen.js (' + gen.length + ' Zeichen)');
