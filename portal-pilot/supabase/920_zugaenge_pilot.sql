-- =====================================================================================================
-- 920_zugaenge_pilot.sql  ·  Team-Portal (Pilot-Kopie)  ·  VORLAGE  ·  Zugänge für den Pilot (Admin + 4 Tester + KI-Agent)
-- =====================================================================================================
-- Was macht diese Datei?
--   Legt in einem Rutsch alle Zugänge für einen Pilot mit festem Team an: die Admin-Person (du), vier Tester
--   ("Tester 1" bis "Tester 4", Rolle team, Status eingeladen: beim ersten Öffnen tragen sie ihre E-Mail ein),
--   das Agent-Mitglied "Claude (KI)" für die Rückmeldungen, das Projekt "Pilot-Verbesserungen" und die
--   Notizen "Willkommen im Pilot" (Regel: keine sensiblen Daten) und "Was sich geändert hat".
--   Die Tester benennst du danach im Portal unter Team um (Verwalten → Name), oder du ersetzt die Namen
--   unten in der Datei, bevor du sie ausführst.
-- Pflicht oder Option?  Eine von dreien: 900 (Musterdaten), 910 (nur ein Admin) oder diese Datei.
-- Wovon hängt sie ab?   001_basis.sql, 002_einstellungen.sql. Keine Option nötig.
-- Mehrfach ausführbar?  Ja. Vorhandene Zeilen bleiben, kein Zugangscode ändert sich.
--
-- SO GEHT'S:
--   1. Unten HIER_NAME (dein Name) und HIER_MAIL (deine Firmen-Mail) ersetzen, Anführungszeichen stehen lassen.
--   2. Optional: Firmenname und Kurzname (Zeilen unter "Optional"), Tester-Namen in der Liste.
--   3. Datei ausführen. Die letzte Abfrage zeigt sechs Zeilen mit Name, Rolle, Status und Zugangscode (token).
--      Login-Link je Person: <Portal-Adresse>#z=<token>  -  nur persönlich weitergeben, nie in einen Gruppenchat.
--      Der Code von "Claude (KI)" ist kein Login-Link, sondern der Wert für PILOT_AGENT_TOKEN (PILOT_Setup.md, Abschnitt 8).
-- Zugangscode später wieder anzeigen:  select name, rolle, status, token from team_mitglieder order by rolle, name;
-- Zugangscode erneuern (alter Link wird ungültig):  update team_mitglieder set token = team_token_neu() where name = 'Tester 1';
-- =====================================================================================================

-- Sicherung: bricht ab, solange die Platzhalter nicht ersetzt sind
do $$
begin
  if 'HIER_NAME' = 'HIER_' || 'NAME' or 'HIER_MAIL' = 'HIER_' || 'MAIL' then
    raise exception 'Bitte zuerst HIER_NAME und HIER_MAIL in dieser Datei ersetzen (siehe Kopfkommentar).';
  end if;
end $$;

-- 1) Admin (nur, wenn es die Mail-Adresse noch nicht gibt)
insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token, registriert)
select 'm_admin_pilot', 'HIER_NAME', lower('HIER_MAIL'), 'Leitung', 'admin', 'mensch', 'aktiv', team_token_neu(), now()
 where not exists (select 1 from team_mitglieder where lower(email) = lower('HIER_MAIL') or mitglied_id = 'm_admin_pilot');

-- 2) Vier Tester (Rolle team, eingeladen; Namen hier anpassen oder später im Portal)
insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token) values
  ('m_tester_1', 'Tester 1', '', 'Pilot-Tester', 'team', 'mensch', 'eingeladen', team_token_neu()),
  ('m_tester_2', 'Tester 2', '', 'Pilot-Tester', 'team', 'mensch', 'eingeladen', team_token_neu()),
  ('m_tester_3', 'Tester 3', '', 'Pilot-Tester', 'team', 'mensch', 'eingeladen', team_token_neu()),
  ('m_tester_4', 'Tester 4', '', 'Pilot-Tester', 'team', 'mensch', 'eingeladen', team_token_neu())
on conflict (mitglied_id) do nothing;

-- 3) Agent-Mitglied für die Rückmeldungen (Rolle agent: lesen, Vorschläge beantworten, kommentieren; nichts löschen, nie "Erledigt")
insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token, registriert)
  values ('agent-claude', 'Claude (KI)', '', 'KI-Werkzeug (Rückmeldungen)', 'agent', 'agent', 'aktiv', team_token_neu(), now())
  on conflict (mitglied_id) do nothing;

-- 4) Projekt und Notizen
insert into team_projekte (projekt_id, name, beschreibung, status, farbe, verantwortlich, reihenfolge, links)
  select 'j_pilot_verbesserungen', 'Pilot-Verbesserungen', 'Rückmeldungen der Tester und was daraus am Portal geändert wurde (Notiz „Was sich geändert hat“).', 'aktiv', '#1FA9B0',
         (select mitglied_id from team_mitglieder where rolle = 'admin' and status <> 'gesperrt' order by registriert nulls last, mitglied_id limit 1), 1, '[]'::jsonb
  on conflict do nothing;

insert into team_notizen (notiz_id, titel, inhalt, projekt, autor, geaendert_von)
  select 'n_willkommen_pilot', 'Willkommen im Pilot',
         E'Dieses Portal ist ein Pilot. Hier sammeln wir Aufgaben, Projekte, Notizen und Vorschläge an einem Ort.\n\n'
         'Bitte trag **keine sensiblen Daten** ein: keine Kundendaten, keine Gesundheits- oder Finanzdaten, keine Passwörter, keine Personalangelegenheiten. '
         'Aufgaben, Projekte, Notizen und Vorschläge zum Arbeitsalltag sind genau richtig.\n\n'
         'Rückmeldungen (Register Vorschläge, Kommentare an Aufgaben) werden mit dem KI-Werkzeug Claude gelesen und beantwortet; Antworten sind als „Claude (KI)“ gekennzeichnet. '
         'Was daraus geändert wurde, steht in [[Was sich geändert hat]].\n\n'
         'Nach dem Pilot kann das System auf einem eigenen Server der Firma datensicher betrieben werden.\n\n'
         'Dein Zugang ist dein persönlicher Link: nicht weitergeben, auf geteilten Geräten unter Team „Auf diesem Gerät abmelden“.',
         'Pilot-Verbesserungen', m.mitglied_id, m.mitglied_id
    from (select mitglied_id from team_mitglieder where rolle = 'admin' and status <> 'gesperrt' order by registriert nulls last, mitglied_id limit 1) m
   where not exists (select 1 from team_notizen where lower(titel) = lower('Willkommen im Pilot'));

insert into team_notizen (notiz_id, titel, inhalt, projekt, autor, geaendert_von)
  select 'n_aenderungen', 'Was sich geändert hat',
         E'Hier steht, was aus den Rückmeldungen des Teams am Portal geändert wurde. Neueste Einträge unten, immer mit Datum.\n\nRückmeldungen (Vorschläge, Kommentare) werden vom KI-Werkzeug Claude gelesen und beantwortet; Änderungen am Portal rollt die Leitung nach Freigabe aus.',
         'Pilot-Verbesserungen', m.mitglied_id, m.mitglied_id
    from (select mitglied_id from team_mitglieder where rolle = 'admin' and status <> 'gesperrt' order by registriert nulls last, mitglied_id limit 1) m
   where not exists (select 1 from team_notizen where lower(titel) = lower('Was sich geändert hat'));

-- Optional: Firmenname und Kurzname (Zeilen entkommentieren und anpassen; JSON braucht die doppelten Anführungszeichen)
-- select team_einstellung_setzen('firma',    '"Beispiel GmbH"');
-- select team_einstellung_setzen('kurzname', '"Beispiel"');

-- Ausgabe: die sechs Zugänge (Login-Link: <Portal-Adresse>#z=<token>; der Code des Agenten gehört in PILOT_AGENT_TOKEN)
select name, rolle, status, token from team_mitglieder
 where mitglied_id in ('m_admin_pilot', 'm_tester_1', 'm_tester_2', 'm_tester_3', 'm_tester_4', 'agent-claude') or lower(email) = lower('HIER_MAIL')
 order by case rolle when 'admin' then 1 when 'team' then 2 else 3 end, name;
