// Baut die n8n-SDK-Datei für „KOM: WhatsApp Antwort (Workflow B)“.
// Start: node kommunikation/n8n/bauen-antwort.mjs → kommunikation/n8n/wa-antwort.workflow.gen.js
//                                               + kommunikation/n8n/wa-antwort.crm-deploy.json (update_workflow-Operationen)
// Eingebettet werden: kommunikation/lib/antwort.js und kommunikation/lib/crm.js (beide getestet).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = p => readFileSync(join(hier, '..', p), 'utf8');
const LIB = lies('lib/antwort.js').replace(/^export /gm, '');
// Übergabe an die Vertriebs-Pipeline (Twenty), getestet in kommunikation/test/crm.test.mjs
const CRM = lies('lib/crm.js').replace(/^export /gm, '');

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const TWENTY = 'https://twenty.hm-storage.de/rest/';
const PNID = '1412160901975864';
const CRED_SUPA = "{ supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } }";
const CRED_WA = "{ httpHeaderAuth: { id: 'oDj3WB8KAgr3AgTy', name: 'Header Auth account 2' } }";
const CRED_OAI = "{ openAiApi: { id: 'rkuYTCGaH7Maoaf2', name: 'OpenAI account' } }";
const CRED_TG = "{ telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } }";
// Zugangsdaten nur als Verweis auf die n8n-Credentials (Werte liegen in n8n, nie im Repo)
const CRED_OBJ = {
  supa: { supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } },
  twenty: { httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } },
  tg: { telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } }
};

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : js.startsWith(CRM) ? 'CRM + ' + JSON.stringify(js.slice(CRM.length)) : JSON.stringify(js);
const code = (name, js, extra = '') => `node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)},${extra} parameters: { mode: 'runOnceForAllItems', jsCode: ${jsQuelle(js)} } } })`;
const supa = (name, method, pfad, body, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, executeOnce: true,${extra} parameters: { method: '${method}', url: ${pfad}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 15000 } }, credentials: ${CRED_SUPA}, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 } })`;
const e = s => `expr(${JSON.stringify(s)})`;
const wenn = (name, links) => `ifElse({ version: 2.2, config: { name: ${JSON.stringify(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: ${e(links)}, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } })`;

const START = "$('Start').first().json";
const K = `${START}.nachricht.konversation_id`;

const JS_WEG = `${LIB}
// ===== Weg bestimmen =====
const S = ${START};
const E = $('Einstellungen').first().json;
const konv = ($('Konversation laden').all().map(i => i.json)[0]) || {};
const team = $('Team-Kontakt').first().json || {};
const verlauf = $('Verlauf laden').all().map(i => i.json).filter(v => v && v.nachricht_id);
const w = wegBestimmen({ nachricht: S.nachricht, eingang: S.eingang, konv, team, testmodus: E.testmodus === true, testNummern: String(E.test_nummern || '').split(',').map(x => x.trim()).filter(Boolean), verlauf });
return [{ json: { ...w, konv, verlauf, nachricht: S.nachricht, eingang: S.eingang } }];`;

const JS_KUNDE = `${LIB}
// ===== Kunde: Begrüßung oder KI. Prompt und Wissen kommen aus kom_einstellungen (Workflow „KOM: Bot-Wissen laden“). =====
const cfg = {}; for (const i of $('Bot-Wissen laden').all()) if (i.json && i.json.schluessel) cfg[i.json.schluessel] = i.json.wert;
const PROMPT = cfg.wa_prompt, WISSEN = cfg.wa_wissen;
if (!PROMPT || !WISSEN) throw new Error('Bot-Wissen fehlt in kom_einstellungen. Workflow „KOM: Bot-Wissen laden“ ausführen.');
const W = $('Weg bestimmen').first().json;
if (W.eingang && W.eingang.erstkontakt && istKurzgruss(W.nachricht.text)) return [{ json: { nur_begruessung: true, payload: begruessung(W.wa) } }];
return [{ json: { nur_begruessung: false, body: kundenAnfrage(PROMPT, WISSEN, { nachricht: W.nachricht, eingang: W.eingang, konv: W.konv, verlauf: W.verlauf }) } }];`;

const JS_BEGRUESSUNG = `return [{ json: $('Kunde vorbereiten').first().json.payload }];`;

const JS_PRUEFEN = `${LIB}
// ===== KI-Antwort prüfen =====
const W = $('Weg bestimmen').first().json;
const r = $input.first().json || {};
const ok = Number(r.statusCode || 0) >= 200 && Number(r.statusCode || 0) < 300;
const p = antwortPruefen(ok ? r.body : null, W.wa);
if (!ok) p.meta.pruefung = 'ki_fehler_' + (r.statusCode || 'unbekannt');
return [{ json: p }];`;

const JS_TEAMFRAGE = `${LIB}
// ===== Team: Frage für den Portal-Assistenten =====
const W = $('Weg bestimmen').first().json;
const verlauf = verlaufAlsChat(W.verlauf, W.nachricht_id, 10).map(m => ({ rolle: m.role, text: m.content }));
return [{ json: { frage: textFuerKi(W.nachricht) || 'Hallo', verlauf } }];`;

const JS_TEAMANTWORT = `// ===== Team: Antwort des Portal-Assistenten für WhatsApp =====
const W = $('Weg bestimmen').first().json;
const r = $input.first().json || {};
const b = r.body || {};
let text = b.ok && b.text ? String(b.text) : (b.fehler ? String(b.fehler) : 'Der Team-Assistent konnte gerade nicht antworten. Bitte versuch es gleich noch einmal oder frag im Portal.');
text = text.replace(/\\*\\*(.+?)\\*\\*/g, '*$1*').replace(/^#+\\s*/gm, '');
if (text.length > 3500) text = text.slice(0, 3500).replace(/\\s+\\S*$/, '') + ' … (mehr im Portal-Assistenten)';
return [{ json: { art: 'team', to: W.wa, text, buttons: [], meta: { pruefung: b.ok ? 'ok' : 'fehler' } } }];`;

const JS_BEFEHL = `// ===== Team: Ansicht umgeschaltet =====
const W = $('Weg bestimmen').first().json;
const text = W.ansicht === 'kunde'
  ? 'Kundenansicht an: Du schreibst jetzt mit dem Kunden-Bot, so wie ein Interessent. Zurück zum Team-Assistenten mit /team.'
  : 'Teamansicht an: Ich beantworte deine Fragen wieder mit dem Firmenwissen aus dem Portal. Zum Testen des Kunden-Bots: /kunde.';
return [{ json: { art: 'befehl', to: W.wa, text, buttons: [], meta: {} } }];`;

const JS_SENDEN = `${LIB}
// ===== Senden vorbereiten: Antwort aus dem gelaufenen Zweig holen, Übernahme durch Menschen respektieren =====
const quellen = ['Begrüßung bauen', 'Antwort prüfen', 'Team-Antwort', 'Befehl-Antwort'];
const n = quellen.find(q => { try { return $(q).isExecuted; } catch (e) { return false; } });
if (!n) return [];
const p = $(n).first().json;
const modus = (($('Modus nochmal prüfen').all().map(i => i.json)[0]) || {}).modus;
if (p.art === 'kunde' && modus === 'mensch') return [];
return [{ json: { payload: p, wa_body: waNachricht(p) } }];`;

const JS_AUSWERTEN = `${LIB}
const V = $('Senden vorbereiten').first().json;
const v = versandAuswerten($input.first().json);
return [{ json: { ...v, payload: V.payload, typ: V.wa_body.type } }];`;

const JS_NACHBEREITUNG = `${CRM}
// ===== Nachbereitung: Konversation, Übergabe, Hinweis an Timo, Plan für die Vertriebs-Pipeline (Twenty) =====
const W = $('Weg bestimmen').first().json;
const E = $('Einstellungen').first().json;
const V = $('Versand auswerten').first().json;
const p = V.payload || {}; const m = p.meta || {};
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const name = esc(W.nachricht.kontakt_name || 'Unbekannt');
const patch = { geaendert: new Date().toISOString(), fehler: V.ok ? null : JSON.stringify(V.fehler).slice(0, 500) };
if (p.art === 'kunde') {
  if (m.marke && m.marke !== 'offen') patch.marke = m.marke;
  if (m.zusammenfassung) patch.zusammenfassung = m.zusammenfassung;
  if (m.uebergabe) patch.status = 'wartet_auf_team';
}
let telegram = '';
if (!V.ok) telegram = '⚠️ <b>WhatsApp-Antwort nicht zugestellt</b>\\nAn: ' + name + '\\nFehler: ' + esc((V.fehler && V.fehler.titel) || '');
else if (p.art === 'kunde' && m.uebergabe) telegram = '🙋 <b>WhatsApp: Mensch gewünscht</b> (' + esc(m.uebergabe_grund || 'Übergabe') + ')\\n' + name + ' · +' + esc(W.wa) + '\\nKurz: ' + esc(m.zusammenfassung || W.nachricht.text || '').slice(0, 400) + '\\nDer Bot ist für diesen Kontakt pausiert.';
else if (p.art === 'kunde' && W.eingang && W.eingang.erstkontakt) telegram = '💬 <b>Neue WhatsApp-Anfrage</b>\\n' + name + ': „' + esc(String(W.nachricht.text || '').slice(0, 200)) + '“\\nDer Bot hat geantwortet.';
// CRM: nur Kundengespräche (kein Team, kein Testmodus), eine Chance je Konversation. Fehler hier dürfen die Antwort nicht stören.
let crm;
try { crm = crmPlan({ W, E, V, p }); } catch (err) { crm = { aktion: 'nichts', grund: 'Planungsfehler: ' + String(err && err.message || err).slice(0, 200) }; }
return [{ json: { patch, uebergabe: p.art === 'kunde' && m.uebergabe === true && V.ok, telegram, hat_telegram: telegram.length > 0, crm } }];`;

// ===== Übergabe an die Vertriebs-Pipeline (Twenty CRM) =====
// Die Knoten werden als Daten beschrieben: daraus entstehen der SDK-Code (wa-antwort.workflow.gen.js)
// und die update_workflow-Operationen für den Live-Workflow (wa-antwort.crm-deploy.json).
const X = s => ({ __expr: s });            // n8n-Ausdruck
const J = js => ({ __js: js });             // Code-Knoten-Quelltext
const P = "$('Nachbereitung').first().json.crm";
const KONV_URL = X(`${SUPA}kom_konversationen?konversation_id=eq.{{ encodeURIComponent($('Weg bestimmen').first().json.konversation_id) }}`);
const BEDINGUNG = (links, operator, rechts) => ({ options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: X(links), operator, ...(rechts !== undefined ? { rightValue: rechts } : {}) }], combinator: 'and' });
const WAHR = { type: 'boolean', operation: 'true', singleValue: true };

const twentyKnoten = (v, name, method, url, body) => ({ v, name, typ: 'node', type: 'n8n-nodes-base.httpRequest', version: 4.5,
  settings: { onError: 'continueErrorOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 },
  parameters: { method, url, authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', ...(body ? { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: body } : {}), options: { timeout: 15000 } },
  credentials: CRED_OBJ.twenty });
const codeKnoten = (v, name, js, onError = 'continueErrorOutput') => ({ v, name, typ: 'node', type: 'n8n-nodes-base.code', version: 2,
  settings: { onError }, parameters: { mode: 'runOnceForAllItems', jsCode: J(js) } });
const supaPatch = (v, name) => ({ v, name, typ: 'node', type: 'n8n-nodes-base.httpRequest', version: 4.5,
  settings: { executeOnce: true, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 },
  parameters: { method: 'PATCH', url: KONV_URL, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: X('{{ JSON.stringify($json.patch) }}'), options: { timeout: 15000 } },
  credentials: CRED_OBJ.supa });
const wennKnoten = (v, name, links) => ({ v, name, typ: 'if', type: 'n8n-nodes-base.if', version: 2.2, settings: {}, parameters: { conditions: BEDINGUNG(links, WAHR), options: {} } });

const CRM_KNOTEN = [
  { v: 'crmWeiche', name: 'CRM-Übergabe?', typ: 'switch', type: 'n8n-nodes-base.switch', version: 3.2, settings: {}, parameters: { rules: { values: [
    { outputKey: 'anlegen', conditions: BEDINGUNG(`{{ ${P}.aktion }}`, { type: 'string', operation: 'equals' }, 'anlegen') },
    { outputKey: 'fortschreiben', conditions: BEDINGUNG(`{{ ${P}.aktion }}`, { type: 'string', operation: 'equals' }, 'fortschreiben') }
  ] }, options: {} } },
  // anlegen: Person per Telefonnummer suchen/anlegen → Chance der Person suchen/anlegen → Notiz mit Zusammenfassung
  twentyKnoten('crmPersonSuchen', 'Twenty: Person suchen', 'GET', X(`${TWENTY}{{ ${P}.person_pfad }}`)),
  codeKnoten('crmPersonWaehlen', 'Person wählen', `${CRM}
const PL = ${P};
return [{ json: crmPersonSchritt($input.first().json, PL.wa, PL.name, PL.person_id) }];`),
  wennKnoten('crmPersonNeu', 'Person neu?', '{{ $json.person_neu }}'),
  // nur für neue Personen (immer POST mit Body); vorhandene Personen werden nicht angefasst
  twentyKnoten('crmPersonSpeichern', 'Twenty: Person speichern', 'POST', `${TWENTY}people`, X('{{ JSON.stringify($json.body) }}')),
  codeKnoten('crmPersonUebernehmen', 'Person übernehmen', `${CRM}
const S = $('Person wählen').first().json;
return [{ json: crmPersonUebernehmen(S.person_neu ? $input.first().json : null, S.person_neu ? '' : S.person_id) }];`),
  twentyKnoten('crmChancenLaden', 'Twenty: Chancen der Person', 'GET', X(`${TWENTY}{{ $json.pfad }}`)),
  codeKnoten('crmChanceWaehlen', 'Chance wählen', `${CRM}
const PL = ${P};
const person_id = $('Person übernehmen').first().json.person_id;
return [{ json: { person_id, ...crmChanceSchritt($input.first().json, { name: PL.name, test: PL.test, person_id, jetzt: PL.jetzt }) } }];`),
  // Methode per Ausdruck, aber nur POST (neu) oder PATCH (wiedergefunden) – beide immer mit Body, nie GET
  twentyKnoten('crmChanceSpeichern', 'Twenty: Chance speichern', X('{{ $json.methode }}'), X(`${TWENTY}{{ $json.pfad }}`), X('{{ JSON.stringify($json.body) }}')),
  codeKnoten('crmNotizBauen', 'Notiz bauen', `${CRM}
const C = $('Chance wählen').first().json;
const chance_id = crmNeueId($input.first().json) || C.chance_id;
if (!chance_id) throw new Error('Twenty hat keine Chancen-ID geliefert.');
return [{ json: { chance_id, chance_neu: C.chance_neu, person_id: C.person_id, body: ${P}.notiz_body, notizen_pfad: crmNotizenPfad(chance_id) } }];`),
  // Notiz nur an eine in diesem Lauf NEU angelegte Chance; bei wiedergefundener Chance die vorhandene Bot-Notiz suchen
  wennKnoten('crmChanceNeu', 'Chance neu?', '{{ $json.chance_neu }}'),
  twentyKnoten('crmNotizAnlegen', 'Twenty: Notiz anlegen', 'POST', `${TWENTY}notes`, X('{{ JSON.stringify($json.body) }}')),
  twentyKnoten('crmNotizVerknuepfen', 'Twenty: Notiz verknüpfen', 'POST', `${TWENTY}noteTargets`, X("{{ JSON.stringify({ noteId: (Object.values($json.data || {})[0] || {}).id, targetOpportunityId: $('Notiz bauen').first().json.chance_id }) }}")),
  twentyKnoten('crmNotizenLaden', 'Twenty: Notizen der Chance', 'GET', X(`${TWENTY}{{ $json.notizen_pfad }}`)),
  codeKnoten('crmErgebnisKnoten', 'CRM-Ergebnis', `${CRM}
const B = $('Notiz bauen').first().json;
const PL = ${P};
const notiz_id = B.chance_neu ? crmNeueId($('Twenty: Notiz anlegen').first().json) : crmNotizFinden($input.first().json);
return [{ json: crmErgebnis({ person_id: B.person_id, chance_id: B.chance_id, chance_neu: B.chance_neu, notiz_id, jetzt: PL.jetzt, plan: PL }) }];`),
  supaPatch('crmStandSpeichern', 'CRM-Stand speichern'),
  wennKnoten('crmNeuPruefen', 'Neu in der Pipeline?', "{{ $('CRM-Ergebnis').first().json.neu }}"),
  { v: 'crmTelegram', name: 'Telegram: neuer Pipeline-Kontakt', typ: 'node', type: 'n8n-nodes-base.telegram', version: 1.2, settings: { onError: 'continueRegularOutput' },
    parameters: { resource: 'message', operation: 'sendMessage', chatId: X("{{ $('Einstellungen').first().json.telegram_chat }}"), text: X("{{ $('CRM-Ergebnis').first().json.telegram }}"), additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: CRED_OBJ.tg },
  // fortschreiben: vorhandene Chance (ID aus kom_konversationen) – letzter Kontakt, Notiz nur bei neuer Zusammenfassung
  twentyKnoten('crmChanceFort', 'Twenty: Chance fortschreiben', 'PATCH', X(`${TWENTY}{{ ${P}.chance_pfad }}`), X(`{{ JSON.stringify(${P}.chance_body) }}`)),
  wennKnoten('crmNotizNeu', 'Zusammenfassung neu?', `{{ ${P}.notiz_neu }}`),
  twentyKnoten('crmNotizFort', 'Twenty: Notiz fortschreiben', 'PATCH', X(`${TWENTY}{{ ${P}.notiz_pfad }}`), X(`{{ JSON.stringify(${P}.notiz_body) }}`)),
  // Fehler: in der Konversation vermerken (crm_fehler), beim nächsten Kundenkontakt neuer Versuch ohne Dublette
  codeKnoten('crmFehler', 'CRM-Fehler vermerken', `${CRM}
const PL = ${P};
const i = $input.first().json || {};
let person_id = '';
try { if ($('Person übernehmen').isExecuted) person_id = $('Person übernehmen').first().json.person_id || ''; } catch (e) {}
return [{ json: crmFehlerPatch({ aktion: PL.aktion, fehler: i.error || i.message || i, person_id }) }];`, 'continueRegularOutput'),
  supaPatch('crmFehlerSpeichern', 'CRM-Fehler speichern')
];

// [Quelle, Ausgang, Ziel] – Ausgang 1 bei Knoten mit continueErrorOutput ist der Fehlerausgang
const FEHLER = 'CRM-Fehler vermerken';
const CRM_VERBINDUNGEN = [
  ['Konversation aktualisieren', 0, 'CRM-Übergabe?'],
  ['CRM-Übergabe?', 0, 'Twenty: Person suchen'],
  ['CRM-Übergabe?', 1, 'Twenty: Chance fortschreiben'],
  ...[['Twenty: Person suchen', 'Person wählen'], ['Person wählen', 'Person neu?'], ['Twenty: Person speichern', 'Person übernehmen'],
    ['Person übernehmen', 'Twenty: Chancen der Person'], ['Twenty: Chancen der Person', 'Chance wählen'], ['Chance wählen', 'Twenty: Chance speichern'],
    ['Twenty: Chance speichern', 'Notiz bauen'], ['Notiz bauen', 'Chance neu?'], ['Twenty: Notiz anlegen', 'Twenty: Notiz verknüpfen'],
    ['Twenty: Notiz verknüpfen', 'CRM-Ergebnis'], ['Twenty: Notizen der Chance', 'CRM-Ergebnis'], ['CRM-Ergebnis', 'CRM-Stand speichern'],
    ['Twenty: Chance fortschreiben', 'Zusammenfassung neu?']]
    .flatMap(([a, b]) => [[a, 0, b], [a, 1, FEHLER]]),
  ['Person neu?', 0, 'Twenty: Person speichern'],
  ['Person neu?', 1, 'Person übernehmen'],
  ['Chance neu?', 0, 'Twenty: Notiz anlegen'],
  ['Chance neu?', 1, 'Twenty: Notizen der Chance'],
  ['Twenty: Notiz fortschreiben', 1, FEHLER],
  ['CRM-Stand speichern', 0, 'Neu in der Pipeline?'],
  ['Neu in der Pipeline?', 0, 'Telegram: neuer Pipeline-Kontakt'],
  ['Zusammenfassung neu?', 0, 'Twenty: Notiz fortschreiben'],
  [FEHLER, 0, 'CRM-Fehler speichern']
];

// --- Serialisierung: SDK-Code und n8n-JSON aus denselben Daten ---
const sdkWert = w => {
  if (w && typeof w === 'object' && '__expr' in w) return e(w.__expr);
  if (w && typeof w === 'object' && '__js' in w) return jsQuelle(w.__js);
  if (Array.isArray(w)) return '[' + w.map(sdkWert).join(', ') + ']';
  if (w && typeof w === 'object') return '{ ' + Object.entries(w).map(([k, x]) => JSON.stringify(k) + ': ' + sdkWert(x)).join(', ') + ' }';
  return JSON.stringify(w);
};
const jsonWert = w => {
  if (w && typeof w === 'object' && '__expr' in w) return '=' + w.__expr;
  if (w && typeof w === 'object' && '__js' in w) return w.__js;
  if (Array.isArray(w)) return w.map(jsonWert);
  if (w && typeof w === 'object') return Object.fromEntries(Object.entries(w).map(([k, x]) => [k, jsonWert(x)]));
  return w;
};
const knotenSdk = k => {
  const config = { name: k.name, ...k.settings, parameters: k.parameters, ...(k.credentials ? { credentials: k.credentials } : {}) };
  if (k.typ === 'if') return `ifElse({ version: ${k.version}, config: ${sdkWert(config)} })`;
  if (k.typ === 'switch') return `switchCase({ version: ${k.version}, config: ${sdkWert(config)} })`;
  return `node({ type: ${JSON.stringify(k.type)}, version: ${k.version}, config: ${sdkWert(config)} })`;
};
const knotenJson = (k, i) => ({ name: k.name, type: k.type, typeVersion: k.version, position: [4200 + 220 * (i % 14), 600 + 200 * Math.floor(i / 14)],
  parameters: jsonWert(k.parameters), ...(k.credentials ? { credentials: k.credentials } : {}) });
// onError/retry/executeOnce sind bei addNode nicht erlaubt → eigene setNodeSettings-Operation
const knotenEinstellungen = k => Object.keys(k.settings || {}).length ? [{ type: 'setNodeSettings', nodeName: k.name, settings: k.settings }] : [];
const VAR = Object.fromEntries(CRM_KNOTEN.map(k => [k.name, k.v]));
VAR['Konversation aktualisieren'] = 'konvAkt';
const TYP = Object.fromEntries(CRM_KNOTEN.map(k => [k.name, k.typ]));
const verbindungSdk = ([a, i, b], n) => {
  if (TYP[a] === 'if') {
    // beide Zweige eines If in einem Aufruf (onTrue/onFalse), nur beim ersten Vorkommen ausgeben
    if (CRM_VERBINDUNGEN.findIndex(([s]) => s === a) !== n) return '';
    return `.add(${VAR[a]}` + CRM_VERBINDUNGEN.filter(([s]) => s === a).map(([, j, z]) => `.${j === 0 ? 'onTrue' : 'onFalse'}(${VAR[z]})`).join('') + ')';
  }
  if (TYP[a] === 'switch') return '';
  if (TYP[b] === 'switch') {
    const faelle = CRM_VERBINDUNGEN.filter(([s]) => s === b).map(([, j, z]) => `.onCase(${j}, ${VAR[z]})`).join('');
    return `.add(${VAR[a]}).to(${VAR[b]}${faelle})`;
  }
  return `.add(${VAR[a]}.output(${i}).to(${VAR[b]}))`;
};
const CRM_SDK_KNOTEN = CRM_KNOTEN.map(k => `const ${k.v} = ${knotenSdk(k)};`).join('\n');
const CRM_SDK_VERBINDUNGEN = CRM_VERBINDUNGEN.map(verbindungSdk).filter(Boolean).join('\n  ');

// Geänderte bestehende Knoten (für die Deployment-Operationen)
const EINSTELLUNGEN = [
  { id: 'tm', name: 'testmodus', value: false, type: 'boolean' },
  { id: 'tn', name: 'test_nummern', value: '491737348515', type: 'string' },
  { id: 'tg', name: 'telegram_chat', value: '1535402553', type: 'string' },
  // true nur zum Testen: dann legen auch Teammitglieder (Kundenansicht /kunde) und Testmodus-Nummern eine „TEST WhatsApp: …“-Chance an
  { id: 'ct', name: 'crm_test', value: false, type: 'boolean' }
];
// select=* statt fester Spaltenliste: Der Bot läuft weiter, auch wenn die CRM-Spalten (supabase/kommunikation_crm.sql) noch fehlen
const KONV_LADEN_URL = `${SUPA}kom_konversationen?select=*&konversation_id=eq.{{ encodeURIComponent(${K}) }}`;

const sdk = `// GENERIERT von kommunikation/n8n/bauen-antwort.mjs – nicht von Hand ändern.
// KOM: WhatsApp Antwort (Workflow B). Wird von Workflow A pro neuer Kundennachricht aufgerufen (nicht wartend).
// Wege: Kunde (Begrüßung oder KI-Vertriebsassistent), Team (bestehender Portal-Assistent mit Firmenwissen, rollengerecht),
// Befehl (/kunde, /team für Teammitglieder), still (Mensch hat übernommen, Testmodus, neuere Nachricht folgt).
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus kommunikation/lib/antwort.js (getestet), in jedem Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};
// Übergabe an die Vertriebs-Pipeline aus kommunikation/lib/crm.js (getestet)
const CRM = ${JSON.stringify(CRM)};

const start = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.2, config: { name: 'Start', parameters: { inputSource: 'passthrough' } } });
const einstellungen = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: ${sdkWert(EINSTELLUNGEN)} } } } });
const sammeln = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Kurz sammeln', parameters: { resume: 'timeInterval', amount: 4, unit: 'seconds' } } });
const teamKontakt = ${supa('Team-Kontakt', 'POST', `'${SUPA}rpc/kom_team_kontakt'`, e(`{{ JSON.stringify({ p_wa: ${START}.nachricht.kontakt_extern }) }}`))};
const konvLaden = ${supa('Konversation laden', 'GET', e(KONV_LADEN_URL), null, ' alwaysOutputData: true,')};
const verlaufLaden = ${supa('Verlauf laden', 'GET', e(`${SUPA}kom_nachrichten?select=nachricht_id,richtung,absender,typ,text,zeit&order=zeit.desc&limit=25&konversation_id=eq.{{ encodeURIComponent(${K}) }}`), null, ' alwaysOutputData: true,')};
const weg = ${code('Weg bestimmen', JS_WEG, ' executeOnce: true,')};
const wegSwitch = switchCase({ version: 3.2, config: { name: 'Welcher Weg?', parameters: { rules: { values: [
  { outputKey: 'kunde', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.weg }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'kunde' }], combinator: 'and' } },
  { outputKey: 'team', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.weg }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'team' }], combinator: 'and' } },
  { outputKey: 'befehl', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.weg }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'befehl' }], combinator: 'and' } }
] }, options: {} } } });

// Kunde
const wissenLaden = ${supa('Bot-Wissen laden', 'GET', `'${SUPA}kom_einstellungen?select=schluessel,wert&schluessel=in.(wa_prompt,wa_wissen)'`, null)};
const kundeVorb = ${code('Kunde vorbereiten', JS_KUNDE)};
const nurGruss = ${wenn('Nur Begrüßung?', '{{ $json.nur_begruessung }}')};
const begruessung = ${code('Begrüßung bauen', JS_BEGRUESSUNG)};
const kiFragen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'KI fragen', parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'), options: { timeout: 90000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_OAI}, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 } });
const pruefen = ${code('Antwort prüfen', JS_PRUEFEN)};

// Team
const teamFrage = ${code('Team-Frage', JS_TEAMFRAGE)};
const teamToken = ${supa('Team-Zugang', 'POST', `'${SUPA}rpc/kom_team_token'`, e(`{{ JSON.stringify({ p_mitglied_id: $('Weg bestimmen').first().json.team.mitglied_id }) }}`))};
const teamAssistent = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Portal-Assistent fragen', parameters: { method: 'POST', url: 'https://n8n.hm-storage.de/webhook/team-assistent', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr("{{ JSON.stringify({ token: $json.token, frage: $('Team-Frage').first().json.frage, verlauf: $('Team-Frage').first().json.verlauf }) }}"), options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } } } } });
const teamAntwort = ${code('Team-Antwort', JS_TEAMANTWORT)};

// Befehl
const ansichtSetzen = ${supa('Ansicht setzen', 'PATCH', e(`${SUPA}kom_konversationen?konversation_id=eq.{{ encodeURIComponent($('Weg bestimmen').first().json.konversation_id) }}`), e(`{{ JSON.stringify({ ansicht: $('Weg bestimmen').first().json.ansicht, modus: 'ki' }) }}`))};
const befehlAntwort = ${code('Befehl-Antwort', JS_BEFEHL)};

// Gemeinsam: senden, speichern, nachbereiten
const modusPruefen = ${supa('Modus nochmal prüfen', 'GET', e(`${SUPA}kom_konversationen?select=modus&konversation_id=eq.{{ encodeURIComponent($('Weg bestimmen').first().json.konversation_id) }}`), null, ' alwaysOutputData: true,')};
const sendenVorb = ${code('Senden vorbereiten', JS_SENDEN)};
const senden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'WhatsApp senden', parameters: { method: 'POST', url: 'https://graph.facebook.com/v26.0/${PNID}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.wa_body) }}'), options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${CRED_WA}, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 } });
const auswerten = ${code('Versand auswerten', JS_AUSWERTEN)};
const speichern = ${supa('Ausgang speichern', 'POST', `'${SUPA}rpc/kom_ausgang'`, e("{{ JSON.stringify({ p: { konversation_id: $('Weg bestimmen').first().json.konversation_id, nachricht_id: $json.nachricht_id, absender: 'ki', typ: $json.typ === 'interactive' ? 'interactive' : 'text', text: $json.payload.text, medien: ($json.payload.buttons || []).length ? { buttons: $json.payload.buttons } : null, status: $json.ok ? 'gesendet' : 'fehlgeschlagen' } }) }}"), " onError: 'continueRegularOutput',")};
const nachbereitung = ${code('Nachbereitung', JS_NACHBEREITUNG)};
const konvAkt = ${supa('Konversation aktualisieren', 'PATCH', e(`${SUPA}kom_konversationen?konversation_id=eq.{{ encodeURIComponent($('Weg bestimmen').first().json.konversation_id) }}`), e('{{ JSON.stringify($json.patch) }}'), " onError: 'continueRegularOutput',")};
const uebergabe = ${wenn('Übergabe?', "{{ $('Nachbereitung').first().json.uebergabe }}")};
const pausieren = ${supa('KI pausieren', 'POST', `'${SUPA}rpc/kom_modus_setzen'`, e("{{ JSON.stringify({ p_konversation: $('Weg bestimmen').first().json.konversation_id, p_modus: 'mensch', p_wer: 'ki' }) }}"), " onError: 'continueRegularOutput',")};
const telegramNoetig = ${wenn('Hinweis an Timo?', "{{ $('Nachbereitung').first().json.hat_telegram }}")};
const telegram = node({ type: 'n8n-nodes-base.telegram', version: 1.2, config: { name: 'Telegram an Timo', onError: 'continueRegularOutput', parameters: { resource: 'message', operation: 'sendMessage', chatId: expr("{{ $('Einstellungen').first().json.telegram_chat }}"), text: expr("{{ $('Nachbereitung').first().json.telegram }}"), additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } }, credentials: ${CRED_TG} } });

// Übergabe an die Vertriebs-Pipeline (Twenty). Läuft erst NACH dem Senden; jeder Twenty-Fehler geht in „CRM-Fehler vermerken“.
${CRM_SDK_KNOTEN}

export default workflow('kom-wa-antwort', 'KOM: WhatsApp Antwort (Workflow B)')
  .add(start).to(einstellungen).to(sammeln).to(teamKontakt).to(konvLaden).to(verlaufLaden).to(weg)
  .to(wegSwitch
    .onCase(0, wissenLaden.to(kundeVorb).to(nurGruss.onTrue(begruessung.to(modusPruefen)).onFalse(kiFragen.to(pruefen).to(modusPruefen))))
    .onCase(1, teamFrage.to(teamToken).to(teamAssistent).to(teamAntwort).to(modusPruefen))
    .onCase(2, ansichtSetzen.to(befehlAntwort).to(modusPruefen)))
  .add(modusPruefen).to(sendenVorb).to(senden).to(auswerten).to(speichern).to(nachbereitung).to(konvAkt)
  .to(uebergabe.onTrue(pausieren))
  .add(konvAkt).to(telegramNoetig.onTrue(telegram))
  ${CRM_SDK_VERBINDUNGEN};
`;

// Operationen für update_workflow auf dem Live-Workflow (Workflow B, DVGX3cltu2qbqLJE): nur der Unterschied zum bisherigen Stand.
const DEPLOY = {
  workflowId: 'DVGX3cltu2qbqLJE',
  versionName: 'Übergabe WhatsApp → Vertriebs-Pipeline (Twenty)',
  hinweis: 'Erzeugt von kommunikation/n8n/bauen-antwort.mjs. Vorher supabase/kommunikation_crm.sql ausführen. Siehe KOM_Uebergabe_Pipeline_Deployment.md.',
  operations: [
    { type: 'setNodeParameter', nodeName: 'Einstellungen', path: '/assignments/assignments', value: EINSTELLUNGEN },
    { type: 'setNodeParameter', nodeName: 'Konversation laden', path: '/url', value: '=' + KONV_LADEN_URL },
    { type: 'setNodeParameter', nodeName: 'Nachbereitung', path: '/jsCode', value: JS_NACHBEREITUNG },
    ...CRM_KNOTEN.map((k, i) => ({ type: 'addNode', node: knotenJson(k, i) })),
    ...CRM_KNOTEN.flatMap(knotenEinstellungen),
    ...CRM_VERBINDUNGEN.map(([a, i, b]) => ({ type: 'addConnection', source: a, sourceIndex: i, target: b, targetIndex: 0 }))
  ]
};

export { CRM, JS_NACHBEREITUNG, CRM_KNOTEN, CRM_VERBINDUNGEN, DEPLOY, EINSTELLUNGEN, KONV_LADEN_URL, jsonWert, sdk };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeFileSync(join(hier, 'wa-antwort.workflow.gen.js'), sdk);
  writeFileSync(join(hier, 'wa-antwort.crm-deploy.json'), JSON.stringify(DEPLOY, null, 2) + '\n');
  console.log('geschrieben: kommunikation/n8n/wa-antwort.workflow.gen.js', sdk.length, 'Zeichen');
  console.log('geschrieben: kommunikation/n8n/wa-antwort.crm-deploy.json', DEPLOY.operations.length, 'Operationen');
}
