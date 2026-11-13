import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ADS_ROLLEN, ADS_CACHE_MS, ADS_VERALTET_MAX_MS, tageBegrenzen, kennzahlenLesen, adsAnfrage, adsAntwort } from '../lib/kennzahlen.js';
import { werbungMuster, werbungAntwortMock, werbungZustand } from '../dev/mock.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (...p) => readFileSync(join(REPO, ...p), 'utf8').replace(/\r\n/g, '\n');
const T0 = Date.parse('2026-11-13T09:00:00Z');
const timo = { mitglied_id: 'm_timo', rolle: 'admin', status: 'aktiv', typ: 'mensch', token: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a01' };
const murat = { mitglied_id: 'm_murat', rolle: 'vertrieb', status: 'aktiv', typ: 'mensch', token: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a04' };

test('Zeitraum: 1 bis 90 Tage, ohne brauchbare Angabe 7', () => {
  assert.deepEqual([7, 14, 30, 1, 90].map(tageBegrenzen), [7, 14, 30, 1, 90]);
  assert.deepEqual([undefined, null, '', 'abc', 0, NaN, {}, Infinity].map(tageBegrenzen), [7, 7, 7, 7, 7, 7, 7, 7]);
  assert.deepEqual([-5, 91, 100000, '14', 14.9, '30; drop'].map(tageBegrenzen), [1, 90, 90, 14, 14, 7]);
});

test('Rechte: nur aktive Mitglieder mit erlaubter Rolle', () => {
  assert.equal(adsAnfrage(null, {}, {}, T0).code, 401);
  assert.equal(adsAnfrage({ ...timo, status: 'gesperrt' }, {}, {}, T0).code, 401);
  assert.equal(adsAnfrage({ ...timo, status: 'eingeladen' }, {}, {}, T0).code, 403);
  for (const rolle of ['dozent', 'vertrieb', 'team', 'agent', '', undefined]) {
    if (ADS_ROLLEN.includes(rolle)) continue;
    const r = adsAnfrage({ ...timo, rolle }, {}, {}, T0);
    assert.equal(r.code, 403, 'Rolle ' + rolle); assert.equal(r.antwort.ok, false);
  }
  assert.deepEqual(adsAnfrage(timo, { tage: 400 }, {}, T0), { aktion: 'abrufen', tage: 90 });
  assert.deepEqual(adsAnfrage(timo, null, {}, T0), { aktion: 'abrufen', tage: 7 });
});

test('Antwort der Quelle: Felder bleiben, kosten_pro_lead und cpc dürfen null sein, Unbekanntes fällt weg', () => {
  const m = werbungMuster('standard', 7, T0);
  const d = kennzahlenLesen(m);
  assert.deepEqual(Object.keys(d), ['kampagne', 'zeitraum_tage', 'seit', 'stand', 'waehrung', 'hinweis', 'gesamt', 'situationen']);
  assert.deepEqual(Object.keys(d.gesamt), ['impressionen', 'klicks', 'ctr', 'kosten', 'cpc', 'besuche', 'video_start', 'check_start', 'leads', 'termin_geoeffnet', 'kosten_pro_lead', 'situationen_mit_impressionen']);
  assert.deepEqual(Object.keys(d.situationen[0]), ['situation', 'impressionen', 'klicks', 'ctr', 'kosten', 'besuche', 'video_start', 'video_50', 'check_start', 'leads', 'ergebnis_angezeigt', 'termin_geoeffnet', 'kosten_pro_lead']);
  assert.deepEqual(d.gesamt, m.gesamt); assert.deepEqual(d.situationen, m.situationen);
  assert.equal(d.situationen.filter(s => s.kosten_pro_lead === null).length, 3, 'Situationen ohne Leads haben keinen Preis pro Lead');

  const ohne = kennzahlenLesen(werbungMuster('ohne-leads', 7, T0));
  assert.equal(ohne.gesamt.kosten_pro_lead, null); assert.ok(ohne.situationen.every(s => s.kosten_pro_lead === null)); assert.ok(ohne.gesamt.kosten > 0);

  const leer = kennzahlenLesen(werbungMuster('leer', 7, T0));
  assert.deepEqual(leer.situationen, []); assert.equal(leer.gesamt.cpc, null); assert.equal(leer.gesamt.kosten_pro_lead, null); assert.equal(leer.gesamt.impressionen, 0);

  const schraeg = kennzahlenLesen(JSON.stringify({ kampagne: 'K', waehrung: 'euro', geheim: 'x', gesamt: { klicks: '12', kosten: 'abc', kosten_pro_lead: '', boese: 1 }, situationen: [{ situation: '<b>x</b>', klicks: null, kosten_pro_lead: 'NaN', extra: 1 }, null, 'text'] }));
  assert.equal(schraeg.waehrung, 'EUR'); assert.equal(schraeg.geheim, undefined); assert.equal(schraeg.gesamt.boese, undefined);
  assert.deepEqual([schraeg.gesamt.klicks, schraeg.gesamt.kosten, schraeg.gesamt.kosten_pro_lead], [12, 0, null]);
  assert.equal(schraeg.situationen.length, 1); assert.equal(schraeg.situationen[0].extra, undefined); assert.equal(schraeg.situationen[0].kosten_pro_lead, null); assert.equal(schraeg.situationen[0].situation, '<b>x</b>');

  for (const kaputt of [null, undefined, '', 'kein json', [], { gesamt: {} }, { situationen: [] }, { gesamt: [], situationen: [] }, { fehler: 'nicht berechtigt' }]) assert.equal(kennzahlenLesen(kaputt), null);
});

test('Zwischenspeicher: fünf Minuten je Zeitraum, danach neuer Abruf', () => {
  const quelle = { statusCode: 200, body: werbungMuster('standard', 7, T0) };
  const r = adsAntwort(quelle, 7, {}, T0);
  assert.equal(r.code, 200); assert.equal(r.antwort.ok, true); assert.equal(r.antwort.aus_cache, false); assert.ok(r.cache[7]);
  const treffer = adsAnfrage(timo, { tage: 7 }, r.cache, T0 + ADS_CACHE_MS - 1);
  assert.equal(treffer.aktion, 'antwort'); assert.equal(treffer.antwort.aus_cache, true); assert.deepEqual(treffer.antwort.gesamt, r.antwort.gesamt);
  assert.equal(adsAnfrage(timo, { tage: 7 }, r.cache, T0 + ADS_CACHE_MS).aktion, 'abrufen', 'nach fünf Minuten abgelaufen');
  assert.equal(adsAnfrage(timo, { tage: 14 }, r.cache, T0 + 1000).aktion, 'abrufen', 'anderer Zeitraum hat eigenen Speicher');
  assert.equal(adsAnfrage(murat, { tage: 7 }, r.cache, T0 + 1000).code === 403 || ADS_ROLLEN.includes('vertrieb'), true, 'der Zwischenspeicher umgeht die Rechteprüfung nicht');
  // höchstens sechs Einträge, die ältesten fallen weg
  let c = {};
  for (let i = 1; i <= 9; i++) c = adsAntwort({ statusCode: 200, body: werbungMuster('standard', i, T0) }, i, c, T0 + i * 1000).cache;
  assert.deepEqual(Object.keys(c).map(Number).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9]);
});

test('Quelle nicht erreichbar: letzter Stand bis 24 Stunden, sonst verständliche Fehlermeldung ohne Einzelheiten', () => {
  const c = adsAntwort({ statusCode: 200, body: werbungMuster('standard', 7, T0) }, 7, {}, T0).cache;
  const alt = adsAntwort({ statusCode: 500, body: { message: 'Error in workflow' } }, 7, c, T0 + 3600000);
  assert.equal(alt.code, 200); assert.equal(alt.antwort.veraltet, true); assert.equal(alt.antwort.aus_cache, true); assert.ok(alt.antwort.situationen.length);
  const zuAlt = adsAntwort({ statusCode: 0, body: null }, 7, c, T0 + ADS_VERALTET_MAX_MS);
  assert.equal(zuAlt.code, 502); assert.equal(zuAlt.antwort.ok, false); assert.match(zuAlt.antwort.fehler, /nicht erreichbar/);
  const abgelehnt = adsAntwort({ statusCode: 401, body: { fehler: 'nicht berechtigt' } }, 7, {}, T0);
  assert.equal(abgelehnt.code, 502); assert.match(abgelehnt.antwort.fehler, /Zugang abgelehnt/); assert.doesNotMatch(JSON.stringify(abgelehnt.antwort), /x-api-key|401/);
  assert.equal(adsAntwort({ statusCode: 200, body: '<html>Wartung</html>' }, 7, {}, T0).code, 502, 'HTTP 200 ohne brauchbaren Inhalt ist kein Erfolg');
});

test('Testadapter: ganzer Ablauf mit Rollen, Szenarien und gezählten Abrufen', () => {
  const M = [timo, murat], Z = werbungZustand();
  assert.equal(werbungAntwortMock({ token: 'nicht-hex' }, M, Z, T0)[0], 401);
  assert.equal(werbungAntwortMock({ token: murat.token }, M, Z, T0)[0], ADS_ROLLEN.includes('vertrieb') ? 200 : 403);
  const [code, a] = werbungAntwortMock({ token: timo.token, daten: { tage: 14 } }, M, Z, T0);
  assert.equal(code, 200); assert.equal(a.zeitraum_tage, 14); assert.equal(a.situationen.length, 6);
  werbungAntwortMock({ token: timo.token, daten: { tage: 14 } }, M, Z, T0 + 60000);
  const abrufe = Z.tage.filter(t => t === 14).length;
  assert.equal(abrufe, 1, 'zweiter Aufruf innerhalb von fünf Minuten kommt aus dem Zwischenspeicher');
});

test('Schlüssel bleibt serverseitig: nichts davon im Portal, n8n-Datei nennt nur den Namen der Zugangsdaten', () => {
  const portal = lies('docs', 'team', 'index.html');
  assert.doesNotMatch(portal, /x-api-key/i, 'Kopfzeile der Quelle kommt im Portal nicht vor');
  assert.doesNotMatch(portal, /ads-kpis/, 'das Portal kennt die Adresse der Quelle nicht');
  assert.match(portal, /const ADS_API = API\.replace\('team-api-v2', 'team-ads'\)/);
  const gen = lies('werbung', 'n8n', 'werbung.workflow.gen.js');
  assert.match(gen, /httpHeaderAuth: newCredential\('Team-Portal KPI'\)/);
  assert.doesNotMatch(gen, /x-api-key\s*['"]?\s*[:=]/i, 'kein Kopfzeilen-Wert in der Workflow-Datei');
  assert.doesNotMatch(gen, /headerParameters|sendHeaders/, 'keine von Hand gesetzten Kopfzeilen');
  assert.match(gen, /allowedOrigins: 'https:\/\/flowtimotion-cyber\.github\.io'/);
});

test('Rollenliste im Portal ist dieselbe wie auf dem Server', () => {
  const m = /const ADS_ROLLEN = (\[[^\]]*\]);/.exec(lies('docs', 'team', 'index.html'));
  assert.ok(m, 'ADS_ROLLEN im Portal gefunden');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), ADS_ROLLEN);
});

test('Generierte n8n-Datei ist aktuell', () => {
  const vorher = lies('werbung', 'n8n', 'werbung.workflow.gen.js');
  execFileSync(process.execPath, [join(REPO, 'werbung', 'n8n', 'bauen-werbung.mjs')], { stdio: 'ignore' });
  assert.equal(lies('werbung', 'n8n', 'werbung.workflow.gen.js'), vorher, 'bitte node werbung/n8n/bauen-werbung.mjs ausführen und die Datei einchecken');
});
