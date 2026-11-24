// Browsertest: im Team-Chat auf eine Nachricht antworten (Zitat) und mit Smileys reagieren, gegen den Testserver (kein n8n).
// Braucht Playwright; ohne wird übersprungen. Im Worktree: NODE_PATH auf node_modules des Hauptordners.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

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
	if (p) { try { B = await p.pw.chromium.launch(p.name === 'playwright-core' ? { channel: 'chrome' } : {}); } catch (e) { B = null; } }
});
after(async () => {
	if (S) await S.stop();
	if (B) { const zu = await Promise.race([B.close().then(() => true), new Promise(r => setTimeout(() => r(false), 5000))]); if (!zu) setTimeout(() => process.exit(process.exitCode || 0), 2000).unref(); }
});

async function seite(vp, name, wer, hash) {
	const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
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

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Smiley-Reaktion setzen und wegnehmen, auf eine Nachricht antworten, Zitat anspringen', async t => {
	if (!B) return t.skip();
	const g = (await post(S.base, '/api/chat', { token: TOKENS.m_timo, aktion: 'anlegen', daten: { art: 'gruppe', titel: 'Reaktionen-Test', mitglieder: ['m_kurt'] } })).j.chat.chat_id;
	const frage = (await post(S.base, '/api/chat', { token: TOKENS.m_kurt, aktion: 'senden', daten: { chat_id: g, text: 'Treffen wir uns morgen um 10?' } })).j.nachricht.nachricht_id;
	for (let i = 1; i <= 6; i++) await post(S.base, '/api/chat', { token: TOKENS.m_kurt, aktion: 'senden', daten: { chat_id: g, text: 'Füllnachricht ' + i } });

	const ti = await seite(DESKTOP, 'timo', 'm_timo', '#/chat/' + g);
	const blase = ti.locator('#chn_' + frage);
	// Smiley wählen
	await blase.locator('[data-chwahl]').click();
	assert.equal(await blase.locator('.ch-wahl button').count(), 6);
	await shot(ti, 'chat-smiley-wahl', DESKTOP);
	await blase.locator('.ch-wahl [data-emoji="👍"]').click(); await ti.waitForTimeout(400);
	assert.equal(await ti.locator('#chn_' + frage + ' .ch-reak button.mein').innerText(), '👍 1');
	assert.equal(await blase.isVisible() && await blase.evaluate(e => { const b = document.querySelector('#ch_msgs').getBoundingClientRect(), r = e.getBoundingClientRect(); return r.bottom > b.top && r.top < b.bottom; }), true, 'Stelle im Verlauf bleibt nach dem Neuzeichnen');
	assert.equal(await ti.locator('#chn_' + frage + ' .ch-wahl').count(), 0, 'Auswahl wieder zu');
	assert.deepEqual((await zustand()).nachrichten.find(n => n.nachricht_id === frage).reaktionen, { '👍': ['m_timo'] });

	// Kurt sieht die Reaktion nach dem Nachladen, setzt selbst ❤️
	const k = await seite(DESKTOP, 'kurt', 'm_kurt', '#/chat/' + g);
	assert.match(await k.locator('#chn_' + frage + ' .ch-reak').innerText(), /👍 1/);
	assert.match(await k.locator('#chn_' + frage + ' .ch-reak button').first().getAttribute('title'), /Timo/);
	await k.locator('#chn_' + frage + ' [data-chwahl]').click();
	await k.locator('#chn_' + frage + ' .ch-wahl [data-emoji="❤️"]').click(); await k.waitForTimeout(400);
	// Timo holt nur Neues (↻) und sieht Kurts ❤️ trotzdem
	await ti.click('#ch_neuLaden'); await ti.waitForTimeout(500);
	assert.match(await ti.locator('#chn_' + frage + ' .ch-reak').innerText(), /❤️ 1/);
	// Timo nimmt sein 👍 wieder weg (Klick auf die eigene Reaktion)
	await ti.locator('#chn_' + frage + ' .ch-reak button.mein').click(); await ti.waitForTimeout(400);
	assert.doesNotMatch(await ti.locator('#chn_' + frage + ' .ch-reak').innerText(), /👍/);

	// Antworten: Leiste über dem Eingabefeld, Senden mit Zitat, ✕ bricht ab
	await ti.locator('#chn_' + frage + ' [data-chantw]').click();
	assert.match(await ti.locator('#ch_antw').innerText(), /Antwort an Kurt \(Test\).*Treffen wir uns morgen um 10/);
	await ti.fill('#ch_text', 'Ja, 10 Uhr passt.');
	await shot(ti, 'chat-antworten-leiste', DESKTOP);
	await ti.press('#ch_text', 'Enter'); await ti.waitForTimeout(600);
	assert.equal(await ti.locator('#ch_antw').count(), 0, 'Leiste nach dem Senden weg');
	assert.equal(await ti.locator('#ch_msgs').evaluate(b => b.scrollHeight - b.scrollTop - b.clientHeight < 5), true, 'nach dem eigenen Senden unten');
	const antw = (await zustand()).nachrichten.filter(n => n.chat_id === g && n.autor === 'm_timo').slice(-1)[0];
	assert.equal(antw.antwort_auf, frage);
	const zitat = ti.locator('#chn_' + antw.nachricht_id + ' .ch-zitat');
	assert.match(await zitat.innerText(), /Kurt \(Test\)[\s\S]*Treffen wir uns morgen um 10/);
	await shot(ti, 'chat-antwort-zitat', DESKTOP);
	await zitat.click(); await ti.waitForTimeout(300);
	assert.equal(await ti.locator('#chn_' + frage).evaluate(e => e.classList.contains('ch-blitz')), true, 'Ziel hervorgehoben');
	await ti.locator('#chn_' + frage + ' [data-chantw]').click();
	await ti.click('#ch_antw_weg');
	assert.equal(await ti.locator('#ch_antw').count(), 0);

	// Handy: Knöpfe erreichbar, keine Querlaufleiste
	const m = await seite(MOBIL, 'mobil', 'm_timo', '#/chat/' + g);
	await m.locator('#chn_' + frage + ' [data-chwahl]').click();
	assert.equal(await m.locator('#chn_' + frage + ' .ch-wahl').isVisible(), true);
	assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'keine Querlaufleiste');
	await m.locator('#chn_' + frage).scrollIntoViewIfNeeded();
	await shot(m, 'chat-smiley-wahl', MOBIL);
	for (const p of [ti, k, m]) await p.close();
	assert.deepEqual(fehler, []);
});
