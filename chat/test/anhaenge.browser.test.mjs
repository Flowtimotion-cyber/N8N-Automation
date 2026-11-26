// Browsertest: Dateien im Team-Chat (Büroklammer, Hineinziehen, Einfügen, Vorschau, Download, Entfernen) gegen den Testserver.
// Testadapter statt n8n und Supabase (chat/dev/anhaenge-mock.mjs), keine Produktivdaten. Ohne Playwright wird übersprungen.
//   NODE_PATH=<Hauptordner>/node_modules node --test chat/test/anhaenge.browser.test.mjs
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

async function seite(vp, name, wer, mobil) {
	const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin', hasTouch: !!mobil, isMobile: !!mobil });
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
	await um(/webhook\/team-chat$/, '/api/chat');
	await um(/webhook\/team-anhang$/, '/api/chat-anhang');
	await p.route(/webhook\/(?!team-api-v2|team-msgs|team-chat$|team-anhang$)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	await p.goto(S.base + '/team/?z=' + TOKENS[wer] + '#/tab/chat', { waitUntil: 'networkidle' });
	await p.waitForTimeout(400);
	return p;
}
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).chat;
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });
const toast = p => p.locator('#toast').innerText();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
// Großes Bild im Browser erzeugen und wie per Maus ins Chatfenster ziehen (prüft Hineinziehen und Verkleinern)
const bildZiehen = (p, name, w, h) => p.evaluate(async ([name, w, h]) => {
	const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
	const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#7B3FE4'); g.addColorStop(1, '#1FA9B0'); x.fillStyle = g; x.fillRect(0, 0, w, h);
	for (let i = 0; i < 400; i++) { x.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,60%)'; x.fillRect((i * 97) % w, (i * 53) % h, 60, 60); }
	const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
	const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/png' }));
	const el = document.getElementById('ch_chat');
	el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
	el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
	return blob.size;
}, [name, w, h]);
const bildEinfuegen = p => p.evaluate(async () => {
	const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#E98A15'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#fff'; x.font = '40px sans-serif'; x.fillText('Screenshot', 80, 160);
	const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
	const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
	document.getElementById('ch_text').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Dateien anhängen, hochladen, ansehen, herunterladen, entfernen und wiederherstellen', async t => {
	if (!B) return t.skip();
	const chat = (await post(S.base, '/api/chat', { token: TOKENS.m_kurt, aktion: 'anlegen', daten: { art: 'gruppe', titel: 'Kursteam Dateien', mitglieder: ['m_lillien'] } })).j.chat.chat_id;
	const k = await seite(DESKTOP, 'kurt', 'm_kurt');
	await k.click('#ch_liste [data-ch="' + chat + '"]'); await k.waitForTimeout(400);
	assert.equal(await k.locator('#ch_anh').count(), 1, 'Büroklammer da');
	assert.equal(await k.locator('#ch_kam').count(), 0, 'am PC kein Kamera-Knopf');
	// Büroklammer: PDF und Text gehen, Programm nicht
	await k.setInputFiles('#ch_datei', [
		{ name: 'Angebot März.pdf', mimeType: 'application/pdf', buffer: PDF },
		{ name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('Erster Entwurf') },
		{ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }]);
	await k.waitForTimeout(300);
	assert.equal(await k.locator('#ch_dateien .ch-dz').count(), 2);
	assert.match(await toast(k), /setup\.exe.*geht hier nicht/);
	// Großes Bild hineinziehen: wird vor dem Hochladen verkleinert
	const roh = await bildZiehen(k, 'Tafelbild.png', 3600, 2400);
	await k.waitForTimeout(800);
	assert.equal(await k.locator('#ch_dateien .ch-dz').count(), 3);
	assert.equal(await k.locator('#ch_dateien .ch-dz img').count(), 1, 'Vorschau fürs Bild');
	await k.fill('#ch_text', 'Hier die Unterlagen für Modul 2, @Lillien');
	await shot(k, 'dateien-vormerken', DESKTOP);
	await k.press('#ch_text', 'Enter');
	await k.waitForTimeout(1500);
	let z = await zustand();
	assert.equal(z.anhaenge.length, 3); assert.ok(z.anhaenge.every(a => a.status === 'bereit'));
	const bild = z.anhaenge.find(a => /Tafelbild/.test(a.name));
	assert.equal(bild.name, 'Tafelbild.jpg'); assert.equal(bild.mime, 'image/jpeg'); assert.equal(bild.breite, 2560); assert.equal(bild.hoehe, 1707);
	assert.ok(z.dateien.find(d => d.pfad === bild.pfad).bytes < roh, 'kleiner als das Original');
	assert.equal(z.dateien.find(d => /notiz/.test(d.pfad)).mime, 'text/plain');
	const msg = z.nachrichten.find(n => n.chat_id === chat && n.autor === 'm_kurt');
	assert.equal(msg.text, 'Hier die Unterlagen für Modul 2, @Lillien'); assert.deepEqual(msg.erwaehnt, ['m_lillien']);
	assert.equal(await k.locator('#ch_dateien .ch-dz').count(), 0, 'Vormerkliste leer'); assert.equal(await k.inputValue('#ch_text'), '');
	await k.waitForTimeout(500);
	assert.equal(await k.locator('#ch_msgs .ch-bild img').count(), 1, 'Bild als Vorschau');
	assert.equal(await k.locator('#ch_msgs .ch-datei').count(), 2, 'PDF und Text als Karte');
	assert.ok(await k.locator('#ch_msgs .ch-bild img').evaluate(i => i.complete && i.naturalWidth === 2560), 'Bild lädt über signierten Link');
	assert.equal(await k.locator('#ch_msgs .ch-anweg').count(), 3, 'eigene Dateien lassen sich entfernen');
	await shot(k, 'dateien-gesendet', DESKTOP);

	// Lillien: sieht alles, kann laden, aber nichts von Kurt entfernen
	const l = await seite(DESKTOP, 'lillien', 'm_lillien');
	await l.click('#ch_liste [data-ch="' + chat + '"]'); await l.waitForTimeout(900);
	assert.equal(await l.locator('#ch_msgs .ch-bild img').count(), 1);
	assert.equal(await l.locator('#ch_msgs .ch-anweg').count(), 0);
	const dl = await l.locator('#ch_msgs .ch-datei a[download="Angebot März.pdf"]').getAttribute('href');
	assert.match(dl, /\/object\/sign\/team-anhaenge\/.*token=.*&download=Angebot%20M%C3%A4rz\.pdf$/);
	const r = await fetch(dl); assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment/); assert.equal(Buffer.from(await r.arrayBuffer()).toString(), PDF.toString());
	await l.click('#ch_msgs .ch-bild'); await l.waitForTimeout(300);
	assert.equal(await l.locator('#dlg[open] img.ch-gross').count(), 1, 'Bild groß im Fenster');
	await shot(l, 'dateien-bild-gross', DESKTOP);
	await l.keyboard.press('Escape');
	// Timo ist nicht im Chat: bekommt keine Links
	const fremd = await post(S.base, '/api/chat-anhang', { token: TOKENS.m_timo, aktion: 'links', daten: { chat_id: chat, anhaenge: [bild.anhang_id] } });
	assert.equal(fremd.status, 400); assert.equal(fremd.j.ok, false);

	// Kurt entfernt das PDF (zwei Klicks), Lillien sieht es beim Nachladen, Kurt stellt es wieder her
	const pdfWeg = k.locator('#ch_msgs .ch-datei:has-text("Angebot") .ch-anweg');
	await pdfWeg.click(); assert.match(await pdfWeg.innerText(), /Für alle entfernen\?/);
	await pdfWeg.click(); await k.waitForTimeout(600);
	assert.match(await toast(k), /30 Tage/);
	assert.equal(await k.locator('#ch_msgs .ch-datei.weg [data-chanzur]').count(), 1, 'Wiederherstellen für Kurt');
	await shot(k, 'dateien-entfernt', DESKTOP);
	await l.click('#ch_neuLaden').catch(() => {}); await l.waitForTimeout(5800);
	assert.equal(await l.locator('#ch_msgs .ch-datei.weg').count(), 1, 'Lillien sieht „Datei entfernt“');
	assert.equal(await l.locator('#ch_msgs .ch-datei.weg [data-chanzur]').count(), 0, 'nur Kurt kann wiederherstellen');
	assert.equal((await fetch(dl)).status, 404, 'alter Link liefert die entfernte Datei nicht mehr');
	await k.click('#ch_msgs [data-chanzur]'); await k.waitForTimeout(900);
	assert.equal(await k.locator('#ch_msgs .ch-datei.weg').count(), 0); assert.equal(await k.locator('#ch_msgs .ch-datei').count(), 2);

	// Nur ein Bild, eingefügt aus der Zwischenablage, ohne Text: kein „📎 …“-Text in der Blase
	await bildEinfuegen(k); await k.waitForTimeout(400);
	assert.match(await k.locator('#ch_dateien').innerText(), /Bild .*\.png/);
	await k.click('#ch_senden'); await k.waitForTimeout(1500);
	z = await zustand();
	const nur = z.nachrichten.filter(n => n.chat_id === chat && n.autor === 'm_kurt').pop();
	assert.match(nur.text, /^📎 Bild .*\.png$/);
	const blase = k.locator('#chn_' + nur.nachricht_id);
	assert.equal(await blase.locator('.md').count(), 0, 'Dateiname nicht doppelt'); assert.equal(await blase.locator('.ch-bild img').count(), 1);
	await shot(k, 'dateien-nur-bild', DESKTOP);
	for (const p of [k, l]) await p.close();
	assert.deepEqual(fehler, []);
});

test('Handy: Kamera-Knopf, Ansicht im Verlauf', async t => {
	if (!B) return t.skip();
	const chat = (await zustand()).chats.find(c => c.titel === 'Kursteam Dateien').chat_id;
	const l = await seite(MOBIL, 'lillien-handy', 'm_lillien', true);
	await l.click('#ch_liste [data-ch="' + chat + '"]'); await l.waitForTimeout(900);
	assert.equal(await l.locator('#ch_kam').count(), 1, 'Kamera-Knopf am Handy');
	assert.equal(await l.locator('#ch_kamera[capture="environment"]').count(), 1);
	await l.setInputFiles('#ch_kamera', [{ name: 'IMG_2041.heic', mimeType: 'image/heic', buffer: Buffer.from('heic-test') }]);
	await l.waitForTimeout(300);
	assert.match(await l.locator('#ch_dateien').innerText(), /IMG_2041\.heic/);
	const breite = await l.evaluate(() => document.documentElement.scrollWidth);
	assert.ok(breite <= 392, 'kein seitliches Scrollen (' + breite + ')');
	await shot(l, 'dateien', MOBIL);
	await l.click('#ch_senden'); await l.waitForTimeout(1500);
	assert.match(await l.locator('#ch_msgs').innerText(), /IMG_2041\.heic/, 'HEIC als Datei-Karte');
	await l.close();
	assert.deepEqual(fehler, []);
});

test('Ohne Datenbank für Dateien: Hinweis, normales Senden geht weiter', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/chat', { eingerichtet: true, anhaenge: false });
	const chat = (await post(S.base, '/api/chat', { token: TOKENS.m_kurt, aktion: 'anlegen', daten: { art: 'direkt', mitglieder: ['m_lillien'] } })).j.chat.chat_id;
	const k = await seite(DESKTOP, 'ohne', 'm_kurt');
	await k.click('#ch_liste [data-ch="' + chat + '"]'); await k.waitForTimeout(400);
	await k.setInputFiles('#ch_datei', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF }]);
	await k.fill('#ch_text', 'mit Datei'); await k.press('#ch_text', 'Enter'); await k.waitForTimeout(800);
	assert.match(await toast(k), /Dateien im Chat sind noch nicht eingerichtet/);
	assert.equal(await k.inputValue('#ch_text'), 'mit Datei', 'Text bleibt stehen');
	await k.click('#ch_dateien [data-chdweg]');
	await k.press('#ch_text', 'Enter'); await k.waitForTimeout(800);
	assert.match(await k.locator('#ch_msgs').innerText(), /mit Datei/, 'ohne Datei geht die Nachricht raus');
	await k.close();
	await post(S.base, '/api/test/chat', { eingerichtet: true });
	assert.deepEqual(fehler, []);
});
