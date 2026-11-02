// Browser-Anbindung für den Browsertest: Playwright (lokal, global oder im Projekt installiert), sonst puppeteer-core aus package.json.
// Chromium: Playwright bringt es mit; für puppeteer-core den Pfad in CHROME_PFAD setzen (z. B. /opt/pw-browsers/chromium oder /usr/bin/chromium).
// Die Tests nutzen nur Methoden, die beide Bibliotheken gleich haben (goto, evaluate, $eval, $$eval, click, screenshot, on).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function lade(name) {
  const kandidaten = [process.cwd() + '/'];
  try { kandidaten.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {}
  for (const k of kandidaten) { try { return createRequire(k)(name); } catch (e) {} }
  try { return createRequire(import.meta.url)(name); } catch (e) {}
  return null;
}

export async function browserStarten() {
  const pw = lade('playwright');
  if (pw) {
    const b = await pw.chromium.launch();
    return { art: 'playwright', async seite(viewport, init) { const ctx = await b.newContext({ viewport, locale: 'de-DE', timezoneId: 'Europe/Berlin' }); if (init) await ctx.addInitScript(init); const p = await ctx.newPage(); return p; }, close: () => b.close() };
  }
  const pp = lade('puppeteer-core');
  if (pp) {
    const pfad = process.env.CHROME_PFAD || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
    if (!pfad) return null;
    const b = await pp.launch({ executablePath: pfad, headless: true, args: ['--no-sandbox'] });
    return { art: 'puppeteer', async seite(viewport, init) { const p = await b.newPage(); await p.setViewport(viewport); if (init) await p.evaluateOnNewDocument(init); return anpassen(p); }, close: () => b.close() };
  }
  return null;
}

// Puppeteer: „networkidle“ heißt dort „networkidle0“, waitForTimeout gibt es ab Version 22 nicht mehr.
function anpassen(p) {
  const gotoAlt = p.goto.bind(p);
  p.goto = (url, opts) => gotoAlt(url, opts && opts.waitUntil === 'networkidle' ? { ...opts, waitUntil: 'networkidle0' } : opts);
  if (!p.waitForTimeout) p.waitForTimeout = ms => new Promise(r => setTimeout(r, ms));
  return p;
}
