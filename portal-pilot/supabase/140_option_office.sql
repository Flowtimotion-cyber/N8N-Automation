-- =====================================================================================================
-- 140_option_office.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "KI Office"
-- =====================================================================================================
-- Was macht diese Datei?
--   Das KI Office: eine Registry von KI-Agenten (office_agenten), Aufträge an Agenten (office_runs),
--   deren Ereignisse, Ergebnisse (Artefakte), Freigaben für heikle Aktionen und Idempotenzschlüssel gegen
--   doppelte Ausführung. Dazu bekommt jedes Projekt einen "Raum" (Bereich der Firma).
--   Die Zustandsmaschine und die Rechte liegen im Workflow-Code (n8n); die Datenbank sichert Eindeutigkeiten ab.
-- Pflicht oder Option?  OPTION. Ohne Agenten ist das Register leer und kann ausgeblendet bleiben.
-- Wovon hängt sie ab?   001_basis.sql (team_projekte, team_mitglieder), 002_einstellungen.sql (raeume),
--                       003_team_laden.sql. team_laden() liefert office_* automatisch, sobald die Tabellen
--                       da sind. Diese Datei definiert team_laden() NICHT neu.
-- Mehrfach ausführbar?  Ja.
--
-- WICHTIG: Diese Datei enthält KEINE Agenten. Agenten werden je Kunde angelegt (Rolle, Werkzeuge, Modell,
--   Projekte), entweder über die Office-API (Aktion agent_speichern als Admin) oder mit einem Insert wie
--   dem auskommentierten Beispiel ganz unten. Jeder Agent braucht ein Teammitglied vom Typ "agent" mit
--   eigenem Zugangscode (mitglied_id), über das er sich beim Server ausweist.
-- Räume: Die Liste der Räume steht in team_einstellungen unter "raeume" (z. B. ["Vertrieb", "Verwaltung"]).
--   Projekte ohne Raum zeigt das Office unter "Ohne Raum"; Zuordnung im Portal oder per
--   update team_projekte set raum = 'Vertrieb' where name = '...';
-- =====================================================================================================

-- 0) Projekte bekommen einen Raum fürs virtuelle Büro
alter table team_projekte add column if not exists raum text;

-- 1) Agenten-Registry (Pflege über die Office-API, Aktion agent_speichern)
create table if not exists office_agenten (
  agent_id         text primary key,            -- z. B. texter, recherche, status
  name             text not null,
  rolle            text,                        -- fachliche Rolle in einem Satz
  raum             text not null default 'Verwaltung',
  beschreibung     text,
  faehigkeiten     text[] default '{}',
  erlaubte_tools   text[] default '{}',         -- Werkzeug-Allowlist; Ereignisse mit anderen Tools werden abgelehnt
  modell           text not null default 'claude-sonnet-5-5',
  modell_grund     text,
  ausfuehrer       text not null default 'n8n', -- n8n | claude-code | codex | sonstiges
  ausfuehrer_url   text,                        -- Webhook des Ausführers (nur Admin sieht sie im Office)
  mitglied_id      text references team_mitglieder (mitglied_id),  -- Token-Identität des Ausführers (typ agent)
  projekte         text[] default '{}',         -- Projektnamen, in denen der Agent arbeiten darf (Projektgrenze!)
  aktiv            boolean default true,
  timeout_sek      int default 900,
  max_versuche     int default 3,
  auto_wiederholen boolean default false,
  freigabe_noetig  boolean,                     -- true = Teammitglieder brauchen immer eine Admin-Freigabe; leer = nach Modell
  workflow_version text,
  konfig_version   text default '1',
  geaendert        timestamptz default now(),
  geaendert_von    text
);
alter table office_agenten add column if not exists freigabe_noetig boolean;

-- 2) Runs (ein Auftrag an einen Agenten)
create table if not exists office_runs (
  run_id                text primary key,
  projekt               text not null,
  aufgabe_id            text,                   -- team_aufgaben.aufgabe_id, optional
  auftraggeber          text not null,          -- mitglied_id
  agent_id              text not null references office_agenten (agent_id),
  ausfuehrer            text,
  workflow_version      text,
  konfig_version        text,
  status                text not null default 'warteschlange',  -- warteschlange | in_arbeit | wartet_rueckmeldung | wartet_freigabe | abgeschlossen | fehlgeschlagen | abgebrochen | unbekannt
  auftrag               text not null,
  eingabe               jsonb,
  idempotenzschluessel  text not null,
  n8n_execution_id      text,                   -- externe Ausführungs-ID, eindeutig
  externe_id            text,
  erstellt              timestamptz default now(),
  gestartet             timestamptz,
  lebenszeichen         timestamptz,
  beendet               timestamptz,
  timeout_sek           int default 900,
  versuche              int default 1,
  max_versuche          int default 3,
  fehler                text,
  grund                 text,
  abgebrochen_von       text,
  zusammenfassung       text,
  zusammenfassung_zeit  timestamptz,
  zusammenfassung_quelle jsonb,                 -- { ereignisse: [ids], stand, von }
  verbrauch             jsonb,                  -- { messbar, tokens_ein, tokens_aus, kosten_eur, kosten_art, kosten_quelle }
  abgenommen            boolean,                -- fachliche Abnahme, nur Menschen; getrennt vom technischen Status
  abgenommen_von        text,
  abgenommen_am         timestamptz,
  abnahme_kommentar     text,
  eltern_run_id         text references office_runs (run_id),  -- Teilauftrag zeigt auf den Run des Orchestrierers
  team_id               text,                   -- eine Teambildung: Eltern-Run und alle Kind-Runs tragen dieselbe ID
  budget_eur            numeric                 -- Kostenlimit dieses Runs in Euro
);
alter table office_runs add column if not exists eltern_run_id text references office_runs (run_id);
alter table office_runs add column if not exists team_id text;
alter table office_runs add column if not exists budget_eur numeric;
create index if not exists office_runs_eltern on office_runs (eltern_run_id) where eltern_run_id is not null;
create index if not exists office_runs_team on office_runs (team_id) where team_id is not null;
create unique index if not exists office_runs_idem on office_runs (idempotenzschluessel);
create unique index if not exists office_runs_n8n on office_runs (n8n_execution_id) where n8n_execution_id is not null;
create index if not exists office_runs_projekt on office_runs (projekt, status);
create index if not exists office_runs_agent on office_runs (agent_id, erstellt desc);

-- Rückmelde-Schlüssel je Run (HMAC-Geheimnis für den Rückmelde-Webhook). Eigene Tabelle, damit der Server
-- ihn gezielt behandelt; er wird nie an Browser oder Agenten ausgeliefert.
create table if not exists office_run_schluessel (
  run_id     text primary key references office_runs (run_id) on delete cascade,
  schluessel text not null,
  erstellt   timestamptz default now()
);

-- 3) Ereignisse (Schritte, Tool-Aufrufe, Quellen-Referenzen, Fehler, Statuswechsel). Datensparsam.
create table if not exists office_ereignisse (
  id          bigint generated always as identity primary key,
  run_id      text not null references office_runs (run_id) on delete cascade,
  zeit        timestamptz default now(),
  art         text not null,                    -- schritt | tool | quelle | fehler | wiederholung | hinweis | status | rueckfrage | antwort | freigabe | artefakt | abnahme | entscheidung
  titel       text not null,
  details     jsonb,
  tool        text,
  quelle_ref  text,                             -- URL oder ID, nie der Inhalt
  autor       text,
  sequenz     int,
  idempotenz  text                              -- optionaler Schlüssel gegen doppelte Ereignisse
);
create index if not exists office_ereignisse_run on office_ereignisse (run_id, zeit);
create unique index if not exists office_ereignisse_idem on office_ereignisse (idempotenz) where idempotenz is not null;

-- 4) Artefakte (Ergebnisse mit Ablageort)
create table if not exists office_artefakte (
  artefakt_id     text primary key,
  run_id          text not null references office_runs (run_id) on delete cascade,
  aufgabe_id      text,
  projekt         text,
  art             text not null default 'text', -- text | datei | link | commit | notiz | bericht
  titel           text not null,
  ablageort       text,                         -- URL, Pfad, Notiz-Titel, Commit
  inhalt_hash     text,                         -- SHA-256 des Inhalts, falls bekannt
  groesse         int,
  zusammenfassung text,
  erstellt        timestamptz default now(),
  erstellt_von    text
);
create index if not exists office_artefakte_run on office_artefakte (run_id);

-- 5) Freigaben: gebunden an exakte Aktion + Inhalts-Hash. Geänderter Inhalt = neue Freigabe nötig.
create table if not exists office_freigaben (
  freigabe_id     text primary key,
  run_id          text not null references office_runs (run_id) on delete cascade,
  aktion          text not null,                -- email_senden | nachricht_senden | post_veroeffentlichen | zahlung_ausloesen | daten_loeschen | vertrag_senden | kalender_aendern | auftrag_start
  inhalt_hash     text not null,
  inhalt_vorschau text,
  status          text not null default 'offen', -- offen | erteilt | abgelehnt | verfallen | ungueltig | verwendet
  angefordert_am  timestamptz default now(),
  angefordert_von text,
  entschieden_von text,
  entschieden_am  timestamptz,
  begruendung     text,
  gueltig_bis     timestamptz,
  verwendet_am    timestamptz
);
create unique index if not exists office_freigaben_eindeutig on office_freigaben (run_id, aktion, inhalt_hash);
create index if not exists office_freigaben_status on office_freigaben (status);

-- 6) Idempotenzschlüssel für Aufträge, externe Aktionen und Webhook-Nonces (Replay-Schutz)
create table if not exists office_idempotenz (
  schluessel text primary key,
  art        text not null,                     -- auftrag | aktion | nonce
  run_id     text,
  antwort    jsonb,
  erstellt   timestamptz default now()
);
create index if not exists office_idempotenz_alter on office_idempotenz (erstellt);

-- 7) Rechte
alter table office_agenten        enable row level security;
alter table office_runs           enable row level security;
alter table office_run_schluessel enable row level security;
alter table office_ereignisse     enable row level security;
alter table office_artefakte      enable row level security;
alter table office_freigaben      enable row level security;
alter table office_idempotenz     enable row level security;
revoke all on table office_agenten, office_runs, office_run_schluessel, office_ereignisse, office_artefakte,
  office_freigaben, office_idempotenz from public, anon, authenticated;
grant all on table office_agenten, office_runs, office_run_schluessel, office_ereignisse, office_artefakte,
  office_freigaben, office_idempotenz to service_role;
grant usage, select on sequence office_ereignisse_id_seq to service_role;

-- 8) Beispiel für einen ersten Agenten (auskommentiert; Werte je Kunde festlegen und dann ausführen).
--    Vorher ein Teammitglied vom Typ "agent" anlegen, das sich beim Server ausweist:
-- insert into team_mitglieder (mitglied_id, name, funktion, rolle, typ, status, token)
--   values ('agent-status', 'Status-Agent', 'KI-Agent', 'agent', 'agent', 'aktiv', team_token_neu())
--   on conflict (mitglied_id) do nothing;
-- insert into office_agenten (agent_id, name, rolle, raum, faehigkeiten, erlaubte_tools, modell, modell_grund, ausfuehrer, mitglied_id, projekte)
--   values ('verwaltung-status', 'Verwaltungs-Status', 'Fasst wöchentlich offene Aufgaben, Fristen und Blockaden zusammen. Bewertet keine Personen.',
--           'Verwaltung', array['Wochenstand','Fristenübersicht']::text[], array['aufgaben_lesen','notiz_speichern']::text[],
--           'claude-haiku-5-5', 'Status-Zusammenfassung aus zählbaren Daten.', 'n8n', 'agent-status', array['Onboarding Pilot']::text[])
--   on conflict (agent_id) do nothing;

-- Kontrolle: 7 Tabellen office_*, und team_laden() liefert office_agenten als Liste
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'office\_%' order by 1;
select jsonb_typeof(team_laden() -> 'office_agenten') as office_agenten, jsonb_typeof(team_laden() -> 'office_runs') as office_runs;
