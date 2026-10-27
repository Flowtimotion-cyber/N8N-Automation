// Baut die n8n-SDK-Datei für „TEAM: WhatsApp-Inbox (Portal)“.
// Start: node kommunikation/n8n/bauen-inbox.mjs → kommunikation/n8n/inbox.workflow.gen.js
// Eingebettet wird kommunikation/lib/inbox.js (getestet).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = readFileSync(join(hier, '..', 'lib/inbox.js'), 'utf8').replace(/^export /gm, '');

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const PNID = '1412160901975864';
const CRED_SUPA = "{ supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } }";
const CRED_WA = "{ httpHeaderAuth: { id: 'oDj3WB8KAgr3AgTy', name: 'Header Auth account 2' } }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (name, js) => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)}, parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const supa = (name, method, pfad, body, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, executeOnce: true, alwaysOutputData: true,${extra} parameters: { method: '${method}', url: ${pfad}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 15000 } }, credentials: ${CRED_SUPA}, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 } })`;
const e = s => `expr(${JSON.stringify(s)})`;
const wenn = (name, links) => `ifElse({ version: 2.2, config: { name: ${JSON.stringify(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: ${e(links)}, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } })`;
const fall = key => `{ outputKey: '${key}', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '${key}' }], combinator: 'and' } }`;

const A = "$('Anfrage prüfen').first().json";
const KQ = `{{ encodeURIComponent(${A}.konversation_id) }}`;
const zeilen = n => `$('${n}').all().map(i => i.json).filter(x => x && x.konversation_id)`;

const JS_EINGANG = `let b = $('Inbox-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const t = String(b.token || '');
return [{ json: { token: /^[a-f0-9]{20,64}$/.test(t) ? t : 'ungueltig', aktion: String(b.aktion || ''), daten: (b.daten && typeof b.daten === 'object') ? b.daten : {} } }];`;
const JS_ANFRAGE = `${LIB}
const E = $('Eingang').first().json;
const ich = E.token === 'ungueltig' ? null : $('Mitglied prüfen').all().map(i => i.json).find(m => m && m.mitglied_id);
return [{ json: inboxAnfrage(ich, E.aktion, E.daten) }];`;
const JS_LISTE = `${LIB}
const liste = inboxListe(${zeilen('Gespräche laden')}, $('Letzte Nachrichten').all().map(i => i.json).filter(x => x && x.konversation_id), Date.now());
return [{ json: { code: 200, antwort: { ok: true, gespraeche: liste, stand: new Date().toISOString() } } }];`;
const JS_VERLAUF = `${LIB}
const konv = ${zeilen('Gespräch laden')}[0];
if (!konv) return [{ json: { code: 404, antwort: { ok: false, fehler: 'Gespräch nicht gefunden.' } } }];
const v = inboxVerlauf(konv, $('Nachrichten laden').all().map(i => i.json).filter(x => x && x.nachricht_id), Date.now());
return [{ json: { code: 200, antwort: { ok: true, ...v } } }];`;
const JS_SENDEN = `${LIB}
const konv = ${zeilen('Gespräch zum Senden')}[0];
const p = sendenPruefen(konv, ${A}.text, Date.now());
return [{ json: p.ok ? { ok: true, wa_body: p.wa_body } : { ok: false, code: 400, antwort: { ok: false, fehler: p.fehler } } }];`;
const JS_AUSWERTEN = `const r = $input.first().json || {};
const code = Number(r.statusCode || 0), b = r.body || {};
const id = b.messages && b.messages[0] && b.messages[0].id;
if (code >= 200 && code < 300 && id) return [{ json: { ok: true, nachricht_id: String(id) } }];
const f = b.error || {};
const hinweis = f.code === 131047 ? 'Das 24-Stunden-Fenster ist abgelaufen, freie Antworten sind gesperrt.' : (f.message || 'WhatsApp hat die Nachricht nicht angenommen.');
return [{ json: { ok: false, code: 502, antwort: { ok: false, fehler: 'Nicht gesendet: ' + hinweis } } }];`;
const JS_GESENDET = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, nachricht: { id: $('Versand auswerten').first().json.nachricht_id, richtung: 'aus', absender: a.wer, typ: 'text', text: a.text, status: 'gesendet', zeit: new Date().toISOString() }, hinweis: 'Gesendet. Der Bot pausiert in diesem Gespräch, bis du ihn wieder einschaltest.' } } }];`;
const JS_MODUS = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, modus: a.modus } } }];`;
const JS_STATUS = `const a = ${A};
return [{ json: { code: 200, antwort: { ok: true, status: a.status } } }];`;

const sdk = `// GENERIERT von kommunikation/n8n/bauen-inbox.mjs – nicht von Hand ändern.
// TEAM: WhatsApp-Inbox (Portal). Webhook team-inbox, aufgerufen vom Team-Portal (docs/team/index.html).
// Aktionen: liste, verlauf, senden (nur WhatsApp, nur im 24-Stunden-Fenster), modus (ki|mensch), status (offen|erledigt).
// Zugriff: aktive Menschen mit Rolle admin, dozent oder vertrieb (Portal-Token). Antwort aus dem Portal pausiert den Bot (kom_ausgang).
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus kommunikation/lib/inbox.js (getestet), in jedem Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Inbox-API', parameters: { httpMethod: 'POST', path: 'team-inbox', responseMode: 'responseNode', options: { allowedOrigins: 'https://flowtimotion-cyber.github.io' } } } });
const eingang = ${code('Eingang', JS_EINGANG)};
const mitglied = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglied prüfen', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { method: 'GET', url: ${e(`${SUPA}team_mitglieder?select=mitglied_id,name,rolle,status,typ&token=eq.{{ $json.token }}`)}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 15000 } }, credentials: ${CRED_SUPA} } });
const anfrage = ${code('Anfrage prüfen', JS_ANFRAGE)};
const wasTun = switchCase({ version: 3.2, config: { name: 'Was tun?', parameters: { rules: { values: [${['liste', 'verlauf', 'senden', 'modus', 'status', 'fehler'].map(fall).join(', ')}] } } } });
const antwort = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Antwort senden', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } } } });

// liste
const gespraeche = ${supa('Gespräche laden', 'GET', e(`${SUPA}kom_konversationen?select=konversation_id,kanal,kontakt_extern,kontakt_name,telefon_e164,marke,modus,status,zugewiesen,zusammenfassung,letzte_kunde_am,erstellt&order=geaendert.desc&limit=200`))};
const letzte = ${supa('Letzte Nachrichten', 'GET', e(`${SUPA}kom_nachrichten?select=konversation_id,richtung,absender,typ,text,zeit&order=zeit.desc&limit=1000`))};
const liste = ${code('Liste bauen', JS_LISTE)};
// verlauf
const gespraech = ${supa('Gespräch laden', 'GET', e(`${SUPA}kom_konversationen?select=*&konversation_id=eq.${KQ}`))};
const nachrichten = ${supa('Nachrichten laden', 'GET', e(`${SUPA}kom_nachrichten?select=nachricht_id,richtung,absender,typ,text,status,zeit&order=zeit.asc&limit=400&konversation_id=eq.${KQ}`))};
const verlauf = ${code('Verlauf bauen', JS_VERLAUF)};
// senden
const gespraechSenden = ${supa('Gespräch zum Senden', 'GET', e(`${SUPA}kom_konversationen?select=konversation_id,kanal,kontakt_extern,letzte_kunde_am&konversation_id=eq.${KQ}`))};
const sendenPruefen = ${code('Senden prüfen', JS_SENDEN)};
const darfRaus = ${wenn('Darf raus?', '{{ $json.ok }}')};
const senden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'WhatsApp senden', parameters: { method: 'POST', url: 'https://graph.facebook.com/v26.0/${PNID}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.wa_body) }}'), options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_WA} } });
const auswerten = ${code('Versand auswerten', JS_AUSWERTEN)};
const gesendet = ${wenn('Gesendet?', '{{ $json.ok }}')};
const speichern = ${supa('Ausgang speichern', 'POST', `'${SUPA}rpc/kom_ausgang'`, e(`{{ JSON.stringify({ p: { konversation_id: ${A}.konversation_id, nachricht_id: $json.nachricht_id, absender: ${A}.wer, typ: 'text', text: ${A}.text, status: 'gesendet' } }) }}`), " onError: 'continueRegularOutput',")};
const fertig = ${code('Gesendet melden', JS_GESENDET)};
// modus
const modus = ${supa('Modus setzen', 'POST', `'${SUPA}rpc/kom_modus_setzen'`, e(`{{ JSON.stringify({ p_konversation: ${A}.konversation_id, p_modus: ${A}.modus, p_wer: ${A}.wer }) }}`))};
const modusOk = ${code('Modus melden', JS_MODUS)};
// status
const status = ${supa('Status setzen', 'PATCH', e(`${SUPA}kom_konversationen?konversation_id=eq.${KQ}`), e(`{{ JSON.stringify({ status: ${A}.status, geaendert: new Date().toISOString() }) }}`))};
const statusOk = ${code('Status melden', JS_STATUS)};

export default workflow('team-inbox', 'TEAM: WhatsApp-Inbox (Portal)')
  .add(api).to(eingang).to(mitglied).to(anfrage)
  .to(wasTun
    .onCase(0, gespraeche.to(letzte).to(liste).to(antwort))
    .onCase(1, gespraech.to(nachrichten).to(verlauf).to(antwort))
    .onCase(2, gespraechSenden.to(sendenPruefen).to(darfRaus.onTrue(senden.to(auswerten).to(gesendet.onTrue(speichern.to(fertig).to(antwort)).onFalse(antwort))).onFalse(antwort)))
    .onCase(3, modus.to(modusOk).to(antwort))
    .onCase(4, status.to(statusOk).to(antwort))
    .onCase(5, antwort));
`;
writeFileSync(join(hier, 'inbox.workflow.gen.js'), sdk);
console.log('geschrieben: kommunikation/n8n/inbox.workflow.gen.js', sdk.length, 'Zeichen');
