-- =====================================================================================================
-- 910_erster_admin.sql  ·  Team-Portal (Pilot-Kopie)  ·  VORLAGE  ·  Ersten Admin anlegen (ohne Musterdaten)
-- =====================================================================================================
-- Was macht diese Datei?
--   Legt das erste Teammitglied mit Rolle "admin" an und zeigt dessen Zugangscode. Alle weiteren
--   Mitglieder legt der Admin danach im Portal unter "Team" an.
-- Pflicht oder Option?  Eine von beiden: entweder 900_seed_musterfirma.sql (Beispielteam) oder diese Datei.
-- Wovon hängt sie ab?   001_basis.sql (team_mitglieder, team_token_neu).
-- Mehrfach ausführbar?  Ja. Gibt es die Mail-Adresse schon, wird nichts angelegt, nur der Code angezeigt.
--
-- SO GEHT'S (3 Schritte):
--   1. Unten die zwei Platzhalter ersetzen: HIER_NAME (z. B. Erika Beispiel) und HIER_MAIL (ihre Firmen-Mail).
--      Die einfachen Anführungszeichen stehen lassen.
--   2. Optional: Firmenname und Kurzname setzen (Zeilen unter "Optional").
--   3. Datei ausführen. Die letzte Zeile der Ausgabe zeigt den Zugangscode (token).
--      Login-Link: <Portal-Adresse>#z=<token>   -  bitte nur persönlich weitergeben, nie in einen Gruppenchat.
--      (Doppelkreuz, nicht Fragezeichen: den Teil hinter # schickt der Browser nie an einen Server.)
-- Zugangscode später wieder anzeigen:  select name, rolle, token from team_mitglieder order by name;
-- Zugangscode erneuern (alter Link wird ungültig):
--      update team_mitglieder set token = team_token_neu() where email = 'HIER_MAIL';
-- =====================================================================================================

-- Sicherung: bricht ab, solange die Platzhalter nicht ersetzt sind
do $$
begin
  if 'HIER_NAME' = 'HIER_' || 'NAME' or 'HIER_MAIL' = 'HIER_' || 'MAIL' then
    raise exception 'Bitte zuerst HIER_NAME und HIER_MAIL in dieser Datei ersetzen (siehe Kopfkommentar).';
  end if;
end $$;

-- Admin anlegen (nur, wenn es die Mail-Adresse noch nicht gibt)
insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token, registriert)
select 'm_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'),
       'HIER_NAME', lower('HIER_MAIL'), 'Administration', 'admin', 'mensch', 'aktiv', team_token_neu(), now()
 where not exists (select 1 from team_mitglieder where lower(email) = lower('HIER_MAIL'));

-- Optional: Firmenname und Kurzname (Zeilen entkommentieren und anpassen; JSON braucht die doppelten Anführungszeichen)
-- select team_einstellung_setzen('firma',    '"Beispiel GmbH"');
-- select team_einstellung_setzen('kurzname', '"Beispiel"');

-- Ausgabe: der Zugangscode
select name, email, rolle, status, token from team_mitglieder where lower(email) = lower('HIER_MAIL');
