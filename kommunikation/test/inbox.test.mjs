// Tests für kommunikation/lib/inbox.js. Start: node --test kommunikation/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxAnfrage, nachrichtKurz, fensterOffen, inboxListe, inboxVerlauf, sendenPruefen } from '../lib/inbox.js';

const JETZT = Date.parse('2026-10-27T12:00:00Z');
const timo = { mitglied_id: 'timo', name: 'Timo Merz', rolle: 'admin', status: 'aktiv', typ: 'mensch' };

test('Zugang und Eingaben', () => {
  assert.equal(inboxAnfrage(null, 'liste').code, 401);
  assert.equal(inboxAnfrage({ ...timo, typ: 'agent' }, 'liste').code, 401);
  assert.equal(inboxAnfrage({ ...timo, rolle: 'team' }, 'liste').code, 403);
  assert.equal(inboxAnfrage(timo, 'loeschen').code, 400);
  assert.equal(inboxAnfrage(timo, 'verlauf', { konversation_id: 'x; drop' }).code, 400);
  assert.equal(inboxAnfrage(timo, 'liste').aktion, 'liste');
  const s = inboxAnfrage(timo, 'senden', { konversation_id: 'wa:491511234', text: '  Hallo\r\nda ' });
  assert.equal(s.text, 'Hallo\nda'); assert.equal(s.wer, 'mitglied:timo');
  assert.equal(inboxAnfrage(timo, 'modus', { konversation_id: 'wa:491511234', modus: 'ki' }).modus, 'ki');
  assert.equal(inboxAnfrage(timo, 'modus', { konversation_id: 'wa:491511234', modus: 'x' }).modus, 'mensch');
  assert.equal(inboxAnfrage({ ...timo, rolle: 'vertrieb' }, 'status', { konversation_id: 'ig:123456', status: 'erledigt' }).status, 'erledigt');
});

test('Kurztext und 24-Stunden-Fenster', () => {
  assert.equal(nachrichtKurz({ typ: 'audio' }), '🎤 Sprachnachricht');
  assert.equal(nachrichtKurz({ typ: 'image', text: 'Rechnung' }), '📷 Bild: Rechnung');
  assert.equal(fensterOffen('2026-10-27T00:00:01Z', JETZT), true);
  assert.equal(fensterOffen('2026-10-26T11:59:00Z', JETZT), false);
  assert.equal(fensterOffen(null, JETZT), false);
});

test('Liste: sortiert, letzte Nachricht, wartende Kundennachrichten', () => {
  const konvs = [
    { konversation_id: 'wa:1', kanal: 'whatsapp', kontakt_extern: '1', kontakt_name: 'Anna', modus: 'mensch', status: 'offen', letzte_kunde_am: '2026-10-27T10:00:00Z' },
    { konversation_id: 'wa:2', kanal: 'whatsapp', kontakt_extern: '2', modus: 'ki', status: 'offen', letzte_kunde_am: '2026-10-25T10:00:00Z' }
  ];
  const nachrichten = [   // neueste zuerst
    { konversation_id: 'wa:1', richtung: 'ein', text: 'Noch da?', typ: 'text', zeit: '2026-10-27T10:00:00Z' },
    { konversation_id: 'wa:1', richtung: 'ein', text: 'Hallo', typ: 'text', zeit: '2026-10-27T09:59:00Z' },
    { konversation_id: 'wa:2', richtung: 'aus', absender: 'ki', text: 'Willkommen', typ: 'text', zeit: '2026-10-25T10:00:05Z' },
    { konversation_id: 'wa:1', richtung: 'aus', absender: 'ki', text: 'Hi', typ: 'text', zeit: '2026-10-27T09:00:00Z' }
  ];
  const L = inboxListe(konvs, nachrichten, JETZT);
  assert.deepEqual(L.map(x => x.id), ['wa:1', 'wa:2']);
  assert.equal(L[0].letzte.text, 'Noch da?');
  assert.equal(L[0].offen, 2); assert.equal(L[0].fenster, true); assert.equal(L[0].telefon, '+1');
  assert.equal(L[1].offen, 0); assert.equal(L[1].fenster, false);
});

test('Verlauf und Senden', () => {
  const konv = { konversation_id: 'wa:491511234', kanal: 'whatsapp', kontakt_extern: '491511234', letzte_kunde_am: '2026-10-27T11:00:00Z', modus: 'ki' };
  const v = inboxVerlauf(konv, [{ nachricht_id: 'a', richtung: 'ein', typ: 'text', text: 'Hi', zeit: 'z' }], JETZT);
  assert.equal(v.gespraech.fenster, true); assert.equal(v.nachrichten[0].text, 'Hi');
  const ok = sendenPruefen(konv, 'Hallo Anna', JETZT);
  assert.equal(ok.ok, true); assert.equal(ok.wa_body.to, '491511234'); assert.equal(ok.wa_body.text.body, 'Hallo Anna');
  assert.match(sendenPruefen({ ...konv, letzte_kunde_am: '2026-10-20T00:00:00Z' }, 'x', JETZT).fehler, /24 Stunden/);
  assert.match(sendenPruefen({ ...konv, kanal: 'instagram' }, 'x', JETZT).fehler, /Instagram/);
  assert.equal(sendenPruefen(konv, '', JETZT).ok, false);
});
