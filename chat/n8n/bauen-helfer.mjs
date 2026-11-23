// Baut die n8n-SDK-Datei für „TEAM: Chat-Helfer (Portal)“ (Webhook team-chat-helfer): node chat/n8n/bauen-helfer.mjs → chat/n8n/helfer.workflow.gen.js
// Eingebettet wird chat/lib/helfer.js (getestet: node --test chat/test/helfer.test.mjs). Muster: vertrieb/n8n/bauen-diktat.mjs.
// Ablauf: Browser (Team-Portal, Register Chat) schickt multipart: token, aktion (transkribieren | korrigieren), text, dauer_sek, datei (Audio)
//   → Mitglied prüfen (Supabase) → Anfrage prüfen (alle aktiven Menschen, keine Agenten)
//   → transkribieren: OpenAI gpt-4o-mini-transcribe → Text  |  korrigieren: OpenAI gpt-5-mini (JSON) → korrigierter Text
//   → JSON ans Portal. Speichert nichts. Das Vertriebs-Diktat („TEAM: Diktat“) und der Chat-Workflow bleiben unberührt.
// Credentials: „Supabase account“ (service_role) und „OpenAI account“.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HELFER_TRANSKRIPTION_MODELL } from '../lib/helfer.js';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/helfer.js'), 'utf8').replace(/\r\n/g, '\n').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import übernimmt nur diese Form (siehe vertrieb/n8n/bauen-diktat.mjs).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";
const CRED_OPENAI = "{ openAiApi: newCredential('OpenAI account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const regel = (key, wert) => `{ outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '${wert}' }], combinator: 'and' } }`;

const eingangJs = `// Formularfelder (oder JSON) und die Audiodatei aus dem Webhook holen. Die Datei liegt im ersten Binärfeld (Name je nach n8n-Version datei, datei0 oder data0).
let b = $('Helfer-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const bin = $('Helfer-API').first().binary || {};
const key = Object.keys(bin)[0] || null;
const t = String(b.token || '');
const groesse = f => Number(f.fileSize) || (f.fileSize && String(f.fileSize).match(/[\\d.]+/) ? Math.round(parseFloat(f.fileSize) * (/MB/i.test(f.fileSize) ? 1048576 : /kB/i.test(f.fileSize) ? 1024 : 1)) : 0);
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', felder: { aktion: String(b.aktion || ''), text: typeof b.text === 'string' ? b.text : '', dauer_sek: b.dauer_sek }, binaerfeld: key, datei: key ? { mimeType: bin[key].mimeType, fileSize: groesse(bin[key]), fileName: bin[key].fileName } : null } }];`;

const anfrageJs = LIB + `
// Zugang und Eingaben prüfen; bei „transkribieren“ die Audiodatei unter festem Namen weiterreichen (der HTTP-Knoten liest das Feld „datei“)
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : ($('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null);
const r = helferAnfrage(ich, E.felder, E.datei);
if (r.aktion !== 'transkribieren') return [{ json: r }];
const bin = $('Helfer-API').first().binary || {};
return [{ json: r, binary: { datei: bin[E.binaerfeld] } }];`;

const transkriptJs = LIB + `
// Antwort der Spracherkennung auswerten
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const erg = transkriptAntwort({ statusCode: r.statusCode, body: r.body }, a.dauer_sek);
return [{ json: { aktion: 'antwort', code: erg.code, antwort: erg.antwort } }];`;

const korrekturJs = LIB + `
// Antwort der Korrektur auswerten (Sicherheitsnetz: im Zweifel bleibt der Originaltext)
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const erg = korrekturAntwort(a.original, { statusCode: r.statusCode, body: r.body });
return [{ json: { aktion: 'antwort', code: erg.code, antwort: erg.antwort } }];`;

const gen = `// GENERIERT von chat/n8n/bauen-helfer.mjs – nicht von Hand ändern.
// TEAM: Chat-Helfer (Portal). Webhook team-chat-helfer, aufgerufen vom Team-Portal (Register Chat: 🎙️ Sprachnachricht, Haken „KI korrigieren“).
// Eingabe multipart oder JSON: token, aktion (transkribieren | korrigieren), text, dauer_sek, datei (Audio). Zugriff: aktive Menschen im Team, keine Agenten.
// Ablauf: Mitglied prüfen (Supabase) → OpenAI-Transkription (${HELFER_TRANSKRIPTION_MODELL}) bzw. Korrektur (gpt-5-mini) → JSON-Antwort. Speichert nichts.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus chat/lib/helfer.js (getestet), in den Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Helfer-API', parameters: { httpMethod: 'POST', path: 'team-chat-helfer', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}', binaryData: true, binaryPropertyName: 'datei' } } } });
const eingang = ${code('Eingang', eingangJs)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr("${SUPA}team_mitglieder?select=mitglied_id,rolle,status,typ&token=eq.{{ $json.token }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', anfrageJs)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { rules: { values: [${regel('transkribieren', 'transkribieren')}, ${regel('korrigieren', 'korrigieren')}, ${regel('fehler', 'fehler')}] }, options: {} } } });
const transkribieren = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Transkribieren (OpenAI)', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/audio/transcriptions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'datei' }, { parameterType: 'formData', name: 'model', value: '${HELFER_TRANSKRIPTION_MODELL}' }, { parameterType: 'formData', name: 'language', value: 'de' }, { parameterType: 'formData', name: 'response_format', value: 'json' }, { parameterType: 'formData', name: 'prompt', value: expr('{{ $json.prompt }}') }] }, options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_OPENAI} } });
const transkript = ${code('Transkript auswerten', transkriptJs)};
const korrigieren = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Korrigieren (OpenAI)', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ model: $json.modell, messages: [{ role: "system", content: $json.system }, { role: "user", content: $json.user }], response_format: { type: "json_object" }, reasoning_effort: "minimal" }) }}'), options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_OPENAI} } });
const korrektur = ${code('Korrektur auswerten', korrekturJs)};
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

export default workflow('team-chat-helfer', 'TEAM: Chat-Helfer (Portal)')
	.add(api).to(eingang).to(mitglied).to(anfrage)
	.to(wasTun
		.onCase(0, transkribieren.to(transkript).to(antwort))
		.onCase(1, korrigieren.to(korrektur).to(antwort))
		.onCase(2, antwort));
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(join(hier, 'helfer.workflow.gen.js'), gen);
	console.log('Geschrieben: chat/n8n/helfer.workflow.gen.js (' + gen.length + ' Zeichen)');
}
export { gen as HELFER_GEN };
