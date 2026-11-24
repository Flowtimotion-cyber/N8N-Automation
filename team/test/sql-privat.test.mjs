// SQL-Test für supabase/team_aufgaben_privat.sql gegen ein echtes Postgres im Speicher (PGlite), wie team/test/sql.test.mjs.
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test team/test/sql-privat.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'team_aufgaben_privat.sql'), 'utf8');

test('private Aufgaben: team_laden() filtert, team_laden_plus() liest alles, Datei ist wiederholbar und heilt Neuanlagen', async t => {
  if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
  const db = new PGlite();
  const q = async s => (await db.query(s)).rows;
  // Ausgangslage wie in Supabase: team_laden() (vereinfacht) und team_laden_plus() = team_laden() || Extras
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table team_aufgaben (aufgabe_id text primary key, titel text, prio int, deadline text, bearbeiter text[], erstellt_von text);
    create table team_aufgaben_verlauf (id serial primary key, aufgabe_id text, text text, erstellt timestamptz default now());
    create table team_papierkorb (eintrag_id text, geloescht_am timestamptz default now());
    insert into team_aufgaben values ('a1','offen eins',1,null,'{m_kurt}','m_timo'),('a2','geheim',2,null,'{m_kurt}','m_lillien'),('a3','offen drei',3,null,'{m_timo}','m_timo');
    insert into team_aufgaben_verlauf (aufgabe_id, text) values ('a1','v1'),('a2','v2 geheim'),('a3','v3');
    create or replace function team_laden() returns jsonb language sql stable security definer set search_path = public as $$
      select jsonb_build_object('aufgaben', coalesce((select jsonb_agg(to_jsonb(a) order by a.prio) from team_aufgaben a), '[]'),
        'verlauf', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from team_aufgaben_verlauf v), '[]'), 'mitglieder', '[]'::jsonb);
    $$;
    revoke all on function team_laden() from public, anon, authenticated; grant execute on function team_laden() to service_role;
    create or replace function team_laden_plus() returns jsonb language sql stable security definer set search_path = public as $$
      select team_laden() || jsonb_build_object('papierkorb', coalesce((select jsonb_agg(to_jsonb(p)) from team_papierkorb p), '[]'::jsonb));
    $$;`);
  await db.exec(SQL);
  await db.exec(`update team_aufgaben set privat = true where aufgabe_id = 'a2'`);
  await db.exec(SQL);   // zweimal: wiederholbar
  const laden = async f => (await q(`select ${f}() as j`))[0].j;
  let j = await laden('team_laden');
  assert.deepEqual(j.aufgaben.map(a => a.aufgabe_id), ['a1', 'a3'], 'ohne private, Reihenfolge bleibt');
  assert.deepEqual(j.verlauf.map(v => v.text), ['v1', 'v3']);
  assert.deepEqual(j.mitglieder, [], 'übrige Teile unverändert');
  let p = await laden('team_laden_plus');
  assert.deepEqual(p.aufgaben.map(a => a.aufgabe_id), ['a1', 'a2', 'a3'], 'Portal-API bekommt alles');
  assert.equal(p.aufgaben[1].privat, true);
  assert.ok('papierkorb' in p);
  // Rechte: nur service_role
  const rechte = await q(`select has_function_privilege('anon', 'team_laden()', 'execute') a, has_function_privilege('anon', 'team_laden_alle()', 'execute') b,
    has_function_privilege('service_role', 'team_laden()', 'execute') c, has_function_privilege('service_role', 'team_laden_plus()', 'execute') d`);
  assert.deepEqual(rechte[0], { a: false, b: false, c: true, d: true });
  // Später legt jemand team_laden() neu an (ohne Filter, mit neuem Feld) – Datei erneut ausführen stellt den Filter wieder her
  await db.exec(`create or replace function team_laden() returns jsonb language sql stable security definer set search_path = public as $$
      select jsonb_build_object('aufgaben', coalesce((select jsonb_agg(to_jsonb(a) order by a.prio) from team_aufgaben a), '[]'),
        'verlauf', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from team_aufgaben_verlauf v), '[]'), 'mitglieder', '[]'::jsonb, 'neu', 1);
    $$;`);
  assert.equal((await laden('team_laden')).aufgaben.length, 3, 'Neuanlage hebt den Filter auf (darum steht der Hinweis in der Datei)');
  await db.exec(SQL);
  j = await laden('team_laden');
  assert.deepEqual(j.aufgaben.map(a => a.aufgabe_id), ['a1', 'a3']); assert.equal(j.neu, 1, 'neue Fassung übernommen');
  p = await laden('team_laden_plus');
  assert.equal(p.aufgaben.length, 3); assert.equal(p.neu, 1);
  // Probe am Ende der Datei
  const probe = await q(`select position('team_laden_alle' in pg_get_functiondef('public.team_laden()'::regprocedure)) > 0 as filter_davor,
    position('team_laden_alle()' in pg_get_functiondef('public.team_laden_plus()'::regprocedure)) > 0 as portal_liest_alles,
    (select count(*) from jsonb_array_elements(team_laden()->'aufgaben') e where (e->>'privat')::boolean) = 0 as nichts_privates`);
  assert.deepEqual(probe[0], { filter_davor: true, portal_liest_alles: true, nichts_privates: true });
  // Ohne private Aufgaben und mit leerem Verlauf
  await db.exec(`update team_aufgaben set privat = false; delete from team_aufgaben_verlauf;`);
  j = await laden('team_laden');
  assert.equal(j.aufgaben.length, 3); assert.deepEqual(j.verlauf, []);
});
