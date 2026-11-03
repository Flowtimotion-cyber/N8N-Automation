// (b) Konfig-Schema: mandant.example.json und mandant.js haben genau die vereinbarten Schlüssel, Register-Schalter sind boolesch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { PILOT } from './hilfe.mjs';

const SCHLUESSEL = ['firma', 'kurzname', 'logo', 'farben', 'n8n_basis_url', 'portal_url', 'register', 'social_kanaele', 'anleitung_video', 'standard_projekt', 'sprache'];
const REGISTER = ['uebersicht', 'aufgaben', 'projekte', 'notizen', 'vorschlaege', 'team', 'arbeitszeit', 'social', 'vertrieb', 'whatsapp', 'kurs', 'systeme', 'skills', 'tresor', 'webseite', 'office'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function pruefe(k, name) {
  assert.deepEqual(Object.keys(k).sort(), SCHLUESSEL.slice().sort(), name + ': genau die vereinbarten Schlüssel');
  for (const f of ['firma', 'kurzname', 'logo', 'n8n_basis_url', 'portal_url', 'anleitung_video', 'standard_projekt', 'sprache']) assert.equal(typeof k[f], 'string', name + ': ' + f + ' ist Text');
  assert.ok(k.firma.trim() && k.kurzname.trim(), name + ': Firma und Kurzname gefüllt');
  assert.deepEqual(Object.keys(k.farben).sort(), ['akzent', 'primaer'], name + ': farben hat primaer und akzent');
  assert.ok(HEX.test(k.farben.primaer) && HEX.test(k.farben.akzent), name + ': Farben als #rrggbb');
  assert.deepEqual(Object.keys(k.register).sort(), REGISTER.slice().sort(), name + ': alle Register-Schalter vorhanden');
  for (const r of REGISTER) assert.equal(typeof k.register[r], 'boolean', name + ': register.' + r + ' ist true oder false');
  assert.match(k.n8n_basis_url, /^https:\/\/\S+$/, name + ': n8n_basis_url beginnt mit https://');
  assert.ok(!/\/$/.test(k.n8n_basis_url), name + ': n8n_basis_url ohne Schrägstrich am Ende');
  assert.match(k.portal_url, /^https:\/\/\S+\/$/, name + ': portal_url beginnt mit https:// und endet mit /');
  assert.ok(k.anleitung_video === '' || /^https:\/\//.test(k.anleitung_video), name + ': anleitung_video leer oder https-Adresse');
  assert.equal(k.sprache, 'de');
  assert.ok(k.logo === '' || !/^https?:/.test(k.logo), name + ': logo ist ein relativer Pfad unter frontend/ (oder leer)');
  assert.ok(Array.isArray(k.social_kanaele) && k.social_kanaele.every(x => typeof x === 'string' && x.trim() && x.length <= 40), name + ': social_kanaele ist eine Liste kurzer Texte (leer = freies Textfeld)');
  assert.equal(new Set(k.social_kanaele).size, k.social_kanaele.length, name + ': social_kanaele ohne Doppelte');
}

const beispiel = JSON.parse(readFileSync(join(PILOT, 'config', 'mandant.example.json'), 'utf8'));
test('mandant.example.json entspricht dem Schema', () => { pruefe(beispiel, 'mandant.example.json'); });

test('mandant.js setzt window.MANDANT mit demselben Schema und denselben Vorgabewerten wie die Vorlage', () => {
  const quelle = readFileSync(join(PILOT, 'config', 'mandant.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(quelle, sandbox);
  const k = JSON.parse(JSON.stringify(sandbox.window.MANDANT));   // aus der VM herausholen (eigener Object-Prototyp)
  assert.ok(k && typeof k === 'object', 'window.MANDANT gesetzt');
  pruefe(k, 'mandant.js');
  assert.deepEqual(k, beispiel, 'mandant.js und mandant.example.json sind inhaltsgleich (Vorlage für den Piloten)');
  assert.ok(!/token|passwort|password|secret|api[_-]?key/i.test(quelle), 'keine Zugangsdaten in der Konfiguration');
});

test('Standard-Register des Pilots: Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team an, alles andere aus', () => {
  const an = REGISTER.filter(r => beispiel.register[r]);
  assert.deepEqual(an.sort(), ['aufgaben', 'notizen', 'projekte', 'team', 'uebersicht', 'vorschlaege']);
});
