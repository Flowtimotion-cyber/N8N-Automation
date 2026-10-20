-- Team-Portal: Papierkorb und Notiz-Versionen (20.10.2026)
-- Einmal im Supabase-SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
--
-- Papierkorb: Löschen im Portal ruft team_loeschen() auf. Die Funktion kopiert die Zeile (bei Aufgaben samt Verlauf)
-- in team_papierkorb und löscht sie erst danach, beides in einem Schritt. 30 Tage lang kann man sie mit
-- team_wiederherstellen() zurückholen, danach räumt team_loeschen() sie weg.
-- Notiz-Versionen: Ein Trigger sichert vor jeder Änderung von Titel oder Inhalt die bisherige Fassung (je Notiz die
-- letzten 30, höchstens 180 Tage). So geht auch bei gleichzeitigem Bearbeiten keine Fassung verloren.

create table if not exists team_papierkorb (
  eintrag_id    text primary key,
  art           text not null,            -- aufgabe | notiz | vorschlag | social | system | zeit
  objekt_id     text not null,
  titel         text,
  daten         jsonb not null,           -- die ganze Zeile; bei Aufgaben zusätzlich _verlauf
  geloescht_von text,
  geloescht_am  timestamptz default now()
);
create index if not exists team_papierkorb_zeit on team_papierkorb (geloescht_am desc);

create table if not exists team_notiz_versionen (
  version_id    text primary key,
  notiz_id      text not null,
  titel         text,
  inhalt        text,
  projekt       text,
  geaendert_von text,                     -- wer diese Fassung geschrieben hatte
  fassung_vom   timestamptz,              -- wann diese Fassung gespeichert worden war
  gesichert_am  timestamptz default now() -- wann sie durch eine neuere ersetzt wurde
);
create index if not exists team_notiz_versionen_notiz on team_notiz_versionen (notiz_id, gesichert_am desc);

alter table team_papierkorb      enable row level security;
alter table team_notiz_versionen enable row level security;

-- Welche Tabelle zu welcher Art gehört
create or replace function team_papierkorb_ziel(p_art text, out tab text, out pk text, out titelspalte text)
language sql immutable as $$
  select t.tab, t.pk, t.titelspalte from (values
    ('aufgabe',   'team_aufgaben',    'aufgabe_id',   'titel'),
    ('notiz',     'team_notizen',     'notiz_id',     'titel'),
    ('vorschlag', 'team_vorschlaege', 'vorschlag_id', 'titel'),
    ('social',    'team_social',      'post_id',      'thema'),
    ('system',    'team_systeme',     'system_id',    'name'),
    ('zeit',      'team_zeiten',      'zeit_id',      'taetigkeit')
  ) as t(art, tab, pk, titelspalte) where t.art = p_art;
$$;

create or replace function team_loeschen(p_art text, p_id text, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare z record; zeile jsonb; neu_id text;
begin
  select * into z from team_papierkorb_ziel(p_art);
  if z.tab is null then raise exception 'Unbekannte Art: %', p_art; end if;
  execute format('select to_jsonb(x) from %I x where %I = $1', z.tab, z.pk) into zeile using p_id;
  if zeile is null then raise exception 'Nicht gefunden: % %', p_art, p_id; end if;
  if p_art = 'aufgabe' then
    zeile := zeile || jsonb_build_object('_verlauf', coalesce((select jsonb_agg(to_jsonb(v) order by v.erstellt)
      from team_aufgaben_verlauf v where v.aufgabe_id = p_id), '[]'::jsonb));
  end if;
  neu_id := 'pk_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text), 1, 6);
  insert into team_papierkorb (eintrag_id, art, objekt_id, titel, daten, geloescht_von)
    values (neu_id, p_art, p_id, left(coalesce(zeile ->> z.titelspalte, ''), 200), zeile, p_von);
  execute format('delete from %I where %I = $1', z.tab, z.pk) using p_id;
  delete from team_papierkorb where geloescht_am < now() - interval '30 days';
  return neu_id;
end $$;

create or replace function team_wiederherstellen(p_eintrag text) returns text
language plpgsql security definer set search_path = public as $$
declare e record; z record; zeile jsonb; da boolean;
begin
  select * into e from team_papierkorb where eintrag_id = p_eintrag;
  if e.eintrag_id is null then raise exception 'Dieser Eintrag ist nicht mehr im Papierkorb.'; end if;
  select * into z from team_papierkorb_ziel(e.art);
  zeile := e.daten - '_verlauf';
  execute format('select exists (select 1 from %I where %I = $1)', z.tab, z.pk) into da using e.objekt_id;
  if da then raise exception 'Das gibt es schon wieder (gleiche ID). Nichts geändert.'; end if;
  -- Notiztitel müssen eindeutig sein
  if e.art = 'notiz' and exists (select 1 from team_notizen n where lower(n.titel) = lower(zeile ->> 'titel')) then
    zeile := jsonb_set(zeile, '{titel}', to_jsonb((zeile ->> 'titel') || ' (wiederhergestellt)'));
  end if;
  execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', z.tab, z.tab) using zeile;
  if e.art = 'aufgabe' and jsonb_typeof(e.daten -> '_verlauf') = 'array' then
    insert into team_aufgaben_verlauf (aufgabe_id, autor, art, text, erstellt)
      select v.aufgabe_id, v.autor, v.art, v.text, v.erstellt
      from jsonb_to_recordset(e.daten -> '_verlauf') as v(aufgabe_id text, autor text, art text, text text, erstellt timestamptz);
  end if;
  delete from team_papierkorb where eintrag_id = p_eintrag;
  return e.objekt_id;
end $$;

create or replace function team_notiz_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.inhalt is distinct from new.inhalt or old.titel is distinct from new.titel then
    insert into team_notiz_versionen (version_id, notiz_id, titel, inhalt, projekt, geaendert_von, fassung_vom)
      values ('nv_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text), 1, 6),
              old.notiz_id, old.titel, old.inhalt, old.projekt, old.geaendert_von, old.geaendert);
    delete from team_notiz_versionen
      where notiz_id = old.notiz_id
        and (gesichert_am < now() - interval '180 days'
             or version_id not in (select version_id from team_notiz_versionen where notiz_id = old.notiz_id order by gesichert_am desc limit 30));
  end if;
  return new;
end $$;

drop trigger if exists team_notiz_version on team_notizen;
create trigger team_notiz_version before update on team_notizen
  for each row execute function team_notiz_version();

-- Laden wie bisher, dazu Papierkorb (30 Tage) und Versionen. Die Portal-API ruft diese Funktion auf.
create or replace function team_laden_plus() returns jsonb
language sql stable security definer set search_path = public as $$
  select team_laden() || jsonb_build_object(
    'papierkorb', coalesce((select jsonb_agg(to_jsonb(p) order by p.geloescht_am desc) from team_papierkorb p
                            where p.geloescht_am > now() - interval '30 days'), '[]'::jsonb),
    'notiz_versionen', coalesce((select jsonb_agg(to_jsonb(v) order by v.gesichert_am desc) from team_notiz_versionen v
                            where v.gesichert_am > now() - interval '180 days'), '[]'::jsonb)
  );
$$;

revoke all on function team_papierkorb_ziel(text)                from public, anon, authenticated;
revoke all on function team_loeschen(text, text, text)            from public, anon, authenticated;
revoke all on function team_wiederherstellen(text)                from public, anon, authenticated;
revoke all on function team_notiz_version()                       from public, anon, authenticated;
revoke all on function team_laden_plus()                          from public, anon, authenticated;
grant execute on function team_papierkorb_ziel(text)     to service_role;
grant execute on function team_loeschen(text, text, text) to service_role;
grant execute on function team_wiederherstellen(text)     to service_role;
grant execute on function team_laden_plus()               to service_role;
