-- Kommunikation, Teil 2: WhatsApp fürs Team (Team-Assistent, Benachrichtigung bei neuer Aufgabe)
-- Nach supabase/kommunikation.sql einmal im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Zugriff nur über n8n (service_role). Stand 27.10.2026.

-- Telefonnummer vergleichbar machen: nur Ziffern, 00… → …, 0… → 49… (deutsche Nummern ohne Vorwahl)
create or replace function kom_norm_tel(t text)
returns text
language sql immutable as $$
  select case
    when d is null or d = '' then null
    when d like '00%'  then substr(d, 3)
    when d like '490%' then '49' || substr(d, 4)      -- +49 (0)173 … → 49173 …
    when d like '0%'  then '49' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x;
$$;

-- Teammitglied zu einer WhatsApp-Nummer. Nur aktive Menschen mit WhatsApp-Einwilligung.
-- Gibt nie den Portal-Token zurück.
create or replace function kom_team_kontakt(p_wa text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('mitglied_id', m.mitglied_id, 'name', m.name, 'rolle', m.rolle)
       from team_mitglieder m
      where m.status = 'aktiv' and m.typ = 'mensch' and m.whatsapp_ok is true
        and kom_norm_tel(m.telefon) = kom_norm_tel(p_wa)
      limit 1),
    '{}'::jsonb);
$$;

-- Portal-Zugang eines erkannten Teammitglieds, damit n8n serverseitig den bestehenden Portal-Assistenten fragen kann
-- (gleiche Rechte wie im Portal). Nur service_role, nur aktive Menschen mit WhatsApp-Einwilligung.
create or replace function kom_team_token(p_mitglied_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('token', m.token) from team_mitglieder m
      where m.mitglied_id = p_mitglied_id and m.status = 'aktiv' and m.typ = 'mensch' and m.whatsapp_ok is true),
    '{}'::jsonb);
$$;
revoke all on function kom_team_token(text) from public, anon, authenticated;
grant execute on function kom_team_token(text) to service_role;

-- Teammitglieder können zum Testen mit /kunde den Kunden-Bot nutzen und mit /team zurückwechseln.
alter table kom_konversationen add column if not exists ansicht text;   -- null = automatisch | 'kunde'

-- Warteschlange für WhatsApp-Benachrichtigungen ans Team
create table if not exists kom_benachrichtigungen (
  id          bigint generated always as identity primary key,
  art         text not null,                          -- neue_aufgabe
  mitglied_id text not null,
  aufgabe_id  text,
  titel       text,
  von         text,
  status      text not null default 'offen',          -- offen | in_arbeit | gesendet | uebersprungen | fehler
  versuche    int  not null default 0,
  fehler      text,
  erstellt    timestamptz not null default now(),
  gesendet    timestamptz
);
create index if not exists kom_benachr_status on kom_benachrichtigungen (status, erstellt);
alter table kom_benachrichtigungen enable row level security;

-- Neue Zuweisung einer Aufgabe → Eintrag in die Warteschlange (nicht an die Person, die sie angelegt hat, nicht bei Erledigt)
create or replace function kom_aufgabe_zugewiesen()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.verantwortlich, '') = '' or coalesce(new.status, '') = 'Erledigt' then return new; end if;
  if tg_op = 'UPDATE' and old.verantwortlich is not distinct from new.verantwortlich then return new; end if;
  if new.verantwortlich = coalesce(new.erstellt_von, '') then return new; end if;   -- eigene Aufgabe
  insert into kom_benachrichtigungen (art, mitglied_id, aufgabe_id, titel, von)
  values ('neue_aufgabe', new.verantwortlich, new.aufgabe_id, left(coalesce(new.titel, ''), 200), new.erstellt_von);
  return new;
end $$;

drop trigger if exists kom_aufgabe_zugewiesen on team_aufgaben;
create trigger kom_aufgabe_zugewiesen
  after insert or update of verantwortlich on team_aufgaben
  for each row execute function kom_aufgabe_zugewiesen();

-- Abholen für n8n: nimmt bis zu 20 offene Einträge, prüft Empfänger, markiert als in_arbeit.
-- Empfänger ohne Nummer, ohne WhatsApp-Einwilligung oder KI-Agenten werden übersprungen.
create or replace function kom_benachrichtigungen_holen()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  update kom_benachrichtigungen b
     set status = 'uebersprungen', fehler = 'kein Empfänger mit WhatsApp-Einwilligung'
    from team_mitglieder m
   where b.status = 'offen' and m.mitglied_id = b.mitglied_id
     and (m.typ <> 'mensch' or m.status <> 'aktiv' or m.whatsapp_ok is not true or kom_norm_tel(m.telefon) is null);
  update kom_benachrichtigungen b set status = 'uebersprungen', fehler = 'Mitglied unbekannt'
   where b.status = 'offen' and not exists (select 1 from team_mitglieder m where m.mitglied_id = b.mitglied_id);

  with auswahl as (
    select id from kom_benachrichtigungen
     where status = 'offen' and versuche < 3
     order by erstellt limit 20 for update skip locked
  ), markiert as (
    update kom_benachrichtigungen b set status = 'in_arbeit', versuche = b.versuche + 1
      from auswahl a where b.id = a.id
    returning b.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'art', k.art, 'aufgabe_id', k.aufgabe_id, 'titel', k.titel,
           'an_name', split_part(m.name, ' ', 1), 'wa', kom_norm_tel(m.telefon),
           'von_name', coalesce(split_part(v2.name, ' ', 1), 'jemand aus dem Team'))), '[]'::jsonb)
    into v
    from markiert k
    join team_mitglieder m on m.mitglied_id = k.mitglied_id
    left join team_mitglieder v2 on v2.mitglied_id = k.von;
  return jsonb_build_object('liste', v);
end $$;

create or replace function kom_benachrichtigung_ergebnis(p_id bigint, p_ok boolean, p_fehler text)
returns jsonb
language sql security definer set search_path = public as $$
  update kom_benachrichtigungen
     set status = case when p_ok then 'gesendet' when versuche >= 3 then 'fehler' else 'offen' end,
         gesendet = case when p_ok then now() else gesendet end,
         fehler = case when p_ok then null else left(p_fehler, 500) end
   where id = p_id
  returning jsonb_build_object('id', id, 'status', status);
$$;

revoke all on function kom_team_kontakt(text)                          from public, anon, authenticated;
revoke all on function kom_benachrichtigungen_holen()                   from public, anon, authenticated;
revoke all on function kom_benachrichtigung_ergebnis(bigint, boolean, text) from public, anon, authenticated;
grant execute on function kom_team_kontakt(text)                          to service_role;
grant execute on function kom_benachrichtigungen_holen()                   to service_role;
grant execute on function kom_benachrichtigung_ergebnis(bigint, boolean, text) to service_role;
