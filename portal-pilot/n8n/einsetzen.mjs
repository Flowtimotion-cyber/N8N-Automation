#!/usr/bin/env node
// Setzt die Platzhalter in den Pilot-Workflows ein und schreibt fertige Importdateien.
// Keine Abhängigkeiten, läuft mit Node 18 oder neuer.
//
// Beispiel:
//   node portal-pilot/n8n/einsetzen.mjs --supabase abcdefghijklmnop --kuerzel ifa \
//        --origin https://portal.beispiel.de --ausgabe fertig/ifa/
//
// Pflicht:
//   --supabase  Projekt-ID des Supabase-Projekts (der Teil vor ".supabase.co"); die ganze Adresse geht auch
//   --kuerzel   kurzes Kürzel des Kunden für die Webhook-Adresse (a-z, 0-9, Bindestrich), z. B. ifa
//   --origin    Adresse der Portal-Seite OHNE Pfad, z. B. https://portal.beispiel.de
//   --ausgabe   Ordner für die fertigen Dateien (wird angelegt)
// Optional:
//   --portal-url  volle Adresse des Portals (für den Link in E-Mails); ohne Angabe wird --origin genommen
//   --absender    Absender-Adresse für die E-Mail-Knoten; ohne Angabe bleibt ein erkennbarer Dummy stehen
//                 (die E-Mail-Knoten sind in den Vorlagen ausgeschaltet)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));

function hilfe(code = 0) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(z => z.startsWith('//')).map(z => z.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}

const args = {};
const roh = process.argv.slice(2);
if (!roh.length || roh.includes('--help') || roh.includes('-h')) hilfe(roh.length ? 0 : 1);
for (let i = 0; i < roh.length; i++) {
  const a = roh[i];
  if (!a.startsWith('--')) { console.error('Unbekanntes Argument: ' + a); hilfe(1); }
  const k = a.slice(2);
  const v = roh[i + 1];
  if (v === undefined || v.startsWith('--')) { console.error('Zu --' + k + ' fehlt ein Wert.'); process.exit(1); }
  args[k] = v; i++;
}
for (const k of Object.keys(args)) if (!['supabase', 'kuerzel', 'origin', 'ausgabe', 'portal-url', 'absender'].includes(k)) { console.error('Unbekannte Option: --' + k); hilfe(1); }
for (const k of ['supabase', 'kuerzel', 'origin', 'ausgabe']) if (!args[k]) { console.error('Pflichtangabe fehlt: --' + k); hilfe(1); }

// --- Eingaben prüfen und bereinigen ---
let projekt = args.supabase.trim().replace(/^https?:\/\//i, '').replace(/\.supabase\.co.*$/i, '').replace(/\/.*$/, '');
if (!/^[a-z0-9]{8,40}$/.test(projekt)) { console.error('--supabase sieht nicht wie eine Supabase-Projekt-ID aus (nur Kleinbuchstaben und Ziffern, z. B. abcdefghijklmnop): ' + args.supabase); process.exit(1); }
const kuerzel = args.kuerzel.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(kuerzel)) { console.error('--kuerzel: 2 bis 30 Zeichen, nur a-z, 0-9 und Bindestrich, z. B. ifa'); process.exit(1); }
let origin = args.origin.trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^\s/]+$/i.test(origin)) { console.error('--origin muss eine Adresse ohne Pfad sein, z. B. https://portal.beispiel.de (nicht: ' + args.origin + ')'); process.exit(1); }
if (/^http:\/\//i.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) console.warn('Hinweis: --origin ohne https. Das geht nur zum Testen auf dem eigenen Rechner.');
const portalUrl = (args['portal-url'] || origin).trim();
if (!/^https?:\/\/\S+$/i.test(portalUrl)) { console.error('--portal-url muss mit https:// beginnen.'); process.exit(1); }
const absender = (args.absender || '').trim();
if (absender && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(absender)) { console.error('--absender ist keine gültige E-Mail-Adresse.'); process.exit(1); }

const ersetzungen = [
  ['HIER_SUPABASE_PROJEKT', projekt],
  ['PILOTKUERZEL', kuerzel],
  ['HIER_PORTAL_ORIGIN', origin],
  ['HIER_PORTAL_URL', portalUrl],
  ['HIER_ABSENDER_EMAIL', absender || 'absender@bitte-eintragen.invalid'],
];
const tief = (x) => {
  if (typeof x === 'string') { let s = x; for (const [von, nach] of ersetzungen) s = s.split(von).join(nach); return s; }
  if (Array.isArray(x)) return x.map(tief);
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = tief(v); return o; }
  return x;
};

const dateien = fs.readdirSync(hier).filter(f => f.endsWith('.workflow.json')).sort();
if (!dateien.length) { console.error('Keine *.workflow.json neben dem Skript gefunden.'); process.exit(1); }

const ausgabe = path.resolve(args.ausgabe);
fs.mkdirSync(ausgabe, { recursive: true });

let fehler = 0;
for (const f of dateien) {
  const w = JSON.parse(fs.readFileSync(path.join(hier, f), 'utf8'));
  for (const k of ['name', 'nodes', 'connections', 'settings']) if (!(k in w)) { console.error(f + ': Feld "' + k + '" fehlt.'); fehler++; }
  const fertig = tief(w);
  fertig.name = fertig.name + ' [' + kuerzel + ']';
  const text = JSON.stringify(fertig, null, 2) + '\n';
  // Kontrolle: darf kein Platzhalter mehr drinstehen
  const rest = text.match(/HIER_[A-Z_]+|PILOTKUERZEL/g);
  if (rest) { console.error(f + ': Platzhalter übrig: ' + [...new Set(rest)].join(', ')); fehler++; continue; }
  // Kontrolle: keine fremde Supabase-Adresse
  const fremd = [...text.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/g)].map(m => m[1]).filter(p => p !== projekt);
  if (fremd.length) { console.error(f + ': fremde Supabase-Adresse gefunden: ' + [...new Set(fremd)].join(', ')); fehler++; continue; }
  fs.writeFileSync(path.join(ausgabe, f), text, 'utf8');
  console.log('geschrieben: ' + path.join(ausgabe, f));
}

if (fehler) { console.error('\nEs gab ' + fehler + ' Problem(e). Die betroffenen Dateien wurden NICHT geschrieben.'); process.exit(1); }
console.log('\nFertig. Webhook-Pfad der Portal-API: ' + kuerzel + '/portal-api');
console.log('Trage in der Oberfläche n8n_basis_url = https://DEINE-INSTANZ.app.n8n.cloud/webhook/' + kuerzel + ' ein.');
if (!absender) console.log('Hinweis: Kein --absender angegeben. In den (ausgeschalteten) E-Mail-Knoten steht ein Dummy; vor dem Einschalten die echte Absender-Adresse eintragen.');
