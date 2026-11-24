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
  await um(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, '/api/team'); await um(/n8n\.hm-storage\.de\/webhook\/team-vertrieb/, '/api/vertrieb'); await um(/n8n\.hm-storage\.de\/webhook\/team-diktat/, '/api/diktat'); await um(/webhook\/team-msgs/, '/api/nachrichten'); await um(/webhook\/team-chat$/, '/api/chat');  // Posteingang und Chat lädt das Portal beim Start
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
    // PC-Ton ist vorausgewählt (Chrome am Computer); für diesen Test nur das Mikrofon
    assert.equal(await p.locator('#vd_pc').isChecked(), true, 'PC-Ton vorausgewählt');
    assert.equal(await p.locator('#vd_pc_hinweis').isVisible(), true); assert.equal(await p.locator('#vd_mit_l').isHidden(), true);
    await p.locator('#vd_pc').uncheck(); assert.equal(await p.locator('#vd_pc_hinweis').isHidden(), true);
    // Hinweis für Zoom/Telefon erscheint nur beim Gesprächsmitschnitt
    assert.equal(await p.locator('#vd_zoom').isHidden(), true);
    await p.locator('#vd_mit').check(); assert.match(await text(p, '#vd_zoom'), /Kopfhörern hört es die andere Person nicht/);
    await shot(p, 'vertrieb-diktat-zoom-hinweis', vp);
    await p.locator('#vd_mit').uncheck(); assert.equal(await p.locator('#vd_zoom').isHidden(), true);
    await p.locator('#vd_rec').click(); await p.waitForTimeout(300);
    assert.ok(!(await p.locator('#vd_stop').isHidden()), 'Stopp-Knopf sichtbar'); assert.match(await text(p, '#vd_status'), /Aufnahme läuft/);
    // Pegel: sichtbar und schlägt aus (das simulierte Mikrofon von Chrome piept regelmäßig)
    assert.equal(await p.locator('#vd_pegel').isVisible(), true, 'Pegel sichtbar');
    await p.waitForFunction(() => Number((document.querySelector('#vd_pegel') || {}).dataset?.pegel || 0) > 5, null, { timeout: 5000 });
    await p.waitForTimeout(1500); await shot(p, 'vertrieb-diktat-aufnahme', vp);
    await p.locator('#vd_stop').click();
    await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
    assert.equal(await p.locator('#vd_pegel').isHidden(), true, 'Pegel nach Stopp weg');
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
  await p.locator('#vd_pc').uncheck();
  await p.locator('#vd_rec').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.match(await text(p, '#vd_status'), /Aufnahme läuft/);
  // Escape bleibt bei ungespeicherten Änderungen (laufende Aufnahme) blockiert, wie überall im Portal; „Abbrechen“ fragt nach und schließt
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.querySelector('#dlg').open)); assert.match(await text(p, '#toast'), /Ungespeicherte Änderungen/);
  await p.locator('#v_c').click(); await p.waitForTimeout(300);
  assert.ok(!(await p.evaluate(() => document.querySelector('#dlg').open)));
  await p.close();
});

// PC-Ton: Bildschirmfreigabe wird nachgebildet (Ton = Sinuston aus Web Audio, Bild = Canvas). Echte Freigabe in Chrome kann nur ein Mensch testen.
const PC_STUB = () => {
  window.__vdStueckSek = 2;
  window.__gdmModus = 'ton';
  navigator.mediaDevices.getDisplayMedia = async () => {
    if (window.__gdmModus === 'abbruch') throw new DOMException('Permission denied', 'NotAllowedError');
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36; cv.getContext('2d').fillRect(0, 0, 10, 10);
    const v = cv.captureStream(1);
    if (window.__gdmModus === 'ohne') return v;
    const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = 440; const g = ac.createGain(); g.gain.value = 0.6; o.connect(g); const d = ac.createMediaStreamDestination(); g.connect(d); o.start(); ac.resume();
    window.__gdmStrom = new MediaStream([...v.getVideoTracks(), ...d.stream.getAudioTracks()]);
    return window.__gdmStrom;
  };
};
for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': PC-Ton + Mikrofon, lange Aufnahme in Stücken → ganzer Text mit Zusammenfassung', async t => {
    if (!B) return t.skip();
    const p = await seite(vp, n + ' PC-Ton'); await p.addInitScript(PC_STUB);
    const anfragen = []; p.on('request', r => { if (/team-diktat/.test(r.url())) anfragen.push(String(r.postData() || '')); });
    await dialogOeffnen(p, TOKENS.m_murat);
    assert.equal(await p.locator('#vd_pc').isChecked(), true);
    await shot(p, 'vertrieb-diktat-pc-ton', vp);
    await p.locator('#vd_rec').click();
    await p.waitForFunction(() => !document.querySelector('#vd_pegel_pc').hidden, null, { timeout: 5000 });
    assert.equal(await p.locator('#vd_pegel').isVisible(), true, 'Pegel Mikrofon sichtbar'); assert.equal(await p.locator('#vd_pegel_pc').isVisible(), true, 'Pegel PC sichtbar');
    await p.waitForFunction(() => Number(document.querySelector('#vd_pegel_pc').dataset.pegel || 0) > 5, null, { timeout: 5000 });
    assert.match(await text(p, '#vd_status'), /PC-Ton läuft/);
    assert.ok(await p.locator('#vd_pc').isDisabled(), 'Haken während der Aufnahme gesperrt');
    await p.waitForTimeout(1200); await shot(p, 'vertrieb-diktat-pc-ton-aufnahme', vp);
    await p.waitForTimeout(4200);
    await p.locator('#vd_stop').click();
    await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 20000 });
    const erg = await p.locator('#vd_text').inputValue();
    assert.match(erg, /Mitschnitt mit Computerton/); assert.match(erg, /Zusammenfassung:\*\* Meeting zum KI-Führerschein/);
    assert.match(erg, /Abschnitt 1 aus dem Meeting\.\s+Abschnitt 2 aus dem Meeting\./, 'Abschnitte in Reihenfolge');
    assert.match(await text(p, '#vd_meta'), /zusammengefasst/); assert.match(await text(p, '#vd_roh'), /abschnitt 1 vom meeting/);
    const stuecke = anfragen.filter(a => /name="teil"/.test(a)), gesamt = anfragen.filter(a => /zusammenfassen/.test(a));
    assert.ok(stuecke.length >= 3, 'mindestens drei Stücke: ' + stuecke.length); assert.equal(gesamt.length, 1);
    assert.match(gesamt[0], /name="pc_ton"\r\n\r\n1/); assert.match(gesamt[0], /name="modus"\r\n\r\ngespraech/);
    assert.ok(await p.evaluate(() => window.__gdmStrom.getTracks().every(t => t.readyState === 'ended')), 'Freigabe nach Stopp beendet');
    assert.equal(await p.locator('#vd_pegel_pc').isHidden(), true);
    await shot(p, 'vertrieb-diktat-pc-ton-ergebnis', vp);
    await p.close();
  });
}

test('PC-Ton mit „Mikro aus“: nur Ton vom Computer, kein Mikrofonzugriff', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Mikro aus'); await p.addInitScript(PC_STUB);
  await p.addInitScript(() => { window.__gum = 0; const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__gum++; return o(c); }; window.__vdStueckSek = 60; });
  await dialogOeffnen(p, TOKENS.m_murat);
  assert.equal(await p.locator('#vd_ohnemikro_l').isVisible(), true, 'Haken „Mikro aus“ bei PC-Ton sichtbar');
  await p.locator('#vd_pc').uncheck(); assert.equal(await p.locator('#vd_ohnemikro_l').isHidden(), true); await p.locator('#vd_pc').check();
  await p.locator('#vd_ohnemikro').check();
  await p.locator('#vd_rec').click();
  await p.waitForFunction(() => !document.querySelector('#vd_pegel_pc').hidden, null, { timeout: 5000 });
  assert.equal(await p.locator('#vd_pegel').isHidden(), true, 'kein Mikrofon-Balken'); assert.match(await text(p, '#vd_status'), /Mikro aus/);
  assert.ok(await p.locator('#vd_ohnemikro').isDisabled());
  await p.waitForTimeout(2500); await shot(p, 'vertrieb-diktat-mikro-aus', DESKTOP);
  await p.locator('#vd_stop').click();
  await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => window.__gum), 0, 'getUserMedia nicht aufgerufen');
  assert.match(await p.locator('#vd_text').inputValue(), /Mitschnitt mit Computerton/);
  await p.close();
});

test('Auffrischen alle 2 Minuten pausiert während der Aufnahme (Aufnahme läuft weiter)', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'Auffrischen'); await p.clock.install(); await p.addInitScript(PC_STUB);
  await p.addInitScript(() => { window.__vdStueckSek = 3600; });
  let laden = 0; p.on('request', r => { if (/team-api-v2/.test(r.url()) && /"aktion":"laden"/.test(String(r.postData() || ''))) laden++; });
  await p.goto(S.base + '/team/?z=' + TOKENS.m_murat + '#/tab/diktat', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('#v_diktat').dataset.marke = 'vorher'; });
  await p.locator('#vd_rec').click(); await p.waitForFunction(() => !document.querySelector('#vd_stop').hidden, null, { timeout: 5000 });
  const vorher = laden;
  await p.clock.fastForward(130000); await p.waitForTimeout(800);
  assert.equal(laden, vorher, 'kein Auffrischen während der Aufnahme');
  assert.equal(await p.evaluate(() => document.querySelector('#v_diktat').dataset.marke), 'vorher', 'Ansicht nicht neu aufgebaut');
  assert.equal(await p.locator('#vd_stop').isVisible(), true, 'Aufnahme läuft weiter');
  await p.locator('#vd_stop').click();
  await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
  await p.locator('#vd_weg').click(); await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.clock.fastForward(130000); await p.waitForTimeout(800);
  assert.ok(laden > vorher, 'nach der Aufnahme frischt das Portal wieder auf');
  await p.close();
});

test('PC-Ton: kein Ton geteilt, Teilen abgebrochen, Freigabe beendet, Workflow ohne Zusammenfassen', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'PC-Ton Fehler'); await p.addInitScript(PC_STUB);
  await dialogOeffnen(p, TOKENS.m_murat);
  await p.evaluate(() => { window.__gdmModus = 'ohne'; });
  await p.locator('#vd_rec').click(); await p.waitForTimeout(500);
  assert.match(await text(p, '#vd_status'), /kein PC-Ton/); assert.ok(await p.locator('#vd_stop').isHidden(), 'keine Aufnahme ohne PC-Ton');
  await shot(p, 'vertrieb-diktat-pc-ton-ohne-ton', DESKTOP);
  await p.evaluate(() => { window.__gdmModus = 'abbruch'; });
  await p.locator('#vd_rec').click(); await p.waitForTimeout(400);
  assert.match(await text(p, '#vd_status'), /Teilen abgebrochen/);
  // Freigabe in Chrome beenden stoppt die Aufnahme; kurze Aufnahme (ein Stück) geht wie bisher in einem Schritt
  await p.evaluate(() => { window.__gdmModus = 'ton'; window.__vdStueckSek = 60; });
  await p.locator('#vd_rec').click(); await p.waitForTimeout(1800);
  await p.evaluate(() => { const v = window.__gdmStrom.getVideoTracks()[0]; v.stop(); v.dispatchEvent(new Event('ended')); });
  await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 15000 });
  assert.match(await p.locator('#vd_text').inputValue(), /Mitschnitt mit Computerton/);
  await p.locator('#vd_weg').click();
  // Alter Workflow (kennt aktion=zusammenfassen noch nicht): ganzer Text ohne Zusammenfassung
  await p.route(/team-diktat/, r => /zusammenfassen/.test(String(r.request().postData() || '')) ? r.fulfill({ status: 400, contentType: 'application/json', body: '{"ok":false,"fehler":"Es ist keine Aufnahme angekommen."}' }) : r.fallback());
  await p.evaluate(() => { window.__vdStueckSek = 2; });
  await p.locator('#vd_rec').click(); await p.waitForTimeout(4600); await p.locator('#vd_stop').click();
  await p.waitForFunction(() => !document.querySelector('#vd_erg').hidden, null, { timeout: 20000 });
  assert.match(await p.locator('#vd_text').inputValue(), /Abschnitt 1 aus dem Meeting/); assert.match(await text(p, '#vd_meta'), /Zusammenfassung war nicht verfügbar/);
  await p.close();
});

test('keine JavaScript-Fehler', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
