// Browsertest: gesendete Nachrichten bearbeiten (Team-Chat und Posteingang) gegen den Testserver (Testadapter, kein n8n, keine Produktivdaten).
// Braucht Playwright („playwright“ oder „playwright-core“); ohne wird übersprungen. Im Worktree: NODE_PATH auf node_modules des Hauptordners.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const SHOTS = join(REPO, 'nachrichten', 'screenshots');
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
		const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	await um(/webhook\/team-api-v2/, '/api/team');
	await um(/webhook\/team-msgs/, '/api/nachrichten');
	await um(/webhook\/team-chat/, '/api/chat');
	await p.route(/webhook\/(?!team-api-v2|team-msgs|team-chat)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	await p.goto(S.base + '/team/?z=' + TOKENS[wer] + (hash || '#/tab/chat'), { waitUntil: 'networkidle' });
	await p.waitForTimeout(400);
	return p;
}
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json()));
const rufe = (pfad, wer, aktion, daten) => post(S.base, pfad, { token: TOKENS[wer], aktion, daten });
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Chat: eigene Nachricht bearbeiten, neu Markierte bekommen einen Hinweis, die anderen sehen „bearbeitet“', async t => {
	if (!B) return t.skip();
	const g = (await rufe('/api/chat', 'm_timo', 'anlegen', { art: 'gruppe', titel: 'Bearbeiten-Test', mitglieder: ['m_kurt', 'm_lillien'] })).j.chat.chat_id;
	await rufe('/api/chat', 'm_timo', 'senden', { chat_id: g, text: 'Treffen um 10 @Kurt', erwaehnt: ['m_kurt'] });
	await rufe('/api/chat', 'm_kurt', 'senden', { chat_id: g, text: 'Passt', erwaehnt: [] });
	const vorher = (await zustand()).chat.posteingang.length;

	const k = await seite(DESKTOP, 'kurt', 'm_kurt', '#/chat/' + g);
	const ti = await seite(DESKTOP, 'timo', 'm_timo', '#/chat/' + g);
	// Timo: ✎ nur an der eigenen Nachricht
	assert.equal(await ti.locator('#ch_msgs .wb.aus .ch-edit').count(), 1);
	assert.equal(await ti.locator('#ch_msgs .wb.ein .ch-edit').count(), 0, 'fremde Nachricht nicht bearbeitbar');
	await ti.click('#ch_msgs .wb.aus .ch-edit');
	assert.equal(await ti.inputValue('#chb_t'), 'Treffen um 10 @Kurt');
	await ti.fill('#chb_t', 'Treffen um 11 @Kurt, @Lillien bitte auch');
	await ti.waitForTimeout(150);
	assert.match(await ti.locator('#chb_h').innerText(), /Lillien \(Test\) bekommt einen Hinweis im Posteingang/);
	assert.doesNotMatch(await ti.locator('#chb_h').innerText(), /Kurt/, 'Kurt war schon markiert');
	await shot(ti, 'chat-bearbeiten-dialog', DESKTOP);
	await ti.click('#chb_f [type=submit]');
	await ti.waitForTimeout(500);
	assert.equal(await ti.locator('#dlg').evaluate(d => d.open), false);
	const eigen = await ti.locator('#ch_msgs .wb.aus').innerText();
	assert.match(eigen, /Treffen um 11/); assert.match(eigen, /bearbeitet \d\d:\d\d/);
	await shot(ti, 'chat-bearbeitet', DESKTOP);

	let z = await zustand();
	const n = z.chat.nachrichten.find(x => x.autor === 'm_timo' && x.chat_id === g);
	assert.deepEqual(n.erwaehnt, ['m_kurt', 'm_lillien']); assert.deepEqual(n.whatsapp, [], 'nie WhatsApp beim Bearbeiten');
	assert.equal(z.chat.posteingang.length, vorher + 1); assert.deepEqual(z.chat.posteingang[z.chat.posteingang.length - 1].empfaenger, ['m_lillien']);

	// Kurt holt nur Neues und sieht trotzdem den geänderten Text mit „bearbeitet“; an seiner eigenen Nachricht steht ✎
	await k.click('#ch_neuLaden'); await k.waitForTimeout(500);
	const fremd = await k.locator('#ch_msgs .wb.ein').innerText();
	assert.match(fremd, /Treffen um 11/); assert.match(fremd, /bearbeitet/);
	assert.equal(await k.locator('#ch_msgs .wb.ein .ch-edit').count(), 0);
	assert.equal(await k.locator('#ch_msgs .wb.aus .ch-edit').count(), 1);
	await shot(k, 'chat-bearbeitet-andere', DESKTOP);

	// Mobil: ✎ ist da und der Dialog passt aufs Handy
	const m = await seite(MOBIL, 'mobil', 'm_timo', '#/chat/' + g);
	await m.click('#ch_msgs .wb.aus .ch-edit');
	assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'keine Querlaufleiste');
	await shot(m, 'chat-bearbeiten-dialog', MOBIL);
	await m.click('#chb_c');
	await m.close();
	// Nach 24 Stunden: kein ✎ mehr an der Nachricht
	assert.equal((await post(S.base, '/api/test/chat-alt', { nachricht_id: n.nachricht_id })).status, 200);
	await ti.reload({ waitUntil: 'networkidle' }); await ti.waitForTimeout(400);
	assert.equal(await ti.locator('#ch_msgs .wb.aus .ch-edit').count(), 0, 'nach 24 Stunden kein Bearbeiten');
	for (const p of [k, ti]) await p.close();
	assert.deepEqual(fehler, []);
});

test('Posteingang: „Gesendet“ zeigt eigene Nachrichten, bearbeiten bis 24 Stunden, Empfänger sieht „bearbeitet“', async t => {
	if (!B) return t.skip();
	const id = (await rufe('/api/nachrichten', 'm_kurt', 'senden', { empfaenger: ['m_timo'], text: 'Bitte **Modul 2** prüfen' })).j.nachricht.msg_id;
	const k = await seite(DESKTOP, 'kurt-post', 'm_kurt', '#/tab/team');
	await k.click('#msggesendet');
	await k.waitForTimeout(400);
	assert.match(await k.locator('#msgs_box').innerText(), /An Timo \(Test\)/);
	assert.match(await k.locator('#msgs_box').innerText(), /Modul 2/);
	await shot(k, 'gesendet', DESKTOP);
	await k.click('#msgs_box [data-msgaus="' + id + '"]');
	assert.match(await k.locator('#dlgInner').innerText(), /Geöffnet:\s*Timo \(Test\): noch nicht/);
	await k.click('#msg_bearb');
	await k.fill('#msb_t', 'Bitte **Modul 2 und 3** prüfen');
	await k.click('#msb_f [type=submit]');
	await k.waitForTimeout(400);
	assert.match(await k.locator('#dlgInner').innerText(), /Modul 2 und 3/);
	assert.match(await k.locator('#dlgInner .msgs-kopf').innerText(), /bearbeitet \d\d\.\d\d\.\d{4}/);
	assert.match(await k.locator('#dlgInner h2').innerText(), /Deine Nachricht/, 'zurück in der Ansicht der Nachricht');

	const z = await zustand();
	const m = z.nachrichten.msgs.find(x => x.msg_id === id);
	assert.equal(m.text, 'Bitte **Modul 2 und 3** prüfen'); assert.ok(m.bearbeitet);

	// Timo (Empfänger): Posteingang zeigt „bearbeitet“, Lesedialog den neuen Text, aber kein ✎ (nicht sein Text)
	const ti = await seite(DESKTOP, 'timo-post', 'm_timo', '#/tab/team');
	await ti.click('#msgsIco'); await ti.waitForTimeout(200);
	assert.match(await ti.locator('#msgs_box [data-msg="' + id + '"]').innerText(), /bearbeitet/);
	await ti.click('#msgs_box [data-msg="' + id + '"]'); await ti.waitForTimeout(300);
	assert.match(await ti.locator('#dlgInner .msgs-text').innerText(), /Modul 2 und 3/);
	assert.equal(await ti.locator('#msg_bearb').count(), 0);
	await shot(ti, 'nachricht-bearbeitet', DESKTOP);

	// Nach 24 Stunden: kein ✎ mehr, und der Server lehnt ab
	await ti.close();
	assert.equal((await post(S.base, '/api/test/nachrichten-alt', { msg_id: id })).status, 200);
	const k2 = await seite(DESKTOP, 'kurt-alt', 'm_kurt', '#/tab/team');
	await k2.click('#msggesendet'); await k2.waitForTimeout(400);
	await k2.click('#msgs_box [data-msgaus="' + id + '"]');
	assert.equal(await k2.locator('#msg_bearb').count(), 0, 'nach 24 Stunden kein Bearbeiten');
	await k2.close();
	const r2 = await rufe('/api/nachrichten', 'm_kurt', 'bearbeiten', { msg_id: id, text: 'zu spät' });
	assert.equal(r2.status, 400); assert.match(r2.j.fehler, /24 Stunden/);
	await k.close();
	assert.deepEqual(fehler, []);
});
