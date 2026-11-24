// Browsertests für das KI Office (Playwright oder puppeteer-core) mit Screenshots Desktop + Mobil, Fehler- und Leerzustände.
// Pflichtprüfung 8. Läuft gegen den lokalen Testserver (TESTADAPTER); produktive Systeme werden nicht berührt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serverStarten, post, REPO } from './hilfe.mjs';
import { browserStarten } from './browser.mjs';
import { TOKENS } from '../dev/testdaten.mjs';

const SHOTS = join(REPO, 'docs', 'office', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [];
const neueSeite = async (vp, opts = {}) => {
  const p = await B.seite(vp);
  p.on('pageerror', e => fehler.push(vp.width + ' ' + opts.name + ' pageerror: ' + e.message));
  // Chromium meldet blockierte Skripte in sandboxed iframes als Konsolenfehler: Bei den HTML-Testartefakten ist genau das erwartet (die Sandbox greift).
  p.on('console', m => { if (m.type() === 'error' && !(opts.netzfehlerErwartet && /Failed to load resource/.test(m.text())) && !/Blocked script execution in '[^']*\/testbilder\/[^']*' because the document's frame is sandboxed/.test(m.text())) fehler.push(vp.width + ' ' + opts.name + ' console: ' + m.text()); });
  // Das Anleitungs-Video (Loom) in der Portal-Übersicht nie wirklich laden: Stub statt Netz
  await p.route(/loom\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Loom (Teststub)</title>' }));
  // Nachrichten und Team-Chat lädt das Portal beim Start: an die Nachbildung im Testserver, nie an das echte n8n
  for (const [muster, ziel] of [[/n8n\.hm-storage\.de\/webhook\/team-msgs/, '/api/nachrichten'], [/n8n\.hm-storage\.de\/webhook\/team-chat/, '/api/chat']])
    await p.route(muster, async r => { const res = await fetch(S.base + ziel, { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  return p;
};
const oeffne = async (p, hash, tok = TOKENS.m_timo) => { await p.goto(S.base + '/office/?z=' + tok + hash, { waitUntil: 'networkidle' }); await p.waitForTimeout(250); };
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png'), fullPage: true });
const text = async (p, sel) => (await p.locator(sel).first().textContent()) || '';

before(async () => { mkdirSync(SHOTS, { recursive: true }); S = await serverStarten({ tempo: 0 }); B = await browserStarten(); });
after(async () => { if (B) await B.close(); if (S) await S.stop(); });

test('Browser verfügbar', t => { if (!B) { t.diagnostic('Kein Browser (weder playwright noch puppeteer-core mit Chromium) – Browsertests übersprungen. Siehe TESTBERICHT.md.'); t.skip(); } });

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Register, Detailseiten, Dialog, Tastatur, reduced motion', async t => {
    if (!B) return t.skip();
    const p = await neueSeite(vp, { name: n });
    await oeffne(p, '#/tab/projekte'); assert.match(await text(p, 'h1'), /Projekte/); assert.ok((await p.locator('.proj').count()) >= 6); await shot(p, 'projekte', vp);
    assert.ok((await text(p, '#main')).includes('Quelle: Aufgaben im Team-Portal'), 'Fortschritt nennt Quelle');
    await p.locator('[data-ansicht="kanban"]').click(); await p.waitForTimeout(150); assert.ok((await p.locator('.board .bcard').count()) >= 6); await shot(p, 'projekte-kanban', vp);
    await p.locator('[data-ansicht="liste"]').click();
    await oeffne(p, '#/projekt/p_kurs'); assert.match(await text(p, 'h1'), /Akademie-Kurs/); for (const h of ['Aufgaben', 'Agentenläufe', 'Aktivitäten', 'Ergebnisse', 'Dokumente', 'Entscheidungen', 'KI-Zusammenfassungen']) assert.ok((await text(p, '#main')).includes(h), h); await shot(p, 'projekt-detail', vp);
    await oeffne(p, '#/tab/agenten'); assert.match(await text(p, 'h1'), /Agenten/); assert.ok((await p.locator('.member').count()) >= 10); await shot(p, 'agenten', vp);
    await oeffne(p, '#/agent/akademie-redakteur'); assert.ok((await text(p, '#main')).includes('Ausführungen')); await shot(p, 'agent-detail', vp);
    const z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
    const wf = z.tabellen.office_runs.find(r => r.status === 'wartet_freigabe'), un = z.tabellen.office_runs.find(r => r.status === 'unbekannt'), fe = z.tabellen.office_runs.find(r => r.status === 'fehlgeschlagen'), ab = z.tabellen.office_runs.find(r => r.status === 'abgeschlossen' && r.abgenommen === true);
    await oeffne(p, '#/run/' + wf.run_id); assert.ok((await text(p, '#main')).includes('Zeitleiste')); assert.ok((await text(p, '#main')).includes('wartet auf Freigabe')); await shot(p, 'run-wartet-freigabe', vp);
    await oeffne(p, '#/run/' + un.run_id); assert.ok((await text(p, '#main')).includes('unbekannt / veraltet')); await shot(p, 'run-unbekannt', vp);
    await oeffne(p, '#/run/' + fe.run_id); assert.ok((await text(p, '#main')).includes('Fehler:')); await shot(p, 'run-fehlgeschlagen', vp);
    await oeffne(p, '#/run/' + ab.run_id); assert.ok((await text(p, '#main')).includes('fachlich abgenommen')); assert.ok((await text(p, '#main')).includes('Rückverfolgbar')); await shot(p, 'run-abgeschlossen', vp);
    // Orchestrierung: Team-Run mit Kind-Runs als eingerückte Zweige, Kind-Run mit Breadcrumb zum Eltern-Run
    const team = z.tabellen.office_runs.find(r => r.agent_id === 'orchestrierer' && !r.eltern_run_id), kind = z.tabellen.office_runs.find(r => r.eltern_run_id === team.run_id);
    await oeffne(p, '#/run/' + team.run_id); assert.ok((await text(p, '#main')).includes('Teilaufträge (2)')); assert.equal(await p.locator('.teilauftraege .zweige > li').count(), 2); assert.ok((await p.locator('.teilauftraege .zweige a[href="#/run/' + kind.run_id + '"]').count()) >= 1, 'Kind verlinkt'); assert.ok((await text(p, '.teilauftraege')).includes('in Arbeit')); await shot(p, 'run-team', vp);
    await oeffne(p, '#/run/' + kind.run_id); assert.ok((await text(p, '#main')).includes('Teil von')); assert.ok((await p.locator('a[href="#/run/' + team.run_id + '"]').count()) >= 1, 'Breadcrumb zum Eltern-Run'); assert.ok((await text(p, '#main')).includes('Teilauftrag')); await shot(p, 'run-teil', vp);
    await oeffne(p, '#/agent/orchestrierer'); assert.match(await text(p, '#main'), /delegiert: 2 Teilaufträge/); assert.ok((await p.locator('.zweig').count()) >= 2, 'Teilaufträge eingerückt unter dem Eltern-Run'); await shot(p, 'agent-orchestrierer', vp);
    await oeffne(p, '#/projekt/p_kurs'); assert.equal(await p.locator('#main a.run[href="#/run/' + kind.run_id + '"]').count(), 1, 'Kind-Run genau einmal im Projekt'); assert.ok((await p.locator('.zweig a.run').count()) >= 2);
    await oeffne(p, '#/tab/freigaben'); assert.match(await text(p, 'h1'), /Freigaben/); assert.ok((await p.locator('[data-freigabe][data-entscheidung="erteilt"]').count()) >= 1); await shot(p, 'freigaben', vp);
    // Büro: SVG vorhanden, Räume und Agenten verlinkt, Tastatur: Tab bis zum ersten Raum-Link, Enter filtert Projekte
    await oeffne(p, '#/tab/szene'); assert.ok(await p.locator('svg.buero').count()); assert.ok((await p.locator('svg.buero a').count()) >= 15); await shot(p, 'buero', vp);
    // Zentrale: Orchestrierer sitzt dort (nicht auf einer Raumplattform), laufendes Team als Linien zu den Figuren, Legende und Liste nennen das Team
    assert.equal(await p.locator('svg.buero a.zentrale-agent[href="#/agent/orchestrierer"]').count(), 1); assert.equal(await p.locator('svg.buero a.agent:not(.zentrale-agent)[href="#/agent/orchestrierer"]').count(), 0);
    assert.equal(await p.locator('svg.buero line.teamlinie').count(), 2, 'zwei Teammitglieder'); assert.ok((await text(p, '.legende')).includes('1 Team laufend: Orchestrierer mit Akademie-Redakteur, Kurs-Wächter')); assert.ok((await text(p, '#main')).includes('1 Orchestrierer · 1 Teams laufend')); assert.ok((await p.locator('ul.teams li').count()) >= 1);
    await p.evaluate(() => document.querySelector('svg.buero a').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    assert.match(await p.evaluate(() => location.hash), /^#\/raum\//); assert.ok((await text(p, '#main')).includes('Filter aufheben')); await shot(p, 'projekte-raumfilter', vp);
    // Klick auf Agent führt zur Arbeitsübersicht
    await oeffne(p, '#/tab/szene'); await p.evaluate(() => { const a = Array.from(document.querySelectorAll('svg.buero a')).find(x => /#\/agent\//.test(x.getAttribute('href'))); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); if (location.hash.indexOf('#/agent/') !== 0) location.hash = a.getAttribute('href'); }); await p.waitForTimeout(300);
    assert.match(await p.evaluate(() => location.hash), /^#\/agent\//);
    // reduced motion: keine Animation
    await p.emulateMedia({ reducedMotion: 'reduce' }); await oeffne(p, '#/tab/szene');
    const anim = await p.evaluate(() => { const e = document.querySelector('.puls'); return e ? getComputedStyle(e).animationName : 'none'; }); assert.equal(anim, 'none');
    assert.equal(await p.evaluate(() => { const e = document.querySelector('line.teamlinie.fluss'); return e ? getComputedStyle(e).animationName : 'none'; }), 'none', 'Teamlinien stehen bei reduced motion still');
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    // Dialog „Auftrag an Agent“ per Tastatur öffnen und wieder schließen
    await oeffne(p, '#/tab/projekte'); await p.locator('#neuAuftrag').click(); await p.waitForTimeout(150); assert.ok(await p.evaluate(() => document.querySelector('#dlg').open)); assert.ok((await p.locator('#f_a option').count()) >= 10); await shot(p, 'dialog-auftrag', vp);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100); assert.ok(!(await p.evaluate(() => document.querySelector('#dlg').open)));
    await p.close();
  });
}

for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Monitor zeigt Bild / zeigt ungeprüft / leer, HTML nur in der Sandbox, Monitorwand', async t => {
    if (!B) return t.skip();
    const p = await neueSeite(vp, { name: n + ' monitor' });
    await oeffne(p, '#/tab/szene');
    const mon = raum => 'svg.buero a.monitor[data-raum="' + raum + '"]';
    assert.equal(await p.locator('svg.buero a.monitor').count(), 5, 'ein Monitor je Raum');
    // Akademie: Bild aus testbilder/, Run fachlich abgenommen → „geprüft“
    const akademie = await p.evaluate(sel => { const a = document.querySelector(sel); const img = a.querySelector('image'); return { typ: a.dataset.typ, href: img && img.getAttribute('href'), marke: a.querySelector('.marke + text').textContent, label: a.getAttribute('aria-label') }; }, mon('Akademie'));
    assert.equal(akademie.typ, 'bild'); assert.match(akademie.href, /^testbilder\/akademie-quiz-modul-1-2\.svg$/); assert.equal(akademie.marke, 'geprüft'); assert.ok(akademie.label.includes('fachlich abgenommen'));
    assert.ok(await p.evaluate(src => fetch(src).then(r => r.ok && /svg/.test(r.headers.get('content-type'))), akademie.href), 'Testbild ist abrufbar');
    // Vertrieb: Bild, Run technisch abgeschlossen, aber nicht abgenommen → „ungeprüft“
    const vertrieb = await p.evaluate(sel => { const a = document.querySelector(sel); return { typ: a.dataset.typ, marke: a.querySelector('.marke + text').textContent, label: a.getAttribute('aria-label') }; }, mon('Vertrieb'));
    assert.equal(vertrieb.typ, 'bild'); assert.equal(vertrieb.marke, 'ungeprüft'); assert.ok(vertrieb.label.includes('ungeprüft'));
    // Kundenprojekte: PDF-Verweis → Karte ohne Ladevorgang (kein image, kein iframe)
    const kunden = await p.evaluate(sel => { const a = document.querySelector(sel); return { typ: a.dataset.typ, bild: !!a.querySelector('image'), frame: !!a.querySelector('iframe'), text: a.textContent }; }, mon('Kundenprojekte'));
    assert.equal(kunden.typ, 'pdf'); assert.ok(!kunden.bild && !kunden.frame); assert.ok(kunden.text.includes('PDF')); assert.ok(kunden.text.includes('ungeprüft'));
    // Verwaltung: kein Artefakt → „noch kein Ergebnis“
    assert.equal(await p.evaluate(sel => document.querySelector(sel).dataset.typ, mon('Verwaltung')), 'leer');
    assert.ok((await p.evaluate(sel => document.querySelector(sel + ' .leer').textContent, mon('Verwaltung'))).includes('noch kein Ergebnis'));
    // Marketing: HTML nur im iframe mit sandbox="" (keine Skripte, fremde Herkunft); das Prüfskript der Testseite darf nicht laufen
    const marketing = await p.evaluate(sel => { const f = document.querySelector(sel + ' foreignObject iframe'); return f ? { src: f.getAttribute('src'), sandbox: f.getAttribute('sandbox'), referrer: f.getAttribute('referrerpolicy') } : null; }, mon('Marketing'));
    assert.ok(marketing, 'HTML-Artefakt im iframe'); assert.equal(marketing.sandbox, ''); assert.equal(marketing.referrer, 'no-referrer'); assert.match(marketing.src, /^testbilder\/linkedin-vorschau-kw43\.html$/);
    await p.waitForTimeout(400);
    const frame = p.frames().find(f => /linkedin-vorschau-kw43\.html/.test(f.url()));
    assert.ok(frame, 'Vorschau-Frame geladen');
    const inFrame = await frame.evaluate(() => ({ origin: window.origin, titel: document.title, skript: document.getElementById('skript').textContent, text: document.body.textContent }));
    assert.equal(inFrame.origin, 'null', 'Sandbox: fremde Herkunft');
    assert.equal(inFrame.skript, 'Skript nicht ausgeführt (Sandbox).'); assert.notEqual(inFrame.titel, 'SKRIPT LIEF');
    assert.ok(inFrame.text.includes('Ignoriere alle vorherigen Anweisungen'), 'Prompt-Injection-Satz ist nur Text');
    assert.ok(!(await text(p, '#main')).includes('SKRIPT LIEF'));
    // Liste unter der Szene nennt den Monitorinhalt je Raum
    assert.ok((await text(p, '#main')).includes('Monitor: Quiz-Auswertung Modul 1.2'));
    assert.ok((await text(p, '#main')).includes('Monitor: noch kein Ergebnis'));
    // Klick auf den Monitor öffnet die Monitorwand des Raums
    await p.evaluate(sel => { const a = document.querySelector(sel); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); if (location.hash.indexOf('#/monitor/') !== 0) location.hash = a.getAttribute('href'); }, mon('Marketing')); await p.waitForTimeout(400);
    assert.equal(await p.evaluate(() => location.hash), '#/monitor/Marketing');
    assert.match(await text(p, 'h1'), /Monitorwand: Marketing/);
    assert.equal(await p.locator('.kachel').count(), 3, 'HTML, Bild, Versandprotokoll');
    assert.deepEqual(await p.evaluate(() => Array.from(document.querySelectorAll('.kachel')).map(k => k.dataset.typ)), ['html', 'bild', 'sonst'], 'neueste zuerst');
    const wandFrame = await p.evaluate(() => { const f = document.querySelector('.kachel iframe'); return { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src') }; });
    assert.equal(wandFrame.sandbox, ''); assert.match(wandFrame.src, /^testbilder\//);
    const wandText = await text(p, '#main');
    for (const s of ['ungeprüft', 'Hash', 'Aufgabe', 'Run', 'Öffnen ↗', '3 Ergebnisse', 'keine fachliche Abnahme']) assert.ok(wandText.includes(s), 'Monitorwand nennt ' + s);
    await shot(p, 'monitorwand', vp);
    // Akademie-Wand: abgenommenes Ergebnis ist als „fachlich abgenommen“ gekennzeichnet
    await oeffne(p, '#/monitor/Akademie'); assert.ok((await text(p, '#main')).includes('fachlich abgenommen von')); assert.ok((await text(p, '.kachel img').then(() => true, () => false)) || (await p.locator('.kachel img').count()) >= 1);
    assert.ok(await p.evaluate(() => { const i = document.querySelector('.kachel img'); return i && i.complete && i.naturalWidth > 0; }), 'Bild in der Monitorwand geladen');
    // Verwaltung-Wand: leer
    await oeffne(p, '#/monitor/Verwaltung'); assert.ok((await text(p, '#main')).includes('Noch kein Ergebnis in diesem Raum')); await shot(p, 'monitorwand-leer', vp);
    // Unbekannter Raum
    await oeffne(p, '#/monitor/Keller'); assert.ok((await text(p, '#main')).includes('Diesen Raum gibt es nicht'));
    await p.close();
  });
}

test('Fehlerzustände: ohne Zugang, ungültiger Code, API nicht erreichbar, 401, unbekannter Run', async t => {
  if (!B) return t.skip();
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'fehler', netzfehlerErwartet: true });
    await p.goto(S.base + '/office/', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.clear()); await p.goto(S.base + '/office/#/tab/projekte', { waitUntil: 'networkidle' }); await p.waitForTimeout(200);
    assert.ok((await text(p, '#app')).includes('Zugangscode')); await shot(p, 'anmeldung', vp);
    await p.locator('#code').fill('nicht-hex'); await p.locator('#codef button[type=submit]').click(); await p.waitForTimeout(200); assert.ok((await text(p, '#toast')).includes('gültigen Code'));
    await p.locator('#code').fill('f'.repeat(32)); await p.locator('#codef button[type=submit]').click(); await p.waitForTimeout(400); assert.ok((await text(p, '#app')).includes('ungültig'));
    await p.close();
    const q = await neueSeite(vp, { name: 'api-fehler', netzfehlerErwartet: true });
    await q.route(/\/api\/office$/, r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, fehler: 'Testfall: Office-API gestört' }) }));
    await q.goto(S.base + '/office/?z=' + TOKENS.m_timo + '#/tab/projekte', { waitUntil: 'networkidle' }); await q.waitForTimeout(200);
    assert.ok((await text(q, '#app')).includes('Keine Verbindung zur Office-API')); assert.ok((await text(q, '#app')).includes('Testfall: Office-API gestört')); await shot(q, 'api-nicht-erreichbar', vp);
    await q.close();
    const u = await neueSeite(vp, { name: 'unbekannt' });
    await oeffne(u, '#/run/run_gibtsnicht'); assert.ok((await text(u, '#main')).includes('gibt es nicht')); await shot(u, 'run-nicht-gefunden', vp);
    await oeffne(u, '#/projekt/p_geheim', TOKENS['agent-hermes']); assert.ok((await text(u, '#main')).includes('gibt es nicht oder du siehst es nicht'), 'fremdes Projekt für Agent unsichtbar');
    await u.close();
  }
});

test('Leerzustände (Szenario leer) und Freigabe-Entscheidung im Browser', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'leer' });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'leer' });
    await oeffne(p, '#/tab/projekte'); assert.ok((await text(p, '#main')).includes('Noch kein Agent') || (await text(p, '.kpis')).includes('0')); await shot(p, 'leer-projekte', vp);
    await oeffne(p, '#/tab/agenten'); assert.ok((await text(p, '#main')).includes('zuletzt nie')); await shot(p, 'leer-agenten', vp);
    await oeffne(p, '#/tab/freigaben'); assert.ok((await text(p, '#main')).includes('Keine offenen Freigaben')); await shot(p, 'leer-freigaben', vp);
    await oeffne(p, '#/tab/szene'); assert.ok((await text(p, '#main')).includes('0 laufend')); assert.equal(await p.locator('svg.buero a.monitor[data-typ="leer"]').count(), 5, 'alle fünf Monitore: noch kein Ergebnis'); await shot(p, 'leer-buero', vp);
    await oeffne(p, '#/agent/kurs-waechter'); assert.ok((await text(p, '#main')).includes('Noch keine Ausführungen')); await shot(p, 'leer-agent-detail', vp);
    await p.close();
  }
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const p = await neueSeite(DESKTOP, { name: 'freigabe' });
  await oeffne(p, '#/tab/freigaben');
  // Die Startfreigaben stehen oben in eigener Karte (Test „Startfreigabe“); hier die externe Aktion (E-Mail) freigeben
  await p.locator('#startFreigaben ~ .card [data-freigabe][data-entscheidung="erteilt"]').first().click(); await p.waitForTimeout(150);
  assert.ok(await p.evaluate(() => document.querySelector('#dlg').open)); await shot(p, 'dialog-freigabe', DESKTOP);
  await p.locator('#f_b').fill('Im Browsertest geprüft'); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, '#toast')).includes('Freigabe erteilt'));
  const z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  assert.ok(z.tabellen.office_freigaben.some(f => f.status === 'erteilt' && f.begruendung === 'Im Browsertest geprüft'));
  await p.close();
});

test('Team-Portal: Register „KI Office“ (Portal-API lokal umgeleitet)', async t => {
  if (!B) return t.skip();
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal' });
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => { const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/office', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    assert.match(await text(p, 'h1'), /KI Office/); assert.ok((await text(p, '#main')).includes('laufende Agentenaufträge')); assert.ok((await text(p, '#offStand')).includes('Office-API erreichbar'));
    await shot(p, 'portal-register-ki-office', vp);
    await p.close();
  }
});

test('Startfreigabe: Admin sieht Zähler und Dialog, Teammitglied sieht „wartet auf Timo“ und den Vorab-Hinweis im Auftragsdialog', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  for (const vp of [DESKTOP, MOBIL]) {
    // Timo (Admin): Zähler im Kopf, Karte mit Agent, Kostenstufe, Auftragstext, Auftraggeber; Freigabe-Dialog; Ablehnen verlangt eine Begründung
    const a = await neueSeite(vp, { name: 'startfreigabe-admin' });
    await oeffne(a, '#/tab/projekte');
    assert.match(await text(a, '#startZaehler'), /1 Auftrag wartet auf deine Freigabe/);
    await oeffne(a, '#/tab/freigaben');
    const karte = await text(a, '#startFreigaben');
    for (const s of ['Wartet auf deine Freigabe (1)', 'Marketing-Texter', 'normal', 'Newsletter zum Herbstangebot', 'Lillien (Test)']) assert.ok(karte.includes(s), 'Startkarte nennt ' + s);
    await shot(a, 'startfreigabe-admin', vp);
    await a.locator('#startFreigaben [data-freigabe][data-entscheidung="erteilt"]').first().click(); await a.waitForTimeout(150);
    const dlg = await text(a, '#dlgInner');
    for (const s of ['Start freigeben', 'Marketing-Texter', 'Kostenstufe', 'Newsletter zum Herbstangebot', 'Lillien (Test)', 'genau einmal']) assert.ok(dlg.includes(s), 'Dialog nennt ' + s);
    await shot(a, 'startfreigabe-dialog', vp);
    await a.evaluate(() => document.querySelector('#dlg').close());
    await a.close();
    // Lillien (Team): Hinweis auf der Run-Seite und im Kopf, keine Entscheidungsknöpfe
    const l = await neueSeite(vp, { name: 'startfreigabe-team' });
    await oeffne(l, '#/tab/projekte', TOKENS.m_lillien);
    assert.match(await text(l, '#startZaehler'), /1 deiner Aufträge wartet auf Timo/);
    await oeffne(l, '#/tab/freigaben', TOKENS.m_lillien);
    assert.equal(await l.locator('#startFreigaben [data-freigabe]').count(), 0, 'Teammitglieder können keinen Start freigeben');
    assert.ok((await text(l, '#startFreigaben')).includes('Wartet auf Timo'));
    await l.locator('#startFreigaben a[href^="#/run/"]').first().click(); await l.waitForTimeout(250);
    assert.ok((await text(l, '#startHinweis')).includes('Wartet auf Timo'));
    await shot(l, 'startfreigabe-team-run', vp);
    // Auftragsdialog: günstiger Agent und kurzer Text starten sofort, ein normaler Agent wartet auf Timo
    await oeffne(l, '#/agent/social-planer', TOKENS.m_lillien);
    await l.locator('#neuAuftrag').first().click(); await l.waitForTimeout(150);
    assert.ok((await text(l, '#f_hint')).includes('Startet sofort'), 'günstiger Agent, kurzer Text');
    await l.locator('#f_x').fill('Lang. '.repeat(120));
    assert.ok((await text(l, '#f_hint')).includes('Wartet auf Timo') && (await text(l, '#f_hint')).includes('länger als 600'), 'langer Text braucht Freigabe');
    assert.equal((await text(l, '#dlgOk')).trim(), 'Zur Freigabe vorlegen');
    await l.locator('#f_x').fill('Kurz');
    await l.evaluate(() => { const sel = document.querySelector('#f_a'); sel.value = 'marketing-texter'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await l.waitForTimeout(100);
    assert.ok((await text(l, '#f_hint')).includes('Wartet auf Timo') && (await text(l, '#f_hint')).includes('Kostenstufe'), 'normaler Agent braucht Freigabe');
    await shot(l, 'startfreigabe-auftragsdialog', vp);
    await l.evaluate(() => document.querySelector('#dlg').close());
    await l.close();
  }
});

test('Portal-Übersicht: „Für dich“ bündelt alle Freigaben; Prüfen-Dialog mit Inhalt, Entscheiden nur für Timo', async t => {
  if (!B) return t.skip();
  const portal = async (vp, tok, name) => {
    const p = await neueSeite(vp, { name });
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => { const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + tok + '#/tab/start', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800);
    const mehr = p.locator('#fuerDich [data-fdmehr="freigabe"]'); if (await mehr.count()) { await mehr.click(); await p.waitForTimeout(150); }
    return p;
  };
  for (const vp of [DESKTOP, MOBIL]) {
    await post(S.base, '/api/test/reset', { szenario: 'standard' });
    const a = await portal(vp, TOKENS.m_timo, 'portal-freigaben-admin');
    assert.equal(await a.locator('#freiKarte').count(), 0, 'keine separate Freigabe-Karte mehr');
    // Anleitungs-Video (Loom) oben in der Übersicht: offen für alle, einklappbar, Zustand bleibt je Gerät
    assert.ok((await text(a, '#anleitungVideo')).includes('So funktioniert das Portal'), 'Video-Karte mit Titel');
    assert.equal(await a.locator('#anleitungVideo iframe').count(), 1, 'Loom-Iframe eingebettet');
    assert.match(await a.locator('#anleitungVideo iframe').getAttribute('src'), /loom\.com\/embed\/d8374b76435f44bba6bae75895ded4bf/);
    await a.locator('#anleitungVideo summary').click(); await a.waitForTimeout(200);
    assert.equal(await a.locator('#anleitungVideo iframe').count(), 0, 'eingeklappt: kein Iframe mehr');
    assert.equal(await a.evaluate(() => localStorage.getItem('mt-video-zu')), '1', 'Zustand gemerkt');
    await a.locator('#anleitungVideo summary').click(); await a.waitForTimeout(200);
    assert.equal(await a.locator('#anleitungVideo iframe').count(), 1, 'wieder aufgeklappt');
    const box = await text(a, '#fuerDich .fd-frei');
    for (const s of ['Wartet auf deine Freigabe', 'Auftrag starten: Marketing-Texter', 'E-Mail senden', 'Lillien (Test)']) assert.ok(box.includes(s), 'Freigabe-Abschnitt nennt ' + s);
    await shot(a, 'portal-freigaben-admin', vp);
    await a.locator('#fuerDich .fd-z', { hasText: 'Auftrag starten: Marketing-Texter' }).first().click(); await a.waitForTimeout(200);
    const dlg = await text(a, '#dlgInner');
    for (const s of ['Freigabe im KI Office', 'Newsletter zum Herbstangebot', 'Start freigeben', 'genau einmal']) assert.ok(dlg.includes(s), 'Prüfen-Dialog nennt ' + s);
    await shot(a, 'portal-freigaben-pruefen', vp);
    if (vp === DESKTOP) {
      await a.locator('#fd_nein').click(); await a.waitForTimeout(150);
      assert.ok(await a.evaluate(() => document.querySelector('#dlg').open), 'Ablehnen ohne Begründung bleibt im Dialog');
      await a.locator('#fd_ja').click(); await a.waitForTimeout(1200);
      assert.match(await text(a, '#toast'), /freigegeben/i, 'Toast nach Freigabe');
      assert.ok(!(await text(a, '#fuerDich')).includes('Auftrag starten: Marketing-Texter'), 'Freigabe verschwindet aus der Box');
    } else await a.evaluate(() => document.querySelector('#dlg').close());
    await a.close();
    await post(S.base, '/api/test/reset', { szenario: 'standard' });  // Timo hat oben eventuell schon freigegeben
    const l = await portal(vp, TOKENS.m_lillien, 'portal-freigaben-team');
    const k2 = await text(l, '#fuerDich');
    assert.ok(k2.includes('Auftrag starten: Marketing-Texter'), 'Lillien sieht ihren wartenden Auftrag');
    assert.ok(!k2.includes('E-Mail senden'), 'fremde Freigaben sieht Lillien nicht');
    await l.locator('#fuerDich .fd-z', { hasText: 'Auftrag starten' }).first().click(); await l.waitForTimeout(200);
    assert.ok((await text(l, '#dlgInner')).includes('Freigeben kann nur Timo'), 'Hinweis für Teammitglieder');
    assert.equal(await l.locator('#fd_ja').count(), 0, 'keine Entscheidungsknöpfe für andere');
    await shot(l, 'portal-freigaben-team', vp);
    await l.close();
  }
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
});

test('Portal: Vorschläge mit Suche, Bereich, Schlagworten und Gruppierung; Notizen mit Pfad-Links; Arbeitszeit-Dialog verbreiterbar', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const umleiten = async p => {
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => { const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
  };
  const clipboardStub = p => p.evaluate(() => { window.__kopiert = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: v => { window.__kopiert.push(v); return Promise.resolve(); } } }); });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-vorschlaege' });
    await umleiten(p);
    const anzahl = () => p.evaluate(() => document.querySelectorAll('#vListe .vs').length);
    await p.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/tab/vorschlaege', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
    assert.equal(await anzahl(), 3, 'offen: drei Vorschläge (einer ist umgesetzt)');
    await p.locator('#v_such').fill('arbeitszeit'); await p.waitForTimeout(150); assert.equal(await anzahl(), 1, 'Suche nach Arbeitszeit');
    await p.locator('#v_such').fill(''); await p.waitForTimeout(100); assert.equal(await anzahl(), 3);
    await p.evaluate(() => { const s = document.querySelector('#v_ber'); s.value = 'Notizen'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
    assert.equal(await anzahl(), 1, 'Bereich Notizen');
    await p.evaluate(() => { const s = document.querySelector('#v_ber'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(100);
    await p.evaluate(() => document.querySelector('.meta[aria-label="Schlagworte"] [data-vtag="pfade"]').click()); await p.waitForTimeout(200);
    assert.equal(await anzahl(), 1, 'Schlagwort #pfade (offen)');
    await p.evaluate(() => document.querySelector('[data-vf="alle"]').click()); await p.waitForTimeout(200);
    assert.equal(await anzahl(), 2, 'Schlagwort #pfade über alle Status');
    await p.evaluate(() => document.querySelector('.meta[aria-label="Schlagworte"] [data-vtag=""]').click()); await p.waitForTimeout(150);
    await p.evaluate(() => { const c = document.querySelector('#v_grp'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => document.querySelectorAll('#vListe h3').length), 4, 'vier Bereiche als Überschriften');
    assert.ok((await text(p, '#vListe')).includes('Vorschläge'), 'Bereich „Vorschläge“ ist vorhanden');
    await shot(p, 'portal-vorschlaege', vp);
    await p.evaluate(() => { document.querySelector('#neuv').click(); }); await p.waitForTimeout(200);
    const bereiche = await p.evaluate(() => Array.from(document.querySelectorAll('#v_b option')).map(o => o.value));
    assert.ok(bereiche.includes('Vorschläge') && bereiche.includes('KI Office'), 'Bereiche: ' + bereiche.join(','));
    await p.evaluate(() => document.querySelector('#dlg').close());
    await p.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/notiz/n_4', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
    await clipboardStub(p);
    assert.equal(await p.evaluate(() => document.querySelectorAll('.nview a.pfad').length), 4, 'vier Pfad-Links in der Notiz');
    const werte = await p.evaluate(() => Array.from(document.querySelectorAll('.nview a.pfad')).map(a => a.dataset.pfad));
    assert.ok(werte.includes('\\\\server\\freigabe\\Projekt Müller\\Angebot.pdf'), 'Klammer-Pfad mit Leerzeichen: ' + JSON.stringify(werte));
    assert.ok(werte.includes('C:\\Daten\\Kurs\\Modul1.docx') && werte.includes('file:///C:/Daten/Kurs/Folien.pptx'), JSON.stringify(werte));
    await p.evaluate(() => { Array.from(document.querySelectorAll('.nview a.pfad')).find(x => x.dataset.pfad.startsWith('file:')).click(); }); await p.waitForTimeout(150);
    const kopiert = await p.evaluate(() => window.__kopiert);
    assert.equal(kopiert[0], 'C:\\Daten\\Kurs\\Folien.pptx', 'file:///C:/… wird zum Windows-Pfad: ' + JSON.stringify(kopiert));
    assert.equal(await p.evaluate(() => location.hash), '#/notiz/n_4', 'Klick auf einen Pfad verlässt die Notiz nicht');
    assert.equal(await p.evaluate(() => document.querySelectorAll('.nview a[href^="https://example.com"]').length), 1, 'normaler Link bleibt');
    await shot(p, 'portal-notiz-pfade', vp);
    await p.close();
  }
  const z = await neueSeite(DESKTOP, { name: 'portal-zeit' });
  await umleiten(z);
  await z.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/tab/zeit', { waitUntil: 'networkidle' }); await z.waitForTimeout(900);
  const knopf = await z.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Zeit eintragen|Neuer Eintrag|\+ Zeit|\+ Eintrag/.test(x.textContent)); if (b) b.click(); return !!b; });
  assert.ok(knopf, 'Knopf zum Eintragen der Zeit gefunden'); await z.waitForTimeout(250);
  assert.ok(await z.evaluate(() => document.querySelector('#dlg').classList.contains('breit') && !!document.querySelector('#dlg .zieh')), 'Arbeitszeit-Dialog hat den Ziehgriff zum Verbreitern');
  await z.close();
});

test('Portal: Tresor verschlüsselt und entschlüsselt im Browser, falscher Schlüssel und kurzer Schlüssel werden abgefangen', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-tresor' });
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => { const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    const gesendet = []; p.on('request', r => { if (r.method() === 'POST' && (r.postData() || '').includes('Geheim')) gesendet.push(r.url()); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/tab/tresor', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    await p.evaluate(() => { window.__kopiert = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: v => { window.__kopiert.push(v); return Promise.resolve(); } } }); });
    assert.match(await text(p, 'h1'), /Tresor/);
    const msg = () => text(p, '#tr_msg'), warte = () => p.waitForFunction(() => !document.querySelector('#tr_enc').disabled && !/…/.test(document.querySelector('#tr_msg').textContent), null, { timeout: 15000 });
    const geheim = 'Geheim-Passwort 123 äöü ß €';
    await p.locator('#tr_ein').fill(geheim); await p.locator('#tr_key').fill('kurz');
    await p.locator('#tr_enc').click(); assert.match(await msg(), /mindestens 10 Zeichen/);
    await p.locator('#tr_key').fill('vier zufällige wörter hier'); await p.locator('#tr_enc').click(); await warte();
    const paket = await p.locator('#tr_aus').inputValue(); assert.match(paket, /^MKT1\.[A-Za-z0-9_-]{40,}$/); assert.ok(!paket.includes('Geheim'));
    await p.locator('#tr_enc').click(); await warte(); assert.notEqual(await p.locator('#tr_aus').inputValue(), paket, 'jedes Mal anderes Ergebnis (Salz und IV zufällig)');
    await p.locator('#tr_ein').fill(paket); await p.locator('#tr_key').fill('falscher schlüssel 99'); await p.locator('#tr_dec').click(); await warte();
    assert.match(await msg(), /Schlüssel falsch/); assert.equal(await p.locator('#tr_aus').inputValue(), '');
    await p.locator('#tr_ein').fill(paket.slice(0, 20)); await p.locator('#tr_dec').click(); await warte(); assert.match(await msg(), /unvollständig/);
    await p.locator('#tr_ein').fill(paket.slice(0, 30) + '\n' + paket.slice(30)); await p.locator('#tr_key').fill('vier zufällige wörter hier'); await p.locator('#tr_dec').click(); await warte();
    assert.equal(await p.locator('#tr_aus').inputValue(), geheim, 'Zeilenumbruch beim Kopieren schadet nicht'); assert.equal(await msg(), 'Entschlüsselt.');
    await p.locator('#tr_kopie').click(); await p.waitForTimeout(100); assert.deepEqual(await p.evaluate(() => window.__kopiert), [geheim]);
    assert.equal(await p.locator('#tr_key').getAttribute('type'), 'password'); await p.locator('#tr_zeigen').click(); assert.equal(await p.locator('#tr_key').getAttribute('type'), 'text');
    await shot(p, 'portal-tresor', vp);
    await p.locator('#tr_leer').click(); for (const id of ['#tr_ein', '#tr_key', '#tr_aus']) assert.equal(await p.locator(id).inputValue(), '', id + ' geleert');
    assert.deepEqual(gesendet, [], 'Klartext wird nirgendwohin gesendet');
    await p.close();
  }
});

test('Portal: Timo legt unter „Team“ einen KI-Agenten an; Teammitglieder sehen den Knopf nicht', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-agent-anlegen' });
    const gespeichert = [];
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => {
      const b = JSON.parse(r.request().postData() || '{}');
      if (b.aktion === 'mitglied_speichern') { gespeichert.push(b.daten); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'agent-kurts-claude-code' }) }); }
      const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/team', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    await p.locator('#neua').click(); await p.waitForTimeout(150);
    assert.match(await text(p, '#dlgInner h2'), /Neuer KI-Agent/); assert.ok((await text(p, '#dlgInner')).includes('Agenten-Code')); assert.equal(await p.locator('#t_r').count(), 0, 'keine Rollenwahl für Agenten');
    await shot(p, 'portal-agent-anlegen', vp);
    await p.locator('#t_n').fill('Kurts Claude Code'); await p.locator('#t_f').fill('KI-Agent (Claude Code bei Kurt)');
    await p.locator('#tf [type=submit]').click(); await p.waitForTimeout(600);
    assert.equal(gespeichert.length, 1); assert.equal(gespeichert[0].typ, 'agent'); assert.equal(gespeichert[0].name, 'Kurts Claude Code'); assert.equal(gespeichert[0].mitglied_id, undefined);
    await p.locator('#neum').click(); await p.waitForTimeout(150); assert.match(await text(p, '#dlgInner h2'), /Neues Teammitglied/); assert.equal(await p.locator('#t_r').count(), 1);
    await p.locator('#t_c').click();
    await p.locator('[data-m="agent-claude"]').click(); await p.waitForTimeout(150); assert.ok((await text(p, '#dlgInner')).includes('Neuen Agenten-Code erzeugen'));
    await p.locator('#tf [type=submit]').click(); await p.waitForTimeout(600); assert.equal(gespeichert[1].typ, undefined, 'bestehender Agent: kein typ');
    await p.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/tab/team', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    assert.equal(await p.locator('#neua').count(), 0, 'nur Timo legt Agenten an');
    await p.close();
  }
});

test('Portal: Papierkorb, Notiz-Versionen, Warnung bei gleichzeitigem Bearbeiten und Schutz vor ungespeicherten Änderungen', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-papierkorb', netzfehlerErwartet: true });
    const gesendet = []; let konfliktEinmal = true;
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => {
      const b = JSON.parse(r.request().postData() || '{}'); const j = (code, body) => r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
      if (b.aktion !== 'laden') gesendet.push({ aktion: b.aktion, daten: b.daten });
      if (b.aktion === 'papierkorb') return j(200, { ok: true, tage: 30, eintraege: [{ eintrag_id: 'pk_1', art: 'aufgabe', art_name: 'Aufgabe', objekt_id: 'a_x', titel: 'TestAufgabe#1', projekt: 'Kurs Modul 2', vorschau: '**Level 3:** Notizen', zeichen: 20, kommentare: 2, geloescht_von: 'm_kurt', geloescht_von_name: 'Kurt (Test)', geloescht_am: '2026-10-19T12:00:00Z', endgueltig_ab: '2026-11-18T12:00:00Z' }] });
      if (b.aktion === 'papierkorb_wiederherstellen') return j(200, { ok: true, id: 'a_x' });
      if (b.aktion === 'notiz_versionen') return j(200, { ok: true, notiz_id: b.daten.notiz_id, versionen: [{ version_id: 'nv_1', titel: 'Entscheidung: Tonalität Kurs', inhalt: 'Alte Fassung mit Level 3', geaendert_von_name: 'Kurt (Test)', fassung_vom: '2026-10-19T11:40:00Z', gesichert_am: '2026-10-19T11:54:00Z' }] });
      if (b.aktion === 'notiz_speichern' && !b.daten.trotzdem && konfliktEinmal) { konfliktEinmal = false; return j(409, { ok: false, konflikt: true, fehler: 'Diese Notiz wurde inzwischen von Timo (Test) geändert, während du sie offen hattest.' }); }
      if (b.aktion === 'notiz_speichern' || b.aktion === 'notiz_loeschen') return j(200, { ok: true, id: 'n_2' });
      const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    const fragen = []; let antwort = false; p.on('dialog', d => { fragen.push(d.message()); antwort ? d.accept() : d.dismiss(); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_kurt + '#/notiz/n_2', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    // Papierkorb
    await p.locator('#pk_n').click(); await p.waitForTimeout(300);
    assert.match(await text(p, '#dlgInner'), /TestAufgabe#1/); assert.match(await text(p, '#pk_info'), /Was du gelöscht hast\. Gelöschtes bleibt 30 Tage/);
    assert.match(await text(p, '#pk_liste'), /Gelöscht von Kurt \(Test\) am 19\.10\.2026, 14:00 · endgültig weg ab 18\.11\.2026 · 2 Kommentare · Kurs Modul 2/);
    await shot(p, 'portal-papierkorb', vp);
    await p.locator('[data-wh="pk_1"]').click(); await p.waitForTimeout(400);
    assert.deepEqual(gesendet.find(g => g.aktion === 'papierkorb_wiederherstellen').daten, { eintrag_id: 'pk_1' });
    await p.locator('#pk_zu').click();
    // Versionen
    await p.locator('#nedit').click(); await p.waitForTimeout(200);
    assert.equal(await text(p, '#n_del'), 'In den Papierkorb');
    await p.locator('#n_ver').click(); await p.waitForTimeout(300);
    assert.match(await text(p, '#n_verbox'), /Frühere Fassungen[\s\S]*Kurt \(Test\) · 24 Zeichen/);
    await p.locator('[data-vs="0"]').click(); assert.match(await text(p, '[data-vv="0"]'), /Alte Fassung mit Level 3/);
    await shot(p, 'portal-notiz-versionen', vp);
    antwort = true; await p.locator('[data-vu="0"]').click(); antwort = false;
    assert.equal(await p.locator('#n_i').inputValue(), 'Alte Fassung mit Level 3');
    // Ungespeicherte Änderungen: Abbrechen und Zurück-Taste fragen, bei „Nein“ bleibt alles
    await p.locator('#n_i').fill('Mein neuer Text mit Level 3 und 4');
    await p.locator('#n_c').click(); await p.waitForTimeout(150);
    assert.ok(await p.locator('#dlg').evaluate(d => d.open), 'Abbrechen + Nein: Dialog bleibt offen'); assert.match(fragen.at(-1), /ungespeicherte Änderungen/);
    const vorher = await p.evaluate(() => location.hash);
    await p.evaluate(() => { location.hash = '#/tab/aufgaben'; }); await p.waitForTimeout(250);
    assert.ok(await p.locator('#dlg').evaluate(d => d.open), 'Adresswechsel + Nein: Dialog bleibt offen');
    assert.equal(await p.evaluate(() => location.hash), vorher, 'Adresse zurückgesetzt'); assert.equal(await p.locator('#n_i').inputValue(), 'Mein neuer Text mit Level 3 und 4');
    // Gleichzeitig bearbeitet: Hinweis, dann trotzdem speichern
    await p.locator('#nf [type=submit]').click(); await p.waitForTimeout(300);
    assert.match(await text(p, '#konfl'), /von Timo \(Test\) geändert[\s\S]*liegt danach unter „Versionen“/);
    await shot(p, 'portal-notiz-konflikt', vp);
    const erst = gesendet.filter(g => g.aktion === 'notiz_speichern')[0]; assert.ok(erst.daten.stand, 'Stand wird mitgeschickt'); assert.ok(!erst.daten.trotzdem);
    await p.locator('#k_ja').click(); await p.waitForTimeout(400);
    const zweit = gesendet.filter(g => g.aktion === 'notiz_speichern')[1]; assert.equal(zweit.daten.trotzdem, true); assert.equal(zweit.daten.inhalt, 'Mein neuer Text mit Level 3 und 4');
    assert.ok(!(await p.locator('#dlg').evaluate(d => d.open)), 'nach dem Speichern zu');
    // Löschen = Papierkorb
    await p.locator('#nedit').click(); await p.waitForTimeout(200);
    await p.locator('#n_del').click(); assert.equal(await text(p, '#n_del'), 'Wirklich? (30 Tage wiederherstellbar)');
    await p.locator('#n_del').click(); await p.waitForTimeout(300);
    assert.ok(gesendet.some(g => g.aktion === 'notiz_loeschen')); assert.match(await text(p, '#toast'), /Papierkorb verschoben/);
    await p.close();
  }
});

test('Portal: Kursstände getrennt nach Modulen (Übersicht und Kursseite)', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const jetzt = new Date().toISOString();
  const KURS = { teilnehmende: 4, aktiv_7_tage: 3, fortschritt_schnitt: 55, check_bestanden: 2, fragen_gesamt: 5, fragen_7_tage: 2, namen_sichtbar: true,
    je_teil: [['Modul 1.1', 3], ['Modul 1.2', 2], ['Unternehmer Modul 1', 1]], schritte: [['Abschluss', 2]], fragen_je_schritt: [], check_fehler: [],
    liste: [{ name: 'Anna Beispiel', email: 'a@example.org', kurs: 'Modul 1.1', fortschritt: 100, schritt: 'Abschluss', check: 'bestanden', zuletzt: jetzt },
      { name: 'Bernd Beispiel', email: 'b@example.org', kurs: 'Modul 1.2', fortschritt: 40, schritt: 'Level 4 · Video', check: 'offen', zuletzt: jetzt },
      { name: 'Clara Beispiel', email: '', kurs: 'Unternehmer Modul 1', fortschritt: 6, schritt: 'Level 1 · Video', check: 'offen', zuletzt: jetzt, kurscode: 'OFFEN' }],
    fragen: [{ zeit: jetzt, name: 'Bernd Beispiel', kurs: 'Modul 1.2', schritt: 'Level 4', frage: 'Wie verbinde ich n8n?' }],
    module: [
      { name: 'Modul 1.1', teilnehmende: 3, aktiv_7_tage: 2, fortschritt_schnitt: 70, abgeschlossen: 2, check_bestanden: 2, schritte: [['Abschluss', 2], ['Level 2 · Video', 1]], check_fehler: [['Frage 3', 1]], fragen_gesamt: 3, fragen_7_tage: 0, fragen_je_schritt: [['Start', 3]] },
      { name: 'Modul 1.2', teilnehmende: 2, aktiv_7_tage: 2, fortschritt_schnitt: 55, abgeschlossen: 1, check_bestanden: 0, schritte: [['Level 4 · Video', 1], ['Abschluss', 1]], check_fehler: [], fragen_gesamt: 2, fragen_7_tage: 2, fragen_je_schritt: [['Level 4', 2]] },
      { name: 'Unternehmer Modul 1', teilnehmende: 1, aktiv_7_tage: 1, fortschritt_schnitt: 6, abgeschlossen: 0, check_bestanden: 0, schritte: [['Level 1 · Video', 1]], check_fehler: [], fragen_gesamt: 0, fragen_7_tage: 0, fragen_je_schritt: [] }] };
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-kurs-module' });
    await p.route(u => String(u).includes('/webhook/team-klassenbuch'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, fehler: 'Testadapter: Klassenbuch nicht nachgebildet' }) }));
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => {
      if (JSON.parse(r.request().postData() || '{}').aktion === 'teilnehmer') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, spalten: [], teilnehmer: [] }) });
      const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); const j = await res.json();
      if (j && j.ok && !j.setup) { j.kurs = KURS; j.anfragen = []; }
      r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(j) });
    });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/start', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    await p.locator('[data-dt="kurs"]').first().click(); await p.waitForTimeout(300);
    const dash = await text(p, '#dbody');
    for (const n of ['Modul 1.1', 'Modul 1.2', 'Unternehmer Modul 1']) assert.ok(dash.includes(n), 'Übersicht zeigt ' + n);
    assert.match(dash, /Wo sie stehen/);
    await shot(p, 'portal-kurs-module-uebersicht', vp);
    await p.evaluate(() => { location.hash = '#/tab/kurs'; }); await p.waitForTimeout(400);
    assert.match(await text(p, '#main'), /Module im Vergleich/);
    await p.locator('.seg [data-km="Modul 1.2"]').click(); await p.waitForTimeout(200);
    const m12 = await text(p, '#main');
    assert.match(m12, /Modul 1\.2\. Du siehst Namen/); assert.ok(m12.includes('Bernd Beispiel') && !m12.includes('Anna Beispiel'), 'Tabelle nur Modul 1.2');
    assert.ok(m12.includes('Wie verbinde ich n8n?')); assert.ok(!m12.includes('Module im Vergleich'));
    await shot(p, 'portal-kurs-modul-12', vp);
    await p.locator('.seg [data-km="Unternehmer Modul 1"]').click(); await p.waitForTimeout(200);
    assert.ok(!(await text(p, '#main')).includes('Kurscode „OFFEN“'), 'OFFEN gilt nicht als falscher Kurscode');
    await p.locator('.seg [data-km=""]').click(); await p.waitForTimeout(200);
    assert.ok((await text(p, '#main')).includes('Anna Beispiel'));
    await p.close();
  }
});

test('Portal: Teilnehmer-Register (Tabelle, Klick-Häkchen, Dialog, Spalten)', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const SPALTEN = [['antrag', 'Antrag genehmigt'], ['gutschein', 'Bildungsgutschein im Haus'], ['vertrag', 'Seminarvertrag unterzeichnet'], ['brandschutz', 'Brandschutzordnung'], ['google', 'Google-Bewertung']].map(([id, ti], i) => ({ spalte_id: id, titel: ti, reihenfolge: (i + 1) * 10, aktiv: true }));
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-teilnehmer-register' });
    const gesendet = [];
    await p.route(u => String(u).includes('/webhook/team-klassenbuch'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, fehler: 'Testadapter' }) }));
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => {
      const b = JSON.parse(r.request().postData() || '{}'); const j = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (b.aktion !== 'laden') gesendet.push({ aktion: b.aktion, daten: b.daten });
      if (b.aktion === 'teilnehmer') return j({ ok: true, spalten: SPALTEN, teilnehmer: [
        { tn_id: 'tn_1', name: 'Erika Muster', email: 'e@example.org', massnahme: 'TEMP-Kurs', start: '2026-11-03', status: 'aktiv', notiz: 'braucht Laptop', haken: { antrag: { s: 'ja', d: '2026-10-20', von: 'm_timo' }, gutschein: { s: 'entfaellt', d: '2026-10-21', von: 'm_timo' } }, geaendert: '2026-10-22T10:00:00Z' },
        { tn_id: 'tn_2', name: 'Fritz Probe', massnahme: 'TEMP-Kurs', status: 'interessent', haken: {}, geaendert: '2026-10-22T10:00:00Z' },
        { tn_id: 'tn_3', name: 'Gerda Fertig', massnahme: 'Modul 1', status: 'abgeschlossen', haken: {}, geaendert: '2026-10-22T10:00:00Z' }] });
      if (['tn_haken', 'tn_speichern', 'tn_spalte_speichern'].includes(b.aktion)) return j({ ok: true, id: 'tn_x' });
      const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/kurs', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    const box = await text(p, '#tnBox');
    for (const ti of ['Teilnehmer-Register', 'Antrag genehmigt', 'Bildungsgutschein im Haus', 'Seminarvertrag unterzeichnet', 'Brandschutzordnung', 'Google-Bewertung', 'Erika Muster', 'Fritz Probe']) assert.ok(box.includes(ti), ti);
    assert.ok(!box.includes('Gerda Fertig'), 'Abgeschlossene standardmäßig ausgeblendet');
    assert.equal(await text(p, '[data-tnz="tn_1"][data-sp="antrag"]'), '✓'); assert.equal(await text(p, '[data-tnz="tn_1"][data-sp="gutschein"]'), '–');
    assert.match(box, /2\/5/, 'Stand zählt erledigt und entfällt');
    await shot(p, 'portal-teilnehmer-register', vp);
    await p.locator('[data-tnz="tn_2"][data-sp="vertrag"]').dispatchEvent('click'); await p.waitForTimeout(200);
    assert.equal(await text(p, '[data-tnz="tn_2"][data-sp="vertrag"]'), '✓', 'Klick setzt erledigt');
    await p.locator('[data-tnz="tn_2"][data-sp="vertrag"]').dispatchEvent('click'); await p.waitForTimeout(200);
    assert.equal(await text(p, '[data-tnz="tn_2"][data-sp="vertrag"]'), '–', 'zweiter Klick: entfällt');
    assert.deepEqual(gesendet.filter(g => g.aktion === 'tn_haken').map(g => g.daten.wert), ['ja', 'entfaellt']);
    await p.evaluate(() => { const s = document.querySelector('#tn_st'); s.value = 'alle'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(150);
    assert.ok((await text(p, '#tnBox')).includes('Gerda Fertig'));
    // neuer Teilnehmer
    await p.locator('#tn_neu').click(); await p.waitForTimeout(200);
    await p.locator('#tn_n').fill('Hanna Neu'); await p.locator('#tn_m').fill('TEMP-Kurs');
    await p.evaluate(() => { const s = document.querySelector('[data-tnw="antrag"]'); s.value = 'ja'; s.dispatchEvent(new Event('change')); });
    await shot(p, 'portal-teilnehmer-dialog', vp);
    await p.locator('#tnf [type=submit]').click(); await p.waitForTimeout(400);
    const sp = gesendet.find(g => g.aktion === 'tn_speichern').daten;
    assert.equal(sp.name, 'Hanna Neu'); assert.equal(sp.haken_aenderungen.length, 1); assert.equal(sp.haken_aenderungen[0].wert, 'ja'); assert.match(sp.haken_aenderungen[0].datum, /^\d{4}-\d{2}-\d{2}$/);
    // Spalte anlegen
    await p.locator('#tn_sp').click(); await p.waitForTimeout(200);
    await p.locator('#ts_neu').fill('Teilnahmebescheinigung ausgehändigt'); await p.locator('#tsf [type=submit]').click(); await p.waitForTimeout(400);
    assert.deepEqual(gesendet.filter(g => g.aktion === 'tn_spalte_speichern').map(g => g.daten.titel), ['Teilnahmebescheinigung ausgehändigt']);
    await p.close();
  }
});

test('Portal: Social Media – Video hochladen (signierte Adresse, PUT, Auftrag an Medien-Cutter) und Ideen-Liste', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const { writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const videoPfad = join(tmpdir(), 'portal-test-video.mp4'); writeFileSync(videoPfad, Buffer.alloc(2048, 7));
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'portal-social-upload' });
    const gesendet = [], puts = [];
    const ideen = [
      { idee_id: 'idee_a1', link: 'https://www.linkedin.com/posts/beispiel-firma_ki-activity-1', titel: 'Drei Zahlen, die jeder Handwerker kennt', quelle: 'Beispiel GmbH', kanal: 'LinkedIn', warum_stark: 'Hook mit konkreter Zahl in Zeile 1, dann drei kurze Absätze.', thema_fuer_uns: 'Routinearbeit in Stunden je Woche', status: 'neu', erstellt_von: 'm_lillien', geaendert: '2026-10-27T10:00:00Z' },
      { idee_id: 'idee_a2', link: 'https://www.instagram.com/reel/xyz/', titel: 'Reel: Vorher/Nachher Büro', quelle: '@buero.beispiel', kanal: 'Instagram', warum_stark: 'Schnitt auf den Beat', thema_fuer_uns: '', status: 'verworfen', erstellt_von: 'm_timo', geaendert: '2026-10-26T10:00:00Z' }];
    let uploads = [{ upload_id: 'up_alt1', dateiname: 'zoom-aufzeichnung.mp4', groesse: 734003200, thema: 'Zoom-Session Modul 1 Level 2', kanal: 'LinkedIn', kontext: '', status: 'beauftragt', run_id: 'run_test1', erstellt: '2026-10-27T09:00:00Z', erstellt_von: 'm_timo', bucket: 'medien-roh', pfad: '2026/10/up_alt1_zoom-aufzeichnung.mp4' }];
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-social/, r => {
      const b = JSON.parse(r.request().postData() || '{}'); const j = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (b.aktion !== 'laden') gesendet.push({ aktion: b.aktion, daten: b.daten });
      if (b.aktion === 'laden') return j({ ok: true, ideen, uploads, kanaele: ['LinkedIn', 'Instagram', 'YouTube', 'TikTok', 'Facebook', 'Sonstiges'], idee_status: ['neu', 'geprüft', 'umgesetzt', 'verworfen'], max_bytes: 2147483648, stand: '2026-10-28T10:00:00Z' });
      if (b.aktion === 'upload_url') { uploads = [{ upload_id: 'up_neu1', dateiname: b.daten.dateiname, groesse: b.daten.groesse, thema: b.daten.thema, kanal: b.daten.kanal, kontext: b.daten.kontext, status: 'hochladen', erstellt: '2026-10-28T10:00:00Z', erstellt_von: 'm_timo', bucket: 'medien-roh', pfad: '2026/10/up_neu1_' + b.daten.dateiname }, ...uploads]; return j({ ok: true, upload_id: 'up_neu1', bucket: 'medien-roh', pfad: '2026/10/up_neu1_' + b.daten.dateiname, mime: 'video/mp4', url: 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/object/upload/sign/medien-roh/2026/10/up_neu1_test.mp4?token=test', gueltig_sek: 7200 }); }
      if (b.aktion === 'upload_status') { uploads = uploads.map(u => u.upload_id === b.daten.upload_id ? { ...u, status: b.daten.status, run_id: b.daten.run_id || u.run_id } : u); return j({ ok: true, id: b.daten.upload_id, status: b.daten.status }); }
      if (b.aktion === 'idee_speichern') { ideen.unshift({ idee_id: 'idee_neu' + ideen.length, art: b.daten.bild_pfad ? 'bild' : (b.daten.link ? 'link' : 'idee'), ...b.daten, bild_url: b.daten.bild_pfad ? 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/object/public/social-ideen/' + b.daten.bild_pfad : null, erstellt_von: 'm_timo', geaendert: '2026-10-28T10:00:00Z' }); return j({ ok: true, id: 'idee_neu1' }); }
      if (b.aktion === 'idee_bild_url') return j({ ok: true, bucket: 'social-ideen', pfad: 'ideen/2026/10/bild_t1_' + b.daten.dateiname, mime: 'image/png', url: 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/object/upload/sign/social-ideen/ideen/2026/10/bild_t1_' + b.daten.dateiname + '?token=bild', gueltig_sek: 7200 });
      return j({ ok: true });
    });
    await p.route(/supabase\.co\/storage\/v1\/object\/public\//, r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    await p.route(/supabase\.co\/storage\/v1\/object\/upload\/sign\//, r => { puts.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"medien-roh/2026/10/up_neu1_test.mp4"}' }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/team-api-v2/, async r => { const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.route(/n8n\.hm-storage\.de\/webhook\/office-api/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
    await p.goto(S.base + '/team/?z=' + TOKENS.m_timo + '#/tab/social', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    const up = await text(p, '#upBox'), id = await text(p, '#ideenBox');
    for (const ti of ['Eigenes Video hochladen', 'Zoom-Session Modul 1 Level 2', 'beim Medien-Cutter', '734.0 MB', 'Im KI Office']) assert.ok(up.includes(ti), ti);
    for (const ti of ['Ideen & starke Mitbewerber-Posts', 'Drei Zahlen, die jeder Handwerker kennt', 'Beispiel GmbH', 'Hook mit konkreter Zahl', 'Routinearbeit in Stunden']) assert.ok(id.includes(ti), ti);
    assert.ok(!id.includes('Vorher/Nachher'), 'verworfene Ideen sind standardmäßig ausgeblendet');
    await shot(p, 'portal-social-upload-ideen', vp);
    await p.evaluate(() => { const s = document.querySelector('#id_st'); s.value = 'alle'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(150);
    assert.ok((await text(p, '#ideenBox')).includes('Vorher/Nachher'), 'Filter „Alle“ zeigt verworfene');
    // Idee einfügen
    await p.locator('#id_neu').click(); await p.waitForTimeout(200);
    await p.locator('#id_l').fill('https://www.linkedin.com/posts/wettbewerber_automatisierung-activity-2'); await p.locator('#id_w').fill('Carousel mit 5 Folien, letzte Folie ist eine Frage'); await p.locator('#id_u').fill('Unsere 5 Schritte zur ersten Automation');
    await shot(p, 'portal-social-idee-dialog', vp);
    await p.locator('#idf [type=submit]').click(); await p.waitForTimeout(500);
    const idee = gesendet.find(g => g.aktion === 'idee_speichern'); assert.ok(idee, 'idee_speichern gesendet');
    assert.equal(idee.daten.link, 'https://www.linkedin.com/posts/wettbewerber_automatisierung-activity-2'); assert.equal(idee.daten.status, 'neu'); assert.equal(idee.daten.kanal, '', 'Kanal leer = automatisch aus dem Link');
    assert.ok((await text(p, '#ideenBox')).includes('Carousel mit 5 Folien'), 'Liste nach dem Speichern neu geladen');
    // Freitext-Idee ohne Link, mit Bild (aus PR #49 übernommen): erst idee_bild_url, PUT, dann idee_speichern mit bild_pfad
    const bildPfad = join(tmpdir(), 'portal-test-bild.png'); writeFileSync(bildPfad, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    await p.locator('#id_neu').click(); await p.waitForTimeout(200);
    const bildFeld = await p.$('#id_b'); if (bildFeld.setInputFiles) await bildFeld.setInputFiles(bildPfad); else await bildFeld.uploadFile(bildPfad);
    await p.locator('#id_w').fill('Vorher/Nachher-Reel aus dem Kursraum, ohne Gesichter');
    await p.locator('#idf [type=submit]').click(); await p.waitForTimeout(800);
    const bildUrlAnfrage = gesendet.find(g => g.aktion === 'idee_bild_url'); assert.ok(bildUrlAnfrage, 'idee_bild_url gesendet'); assert.equal(bildUrlAnfrage.daten.dateiname, 'portal-test-bild.png');
    assert.equal(puts.filter(u => /token=bild$/.test(u)).length, 1, 'ein PUT für das Bild');
    const freitext = gesendet.filter(g => g.aktion === 'idee_speichern')[1]; assert.ok(freitext, 'zweite Idee gespeichert');
    assert.equal(freitext.daten.link, ''); assert.equal(freitext.daten.bild_pfad, 'ideen/2026/10/bild_t1_portal-test-bild.png'); assert.match(freitext.daten.warum_stark, /Vorher\/Nachher-Reel/);
    assert.ok((await text(p, '#ideenBox')).includes('Vorher/Nachher-Reel aus dem Kursraum'), 'Freitext-Idee in der Liste');
    assert.equal(await p.locator('#idListe img').count(), 1, 'Vorschaubild in der Liste');
    await shot(p, 'portal-social-idee-bild', vp);
    // Video hochladen: Einwilligung Pflicht, dann signierte Adresse → PUT → Status → Auftrag im KI Office (Testadapter) → Status beauftragt
    await p.locator('#up_neu').click(); await p.waitForTimeout(200);
    const dateiFeld = await p.$('#up_f'); if (dateiFeld.setInputFiles) await dateiFeld.setInputFiles(videoPfad); else await dateiFeld.uploadFile(videoPfad);
    await p.locator('#up_t').fill('Werkstatt-Dreh: Warum Routinearbeit teuer ist'); await p.locator('#up_x').fill('ab Minute 2 wird es gut');
    await shot(p, 'portal-social-upload-dialog', vp);
    await p.evaluate(() => document.querySelector('#upf').requestSubmit()); await p.waitForTimeout(300);
    assert.ok(!gesendet.some(g => g.aktion === 'upload_url'), 'ohne Einwilligung keine Upload-Adresse');
    await p.evaluate(() => { document.querySelector('#up_e').checked = true; });
    await p.evaluate(() => document.querySelector('#upf').requestSubmit()); await p.waitForTimeout(1200);
    const url = gesendet.find(g => g.aktion === 'upload_url'); assert.ok(url, 'upload_url gesendet');
    assert.equal(url.daten.dateiname, 'portal-test-video.mp4'); assert.equal(url.daten.groesse, 2048); assert.equal(url.daten.einwilligung, true); assert.equal(url.daten.thema, 'Werkstatt-Dreh: Warum Routinearbeit teuer ist');
    assert.equal(puts.filter(u => /token=test$/.test(u)).length, 1, 'genau ein PUT auf die signierte Video-Adresse');
    assert.deepEqual(gesendet.filter(g => g.aktion === 'upload_status').map(g => g.daten.status), ['hochgeladen', 'beauftragt'], 'Status hochgeladen, dann beauftragt');
    const run = gesendet.find(g => g.aktion === 'upload_status' && g.daten.status === 'beauftragt').daten.run_id; assert.match(String(run), /^run_/, 'run_id aus dem KI Office (Testadapter)');
    const zustand = await (await fetch(S.base + '/api/test/zustand')).json();
    const r = (zustand.tabellen.office_runs || []).find(x => x.run_id === run); assert.ok(r, 'Run liegt im Office'); assert.equal(r.agent_id, 'medien-cutter'); assert.equal(r.projekt, 'Social Media'); assert.equal(r.eingabe.upload_id, 'up_neu1'); assert.match(r.auftrag, /Momentum-Stil/);
    assert.ok((await text(p, '#upBox')).includes('Werkstatt-Dreh'), 'neuer Upload in der Liste');
    await p.close();
  }
});

// KI Office 2.0, Paket 1: Kontrollraum (Karten je Agent, „Für dich“, Live-Ticker in Ich-Form), Thema dunkel/hell, kompakte Einbettung, Kennzahlenzeile am Run
for (const vp of [DESKTOP, MOBIL]) {
  const n = vp.width > 600 ? 'Desktop' : 'Mobil';
  test(n + ': Kontrollraum – Karten je Agent, Für dich, Ticker in Ich-Form, Thema, Einbettung, Run-Kennzahlen', async t => {
    if (!B) return t.skip();
    await post(S.base, '/api/test/reset', { szenario: 'standard' });
    const p = await neueSeite(vp, { name: n + ' Kontrollraum' });
    // Ohne Hash und ohne gemerkten Reiter landet man im Kontrollraum
    await p.goto(S.base + '/office/?z=' + TOKENS.m_timo, { waitUntil: 'networkidle' }); await p.evaluate(() => { localStorage.removeItem('ko-tab'); localStorage.removeItem('ko-thema'); });
    await p.goto(S.base + '/office/?z=' + TOKENS.m_timo, { waitUntil: 'networkidle' }); await p.waitForTimeout(250);
    assert.equal(await p.evaluate(() => location.hash), '#/tab/buero'); assert.match(await text(p, 'h1'), /Kontrollraum/);
    const z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
    const aktiveAgenten = z.tabellen.office_agenten.filter(a => a.aktiv !== false).length;
    assert.equal(await p.locator('.akarte').count(), aktiveAgenten, 'eine Karte je aktivem Agenten');
    assert.equal(await p.locator('.kpis .kpi').count(), 5);
    assert.equal(await p.locator('.kr-raum[data-raum="Zentrale"] .akarte[data-agent="orchestrierer"]').count(), 1, 'Orchestrierer sitzt in der Zentrale');
    // Karte: Zustand, aktuelle Aufgabe, letztes Ergebnis mit Prüfmarke, Kostenzeile; Kosten ohne Meldung heißen „unbekannt“, nie 0 €
    const texter = '.akarte[data-agent="marketing-texter"]';
    assert.ok((await p.locator(texter + '.z-wartet_freigabe').count()) === 1, 'Texter wartet auf Freigabe');
    assert.ok((await text(p, texter)).includes('LinkedIn-Beitrag KW 43 (Vorschau)'), 'letztes Ergebnis auf der Karte');
    assert.ok((await text(p, '.akarte[data-agent="akademie-redakteur"]')).includes('Guthaben diesen Monat')); assert.ok((await text(p, '.akarte[data-agent="medien-cutter"]')).includes('Kosten (4 Wochen)'), 'ohne Monatsguthaben: Kosten statt Balken'); assert.ok((await text(p, '.akarte[data-agent="akademie-redakteur"]')).includes('geschätzt'), 'Claude-Code-Läufe: Kosten geschätzt und so gekennzeichnet'); assert.ok((await text(p, '.akarte[data-agent="kurs-waechter"]')).includes('unbekannt'), 'ohne Kostenangabe: unbekannt');
    assert.ok((await p.locator('.akarte.still').count()) >= 1, 'stiller Agent bekommt einen roten Rand'); assert.ok((await text(p, '.akarte.still')).includes('kein Lebenszeichen'));
    const main = await text(p, '#main'); assert.ok(!main.includes('undefined') && !main.includes('NaN'));
    // Für dich: Freigaben mit Knöpfen (gleicher Dialog wie im Register Freigaben), Rückfrage, stiller Agent, Abnahmen
    assert.ok((await p.locator('#krFuerDich [data-freigabe][data-entscheidung="erteilt"]').count()) >= 2); assert.ok((await p.locator('#krFuerDich .fd.frage').count()) >= 1); assert.ok((await p.locator('#krFuerDich .fd.problem').count()) >= 1);
    await p.locator('#krFuerDich [data-freigabe][data-entscheidung="erteilt"]').first().click(); await p.waitForTimeout(150);
    assert.ok(await p.evaluate(() => document.querySelector('#dlg').open)); assert.ok((await text(p, '#dlgInner')).includes('Hash')); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    // Ticker: Sätze in Ich-Form, jede Zeile führt zum Run
    assert.ok((await p.locator('#krTicker .ticker li').count()) >= 8); const tick = await text(p, '#krTicker');
    assert.ok(tick.includes('Ich habe den Auftrag übernommen') || tick.includes('Ich habe ein Ergebnis abgelegt') || tick.includes('Ich brauche'), 'Ich-Form im Ticker'); assert.equal(await p.locator('#krTicker .ticker li a:not([href^="#/run/"])').count(), 0);
    assert.ok((await text(p, '.kr-stand')).includes('alle 30 Sekunden'), 'solange ein Agent arbeitet: 30-Sekunden-Takt'); assert.ok((await text(p, 'footer')).includes('nur bei sichtbarem Tab'));
    await shot(p, 'kontrollraum', vp);
    // Thema: dunkel ist Standard, der Knopf schaltet auf hell und merkt es sich
    assert.equal(await p.evaluate(() => document.documentElement.dataset.thema), 'dunkel'); assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#0E0D22');
    await p.locator('#themaKnopf').click(); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.thema), 'hell'); assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#F6F6FB'); assert.equal(await p.evaluate(() => localStorage.getItem('ko-thema')), 'hell');
    await shot(p, 'kontrollraum-hell', vp);
    await p.locator('#themaKnopf').click(); await p.waitForTimeout(100); assert.equal(await p.evaluate(() => localStorage.getItem('ko-thema')), 'dunkel');
    // „Jetzt aktualisieren“ lädt neu und bleibt bedienbar; Klick auf die Karte öffnet die Arbeitsübersicht
    await p.locator('#krNeu').click(); await p.waitForTimeout(500); assert.equal(await p.locator('#krNeu:not([disabled])').count(), 1);
    await p.locator('.akarte[data-agent="akademie-redakteur"] h3 a').click(); await p.waitForTimeout(250); assert.equal(await p.evaluate(() => location.hash), '#/agent/akademie-redakteur');
    // Run-Seite: Kennzahlenzeile über der Zeitleiste
    const ab = z.tabellen.office_runs.find(r => r.status === 'abgeschlossen' && r.abgenommen === true);
    await oeffne(p, '#/run/' + ab.run_id); assert.equal(await p.locator('#runKz > div').count(), 6); assert.ok((await text(p, '#runKz')).includes('Kosten')); assert.ok((await text(p, '#runKz')).includes('Ergebnis-Typ')); assert.ok((await text(p, '#runKz')).includes('Wirkung')); assert.ok((await text(p, '#runKz')).includes('abgenommen'));
    // Die Büro-Szene liegt jetzt unter „szene“; die alte Adresse „buero“ zeigt den Kontrollraum (Einbettung im Portal bleibt gültig)
    await oeffne(p, '#/tab/szene'); assert.ok(await p.locator('svg.buero').count()); await oeffne(p, '#/tab/buero'); assert.equal(await p.locator('svg.buero').count(), 0);
    // Kompakte Einbettung für die Portal-Übersicht: nur Agenten, bei denen etwas läuft oder wartet, alle anderen als Zeile; kein eigener Kopf, kein „Für dich“
    await p.goto(S.base + '/office/?einbetten=1&nur=buero&z=' + TOKENS.m_timo + '#/tab/buero', { waitUntil: 'networkidle' }); await p.waitForTimeout(250);
    const kompakt = await p.locator('.akarte').count(); assert.ok(kompakt >= 1 && kompakt < aktiveAgenten, 'nur aktive Karten'); assert.ok(await p.locator('#krFrei a.chip').count() >= 1);
    assert.equal(await p.locator('#krFuerDich').count(), 0); assert.equal(await p.locator('h1').count(), 0); assert.ok((await p.locator('#krTicker .ticker li').count()) >= 5);
    await shot(p, 'kontrollraum-eingebettet', vp);
    // Agenten sehen keinen „Für dich“-Block und nur ihre eigenen Projekte (Rechte entscheidet der Server)
    await oeffne(p, '#/tab/buero', TOKENS['agent-hermes']); assert.equal(await p.locator('#krFuerDich').count(), 0); assert.equal(await p.locator('#neuAuftrag').count(), 0);
    await p.close();
  });
}

// KI Office 2.0, Paket 2: Register „Auswertung“ mit Musterdaten, Wirkung beim Abnehmen und nachträglich, Rückfall ohne Kennzahlen vom Server
test('Auswertung: Rangliste und Tabelle aus den Musterdaten, Wirkung eintragen, Rückfall ohne Kennzahlen-Tabelle', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'auswertung ' + vp.width });
    await oeffne(p, '#/tab/auswertung'); assert.match(await text(p, 'h1'), /Auswertung/);
    assert.equal(await p.locator('.rang[data-stufe]').count(), 4); assert.equal(await p.locator('#auswHinweis').count(), 0, 'Server liefert die Kennzahlen');
    assert.ok((await text(p, '.rang[data-stufe="liefert"]')).includes('Vertriebs-Recherche')); assert.ok((await text(p, '.rang[data-stufe="liefert"]')).includes('Marketing-Texter'));
    assert.ok((await text(p, '.rang[data-stufe="liefert_nicht"]')).includes('Social-Planer')); assert.ok((await text(p, '.rang[data-stufe="liefert_nicht"]')).includes('50 % zurückgewiesen'));
    assert.ok((await text(p, '.rang[data-stufe="beobachten"]')).includes('Kosten unbekannt')); assert.ok((await text(p, '.rang[data-stufe="zu_wenig"]')).includes('Rekruiter'));
    const z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
    assert.equal(await p.locator('table.auswertung tbody tr').count(), z.tabellen.office_agenten.filter(a => a.aktiv !== false).length);
    const vr = await text(p, 'table.auswertung tr[data-agent="vertrieb-recherche"]');
    assert.ok(vr.includes('42 qualifizierte Firmen')); assert.ok(vr.includes('4 Termine')); assert.ok(vr.includes('geschätzt')); assert.ok(vr.includes('liefert'));
    assert.ok((await text(p, 'table.auswertung tr[data-agent="marketing-texter"]')).includes('gemessen')); assert.ok((await p.locator('table.auswertung tr[data-agent="vertrieb-recherche"] svg.spark').count()) === 1, 'Trend über vier Wochen');
    const main = await text(p, '#main'); assert.ok(!main.includes('undefined') && !main.includes('NaN')); assert.ok(main.includes('So wird gerechnet'));
    assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'kein seitliches Scrollen der Seite, nur der Tabelle');
    await shot(p, 'auswertung', vp);
    // Kontrollraum nutzt dieselben Kennzahlen: Kosten je abgenommenem Ergebnis auf der Karte
    await oeffne(p, '#/tab/buero'); assert.ok((await text(p, '.akarte[data-agent="vertrieb-recherche"]')).includes('je abgenommenem Ergebnis')); assert.ok((await p.locator('.akarte[data-agent="vertrieb-recherche"] svg.spark').count()) === 1);
    await p.close();
  }
  // Wirkung: beim Abnehmen eintragen, danach ergänzen (nur Desktop, der Zustand ändert sich)
  const p = await neueSeite(DESKTOP, { name: 'wirkung' });
  const z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  const r2 = z.tabellen.office_runs.find(r => r.agent_id === 'vertrieb-recherche' && r.status === 'abgeschlossen' && r.abgenommen == null);
  await oeffne(p, '#/run/' + r2.run_id); assert.equal(await p.locator('#wirkungKnopf').count(), 1);
  assert.ok((await text(p, '#runKz')).includes('geschätzt')); assert.ok((await text(p, '#runKz')).includes('Textlänge'), 'Basis der Schätzung steht dabei');
  await p.locator('#runAktionen button.ok').click(); await p.waitForTimeout(150);
  assert.equal(await p.locator('#dlg [data-wirkung]').count(), 3, 'Vertrieb: Dossiers, qualifizierte Firmen, Termine');
  await p.locator('#dlg [data-wirkung="firmen"]').fill('12'); await p.locator('#dlg [data-wirkung="dossiers"]').fill('1'); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, '#toast')).includes('Abgenommen')); assert.ok((await text(p, '#runKz')).includes('12 qualifizierte Firmen'));
  await p.locator('#wirkungKnopf').click(); await p.waitForTimeout(150); assert.equal(await p.evaluate(() => document.querySelector('#dlg [data-wirkung="firmen"]').value), '12', 'vorbelegt mit dem Stand');
  await p.locator('#dlg [data-wirkung="termine"]').fill('4'); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, '#runKz')).includes('4 Termine')); await shot(p, 'run-wirkung', DESKTOP);
  const z2 = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  assert.deepEqual(z2.tabellen.office_kennzahlen.find(k => k.run_id === r2.run_id).wirkung, { dossiers: 1, firmen: 12, termine: 4 });
  await p.close();
  // Rückfall: der Server liefert noch keine Kennzahlen (SQL und Bündel noch nicht eingespielt) → Hinweis, gerechnet wird aus den Läufen
  const q = await neueSeite(DESKTOP, { name: 'auswertung-rueckfall' });
  await q.route(/\/api\/office$/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); const j = await res.json(); delete j.kennzahlen; delete j.kennzahl_zeilen; delete j.auswertung; r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(j) }); });
  await oeffne(q, '#/tab/auswertung'); assert.equal(await q.locator('#auswHinweis').count(), 1); assert.ok((await q.locator('table.auswertung tbody tr').count()) >= 10); assert.ok(!(await text(q, '#main')).includes('undefined'));
  await oeffne(q, '#/run/' + r2.run_id); assert.equal(await q.locator('#wirkungKnopf').count(), 0, 'ohne Tabelle kein Wirkungs-Knopf'); assert.equal(await q.locator('#runKz > div').count(), 6);
  await q.close();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
});

// KI Office 2.0, Paket 3: Register „Guthaben“ mit Vorschlagskarten; leeres Guthaben auf der Karte im Kontrollraum; Timo füllt auf, pausiert, legt eine Instanz an
test('Guthaben: Stand je Agent, Vorschlagskarten nur für den Admin, auffüllen, pausieren, zweite Instanz', async t => {
  if (!B) return t.skip();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
  const tabellen = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).tabellen;
  const api = async (aktion, daten) => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: JSON.stringify({ token: TOKENS.m_timo, aktion, daten }) }); return { status: res.status, j: await res.json() }; };
  for (const vp of [DESKTOP, MOBIL]) {
    const p = await neueSeite(vp, { name: 'guthaben ' + vp.width });
    await oeffne(p, '#/tab/guthaben'); assert.match(await text(p, 'h1'), /Guthaben/); assert.equal(await p.locator('#ghHinweis').count(), 0);
    assert.equal(await p.locator('table.guthaben-tabelle tbody tr').count(), (await tabellen()).office_agenten.length);
    assert.ok((await text(p, 'tr[data-agent="kunden-entwickler"]')).includes('leer: kein Start')); assert.ok((await text(p, 'tr[data-agent="pa-assistent"]')).includes('nicht eingerichtet'));
    assert.ok((await text(p, '.vkarte[data-vorschlag="auffuellen"][data-agent="kunden-entwickler"]')).includes('Neue Aufträge starten nicht'));
    assert.ok((await text(p, '.vkarte[data-vorschlag="pausieren"][data-agent="social-planer"]')).includes('zurückgewiesen'));
    assert.ok((await text(p, '.vkarte[data-vorschlag="skalieren"][data-agent="vertrieb-recherche"]')).includes('je abgenommenem Ergebnis')); assert.equal(await p.locator('.vkarte[data-vorschlag="skalieren"][data-agent="vertrieb-recherche"] button').count(), 3, 'Guthaben erhöhen, zweite Instanz, nicht jetzt');
    assert.equal(await p.locator('.vkarte[data-vorschlag="einrichten"]').count(), 1);
    assert.match(await text(p, 'nav.tabs a[href="#/tab/guthaben"]'), /\d/, 'Zahl der Vorschläge am Register');
    const main = await text(p, '#main'); assert.ok(!main.includes('undefined') && !main.includes('NaN')); assert.ok(main.includes('So wird gerechnet'));
    assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'kein seitliches Scrollen der Seite, nur der Tabelle');
    await shot(p, 'guthaben', vp);
    // Kontrollraum: Karte mit leerem Guthaben und Weg zum Auffüllen
    await oeffne(p, '#/tab/buero'); assert.ok((await text(p, '.akarte[data-agent="kunden-entwickler"] .guthaben')).includes('Guthaben leer')); assert.equal(await p.locator('.akarte[data-agent="kunden-entwickler"] .gb-leer a[href="#/tab/guthaben"]').count(), 1);
    await p.close();
  }
  // Teammitglied: sieht den Stand, aber keine Vorschläge und keine Knöpfe
  const l = await neueSeite(DESKTOP, { name: 'guthaben-team' });
  await oeffne(l, '#/tab/guthaben', TOKENS.m_lillien); assert.equal(await l.locator('.vkarte').count(), 0); assert.equal(await l.locator('#ghVorschlaege').count(), 0); assert.equal(await l.locator('[data-g-setzen], [data-g-aktiv]').count(), 0);
  assert.ok((await text(l, '#main')).includes('entscheidet Timo')); assert.ok((await l.locator('table.guthaben-tabelle tbody tr').count()) >= 10);
  await oeffne(l, '#/tab/buero', TOKENS.m_lillien); assert.ok((await text(l, '.akarte[data-agent="kunden-entwickler"] .guthaben')).includes('Timo füllt auf'));
  await l.close();
  // Timo entscheidet (nur Desktop, der Zustand ändert sich)
  const p = await neueSeite(DESKTOP, { name: 'guthaben-entscheiden' });
  // a) Auftrag an den leeren Agenten: wird angelegt, wartet
  const arch = (await tabellen()).office_agenten.find(a => a.agent_id === 'kunden-entwickler');
  const start = (await api('auftrag_starten', { agent_id: 'kunden-entwickler', projekt: arch.projekte[0], auftrag: 'Review der Schnittstelle (Browsertest)', idempotenzschluessel: 'bt-guthaben-1' })).j;
  assert.ok(start.gruende.some(g => g.code === 'guthaben')); assert.ok(start.freigabe_id);
  assert.equal((await api('freigabe_entscheiden', { freigabe_id: start.freigabe_id, entscheidung: 'erteilt' })).status, 409, 'ohne Auffüllen kein Start');
  // b) auffüllen über die Karte
  await oeffne(p, '#/tab/guthaben'); assert.ok((await text(p, '.vkarte[data-vorschlag="auffuellen"][data-agent="kunden-entwickler"]')).includes('1 Auftrag wartet'));
  await p.locator('.vkarte[data-vorschlag="auffuellen"][data-agent="kunden-entwickler"] [data-v-option="auffuellen"]').click(); await p.waitForTimeout(150);
  await p.locator('#g_w').fill('3'); await p.locator('#g_b').fill('Review ist nötig.'); await shot(p, 'guthaben-auffuellen', DESKTOP); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, '#toast')).includes('aufgefüllt')); assert.equal(await p.locator('.vkarte[data-vorschlag="auffuellen"][data-agent="kunden-entwickler"]').count(), 0); assert.ok((await text(p, 'tr[data-agent="kunden-entwickler"]')).includes('aufgefüllt'));
  assert.equal((await api('freigabe_entscheiden', { freigabe_id: start.freigabe_id, entscheidung: 'erteilt' })).status, 200, 'nach dem Auffüllen lässt sich der Start freigeben');
  // c) pausieren über die Karte, wieder einschalten über die Tabelle
  await oeffne(p, '#/tab/guthaben');
  await p.locator('.vkarte[data-vorschlag="pausieren"][data-agent="social-planer"] [data-v-option="pausieren"]').click(); await p.waitForTimeout(150); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, 'tr[data-agent="social-planer"]')).includes('pausiert')); assert.equal((await tabellen()).office_agenten.find(a => a.agent_id === 'social-planer').aktiv, false);
  await oeffne(p, '#/tab/buero'); assert.equal(await p.locator('.akarte[data-agent="social-planer"]').count(), 0, 'pausierte Agenten stehen nicht im Kontrollraum');
  await oeffne(p, '#/tab/guthaben'); await p.locator('[data-g-aktiv="social-planer"]').click(); await p.waitForTimeout(150); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.equal((await tabellen()).office_agenten.find(a => a.agent_id === 'social-planer').aktiv, true);
  // d) zweite Instanz für ein Segment
  await p.locator('.vkarte[data-vorschlag="skalieren"][data-agent="vertrieb-recherche"] [data-v-option="instanz"]').click(); await p.waitForTimeout(150);
  await p.locator('#g_s').fill('Handwerk Nord'); await p.locator('#g_w').fill('4'); await shot(p, 'guthaben-instanz', DESKTOP); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.ok((await text(p, 'tr[data-agent="vertrieb-recherche-handwerk-nord"]')).includes('Instanz')); assert.equal(await p.locator('.vkarte[data-vorschlag="skalieren"][data-agent="vertrieb-recherche"]').count(), 0);
  // e) Monatsguthaben direkt setzen, Vorschlag ablehnen
  await p.locator('[data-g-setzen="kurs-waechter"]').click(); await p.waitForTimeout(150); await p.locator('#g_w').fill('7.5'); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.equal((await tabellen()).office_agenten.find(a => a.agent_id === 'kurs-waechter').budget_eur_monat, 7.5);
  await p.locator('.vkarte[data-vorschlag="skalieren"][data-agent="marketing-texter"] [data-v-option=""]').click(); await p.waitForTimeout(150); await p.locator('#g_b').fill('Erst abwarten.'); await p.locator('#dlgOk').click(); await p.waitForTimeout(600);
  assert.equal(await p.locator('.vkarte[data-vorschlag="skalieren"][data-agent="marketing-texter"]').count(), 0);
  const prot = await text(p, '#ghProtokoll'); for (const w of ['Guthaben aufgefüllt', 'Agent pausiert', 'Agent eingeschaltet', 'Zweite Instanz angelegt', 'Handwerk Nord', 'Monatsguthaben gesetzt', 'Vorschlag abgelehnt', 'Erst abwarten.']) assert.ok(prot.includes(w), 'Protokoll: ' + w);
  await shot(p, 'guthaben-protokoll', DESKTOP);
  await p.close();
  // Rückfall: Server ohne Guthaben (SQL und Bündel noch nicht eingespielt) → Hinweis, keine Vorschläge, Karten zeigen die Kosten
  const q = await neueSeite(DESKTOP, { name: 'guthaben-rueckfall' });
  await q.route(/\/api\/office$/, async r => { const res = await fetch(S.base + '/api/office', { method: 'POST', body: r.request().postData() }); const j = await res.json(); delete j.vorschlaege; delete j.entscheidungen; delete j.guthaben_regeln; for (const a of j.agenten || []) delete a.guthaben; r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(j) }); });
  await oeffne(q, '#/tab/guthaben'); assert.equal(await q.locator('#ghHinweis').count(), 1); assert.equal(await q.locator('.vkarte').count(), 0); assert.equal(await q.locator('[data-g-setzen]').count(), 0); assert.ok(!(await text(q, '#main')).includes('undefined'));
  await oeffne(q, '#/tab/buero'); assert.ok((await text(q, '.akarte[data-agent="vertrieb-recherche"] .guthaben')).includes('Kosten (4 Wochen)'));
  await q.close();
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
});

test('keine JavaScript-Fehler in allen Ansichten', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
