// Hilfen für die Tests: Testserver auf freiem Port starten, Anfragen an die Portal-API schicken.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const hier = dirname(fileURLToPath(import.meta.url));
export const PILOT = join(hier, '..');          // portal-pilot/
export const REPO = join(hier, '..', '..');
export const KUERZEL = 'PILOTKUERZEL';

export function freierPort() { return new Promise(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }

/** Startet dev/server.mjs als eigenen Prozess. opts.an: zusätzlich eingeschaltete Register (Komma-Liste). */
export async function serverStarten(opts = {}) {
  const port = opts.port || await freierPort();
  const args = [join(PILOT, 'dev', 'server.mjs'), '--port', String(port), '--still'];
  if (opts.an) args.push('--an', opts.an);
  const kind = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; kind.stdout.on('data', d => { log += d; }); kind.stderr.on('data', d => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/test/zustand'); if (r.ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 50)); if (i === 99) throw new Error('Testserver startet nicht: ' + log); }
  return { base, port, api: base + '/webhook/' + KUERZEL + '/portal-api', kind, log: () => log, zustand: () => fetch(base + '/api/test/zustand').then(r => r.json()), reset: () => fetch(base + '/api/test/reset', { method: 'POST' }), stop: () => new Promise(ok => { kind.on('exit', ok); kind.kill(); }) };
}

/** Ein Aufruf der Portal-API wie aus dem Browser: Body als text/plain, Antwort als { status, j }. */
export async function api(S, token, aktion, daten) {
  const r = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ token, aktion, daten: daten || {} }) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
