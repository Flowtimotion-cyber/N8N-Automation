// Kommunikation: Übergabe eines WhatsApp-Gesprächs an die Vertriebs-Pipeline (Twenty CRM).
// Läuft im n8n-Code-Knoten (eingebettet von kommunikation/n8n/bauen-antwort.mjs) und in Node (Tests).
// Kein Netzwerk, kein require, keine KI. Die HTTP-Knoten im Workflow schicken nur, was diese Funktionen bauen.
// Datenschutz: Ins CRM gehen Name, Telefonnummer, Marke und die Zusammenfassung des Bots, nie der Chatverlauf.
// Namen sind bewusst mit „crm“ vorangestellt, damit sie im Code-Knoten nicht mit dessen eigenen Variablen kollidieren.

export const CRM_PRAEFIX = 'WhatsApp: ';
export const CRM_TEST_PRAEFIX = 'TEST ';
// Stufe „(Noch) kein Termin gebucht“, erste Spalte der Pipeline. So legen auch das Portal („Neue Verkaufschance“)
// und der Leadmagnet neue Kontakte an. ERSTKONTAKT heißt „Fokus Erstkontakt“ und ist schon Karstens Arbeitsschritt.
export const CRM_STUFE_NEU = 'NEW';
export const CRM_NOTIZ_TITEL = 'WhatsApp-Bot: Zusammenfassung';
const CRM_LAENDER = { '49': 'DE', '43': 'AT', '41': 'CH' };
const CRM_MARKEN = { momentum: 'Momentum KI Akademie', hermetik: 'Hermetik Marketing', offen: 'noch offen' };

const crmZiffern = v => String(v || '').replace(/\D/g, '');
const crmEsc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** wa_id (Ziffern mit Ländervorwahl) → Telefonfeld im Format von Twenty, wie es das Portal anlegt. */
export function crmTelefon(waId) {
  const z = crmZiffern(waId);
  if (z.length < 8 || z.length > 15) return null;
  for (const cc of Object.keys(CRM_LAENDER)) {
    if (z.startsWith(cc)) return { primaryPhoneNumber: z.slice(cc.length), primaryPhoneCallingCode: '+' + cc, primaryPhoneCountryCode: CRM_LAENDER[cc] };
  }
  return { primaryPhoneNumber: z }; // andere Länder: wie das Portal, ganze Nummer ohne „+“
}

/** Schreibweisen, unter denen dieselbe Nummer in Twenty stehen kann. */
export function crmTelefonVarianten(waId) {
  const z = crmZiffern(waId);
  const t = crmTelefon(z);
  if (!t) return [];
  const v = [t.primaryPhoneNumber, z, '+' + z];
  if (t.primaryPhoneCallingCode) v.push('0' + t.primaryPhoneNumber);
  return [...new Set(v)];
}

/** REST-Pfad: Personen mit dieser Telefonnummer suchen. */
export function crmPersonSuchPfad(waId) {
  const f = 'or(' + crmTelefonVarianten(waId).map(v => 'phones.primaryPhoneNumber[eq]:"' + v + '"').join(',') + ')';
  return 'people?limit=10&filter=' + encodeURIComponent(f);
}

/** Gehört die Twenty-Person zu dieser WhatsApp-Nummer? Vergleicht vollständige Nummern, nicht Teilstrings. */
export function crmPersonPasst(person, waId) {
  const z = crmZiffern(waId);
  const ph = (person && person.phones) || {};
  const nr = crmZiffern(ph.primaryPhoneNumber);
  if (!z || !nr) return false;
  const cc = crmZiffern(ph.primaryPhoneCallingCode);
  const kandidaten = [nr];
  if (cc) kandidaten.push(cc + nr.replace(/^0+/, ''));
  else if (/^0[1-9]/.test(nr)) kandidaten.push('49' + nr.slice(1));
  return kandidaten.includes(z);
}

/** ID eines eben angelegten oder gelesenen Datensatzes aus einer Twenty-Antwort ({ data: { createPerson: { id } } } u. ä.). */
export function crmNeueId(antwort) {
  const d = antwort && antwort.data;
  if (!d || typeof d !== 'object') return '';
  const v = Object.values(d)[0];
  return (v && !Array.isArray(v) && v.id) || '';
}

/** Person für Twenty: Profilname (sonst „WhatsApp-Kontakt“) und Telefonnummer. */
export function crmPersonBody(kontaktName, waId) {
  const n = String(kontaktName || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'WhatsApp-Kontakt';
  const teile = n.split(' ');
  const b = { name: { firstName: teile[0].slice(0, 60), lastName: teile.slice(1).join(' ').slice(0, 80) } };
  const tel = crmTelefon(waId);
  if (tel) b.phones = tel;
  return b;
}

/** Nach der Personensuche: vorhandene Person wiederverwenden (bekannte ID zuerst), sonst neu anlegen. */
export function crmPersonSchritt(antwort, waId, kontaktName, bekannteId) {
  const L = ((antwort && antwort.data && antwort.data.people) || []).filter(p => p && p.id && !p.deletedAt && crmPersonPasst(p, waId));
  const treffer = L.find(p => p.id === bekannteId) || L[0];
  if (treffer) return { person_neu: false, person_id: treffer.id, methode: 'GET', pfad: 'people/' + treffer.id, body: {} };
  return { person_neu: true, person_id: '', methode: 'POST', pfad: 'people', body: crmPersonBody(kontaktName, waId) };
}

/** Nach dem Speichern der Person: ID lesen und die Chancen dieser Person abfragen. */
export function crmPersonUebernehmen(antwort) {
  const id = crmNeueId(antwort);
  if (!id) throw new Error('Twenty hat keine Personen-ID geliefert.');
  return { person_id: id, pfad: 'opportunities?limit=20&filter=' + encodeURIComponent('pointOfContactId[eq]:' + id) };
}

/** Name der Chance: „WhatsApp: <Name>“ (bei Tests „TEST WhatsApp: …“). */
export function crmChanceName(kontaktName, test) {
  const n = String(kontaktName || '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'WhatsApp-Kontakt';
  return (test ? CRM_TEST_PRAEFIX : '') + CRM_PRAEFIX + n;
}

/** Neue Chance: Stufe NEW, verknüpft mit der Person, Eingang und letzter Kontakt = jetzt. */
export function crmChanceBody(e) {
  return { name: crmChanceName(e.name, e.test), stage: CRM_STUFE_NEU, pointOfContactId: e.person_id, letzterKontakt: e.jetzt, eingangAm: e.jetzt };
}

/** Nach der Chancensuche: Hat die Person schon eine WhatsApp-Chance (z. B. nach einem abgebrochenen Lauf)? Dann fortschreiben. */
export function crmChanceSchritt(antwort, e) {
  const L = ((antwort && antwort.data && antwort.data.opportunities) || []).filter(o => o && o.id && !o.deletedAt);
  const da = L.find(o => String(o.name || '').startsWith(CRM_PRAEFIX) || String(o.name || '').startsWith(CRM_TEST_PRAEFIX + CRM_PRAEFIX));
  if (da) return { chance_neu: false, chance_id: da.id, methode: 'PATCH', pfad: 'opportunities/' + da.id, body: { letzterKontakt: e.jetzt } };
  return { chance_neu: true, chance_id: '', methode: 'POST', pfad: 'opportunities', body: crmChanceBody(e) };
}

/** Notiz mit der Zusammenfassung des Bots (Markdown). Kein Chatverlauf. */
export function crmNotizBody(e) {
  const zeit = new Date(e.jetzt || Date.now()).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
  const z = String(e.zusammenfassung || '').trim().slice(0, 1000);
  const zeilen = [
    '**Quelle:** WhatsApp-Bot',
    '**Marke:** ' + (CRM_MARKEN[e.marke] || CRM_MARKEN.offen),
    '**Stand:** ' + zeit
  ];
  if (e.uebergabe) zeilen.push('**Mensch gewünscht:** ' + (String(e.uebergabe_grund || '').slice(0, 200) || 'ja'));
  const md = zeilen.join('  \n') + '\n\n' + (z || '_Noch keine Zusammenfassung. Der Bot hat bisher nur begrüßt._') +
    '\n\n_Nur die Zusammenfassung des Bots, kein Chatverlauf. Den Verlauf siehst du im Portal unter „WhatsApp-Inbox“._';
  return { title: CRM_NOTIZ_TITEL, bodyV2: { markdown: md } };
}

/**
 * Entscheidung: nichts | anlegen | fortschreiben. Deterministisch, keine KI.
 * e = { weg, team, testmodus, crmTest, art, versandOk, uebergabe, konv }
 */
export function crmEntscheidung(e) {
  const konv = e.konv || {};
  if (e.weg !== 'kunde' || e.art !== 'kunde') return { aktion: 'nichts', grund: 'kein Kundengespräch', test: false };
  const istTeam = !!(e.team && e.team.mitglied_id);
  if ((istTeam || e.testmodus) && !e.crmTest) return { aktion: 'nichts', grund: istTeam ? 'Teammitglied' : 'Testmodus', test: false };
  const test = istTeam || !!e.testmodus;
  if (!e.versandOk && !e.uebergabe) return { aktion: 'nichts', grund: 'Bot hat noch nicht geantwortet', test };
  if (konv.twenty_chance_id) return { aktion: 'fortschreiben', grund: 'Chance vorhanden', test };
  return { aktion: 'anlegen', grund: konv.crm_fehler ? 'neuer Versuch nach Fehler' : 'erste Antwort', test };
}

/**
 * Alles, was die Nachbereitung für die CRM-Übergabe braucht.
 * e = { W (Weg bestimmen), E (Einstellungen), V (Versand auswerten), p (Antwort), jetzt }
 */
export function crmPlan(e) {
  const W = e.W || {}, E = e.E || {}, V = e.V || {}, p = e.p || {};
  const m = p.meta || {};
  const konv = W.konv || {};
  const jetzt = e.jetzt || new Date().toISOString();
  const d = crmEntscheidung({ weg: W.weg, team: W.team, testmodus: E.testmodus === true, crmTest: E.crm_test === true, art: p.art, versandOk: V.ok === true, uebergabe: m.uebergabe === true, konv });
  const plan = { aktion: d.aktion, grund: d.grund, test: d.test };
  if (d.aktion === 'nichts') return plan;
  const marke = m.marke && m.marke !== 'offen' ? m.marke : (konv.marke || 'offen');
  const zusammenfassung = String(m.zusammenfassung || konv.zusammenfassung || '');
  const name = String((W.nachricht && W.nachricht.kontakt_name) || konv.kontakt_name || '');
  const notiz = crmNotizBody({ zusammenfassung, marke, uebergabe: m.uebergabe === true, uebergabe_grund: m.uebergabe_grund, jetzt });
  Object.assign(plan, { wa: W.wa, name, marke, zusammenfassung, jetzt, notiz_body: notiz });
  if (d.aktion === 'anlegen') {
    plan.person_pfad = crmPersonSuchPfad(W.wa);
    plan.person_id = konv.twenty_person_id || '';
  } else {
    plan.chance_id = konv.twenty_chance_id;
    plan.chance_pfad = 'opportunities/' + konv.twenty_chance_id;
    plan.chance_body = { letzterKontakt: jetzt };
    const neu = !!m.zusammenfassung && m.zusammenfassung !== konv.zusammenfassung;
    plan.notiz_neu = !!konv.crm_notiz_id && (neu || m.uebergabe === true);
    plan.notiz_pfad = konv.crm_notiz_id ? 'notes/' + konv.crm_notiz_id : '';
  }
  return plan;
}

/** Abschluss nach erfolgreichem Anlegen: Werte für kom_konversationen und Telegram-Text. */
export function crmErgebnis(e) {
  const patch = { twenty_person_id: e.person_id, twenty_chance_id: e.chance_id, crm_notiz_id: e.notiz_id || null, crm_uebergeben_am: e.jetzt, crm_fehler: null };
  const telegram = e.chance_neu ? crmTelegramNeu(e.plan || {}) : '';
  return { patch, neu: !!e.chance_neu, telegram };
}

/** Telegram an Timo bei jeder neu angelegten Chance. Telefonnummer wie in der Meldung „Mensch gewünscht“. */
export function crmTelegramNeu(plan) {
  return '📇 <b>Neuer WhatsApp-Kontakt in der Pipeline</b>' + (plan.test ? ' (TEST)' : '') + '\n' +
    crmEsc(plan.name || 'WhatsApp-Kontakt') + ' · +' + crmEsc(plan.wa) + '\n' +
    'Marke: ' + crmEsc(CRM_MARKEN[plan.marke] || CRM_MARKEN.offen) + '\n' +
    'Kurz: ' + crmEsc(String(plan.zusammenfassung || 'noch keine Zusammenfassung').slice(0, 300)) + '\n' +
    'Stufe „(Noch) kein Termin gebucht“, im Portal unter Vertrieb.';
}

/** Fehler vermerken: Die Konversation bekommt crm_fehler, eine schon angelegte Person wird gemerkt (keine Dublette beim nächsten Versuch). */
export function crmFehlerPatch(e) {
  const f = e.fehler;
  const text = typeof f === 'string' ? f : (f && (f.message || f.description)) ? String(f.message || f.description) : JSON.stringify(f || 'unbekannt');
  const patch = { crm_fehler: (new Date(e.jetzt || Date.now()).toISOString() + ' ' + (e.aktion || '') + ': ' + text).slice(0, 500) };
  if (e.person_id) patch.twenty_person_id = e.person_id;
  return { patch };
}
