// Baut die n8n-SDK-Datei für „TEAM: Social-Upload“ (Webhook team-social).
// Start: node social/n8n/bauen-social.mjs → social/n8n/social.workflow.gen.js
// Eingebettet wird social/lib/social.js (getestet, node --test social/test/social.test.mjs).
// Aktionen: laden, idee_speichern, idee_loeschen, idee_bild_url (signierte Upload-URL für ein Bild im öffentlichen Bucket social-ideen),
// upload_url (signierte Upload-URL für den privaten Bucket medien-roh), upload_status (hochgeladen | beauftragt | geschnitten | fehler),
// upload_loeschen (nur Admin: Datei + Status geloescht).
// Die Portal-API v2 (kMuDaDmT9rCN5Vs2) bleibt unberührt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/social.js'), 'utf8').replace(/^export /gm, '');

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const STORAGE = 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/';
const BUCKET = 'medien-roh';
const BILD_BUCKET = 'social-ideen';
// newCredential('Name') statt fester ID: Der n8n-MCP-Import (create_workflow_from_code) übernimmt nur diese Form und hängt das
// bestehende Credential „Supabase account“ (NpKrSLYxAsarf8ar) selbst an; feste {id, name}-Objekte lässt er leer (Befund 28.10.2026).
const CRED_SUPA = "{ supabaseApi: newCredential('Supabase account') }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const supa = (name, method, pfad, body, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, executeOnce: true, alwaysOutputData: true,${extra} parameters: { method: '${method}', url: ${pfad}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 20000 } }, credentials: ${CRED_SUPA}, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 } })`;
const e = s => `expr(${JSON.stringify(s)})`;
const fall = key => `{ outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '${key}' }], combinator: 'and' } }`;

const A = "$('Anfrage prüfen').first().json";
const ICH = "$('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id) || null";
const PFAD_URL = p => `{{ String(${p}).split('/').map(encodeURIComponent).join('/') }}`;
const AKTIONEN = ['laden', 'idee_speichern', 'idee_loeschen', 'upload_url', 'upload_status', 'upload_loeschen', 'fehler', 'idee_bild_url'];

const JS_EINGANG = `let b = $('Social-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', aktion: String(b.aktion || ''), daten: (b.daten && typeof b.daten === 'object') ? b.daten : {} } }];`;
const JS_ANFRAGE = `${LIB}
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : (${ICH});
return [{ json: socialAnfrage(ich, E.aktion, E.daten, Date.now()) }];`;
const JS_LADEN = `${LIB}
const ich = ${ICH};
const ideen = $('Ideen laden').all().map(i => i.json).filter(x => x && x.idee_id);
const uploads = $('Uploads laden').all().map(i => i.json).filter(x => x && x.upload_id);
return [{ json: { code: 200, antwort: ladenAntwort(ideen, uploads, ich, ${JSON.stringify(STORAGE)}) } }];`;
const JS_BILD_URL = `${LIB}
const a = ${A};
const r = $input.first().json || {};
const url = signierteUrl(${JSON.stringify(STORAGE)}, r);
if (!url) return [{ json: { code: 502, antwort: { ok: false, fehler: 'Supabase hat keine Upload-Adresse für das Bild ausgestellt' + (r.message || r.error ? ': ' + (r.message || r.error) : '.') } } }];
return [{ json: { code: 200, antwort: { ok: true, bucket: a.bild.bucket, pfad: a.bild.pfad, mime: a.bild.mime, url, bild_url: bildUrl(${JSON.stringify(STORAGE)}, a.bild.pfad), gueltig_sek: 7200 } } }];`;
const JS_IDEE = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.idee.idee_id, idee: a.idee } } }];`;
const JS_IDEE_WEG = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.idee_id, hinweis: 'In den Papierkorb verschoben, 30 Tage wiederherstellbar.' } } }];`;
const JS_URL = `${LIB}
const a = ${A};
const r = $input.first().json || {};
const url = signierteUrl(${JSON.stringify(STORAGE)}, r);
if (!url) return [{ json: { code: 502, antwort: { ok: false, fehler: 'Supabase hat keine Upload-Adresse ausgestellt' + (r.message || r.error ? ': ' + (r.message || r.error) : '.') } } }];
return [{ json: { code: 200, antwort: { ok: true, upload_id: a.upload.upload_id, bucket: a.upload.bucket, pfad: a.upload.pfad, mime: a.upload.mime, url, gueltig_sek: 7200 } } }];`;
const JS_STATUS = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.upload_id, status: a.status, run_id: a.run_id || null } } }];`;
const JS_LOESCHEN_PRUEFEN = `const a = ${A};
const z = $('Upload suchen').all().map(i => i.json).find(x => x && x.upload_id);
if (!z) return [{ json: { aktion: 'fehler', code: 404, antwort: { ok: false, fehler: 'Upload nicht gefunden.' } } }];
return [{ json: { aktion: 'loeschen', upload_id: z.upload_id, bucket: z.bucket || ${JSON.stringify(BUCKET)}, pfad: z.pfad, wer: a.wer } }];`;
const JS_GELOESCHT = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, id: a.upload_id, hinweis: 'Rohvideo gelöscht. Der Eintrag bleibt als „gelöscht“ sichtbar.' } } }];`;

const sdk = `// GENERIERT von social/n8n/bauen-social.mjs – nicht von Hand ändern.
// TEAM: Social-Upload. Webhook team-social, aufgerufen vom Team-Portal (docs/team/index.html, Register „Social Media“).
// Aktionen: laden, idee_speichern, idee_loeschen, idee_bild_url, upload_url, upload_status, upload_loeschen.
// Zugriff: aktive Teammitglieder mit Portal-Token; Agenten nur laden und upload_status; löschen nur Admin.
// Rohvideos liegen im privaten Bucket „${BUCKET}“, Bilder zu Ideen im öffentlichen Bucket „${BILD_BUCKET}“. Der Browser bekommt eine signierte Upload-URL (2 h), nie einen Supabase-Schlüssel.
import { workflow, node, trigger, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus social/lib/social.js (getestet), in jedem Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Social-API', parameters: { httpMethod: 'POST', path: 'team-social', responseMode: 'responseNode', options: { allowedOrigins: 'https://flowtimotion-cyber.github.io' } } } });
const eingang = ${code('Eingang', JS_EINGANG)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: ${e(`${SUPA}team_mitglieder?select=mitglied_id,name,rolle,status,typ&token=eq.{{ $json.token }}`)}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 15000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', JS_ANFRAGE)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { rules: { values: [${AKTIONEN.map(fall).join(', ')}] } } } });
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

// laden
const ideenLaden = ${supa('Ideen laden', 'GET', e(`${SUPA}team_social_ideen?select=*&order=geaendert.desc&limit=200`))};
const uploadsLaden = ${supa('Uploads laden', 'GET', e(`${SUPA}team_social_uploads?select=*&status=neq.geloescht&order=erstellt.desc&limit=50`))};
const ladenBauen = ${code('Laden bauen', JS_LADEN)};
// idee_speichern
const ideeSpeichern = ${supa('Idee speichern', 'POST', `'${SUPA}rpc/team_idee_speichern'`, e(`{{ JSON.stringify({ p: ${A}.idee, p_von: ${A}.wer }) }}`))};
const ideeMelden = ${code('Idee melden', JS_IDEE)};
// idee_loeschen → Papierkorb (team_loeschen, Art „idee“)
const ideeWeg = ${supa('Idee in Papierkorb', 'POST', `'${SUPA}rpc/team_loeschen'`, e(`{{ JSON.stringify({ p_art: 'idee', p_id: ${A}.idee_id, p_von: ${A}.wer }) }}`))};
const ideeWegMelden = ${code('Papierkorb melden', JS_IDEE_WEG)};
// upload_url: Eintrag anlegen, dann signierte Upload-Adresse holen (service_role; der Browser lädt damit direkt in den Bucket)
const uploadAnlegen = ${supa('Upload anlegen', 'POST', `'${SUPA}rpc/team_upload_anlegen'`, e(`{{ JSON.stringify({ p: ${A}.upload, p_von: ${A}.wer }) }}`))};
const urlHolen = ${supa('Upload-Adresse signieren', 'POST', e(`${STORAGE}object/upload/sign/${BUCKET}/${PFAD_URL(A + '.upload.pfad')}`), '"{}"', " onError: 'continueRegularOutput',")};
const urlMelden = ${code('Upload-Adresse melden', JS_URL)};
// idee_bild_url: signierte Upload-Adresse für ein Bild im öffentlichen Bucket social-ideen (kein Tabelleneintrag; der Pfad kommt mit idee_speichern)
const bildUrlHolen = ${supa('Bild-Adresse signieren', 'POST', e(`${STORAGE}object/upload/sign/${BILD_BUCKET}/${PFAD_URL(A + '.bild.pfad')}`), '"{}"', " onError: 'continueRegularOutput',")};
const bildUrlMelden = ${code('Bild-Adresse melden', JS_BILD_URL)};
// upload_status
const statusSetzen = ${supa('Upload-Status setzen', 'POST', `'${SUPA}rpc/team_upload_status'`, e(`{{ JSON.stringify({ p_id: ${A}.upload_id, p_status: ${A}.status, p_von: ${A}.wer, p_run: ${A}.run_id || null, p_fehler: ${A}.fehler || null }) }}`))};
const statusMelden = ${code('Status melden', JS_STATUS)};
// upload_loeschen (nur Admin): Datei aus dem Bucket, Eintrag auf „geloescht“
const uploadSuchen = ${supa('Upload suchen', 'GET', e(`${SUPA}team_social_uploads?select=upload_id,bucket,pfad&upload_id=eq.{{ encodeURIComponent(${A}.upload_id) }}`))};
const loeschenPruefen = ${code('Löschen prüfen', JS_LOESCHEN_PRUEFEN)};
const gefunden = switchCase({ version: 3.2, config: { name: 'Gefunden?', parameters: { rules: { values: [${fall('loeschen')}, ${fall('fehler')}] } } } });
const dateiWeg = ${supa('Datei löschen', 'DELETE', e(`${STORAGE}object/${BUCKET}/${PFAD_URL("$('Löschen prüfen').first().json.pfad")}`), null, " onError: 'continueRegularOutput',")};
const geloeschtSetzen = ${supa('Als gelöscht markieren', 'POST', `'${SUPA}rpc/team_upload_status'`, e(`{{ JSON.stringify({ p_id: ${A}.upload_id, p_status: 'geloescht', p_von: ${A}.wer }) }}`))};
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
writeFileSync(join(hier, 'social.workflow.gen.js'), sdk);
console.log('geschrieben: social/n8n/social.workflow.gen.js', sdk.length, 'Zeichen');
