// Hilfen für die Tests: Testserver auf freiem Port starten (Betriebsart Speicher oder Postgres), Anfragen an die Portal-API schicken.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const hier = dirname(fileURLToPath(import.meta.url));
export const PILOT = join(hier, '..');          // portal-pilot/
export const REPO = join(hier, '..', '..');
export const KUERZEL = 'PILOTKUERZEL';

export function freierPort() { return new Promise(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }

/**
 * Startet dev/server.mjs als eigenen Prozess.
 * opts.an: zusätzlich eingeschaltete Register (Komma-Liste). opts.postgres: Name der Testdatenbank (Betriebsart Postgres, wird neu angelegt).
 * Rückgabe: base, api, zustand(), reset(), einstellung(schluessel, wert), tokens (nach dem Start gelesen), stop().
 */
export async function serverStarten(opts = {}) {
  const port = opts.port || await freierPort();
  const args = [join(PILOT, 'dev', 'server.mjs'), '--port', String(port), '--still'];
  if (opts.an) args.push('--an', opts.an);
  if (opts.postgres) args.push('--postgres', opts.postgres, '--neu');
  const kind = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; kind.stdout.on('data', d => { log += d; }); kind.stderr.on('data', d => { log += d; });
  let beendet = false; kind.on('exit', () => { beendet = true; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 400; i++) {
    if (beendet) throw new Error('Testserver beendet: ' + log);
    try { const r = await fetch(base + '/api/test/zustand'); if (r.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 50)); if (i === 399) throw new Error('Testserver startet nicht: ' + log);
  }
  const S = { base, port, api: base + '/webhook/' + KUERZEL + '/portal-api', kind, log: () => log,
    zustand: () => fetch(base + '/api/test/zustand').then(r => r.json()),
    // Reset legt in der Betriebsart Postgres die Datenbank neu an, die Zugangscodes ändern sich dann: deshalb danach neu lesen
    reset: async () => { const r = await fetch(base + '/api/test/reset', { method: 'POST' }).then(r => r.json()); const z = await S.zustand(); S.tokens = z.tokens; return r; },
    einstellung: (schluessel, wert) => fetch(base + '/api/test/einstellung', { method: 'POST', body: JSON.stringify({ schluessel, wert }) }).then(r => r.json()),
    stop: () => new Promise(ok => { if (beendet) return ok(); kind.on('exit', ok); kind.kill(); }) };
  const z = await S.zustand(); S.tokens = z.tokens; S.betriebsart = z.betriebsart;
  return S;
}

/** Ein Aufruf der Portal-API wie aus dem Browser: Body als text/plain, Antwort als { status, j }. */
export async function api(S, token, aktion, daten) {
  const r = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ token, aktion, daten: daten || {} }) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}

/** Startet agent/feedback.mjs als eigenen Prozess (Umgebung nur PILOT_PORTAL_API und PILOT_AGENT_TOKEN). Rückgabe { code, out, err }. */
export function feedbackWerkzeug(args, umgebung) {
  return new Promise(ok => {
    const env = Object.assign({}, process.env); delete env.PILOT_PORTAL_API; delete env.PILOT_AGENT_TOKEN; Object.assign(env, umgebung || {});
    const kind = spawn(process.execPath, [join(PILOT, 'agent', 'feedback.mjs'), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; kind.stdout.on('data', d => { out += d; }); kind.stderr.on('data', d => { err += d; });
    kind.on('exit', code => ok({ code, out, err }));
  });
}

/** Prüft, ob ein lokaler PostgreSQL erreichbar ist (für Tests, die die Betriebsart Postgres brauchen). */
export async function postgresDa() { const { psqlDa } = await import('../dev/postgrest.mjs'); return psqlDa(); }
