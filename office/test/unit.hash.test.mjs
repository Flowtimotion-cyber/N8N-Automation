import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { sha256, hmacSha256, kanonisch, inhaltsHash, gleich } from '../lib/hash.js';

test('sha256 stimmt mit node:crypto überein (inkl. UTF-8, Blockgrenzen)', () => {
  for (const t of ['', 'abc', 'Ümlaute und Emoji 🤖 '.repeat(30), 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(1000)]) assert.equal(sha256(t), createHash('sha256').update(t).digest('hex'));
});
test('hmacSha256 stimmt mit node:crypto überein (kurze, lange, leere Schlüssel)', () => {
  for (const [k, m] of [['key', 'The quick brown fox'], ['k'.repeat(100), 'lang'], ['', ''], ['ä'.repeat(70), 'ö']]) assert.equal(hmacSha256(k, m), createHmac('sha256', k).update(m).digest('hex'));
});
test('kanonisch sortiert Schlüssel, damit gleicher Inhalt gleichen Hash ergibt', () => {
  assert.equal(kanonisch({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.equal(inhaltsHash('email_senden', { an: 'x', text: 'y' }), inhaltsHash('email_senden', { text: 'y', an: 'x' }));
  assert.notEqual(inhaltsHash('email_senden', { an: 'x', text: 'y' }), inhaltsHash('email_senden', { an: 'x', text: 'y ' }));
  assert.notEqual(inhaltsHash('email_senden', { an: 'x' }), inhaltsHash('post_veroeffentlichen', { an: 'x' }));
});
test('gleich vergleicht in konstanter Länge korrekt', () => { assert.ok(gleich('abc', 'abc')); assert.ok(!gleich('abc', 'abd')); assert.ok(!gleich('abc', 'abcd')); });
