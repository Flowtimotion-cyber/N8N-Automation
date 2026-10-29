// Browsertest: Diktat im Dialog „Verkaufschance“ (Register Vertrieb) mit Fake-Mikrofon, Dateiupload, Fehlerfällen; Screenshots Desktop + Mobil.
// Läuft gegen den lokalen Testserver (TESTADAPTER); n8n-Adressen werden auf die Nachbildungen umgeleitet. Kein OpenAI, kein Twenty.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const SHOTS = join(REPO, 'docs', 'office', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [];
function playwright() { const k = [process.cwd() + '/']; try { k.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {} for (const p of k) { try { return createRequire(p)('playwright'); } catch (e) {} } return null; }

before(async () => {
  mkdirSync(SHOTS, { recursive: true }); S = await serverStarten({ tempo: 0 });
  const pw = playwright(); if (!pw) return;
  B = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
});
after(async () => { if (B) await B.close(); if (S) await S.stop(); });

async function seite(vp, name) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin', permissions: ['microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  p.on('dialog', d => d.accept());   // Portal fragt beim Schließen mit ungespeicherten Änderungen nach
  const um = (muster, ziel) => p.route(muster, async r => { const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': r.request().headers()['content-type'] || 'text/plain' }, body: r.request().postDataBuffer() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  await um(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, '/api/team'); await um(/n8n\.hm-storage\.de\/webhook\/team-vertrieb/, '/api/vertrieb'); await um(/n8n\.hm-storage\.de\/webhook\/team-diktat/, '/api/diktat');
  return p;
}
const text = async (p, sel) => (await p.locator(sel).first().textContent()) || '';
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
async function dialogOeffnen(p, tok) {
  await p.goto(S.base + '/team/?z=' + tok + '#/tab/vertrieb', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await p.locator('[data-vc="c-1001"]').first().click(); await p.waitForTimeout(400);
  assert.ok(await p.evaluate(() => document.querySelector('#dlg').open), 'Dialog offen');
  assert.ok(await p.locator('#v_diktat').count(), 'Diktat-Box vorhanden');
}

test('Browser verfügbar', t => { if (!B) { t.diagnostic('Kein Playwright – Browsertests übersprungen.'); t.skip(); } });

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Aufnahme mit Fake-Mikrofon → Ergebnis → als Aktivität gespeichert', async t => {
    if (!B) return t.skip();
    const p = await seite(vp, n);
    await dialogOeffnen(p, TOKENS.m_murat);
    await shot(p, 'vertrieb-diktat-dialog', vp);
    await p.locator('#vd_rec').click(); await p.waitForTimeout(300);
    assert.ok(!(await p.locator('#vd_stop').isHidden()), 'Stopp-Knopf sichtbar'); assert.match(await text(p, '#vd_status'), /Aufnahme läuft/);
    await p.waitForTimeout(2500); await shot(p, 'vertrieb-diktat-aufnahme', vp);
    await p.locator('#vd_stop').click();
    await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
    const erg = await p.locator('#vd_text').inputValue();
    assert.match(erg, /Diktat von Murat/); assert.match(erg, /Nächste Schritte/); assert.match(await text(p, '#vd_meta'), /geschätzt/);
    assert.match(await text(p, '#vd_roh'), /herrn müller/);
    await shot(p, 'vertrieb-diktat-ergebnis', vp);
    await p.locator('#vd_save').click();
    await p.waitForFunction(() => /Aktivität in Twenty gespeichert/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    assert.ok(await p.evaluate(() => document.querySelector('#vd_erg').hidden));
    assert.ok((await text(p, '#v_notizen')).includes('Diktat von Murat'), 'Aktivität erscheint in der Liste');
    await shot(p, 'vertrieb-diktat-gespeichert', vp);
    await p.close();
  });
}

test('Dateiupload, Fehlerfälle (keine Sprache, Dienst gestört, ohne KI-Bereinigung, fremde Rolle)', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Fehler');
  await dialogOeffnen(p, TOKENS.m_timo);
  const datei = (name, size) => ({ name, mimeType: 'audio/webm', buffer: Buffer.alloc(size || 4000, 1) });
  await p.locator('#vd_datei').setInputFiles(datei('stumm.webm')); await p.waitForTimeout(600);
  assert.match(await text(p, '#vd_status'), /keine Sprache erkannt/); assert.ok(await p.evaluate(() => document.querySelector('#vd_erg').hidden));
  await shot(p, 'vertrieb-diktat-fehler-keine-sprache', DESKTOP);
  await p.locator('#vd_datei').setInputFiles(datei('kaputt.webm')); await p.waitForTimeout(600);
  assert.match(await text(p, '#vd_status'), /nicht geklappt/);
  await p.locator('#vd_datei').setInputFiles(datei('ohne-ki.webm')); await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden);
  assert.match(await text(p, '#vd_meta'), /Rohtranskript/); assert.match(await p.locator('#vd_text').inputValue(), /Rohtranskript/);
  await shot(p, 'vertrieb-diktat-ohne-ki', DESKTOP);
  await p.locator('#vd_weg').click(); assert.ok(await p.evaluate(() => document.querySelector('#vd_erg').hidden));
  await p.locator('#vd_datei').setInputFiles(datei('gross.webm', 26 * 1024 * 1024)); await p.waitForTimeout(300);
  assert.match(await text(p, '#vd_status'), /größer als 25 MB/);
  // Dienst nicht erreichbar (Workflow nicht aktiv): Umleitung auf 404
  await p.route(/n8n\.hm-storage\.de\/webhook\/team-diktat/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":404,"message":"not registered"}' }));
  await p.locator('#vd_datei').setInputFiles(datei('egal.webm')); await p.waitForTimeout(600);
  assert.match(await text(p, '#vd_status'), /Workflow „TEAM: Diktat“/);
  await shot(p, 'vertrieb-diktat-fehler-nicht-erreichbar', DESKTOP);
  await p.close();
  // Rolle team sieht den Vertrieb gar nicht
  const q = await seite(DESKTOP, 'Rolle');
  await q.goto(S.base + '/team/?z=' + TOKENS.m_lillien + '#/tab/vertrieb', { waitUntil: 'networkidle' }); await q.waitForTimeout(400);
  assert.ok(!(await q.locator('#v_diktat').count()));
  await q.close();
});

test('Tastatur: Aufnehmen per Enter, Escape schließt und stoppt', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Tastatur');
  await dialogOeffnen(p, TOKENS.m_murat);
  await p.locator('#vd_rec').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.match(await text(p, '#vd_status'), /Aufnahme läuft/);
  // Escape bleibt bei ungespeicherten Änderungen (laufende Aufnahme) blockiert, wie überall im Portal; „Abbrechen“ fragt nach und schließt
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.querySelector('#dlg').open)); assert.match(await text(p, '#toast'), /Ungespeicherte Änderungen/);
  await p.locator('#v_c').click(); await p.waitForTimeout(300);
  assert.ok(!(await p.evaluate(() => document.querySelector('#dlg').open)));
  await p.close();
});

test('keine JavaScript-Fehler', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
