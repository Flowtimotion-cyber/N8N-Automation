// (d) Browsertest gegen den Testserver, in BEIDEN Betriebsarten (Speicher und Postgres) und zwei Bildschirmbreiten (Desktop 1280 px, Mobil 375 px):
// Login über #z= und ?z= (Code verschwindet aus der Adresse), Abmelden, Anmelden per Code, nur eingeschaltete Register, keine Anfrage an fremde
// Webhooks, Aufgabe anlegen (Team) und erledigen (Admin), Board, Papierkorb, Notiz-Versionen und Wiki-Link, Vorschlag unterstützen, Projekt-Dialog,
// Zugangslink mit #z=, Rollen und Bereiche aus den Server-Einstellungen, Firma vom Server, 401 → abgemeldet, Modul aus → Register weg mit Hinweis,
// Register-Leiste mit Scroll-Hinweis auf dem Handy, Admin-Startfilter. Screenshots nach dev/screenshots/ (Postgres-Lauf mit Vorsilbe „postgres-“).
// Läuft mit Playwright oder puppeteer-core + Chromium; ohne Browser werden die Tests übersprungen, ohne Postgres die Postgres-Läufe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { serverStarten, api, PILOT, postgresDa } from './hilfe.mjs';
import { browserStarten } from './browser.mjs';

const SHOTS = join(PILOT, 'dev', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 375, height: 812 };
const TAB_VON = { uebersicht: 'start', aufgaben: 'aufgaben', projekte: 'projekte', notizen: 'notizen', vorschlaege: 'vorschlaege', team: 'team', arbeitszeit: 'zeit', social: 'social', vertrieb: 'vertrieb', whatsapp: 'whatsapp', kurs: 'kurs', systeme: 'systeme', skills: 'skills', tresor: 'tresor', webseite: 'web', office: 'office' };
const LABEL = { start: 'Übersicht', aufgaben: 'Aufgaben', projekte: 'Projekte', notizen: 'Notizen', vorschlaege: 'Vorschläge', team: 'Team', zeit: 'Arbeitszeit', social: 'Social Media', vertrieb: 'Vertrieb', whatsapp: 'WhatsApp', kurs: 'Kurs & Teilnehmer', systeme: 'Systeme', skills: 'Skills', tresor: 'Tresor', web: 'Webseite', office: 'KI Office' };
const SERVER = {};            // SERVER.speicher = { S, S2 }, SERVER.postgres = { S, S2 }
let S3, S4, B, pgDa = false;
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
  // Chromium meldet jede HTTP-Fehlerantwort als Konsolenfehler; 401/403/409 der Portal-API sind erwartete Antworten (Abmeldung, Modul aus, Konflikt) und zählen nicht
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (401|403|409)/.test(m.text())) fehler.push(vp.width + ' ' + name + ' console: ' + m.text()); });
  p.on('request', r => { const u = r.url(); if (/\/webhook\//.test(u)) anfragen.push(u.replace(/^.*\/webhook\//, '')); });
  return p;
};
// Anmelden wie im echten Leben: erst der persönliche Link (#z=…), danach die Route (#/tab/…) als Hash-Wechsel im selben Fenster
const oeffne = async (p, S, hash, tok) => {
  await p.goto(S.base + '/frontend/' + (tok ? '#z=' + tok : ''), { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  if (hash) { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(400); }
};
const tabKlick = async (p, k) => { await p.click('nav.tabs button[data-tab="' + k + '"]'); await p.waitForTimeout(350); };
const shot = (p, name, vp, modus) => p.screenshot({ path: join(SHOTS, (modus === 'postgres' ? 'postgres-' : '') + (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
const text = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '');
const setze = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const dialogOffen = p => p.evaluate(() => !!document.getElementById('dlg').open);
const navTabs = p => p.$$eval('nav.tabs button', L => L.map(b => b.dataset.tab));
const optionen = (p, sel) => p.$$eval(sel + ' option', L => L.map(o => o.value));
// Kein waagerechtes Scrollen der ganzen Seite (vor allem bei 375 px)
const keinUeberlauf = async (p, wo) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Seite läuft waagerecht über: ' + wo);

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  SERVER.speicher = { S: await serverStarten(), S2: await serverStarten({ an: 'social,arbeitszeit,systeme,tresor' }) };
  S3 = await serverStarten({ an: 'vertrieb,whatsapp,office,kurs,skills,webseite' });
  S4 = await serverStarten({ an: 'social' });
  pgDa = await postgresDa();
  if (pgDa) SERVER.postgres = { S: await serverStarten({ postgres: 'pilot_browser' }), S2: await serverStarten({ postgres: 'pilot_browser2', an: 'social,arbeitszeit,systeme,tresor' }) };
  B = await browserStarten();
});
after(async () => { if (B) await B.close(); for (const m of Object.values(SERVER)) { await m.S.stop(); await m.S2.stop(); } if (S3) await S3.stop(); if (S4) await S4.stop(); });

test('Browser verfügbar', t => { if (!B) { t.diagnostic('Kein Browser (weder Playwright noch puppeteer-core mit Chromium): Browsertests übersprungen, siehe README.'); t.skip(); } else t.diagnostic('Browser: ' + B.art + (pgDa ? ', Postgres-Lauf aktiv' : ', kein Postgres: nur Betriebsart Speicher')); });

for (const modus of ['speicher', 'postgres']) for (const vp of [DESKTOP, MOBIL]) {
  const n = modus + ' ' + (vp.width > 600 ? 'Desktop' : 'Mobil');
  const bereit = t => { if (!B) { t.skip(); return false; } if (modus === 'postgres' && !pgDa) { t.skip('kein PostgreSQL'); return false; } return true; };
  const srv = () => SERVER[modus];

  test(n + ': Login über #z= und ?z=, Code verschwindet aus der Adresse, Abmelden, Anmelden per Code, Register-Leiste', async t => {
    if (!bereit(t)) return;
    const { S } = srv(); const T = S.tokens;
    const p = await neueSeite(vp, n + ' login');
    await p.goto(S.base + '/frontend/', { waitUntil: 'networkidle' }); await p.waitForTimeout(200);
    assert.match(await text(p, '#app'), /persönlichen Link/, 'ohne Code: Anmeldeseite'); assert.equal(await p.$eval('#code', e => e.placeholder), 'Code aus deinem Zugangslink');
    if (modus === 'speicher') await shot(p, 'login', vp, modus);
    assert.equal(await p.$eval('meta[name="referrer"]', m => m.content), 'no-referrer');
    await oeffne(p, S, '', T['mf-anna']);
    assert.ok(!/z=/.test(p.url()), 'Code ist nach dem Laden nicht mehr in der Adresse: ' + p.url());
    assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), T['mf-anna']);
    assert.equal(await p.title(), 'Team-Portal · Musterfirma GmbH');
    assert.match(await text(p, '.who'), /Anna Muster.*Admin/);
    // Register-Leiste: auf dem Handy mit Scroll-Hinweis (Pfeil rechts), der am Ende verschwindet
    const hinweis = await p.evaluate(() => { const w = document.querySelector('.tabwrap'); const s = getComputedStyle(w, '::after'); return { content: s.content, opacity: s.opacity, ende: w.classList.contains('ende'), scrollt: (() => { const nav = w.querySelector('nav.tabs'); return nav.scrollWidth > nav.clientWidth; })() }; });
    if (vp.width < 600) { assert.ok(hinweis.scrollt, 'Leiste scrollt auf 375 px'); assert.match(hinweis.content, /›/); assert.equal(hinweis.opacity, '1'); assert.equal(hinweis.ende, false); await p.evaluate(() => { const nav = document.querySelector('nav.tabs'); nav.style.scrollBehavior = 'auto'; nav.scrollLeft = nav.scrollWidth; }); await p.waitForTimeout(300); assert.equal(await p.evaluate(() => document.querySelector('.tabwrap').classList.contains('ende')), true, 'am Ende ohne Pfeil'); }
    else assert.ok(!hinweis.scrollt && hinweis.content === 'none', 'Desktop: kein Hinweis nötig');
    // Alter Link mit ?z= wird noch angenommen, der Code aber sofort entfernt
    await p.evaluate(() => localStorage.clear());
    await p.goto(S.base + '/frontend/?z=' + T['mf-ben'] + '#/tab/aufgaben', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    assert.ok(!/z=/.test(p.url()) && /#\/tab\/aufgaben$/.test(p.url()), 'Code weg, Route bleibt: ' + p.url());
    assert.match(await text(p, '.who'), /Ben Beispiel/);
    // Abmelden und per Code anmelden
    await tabKlick(p, 'team'); await p.click('#logout'); await p.waitForTimeout(200);
    assert.match(await text(p, '#app'), /abgemeldet/); assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), null);
    await setze(p, '#code', T['mf-clara']); await p.$eval('#codef', f => f.requestSubmit()); await p.waitForTimeout(500);
    assert.match(await text(p, '.who'), /Clara Probe/);
    await p.close();
  });

  test(n + ': nur eingeschaltete Register sichtbar, jedes öffnet sich, keine Anfrage an fremde Webhooks', async t => {
    if (!bereit(t)) return;
    const { S } = srv();
    const K = await konfigVon(S);
    const an = Object.keys(K.register).filter(r => K.register[r]).map(r => TAB_VON[r]);
    const aus = Object.keys(K.register).filter(r => !K.register[r]).map(r => TAB_VON[r]);
    assert.deepEqual(an, ['start', 'aufgaben', 'projekte', 'notizen', 'vorschlaege', 'team'], 'Standard-Konfiguration des Pilots');
    const p = await neueSeite(vp, n + ' register');
    await oeffne(p, S, '#/tab/start', S.tokens['mf-anna']);
    assert.deepEqual(await navTabs(p), an, 'Menü zeigt genau die eingeschalteten Register');
    const nav = await text(p, 'nav.tabs');
    for (const k of aus) assert.ok(!nav.includes(LABEL[k]), 'ausgeschaltet, aber im Menü: ' + LABEL[k]);
    assert.equal(await p.$('.zk'), null, 'kein Stundenkopf ohne Register Arbeitszeit');
    assert.ok(!(await text(p, '#main')).includes('KI Office'), 'kein Hinweis auf das KI Office in der Übersicht');
    assert.deepEqual(await p.$$eval('.dash .dtabs button', L => L.map(b => b.textContent)), ['Team & Aufgaben'], 'Dashboard nur Team & Aufgaben');
    assert.ok((await p.$$('#main .kpi')).length >= 4);
    await shot(p, 'start', vp, modus);
    await keinUeberlauf(p, 'start');
    for (const k of an.slice(1)) { await tabKlick(p, k); assert.match(await text(p, 'h1'), new RegExp(LABEL[k].split(' ')[0]), 'Register ' + k); await keinUeberlauf(p, k); if (modus === 'speicher' || k === 'aufgaben') await shot(p, k, vp, modus); }
    // Direkt per Adresse auf ein ausgeschaltetes Register → zurück zur Übersicht
    await oeffne(p, S, '#/tab/zeit'); assert.match(await text(p, 'h1'), /Hallo|Guten/); assert.match(p.url(), /#\/tab\/start$/);
    await oeffne(p, S, '#/tab/office'); assert.match(p.url(), /#\/tab\/start$/);
    const z = await S.zustand();
    assert.deepEqual(Object.keys(z.treffer), ['PILOTKUERZEL/portal-api'], 'Server hat nur die Portal-API gesehen');
    await p.close();
  });

  test(n + ': Aufgabe als Team-Mitglied anlegen, als Admin erledigen; Board; Papierkorb wiederherstellen; Admin-Startfilter', async t => {
    if (!bereit(t)) return;
    const { S } = srv();
    await S.reset(); const T = S.tokens;                       // nach dem Reset gelten neue Codes (Postgres)
    const titel = 'Browsertest ' + n + ': Dokumentation prüfen';
    let p = await neueSeite(vp, n + ' aufgabe-ben');
    await oeffne(p, S, '#/tab/aufgaben', T['mf-ben']);
    await p.click('#neu'); await p.waitForTimeout(200); assert.ok(await dialogOffen(p), 'Dialog „Neue Aufgabe“ offen');
    assert.equal(await p.$eval('#a_j', e => e.value), 'Onboarding Pilot', 'erstes Projekt vorbelegt, kein festes Standardprojekt');
    if (modus === 'speicher') await shot(p, 'dialog-aufgabe', vp, modus);
    await setze(p, '#a_t', titel); await setze(p, '#a_b', 'Aus dem **Browsertest**.'); await setze(p, '#a_p', '1'); await setze(p, '#a_d', '2030-05-01');
    await p.$eval('#af', f => f.requestSubmit()); await p.waitForTimeout(800);
    assert.ok(!(await dialogOffen(p)), 'Dialog zu'); assert.ok((await text(p, '#main')).includes(titel), 'Aufgabe in der Liste');
    await p.click('[data-v="board"]'); await p.waitForTimeout(300); assert.ok((await p.$$('.board .bcard')).length >= 2); if (modus === 'speicher') await shot(p, 'aufgaben-board', vp, modus);
    await p.click('[data-v="liste"]'); await p.waitForTimeout(200);
    await p.close();
    let z = await S.zustand(); const neu = z.tabellen.team_aufgaben.find(a => a.titel === titel);
    assert.ok(neu && neu.erstellt_von === 'mf-ben' && neu.prio === 1 && neu.status === 'Offen' && neu.geaendert_von === 'mf-ben', 'auf dem Server angekommen (' + modus + ')');
    // Admin öffnet die Aufgabe per Adresse und setzt sie auf Erledigt
    p = await neueSeite(vp, n + ' aufgabe-admin');
    await oeffne(p, S, '#/aufgabe/' + neu.aufgabe_id, T['mf-anna']);
    assert.ok(await dialogOffen(p), 'Aufgaben-Dialog per Adresse offen'); assert.equal(await p.$eval('#a_t', e => e.value), titel);
    assert.ok((await text(p, '#dlgInner')).includes('Link kopieren'));
    await setze(p, '#a_s', 'Erledigt'); await setze(p, '#a_k', 'Passt, danke.');
    await p.$eval('#af', f => f.requestSubmit()); await p.waitForTimeout(800);
    z = await S.zustand(); const erl = z.tabellen.team_aufgaben.find(a => a.aufgabe_id === neu.aufgabe_id);
    assert.equal(erl.status, 'Erledigt'); assert.ok(erl.erledigt_am); assert.equal(erl.geaendert_von, 'mf-anna'); assert.ok(z.tabellen.team_aufgaben_verlauf.some(v => v.aufgabe_id === neu.aufgabe_id && /Passt/.test(v.text)));
    // Papierkorb: vorbelegten Eintrag aus dem Seed wiederherstellen
    await oeffne(p, S, '#/tab/aufgaben', T['mf-anna']);
    await p.click('#pk_a'); await p.waitForSelector('[data-wh="mf-pk1"]'); await p.waitForTimeout(150);
    assert.match(await text(p, '#pk_info'), /Alles, was im Team gelöscht wurde/); assert.ok((await text(p, '#pk_liste')).includes('doppelt'));
    if (modus === 'speicher') await shot(p, 'papierkorb', vp, modus);
    await p.click('[data-wh="mf-pk1"]'); await p.waitForTimeout(800);
    z = await S.zustand(); assert.ok(z.tabellen.team_aufgaben.some(a => a.aufgabe_id === 'mf-a13'), 'wiederhergestellt'); assert.ok(!z.tabellen.team_papierkorb.some(e => e.eintrag_id === 'mf-pk1'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await p.close();
    // Admin ohne eigene offene Aufgaben: Startfilter „Alle Personen“ statt leerer Liste „Mir zugewiesen“
    const m = await api(S, T['mf-anna'], 'mitglied_speichern', { name: 'Olga Ohne', rolle: 'admin' }); assert.equal(m.status, 200);
    const tokO = (await api(S, T['mf-anna'], 'laden')).j.mitglieder.find(x => x.mitglied_id === m.j.id).token;
    assert.equal((await api(S, tokO, 'profil', { email: 'olga@example.invalid', telefon: '' })).status, 200);
    p = await neueSeite(vp, n + ' admin-filter');
    await oeffne(p, S, '#/tab/aufgaben', tokO);
    assert.equal(await p.$eval('#fp', e => e.value), '', 'Admin ohne eigene Aufgaben sieht „Alle Personen“'); assert.equal(await p.$eval('#fs', e => e.value), 'offen');
    assert.ok((await p.$$('#main [data-a]')).length >= 10, 'Liste ist gefüllt');
    await p.close();
    p = await neueSeite(vp, n + ' team-filter');
    await oeffne(p, S, '#/tab/aufgaben', T['mf-clara']);
    assert.equal(await p.$eval('#fp', e => e.value), 'ich', 'Team-Mitglied mit Aufgaben: „Mir zugewiesen“');
    await p.close();
  });

  test(n + ': Notiz mit Versionen und Wiki-Link, Vorschlag unterstützen (Bereiche vom Server), Projekt-Dialog, Rollen vom Server, Zugangslink mit #z=', async t => {
    if (!bereit(t)) return;
    const { S } = srv(); const T = S.tokens;
    // zwei Fassungen anlegen (Clara, dann Ben), damit Versionen da sind
    const n2 = (await api(S, T['mf-clara'], 'laden')).j.notizen.find(x => x.notiz_id === 'mf-n2');
    assert.equal((await api(S, T['mf-clara'], 'notiz_speichern', { notiz_id: 'mf-n2', titel: n2.titel, inhalt: n2.inhalt + '\nZusatz von Clara.', projekt: n2.projekt })).status, 200);
    assert.equal((await api(S, T['mf-ben'], 'notiz_speichern', { notiz_id: 'mf-n2', titel: n2.titel, inhalt: n2.inhalt + '\nZusatz von Ben.', projekt: n2.projekt })).status, 200);
    const p = await neueSeite(vp, n + ' notiz');
    await oeffne(p, S, '#/notiz/mf-n1', T['mf-anna']);
    assert.match(await text(p, '.nview h1'), /Willkommen im Portal/);
    await p.click('.nview a.wl'); await p.waitForTimeout(300); assert.match(await text(p, '.nview h1'), /Arbeitsweise/, '[[Wiki-Link]] springt zur Notiz');
    assert.ok((await p.$$('.md h3')).length >= 1, 'Markdown-Überschrift gerendert (## wird zu h3, eine Stufe unter dem Titel)');
    await p.click('#nedit'); await p.waitForTimeout(200); await p.click('#n_ver'); await p.waitForSelector('#n_verbox [data-vs]'); await p.waitForTimeout(150);
    assert.match(await text(p, '#n_verbox'), /Frühere Fassungen/); assert.match(await text(p, '#n_verbox'), /Clara Probe/); assert.equal((await p.$$('#n_verbox [data-vs]')).length, 2, 'zwei Fassungen');
    if (modus === 'speicher') await shot(p, 'notiz-versionen', vp, modus);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150); assert.ok(!(await dialogOffen(p)));
    // Vorschlag: Bereiche kommen aus der Server-Einstellung vorschlag_bereiche
    await tabKlick(p, 'vorschlaege');
    await p.click('#neuv'); await p.waitForTimeout(200);
    assert.deepEqual(await optionen(p, '#v_b'), ['Übersicht', 'Aufgaben', 'Projekte', 'Notizen', 'Vorschläge', 'Team', 'Sonstiges'], 'Bereiche aus team_einstellungen');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await p.close();
    // Vorschlag unterstützen: Ben hat bei mf-v1 (sein eigener, Stimmen von Clara und Anna) noch nicht gestimmt
    const q = await neueSeite(vp, n + ' vorschlag');
    await oeffne(q, S, '#/tab/vorschlaege', T['mf-ben']);
    const vorher = Number(await q.$eval('[data-vote="mf-v1"] b', e => e.textContent)); assert.equal(vorher, 2);
    await q.click('[data-vote="mf-v1"]'); await q.waitForTimeout(700);
    assert.equal(Number(await q.$eval('[data-vote="mf-v1"] b', e => e.textContent)), 3);
    assert.ok((await S.zustand()).tabellen.team_vorschlaege.find(v => v.vorschlag_id === 'mf-v1').stimmen.includes('mf-ben'));
    assert.ok((await text(q, '#main')).includes('Die Leitung entscheidet'));
    if (modus === 'speicher') await shot(q, 'vorschlaege', vp, modus);
    // Projekt-Dialog per Adresse
    await oeffne(q, S, '#/projekt/mf-p3'); assert.ok(await dialogOffen(q)); assert.equal(await q.$eval('#j_n', e => e.value), 'Interne Verbesserungen'); if (modus === 'speicher') await shot(q, 'dialog-projekt', vp, modus);
    await q.keyboard.press('Escape'); await q.waitForTimeout(150);
    await q.close();
    // Team (Admin): Rollen aus der Einstellung „rollen“ (admin, team immer; dozent und vertrieb mit Titel vom Server); „Link kopieren“ baut #z=
    const r = await neueSeite(vp, n + ' team');
    await oeffne(r, S, '#/tab/team', T['mf-anna']);
    assert.ok((await text(r, '#main')).includes('Wer bei Musterfirma'));
    await r.click('[data-m="mf-ben"]'); await r.waitForTimeout(200); assert.ok(await dialogOffen(r), 'Mitglied-Dialog offen');
    assert.deepEqual(await optionen(r, '#t_r'), ['admin', 'team', 'dozent', 'vertrieb'], 'Rollen vom Server');
    assert.deepEqual(await r.$$eval('#t_r option', L => L.map(o => o.textContent)), ['Admin', 'Team', 'Fachlich', 'Vertrieb'], 'Titel vom Server');
    await r.keyboard.press('Escape'); await r.waitForTimeout(150);
    await r.click('[data-link="mf-ben"]'); await r.waitForTimeout(200);
    const K = await konfigVon(S);
    assert.equal(await r.evaluate(() => window.__kopiert), K.portal_url + '#z=' + T['mf-ben'], 'Zugangslink = portal_url + #z= + Code');
    await r.close();
  });

  test(n + ': zusätzliche Register (social, arbeitszeit, systeme, tresor) erscheinen, Kanal als freies Feld, öffnen sich ohne Fehler', async t => {
    if (!bereit(t)) return;
    const { S2 } = srv();
    const p = await neueSeite(vp, n + ' zusatz');
    await oeffne(p, S2, '#/tab/start', S2.tokens['mf-anna']);
    assert.deepEqual(await navTabs(p), ['start', 'aufgaben', 'projekte', 'zeit', 'notizen', 'social', 'systeme', 'tresor', 'vorschlaege', 'team']);
    assert.deepEqual(await p.$$eval('.dash .dtabs button', L => L.map(b => b.textContent)), ['Team & Aufgaben', 'Marketing'], 'Dashboard ohne Vertrieb (aus)');
    assert.ok((await text(p, '#main')).includes('Nächste Beiträge'), 'Social-Karte in der Übersicht');
    await tabKlick(p, 'zeit'); assert.match(await text(p, 'h1'), /Arbeitszeit/); assert.ok((await text(p, '#main')).includes('Zur Freigabe'), 'Admin sieht Freigabe-Karte'); await keinUeberlauf(p, 'zeit'); if (modus === 'speicher') await shot(p, 'zusatz-arbeitszeit', vp, modus);
    await tabKlick(p, 'social'); assert.match(await text(p, 'h1'), /Social-Media-Plan/); assert.ok((await p.$$('.post')).length >= 2); await keinUeberlauf(p, 'social'); if (modus === 'speicher') await shot(p, 'zusatz-social', vp, modus);
    await p.click('#neup'); await p.waitForTimeout(200); assert.equal(await p.$eval('#p_k', e => e.tagName), 'INPUT', 'ohne Kanalliste (social_kanaele leer) ist Kanal ein freies Feld'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await tabKlick(p, 'systeme'); assert.match(await text(p, 'h1'), /Systeme/); assert.ok((await text(p, '#main')).includes('bei Musterfirma')); await keinUeberlauf(p, 'systeme');
    await tabKlick(p, 'tresor'); assert.match(await text(p, 'h1'), /Tresor/); await keinUeberlauf(p, 'tresor');
    await tabKlick(p, 'team'); assert.ok((await p.$$('[data-vertrag]')).length >= 1, 'Vertrag-Knopf nur mit Arbeitszeit');
    const z = await S2.zustand();
    assert.deepEqual(Object.keys(z.treffer), ['PILOTKUERZEL/portal-api'], 'auch mit Zusatz-Registern nur die Portal-API');
    await p.close();
  });
}

test('Firma vom Server hat Vorrang vor mandant.js; 401 meldet ab; Modul aus → Register verschwindet mit Hinweis (kein Toast)', async t => {
  if (!B) return t.skip();
  const S = S4; const T = S.tokens;
  // Firma und Kurzname aus team_einstellungen
  await S.einstellung('firma', 'Musterfirma Server GmbH'); await S.einstellung('kurzname', 'MusterServer');
  const p = await neueSeite(DESKTOP, 'firma');
  await oeffne(p, S, '#/tab/start', T['mf-ben']);
  assert.equal(await p.title(), 'Team-Portal · Musterfirma Server GmbH'); assert.ok((await text(p, '#main')).includes('MusterServer'), 'Kurzname vom Server in der Übersicht');
  await S.einstellung('firma', 'Musterfirma GmbH'); await S.einstellung('kurzname', 'Musterfirma');
  // Modul social ist an (--an social): Register da. Jetzt serverseitig aus → beim nächsten Speichern 403 → Register weg, Hinweis in der Übersicht
  assert.deepEqual(await navTabs(p), ['start', 'aufgaben', 'projekte', 'notizen', 'social', 'vorschlaege', 'team']);
  await S.einstellung('module', { social: false });
  await tabKlick(p, 'social'); await p.click('#neup'); await p.waitForTimeout(200);
  await setze(p, '#p_t', 'Beitrag nach dem Abschalten'); await p.$eval('#pf', f => f.requestSubmit()); await p.waitForTimeout(800);
  assert.ok(!(await dialogOffen(p)), 'Dialog geschlossen');
  assert.deepEqual(await navTabs(p), ['start', 'aufgaben', 'projekte', 'notizen', 'vorschlaege', 'team'], 'Register Social Media ausgeblendet');
  assert.match(await text(p, '#main .note.warn'), /Modul nicht aktiviert.*ausgeblendet/, 'Hinweis statt Toast');
  assert.ok(!(await p.evaluate(() => document.getElementById('toast').classList.contains('show'))), 'kein Toast');
  await p.waitForTimeout(300);
  // 401: Admin erzeugt für Ben einen neuen Link, Bens nächste Aktion meldet ihn ab
  assert.equal((await api(S, T['mf-anna'], 'mitglied_speichern', { mitglied_id: 'mf-ben', name: 'Ben Beispiel', neuer_link: true })).status, 200);
  await tabKlick(p, 'vorschlaege'); await p.click('[data-vote="mf-v1"]'); await p.waitForTimeout(700);
  assert.match(await text(p, '#app'), /Zugang ist ungültig/, 'Anmeldeseite mit Meldung'); assert.equal(await p.evaluate(() => localStorage.getItem('mt-token')), null, 'Code gelöscht');
  await p.close();
  await S.reset();
});

test('Übrige Register (vertrieb, whatsapp, office, kurs, skills, webseite): öffnen ohne Skriptfehler, rufen nur ihre eigene Schnittstelle', async t => {
  if (!B) return t.skip();
  const p = await B.seite(DESKTOP, INIT);
  const skriptfehler = []; p.on('pageerror', e => skriptfehler.push(e.message));
  const eigene = []; p.on('request', r => { const u = r.url(); if (/\/webhook\//.test(u)) eigene.push(u.replace(/^.*\/webhook\/PILOTKUERZEL\//, '')); });
  await oeffne(p, S3, '#/tab/start', S3.tokens['mf-anna']);
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

test('Hintergrund-Reload: alle 10 Minuten, nur bei sichtbarem Tab, sofort nach längerer Pause (Quelltext)', () => {
  const html = readFileSync(join(PILOT, 'frontend', 'index.html'), 'utf8');
  assert.ok(html.includes('const RELOAD_MS = 10 * 60000, PAUSE_MS = 5 * 60000;'));
  assert.ok(html.includes('setInterval(auffrischen, RELOAD_MS);'));
  assert.ok(html.includes("document.addEventListener('visibilitychange', nachPause);") && html.includes("window.addEventListener('focus', nachPause);"));
  assert.ok(html.includes("document.visibilityState === 'visible'"));
  assert.equal((html.match(/setInterval\(/g) || []).length, 2, 'nur der Reload und der WhatsApp-Timer (Register aus) nutzen setInterval');
});

test('Alle Webhook-Anfragen gingen an die Portal-API; Konsole und Seite ohne Fehler', t => {
  if (!B) return t.skip();
  assert.ok(anfragen.length >= 10, 'Anfragen gesehen: ' + anfragen.length);
  assert.deepEqual([...new Set(anfragen)], ['PILOTKUERZEL/portal-api']);
  assert.deepEqual(fehler, []);
});
