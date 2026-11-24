import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diktatAnfrage, bereinigungsPrompt, llmAntwortLesen, kostenSchaetzung, aktivitaetBauen, diktatAntwort, transkriptionsPrompt, MAX_AUDIO_BYTES, zusammenfassungsPrompt, teilAntwort, gesamtAntwort, jsonAusLlm, MAX_GESAMT_ZEICHEN } from '../lib/diktat.js';

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

test('Lange Aufnahme: Stück (teil=1) nur bereinigen, ohne Zusammenfassung', () => {
  const r = diktatAnfrage(murat, { teil: '1', pc_ton: '1', modus: 'gespraech', dauer_sek: '300' }, datei);
  assert.equal(r.aktion, 'transkribieren');
  assert.equal(r.kontext.teil, true); assert.equal(r.kontext.pc_ton, true);
  assert.equal(diktatAnfrage(murat, {}, datei).kontext.teil, false);
  const p = bereinigungsPrompt(r.kontext, 'roh');
  assert.match(p.system, /Abschnitt/); assert.match(p.system, /\{"text"/); assert.doesNotMatch(p.system, /zusammenfassung/);
  const a = teilAntwort('roh text', '```json\n{"text":"Sauberer Text."}\n```', r.kontext);
  assert.equal(a.code, 200); assert.equal(a.antwort.teil, true); assert.equal(a.antwort.text, 'Sauberer Text.'); assert.equal(a.antwort.roh, 'roh text'); assert.equal(a.antwort.bereinigt, true);
  const b = teilAntwort('roh text', 'kaputt', r.kontext);
  assert.equal(b.antwort.text, 'roh text'); assert.equal(b.antwort.bereinigt, false);
});
test('Lange Aufnahme: aktion=zusammenfassen braucht keine Datei, nur Text', () => {
  assert.equal(diktatAnfrage(murat, { aktion: 'zusammenfassen', transkript: '' }, null).code, 400);
  assert.equal(diktatAnfrage(murat, { aktion: 'zusammenfassen', transkript: 'x'.repeat(MAX_GESAMT_ZEICHEN + 1) }, null).code, 413);
  assert.equal(diktatAnfrage(null, { aktion: 'zusammenfassen', transkript: 'Hallo' }, null).code, 401);
  const r = diktatAnfrage(murat, { aktion: 'zusammenfassen', transkript: 'Teil eins. Teil zwei.', dauer_sek: '5400', pc_ton: '1', modus: 'gespraech' }, null);
  assert.equal(r.aktion, 'zusammenfassen'); assert.equal(r.kontext.dauer_sek, 5400); assert.equal(r.transkript, 'Teil eins. Teil zwei.');
  const p = zusammenfassungsPrompt(r.kontext, r.transkript);
  assert.match(p.system, /NICHT zurück/); assert.match(p.user, /Computerton/); assert.match(p.user, /90 Min/);
  const g = gesamtAntwort(r.transkript, JSON.stringify({ zusammenfassung: 'Kurz.', punkte: ['A'], naechste_schritte: ['B'], termine: [] }), r.kontext, '2026-11-24T10:00:00Z');
  assert.equal(g.code, 200); assert.equal(g.antwort.gesamt, true); assert.equal(g.antwort.text, 'Teil eins. Teil zwei.'); assert.equal(g.antwort.zusammengefasst, true);
  assert.match(g.antwort.aktivitaet, /Mitschnitt mit Computerton/); assert.match(g.antwort.aktivitaet, /Kurz\./); assert.match(g.antwort.aktivitaet, /Teil zwei/);
  assert.equal(g.antwort.kosten.usd, 0.27);
  const ohne = gesamtAntwort('Text', '', r.kontext, '2026-11-24T10:00:00Z');
  assert.equal(ohne.antwort.zusammengefasst, false); assert.equal(ohne.antwort.text, 'Text');
  assert.equal(jsonAusLlm('kein json'), null);
});
