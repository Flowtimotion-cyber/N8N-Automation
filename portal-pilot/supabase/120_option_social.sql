-- =====================================================================================================
-- 120_option_social.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "Social Media"
-- =====================================================================================================
-- Was macht diese Datei?
--   1) Beitragsplan team_social: Beiträge je Kanal und Datum mit Freigabe durch einen Menschen und
--      Veröffentlichungs-Warteschlange für n8n (social_faellig / social_erledigt / social_fehler).
--   2) Ideen-Liste team_social_ideen: Links zu starken fremden Beiträgen, Freitext-Ideen, Bilder.
--   3) Eigene Videos team_social_uploads: Rohvideos landen in einem privaten Storage-Bucket, die Tabelle
--      führt Herkunft, Einwilligung, Status und den Auftrag an einen Schnitt-Agenten (Option 140).
-- Pflicht oder Option?  OPTION.
-- Wovon hängt sie ab?   001_basis.sql, 003_team_laden.sql. team_laden() liefert "social" automatisch,
--                       sobald team_social da ist. Der Papierkorb kennt "social" und "idee" bereits.
--                       Diese Datei definiert team_laden() NICHT neu.
-- Mehrfach ausführbar?  Ja.
--
-- Storage-Buckets (nur bei Supabase, lokal wird dieser Teil übersprungen):
--   medien-roh    privat, 2 GB je Datei: Rohvideos. Keine Policies: nur service_role und signierte URLs aus n8n.
--   social-ideen  öffentlich lesbar, 20 MB je Datei: Bilder zu Ideen (Screenshots, Motive). Upload nur über
--                 signierte URLs aus n8n. Hier keine Rohvideos und keine Aufnahmen von Personen ablegen.
--   Die Buckets sieht man unter Supabase → Storage. Löschen beim Pilotende: 999_loeschen.sql.
-- Ablauf Veröffentlichung: Jemand legt einen Beitrag an und setzt ihn höchstens auf "Zur Freigabe".
--   Ein Mensch prüft im Portal und setzt "Geplant" (der Server trägt freigegeben_von/_am ein). Ein
--   n8n-Workflow holt regelmäßig über social_faellig() die freigegebenen, fälligen Beiträge, postet sie
--   und schreibt Permalink und Status "Veröffentlicht" zurück. Nach 3 Fehlversuchen geht der Beitrag
--   zurück auf "Zur Freigabe", damit ein Mensch draufschaut.
-- =====================================================================================================

-- 1) Beitragsplan ---------------------------------------------------------------------------------------
create table if not exists team_social (
  post_id        text primary key,
  datum          text,                             -- JJJJ-MM-TT
  kanal          text,                             -- Instagram | LinkedIn | Facebook | YouTube | TikTok | ...
  thema          text,
  text           text,
  status         text,                             -- Idee | In Arbeit | Zur Freigabe | Geplant | Veröffentlicht
  verantwortlich text,
  link           text,
  geaendert      timestamptz default now()
);
alter table team_social add column if not exists uhrzeit            text;          -- HH:MM, Europe/Berlin; leer = 09:00
alter table team_social add column if not exists format             text;          -- Bild | Karussell | Reel | Text
alter table team_social add column if not exists medien             text;          -- öffentliche URLs, eine pro Zeile (Karussell: 2 bis 10)
alter table team_social add column if not exists hook               text;          -- erste Zeile / erste Sekunde, intern
alter table team_social add column if not exists hashtags           text;
alter table team_social add column if not exists quelle             text;          -- Inspiration, z. B. Link zum Vorbild-Post
alter table team_social add column if not exists freigegeben_von    text;
alter table team_social add column if not exists freigegeben_am     timestamptz;
alter table team_social add column if not exists in_arbeit_seit     timestamptz;   -- Sperre, solange n8n postet
alter table team_social add column if not exists versuche           integer default 0;
alter table team_social add column if not exists fehler             text;
alter table team_social add column if not exists plattform_id       text;          -- Media-ID der Plattform
alter table team_social add column if not exists permalink          text;
alter table team_social add column if not exists veroeffentlicht_am timestamptz;
create index if not exists team_social_faellig on team_social (status, datum);

-- Fällige Beiträge holen und im selben Schritt sperren (kein Doppelposten, auch wenn zwei Läufe überlappen).
-- Nur Kanäle, die n8n bedienen kann, nur mit Freigabe durch einen Menschen, nur ohne Plattform-ID.
create or replace function social_faellig(p_kanaele text[] default array['Instagram']) returns setof team_social
language plpgsql security definer set search_path = public as $$
begin
  return query
  update team_social s set in_arbeit_seit = now()
  where s.post_id in (
    select x.post_id from team_social x
    where x.status = 'Geplant'
      and x.kanal = any(p_kanaele)
      and x.freigegeben_von is not null
      and coalesce(x.plattform_id, '') = ''
      and coalesce(x.versuche, 0) < 3
      and x.datum ~ '^\d{4}-\d{2}-\d{2}$'
      and (x.datum || ' ' || coalesce(nullif(x.uhrzeit, ''), '09:00'))::timestamp at time zone 'Europe/Berlin' <= now()
      and (x.in_arbeit_seit is null or x.in_arbeit_seit < now() - interval '30 minutes')
    order by x.datum, x.uhrzeit
    limit 5
    for update skip locked
  )
  returning s.*;
end;
$$;

-- Erfolg zurückschreiben
create or replace function social_erledigt(p_id text, p_plattform_id text, p_permalink text) returns void
language sql security definer set search_path = public as $$
  update team_social set status = 'Veröffentlicht', plattform_id = p_plattform_id, permalink = p_permalink,
    link = coalesce(nullif(p_permalink, ''), link), veroeffentlicht_am = now(), in_arbeit_seit = null,
    fehler = null, geaendert = now()
  where post_id = p_id;
$$;

-- Fehler zurückschreiben; nach 3 Versuchen zurück zur Freigabe
create or replace function social_fehler(p_id text, p_fehler text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update team_social set versuche = coalesce(versuche, 0) + 1, fehler = left(p_fehler, 1500), in_arbeit_seit = null,
    status = case when coalesce(versuche, 0) + 1 >= 3 then 'Zur Freigabe' else status end,
    freigegeben_von = case when coalesce(versuche, 0) + 1 >= 3 then null else freigegeben_von end,
    freigegeben_am  = case when coalesce(versuche, 0) + 1 >= 3 then null else freigegeben_am end,
    geaendert = now()
  where post_id = p_id returning versuche into v;
  return jsonb_build_object('post_id', p_id, 'versuche', v, 'zurueck_zur_freigabe', coalesce(v, 0) >= 3);
end;
$$;

-- 2) Ideen und starke fremde Beiträge (Steinbruch für Themen, nie zum Kopieren) ---------------------------
create table if not exists team_social_ideen (
  idee_id        text primary key,
  art            text not null default 'link',     -- link (fremder Beitrag), idee (Freitext), bild (Screenshot oder eigenes Motiv)
  link           text not null default '',
  bild_pfad      text not null default '',         -- Pfad im öffentlichen Bucket social-ideen
  titel          text not null default '',         -- worum geht es (kurz)
  quelle         text not null default '',         -- Autor / Firma / Profil
  kanal          text not null default 'LinkedIn', -- LinkedIn, Instagram, YouTube, TikTok, Sonstiges
  warum_stark    text not null default '',         -- was daran gut ist (Hook, Aufbau, Bild, Zahl ...)
  thema_fuer_uns text not null default '',         -- welches Thema wir daraus machen könnten
  status         text not null default 'neu',      -- neu | geprüft | umgesetzt | verworfen
  post_id        text,                             -- wenn daraus ein eigener Beitrag wurde (team_social.post_id)
  erstellt       timestamptz not null default now(),
  erstellt_von   text not null default '',
  geaendert      timestamptz not null default now(),
  geaendert_von  text not null default ''
);
create index if not exists team_social_ideen_status on team_social_ideen (status, geaendert desc);

-- Anlegen oder ändern. p = Felder aus dem Portal (vom Server geprüft), p_von = mitglied_id.
create or replace function team_idee_speichern(p jsonb, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare id text := p ->> 'idee_id';
begin
  if id is null or id = '' then raise exception 'idee_id fehlt'; end if;
  insert into team_social_ideen (idee_id, art, link, bild_pfad, titel, quelle, kanal, warum_stark, thema_fuer_uns, status, post_id, erstellt_von, geaendert_von)
  values (id, coalesce(p ->> 'art', 'link'), coalesce(p ->> 'link', ''), coalesce(p ->> 'bild_pfad', ''), coalesce(p ->> 'titel', ''), coalesce(p ->> 'quelle', ''), coalesce(p ->> 'kanal', 'LinkedIn'),
          coalesce(p ->> 'warum_stark', ''), coalesce(p ->> 'thema_fuer_uns', ''), coalesce(p ->> 'status', 'neu'), nullif(p ->> 'post_id', ''), p_von, p_von)
  on conflict (idee_id) do update set
    art = excluded.art, link = excluded.link, bild_pfad = excluded.bild_pfad, titel = excluded.titel, quelle = excluded.quelle, kanal = excluded.kanal, warum_stark = excluded.warum_stark,
    thema_fuer_uns = excluded.thema_fuer_uns, status = excluded.status, post_id = excluded.post_id, geaendert = now(), geaendert_von = p_von;
  return id;
end $$;

-- 3) Eigene Videos ---------------------------------------------------------------------------------------
create table if not exists team_social_uploads (
  upload_id       text primary key,
  bucket          text not null default 'medien-roh',
  pfad            text not null,                   -- Pfad im Bucket: JJJJ/MM/<upload_id>_<dateiname>
  dateiname       text not null,
  groesse         bigint not null default 0,       -- Bytes, wie vom Browser gemeldet
  mime            text not null default '',
  thema           text not null default '',
  kanal           text not null default 'LinkedIn',
  kontext         text not null default '',        -- was im Video passiert, worauf der Schnitt achten soll
  stil            text not null default '',        -- Markenstil für Grafiken und Bauchbinden (je Firma festlegen)
  einwilligung    boolean not null default false,  -- gezeigte Personen sind einverstanden (Häkchen beim Upload)
  einwilligung_am timestamptz,
  status          text not null default 'hochladen', -- hochladen | hochgeladen | beauftragt | geschnitten | fehler | geloescht
  run_id          text,                            -- Auftrag im KI Office (Option 140, office_runs.run_id)
  post_id         text,                            -- fertiger Beitrag im Plan
  fehler          text,
  aufbewahren_bis date not null default (current_date + 90), -- Löschkonzept: Rohmaterial 90 Tage, danach weg
  erstellt        timestamptz not null default now(),
  erstellt_von    text not null default '',
  geaendert       timestamptz not null default now(),
  geaendert_von   text not null default ''
);
create index if not exists team_social_uploads_status on team_social_uploads (status, erstellt desc);

create or replace function team_upload_anlegen(p jsonb, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare id text := p ->> 'upload_id';
begin
  if id is null or id = '' then raise exception 'upload_id fehlt'; end if;
  if coalesce((p ->> 'einwilligung')::boolean, false) is not true then raise exception 'Ohne Einwilligung kein Upload'; end if;
  insert into team_social_uploads (upload_id, pfad, dateiname, groesse, mime, thema, kanal, kontext, stil, einwilligung, einwilligung_am, status, erstellt_von, geaendert_von)
  values (id, p ->> 'pfad', p ->> 'dateiname', coalesce((p ->> 'groesse')::bigint, 0), coalesce(p ->> 'mime', ''), coalesce(p ->> 'thema', ''),
          coalesce(p ->> 'kanal', 'LinkedIn'), coalesce(p ->> 'kontext', ''), coalesce(p ->> 'stil', ''), true, now(), 'hochladen', p_von, p_von)
  on conflict (upload_id) do nothing;
  return id;
end $$;

-- Statuswechsel aus dem Portal: hochgeladen (PUT fertig), beauftragt (+run_id), fehler (+text), geloescht.
create or replace function team_upload_status(p_id text, p_status text, p_von text, p_run text default null, p_fehler text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('hochgeladen', 'beauftragt', 'geschnitten', 'fehler', 'geloescht') then raise exception 'Unbekannter Status: %', p_status; end if;
  update team_social_uploads set status = p_status, run_id = coalesce(p_run, run_id), fehler = case when p_status = 'fehler' then left(coalesce(p_fehler, ''), 500) else null end,
    geaendert = now(), geaendert_von = p_von where upload_id = p_id;
  if not found then raise exception 'Upload nicht gefunden: %', p_id; end if;
  return p_id;
end $$;

-- 4) Storage-Buckets (nur wenn es das Storage-Schema gibt, also bei Supabase; lokal wird übersprungen)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('medien-roh', 'medien-roh', false, 2::bigint * 1024 * 1024 * 1024)   -- 2 GB
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('social-ideen', 'social-ideen', true, 20 * 1024 * 1024)              -- 20 MB
    on conflict (id) do nothing;
  else
    raise notice 'Kein Storage-Schema vorhanden, Buckets medien-roh und social-ideen nicht angelegt (nur bei Supabase nötig).';
  end if;
end $$;

-- 5) Rechte
alter table team_social         enable row level security;
alter table team_social_ideen   enable row level security;
alter table team_social_uploads enable row level security;
revoke all on table team_social, team_social_ideen, team_social_uploads from public, anon, authenticated;
grant all on table team_social, team_social_ideen, team_social_uploads to service_role;

revoke all on function social_faellig(text[])                                from public, anon, authenticated;
revoke all on function social_erledigt(text, text, text)                     from public, anon, authenticated;
revoke all on function social_fehler(text, text)                             from public, anon, authenticated;
revoke all on function team_idee_speichern(jsonb, text)                      from public, anon, authenticated;
revoke all on function team_upload_anlegen(jsonb, text)                      from public, anon, authenticated;
revoke all on function team_upload_status(text, text, text, text, text)      from public, anon, authenticated;
grant execute on function social_faellig(text[])                             to service_role;
grant execute on function social_erledigt(text, text, text)                  to service_role;
grant execute on function social_fehler(text, text)                          to service_role;
grant execute on function team_idee_speichern(jsonb, text)                   to service_role;
grant execute on function team_upload_anlegen(jsonb, text)                   to service_role;
grant execute on function team_upload_status(text, text, text, text, text)   to service_role;

-- Schnittstelle neu laden, damit n8n die neuen Funktionen sofort findet (bei Supabase)
notify pgrst, 'reload schema';

-- Kontrolle: drei Tabellen da, und team_laden() liefert "social" als Liste
select (select count(*) from team_social) as beitraege, (select count(*) from team_social_ideen) as ideen,
       (select count(*) from team_social_uploads) as uploads, jsonb_typeof(team_laden() -> 'social') as social;
