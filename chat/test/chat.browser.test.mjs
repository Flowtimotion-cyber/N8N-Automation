// Browsertest: Team-Chat im Team-Portal gegen den Testserver (Testadapter, kein n8n, keine Produktivdaten).
// Braucht Playwright („playwright“ oder „playwright-core“); ohne wird übersprungen. Im Worktree: NODE_PATH auf node_modules des Hauptordners.
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

async function seite(vp, name, wer) {
	const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
	const p = await ctx.newPage();
	p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
	p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
	await p.route(u => !u.href.startsWith(S.base), r => r.abort());
	const um = (muster, ziel, anpassen) => p.route(muster, async r => {
		const req = r.request();
		const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: req.postDataBuffer() });
		let t = await res.text();
		if (anpassen) t = JSON.stringify(anpassen(JSON.parse(t)));
		r.fulfill({ status: res.status, contentType: 'application/json', body: t });
	});
	// Lillien hat im Test eine (erfundene) Handynummer und die WhatsApp-Einwilligung
	await um(/webhook\/team-api-v2/, '/api/team', d => { (d.mitglieder || []).forEach(m => { if (m.mitglied_id === 'm_lillien') Object.assign(m, { whatsapp_ok: true, telefon: '+4915100000000' }); }); return d; });
	await um(/webhook\/team-msgs/, '/api/nachrichten');
	await um(/webhook\/team-chat/, '/api/chat');
	await p.route(/webhook\/(?!team-api-v2|team-msgs|team-chat)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	await p.goto(S.base + '/team/?z=' + TOKENS[wer] + '#/tab/chat', { waitUntil: 'networkidle' });
	await p.waitForTimeout(400);
	return p;
}
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).chat;
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Ohne Datenbank: Register zeigt Hinweis, kein Absturz', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/chat', { eingerichtet: false });
	const p = await seite(DESKTOP, 'ohne DB', 'm_kurt');
	assert.match(await p.locator('#ch_liste').innerText(), /noch nicht eingerichtet/);
	await p.close();
	await post(S.base, '/api/test/chat', { eingerichtet: true });
	assert.deepEqual(fehler, []);
});

test('Gruppe anlegen, @-Markierung mit WhatsApp-Haken, Ungelesen, KI-Schalter für alle sichtbar, Fremde sehen nichts', async t => {
	if (!B) return t.skip();
	const k = await seite(DESKTOP, 'kurt', 'm_kurt');
	await k.click('#ch_neu');
	await k.fill('#ch_t', 'Kursteam Modul 2');
	await k.selectOption('#ch_pers [data-chadd]', 'm_lillien');
	await k.click('#chf [type=submit]');
	await k.waitForTimeout(500);
	assert.match(await k.locator('#ch_chat .wc-kopf').innerText(), /Kursteam Modul 2/);
	assert.match(await k.locator('#ch_msgs').innerText(), /Kurt hat den Chat angelegt/);
	// @Lillien: Haken erscheint (Lillien hat Einwilligung), ist aus, wird gesetzt
	await k.fill('#ch_text', 'Hallo @Lillien, schaust du dir **das Skript** an? @Timo bitte auch');
	await k.waitForTimeout(150);
	assert.equal(await k.isChecked('#ch_wa'), false, 'WhatsApp nur mit Haken');
	assert.match(await k.locator('#ch_hinw').innerText(), /Timo \(Test\) ist nicht in diesem Chat/);
	await k.check('#ch_wa');
	await shot(k, 'chat-schreiben', DESKTOP);
	await k.press('#ch_text', 'Enter');
	await k.waitForTimeout(500);
	let z = await zustand();
	const msg = z.nachrichten.find(n => n.autor === 'm_kurt');
	assert.deepEqual(msg.erwaehnt, ['m_lillien']); assert.deepEqual(msg.whatsapp, ['m_lillien']);
	assert.equal(z.whatsapp.length, 1); assert.equal(z.posteingang.length, 1);
	assert.equal(await k.inputValue('#ch_text'), '', 'Eingabe geleert');
	assert.match(await k.locator('#ch_msgs .wb.aus').innerText(), /das Skript/);
	await shot(k, 'chat-gruppe', DESKTOP);

	// Lillien: Zähler am Register, Nachricht gelb umrandet (sie ist gemeint), dann KI-Schalter einschalten
	const l = await seite(DESKTOP, 'lillien', 'm_lillien');
	await l.waitForTimeout(300);
	assert.match(await l.locator('nav.tabs button[data-tab="chat"]').innerText(), /Chat\s*2/);
	await l.click('#ch_liste [data-ch]');
	await l.waitForTimeout(400);
	assert.equal(await l.locator('#ch_msgs .wb.ein.ch-mich').count(), 1);
	assert.equal((await l.locator('nav.tabs button[data-tab="chat"]').innerText()).trim(), 'Chat', 'nach dem Lesen kein Zähler');
	await l.click('#ch_einst');
	await l.check('#che_ki');
	await l.click('#chef [type=submit]');
	await l.waitForTimeout(500);
	assert.match(await l.locator('#ch_chat .ch-ki').innerText(), /KI-Zugriff eingeschaltet/);
	assert.match(await l.locator('#ch_msgs').innerText(), /🤖 Lillien hat eingeschaltet: Die KI darf den ganzen Verlauf/);
	// Kurt sieht den Hinweis beim nächsten Abruf (Takt 5 s) bzw. nach Neu laden
	await k.click('#ch_neuLaden'); await k.waitForTimeout(500);
	assert.match(await k.locator('#ch_msgs').innerText(), /Lillien hat eingeschaltet/);
	assert.equal(await k.locator('#ch_chat .ch-ki').count(), 1);
	await shot(k, 'chat-ki-hinweis', DESKTOP);

	// Timo ist nicht im Chat und sieht ihn nicht
	const ti = await seite(DESKTOP, 'timo', 'm_timo');
	assert.equal(await ti.locator('#ch_liste [data-ch]').count(), 0);
	for (const p of [k, l, ti]) await p.close();
	assert.deepEqual(fehler, []);
});

test('Direktchat wird nicht doppelt angelegt; Projekt-Chat zeigt offene Aufgaben', async t => {
	if (!B) return t.skip();
	const k = await seite(DESKTOP, 'direkt', 'm_kurt');
	const direkt = async () => {
		await k.click('#ch_neu'); await k.click('#ch_art [data-art="direkt"]');
		await k.selectOption('#ch_pers [data-chadd]', 'm_timo'); await k.click('#chf [type=submit]'); await k.waitForTimeout(500);
	};
	await direkt(); await direkt();
	assert.equal((await zustand()).chats.filter(c => c.art === 'direkt').length, 1);
	assert.match(await k.locator('#ch_chat .wc-kopf').innerText(), /Timo \(Test\)/);
	await k.click('#ch_neu'); await k.click('#ch_art [data-art="projekt"]');
	await k.selectOption('#ch_p', 'Akademie-Kurs'); await k.selectOption('#ch_pers [data-chadd]', 'm_lillien');
	await k.click('#chf [type=submit]'); await k.waitForTimeout(500);
	assert.match(await k.locator('#ch_chat .wc-kopf').innerText(), /Akademie-Kurs/);
	await k.click('.ch-proj summary');
	assert.ok(await k.locator('.ch-proj .ch-aufg').count() > 0, 'offene Aufgaben des Projekts');
	await shot(k, 'chat-projekt', DESKTOP);
	await k.close();
	assert.deepEqual(fehler, []);
});

test('Mobil: Liste, dann Chat mit Zurück-Knopf', async t => {
	if (!B) return t.skip();
	const k = await seite(MOBIL, 'mobil', 'm_kurt');
	await shot(k, 'chat-liste', MOBIL);
	await k.click('#ch_liste [data-ch]'); await k.waitForTimeout(400);
	assert.equal(await k.locator('#ch_liste').isVisible(), false);
	assert.equal(await k.locator('#ch_zur').isVisible(), true);
	assert.equal(await k.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'keine Querlaufleiste');
	await shot(k, 'chat-offen', MOBIL);
	await k.click('#ch_zur'); await k.waitForTimeout(200);
	assert.equal(await k.locator('#ch_liste').isVisible(), true);
	await k.close();
	assert.deepEqual(fehler, []);
});
