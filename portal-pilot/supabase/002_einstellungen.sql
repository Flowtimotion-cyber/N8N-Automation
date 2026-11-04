-- =====================================================================================================
-- 002_einstellungen.sql  ·  Team-Portal (Pilot-Kopie)  ·  PFLICHT  ·  Reihenfolge: 2 von 3 Pflichtdateien
-- =====================================================================================================
-- Was macht diese Datei?
--   Legt die Tabelle team_einstellungen an. Dort steht alles, was je Firma anders ist (Firmenname,
--   Kurzname, Räume, Rollen, Stichtag der Arbeitszeit-Abrechnung, Pilot-Ende, freigeschaltete Module,
--   Projekt für den Wochenstand, Bereiche für Vorschläge, Kanäle für Social Media). Die n8n-Workflows des
--   Piloten lesen diese Werte im ersten Knoten über team_einstellung('<schluessel>'); nichts davon
--   steckt mehr fest im Code.
-- Pflicht oder Option?  PFLICHT.
-- Wovon hängt sie ab?   001_basis.sql (nur wegen der Rechte-Konvention, keine Tabellenabhängigkeit).
-- Was kommt danach?     003_team_laden.sql.
-- Mehrfach ausführbar?  Ja. Vorhandene Werte werden NICHT überschrieben (on conflict do nothing).
--
-- Werte ändern (Beispiel, im SQL-Editor):
--   select team_einstellung_setzen('firma', '"Beispiel GmbH"');
--   select team_einstellung_setzen('raeume', '["Vertrieb", "Verwaltung", "Produktion"]');
--   select team_einstellung_setzen('stichdatum_abrechnung', '"2026-01-01"');
--   select team_einstellung_setzen('pilot_ende', '"2027-02-28"');
--   select team_einstellung_setzen('module', '{"zeit": true, "social": false, "system": false, "kurs": false}');
-- Achtung: Werte sind JSON. Text braucht also doppelte Anführungszeichen innerhalb der einfachen.
-- =====================================================================================================

create table if not exists team_einstellungen (
  schluessel   text primary key,
  wert         jsonb,
  beschreibung text,
  geaendert    timestamptz default now()
);
alter table team_einstellungen enable row level security;

insert into team_einstellungen (schluessel, wert, beschreibung) values
  ('firma',     '"Meine Firma"'::jsonb, 'Voller Firmenname, erscheint im Portal und in Exporten.'),
  ('kurzname',  '"Portal"'::jsonb,      'Kurzer Name für Überschrift und Browser-Tab.'),
  ('stichdatum_abrechnung', 'null'::jsonb,
     'Ab diesem Datum (JJJJ-MM-TT) rechnet die Option Arbeitszeit Monate ab; alles davor geht aufs Startguthaben. null = Option nicht in Betrieb.'),
  ('raeume',    '[]'::jsonb,
     'Bereiche der Firma, denen Projekte zugeordnet werden (Option KI Office). Leer = keine Räume. Beispiel: ["Vertrieb", "Verwaltung"].'),
  ('rollen',    '[
      {"rolle": "admin",    "titel": "Admin",     "beschreibung": "Darf alles: Team verwalten, Einstellungen, Löschen, Freigaben."},
      {"rolle": "team",     "titel": "Team",      "beschreibung": "Sieht alles, bearbeitet eigene Aufgaben, Notizen und Vorschläge."},
      {"rolle": "dozent",   "titel": "Fachlich",  "beschreibung": "Wie Team, zusätzlich Projekte und Systeme pflegen und Kurs- oder Teilnehmerdaten bearbeiten."},
      {"rolle": "vertrieb", "titel": "Vertrieb",  "beschreibung": "Wie Team, zusätzlich Vertriebsregister (Diktat, Kontakte), wenn eingespielt."},
      {"rolle": "agent",    "titel": "KI-Agent",  "beschreibung": "Technisches Mitglied für Automationen. Darf nur lesen, Aufgaben kommentieren und Entwürfe anlegen, nie löschen oder freigeben."}
    ]'::jsonb,
     'Rollen des Portals mit Beschreibung. Die Rechte selbst prüft der Server (n8n); die Namen hier müssen zu team_mitglieder.rolle passen.'),
  ('pilot_ende', 'null'::jsonb,
     'Geplantes Ende des Piloten (JJJJ-MM-TT). Danach: Export (990_export.sql) und Löschung (999_loeschen.sql). null = offen.'),
  ('module',    '{"zeit": false, "social": false, "system": false, "kurs": false}'::jsonb,
     'Welche Optionen das Portal zeigt und der Server erlaubt; true = an. Beispiel: select team_einstellung_setzen(''module'', ''{"zeit": true}'');'),
  ('firmenwissen_projekt', 'null'::jsonb,
     'Projektname, in den der Wochenstand seine Notizen legt; null = kein Wochenstand'),
  ('vorschlag_bereiche', '["Übersicht", "Aufgaben", "Projekte", "Notizen", "Vorschläge", "Team", "Sonstiges"]'::jsonb,
     'Bereiche, die man einem Vorschlag zuordnen kann (Auswahl in der Oberfläche; der Server macht Unbekanntes zu Sonstiges). Leere Liste = freier Text.'),
  ('social_kanaele', '[]'::jsonb,
     'Kanäle für die Option Social Media, z. B. ["LinkedIn", "Newsletter"]. Leere Liste = der Server nimmt jeden Kanalnamen an; die Anzeige-Liste steht in config/mandant.js (social_kanaele).')
on conflict (schluessel) do nothing;

-- Lesen: liefert den JSON-Wert oder null, wenn der Schlüssel fehlt.
-- Beispiel: select team_einstellung('firma') ->> 0;   oder in n8n:  rpc/team_einstellung mit {"p_schluessel": "firma"}
create or replace function team_einstellung(p_schluessel text) returns jsonb
language sql stable security definer set search_path = public as $$
  select wert from team_einstellungen where schluessel = p_schluessel;
$$;

-- Alle Einstellungen als ein JSON-Objekt { schluessel: wert, ... } (so liefert es auch team_laden() mit).
create or replace function team_einstellungen_alle() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(schluessel, wert), '{}'::jsonb) from team_einstellungen;
$$;

-- Schreiben: legt den Schlüssel an oder ersetzt den Wert. Beschreibung bleibt erhalten, wenn keine mitgegeben wird.
create or replace function team_einstellung_setzen(p_schluessel text, p_wert jsonb, p_beschreibung text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_schluessel, '') = '' then raise exception 'schluessel fehlt'; end if;
  insert into team_einstellungen (schluessel, wert, beschreibung, geaendert)
    values (p_schluessel, p_wert, p_beschreibung, now())
  on conflict (schluessel) do update
    set wert = excluded.wert,
        beschreibung = coalesce(excluded.beschreibung, team_einstellungen.beschreibung),
        geaendert = now();
  return jsonb_build_object('schluessel', p_schluessel, 'wert', p_wert);
end $$;

revoke all on table team_einstellungen from public, anon, authenticated;
grant all on table team_einstellungen to service_role;
revoke all on function team_einstellung(text)                         from public, anon, authenticated;
revoke all on function team_einstellungen_alle()                      from public, anon, authenticated;
revoke all on function team_einstellung_setzen(text, jsonb, text)     from public, anon, authenticated;
grant execute on function team_einstellung(text)                      to service_role;
grant execute on function team_einstellungen_alle()                   to service_role;
grant execute on function team_einstellung_setzen(text, jsonb, text)  to service_role;

-- Kontrolle: muss 10 Zeilen zeigen (firma, firmenwissen_projekt, kurzname, module, pilot_ende, raeume, rollen, social_kanaele, stichdatum_abrechnung, vorschlag_bereiche)
select schluessel, wert, beschreibung from team_einstellungen order by schluessel;
