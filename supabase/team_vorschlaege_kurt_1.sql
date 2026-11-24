-- Momentum Team-Portal: Vorschläge vom 20.11.2026 (Kurt, Lillien) – SCHRITT 1 von 2
-- Mehrere Bearbeiter je Aufgabe (alle gleichberechtigt) und mehrere Aufgaben je Zeiteintrag.
--
-- Im Supabase SQL Editor einmal komplett ausführen (Run). Kann gefahrlos wiederholt werden.
-- Ändert nichts Bestehendes: Es kommen nur zwei Listen-Spalten dazu. Die alten Einzelfelder
-- (team_aufgaben.verantwortlich, team_zeiten.aufgabe_id) bleiben und werden von einem Trigger
-- automatisch passend zur Liste gehalten. Damit laufen alte Portal-Fenster, die Portal-API in der
-- alten Fassung, Agenten (team.py) und Auswertungen unverändert weiter.
--
-- Reihenfolge: 1) diese Datei  2) n8n Portal-API einspielen  3) team_vorschlaege_kurt_2_prio.sql  4) PR mergen

-- 1) Neue Spalten
alter table team_aufgaben add column if not exists bearbeiter  text[] not null default '{}';  -- alle, die an der Aufgabe arbeiten
alter table team_zeiten   add column if not exists aufgaben_ids text[] not null default '{}';  -- alle Aufgaben eines Zeiteintrags

-- 2) Bestehende Einträge übernehmen (nur wo die Liste noch leer ist)
update team_aufgaben set bearbeiter  = array[verantwortlich] where cardinality(bearbeiter) = 0  and coalesce(verantwortlich, '') <> '';
update team_zeiten   set aufgaben_ids = array[aufgabe_id]    where cardinality(aufgaben_ids) = 0 and coalesce(aufgabe_id, '') <> '';
create index if not exists team_aufgaben_bearbeiter on team_aufgaben using gin (bearbeiter);

-- 3) Liste aufräumen: leere Einträge und Doppelte raus, Reihenfolge bleibt
create or replace function team_liste_sauber(l text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(x order by o), '{}'::text[]) from (
    select x, min(o) as o from unnest(coalesce(l, '{}'::text[])) with ordinality as u(x, o)
     where coalesce(trim(x), '') <> '' group by x) s
$$;

-- 4) Liste und Einzelfeld synchron halten (vor jedem Speichern)
--    Ändert ein altes Programm nur das Einzelfeld, wird der alte Wert in der Liste ersetzt.
--    Ist die Liste gefüllt, steht im Einzelfeld immer ein Mitglied der Liste (die erste Person/Aufgabe).
create or replace function team_aufgaben_bearbeiter_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  new.bearbeiter := team_liste_sauber(new.bearbeiter);
  if tg_op = 'UPDATE' and new.verantwortlich is distinct from old.verantwortlich
     and new.bearbeiter = team_liste_sauber(old.bearbeiter) then
    new.bearbeiter := array_remove(new.bearbeiter, old.verantwortlich);
    if coalesce(new.verantwortlich, '') <> '' and not (new.verantwortlich = any(new.bearbeiter)) then
      new.bearbeiter := array_prepend(new.verantwortlich, new.bearbeiter);
    end if;
  elsif cardinality(new.bearbeiter) = 0 and coalesce(new.verantwortlich, '') <> '' then
    new.bearbeiter := array[new.verantwortlich];
  end if;
  if cardinality(new.bearbeiter) > 0 and (new.verantwortlich is null or not (new.verantwortlich = any(new.bearbeiter))) then
    new.verantwortlich := new.bearbeiter[1];
  end if;
  return new;
end $$;

drop trigger if exists team_aufgaben_bearbeiter_sync on team_aufgaben;
create trigger team_aufgaben_bearbeiter_sync before insert or update on team_aufgaben
  for each row execute function team_aufgaben_bearbeiter_sync();

create or replace function team_zeiten_aufgaben_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  new.aufgaben_ids := team_liste_sauber(new.aufgaben_ids);
  if tg_op = 'UPDATE' and new.aufgabe_id is distinct from old.aufgabe_id
     and new.aufgaben_ids = team_liste_sauber(old.aufgaben_ids) then
    if coalesce(new.aufgabe_id, '') = '' then
      new.aufgaben_ids := '{}';                               -- altes Programm: „keine bestimmte Aufgabe“
    else
      new.aufgaben_ids := array_remove(new.aufgaben_ids, old.aufgabe_id);
      if not (new.aufgabe_id = any(new.aufgaben_ids)) then new.aufgaben_ids := array_prepend(new.aufgabe_id, new.aufgaben_ids); end if;
    end if;
  elsif cardinality(new.aufgaben_ids) = 0 and coalesce(new.aufgabe_id, '') <> '' then
    new.aufgaben_ids := array[new.aufgabe_id];
  end if;
  if cardinality(new.aufgaben_ids) > 0 and (new.aufgabe_id is null or not (new.aufgabe_id = any(new.aufgaben_ids))) then
    new.aufgabe_id := new.aufgaben_ids[1];
  end if;
  return new;
end $$;

drop trigger if exists team_zeiten_aufgaben_sync on team_zeiten;
create trigger team_zeiten_aufgaben_sync before insert or update on team_zeiten
  for each row execute function team_zeiten_aufgaben_sync();

-- 5) WhatsApp-Warteschlange (HermetikFlow): je neu hinzugekommenem Bearbeiter ein Eintrag.
--    Nur wenn die Warteschlange angelegt ist (kommunikation_team.sql); sonst passiert hier nichts.
--    Wie bisher: nicht an die Person, die die Aufgabe angelegt hat, nicht bei „Erledigt“.
do $do$
begin
  if to_regclass('public.kom_benachrichtigungen') is null then
    raise notice 'kom_benachrichtigungen fehlt – Benachrichtigungs-Trigger bleibt unverändert.';
    return;
  end if;
  execute $f$
    create or replace function kom_aufgabe_zugewiesen()
    returns trigger
    language plpgsql security definer set search_path = public as $fn$
    declare
      p   text;
      alt text[] := case when tg_op = 'UPDATE' then coalesce(old.bearbeiter, '{}') else '{}' end;
    begin
      if coalesce(new.status, '') = 'Erledigt' then return new; end if;
      foreach p in array coalesce(new.bearbeiter, '{}'::text[]) loop
        continue when p = any(alt) or p = coalesce(new.erstellt_von, '');
        insert into kom_benachrichtigungen (art, mitglied_id, aufgabe_id, titel, von)
        values ('neue_aufgabe', p, new.aufgabe_id, left(coalesce(new.titel, ''), 200), new.erstellt_von);
      end loop;
      return new;
    end $fn$
  $f$;
  execute 'drop trigger if exists kom_aufgabe_zugewiesen on team_aufgaben';
  execute 'create trigger kom_aufgabe_zugewiesen after insert or update of verantwortlich, bearbeiter on team_aufgaben
             for each row execute function kom_aufgabe_zugewiesen()';
  execute 'revoke all on function kom_aufgabe_zugewiesen() from public, anon, authenticated';
end $do$;

revoke all on function team_liste_sauber(text[])           from public, anon, authenticated;
revoke all on function team_aufgaben_bearbeiter_sync()      from public, anon, authenticated;
revoke all on function team_zeiten_aufgaben_sync()          from public, anon, authenticated;

-- 6) Kontrolle: beide Zahlen sollten 0 sein
select
  (select count(*) from team_aufgaben where coalesce(verantwortlich, '') <> '' and not (verantwortlich = any(bearbeiter))) as aufgaben_ohne_liste,
  (select count(*) from team_zeiten   where coalesce(aufgabe_id, '')     <> '' and not (aufgabe_id = any(aufgaben_ids)))   as zeiten_ohne_liste;
