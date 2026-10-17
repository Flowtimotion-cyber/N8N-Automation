// Browser-Anbindung für die Tests: Playwright (global oder lokal installiert), sonst puppeteer-core aus package.json.
// Chromium: Playwright bringt es mit; für puppeteer-core den Pfad in CHROME_PFAD setzen (z. B. /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function lade(name) {
  const kandidaten = [process.cwd() + '/'];
  try { kandidaten.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {}
  for (const k of kandidaten) { try { return createRequire(k)(name); } catch (e) {} }
  return null;
}

export async function browserStarten() {
  const pw = lade('playwright');
  if (pw) {
    const b = await pw.chromium.launch();
    return { art: 'playwright', async seite(viewport) { const ctx = await b.newContext({ viewport, locale: 'de-DE', timezoneId: 'Europe/Berlin' }); const p = await ctx.newPage(); return p; }, close: () => b.close() };
  }
  const pp = lade('puppeteer-core');
  if (pp) {
    const pfad = process.env.CHROME_PFAD || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
    if (!pfad) return null;
    const b = await pp.launch({ executablePath: pfad, headless: true, args: ['--no-sandbox'] });
    return { art: 'puppeteer', async seite(viewport) { const p = await b.newPage(); await p.setViewport(viewport); return anpassen(p); }, close: () => b.close() };
  }
  return null;
}

// Puppeteer-Seite an die wenigen Playwright-Methoden anpassen, die die Tests nutzen.
function anpassen(p) {
  // Playwright sagt „networkidle“, Puppeteer „networkidle0“; waitForTimeout gibt es in Puppeteer 22+ nicht mehr.
  const gotoAlt = p.goto.bind(p);
  p.goto = (url, opts) => gotoAlt(url, opts && opts.waitUntil === 'networkidle' ? { ...opts, waitUntil: 'networkidle0' } : opts);
  if (!p.waitForTimeout) p.waitForTimeout = ms => new Promise(r => setTimeout(r, ms));
  p.locator = sel => ({ first: () => p.locator(sel), textContent: async () => p.$eval(sel, e => e.textContent), count: async () => (await p.$$(sel)).length, click: opts => p.click(sel, opts), fill: v => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v), isVisible: async () => !!(await p.$(sel)) });
  p.emulateMedia = async o => { if (o && o.reducedMotion) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: o.reducedMotion }]); };
  p.route = async (muster, handler) => { await p.setRequestInterception(true); p.on('request', req => { if (muster.test(req.url())) handler({ request: () => ({ postData: () => req.postData(), url: () => req.url() }), fulfill: ({ status, body, contentType }) => req.respond({ status, body, contentType }), continue: () => req.continue() }); else req.continue(); }); };
  p.waitForLoadState = () => p.waitForNetworkIdle({ idleTime: 300 }).catch(() => {});
  return p;
}
