// Prüft die beiden Code-Knoten von „SOCIAL: Video hochladen (intern)“ ohne n8n:
// Die Workflow-Datei wird mit Platzhaltern für das n8n-SDK geladen, die Knoten-Skripte laufen mit nachgebauten $-Zugriffen.
// Aufruf: node --test social/test/video-hochladen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(join(hier, '..', 'n8n', 'video-hochladen.workflow.js'), 'utf8');
const kette = { add() { return kette; }, to() { return kette; }, onTrue() { return kette; }, onFalse() { return kette; } };
const laden = new Function('workflow', 'node', 'trigger', 'ifElse', 'newCredential', 'expr',
  quelle.replace(/^import .*$/m, '').replace('export default', 'const wf =') + '\nreturn { JS_PRUEFEN, JS_ANTWORT };');
const { JS_PRUEFEN, JS_ANTWORT } = laden(() => kette, () => kette, () => kette, () => kette, n => n, s => s);

const pruefen = body => new Function('$', JS_PRUEFEN)(() => ({ first: () => ({ json: { body } }) }))[0].json;
const antworten = (anfrage, speicher) => new Function('$', '$input', JS_ANTWORT)(
  () => ({ first: () => ({ json: anfrage }) }), { first: () => ({ json: speicher }) })[0].json;

test('gültige Anfrage: Name aus prefix, Zeitstempel und Endung', () => {
  const r = pruefen({ prefix: 'Team L3 Prozess-Scanner', endung: '.MP4', groesse: 28593045 });
  assert.equal(r.ok, true);
  assert.match(r.pfad, /^team-l3-prozess-scanner-\d{8}-\d{6}\.mp4$/);
  assert.equal(r.mime, 'video/mp4');
});

test('Body als Text wird gelesen, jpg ist erlaubt', () => {
  const r = pruefen(JSON.stringify({ prefix: 'cover', endung: 'jpg', groesse: 1000 }));
  assert.equal(r.ok, true);
  assert.equal(r.mime, 'image/jpeg');
});

test('abgelehnt: falsche Endung, zu groß, ohne prefix, ohne Größe', () => {
  for (const b of [
    { prefix: 'a', endung: 'mov', groesse: 10 },
    { prefix: 'a', endung: 'mp4', groesse: 200 * 1024 * 1024 + 1 },
    { prefix: '///', endung: 'mp4', groesse: 10 },
    { prefix: 'a', endung: 'mp4' },
    {},
  ]) {
    const r = pruefen(b);
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.equal(r.code, 400);
    assert.equal(r.antwort.ok, false);
    assert.ok(r.antwort.fehler.length > 5);
  }
});

test('genau 200 MB geht noch durch', () => {
  assert.equal(pruefen({ prefix: 'a', endung: 'mp4', groesse: 200 * 1024 * 1024 }).ok, true);
});

test('Antwort: Upload-Adresse und öffentliche Adresse zeigen auf social-medien', () => {
  const a = { ok: true, pfad: 'team-l3-20261117-120000.mp4', mime: 'video/mp4' };
  const r = antworten(a, { url: '/object/upload/sign/social-medien/team-l3-20261117-120000.mp4?token=abc' });
  assert.equal(r.code, 200);
  assert.equal(r.antwort.upload_url, 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/object/upload/sign/social-medien/team-l3-20261117-120000.mp4?token=abc');
  assert.equal(r.antwort.public_url, 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/object/public/social-medien/team-l3-20261117-120000.mp4');
  assert.equal(r.antwort.pfad, 'social-medien/team-l3-20261117-120000.mp4');
});

test('Antwort: Speicher liefert keine Adresse → 502 mit Grund', () => {
  const r = antworten({ pfad: 'x.mp4', mime: 'video/mp4' }, { error: 'Bucket not found', message: 'Bucket not found' });
  assert.equal(r.code, 502);
  assert.equal(r.antwort.ok, false);
  assert.match(r.antwort.fehler, /Bucket not found/);
});
