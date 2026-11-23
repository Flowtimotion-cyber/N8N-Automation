// Tests für chat/lib/chat.js und die Nachbildung chat/dev/mock.mjs. Start: node --test chat/test/chat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chatAnfrage, chatAntwort, CHAT_NICHT_EINGERICHTET, CHAT_BEARBEITEN_FEHLT } from '../lib/chat.js';
import { C_ChatDbNachbildung, chatAntwortMock } from '../dev/mock.mjs';

const timo = { mitglied_id: 'm_timo', rolle: 'admin', status: 'aktiv', typ: 'mensch' };
const claude = { mitglied_id: 'agent-claude', rolle: 'agent', status: 'aktiv', typ: 'agent' };
const C = 'chat_' + 'a'.repeat(32);

test('Zugang: ohne Mitglied 401, gesperrt 401, Agent 403', () => {
	assert.equal(chatAnfrage(null, 'liste').code, 401);
	assert.equal(chatAnfrage({ ...timo, status: 'gesperrt' }, 'liste').code, 401);
	assert.equal(chatAnfrage(claude, 'liste').code, 403);
	assert.equal(chatAnfrage(timo, 'irgendwas').code, 400);
});

test('Absender kommt aus dem Token, nicht aus den Daten', () => {
	const a = chatAnfrage(timo, 'senden', { chat_id: C, text: 'Hallo', p_mitglied: 'm_kurt', autor: 'm_kurt' });
	assert.equal(a.fn, 'team_chat_senden'); assert.equal(a.body.p_mitglied, 'm_timo');
	assert.equal(chatAnfrage(timo, 'liste', { p_mitglied: 'm_kurt' }).body.p_mitglied, 'm_timo');
});

test('Senden: leer, zu lang, WhatsApp nur für Markierte, ungültige IDs fallen weg', () => {
	assert.equal(chatAnfrage(timo, 'senden', { chat_id: C, text: '  ' }).code, 400);
	assert.equal(chatAnfrage(timo, 'senden', { chat_id: C, text: 'x'.repeat(8001) }).code, 400);
	assert.equal(chatAnfrage(timo, 'senden', { chat_id: 'chat_x', text: 'Hallo' }).code, 400);
	const a = chatAnfrage(timo, 'senden', { chat_id: C, text: 'Hi', erwaehnt: ['m_kurt', 'm_kurt', 'x y', 'm_lillien'], whatsapp: ['m_kurt', 'm_murat'] });
	assert.deepEqual(a.body.p_erwaehnt, ['m_kurt', 'm_lillien']); assert.deepEqual(a.body.p_whatsapp, ['m_kurt']);
});

test('Anlegen: Art, Personen, Name, Projekt', () => {
	assert.equal(chatAnfrage(timo, 'anlegen', { art: 'quatsch', mitglieder: ['m_kurt'] }).code, 400);
	assert.equal(chatAnfrage(timo, 'anlegen', { art: 'gruppe', mitglieder: ['m_timo'], titel: 'Team' }).code, 400, 'nur ich selbst');
	assert.equal(chatAnfrage(timo, 'anlegen', { art: 'direkt', mitglieder: ['m_kurt', 'm_lillien'] }).code, 400);
	assert.equal(chatAnfrage(timo, 'anlegen', { art: 'gruppe', mitglieder: ['m_kurt'], titel: 'x' }).code, 400);
	assert.equal(chatAnfrage(timo, 'anlegen', { art: 'projekt', mitglieder: ['m_kurt'] }).code, 400);
	const a = chatAnfrage(timo, 'anlegen', { art: 'projekt', mitglieder: ['m_kurt', 'm_timo'], projekt: 'Webseite' });
	assert.deepEqual(a.body, { p_mitglied: 'm_timo', p_art: 'projekt', p_titel: '', p_mitglieder: ['m_kurt'], p_projekt: 'Webseite' });
});

test('Ändern: nur bekannte Felder, leer = Fehler', () => {
	assert.equal(chatAnfrage(timo, 'aendern', { chat_id: C }).code, 400);
	const a = chatAnfrage(timo, 'aendern', { chat_id: C, ki_verlauf: true, hinzu: ['m_kurt'], boese: 1, ki: 'ja' });
	assert.deepEqual(a.body.p_aenderung, { ki_verlauf: true, hinzu: ['m_kurt'] });
	assert.equal(chatAnfrage(timo, 'aendern', { chat_id: C, ki_verlauf: 'true' }).code, 400, 'ki_verlauf nur als echtes true/false');
});

test('Antwort: Fehler aus SQL durchreichen, Datenbank fehlt, Netzfehler', () => {
	const liste = chatAnfrage(timo, 'liste');
	assert.deepEqual(chatAntwort(liste, { statusCode: 404, body: { code: 'PGRST202' } }).antwort, { ok: true, vorhanden: false, chats: [] });
	const s = chatAnfrage(timo, 'senden', { chat_id: C, text: 'x' });
	assert.equal(chatAntwort(s, { statusCode: 404, body: { code: 'PGRST202' } }).antwort.fehler, CHAT_NICHT_EINGERICHTET);
	assert.deepEqual(chatAntwort(s, { statusCode: 400, body: { code: 'P0001', message: 'Diesen Chat gibt es nicht oder du bist nicht (mehr) dabei.' } }), { code: 400, antwort: { ok: false, fehler: 'Diesen Chat gibt es nicht oder du bist nicht (mehr) dabei.' } });
	assert.equal(chatAntwort(s, { statusCode: 500, body: 'kaputt' }).code, 502);
	assert.equal(chatAntwort(liste, { statusCode: 200, body: JSON.stringify({ chats: [{ chat_id: C }, { chat_id: 'boese' }] }) }).antwort.chats.length, 1);
});

test('Nachbildung: nur Mitglieder sehen den Chat, Markierung und WhatsApp', () => {
	const M = [{ ...timo, name: 'Timo T', token: 'a'.repeat(32) }, { mitglied_id: 'm_kurt', name: 'Kurt K', status: 'aktiv', typ: 'mensch', token: 'b'.repeat(32) }, { mitglied_id: 'm_lillien', name: 'Lillien L', status: 'aktiv', typ: 'mensch', token: 'c'.repeat(32) }];
	const db = new C_ChatDbNachbildung({ mitglieder: () => M, projekte: () => [{ name: 'Webseite' }] });
	const auf = (wer, aktion, daten) => chatAntwortMock({ token: wer.repeat(32), aktion, daten }, M, db);
	const [c1, a1] = auf('a', 'anlegen', { art: 'gruppe', titel: 'Kursteam', mitglieder: ['m_kurt'] });
	assert.equal(c1, 200); const id = a1.chat.chat_id;
	assert.equal(auf('c', 'liste')[1].chats.length, 0, 'Lillien sieht ihn nicht');
	assert.equal(auf('c', 'verlauf', { chat_id: id })[0], 400);
	auf('a', 'senden', { chat_id: id, text: 'Hallo @Kurt', erwaehnt: ['m_kurt', 'm_lillien'], whatsapp: ['m_kurt'] });
	assert.deepEqual(db.posteingang, [{ absender: 'm_timo', empfaenger: ['m_kurt'], chat_id: id }]);
	assert.equal(db.whatsapp.length, 1);
	assert.equal(auf('b', 'liste')[1].chats[0].ungelesen, 2);
	const [, ae] = auf('b', 'aendern', { chat_id: id, ki_verlauf: true });
	assert.equal(ae.chat.ki_verlauf, true);
	assert.match(db.nachrichten[db.nachrichten.length - 1].text, /^🤖 Kurt hat eingeschaltet/);
});

test('Bearbeiten: Form prüfen, nur der Autor, 24 Stunden, nur neu Markierte bekommen einen Hinweis', () => {
	assert.equal(chatAnfrage(timo, 'bearbeiten', { chat_id: C, nachricht_id: 'x', text: 'a' }).code, 400);
	assert.equal(chatAnfrage(timo, 'bearbeiten', { chat_id: C, nachricht_id: 0, text: 'a' }).code, 400);
	assert.equal(chatAnfrage(timo, 'bearbeiten', { chat_id: C, nachricht_id: 3, text: ' ' }).code, 400);
	assert.equal(chatAnfrage(timo, 'bearbeiten', { chat_id: 'chat_x', nachricht_id: 3, text: 'a' }).code, 400);
	assert.deepEqual(chatAnfrage(timo, 'bearbeiten', { chat_id: C, nachricht_id: '3', text: 'a', erwaehnt: ['m_kurt', 'm_kurt'], whatsapp: ['m_kurt'], p_mitglied: 'm_kurt' }).body,
		{ p_mitglied: 'm_timo', p_chat: C, p_nachricht_id: 3, p_text: 'a', p_erwaehnt: ['m_kurt'] }, 'nie WhatsApp beim Bearbeiten');
	assert.equal(chatAntwort(chatAnfrage(timo, 'bearbeiten', { chat_id: C, nachricht_id: 3, text: 'a' }), { statusCode: 404, body: { code: 'PGRST202' } }).antwort.fehler, CHAT_BEARBEITEN_FEHLT);

	const M = [{ ...timo, name: 'Timo T', token: 'a'.repeat(32) }, { mitglied_id: 'm_kurt', name: 'Kurt K', status: 'aktiv', typ: 'mensch', token: 'b'.repeat(32) }, { mitglied_id: 'm_lillien', name: 'Lillien L', status: 'aktiv', typ: 'mensch', token: 'c'.repeat(32) }];
	let jetzt = '2026-11-23T10:00:00.000Z';
	const db = new C_ChatDbNachbildung({ mitglieder: () => M, jetzt: () => jetzt });
	const auf = (wer, aktion, daten) => chatAntwortMock({ token: wer.repeat(32), aktion, daten }, M, db);
	const id = auf('a', 'anlegen', { art: 'gruppe', titel: 'Kursteam', mitglieder: ['m_kurt', 'm_lillien'] })[1].chat.chat_id;
	const n = auf('a', 'senden', { chat_id: id, text: 'Hallo @Kurt', erwaehnt: ['m_kurt'] })[1].nachricht;
	const kurtSieht = auf('b', 'verlauf', { chat_id: id })[1];
	const kurtBis = kurtSieht.nachrichten[kurtSieht.nachrichten.length - 1].nachricht_id;
	db.posteingang = [];
	// Nur der Autor
	assert.match(auf('b', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'gefälscht' })[1].fehler, /nur, wer die Nachricht geschrieben hat/);
	// Lillien neu markiert → nur sie bekommt einen Hinweis; Kurt war schon markiert
	jetzt = '2026-11-23T10:03:00.000Z';
	const [c1, a1] = auf('a', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'Hallo @Kurt und @Lillien', erwaehnt: ['m_kurt', 'm_lillien'] });
	assert.equal(c1, 200); assert.deepEqual(a1.benachrichtigt, ['m_lillien']); assert.equal(a1.nachricht.bearbeitet, jetzt);
	assert.deepEqual(db.posteingang.map(p => p.empfaenger), [['m_lillien']]);
	assert.deepEqual(db.fassungen.map(f => [f.text, f.erwaehnt]), [['Hallo @Kurt', ['m_kurt']]]);
	// Kurt holt nur Neues (nach) und bekommt die bearbeitete Nachricht trotzdem mit
	const nach = auf('b', 'verlauf', { chat_id: id, nach: kurtBis })[1];
	assert.deepEqual(nach.nachrichten, []); assert.deepEqual(nach.bearbeitete.map(x => x.text), ['Hallo @Kurt und @Lillien']);
	// Lillien raus, wieder rein: kein zweiter Hinweis (war in einer früheren Fassung markiert)
	auf('a', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'Hallo @Kurt', erwaehnt: ['m_kurt'] });
	auf('a', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'Hallo @Kurt @Lillien!', erwaehnt: ['m_kurt', 'm_lillien'] });
	assert.equal(db.posteingang.length, 1); assert.equal(db.fassungen.length, 3);
	// Gleicher Text und gleiche Markierungen: nichts gespeichert
	assert.equal(auf('a', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'Hallo @Kurt @Lillien!', erwaehnt: ['m_lillien', 'm_kurt'] })[1].unveraendert, true);
	assert.equal(db.fassungen.length, 3);
	// Hinweise des Portals (ohne Autor) kann niemand bearbeiten; nach 24 Stunden geht es nicht mehr
	const hinweis = db.nachrichten.find(x => !x.autor);
	assert.equal(auf('a', 'bearbeiten', { chat_id: id, nachricht_id: hinweis.nachricht_id, text: 'x' })[0], 400);
	jetzt = '2026-11-24T10:00:01.000Z';
	assert.match(auf('a', 'bearbeiten', { chat_id: id, nachricht_id: n.nachricht_id, text: 'zu spät' })[1].fehler, /24 Stunden/);
});

test('Eingebetteter Code läuft ohne URL und ohne require (wie im n8n-Code-Knoten)', () => {
	const lib = readFileSync(new URL('../lib/chat.js', import.meta.url), 'utf8').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
	const kiste = vm.createContext({ JSON, String, Number, Math, Array, Object, RegExp });
	vm.runInContext(lib + '\nthis.f = { chatAnfrage, chatAntwort };', kiste);
	assert.equal(vm.runInContext('typeof URL + typeof require', kiste), 'undefinedundefined');
	const a = kiste.f.chatAnfrage(timo, 'senden', { chat_id: C, text: 'Hallo', erwaehnt: ['m_kurt'], whatsapp: ['m_kurt'] });
	assert.equal(a.fn, 'team_chat_senden');
	assert.equal(kiste.f.chatAntwort(a, { statusCode: 200, body: { nachricht: { nachricht_id: 1 } } }).code, 200);
	const gen = readFileSync(new URL('../n8n/chat.workflow.gen.js', import.meta.url), 'utf8');
	assert.ok(gen.includes(JSON.stringify(lib)), 'Generierte n8n-Datei ist aktuell (node chat/n8n/bauen-chat.mjs)');
	assert.ok(!/require\(|crypto/.test(lib));
});
