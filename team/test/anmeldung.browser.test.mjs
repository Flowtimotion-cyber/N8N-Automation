// Browsertest: Das Team-Portal behält die Anmeldung (Timo 25.11.2026: „ich muss mich oft neu anmelden“).
// Befunde: (1) Der Pilot unter derselben Adresse (github.io) nutzte denselben Speicher-Schlüssel und überschrieb die echte Anmeldung.
// (2) Eine einzige Ablehnung (auch ein Aussetzer am Server) löschte den Code. Jetzt: einmal nachfragen, Code behalten.
//   NODE_PATH=<Hauptordner>/node_modules node --test team/test/anmeldung.browser.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

let S, B, fehler = [];
function playwright() {
	const orte = [process.cwd() + '/'];
	for (const p of String(process.env.NODE_PATH || '').split(/[;:](?![\\/])/).filter(Boolean)) orte.push(p.replace(/[\\/]?$/, '/'));
	try { orte.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {}
	for (const name of ['playwright', 'playwright-core']) for (const o of orte) { try { return { pw: createRequire(o)(name), name }; } catch (e) {} }
	return null;
}
before(async () => {
	S = await serverStarten({ tempo: 0 });
	const p = playwright();
	if (p) { try { B = await p.pw.chromium.launch(p.name === 'playwright-core' ? { channel: 'chrome' } : {}); } catch (e) { B = null; } }
});
after(async () => {
	if (S) await S.stop();
	if (B) { const zu = await Promise.race([B.close().then(() => true), new Promise(r => setTimeout(() => r(false), 5000))]); if (!zu) setTimeout(() => process.exit(process.exitCode || 0), 2000).unref(); }
});

// ablehnen(n): die ersten n Aufrufe von „laden“ bekommen 401, danach antwortet der Testserver normal
async function seite(ablehnen) {
	const ctx = await B.newContext({ viewport: { width: 1280, height: 860 }, locale: 'de-DE' });
	const p = await ctx.newPage();
	p.on('pageerror', e => fehler.push('pageerror: ' + e.message));
	await p.route(u => !u.href.startsWith(S.base), r => r.abort());
	let n = 0;
	await p.route(/webhook\/team-api-v2/, async r => {
		const body = r.request().postDataJSON ? r.request().postDataJSON() : JSON.parse(r.request().postData() || '{}');
		if (body && body.aktion === 'laden' && n++ < ablehnen.zahl) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false,"fehler":"Dein Zugang ist ungültig."}' });
		const res = await fetch(S.base + '/api/team', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	await p.route(/webhook\/(?!team-api-v2)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	return { p, zaehler: () => n };
}

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Ein kurzer Aussetzer (eine Ablehnung) meldet nicht ab', async t => {
	if (!B) return t.skip();
	const ab = { zahl: 1 };
	const { p, zaehler } = await seite(ab);
	await p.goto(S.base + '/team/?z=' + TOKENS.m_timo, { waitUntil: 'networkidle' });
	await p.waitForTimeout(2200);
	assert.equal(zaehler() >= 2, true, 'zweiter Versuch');
	assert.equal(await p.locator('#codef').count(), 0, 'keine Anmeldeseite');
	assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), TOKENS.m_timo);
	await p.close();
});

test('Bleibt abgelehnt: Anmeldeseite, Code bleibt gespeichert, „nochmal versuchen“ klappt, Abmelden löscht', async t => {
	if (!B) return t.skip();
	const ab = { zahl: 2 };
	const { p } = await seite(ab);
	await p.goto(S.base + '/team/?z=' + TOKENS.m_timo, { waitUntil: 'networkidle' });
	await p.waitForTimeout(2200);
	assert.equal(await p.locator('#codef').count(), 1, 'Anmeldeseite');
	assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), TOKENS.m_timo, 'Code nicht gelöscht');
	// Ohne Link neu öffnen: der gespeicherte Code wird wieder benutzt (Server antwortet jetzt normal)
	await p.click('#code_nochmal'); await p.waitForTimeout(800);
	assert.equal(await p.locator('#codef').count(), 0, 'wieder drin');
	await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
	assert.equal(await p.locator('#codef').count(), 0, 'ohne Link angemeldet');
	await p.click('nav.tabs button[data-tab="team"]'); await p.waitForTimeout(500);
	await p.click('#logout'); await p.waitForTimeout(300);
	assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), null, 'Abmelden löscht');
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Pilot und Office nutzen den Speicher so, dass die echte Anmeldung bleibt', () => {
	const pilot = readFileSync(join(REPO, 'docs', 'pilot', 'frontend', 'index.html'), 'utf8');
	const quelle = readFileSync(join(REPO, 'portal-pilot', 'frontend', 'index.html'), 'utf8');
	for (const s of [pilot, quelle]) { assert.ok(!s.includes("'mt-token'"), 'Pilot nutzt nicht den Schlüssel des Team-Portals'); assert.ok(s.includes("'mt-pilot-token'")); }
	const office = readFileSync(join(REPO, 'docs', 'office', 'js', 'app.js'), 'utf8');
	assert.ok(!/status === 401\)\s*\{\s*tokenSetzen\(null\)/.test(office), 'Office löscht den Code bei 401 nicht mehr');
});
