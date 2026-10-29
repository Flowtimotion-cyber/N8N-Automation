// Browsertest: Register „Diktat“ (freies Diktat → Lead wählen oder per E-Mail Kontakt finden/anlegen). Fake-Mikrofon, lokale Nachbildungen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const SHOTS = join(REPO, 'docs', 'office', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [];
function playwright() { const k = [process.cwd() + '/']; try { k.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {} for (const p of k) { try { return createRequire(p)('playwright'); } catch (e) {} } return null; }
before(async () => { mkdirSync(SHOTS, { recursive: true }); S = await serverStarten({ tempo: 0 }); const pw = playwright(); if (pw) B = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); });
after(async () => { if (B) await B.close(); if (S) await S.stop(); });
async function seite(vp, name) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin', permissions: ['microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  const um = (muster, ziel) => p.route(muster, async r => { const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': r.request().headers()['content-type'] || 'text/plain' }, body: r.request().postDataBuffer() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  await um(/webhook\/team-api-v2/, '/api/team'); await um(/webhook\/team-vertrieb/, '/api/vertrieb'); await um(/webhook\/team-diktat/, '/api/diktat');
  return p;
}
const text = async (p, sel) => (await p.locator(sel).first().textContent()) || '';
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
async function aufnehmen(p) {
  await p.locator('#vd_rec').click(); await p.waitForTimeout(1500); await p.locator('#vd_stop').click();
  await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
}
const chancen = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json()), (await post(S.base, '/api/vertrieb', { token: TOKENS.m_timo, aktion: 'liste' })).j.chancen);

test('Browser verfügbar', t => { if (!B) t.skip(); });

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Register Diktat, Lead wählen, speichern', async t => {
    if (!B) return t.skip();
    const p = await seite(vp, n);
    await p.goto(S.base + '/team/?z=' + TOKENS.m_murat + '#/tab/diktat', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    assert.match(await text(p, 'h1'), /Diktat/); assert.ok(await p.locator('#dk_q').count()); await shot(p, 'vertrieb-diktat-register', vp);
    assert.ok(await p.locator('#dk_save').isDisabled());
    const vorher = (await chancen()).find(c => c.id === 'c-1001').notizen;
    await aufnehmen(p);
    assert.ok(await p.locator('#vd_save').isHidden(), 'Speichern-Knopf der Box bleibt verborgen; Zuordnen übernimmt');
    await p.locator('#dk_q').fill('müller'); await p.waitForTimeout(400);
    assert.ok((await p.locator('[data-dkl]').count()) >= 1); await p.locator('[data-dkl]').first().click(); await p.waitForTimeout(200);
    assert.match(await text(p, '#dk_gewaehlt'), /Müller GmbH/); assert.ok(!(await p.locator('#dk_save').isDisabled()));
    await shot(p, 'vertrieb-diktat-register-lead', vp);
    await p.locator('#dk_save').click();
    await p.waitForFunction(() => /in Twenty gespeichert/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    await p.waitForTimeout(300);
    assert.ok((await text(p, '#main')).includes('Letzte Diktate')); assert.ok((await text(p, '#main')).includes('Müller GmbH'), 'Verlauf zeigt Ziel');
    const C = await chancen(); assert.equal(C.find(c => c.id === 'c-1001').notizen, vorher + 1, 'Notiz an der Chance gezählt');
    await shot(p, 'vertrieb-diktat-register-gespeichert', vp);
    await p.close();
  });
}

test('E-Mail: vorhandener Kontakt mit Chance, Kontakt ohne Chance, neuer Kontakt wird angelegt', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Mail');
  await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/diktat', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await aufnehmen(p);
  // vorhandene Adresse → Lead gefunden
  await p.locator('#dk_mail').fill('hans@example.invalid'); await p.locator('#dk_pruef').click(); await p.waitForTimeout(400);
  assert.match(await text(p, '#dk_status'), /Lead gefunden/); assert.match(await text(p, '#dk_gewaehlt'), /Müller GmbH/);
  // neue Adresse → Felder, Speichern legt Kontakt + Chance an
  await p.locator('#dk_zweg').click(); await p.waitForTimeout(100);
  await p.locator('#dk_mail').fill('lena.neu@example.invalid'); await p.locator('#dk_pruef').click(); await p.waitForTimeout(400);
  assert.match(await text(p, '#dk_status'), /angelegt/); assert.equal(await p.locator('#dk_vn').inputValue(), 'Lena'); assert.equal(await p.locator('#dk_nn').inputValue(), 'Neu');
  await p.locator('#dk_firma').fill('Neu & Co (Test)'); await shot(p, 'vertrieb-diktat-register-neuer-kontakt', DESKTOP);
  const vorher = (await chancen()).length;
  await p.locator('#dk_save').click();
  await p.waitForFunction(() => /in Twenty gespeichert/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  const C = await chancen(); assert.equal(C.length, vorher + 1); const neu = C.find(c => (c.kontakt || {}).email === 'lena.neu@example.invalid');
  assert.ok(neu); assert.equal(neu.name, 'Neu & Co (Test)'); assert.equal(neu.notizen, 1); assert.equal(neu.stage, 'NEW');
  // ungültige Adresse
  await p.waitForTimeout(300); await aufnehmen(p);
  await p.locator('#dk_mail').fill('keine-adresse'); await p.locator('#dk_pruef').click(); await p.waitForTimeout(200);
  assert.match(await text(p, '#dk_status'), /gültige E-Mail/);
  // Speichern ohne Zuordnung ist gesperrt
  assert.ok(await p.locator('#dk_save').isDisabled());
  await p.close();
});

test('Rolle team sieht das Register nicht; keine JavaScript-Fehler', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Rolle');
  await p.goto(S.base + '/team/?z=' + TOKENS.m_lillien + '#/tab/diktat', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  assert.ok(!(await p.locator('#dk_q').count())); assert.ok(!(await text(p, 'nav.tabs')).includes('Diktat'));
  await p.close();
  assert.deepEqual(fehler, []);
});
