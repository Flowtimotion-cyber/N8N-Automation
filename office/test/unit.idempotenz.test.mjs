import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schluesselGueltig, frueherGesehen, merken } from '../lib/idempotenz.js';
test('Schlüsselformat', () => { assert.ok(schluesselGueltig('auftrag-2026-10-17:abc')); assert.ok(!schluesselGueltig('kurz')); assert.ok(!schluesselGueltig('x'.repeat(121))); assert.ok(!schluesselGueltig('mit leerzeichen 123')); });
test('frueherGesehen trennt nach Art', () => {
  const E = [merken({ art: 'auftrag', schluessel: 'k-12345678', run_id: 'r1', antwort: { run_id: 'r1' }, jetzt: 'z' })];
  assert.equal(frueherGesehen(E, 'auftrag', 'k-12345678').antwort.run_id, 'r1');
  assert.equal(frueherGesehen(E, 'aktion', 'k-12345678'), null);
});
