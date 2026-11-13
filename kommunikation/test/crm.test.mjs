// Tests für die Übergabe WhatsApp → Vertriebs-Pipeline (kommunikation/lib/crm.js und die CRM-Knoten aus bauen-antwort.mjs).
// Start: node --test kommunikation/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crmTelefon, crmTelefonVarianten, crmPersonSuchPfad, crmPersonPasst, crmPersonBody, crmPersonSchritt, crmPersonUebernehmen,
  crmChanceSchritt, crmNotizBody, crmEntscheidung, crmPlan, crmErgebnis, crmFehlerPatch, crmNeueId, CRM_STUFE_NEU
} from '../lib/crm.js';
import { wegBestimmen } from '../lib/antwort.js';
import { JS_NACHBEREITUNG, CRM_KNOTEN, CRM_VERBINDUNGEN, DEPLOY, sdk } from '../n8n/bauen-antwort.mjs';

const WA = '4915112345678';
const JETZT = '2026-11-13T10:00:00.000Z';
const CHATTEXT = 'Mein geheimer Chattext: Umsatz 2,3 Mio, Problem mit Kollege Meier';
const N = { konversation_id: 'wa:' + WA, kontakt_extern: WA, nachricht_id: 'w1', text: CHATTEXT, typ: 'text', zeit: '2026-11-13T09:59:59Z', kontakt_name: 'Erika Muster' };
const KUNDE = { art: 'kunde', to: WA, text: 'Antwort des Bots', buttons: [], meta: { marke: 'momentum', zusammenfassung: 'Interesse an geförderter KI-Schulung für 5 Mitarbeitende.', uebergabe: false, pruefung: 'ok' } };
const E0 = { testmodus: false, test_nummern: '491737348515', telegram_chat: '1', crm_test: false };

function W(konv = { modus: 'ki' }, team = {}, E = E0) {
  const w = wegBestimmen({ nachricht: N, eingang: { erstkontakt: !konv.twenty_chance_id }, konv, team, testmodus: E.testmodus, testNummern: String(E.test_nummern).split(','), verlauf: [] });
  return { ...w, konv, nachricht: N };
}

/** Code-Knoten wie in n8n ausführen: $('Name').first().json, $input.first().json, isExecuted */
function lauf(js, daten, input) {
  const $ = name => {
    if (!(name in daten)) return { isExecuted: false, first: () => { throw new Error('nicht ausgeführt: ' + name); }, all: () => [] };
    return { isExecuted: true, first: () => ({ json: daten[name] }), all: () => [{ json: daten[name] }] };
  };
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  return new Function('$', '$input', js)($, $input)[0].json;
}
const knoten = name => CRM_KNOTEN.find(k => k.name === name);
const js = name => knoten(name).parameters.jsCode.__js;

/** Den ganzen Anlege-Zweig mit einem gespielten Twenty durchlaufen (jede Antwort kommt aus „twenty“). */
function anlegenDurchspielen(plan, twenty) {
  const d = { Nachbereitung: { crm: plan } };
  const aufrufe = [];
  const http = (name, methode, pfad, body) => { aufrufe.push({ name, methode, pfad, body }); const r = twenty(methode, pfad, body); d[name] = r; return r; };
  let r = http('Twenty: Person suchen', 'GET', plan.person_pfad);
  d['Person wählen'] = lauf(js('Person wählen'), d, r);
  r = http('Twenty: Person speichern', d['Person wählen'].methode, d['Person wählen'].pfad, d['Person wählen'].body);
  d['Person übernehmen'] = lauf(js('Person übernehmen'), d, r);
  r = http('Twenty: Chancen der Person', 'GET', d['Person übernehmen'].pfad);
  d['Chance wählen'] = lauf(js('Chance wählen'), d, r);
  r = http('Twenty: Chance speichern', d['Chance wählen'].methode, d['Chance wählen'].pfad, d['Chance wählen'].body);
  d['Notiz bauen'] = lauf(js('Notiz bauen'), d, r);
  r = http('Twenty: Notiz anlegen', 'POST', 'notes', d['Notiz bauen'].body);
  http('Twenty: Notiz verknüpfen', 'POST', 'noteTargets', { noteId: crmNeueId(r), targetOpportunityId: d['Notiz bauen'].chance_id });
  d['CRM-Ergebnis'] = lauf(js('CRM-Ergebnis'), d, {});
  return { ergebnis: d['CRM-Ergebnis'], aufrufe };
}

/** Kleines Twenty im Speicher: people, opportunities, notes, noteTargets */
function twentyImSpeicher() {
  const db = { people: [], opportunities: [], notes: [], noteTargets: [] };
  let n = 0;
  const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const fn = (methode, pfad, body) => {
    const [res, q] = pfad.split('?');
    const [obj, oid] = res.split('/');
    const filter = q ? decodeURIComponent((q.match(/filter=([^&]*)/) || [])[1] || '') : '';
    if (methode === 'GET' && oid) return { data: { [obj.slice(0, -1)]: db[obj].find(x => x.id === oid) } };
    if (methode === 'GET' && obj === 'people') {
      const werte = [...filter.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      return { data: { people: db.people.filter(p => werte.includes(p.phones.primaryPhoneNumber)) } };
    }
    if (methode === 'GET' && obj === 'opportunities') {
      const pid = filter.split(':')[1];
      return { data: { opportunities: db.opportunities.filter(o => o.pointOfContactId === pid) } };
    }
    if (methode === 'POST') { const x = { id: id(), ...body }; db[obj].push(x); return { data: { ['create' + obj]: x } }; }
    if (methode === 'PATCH') { const x = db[obj].find(y => y.id === oid); Object.assign(x, body); return { data: { ['update' + obj]: x } }; }
    throw new Error('unbekannt ' + methode + ' ' + pfad);
  };
  return { db, fn };
}

test('Telefonformat: wa_id → Twenty-Felder wie im Portal', () => {
  assert.deepEqual(crmTelefon(WA), { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+49', primaryPhoneCountryCode: 'DE' });
  assert.deepEqual(crmTelefon('436641234567'), { primaryPhoneNumber: '6641234567', primaryPhoneCallingCode: '+43', primaryPhoneCountryCode: 'AT' });
  assert.deepEqual(crmTelefon('41791234567'), { primaryPhoneNumber: '791234567', primaryPhoneCallingCode: '+41', primaryPhoneCountryCode: 'CH' });
  assert.deepEqual(crmTelefon('31612345678'), { primaryPhoneNumber: '31612345678' });
  assert.equal(crmTelefon('123'), null);
  assert.deepEqual(crmTelefonVarianten(WA).sort(), ['015112345678', '15112345678', '+4915112345678', '4915112345678'].sort());
  assert.match(decodeURIComponent(crmPersonSuchPfad(WA)), /^people\?limit=10&filter=or\(phones\.primaryPhoneNumber\[eq\]:"15112345678",/);
});

test('Telefonvergleich: ganze Nummer, kein Teilstring', () => {
  assert.equal(crmPersonPasst({ phones: { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+49' } }, WA), true);
  assert.equal(crmPersonPasst({ phones: { primaryPhoneNumber: '015112345678', primaryPhoneCallingCode: '' } }, WA), true);
  assert.equal(crmPersonPasst({ phones: { primaryPhoneNumber: '4915112345678' } }, WA), true);
  assert.equal(crmPersonPasst({ phones: { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+43' } }, WA), false);
  assert.equal(crmPersonPasst({ phones: { primaryPhoneNumber: '5112345678', primaryPhoneCallingCode: '+49' } }, WA), false);
  assert.equal(crmPersonPasst({ phones: {} }, WA), false);
});

test('Person: Profilname, sonst „WhatsApp-Kontakt“', () => {
  assert.deepEqual(crmPersonBody('Erika  Muster-Schmidt', WA).name, { firstName: 'Erika', lastName: 'Muster-Schmidt' });
  assert.deepEqual(crmPersonBody('', WA).name, { firstName: 'WhatsApp-Kontakt', lastName: '' });
  assert.equal(crmPersonBody(null, WA).phones.primaryPhoneCallingCode, '+49');
});

test('Entscheidung: neuer Kunde → anlegen, vorhandene Chance → fortschreiben', () => {
  const basis = { weg: 'kunde', team: null, testmodus: false, crmTest: false, art: 'kunde', versandOk: true, uebergabe: false, konv: {} };
  assert.equal(crmEntscheidung(basis).aktion, 'anlegen');
  assert.equal(crmEntscheidung({ ...basis, konv: { twenty_chance_id: 'c1' } }).aktion, 'fortschreiben');
  assert.equal(crmEntscheidung({ ...basis, versandOk: false }).aktion, 'nichts', 'ohne Antwort noch keine Chance');
  assert.equal(crmEntscheidung({ ...basis, versandOk: false, uebergabe: true }).aktion, 'anlegen', 'Mensch gewünscht reicht');
  assert.equal(crmEntscheidung({ ...basis, weg: 'team' }).aktion, 'nichts');
  assert.equal(crmEntscheidung({ ...basis, art: 'befehl' }).aktion, 'nichts');
});

test('Teammitglied → nichts (auch in der Kundenansicht /kunde)', () => {
  const team = { mitglied_id: 'timo', name: 'Timo', rolle: 'admin' };
  const w = W({ modus: 'ki', ansicht: 'kunde' }, team);
  assert.equal(w.weg, 'kunde', 'Kundenansicht: Teammitglied testet den Kunden-Bot');
  const plan = crmPlan({ W: w, E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  assert.equal(plan.aktion, 'nichts'); assert.equal(plan.grund, 'Teammitglied');
  const w2 = W({ modus: 'ki' }, team);
  assert.equal(w2.weg, 'team');
  assert.equal(crmPlan({ W: w2, E: E0, V: { ok: true }, p: { art: 'team', meta: {} } }).aktion, 'nichts');
  // nur mit crm_test=true (Einstellungen) und dann als TEST-Chance
  const t = crmPlan({ W: w, E: { ...E0, crm_test: true }, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  assert.equal(t.aktion, 'anlegen'); assert.equal(t.test, true);
});

test('Testmodus → nichts (still und auch für Testnummern)', () => {
  const E = { ...E0, testmodus: true, test_nummern: '491737348515' };
  const still = W({ modus: 'ki' }, {}, E);
  assert.equal(still.weg, 'still');
  assert.equal(crmPlan({ W: still, E, V: { ok: true }, p: KUNDE }).aktion, 'nichts');
  const E2 = { ...E, test_nummern: WA };
  const testnr = W({ modus: 'ki' }, {}, E2);
  assert.equal(testnr.weg, 'kunde');
  assert.equal(crmPlan({ W: testnr, E: E2, V: { ok: true }, p: KUNDE }).grund, 'Testmodus');
});

test('Neuer Kunde → Person + Chance (Stufe NEW, verknüpft) + Notiz, Telegram an Timo', () => {
  const tw = twentyImSpeicher();
  const plan = crmPlan({ W: W(), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  assert.equal(plan.aktion, 'anlegen');
  const { ergebnis, aufrufe } = anlegenDurchspielen(plan, tw.fn);
  assert.equal(tw.db.people.length, 1); assert.equal(tw.db.opportunities.length, 1); assert.equal(tw.db.notes.length, 1); assert.equal(tw.db.noteTargets.length, 1);
  const o = tw.db.opportunities[0];
  assert.equal(o.name, 'WhatsApp: Erika Muster'); assert.equal(o.stage, CRM_STUFE_NEU); assert.equal(o.stage, 'NEW');
  assert.equal(o.pointOfContactId, tw.db.people[0].id); assert.equal(o.letzterKontakt, JETZT); assert.equal(o.eingangAm, JETZT);
  assert.equal(tw.db.noteTargets[0].targetOpportunityId, o.id);
  assert.match(tw.db.notes[0].bodyV2.markdown, /Quelle:\*\* WhatsApp-Bot/);
  assert.match(tw.db.notes[0].bodyV2.markdown, /Marke:\*\* Momentum KI Akademie/);
  assert.match(tw.db.notes[0].bodyV2.markdown, /geförderter KI-Schulung/);
  assert.equal(ergebnis.neu, true);
  assert.deepEqual(ergebnis.patch, { twenty_person_id: tw.db.people[0].id, twenty_chance_id: o.id, crm_notiz_id: tw.db.notes[0].id, crm_uebergeben_am: JETZT, crm_fehler: null });
  assert.match(ergebnis.telegram, /Neuer WhatsApp-Kontakt in der Pipeline/);
  assert.match(ergebnis.telegram, /Erika Muster · \+4915112345678/);
  assert.match(ergebnis.telegram, /Marke: Momentum KI Akademie/);
  assert.equal(aufrufe.filter(a => a.methode === 'POST' && a.pfad === 'opportunities').length, 1);
});

test('Zweite Nachricht → fortschreiben, keine zweite Chance', () => {
  const tw = twentyImSpeicher();
  const plan1 = crmPlan({ W: W(), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  const { ergebnis } = anlegenDurchspielen(plan1, tw.fn);
  const konv = { modus: 'ki', marke: 'momentum', zusammenfassung: KUNDE.meta.zusammenfassung, ...ergebnis.patch };
  const p2 = { ...KUNDE, meta: { ...KUNDE.meta, zusammenfassung: 'Will einen Termin mit Karsten.' } };
  const plan2 = crmPlan({ W: W(konv), E: E0, V: { ok: true }, p: p2, jetzt: '2026-11-13T11:00:00.000Z' });
  assert.equal(plan2.aktion, 'fortschreiben');
  assert.equal(plan2.chance_pfad, 'opportunities/' + konv.twenty_chance_id);
  assert.deepEqual(plan2.chance_body, { letzterKontakt: '2026-11-13T11:00:00.000Z' });
  assert.equal(plan2.notiz_neu, true); assert.equal(plan2.notiz_pfad, 'notes/' + konv.crm_notiz_id);
  tw.fn('PATCH', plan2.chance_pfad, plan2.chance_body);
  tw.fn('PATCH', plan2.notiz_pfad, plan2.notiz_body);
  assert.equal(tw.db.opportunities.length, 1); assert.equal(tw.db.notes.length, 1);
  assert.match(tw.db.notes[0].bodyV2.markdown, /Termin mit Karsten/);
  // gleiche Zusammenfassung → Notiz bleibt, nur letzter Kontakt
  const plan3 = crmPlan({ W: W({ ...konv, zusammenfassung: 'Will einen Termin mit Karsten.' }), E: E0, V: { ok: true }, p: p2, jetzt: JETZT });
  assert.equal(plan3.aktion, 'fortschreiben'); assert.equal(plan3.notiz_neu, false);
});

test('Vorhandene Person (gleiche Telefonnummer) wird wiederverwendet', () => {
  const tw = twentyImSpeicher();
  tw.fn('POST', 'people', { name: { firstName: 'Erika', lastName: 'M.' }, phones: { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+49' } });
  anlegenDurchspielen(crmPlan({ W: W(), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT }), tw.fn);
  assert.equal(tw.db.people.length, 1);
  assert.equal(tw.db.people[0].name.lastName, 'M.', 'vorhandene Person wird nicht überschrieben');
  assert.equal(tw.db.opportunities[0].pointOfContactId, tw.db.people[0].id);
});

test('Twenty-Fehler → Antwort geht trotzdem raus, Fehler vermerkt, Wiederholung ohne Dublette', () => {
  // 1. Aufbau: CRM-Zweig hängt hinter „Konversation aktualisieren“ (nach „WhatsApp senden“), jeder Twenty-/Code-Knoten hat einen Fehlerausgang
  assert.ok(sdk.indexOf("name: 'WhatsApp senden'") < sdk.indexOf('"name": "CRM-Übergabe?"'));
  assert.deepEqual(CRM_VERBINDUNGEN[0], ['Konversation aktualisieren', 0, 'CRM-Übergabe?']);
  for (const k of CRM_KNOTEN.filter(k => k.name.startsWith('Twenty:'))) {
    assert.equal(k.settings.onError, 'continueErrorOutput', k.name);
    assert.ok(CRM_VERBINDUNGEN.some(([a, i, b]) => a === k.name && i === 1 && b === 'CRM-Fehler vermerken'), 'Fehlerausgang ' + k.name);
  }
  for (const n of ['CRM-Fehler vermerken', 'CRM-Fehler speichern', 'CRM-Stand speichern', 'Telegram: neuer Pipeline-Kontakt']) assert.equal(knoten(n).settings.onError, 'continueRegularOutput', n);
  // Die Nachbereitung selbst wirft nicht, auch wenn die CRM-Planung scheitert
  const kaputteKonv = { modus: 'ki', get twenty_chance_id() { throw new Error('kaputte Daten'); } };
  const d = { 'Weg bestimmen': { ...W(), konv: kaputteKonv }, 'Versand auswerten': { ok: true, payload: KUNDE }, Einstellungen: E0 };
  const nb = lauf(JS_NACHBEREITUNG, d, {});
  assert.equal(nb.crm.aktion, 'nichts'); assert.match(nb.crm.grund, /Planungsfehler/);
  assert.equal(nb.patch.zusammenfassung, KUNDE.meta.zusammenfassung, 'Konversation wird trotzdem aktualisiert');

  // 2. Twenty scheitert beim Anlegen der Chance: Person ist schon da
  const tw = twentyImSpeicher();
  const plan = crmPlan({ W: W(), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  const kaputt = (m, pfad, b) => { if (m === 'POST' && pfad === 'opportunities') throw Object.assign(new Error('Twenty: 503 Service Unavailable'), { teil: true }); return tw.fn(m, pfad, b); };
  assert.throws(() => anlegenDurchspielen(plan, kaputt), /503/);
  const fehler = lauf(js('CRM-Fehler vermerken'), { Nachbereitung: { crm: plan }, 'Person übernehmen': { person_id: tw.db.people[0].id } }, { error: { message: 'Twenty: 503 Service Unavailable' } });
  assert.match(fehler.patch.crm_fehler, /anlegen: Twenty: 503/);
  assert.equal(fehler.patch.twenty_person_id, tw.db.people[0].id);
  assert.equal(tw.db.opportunities.length, 0);

  // 3. Nächster Lauf: wieder „anlegen“, Person wird wiederverwendet, genau eine Chance
  const konv = { modus: 'ki', ...fehler.patch };
  const plan2 = crmPlan({ W: W(konv), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  assert.equal(plan2.aktion, 'anlegen'); assert.equal(plan2.grund, 'neuer Versuch nach Fehler'); assert.equal(plan2.person_id, tw.db.people[0].id);
  const { ergebnis } = anlegenDurchspielen(plan2, tw.fn);
  assert.equal(tw.db.people.length, 1); assert.equal(tw.db.opportunities.length, 1); assert.equal(ergebnis.patch.crm_fehler, null);

  // 4. Chance angelegt, aber Speichern in Supabase scheiterte → nächster Lauf findet die WhatsApp-Chance der Person und legt keine zweite an
  const plan3 = crmPlan({ W: W({ modus: 'ki', twenty_person_id: tw.db.people[0].id }), E: E0, V: { ok: true }, p: KUNDE, jetzt: JETZT });
  const r3 = anlegenDurchspielen(plan3, tw.fn);
  assert.equal(tw.db.opportunities.length, 1);
  assert.equal(r3.ergebnis.neu, false, 'kein zweites Telegram');
  assert.equal(r3.aufrufe.find(a => a.name === 'Twenty: Chance speichern').methode, 'PATCH');
});

test('Kein Chattext im CRM-Payload', () => {
  const tw = twentyImSpeicher();
  const nb = lauf(JS_NACHBEREITUNG, { 'Weg bestimmen': W(), 'Versand auswerten': { ok: true, payload: KUNDE }, Einstellungen: E0 }, {});
  assert.equal(nb.crm.aktion, 'anlegen');
  const { aufrufe } = anlegenDurchspielen(nb.crm, tw.fn);
  const alles = JSON.stringify(aufrufe.map(a => [a.pfad, a.body])) + JSON.stringify(tw.db);
  assert.ok(!alles.includes('geheimer'), 'Chattext darf nicht nach Twenty');
  assert.ok(!alles.includes('Meier'));
  assert.ok(!JSON.stringify(nb.crm).includes('geheimer'), 'auch nicht im Plan');
  assert.ok(!JSON.stringify(crmNotizBody({ zusammenfassung: '', marke: 'offen', jetzt: JETZT })).includes('geheimer'));
});

test('Begrüßung ohne Zusammenfassung legt an, Notiz sagt „noch keine Zusammenfassung“', () => {
  const p = { art: 'kunde', to: WA, text: 'Hallo', buttons: ['Umsetzung'], meta: { marke: 'offen', zusammenfassung: '', uebergabe: false } };
  const plan = crmPlan({ W: W(), E: E0, V: { ok: true }, p, jetzt: JETZT });
  assert.equal(plan.aktion, 'anlegen');
  assert.match(plan.notiz_body.bodyV2.markdown, /Noch keine Zusammenfassung/);
  assert.match(plan.notiz_body.bodyV2.markdown, /Marke:\*\* noch offen/);
});

test('Hilfsfunktionen: IDs, Personen-/Chancenwahl, Fehlertext', () => {
  assert.equal(crmNeueId({ data: { createPerson: { id: 'x1' } } }), 'x1');
  assert.equal(crmNeueId({ data: { people: [] } }), '');
  assert.throws(() => crmPersonUebernehmen({ data: {} }), /keine Personen-ID/);
  const s = crmPersonSchritt({ data: { people: [{ id: 'a', phones: { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+49' } }, { id: 'b', phones: { primaryPhoneNumber: '15112345678', primaryPhoneCallingCode: '+49' } }] } }, WA, 'X', 'b');
  assert.equal(s.person_id, 'b'); assert.equal(s.methode, 'GET');
  const c = crmChanceSchritt({ data: { opportunities: [{ id: 'o1', name: 'Förder-Check: Firma' }] } }, { name: 'Erika', person_id: 'a', jetzt: JETZT });
  assert.equal(c.chance_neu, true, 'andere Chance der Person (z. B. Leadmagnet) bleibt unberührt');
  assert.equal(crmChanceSchritt({ data: { opportunities: [{ id: 'o2', name: 'TEST WhatsApp: Timo' }] } }, { jetzt: JETZT }).chance_id, 'o2');
  assert.equal(crmFehlerPatch({ aktion: 'fortschreiben', fehler: 'x', jetzt: JETZT }).patch.twenty_person_id, undefined);
  assert.equal(crmErgebnis({ person_id: 'p', chance_id: 'c', chance_neu: false, jetzt: JETZT }).telegram, '');
});

test('Deployment-Operationen: Twenty-Credential nur als Verweis, keine Geheimnisse', () => {
  const t = JSON.stringify(DEPLOY);
  assert.equal(DEPLOY.workflowId, 'DVGX3cltu2qbqLJE');
  assert.ok(DEPLOY.operations.length <= 100);
  for (const op of DEPLOY.operations.filter(o => o.type === 'addNode' && o.node.name.startsWith('Twenty:'))) assert.deepEqual(op.node.credentials, { httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } });
  assert.ok(!/Bearer\s+[A-Za-z0-9]/.test(t) && !/eyJ[A-Za-z0-9_-]{10,}/.test(t), 'kein Token im Klartext');
  const erlaubt = ['name', 'type', 'typeVersion', 'position', 'parameters', 'credentials'];
  for (const op of DEPLOY.operations.filter(o => o.type === 'addNode')) assert.deepEqual(Object.keys(op.node).filter(k => !erlaubt.includes(k)), [], op.node.name);
  assert.ok(DEPLOY.operations.some(o => o.type === 'setNodeSettings' && o.nodeName === 'Twenty: Person suchen' && o.settings.onError === 'continueErrorOutput'));
  const namen = new Set(DEPLOY.operations.filter(o => o.type === 'addNode').map(o => o.node.name));
  for (const o of DEPLOY.operations.filter(o => o.type === 'addConnection')) {
    assert.ok(namen.has(o.source) || o.source === 'Konversation aktualisieren', o.source);
    assert.ok(namen.has(o.target), o.target);
  }
});
