-- =====================================================================================================
-- 100_option_arbeitszeit.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "Arbeitszeit"
-- =====================================================================================================
-- Was macht diese Datei?
--   Zeiterfassung je Person: Einträge (team_zeiten), Vertragsstunden und Startguthaben je Mitglied,
--   feste Monatsabschlüsse (team_abrechnung) fürs Lohnbüro. Das Überstundenkonto rechnet der Server.
-- Pflicht oder Option?  OPTION. Nur einspielen, wenn das Register "Arbeitszeit" genutzt werden soll.
-- Wovon hängt sie ab?   001_basis.sql, 002_einstellungen.sql, 003_team_laden.sql.
--                       team_laden() liefert "zeiten" und "abrechnung" automatisch, sobald diese
--                       Tabellen da sind. Diese Datei definiert team_laden() NICHT neu.
-- Mehrfach ausführbar?  Ja.
--
-- Stichdatum: Ab welchem Datum Monate abgerechnet werden, steht in team_einstellungen unter
--   "stichdatum_abrechnung" (z. B. "2026-01-01"). Vorher setzen:
--     select team_einstellung_setzen('stichdatum_abrechnung', '"2026-01-01"');
--   Mitglieder ohne eigenes Datum (abrechnung_ab leer) bekommen beim Einspielen dieses Datum eingetragen.
--   Alles vor dem Stichdatum zählt aufs Startguthaben (startguthaben_min), nicht in die Monatsabrechnung.
-- =====================================================================================================

-- 1) Vertrag je Person
alter table team_mitglieder add column if not exists vertrag_std       numeric;           -- Stunden pro Monat laut Vertrag
alter table team_mitglieder add column if not exists startguthaben_min int default 0;     -- Guthaben aus der Zeit vor dem Portal (Minuten)
alter table team_mitglieder add column if not exists abrechnung_ab     text;              -- JJJJ-MM-TT: ab hier zählen Monate (leer = Stichdatum aus den Einstellungen)

update team_mitglieder
   set abrechnung_ab = team_einstellung('stichdatum_abrechnung') #>> '{}'
 where abrechnung_ab is null
   and typ = 'mensch'
   and jsonb_typeof(team_einstellung('stichdatum_abrechnung')) = 'string';

-- 2) Zeiteinträge
create table if not exists team_zeiten (
  zeit_id         text primary key,
  mitglied_id     text,
  datum           text,                            -- JJJJ-MM-TT
  von             text,                            -- HH:MM
  bis             text,                            -- HH:MM
  pause_min       int default 0,
  minuten         int,                             -- Netto-Minuten
  taetigkeit      text,
  projekt         text,
  aufgabe_id      text,
  kw              text,                            -- Kalenderwoche, z. B. 2026-W14
  status          text default 'offen',            -- offen | eingereicht | freigegeben | abgelehnt
  eingereicht_am  timestamptz,
  freigegeben_von text,
  freigegeben_am  timestamptz,
  kommentar       text,
  geaendert       timestamptz default now()
);
create index if not exists team_zeiten_mitglied on team_zeiten (mitglied_id, kw);

-- 3) Abgeschlossene Monate (fester Stand für Lohnbüro und PDF)
create table if not exists team_abrechnung (
  abrechnung_id     text primary key,              -- mitglied_id + '_' + monat
  mitglied_id       text not null,
  monat             text not null,                 -- JJJJ-MM
  soll_min          int  not null,
  gearbeitet_min    int  not null,
  ausgezahlt_min    int  not null,
  konto_vorher_min  int  not null,
  konto_nachher_min int  not null,
  eintraege         int  default 0,
  erstellt          timestamptz default now(),
  erstellt_von      text
);
create index if not exists team_abrechnung_mitglied on team_abrechnung (mitglied_id, monat);

-- 4) Rechte
alter table team_zeiten     enable row level security;
alter table team_abrechnung enable row level security;
revoke all on table team_zeiten, team_abrechnung from public, anon, authenticated;
grant all on table team_zeiten, team_abrechnung to service_role;

-- Kontrolle: "zeiten" und "abrechnung" müssen jetzt Listen sein (leer ist richtig), und die Vertragsspalten da
select jsonb_typeof(team_laden() -> 'zeiten') as zeiten, jsonb_typeof(team_laden() -> 'abrechnung') as abrechnung;
select name, vertrag_std, startguthaben_min, abrechnung_ab from team_mitglieder where typ = 'mensch' order by name;
