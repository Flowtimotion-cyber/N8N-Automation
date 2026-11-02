#!/usr/bin/env node
// TESTSERVER für die Pilot-Oberfläche (keine Produktivdaten, keine Abhängigkeiten, nur Node ab Version 18).
// Liefert portal-pilot/frontend/ und portal-pilot/config/ aus und bildet die Portal-API mit Musterdaten „Musterfirma“ nach.
//
//   node portal-pilot/dev/server.mjs [--port 8790] [--host 127.0.0.1] [--kuerzel PILOTKUERZEL] [--an social,arbeitszeit]
//
//   http://127.0.0.1:8790/frontend/#z=<Testcode>     die Oberfläche (Codes stehen beim Start in der Ausgabe)
//   GET  /config/mandant.js                          Test-Konfiguration: wie mandant.example.json, aber n8n_basis_url zeigt auf diesen Server
//   POST /webhook/<KUERZEL>/portal-api               Portal-API-Nachbildung { token, aktion, daten }
//   GET  /api/test/zustand, POST /api/test/reset     für Tests: Zustand lesen, Daten zurücksetzen
//   Jeder andere Aufruf unter /webhook/ wird gezählt und mit 404 beantwortet (so prüfen die Tests, dass ausgeschaltete Register nichts aufrufen).
//
// --an schaltet zusätzliche Register in der Test-Konfiguration ein (Komma-Liste, z. B. --an social,arbeitszeit). mandant.js im Repo bleibt unberührt.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDaten, TOKENS } from './testdaten.mjs';
import { portalApi } from './portal-api.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');                       // portal-pilot/
const arg = (name, std) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : std; };
const PORT = Number(arg('port', process.env.PORT || 8790));
const HOST = arg('host', '127.0.0.1');
const KUERZEL = arg('kuerzel', 'PILOTKUERZEL').replace(/[^\w-]/g, '');
const AN = arg('an', '').split(',').map(x => x.trim()).filter(Boolean);
const STILL = process.argv.includes('--still');

let welt = { T: testDaten(), jetzt: () => new Date().toISOString() };
const treffer = {};                                        // Zähler je Webhook-Pfad (für die Tests)
const zaehle = pfad => { treffer[pfad] = (treffer[pfad] || 0) + 1; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };
const KOPF = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Testserver': '1' };
const json = (res, code, obj) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, KOPF)); res.end(JSON.stringify(obj)); };
const body = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ok({ _ungueltig: true }); } }); });

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
      const b = await body(req);
      if (b._ungueltig) return json(res, 400, { ok: false, fehler: 'Ungültiges JSON.' });
      const r = portalApi(welt, b);
      return json(res, r.code, r.antwort);
    }
    if (url.pathname === '/api/test/zustand') return json(res, 200, { ok: true, jetzt: welt.jetzt(), kuerzel: KUERZEL, an: AN, tokens: TOKENS, treffer, tabellen: welt.T });
    if (url.pathname === '/api/test/reset') { if (req.method !== 'POST') return json(res, 405, { ok: false }); welt = { T: testDaten(), jetzt: welt.jetzt }; for (const k of Object.keys(treffer)) delete treffer[k]; return json(res, 200, { ok: true }); }
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

server.listen(PORT, HOST, () => {
  if (STILL) return;
  const basis = 'http://' + HOST + ':' + PORT;
  console.log('TESTSERVER Pilot-Portal (synthetische Daten „Musterfirma“, keine Produktivdaten)');
  console.log('Oberfläche:  ' + basis + '/frontend/');
  console.log('Portal-API:  POST ' + basis + '/webhook/' + KUERZEL + '/portal-api');
  if (AN.length) console.log('Zusätzlich eingeschaltete Register: ' + AN.join(', '));
  console.log('Zugänge (Testcodes, nur hier gültig):');
  for (const m of welt.T.team_mitglieder) console.log('  ' + (m.name + ' (' + m.rolle + ')').padEnd(26) + basis + '/frontend/#z=' + m.token);
  console.log('Beenden mit Strg+C.');
});
export { server };
