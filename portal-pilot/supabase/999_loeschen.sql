-- =====================================================================================================
-- 999_loeschen.sql  ·  Team-Portal (Pilot-Kopie)  ·  PILOTENDE, Schritt 2  ·  ALLES LÖSCHEN
-- =====================================================================================================
--
--   ███  ZWEIMAL LESEN, BEVOR DU AUF "RUN" KLICKST  ███
--
--   Diese Datei löscht ALLE Daten und ALLE Tabellen des Portals in diesem Supabase-Projekt:
--   Mitglieder, Projekte, Aufgaben, Verlauf, Notizen, Versionen, Vorschläge, Systeme, Papierkorb,
--   Einstellungen und, falls eingespielt, Arbeitszeit, Teilnehmer, Social Media (inklusive der
--   Storage-Buckets mit Videos und Bildern), Kommunikation, KI Office und Kurs-Community.
--   Dazu alle Funktionen und Trigger des Portals.
--
--   Das lässt sich NICHT rückgängig machen. Es gibt keinen Papierkorb für diese Aktion.
--   Supabase-Backups beim Anbieter können die Daten noch einige Tage enthalten (Plan prüfen).
--
--   VORHER:  1. 990_export.sql ausführen und den Export dem Kunden übergeben.
--            2. Prüfen, dass du im RICHTIGEN Supabase-Projekt bist (Projektname oben links).
--            3. n8n-Workflows dieses Kunden deaktivieren (sonst laufen sie ins Leere).
--            4. Falls Option 120 (Social) eingespielt war: in Supabase unter Storage die beiden Buckets
--               "medien-roh" und "social-ideen" leeren ("Empty bucket") und löschen. Das "delete from
--               storage.objects" unten entfernt nur die Datenbankzeilen, nicht die Dateien selbst.
--               Alternativ reicht es, am Ende das ganze Supabase-Projekt zu löschen (siehe DANACH).
--   DANACH:  Supabase-Projekt pausieren oder löschen (Settings → General), n8n-Credential löschen,
--            Löschung mit Datum im Löschprotokoll vermerken.
--
-- Was macht diese Datei?  Siehe oben: sie löscht das komplette Portal in diesem Supabase-Projekt.
-- Pflicht oder Option?    Nur am Pilotende, nach dem Export (990_export.sql).
-- Wovon hängt sie ab?     Von nichts. Sie läuft auch, wenn nur ein Teil der Dateien eingespielt war.
-- Mehrfach ausführbar?    Ja (if exists). Beim zweiten Mal passiert nichts mehr.
--
-- SICHERHEITSABFRAGE: Die Datei tut nichts, solange unten in der Zeile
--      bestaetigung text := 'NEIN';
--   das Wort NEIN steht. Erst wenn du es durch   JA, ALLES LOESCHEN   ersetzt (genau so, mit Komma),
--   wird gelöscht. Das ist Absicht: ein Klick zu viel soll nichts kaputt machen.
-- =====================================================================================================

do $$
declare
  bestaetigung text := 'NEIN';     -- <<< hier 'JA, ALLES LOESCHEN' eintragen, wenn du es wirklich willst
  r record;
  n int;
begin
  if bestaetigung <> 'JA, ALLES LOESCHEN' then
    raise exception 'Nichts gelöscht. Sicherheitsabfrage steht auf "%". Zum Löschen den Kopfkommentar lesen und die Bestätigung eintragen.', bestaetigung;
  end if;

  -- 1) Storage-Buckets der Option Social (nur bei Supabase): erst die Objektzeilen, dann die Buckets.
  --    Achtung: Das löscht nur die Datenbankzeilen. Die Dateien im Storage vorher über die Oberfläche
  --    entfernen ("Empty bucket"), oder danach das Projekt löschen.
  if to_regclass('storage.objects') is not null then
    delete from storage.objects where bucket_id in ('medien-roh', 'social-ideen');
    delete from storage.buckets where id in ('medien-roh', 'social-ideen');
    raise notice 'Storage-Buckets medien-roh und social-ideen aus der Datenbank entfernt (Dateien vorher über Storage → Empty bucket löschen).';
  end if;

  -- 2) Trigger auf Tabellen, die bleiben könnten (zur Sicherheit, bevor die Tabellen fallen)
  if to_regclass('public.team_aufgaben') is not null then
    execute 'drop trigger if exists kom_aufgabe_zugewiesen on team_aufgaben';
  end if;
  if to_regclass('public.team_notizen') is not null then
    execute 'drop trigger if exists team_notiz_version on team_notizen';
  end if;

  -- 3) Tabellen (Reihenfolge egal dank cascade; alle mit if exists)
  --    Option 140 KI Office
  drop table if exists office_freigaben, office_artefakte, office_ereignisse, office_run_schluessel, office_idempotenz, office_runs, office_agenten cascade;
  --    Option 130 Kommunikation
  drop table if exists kom_benachrichtigungen, kom_audit, kom_status_ereignisse, kom_nachrichten, kom_konversationen, kom_einstellungen cascade;
  --    Option 150 Kurs
  drop table if exists kurs_community cascade;
  --    Option 120 Social
  drop table if exists team_social_uploads, team_social_ideen, team_social cascade;
  --    Option 110 Teilnehmer
  drop table if exists team_teilnehmer, team_tn_spalten cascade;
  --    Option 100 Arbeitszeit
  drop table if exists team_abrechnung, team_zeiten cascade;
  --    Pflicht 001 und 002
  drop table if exists team_papierkorb, team_notiz_versionen, team_notizen, team_aufgaben_verlauf, team_aufgaben,
    team_vorschlaege, team_systeme, team_projekte, team_mitglieder, team_einstellungen cascade;

  -- 4) Funktionen (explizit, damit man sieht, was weg ist)
  drop function if exists team_laden_plus(), team_laden(), team_laden_optional(text, text), team_laden_office_fenster(),
    team_einstellung(text), team_einstellungen_alle(), team_einstellung_setzen(text, jsonb, text),
    team_token_neu(), team_notiz_version(), team_papierkorb_ziel(text), team_loeschen(text, text, text), team_wiederherstellen(text),
    team_tn_haken(text, text, text, date, text),
    social_faellig(text[]), social_erledigt(text, text, text), social_fehler(text, text),
    team_idee_speichern(jsonb, text), team_upload_anlegen(jsonb, text), team_upload_status(text, text, text, text, text),
    kom_eingang(jsonb), kom_status(jsonb), kom_ausgang(jsonb), kom_modus_setzen(text, text, text),
    kom_wa_signatur_ok(text, text), kom_wa_verify_ok(text), kom_norm_tel(text), kom_team_kontakt(text), kom_team_token(text),
    kom_aufgabe_zugewiesen(), kom_benachrichtigungen_holen(), kom_benachrichtigung_ergebnis(bigint, boolean, text),
    team_export() cascade;

  -- 5) Sicherheitsnetz: was mit diesen Namensanfängen noch übrig ist, auch löschen (z. B. aus älteren Fassungen)
  for r in
    select c.relname as name, c.relkind as art from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
       and c.relname ~ '^(team|office|kom|kurs|social)_'
  loop
    execute format('drop %s if exists public.%I cascade', case r.art when 'r' then 'table' when 'v' then 'view' else 'sequence' end, r.name);
    raise notice 'Zusätzlich gelöscht: %', r.name;
  end loop;
  for r in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(team|office|kom|kurs|social)_'
  loop
    execute format('drop function if exists %s cascade', r.sig);
    raise notice 'Zusätzlich gelöscht: %', r.sig;
  end loop;

  select count(*) into n from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname ~ '^(team|office|kom|kurs|social)_';
  raise notice 'Fertig. Verbleibende Portal-Objekte in public: % (muss 0 sein).', n;
end $$;

-- Kontrolle: beide Abfragen müssen 0 Zeilen liefern
select table_name from information_schema.tables
 where table_schema = 'public' and (table_name like 'team\_%' or table_name like 'office\_%' or table_name like 'kom\_%' or table_name like 'kurs\_%');
select proname from pg_proc
 where pronamespace = 'public'::regnamespace and proname ~ '^(team|office|kom|kurs|social)_';
