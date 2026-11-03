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
--      Optional: das Agent-Mitglied "Claude (KI)" für die Rückmeldungen der Tester anlegen (Block unten,
--      agent_anlegen auf true setzen). Dazu kommen das Projekt "Pilot-Verbesserungen" und die Notiz
--      "Was sich geändert hat". Der Code des Agenten ist kein Login-Link, sondern der Wert für die
--      Umgebungsvariable PILOT_AGENT_TOKEN auf dem Rechner, der die Rückmeldungen beantwortet (PILOT_Setup.md, Abschnitt 8).
--   3. Datei ausführen. Die letzte Zeile der Ausgabe zeigt den Zugangscode (token); mit Agent-Block zwei Zeilen.
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

-- Optional: Agent-Mitglied anlegen (Feedbackschleife). Erst wirksam, wenn unten false durch true ersetzt wird.
-- Legt an: Mitglied "Claude (KI)" (Rolle agent, Typ agent, aktiv; darf lesen, Vorschläge beantworten, kommentieren,
-- nichts löschen, nie "Erledigt" setzen), Projekt "Pilot-Verbesserungen", Notiz "Was sich geändert hat".
-- Mehrfach ausführbar: Vorhandenes bleibt, der Zugangscode des Agenten ändert sich nicht.
do $$
declare
  agent_anlegen boolean := false;   -- auf true setzen, um den Agenten anzulegen
  admin_id text;
begin
  if not agent_anlegen then return; end if;
  select mitglied_id into admin_id from team_mitglieder where rolle = 'admin' and status <> 'gesperrt' order by registriert nulls last, mitglied_id limit 1;
  if admin_id is null then raise exception 'Erst den Admin anlegen (oben), dann den Agenten.'; end if;
  insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token, registriert)
    values ('agent-claude', 'Claude (KI)', '', 'KI-Werkzeug (Rückmeldungen)', 'agent', 'agent', 'aktiv', team_token_neu(), now())
    on conflict (mitglied_id) do nothing;
  insert into team_projekte (projekt_id, name, beschreibung, status, farbe, verantwortlich, reihenfolge, links)
    values ('j_pilot_verbesserungen', 'Pilot-Verbesserungen', 'Rückmeldungen der Tester und was daraus am Portal geändert wurde (Notiz „Was sich geändert hat“).', 'aktiv', '#1FA9B0', admin_id, 90, '[]'::jsonb)
    on conflict do nothing;
  insert into team_notizen (notiz_id, titel, inhalt, projekt, autor, geaendert_von)
    select 'n_aenderungen', 'Was sich geändert hat',
           E'Hier steht, was aus den Rückmeldungen des Teams am Portal geändert wurde. Neueste Einträge unten, immer mit Datum.\n\nRückmeldungen (Vorschläge, Kommentare) werden vom KI-Werkzeug Claude gelesen und beantwortet; Änderungen am Portal rollt die Leitung nach Freigabe aus.',
           'Pilot-Verbesserungen', admin_id, admin_id
     where not exists (select 1 from team_notizen where lower(titel) = lower('Was sich geändert hat'));
end $$;

-- Ausgabe: der Zugangscode des Admins (und, falls angelegt, der Code des Agenten für PILOT_AGENT_TOKEN)
select name, email, rolle, status, token from team_mitglieder where lower(email) = lower('HIER_MAIL') or typ = 'agent' order by rolle;
