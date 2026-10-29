// Baut die n8n-SDK-Datei für „TEAM: Diktat“ (Webhook team-diktat): node vertrieb/n8n/bauen-diktat.mjs → vertrieb/n8n/diktat.workflow.gen.js
// Eingebettet wird vertrieb/lib/diktat.js (getestet: node --test vertrieb/test/diktat.test.mjs).
// Ablauf: Browser (Team-Portal, Dialog „Verkaufschance“) schickt multipart: datei (Audio), token, chance_id, chance_name, kontakt_name, art, modus, dauer_sek
//   → Mitglied prüfen (Supabase, Rolle admin/dozent/vertrieb) → OpenAI-Transkription (gpt-4o-mini-transcribe, Deutsch, Wörterbuch)
//   → Bereinigung + Zusammenfassung (gpt-5-mini, JSON) → Antwort { text, zusammenfassung, punkte, naechste_schritte, termine, aktivitaet, kosten }.
// Gespeichert wird nichts: Die Aktivität legt das Portal erst nach Klick über die Vertriebs-API (team-vertrieb, Aktion notiz) in Twenty ab.
// Die Portal-API v2 und die Vertriebs-API bleiben unberührt. Credentials: „Supabase account“ (service_role) und „OpenAI account“.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TRANSKRIPTION_MODELL } from '../lib/diktat.js';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/diktat.js'), 'utf8').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import übernimmt nur diese Form (siehe social/n8n/bauen-social.mjs).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";
const CRED_OPENAI = "{ openAiApi: newCredential('OpenAI account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const regel = (key, wert) => `{ outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '${wert}' }], combinator: 'and' } }`;

const eingangJs = `// Formularfelder und die Audiodatei aus dem Webhook holen. Die Datei liegt im ersten Binärfeld (Name je nach n8n-Version datei, datei0 oder data0).
let b = $('Diktat-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const bin = $('Diktat-API').first().binary || {};
const key = Object.keys(bin)[0] || null;
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', felder: { chance_id: b.chance_id, chance_name: b.chance_name, kontakt_name: b.kontakt_name, art: b.art, modus: b.modus, dauer_sek: b.dauer_sek }, binaerfeld: key, datei: key ? { mimeType: bin[key].mimeType, fileSize: Number(bin[key].fileSize) || (bin[key].fileSize && String(bin[key].fileSize).match(/[\\d.]+/) ? Math.round(parseFloat(bin[key].fileSize) * (/MB/i.test(bin[key].fileSize) ? 1048576 : /kB/i.test(bin[key].fileSize) ? 1024 : 1)) : 0), fileName: bin[key].fileName } : null } }];`;

const anfrageJs = LIB + `
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : ($('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null);
const r = diktatAnfrage(ich, E.felder, E.datei);
if (r.aktion !== 'transkribieren') return [{ json: r }];
// Binärdatei unter festem Namen weiterreichen (der HTTP-Knoten liest das Feld „datei“)
const bin = $('Diktat-API').first().binary || {};
return [{ json: { aktion: 'transkribieren', kontext: r.kontext, prompt: transkriptionsPrompt() }, binary: { datei: bin[E.binaerfeld] } }];`;

const transkriptJs = LIB + `
const r = $input.first().json || {};
const a = $('Anfrage prüfen').first().json;
const status = Number(r.statusCode) || 0;
const body = r.body || {};
if (status >= 300 || !body || typeof body.text !== 'string') {
  const grund = (body && body.error && body.error.message) ? String(body.error.message).slice(0, 200) : ('HTTP ' + (status || 'ohne Antwort'));
  return [{ json: { aktion: 'fehler', code: 502, antwort: { ok: false, fehler: 'Die Transkription hat nicht geklappt: ' + grund + '. Bitte gleich noch einmal versuchen.' } } }];
}
const t = String(body.text || '').trim();
if (!t) return [{ json: { aktion: 'fehler', code: 422, antwort: { ok: false, fehler: 'In der Aufnahme wurde keine Sprache erkannt. Bitte näher ans Mikrofon oder lauter sprechen.' } } }];
const p = bereinigungsPrompt(a.kontext, t);
return [{ json: { aktion: 'bereinigen', transkript: t, system: p.system, user: p.user, modell: BEREINIGUNG_MODELL } }];`;

const antwortJs = LIB + `
const tp = $('Transkript prüfen').first().json;
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
let llm = '';
try { llm = (Number(r.statusCode) < 300 && r.body && r.body.choices && r.body.choices[0] && r.body.choices[0].message) ? String(r.body.choices[0].message.content || '') : ''; } catch (e) { llm = ''; }
const erg = diktatAntwort(tp.transkript, llm, a.kontext, new Date().toISOString());
if (!llm) erg.antwort.hinweis = 'Die KI-Bereinigung war nicht erreichbar; du siehst das Rohtranskript.';
return [{ json: erg }];`;

const gen = `// GENERIERT von vertrieb/n8n/bauen-diktat.mjs – nicht von Hand ändern.
// TEAM: Diktat. Webhook team-diktat, aufgerufen vom Team-Portal (Dialog „Verkaufschance“ im Register Vertrieb).
// Eingabe multipart: datei (Audio), token, chance_id, chance_name, kontakt_name, art, modus, dauer_sek. Zugriff: aktive Menschen mit Rolle admin, dozent, vertrieb.
// Ablauf: Mitglied prüfen (Supabase) → OpenAI-Transkription (gpt-4o-mini-transcribe) → Bereinigung und Zusammenfassung (gpt-5-mini) → JSON-Antwort. Speichert nichts.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus vertrieb/lib/diktat.js (getestet), in jedem Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Diktat-API', parameters: { httpMethod: 'POST', path: 'team-diktat', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}', binaryData: true, binaryPropertyName: 'datei' } } } });
const eingang = ${code('Eingang', eingangJs)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr("${SUPA}team_mitglieder?select=mitglied_id,name,rolle,status,typ&token=eq.{{ $json.token }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', anfrageJs)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { rules: { values: [${regel('transkribieren', 'transkribieren')}, ${regel('fehler', 'fehler')}] }, options: {} } } });
const transkribieren = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Transkribieren (OpenAI)', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/audio/transcriptions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'multipart-form-data', bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'datei' }, { parameterType: 'formData', name: 'model', value: '${TRANSKRIPTION_MODELL}' }, { parameterType: 'formData', name: 'language', value: 'de' }, { parameterType: 'formData', name: 'response_format', value: 'json' }, { parameterType: 'formData', name: 'prompt', value: expr('{{ $json.prompt }}') }] }, options: { timeout: 180000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_OPENAI} } });
const transkriptPruefen = ${code('Transkript prüfen', transkriptJs)};
const transkriptDa = switchCase({ version: 3.2, config: { name: 'Transkript da?', parameters: { rules: { values: [${regel('bereinigen', 'bereinigen')}, ${regel('fehler', 'fehler')}] }, options: {} } } });
const bereinigen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Bereinigen und zusammenfassen (OpenAI)', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ model: $json.modell, messages: [{ role: "system", content: $json.system }, { role: "user", content: $json.user }], response_format: { type: "json_object" }, reasoning_effort: "low" }) }}'), options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_OPENAI} } });
const antwortBauen = ${code('Antwort bauen', antwortJs)};
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

export default workflow('team-diktat', 'TEAM: Diktat')
  .add(api).to(eingang).to(mitglied).to(anfrage)
  .to(wasTun
    .onCase(0, transkribieren.to(transkriptPruefen).to(transkriptDa
      .onCase(0, bereinigen.to(antwortBauen).to(antwort))
      .onCase(1, antwort)))
    .onCase(1, antwort));
`;
writeFileSync(join(hier, 'diktat.workflow.gen.js'), gen);
console.log('Geschrieben: vertrieb/n8n/diktat.workflow.gen.js (' + gen.length + ' Zeichen)');
