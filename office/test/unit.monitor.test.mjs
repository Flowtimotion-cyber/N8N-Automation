// Monitore: Typ-Erkennung, Adressprüfung und Artefakte je Raum (docs/office/js/modell.js, läuft ohne Browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artefaktTyp, ladbareAdresse, raumArtefakte, raumMonitor, pruefstand } from '../../docs/office/js/modell.js';

test('raumMonitor: neuestes grafisches Ergebnis vor neuerer Notiz; dann PDF; dann das neueste überhaupt; sonst null', () => {
  const D = { projekte: [{ projekt_id: 'p', name: 'P', raum: 'Akademie' }, { projekt_id: 'q', name: 'Q', raum: 'Vertrieb' }, { projekt_id: 'm', name: 'M', raum: 'Marketing' }], agenten: [], runs: [{ run_id: 'r', projekt: 'P', status: 'abgeschlossen', abgenommen: true }, { run_id: 's', projekt: 'Q', status: 'abgeschlossen' }, { run_id: 't', projekt: 'M', status: 'in_arbeit' }],
    artefakte: [{ artefakt_id: 'a1', run_id: 'r', titel: 'Bild', ablageort: 'testbilder/x.svg', erstellt: '2026-10-17T10:00:00Z' }, { artefakt_id: 'a2', run_id: 'r', titel: 'Notiz', ablageort: 'notiz:x', erstellt: '2026-10-17T12:00:00Z' },
      { artefakt_id: 'a3', run_id: 's', titel: 'PDF', ablageort: 'https://x.example/a.pdf', erstellt: '2026-10-17T09:00:00Z' }, { artefakt_id: 'a4', run_id: 's', titel: 'Notiz neuer', ablageort: 'notiz:y', erstellt: '2026-10-17T11:00:00Z' },
      { artefakt_id: 'a5', run_id: 't', titel: 'nur Notiz', ablageort: 'notiz:z', erstellt: '2026-10-17T08:00:00Z' }] };
  assert.equal(raumMonitor(D, 'Akademie').artefakt_id, 'a1', 'Bild vor neuerer Notiz');
  assert.equal(raumMonitor(D, 'Vertrieb').artefakt_id, 'a3', 'PDF vor neuerer Notiz');
  assert.equal(raumMonitor(D, 'Marketing').artefakt_id, 'a5', 'ohne Grafik/PDF: das neueste überhaupt');
  assert.equal(raumMonitor(D, 'Verwaltung'), null);
});

test('ladbareAdresse: nur https:// oder relativ; alles mit anderem Schema, schema-relativ, Backslash oder Leerraum wird abgelehnt', () => {
  assert.equal(ladbareAdresse('https://bilder.example/a.png'), 'https://bilder.example/a.png');
  assert.equal(ladbareAdresse('testbilder/quiz.svg'), 'testbilder/quiz.svg');
  assert.equal(ladbareAdresse('./testbilder/quiz.svg'), './testbilder/quiz.svg');
  assert.equal(ladbareAdresse('/N8N-Automation/office/testbilder/quiz.svg'), '/N8N-Automation/office/testbilder/quiz.svg');
  for (const schlecht of ['http://bilder.example/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\nscript:alert(1)', 'blob:https://x/y', 'file:///etc/passwd', 'notiz:Ergebnis run_1', '//evil.example/a.png', '\\\\evil.example\\a.png', 'https://a.example/b c.png', 'a"b.png', "a'b.png", 'https:relativ.png', '', null, undefined, 'x'.repeat(501)]) {
    assert.equal(ladbareAdresse(schlecht), null, 'abgelehnt: ' + JSON.stringify(schlecht));
  }
});

test('artefaktTyp: Bild (png/jpg/jpeg/svg/webp/gif), HTML, PDF, sonst – aus Ablageort und art', () => {
  assert.deepEqual(artefaktTyp({ art: 'datei', ablageort: 'testbilder/quiz.svg' }), { typ: 'bild', url: 'testbilder/quiz.svg' });
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/a.PNG' }).typ, 'bild');
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/a.jpeg?v=2#x' }).typ, 'bild');
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/a.webp' }).typ, 'bild');
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/a.gif' }).typ, 'bild');
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/seite.html' }).typ, 'html');
  assert.equal(artefaktTyp({ ablageort: 'vorschau.htm' }).typ, 'html');
  assert.equal(artefaktTyp({ ablageort: 'https://x.example/bericht.pdf' }).typ, 'pdf');
  assert.equal(artefaktTyp({ art: 'bild', ablageort: 'https://x.example/ohne-endung' }).typ, 'bild', 'art=bild gilt auch ohne Endung');
  assert.equal(artefaktTyp({ art: 'html', ablageort: 'https://x.example/render' }).typ, 'html');
  assert.equal(artefaktTyp({ art: 'pdf', ablageort: 'https://x.example/doc' }).typ, 'pdf');
  assert.deepEqual(artefaktTyp({ art: 'notiz', ablageort: 'notiz:Ergebnis run_1' }), { typ: 'sonst', url: null });
  assert.deepEqual(artefaktTyp({ art: 'commit', ablageort: 'https://github.com/x/y/commit/abc' }), { typ: 'sonst', url: 'https://github.com/x/y/commit/abc' });
  assert.deepEqual(artefaktTyp({ art: 'text' }), { typ: 'sonst', url: null });
  assert.deepEqual(artefaktTyp(null), { typ: 'sonst', url: null });
});

test('artefaktTyp: Bild oder HTML ohne ladbare Adresse wird zur Karte (nichts wird geladen)', () => {
  assert.deepEqual(artefaktTyp({ ablageort: 'data:image/png;base64,iVBORw0KGgo=' }), { typ: 'sonst', url: null });
  assert.deepEqual(artefaktTyp({ ablageort: 'http://unsicher.example/a.png' }), { typ: 'sonst', url: null });
  assert.deepEqual(artefaktTyp({ ablageort: 'javascript:alert(1)//.html' }), { typ: 'sonst', url: null });
  assert.deepEqual(artefaktTyp({ art: 'bild', ablageort: 'notiz:Bild' }), { typ: 'sonst', url: null });
  assert.equal(artefaktTyp({ ablageort: 'http://unsicher.example/a.pdf' }).typ, 'pdf', 'PDF-Karte bleibt PDF, aber ohne url');
  assert.equal(artefaktTyp({ ablageort: 'http://unsicher.example/a.pdf' }).url, null);
});

test('raumArtefakte: nur Runs der Projekte des Raums, neueste zuerst, höchstens n, mit Prüfstand', () => {
  const D = {
    projekte: [{ projekt_id: 'p1', name: 'A-Projekt', raum: 'Akademie' }, { projekt_id: 'p2', name: 'V-Projekt', raum: 'Vertrieb' }, { projekt_id: 'p3', name: 'Ohne', raum: null }],
    agenten: [],
    runs: [
      { run_id: 'r1', projekt: 'A-Projekt', status: 'abgeschlossen', abgenommen: true },
      { run_id: 'r2', projekt: 'A-Projekt', status: 'abgeschlossen' },
      { run_id: 'r3', projekt: 'V-Projekt', status: 'abgeschlossen', abgenommen: false },
      { run_id: 'r4', projekt: 'Ohne', status: 'in_arbeit' }
    ],
    artefakte: [
      { artefakt_id: 'a1', run_id: 'r1', titel: 'alt', ablageort: 'testbilder/alt.svg', erstellt: '2026-10-17T10:00:00Z' },
      { artefakt_id: 'a2', run_id: 'r2', titel: 'neu', ablageort: 'notiz:x', erstellt: '2026-10-17T12:00:00Z' },
      { artefakt_id: 'a3', run_id: 'r1', titel: 'mittel', ablageort: 'https://x.example/m.png', erstellt: '2026-10-17T11:00:00Z' },
      { artefakt_id: 'a4', run_id: 'r3', titel: 'vertrieb', ablageort: 'https://x.example/v.html', erstellt: '2026-10-17T09:00:00Z' },
      { artefakt_id: 'a5', run_id: 'r4', titel: 'ohne raum', ablageort: 'https://x.example/o.png', erstellt: '2026-10-17T13:00:00Z' },
      { artefakt_id: 'a6', run_id: 'r_fremd', titel: 'fremder run', ablageort: 'https://x.example/f.png', erstellt: '2026-10-17T14:00:00Z' }
    ]
  };
  const A = raumArtefakte(D, 'Akademie');
  assert.deepEqual(A.map(a => a.artefakt_id), ['a2', 'a3', 'a1'], 'neueste zuerst, nur Akademie');
  assert.deepEqual(A.map(a => a.typ), ['sonst', 'bild', 'bild']);
  assert.deepEqual(A.map(a => a.pruefstand), ['ungeprueft', 'abgenommen', 'abgenommen']);
  assert.equal(A[1].run.run_id, 'r1'); assert.equal(A[1].projekt, 'A-Projekt');
  assert.deepEqual(raumArtefakte(D, 'Akademie', 1).map(a => a.artefakt_id), ['a2'], 'n begrenzt');
  const V = raumArtefakte(D, 'Vertrieb');
  assert.equal(V.length, 1); assert.equal(V[0].typ, 'html'); assert.equal(V[0].pruefstand, 'zurueckgewiesen');
  assert.deepEqual(raumArtefakte(D, 'Verwaltung'), [], 'Raum ohne Projekte: leer');
  assert.deepEqual(raumArtefakte({}, 'Akademie'), [], 'leere Daten: leer');
  assert.equal(pruefstand(null), 'ungeprueft');
});

test('raumArtefakte: Raum über Agentenzuordnung, wenn team_projekte.raum fehlt', () => {
  const D = { projekte: [{ projekt_id: 'p', name: 'P' }], agenten: [{ agent_id: 'x', raum: 'Marketing', projekte: ['P'] }], runs: [{ run_id: 'r', projekt: 'P', status: 'abgeschlossen' }], artefakte: [{ artefakt_id: 'a', run_id: 'r', titel: 't', ablageort: 'bild.png', erstellt: '2026-10-17T10:00:00Z' }] };
  assert.equal(raumArtefakte(D, 'Marketing').length, 1);
  assert.equal(raumArtefakte(D, 'Akademie').length, 0);
});
