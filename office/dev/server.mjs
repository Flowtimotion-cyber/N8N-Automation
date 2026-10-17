#!/usr/bin/env node
// TESTADAPTER: lokaler Testserver für das KI Office. Kein Produktivsystem.
// Stellt die Office-API (wie der n8n-Workflow „TEAM: Office-API“), die team_laden-Daten und die Portal-API (nur „laden“)
// mit synthetischen Testdaten nach und liefert die statischen Seiten aus docs/ aus.
//
//   node office/dev/server.mjs [--port 8787] [--szenario standard|leer] [--tempo 10] [--host 127.0.0.1]
//
//   http://127.0.0.1:8787/office/?z=<Token>   KI Office   (Tokens: siehe Ausgabe beim Start)
//   http://127.0.0.1:8787/team/               Team-Portal (spricht produktiv mit n8n; lokal nur mit Umleitung im Browsertest)
//   POST /api/office      Office-API  { token, aktion, daten }
//   POST /api/team        Portal-API-Nachbildung (nur aktion laden)
//   GET  /api/test/zustand, POST /api/test/zeit {sek}, POST /api/test/wartung, POST /api/test/neustart, POST /api/test/reset {szenario}
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testSpeicher, TOKENS, tokenVonAgent } from './testdaten.mjs';
import { Speicher, zufallsQuelle } from './speicher.mjs';
import { TestAdapter } from '../adapter/test.js';

const hier = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(hier, '..', '..', 'docs');
const arg = (name, std) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : std; };
const PORT = Number(arg('port', process.env.PORT || 8787));
const HOST = arg('host', '127.0.0.1');
const TEMPO = Number(arg('tempo', 10));          // virtuelle Sekunden je realer Sekunde
let szenario = arg('szenario', 'standard');

let welt = testSpeicher({ szenario });
const WARTUNG_ALLE_SEK = 300;
let naechsteWartung = welt.uhr.ms + WARTUNG_ALLE_SEK * 1000;
const wartung = () => welt.speicher.aufruf({ aktion: 'wartung', intern: true });
function neustart() {
  // Simuliert einen Neustart des Servers: Daten bleiben (wie in Supabase), Skripte der Executor-Simulation gehen verloren.
  const alt = welt.speicher;
  const sp = new Speicher({ tabellen: JSON.parse(JSON.stringify(alt.T)), uhr: welt.uhr, zufall: zufallsQuelle(Date.now() & 0xffff), quelle: 'testadapter' });
  const ad = new TestAdapter({ speicher: sp, uhr: welt.uhr, tokenVon: tokenVonAgent });
  welt = { speicher: sp, adapter: ad, uhr: welt.uhr, runs: welt.runs };
  return wartung();
}
function zeitVor(sek) { welt.uhr.vor(sek); welt.adapter.laufen(); if (welt.uhr.ms >= naechsteWartung) { naechsteWartung = welt.uhr.ms + WARTUNG_ALLE_SEK * 1000; wartung(); welt.adapter.laufen(); } }
if (TEMPO > 0) setInterval(() => zeitVor(0.5 * TEMPO), 500).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Testadapter': '1' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ok({ _ungueltig: true }); } }); });

function portalLaden(tok) {
  // Nachbildung der Portal-API v2 für den lokalen Browsertest: nur Lesen, nur Menschen, nur die Felder, die das Portal braucht.
  const D = welt.speicher.schnappschuss();
  const ich = D.mitglieder.find(m => m.token === tok);
  if (!ich || ich.status === 'gesperrt') return [401, { ok: false, fehler: 'Dein Zugang ist ungültig (Testadapter).' }];
  const ohneToken = m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ, funktion: m.funktion || '', status: m.status, email: '', telefon: '', whatsapp_ok: false, zuletzt_aktiv: '' });
  return [200, { ok: true, ich: { ...ohneToken(ich), email: 'test@example.invalid', stunden_sicht: false }, mitglieder: D.mitglieder.map(ohneToken), projekte: D.projekte, aufgaben: D.aufgaben, verlauf: D.verlauf, notizen: D.notizen,
    social: [], systeme: [], vorschlaege: [], zeiten: [], abrechnung: [], community: [], kurs: { teilnehmende: 0, fragen_7_tage: 0 }, anfragen: [], stand: welt.uhr.iso(), testadapter: true }];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  try {
    if (url.pathname === '/api/office' && req.method === 'POST') {
      const b = await body(req);
      if (b._ungueltig) return json(res, 400, { ok: false, fehler: 'Ungültiges JSON.' });
      const r = welt.speicher.aufruf(b);
      welt.adapter.laufen();
      return json(res, r.code, r.antwort);
    }
    if (url.pathname === '/api/team' && req.method === 'POST') {
      const b = await body(req);
      if (b.aktion !== 'laden') return json(res, 400, { ok: false, fehler: 'Testadapter: Die Portal-API wird hier nur für „laden“ nachgebildet.' });
      const [code, antwort] = portalLaden(String(b.token || ''));
      return json(res, code, antwort);
    }
    if (url.pathname.startsWith('/api/test/')) {
      const was = url.pathname.slice('/api/test/'.length);
      if (was === 'zustand') return json(res, 200, { ok: true, szenario, jetzt: welt.uhr.iso(), tempo: TEMPO, tabellen: welt.speicher.T, externe: welt.speicher.externe, ausgefuehrt: welt.adapter.ausgefuehrt, protokoll: welt.speicher.protokoll.slice(-50), tokens: TOKENS });
      if (req.method !== 'POST') return json(res, 405, { ok: false });
      const b = await body(req);
      if (was === 'zeit') { zeitVor(Math.max(0, Number(b.sek) || 0)); return json(res, 200, { ok: true, jetzt: welt.uhr.iso() }); }
      if (was === 'wartung') { welt.adapter.laufen(); const r = wartung(); return json(res, r.code, r.antwort); }
      if (was === 'neustart') { const r = neustart(); return json(res, 200, { ok: true, wartung: r.antwort }); }
      if (was === 'reset') { szenario = b.szenario === 'leer' ? 'leer' : 'standard'; welt = testSpeicher({ szenario }); naechsteWartung = welt.uhr.ms + WARTUNG_ALLE_SEK * 1000; return json(res, 200, { ok: true, szenario }); }
      return json(res, 404, { ok: false });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 405, { ok: false, fehler: 'Methode nicht erlaubt oder unbekannter Pfad.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, fehler: 'Methode nicht erlaubt.' });
    // Statische Dateien aus docs/ (wie GitHub Pages: /N8N-Automation/ entspricht hier /)
    let pfad = decodeURIComponent(url.pathname.replace(/^\/N8N-Automation/, ''));
    if (pfad.endsWith('/')) pfad += 'index.html';
    const datei = normalize(join(DOCS, pfad));
    if (!datei.startsWith(DOCS)) { res.writeHead(403); return res.end(); }
    let st; try { st = await stat(datei); } catch (e) { st = null; }
    if (st && st.isDirectory()) { res.writeHead(302, { Location: url.pathname + '/' }); return res.end(); }
    if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden: ' + pfad); }
    const inhalt = await readFile(datei);
    res.writeHead(200, { 'Content-Type': MIME[extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : inhalt);
  } catch (e) {
    json(res, 500, { ok: false, fehler: 'Testserver-Fehler: ' + e.message });
  }
});
server.listen(PORT, HOST, () => {
  console.log('TESTADAPTER (keine Produktivdaten) · KI Office läuft auf http://' + HOST + ':' + PORT + '/office/');
  console.log('Szenario: ' + szenario + ' · Tempo: ' + TEMPO + 'x · Zugänge (synthetisch):');
  for (const [k, v] of Object.entries(TOKENS)) console.log('  ' + k.padEnd(14) + ' http://' + HOST + ':' + PORT + '/office/?z=' + v);
});
export { server };
