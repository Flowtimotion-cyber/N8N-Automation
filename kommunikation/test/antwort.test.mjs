// Tests für kommunikation/lib/antwort.js. Start: node --test kommunikation/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istKurzgruss, textFuerKi, wegBestimmen, verlaufAlsChat, kundenAnfrage, antwortPruefen, begruessung, waNachricht, versandAuswerten } from '../lib/antwort.js';

const N = { konversation_id: 'wa:491511234', kontakt_extern: '491511234', nachricht_id: 'w2', text: 'Hallo', typ: 'text', zeit: '2026-10-27T08:00:01Z', kontakt_name: 'Erika' };

test('Kurzgruß erkennen', () => {
  for (const t of ['Hallo', 'hi!', 'Moin moin', 'Guten Tag', 'test 2', '', '👋']) assert.equal(istKurzgruss(t), true, t);
  for (const t of ['Hallo, ich will mein Team schulen', 'Was kostet das?', 'Hallo zusammen, wir sind ein Handwerksbetrieb']) assert.equal(istKurzgruss(t), false, t);
});

test('Medien ohne Text werden für die KI beschrieben', () => {
  assert.equal(textFuerKi({ typ: 'audio', text: '' }), '[Sprachnachricht ohne Text]');
  assert.equal(textFuerKi({ typ: 'image', text: 'Unser Prozess' }), '[Bild: Unser Prozess]');
  assert.equal(textFuerKi({ typ: 'interactive', text: 'Umsetzung' }), 'Umsetzung');
});

test('Wege: Kunde, Testmodus, Mensch, Team, Befehl, neuere Nachricht', () => {
  const basis = { nachricht: N, eingang: { erstkontakt: true }, konv: { modus: 'ki' }, team: {}, testmodus: false, testNummern: [], verlauf: [] };
  assert.equal(wegBestimmen(basis).weg, 'kunde');
  assert.equal(wegBestimmen({ ...basis, testmodus: true, testNummern: ['491737348515'] }).weg, 'still');
  assert.equal(wegBestimmen({ ...basis, testmodus: true, testNummern: ['491511234'] }).weg, 'kunde');
  assert.equal(wegBestimmen({ ...basis, konv: { modus: 'mensch' } }).weg, 'still');
  const team = { mitglied_id: 'timo', name: 'Timo', rolle: 'admin' };
  assert.equal(wegBestimmen({ ...basis, team }).weg, 'team');
  assert.equal(wegBestimmen({ ...basis, team, konv: { modus: 'ki', ansicht: 'kunde' } }).weg, 'kunde');
  const b = wegBestimmen({ ...basis, team, nachricht: { ...N, text: '/kunde' } });
  assert.equal(b.weg, 'befehl'); assert.equal(b.ansicht, 'kunde');
  assert.equal(wegBestimmen({ ...basis, nachricht: { ...N, text: '/kunde' } }).weg, 'kunde', 'Befehle nur für Teammitglieder');
  const v = [{ richtung: 'ein', nachricht_id: 'w3', zeit: '2026-10-27T08:00:05Z' }];
  assert.equal(wegBestimmen({ ...basis, verlauf: v }).weg, 'still');
});

test('Verlauf und Anfrage an das Modell', () => {
  const verlauf = [
    { richtung: 'ein', nachricht_id: 'w2', text: 'Wir sind 12 Leute', typ: 'text' },
    { richtung: 'aus', nachricht_id: 'o1', text: 'Willkommen', typ: 'text' },
    { richtung: 'ein', nachricht_id: 'w1', text: 'Hallo', typ: 'text' }
  ];
  assert.deepEqual(verlaufAlsChat(verlauf).map(m => m.role), ['user', 'assistant', 'user']);
  const body = kundenAnfrage('Kanal {{kanal}}, Erst {{erstkontakt}}, Name {{kontakt_name}}, {{unbekannt}}', 'WISSEN', { nachricht: N, eingang: { erstkontakt: true }, konv: {}, verlauf });
  assert.match(body.messages[0].content, /Kanal WhatsApp, Erst ja/);
  assert.match(body.messages[0].content, /Name Erika/);
  assert.match(body.messages[0].content, /\{\{unbekannt\}\}/);
  assert.match(body.messages[0].content, /WISSEN$/);
  assert.equal(body.messages.at(-1).content, 'Wir sind 12 Leute');
  assert.equal(body.response_format.type, 'json_object');
});

const roh = obj => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

test('Antwort prüfen: normal, Buttons, Markdown, Preis, leer, kaputt', () => {
  const a = antwortPruefen(roh({ antwort: 'Das geht **gut**.', buttons: ['Termin buchen', 'Viel zu langer Buttontext hier'], marke: 'momentum', uebergabe: false, zusammenfassung: 'x' }), '491');
  assert.equal(a.text, 'Das geht *gut*.');
  assert.deepEqual(a.buttons, ['Termin buchen']);
  assert.equal(a.meta.marke, 'momentum');
  const p = antwortPruefen(roh({ antwort: 'Das kostet 3.500 € netto.' }), '491');
  assert.equal(p.meta.pruefung, 'preis_entfernt');
  assert.doesNotMatch(p.text, /3\.500/);
  assert.equal(antwortPruefen(roh({ antwort: 'Bis zu 100 % gefördert.' }), '491').meta.pruefung, 'ok');
  const leer = antwortPruefen(roh({ antwort: '' }), '491');
  assert.equal(leer.meta.uebergabe, true);
  assert.equal(antwortPruefen({ choices: [{ message: { content: 'kein json' } }] }, '491').meta.pruefung, 'ersatz');
  assert.equal(antwortPruefen(null, '491').meta.pruefung, 'ersatz');
  assert.equal(antwortPruefen(roh({ antwort: 'x', marke: 'boese' }), '491').meta.marke, 'offen');
});

test('WhatsApp-Nachrichten und Versandauswertung', () => {
  const g = waNachricht(begruessung('491'));
  assert.equal(g.type, 'interactive');
  assert.equal(g.interactive.action.buttons.length, 2);
  assert.equal(g.interactive.action.buttons[1].reply.title, 'Mitarbeiterschulung');
  assert.ok(g.interactive.body.text.length <= 1024);
  const t = waNachricht({ to: '491', text: 'Hallo', buttons: [] });
  assert.deepEqual(t.text, { preview_url: true, body: 'Hallo' });
  assert.deepEqual(versandAuswerten({ statusCode: 200, body: { messages: [{ id: 'wamid.X' }] } }), { ok: true, nachricht_id: 'wamid.X', fehler: null });
  const f = versandAuswerten({ statusCode: 400, body: { error: { code: 131047, message: 'Re-engagement message' } } });
  assert.equal(f.ok, false); assert.equal(f.fehler.code, 131047); assert.match(f.nachricht_id, /^fehler-/);
});
