import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, ALLE_STATUS, UEBERGAENGE, darfWechseln, istEndzustand, fristPruefen, FRISTEN, uebergangsTabelleMarkdown } from '../lib/zustand.js';

test('alle acht Zustände vorhanden', () => assert.deepEqual(ALLE_STATUS.sort(), ['abgebrochen', 'abgeschlossen', 'fehlgeschlagen', 'in_arbeit', 'unbekannt', 'wartescheinlich'.replace('scheinlich', 'schlange'), 'wartet_freigabe', 'wartet_rueckmeldung'].sort()));
test('Übergänge referenzieren nur bekannte Zustände', () => { for (const u of UEBERGAENGE) { assert.ok(ALLE_STATUS.includes(u.von), u.von); assert.ok(ALLE_STATUS.includes(u.nach), u.nach); assert.ok(u.wer.length); } });
test('Endzustände erlauben keinen Weg zurück nach abgeschlossen', () => {
  for (const von of ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt']) assert.ok(!darfWechseln(von, STATUS.ABGESCHLOSSEN), von + ' → abgeschlossen darf nicht gehen');
  assert.ok(!darfWechseln('unbekannt', 'in_arbeit'));
  assert.ok(!darfWechseln('abgebrochen', 'warteschlange'));
});
test('Rollenbindung: Menschen antworten, Agenten melden Ergebnisse, System setzt unbekannt', () => {
  assert.ok(darfWechseln('wartet_rueckmeldung', 'in_arbeit', 'mensch'));
  assert.ok(!darfWechseln('wartet_rueckmeldung', 'in_arbeit', 'agent'));
  assert.ok(darfWechseln('in_arbeit', 'abgeschlossen', 'agent'));
  assert.ok(!darfWechseln('in_arbeit', 'abgeschlossen', 'mensch'));
  assert.ok(darfWechseln('in_arbeit', 'unbekannt', 'system'));
  assert.ok(!darfWechseln('in_arbeit', 'unbekannt', 'agent'));
  assert.ok(darfWechseln('fehlgeschlagen', 'warteschlange', 'mensch'));
  assert.ok(darfWechseln('in_arbeit', 'abgebrochen', 'mensch'));
  assert.ok(!darfWechseln('in_arbeit', 'abgebrochen', 'agent'));
});
test('istEndzustand', () => { assert.ok(istEndzustand('unbekannt')); assert.ok(!istEndzustand('wartet_freigabe')); });
test('fristPruefen: Warteschlange, Timeout, Wartefrist für Menschen', () => {
  const t0 = Date.parse('2026-10-17T10:00:00Z');
  const run = (status, felder) => Object.assign({ status, erstellt: new Date(t0).toISOString(), timeout_sek: 600 }, felder || {});
  assert.equal(fristPruefen(run('warteschlange'), t0 + 29 * 60000), null);
  assert.equal(fristPruefen(run('warteschlange'), t0 + 31 * 60000).nach, 'unbekannt');
  assert.equal(fristPruefen(run('in_arbeit', { lebenszeichen: new Date(t0).toISOString() }), t0 + 9 * 60000), null);
  assert.equal(fristPruefen(run('in_arbeit', { lebenszeichen: new Date(t0).toISOString() }), t0 + 11 * 60000).nach, 'unbekannt');
  assert.equal(fristPruefen(run('wartet_freigabe', { lebenszeichen: new Date(t0).toISOString() }), t0 + 6 * 86400000), null);
  assert.equal(fristPruefen(run('wartet_freigabe', { lebenszeichen: new Date(t0).toISOString() }), t0 + 8 * 86400000).nach, 'unbekannt');
  assert.equal(fristPruefen(run('abgeschlossen'), t0 + 365 * 86400000), null);
  assert.ok(FRISTEN.max_versuche >= 1);
});
test('Übergangstabelle als Markdown hat eine Zeile je Übergang', () => assert.equal(uebergangsTabelleMarkdown().split('\n').length, UEBERGAENGE.length + 2));
