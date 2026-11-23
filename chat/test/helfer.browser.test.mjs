// Browsertest: Sprachnachricht (🎙️) und Haken „KI korrigieren“ im Team-Chat gegen den Testserver (Testadapter, kein n8n, kein OpenAI).
// Das Mikrofon ist ein simuliertes Gerät von Chrome (--use-fake-device-for-media-stream). Braucht Playwright; ohne wird übersprungen.
// Im Worktree: NODE_PATH auf node_modules des Hauptordners.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';
import { MOCK_TRANSKRIPT } from '../dev/helfer-mock.mjs';

const SHOTS = join(REPO, 'chat', 'screenshots');
const DESKTOP = { width: 1280, height: 860 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [];

function playwright() {
	const orte = [process.cwd() + '/'];
	for (const p of String(process.env.NODE_PATH || '').split(/[;:](?![\\/])/).filter(Boolean)) orte.push(p.replace(/[\\/]?$/, '/'));
	try { orte.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {}
	for (const name of ['playwright', 'playwright-core']) for (const o of orte) { try { return { pw: createRequire(o)(name), name }; } catch (e) {} }
	return null;
}
before(async () => {
	mkdirSync(SHOTS, { recursive: true });
	S = await serverStarten({ tempo: 0 });
	const p = playwright();
	const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
	if (p) { try { B = await p.pw.chromium.launch(p.name === 'playwright-core' ? { channel: 'chrome', args } : { args }); } catch (e) { B = null; } }
});
after(async () => {
	if (S) await S.stop();
	if (B) { const zu = await Promise.race([B.close().then(() => true), new Promise(r => setTimeout(() => r(false), 5000))]); if (!zu) setTimeout(() => process.exit(process.exitCode || 0), 2000).unref(); }
});

async function seite(vp, name, wer, hash) {
	const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin', permissions: ['microphone'] });
	const p = await ctx.newPage();
	p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
	p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
	await p.route(u => !u.href.startsWith(S.base), r => r.abort());
	const um = (muster, ziel) => p.route(muster, async r => {
		const req = r.request();
		const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': req.headers()['content-type'] || 'text/plain' }, body: req.postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	await um(/webhook\/team-api-v2/, '/api/team');
	await um(/webhook\/team-msgs/, '/api/nachrichten');
	await um(/webhook\/team-chat-helfer/, '/api/chat-helfer');
	await um(/webhook\/team-chat$/, '/api/chat');
	await p.route(/webhook\/(?!team-api-v2|team-msgs|team-chat)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	await p.goto(S.base + '/team/?z=' + TOKENS[wer] + hash, { waitUntil: 'networkidle' });
	await p.waitForTimeout(400);
	return p;
}
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).chat;
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });
const vonTimo = async g => (await zustand()).nachrichten.filter(n => n.chat_id === g && n.autor === 'm_timo').map(n => n.text);

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Haken „KI korrigieren“: erst zeigen, Rückgängig, zweites Senden schickt; Haken bleibt gemerkt', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/chat-helfer', { eingerichtet: true });
	const g = (await post(S.base, '/api/chat', { token: TOKENS.m_timo, aktion: 'anlegen', daten: { art: 'gruppe', titel: 'Helfer-Test', mitglieder: ['m_kurt'] } })).j.chat.chat_id;
	const p = await seite(DESKTOP, 'timo-ki', 'm_timo', '#/chat/' + g);
	assert.equal(await p.isChecked('#ch_kik'), false, 'Haken anfangs aus');
	await p.check('#ch_kik');
	await p.fill('#ch_text', 'ich glaube das ich morgen komme');
	await p.press('#ch_text', 'Enter');
	await p.waitForTimeout(500);
	assert.equal(await p.inputValue('#ch_text'), 'Ich glaube dass ich morgen komme.', 'korrigierte Fassung im Feld');
	assert.match(await p.locator('#ch_mstat').innerText(), /Korrigiert\. Prüfen und nochmal Senden/);
	assert.deepEqual(await vonTimo(g), [], 'noch nichts gesendet');
	await shot(p, 'chat-ki-korrigiert', DESKTOP);
	// Rückgängig holt den eigenen Text zurück, Senden schickt ihn so
	await p.click('#ch_rueck');
	assert.equal(await p.inputValue('#ch_text'), 'ich glaube das ich morgen komme');
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(500);
	assert.deepEqual(await vonTimo(g), ['ich glaube das ich morgen komme']);
	// Neue Nachricht: korrigieren, dann mit dem zweiten Senden die korrigierte Fassung schicken
	await p.fill('#ch_text', 'passt');
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(400);
	assert.equal(await p.inputValue('#ch_text'), 'Passt.');
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(500);
	assert.deepEqual(await vonTimo(g), ['ich glaube das ich morgen komme', 'Passt.']);
	assert.equal(await p.inputValue('#ch_text'), '');
	// Nichts zu korrigieren: geht gleich raus
	await p.fill('#ch_text', 'Alles klar.');
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(600);
	assert.deepEqual((await vonTimo(g)).slice(-1), ['Alles klar.']);
	// Haken bleibt nach dem Neuladen gesetzt
	await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(400);
	assert.equal(await p.isChecked('#ch_kik'), true);
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Sprachnachricht: 🎙️ aufnehmen, ⏹ stoppen, Text steht im Feld und wird erst mit Senden geschickt', async t => {
	if (!B) return t.skip();
	const g = (await post(S.base, '/api/chat', { token: TOKENS.m_timo, aktion: 'anlegen', daten: { art: 'gruppe', titel: 'Sprach-Test', mitglieder: ['m_kurt'] } })).j.chat.chat_id;
	const p = await seite(DESKTOP, 'timo-mic', 'm_timo', '#/chat/' + g);
	await p.uncheck('#ch_kik');
	await p.fill('#ch_text', 'Kurz vorweg:');
	await p.click('#ch_mic');
	await p.waitForTimeout(1800);
	assert.match(await p.locator('#ch_mic').innerText(), /⏹ 0:0[12]/);
	assert.match(await p.locator('#ch_mstat').innerText(), /Aufnahme läuft/);
	await shot(p, 'chat-sprachnachricht-aufnahme', DESKTOP);
	await p.click('#ch_mic');
	await p.waitForTimeout(1200);
	assert.equal(await p.inputValue('#ch_text'), 'Kurz vorweg: ' + MOCK_TRANSKRIPT, 'Text angehängt');
	assert.match(await p.locator('#ch_mstat').innerText(), /Eingefügt/);
	assert.equal(await p.locator('#ch_mic').innerText(), '🎙️');
	assert.deepEqual(await vonTimo(g), [], 'nichts automatisch gesendet');
	await shot(p, 'chat-sprachnachricht-text', DESKTOP);
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(500);
	assert.deepEqual(await vonTimo(g), ['Kurz vorweg: ' + MOCK_TRANSKRIPT]);
	await p.close();

	// Handy: Mikrofon und Haken passen in die Zeile, keine Querlaufleiste
	const m = await seite(MOBIL, 'mobil-mic', 'm_timo', '#/chat/' + g);
	assert.equal(await m.locator('#ch_mic').isVisible(), true);
	assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'keine Querlaufleiste');
	await m.locator('#ch_text').scrollIntoViewIfNeeded();
	await shot(m, 'chat-sprachnachricht', MOBIL);
	await m.close();
	assert.deepEqual(fehler, []);
});

test('Ohne Workflow: verständliche Meldung, nichts gesendet', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/chat-helfer', { eingerichtet: false });
	const g = (await post(S.base, '/api/chat', { token: TOKENS.m_timo, aktion: 'anlegen', daten: { art: 'gruppe', titel: 'Ohne-Helfer', mitglieder: ['m_kurt'] } })).j.chat.chat_id;
	const p = await seite(DESKTOP, 'ohne', 'm_timo', '#/chat/' + g);
	await p.check('#ch_kik');
	await p.fill('#ch_text', 'hallo');
	await p.press('#ch_text', 'Enter'); await p.waitForTimeout(500);
	assert.match(await p.locator('#ch_mstat').innerText(), /noch nicht eingerichtet.*Nicht gesendet/s);
	assert.deepEqual(await vonTimo(g), []);
	assert.equal(await p.inputValue('#ch_text'), 'hallo');
	await p.close();
	await post(S.base, '/api/test/chat-helfer', { eingerichtet: true });
	assert.deepEqual(fehler, []);
});
