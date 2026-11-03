#!/usr/bin/env node
// TESTSERVER für die Pilot-Oberfläche (keine Produktivdaten, keine npm-Abhängigkeiten, nur Node ab Version 18).
// Liefert portal-pilot/frontend/ und portal-pilot/config/ aus und beantwortet die Portal-API mit dem ECHTEN Code des n8n-Workflows
// (portal-pilot/n8n/portal-api.workflow.json, siehe dev/portal-api.mjs). Zwei Betriebsarten für die Daten:
//
//   (a) Speicher:  node portal-pilot/dev/server.mjs                       Tabellen im Speicher aus dev/testdaten.mjs, kein Postgres
//   (b) Postgres:  node portal-pilot/dev/server.mjs --postgres pilot_dev --neu
//                  echter lokaler PostgreSQL: --neu legt die Datenbank neu an und spielt supabase/001…003, 900, 100, 120 ein (psql nötig)
//
//   http://127.0.0.1:8790/frontend/#z=<Testcode>     die Oberfläche (Codes stehen beim Start in der Ausgabe)
//   GET  /config/mandant.js                          Test-Konfiguration: wie mandant.example.json, aber n8n_basis_url zeigt auf diesen Server
//   POST /webhook/<KUERZEL>/portal-api               Portal-API { token, aktion, daten } (Body als text/plain oder application/json, wie n8n)
//   GET  /api/test/zustand                           für Tests: Betriebsart, Zugangscodes, Zähler, alle Tabellen
//   POST /api/test/reset                             Daten zurücksetzen (Speicher: neu aus testdaten.mjs; Postgres: Datenbank neu anlegen)
//   POST /api/test/einstellung { schluessel, wert }  team_einstellung_setzen (z. B. Modul einschalten)
//   Jeder andere Aufruf unter /webhook/ wird gezählt und mit 404 beantwortet (so prüfen die Tests, dass ausgeschaltete Register nichts aufrufen).
//
// --an schaltet zusätzliche Register ein (Komma-Liste, z. B. --an social,arbeitszeit): in der Test-Konfiguration (register) UND als Modul auf
//   dem Server (Einstellung „module“: arbeitszeit→zeit, social→social, systeme→system, kurs→kurs). mandant.js im Repo bleibt unberührt.
// Weitere Schalter: --port 8790, --host 127.0.0.1, --kuerzel PILOTKUERZEL, --still
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDaten, TOKENS } from './testdaten.mjs';
import { portalApi, workflow } from './portal-api.mjs';
import { SpeicherRest, PostgresRest } from './postgrest.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');                       // portal-pilot/
const arg = (name, std) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : std; };
const PORT = Number(arg('port', process.env.PORT || 8790));
const HOST = arg('host', '127.0.0.1');
const KUERZEL = arg('kuerzel', 'PILOTKUERZEL').replace(/[^\w-]/g, '');
const AN = arg('an', '').split(',').map(x => x.trim()).filter(Boolean);
const STILL = process.argv.includes('--still');
const POSTGRES = process.argv.includes('--postgres') ? arg('postgres', 'pilot_dev') : '';
const NEU = process.argv.includes('--neu');
const MODUL_VON_REGISTER = { arbeitszeit: 'zeit', social: 'social', systeme: 'system', kurs: 'kurs' };

const treffer = {};                                        // Zähler je Webhook-Pfad (für die Tests)
const zaehle = pfad => { treffer[pfad] = (treffer[pfad] || 0) + 1; };
let welt;                                                  // { art, rest, T? , tokens() }

async function weltAnlegen() {
  const module = {}; for (const r of AN) if (MODUL_VON_REGISTER[r]) module[MODUL_VON_REGISTER[r]] = true;
  if (POSTGRES) {
    const pg = await import('./postgres.mjs');
    if (!pg.psqlDa()) throw new Error('Kein PostgreSQL erreichbar (psql -d ' + pg.ADMIN_DB + '). Für die Betriebsart Postgres muss ein lokaler Postgres laufen.');
    const rest = NEU || !welt ? await pg.datenbankAnlegen(POSTGRES) : welt.rest;
    if (Object.keys(module).length) await rest.anfrage('POST', 'rpc/team_einstellung_setzen', { p_schluessel: 'module', p_wert: module });
    const tabellen = ['team_einstellungen', 'team_mitglieder', 'team_projekte', 'team_aufgaben', 'team_aufgaben_verlauf', 'team_notizen', 'team_notiz_versionen', 'team_vorschlaege', 'team_systeme', 'team_papierkorb', 'team_zeiten', 'team_abrechnung', 'team_social'];
    return { art: 'postgres', db: POSTGRES, rest, tokens: () => pg.tokensLesen(POSTGRES), tabellen: () => Object.fromEntries(tabellen.map(t => [t, rest.tabelle(t)])) };
  }
  const T = testDaten();
  if (Object.keys(module).length) T.team_einstellungen.find(e => e.schluessel === 'module').wert = Object.assign({ zeit: false, social: false, system: false, kurs: false }, module);
  const rest = new SpeicherRest(T);
  return { art: 'speicher', rest, T, tokens: () => Object.fromEntries(T.team_mitglieder.map(m => [m.mitglied_id, m.token])), tabellen: () => T };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };
const KOPF = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Testserver': '1' };
const json = (res, code, obj) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, KOPF)); res.end(JSON.stringify(obj)); };
const rohBody = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); }); req.on('end', () => ok(s)); });

/** Test-Konfiguration: die Vorlage aus config/mandant.example.json, Adressen auf diesen Server umgebogen, Register per --an ergänzt. */
function testKonfig(host) {
  const k = JSON.parse(readFileSync(join(WURZEL, 'config', 'mandant.example.json'), 'utf8'));
  k.n8n_basis_url = 'http://' + host + '/webhook/' + KUERZEL;
  k.portal_url = 'http://' + host + '/frontend/';
  for (const r of AN) if (r in k.register) k.register[r] = true;
  return k;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST + ':' + PORT));
  try {
    if (url.pathname.startsWith('/webhook/')) {
      const ziel = url.pathname.slice('/webhook/'.length);
      zaehle(ziel);
      if (req.method !== 'POST') return json(res, 405, { ok: false, fehler: 'Nur POST.' });
      if (ziel !== KUERZEL + '/portal-api') return json(res, 404, { ok: false, fehler: 'Diese Schnittstelle gibt es im Testserver nicht: ' + ziel });
      const roh = await rohBody(req);
      // Wie n8n: bei application/json kommt der Body als Objekt an, sonst als Text (der Code prüft beides)
      let body = roh;
      if (/application\/json/i.test(req.headers['content-type'] || '')) { try { body = JSON.parse(roh); } catch (e) { return json(res, 400, { ok: false, fehler: 'Ungültiges JSON.' }); } }
      const r = await portalApi(welt.rest, body, req.headers);
      return json(res, r.code, r.antwort);
    }
    if (url.pathname === '/api/test/zustand') return json(res, 200, { ok: true, jetzt: new Date().toISOString(), betriebsart: welt.art, kuerzel: KUERZEL, an: AN, tokens: welt.tokens(), treffer, tabellen: welt.tabellen() });
    if (url.pathname === '/api/test/reset') { if (req.method !== 'POST') return json(res, 405, { ok: false }); welt = await weltAnlegen(); for (const k of Object.keys(treffer)) delete treffer[k]; return json(res, 200, { ok: true, betriebsart: welt.art }); }
    if (url.pathname === '/api/test/einstellung') {
      if (req.method !== 'POST') return json(res, 405, { ok: false });
      let b; try { b = JSON.parse(await rohBody(req)); } catch (e) { return json(res, 400, { ok: false, fehler: 'Ungültiges JSON.' }); }
      const r = await welt.rest.anfrage('POST', 'rpc/team_einstellung_setzen', { p_schluessel: String(b.schluessel || ''), p_wert: b.wert === undefined ? null : b.wert });
      return json(res, r.statusCode, r.json);
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, fehler: 'Unbekannter Pfad.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, fehler: 'Methode nicht erlaubt.' });
    if (url.pathname === '/') { res.writeHead(302, { Location: '/frontend/' }); return res.end(); }
    if (url.pathname === '/config/mandant.js') {
      const inhalt = '// Test-Konfiguration des Testservers (nicht die Datei im Repo). Vorlage: config/mandant.example.json\nwindow.MANDANT = ' + JSON.stringify(testKonfig(req.headers.host || (HOST + ':' + PORT)), null, 2) + ';\n';
      res.writeHead(200, Object.assign({ 'Content-Type': MIME['.js'] }, KOPF)); return res.end(req.method === 'HEAD' ? undefined : inhalt);
    }
    // Statische Dateien: nur frontend/ und config/
    let pfad = decodeURIComponent(url.pathname);
    if (!/^\/(frontend|config)(\/|$)/.test(pfad)) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, KOPF)); return res.end('Nicht gefunden: ' + pfad); }
    if (pfad.endsWith('/')) pfad += 'index.html';
    const datei = normalize(join(WURZEL, pfad));
    if (!datei.startsWith(WURZEL)) { res.writeHead(403); return res.end(); }
    let st; try { st = await stat(datei); } catch (e) { st = null; }
    if (st && st.isDirectory()) { res.writeHead(302, { Location: url.pathname + '/' }); return res.end(); }
    if (!st) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, KOPF)); return res.end('Nicht gefunden: ' + pfad); }
    const inhalt = await readFile(datei);
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[extname(datei)] || 'application/octet-stream' }, KOPF));
    res.end(req.method === 'HEAD' ? undefined : inhalt);
  } catch (e) {
    json(res, 500, { ok: false, fehler: 'Testserver-Fehler: ' + e.message });
  }
});

try { welt = await weltAnlegen(); workflow(); } catch (e) { console.error('Testserver kann nicht starten: ' + e.message); process.exit(1); }
server.listen(PORT, HOST, () => {
  if (STILL) return;
  const basis = 'http://' + HOST + ':' + PORT;
  console.log('TESTSERVER Pilot-Portal (synthetische Daten „Musterfirma“, keine Produktivdaten)');
  console.log('Betriebsart: ' + (welt.art === 'postgres' ? 'Postgres (Datenbank ' + welt.db + ', Migrationen aus supabase/)' : 'Speicher (dev/testdaten.mjs)') + ' · API-Code: ' + workflow().name + ' (n8n/portal-api.workflow.json)');
  console.log('Oberfläche:  ' + basis + '/frontend/');
  console.log('Portal-API:  POST ' + basis + '/webhook/' + KUERZEL + '/portal-api');
  if (AN.length) console.log('Zusätzlich eingeschaltete Register (Konfig und Modul): ' + AN.join(', '));
  console.log('Zugänge (Testcodes, nur hier gültig):');
  const namen = Object.fromEntries((welt.tabellen().team_mitglieder || []).map(m => [m.mitglied_id, m.name + ' (' + m.rolle + (m.status !== 'aktiv' ? ', ' + m.status : '') + ')']));
  for (const [id, tok] of Object.entries(welt.tokens())) console.log('  ' + (namen[id] || id).padEnd(32) + basis + '/frontend/#z=' + tok);
  console.log('Beenden mit Strg+C.');
});
export { server, TOKENS };
