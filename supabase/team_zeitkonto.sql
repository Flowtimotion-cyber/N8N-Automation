-- Momentum Team-Portal: Vertragsstunden, Überstundenkonto und Monatsabschlüsse
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Enthält auch die Kurs-Community-Tabelle (falls kurs_community.sql noch nicht gelaufen ist).

-- 1) Vertrag je Person
alter table team_mitglieder add column if not exists vertrag_std      numeric;                 -- Stunden pro Monat laut Arbeitsvertrag
alter table team_mitglieder add column if not exists startguthaben_min int  default 0;         -- Guthaben aus der Zeit vor dem Portal (Minuten)
alter table team_mitglieder add column if not exists abrechnung_ab     text default '2026-10-05'; -- ab hier zählen Monate; alles davor geht aufs Konto

-- 2) Abgeschlossene Monate (fester Stand für Lohnbüro und PDF)
create table if not exists team_abrechnung (
  abrechnung_id     text primary key,          -- mitglied_id + '_' + monat
  mitglied_id       text not null,
  monat             text not null,             -- YYYY-MM
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
alter table team_abrechnung enable row level security;

-- 3) Kurs-Community (nur falls noch nicht vorhanden)
create table if not exists kurs_community (
  eintrag_id    text primary key,
  art           text not null,
  frage_id      text,
  modul         text,
  teilnehmer_id text,
  kurscode      text,
  name          text,
  autor_typ     text not null default 'teilnehmer',
  autor_id      text,
  text          text not null,
  status        text not null default 'sichtbar',
  erledigt      boolean default false,
  erstellt      timestamptz default now()
);
alter table kurs_community enable row level security;

-- 4) Laden: Zeiten jetzt ab 01.07.2026 (damit das Überstundenkonto vollständig rechnet), plus Abrechnungen
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
                            where c.erstellt > now() - interval '180 days'), '[]')
  );
$$;
revoke all on function team_laden() from public, anon, authenticated;
grant execute on function team_laden() to service_role;

-- 5) Lillien: 30 Stunden pro Monat (kann sie im Portal selbst ändern)
update team_mitglieder set vertrag_std = 30 where name ilike 'lil%' and vertrag_std is null;

-- Kontrolle
select name, vertrag_std, startguthaben_min, abrechnung_ab from team_mitglieder where typ = 'mensch' order by name;
