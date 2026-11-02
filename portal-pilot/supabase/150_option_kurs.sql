-- =====================================================================================================
-- 150_option_kurs.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "Kurs" (Community)
-- =====================================================================================================
-- Was macht diese Datei?
--   Fragen, Antworten und private Nachrichten aus einer Online-Kursseite an die Dozenten
--   (kurs_community). Das Portal zeigt sie im Register "Kurs", Dozenten antworten dort.
-- Pflicht oder Option?  OPTION. Nur einspielen, wenn der Kunde eine Kursseite mit Community betreibt.
-- Wovon hängt sie ab?   001_basis.sql, 003_team_laden.sql. team_laden() liefert "community" (letzte
--                       180 Tage) automatisch, sobald die Tabelle da ist. Diese Datei definiert
--                       team_laden() NICHT neu.
-- Mehrfach ausführbar?  Ja.
--
-- Datenschutz: teilnehmer_id ist eine zufällige ID aus dem Browser der Teilnehmenden, "name" nur der
--   Vorname. Keine E-Mail-Adressen hier ablegen.
-- =====================================================================================================

create table if not exists kurs_community (
  eintrag_id    text primary key,
  art           text not null,                 -- frage | antwort | nachricht (privat an Dozent)
  frage_id      text,                          -- bei Antworten: zu welcher Frage / Nachricht
  modul         text,                          -- z. B. "Modul 1", "Allgemein"
  teilnehmer_id text,                          -- zufällige ID aus dem Browser der Teilnehmenden
  kurscode      text,
  name          text,                          -- nur Vorname, wird angezeigt
  autor_typ     text not null default 'teilnehmer',  -- teilnehmer | dozent
  autor_id      text,                          -- mitglied_id bei Dozenten
  text          text not null,
  status        text not null default 'sichtbar',    -- sichtbar | versteckt | privat
  erledigt      boolean default false,         -- Frage beantwortet / Nachricht bearbeitet
  erstellt      timestamptz default now()
);
create index if not exists kurs_community_frage on kurs_community (frage_id);
create index if not exists kurs_community_tn on kurs_community (teilnehmer_id);

alter table kurs_community enable row level security;
revoke all on table kurs_community from public, anon, authenticated;
grant all on table kurs_community to service_role;

-- Kontrolle: team_laden() liefert "community" als Liste
select jsonb_typeof(team_laden() -> 'community') as community;
