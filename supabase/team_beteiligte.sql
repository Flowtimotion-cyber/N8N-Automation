-- Team-Portal: mehrere Personen pro Aufgabe („Beteiligte“) + WhatsApp-Benachrichtigung für jede neu beteiligte Person.
-- Nach supabase/kommunikation_team.sql einmal im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Stand 27.10.2026.

alter table team_aufgaben add column if not exists beteiligte text[] not null default '{}';
create index if not exists team_aufgaben_beteiligte on team_aufgaben using gin (beteiligte);

-- Ersetzt die Funktion aus kommunikation_team.sql: Hauptverantwortliche Person UND neu hinzugekommene Beteiligte kommen in die Warteschlange.
-- Nicht benachrichtigt: Erledigt-Aufgaben, die Person, die die Aufgabe angelegt hat, und Personen, die schon vorher dabei waren.
create or replace function kom_aufgabe_zugewiesen()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_vorher text[] := '{}';
  v_person text;
begin
  if coalesce(new.status, '') = 'Erledigt' then return new; end if;
  if tg_op = 'UPDATE' then
    v_vorher := array_remove(coalesce(old.beteiligte, '{}') || coalesce(old.verantwortlich, ''), '');
  end if;
  for v_person in
    select distinct x from unnest(array_remove(coalesce(new.beteiligte, '{}') || coalesce(new.verantwortlich, ''), '')) as x
  loop
    if v_person = any(v_vorher) then continue; end if;                       -- war schon dabei
    if v_person = coalesce(new.erstellt_von, '') then continue; end if;      -- eigene Aufgabe
    insert into kom_benachrichtigungen (art, mitglied_id, aufgabe_id, titel, von)
    values ('neue_aufgabe', v_person, new.aufgabe_id, left(coalesce(new.titel, ''), 200), new.erstellt_von);
  end loop;
  return new;
end $$;

drop trigger if exists kom_aufgabe_zugewiesen on team_aufgaben;
create trigger kom_aufgabe_zugewiesen
  after insert or update of verantwortlich, beteiligte on team_aufgaben
  for each row execute function kom_aufgabe_zugewiesen();

notify pgrst, 'reload schema';
