// (d) Browsertest gegen den Testserver: Login über #z= und ?z= (Code verschwindet aus der Adresse), jedes eingeschaltete Register,
// kein ausgeschaltetes Register sichtbar, keine Anfrage an fremde Webhooks, Aufgabe anlegen (Team) und erledigen (Admin), Papierkorb,
// Notiz-Versionen, Vorschlag, Zugangslink mit #z=. Screenshots Desktop (1280 px) und Mobil (375 px) nach dev/screenshots/.
// Läuft mit Playwright oder puppeteer-core + Chromium; ohne Browser werden die Tests übersprungen (siehe README).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { serverStarten, PILOT } from './hilfe.mjs';
import { browserStarten } from './browser.mjs';
import { TOKENS } from '../dev/testdaten.mjs';

const SHOTS = join(PILOT, 'dev', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 375, height: 812 };
const TAB_VON = { uebersicht: 'start', aufgaben: 'aufgaben', projekte: 'projekte', notizen: 'notizen', vorschlaege: 'vorschlaege', team: 'team', arbeitszeit: 'zeit', social: 'social', vertrieb: 'vertrieb', whatsapp: 'whatsapp', kurs: 'kurs', systeme: 'systeme', skills: 'skills', tresor: 'tresor', webseite: 'web', office: 'office' };
const LABEL = { start: 'Übersicht', aufgaben: 'Aufgaben', projekte: 'Projekte', notizen: 'Notizen', vorschlaege: 'Vorschläge', team: 'Team', zeit: 'Arbeitszeit', social: 'Social Media', vertrieb: 'Vertrieb', whatsapp: 'WhatsApp', kurs: 'Kurs & Teilnehmer', systeme: 'Systeme', skills: 'Skills', tresor: 'Tresor', web: 'Webseite', office: 'KI Office' };
let S, S2, S3, B;
const fehler = [], anfragen = [];
// Zwischenablage abfangen (headless gibt es keine): „Link kopieren“ legt den Text in window.__kopiert ab
const INIT = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__kopiert = t; return Promise.resolve(); } }, configurable: true }); };

async function konfigVon(S) {
  const quelle = await fetch(S.base + '/config/mandant.js').then(r => r.text());
  const sandbox = { window: {} }; vm.runInNewContext(quelle, sandbox); return JSON.parse(JSON.stringify(sandbox.window.MANDANT));
}
const neueSeite = async (vp, name) => {
  const p = await B.seite(vp, INIT);
  p.on('pageerror', e => fehler.push(vp.width + ' ' + name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') fehler.push(vp.width + ' ' + name + ' console: ' + m.text()); });
  p.on('request', r => { const u = r.url(); if (/\/webhook\//.test(u)) anfragen.push(u.replace(/^.*\/webhook\//, '')); });
  return p;
};
// Anmelden wie im echten Leben: erst der persönliche Link (#z=…), danach die Route (#/tab/…) als Hash-Wechsel im selben Fenster
const oeffne = async (p, S, hash, tok = TOKENS.m_anna) => {
  await p.goto(S.base + '/frontend/' + (tok ? '#z=' + tok : ''), { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  if (hash) { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(400); }
};
const tabKlick = async (p, k) => { await p.click('nav.tabs button[data-tab="' + k + '"]'); await p.waitForTimeout(350); };
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
const text = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '');
const setze = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const dialogOffen = p => p.evaluate(() => !!document.getElementById('dlg').open);
const navTabs = p => p.$$eval('nav.tabs button', L => L.map(b => b.dataset.tab));
// Kein waagerechtes Scrollen der ganzen Seite (vor allem bei 375 px)
const keinUeberlauf = async (p, wo) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Seite läuft waagerecht über: ' + wo);

before(async () => { mkdirSync(SHOTS, { recursive: true }); S = await serverStarten(); S2 = await serverStarten({ an: 'social,arbeitszeit,systeme,tresor' }); S3 = await serverStarten({ an: 'vertrieb,whatsapp,office,kurs,skills,webseite' }); B = await browserStarten(); });
after(async () => { if (B) await B.close(); if (S) await S.stop(); if (S2) await S2.stop(); if (S3) await S3.stop(); });

test('Browser verfügbar', t => { if (!B) { t.diagnostic('Kein Browser (weder Playwright noch puppeteer-core mit Chromium): Browsertests übersprungen, siehe README.'); t.skip(); } else t.diagnostic('Browser: ' + B.art); });

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';

  test(n + ': Login über #z= und ?z=, Code verschwindet aus der Adresse, Abmelden, Anmelden per Code', async t => {
    if (!B) return t.skip();
    const p = await neueSeite(vp, n + ' login');
    await p.goto(S.base + '/frontend/', { waitUntil: 'networkidle' }); await p.waitForTimeout(200);
    assert.match(await text(p, '#app'), /persönlichen Link/, 'ohne Code: Anmeldeseite'); await shot(p, 'login', vp);
    assert.equal(await p.$eval('meta[name="referrer"]', m => m.content), 'no-referrer');
    await oeffne(p, S, '', TOKENS.m_anna);
    assert.ok(!/z=/.test(p.url()), 'Code ist nach dem Laden nicht mehr in der Adresse: ' + p.url());
    assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), TOKENS.m_anna);
    assert.equal(await p.title(), 'Team-Portal · Musterfirma GmbH');
    assert.match(await text(p, '.who'), /Anna Muster/);
    // Alter Link mit ?z= wird noch angenommen, der Code aber sofort entfernt
    await p.evaluate(() => localStorage.clear());
    await p.goto(S.base + '/frontend/?z=' + TOKENS.m_ben + '#/tab/aufgaben', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    assert.ok(!/z=/.test(p.url()) && /#\/tab\/aufgaben$/.test(p.url()), 'Code weg, Route bleibt: ' + p.url());
    assert.match(await text(p, '.who'), /Ben Beispiel/);
    // Abmelden und per Code anmelden
    await tabKlick(p, 'team'); await p.click('#logout'); await p.waitForTimeout(200);
    assert.match(await text(p, '#app'), /abgemeldet/); assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), null);
    await setze(p, '#code', TOKENS.m_clara); await p.$eval('#codef', f => f.requestSubmit()); await p.waitForTimeout(500);
    assert.match(await text(p, '.who'), /Clara Probe/);
    await p.close();
  });

  test(n + ': nur eingeschaltete Register sichtbar, jedes öffnet sich, keine Anfrage an fremde Webhooks', async t => {
    if (!B) return t.skip();
    const K = await konfigVon(S);
    const an = Object.keys(K.register).filter(r => K.register[r]).map(r => TAB_VON[r]);
    const aus = Object.keys(K.register).filter(r => !K.register[r]).map(r => TAB_VON[r]);
    assert.deepEqual(an, ['start', 'aufgaben', 'projekte', 'notizen', 'vorschlaege', 'team'], 'Standard-Konfiguration des Pilots');
    const p = await neueSeite(vp, n + ' register');
    await oeffne(p, S, '#/tab/start');
    assert.deepEqual(await navTabs(p), an, 'Menü zeigt genau die eingeschalteten Register');
    const nav = await text(p, 'nav.tabs');
    for (const k of aus) assert.ok(!nav.includes(LABEL[k]), 'ausgeschaltet, aber im Menü: ' + LABEL[k]);
    assert.equal(await p.$('.zk'), null, 'kein Stundenkopf ohne Register Arbeitszeit');
    assert.ok(!(await text(p, '#main')).includes('KI Office'), 'kein Hinweis auf das KI Office in der Übersicht');
    assert.deepEqual(await p.$$eval('.dash .dtabs button', L => L.map(b => b.textContent)), ['Team & Aufgaben'], 'Dashboard nur Team & Aufgaben');
    assert.ok((await p.$$('#main .kpi')).length >= 4);
    await shot(p, 'start', vp);
    await keinUeberlauf(p, 'start');
    for (const k of an.slice(1)) { await tabKlick(p, k); assert.match(await text(p, 'h1'), new RegExp(LABEL[k].split(' ')[0]), 'Register ' + k); await keinUeberlauf(p, k); await shot(p, k, vp); }
    // Direkt per Adresse auf ein ausgeschaltetes Register → zurück zur Übersicht
    await oeffne(p, S, '#/tab/zeit'); assert.match(await text(p, 'h1'), /Hallo|Guten/); assert.match(p.url(), /#\/tab\/start$/);
    await oeffne(p, S, '#/tab/office'); assert.match(p.url(), /#\/tab\/start$/);
    const z = await S.zustand();
    assert.deepEqual(Object.keys(z.treffer), ['PILOTKUERZEL/portal-api'], 'Server hat nur die Portal-API gesehen');
    await p.close();
  });

  test(n + ': Aufgabe als Team-Mitglied anlegen, als Admin erledigen; Board; Papierkorb wiederherstellen', async t => {
    if (!B) return t.skip();
    await S.reset();
    const titel = 'Browsertest ' + n + ': Dokumentation prüfen';
    let p = await neueSeite(vp, n + ' aufgabe-ben');
    await oeffne(p, S, '#/tab/aufgaben', TOKENS.m_ben);
    await p.click('#neu'); await p.waitForTimeout(200); assert.ok(await dialogOffen(p), 'Dialog „Neue Aufgabe“ offen');
    assert.equal(await p.$eval('#a_j', e => e.value), 'Kundenprojekt Alpha', 'erstes Projekt vorbelegt, kein festes Standardprojekt');
    await shot(p, 'dialog-aufgabe', vp);
    await setze(p, '#a_t', titel); await setze(p, '#a_b', 'Aus dem **Browsertest**.'); await setze(p, '#a_p', '1'); await setze(p, '#a_d', '2030-05-01');
    await p.$eval('#af', f => f.requestSubmit()); await p.waitForTimeout(600);
    assert.ok(!(await dialogOffen(p)), 'Dialog zu'); assert.ok((await text(p, '#main')).includes(titel), 'Aufgabe in der Liste');
    await p.click('[data-v="board"]'); await p.waitForTimeout(300); assert.ok((await p.$$('.board .bcard')).length >= 2); await shot(p, 'aufgaben-board', vp);
    await p.click('[data-v="liste"]'); await p.waitForTimeout(200);
    await p.close();
    let z = await S.zustand(); const neu = z.tabellen.team_aufgaben.find(a => a.titel === titel);
    assert.ok(neu && neu.erstellt_von === 'm_ben' && neu.prio === 1 && neu.status === 'Offen', 'auf dem Server angekommen');
    // Admin öffnet die Aufgabe per Adresse und setzt sie auf Erledigt
    p = await neueSeite(vp, n + ' aufgabe-admin');
    await oeffne(p, S, '#/aufgabe/' + neu.aufgabe_id, TOKENS.m_anna);
    assert.ok(await dialogOffen(p), 'Aufgaben-Dialog per Adresse offen'); assert.equal(await p.$eval('#a_t', e => e.value), titel);
    assert.ok((await text(p, '#dlgInner')).includes('Link kopieren'));
    await setze(p, '#a_s', 'Erledigt'); await setze(p, '#a_k', 'Passt, danke.');
    await p.$eval('#af', f => f.requestSubmit()); await p.waitForTimeout(600);
    z = await S.zustand(); const erl = z.tabellen.team_aufgaben.find(a => a.aufgabe_id === neu.aufgabe_id);
    assert.equal(erl.status, 'Erledigt'); assert.ok(erl.erledigt_am); assert.ok(z.tabellen.team_aufgaben_verlauf.some(v => v.aufgabe_id === neu.aufgabe_id && /Passt/.test(v.text)));
    // Papierkorb: vorbelegten Eintrag wiederherstellen
    await oeffne(p, S, '#/tab/aufgaben', TOKENS.m_anna);
    await p.click('#pk_a'); await p.waitForSelector('[data-wh="pk_01"]'); await p.waitForTimeout(150);
    assert.match(await text(p, '#pk_info'), /Alles, was im Team gelöscht wurde/); assert.ok((await text(p, '#pk_liste')).includes('Druckertreiber'));
    await shot(p, 'papierkorb', vp);
    await p.click('[data-wh="pk_01"]'); await p.waitForTimeout(600);
    z = await S.zustand(); assert.ok(z.tabellen.team_aufgaben.some(a => a.aufgabe_id === 'a_90'), 'wiederhergestellt'); assert.ok(!z.tabellen.team_papierkorb.some(e => e.eintrag_id === 'pk_01'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await p.close();
  });

  test(n + ': Notiz mit Versionen und Wiki-Link, Vorschlag unterstützen, Projekt-Dialog, Zugangslink mit #z=', async t => {
    if (!B) return t.skip();
    const p = await neueSeite(vp, n + ' notiz');
    await oeffne(p, S, '#/notiz/n_01');
    assert.match(await text(p, '.nview h1'), /Kickoff Kundenprojekt Alpha/); assert.ok((await p.$$('.nview table')).length >= 1, 'Tabelle gerendert');
    await p.click('.nview a.wl'); await p.waitForTimeout(300); assert.match(await text(p, '.nview h1'), /Entscheidungen/, '[[Wiki-Link]] springt zur Notiz');
    await p.click('#nedit'); await p.waitForTimeout(200); await p.click('#n_ver'); await p.waitForSelector('#n_verbox [data-vs]'); await p.waitForTimeout(150);
    assert.match(await text(p, '#n_verbox'), /Frühere Fassungen/); assert.match(await text(p, '#n_verbox'), /Clara Probe/);
    await shot(p, 'notiz-versionen', vp);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150); assert.ok(!(await dialogOffen(p)));
    // Vorschlag unterstützen (Admin hat bei v_01 noch nicht gestimmt)
    await tabKlick(p, 'vorschlaege');
    const vorher = Number(await p.$eval('[data-vote="v_01"] b', e => e.textContent));
    await p.click('[data-vote="v_01"]'); await p.waitForTimeout(500);
    assert.equal(Number(await p.$eval('[data-vote="v_01"] b', e => e.textContent)), vorher + 1);
    assert.ok((await S.zustand()).tabellen.team_vorschlaege.find(v => v.vorschlag_id === 'v_01').stimmen.includes('m_anna'));
    assert.ok((await text(p, '#main')).includes('Die Leitung entscheidet'));
    // Projekt-Dialog per Adresse
    await oeffne(p, S, '#/projekt/p_intern'); assert.ok(await dialogOffen(p)); assert.equal(await p.$eval('#j_n', e => e.value), 'Interne Werkzeuge'); await shot(p, 'dialog-projekt', vp);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    // Team: „Link kopieren“ baut den Link mit #z= auf Basis von portal_url
    await tabKlick(p, 'team');
    assert.ok((await text(p, '#main')).includes('Wer bei Musterfirma'));
    await p.click('[data-link="m_ben"]'); await p.waitForTimeout(200);
    const K = await konfigVon(S);
    assert.equal(await p.evaluate(() => window.__kopiert), K.portal_url + '#z=' + TOKENS.m_ben, 'Zugangslink = portal_url + #z= + Code');
    await p.close();
  });

  test(n + ': zusätzliche Register (social, arbeitszeit, systeme, tresor) erscheinen und öffnen sich ohne Fehler', async t => {
    if (!B) return t.skip();
    const p = await neueSeite(vp, n + ' zusatz');
    await oeffne(p, S2, '#/tab/start');
    assert.deepEqual(await navTabs(p), ['start', 'aufgaben', 'projekte', 'zeit', 'notizen', 'social', 'systeme', 'tresor', 'vorschlaege', 'team']);
    assert.deepEqual(await p.$$eval('.dash .dtabs button', L => L.map(b => b.textContent)), ['Team & Aufgaben', 'Marketing'], 'Dashboard ohne Vertrieb (aus)');
    assert.ok((await text(p, '#main')).includes('Nächste Beiträge'), 'Social-Karte in der Übersicht');
    await tabKlick(p, 'zeit'); assert.match(await text(p, 'h1'), /Arbeitszeit/); assert.ok((await text(p, '#main')).includes('Zur Freigabe'), 'Admin sieht Freigabe-Karte'); await keinUeberlauf(p, 'zeit'); await shot(p, 'zusatz-arbeitszeit', vp);
    await tabKlick(p, 'social'); assert.match(await text(p, 'h1'), /Social-Media-Plan/); assert.ok((await p.$$('.post')).length >= 2); await keinUeberlauf(p, 'social'); await shot(p, 'zusatz-social', vp);
    await tabKlick(p, 'systeme'); assert.match(await text(p, 'h1'), /Systeme/); assert.ok((await text(p, '#main')).includes('bei Musterfirma')); await keinUeberlauf(p, 'systeme');
    await tabKlick(p, 'tresor'); assert.match(await text(p, 'h1'), /Tresor/); assert.ok(!(await text(p, '#main')).includes('FracEncoder')); await keinUeberlauf(p, 'tresor');
    await tabKlick(p, 'team'); assert.ok((await p.$$('[data-vertrag]')).length >= 1, 'Vertrag-Knopf nur mit Arbeitszeit');
    const z = await S2.zustand();
    assert.deepEqual(Object.keys(z.treffer), ['PILOTKUERZEL/portal-api'], 'auch mit Zusatz-Registern nur die Portal-API');
    await p.close();
  });
}

test('Übrige Register (vertrieb, whatsapp, office, kurs, skills, webseite): öffnen ohne Skriptfehler, rufen nur ihre eigene Schnittstelle', async t => {
  if (!B) return t.skip();
  const p = await B.seite(DESKTOP, INIT);
  const skriptfehler = []; p.on('pageerror', e => skriptfehler.push(e.message));
  const eigene = []; p.on('request', r => { const u = r.url(); if (/\/webhook\//.test(u)) eigene.push(u.replace(/^.*\/webhook\/PILOTKUERZEL\//, '')); });
  await oeffne(p, S3, '#/tab/start');
  assert.deepEqual(await navTabs(p), ['start', 'aufgaben', 'projekte', 'notizen', 'vertrieb', 'whatsapp', 'kurs', 'skills', 'web', 'vorschlaege', 'office', 'team']);
  assert.ok((await text(p, '#main')).includes('Freigaben im KI Office'), 'Office-Link nur mit Register office');
  assert.deepEqual(await p.$$eval('.dash .dtabs button', L => L.map(b => b.textContent)), ['Team & Aufgaben', 'Vertrieb']);
  await p.click('.dash .dtabs button[data-dt="vertrieb"]'); await p.waitForTimeout(500); assert.match(await text(p, '#dbody'), /nicht erreichbar|gibt es im Testserver nicht/, 'Vertriebs-Dashboard meldet fehlenden Workflow als Hinweis, nicht als Absturz');
  for (const [k, erwartet] of [['vertrieb', /Vertrieb/], ['whatsapp', /WhatsApp/], ['office', /KI Office/], ['kurs', /Kurs/], ['skills', /Skills/], ['web', /Webseite/]]) { await tabKlick(p, k); assert.match(await text(p, 'h1'), erwartet, k); await keinUeberlauf(p, k); }
  assert.ok((await text(p, '#main')).includes('im Pilot aber noch nicht enthalten'), 'Platzhalter-Text');
  await p.waitForTimeout(500);
  assert.deepEqual(skriptfehler, [], 'keine Skriptfehler');
  assert.deepEqual([...new Set(eigene)].sort(), ['office-api', 'portal-api', 'team-inbox', 'team-vertrieb'], 'nur die Schnittstellen der eingeschalteten Register');
  await p.close();
});

test('Alle Webhook-Anfragen gingen an die Portal-API; Konsole und Seite ohne Fehler', t => {
  if (!B) return t.skip();
  assert.ok(anfragen.length >= 10, 'Anfragen gesehen: ' + anfragen.length);
  assert.deepEqual([...new Set(anfragen)], ['PILOTKUERZEL/portal-api']);
  assert.deepEqual(fehler, []);
});
