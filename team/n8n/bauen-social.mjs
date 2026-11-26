// Baut die n8n-SDK-Datei für „TEAM: Social-Upload“ (Webhook team-social).
// Start: node team/n8n/bauen-social.mjs → team/n8n/social.workflow.gen.js
// Aktionen: laden, idee_speichern, idee_loeschen, idee_bild_url (signierte Upload-URL für ein Bild im öffentlichen Bereich social-ideen),
// upload_url (signierte Upload-URL für den privaten Bereich medien-roh), upload_status (hochgeladen | beauftragt | geschnitten | fehler),
// upload_loeschen (nur Admin: Datei + Status geloescht).
// Die Portal-API v2 (kMuDaDmT9rCN5Vs2) bleibt unberührt.
//
// Aufbau: Die Code-Knoten bekommen vorangestellt (n8n-Code-Knoten können keine Dateien nachladen)
//   C_DataBase + <Datenbank-Klasse> + C_MedienSpeicher + <Speicher-Klasse> + C_Social
//   const dataBase = new <Datenbank-Klasse>();  const medienSpeicher = new <Speicher-Klasse>(…, C_Social.BEREICHE);
// Was gelesen, geschrieben, hochgeladen oder gelöscht wird, legt C_Social fest (Aufträge in $json.db und $json.speicher);
// die HTTP-Knoten führen diese Aufträge nur aus. Getestet: team/test/social.test.mjs, team/test/social.workflow.test.mjs.
//
// Varianten: bisher nur Supabase (Datenbank + Storage). Eine zweite Variante braucht eine eigene Speicher-Klasse
// (z. B. C_MedienSpeicher_Rclone) und Ausführungsknoten für ihre Aufträge.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = datei => readFileSync(join(hier, datei), 'utf8').replace(/\r\n/g, '\n');

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const STORAGE = 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/';
const DB_KLASSE = 'C_DataBase_Supabase';
const SPEICHER_KLASSE = 'C_MedienSpeicher_Supabase';

export const KLASSEN = ['C_DataBase', DB_KLASSE, 'C_MedienSpeicher', SPEICHER_KLASSE, 'C_Social'];
export const LIB = KLASSEN.map(k => '// ===== ' + k + '.js =====\n' + lies(k + '.js').replace(/^export /gm, '').trim()).join('\n\n')
	+ '\n\nconst dataBase = new ' + DB_KLASSE + '();\nconst medienSpeicher = new ' + SPEICHER_KLASSE + '(' + JSON.stringify(STORAGE) + ', C_Social.BEREICHE);\n';

// newCredential('Name') statt fester ID: Der n8n-MCP-Import (create_workflow_from_code) übernimmt nur diese Form und hängt das
// bestehende Credential „Supabase account“ (NpKrSLYxAsarf8ar) selbst an; feste {id, name}-Objekte lässt er leer (Befund 28.10.2026).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
// text: Antwortformat „Text“. Supabase-Funktionen (rpc/…) antworten mit einem einfachen Text (z. B. der ID), nicht mit einem JSON-Objekt;
// ohne „Text“ bricht der HTTP-Knoten mit „Response body is not valid JSON“ ab und das Portal bekommt keine Antwort (Fenster bleibt offen,
// Fehler 21.11.2026). Die Adresse steht erst zur Laufzeit im Auftrag fest, deshalb ist „text“ je Knoten in AUSFUEHRUNG eingetragen.
const supa = (name, method, pfad, body, extra = '', text = false) => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, executeOnce: true, alwaysOutputData: true,${extra} parameters: { method: '${method}', url: ${pfad}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 20000${text ? ", response: { response: { responseFormat: 'text' } }" : ''} } }, credentials: ${CRED_SUPA}, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 } })`;
const e = s => `expr(${JSON.stringify(s)})`;
const fall = key => `{ outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '${key}' }], combinator: 'and' } }`;

const A = "$('Anfrage prüfen').first().json";
const L = "$('Löschen prüfen').first().json";
const ICH = "$('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null";
const AKTIONEN = ['laden', 'idee_speichern', 'idee_loeschen', 'upload_url', 'upload_status', 'upload_loeschen', 'fehler', 'idee_bild_url'];

// Ausführung eines Auftrags { methode, pfad, body }: Adresse = Basis + pfad, Body = JSON von body.
// Methode und Antwortformat stehen fest im Knoten (text: true bei Supabase-Funktionen, siehe supa);
// social.workflow.test.mjs prüft, dass beides zum Auftrag passt (Methode gleich, text genau bei pfad rpc/…).
export const AUSFUEHRUNG = {
	'Mitglied prüfen':          { methode: 'GET',    basis: SUPA,    auftrag: '$json.db' },
	'Ideen laden':              { methode: 'GET',    basis: SUPA,    auftrag: A + '.db.ideen' },
	'Uploads laden':            { methode: 'GET',    basis: SUPA,    auftrag: A + '.db.uploads' },
	'Idee speichern':           { methode: 'POST',   basis: SUPA,    auftrag: A + '.db', body: true, text: true },
	'Idee in Papierkorb':       { methode: 'POST',   basis: SUPA,    auftrag: A + '.db', body: true, text: true },
	'Upload anlegen':           { methode: 'POST',   basis: SUPA,    auftrag: A + '.db', body: true, text: true },
	'Upload-Adresse signieren': { methode: 'POST',   basis: STORAGE, auftrag: A + '.speicher', body: true, extra: " onError: 'continueRegularOutput'," },
	'Bild-Adresse signieren':   { methode: 'POST',   basis: STORAGE, auftrag: A + '.speicher', body: true, extra: " onError: 'continueRegularOutput'," },
	'Upload-Status setzen':     { methode: 'POST',   basis: SUPA,    auftrag: A + '.db', body: true, text: true },
	'Upload suchen':            { methode: 'GET',    basis: SUPA,    auftrag: A + '.db' },
	'Datei löschen':            { methode: 'DELETE', basis: STORAGE, auftrag: L + '.speicher', extra: " onError: 'continueRegularOutput'," },
	'Als gelöscht markieren':   { methode: 'POST',   basis: SUPA,    auftrag: L + '.db', body: true, text: true }
};
const ausfuehren = name => {
	const x = AUSFUEHRUNG[name];
	return supa(name, x.methode, e(`${x.basis}{{ ${x.auftrag}.pfad }}`), x.body ? e(`{{ JSON.stringify(${x.auftrag}.body) }}`) : null, x.extra, !!x.text);
};

const JS_EINGANG = `${LIB}
let b = $('Social-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
const token = /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig';
return [{ json: { token, aktion: String(b.aktion || ''), daten: (b.daten && typeof b.daten === 'object') ? b.daten : {}, db: C_Social.mitgliedLesen(dataBase, token) } }];`;
const JS_ANFRAGE = `${LIB}
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : (${ICH});
return [{ json: C_Social.auftraege(C_Social.anfrage(ich, E.aktion, E.daten, Date.now()), dataBase, medienSpeicher) }];`;
const JS_LADEN = `${LIB}
const ich = ${ICH};
const ideen = $('Ideen laden').all().map(i => i.json).filter(x => x && x.idee_id);
const uploads = $('Uploads laden').all().map(i => i.json).filter(x => x && x.upload_id);
return [{ json: { code: 200, antwort: C_Social.ladenAntwort(ideen, uploads, ich, medienSpeicher) } }];`;
const JS_BILD_URL = `${LIB}
const a = ${A};
const r = $input.first().json || {};
const url = medienSpeicher.uploadAdresse(r);
if (!url) return [{ json: { code: 502, antwort: { ok: false, fehler: 'Supabase hat keine Upload-Adresse für das Bild ausgestellt' + (r.message || r.error ? ': ' + (r.message || r.error) : '.') } } }];
return [{ json: { code: 200, antwort: { ok: true, bucket: a.bild.bucket, pfad: a.bild.pfad, mime: a.bild.mime, url, bild_url: medienSpeicher.oeffentlicheAdresse(a.bild.bucket, a.bild.pfad), gueltig_sek: 7200 } } }];`;
const JS_IDEE = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.idee.idee_id, idee: a.idee } } }];`;
const JS_IDEE_WEG = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.idee_id, hinweis: 'In den Papierkorb verschoben, 30 Tage wiederherstellbar.' } } }];`;
const JS_URL = `${LIB}
const a = ${A};
const r = $input.first().json || {};
const url = medienSpeicher.uploadAdresse(r);
if (!url) return [{ json: { code: 502, antwort: { ok: false, fehler: 'Supabase hat keine Upload-Adresse ausgestellt' + (r.message || r.error ? ': ' + (r.message || r.error) : '.') } } }];
return [{ json: { code: 200, antwort: { ok: true, upload_id: a.upload.upload_id, bucket: a.upload.bucket, pfad: a.upload.pfad, mime: a.upload.mime, url, gueltig_sek: 7200 } } }];`;
const JS_STATUS = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.upload_id, status: a.status, run_id: a.run_id || null } } }];`;
const JS_LOESCHEN_PRUEFEN = `${LIB}
const a = ${A};
const z = $('Upload suchen').all().map(i => i.json).find(x => x && x.upload_id);
return [{ json: C_Social.loeschenAuftraege(a, z, dataBase, medienSpeicher) }];`;
const JS_GELOESCHT = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.upload_id, hinweis: 'Rohvideo gelöscht. Der Eintrag bleibt als „gelöscht“ sichtbar.' } } }];`;

export const SDK = `// GENERIERT von team/n8n/bauen-social.mjs – nicht von Hand ändern.
// TEAM: Social-Upload. Webhook team-social, aufgerufen vom Team-Portal (docs/team/index.html, Register „Social Media“).
// Aktionen: laden, idee_speichern, idee_loeschen, idee_bild_url, upload_url, upload_status, upload_loeschen.
// Zugriff: aktive Teammitglieder mit Portal-Token; Agenten nur laden und upload_status; löschen nur Admin.
// Rohvideos liegen im privaten Bereich „medien-roh“, Bilder zu Ideen im öffentlichen Bereich „social-ideen“ (Supabase-Buckets). Der Browser bekommt eine signierte Upload-URL (2 h), nie einen Supabase-Schlüssel.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Klassen aus team/n8n (${KLASSEN.join(', ')}; getestet), in den Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Social-API', parameters: { httpMethod: 'POST', path: 'team-social', responseMode: 'responseNode', options: { allowedOrigins: 'https://flowtimotion-cyber.github.io' } } } });
const eingang = ${code('Eingang', JS_EINGANG)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: '${AUSFUEHRUNG['Mitglied prüfen'].methode}', url: ${e(`${SUPA}{{ $json.db.pfad }}`)}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 15000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', JS_ANFRAGE)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { rules: { values: [${AKTIONEN.map(fall).join(', ')}] } } } });
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

// laden
const ideenLaden = ${ausfuehren('Ideen laden')};
const uploadsLaden = ${ausfuehren('Uploads laden')};
const ladenBauen = ${code('Laden bauen', JS_LADEN)};
// idee_speichern
const ideeSpeichern = ${ausfuehren('Idee speichern')};
const ideeMelden = ${code('Idee melden', JS_IDEE)};
// idee_loeschen → Papierkorb (team_loeschen, Art „idee“)
const ideeWeg = ${ausfuehren('Idee in Papierkorb')};
const ideeWegMelden = ${code('Papierkorb melden', JS_IDEE_WEG)};
// upload_url: Eintrag anlegen, dann signierte Upload-Adresse holen (service_role; der Browser lädt damit direkt in den Bereich)
const uploadAnlegen = ${ausfuehren('Upload anlegen')};
const urlHolen = ${ausfuehren('Upload-Adresse signieren')};
const urlMelden = ${code('Upload-Adresse melden', JS_URL)};
// idee_bild_url: signierte Upload-Adresse für ein Bild im öffentlichen Bereich social-ideen (kein Tabelleneintrag; der Pfad kommt mit idee_speichern)
const bildUrlHolen = ${ausfuehren('Bild-Adresse signieren')};
const bildUrlMelden = ${code('Bild-Adresse melden', JS_BILD_URL)};
// upload_status
const statusSetzen = ${ausfuehren('Upload-Status setzen')};
const statusMelden = ${code('Status melden', JS_STATUS)};
// upload_loeschen (nur Admin): Datei aus dem Bereich, Eintrag auf „geloescht“
const uploadSuchen = ${ausfuehren('Upload suchen')};
const loeschenPruefen = ${code('Löschen prüfen', JS_LOESCHEN_PRUEFEN)};
const gefunden = switchCase({ version: 3.2, config: { name: 'Gefunden?', parameters: { rules: { values: [${fall('loeschen')}, ${fall('fehler')}] } } } });
const dateiWeg = ${ausfuehren('Datei löschen')};
const geloeschtSetzen = ${ausfuehren('Als gelöscht markieren')};
const geloeschtMelden = ${code('Gelöscht melden', JS_GELOESCHT)};

export default workflow('team-social', 'TEAM: Social-Upload')
	.add(api).to(eingang).to(mitglied).to(anfrage)
	.to(wasTun
		.onCase(0, ideenLaden.to(uploadsLaden).to(ladenBauen).to(antwort))
		.onCase(1, ideeSpeichern.to(ideeMelden).to(antwort))
		.onCase(2, ideeWeg.to(ideeWegMelden).to(antwort))
		.onCase(3, uploadAnlegen.to(urlHolen).to(urlMelden).to(antwort))
		.onCase(4, statusSetzen.to(statusMelden).to(antwort))
		.onCase(5, uploadSuchen.to(loeschenPruefen).to(gefunden.onCase(0, dateiWeg.to(geloeschtSetzen).to(geloeschtMelden).to(antwort)).onCase(1, antwort)))
		.onCase(6, antwort)
		.onCase(7, bildUrlHolen.to(bildUrlMelden).to(antwort)));
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(join(hier, 'social.workflow.gen.js'), SDK);
	console.log('geschrieben: team/n8n/social.workflow.gen.js', SDK.length, 'Zeichen');
}
