-- =====================================================================================================
-- 990_export.sql  ·  Team-Portal (Pilot-Kopie)  ·  PILOTENDE, Schritt 1  ·  Alle Daten exportieren
-- =====================================================================================================
-- Was macht diese Datei?
--   Gibt alle Daten des Portals als JSON aus, zur Übergabe an den Kunden am Pilotende (Löschkonzept:
--   erst Export, dann Löschung). Dafür legt sie eine kleine Funktion team_export() an und ruft sie auf.
--   Sie exportiert jede vorhandene Tabelle mit den Namen team_*, office_*, kom_* und kurs_*, also auch
--   die Optionen, falls eingespielt. Was fehlt, wird einfach übersprungen.
--   NICHT exportiert werden Geheimnisse: die Zugangscodes (team_mitglieder.token), die Kanal-Geheimnisse
--   (kom_einstellungen) und die Rückmelde-Schlüssel des KI Office (office_run_schluessel).
-- Pflicht oder Option?  Nur am Pilotende (oder zwischendurch als Sicherung).
-- Wovon hängt sie ab?   001_basis.sql. Alles andere ist optional.
-- Mehrfach ausführbar?  Ja. Ändert keine Daten.
--
-- SO GEHT'S:
--   A) Alles auf einmal als JSON: diese Datei komplett ausführen. Das Ergebnis ist eine Zelle mit dem
--      ganzen JSON. Zelle anklicken, kopieren, als Datei "export-<firma>-<datum>.json" speichern.
--   B) Einzelne Tabelle als CSV (für Excel): eine der Zeilen ganz unten markieren (z. B.
--      select * from team_aufgaben order by erstellt;), nur diese Markierung ausführen (Run), dann im
--      Ergebnisbereich des SQL-Editors "Export" bzw. "Download CSV" wählen. So für jede Tabelle.
--   Wichtig: Export-Dateien enthalten personenbezogene Daten. Nur verschlüsselt übergeben (z. B. ZIP mit
--   Passwort oder ein geschützter Ordner), nicht per offenem Mailanhang, und die eigene Kopie nach der
--   Übergabe löschen.
-- =====================================================================================================

create or replace function team_export() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  ergebnis jsonb := '{}'::jsonb;
  zeilen jsonb;
begin
  for t in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
       and (table_name like 'team\_%' or table_name like 'office\_%' or table_name like 'kom\_%' or table_name like 'kurs\_%')
       and table_name not in ('kom_einstellungen', 'office_run_schluessel')   -- Geheimnisse bleiben draußen
     order by table_name
  loop
    if t.table_name = 'team_mitglieder' then
      execute 'select coalesce(jsonb_agg(to_jsonb(x) - ''token'' order by x.name), ''[]''::jsonb) from team_mitglieder x' into zeilen;
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', t.table_name) into zeilen;
    end if;
    ergebnis := ergebnis || jsonb_build_object(t.table_name, zeilen);
  end loop;
  return jsonb_build_object(
    'export_am', now(),
    'firma', team_einstellung('firma'),
    'tabellen', ergebnis
  );
end $$;
revoke all on function team_export() from public, anon, authenticated;
grant execute on function team_export() to service_role;

-- Übersicht: welche Tabellen mit wie vielen Zeilen im Export stecken
select key as tabelle, jsonb_array_length(value) as zeilen
  from jsonb_each(team_export() -> 'tabellen') order by key;

-- A) Der ganze Export als eine JSON-Zelle (letztes Ergebnis = das, was der SQL-Editor anzeigt)
select team_export() as export_json;

-- B) Einzelne Tabellen als CSV: Zeile markieren, nur die Markierung ausführen, Ergebnis als CSV herunterladen.
--    Pflichttabellen:
-- select mitglied_id, name, email, funktion, rolle, typ, status, registriert, zuletzt_aktiv from team_mitglieder order by name;
-- select * from team_projekte order by reihenfolge, name;
-- select * from team_aufgaben order by erstellt;
-- select * from team_aufgaben_verlauf order by aufgabe_id, erstellt;
-- select * from team_notizen order by titel;
-- select * from team_notiz_versionen order by notiz_id, gesichert_am;
-- select * from team_vorschlaege order by erstellt;
-- select * from team_systeme order by name;
-- select * from team_papierkorb order by geloescht_am;
-- select * from team_einstellungen order by schluessel;
--    Optionen (nur wenn eingespielt):
-- select * from team_zeiten order by datum;                 -- 100
-- select * from team_abrechnung order by mitglied_id, monat; -- 100
-- select * from team_teilnehmer order by name;              -- 110
-- select * from team_tn_spalten order by reihenfolge;       -- 110
-- select * from team_social order by datum;                 -- 120
-- select * from team_social_ideen order by erstellt;        -- 120
-- select * from team_social_uploads order by erstellt;      -- 120
-- select * from kom_konversationen order by erstellt;       -- 130
-- select * from kom_nachrichten order by zeit;              -- 130
-- select * from kom_benachrichtigungen order by erstellt;   -- 130
-- select * from office_agenten order by agent_id;           -- 140
-- select * from office_runs order by erstellt;              -- 140
-- select * from office_ereignisse order by run_id, zeit;    -- 140
-- select * from office_artefakte order by erstellt;         -- 140
-- select * from office_freigaben order by angefordert_am;   -- 140
-- select * from kurs_community order by erstellt;           -- 150
