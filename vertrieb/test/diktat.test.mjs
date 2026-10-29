import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diktatAnfrage, bereinigungsPrompt, llmAntwortLesen, kostenSchaetzung, aktivitaetBauen, diktatAntwort, transkriptionsPrompt, MAX_AUDIO_BYTES } from '../lib/diktat.js';

const murat = { mitglied_id: 'm_murat', name: 'Murat', rolle: 'vertrieb', typ: 'mensch', status: 'aktiv' };
const datei = { mimeType: 'audio/webm', fileSize: 120000 };

test('Rechte: nur aktive Menschen mit Rolle admin, dozent oder vertrieb', () => {
  assert.equal(diktatAnfrage(null, {}, datei).code, 401);
  assert.equal(diktatAnfrage({ ...murat, status: 'gesperrt' }, {}, datei).code, 401);
  assert.equal(diktatAnfrage({ ...murat, status: 'eingeladen' }, {}, datei).code, 403);
  assert.equal(diktatAnfrage({ ...murat, rolle: 'team' }, {}, datei).code, 403);
  assert.equal(diktatAnfrage({ ...murat, rolle: 'agent', typ: 'agent' }, {}, datei).code, 403);
  assert.equal(diktatAnfrage({ ...murat, rolle: 'admin' }, {}, datei).aktion, 'transkribieren');
  assert.equal(diktatAnfrage({ ...murat, rolle: 'dozent' }, {}, datei).aktion, 'transkribieren');
});
test('Eingabe: Datei, Größe, Typ, Dauer, Felder', () => {
  assert.equal(diktatAnfrage(murat, {}, null).code, 400);
  assert.equal(diktatAnfrage(murat, {}, { mimeType: 'audio/webm', fileSize: MAX_AUDIO_BYTES + 1 }).code, 413);
  assert.equal(diktatAnfrage(murat, {}, { mimeType: 'application/pdf', fileSize: 10 }).code, 415);
  assert.equal(diktatAnfrage(murat, { dauer_sek: 3600 }, datei).code, 413);
  const r = diktatAnfrage(murat, { chance_id: 'abc-123', chance_name: 'Müller GmbH', art: 'termin', modus: 'gespraech', dauer_sek: '95', kontakt_name: '<b>Hans</b>' }, datei);
  assert.equal(r.aktion, 'transkribieren');
  assert.deepEqual([r.kontext.chance_id, r.kontext.art, r.kontext.modus, r.kontext.dauer_sek, r.kontext.name], ['abc-123', 'termin', 'gespraech', 95, 'Murat']);
  const r2 = diktatAnfrage(murat, { chance_id: 'böse id;drop', art: 'x', modus: 'y' }, { mimeType: '', fileSize: 5 });
  assert.deepEqual([r2.kontext.chance_id, r2.kontext.art, r2.kontext.modus, r2.kontext.mime], ['', 'anruf', 'diktat', 'audio/webm']);
});
test('Prompts enthalten Wörterbuch und Kontext, verlangen JSON', () => {
  assert.match(transkriptionsPrompt(), /Bildungsgutschein/);
  const p = bereinigungsPrompt({ modus: 'diktat', art: 'anruf', chance_name: 'Müller GmbH', kontakt_name: 'Hans' }, 'hallo');
  assert.match(p.system, /JSON/); assert.match(p.system, /nichts dazuerfinden/); assert.match(p.user, /Müller GmbH/); assert.match(p.user, /Diktat nach dem Gespräch/);
});
test('Modellantwort robust lesen: Codezaun, Text drumherum, kaputtes JSON', () => {
  const ok = llmAntwortLesen('```json\n{"text":"Sauber.","zusammenfassung":"Kurz.","punkte":["a","b"],"naechste_schritte":["Angebot schicken"],"termine":["03.11.2026"]}\n```', 'roh');
  assert.equal(ok.text, 'Sauber.'); assert.equal(ok.bereinigt, true); assert.deepEqual(ok.punkte, ['a', 'b']);
  const mitText = llmAntwortLesen('Hier das Ergebnis: {"text":"X","punkte":"einzeln"} Danke', 'roh');
  assert.equal(mitText.text, 'X'); assert.deepEqual(mitText.punkte, ['einzeln']);
  const kaputt = llmAntwortLesen('{"text": "unvollständig', 'roh');
  assert.equal(kaputt.text, 'roh'); assert.equal(kaputt.bereinigt, false);
  assert.equal(llmAntwortLesen('', 'roh').text, 'roh');
});
test('Kosten nur geschätzt und so gekennzeichnet', () => { const k = kostenSchaetzung(600); assert.equal(k.usd, 0.03); assert.match(k.hinweis, /geschätzt/); });
test('Aktivitätstext und Antwort', () => {
  const r = diktatAntwort('rohtext hier', '{"text":"Herr Müller möchte ein Angebot.","zusammenfassung":"Angebot gewünscht.","punkte":["3 Mitarbeitende"],"naechste_schritte":["Angebot bis Freitag"],"termine":["07.11.2026"]}', { name: 'Murat', modus: 'diktat', art: 'anruf', dauer_sek: 120, chance_id: 'c1' }, '2026-10-29T10:00:00Z');
  assert.equal(r.code, 200); assert.equal(r.antwort.ok, true); assert.equal(r.antwort.roh, 'rohtext hier');
  assert.match(r.antwort.aktivitaet, /🎙️ Diktat von Murat am 29\.10\.2026/); assert.match(r.antwort.aktivitaet, /\*\*Nächste Schritte:\*\*\n- Angebot bis Freitag/); assert.match(r.antwort.aktivitaet, /Wortlaut \(bereinigt\)/);
  assert.equal(r.antwort.modelle.transkription, 'gpt-4o-mini-transcribe'); assert.match(r.antwort.kosten.hinweis, /geschätzt/);
  assert.equal(diktatAntwort('   ', '', {}, '').code, 422);
  const roh = diktatAntwort('nur roh', 'kein json', { modus: 'gespraech' }, '2026-10-29T10:00:00Z');
  assert.match(roh.antwort.aktivitaet, /Gesprächsmitschnitt/); assert.match(roh.antwort.aktivitaet, /Rohtranskript/); assert.equal(roh.antwort.bereinigt, false);
  assert.match(aktivitaetBauen({ text: 'x' }, {}, 'kein datum'), /🎙️ Diktat, KI-bereinigt/);
});
