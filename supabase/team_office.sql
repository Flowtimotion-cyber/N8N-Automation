-- Momentum Team-Portal: KI Office (Agenten-Registry, Runs, Ereignisse, Artefakte, Freigaben, Idempotenz)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden (idempotent).
-- Zugriff nur über den Server (n8n, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.
-- Zustandsmaschine und Rechte liegen im Workflow-Code (office/lib/*.js), die Datenbank sichert Eindeutigkeiten ab.

-- 0) Projekte bekommen einen Raum fürs virtuelle Büro (Akademie, Marketing, Vertrieb, Kundenprojekte, Verwaltung)
alter table team_projekte add column if not exists raum text;

-- 1) Agenten-Registry (Startbestand aus office/agenten.json; Pflege über die Office-API, Aktion agent_speichern)
create table if not exists office_agenten (
  agent_id         text primary key,            -- z. B. akademie-redakteur
  name             text not null,
  rolle            text,                        -- fachliche Rolle in einem Satz
  raum             text not null default 'Verwaltung',
  beschreibung     text,
  faehigkeiten     text[] default '{}',
  erlaubte_tools   text[] default '{}',         -- Werkzeug-Allowlist; Ereignisse mit anderen Tools werden abgelehnt
  modell           text not null default 'claude-sonnet-5-5',
  modell_grund     text,
  ausfuehrer       text not null default 'n8n', -- n8n | claude-code | codex | hermes
  ausfuehrer_url   text,                        -- Webhook des Executors (nur Admin sieht sie im Office)
  mitglied_id      text references team_mitglieder (mitglied_id),  -- Token-Identität des Executors (typ agent)
  projekte         text[] default '{}',         -- Projektnamen, in denen der Agent arbeiten darf (Projektgrenze!)
  aktiv            boolean default true,
  timeout_sek      int default 900,
  max_versuche     int default 3,
  auto_wiederholen boolean default false,
  workflow_version text,
  konfig_version   text default '1',
  geaendert        timestamptz default now(),
  geaendert_von    text
);

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
  abnahme_kommentar     text
);
-- 2a) Orchestrierung (ergänzt 17.10.2026, additiv; Produktion läuft schon, darum nur add column if not exists):
--     eltern_run_id = Teilauftrag zeigt auf den Run des Orchestrierers; team_id = eine Teambildung (Eltern-Run und alle Kind-Runs tragen dieselbe ID).
alter table office_runs add column if not exists eltern_run_id text references office_runs (run_id);
alter table office_runs add column if not exists team_id text;
create index if not exists office_runs_eltern on office_runs (eltern_run_id) where eltern_run_id is not null;
create index if not exists office_runs_team on office_runs (team_id) where team_id is not null;
create unique index if not exists office_runs_idem on office_runs (idempotenzschluessel);
create unique index if not exists office_runs_n8n on office_runs (n8n_execution_id) where n8n_execution_id is not null;
create index if not exists office_runs_projekt on office_runs (projekt, status);
create index if not exists office_runs_agent on office_runs (agent_id, erstellt desc);

-- Rückmelde-Schlüssel je Run (HMAC-Geheimnis für den Rückmelde-Webhook). Eigene Tabelle, damit team_laden ihn gezielt behandelt;
-- er wird nie an Browser oder Agenten ausgeliefert (siehe antwortBauen in office/lib/verarbeitung.js).
create table if not exists office_run_schluessel (
  run_id     text primary key references office_runs (run_id) on delete cascade,
  schluessel text not null,
  erstellt   timestamptz default now()
);

-- 3) Ereignisse (Schritte, Tool-Aufrufe, Quellen-Referenzen, Fehler, Statuswechsel). Datensparsam: Titel, Tool-Name, Referenz, kleine Details.
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
  aktion          text not null,                -- email_senden | nachricht_senden | post_veroeffentlichen | zahlung_ausloesen | daten_loeschen | vertrag_senden | kalender_aendern
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

-- 7) Niemand außer dem Server darf direkt lesen oder schreiben
alter table office_agenten        enable row level security;
alter table office_runs           enable row level security;
alter table office_run_schluessel enable row level security;
alter table office_ereignisse     enable row level security;
alter table office_artefakte      enable row level security;
alter table office_freigaben      enable row level security;
alter table office_idempotenz     enable row level security;

-- 8) Laden: Office-Daten zusätzlich mitliefern (Muster: supabase/team_vorschlaege.sql; sonst unverändert).
--    Fenster: Runs der letzten 90 Tage oder noch nicht beendet; Ereignisse/Artefakte/Freigaben dazu; Idempotenz 30 Tage.
create or replace function team_laden() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mitglieder', coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from team_mitglieder m), '[]'),
    'projekte',   coalesce((select jsonb_agg(to_jsonb(p) order by p.reihenfolge, p.name) from team_projekte p), '[]'),
    'aufgaben',   coalesce((select jsonb_agg(to_jsonb(a) order by a.prio, a.deadline nulls last) from team_aufgaben a), '[]'),
    'verlauf',    coalesce((select jsonb_agg(to_jsonb(v) order by v.erstellt) from team_aufgaben_verlauf v
                            where v.erstellt > now() - interval '120 days'), '[]'),
    'notizen',    coalesce((select jsonb_agg(to_jsonb(n) order by n.titel) from team_notizen n), '[]'),
    'zeiten',     coalesce((select jsonb_agg(to_jsonb(z) order by z.datum desc) from team_zeiten z
                            where z.datum >= '2026-07-01'), '[]'),
    'abrechnung', coalesce((select jsonb_agg(to_jsonb(r) order by r.monat) from team_abrechnung r), '[]'),
    'social',     coalesce((select jsonb_agg(to_jsonb(s) order by s.datum) from team_social s), '[]'),
    'systeme',    coalesce((select jsonb_agg(to_jsonb(y) order by y.name) from team_systeme y), '[]'),
    'community',  coalesce((select jsonb_agg(to_jsonb(c) order by c.erstellt) from kurs_community c
                            where c.erstellt > now() - interval '180 days'), '[]'),
    'vorschlaege', coalesce((select jsonb_agg(to_jsonb(x) order by x.erstellt desc) from team_vorschlaege x), '[]'),
    'office_agenten', coalesce((select jsonb_agg(to_jsonb(g) order by g.raum, g.name) from office_agenten g), '[]'),
    'office_runs', coalesce((select jsonb_agg(to_jsonb(o) order by o.erstellt desc) from office_runs o
                            where o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt')), '[]'),
    'office_run_schluessel', coalesce((select jsonb_agg(to_jsonb(k)) from office_run_schluessel k join office_runs o on o.run_id = k.run_id
                            where o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt')), '[]'),
    'office_ereignisse', coalesce((select jsonb_agg(to_jsonb(e) order by e.zeit, e.id) from office_ereignisse e join office_runs o on o.run_id = e.run_id
                            where o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt')), '[]'),
    'office_artefakte', coalesce((select jsonb_agg(to_jsonb(t) order by t.erstellt desc) from office_artefakte t join office_runs o on o.run_id = t.run_id
                            where o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt')), '[]'),
    'office_freigaben', coalesce((select jsonb_agg(to_jsonb(f) order by f.angefordert_am desc) from office_freigaben f join office_runs o on o.run_id = f.run_id
                            where o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt')), '[]'),
    'office_idempotenz', coalesce((select jsonb_agg(to_jsonb(i)) from office_idempotenz i where i.erstellt > now() - interval '30 days'), '[]')
  );
$$;
revoke all on function team_laden() from public, anon, authenticated;
grant execute on function team_laden() to service_role;

-- 9) Startbestand der Registry (aus office/agenten.json). Bestehende Einträge werden nicht überschrieben.
insert into office_agenten (agent_id, name, rolle, raum, faehigkeiten, erlaubte_tools, modell, modell_grund, ausfuehrer, mitglied_id, projekte, timeout_sek, max_versuche, auto_wiederholen) values
  ('akademie-redakteur', 'Akademie-Redakteur', 'Schreibt und überarbeitet Kurstexte, Merkblätter und Übungsaufgaben.', 'Akademie', array['Kurstexte','Merkblätter','Quizfragen','Didaktik']::text[], array['repo_lesen','repo_schreiben','notiz_speichern','web_recherche']::text[], 'claude-sonnet-5-5', 'Lange, sorgfältige Texte in du-Form; Sonnet reicht, Opus wäre teurer ohne Mehrwert.', 'claude-code', 'agent-claude', array['Akademie-Kurs']::text[], 1800, 2, false),
  ('kurs-waechter', 'Kurs-Wächter', 'Prüft täglich Kursseite, Community-Fragen und Störungen und fasst den Stand zusammen.', 'Akademie', array['Statusbericht','Störungserkennung','Klassifikation von Fragen']::text[], array['kurs_status_lesen','community_lesen','notiz_speichern']::text[], 'claude-haiku-5-5', 'Routinecheck mit festem Schema; Haiku ist schnell und günstig.', 'hermes', 'agent-hermes', array['Akademie-Kurs']::text[], 600, 3, true),
  ('marketing-texter', 'Marketing-Texter', 'Entwürfe für Social-Beiträge, Newsletter und Webseitentexte. Veröffentlicht nie selbst.', 'Marketing', array['Social-Posts','Newsletter','Landingpage-Texte','Tonalität Momentum']::text[], array['social_entwurf','notiz_speichern','web_recherche']::text[], 'claude-sonnet-5-5', 'Kreative Texte mit Markenstimme; Standardfall für Sonnet.', 'n8n', 'agent-claude', array['Social Media','Webseite']::text[], 900, 2, false),
  ('social-planer', 'Social-Planer', 'Ordnet Themen Kanälen und Terminen zu und markiert Lücken im Plan.', 'Marketing', array['Redaktionsplan','Kanalzuordnung','Lückenanalyse']::text[], array['social_lesen','social_entwurf']::text[], 'claude-haiku-5-5', 'Klassifikation und Zuordnung nach festen Regeln.', 'n8n', 'agent-claude', array['Social Media']::text[], 600, 3, true),
  ('vertrieb-recherche', 'Vertriebs-Recherche', 'Recherchiert Firmen und Ansprechpartner aus öffentlichen Quellen für Angebote und Förderberatung.', 'Vertrieb', array['Firmenrecherche','Förderprogramme (QCG)','Gesprächsvorbereitung']::text[], array['web_recherche','notiz_speichern']::text[], 'claude-sonnet-5-5', 'Standardrecherche mit Quellenangaben.', 'claude-code', 'agent-claude', array['Vertrieb Herbst']::text[], 1200, 2, false),
  ('angebots-pruefer', 'Angebots-Prüfer', 'Prüft Angebote und Vertragsentwürfe auf Lücken, Risiken und Widersprüche, bevor ein Mensch sie versendet.', 'Vertrieb', array['Angebotsprüfung','Risikohinweise','Preislogik']::text[], array['dokument_lesen','notiz_speichern']::text[], 'claude-opus-5-5', 'Heikle Entscheidung mit finanzieller Wirkung; Opus für gründliche Abwägung.', 'claude-code', 'agent-claude', array['Vertrieb Herbst','Kundenprojekt Müller GmbH']::text[], 1800, 1, false),
  ('kunden-entwickler', 'Kunden-Entwickler', 'Baut und testet n8n-Workflows und kleine Skripte für Kundenprojekte in isolierter Umgebung.', 'Kundenprojekte', array['n8n-Workflows','Skripte','Tests','Dokumentation']::text[], array['repo_lesen','repo_schreiben','tests_ausfuehren','n8n_workflow_entwurf']::text[], 'claude-sonnet-5-5', 'Code und Tests im Standardumfang.', 'codex', 'agent-codex', array['Kundenprojekt Müller GmbH']::text[], 2700, 2, false),
  ('architektur-review', 'Architektur-Review', 'Begutachtet Entwürfe, Sicherheitsfragen und Datenflüsse, bevor etwas beim Kunden live geht.', 'Kundenprojekte', array['Architektur','Sicherheitsreview','Datenflüsse','Datenschutz-Hinweise']::text[], array['repo_lesen','dokument_lesen','notiz_speichern']::text[], 'claude-opus-5-5', 'Review mit hohen Folgekosten bei Fehlern.', 'claude-code', 'agent-claude', array['Kundenprojekt Müller GmbH','Webseite']::text[], 1800, 1, false),
  ('verwaltung-status', 'Verwaltungs-Status', 'Fasst wöchentlich offene Aufgaben, Fristen und Blockaden zusammen. Bewertet keine Personen.', 'Verwaltung', array['Wochenstand','Fristenübersicht','Blockaden erkennen']::text[], array['aufgaben_lesen','notiz_speichern']::text[], 'claude-haiku-5-5', 'Status-Zusammenfassung aus zählbaren Daten.', 'n8n', 'agent-claude', array['Verwaltung & Finanzen','Akademie-Kurs','Webseite','Social Media','Vertrieb Herbst','Kundenprojekt Müller GmbH']::text[], 600, 3, true),
  ('server-waechter', 'Server-Wächter', 'Überwacht Hetzner-Server, n8n und Backups und meldet Auffälligkeiten. Führt keine Änderungen ohne Freigabe aus.', 'Verwaltung', array['Monitoring','Backup-Prüfung','Störungsmeldung']::text[], array['server_status_lesen','backup_pruefen','notiz_speichern']::text[], 'claude-haiku-5-5', 'Routinecheck mit Schwellenwerten.', 'hermes', 'agent-hermes', array['Verwaltung & Finanzen']::text[], 600, 3, true),
  ('rekruiter', 'Rekruiter', 'Stellt neue Agenten ein: klärt mit Timo den Bedarf, schlägt Rolle, Fähigkeiten, Werkzeuge, Modell und Raum vor und legt den Steckbrief zur Freigabe vor. Legt selbst nichts an.', 'Verwaltung', array['Bedarfsklärung','Rollenprofil','Modellwahl nach Kosten/Nutzen','Werkzeug-Allowlist']::text[], array['registry_lesen','agent_vorschlagen','notiz_speichern']::text[], 'claude-sonnet-5-5', 'Strukturierte Rückfragen und ein sauberer Steckbrief; Sonnet reicht, die Entscheidung trifft Timo.', 'claude-code', 'agent-claude', array['Verwaltung & Finanzen']::text[], 1800, 1, false),
  ('orchestrierer', 'Orchestrierer', 'Erkennt Aufgaben, zerlegt sie in Teilaufträge, wählt passende Agenten aus der Registry und bildet bei Bedarf ein Team. Delegiert nur innerhalb der Projektgrenzen, führt selbst nichts aus.', 'Verwaltung', array['Aufgabenzerlegung','Agentenauswahl','Teambildung','Abhängigkeiten erkennen','Statusverdichtung']::text[], array['aufgaben_lesen','registry_lesen','auftrag_delegieren','notiz_speichern']::text[], 'claude-sonnet-5-5', 'Zerlegen und Zuordnen ist Standardarbeit; Opus nur, wenn Teams mit vielen Abhängigkeiten gebildet werden (später je Auftrag wählbar).', 'n8n', 'agent-claude', array['Akademie-Kurs','Webseite','Social Media','Vertrieb Herbst','Kundenprojekt Müller GmbH','Verwaltung & Finanzen']::text[], 1800, 2, false),
  ('pa-assistent', 'PA-Assistent', 'Persönlicher Assistent für Timo: hält Termine im Blick, liest die Postfächer und legt alles, was Timos Entscheidung braucht, als Rückfrage oder Aufgabe auf den Tisch. Antwortet nie selbst nach außen.', 'Verwaltung', array['Terminübersicht','Postfach-Triage','Entscheidungsvorlagen','Fristen erkennen']::text[], array['kalender_lesen','email_lesen','aufgaben_lesen','rueckfrage','notiz_speichern']::text[], 'claude-sonnet-5-5', 'Triage mit Kontext und Urteil, ob eine Entscheidung nötig ist; Haiku wäre für reine Klassifikation günstiger, verfehlt aber Zwischentöne in Mails.', 'hermes', 'agent-hermes', array['Verwaltung & Finanzen']::text[], 900, 3, true)
on conflict (agent_id) do nothing;
update office_agenten set beschreibung = rolle where beschreibung is null;

-- 10) Räume für bestehende Projekte (nur, wo noch keiner gesetzt ist; Namen bitte anpassen)
update team_projekte set raum = 'Marketing'  where raum is null and name in ('Webseite', 'Social Media');
update team_projekte set raum = 'Akademie'   where raum is null and name ilike '%kurs%';

-- Kontrolle: muss office_runs, office_agenten usw. in der Liste zeigen, und 13 Agenten
select jsonb_object_keys(team_laden());
select agent_id, raum, modell, ausfuehrer, mitglied_id from office_agenten order by raum, agent_id;
