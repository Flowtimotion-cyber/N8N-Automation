// (a) PII- und Markenscan: Nichts unter portal-pilot/ darf Angaben des Anbieters, echte Namen, lange Zahlen oder Schlüssel enthalten.
// Die Wortliste steht hier absichtlich zerlegt, damit diese Datei selbst beim Scan (und bei einem grep) sauber bleibt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { PILOT } from './hilfe.mjs';

const w = (...t) => t.join('');
const WOERTER = [w('mom', 'entum'), w('herm', 'etik'), w('ti', 'mo'), w('ku', 'rt'), w('mu', 'rat'), w('kar', 'sten'), w('lil', 'lien'), w('immo', '-job'), w('q', 'cg'), w('az', 'av'), w('hm-', 'storage'), w('llh', 'wmz'), w('github', '.io'), w('lo', 'om'), w('twe', 'nty'), w('insta', 'gram'), w('flowti', 'motion')];
const MUSTER = [
  ['Zahl mit 9 oder mehr Ziffern (Telefon, Chat-ID, Kundennummer)', /\d{9,}/],
  ['JWT / Supabase-Schlüssel', /eyJ[A-Za-z0-9_-]{10,}/],
  ['API-Schlüssel', /\bsk-[A-Za-z0-9]{8,}/]
];
const TEXT = new Set(['.html', '.js', '.mjs', '.json', '.md', '.svg', '.css', '.txt', '.sql', '.yml', '.yaml']);

function dateien(dir, aus = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n); const st = statSync(p);
    if (st.isDirectory()) { if (n !== 'node_modules' && n !== 'screenshots') dateien(p, aus); }
    else if (TEXT.has(extname(n))) aus.push(p);
  }
  return aus;
}

test('Scan über portal-pilot/: keine Anbieter-Angaben, Namen, langen Zahlen oder Schlüssel', () => {
  const L = dateien(PILOT);
  assert.ok(L.length >= 8, 'Dateien gefunden: ' + L.length);
  const treffer = [];
  for (const p of L) {
    const inhalt = readFileSync(p, 'utf8'); const rel = relative(PILOT, p);
    inhalt.split('\n').forEach((zeile, i) => {
      const klein = zeile.toLowerCase();
      for (const wort of WOERTER) if (klein.includes(wort)) treffer.push(rel + ':' + (i + 1) + ' enthält „' + wort + '“: ' + zeile.trim().slice(0, 100));
      for (const [name, re] of MUSTER) if (re.test(zeile)) treffer.push(rel + ':' + (i + 1) + ' ' + name + ': ' + zeile.trim().slice(0, 100));
    });
  }
  assert.deepEqual(treffer, [], 'Fundstellen:\n' + treffer.join('\n'));
});

test('index.html lädt die Konfiguration und trägt keine feste Webhook- oder Portal-Adresse', () => {
  const html = readFileSync(join(PILOT, 'frontend', 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="../config/mandant.js"></script>'));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(!/n8n\.[a-z0-9-]+\.[a-z]+\/webhook/i.test(html), 'keine feste n8n-Adresse');
  assert.ok(!/https?:\/\/[^'" ]*\/webhook\//.test(html), 'keine feste Webhook-Adresse');
  const extern = [...html.matchAll(/https?:\/\/[^'" <)…]+/g)].map(m => m[0]);
  assert.deepEqual([...new Set(extern)].sort(), ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://wa.me/'], 'nur jsPDF (PDF-Export) und wa.me (Nachricht an ein Teammitglied) als feste Adressen');
});
