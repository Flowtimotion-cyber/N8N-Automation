// SQL-Test für supabase/team_vorschlaege_kurt_1.sql und _2_prio.sql gegen ein echtes Postgres im Speicher (PGlite).
// PGlite ist keine Abhängigkeit des Repos. Einmalig in einem eigenen Ordner installieren und den Pfad übergeben:
//   npm install @electric-sql/pglite   (z. B. in C:	emp\pg)
//   PGLITE_PFAD=C:/temp/pg/node_modules/@electric-sql/pglite/dist/index.js node --test team/test/sql.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase') + '/';
test('SQL Schritt 1 und 2 (Listen, Trigger, Prio-Umrechnung)', async t => {
if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
const fehler = [];
const db = new PGlite();

const q = async (s, p) => (await db.query(s, p)).rows;
const ok = (c, m) => { if (!c) fehler.push(m); };
await db.exec(`create role anon; create role authenticated; create role service_role;
create table team_aufgaben (aufgabe_id text primary key, titel text not null, beschreibung text, status text default 'offen', prio int default 2, label text, projekt text, verantwortlich text, erstellt_von text, deadline text, agent_geeignet boolean default false, erstellt timestamptz default now(), geaendert timestamptz default now(), erledigt_am timestamptz);
create table team_zeiten (zeit_id text primary key, mitglied_id text, datum text, minuten int, aufgabe_id text, projekt text);
create table kom_benachrichtigungen (id bigint generated always as identity primary key, art text, mitglied_id text, aufgabe_id text, titel text, von text, status text default 'offen');
insert into team_aufgaben (aufgabe_id, titel, prio, verantwortlich, erstellt_von) values ('a1','Alt eins',1,'m_kurt','m_timo'),('a2','Alt zwei',2,'m_timo','m_timo'),('a3','Alt drei',3,null,'m_timo');
insert into team_zeiten (zeit_id, aufgabe_id) values ('z1','a1'),('z2','');`);
const s1 = readFileSync(R + 'team_vorschlaege_kurt_1.sql', 'utf8');
await db.exec(s1); await db.exec(s1);   // zweimal: wiederholbar
let a = await q(`select aufgabe_id, verantwortlich, bearbeiter from team_aufgaben order by 1`);
ok(JSON.stringify(a.map(x => x.bearbeiter)) === '[["m_kurt"],["m_timo"],[]]', 'Backfill bearbeiter ' + JSON.stringify(a.map(x => x.bearbeiter)));
let z = await q(`select zeit_id, aufgaben_ids from team_zeiten order by 1`);
ok(JSON.stringify(z.map(x => x.aufgaben_ids)) === '[["a1"],[]]', 'Backfill aufgaben_ids');
// Altes Programm ändert nur verantwortlich
await db.exec(`update team_aufgaben set bearbeiter = '{m_kurt,m_lillien}' where aufgabe_id='a1'`);
await db.exec(`update team_aufgaben set verantwortlich = 'm_murat' where aufgabe_id='a1'`);
a = await q(`select verantwortlich, bearbeiter from team_aufgaben where aufgabe_id='a1'`);
ok(a[0].verantwortlich === 'm_murat' && JSON.stringify(a[0].bearbeiter) === '["m_murat","m_lillien"]', 'Altes Programm: Zuständig ersetzt ' + JSON.stringify(a[0]));
// Neues Programm: Liste ohne bisherigen Zuständigen
await db.exec(`update team_aufgaben set bearbeiter = '{m_lillien, m_timo, m_lillien, ""}' where aufgabe_id='a1'`);
a = await q(`select verantwortlich, bearbeiter from team_aufgaben where aufgabe_id='a1'`);
ok(a[0].verantwortlich === 'm_lillien' && JSON.stringify(a[0].bearbeiter) === '["m_lillien","m_timo"]', 'Neue Liste: Einzelfeld folgt, Doppelte raus ' + JSON.stringify(a[0]));
// Insert altes Programm
await db.exec(`insert into team_aufgaben (aufgabe_id, titel, verantwortlich, erstellt_von) values ('a4','Neu alt','m_kurt','m_timo')`);
a = await q(`select bearbeiter from team_aufgaben where aufgabe_id='a4'`);
ok(JSON.stringify(a[0].bearbeiter) === '["m_kurt"]', 'Insert altes Programm');
// Benachrichtigungen
const b = await q(`select mitglied_id, aufgabe_id from kom_benachrichtigungen order by id`);
ok(JSON.stringify(b.map(x => x.mitglied_id + ':' + x.aufgabe_id)) === '["m_lillien:a1","m_murat:a1","m_kurt:a4"]', 'Je neu hinzugekommener Person ein Eintrag (wer schon dabei war und der Ersteller nicht)');
// Zeiten
await db.exec(`update team_zeiten set aufgaben_ids = '{a2,a3}' where zeit_id='z1'`);
z = await q(`select aufgabe_id, aufgaben_ids from team_zeiten where zeit_id='z1'`);
ok(z[0].aufgabe_id === 'a2', 'Zeit: Einzelfeld = erste Aufgabe');
await db.exec(`update team_zeiten set aufgabe_id = '' where zeit_id='z1'`);
z = await q(`select aufgabe_id, aufgaben_ids from team_zeiten where zeit_id='z1'`);
ok(z[0].aufgabe_id === '' && z[0].aufgaben_ids.length === 0, 'Zeit: altes Programm „keine Aufgabe“ leert Liste');
await db.exec(`update team_zeiten set aufgabe_id = 'a3' where zeit_id='z2'`);
z = await q(`select aufgaben_ids from team_zeiten where zeit_id='z2'`);
ok(JSON.stringify(z[0].aufgaben_ids) === '["a3"]', 'Zeit: altes Programm setzt Aufgabe');
// Schritt 2
const s2 = readFileSync(R + 'team_vorschlaege_kurt_2_prio.sql', 'utf8');
await db.exec(s2);
await db.exec(`update team_aufgaben set prio = 3 where aufgabe_id='a4'`);   // neuer Wert auf neuer Skala
await db.exec(s2);
a = await q(`select aufgabe_id, prio from team_aufgaben order by 1`);
ok(JSON.stringify(a.map(x => x.prio)) === '[1,5,8,3]', 'Prio umgerechnet, zweiter Lauf rechnet nichts mehr um ' + JSON.stringify(a.map(x => x.prio)));
// Ohne Warteschlange: Schritt 1 läuft trotzdem
const db2 = new PGlite();
await db2.exec(`create role anon; create role authenticated; create role service_role; create table team_aufgaben (aufgabe_id text primary key, titel text, status text, prio int, verantwortlich text, erstellt_von text); create table team_zeiten (zeit_id text primary key, aufgabe_id text);`);
await db2.exec(s1); ok(true, 'Schritt 1 ohne kom_benachrichtigungen');
if (fehler.length) throw new Error(fehler.join(' | '));
});
