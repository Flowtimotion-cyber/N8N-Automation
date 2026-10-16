-- Momentum Team-Portal: Register „Vorschläge“ (Änderungswünsche am Portal)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.

-- 1) Tabelle für Vorschläge
create table if not exists team_vorschlaege (
  vorschlag_id text primary key,
  titel        text not null,
  text         text default '',
  bereich      text default 'Sonstiges',     -- welcher Teil des Portals
  status       text not null default 'neu',  -- neu, geplant, in Arbeit, umgesetzt, abgelehnt
  autor        text not null,
  stimmen      text[] default '{}',          -- wer „Finde ich gut“ geklickt hat (mitglied_id)
  antwort      text default '',              -- Rückmeldung von Timo
  antwort_von  text,
  aufgabe_id   text,                         -- falls daraus eine Aufgabe wurde
  erstellt     timestamptz default now(),
  geaendert    timestamptz default now()
);
alter table team_vorschlaege enable row level security;

-- 2) Laden: Vorschläge zusätzlich mitliefern (sonst unverändert)
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
    'vorschlaege', coalesce((select jsonb_agg(to_jsonb(x) order by x.erstellt desc) from team_vorschlaege x), '[]')
  );
$$;
revoke all on function team_laden() from public, anon, authenticated;
grant execute on function team_laden() to service_role;

-- Kontrolle: muss „vorschlaege“ in der Liste zeigen
select jsonb_object_keys(team_laden());
