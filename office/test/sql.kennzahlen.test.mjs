// SQL-Test für supabase/team_office_kennzahlen.sql gegen ein echtes Postgres im Speicher (PGlite).
// PGlite ist keine Abhängigkeit des Repos. Einmalig in einem eigenen Ordner installieren und den Pfad übergeben:
//   npm install @electric-sql/pglite   (in einem Ordner außerhalb des Repos)
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test office/test/sql.kennzahlen.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
// Geprüft wird auch, dass die SQL-Auswertung dieselben Zahlen liefert wie office/lib/kennzahlen.js (eine Regel, zwei Orte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { kennzahlenAusZeilen, bewertung } from '../lib/kennzahlen.js';

const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'team_office_kennzahlen.sql'), 'utf8');

test('team_office_kennzahlen.sql: wiederholbar, team_laden_office, Auswertung wie die Bibliothek, keine Rechte für anon', async t => {
  if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
  const db = new PGlite();
  const q = async (s, p) => (await db.query(s, p)).rows;
  // Minimaler Bestand: Rollen und ein team_laden(), wie es in Produktion schon existiert (mit einem Schlüssel, der erhalten bleiben muss)
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create or replace function team_laden() returns jsonb language sql stable as $$ select jsonb_build_object('mitglieder', '[]'::jsonb, 'spaeter_dazugekommen', 1) $$;`);
  await db.exec(SQL); await db.exec(SQL);   // zweimal: wiederholbar
  let L = (await q(`select team_laden_office() as j`))[0].j;
  assert.deepEqual(L.office_kennzahlen, []); assert.equal(L.spaeter_dazugekommen, 1, 'Schlüssel aus team_laden() bleiben erhalten'); assert.deepEqual(L.mitglieder, []);
  // Zeilen: Agent a liefert (4 abgenommen, 1 zurückgewiesen, ein Fehlschlag mit Kosten, eine Zeile ohne Kosten), Agent b liefert nicht, Agent c zu wenig Daten, eine alte Zeile außerhalb des Fensters
  const zeile = (id, agent, tage, extra) => Object.assign({ run_id: id, agent_id: agent, raum: 'Vertrieb', ausfuehrer: 'claude-code', modell: 'claude-sonnet-5-5', status: 'abgeschlossen', tage, dauer_sek: 600, kosten_eur: 0.2, kosten_art: 'gemessen', kosten_basis: 'ausfuehrer', ergebnis_typ: 'dossier', ergebnisse: 1, abnahme: 'abgenommen', wirkung: {} }, extra || {});
  const Z = [
    zeile('a1', 'a', 1, { wirkung: { firmen: 12, termine: 4 } }), zeile('a2', 'a', 2, { kosten_art: 'geschaetzt', kosten_basis: 'textlaenge', kosten_eur: 0.3, dauer_sek: 300 }), zeile('a3', 'a', 9, { wirkung: { firmen: 5 } }), zeile('a4', 'a', 16, { dauer_sek: 1200 }),
    zeile('a5', 'a', 3, { abnahme: 'zurueckgewiesen' }), zeile('a6', 'a', 4, { status: 'fehlgeschlagen', abnahme: 'offen', kosten_eur: 0.1 }), zeile('a7', 'a', 5, { abnahme: 'offen', kosten_eur: null, kosten_art: 'unbekannt', kosten_basis: null }),
    zeile('a8', 'a', 40),
    zeile('b1', 'b', 1, { abnahme: 'zurueckgewiesen' }), zeile('b2', 'b', 2, { abnahme: 'zurueckgewiesen' }), zeile('b3', 'b', 3),
    zeile('c1', 'c', 1)
  ];
  for (const z of Z) await db.query(`insert into office_kennzahlen (run_id, agent_id, raum, ausfuehrer, modell, status, beendet, dauer_sek, kosten_eur, kosten_art, kosten_basis, ergebnis_typ, ergebnisse, abnahme, wirkung)
    values ($1,$2,$3,$4,$5,$6, now() - make_interval(days => $7), $8,$9,$10,$11,$12,$13,$14,$15::jsonb)`, [z.run_id, z.agent_id, z.raum, z.ausfuehrer, z.modell, z.status, z.tage, z.dauer_sek, z.kosten_eur, z.kosten_art, z.kosten_basis, z.ergebnis_typ, z.ergebnisse, z.abnahme, JSON.stringify(z.wirkung)]);
  L = (await q(`select team_laden_office() as j`))[0].j;
  assert.equal(L.office_kennzahlen.length, Z.length, 'alle Zeilen der letzten 120 Tage');
  const A = await q(`select * from office_auswertung(28)`);
  const a = A.find(x => x.agent_id === 'a'), b = A.find(x => x.agent_id === 'b'), c = A.find(x => x.agent_id === 'c');
  assert.equal(Number(a.laeufe), 7); assert.equal(Number(a.ergebnisse), 6); assert.equal(Number(a.abgenommen), 4); assert.equal(Number(a.zurueckgewiesen), 1); assert.equal(Number(a.offen), 1); assert.equal(Number(a.fehlgeschlagen), 1);
  assert.equal(Number(a.kosten_eur), 1.2); assert.equal(Number(a.kosten_gemessen_eur), 0.9); assert.equal(Number(a.kosten_geschaetzt_eur), 0.3); assert.equal(Number(a.laeufe_ohne_kosten), 1);
  assert.equal(Number(a.kosten_je_abgenommen), 0.3); assert.equal(Number(a.zurueck_quote), 0.2); assert.deepEqual(a.wirkung, { firmen: 17, termine: 4 }); assert.equal(a.urteil, 'liefert');
  assert.equal(b.urteil, 'liefert_nicht'); assert.equal(c.urteil, 'zu_wenig'); assert.equal(c.kosten_je_abgenommen !== null, true);
  // Gleiche Zahlen wie die Bibliothek, die im Office rechnet
  const jetzt = Date.now();
  const alsZeilen = Z.map(z => Object.assign({}, z, { beendet: new Date(jetzt - z.tage * 86400000).toISOString() }));
  for (const [id, sql] of [['a', a], ['b', b], ['c', c]]) {
    const k = kennzahlenAusZeilen(alsZeilen, id, jetzt);
    assert.equal(k.ergebnisse, Number(sql.ergebnisse), id + ' ergebnisse'); assert.equal(k.abgenommen, Number(sql.abgenommen)); assert.equal(k.zurueck, Number(sql.zurueckgewiesen)); assert.equal(k.fehlgeschlagen, Number(sql.fehlgeschlagen));
    assert.equal(k.kosten_eur, Number(sql.kosten_eur), id + ' kosten'); assert.equal(k.kosten_je_abgenommen, sql.kosten_je_abgenommen === null ? null : Number(sql.kosten_je_abgenommen)); assert.equal(k.zurueck_quote, sql.zurueck_quote === null ? null : Number(sql.zurueck_quote));
    assert.equal(k.kosten_unbekannt, Number(sql.laeufe_ohne_kosten)); assert.deepEqual(k.wirkung, sql.wirkung); assert.equal(bewertung(k).stufe, sql.urteil, id + ' urteil');
    assert.equal(k.dauer_min, sql.dauer_median_min === null ? null : Number(sql.dauer_median_min), id + ' dauer');
  }
  const W = await q(`select * from office_auswertung_wochen(4)`);
  assert.ok(W.filter(w => w.agent_id === 'a').length >= 2, 'mehrere Wochen für Agent a'); assert.equal(W.filter(w => w.agent_id === 'a').reduce((s, w) => s + Number(w.abgenommen), 0), 4);
  // Constraints und Rechte
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, kosten_art) values ('x', 'a', 'abgeschlossen', now(), 'gefuehlt')`), 'unbekannte Kostenart wird abgelehnt');
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, abnahme) values ('y', 'a', 'abgeschlossen', now(), 'vielleicht')`));
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, modell) values ('m', 'a', 'abgeschlossen', now(), 'Max Mustermann')`), 'Freitext als Modell wird abgelehnt');
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, ergebnis_typ) values ('t', 'a', 'abgeschlossen', now(), 'geheimbericht')`));
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, wirkung) values ('w', 'a', 'abgeschlossen', now(), '"text"'::jsonb)`));
  await assert.rejects(db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet) values ('s', 'a', 'laeuft', now())`));
  const rechte = await q(`select has_function_privilege('anon', 'team_laden_office()', 'execute') as anon, has_function_privilege('service_role', 'team_laden_office()', 'execute') as dienst, has_function_privilege('authenticated', 'office_auswertung(int)', 'execute') as auth,
    (select relrowsecurity from pg_class where relname = 'office_kennzahlen') as rls, has_table_privilege('anon', 'office_kennzahlen', 'select') as anon_tabelle`);
  assert.deepEqual(rechte[0], { anon: false, dienst: true, auth: false, rls: true, anon_tabelle: false });
  // Keine Spalte für Personen oder Freitext
  const spalten = (await q(`select column_name from information_schema.columns where table_name = 'office_kennzahlen'`)).map(r => r.column_name);
  for (const verboten of ['auftraggeber', 'auftrag', 'zusammenfassung', 'abgenommen_von', 'abnahme_am', 'projekt', 'kommentar', 'mitglied_id']) assert.ok(!spalten.includes(verboten), 'Spalte ' + verboten + ' darf es nicht geben');
});
