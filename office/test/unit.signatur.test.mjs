import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signiere, pruefeSignatur, ZEITFENSTER_SEK } from '../lib/signatur.js';

const key = 'abc123'.repeat(8), zeit = '2026-10-17T10:00:00.000Z', ms = Date.parse(zeit), nonce = 'n0123456789abcdefghij';
const erg = { status: 'abgeschlossen', zusammenfassung: 'fertig' };
test('gültige Signatur wird angenommen', () => assert.equal(pruefeSignatur({ schluessel: key, zeit, nonce, ergebnis: erg, signatur: signiere(key, zeit, nonce, erg) }, ms + 1000, () => false).ok, true));
test('falscher Schlüssel, verändertes Ergebnis, falsche Nonce werden abgelehnt', () => {
  const sig = signiere(key, zeit, nonce, erg);
  assert.match(pruefeSignatur({ schluessel: 'anders', zeit, nonce, ergebnis: erg, signatur: sig }, ms, () => false).grund, /Signatur/);
  assert.match(pruefeSignatur({ schluessel: key, zeit, nonce, ergebnis: { ...erg, status: 'fehlgeschlagen' }, signatur: sig }, ms, () => false).grund, /Signatur/);
  assert.match(pruefeSignatur({ schluessel: key, zeit, nonce: 'kurz', ergebnis: erg, signatur: sig }, ms, () => false).grund, /Nonce/);
  assert.match(pruefeSignatur({ schluessel: null, zeit, nonce, ergebnis: erg, signatur: sig }, ms, () => false).grund, /Schlüssel/);
});
test('Zeitfenster und Replay', () => {
  const sig = signiere(key, zeit, nonce, erg);
  assert.match(pruefeSignatur({ schluessel: key, zeit, nonce, ergebnis: erg, signatur: sig }, ms + (ZEITFENSTER_SEK + 1) * 1000, () => false).grund, /Zeitfenster/);
  assert.match(pruefeSignatur({ schluessel: key, zeit, nonce, ergebnis: erg, signatur: sig }, ms - (ZEITFENSTER_SEK + 1) * 1000, () => false).grund, /Zeitfenster/);
  assert.match(pruefeSignatur({ schluessel: key, zeit, nonce, ergebnis: erg, signatur: sig }, ms, n => n === nonce).grund, /Replay/);
});
