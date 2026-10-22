import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// ---------- Konfiguration (hier anpassen) ----------
const CFG = `const CFG = {
  BUCHUNG_URL: 'https://api.leadconnectorhq.com/widget/booking/vgYAcYTgqLJOE2sh0TTy', // GHL-Kalender Karsten
  MODUL1_URL: 'https://flowtimotion-cyber.github.io/N8N-Automation/unternehmer/',
  SEITE_URL: 'https://momentum-ki-akademie.de/unternehmer',
  GHL_WEBHOOK: ''             // Inbound-Webhook im GHL-Unterkonto TEMP.Akademie – Link von Timo
};`;

const pruefen = `${CFG}
const cut = (s, n) => String(s ?? '').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mailRe = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/;
const out = [];
for (const item of $input.all()) {
  const b = item.json.body ?? {};
  const aktion = cut(b.aktion, 20);
  // Bots: verstecktes Feld muss leer bleiben
  if (cut(b.website, 200)) { out.push({ json: { aktion: 'ignorieren' } }); continue; }

  if (aktion === 'lernstand') {
    const id = cut(b.teilnehmer_id, 64);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) { out.push({ json: { aktion: 'ignorieren' } }); continue; }
    const startedRaw = cut(b.gestartet, 40);
    out.push({ json: {
      aktion,
      teilnehmer_id: id, kurscode: 'OFFEN', kurs: 'Unternehmer Modul 1', name: cut(b.name, 80),
      level_fertig: Number(b.level_fertig) || 0,
      fortschritt_prozent: Math.max(0, Math.min(100, Number(b.fortschritt_prozent) || 0)),
      xp: Number(b.xp) || 0,
      check_best: b.check_best == null ? null : Number(b.check_best),
      check_bestanden: b.check_bestanden === true,
      check_versuche: Number(b.check_versuche) || 0,
      check_fehler: cut(b.check_fehler, 2000),
      aktueller_schritt: cut(b.aktueller_schritt, 120),
      levels_liste: cut(b.levels_liste, 120),
      gestartet: startedRaw && !isNaN(Date.parse(startedRaw)) ? new Date(startedRaw).toISOString() : new Date().toISOString(),
      steckbrief_ausloeser: cut((b.steckbrief || [])[0], 1500), steckbrief_schritte: cut((b.steckbrief || [])[1], 1500),
      steckbrief_tools: cut((b.steckbrief || [])[2], 1500), steckbrief_ergebnis: cut((b.steckbrief || [])[3], 1500),
      steckbrief_fehlerfall: cut((b.steckbrief || [])[4], 1500),
      zuletzt_aktiv: new Date().toISOString()
    } });
    continue;
  }

  if (aktion === 'loeschen') {
    const id = cut(b.teilnehmer_id, 64);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) { out.push({ json: { aktion: 'ungueltig' } }); continue; }
    out.push({ json: { aktion, teilnehmer_id: id, kurs: 'Unternehmer Modul 1' } });
    continue;
  }

  if (aktion === 'check') {
    const email = cut(b.email, 200).toLowerCase();
    const vorname = cut(b.vorname, 60), nachname = cut(b.nachname, 60);
    if (!mailRe.test(email) || vorname.length < 2 || b.einwilligung !== true) { out.push({ json: { aktion: 'ungueltig' } }); continue; }
    const A = b.antworten && typeof b.antworten === 'object' ? b.antworten : {};
    const a = k => cut(A[k], 40);
    // Bewertung je Frage: ok / klaeren / nein
    const bew = {
      angestellt: { ja: 'ok', teils: 'klaeren', nein: 'nein' }[a('angestellt')] || 'klaeren',
      abschluss: { ja: 'ok', nein: 'klaeren', unsicher: 'klaeren' }[a('abschluss')] || 'klaeren',
      sperrfrist: { nein: 'ok', ja: 'nein', unsicher: 'klaeren' }[a('sperrfrist')] || 'klaeren',
      arbeitszeit: { ja: 'ok', teils: 'ok', nein: 'klaeren' }[a('arbeitszeit')] || 'klaeren',
      begonnen: { nein: 'ok', ja: 'nein' }[a('begonnen')] || 'klaeren'
    };
    const werte = Object.values(bew);
    const ergebnis = werte.includes('nein') ? 'eher_nicht' : (werte.includes('klaeren') ? 'klaeren' : 'passt');
    const groesse = a('groesse');
    const quote = { 'unter_50': ['bis zu 100 %', '75 %'], '50_499': ['50 %', '50 %'], 'ab_500': ['25 %', '25 %'] }[groesse] || ['je nach Betriebsgröße', 'je nach Betriebsgröße'];
    const groesseTxt = { 'unter_50': 'unter 50', '50_499': '50 bis 499', 'ab_500': '500 oder mehr' }[groesse] || 'unbekannt';
    const personen = ({ '1': '1', '2-5': '2–5', '6+': '6 oder mehr' })[cut(A.personen, 20)] || 'unbekannt';
    const titel = { passt: 'Das sieht gut aus', klaeren: 'Ein, zwei Punkte klären wir kurz', eher_nicht: 'Über das QCG passt es eher nicht' }[ergebnis];
    const satz = {
      passt: 'Nach deinen Angaben kommt eine Förderung über das Qualifizierungschancengesetz (§ 82 SGB III) in Frage. Die Entscheidung trifft die Agentur für Arbeit.',
      klaeren: 'Nach deinen Angaben ist eine Förderung möglich, ein paar Punkte klären wir am besten kurz im Gespräch.',
      eher_nicht: 'Nach deinen Angaben passt eine Förderung über das Qualifizierungschancengesetz eher nicht. Gern schauen wir gemeinsam, welche anderen Wege es gibt.'
    }[ergebnis];
    const fragenTxt = {
      angestellt: 'Sozialversicherungspflichtig angestellt', abschluss: 'Berufsabschluss vor mind. 2 Jahren', sperrfrist: 'In den letzten 2 Jahren schon gefördert',
      arbeitszeit: 'Lernen in der Arbeitszeit möglich', begonnen: 'Weiterbildung schon begonnen', groesse: 'Betriebsgröße', personen: 'Zu schulende Mitarbeiter'
    };
    const LBL = { ja: 'Ja', nein: 'Nein', teils: 'Teilweise', unsicher: 'Weiß nicht', unter_50: 'unter 50', '50_499': '50–499', ab_500: '500 oder mehr', '1': '1', '2-5': '2–5', '6+': '6 oder mehr' };
    const antwortZeilen = Object.keys(fragenTxt).map(k => fragenTxt[k] + ': ' + (LBL[cut(A[k], 40)] || cut(A[k], 40) || '–'));
    const q = b.quelle && typeof b.quelle === 'object' ? b.quelle : {};
    const quelle = ['utm_source', 'utm_medium', 'utm_campaign'].map(k => cut(q[k], 60)).filter(Boolean).join(' / ') || 'direkt';
    const tel = cut(b.telefon, 40).replace(/[^0-9+()\\-\\/\\s]/g, '');
    const firma = cut(b.firma, 120);
    const name = (vorname + ' ' + nachname).trim();
    const termin = CFG.BUCHUNG_URL
      ? '<p><a href="' + CFG.BUCHUNG_URL + '" style="display:inline-block;background:#7B3FE4;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold">Kostenloses Gespräch mit Karsten buchen</a></p>'
      : '<p>Karsten aus unserem Team meldet sich in den nächsten Tagen bei dir, um ein kurzes Gespräch zu vereinbaren.</p>';
    const html = '<div style="font-family:Arial,sans-serif;max-width:620px;color:#14123A">' +
      '<div style="height:4px;background:linear-gradient(90deg,#9B4DF0,#5B6EE6 55%,#22B3B0);margin-bottom:18px"></div>' +
      '<p>Hallo ' + esc(vorname) + ',</p><p>danke für deinen Förder-Check. Hier ist dein Ergebnis:</p>' +
      '<h2 style="color:#7B3FE4;font-size:20px">' + esc(titel) + '</h2><p>' + esc(satz) + '</p>' +
      '<p>Bei <b>' + esc(groesseTxt) + '</b> Beschäftigten übernimmt die Agentur für Arbeit in der Regel <b>' + esc(quote[0]) + '</b> der Kurskosten und zahlt einen Zuschuss von <b>' + esc(quote[1]) + '</b> zum Gehalt für die Lernzeit. Voraussetzung: Der Antrag wird vor Kursbeginn gestellt.</p>' +
      '<h3 style="font-size:16px">Der nächste Schritt</h3><p>Im kostenlosen und unverbindlichen Gespräch prüfen wir gemeinsam, ob die Förderung für dein Team passt, und bereiten den Antrag auf den Bildungsgutschein vor.</p>' + termin +
      '<p>Bis dahin: In <a href="' + CFG.MODUL1_URL + '">Modul 1 „Die volle Tasse“</a> verstehst du in 20 Minuten, was KI-Agenten in deinem Betrieb übernehmen können.</p>' +
      '<p style="color:#62607E;font-size:13px;border-top:1px solid #DFDDEC;padding-top:12px">Momentum KI Akademie · Die geförderten Kurse laufen 2026 über unseren AZAV-zugelassenen Partner TEMP.Akademie, ab Januar 2027 über die Momentum KI Akademie. Ob und in welcher Höhe gefördert wird, entscheidet allein die Agentur für Arbeit. Du kannst der Nutzung deiner Daten jederzeit per Antwort auf diese Mail widersprechen.</p></div>';
    out.push({ json: {
      aktion, ergebnis, titel, satz, quote_kurs: quote[0], quote_gehalt: quote[1],
      vorname, nachname, name, email, telefon: tel, firma, groesse: groesseTxt, personen, quelle,
      antworten_text: antwortZeilen.join('\\n'),
      nachricht: titel + '\\n' + antwortZeilen.join('\\n') + '\\nQuelle: ' + quelle,
      mail_betreff: 'Dein Förder-Check: ' + titel,
      mail_html: html,
      ghl_url: CFG.GHL_WEBHOOK,
      eingegangen: new Date().toISOString()
    } });
    continue;
  }
  out.push({ json: { aktion: 'ungueltig' } });
}
return out;`;

const personVorbereiten = `const d = $('Prüfen und aufbereiten').item.json;
const res = $json.data || [];
const people = (res.people || (res.data && res.data.people) || []);
const found = Array.isArray(people) && people.length ? people[0] : null;
let phone = d.telefon.replace(/[^0-9+]/g, '');
let code = '+49', country = 'DE';
if (phone.startsWith('+43')) { code = '+43'; country = 'AT'; phone = phone.slice(3); }
else if (phone.startsWith('+41')) { code = '+41'; country = 'CH'; phone = phone.slice(3); }
else if (phone.startsWith('+49')) { phone = phone.slice(3); }
else if (phone.startsWith('0')) { phone = phone.slice(1); }
const body = { name: { firstName: d.vorname, lastName: d.nachname }, emails: { primaryEmail: d.email } };
if (phone) body.phones = { primaryPhoneNumber: phone, primaryPhoneCallingCode: code, primaryPhoneCountryCode: country };
return [{ json: { methode: found ? 'PATCH' : 'POST', pfad: found ? 'people/' + found.id : 'people', body, person_id: found ? found.id : '' } }];`;

const chanceVorbereiten = `const d = $('Prüfen und aufbereiten').item.json;
const prev = $('Person vorbereiten').item.json;
let id = prev.person_id;
try { if (!id) { const v = Object.values($json.data || {})[0]; id = v && v.id; } } catch (e) {}
const morgen = new Date(Date.now() + 24 * 3600 * 1000); morgen.setUTCHours(7, 0, 0, 0);
const body = { name: 'Förder-Check: ' + (d.firma || d.name) + ' (' + d.name + ')', stage: 'NEW', eingangAm: d.eingegangen, naechsterFollowup: morgen.toISOString() };
if (id) body.pointOfContactId = id;
return [{ json: { person_id: id || '', body } }];`;

const notizVorbereiten = `const d = $('Prüfen und aufbereiten').item.json;
let oid = '';
try { const v = Object.values($json.data || {})[0]; oid = v && v.id; } catch (e) {}
const md = '**Förder-Check Unternehmer (Leadmagnet)**\\n\\nErgebnis: ' + d.titel + '\\n\\n' + d.antworten_text.split('\\n').map(z => '- ' + z).join('\\n') +
  '\\n\\nFirma: ' + (d.firma || '–') + '\\nQuelle: ' + d.quelle + '\\nNächster Schritt: Beratungsgespräch mit Karsten, Antrag Bildungsgutschein (QCG).';
return [{ json: { opp_id: oid, body: { title: 'Förder-Check: ' + d.titel, bodyV2: { markdown: md } } } }];`;

const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Leadmagnet empfangen', parameters: {
  httpMethod: 'POST', path: 'lm-unternehmer', responseMode: 'responseNode', options: { allowedOrigins: '*' } } } });

const pruefe = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prüfen und aufbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: pruefen } } });

const cond = (v) => ({ options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: v }], combinator: 'and' });
const weiche = switchCase({ version: 3.2, config: { name: 'Welche Aktion?', parameters: { mode: 'rules', rules: { values: [
  { conditions: cond('check'), renameOutput: true, outputKey: 'Förder-Check' },
  { conditions: cond('lernstand'), renameOutput: true, outputKey: 'Lernstand' } ] },
  options: { fallbackOutput: 'extra', renameFallbackOutput: 'Ungültig' } } } });

const anfrageSpeichern = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'In Kurs-Anfragen speichern', parameters: {
  resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'KSj3gpnV3CIDUslg' },
  columns: { mappingMode: 'defineBelow', value: {
    typ: 'foerdercheck', kurs: 'Leadmagnet Unternehmer', name: expr('{{ $json.name }}'), email: expr('{{ $json.email }}'), firma: expr('{{ $json.firma }}'),
    telefon: expr('{{ $json.telefon }}'), mitarbeitende: expr('{{ $json.groesse }}'), nachricht: expr('{{ $json.nachricht }}'), status: 'neu', eingegangen: expr('{{ $json.eingegangen }}') },
    matchingColumns: [], schema: [] } } } });

const antwortCheck = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Ergebnis zurückgeben', parameters: {
  respondWith: 'json', responseBody: expr("{{ JSON.stringify({ ok: true, ergebnis: $('Prüfen und aufbereiten').item.json.ergebnis, titel: $('Prüfen und aufbereiten').item.json.titel, satz: $('Prüfen und aufbereiten').item.json.satz, quote_kurs: $('Prüfen und aufbereiten').item.json.quote_kurs, quote_gehalt: $('Prüfen und aufbereiten').item.json.quote_gehalt }) }}") } } });

const twentyHttp = (name, method, url, body) => node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method, url, authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
  sendBody: body ? true : false, specifyBody: 'json', jsonBody: body || '', options: { response: { response: { fullResponse: false } } } },
  credentials: { httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } } } });

const personSuchen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Twenty: Person suchen', onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: expr("https://twenty.hm-storage.de/rest/people?limit=1&filter=emails.primaryEmail[eq]:{{ encodeURIComponent('\"' + $('Prüfen und aufbereiten').item.json.email + '\"') }}"),
  authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', options: {} },
  credentials: { httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } } } });
const personPrep = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Person vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: personVorbereiten } } });
const personSpeichern = twentyHttp('Twenty: Person speichern', expr('{{ $json.methode }}'), expr("https://twenty.hm-storage.de/rest/{{ $json.pfad }}"), expr('{{ JSON.stringify($json.body) }}'));
const chancePrep = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Chance vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: chanceVorbereiten } } });
const chanceAnlegen = twentyHttp('Twenty: Chance anlegen', 'POST', 'https://twenty.hm-storage.de/rest/opportunities', expr('{{ JSON.stringify($json.body) }}'));
const notizPrep = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Notiz vorbereiten', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: notizVorbereiten } } });
const notizAnlegen = twentyHttp('Twenty: Notiz anlegen', 'POST', 'https://twenty.hm-storage.de/rest/notes', expr('{{ JSON.stringify($json.body) }}'));
const notizVerknuepfen = twentyHttp('Twenty: Notiz verknüpfen', 'POST', 'https://twenty.hm-storage.de/rest/noteTargets',
  expr("{{ JSON.stringify({ noteId: (Object.values($json.data || {})[0] || {}).id, targetOpportunityId: $('Notiz vorbereiten').item.json.opp_id }) }}"));

const telegram = node({ type: 'n8n-nodes-base.telegram', version: 1.2, config: { name: 'Telegram an Timo', onError: 'continueRegularOutput', parameters: {
  resource: 'message', operation: 'sendMessage', chatId: '1535402553',
  text: expr("🟣 <b>Neuer Förder-Check (Unternehmer)</b>\n{{ $('Prüfen und aufbereiten').item.json.name }} · {{ $('Prüfen und aufbereiten').item.json.firma || '–' }}\nErgebnis: <b>{{ $('Prüfen und aufbereiten').item.json.titel }}</b>\nBetrieb: {{ $('Prüfen und aufbereiten').item.json.groesse }} Beschäftigte · zu schulen: {{ $('Prüfen und aufbereiten').item.json.personen }}\nTel.: {{ $('Prüfen und aufbereiten').item.json.telefon || '–' }} · {{ $('Prüfen und aufbereiten').item.json.email }}\nQuelle: {{ $('Prüfen und aufbereiten').item.json.quelle }}\n→ Steht im Team-Portal unter Vertrieb (Stufe „Kein Termin“)."),
  additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
  credentials: { telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } } } });

const mail = node({ type: 'n8n-nodes-base.emailSend', version: 2.1, config: { name: 'Ergebnis per Mail', onError: 'continueRegularOutput', parameters: {
  resource: 'email', operation: 'send', fromEmail: 'Momentum KI Akademie <info@momentum-ki-akademie.de>',
  toEmail: expr("{{ $('Prüfen und aufbereiten').item.json.email }}"), subject: expr("{{ $('Prüfen und aufbereiten').item.json.mail_betreff }}"),
  emailFormat: 'html', html: expr("{{ $('Prüfen und aufbereiten').item.json.mail_html }}"), options: { appendAttribution: false, replyTo: 'info@momentum-ki-akademie.de' } },
  credentials: { smtp: { id: 'SK15qLpQaPey2axD', name: 'SMTP-info@momentum-ki-akademie.de' } } } });

const ghlGesetzt = ifElse({ version: 2.2, config: { name: 'GHL-Webhook eingetragen?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
  conditions: [{ leftValue: expr("{{ $('Prüfen und aufbereiten').item.json.ghl_url }}"), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } } } });
const anGhl = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'An GHL (TEMP) weitergeben', onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: expr("{{ $('Prüfen und aufbereiten').item.json.ghl_url }}"), sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ vorname: $('Prüfen und aufbereiten').item.json.vorname, nachname: $('Prüfen und aufbereiten').item.json.nachname, email: $('Prüfen und aufbereiten').item.json.email, telefon: $('Prüfen und aufbereiten').item.json.telefon, firma: $('Prüfen und aufbereiten').item.json.firma, ergebnis: $('Prüfen und aufbereiten').item.json.ergebnis, betriebsgroesse: $('Prüfen und aufbereiten').item.json.groesse, personen: $('Prüfen und aufbereiten').item.json.personen, quelle: $('Prüfen und aufbereiten').item.json.quelle, tag: 'leadmagnet-unternehmer' }) }}"), options: {} } } });

const lernstandSpeichern = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'In Lernstand speichern', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'id', value: 'MeOCvarlfcZRze07' }, matchType: 'allConditions',
  filters: { conditions: [{ condition: 'eq', keyName: 'teilnehmer_id', keyValue: expr('{{ $json.teilnehmer_id }}') }, { condition: 'eq', keyName: 'kurs', keyValue: expr('{{ $json.kurs }}') }] },
  columns: { mappingMode: 'defineBelow', matchingColumns: ['teilnehmer_id', 'kurs'], schema: [], value: {
    teilnehmer_id: expr('{{ $json.teilnehmer_id }}'), kurs: expr('{{ $json.kurs }}'), kurscode: expr('{{ $json.kurscode }}'), name: expr('{{ $json.name }}'),
    level_fertig: expr('{{ $json.level_fertig }}'), fortschritt_prozent: expr('{{ $json.fortschritt_prozent }}'), xp: expr('{{ $json.xp }}'),
    check_best: expr('{{ $json.check_best }}'), check_bestanden: expr('{{ $json.check_bestanden }}'), check_versuche: expr('{{ $json.check_versuche }}'),
    check_fehler: expr('{{ $json.check_fehler }}'), aktueller_schritt: expr('{{ $json.aktueller_schritt }}'), levels_liste: expr('{{ $json.levels_liste }}'),
    gestartet: expr('{{ $json.gestartet }}'), steckbrief_ausloeser: expr('{{ $json.steckbrief_ausloeser }}'), steckbrief_schritte: expr('{{ $json.steckbrief_schritte }}'),
    steckbrief_tools: expr('{{ $json.steckbrief_tools }}'), steckbrief_ergebnis: expr('{{ $json.steckbrief_ergebnis }}'), steckbrief_fehlerfall: expr('{{ $json.steckbrief_fehlerfall }}'),
    zuletzt_aktiv: expr('{{ $json.zuletzt_aktiv }}') } } } } });
const antwortOk = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'OK zurückgeben', parameters: { respondWith: 'json', responseBody: '{"ok":true}' } } });
const antwortFehler = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Ungültig zurückgeben', parameters: { respondWith: 'json', responseBody: '{"ok":false}', options: { responseCode: 400 } } } });

export default workflow('lm-unternehmer', 'LEADMAGNET: Unternehmer (Förder-Check, Lernstand)')
  .add(webhook)
  .to(pruefe)
  .to(weiche
    .onCase(0, anfrageSpeichern.to(antwortCheck.to(personSuchen.to(personPrep.to(personSpeichern.to(chancePrep.to(chanceAnlegen.to(notizPrep.to(notizAnlegen.to(notizVerknuepfen.to(telegram.to(mail.to(ghlGesetzt.onTrue(anGhl))))))))))))))
    .onCase(1, lernstandSpeichern.to(antwortOk))
    .onCase(2, antwortFehler));
