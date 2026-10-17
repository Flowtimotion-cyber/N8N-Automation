// Prüft, dass der generierte n8n-Code identisch zur Bibliothek arbeitet und die Import-Datei konsistent ist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buendel, workflowJson } from '../n8n/bauen.mjs';
import { testSpeicher, TOKENS } from '../dev/testdaten.mjs';

test('Bündel entspricht der eingecheckten Datei (bauen.mjs wurde nach Änderungen ausgeführt)', () => {
  assert.equal(buendel(), readFileSync(new URL('../n8n/code/anfrage-pruefen.js', import.meta.url), 'utf8'));
  const code = buendel();
  const json = JSON.parse(readFileSync(new URL('../n8n/office-api.workflow.json', import.meta.url), 'utf8'));
  assert.equal(json.nodes.find(n => n.name === 'Anfrage prüfen').parameters.jsCode, code);
  assert.deepEqual(JSON.parse(JSON.stringify(workflowJson(code))), json);
});
test('Bündel läuft in einer n8n-ähnlichen Sandbox (Webhook-Pfad und Wartungs-Pfad)', () => {
  const { speicher } = testSpeicher({ jetzt: '2026-10-17T10:00:00Z' });
  const D = speicher.schnappschuss();
  const code = buendel();
  const ctx = { $: name => ({ first: () => ({ json: name === 'Office-API' ? { body: JSON.stringify({ token: TOKENS['agent-hermes'], aktion: 'laden' }) } : D }) }) };
  const out = vm.runInNewContext('(function(){' + code + '})()', ctx);
  assert.equal(out[0].json.weiter, 1); assert.equal(out[0].json.antwort.quelle, 'n8n');
  assert.deepEqual(out[0].json.antwort.projekte.map(p => p.name).sort(), ['Akademie-Kurs', 'Verwaltung & Finanzen']);
  const ctx2 = { $: name => { if (name === 'Office-API') throw new Error('Referenced node is unexecuted'); return { first: () => ({ json: D }) }; } };
  const out2 = vm.runInNewContext('(function(){' + code + '})()', ctx2);
  assert.equal(out2[0].json.intern, true); assert.equal(typeof out2[0].json.antwort.geprueft, 'number');
  const ctx4 = { $: name => ({ first: () => ({ json: name === 'Office-API' ? { body: { aktion: 'wartung', intern: true } } : D }) }) };
  const out4 = vm.runInNewContext('(function(){' + code + '})()', ctx4);
  assert.equal(out4[0].json.code, 401, 'intern über den Webhook ist wirkungslos');
  const ctx3 = { $: name => ({ first: () => ({ json: name === 'Office-API' ? { body: { token: 'x'.repeat(32), aktion: 'laden' } } : D }) }) };
  const out3 = vm.runInNewContext('(function(){' + code + '})()', ctx3);
  assert.equal(out3[0].json.weiter, 0); assert.equal(out3[0].json.code, 401);
});
test('Workflow-Datei: keine Zugangsdaten, kein Credential-Bezug außer Typ, Webhook-Pfad office-api, Origin eingeschränkt', () => {
  const txt = readFileSync(new URL('../n8n/office-api.workflow.json', import.meta.url), 'utf8');
  const json = JSON.parse(txt);
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(txt)); assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(txt));
  for (const n of json.nodes) assert.ok(!n.credentials, 'Credential wählt Timo: ' + n.name);
  const wh = json.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  assert.equal(wh.parameters.path, 'office-api'); assert.equal(wh.parameters.options.allowedOrigins, 'https://flowtimotion-cyber.github.io');
  assert.equal(json.settings.saveDataSuccessExecution, 'none');
  for (const [von, v] of Object.entries(json.connections)) for (const ziel of v.main.flat()) assert.ok(json.nodes.some(n => n.name === ziel.node), von + ' → ' + ziel.node);
});
test('Registry in agenten.json und team_office.sql stimmen überein', () => {
  const reg = JSON.parse(readFileSync(new URL('../agenten.json', import.meta.url), 'utf8'));
  const sql = readFileSync(new URL('../../supabase/team_office.sql', import.meta.url), 'utf8');
  for (const a of reg.agenten) assert.ok(sql.includes("('" + a.agent_id + "', '" + a.name.replace(/'/g, "''") + "'"), a.agent_id + ' fehlt in SQL');
  assert.ok(/create or replace function team_laden\(\)/.test(sql)); assert.ok(sql.includes("'office_runs'")); assert.ok(sql.includes('enable row level security'));
  for (const a of reg.agenten) assert.ok(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].includes(a.modell), a.agent_id);
});
