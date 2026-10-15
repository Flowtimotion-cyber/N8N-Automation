// node cap.js <scene> <seconds> <outdir> [shots] [transparent]
const { chromium } = require('playwright');
(async () => {
  const [scene, secs, out, shots = '', transp = ''] = process.argv.slice(2);
  const fs = require('fs'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.cwd() + '/scenes.html?s=' + scene + '&shots=' + encodeURIComponent(shots));
  await p.evaluate(() => document.fonts.ready);
  if (shots) await p.evaluate(async (l) => { await Promise.all(l.split(',').map(s => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = s; }))); }, shots);
  const n = Math.round(Number(secs) * 30);
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => window.seek(t), f / 30);
    if (shots) await p.waitForFunction(() => { const i = document.getElementById('shot'); return !i || i.complete; });
    await p.screenshot({ path: `${out}/f${String(f).padStart(5, '0')}.png`, omitBackground: !!transp });
  }
  await b.close();
})();
