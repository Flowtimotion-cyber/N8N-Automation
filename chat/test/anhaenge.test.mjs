// Tests für chat/lib/anhaenge.js (Server-Logik „TEAM: Anhänge (Portal)“). node --test chat/test/anhaenge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anhangTyp, anhangAnfrage, anhangNachDb, anhangNachSpeicher, anhangAufraeumen, ANHANG_TYPEN, ANHANG_NICHT_EINGERICHTET } from '../lib/anhaenge.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ST = 'https://beispiel.supabase.co/storage/v1/';
const ICH = { mitglied_id: 'm_timo', rolle: 'admin', status: 'aktiv', typ: 'mensch' };
const CHAT = 'chat_0123456789abcdef';
const AN = 'an_' + 'a'.repeat(32), AN2 = 'an_' + 'b'.repeat(32);

test('Typ kommt aus der Endung; HTML, SVG, Programme und Videos gehen nicht', () => {
	assert.equal(anhangTyp('Foto.JPG'), 'image/jpeg');
	assert.equal(anhangTyp('IMG_0001.heic'), 'image/heic');
	assert.equal(anhangTyp('liste.csv'), 'text/csv');
	assert.equal(anhangTyp('Angebot.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	for (const n of ['seite.html', 'bild.svg', 'setup.exe', 'skript.js', 'film.mp4', 'ohne-endung', 'x.pdf.exe']) assert.equal(anhangTyp(n), null, n);
});

test('Gleiche Typenliste in SQL, Bucket und Portal', () => {
	const sql = readFileSync(join(REPO, 'supabase', 'team_chat_anhaenge.sql'), 'utf8');
	const portal = readFileSync(join(REPO, 'docs', 'team', 'index.html'), 'utf8');
	const typen = [...new Set(Object.values(ANHANG_TYPEN))];
	for (const t of typen) assert.ok(sql.split("'" + t + "'").length >= 3, 'SQL (Bucket und Prüfung) kennt ' + t);
	for (const e of Object.keys(ANHANG_TYPEN)) assert.match(portal, new RegExp('\\b' + e + ": '" + ANHANG_TYPEN[e].replace(/[.+]/g, '\\$&') + "'"), 'Portal kennt .' + e);
	assert.ok(portal.includes(ANHANG_NICHT_EINGERICHTET), 'gleicher Hinweistext im Portal');
});

test('Zugang: ohne Token, gesperrt und Agenten werden abgewiesen', () => {
	assert.equal(anhangAnfrage(null, 'links', { chat_id: CHAT }).code, 401);
	assert.equal(anhangAnfrage({ ...ICH, status: 'gesperrt' }, 'links', { chat_id: CHAT }).code, 401);
	assert.equal(anhangAnfrage({ mitglied_id: 'agent-claude', typ: 'agent', status: 'aktiv' }, 'links', { chat_id: CHAT }).code, 403);
	assert.equal(anhangAnfrage(ICH, 'loeschen_alles', { chat_id: CHAT }).code, 400);
	assert.equal(anhangAnfrage(ICH, 'links', { chat_id: 'chat_x;drop' }).code, 400);
});

test('vorbereiten: Name, Typ, Größe; Absender kommt aus dem Token', () => {
	const a = anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'C:\\fake\\Plan.pdf', groesse: 1200, breite: 0, p_mitglied: 'm_kurt' });
	assert.equal(a.fn, 'team_anhang_vorbereiten');
	assert.deepEqual(a.body, { p_mitglied: 'm_timo', p_chat: CHAT, p_name: 'C:_fake_Plan.pdf', p_mime: 'application/pdf', p_groesse: 1200, p_breite: null, p_hoehe: null });
	assert.equal(anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'x.mp4', groesse: 10 }).code, 400);
	assert.match(anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'x.pdf', groesse: 25 * 1024 * 1024 + 1 }).antwort.fehler, /zu groß/);
	assert.match(anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'x.pdf', groesse: 0 }).antwort.fehler, /leer/);
	assert.equal(anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'foto.png', groesse: 5, breite: 2560, hoehe: 1440 }).body.p_breite, 2560);
});

test('senden: 1 bis 10 Dateien, Text darf leer sein, WhatsApp nur für Markierte', () => {
	const a = anhangAnfrage(ICH, 'senden', { chat_id: CHAT, text: '', anhaenge: [AN, AN, 'quatsch', AN2], erwaehnt: ['m_kurt'], whatsapp: ['m_kurt', 'm_lillien'], antwort_auf: 7 });
	assert.deepEqual(a.body, { p_mitglied: 'm_timo', p_chat: CHAT, p_text: '', p_anhaenge: [AN, AN2], p_erwaehnt: ['m_kurt'], p_whatsapp: ['m_kurt'], p_antwort_auf: 7 });
	assert.equal(anhangAnfrage(ICH, 'senden', { chat_id: CHAT, text: 'x', anhaenge: [] }).code, 400);
	const elf = Array.from({ length: 11 }, (_, i) => 'an_' + String(i).padStart(32, '0'));
	assert.match(anhangAnfrage(ICH, 'senden', { chat_id: CHAT, anhaenge: elf }).antwort.fehler, /Höchstens 10/);
});

test('links: leer ohne Datenbank, sonst signieren als Stapel (60 Minuten)', () => {
	assert.deepEqual(anhangAnfrage(ICH, 'links', { chat_id: CHAT, anhaenge: [] }).antwort, { ok: true, links: [], gueltig_sek: 3600 });
	const a = anhangAnfrage(ICH, 'links', { chat_id: CHAT, anhaenge: [AN, AN2] });
	const db = { anhaenge: [{ anhang_id: AN, pfad: 'chat/' + CHAT + '/' + AN + '/Plan.pdf', name: 'Plan März.pdf', mime: 'application/pdf' }, { anhang_id: AN2, pfad: 'chat/' + CHAT + '/' + AN2 + '/x.png', name: 'x.png', mime: 'image/png' }] };
	const s = anhangNachDb(a, { statusCode: 200, body: db }, ST);
	assert.equal(s.aktion, 'storage');
	assert.equal(s.url, 'https://beispiel.supabase.co/storage/v1/object/sign/team-anhaenge');
	assert.deepEqual(s.body, { expiresIn: 3600, paths: db.anhaenge.map(x => x.pfad) });
	const r = anhangNachSpeicher(a, db, { statusCode: 200, body: [{ path: db.anhaenge[0].pfad, signedURL: '/object/sign/team-anhaenge/a?token=t1', error: null }, { path: db.anhaenge[1].pfad, signedURL: null, error: 'nicht gefunden' }] }, ST);
	assert.deepEqual(r.antwort.links, [{ anhang_id: AN, name: 'Plan März.pdf', mime: 'application/pdf', url: 'https://beispiel.supabase.co/storage/v1/object/sign/team-anhaenge/a?token=t1', download: 'https://beispiel.supabase.co/storage/v1/object/sign/team-anhaenge/a?token=t1&download=Plan%20M%C3%A4rz.pdf' }]);
});

test('vorbereiten: Upload-Adresse signieren und vollständig zurückgeben', () => {
	const a = anhangAnfrage(ICH, 'vorbereiten', { chat_id: CHAT, name: 'a b.pdf', groesse: 10 });
	const db = { anhang_id: AN, pfad: 'chat/' + CHAT + '/' + AN + '/a_b.pdf', mime: 'application/pdf' };
	assert.equal(anhangNachDb(a, { statusCode: 200, body: db }, ST).url, 'https://beispiel.supabase.co/storage/v1/object/upload/sign/team-anhaenge/chat/' + CHAT + '/' + AN + '/a_b.pdf');
	const r = anhangNachSpeicher(a, db, { statusCode: 200, body: { url: '/object/upload/sign/team-anhaenge/chat/x?token=t' } }, ST);
	assert.deepEqual(r, { code: 200, antwort: { ok: true, anhang_id: AN, mime: 'application/pdf', url: 'https://beispiel.supabase.co/storage/v1/object/upload/sign/team-anhaenge/chat/x?token=t', gueltig_sek: 7200 } });
	assert.equal(JSON.stringify(r).includes('/a_b.pdf'), false, 'Pfad geht nicht ans Portal');
	assert.equal(anhangNachSpeicher(a, db, { statusCode: 400, body: { message: 'mime type not supported' } }, ST).code, 502);
});

test('Fehler der Datenbank: nicht eingerichtet, Meldung aus SQL, sonst allgemein', () => {
	const a = anhangAnfrage(ICH, 'entfernen', { chat_id: CHAT, anhang_id: AN });
	assert.deepEqual(a.body, { p_mitglied: 'm_timo', p_chat: CHAT, p_anhang_id: AN, p_zurueck: false });
	assert.equal(anhangAnfrage(ICH, 'wiederherstellen', { chat_id: CHAT, anhang_id: AN }).body.p_zurueck, true);
	assert.deepEqual(anhangNachDb(a, { statusCode: 404, body: { code: 'PGRST202' } }, ST).antwort, { ok: false, fehler: ANHANG_NICHT_EINGERICHTET });
	assert.deepEqual(anhangNachDb(a, { statusCode: 400, body: { code: 'P0001', message: 'Nur wer die Datei geschickt hat, kann sie entfernen.' } }, ST), { aktion: 'antwort', code: 400, antwort: { ok: false, fehler: 'Nur wer die Datei geschickt hat, kann sie entfernen.' } });
	assert.equal(anhangNachDb(a, { statusCode: 500, body: 'kaputt' }, ST).code, 502);
	assert.deepEqual(anhangNachDb(a, { statusCode: 200, body: { nachricht: { nachricht_id: 3 } } }, ST).antwort, { ok: true, nachricht: { nachricht_id: 3 } });
});

test('Aufräumen: nur gültige Einträge', () => {
	assert.deepEqual(anhangAufraeumen([{ anhang_id: AN, pfad: 'chat/c/' + AN + '/a.pdf' }, { anhang_id: 'x', pfad: 'y' }, null]), { anzahl: 1, ids: [AN], prefixes: ['chat/c/' + AN + '/a.pdf'] });
	assert.deepEqual(anhangAufraeumen(undefined), { anzahl: 0, ids: [], prefixes: [] });
});
