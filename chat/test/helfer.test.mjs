// Tests für chat/lib/helfer.js (Sprachnachricht → Text, KI korrigieren) und die Nachbildung chat/dev/helfer-mock.mjs.
// Start: node --test chat/test/helfer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { helferAnfrage, transkriptAntwort, korrekturAntwort, markierungenIn, HELFER_TEXT_MAX } from '../lib/helfer.js';
import { helferAntwortMock, multipartLesen, MOCK_TRANSKRIPT } from '../dev/helfer-mock.mjs';

const kurt = { mitglied_id: 'm_kurt', rolle: 'team', status: 'aktiv', typ: 'mensch' };
const llm = text => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ text }) } }] } });

test('Zugang: alle Menschen im Team, keine Agenten, keine Gesperrten', () => {
	assert.equal(helferAnfrage(null, { aktion: 'korrigieren', text: 'x' }).code, 401);
	assert.equal(helferAnfrage({ ...kurt, status: 'gesperrt' }, { aktion: 'korrigieren', text: 'x' }).code, 401);
	assert.equal(helferAnfrage({ ...kurt, typ: 'agent', rolle: 'agent' }, { aktion: 'korrigieren', text: 'x' }).code, 403);
	assert.equal(helferAnfrage(kurt, { aktion: 'loeschen' }).code, 400);
	for (const rolle of ['team', 'dozent', 'vertrieb', 'admin']) assert.equal(helferAnfrage({ ...kurt, rolle }, { aktion: 'korrigieren', text: 'hallo' }).aktion, 'korrigieren', rolle);
});

test('Korrigieren: Text prüfen, Prompt schützt Inhalt und @-Markierungen', () => {
	assert.equal(helferAnfrage(kurt, { aktion: 'korrigieren', text: '   ' }).code, 400);
	assert.equal(helferAnfrage(kurt, { aktion: 'korrigieren', text: 'x'.repeat(HELFER_TEXT_MAX + 1) }).code, 400);
	const a = helferAnfrage(kurt, { aktion: 'korrigieren', text: 'hallo @kurt\r\nwie gehts' });
	assert.equal(a.original, 'hallo @kurt\nwie gehts'); assert.equal(a.user, a.original); assert.equal(a.modell, 'gpt-5-mini');
	assert.match(a.system, /ausschließlich Rechtschreibung/); assert.match(a.system, /@-Markierungen/); assert.match(a.system, /Nichts hinzufügen/);
});

test('Transkribieren: Aufnahme nötig, Größe, Typ, höchstens 5 Minuten', () => {
	assert.equal(helferAnfrage(kurt, { aktion: 'transkribieren' }, null).code, 400);
	assert.equal(helferAnfrage(kurt, { aktion: 'transkribieren' }, { mimeType: 'audio/webm', fileSize: 26 * 1024 * 1024 }).code, 413);
	assert.equal(helferAnfrage(kurt, { aktion: 'transkribieren' }, { mimeType: 'image/png', fileSize: 1000 }).code, 415);
	assert.equal(helferAnfrage(kurt, { aktion: 'transkribieren', dauer_sek: 301 }, { mimeType: 'audio/webm', fileSize: 1000 }).code, 413);
	const a = helferAnfrage(kurt, { aktion: 'transkribieren', dauer_sek: '12' }, { mimeType: 'audio/webm;codecs=opus', fileSize: 5000 });
	assert.equal(a.aktion, 'transkribieren'); assert.equal(a.dauer_sek, 12); assert.match(a.prompt, /Team-Chat/);
});

test('Transkript auswerten: Text, leer, Fehler von OpenAI', () => {
	const ok = transkriptAntwort({ statusCode: 200, body: { text: '  Hallo Team  ' } }, 60);
	assert.equal(ok.code, 200); assert.equal(ok.antwort.text, 'Hallo Team'); assert.equal(ok.antwort.kosten.usd, 0.003);
	assert.equal(transkriptAntwort({ statusCode: 200, body: { text: '  ' } }, 3).code, 422);
	const f = transkriptAntwort({ statusCode: 401, body: { error: { message: 'Incorrect API key' } } }, 3);
	assert.equal(f.code, 502); assert.match(f.antwort.fehler, /Incorrect API key/);
	assert.equal(transkriptAntwort({ statusCode: 200, body: JSON.stringify({ text: 'aus Text' }) }, 3).antwort.text, 'aus Text');
});

test('Korrektur auswerten: geändert, unverändert, Sicherheitsnetz', () => {
	assert.deepEqual(korrekturAntwort('ich glaube das ich morgen komme', llm('Ich glaube, dass ich morgen komme.')).antwort, { ok: true, text: 'Ich glaube, dass ich morgen komme.', geaendert: true });
	assert.equal(korrekturAntwort('Alles gut.', llm('Alles gut.')).antwort.geaendert, false);
	assert.equal(korrekturAntwort('Alles gut. ', llm('Alles gut.')).antwort.text, 'Alles gut. ', 'nur Leerzeichen: Original bleibt');
	// Codezaun um das JSON
	assert.equal(korrekturAntwort('hallo', { statusCode: 200, body: { choices: [{ message: { content: '```json\n{"text":"Hallo."}\n```' } }] } }).antwort.text, 'Hallo.');
	// Kein Ergebnis, kaputtes JSON, OpenAI-Fehler → Original mit Hinweis
	for (const http of [{ statusCode: 500, body: {} }, { statusCode: 200, body: { choices: [{ message: { content: 'kein json' } }] } }, null]) {
		const r = korrekturAntwort('mein text', http).antwort;
		assert.equal(r.text, 'mein text'); assert.equal(r.geaendert, false); assert.ok(r.hinweis);
	}
	// Zu viel verändert (Länge) → Original
	assert.match(korrekturAntwort('Treffen morgen um zehn im Büro mit allen', llm('Treffen.')).antwort.hinweis, /zu viel verändert/);
	// @-Markierung verloren oder erfunden → Original
	assert.match(korrekturAntwort('hallo @kurt kommst du', llm('Hallo Kurt, kommst du?')).antwort.hinweis, /@-Markierungen/);
	assert.match(korrekturAntwort('hallo kommst du', llm('Hallo @kurt, kommst du?')).antwort.hinweis, /@-Markierungen/);
	assert.equal(korrekturAntwort('hallo @Anna_Müller kommst du', llm('Hallo @Anna_Müller, kommst du?')).antwort.geaendert, true);
	assert.deepEqual(markierungenIn('@kurt. mail@kurt.de und (@Lillien)'), ['@kurt', '@lillien']);
});

test('Nachbildung: multipart lesen, transkribieren und korrigieren ohne OpenAI', () => {
	const M = [{ ...kurt, token: 'b'.repeat(32) }];
	const g = 'xyz';
	const roh = Buffer.from(`--${g}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${'b'.repeat(32)}\r\n--${g}\r\nContent-Disposition: form-data; name="aktion"\r\n\r\nkorrigieren\r\n--${g}\r\nContent-Disposition: form-data; name="text"\r\n\r\nich glaube das ich komme\r\n--${g}--\r\n`, 'utf8');
	const teile = multipartLesen(roh, 'multipart/form-data; boundary=' + g);
	assert.equal(teile.felder.aktion, 'korrigieren'); assert.equal(teile.datei, null);
	const [c, a] = helferAntwortMock(teile, M);
	assert.equal(c, 200); assert.equal(a.text, 'Ich glaube dass ich komme.'); assert.equal(a.geaendert, true);
	const [c2, a2] = helferAntwortMock({ felder: { token: 'b'.repeat(32), aktion: 'transkribieren', dauer_sek: 4 }, datei: { mimeType: 'audio/webm', fileSize: 4000 } }, M);
	assert.equal(c2, 200); assert.equal(a2.text, MOCK_TRANSKRIPT);
	assert.equal(helferAntwortMock({ felder: { token: 'b'.repeat(32), aktion: 'korrigieren', text: 'x' } }, M, { eingerichtet: false })[0], 404);
});

test('Eingebetteter Code läuft ohne URL und require, n8n-Datei ist aktuell', () => {
	const lib = readFileSync(new URL('../lib/helfer.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^export \{[^}]*\};?\s*$/m, '').replace(/^export /gm, '');
	const kiste = vm.createContext({ JSON, String, Number, Math, Array, Object, RegExp });
	vm.runInContext(lib + '\nthis.f = { helferAnfrage, korrekturAntwort, transkriptAntwort };', kiste);
	assert.equal(vm.runInContext('typeof URL + typeof require', kiste), 'undefinedundefined');
	assert.equal(kiste.f.helferAnfrage(kurt, { aktion: 'korrigieren', text: 'hi' }).aktion, 'korrigieren');
	assert.equal(kiste.f.korrekturAntwort('hi', llm('Hi.')).antwort.text, 'Hi.');
	const pfad = new URL('../n8n/helfer.workflow.gen.js', import.meta.url);
	const vorher = readFileSync(pfad, 'utf8');
	execFileSync(process.execPath, [new URL('../n8n/bauen-helfer.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'ignore' });
	const gen = readFileSync(pfad, 'utf8');
	assert.equal(gen, vorher, 'neu bauen: node chat/n8n/bauen-helfer.mjs');
	assert.ok(gen.includes(JSON.stringify(lib)), 'Logik eingebettet');
	assert.match(gen, /path: 'team-chat-helfer'/); assert.match(gen, /newCredential\('OpenAI account'\)/);
	assert.doesNotMatch(gen, /sk-[A-Za-z0-9]{10,}|service_role|eyJ[\w-]{20,}/, 'kein Schlüssel in der Datei');
	assert.ok(!/require\(|crypto/.test(lib));
});

test('Portal: Adresse und Meldung passen zum Workflow', () => {
	const html = readFileSync(new URL('../../docs/team/index.html', import.meta.url), 'utf8');
	assert.match(html, /const HELFER_API = 'https:\/\/n8n\.hm-storage\.de\/webhook\/team-chat-helfer';/);
	assert.match(html, /id="ch_kik"/); assert.match(html, /id="ch_mic"/);
});
