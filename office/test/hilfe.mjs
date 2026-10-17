// Hilfen für Integrations- und Browsertests: Testserver (TESTADAPTER) auf freiem Port starten.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const hier = dirname(fileURLToPath(import.meta.url));
export const REPO = join(hier, '..', '..');

export function freierPort() { return new Promise(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }

export async function serverStarten(opts = {}) {
  const port = opts.port || await freierPort();
  const args = [join(REPO, 'office', 'dev', 'server.mjs'), '--port', String(port), '--tempo', String(opts.tempo ?? 0), '--szenario', opts.szenario || 'standard'];
  const kind = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; kind.stdout.on('data', d => { log += d; }); kind.stderr.on('data', d => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/test/zustand'); if (r.ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 50)); if (i === 99) throw new Error('Testserver startet nicht: ' + log); }
  return { base, port, kind, log: () => log, stop: () => new Promise(ok => { kind.on('exit', ok); kind.kill(); }) };
}

export async function post(base, pfad, body) {
  const r = await fetch(base + pfad, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
