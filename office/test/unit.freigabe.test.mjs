import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freigabeAnfordern, freigabeGueltig, freigabeEntscheiden, brauchtFreigabe, EXTERNE_AKTIONEN } from '../lib/freigabe.js';

const jetzt = '2026-10-17T10:00:00.000Z', ms = Date.parse(jetzt);
const inhalt = { an: 'kunde@example.invalid', betreff: 'Angebot', text: 'Hallo' };
const neu = () => freigabeAnfordern({ freigabe_id: 'f1', run_id: 'r1', aktion: 'email_senden', inhalt, jetzt, angefordert_von: 'agent-claude' });

test('externe Aktionen brauchen Freigabe, andere nicht', () => { assert.ok(brauchtFreigabe('email_senden')); assert.ok(brauchtFreigabe('zahlung_ausloesen')); assert.ok(!brauchtFreigabe('notiz_speichern')); assert.ok(!brauchtFreigabe('__proto__')); assert.equal(EXTERNE_AKTIONEN.zahlung_ausloesen.stufe, 'kritisch'); });
test('offene Freigabe ist nicht gültig; erteilte für denselben Inhalt schon', () => {
  const f = neu();
  assert.equal(freigabeGueltig(f, 'email_senden', inhalt, ms).ok, false);
  Object.assign(f, freigabeEntscheiden(f, 'erteilt', 'm_timo', '', jetzt).row);
  assert.equal(freigabeGueltig(f, 'email_senden', inhalt, ms + 1000).ok, true);
  assert.equal(freigabeGueltig(f, 'email_senden', { ...inhalt, an: 'x' }, ms + 1000).ok, false);   // Reihenfolge der Schlüssel egal, Inhalt nicht
  assert.equal(freigabeGueltig(f, 'email_senden', { text: 'Hallo', betreff: 'Angebot', an: 'kunde@example.invalid' }, ms + 1000).ok, true);
});
test('Pflichtprüfung 4: Änderung nach Freigabe macht die Freigabe ungültig', () => {
  const f = neu(); Object.assign(f, freigabeEntscheiden(f, 'erteilt', 'm_timo', '', jetzt).row);
  const g = freigabeGueltig(f, 'email_senden', { ...inhalt, text: 'Hallo!' }, ms + 1000);
  assert.equal(g.ok, false); assert.equal(g.inhalt_geaendert, true); assert.equal(g.neu_noetig, true);
});
test('Freigabe gilt genau einmal und läuft ab', () => {
  const f = neu(); Object.assign(f, freigabeEntscheiden(f, 'erteilt', 'm_timo', '', jetzt).row);
  f.status = 'verwendet'; assert.match(freigabeGueltig(f, 'email_senden', inhalt, ms + 1000).grund, /schon verwendet/);
  const f2 = neu(); Object.assign(f2, freigabeEntscheiden(f2, 'erteilt', 'm_timo', '', jetzt).row);
  assert.equal(freigabeGueltig(f2, 'email_senden', inhalt, ms + 25 * 3600 * 1000).ok, false);
});
test('Entscheidung nur für offene Freigaben, nur erteilt/abgelehnt', () => {
  const f = neu(); assert.ok(freigabeEntscheiden(f, 'vielleicht', 'm_timo', '', jetzt).fehler);
  Object.assign(f, freigabeEntscheiden(f, 'abgelehnt', 'm_timo', 'Nein', jetzt).row);
  assert.ok(freigabeEntscheiden(f, 'erteilt', 'm_timo', '', jetzt).fehler);
  assert.equal(freigabeGueltig(f, 'email_senden', inhalt, ms).ok, false);
});
test('andere Aktion mit gleichem Inhalt gilt nicht', () => { const f = neu(); Object.assign(f, freigabeEntscheiden(f, 'erteilt', 'm_timo', '', jetzt).row); assert.equal(freigabeGueltig(f, 'post_veroeffentlichen', inhalt, ms).ok, false); });
