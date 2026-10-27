// Tests für kommunikation/lib/whatsapp.js – Aufbau der Beispiele nach der Webhook-Referenz der WhatsApp Cloud API.
// Start: node --test kommunikation/test/whatsapp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisiere, e164, inhalt, quelle } from '../lib/whatsapp.js';

const NUMMER = '1412160901975864';
const huelle = (value, field = 'messages') => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1681755303343172', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '491773051079', phone_number_id: NUMMER }, ...value } }] }]
});

test('Textnachricht mit Profilname', () => {
  const r = normalisiere(huelle({
    contacts: [{ profile: { name: 'Erika Muster' }, wa_id: '4915112345678' }],
    messages: [{ from: '4915112345678', id: 'wamid.T1', timestamp: '1793037000', type: 'text', text: { body: 'Hallo, ich interessiere mich für eine Schulung' } }]
  }), NUMMER);
  assert.equal(r.nachrichten.length, 1);
  const n = r.nachrichten[0];
  assert.equal(n.konversation_id, 'wa:4915112345678');
  assert.equal(n.telefon_e164, '+4915112345678');
  assert.equal(n.kontakt_name, 'Erika Muster');
  assert.equal(n.typ, 'text');
  assert.equal(n.text, 'Hallo, ich interessiere mich für eine Schulung');
  assert.equal(n.zeit, new Date(1793037000 * 1000).toISOString());
  assert.equal(n.quelle, null);
});

test('Fremde Nummer und falsches Feld werden ignoriert', () => {
  const fremd = huelle({ messages: [{ from: '49151', id: 'wamid.X', timestamp: '1', type: 'text', text: { body: 'x' } }] });
  fremd.entry[0].changes[0].value.metadata.phone_number_id = '999';
  assert.deepEqual(normalisiere(fremd, NUMMER).nachrichten, []);
  assert.equal(normalisiere(fremd, NUMMER).ignoriert, 1);
  assert.equal(normalisiere(huelle({}, 'account_update'), NUMMER).ignoriert, 1);
  assert.equal(normalisiere({ object: 'page', entry: [] }, NUMMER).ignoriert, 1);
  assert.equal(normalisiere(null, NUMMER).ignoriert, 1);
});

test('Statusmeldungen inkl. Fehler', () => {
  const r = normalisiere(huelle({ statuses: [
    { id: 'wamid.O1', status: 'delivered', timestamp: '1793037100', recipient_id: '4915112345678' },
    { id: 'wamid.O2', status: 'failed', timestamp: '1793037200', recipient_id: '4915112345678', errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'Message failed to send because more than 24 hours have passed' } }] },
    { id: 'wamid.O3', status: 'deleted', timestamp: '1' }
  ] }), NUMMER);
  assert.deepEqual(r.status.map(s => s.status), ['zugestellt', 'fehlgeschlagen']);
  assert.equal(r.status[1].fehler[0].code, 131047);
  assert.match(r.status[1].fehler[0].details, /24 hours/);
  assert.equal(r.ignoriert, 1);
});

test('Antwort-Buttons, Listen, Medien, Standort, Reaktion, Unbekanntes', () => {
  assert.deepEqual(inhalt({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'weg_umsetzung', title: 'Umsetzung' } } }),
    { typ: 'interactive', text: 'Umsetzung', medien: { auswahl_id: 'weg_umsetzung', art: 'button_reply' } });
  assert.equal(inhalt({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'l1', title: 'Mitarbeiterschulung' } } }).text, 'Mitarbeiterschulung');
  const bild = inhalt({ type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', sha256: 'abc', caption: 'Screenshot' } });
  assert.equal(bild.text, 'Screenshot');
  assert.equal(bild.medien.id, 'MEDIA1');
  assert.equal(inhalt({ type: 'document', document: { id: 'D1', filename: 'Angebot.pdf', mime_type: 'application/pdf' } }).medien.dateiname, 'Angebot.pdf');
  assert.equal(inhalt({ type: 'location', location: { latitude: 47.98, longitude: 8.82, name: 'Büro', address: 'Tuttlingen' } }).text, 'Büro, Tuttlingen');
  assert.equal(inhalt({ type: 'reaction', reaction: { message_id: 'wamid.O1', emoji: '👍' } }).text, '👍');
  assert.deepEqual(inhalt({ type: 'order' }), { typ: 'unsupported', text: '', medien: { original_typ: 'order' } });
});

test('Click-to-WhatsApp-Referral nur aus echten Daten', () => {
  assert.equal(quelle({}), null);
  assert.equal(quelle({ referral: {} }), null);
  assert.deepEqual(quelle({ referral: { source_type: 'ad', source_id: '120200', headline: 'KI-Schulung', ctwa_clid: 'ARA1', body: 'nicht übernommen' } }),
    { source_type: 'ad', source_id: '120200', headline: 'KI-Schulung', ctwa_clid: 'ARA1' });
});

test('Mehrere Nachrichten in einem Webhook, langer Text gekürzt, e164', () => {
  const r = normalisiere(huelle({ messages: [
    { from: '4915112345678', id: 'wamid.A', timestamp: '1', type: 'text', text: { body: 'x'.repeat(5000) } },
    { from: '436641234567', id: 'wamid.B', timestamp: '2', type: 'text', text: { body: 'Servus' } },
    { id: 'wamid.ohne_absender', type: 'text' }
  ] }), NUMMER);
  assert.equal(r.nachrichten.length, 2);
  assert.equal(r.nachrichten[0].text.length, 4096);
  assert.equal(r.nachrichten[1].konversation_id, 'wa:436641234567');
  assert.equal(r.ignoriert, 1);
  assert.equal(e164('123'), null);
  assert.equal(e164('+49 151 1234 5678'), '+4915112345678');
});
