-- KI Office: Produktiv-Zuordnung (nach supabase/team_office.sql ausführen)
-- Stand 17.10.2026. Idempotent, mehrfach ausführbar. Keine Zugangsdaten.
--
-- Warum diese Datei: team_office.sql enthält den Startbestand der Agenten-Registry aus office/agenten.json.
-- Dort stehen synthetische Projektnamen der Testdaten („Akademie-Kurs“, „Vertrieb Herbst“, „Kundenprojekt Müller GmbH“,
-- „Verwaltung & Finanzen“). Diese Datei ersetzt sie durch die echten Projekte aus team_projekte und
-- ordnet jedem echten Projekt einen Raum im virtuellen Büro zu. office/agenten.json bleibt unverändert (Testdaten).

-- 1) Räume für die echten Projekte (nur, wo noch kein Raum gesetzt ist – eigene Zuordnungen bleiben erhalten)
update team_projekte set raum = 'Akademie'       where raum is null and name in ('Kurs Modul 1', 'TEMP.Akademie');
update team_projekte set raum = 'Marketing'      where raum is null and name in ('Social Media', 'Webseite', 'Hermetik Marketing');
update team_projekte set raum = 'Vertrieb'       where raum is null and name in ('Vertrieb', 'KI-Agentur-Pipeline');
update team_projekte set raum = 'Kundenprojekte' where raum is null and name in ('AWS GmbH', 'IFA GmbH', 'TeamRebelMedia / Max Görtler', 'Healthhack',
  'Yoga mit Seher', 'Spirit WoMen Zentrum', 'Wioletta Tuschnio', 'AGOMED – Medtech');
update team_projekte set raum = 'Kundenprojekte' where raum is null and name like 'Technische Datenbasis%';
update team_projekte set raum = 'Verwaltung'     where raum is null and name in ('AZAV & GmbH', 'Sonstiges', 'Firmenwissen', 'Systeme', 'Momentum Office');
-- Alles, was danach noch ohne Raum ist (neue Projekte), landet in der Verwaltung und kann im Portal umgestellt werden
update team_projekte set raum = 'Verwaltung'     where raum is null;

-- 2) Projektzuordnung der Agenten auf echte Projektnamen (überschreibt nur die synthetischen Startwerte)
update office_agenten set projekte = array['Kurs Modul 1','TEMP.Akademie']::text[]
  where agent_id in ('akademie-redakteur', 'kurs-waechter');
update office_agenten set projekte = array['Social Media','Webseite','Hermetik Marketing']::text[]
  where agent_id = 'marketing-texter';
update office_agenten set projekte = array['Social Media']::text[]
  where agent_id = 'social-planer';
update office_agenten set projekte = array['Vertrieb','KI-Agentur-Pipeline']::text[]
  where agent_id in ('vertrieb-recherche', 'angebots-pruefer');
update office_agenten set projekte = (select coalesce(array_agg(name order by name), '{}') from team_projekte where raum = 'Kundenprojekte')
  where agent_id = 'kunden-entwickler';
update office_agenten set projekte = (select coalesce(array_agg(name order by name), '{}') from team_projekte where raum = 'Kundenprojekte' or name in ('Webseite', 'Systeme', 'Momentum Office'))
  where agent_id = 'architektur-review';
update office_agenten set projekte = (select coalesce(array_agg(name order by name), '{}') from team_projekte where coalesce(status, 'aktiv') <> 'archiviert')
  where agent_id = 'verwaltung-status';
update office_agenten set projekte = array['Systeme']::text[]
  where agent_id = 'server-waechter';

-- 3) Kontrolle: keine synthetischen Namen mehr, jedes Projekt hat einen Raum
select agent_id, raum, ausfuehrer, mitglied_id, modell, projekte from office_agenten order by raum, agent_id;
select raum, count(*) as projekte, string_agg(name, ', ' order by name) as namen from team_projekte group by raum order by raum;
select agent_id, p as unbekanntes_projekt from office_agenten, unnest(projekte) p where p not in (select name from team_projekte);
