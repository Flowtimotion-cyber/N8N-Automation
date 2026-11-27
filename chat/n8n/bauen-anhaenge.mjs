// Baut die n8n-SDK-Datei für „TEAM: Anhänge (Portal)“ (Webhook team-anhang): node chat/n8n/bauen-anhaenge.mjs → chat/n8n/anhaenge.workflow.gen.js
// Eingebettet wird chat/lib/anhaenge.js (getestet: node --test chat/test/anhaenge.test.mjs). Muster: chat/n8n/bauen-chat.mjs, team/n8n/bauen-social.mjs.
// Ablauf A (Webhook): Browser schickt { token, aktion, daten }
//   → Mitglied prüfen → Anfrage prüfen → Supabase-Funktion team_anhang_* → bei vorbereiten/links: Adresse in Supabase Storage signieren → JSON ans Portal.
// Ablauf B (täglich 03:40): Liste (entfernt seit 30 Tagen, abgebrochene Uploads seit 1 Tag) → Dateien im Bucket löschen → als gelöscht melden.
// „TEAM: Chat (Portal)“, die Portal-API v2 und alle anderen Workflows bleiben unberührt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/anhaenge.js'), 'utf8').replace(/\r\n/g, '\n').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const STORAGE = 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/';
const ORIGIN = 'https://flowtimotion-cyber.github.io';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import übernimmt nur diese Form (siehe team/n8n/bauen-social.mjs).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const http = (name, method, url, body) => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: '${method}', url: ${url}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_SUPA} } })`;
const e = s => `expr(${JSON.stringify(s)})`;

const eingangJs = `// Anfrage des Portals lesen: { token, aktion, daten }. Der Token wird nur als Hex-Zeichenkette weitergereicht.
let b = $('Anhang-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', aktion: String(b.aktion || ''), daten: (b.daten && typeof b.daten === 'object') ? b.daten : {} } }];`;

const anfrageJs = LIB + `
// Zugang und Eingaben prüfen, Aufruf der Datenbank vorbereiten (Absender = angemeldetes Mitglied)
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : ($('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null);
return [{ json: anhangAnfrage(ich, E.aktion, E.daten) }];`;

const nachDbJs = LIB + `
// Antwort der Datenbank auswerten; bei vorbereiten und links die Signatur im Speicher vorbereiten
const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const erg = anhangNachDb(a, { statusCode: r.statusCode, body: r.body }, ${JSON.stringify(STORAGE)});
return [{ json: erg.aktion === 'storage' ? erg : { aktion: 'antwort', code: erg.code, antwort: erg.antwort } }];`;

const nachSpeicherJs = LIB + `
// Signierte Adresse(n) ans Portal geben (Upload: 2 Stunden, Lesen: 60 Minuten). Pfade im Bucket gehen nicht hinaus.
const a = $('Anfrage prüfen').first().json;
const db = $('Datenbank').first().json || {};
const r = $input.first().json || {};
const erg = anhangNachSpeicher(a, db.body, { statusCode: r.statusCode, body: r.body }, ${JSON.stringify(STORAGE)});
return [{ json: { code: erg.code, antwort: erg.antwort } }];`;

const planJs = LIB + `
// Aufräumen: was ist fällig? (Antwort von team_anhang_aufraeumen_liste)
const r = $input.first().json || {};
let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
const ok = Number(r.statusCode) >= 200 && Number(r.statusCode) < 300 && b && Array.isArray(b.anhaenge);
if (!ok) throw new Error('Aufräumen: Liste nicht lesbar (HTTP ' + r.statusCode + '). Ist supabase/team_chat_anhaenge.sql eingespielt?');
const p = anhangAufraeumen(b.anhaenge);
return [{ json: Object.assign({ faellig: p.anzahl > 0 }, p) }];`;

const gemeldetJs = `// Speicher hat gelöscht (auch Dateien, die nie fertig hochgeladen wurden, zählen als erledigt)
const p = $('Aufräumen planen').first().json;
const r = $input.first().json || {};
if (!(Number(r.statusCode) >= 200 && Number(r.statusCode) < 300)) throw new Error('Aufräumen: Speicher hat nicht gelöscht (HTTP ' + r.statusCode + '), ' + p.anzahl + ' Dateien bleiben bis morgen.');
return [{ json: { ids: p.ids, anzahl: p.anzahl, im_speicher_geloescht: Array.isArray(r.body) ? r.body.length : null } }];`;

const fertigJs = `// Ergebnis prüfen und zählen („success“ ist kein Beleg)
const p = $('Löschen gemeldet').first().json;
const r = $input.first().json || {};
let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
if (!(Number(r.statusCode) >= 200 && Number(r.statusCode) < 300) || !b || typeof b.geloescht !== 'number') throw new Error('Aufräumen: Datenbank hat das Löschen nicht vermerkt (HTTP ' + r.statusCode + ').');
return [{ json: { faellig: p.anzahl, im_speicher_geloescht: p.im_speicher_geloescht, vermerkt: b.geloescht } }];`;

const gen = `// GENERIERT von chat/n8n/bauen-anhaenge.mjs – nicht von Hand ändern.
// TEAM: Anhänge (Portal). Webhook team-anhang, aufgerufen vom Team-Portal (Register „Chat“, Dateien anhängen).
// Eingabe: { token, aktion: vorbereiten | senden | links | entfernen | wiederherstellen, daten }. Zugriff: nicht gesperrte Menschen, nur in Chats, in denen sie Mitglied sind.
// Speicher: privater Bucket team-anhaenge (supabase/team_chat_anhaenge.sql). Der Browser bekommt nur signierte Adressen, nie einen Schlüssel.
// Dazu täglich 03:40: entfernte Dateien nach 30 Tagen und abgebrochene Uploads nach 1 Tag aus dem Bucket löschen.
import { workflow, node, trigger, switchCase, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus chat/lib/anhaenge.js (getestet), in den Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Anhang-API', parameters: { httpMethod: 'POST', path: 'team-anhang', responseMode: 'responseNode', options: { allowedOrigins: '${ORIGIN}' } } } });
const eingang = ${code('Eingang', eingangJs)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: expr("${SUPA}team_mitglieder?select=mitglied_id,rolle,status,typ&token=eq.{{ $json.token }}"), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', anfrageJs)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { mode: 'expression', numberOutputs: 2, output: expr("{{ $json.aktion === 'rpc' ? 0 : 1 }}") } } });
const datenbank = ${http('Datenbank', 'POST', e(SUPA + 'rpc/{{ $json.fn }}'), e('{{ JSON.stringify($json.body) }}'))};
const nachDb = ${code('Nach Datenbank', nachDbJs)};
const speicherNoetig = switchCase({ version: 3.2, config: { name: 'Speicher nötig?', parameters: { mode: 'expression', numberOutputs: 2, output: expr("{{ $json.aktion === 'storage' ? 0 : 1 }}") } } });
const speicher = ${http('Speicher signieren', 'POST', e('{{ $json.url }}'), e('{{ JSON.stringify($json.body) }}'))};
const nachSpeicher = ${code('Antwort bauen', nachSpeicherJs)};
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

const taeglich = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Täglich 03:40', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '40 3 * * *' }] } } } });
const liste = ${http('Aufräumen: fällige holen', 'POST', e(SUPA + 'rpc/team_anhang_aufraeumen_liste'), "'{}'")};
const plan = ${code('Aufräumen planen', planJs)};
const faellig = ifElse({ version: 2.2, config: { name: 'Etwas fällig?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.faellig }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });
const loeschen = ${http('Dateien löschen', 'DELETE', e(STORAGE + 'object/team-anhaenge'), e('{{ JSON.stringify({ prefixes: $json.prefixes }) }}'))};
const gemeldet = ${code('Löschen gemeldet', gemeldetJs)};
const vermerken = ${http('Als gelöscht vermerken', 'POST', e(SUPA + 'rpc/team_anhang_aufraeumen_fertig'), e('{{ JSON.stringify({ p_ids: $json.ids }) }}'))};
const fertig = ${code('Aufräumen fertig', fertigJs)};

export default workflow('team-anhang', 'TEAM: Anhänge (Portal)')
	.add(api).to(eingang).to(mitglied).to(anfrage)
	.to(wasTun
		.onCase(0, datenbank.to(nachDb).to(speicherNoetig
			.onCase(0, speicher.to(nachSpeicher).to(antwort))
			.onCase(1, antwort)))
		.onCase(1, antwort))
	.add(taeglich).to(liste).to(plan).to(faellig.onTrue(loeschen.to(gemeldet).to(vermerken).to(fertig)));
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(join(hier, 'anhaenge.workflow.gen.js'), gen);
	console.log('Geschrieben: chat/n8n/anhaenge.workflow.gen.js (' + gen.length + ' Zeichen)');
}
