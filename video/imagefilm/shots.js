// Screenshots der Kursseiten (öffentlich auf GitHub Pages)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const base = 'https://flowtimotion-cyber.github.io/N8N-Automation/';
  const list = [['hub', base], ['m11', base + 'modul-1-1/'], ['m12', base + 'modul-1-2/'], ['com', base + 'community/']];
  for (const [n, u] of list) {
    try { await p.goto(u, { waitUntil: 'networkidle', timeout: 30000 }); await p.waitForTimeout(1500);
      await p.screenshot({ path: `shot_${n}.png`, fullPage: true }); console.log('ok', n); } catch (e) { console.log('fail', n, e.message); }
  }
  await b.close();
})();
