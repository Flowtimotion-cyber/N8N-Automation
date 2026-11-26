// Browsertest: WhatsApp-Vorlagen im Team-Portal (Register „WhatsApp“), wenn das 24-Stunden-Fenster zu ist.
// Testserver für das Portal, die Inbox-Webhooks (team-inbox, team-inbox-vorlage) sind im Browser nachgebildet: nichts geht an n8n oder an Kunden.
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

// Erfundene Gespräche: k_zu = Fenster zu (letzte Kundennachricht 18.11.), k_auf = Fenster offen
const ZU = { id: 'k_zu', kanal: 'whatsapp', name: 'Anna Beispiel', telefon: '+4915100000001', marke: 'momentum', modus: 'mensch', status: 'offen', zusammenfassung: '', fenster: false, letzte_kunde_am: '2026-11-18T09:30:00+01:00' };
const AUF = { id: 'k_auf', kanal: 'whatsapp', name: 'Ben Test', telefon: '+4915100000002', marke: 'momentum', modus: 'ki', status: 'offen', zusammenfassung: '', fenster: true, letzte_kunde_am: new Date().toISOString() };
const liste = () => [ZU, AUF].map(g => ({ ...g, wartet: 0, zeit: g.letzte_kunde_am, letzte: { text: 'Hallo, ich interessiere mich für den Kurs.', richtung: 'ein', absender: 'kunde', zeit: g.letzte_kunde_am } }));
const verlauf = id => { const g = id === 'k_zu' ? ZU : AUF; return { ok: true, gespraech: g, nachrichten: [{ id: 'n1', richtung: 'ein', absender: 'kunde', text: 'Hallo, ich interessiere mich für den Kurs.', zeit: g.letzte_kunde_am, status: 'empfangen' }] }; };

async function seite(vp, name, wer, vorlageAntwort) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  await p.route(u => !u.href.startsWith(S.base), r => r.abort());
  await p.route(/webhook\/(?!team-api-v2)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
  await p.route(/webhook\/team-api-v2/, async r => {
    const res = await fetch(S.base + '/api/team', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: r.request().postDataBuffer() });
    r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
  p.inbox = []; p.vorlagen = [];
  await p.route(/webhook\/team-inbox$/, r => {
    const b = JSON.parse(r.request().postData()); p.inbox.push(b);
    const j = b.aktion === 'liste' ? { ok: true, gespraeche: liste() } : b.aktion === 'verlauf' ? verlauf(b.daten.konversation_id) : { ok: true };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  });
  await p.route(/webhook\/team-inbox-vorlage/, r => {
    const b = JSON.parse(r.request().postData()); p.vorlagen.push(b);
    const j = vorlageAntwort ? vorlageAntwort(b) : { ok: true, nachricht: { id: 'n2', richtung: 'aus', absender: 'mitglied:m_murat', text: 'TEXT', zeit: new Date().toISOString(), status: 'gesendet' } };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  });
  await p.goto(S.base + '/team/?z=' + TOKENS[wer] + '#/tab/whatsapp', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  return p;
}
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });
const TEXT_NACHFASSEN = 'Hallo Anna, du hast uns am 18.11. wegen Mitarbeiterschulung geschrieben. Wir haben dazu noch keine Antwort von dir gehört. Möchtest du, dass wir dir dazu weiterhelfen? Antworte mit Ja oder Nein.';

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Fenster zu: Hinweis und Knopf statt Antwortfeld, große Vorlagen-Knöpfe, Vorbelegung, Vorschau, Senden', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'murat', 'm_murat');
  await p.click('#wa_liste [data-wa="k_zu"]');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#wc_text').count(), 0, 'kein gesperrtes Antwortfeld');
  assert.match(await p.locator('#wa_chat .wc-vl').innerText(), /älter als 24 Stunden/);
  await shot(p, 'wa-vorlage-1-knopf', DESKTOP);
  await p.click('#vl_auf');
  const knoepfe = p.locator('#wc_vl [data-vl]');
  assert.equal(await knoepfe.count(), 3);
  assert.deepEqual(await knoepfe.allInnerTexts(), ['Rückfrage zur Anfrage', 'Nachfassen: noch Interesse?', 'Telefonat anbieten']);
  for (const h of await knoepfe.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) assert.ok(h >= 44, 'Knopf mindestens 44 px hoch, ist ' + h);
  await p.click('#wc_vl [data-vl="nachfassen_interesse"]');
  const felder = p.locator('#wc_vl [data-vlf]');
  assert.equal(await felder.count(), 3);
  assert.deepEqual(await felder.evaluateAll(els => els.map(e => e.value)), ['Anna', '18.11.', '']);
  assert.equal(await p.locator('#vl_senden').isDisabled(), true, 'Thema fehlt noch');
  assert.match(await p.locator('#vl_text').innerText(), /wegen \[Thema\] geschrieben/);
  await felder.nth(2).fill('Mitarbeiterschulung');
  assert.equal(await p.locator('#vl_text').innerText(), TEXT_NACHFASSEN);
  assert.equal(await p.locator('#vl_senden').isDisabled(), false);
  // Neu laden (wie der 12-Sekunden-Takt) darf Auswahl und Eingaben nicht verlieren
  await p.click('#wa_neu');
  await p.waitForTimeout(300);
  assert.deepEqual(await p.locator('#wc_vl [data-vlf]').evaluateAll(els => els.map(e => e.value)), ['Anna', '18.11.', 'Mitarbeiterschulung']);
  await shot(p, 'wa-vorlage-2-auswahl', DESKTOP);
  await p.click('#vl_senden');
  await p.waitForTimeout(300);
  assert.equal(p.vorlagen.length, 1);
  const b = p.vorlagen[0];
  assert.equal(b.token, TOKENS.m_murat); assert.equal(b.aktion, 'vorlage');
  assert.deepEqual(b.daten, { konversation_id: 'k_zu', vorlage: 'nachfassen_interesse', werte: ['Anna', '18.11.', 'Mitarbeiterschulung'] });
  assert.match(await p.locator('#wc_msgs').innerText(), /TEXT/, 'gesendete Nachricht steht im Verlauf');
  assert.equal(await p.locator('#wc_vl').count(), 0, 'Auswahl ist wieder zu');
  assert.equal(await p.locator('#vl_auf').count(), 1);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('ok:false zeigt die Fehlermeldung, Auswahl bleibt offen; 404 = noch nicht freigeschaltet', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'fehler', 'm_timo', () => ({ ok: false, fehler: 'Meta hat die Vorlage abgelehnt (Test).' }));
  await p.click('#wa_liste [data-wa="k_zu"]');
  await p.waitForTimeout(300);
  await p.click('#vl_auf');
  await p.click('#wc_vl [data-vl="rueckfrage_offen"]');
  assert.deepEqual(await p.locator('#wc_vl [data-vlf]').evaluateAll(els => els.map(e => e.value)), ['Anna', '']);
  await p.locator('#wc_vl [data-vlf="1"]').fill('Kurs KI-Grundlagen');
  await p.click('#vl_senden');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#vl_fehler').innerText(), 'Meta hat die Vorlage abgelehnt (Test).');
  assert.equal(await p.locator('#wc_vl').count(), 1);
  assert.equal(await p.locator('#wc_vl [data-vlf="1"]').inputValue(), 'Kurs KI-Grundlagen', 'Eingabe bleibt erhalten');
  assert.equal(await p.locator('#wc_msgs .wb.aus').count(), 0, 'nichts im Verlauf angehängt');
  await shot(p, 'wa-vorlage-3-fehler', DESKTOP);
  await p.unroute(/webhook\/team-inbox-vorlage/);
  await p.route(/webhook\/team-inbox-vorlage/, r => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await p.click('#vl_senden');
  await p.waitForTimeout(300);
  assert.match(await p.locator('#vl_fehler').innerText(), /noch nicht freigeschaltet/);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Fenster offen: normales Antwortfeld, keine Vorlagen', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'offen', 'm_kurt');
  await p.click('#wa_liste [data-wa="k_auf"]');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#wc_text').isDisabled(), false);
  assert.equal(await p.locator('#wa_chat .wc-vl').count(), 0);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Handy-Breite: Auswahl passt, Knöpfe untereinander groß', async t => {
  if (!B) return t.skip();
  const p = await seite(MOBIL, 'mobil', 'm_murat');
  await p.click('#wa_liste [data-wa="k_zu"]');
  await p.waitForTimeout(300);
  await p.click('#vl_auf');
  await p.click('#wc_vl [data-vl="termin_angebot"]');
  await p.locator('#wc_vl [data-vlf="1"]').fill('Mitarbeiterschulung');
  const breit = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(breit, 'kein seitliches Scrollen');
  for (const h of await p.locator('#wc_vl [data-vl]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) assert.ok(h >= 44);
  await shot(p, 'wa-vorlage-4', MOBIL);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Rolle „team“ sieht die Inbox nicht und kann nichts senden', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'lillien', 'm_lillien');
  assert.equal(await p.locator('nav.tabs [data-tab="whatsapp"]').count(), 0);
  assert.equal(await p.locator('#vl_auf').count(), 0);
  assert.equal(p.vorlagen.length, 0);
  await p.close();
  assert.deepEqual(fehler, []);
});
