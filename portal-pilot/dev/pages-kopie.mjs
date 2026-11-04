#!/usr/bin/env node
// Kopiert die Pilot-Oberfläche samt Konfiguration in einen Ordner, den GitHub Pages ausliefert.
// Aufruf: node portal-pilot/dev/pages-kopie.mjs --ziel docs/pilot --n8n https://…/webhook/dev --portal https://…/pilot/frontend/ [--firma "Musterfirma GmbH"] [--kurzname Musterfirma]
// Es wird nichts im Paket verändert; der Zielordner wird neu geschrieben.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const paket = resolve(hier, '..');
const arg = (name, std) => { const i = process.argv.indexOf('--' + name); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : std; };
const ziel = resolve(arg('ziel', ''));
const n8n = arg('n8n', '');
const portal = arg('portal', '');
if (!ziel || !n8n || !portal) { console.error('Bitte --ziel, --n8n (Webhook-Basis ohne /portal-api) und --portal (Adresse der Oberfläche) angeben.'); process.exit(1); }
if (!/^https:\/\//.test(n8n) || !/^https:\/\//.test(portal)) { console.error('n8n- und Portal-Adresse müssen mit https:// beginnen.'); process.exit(1); }

const vorlage = JSON.parse(readFileSync(join(paket, 'config', 'mandant.example.json'), 'utf8'));
const konfig = { ...vorlage, firma: arg('firma', vorlage.firma), kurzname: arg('kurzname', vorlage.kurzname), n8n_basis_url: n8n.replace(/\/$/, ''), portal_url: portal.endsWith('/') ? portal : portal + '/' };

if (existsSync(ziel)) rmSync(ziel, { recursive: true, force: true });
mkdirSync(join(ziel, 'config'), { recursive: true });
cpSync(join(paket, 'frontend'), join(ziel, 'frontend'), { recursive: true });
writeFileSync(join(ziel, 'config', 'mandant.js'), '// Erzeugt von portal-pilot/dev/pages-kopie.mjs. Nicht von Hand ändern, sondern das Skript erneut ausführen.\nwindow.MANDANT = ' + JSON.stringify(konfig, null, 2) + ';\n');
writeFileSync(join(ziel, 'README.md'), '# Pilot-Oberfläche (Kopie für GitHub Pages)\n\nErzeugt von `portal-pilot/dev/pages-kopie.mjs`. Quelle ist `portal-pilot/frontend/`; Änderungen dort machen und das Skript erneut ausführen.\n\n- Oberfläche: `frontend/index.html`\n- Konfiguration: `config/mandant.js` (Firma, Adressen, Register)\n- Backend: n8n-Webhook `' + konfig.n8n_basis_url + '/portal-api`\n');
console.log('Kopie geschrieben nach', ziel);
console.log('Oberfläche:', konfig.portal_url, '| n8n:', konfig.n8n_basis_url);
