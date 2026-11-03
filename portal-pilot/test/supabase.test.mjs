// Tests für das Supabase-Datenbankpaket der Pilot-Kopie (portal-pilot/supabase/).
//
// Aufruf:  node --test portal-pilot/test/supabase.test.mjs
//
// Braucht einen lokalen PostgreSQL (Version 14 oder neuer) und das Programm psql im Pfad. Die Verbindung
// läuft über die üblichen Umgebungsvariablen (PGHOST, PGPORT, PGUSER, PGPASSWORD); ohne sie nimmt psql
// den lokalen Socket und den Namen des angemeldeten Benutzers. Der Benutzer muss Datenbanken und Rollen
// anlegen dürfen (Superuser). Die Testdatenbank heißt pilot_test (PILOT_TEST_DB) und wird bei jedem Lauf
// neu angelegt. Ist kein Postgres erreichbar, werden die Datenbank-Tests übersprungen, nur die
// Dateiprüfungen (PII-Scan, Struktur) laufen.
//
// Was geprüft wird:
//   1. Pflichtmigrationen 001 bis 003 laufen auf leerer Datenbank; team_laden_plus() liefert 23 Schlüssel, alle leer.
//   2. Seed 900: 5 Mitglieder (davon der KI-Agent „Claude (KI)“), 4 Projekte, 12 Aufgaben mit Verlauf, 4 Notizen, 2 Vorschläge,
//      1 Papierkorb-Eintrag, Zugangscodes 48 Hex-Zeichen und eindeutig, Mails nur @musterfirma.example, keine Telefonnummern.
//   3. Zweites Einspielen von 001 bis 900: nichts doppelt, Zugangscodes unverändert.
//   4. Funktionen: Papierkorb (löschen, wiederherstellen samt Verlauf), Notiz-Versionen, Einstellungen.
//   5. Rechte: RLS an allen Tabellen, keine Policies, anon/authenticated ohne Rechte, service_role mit Rechten.
//   6. Optionen 100 bis 150 nacheinander, jede zweimal: team_laden() bricht nicht, Schlüssel bleiben gleich,
//      optionale Listen werden gefüllt, Zeitfenster aus den Einstellungen, Trigger der Option 130.
//   7. 910 (Platzhalter-Sicherung, Admin anlegen, idempotent, optionaler Agent-Block), 990 (Export ohne Geheimnisse),
//      999 (ohne Bestätigung passiert nichts, mit Bestätigung bleibt nichts übrig, zweimal ausführbar).
//   8. Dateiprüfungen: PII-Scan über portal-pilot/supabase/, team_laden() genau einmal definiert,
//      keine Option definiert team_laden() neu, jede Datei hat den Kopfkommentar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const SQL_ORDNER = join(HIER, '..', 'supabase');
const DB = process.env.PILOT_TEST_DB || 'pilot_test';
const ADMIN_DB = process.env.PILOT_ADMIN_DB || 'postgres';
const PFLICHT = ['001_basis.sql', '002_einstellungen.sql', '003_team_laden.sql'];
const OPTIONEN = ['100_option_arbeitszeit.sql', '110_option_teilnehmer.sql', '120_option_social.sql',
  '130_option_kommunikation.sql', '140_option_office.sql', '150_option_kurs.sql'];
const SCHLUESSEL = ['abrechnung', 'aufgaben', 'community', 'einstellungen', 'mitglieder', 'notiz_versionen', 'notizen',
  'office_agenten', 'office_artefakte', 'office_ereignisse', 'office_freigaben', 'office_idempotenz', 'office_run_schluessel',
  'office_runs', 'papierkorb', 'projekte', 'social', 'systeme', 'teilnehmer', 'tn_spalten', 'verlauf', 'vorschlaege', 'zeiten'];

// ---- psql-Hilfen -------------------------------------------------------------------------------------
function psql(args, { db = DB, input, darfFehlschlagen = false } = {}) {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { input, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0 && !darfFehlschlagen) throw new Error(`psql ${args.join(' ')} fehlgeschlagen:\n${r.stderr}\n${r.stdout}`);
  return r;
}
const sql = (text, opt) => psql(['-c', text], opt).stdout.trim();
const json = (text, opt) => JSON.parse(sql(text, opt));
const datei = (name, opt) => psql(['-f', join(SQL_ORDNER, name)], opt);
const dateiText = (name) => readFileSync(join(SQL_ORDNER, name), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'pilot-sql-'));
function dateiMitErsetzung(name, ersetzen) {
  let text = dateiText(name);
  for (const [von, nach] of ersetzen) text = text.split(von).join(nach);
  const pfad = join(tmp, name);
  writeFileSync(pfad, text);
  return psql(['-f', pfad]);
}

let postgresDa = false;
try {
  const r = spawnSync('psql', ['-X', '-At', '-d', ADMIN_DB, '-c', 'select 1'], { encoding: 'utf8' });
  postgresDa = r.status === 0 && r.stdout.trim() === '1';
} catch { postgresDa = false; }
const dbTest = (name, fn) => test(name, { skip: postgresDa ? false : 'kein PostgreSQL erreichbar (psql -d postgres)' }, fn);

// ---- 0. Testdatenbank und Supabase-Rollen -------------------------------------------------------------
dbTest('Testdatenbank neu anlegen, Supabase-Rollen vorhanden', () => {
  sql(`drop database if exists ${DB}`, { db: ADMIN_DB });
  sql(`create database ${DB}`, { db: ADMIN_DB });
  sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  assert.equal(sql(`select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')`), '3');
});

// ---- 1. Pflichtmigrationen -----------------------------------------------------------------------------
dbTest('001 bis 003 laufen auf leerer Datenbank, team_laden_plus() liefert 23 leere Schlüssel', () => {
  for (const f of PFLICHT) datei(f);
  const d = json('select team_laden_plus()');
  assert.deepEqual(Object.keys(d).sort(), SCHLUESSEL);
  for (const k of SCHLUESSEL) {
    if (k === 'einstellungen') continue;
    assert.deepEqual(d[k], [], `Schlüssel ${k} muss eine leere Liste sein`);
  }
  assert.equal(d.einstellungen.firma, 'Meine Firma');
  assert.equal(d.einstellungen.stichdatum_abrechnung, null);
  assert.equal(d.einstellungen.rollen.length, 5);
  assert.deepEqual(d.einstellungen.rollen.map(r => r.rolle), ['admin', 'team', 'dozent', 'vertrieb', 'agent']);
  assert.equal(sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'team\\_%'`), '10');
});

dbTest('team_laden() ohne Optionen: Löschen in einen nicht eingespielten Bereich wird sauber abgelehnt', () => {
  const r = sql(`select team_loeschen('zeit', 'x', 'y')`, { darfFehlschlagen: true });
  assert.equal(r, '');
  const r2 = psql(['-c', `select team_loeschen('zeit', 'x', 'y')`], { darfFehlschlagen: true });
  assert.match(r2.stderr, /nicht eingespielt/);
  const r3 = psql(['-c', `select team_loeschen('unsinn', 'x', 'y')`], { darfFehlschlagen: true });
  assert.match(r3.stderr, /Unbekannte Art/);
});

// ---- 2. Seed -------------------------------------------------------------------------------------------
let tokens1;
dbTest('900 Seed: Musterfirma mit 5 Mitgliedern (davon 1 KI-Agent), 4 Projekten, 12 Aufgaben mit Verlauf, 4 Notizen, 2 Vorschlägen, 1 Papierkorb-Eintrag', () => {
  datei('900_seed_musterfirma.sql');
  const d = json('select team_laden_plus()');
  assert.equal(d.mitglieder.length, 5);
  assert.equal(d.projekte.length, 4);
  assert.equal(d.aufgaben.length, 12);
  assert.equal(d.verlauf.length, 15);
  assert.equal(d.notizen.length, 4);
  assert.equal(d.vorschlaege.length, 2);
  assert.equal(d.papierkorb.length, 1);
  assert.equal(d.einstellungen.firma, 'Musterfirma GmbH');
  assert.deepEqual(d.mitglieder.map(m => m.name), ['Anna Muster', 'Ben Beispiel', 'Clara Probe', 'Claude (KI)', 'Dan Test']);
  assert.deepEqual(d.mitglieder.filter(m => m.rolle === 'admin').map(m => m.name), ['Anna Muster']);
  assert.deepEqual(d.mitglieder.filter(m => m.typ === 'agent').map(m => [m.mitglied_id, m.rolle, m.status, m.email]), [['mf-claude', 'agent', 'aktiv', '']], 'KI-Agent ohne E-Mail');
  assert.deepEqual(d.projekte.map(p => p.name), ['Onboarding Pilot', 'Kundenanfragen', 'Interne Verbesserungen', 'Pilot-Verbesserungen']);
  assert.deepEqual(d.notizen.filter(n => n.titel === 'Was sich geändert hat').map(n => n.projekt), ['Pilot-Verbesserungen']);
  // alle sechs Status kommen vor, jede Aufgabe hat Projekt und Verantwortliche aus dem Seed
  assert.deepEqual([...new Set(d.aufgaben.map(a => a.status))].sort(), ['Erledigt', 'Geplant', 'In Arbeit', 'Offen', 'Wartet', 'Wird getestet']);
  const projekte = new Set(d.projekte.map(p => p.name)), leute = new Set(d.mitglieder.map(m => m.mitglied_id));
  for (const a of d.aufgaben) { assert.ok(projekte.has(a.projekt), a.titel); assert.ok(leute.has(a.verantwortlich), a.titel); }
  for (const v of d.verlauf) assert.ok(d.aufgaben.some(a => a.aufgabe_id === v.aufgabe_id), 'Verlauf ohne Aufgabe: ' + v.aufgabe_id);
  assert.ok(d.aufgaben.filter(a => a.status === 'Erledigt').every(a => a.erledigt_am), 'Erledigte Aufgaben haben erledigt_am');
  // Zugangscodes: 48 Hex-Zeichen, eindeutig; Mails nur in der reservierten Domain; keine Telefonnummern
  for (const m of d.mitglieder) {
    assert.match(m.token, /^[0-9a-f]{48}$/, m.name);
    if (m.typ !== 'agent') assert.match(m.email, /@musterfirma\.example$/, m.name);
    assert.equal(m.telefon, null, m.name);
  }
  assert.equal(new Set(d.mitglieder.map(m => m.token)).size, 5);
  tokens1 = Object.fromEntries(d.mitglieder.map(m => [m.mitglied_id, m.token]));
  // Papierkorb-Eintrag ist eine Aufgabe mit Verlauf und lässt sich wiederherstellen (eigener Test unten)
  assert.equal(d.papierkorb[0].art, 'aufgabe');
  assert.equal(d.papierkorb[0].daten._verlauf.length, 1);
  // Notizen verlinken aufeinander
  assert.ok(d.notizen.some(n => /\[\[Arbeitsweise\]\]/.test(n.inhalt)));
});

// ---- 3. Idempotenz -------------------------------------------------------------------------------------
dbTest('Zweites Einspielen von 001 bis 900: nichts doppelt, Zugangscodes und Firmenname bleiben', () => {
  sql(`select team_einstellung_setzen('firma', '"Eigener Name GmbH"')`);
  for (const f of [...PFLICHT, '900_seed_musterfirma.sql']) datei(f);
  const d = json('select team_laden_plus()');
  assert.equal(d.mitglieder.length, 5);
  assert.equal(d.projekte.length, 4);
  assert.equal(d.aufgaben.length, 12);
  assert.equal(d.verlauf.length, 15);
  assert.equal(d.notizen.length, 4);
  assert.equal(d.vorschlaege.length, 2);
  assert.equal(d.papierkorb.length, 1);
  assert.deepEqual(Object.fromEntries(d.mitglieder.map(m => [m.mitglied_id, m.token])), tokens1, 'Zugangscodes unverändert');
  assert.equal(d.einstellungen.firma, 'Eigener Name GmbH', 'Seed überschreibt einen geänderten Firmennamen nicht');
  assert.equal(sql(`select count(*) from team_einstellungen`), '10');
  sql(`select team_einstellung_setzen('firma', '"Musterfirma GmbH"')`);
});

// ---- 4. Funktionen -------------------------------------------------------------------------------------
dbTest('Papierkorb: Seed-Eintrag wiederherstellen (samt Verlauf), Aufgabe löschen und zurückholen', () => {
  assert.equal(sql(`select team_wiederherstellen('mf-pk1')`), 'mf-a13');
  assert.equal(sql(`select count(*) from team_aufgaben where aufgabe_id = 'mf-a13'`), '1');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = 'mf-a13'`), '1');
  assert.equal(sql(`select count(*) from team_papierkorb`), '0');
  const r = psql(['-c', `select team_wiederherstellen('mf-pk1')`], { darfFehlschlagen: true });
  assert.match(r.stderr, /nicht mehr im Papierkorb/);

  const eintrag = sql(`select team_loeschen('aufgabe', 'mf-a03', 'mf-anna')`);
  assert.match(eintrag, /^pk_/);
  assert.equal(sql(`select count(*) from team_aufgaben where aufgabe_id = 'mf-a03'`), '0');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = 'mf-a03'`), '0', 'Verlauf folgt per cascade');
  const pk = json(`select to_jsonb(p) from team_papierkorb p where eintrag_id = '${eintrag}'`);
  assert.equal(pk.titel, 'Rückmeldungen zur ersten Woche sammeln');
  assert.equal(pk.daten._verlauf.length, 2);
  assert.equal(sql(`select team_wiederherstellen('${eintrag}')`), 'mf-a03');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = 'mf-a03'`), '2');
  assert.equal(json('select team_laden()').aufgaben.length, 13);

  // Notiz löschen und wiederherstellen, bei Titelkonflikt mit Zusatz
  const n = sql(`select team_loeschen('notiz', 'mf-n3', 'mf-anna')`);
  sql(`insert into team_notizen (notiz_id, titel, autor) values ('neu-n3', 'Protokoll Kickoff', 'mf-ben')`);
  assert.equal(sql(`select team_wiederherstellen('${n}')`), 'mf-n3');
  assert.equal(sql(`select titel from team_notizen where notiz_id = 'mf-n3'`), 'Protokoll Kickoff (wiederhergestellt)');
  sql(`delete from team_notizen where notiz_id = 'neu-n3'`);
  sql(`update team_notizen set titel = 'Protokoll Kickoff' where notiz_id = 'mf-n3'`);
});

dbTest('Notiz-Versionen: Trigger sichert die alte Fassung bei Änderung von Inhalt oder Titel', () => {
  sql(`update team_notizen set inhalt = inhalt || ' (Nachtrag)', geaendert_von = 'mf-clara', geaendert = now() where notiz_id = 'mf-n1'`);
  sql(`update team_notizen set geaendert = now() where notiz_id = 'mf-n1'`);   // ohne Inhaltsänderung: keine Version
  const v = json(`select coalesce(jsonb_agg(to_jsonb(v)), '[]') from team_notiz_versionen v where notiz_id = 'mf-n1'`);
  assert.equal(v.length, 1);
  assert.equal(v[0].geaendert_von, 'mf-anna', 'die gesicherte Fassung trägt den vorherigen Autor');
  assert.match(v[0].version_id, /^nv_/);
  assert.equal(json('select team_laden_plus()').notiz_versionen.filter(x => x.notiz_id === 'mf-n1').length, 1);
});

dbTest('Einstellungen: lesen, setzen, als Objekt in team_laden()', () => {
  assert.equal(sql(`select team_einstellung('kurzname')`), '"Musterfirma"');
  assert.equal(sql(`select team_einstellung('gibt_es_nicht')`), '');
  sql(`select team_einstellung_setzen('raeume', '["Vertrieb", "Verwaltung"]')`);
  sql(`select team_einstellung_setzen('neu_schluessel', '42', 'Testwert')`);
  const e = json('select team_einstellungen_alle()');
  assert.deepEqual(e.raeume, ['Vertrieb', 'Verwaltung']);
  assert.equal(e.neu_schluessel, 42);
  assert.equal(sql(`select beschreibung from team_einstellungen where schluessel = 'raeume'`).length > 10, true, 'Beschreibung bleibt beim Setzen erhalten');
  sql(`delete from team_einstellungen where schluessel = 'neu_schluessel'`);
  assert.equal(sql(`select length(team_token_neu())`), '48');
});

// ---- 5. Rechte -----------------------------------------------------------------------------------------
function rechtePruefen() {
  assert.equal(sql(`select string_agg(relname, ',') from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`), '', 'RLS an allen Tabellen');
  assert.equal(sql(`select count(*) from pg_policies where schemaname = 'public'`), '0', 'keine Policies');
  const tabellen = sql(`select string_agg(tablename, ' ') from pg_tables where schemaname = 'public'`).split(' ');
  for (const t of tabellen) {
    for (const rolle of ['anon', 'authenticated']) {
      assert.equal(sql(`select has_table_privilege('${rolle}', '${t}', 'select')`), 'f', `${rolle} darf ${t} nicht lesen`);
      assert.equal(sql(`select has_table_privilege('${rolle}', '${t}', 'insert')`), 'f', `${rolle} darf ${t} nicht schreiben`);
    }
    assert.equal(sql(`select has_table_privilege('service_role', '${t}', 'select')`), 't', `service_role darf ${t} lesen`);
  }
  const funktionen = sql(`select string_agg(oid::regprocedure::text, '|') from pg_proc where pronamespace = 'public'::regnamespace and proname ~ '^(team|kom|social|office|kurs)_'`).split('|');
  assert.ok(funktionen.length >= 10);
  for (const f of funktionen) {
    assert.equal(sql(`select has_function_privilege('anon', '${f}', 'execute')`), 'f', `anon darf ${f} nicht ausführen`);
    assert.equal(sql(`select has_function_privilege('authenticated', '${f}', 'execute')`), 'f', `authenticated darf ${f} nicht ausführen`);
  }
  for (const f of ['team_laden()', 'team_laden_plus()', 'team_loeschen(text,text,text)', 'team_wiederherstellen(text)', 'team_einstellung(text)']) {
    assert.equal(sql(`select has_function_privilege('service_role', '${f}', 'execute')`), 't', `service_role darf ${f}`);
  }
  assert.equal(sql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('team_laden', 'team_laden_plus') and not prosecdef`), '0', 'team_laden* sind security definer');
}
dbTest('Rechte nach den Pflichtdateien: RLS an, keine Policies, anon/authenticated ohne Rechte, service_role mit Rechten', rechtePruefen);

// ---- 6. Optionen ---------------------------------------------------------------------------------------
dbTest('Optionen 100 bis 150 nacheinander, jede zweimal: team_laden() bricht nicht, Schlüssel bleiben gleich', () => {
  const vorher = Object.keys(json('select team_laden_plus()')).sort();
  for (const f of OPTIONEN) {
    datei(f);
    datei(f);   // idempotent
    const d = json('select team_laden_plus()');
    assert.deepEqual(Object.keys(d).sort(), vorher, `Schlüssel unverändert nach ${f}`);
    assert.equal(d.mitglieder.length, 5, `Mitglieder unverändert nach ${f}`);
    assert.equal(d.aufgaben.length, 13, `Aufgaben unverändert nach ${f}`);
  }
  const t = json(`select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
  assert.equal(t.length, 10 + 2 + 2 + 3 + 6 + 7 + 1, 'Tabellen: Pflicht 10, 100: 2, 110: 2, 120: 3, 130: 6, 140: 7, 150: 1');
  assert.equal(sql(`select count(*) from information_schema.columns where table_name = 'team_projekte' and column_name = 'raum'`), '1');
  assert.equal(sql(`select count(*) from information_schema.columns where table_name = 'team_mitglieder' and column_name in ('vertrag_std', 'startguthaben_min', 'abrechnung_ab')`), '3');
  assert.equal(sql(`select count(*) from team_tn_spalten`), '5');
  assert.equal(sql(`select count(*) from office_agenten`), '0', 'keine Agenten-Seeds in der Option 140');
});

dbTest('Rechte nach allen Optionen', rechtePruefen);

dbTest('Option 100: Zeitfenster kommt aus team_einstellungen.stichdatum_abrechnung', () => {
  sql(`insert into team_zeiten (zeit_id, mitglied_id, datum, minuten) values ('z-alt', 'mf-ben', '2024-01-15', 60), ('z-neu', 'mf-ben', to_char(current_date, 'YYYY-MM-DD'), 30)`);
  assert.equal(json('select team_laden()').zeiten.length, 1, 'ohne Stichdatum: nur die letzten 120 Tage');
  sql(`select team_einstellung_setzen('stichdatum_abrechnung', '"2024-01-01"')`);
  assert.equal(json('select team_laden()').zeiten.length, 2, 'mit Stichdatum: alles ab dem Stichdatum');
  // abrechnung_ab der Menschen wird beim (erneuten) Einspielen aus dem Stichdatum gefüllt, wenn leer
  datei('100_option_arbeitszeit.sql');
  assert.equal(sql(`select count(*) from team_mitglieder where typ = 'mensch' and abrechnung_ab = '2024-01-01'`), '4');
  sql(`update team_mitglieder set abrechnung_ab = '2025-01-01' where mitglied_id = 'mf-anna'`);
  datei('100_option_arbeitszeit.sql');
  assert.equal(sql(`select abrechnung_ab from team_mitglieder where mitglied_id = 'mf-anna'`), '2025-01-01', 'eigener Wert bleibt');
  sql(`select team_einstellung_setzen('stichdatum_abrechnung', 'null')`);
  sql(`delete from team_zeiten where zeit_id in ('z-alt', 'z-neu')`);
});

dbTest('Option 110: Haken setzen und zurücknehmen, Teilnehmer in team_laden_plus(), Papierkorb-Art teilnehmer', () => {
  sql(`insert into team_teilnehmer (tn_id, name, massnahme, status) values ('tn1', 'Test Person', 'Onboarding Frühjahr', 'aktiv')`);
  sql(`select team_tn_haken('tn1', 'vertrag', 'ja', null, 'mf-anna')`);
  let t = json('select team_laden_plus()').teilnehmer;
  assert.equal(t.length, 1);
  assert.equal(t[0].haken.vertrag.s, 'ja');
  assert.equal(t[0].haken.vertrag.von, 'mf-anna');
  sql(`select team_tn_haken('tn1', 'vertrag', '', null, 'mf-anna')`);
  assert.deepEqual(json('select team_laden_plus()').teilnehmer[0].haken, {});
  assert.match(psql(['-c', `select team_tn_haken('tn1', 'gibt_es_nicht', 'ja', null, 'x')`], { darfFehlschlagen: true }).stderr, /Unbekannte Spalte/);
  const e = sql(`select team_loeschen('teilnehmer', 'tn1', 'mf-anna')`);
  assert.equal(sql(`select count(*) from team_teilnehmer`), '0');
  assert.equal(sql(`select team_wiederherstellen('${e}')`), 'tn1');
  sql(`delete from team_teilnehmer where tn_id = 'tn1'`);
});

dbTest('Option 120: Veröffentlichungs-Queue (fällig, erledigt, Fehler), Ideen, Uploads nur mit Einwilligung', () => {
  sql(`insert into team_social (post_id, datum, uhrzeit, kanal, thema, status, freigegeben_von) values
       ('s1', '2020-01-01', '09:00', 'Kanal A', 'Fällig und freigegeben', 'Geplant', 'mf-anna'),
       ('s2', '2020-01-01', '09:00', 'Kanal A', 'Ohne Freigabe', 'Geplant', null),
       ('s3', '2099-01-01', '09:00', 'Kanal A', 'In der Zukunft', 'Geplant', 'mf-anna')`);
  assert.equal(sql(`select count(*) from social_faellig()`), '0', 'ohne Kanalliste nichts');
  assert.equal(sql(`select string_agg(post_id, ',') from social_faellig(array['Kanal A'])`), 's1');
  assert.equal(sql(`select count(*) from social_faellig(array['Kanal A'])`), '0', 'gesperrt, solange in_arbeit_seit frisch ist');
  sql(`select social_erledigt('s1', 'plattform-1', 'https://www.example.com/post/1')`);
  assert.equal(sql(`select status || '|' || link from team_social where post_id = 's1'`), 'Veröffentlicht|https://www.example.com/post/1');
  sql(`update team_social set freigegeben_von = 'mf-anna' where post_id = 's2'`);
  for (let i = 1; i <= 3; i++) sql(`select social_fehler('s2', 'Fehler ${i}')`);
  assert.equal(sql(`select status || '|' || versuche || '|' || coalesce(freigegeben_von, '-') from team_social where post_id = 's2'`), 'Zur Freigabe|3|-');
  assert.equal(json('select team_laden()').social.length, 3);
  assert.equal(sql(`select team_idee_speichern('{"idee_id": "i1", "titel": "Beispiel", "link": "https://www.example.com/x"}', 'mf-ben')`), 'i1');
  sql(`select team_idee_speichern('{"idee_id": "i1", "titel": "Beispiel geändert"}', 'mf-clara')`);
  assert.equal(sql(`select titel || '|' || geaendert_von from team_social_ideen where idee_id = 'i1'`), 'Beispiel geändert|mf-clara');
  assert.match(psql(['-c', `select team_upload_anlegen('{"upload_id": "u1", "pfad": "p", "dateiname": "a.mp4", "einwilligung": false}', 'mf-ben')`], { darfFehlschlagen: true }).stderr, /Ohne Einwilligung/);
  sql(`select team_upload_anlegen('{"upload_id": "u1", "pfad": "2026/01/u1_a.mp4", "dateiname": "a.mp4", "einwilligung": true}', 'mf-ben')`);
  assert.equal(sql(`select stil || '|' || status from team_social_uploads where upload_id = 'u1'`), '|hochladen', 'kein firmenspezifischer Stil-Standard');
  sql(`select team_upload_status('u1', 'hochgeladen', 'mf-ben')`);
  assert.equal(sql(`select status from team_social_uploads where upload_id = 'u1'`), 'hochgeladen');
  const e = sql(`select team_loeschen('idee', 'i1', 'mf-anna')`);
  assert.equal(sql(`select team_wiederherstellen('${e}')`), 'i1');
  // Lokal gibt es meist kein Storage-Schema (Bucket-Teil der 120 wird übersprungen); existiert storage.buckets
  // doch (z. B. Supabase CLI), muss die Option den Bucket angelegt haben.
  if (sql(`select to_regclass('storage.buckets') is null`) === 'f') {
    assert.equal(sql(`select count(*) from storage.buckets where id in ('medien-roh', 'social-ideen')`), '2', 'Buckets der Option 120 angelegt');
  }
});

dbTest('Option 130: Zuweisung einer Aufgabe landet in der Benachrichtigungs-Warteschlange; Eingang idempotent; Signatur fail closed', () => {
  sql(`delete from kom_benachrichtigungen`);
  sql(`insert into team_aufgaben (aufgabe_id, titel, verantwortlich, erstellt_von) values ('k1', 'Von Anna an Dan', 'mf-dan', 'mf-anna'), ('k2', 'Eigene Aufgabe', 'mf-ben', 'mf-ben')`);
  assert.equal(sql(`select string_agg(aufgabe_id, ',') from kom_benachrichtigungen`), 'k1', 'eigene Aufgaben lösen keine Benachrichtigung aus');
  const holen = json(`select kom_benachrichtigungen_holen()`);
  assert.equal(holen.liste.length, 0, 'Dan hat keine Nummer und keine Einwilligung: wird übersprungen');
  assert.equal(sql(`select status from kom_benachrichtigungen where aufgabe_id = 'k1'`), 'uebersprungen');
  const e1 = json(`select kom_eingang('{"konversation_id": "wa:1", "kanal": "whatsapp", "kontakt_extern": "1", "nachricht_id": "n1", "text": "Hallo", "zeit": "2026-01-01T10:00:00Z"}')`);
  const e2 = json(`select kom_eingang('{"konversation_id": "wa:1", "kanal": "whatsapp", "kontakt_extern": "1", "nachricht_id": "n1", "text": "Hallo", "zeit": "2026-01-01T10:00:00Z"}')`);
  assert.equal(e1.neu, true); assert.equal(e2.neu, false); assert.equal(e1.erstkontakt, true); assert.equal(e1.modus, 'ki');
  assert.deepEqual(json(`select kom_wa_signatur_ok('body', 'sha256=abc')`), { ok: false }, 'ohne Secret wird nichts angenommen');
  assert.equal(sql(`select kom_norm_tel('0049 30 / 123')`), '4930123', '00 am Anfang fällt weg');
  assert.equal(sql(`select kom_norm_tel('030 123')`), '4930123', 'führende 0 wird zu 49');
  assert.equal(sql(`select kom_norm_tel('49 (0)30 123')`), '4930123', 'eingeschobene 0 nach der Landesvorwahl fällt weg');
  assert.equal(sql(`select kom_norm_tel('')`), '');
  sql(`delete from team_aufgaben where aufgabe_id in ('k1', 'k2')`);
  sql(`delete from kom_konversationen`);
  assert.equal(json('select team_laden()').aufgaben.length, 13);
});

dbTest('Option 140 und 150: leere Listen, Run-Fenster, Community-Fenster', () => {
  sql(`insert into team_mitglieder (mitglied_id, name, rolle, typ, status, token) values ('agent-test', 'Test-Agent', 'agent', 'agent', 'aktiv', team_token_neu())`);
  sql(`insert into office_agenten (agent_id, name, raum, mitglied_id, projekte) values ('tester', 'Tester', 'Verwaltung', 'agent-test', array['Onboarding Pilot'])`);
  sql(`insert into office_runs (run_id, projekt, auftraggeber, agent_id, auftrag, idempotenzschluessel, status, erstellt) values
       ('r-alt', 'Onboarding Pilot', 'mf-anna', 'tester', 'alt', 'k-alt', 'abgeschlossen', now() - interval '100 days'),
       ('r-offen', 'Onboarding Pilot', 'mf-anna', 'tester', 'offen', 'k-offen', 'in_arbeit', now() - interval '100 days'),
       ('r-neu', 'Onboarding Pilot', 'mf-anna', 'tester', 'neu', 'k-neu', 'abgeschlossen', now())`);
  sql(`insert into office_run_schluessel (run_id, schluessel) values ('r-neu', 'geheim')`);
  sql(`insert into kurs_community (eintrag_id, art, text, erstellt) values ('c-alt', 'frage', 'alt', now() - interval '200 days'), ('c-neu', 'frage', 'neu', now())`);
  const d = json('select team_laden()');
  assert.deepEqual(d.office_runs.map(r => r.run_id).sort(), ['r-neu', 'r-offen'], 'alte abgeschlossene Runs fallen raus, offene bleiben');
  assert.equal(d.office_agenten.length, 1);
  assert.equal(d.office_run_schluessel.length, 1);
  assert.deepEqual(d.community.map(c => c.eintrag_id), ['c-neu']);
  assert.equal(d.mitglieder.length, 6);
  sql(`delete from office_runs; delete from office_agenten; delete from team_mitglieder where mitglied_id = 'agent-test'; delete from kurs_community`);
});

// ---- 7. Erster Admin, Export, Löschen -------------------------------------------------------------------
dbTest('910: bricht mit Platzhaltern ab; mit Namen und Mail legt es genau einen Admin an, auch bei Wiederholung; Agent-Block nur mit agent_anlegen = true', () => {
  const r = datei('910_erster_admin.sql', { darfFehlschlagen: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /HIER_NAME und HIER_MAIL/);
  assert.equal(sql(`select count(*) from team_mitglieder`), '5');
  const ersetzen = [['HIER_NAME', 'Erika Beispiel'], ['HIER_MAIL', 'Erika@Beispiel.example']];
  const a = dateiMitErsetzung('910_erster_admin.sql', ersetzen);
  assert.match(a.stdout, /Erika Beispiel\|erika@beispiel\.example\|admin\|aktiv\|[0-9a-f]{48}/);
  assert.ok(!/agent-claude/.test(a.stdout) && sql(`select count(*) from team_mitglieder where mitglied_id = 'agent-claude'`) === '0', 'ohne agent_anlegen kein Agent');
  dateiMitErsetzung('910_erster_admin.sql', ersetzen);
  assert.equal(sql(`select count(*) from team_mitglieder where email = 'erika@beispiel.example'`), '1');
  assert.equal(sql(`select count(*) from team_mitglieder`), '6');
  // Optionaler Block: Agent „Claude (KI)“, Projekt „Pilot-Verbesserungen“ und Notiz „Was sich geändert hat“ (aus dem Seed schon da: bleibt, nichts doppelt)
  const mitAgent = ersetzen.concat([['agent_anlegen boolean := false', 'agent_anlegen boolean := true']]);
  const b = dateiMitErsetzung('910_erster_admin.sql', mitAgent);
  assert.match(b.stdout, /Claude \(KI\)\|\|agent\|aktiv\|[0-9a-f]{48}/, 'Code des Agenten in der Ausgabe');
  assert.equal(sql(`select rolle || '|' || typ || '|' || status from team_mitglieder where mitglied_id = 'agent-claude'`), 'agent|agent|aktiv');
  const agentToken = sql(`select token from team_mitglieder where mitglied_id = 'agent-claude'`);
  dateiMitErsetzung('910_erster_admin.sql', mitAgent);
  assert.equal(sql(`select token from team_mitglieder where mitglied_id = 'agent-claude'`), agentToken, 'Zugangscode des Agenten bleibt bei Wiederholung');
  assert.equal(sql(`select count(*) from team_mitglieder`), '7');
  assert.equal(sql(`select count(*) from team_projekte where name = 'Pilot-Verbesserungen'`), '1', 'Projekt aus dem Seed bleibt, nichts doppelt');
  assert.equal(sql(`select count(*) from team_notizen where lower(titel) = 'was sich geändert hat'`), '1');
  sql(`delete from team_mitglieder where mitglied_id = 'agent-claude'`);
});

dbTest('990: Export enthält alle vorhandenen Tabellen, aber keine Zugangscodes und keine Geheimnisse', () => {
  sql(`insert into kom_einstellungen (schluessel, wert) values ('wa_app_secret', 'streng-geheim')`);
  const r = datei('990_export.sql');
  assert.match(r.stdout, /team_aufgaben\|13/);
  const e = json('select team_export()');
  assert.equal(e.firma, 'Musterfirma GmbH');
  const tabellen = Object.keys(e.tabellen);
  assert.ok(tabellen.includes('team_mitglieder') && tabellen.includes('team_zeiten') && tabellen.includes('office_runs') && tabellen.includes('kurs_community'));
  assert.ok(!tabellen.includes('kom_einstellungen'), 'Kanal-Geheimnisse nicht im Export');
  assert.ok(!tabellen.includes('office_run_schluessel'), 'Rückmelde-Schlüssel nicht im Export');
  assert.equal(e.tabellen.team_mitglieder.length, 6);
  for (const m of e.tabellen.team_mitglieder) assert.equal('token' in m, false, 'kein Token im Export');
  assert.ok(!JSON.stringify(e).includes('streng-geheim'));
  assert.equal(e.tabellen.team_aufgaben.length, 13);
  assert.equal(e.tabellen.team_einstellungen.length, 10);
});

dbTest('999: ohne Bestätigung passiert nichts; mit Bestätigung bleibt nichts übrig; zweiter Lauf ist harmlos', () => {
  const r = datei('999_loeschen.sql', { darfFehlschlagen: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Nichts gelöscht/);
  assert.equal(sql(`select count(*) from team_mitglieder`), '6');
  assert.equal(json('select team_laden()').aufgaben.length, 13);

  const ersetzen = [[`bestaetigung text := 'NEIN'`, `bestaetigung text := 'JA, ALLES LOESCHEN'`]];
  const ok = dateiMitErsetzung('999_loeschen.sql', ersetzen);
  assert.match(ok.stderr, /Verbleibende Portal-Objekte in public: 0/);
  assert.equal(sql(`select count(*) from information_schema.tables where table_schema = 'public' and (table_name like 'team\\_%' or table_name like 'office\\_%' or table_name like 'kom\\_%' or table_name like 'kurs\\_%')`), '0');
  assert.equal(sql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname ~ '^(team|office|kom|kurs|social)_'`), '0');
  assert.equal(sql(`select count(*) from pg_trigger where not tgisinternal`), '0');
  assert.equal(sql(`select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'v', 'S')`), '0', 'public ist leer');
  const nochmal = dateiMitErsetzung('999_loeschen.sql', ersetzen);
  assert.equal(nochmal.status, 0);

  // Danach lässt sich alles wieder frisch einspielen (Pilot neu starten)
  for (const f of [...PFLICHT, '900_seed_musterfirma.sql']) datei(f);
  assert.equal(json('select team_laden()').mitglieder.length, 5);
});

// ---- 8. Dateiprüfungen (laufen auch ohne Postgres) -------------------------------------------------------
const DATEIEN = readdirSync(SQL_ORDNER).filter(f => f.endsWith('.sql')).sort();

test('PII-Scan: keine Firmen-, Personen- oder Zugangsdaten im Paket', () => {
  // Wortliste zerlegt, damit diese Datei beim Scan über ganz portal-pilot/ (test/pii.test.mjs) selbst sauber bleibt
  const w = (...t) => new RegExp(t.join(''), 'i');
  const muster = [
    w('mom', 'entum'), w('herm', 'etik'), w('ti', 'mo'), w('ku', 'rt'), w('mu', 'rat'), w('kar', 'sten'), w('lil', 'lien'), w('immo', '-job'), w('q', 'cg'), w('az', 'av'),
    w('llh', 'wmz'), w('hm-', 'storage'), w('github', '\\.io'), w('twe', 'nty'), w('insta', 'gram'), w('tele', 'gram'), /\d{9,}/, /eyJ/, /sk-/i, w('\\+', '49')
  ];
  const treffer = [];
  const zuScannen = readdirSync(SQL_ORDNER).sort();   // alle Dateien im Paket, ausdrücklich auch README.md
  assert.ok(zuScannen.includes('README.md'), 'README.md liegt im Paket und wird mitgescannt');
  for (const f of zuScannen) {
    const zeilen = readFileSync(join(SQL_ORDNER, f), 'utf8').split('\n');
    zeilen.forEach((z, i) => { for (const m of muster) if (m.test(z)) treffer.push(`${f}:${i + 1} (${m}) ${z.trim().slice(0, 80)}`); });
  }
  assert.deepEqual(treffer, []);
});

test('team_laden() und team_laden_plus() werden genau einmal definiert, und zwar in 003', () => {
  for (const fn of ['team_laden', 'team_laden_plus']) {
    const wo = DATEIEN.filter(f => new RegExp(`create or replace function ${fn}\\(\\)`).test(dateiText(f)));
    assert.deepEqual(wo, ['003_team_laden.sql'], fn);
  }
  for (const f of OPTIONEN) assert.ok(!/create or replace function team_(laden|laden_plus|papierkorb_ziel)\(/.test(dateiText(f)), `${f} definiert keine Kernfunktion neu`);
});

test('Jede SQL-Datei hat den Kopfkommentar (Was, Pflicht oder Option, Abhängigkeit) und 1xx-Dateien keine Seeds mit Agenten', () => {
  const erwartet = ['001_basis.sql', '002_einstellungen.sql', '003_team_laden.sql', ...OPTIONEN, '900_seed_musterfirma.sql', '910_erster_admin.sql', '990_export.sql', '999_loeschen.sql'];
  assert.deepEqual(DATEIEN, erwartet);
  for (const f of DATEIEN) {
    const kopf = dateiText(f).split('\n').slice(0, 40).join('\n');
    assert.match(kopf, /Was macht diese Datei\?/, f);
    assert.match(kopf, /Pflicht oder Option\?/, f);
    assert.match(kopf, /Mehrfach ausführbar\?/, f);
    if (f !== '001_basis.sql') assert.match(kopf, /Wovon hängt sie ab\?|Wovon h/, f);
  }
  assert.ok(!/^\s*insert into office_agenten/m.test(dateiText('140_option_office.sql')), '140 ohne Agenten-Seed');
  assert.ok(/insert into team_tn_spalten/.test(dateiText('110_option_teilnehmer.sql')) && /BEISPIEL/.test(dateiText('110_option_teilnehmer.sql')), '110 markiert die Spalten als Beispiel');
  assert.ok(!/2026-07-01|2026-10-05/.test(DATEIEN.map(dateiText).join('\n')), 'kein festes Stichdatum im Paket');
  assert.ok(/stichdatum_abrechnung/.test(dateiText('100_option_arbeitszeit.sql')));
});
