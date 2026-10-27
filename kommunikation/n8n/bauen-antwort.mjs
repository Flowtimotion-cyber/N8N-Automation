// Baut die n8n-SDK-Datei für „KOM: WhatsApp Antwort (Workflow B)“.
// Start: node kommunikation/n8n/bauen-antwort.mjs → kommunikation/n8n/wa-antwort.workflow.gen.js
// Eingebettet werden: kommunikation/lib/antwort.js (getestet), agent/systemprompt.md (ab „---“), agent/wissen.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = p => readFileSync(join(hier, '..', p), 'utf8');
const LIB = lies('lib/antwort.js').replace(/^export /gm, '');

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const PNID = '1412160901975864';
const CRED_SUPA = "{ supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } }";
const CRED_WA = "{ httpHeaderAuth: { id: 'oDj3WB8KAgr3AgTy', name: 'Header Auth account 2' } }";
const CRED_OAI = "{ openAiApi: { id: 'rkuYTCGaH7Maoaf2', name: 'OpenAI account' } }";
const CRED_TG = "{ telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } }";

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
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

const JS_NACHBEREITUNG = `// ===== Nachbereitung: Konversation, Übergabe, Hinweis an Timo =====
const W = $('Weg bestimmen').first().json;
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
return [{ json: { patch, uebergabe: p.art === 'kunde' && m.uebergabe === true && V.ok, telegram, hat_telegram: telegram.length > 0 } }];`;

const sdk = `// GENERIERT von kommunikation/n8n/bauen-antwort.mjs – nicht von Hand ändern.
// KOM: WhatsApp Antwort (Workflow B). Wird von Workflow A pro neuer Kundennachricht aufgerufen (nicht wartend).
// Wege: Kunde (Begrüßung oder KI-Vertriebsassistent), Team (bestehender Portal-Assistent mit Firmenwissen, rollengerecht),
// Befehl (/kunde, /team für Teammitglieder), still (Mensch hat übernommen, Testmodus, neuere Nachricht folgt).
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus kommunikation/lib/antwort.js (getestet), in jedem Code-Knoten vorangestellt
const LIB = ${JSON.stringify(LIB)};

const start = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.2, config: { name: 'Start', parameters: { inputSource: 'passthrough' } } });
const einstellungen = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'tm', name: 'testmodus', value: false, type: 'boolean' },
  { id: 'tn', name: 'test_nummern', value: '491737348515', type: 'string' },
  { id: 'tg', name: 'telegram_chat', value: '1535402553', type: 'string' }
] } } } });
const sammeln = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Kurz sammeln', parameters: { resume: 'timeInterval', amount: 4, unit: 'seconds' } } });
const teamKontakt = ${supa('Team-Kontakt', 'POST', `'${SUPA}rpc/kom_team_kontakt'`, e(`{{ JSON.stringify({ p_wa: ${START}.nachricht.kontakt_extern }) }}`))};
const konvLaden = ${supa('Konversation laden', 'GET', e(`${SUPA}kom_konversationen?select=modus,ansicht,marke,status,begruesst_am&konversation_id=eq.{{ encodeURIComponent(${K}) }}`), null, ' alwaysOutputData: true,')};
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

export default workflow('kom-wa-antwort', 'KOM: WhatsApp Antwort (Workflow B)')
  .add(start).to(einstellungen).to(sammeln).to(teamKontakt).to(konvLaden).to(verlaufLaden).to(weg)
  .to(wegSwitch
    .onCase(0, wissenLaden.to(kundeVorb).to(nurGruss.onTrue(begruessung.to(modusPruefen)).onFalse(kiFragen.to(pruefen).to(modusPruefen))))
    .onCase(1, teamFrage.to(teamToken).to(teamAssistent).to(teamAntwort).to(modusPruefen))
    .onCase(2, ansichtSetzen.to(befehlAntwort).to(modusPruefen)))
  .add(modusPruefen).to(sendenVorb).to(senden).to(auswerten).to(speichern).to(nachbereitung).to(konvAkt)
  .to(uebergabe.onTrue(pausieren))
  .add(konvAkt).to(telegramNoetig.onTrue(telegram));
`;
writeFileSync(join(hier, 'wa-antwort.workflow.gen.js'), sdk);
console.log('geschrieben: kommunikation/n8n/wa-antwort.workflow.gen.js', sdk.length, 'Zeichen');
