// SQL-Test für supabase/team_office_guthaben.sql gegen ein echtes Postgres im Speicher (PGlite), nach team_office_kennzahlen.sql.
// PGlite ist keine Abhängigkeit des Repos; Aufruf wie in sql.kennzahlen.test.mjs (PGLITE_PFAD). Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guthabenStand } from '../lib/guthaben.js';

const sql = name => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', name), 'utf8');

test('team_office_guthaben.sql: wiederholbar, Spalten und Protokoll, team_laden_office mit Schalter, Stand wie die Bibliothek, keine Rechte für anon', async t => {
  if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
  const db = new PGlite();
  const q = async (s, p) => (await db.query(s, p)).rows;
  // Minimaler Bestand wie in Produktion: Rollen, Registry, team_laden() mit den Agenten
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table office_agenten (agent_id text primary key, name text not null, raum text not null default 'Verwaltung', modell text, aktiv boolean default true);
    insert into office_agenten (agent_id, name, raum) values ('a', 'Agent A', 'Vertrieb'), ('b', 'Agent B', 'Marketing'), ('c', 'Agent C', 'Verwaltung');
    create or replace function team_laden() returns jsonb language sql stable as $$ select jsonb_build_object('mitglieder', '[]'::jsonb, 'office_agenten', (select jsonb_agg(to_jsonb(g) order by g.agent_id) from office_agenten g)) $$;`);
  await db.exec(sql('team_office_kennzahlen.sql'));
  let L = (await q(`select team_laden_office() as j`))[0].j;
  assert.equal(L.office_vorschlaege, undefined, 'vor der Migration fehlt der Schalter: die Office-API begrenzt nichts');
  await db.exec(sql('team_office_guthaben.sql')); await db.exec(sql('team_office_guthaben.sql'));   // zweimal: wiederholbar
  L = (await q(`select team_laden_office() as j`))[0].j;
  assert.deepEqual(L.office_vorschlaege, []); assert.deepEqual(L.office_kennzahlen, []); assert.deepEqual(L.mitglieder, []);
  assert.ok('budget_eur_monat' in L.office_agenten[0] && L.office_agenten[0].budget_eur_monat === null, 'neue Spalten kommen über team_laden() mit, leer = nicht begrenzt');
  // Guthaben setzen wie die Office-API (PostgREST schreibt genau diese Spalten)
  await db.query(`update office_agenten set budget_eur_monat = 4 where agent_id = 'a'`);
  await db.query(`update office_agenten set budget_eur_monat = 2, budget_zusatz_eur = 1.5, budget_zusatz_monat = to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM') where agent_id = 'b'`);
  const ins = (id, agent, wann, kosten, art) => db.query(`insert into office_kennzahlen (run_id, agent_id, status, beendet, kosten_eur, kosten_art) values ($1, $2, 'abgeschlossen', ${wann}, $3, $4)`, [id, agent, kosten, art]);
  await ins('a1', 'a', `date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' + interval '1 minute'`, 1.2, 'gemessen');
  await ins('a2', 'a', `now()`, 0.8, 'geschaetzt');
  await ins('a3', 'a', `now()`, null, 'unbekannt');
  await ins('a4', 'a', `date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' - interval '1 minute'`, 9, 'gemessen');   // Vormonat
  await ins('b1', 'b', `now()`, 5, 'gemessen');
  const G = await q(`select * from office_guthaben()`);
  const g = id => G.find(x => x.agent_id === id);
  assert.equal(Number(g('a').verbraucht_eur), 2); assert.equal(Number(g('a').rest_eur), 2); assert.equal(Number(g('a').laeufe_ohne_kosten), 1);
  assert.equal(Number(g('b').zusatz_eur), 1.5); assert.equal(Number(g('b').rest_eur), 0, 'nie unter null'); assert.equal(g('c').monat_eur, null); assert.equal(g('c').rest_eur, null);
  // Gleicher Stand wie die Bibliothek, die im Office rechnet (ohne laufende Aufträge)
  L = (await q(`select team_laden_office() as j`))[0].j;
  for (const id of ['a', 'b']) {
    const lib = guthabenStand(L.office_agenten.find(x => x.agent_id === id), L.office_kennzahlen, [], [], Date.now());
    assert.equal(lib.verbraucht_eur, Number(g(id).verbraucht_eur), id + ' verbraucht'); assert.equal(lib.rest_eur, Number(g(id).rest_eur), id + ' rest'); assert.equal(lib.monat, g(id).monat);
  }
  assert.equal(guthabenStand(L.office_agenten.find(x => x.agent_id === 'c'), L.office_kennzahlen, [], [], Date.now()), null);
  // Protokoll: Zeile wie von der Office-API, erscheint im Laden
  await db.query(`insert into office_vorschlaege (vorschlag_id, art, agent_id, entscheidung, option, wert, segment, neuer_agent, begruendung, zahlen, entschieden_von, entschieden_am)
    values ('vor_1', 'skalieren', 'a', 'angenommen', 'instanz', 3, 'Handwerk Nord', 'a-handwerk-nord', null, '{"abgenommen": 8}'::jsonb, 'm_timo', now())`);
  L = (await q(`select team_laden_office() as j`))[0].j; assert.equal(L.office_vorschlaege.length, 1); assert.equal(L.office_vorschlaege[0].segment, 'Handwerk Nord');
  // Checks
  await assert.rejects(db.query(`update office_agenten set budget_eur_monat = -1 where agent_id = 'a'`)); await assert.rejects(db.query(`update office_agenten set budget_eur_monat = 501 where agent_id = 'a'`));
  await assert.rejects(db.query(`update office_agenten set budget_zusatz_monat = 'November' where agent_id = 'a'`));
  await assert.rejects(db.query(`insert into office_vorschlaege (vorschlag_id, art, entscheidung, entschieden_von) values ('x', 'verdoppeln', 'angenommen', 'm_timo')`));
  await assert.rejects(db.query(`insert into office_vorschlaege (vorschlag_id, art, entscheidung, entschieden_von) values ('y', 'skalieren', 'automatisch', 'm_timo')`), 'es gibt keine automatische Entscheidung');
  await assert.rejects(db.query(`insert into office_vorschlaege (vorschlag_id, art, entscheidung) values ('z', 'skalieren', 'angenommen')`), 'ohne Person keine Entscheidung');
  const rechte = await q(`select has_function_privilege('anon', 'team_laden_office()', 'execute') as anon, has_function_privilege('service_role', 'team_laden_office()', 'execute') as dienst, has_function_privilege('authenticated', 'office_guthaben()', 'execute') as auth,
    (select relrowsecurity from pg_class where relname = 'office_vorschlaege') as rls, has_table_privilege('anon', 'office_vorschlaege', 'select') as anon_tabelle`);
  assert.deepEqual(rechte[0], { anon: false, dienst: true, auth: false, rls: true, anon_tabelle: false });
});
