// Logik-Tests für die Nachrichten im Team-Portal: Prüfung der Anfragen, Auswertung der Datenbank-Antworten,
// Nachbildung der SQL-Funktionen und der Weg über den Testserver (wie der n8n-Workflow „TEAM: Nachrichten (Portal)“).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MSGS_TEXT_MAX, MSGS_EMPFAENGER_MAX, empfaengerLesen, msgsAnfrage, msgsAntwort } from '../lib/nachrichten.js';
import { C_MsgsDbNachbildung, msgsAntwortMock } from '../dev/mock.mjs';
import { serverStarten, post } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (...p) => readFileSync(join(REPO, ...p), 'utf8').replace(/\r\n/g, '\n');
const timo = { mitglied_id: 'm_timo', rolle: 'admin', status: 'aktiv', typ: 'mensch', token: TOKENS.m_timo };
const kurt = { mitglied_id: 'm_kurt', rolle: 'dozent', status: 'aktiv', typ: 'mensch', token: TOKENS.m_kurt };
const lillien = { mitglied_id: 'm_lillien', rolle: 'team', status: 'aktiv', typ: 'mensch', token: TOKENS.m_lillien };
const gesperrt = { mitglied_id: 'm_gesperrt', rolle: 'team', status: 'gesperrt', typ: 'mensch', token: TOKENS.m_gesperrt };
const MITGLIEDER = [timo, kurt, lillien, gesperrt];

test('Empfänger: nur gültige IDs, ohne Doppelte, Reihenfolge bleibt', () => {
	assert.deepEqual(empfaengerLesen(['m_kurt', ' m_timo ', 'm_kurt', '', null, 'a b', '<x>', 'kurs:Max']), ['m_kurt', 'm_timo', 'kurs:Max']);
	assert.deepEqual(empfaengerLesen('m_kurt'), ['m_kurt']);
	assert.deepEqual([undefined, null, 5, {}, ''].map(empfaengerLesen), [[], [], [], [], []]);
});

test('Anfrage: Zugang nötig, Absender ist immer das angemeldete Mitglied', () => {
	assert.equal(msgsAnfrage(null, 'laden', {}).code, 401);
	assert.equal(msgsAnfrage(gesperrt, 'laden', {}).code, 401);
	assert.deepEqual(msgsAnfrage(kurt, 'laden', {}), { aktion: 'rpc', was: 'laden', fn: 'team_msgs_laden', body: { p_mitglied: 'm_kurt', p_max: 300 } });
	const s = msgsAnfrage(kurt, 'senden', { empfaenger: ['m_timo', 'm_kurt'], text: 'Hallo\r\n**Welt**', absender: 'm_timo', p_absender: 'm_timo' });
	assert.deepEqual(s, { aktion: 'rpc', was: 'senden', fn: 'team_msgs_senden', body: { p_absender: 'm_kurt', p_empfaenger: ['m_timo', 'm_kurt'], p_text: 'Hallo\n**Welt**' } });
	assert.deepEqual(msgsAnfrage(kurt, 'oeffnen', { msg_id: 'msg_1' }).body, { p_mitglied: 'm_kurt', p_msg_id: 'msg_1' });
	assert.equal(msgsAnfrage(kurt, 'ungelesen', { msg_id: 'msg_1' }).fn, 'team_msgs_ungelesen');
	// Fremde Liste lässt sich nicht angeben: p_mitglied kommt nie aus den Daten
	assert.equal(msgsAnfrage(kurt, 'laden', { p_mitglied: 'm_timo' }).body.p_mitglied, 'm_kurt');
});

test('Anfrage: Eingaben werden geprüft', () => {
	const f = (aktion, daten) => msgsAnfrage(kurt, aktion, daten);
	assert.equal(f('senden', { empfaenger: [], text: 'x' }).code, 400);
	assert.equal(f('senden', { empfaenger: ['m_timo'], text: '   ' }).code, 400);
	assert.equal(f('senden', { empfaenger: ['m_timo'], text: 42 }).code, 400);
	assert.equal(f('senden', { empfaenger: ['m_timo'], text: 'x'.repeat(MSGS_TEXT_MAX + 1) }).code, 400);
	assert.equal(f('senden', { empfaenger: Array.from({ length: MSGS_EMPFAENGER_MAX + 1 }, (_, i) => 'm_' + i), text: 'x' }).code, 400);
	assert.equal(f('oeffnen', { msg_id: '' }).code, 400);
	assert.equal(f('oeffnen', { msg_id: "x'; drop table" }).code, 400);
	assert.equal(f('loeschen', {}).code, 400);
	assert.equal(f('', {}).code, 400);
});

test('Antwort: Erfolg, fehlende Datenbank, Fehler aus SQL, sonstige Fehler', () => {
	const laden = msgsAnfrage(kurt, 'laden', {}), senden = msgsAnfrage(kurt, 'senden', { empfaenger: ['m_timo'], text: 'x' });
	const ok = msgsAntwort(laden, { statusCode: 200, body: JSON.stringify({ liste: [{ msg_id: 'msg_1', gelesen: 'ja' }, { msg_id: '' }, null], nachrichten: [{ msg_id: 'msg_1', text: 'a' }, { x: 1 }] }) });
	assert.deepEqual(ok, { code: 200, antwort: { ok: true, vorhanden: true, liste: [{ msg_id: 'msg_1', gelesen: false }], nachrichten: [{ msg_id: 'msg_1', text: 'a' }] } });
	// Datenbank noch nicht eingerichtet: laden → leere Liste, sonst verständliche Meldung
	for (const fehlt of [{ statusCode: 404, body: { code: 'PGRST202' } }, { statusCode: 404, body: { code: '42P01' } }, { statusCode: 404, body: '' }]) {
		assert.deepEqual(msgsAntwort(laden, fehlt), { code: 200, antwort: { ok: true, vorhanden: false, liste: [], nachrichten: [] } });
		assert.equal(msgsAntwort(senden, fehlt).code, 503);
	}
	const sql = msgsAntwort(senden, { statusCode: 400, body: { code: 'P0001', message: 'Unbekannte oder gesperrte Empfänger: m_x' } });
	assert.deepEqual(sql, { code: 400, antwort: { ok: false, fehler: 'Unbekannte oder gesperrte Empfänger: m_x' } });
	assert.equal(msgsAntwort(senden, { statusCode: 500, body: { code: 'XX000', message: 'interner Fehler mit Details' } }).code, 502);
	assert.equal(msgsAntwort(laden, { statusCode: 0 }).code, 502, 'Netzfehler ist keine fehlende Datenbank');
});

test('Nachbildung: senden, laden, öffnen (Empfangszeit nur beim ersten Mal), als ungelesen zurücklegen', () => {
	let uhr = Date.parse('2026-11-16T08:00:00Z');
	const db = new C_MsgsDbNachbildung({ mitglieder: () => MITGLIEDER, jetzt: () => new Date(uhr).toISOString() });
	const rufe = (wer, aktion, daten) => msgsAntwortMock({ token: wer.token, aktion, daten }, MITGLIEDER, db);
	// leere Liste
	assert.deepEqual(rufe(kurt, 'laden')[1].liste, []);
	// an sich selbst und an Timo; doppelte Empfänger zählen einmal
	const [c1, a1] = rufe(kurt, 'senden', { empfaenger: ['m_kurt', 'm_timo', 'm_kurt'], text: 'Erste **Nachricht**' });
	assert.equal(c1, 200); const id1 = a1.nachricht.msg_id;
	assert.deepEqual(a1.nachricht.empfaenger, ['m_kurt', 'm_timo']); assert.equal(a1.nachricht.absender, 'm_kurt');
	uhr += 60000;
	const id2 = rufe(timo, 'senden', { empfaenger: ['m_lillien', 'm_kurt'], text: 'Zweite' })[1].nachricht.msg_id;
	// Lillien sieht nur die zweite Nachricht, Kurt beide (neueste zuerst), alle ungelesen
	assert.deepEqual(rufe(lillien, 'laden')[1].liste, [{ msg_id: id2, gelesen: false }]);
	const k = rufe(kurt, 'laden')[1];
	assert.deepEqual(k.liste, [{ msg_id: id2, gelesen: false }, { msg_id: id1, gelesen: false }]);
	assert.equal(k.nachrichten.length, 2);
	// Fremde Nachricht öffnen geht nicht
	assert.equal(rufe(lillien, 'oeffnen', { msg_id: id1 })[0], 400);
	// erstes Öffnen setzt die Empfangszeit, zweites nicht
	uhr += 60000; const t1 = new Date(uhr).toISOString();
	const o1 = rufe(kurt, 'oeffnen', { msg_id: id1 })[1];
	assert.equal(o1.nachricht.empfangen.m_kurt, t1); assert.equal(o1.nachricht.empfangen.m_timo, undefined);
	uhr += 60000;
	assert.equal(rufe(kurt, 'oeffnen', { msg_id: id1 })[1].nachricht.empfangen.m_kurt, t1);
	assert.deepEqual(rufe(kurt, 'laden')[1].liste.find(e => e.msg_id === id1), { msg_id: id1, gelesen: true });
	// Wiedervorlage: wieder ungelesen, Empfangszeit bleibt
	assert.equal(rufe(kurt, 'ungelesen', { msg_id: id1 })[0], 200);
	const nach = rufe(kurt, 'laden')[1];
	assert.deepEqual(nach.liste.find(e => e.msg_id === id1), { msg_id: id1, gelesen: false });
	assert.equal(nach.nachrichten.find(m => m.msg_id === id1).empfangen.m_kurt, t1);
	// Timos Lesestand ist unabhängig von Kurts
	assert.deepEqual(rufe(timo, 'laden')[1].liste, [{ msg_id: id1, gelesen: false }]);
	// gesperrte oder unbekannte Empfänger werden abgelehnt, ohne dass etwas gespeichert wird
	const vorher = db.msgs.length;
	const [c3, a3] = rufe(kurt, 'senden', { empfaenger: ['m_timo', 'm_gesperrt', 'm_gibtsnicht'], text: 'x' });
	assert.equal(c3, 400); assert.match(a3.fehler, /m_gesperrt, m_gibtsnicht/); assert.equal(db.msgs.length, vorher);
	// gesperrte Mitglieder kommen nicht an ihre Liste
	assert.equal(rufe(gesperrt, 'laden')[0], 401);
});

test('Ohne Datenbank: laden liefert eine leere Liste, senden eine verständliche Meldung', () => {
	const db = new C_MsgsDbNachbildung({ eingerichtet: false, mitglieder: () => MITGLIEDER });
	assert.deepEqual(msgsAntwortMock({ token: kurt.token, aktion: 'laden' }, MITGLIEDER, db), [200, { ok: true, vorhanden: false, liste: [], nachrichten: [], testadapter: true }]);
	const [c, a] = msgsAntwortMock({ token: kurt.token, aktion: 'senden', daten: { empfaenger: ['m_timo'], text: 'x' } }, MITGLIEDER, db);
	assert.equal(c, 503); assert.match(a.fehler, /noch nicht eingerichtet/);
});

test('n8n-Datei ist aktuell und enthält die getestete Logik wortgleich', () => {
	const vorher = lies('nachrichten', 'n8n', 'nachrichten.workflow.gen.js');
	execFileSync(process.execPath, [join(REPO, 'nachrichten', 'n8n', 'bauen-nachrichten.mjs')], { stdio: 'ignore' });
	const gen = lies('nachrichten', 'n8n', 'nachrichten.workflow.gen.js');
	assert.equal(gen, vorher, 'nachrichten.workflow.gen.js neu bauen: node nachrichten/n8n/bauen-nachrichten.mjs');
	const lib = lies('nachrichten', 'lib', 'nachrichten.js').replace(/^export \{[^}]*\};?\s*$/m, '');
	assert.ok(gen.includes(JSON.stringify(lib)), 'Logik eingebettet');
	assert.match(gen, /path: 'team-msgs'/);
	assert.doesNotMatch(gen, /service_role|eyJ[\w-]{20,}/, 'kein Schlüssel in der Datei');
});

test('Portal und SQL passen zusammen', () => {
	const html = lies('docs', 'team', 'index.html'), sql = lies('supabase', 'team_nachrichten.sql');
	assert.match(html, /const MSGS_API = 'https:\/\/n8n\.hm-storage\.de\/webhook\/team-msgs';/);
	assert.match(html, /class C_MsgsList_Global \{/); assert.match(html, /class C_MsgsList_User \{/);
	assert.match(html, /const MsgsList_Global = C_MsgsList_Global\.instanz;/); assert.match(html, /const MsgsList_User = C_MsgsList_User\.instanz;/);
	assert.ok(html.includes('const MSGS_TEXT_MAX = ' + MSGS_TEXT_MAX + ';'), 'gleiche Höchstlänge im Portal');
	for (const fn of ['team_msgs_senden', 'team_msgs_laden', 'team_msgs_oeffnen', 'team_msgs_ungelesen']) {
		assert.match(sql, new RegExp('create or replace function ' + fn + '\\('));
		assert.match(sql, new RegExp('grant execute on function ' + fn + '\\(.*service_role'));
	}
});

// Weg über den Testserver (HTTP), wie ihn das Portal benutzt
let S;
before(async () => { S = await serverStarten({ tempo: 0 }); });
after(async () => { if (S) await S.stop(); });

test('Testserver: /api/nachrichten mit und ohne eingerichtete Datenbank', async () => {
	await post(S.base, '/api/test/nachrichten', { eingerichtet: false });
	let r = await post(S.base, '/api/nachrichten', { token: TOKENS.m_kurt, aktion: 'laden' });
	assert.equal(r.status, 200); assert.equal(r.j.vorhanden, false); assert.deepEqual(r.j.liste, []);
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	r = await post(S.base, '/api/nachrichten', { token: TOKENS.m_timo, aktion: 'senden', daten: { empfaenger: ['m_kurt', 'm_lillien'], text: 'Hallo Team' } });
	assert.equal(r.status, 200); assert.equal(r.j.nachricht.absender, 'm_timo');
	r = await post(S.base, '/api/nachrichten', { token: TOKENS.m_kurt, aktion: 'laden' });
	assert.equal(r.j.vorhanden, true); assert.equal(r.j.liste.length, 1); assert.equal(r.j.liste[0].gelesen, false);
	r = await post(S.base, '/api/nachrichten', { token: 'ffffffffffffffffffffffffffffffff', aktion: 'laden' });
	assert.equal(r.status, 401);
});
