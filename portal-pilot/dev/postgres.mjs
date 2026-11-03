// Postgres-Betriebsart des Testservers: Testdatenbank anlegen und die Migrationen aus portal-pilot/supabase/ einspielen (über psql).
// Reihenfolge wie in supabase/README.md: 001, 002, 003, 900 (Musterfirma). Dazu die Optionen 100 (Arbeitszeit) und 120 (Social Media),
// damit die Modul-Schalter im Test eine Tabelle vorfinden, und die Beispielzeilen aus dev/testdaten.mjs (optionaleDaten).
// Braucht psql im Pfad und einen Benutzer, der Datenbanken und Rollen anlegen darf (PGHOST/PGPORT/PGUSER/PGPASSWORD oder lokaler Socket).
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { psql, psqlDa, PostgresRest } from './postgrest.mjs';
import { optionaleDaten } from './testdaten.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
export const SQL_ORDNER = join(hier, '..', 'supabase');
export const ADMIN_DB = process.env.PILOT_ADMIN_DB || 'postgres';
export const PFLICHT = ['001_basis.sql', '002_einstellungen.sql', '003_team_laden.sql'];
export { psql, psqlDa };

/** Datenbank neu anlegen und füllen. optionen: Liste weiterer SQL-Dateien (Standard 100 und 120). */
export async function datenbankAnlegen(db, { seed = '900_seed_musterfirma.sql', optionen = ['100_option_arbeitszeit.sql', '120_option_social.sql'], beispiele = true } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(db)) throw new Error('Ungültiger Datenbankname: ' + db);
  psql(ADMIN_DB, `drop database if exists ${db}`);
  psql(ADMIN_DB, `create database ${db}`);
  psql(db, `do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  for (const f of PFLICHT.concat(seed ? [seed] : [], optionen)) psql(db, readFileSync(join(SQL_ORDNER, f), 'utf8'));
  const rest = new PostgresRest(db);
  if (beispiele) {
    for (const [tab, zeilen] of Object.entries(optionaleDaten())) {
      if (!zeilen.length) continue;
      for (const z of zeilen) { const r = await rest.anfrage('POST', tab, z, { prefer: 'return=minimal' }); if (r.statusCode >= 300 && r.statusCode !== 404) throw new Error(tab + ': ' + r.text); }
    }
  }
  return rest;
}

/** Zugangscodes aus der Datenbank: { mitglied_id: token } */
export function tokensLesen(db) {
  const out = psql(db, `select coalesce(jsonb_object_agg(mitglied_id, token), '{}'::jsonb) from team_mitglieder`).out.trim();
  return JSON.parse(out || '{}');
}
