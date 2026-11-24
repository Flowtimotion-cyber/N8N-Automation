// Baut die n8n-SDK-Datei für „TEAM: Nachrichten (Portal)“ (Webhook team-msgs): node nachrichten/n8n/bauen-nachrichten.mjs → nachrichten/n8n/nachrichten.workflow.gen.js
// Eingebettet wird nachrichten/lib/nachrichten.js (getestet: node --test nachrichten/test/nachrichten.test.mjs).
// Ablauf: Browser (Team-Portal) schickt { token, aktion, daten }
//   → Mitglied prüfen (Supabase) → Anfrage prüfen (Absender = angemeldetes Mitglied)
//   → POST <Supabase>/rest/v1/rpc/team_msgs_<aktion> mit den Zugangsdaten „Supabase account“ → Antwort zuschneiden → JSON ans Portal.
// Die Portal-API v2 bleibt unberührt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/nachrichten.js'), 'utf8').replace(/\r\n/g, '\n').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import übernimmt nur diese Form (siehe vertrieb/n8n/bauen-diktat.mjs).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;

const eingangJs = `// Anfrage des Portals lesen: { token, aktion, daten }. Der Token wird nur als Hex-Zeichenkette weitergereicht.
let b = $('Nachrichten-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', aktion: String(b.aktion || ''), daten: (b.daten && typeof b.daten === 'object') ? b.daten : {} } }];`;

const anfrageJs = LIB + `
// Zugang und Eingaben prüfen, Aufruf der Datenbank vorbereiten
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : ($('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null);
return [{ json: msgsAnfrage(ich, E.aktion, E.daten) }];`;

const antwortJs = LIB + `
// Antwort der Datenbank auswerten (fehlt die Datenbank, liefert „laden“ eine leere Liste)
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const erg = msgsAntwort(a, { statusCode: r.statusCode, body: r.body });
return [{ json: { aktion: 'antwort', code: erg.code, antwort: erg.antwort } }];`;

const gen = `// GENERIERT von nachrichten/n8n/bauen-nachrichten.mjs – nicht von Hand ändern.
// TEAM: Nachrichten (Portal). Webhook team-msgs, aufgerufen vom Team-Portal (Klassen C_MsgsList_Global, C_MsgsList_User).
// Eingabe: { token, aktion: laden | senden | oeffnen | ungelesen, daten }. Zugriff: jedes nicht gesperrte Mitglied, nur auf die eigene Liste.
// Ablauf: Mitglied prüfen (Supabase) → Anfrage prüfen → Supabase-Funktion team_msgs_* (supabase/team_nachrichten.sql) → JSON-Antwort.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus nachrichten/lib/nachrichten.js (getestet), in den Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Nachrichten-API', parameters: { httpMethod: 'POST', path: 'team-msgs', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}' } } } });
const eingang = ${code('Eingang', eingangJs)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr("${SUPA}team_mitglieder?select=mitglied_id,rolle,status,typ&token=eq.{{ $json.token }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', anfrageJs)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { mode: 'expression', numberOutputs: 2, output: expr("{{ $json.aktion === 'rpc' ? 0 : 1 }}") } } });
const datenbank = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Datenbank', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'POST', url: expr("${SUPA}rpc/{{ $json.fn }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_SUPA} } });
const antwortBauen = ${code('Antwort bauen', antwortJs)};
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

export default workflow('team-msgs', 'TEAM: Nachrichten (Portal)')
	.add(api).to(eingang).to(mitglied).to(anfrage)
	.to(wasTun
		.onCase(0, datenbank.to(antwortBauen).to(antwort))
		.onCase(1, antwort));
`;
// Code der beiden Knoten, die sich bei einer Änderung an der Logik ändern (für Deploy-Dateien wie nachrichten/n8n/bauen-deploy-bearbeiten.mjs)
export const KNOTEN_CODE = { 'Anfrage prüfen': anfrageJs, 'Antwort bauen': antwortJs };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(join(hier, 'nachrichten.workflow.gen.js'), gen);
	console.log('Geschrieben: nachrichten/n8n/nachrichten.workflow.gen.js (' + gen.length + ' Zeichen)');
}
