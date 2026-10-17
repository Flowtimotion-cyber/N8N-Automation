// Zeilenumbruch für Monitortexte (docs/office/js/buero.js): Wortgrenzen, Zeilenlänge, Zeilenzahl, Kürzung mit …
import { test } from 'node:test';
import assert from 'node:assert/strict';

// buero.js importiert Ansichten, die erst im Browser laufen; die Funktion wird hier isoliert geladen.
const quelle = await import('node:fs').then(fs => fs.readFileSync(new URL('../../docs/office/js/buero.js', import.meta.url), 'utf8'));
const code = /export function umbruch[\s\S]*?\n}\n/.exec(quelle)[0].replace('export ', '');
const umbruch = new Function(code + ' return umbruch;')();

test('umbruch: bricht an Wortgrenzen, hält Zeilenlänge und Zeilenzahl ein', () => {
  assert.deepEqual(umbruch('Hier erscheint das neueste Ergebnis der Agenten dieses Raums', 30, 2), ['Hier erscheint das neueste', 'Ergebnis der Agenten dieses…']);
  assert.deepEqual(umbruch('kurz', 30, 2), ['kurz']);
  assert.deepEqual(umbruch('', 30, 2), []);
  assert.deepEqual(umbruch(null, 30, 2), []);
  for (const z of umbruch('Quiz-Auswertung Modul 1.2 (Diagramm) mit sehr vielen Worten dahinter', 18, 2)) assert.ok(z.length <= 18, z);
  assert.equal(umbruch('Quiz-Auswertung Modul 1.2 (Diagramm) mit sehr vielen Worten dahinter', 18, 2).length, 2);
});

test('umbruch: überlange Wörter werden gekürzt, letzte Zeile endet bei Überlauf mit …', () => {
  const z = umbruch('https://beispiel.example/sehr/langer/pfad/ohne/leerzeichen.pdf', 32, 2);
  assert.equal(z.length, 1); assert.ok(z[0].length <= 32 && z[0].endsWith('…'));
  const y = umbruch('eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf', 10, 3);
  assert.equal(y.length, 3); assert.ok(y[2].endsWith('…')); for (const s of y) assert.ok(s.length <= 10, s);
});
