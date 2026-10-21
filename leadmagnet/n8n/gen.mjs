// Erzeugt SDK-Code ohne Hilfsfunktionen (n8n-SDK erlaubt keine Arrow-Funktionen)
import fs from 'fs';
const src = fs.readFileSync('lm-unternehmer.workflow.js', 'utf8');
// jsCode-Blöcke aus der Quelldatei holen
const grab = (name) => { const m = src.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;')); return m[1]; };
const CFG = grab('CFG');
const pruefen = grab('pruefen').replace('${CFG}', CFG);
const personVorbereiten = grab('personVorbereiten'), chanceVorbereiten = grab('chanceVorbereiten'), notizVorbereiten = grab('notizVorbereiten');
const unesc = s => s.replace(/\\\\/g, '\\'); // Template-Literal-Escapes auflösen
const P = "$('Prüfen und aufbereiten').item.json";
const TW = { httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } };
const cond = v => ({ options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.aktion }}', operator: { type: 'string', operation: 'equals' }, rightValue: v }], combinator: 'and' });
const http = (name, method, url, body, extra = {}) => ({ name, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: Object.assign({ method, url, authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', options: {} }, body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}), credentials: TW, ...extra });
const N = {
  webhook: ['trigger', 'n8n-nodes-base.webhook', 2.1, { name: 'Leadmagnet empfangen', parameters: { httpMethod: 'POST', path: 'lm-unternehmer', responseMode: 'responseNode', options: { allowedOrigins: '*' } } }],
  pruefe: ['node', 'n8n-nodes-base.code', 2, { name: 'Prüfen und aufbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: unesc(pruefen) } }],
  weiche: ['switchCase', null, 3.2, { name: 'Welche Aktion?', parameters: { mode: 'rules', rules: { values: [{ conditions: cond('check'), renameOutput: true, outputKey: 'Förder-Check' }, { conditions: cond('lernstand'), renameOutput: true, outputKey: 'Lernstand' }, { conditions: cond('loeschen'), renameOutput: true, outputKey: 'Löschen' }] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'Ungültig' } } }],
  anfrage: ['node', 'n8n-nodes-base.dataTable', 1.1, { name: 'In Kurs-Anfragen speichern', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'KSj3gpnV3CIDUslg' }, columns: { mappingMode: 'defineBelow', matchingColumns: [], schema: [], value: { typ: 'foerdercheck', kurs: 'Leadmagnet Unternehmer', name: '={{ $json.name }}', email: '={{ $json.email }}', firma: '={{ $json.firma }}', telefon: '={{ $json.telefon }}', mitarbeitende: '={{ $json.groesse }}', nachricht: '={{ $json.nachricht }}', status: 'neu', eingegangen: '={{ $json.eingegangen }}' } } } }],
  antwortCheck: ['node', 'n8n-nodes-base.respondToWebhook', 1.5, { name: 'Ergebnis zurückgeben', parameters: { respondWith: 'json', responseBody: `={{ JSON.stringify({ ok: true, ergebnis: ${P}.ergebnis, titel: ${P}.titel, satz: ${P}.satz, quote_kurs: ${P}.quote_kurs, quote_gehalt: ${P}.quote_gehalt }) }}` } }],
  personSuchen: ['node', 'n8n-nodes-base.httpRequest', 4.2, http('Twenty: Person suchen', 'GET', `=https://twenty.hm-storage.de/rest/people?limit=1&filter=emails.primaryEmail[eq]:{{ encodeURIComponent('"' + ${P}.email + '"') }}`)],
  personPrep: ['node', 'n8n-nodes-base.code', 2, { name: 'Person vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: unesc(personVorbereiten) } }],
  personSpeichern: ['node', 'n8n-nodes-base.httpRequest', 4.2, http('Twenty: Person speichern', '={{ $json.methode }}', '=https://twenty.hm-storage.de/rest/{{ $json.pfad }}', '={{ JSON.stringify($json.body) }}')],
  chancePrep: ['node', 'n8n-nodes-base.code', 2, { name: 'Chance vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: unesc(chanceVorbereiten) } }],
  chance: ['node', 'n8n-nodes-base.httpRequest', 4.2, http('Twenty: Chance anlegen', 'POST', 'https://twenty.hm-storage.de/rest/opportunities', '={{ JSON.stringify($json.body) }}')],
  notizPrep: ['node', 'n8n-nodes-base.code', 2, { name: 'Notiz vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: unesc(notizVorbereiten) } }],
  notiz: ['node', 'n8n-nodes-base.httpRequest', 4.2, http('Twenty: Notiz anlegen', 'POST', 'https://twenty.hm-storage.de/rest/notes', '={{ JSON.stringify($json.body) }}')],
  notizLink: ['node', 'n8n-nodes-base.httpRequest', 4.2, http('Twenty: Notiz verknüpfen', 'POST', 'https://twenty.hm-storage.de/rest/noteTargets', "={{ JSON.stringify({ noteId: (Object.values($json.data || {})[0] || {}).id, targetOpportunityId: $('Notiz vorbereiten').item.json.opp_id }) }}")],
  telegram: ['node', 'n8n-nodes-base.telegram', 1.2, { name: 'Telegram an Timo', onError: 'continueRegularOutput', parameters: { resource: 'message', operation: 'sendMessage', chatId: '1535402553', text: `=🟣 <b>Neuer Förder-Check (Unternehmer)</b>\n{{ ${P}.name }} · {{ ${P}.firma || '–' }}\nErgebnis: <b>{{ ${P}.titel }}</b>\nBetrieb: {{ ${P}.groesse }} Beschäftigte · zu schulen: {{ ${P}.personen }}\nTel.: {{ ${P}.telefon || '–' }} · {{ ${P}.email }}\nQuelle: {{ ${P}.quelle }}\n→ Steht im Team-Portal unter Vertrieb (Stufe „Kein Termin“).`, additionalFields: { appendAttribution: false, parse_mode: 'HTML' } }, credentials: { telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } } }],
  mail: ['node', 'n8n-nodes-base.emailSend', 2.1, { name: 'Ergebnis per Mail', onError: 'continueRegularOutput', parameters: { resource: 'email', operation: 'send', fromEmail: 'Momentum KI Akademie <hermetikm@gmail.com>', toEmail: `={{ ${P}.email }}`, subject: `={{ ${P}.mail_betreff }}`, emailFormat: 'html', html: `={{ ${P}.mail_html }}`, options: { appendAttribution: false, replyTo: 'hermetikm@gmail.com' } }, credentials: { smtp: { id: 'AmekA6FZj4ee7KiO', name: 'SMTP account' } } }],
  ghlIf: ['ifElse', null, 2.2, { name: 'GHL-Webhook eingetragen?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: `={{ ${P}.ghl_url }}`, operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } } }],
  ghl: ['node', 'n8n-nodes-base.httpRequest', 4.2, { name: 'An GHL (TEMP) weitergeben', onError: 'continueRegularOutput', parameters: { method: 'POST', url: `={{ ${P}.ghl_url }}`, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ vorname: ${P}.vorname, nachname: ${P}.nachname, email: ${P}.email, telefon: ${P}.telefon, firma: ${P}.firma, ergebnis: ${P}.ergebnis, betriebsgroesse: ${P}.groesse, personen: ${P}.personen, quelle: ${P}.quelle, tag: 'leadmagnet-unternehmer' }) }}`, options: {} } }],
  lernstand: ['node', 'n8n-nodes-base.dataTable', 1.1, { name: 'In Lernstand speichern', parameters: { resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'id', value: 'MeOCvarlfcZRze07' }, matchType: 'allConditions', filters: { conditions: [{ condition: 'eq', keyName: 'teilnehmer_id', keyValue: '={{ $json.teilnehmer_id }}' }, { condition: 'eq', keyName: 'kurs', keyValue: '={{ $json.kurs }}' }] }, columns: { mappingMode: 'defineBelow', matchingColumns: ['teilnehmer_id', 'kurs'], schema: [], value: Object.fromEntries(['teilnehmer_id','kurs','kurscode','name','level_fertig','fortschritt_prozent','xp','check_best','check_bestanden','check_versuche','check_fehler','aktueller_schritt','levels_liste','gestartet','steckbrief_ausloeser','steckbrief_schritte','steckbrief_tools','steckbrief_ergebnis','steckbrief_fehlerfall','zuletzt_aktiv'].map(k => [k, '={{ $json.' + k + ' }}'])) } } }],
  loeschen: ['node', 'n8n-nodes-base.dataTable', 1.1, { name: 'Lernstand löschen', alwaysOutputData: true, executeOnce: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'id', value: 'MeOCvarlfcZRze07' }, matchType: 'allConditions', filters: { conditions: [{ condition: 'eq', keyName: 'teilnehmer_id', keyValue: '={{ $json.teilnehmer_id }}' }, { condition: 'eq', keyName: 'kurs', keyValue: 'Unternehmer Modul 1' }] } } }],
  okLoeschen: ['node', 'n8n-nodes-base.respondToWebhook', 1.5, { name: 'Löschen bestätigen', parameters: { respondWith: 'json', responseBody: '{"ok":true}' } }],
  ok: ['node', 'n8n-nodes-base.respondToWebhook', 1.5, { name: 'OK zurückgeben', parameters: { respondWith: 'json', responseBody: '{"ok":true}' } }],
  bad: ['node', 'n8n-nodes-base.respondToWebhook', 1.5, { name: 'Ungültig zurückgeben', parameters: { respondWith: 'json', responseBody: '{"ok":false}', options: { responseCode: 400 } } }]
};
let out = "import { workflow, node, trigger, ifElse, switchCase } from '@n8n/workflow-sdk';\n\n";
for (const [k, [kind, type, version, config]] of Object.entries(N)) {
  if (kind === 'switchCase' || kind === 'ifElse') out += `const ${k} = ${kind}({ version: ${version}, config: ${JSON.stringify(config)} });\n`;
  else out += `const ${k} = ${kind}({ type: '${type}', version: ${version}, config: ${JSON.stringify(config)} });\n`;
}
out += `\nexport default workflow('lm-unternehmer', 'LEADMAGNET: Unternehmer (Förder-Check, Lernstand)')
  .add(webhook)
  .to(pruefe)
  .to(weiche
    .onCase(0, anfrage.to(antwortCheck.to(personSuchen.to(personPrep.to(personSpeichern.to(chancePrep.to(chance.to(notizPrep.to(notiz.to(notizLink.to(telegram.to(mail.to(ghlIf.onTrue(ghl))))))))))))))
    .onCase(1, lernstand.to(ok))
    .onCase(2, loeschen.to(okLoeschen))
    .onCase(3, bad));
`;
fs.writeFileSync('lm-unternehmer.sdk.js', out);
console.log(out.length);
