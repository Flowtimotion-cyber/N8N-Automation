// Browsertest: Aufgaben-Pipeline, private Aufgaben und „Zu entscheiden“ auf der Übersicht (Timo 23.11.2026).
// Gegen den Testserver (Testadapter, kein n8n, keine Produktivdaten). Schreibaufrufe an Portal-, Office- und Social-API werden abgefangen
// und ihre Nutzlast geprüft. Braucht Playwright; ohne wird übersprungen. Im Worktree: NODE_PATH auf node_modules des Hauptordners.
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

const vor = n => new Date(Date.now() - n * 864e5).toISOString();
const tag = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const isoWoche = ds => { const t = new Date(ds + 'T12:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd + 3); const j = t.getUTCFullYear(); const e = new Date(Date.UTC(j, 0, 4)); const w = 1 + Math.round(((t - e) / 864e5 - 3 + ((e.getUTCDay() + 6) % 7)) / 7); return j + '-W' + String(w).padStart(2, '0'); };
const ym = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

// Testdaten ergänzen: Prio 1–10, eine private Aufgabe, Entscheidungs- und Nachweis-Aufgabe, Agenten-Aufgabe für Timo,
// Social-Beitrag zur Freigabe, eingereichte Woche und offener Vormonat von Lillien (mit Vertrag)
function anpassen(d, wer) {
  const a = id => d.aufgaben.find(x => x.aufgabe_id === id);
  Object.assign(a('a_w1'), { prio: 7, bearbeiter: ['m_lillien', 'm_kurt'] });
  Object.assign(a('a_k4'), { prio: 4 });
  Object.assign(a('a_s2'), { prio: 9 });
  d.aufgaben.push(
    { aufgabe_id: 'a_priv', titel: 'Geschenk für das Team besorgen', beschreibung: 'Nur Kurt und Lillien wissen davon.', status: 'Offen', prio: 3, label: '', projekt: 'Sonstiges', verantwortlich: 'm_kurt', bearbeiter: ['m_kurt'], erstellt_von: 'm_kurt', privat: true, deadline: '', erstellt: vor(1), geaendert: vor(1) },
    { aufgabe_id: 'a_ent', titel: 'Kursstart verschieben: Januar oder Februar?', beschreibung: 'Bitte entscheiden.', status: 'Offen', prio: 2, label: '⚖️ Entscheidung', projekt: 'Akademie-Kurs', verantwortlich: 'm_timo', bearbeiter: ['m_timo'], erstellt_von: 'm_kurt', deadline: tag(-1), erstellt: vor(2), geaendert: vor(2) },
    { aufgabe_id: 'a_nw', titel: 'Stundennachweis Vormonat: Lillien (Test)', beschreibung: 'Bitte um Nachweis.\n\n[nachweis:m_lillien:' + ym(-1) + ']', status: 'Offen', prio: 3, label: '⚖️ Entscheidung', projekt: 'Sonstiges', verantwortlich: 'm_timo', bearbeiter: ['m_timo'], erstellt_von: 'm_lillien', privat: true, deadline: '', erstellt: vor(1), geaendert: vor(1) },
    { aufgabe_id: 'a_ki', titel: 'SEO-Beitrag prüfen und freigeben', beschreibung: 'Vorschau: https://example.com/vorschau', status: 'Offen', prio: 3, label: '', projekt: 'Webseite', verantwortlich: 'm_timo', bearbeiter: ['m_timo'], erstellt_von: 'agent-claude', deadline: '', erstellt: vor(3), geaendert: vor(3) }
  );
  const lil = d.mitglieder.find(m => m.mitglied_id === 'm_lillien'); Object.assign(lil, { vertrag_std: 40, abrechnung_ab: '2026-01-01' });
  d.social = [{ post_id: 'p_t1', thema: 'Kursstart-Reel', text: 'Text', datum: tag(1), kanal: 'Instagram', status: 'Zur Freigabe', verantwortlich: 'm_lillien', geaendert: vor(1) },
    { post_id: 'p_t2', thema: 'Schon geplant', datum: tag(3), kanal: 'LinkedIn', status: 'Geplant', verantwortlich: 'm_lillien' }];
  const h = tag(-1), kw = isoWoche(h), alt = ym(-1) + '-10';
  d.zeiten = [
    { zeit_id: 'z1', mitglied_id: 'm_lillien', datum: h, von: '08:00', bis: '12:00', pause_min: 0, minuten: 240, taetigkeit: 'Reels geschnitten', aufgabe_id: 'a_s2', projekt: 'Social Media', kw, status: 'eingereicht', eingereicht_am: vor(1) },
    { zeit_id: 'z2', mitglied_id: 'm_lillien', datum: alt, von: '09:00', bis: '11:00', pause_min: 0, minuten: 120, taetigkeit: 'Impressum', aufgabe_id: 'a_w1', projekt: 'Webseite', kw: isoWoche(alt), status: 'freigegeben' }
  ];
  d.abrechnung = [];
  // Wie die echte Portal-API: private Aufgaben nur für Ersteller und Bearbeiter (der Testadapter selbst filtert nicht)
  d.aufgaben = d.aufgaben.filter(x => x.privat !== true || x.erstellt_von === wer || (x.bearbeiter || [x.verantwortlich]).includes(wer));
  return d;
}
const OFFICE = {
  ok: true, agenten: [{ agent_id: 'social-planer', name: 'Social-Planer' }, { agent_id: 'marketing-texter', name: 'Marketing-Texter' }], externe_aktionen: { email_senden: { text: 'E-Mail senden' } },
  runs: [{ run_id: 'run_t1', agent_id: 'marketing-texter', auftraggeber: 'm_timo', auftrag: 'Newsletter an Interessenten', status: 'wartet_freigabe', erstellt: vor(1) },
    { run_id: 'run_t2', agent_id: 'social-planer', auftraggeber: 'm_timo', auftrag: 'Vorschlag zu einer Idee', status: 'abgeschlossen', abgenommen: null, beendet: vor(0.1), erstellt: vor(0.2), zusammenfassung: 'Zwei Beitragsideen' }],
  freigaben: [{ freigabe_id: 'f_t1', run_id: 'run_t1', aktion: 'email_senden', status: 'offen', angefordert_am: vor(1), angefordert_von: 'agent-claude', inhalt_vorschau: 'Betreff: Kursstart' }],
  ereignisse: [], artefakte: []
};
const SOCIAL = { ok: true, ideen: [{ idee_id: 'i_t1', art: 'link', link: 'https://www.linkedin.com/posts/beispiel', titel: 'Starker Karussell-Post zu KI im Handwerk', quelle: 'Beispiel GmbH', kanal: 'LinkedIn', warum_stark: 'Zahl im Hook', thema_fuer_uns: 'Routinearbeit', status: 'neu', erstellt_von: 'm_lillien', erstellt: vor(2) },
  { idee_id: 'i_t2', titel: 'Schon geprüft', status: 'geprüft', erstellt_von: 'm_kurt', erstellt: vor(5) }], uploads: [], kanaele: ['LinkedIn', 'Instagram'] };

async function seite(vp, name, wer, hash) {
  const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  p.schreib = []; p.office = []; p.social = [];
  p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
  await p.route(u => !u.href.startsWith(S.base), r => r.abort());
  await p.route(/webhook\/(?!team-api-v2)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
  await p.route(/webhook\/team-api-v2/, async r => {
    const body = r.request().postData(), j = JSON.parse(body);
    if (j.aktion !== 'laden') { p.schreib.push({ aktion: j.aktion, daten: j.daten }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: (j.daten && j.daten.aufgabe_id) || 'neu1' }) }); }
    const res = await fetch(S.base + '/api/team', { method: 'POST', body });
    r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(anpassen(await res.json(), wer)) });
  });
  await p.route(/webhook\/office-api/, r => { const j = JSON.parse(r.request().postData()); if (j.aktion !== 'laden') p.office.push(j); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j.aktion === 'laden' ? OFFICE : { ok: true, run_id: 'run_neu', status: 'in_warteschlange' }) }); });
  await p.route(/webhook\/team-social/, r => { const j = JSON.parse(r.request().postData()); if (j.aktion !== 'laden') p.social.push(j); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j.aktion === 'laden' ? SOCIAL : { ok: true }) }); });
  await p.goto(S.base + '/team/?z=' + TOKENS[wer] + (hash || '#/tab/start'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  return p;
}
// Ziehen mit echter Maus (mehrere Schritte), damit Chromium den HTML5-Drag startet
async function ziehen(p, von, nach) {
  const a = await p.locator(von).boundingBox(), b = await p.locator(nach).boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await p.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 80), { steps: 8 });
  await p.mouse.up();
}
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Pipeline nach Status: Karte ziehen ändert den Status (mit Stand gegen gleichzeitiges Bearbeiten)', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'pipeline-status', 'm_kurt', '#/tab/aufgaben');
  await p.selectOption('#fp', ''); await p.click('[data-v="board"]'); await p.click('[data-bs="status"]');
  assert.deepEqual(await p.$$eval('.board .col', L => L.map(c => c.dataset.spalte)), ['Offen', 'Geplant', 'In Arbeit', 'Wartet', 'Wird getestet']);
  await ziehen(p, '.bcard[data-a="a_k4"]', '.col[data-spalte="In Arbeit"]');
  await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.equal(s.daten.aufgabe_id, 'a_k4'); assert.equal(s.daten.status, 'In Arbeit'); assert.equal(s.daten.prio, 4); assert.equal(s.daten.skala, 10);
  assert.ok(s.daten.stand, 'Stand für die Konfliktprüfung mitgeschickt'); assert.equal(s.daten.kommentar, '');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Pipeline nach Prio: vier Spalten (Sofort, Hoch, Normal, Später), Ziehen setzt den obersten Wert der Spalte', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'pipeline-prio', 'm_kurt', '#/tab/aufgaben');
  await p.selectOption('#fp', ''); await p.click('[data-v="board"]'); await p.click('[data-bs="prio"]');
  const spalten = await p.$$eval('.board .col', L => L.map(c => [c.dataset.spalte, c.querySelector('h3').textContent.replace(/\s+/g, ' ')]));
  assert.deepEqual(spalten.map(x => x[0]), ['1', '3', '5', '7']);
  assert.match(spalten[0][1], /Sofort · Prio 1–2/); assert.match(spalten[3][1], /Später · Prio 7–10/);
  const inSpalte = async k => p.$$eval('.col[data-spalte="' + k + '"] .bcard', L => L.map(e => e.dataset.a));
  assert.ok((await inSpalte('7')).includes('a_w1'), 'Prio 7 steht unter „Später“');
  assert.ok((await inSpalte('3')).includes('a_priv'), 'Kurt sieht seine private Aufgabe');
  assert.match(await p.locator('.bcard[data-a="a_priv"] .t').innerText(), /^🔒/);
  assert.match(await p.locator('.bcard[data-a="a_w1"] .meta').innerText(), /Geplant/, 'Status steht an der Karte');
  await shot(p, 'pipeline-prio', DESKTOP);
  await ziehen(p, '.bcard[data-a="a_w1"]', '.col[data-spalte="1"]');
  await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.equal(s.daten.prio, 1); assert.equal(s.daten.status, 'Geplant');
  assert.deepEqual(s.daten.bearbeiter, ['m_lillien', 'm_kurt'], 'Bearbeiter bleiben');
  // In derselben Spalte loslassen: nichts speichern
  await ziehen(p, '.bcard[data-a="a_k4"]', '.col[data-spalte="3"]');
  await p.waitForTimeout(300);
  assert.equal(p.schreib.filter(x => x.aktion === 'aufgabe_speichern').length, 1);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-bs="prio"].on').count(), 1, 'Ansicht wird gemerkt');
  await p.click('[data-bs="status"]'); await p.click('[data-v="liste"]');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Privat: Haken im Dialog, Nutzlast privat, Schloss in der Liste, Filter „Private“', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'privat', 'm_kurt', '#/tab/aufgaben');
  await p.selectOption('#fp', 'privat'); await p.waitForTimeout(200);
  assert.deepEqual(await p.$$eval('#main .task[data-a]', L => L.map(e => e.dataset.a)), ['a_priv']);
  assert.match(await p.locator('#main .task[data-a="a_priv"] .chip.privat').innerText(), /privat/);
  await p.click('#main .task[data-a="a_priv"]'); await p.waitForTimeout(300);
  assert.equal(await p.isChecked('#a_pr'), true);
  assert.match(await p.locator('label:has(#a_pr)').innerText(), /nur du und die Bearbeiter.*und Timo nicht/);
  await p.click('#a_x');
  await p.click('#neu'); await p.waitForTimeout(300);
  assert.equal(await p.isChecked('#a_pr'), false, 'neue Aufgaben sind standardmäßig für das Team sichtbar');
  await p.fill('#a_t', 'Meine private Notiz-Aufgabe'); await p.check('#a_pr');
  await shot(p, 'aufgabe-privat', DESKTOP);
  await p.click('#af [type=submit]'); await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.equal(s.daten.privat, true);
  await p.selectOption('#fp', 'ich');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Übersicht (Timo): „Zu entscheiden“ sammelt alle Quellen, wichtigstes zuerst, Filter je Quelle, Kennzahl zählt mit', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'zentrale', 'm_timo');
  await p.waitForSelector('#entscheiden .ze-z'); await p.waitForTimeout(400);
  const arten = await p.$$eval('#entscheiden .ze-z .ze-art', L => L.map(e => e.textContent));
  const titel = await p.$$eval('#entscheiden .ze-z .ze-t', L => L.map(e => e.textContent));
  assert.match(arten[0], /Freigabe im KI Office/, 'blockierte Office-Freigabe zuerst: ' + arten.join(' | '));
  for (const erwartet of ['Social-Beitrag freigeben', 'Arbeitszeit freigeben', 'Stundennachweis angefordert', 'Entscheidung nötig · dringend', 'Von der KI angelegt'])
    assert.ok(arten.some(a => a.startsWith(erwartet)), erwartet + ' fehlt: ' + arten.join(' | '));
  assert.ok(!titel.includes('Schon geplant'), 'geplanter Beitrag wartet nicht');
  // Alle anzeigen: auch Vorschläge, Monat abschließen, neue Idee, Ergebnis abnehmen
  await p.click('#zeMehr'); await p.waitForTimeout(200);
  const alle = await p.$$eval('#entscheiden .ze-z .ze-art', L => L.map(e => e.textContent));
  for (const erwartet of ['Neuer Vorschlag', 'Monat abschließen', 'Neue Idee / Link', 'Agenten-Ergebnis abnehmen', 'Wird getestet'])
    assert.ok(alle.some(a => a.startsWith(erwartet)), erwartet + ' fehlt: ' + alle.join(' | '));
  const n = alle.length;
  assert.equal(await p.locator('#zeKpi b').innerText(), String(n), 'Kennzahl = Anzahl der Punkte');
  assert.equal(await p.locator('#fuerDich .fd-g.fd-frei').count(), 0, '„Für dich“ zeigt keine Freigaben mehr doppelt');
  await p.click('#zeMehr');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await shot(p, 'uebersicht-entscheiden', DESKTOP);
  await p.click('[data-zef="zeit"]'); await p.waitForTimeout(200);
  const zeit = await p.$$eval('#entscheiden .ze-z .ze-art', L => L.map(e => e.textContent));
  assert.ok(zeit.length >= 3 && zeit.every(a => /Arbeitszeit|Stundennachweis|Monat/.test(a)), zeit.join(' | '));
  await p.click('[data-zef="alle"]');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Übersicht: Kennzahlen sind anklickbar (überfällig → gefilterte Liste, Wochen → Arbeitszeit in „Zu entscheiden“)', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'kpi', 'm_timo');
  await p.click('[data-kpi="late"]'); await p.waitForTimeout(300);
  assert.equal(await p.inputValue('#fs'), 'late'); assert.equal(await p.inputValue('#fp'), '');
  const ids = await p.$$eval('#main .task[data-a]', L => L.map(e => e.dataset.a));
  assert.ok(ids.length && ids.includes('a_k4') && ids.includes('a_ent'), ids.join(','));
  await p.click('nav.tabs button[data-tab="start"]'); await p.waitForTimeout(400);
  await p.click('[data-kpi="zeit"]'); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-zef="zeit"].on').count(), 1);
  await p.click('[data-kpi="p12"]'); await p.waitForTimeout(300);
  assert.equal(await p.inputValue('#fs'), 'prio12');
  await p.selectOption('#fs', 'offen'); await p.selectOption('#fp', 'ich');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Zu entscheiden: Woche freigeben, Nachweis abhaken, Idee an den Social-Planer – je mit richtiger Nutzlast', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'zentrale-aktionen', 'm_timo');
  await p.waitForSelector('#entscheiden .ze-z'); await p.waitForTimeout(300);
  const klick = async art => { await p.click('#entscheiden [data-zef="alle"]'); if (await p.locator('#zeMehr').count() && /Alle/.test(await p.locator('#zeMehr').innerText())) await p.click('#zeMehr'); await p.locator('#entscheiden .ze-z', { hasText: art }).first().click(); await p.waitForTimeout(300); };
  // 1) Woche
  await klick('Arbeitszeit freigeben');
  assert.match(await p.locator('#dlgInner h2').innerText(), /Lillien \(Test\), KW \d\d · 4 Std/);
  assert.match(await p.locator('#dlgInner').innerText(), /Reels geschnitten/);
  await p.click('#zw_j'); await p.waitForTimeout(200);
  await p.click('#zf [type=submit]'); await p.waitForTimeout(400);
  const z = p.schreib.find(x => x.aktion === 'zeiten_pruefen');
  assert.deepEqual([z.daten.mitglied_id, z.daten.entscheidung], ['m_lillien', 'freigegeben']);
  // 2) Nachweis
  await klick('Stundennachweis angefordert');
  assert.match(await p.locator('#dlgInner .note').innerText(), /Alle Einträge freigegeben. Monat abschließen/);
  await p.fill('#nw_k', 'PDF per Mail');
  await shot(p, 'nachweis-pruefen', DESKTOP);
  await p.click('#nwf [type=submit]'); await p.waitForTimeout(400);
  const nw = p.schreib.find(x => x.aktion === 'aufgabe_speichern' && x.daten.aufgabe_id === 'a_nw');
  assert.equal(nw.daten.status, 'Erledigt'); assert.equal(nw.daten.kommentar, 'Nachweis erledigt: PDF per Mail'); assert.equal(nw.daten.privat, true);
  // 3) Idee
  await klick('Neue Idee / Link');
  assert.match(await p.locator('#dlgInner h2').innerText(), /Karussell-Post/);
  await p.fill('#ie_h', 'Eher LinkedIn');
  await shot(p, 'idee-social-planer', DESKTOP);
  await p.click('#ief [type=submit]'); await p.waitForTimeout(500);
  const o = p.office.find(x => x.aktion === 'auftrag_starten');
  assert.equal(o.daten.agent_id, 'social-planer'); assert.equal(o.daten.projekt, 'Social Media'); assert.equal(o.daten.idempotenzschluessel, 'idee-i_t1');
  assert.match(o.daten.auftrag, /Link: https:\/\/www\.linkedin\.com\/posts\/beispiel/); assert.match(o.daten.auftrag, /Hinweis von Timo \(Test\): Eher LinkedIn/); assert.match(o.daten.auftrag, /nichts kopieren/);
  const si = p.social.find(x => x.aktion === 'idee_speichern');
  assert.equal(si.daten.status, 'geprüft'); assert.equal(si.daten.idee_id, 'i_t1'); assert.equal(si.daten.link, 'https://www.linkedin.com/posts/beispiel');
  // 4) Monat abschließen springt in die Monatsansicht der Person
  await p.click('nav.tabs button[data-tab="start"]'); await p.waitForTimeout(500);
  await klick('Monat abschließen');
  assert.equal(await p.inputValue('#zpers'), 'm_lillien');
  assert.equal(await p.locator('#mabs').count(), 1, 'Knopf „Monat abschließen“ ist da');
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Arbeitszeit (Lillien): Nachweis bei Timo anfordern legt private Entscheidungs-Aufgabe für Timo an', async t => {
  if (!B) return t.skip();
  const p = await seite(DESKTOP, 'nachweis', 'm_lillien', '#/monat/' + ym(0));
  await p.click('#mnach'); await p.waitForTimeout(300);
  await p.fill('#nw_w', 'Agentur für Arbeit');
  await p.click('#nwa [type=submit]'); await p.waitForTimeout(400);
  const s = p.schreib.find(x => x.aktion === 'aufgabe_speichern');
  assert.equal(s.daten.privat, true); assert.equal(s.daten.label, '⚖️ Entscheidung'); assert.deepEqual(s.daten.bearbeiter, ['m_timo']);
  assert.match(s.daten.beschreibung, new RegExp('\\[nachweis:m_lillien:' + ym(0) + '\\]$'));
  assert.match(s.daten.beschreibung, /Wofür: Agentur für Arbeit/);
  assert.match(s.daten.titel, /^Stundennachweis .+: Lillien \(Test\)$/);
  // Für den Vormonat gibt es schon eine offene Anfrage: kein zweiter Knopf
  await p.click('#mop'); await p.waitForTimeout(300);
  assert.equal(await p.locator('#mnach').count(), 0);
  assert.match(await p.locator('#main').innerText(), /Nachweis angefordert am/);
  await p.close();
  assert.deepEqual(fehler, []);
});

test('Mobil: „Zu entscheiden“ und Pipeline passen in die Breite', async t => {
  if (!B) return t.skip();
  const p = await seite(MOBIL, 'mobil', 'm_timo');
  await p.waitForSelector('#entscheiden .ze-z'); await p.waitForTimeout(300);
  const breit = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(breit, 'kein seitliches Scrollen der Seite');
  await p.evaluate(() => { const e = document.querySelector('#entscheiden'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70); }); await p.waitForTimeout(200);
  await shot(p, 'uebersicht-entscheiden', MOBIL);
  await p.close();
  assert.deepEqual(fehler, []);
});
