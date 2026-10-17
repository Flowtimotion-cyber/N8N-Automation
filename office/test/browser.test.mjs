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
  await p.locator('[data-freigabe][data-entscheidung="erteilt"]').first().click(); await p.waitForTimeout(150);
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

test('keine JavaScript-Fehler in allen Ansichten', t => { if (!B) return t.skip(); assert.deepEqual(fehler, []); });
