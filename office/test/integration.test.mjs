// Integrationstests über HTTP gegen den lokalen Testserver (TESTADAPTER). Kein Supabase, kein n8n: siehe TESTBERICHT.md.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serverStarten, post } from './hilfe.mjs';
import { TOKENS } from '../dev/testdaten.mjs';

let S;
before(async () => { S = await serverStarten({ tempo: 0 }); });
after(async () => { await S.stop(); });

const office = (tok, aktion, daten) => post(S.base, '/api/office', { token: tok, aktion, daten: daten || {} });

test('laden als Admin liefert alle Bereiche, als Agent nur die eigenen Projekte (Pflichtprüfung 1 über HTTP)', async () => {
  const a = await office(TOKENS.m_timo, 'laden');
  assert.equal(a.status, 200); assert.equal(a.j.quelle, 'testadapter'); assert.ok(a.j.runs.length >= 10); assert.equal(a.j.projekte.length, 8);
  const h = await office(TOKENS['agent-hermes'], 'laden');
  assert.deepEqual(h.j.projekte.map(p => p.name).sort(), ['Akademie-Kurs', 'Verwaltung & Finanzen']);
  assert.ok(!JSON.stringify(h.j).includes('ausfuehrer_url'));
  const fremd = a.j.runs.find(r => r.projekt === 'Vertrieb Herbst');
  assert.equal((await office(TOKENS['agent-hermes'], 'lebenszeichen', { run_id: fremd.run_id })).status, 403);
});
test('ungültige Zugänge und ungültiges JSON', async () => {
  assert.equal((await office('f'.repeat(32), 'laden')).status, 401);
  assert.equal((await office(TOKENS.m_gesperrt, 'laden')).status, 401);
  assert.equal((await office(TOKENS.m_neu, 'laden')).status, 403);
  const r = await fetch(S.base + '/api/office', { method: 'POST', body: '{kaputt' }); assert.equal(r.status, 400);
  assert.equal((await fetch(S.base + '/api/office')).status, 405);
});
test('Auftrag über HTTP: Idempotenz, Lebenszeichen, Timeout per Zeitsprung, Neustart (Pflichtprüfungen 2 und 3)', async () => {
  const d = { agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'HTTP-Test: langsam, dann Stille', idempotenzschluessel: 'http-test-00001' };
  const r1 = await office(TOKENS.m_kurt, 'auftrag_starten', d); const r2 = await office(TOKENS.m_kurt, 'auftrag_starten', d);
  assert.equal(r1.status, 200); assert.equal(r2.j.wiederholt, true); assert.equal(r1.j.run_id, r2.j.run_id);
  // Testadapter hat übernommen (lebenszeichen) und ein Ereignis gemeldet
  let z = (await fetch(S.base + '/api/test/zustand').then(r => r.json()));
  const run = () => z.tabellen.office_runs.find(x => x.run_id === r1.j.run_id);
  await post(S.base, '/api/test/zeit', { sek: 10 }); z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  assert.equal(run().status, 'in_arbeit');
  // Neustart des Servers (Daten bleiben, Executor-Simulation weg) + 40 Minuten ohne Lebenszeichen → Wartung markiert unbekannt
  await post(S.base, '/api/test/zeit', { sek: 40 * 60 });
  const n = await post(S.base, '/api/test/neustart', {}); assert.equal(n.status, 200);
  z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  assert.equal(run().status, 'unbekannt');
  // verspätete Beendigung über Token-API → bleibt unbekannt
  const sp = await office(TOKENS['agent-claude'], 'run_beenden', { run_id: r1.j.run_id, status: 'abgeschlossen', zusammenfassung: 'zu spät' });
  assert.equal(sp.j.hinweis, 'verspaetet');
  z = await fetch(S.base + '/api/test/zustand').then(r => r.json()); assert.equal(run().status, 'unbekannt');
});
test('Freigabe über HTTP: Entscheidung durch Mensch, Ausführung genau einmal (Pflichtprüfung 2/4)', async () => {
  const r = await office(TOKENS.m_murat, 'auftrag_starten', { agent_id: 'angebots-pruefer', projekt: 'Vertrieb Herbst', auftrag: 'HTTP: Nachfrage per E-Mail an Kunden', idempotenzschluessel: 'http-frei-00001' });
  await post(S.base, '/api/test/zeit', { sek: 10 });
  let z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  const fr = z.tabellen.office_freigaben.find(f => f.run_id === r.j.run_id);
  assert.ok(fr && fr.status === 'offen');
  assert.equal((await office(TOKENS['agent-claude'], 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' })).status, 403);
  assert.equal((await office(TOKENS.m_timo, 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt', begruendung: 'ok' })).status, 200);
  await post(S.base, '/api/test/zeit', { sek: 30 }); await post(S.base, '/api/test/zeit', { sek: 30 });
  z = await fetch(S.base + '/api/test/zustand').then(r => r.json());
  assert.equal(z.ausgefuehrt.filter(x => x.run_id === r.j.run_id).length, 1, 'genau eine simulierte E-Mail');
  assert.equal(z.tabellen.office_freigaben.find(f => f.freigabe_id === fr.freigabe_id).status, 'verwendet');
  assert.equal(z.tabellen.office_runs.find(x => x.run_id === r.j.run_id).status, 'abgeschlossen');
});
test('Portal-Nachbildung /api/team liefert nur laden und keine Tokens', async () => {
  const r = await post(S.base, '/api/team', { token: TOKENS.m_timo, aktion: 'laden' });
  assert.equal(r.status, 200); assert.equal(r.j.testadapter, true); assert.ok(!JSON.stringify(r.j).includes(TOKENS.m_kurt));
  assert.equal((await post(S.base, '/api/team', { token: TOKENS.m_timo, aktion: 'aufgabe_speichern' })).status, 400);
});
test('statische Auslieferung wie GitHub Pages, Pfadschutz', async () => {
  for (const p of ['/office/', '/team/', '/logo_h96.png', '/office/js/app.js', '/N8N-Automation/office/']) assert.equal((await fetch(S.base + p)).status, 200, p);
  assert.equal((await fetch(S.base + '/office/gibtsnicht.js')).status, 404);
  assert.notEqual((await fetch(S.base + '/../package.json')).status, 200);
});
test('Szenario leer: keine Runs, keine Freigaben', async () => {
  await post(S.base, '/api/test/reset', { szenario: 'leer' });
  const a = await office(TOKENS.m_timo, 'laden'); assert.equal(a.j.runs.length, 0); assert.equal(a.j.freigaben.length, 0); assert.ok(a.j.agenten.length > 0);
  await post(S.base, '/api/test/reset', { szenario: 'standard' });
});
