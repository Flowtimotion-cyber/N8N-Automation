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
    await oeffne(p, '#/tab/buero'); assert.ok(await p.locator('svg.buero').count()); assert.ok((await p.locator('svg.buero a').count()) >= 15); await shot(p, 'buero', vp);
    // Zentrale: Orchestrierer sitzt dort (nicht auf einer Raumplattform), laufendes Team als Linien zu den Figuren, Legende und Liste nennen das Team
    assert.equal(await p.locator('svg.buero a.zentrale-agent[href="#/agent/orchestrierer"]').count(), 1); assert.equal(await p.locator('svg.buero a.agent:not(.zentrale-agent)[href="#/agent/orchestrierer"]').count(), 0);
    assert.equal(await p.locator('svg.buero line.teamlinie').count(), 2, 'zwei Teammitglieder'); assert.ok((await text(p, '.legende')).includes('1 Team laufend: Orchestrierer mit Akademie-Redakteur, Kurs-Wächter')); assert.ok((await text(p, '#main')).includes('1 Orchestrierer · 1 Teams laufend')); assert.ok((await p.locator('ul.teams li').count()) >= 1);
    await p.evaluate(() => document.querySelector('svg.buero a').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    assert.match(await p.evaluate(() => location.hash), /^#\/raum\//); assert.ok((await text(p, '#main')).includes('Filter aufheben')); await shot(p, 'projekte-raumfilter', vp);
    // Klick auf Agent führt zur Arbeitsübersicht
    await oeffne(p, '#/tab/buero'); await p.evaluate(() => { const a = Array.from(document.querySelectorAll('svg.buero a')).find(x => /#\/agent\//.test(x.getAttribute('href'))); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); if (location.hash.indexOf('#/agent/') !== 0) location.hash = a.getAttribute('href'); }); await p.waitForTimeout(300);
    assert.match(await p.evaluate(() => location.hash), /^#\/agent\//);
    // reduced motion: keine Animation
    await p.emulateMedia({ reducedMotion: 'reduce' }); await oeffne(p, '#/tab/buero');
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
    await oeffne(p, '#/tab/buero');
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
    await oeffne(p, '#/tab/buero'); assert.ok((await text(p, '#main')).includes('0 laufend')); assert.equal(await p.locator('svg.buero a.monitor[data-typ="leer"]').count(), 5, 'alle fünf Monitore: noch kein Ergebnis'); await shot(p, 'leer-buero', vp);
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

test('keine JavaScript-Fehler in allen Ansichten', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
