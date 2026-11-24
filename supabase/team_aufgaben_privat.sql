-- Team-Portal: private Aufgaben (Entscheidung Timo 23.11.2026)
-- Eine private Aufgabe sehen nur die Person, die sie angelegt hat, und die eingetragenen Bearbeiter. Auch Timo (Admin) und
-- andere Agenten sehen sie nicht.
--
-- Was diese Datei macht:
--   1) neue Spalte team_aufgaben.privat (Standard: nein, ändert an bestehenden Aufgaben nichts)
--   2) team_laden() liefert ab jetzt KEINE privaten Aufgaben und keinen Verlauf dazu. team_laden() lesen u. a. das KI Office,
--      der Wochenstand (schreibt eine Notiz für alle), der Portal-Assistent und der Verwaltungs-Status. Dort taucht Privates nie auf.
--      Dafür wird die bisherige Funktion unverändert in team_laden_alle() umbenannt, und team_laden() ist nur noch ein Filter darüber.
--   3) team_laden_plus() (liest nur die Portal-API) liest team_laden_alle(), also alles. Die Portal-API filtert selbst je Person
--      (Knoten „Anfrage prüfen“ und „Antwort bauen“, Repo team/n8n).
--
-- WICHTIG für spätere Änderungen: Wer team_laden() mit „create or replace“ neu anlegt (wie in früheren SQL-Dateien), hebt den Filter
-- auf. Danach diese Datei einfach noch einmal ausführen: Sie erkennt das, macht die neue Fassung zu team_laden_alle() und setzt den
-- Filter wieder davor. Die Datei kann beliebig oft ausgeführt werden.
--
-- Ausführen: Timo im Supabase SQL Editor, VOR dem Einspielen der Portal-API (sonst kennt Supabase die Spalte „privat“ nicht).

alter table team_aufgaben add column if not exists privat boolean not null default false;

-- 2) Bisheriges team_laden() → team_laden_alle()
do $$
declare
  hat_alle boolean := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'team_laden_alle' and p.pronargs = 0);
  def text := pg_get_functiondef('public.team_laden()'::regprocedure);
begin
  if not hat_alle then
    alter function public.team_laden() rename to team_laden_alle;
  elsif position('team_laden_alle' in def) = 0 then
    -- team_laden() wurde nach dem ersten Lauf neu angelegt (ohne Filter): die neue Fassung übernehmen
    drop function public.team_laden_alle();
    alter function public.team_laden() rename to team_laden_alle;
  end if;
end $$;

-- Filter: private Aufgaben und ihren Verlauf herausnehmen, Reihenfolge bleibt
create or replace function team_ohne_privat(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  with weg as (
    select coalesce(array_agg(e->>'aufgabe_id'), '{}'::text[]) ids
    from jsonb_array_elements(coalesce(j->'aufgaben', '[]'::jsonb)) e
    where coalesce((e->>'privat')::boolean, false)
  )
  select j || jsonb_build_object(
    'aufgaben', coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(coalesce(j->'aufgaben', '[]'::jsonb)) with ordinality t(e, i)
                          where not coalesce((e->>'privat')::boolean, false)), '[]'::jsonb),
    'verlauf',  coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(coalesce(j->'verlauf', '[]'::jsonb)) with ordinality t(e, i), weg
                          where not ((e->>'aufgabe_id') = any (weg.ids))), '[]'::jsonb))
$$;

-- team_laden(): wie bisher, aber ohne private Aufgaben. Alle Leser außer der Portal-API bekommen diese Fassung.
create or replace function team_laden() returns jsonb
language sql stable security definer set search_path = public as $$
  select team_ohne_privat(team_laden_alle());
$$;

-- 3) team_laden_plus() liest die ungefilterte Fassung (bisherigen Text übernehmen, nur den Aufruf tauschen)
do $$
declare def text := pg_get_functiondef('public.team_laden_plus()'::regprocedure);
begin
  if position('team_laden_alle()' in def) = 0 then
    execute replace(def, 'team_laden()', 'team_laden_alle()');
  end if;
end $$;

revoke all on function team_laden_alle()        from public, anon, authenticated;
revoke all on function team_ohne_privat(jsonb)  from public, anon, authenticated;
revoke all on function team_laden()             from public, anon, authenticated;
revoke all on function team_laden_plus()        from public, anon, authenticated;
grant execute on function team_laden_alle()       to service_role;
grant execute on function team_ohne_privat(jsonb) to service_role;
grant execute on function team_laden()            to service_role;
grant execute on function team_laden_plus()       to service_role;

-- Probe (sollte true, true, true zeigen):
--   select position('team_laden_alle' in pg_get_functiondef('public.team_laden()'::regprocedure)) > 0      as filter_davor,
--          position('team_laden_alle()' in pg_get_functiondef('public.team_laden_plus()'::regprocedure)) > 0 as portal_liest_alles,
--          (select count(*) from jsonb_array_elements(team_laden()->'aufgaben') e where (e->>'privat')::boolean) = 0 as nichts_privates;
