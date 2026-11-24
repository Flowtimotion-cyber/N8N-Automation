// Browsertest: Vorschläge vom 20.11.2026 im Team-Portal (Kurt, Lillien) gegen den Testserver (Testadapter, kein n8n, keine Produktivdaten).
// Schreibaufrufe an die Portal-API werden abgefangen und ihre Nutzlast geprüft.
// Braucht Playwright („playwright“ oder „playwright-core“); ohne wird übersprungen. Im Worktree: NODE_PATH auf node_modules des Hauptordners.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const SHOTS = join(REPO, 'team', 'screenshots');
const DESKTOP = { width: 1440, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [], WA_MIT = [];

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

const tage = n => new Date(Date.now() - n * 864e5).toISOString();
// Testdaten des Testadapters ergänzen: Bearbeiter-Listen, Prio 1–10, lange Beschreibung, viele Kommentare
function anpassen(d) {
  const a = id => d.aufgaben.find(x => x.aufgabe_id === id);
  d.aufgaben.forEach((x, i) => { x.erstellt = tage(i * 3 + 1); x.geaendert = tage(i); });
  Object.assign(a('a_k1'), { prio: 2, bearbeiter: ['agent-claude', 'm_kurt'], beschreibung: '## Ziel\nMerkblatt fertig.\n\n\n\nNach drei Leerzeilen.\n---\ngrau\n===\nschwarz\n====\ndick\n' + Array.from({ length: 40 }, (_, i) => 'Zeile ' + i).join('\n') });
  Object.assign(a('a_w1'), { prio: 7, bearbeiter: ['m_lillien', 'm_kurt', 'm_murat'] });
  Object.assign(a('a_k4'), { prio: 5 });
  a('a_s2').prio = 9;
  // Automatische WhatsApp: diese Personen haben im Test eine (erfundene) Handynummer und die Einwilligung im Profil
  for (const m of d.mitglieder) if (WA_MIT.includes(m.mitglied_id)) Object.assign(m, { whatsapp_ok: true, telefon: '+4915100000000' });
  for (let i = 0; i < 25; i++) d.verlauf.push({ aufgabe_id: 'a_k1', autor: i % 2 ? 'm_kurt' : 'm_timo', art: 'kommentar', text: 'Kommentar ' + i, erstellt: new Date(Date.now() - (25 - i) * 3600e3).toISOString() });
  return d;
}
async function seite(vp, name, wer) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  p.schreib = [];
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  await p.route(u => !u.href.startsWith(S.base), r => r.abort());
  await p.route(/webhook\/team-api-v2/, async r => {
    const body = r.request().postData(), j = JSON.parse(body);
    if (j.aktion !== 'laden') { p.schreib.push({ aktion: j.aktion, daten: j.daten }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: (j.daten && (j.daten.aufgabe_id || j.daten.zeit_id)) || 'neu1' }) }); }
    const res = await fetch(S.base + '/api/team', { method: 'POST', body });
    r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(anpassen(await res.json())) });
  });
  await p.route(/webhook\/(?!team-api-v2)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
  await p.goto(S.base + '/team/?z=' + TOKENS[wer || 'm_kurt'] + '#/tab/aufgaben', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  return p;
}
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('4 + 6: Liste zeigt mehrere Bearbeiter, „Mir zugewiesen“ über die Liste, Erstellt-/Änderungsdatum', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'liste', 'm_murat');
  await p.selectOption('#fp', 'ich');
  await p.waitForTimeout(200);
  const ids = await p.$$eval('#main .task[data-a]', L => L.map(e => e.dataset.a));
  assert.ok(ids.includes('a_w1'), 'Murat ist dritter Bearbeiter von a_w1 und sieht sie bei „Mir zugewiesen“');
  const zeile = p.locator('#main .task[data-a="a_w1"]');
  assert.equal(await zeile.locator('.avs .av').count(), 3);
  assert.match(await zeile.locator('.right').innerText(), /Lillien \(Test\), Kurt \(Test\), Murat \(Test\)/);
  assert.match(await zeile.locator('.adat').innerText(), /^erstellt \d\d\.\d\d\.\d\d · geändert \d\d\.\d\d\.\d\d$/);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('3: Prio 1–10 in Liste und Dialog (Farbe nach Stufe, Auswahl mit 10 Werten)', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'prio');
  await p.selectOption('#fp', '');
  await p.waitForTimeout(200);
  const chip = async id => p.$eval('#main .task[data-a="' + id + '"] .meta .chip', e => [e.textContent, e.className]);
  assert.deepEqual(await chip('a_w1'), ['Prio 7', 'chip p3']);
  assert.deepEqual(await chip('a_k4'), ['Prio 5', 'chip p2']);
  assert.deepEqual(await chip('a_k1'), ['Prio 2', 'chip p1']);
  await p.click('#main .task[data-a="a_w1"]');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#a_p option').count(), 10);
  assert.equal(await p.inputValue('#a_p'), '7');
  assert.match(await p.locator('#a_p option[value="1"]').innerText(), /am wichtigsten/);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('5: Sortierung nach Erstellt, Geändert, Bearbeiter; Auswahl wird gemerkt', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'sort');
  await p.selectOption('#fp', '');
  await p.selectOption('#fs', '');
  const reihe = async () => p.$$eval('#main .task[data-a]', L => L.map(e => e.dataset.a));
  await p.selectOption('#fso', 'erstellt_alt'); await p.waitForTimeout(150);
  const alt = await reihe();
  await p.selectOption('#fso', 'erstellt_neu'); await p.waitForTimeout(150);
  const neu = await reihe();
  assert.equal(neu[0], 'a_k1', 'a_k1 ist in den Testdaten die jüngste');
  assert.deepEqual(neu, alt.slice().reverse());
  await p.selectOption('#fso', 'geaendert'); await p.waitForTimeout(150);
  assert.equal((await reihe())[0], 'a_k1');
  await p.selectOption('#fso', 'bearbeiter'); await p.waitForTimeout(150);
  assert.match(await p.locator('#main .sub').innerText(), /Nach Bearbeitern/);
  await shot(p, 'aufgaben-sortiert', DESKTOP);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  assert.equal(await p.inputValue('#fso'), 'bearbeiter');
  await p.selectOption('#fso', 'prio');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('4: Dialog – Bearbeiter hinzufügen und entfernen, Nutzlast mit Liste und Skala 10, Info je neuer Person', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'bearbeiter');
  await p.selectOption('#fp', '');
  await p.click('#main .task[data-a="a_w1"]');
  await p.waitForTimeout(300);
  assert.deepEqual(await p.$$eval('#a_bw .bchip', L => L.map(e => e.dataset.bid)), ['m_lillien', 'm_kurt', 'm_murat']);
  await p.click('#a_bw [data-bweg="m_kurt"]');
  await p.selectOption('#a_badd', 'm_timo');
  await p.selectOption('#a_p', '3');
  await shot(p, 'aufgabe-bearbeiter', DESKTOP);
  await p.click('#af [type=submit]');
  await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.deepEqual(s.daten.bearbeiter, ['m_lillien', 'm_murat', 'm_timo']);
  assert.equal(s.daten.verantwortlich, 'm_lillien');
  assert.equal(s.daten.prio, 3); assert.equal(s.daten.skala, 10);
  assert.match(await p.locator('#dlgInner h2').innerText(), /Timo \(Test\)/, 'Info-Dialog für die neu hinzugekommene Person');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('4: Neue Aufgabe – Standard Prio 5 und ich als Bearbeiter; letzte Person lässt sich nicht entfernen', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'neu');
  await p.click('#neu');
  await p.waitForTimeout(300);
  assert.equal(await p.inputValue('#a_p'), '5');
  assert.deepEqual(await p.$$eval('#a_bw .bchip', L => L.map(e => e.dataset.bid)), ['m_kurt']);
  assert.equal(await p.locator('#a_bw [data-bweg]').count(), 0);
  await p.fill('#a_t', 'Testaufgabe mit Agent');
  await p.selectOption('#a_badd', 'agent-claude');
  await p.click('#af [type=submit]');
  await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.deepEqual(s.daten.bearbeiter, ['m_kurt', 'agent-claude']);
  assert.equal(s.daten.prio, 5);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('2: Aufgabenfenster bleibt im Browserfenster, Verlauf scrollt für sich, breit = zweispaltig', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'scroll');
  await p.selectOption('#fp', '');
  await p.click('#main .task[data-a="a_k1"]');
  await p.waitForTimeout(400);
  await p.click('[data-edm="a_b"][data-m="beides"]');
  const mass = () => p.evaluate(() => { const d = document.querySelector('#dlg').getBoundingClientRect(), z = document.querySelector('#dlg .zieh').getBoundingClientRect(), vl = document.querySelector('#a_vl');
    return { unten: d.bottom, griff: z.bottom, hoehe: innerHeight, vlScroll: vl.scrollHeight > vl.clientHeight, vlUnten: vl.scrollTop + vl.clientHeight >= vl.scrollHeight - 2, zwei: document.querySelector('#af').classList.contains('zwei'), ta: document.querySelector('#a_b').offsetHeight }; });
  let m = await mass();
  assert.ok(m.unten <= m.hoehe && m.griff <= m.hoehe, 'Fenster und Griff im Browserfenster');
  assert.ok(m.vlScroll && m.vlUnten, 'Verlauf hat eine eigene Scrollleiste und zeigt die neuesten Einträge');
  assert.equal(m.zwei, false);
  // über den Bildschirmrand hinaus ziehen: Textfeld wächst höchstens bis 62 % der Fensterhöhe
  const g = await p.locator('#dlg .zieh').boundingBox();
  await p.mouse.move(g.x + 10, g.y + 10); await p.mouse.down(); await p.mouse.move(g.x + 400, g.y + 900, { steps: 6 }); await p.mouse.up();
  m = await mass();
  assert.ok(m.ta <= Math.round(DESKTOP.height * 0.62) + 1, 'Textfeld höchstens 62 % hoch, war ' + m.ta);
  assert.ok(m.unten <= m.hoehe && m.griff <= m.hoehe);
  await p.click('#dlgInner .vollbild'); await p.waitForTimeout(300);
  m = await mass();
  assert.equal(m.zwei, true, 'im großen Fenster steht der Verlauf neben der Beschreibung');
  await shot(p, 'aufgabe-zweispaltig', DESKTOP);
  await p.evaluate(() => localStorage.removeItem('mt-edhoehe'));
  await p.close();
  assert.deepEqual(fehler, []);
});

test('7: Mehrere Leerzeilen bleiben, === schwarze und ==== dicke Trennlinie', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'editor');
  await p.selectOption('#fp', '');
  await p.click('#main .task[data-a="a_k1"]');
  await p.waitForTimeout(300);
  await p.click('[data-edm="a_b"][data-m="vorschau"]');
  const v = await p.evaluate(() => { const e = document.querySelector('#a_b_v'); return { leer: e.querySelectorAll('.leerz').length, grau: e.querySelectorAll('hr:not([class])').length, schwarz: e.querySelectorAll('hr.hr-schwarz').length, dick: e.querySelectorAll('hr.hr-dick').length,
    dickPx: getComputedStyle(e.querySelector('hr.hr-dick')).borderTopWidth, farbe: getComputedStyle(e.querySelector('hr.hr-schwarz')).borderTopColor }; });
  assert.deepEqual(v, { leer: 2, grau: 1, schwarz: 1, dick: 1, dickPx: '2px', farbe: 'rgb(0, 0, 0)' });
  await shot(p, 'editor-trennlinien', DESKTOP);
  await p.click('[data-edm="a_b"][data-m="schreiben"]');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('1: Zeiteintrag mit mehreren Aufgaben, je Aufgabe „erledigt“, Nutzlast aufgaben_ids', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'zeit', 'm_lillien');
  await p.goto(S.base + '/team/?z=' + TOKENS.m_lillien + '#/tab/zeit', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.click('#neuz');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#t_al [data-ta]').count(), 1);
  await p.selectOption('#t_al [data-ta="0"]', 'a_w1');
  await p.click('#t_plus');
  await p.selectOption('#t_al [data-ta="1"]', 'a_s2');
  await p.click('#t_plus');
  await p.selectOption('#t_al [data-ta="2"]', 'a_k4');
  await p.click('#t_al [data-tweg="2"]');
  await p.check('#t_al [data-terl="a_s2"]');
  assert.equal(await p.isVisible('#t_j_w'), false, 'Projekt kommt aus der ersten Aufgabe');
  await p.fill('#t_v', '08:00'); await p.fill('#t_b', '09:30');
  await p.fill('#t_t', 'Impressum und Reel vorbereitet');
  await shot(p, 'zeit-mehrere-aufgaben', DESKTOP);
  await p.click('#zeitf [type=submit]');
  await p.waitForTimeout(500);
  const z = p.schreib.find(x => x.aktion === 'zeit_speichern');
  assert.deepEqual(z.daten.aufgaben_ids, ['a_w1', 'a_s2']);
  assert.equal(z.daten.aufgabe_id, 'a_w1'); assert.equal(z.daten.projekt, 'Webseite');
  const erl = p.schreib.filter(x => x.aktion === 'aufgabe_speichern');
  assert.deepEqual(erl.map(x => [x.daten.aufgabe_id, x.daten.status, x.daten.skala]), [['a_s2', 'Erledigt', 10]]);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Mobil: Aufgabenfenster mit Bearbeitern und Prio passt in die Breite', async t => {
  if (!B) return t.skip();
  const p = await seite(MOBIL, 'mobil');
  await p.selectOption('#fp', '');
  await p.click('#main .task[data-a="a_w1"]');
  await p.waitForTimeout(300);
  const breit = await p.evaluate(() => document.querySelector('#dlg .dlg').scrollWidth <= document.querySelector('#dlg .dlg').clientWidth + 1);
  assert.ok(breit, 'kein seitliches Scrollen im Dialog');
  await shot(p, 'aufgabe-bearbeiter', MOBIL);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('WhatsApp automatisch: Haken nennt alle mit Einwilligung, Handlink nur für die anderen, Abwählen bestellt ab', async t => {
  if (!B) return t.skip();
  WA_MIT = ['m_timo'];
  try {
    const p = await seite(DESKTOP, 'wa-auto');
    p.inbox = [];
    await p.route(/webhook\/team-inbox/, async r => { p.inbox.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await p.selectOption('#fp', '');
    await p.click('#main .task[data-a="a_w1"]');
    await p.waitForTimeout(300);
    assert.equal(await p.locator('#a_wa_l').isVisible(), false, 'ohne neue Person kein Haken');
    await p.selectOption('#a_badd', 'm_timo');
    await p.selectOption('#a_badd', 'm_neu');
    assert.equal(await p.locator('#a_wa_l').isVisible(), true);
    assert.equal(await p.isChecked('#a_wa'), false, 'Haken ist nie vorausgewählt (Timo 23.11.2026)');
    const zeile = await p.locator('#a_wa_t').innerText();
    assert.match(zeile, /Timo \(Test\) per WhatsApp informieren \(Haken setzen/); assert.match(zeile, /Neu \(Test\) ohne WhatsApp-Einwilligung/);
    await p.check('#a_wa');
    await shot(p, 'aufgabe-whatsapp-haken', DESKTOP);
    await p.click('#af [type=submit]');
    await p.waitForTimeout(400);
    assert.match(await p.locator('#dlgInner h2').innerText(), /^Aufgabe an Neu \(Test\) übergeben$/, 'Handweg nur für die Person ohne WhatsApp');
    assert.match(await p.locator('#dlgInner').innerText(), /Timo \(Test\) bekommt in etwa einer Minute automatisch eine WhatsApp/);
    assert.equal(await p.locator('#dlgInner a.btn.wa').count(), 0, 'kein zusätzlicher WhatsApp-Link (Timo bekommt sie automatisch, Neu hat keine Nummer)');
    assert.deepEqual(p.inbox, [], 'Haken gesetzt: nichts abbestellt');
    await shot(p, 'aufgabe-whatsapp-gespeichert', DESKTOP);
    await p.click('#z_x');
    // Zweiter Fall: nur Timo neu, Haken nicht gesetzt → Abbestellung, kein Dialog
    await p.click('#main .task[data-a="a_k4"]');
    await p.waitForTimeout(300);
    await p.selectOption('#a_badd', 'm_timo');
    assert.equal(await p.isChecked('#a_wa'), false);
    await p.click('#af [type=submit]');
    await p.waitForTimeout(400);
    assert.equal(await p.locator('#dlg').evaluate(d => d.open), false, 'Dialog geschlossen');
    assert.deepEqual(p.inbox.map(x => [x.aktion, x.daten.aufgabe_id]), [['benachrichtigung_aus', 'a_k4']]);
    await p.close();
    assert.deepEqual(fehler, []);
  } finally { WA_MIT = []; }
});
