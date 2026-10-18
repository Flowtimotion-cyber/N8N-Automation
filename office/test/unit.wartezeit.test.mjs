// Wartezeit in der Warteschlange je Ausführer: Abholer (Claude Code stündlich 8–20 Uhr, Hermes per Zeitplan) dürfen nicht nach 30 Minuten als „unbekannt“ gelten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fristPruefen, FRISTEN } from '../lib/zustand.js';

const t0 = Date.parse('2026-10-18T21:00:00.000Z');
const run = (ausfuehrer, minuten) => ({ status: 'warteschlange', ausfuehrer, erstellt: new Date(t0).toISOString(), lebenszeichen: null, _jetzt: t0 + minuten * 60000 });
const pruefe = (ausf, min) => { const r = run(ausf, min); return fristPruefen(r, r._jetzt); };

test('n8n und unbekannte Ausführer behalten die kurze Frist von 30 Minuten', () => {
  assert.equal(pruefe('n8n', 29), null);
  assert.equal(pruefe('n8n', 31).nach, 'unbekannt'); assert.match(pruefe('n8n', 31).grund, /30 Minuten/);
  assert.equal(pruefe('codex', 31).nach, 'unbekannt');
  assert.equal(pruefe(undefined, 31).nach, 'unbekannt');
});

test('Claude-Code-Aufträge überstehen die Nacht bis zum nächsten Abholer-Lauf, danach gelten sie als veraltet', () => {
  assert.equal(pruefe('claude-code', 31), null);
  assert.equal(pruefe('claude-code', 12 * 60), null, '12 Stunden: 20 Uhr bis 8 Uhr');
  assert.equal(pruefe('claude-code', 13 * 60 + 30), null);
  assert.equal(pruefe('claude-code', 14 * 60 + 1).nach, 'unbekannt'); assert.match(pruefe('claude-code', 14 * 60 + 1).grund, /14 Stunden/);
});

test('Hermes-Aufträge haben 3 Stunden', () => {
  assert.equal(pruefe('hermes', 31), null); assert.equal(pruefe('hermes', 179), null);
  assert.equal(pruefe('hermes', 181).nach, 'unbekannt'); assert.match(pruefe('hermes', 181).grund, /3 Stunden/);
});

test('Die Frist zählt ab der letzten Zustandsänderung (Freigabe), nicht ab dem Anlegen', () => {
  const r = { status: 'warteschlange', ausfuehrer: 'n8n', erstellt: new Date(t0).toISOString(), lebenszeichen: new Date(t0 + 5 * 3600 * 1000).toISOString() };
  assert.equal(fristPruefen(r, t0 + 5 * 3600 * 1000 + 10 * 60000), null);
  assert.equal(FRISTEN.wartezeit_warteschlange, 30 * 60);
});
