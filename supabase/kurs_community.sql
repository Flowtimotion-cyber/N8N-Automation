-- Momentum Kurs-Community: Fragen, Antworten und Nachrichten an den Dozenten
-- Einmal im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.

create table if not exists kurs_community (
  eintrag_id    text primary key,
  art           text not null,                 -- frage | antwort | nachricht (privat an Dozent)
  frage_id      text,                          -- bei Antworten: zu welcher Frage / Nachricht
  modul         text,                          -- z. B. "Modul 1.1", "Modul 1.2", "Allgemein"
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

-- Portal lädt die Community mit (letzte 180 Tage)
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
                            where z.datum >= to_char(now() - interval '120 days', 'YYYY-MM-DD')), '[]'),
    'social',     coalesce((select jsonb_agg(to_jsonb(s) order by s.datum) from team_social s), '[]'),
    'systeme',    coalesce((select jsonb_agg(to_jsonb(y) order by y.name) from team_systeme y), '[]'),
    'community',  coalesce((select jsonb_agg(to_jsonb(c) order by c.erstellt) from kurs_community c
                            where c.erstellt > now() - interval '180 days'), '[]')
  );
$$;
revoke all on function team_laden() from public, anon, authenticated;
grant execute on function team_laden() to service_role;

select 'kurs_community bereit' as ergebnis;
