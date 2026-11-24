// Browsertest: Register „ChatGPT-Werbung“ im Team-Portal gegen Musterdaten (Testadapter, kein n8n, kein Schlüssel).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';
import { ADS_ROLLEN } from '../lib/kennzahlen.js';

const SHOTS = join(REPO, 'werbung', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [], anfragen = [];
function playwright() { const k = [process.cwd() + '/']; try { k.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {} for (const p of k) { try { return createRequire(p)('playwright'); } catch (e) {} } return null; }
before(async () => { mkdirSync(SHOTS, { recursive: true }); S = await serverStarten({ tempo: 0 }); const pw = playwright(); if (pw) B = await pw.chromium.launch(); });
after(async () => { if (B) await B.close(); if (S) await S.stop(); });
async function seite(vp, name) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  // Nichts geht nach draußen: fremde Adressen (Loom-Video der Übersicht, Schriften) werden abgebrochen, die n8n-Adressen unten nachgebildet
  await p.route(u => !u.href.startsWith(S.base), r => r.abort());
  const um = (muster, ziel) => p.route(muster, async r => { const req = r.request(); if (ziel === '/api/werbung') anfragen.push({ kopf: req.headers(), body: req.postData() }); const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': req.headers()['content-type'] || 'text/plain' }, body: req.postDataBuffer() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  await um(/webhook\/team-api-v2/, '/api/team'); await um(/webhook\/team-ads/, '/api/werbung'); await um(/webhook\/team-vertrieb/, '/api/vertrieb');
  await p.route(/webhook\/(?!team-api-v2|team-ads|team-vertrieb)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
  return p;
}
const text = async (p, sel) => (await p.locator(sel).first().textContent()) || '';
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
const szenario = s => post(S.base, '/api/test/werbung', { szenario: s });
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).werbung;
const oeffnen = async (p, wer) => { await p.goto(S.base + '/team/?z=' + TOKENS[wer] + '#/tab/werbung', { waitUntil: 'networkidle' }); await p.waitForTimeout(300); };
const spalte = (p, n) => p.locator('#adsTabelle tbody tr td:nth-child(' + n + ')').allTextContents();
const zahl = t => Number(String(t).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));

test('Browser verfügbar', t => { if (!B) t.skip(); });

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Kacheln, Trichter, Tabelle, Fußnote', async t => {
    if (!B) return t.skip();
    await szenario('standard');
    const p = await seite(vp, n);
    await oeffnen(p, 'm_timo');
    assert.match(await text(p, 'h1'), /ChatGPT-Werbung/);
    assert.ok((await text(p, 'nav.tabs')).includes('ChatGPT-Werbung'));
    // sechs Kacheln in der bestellten Reihenfolge
    assert.deepEqual(await p.locator('#adsKacheln .kpi span').allTextContents(), ['Kosten', 'Klicks', 'CTR (Klickrate)', 'CPC (Kosten pro Klick)', 'Leads', 'Kosten pro Lead']);
    const kacheln = await p.locator('#adsKacheln .kpi b').allTextContents();
    assert.match(kacheln[0], /^144,80\s€$/); assert.equal(kacheln[1], '181'); assert.match(kacheln[2], /^1,32\s%$/); assert.match(kacheln[3], /^0,80\s€$/); assert.equal(kacheln[4], '7'); assert.match(kacheln[5], /^20,69\s€$/);
    // Trichter mit sechs Stufen
    assert.deepEqual(await p.locator('#adsTrichter .row > span:first-child').allTextContents(), ['Impressionen', 'Klicks', 'Besuche', 'Check gestartet', 'Leads', 'Termin geöffnet']);
    assert.match(await text(p, '#adsTrichter .row:nth-child(1) b'), /^13\.700$/);
    assert.match(await text(p, '#adsTrichter .row:nth-child(2) b'), /^181\s*1,3\s%$/);
    // Tabelle: alle Situationen, alle Spalten, Vorgabe nach Leads absteigend
    assert.equal(await p.locator('#adsTabelle tbody tr').count(), 6);
    assert.equal(await p.locator('#adsTabelle thead th').count(), 13);
    assert.equal(await p.locator('#adsTabelle th[aria-sort="descending"]').textContent(), 'Leads ▼');
    assert.deepEqual((await spalte(p, 10)).map(zahl), [3, 2, 2, 0, 0, 0]);
    assert.match(await text(p, '#adsHinweis'), /Situationen ohne Impressionen erscheinen nicht in der Liste/);
    assert.match(await text(p, '#adsMeta'), /letzte 7 Tage/);
    // Seite selbst läuft nicht in die Breite (die Tabelle rollt in ihrem Rahmen)
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'kein waagerechtes Rollen der Seite');
    await shot(p, 'werbung', vp);
    await p.close();
  });
}

test('Tabelle sortieren: Klick auf die Überschrift, zweiter Klick dreht um, Zeilen ohne Preis pro Lead bleiben unten', async t => {
  if (!B) return t.skip();
  await szenario('standard');
  const p = await seite(DESKTOP, 'Sortieren');
  await oeffnen(p, 'm_timo');
  await p.locator('[data-adss="impressionen"]').click();
  assert.deepEqual((await spalte(p, 2)).map(zahl), [4210, 3580, 2740, 1920, 860, 390]);
  assert.equal(await p.locator('#adsTabelle th[aria-sort]').getAttribute('aria-sort'), 'descending');
  await p.locator('[data-adss="impressionen"]').click();
  assert.deepEqual((await spalte(p, 2)).map(zahl), [390, 860, 1920, 2740, 3580, 4210]);
  assert.equal(await p.locator('#adsTabelle th[aria-sort]').getAttribute('aria-sort'), 'ascending');
  await p.locator('[data-adss="situation"]').click();
  const namen = await spalte(p, 1);
  assert.deepEqual(namen, namen.slice().sort((a, b) => a.localeCompare(b, 'de')));
  await p.locator('[data-adss="kosten_pro_lead"]').click();
  assert.deepEqual((await spalte(p, 13)).map(x => x.trim()).slice(3), ['–', '–', '–']);
  await p.locator('[data-adss="kosten_pro_lead"]').click();
  assert.deepEqual((await spalte(p, 13)).map(x => x.trim()).slice(3), ['–', '–', '–'], 'auch aufsteigend stehen die Striche unten');
  await p.close();
});

test('Zeitraum 7, 14, 30 Tage: schickt den Zeitraum mit, merkt sich die Antwort, fragt die Quelle nicht doppelt', async t => {
  if (!B) return t.skip();
  await szenario('standard'); anfragen = [];
  const p = await seite(DESKTOP, 'Zeitraum');
  await oeffnen(p, 'm_timo');
  assert.deepEqual(await p.locator('[data-adst]').allTextContents(), ['7 Tage', '14 Tage', '30 Tage']);
  assert.equal(await p.locator('[data-adst].on').textContent(), '7 Tage');
  await p.locator('[data-adst="14"]').click();
  await p.waitForFunction(() => /letzte 14 Tage/.test(document.querySelector('#adsMeta') ? document.querySelector('#adsMeta').textContent : ''));
  assert.equal(await p.locator('[data-adst].on').textContent(), '14 Tage');
  assert.equal(await text(p, '#adsKacheln .kpi:nth-child(2) b'), '362');
  await p.locator('[data-adst="30"]').click();
  await p.waitForFunction(() => /letzte 30 Tage/.test(document.querySelector('#adsMeta') ? document.querySelector('#adsMeta').textContent : ''));
  await p.locator('[data-adst="7"]').click(); await p.locator('[data-adst="14"]').click(); await p.locator('[data-adst="7"]').click(); await p.waitForTimeout(300);
  assert.match(await text(p, '#adsMeta'), /letzte 7 Tage/);
  assert.deepEqual(anfragen.map(a => JSON.parse(a.body).daten.tage), [7, 14, 30], 'je Zeitraum genau ein Aufruf aus dem Browser');
  assert.deepEqual((await zustand()).tage, [7, 14, 30], 'die Quelle wurde je Zeitraum einmal gefragt');
  // Auswahl bleibt nach dem Neuladen, und der Server antwortet dann aus dem Zwischenspeicher
  await p.locator('[data-adst="30"]').click(); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-adst].on').textContent(), '30 Tage');
  assert.deepEqual((await zustand()).tage, [7, 14, 30], 'nach dem Neuladen kein weiterer Abruf der Quelle');
  // Der Browser schickt nur den Mitglieds-Token, keinen Schlüssel
  for (const a of anfragen) { assert.equal(a.kopf['x-api-key'], undefined); assert.deepEqual(Object.keys(JSON.parse(a.body)).sort(), ['daten', 'token']); }
  await p.close();
});

test('Noch keine Leads: Kosten pro Lead als Strich, in Kachel und Tabelle', async t => {
  if (!B) return t.skip();
  await szenario('ohne-leads');
  const p = await seite(MOBIL, 'OhneLeads');
  await oeffnen(p, 'm_timo');
  assert.equal(await text(p, '#adsKacheln .kpi:nth-child(5) b'), '0');
  assert.equal(await text(p, '#adsKacheln .kpi:nth-child(6) b'), '–');
  assert.ok((await spalte(p, 13)).every(x => x.trim() === '–'));
  assert.match(await text(p, '#adsTrichter .row:nth-child(5) b'), /^0\s*0\s%$/);
  assert.match(await text(p, '#adsTrichter .row:nth-child(6) b'), /^0\s*–$/, 'ohne Leads gibt es keinen Anteil für den Termin');
  assert.doesNotMatch(await text(p, '#main'), /null|NaN|undefined|Infinity/);
  await shot(p, 'werbung-ohne-leads', MOBIL);
  await p.close();
});

test('Noch keine Impressionen: leere Liste mit Hinweis statt Tabelle', async t => {
  if (!B) return t.skip();
  await szenario('leer');
  const p = await seite(DESKTOP, 'Leer');
  await oeffnen(p, 'm_timo');
  assert.equal(await p.locator('#adsTabelle').count(), 0);
  assert.match(await text(p, '#adsLeer'), /Noch hat keine Situation Impressionen/);
  const kacheln = await p.locator('#adsKacheln .kpi b').allTextContents();
  assert.match(kacheln[0], /^0,00\s€$/); assert.equal(kacheln[3], '–'); assert.equal(kacheln[5], '–');
  assert.doesNotMatch(await text(p, '#main'), /null|NaN|undefined|Infinity/);
  assert.ok(await p.locator('#adsHinweis').count());
  await shot(p, 'werbung-leer', DESKTOP);
  await p.close();
});

test('Quelle nicht erreichbar: verständliche Meldung, „Erneut versuchen“ lädt nach', async t => {
  if (!B) return t.skip();
  await szenario('kaputt');
  const p = await seite(DESKTOP, 'Kaputt');
  await oeffnen(p, 'm_timo');
  assert.match(await text(p, '#adsFehler'), /gerade nicht erreichbar/);
  assert.equal(await p.locator('#adsKacheln').count(), 0);
  await szenario('standard');
  await p.locator('#adsNochmal').click();
  await p.waitForSelector('#adsKacheln');
  assert.equal(await p.locator('#adsTabelle tbody tr').count(), 6);
  await p.close();
});

test('Andere Rollen sehen das Register nicht und bekommen vom Server keine Zahlen', async t => {
  if (!B) return t.skip();
  await szenario('standard');
  for (const wer of ['m_kurt', 'm_murat', 'm_lillien']) {
    const rolle = { m_kurt: 'dozent', m_murat: 'vertrieb', m_lillien: 'team' }[wer];
    const erlaubt = ADS_ROLLEN.includes(rolle);
    const p = await seite(DESKTOP, 'Rolle ' + rolle);
    await oeffnen(p, wer);
    assert.equal((await text(p, 'nav.tabs')).includes('ChatGPT-Werbung'), erlaubt, 'Reiter für ' + rolle);
    assert.equal(await p.locator('#adsBody').count(), erlaubt ? 1 : 0, 'direkter Link für ' + rolle);
    const r = await post(S.base, '/api/werbung', { token: TOKENS[wer], daten: { tage: 7 } });
    assert.equal(r.status, erlaubt ? 200 : 403); if (!erlaubt) assert.equal(r.j.gesamt, undefined);
    await p.close();
  }
  assert.equal((await post(S.base, '/api/werbung', { token: TOKENS['agent-claude'], daten: {} })).status, 403);
  assert.equal((await post(S.base, '/api/werbung', { token: TOKENS.m_gesperrt, daten: {} })).status, 401);
  assert.equal((await post(S.base, '/api/werbung', { daten: {} })).status, 401);
});

test('Keine JavaScript-Fehler in allen Läufen', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
