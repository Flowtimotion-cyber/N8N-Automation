-- =====================================================================================================
-- 001_basis.sql  ·  Team-Portal (Pilot-Kopie)  ·  PFLICHT  ·  Reihenfolge: 1 von 3 Pflichtdateien
-- =====================================================================================================
-- Was macht diese Datei?
--   Legt den Grundaufbau des Portals an: Teammitglieder, Projekte, Aufgaben mit Verlauf, Notizen mit
--   Versionen, Vorschläge, Papierkorb und Systeme. Dazu die Funktionen für Löschen (in den Papierkorb)
--   und Wiederherstellen sowie den Trigger, der alte Fassungen von Notizen sichert.
-- Pflicht oder Option?  PFLICHT. Ohne diese Datei läuft nichts.
-- Wovon hängt sie ab?   Von nichts. Sie ist die erste Datei.
-- Was kommt danach?     002_einstellungen.sql, dann 003_team_laden.sql.
-- Mehrfach ausführbar?  Ja. Alles ist mit "if not exists", "create or replace" oder "on conflict" geschützt.
--
-- Sicherheit: Alle Tabellen haben Row Level Security (RLS) an und bewusst KEINE Policies. Das heißt:
--   Browser und Anonyme sehen nichts. Lesen und Schreiben läuft nur über den Server (n8n) mit dem
--   service_role-Schlüssel, und der umgeht RLS. Kein Supabase-Schlüssel gehört ins Portal oder in den Browser.
-- =====================================================================================================

-- 0) Erweiterung für Zufallswerte (Zugangscodes). Bei Supabase ist pgcrypto schon aktiv (Schema "extensions"),
--    dann passiert hier nichts. Gibt es das Schema "extensions" (Supabase), landet die Erweiterung dort;
--    lokal ohne dieses Schema im Schema "public". Alle Funktionen, die gen_random_bytes oder hmac nutzen
--    (team_token_neu, kom_wa_signatur_ok), haben deshalb search_path = public, extensions.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pgcrypto with schema extensions;
  else
    create extension if not exists pgcrypto;
  end if;
end $$;

-- Zugangscode erzeugen: 24 Zufallsbytes, als 48 Hex-Zeichen. Das Portal erwartet 20 bis 64 Hex-Zeichen.
-- search_path enthält "extensions", damit gen_random_bytes bei Supabase und lokal gefunden wird.
create or replace function team_token_neu() returns text
language sql volatile security definer set search_path = public, extensions as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

-- 1) Teammitglieder --------------------------------------------------------------------------------
create table if not exists team_mitglieder (
  mitglied_id   text primary key,
  name          text not null,
  email         text,
  telefon       text,
  funktion      text,                              -- z. B. "Vertrieb", "Buchhaltung", frei
  rolle         text not null default 'team',      -- admin | team | dozent | vertrieb | agent (siehe team_einstellungen.rollen)
  typ           text not null default 'mensch',    -- mensch | agent
  status        text not null default 'eingeladen' -- eingeladen | aktiv | gesperrt (so kennen es Portal und Server)
                check (status in ('eingeladen', 'aktiv', 'gesperrt')),
  token         text unique,                       -- persönlicher Zugangscode (Login-Link ?z=<token>)
  whatsapp_ok   boolean default false,             -- Einwilligung für Nachrichten per WhatsApp (nur mit Option 130)
  registriert   timestamptz,
  zuletzt_aktiv timestamptz
);
-- Nachrüsten des Status-Checks, falls die Tabelle aus einer älteren Fassung ohne Check stammt
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.team_mitglieder'::regclass and conname = 'team_mitglieder_status_check') then
    alter table team_mitglieder add constraint team_mitglieder_status_check check (status in ('eingeladen', 'aktiv', 'gesperrt'));
  end if;
end $$;

-- 2) Projekte ----------------------------------------------------------------------------------------
create table if not exists team_projekte (
  projekt_id     text primary key,
  name           text not null unique,
  beschreibung   text,
  status         text default 'aktiv',             -- aktiv | geplant | pausiert | abgeschlossen
  farbe          text,                             -- Hex-Farbe für die Oberfläche, z. B. #4f6df5
  verantwortlich text,                             -- mitglied_id
  reihenfolge    int default 0,
  links          jsonb default '[]'::jsonb,        -- [{ "titel": "...", "url": "https://..." }]
  geaendert      timestamptz default now()
);
-- 3) Aufgaben und Verlauf ----------------------------------------------------------------------------
create table if not exists team_aufgaben (
  aufgabe_id     text primary key,
  titel          text not null,
  beschreibung   text,
  status         text default 'Offen',             -- Offen | Geplant | In Arbeit | Wartet | Wird getestet | Erledigt
  prio           int default 2,                    -- 1 = hoch, 2 = normal, 3 = niedrig
  label          text,
  projekt        text,                             -- Projektname (team_projekte.name)
  verantwortlich text,                             -- mitglied_id
  erstellt_von   text,                             -- mitglied_id
  deadline       text,                             -- JJJJ-MM-TT oder leer
  agent_geeignet boolean default false,            -- darf ein KI-Agent das erledigen? (nur mit Option 140)
  erstellt       timestamptz default now(),
  geaendert      timestamptz default now(),
  erledigt_am    timestamptz
);
create index if not exists team_aufgaben_projekt on team_aufgaben (projekt);
create index if not exists team_aufgaben_verantw on team_aufgaben (verantwortlich);

-- Verlauf je Aufgabe: Kommentare, Statuswechsel, Berichte
create table if not exists team_aufgaben_verlauf (
  id         bigint generated always as identity primary key,
  aufgabe_id text not null references team_aufgaben (aufgabe_id) on delete cascade,
  autor      text,                                 -- mitglied_id
  art        text default 'kommentar',             -- kommentar | status | bericht
  text       text,
  erstellt   timestamptz default now()
);
create index if not exists team_verlauf_aufgabe on team_aufgaben_verlauf (aufgabe_id, erstellt);

-- 4) Notizen und Versionen ---------------------------------------------------------------------------
create table if not exists team_notizen (
  notiz_id      text primary key,
  titel         text not null,
  inhalt        text,                              -- Markdown; [[Titel]] verlinkt auf eine andere Notiz
  projekt       text,
  autor         text,
  geaendert_von text,
  erstellt      timestamptz default now(),
  geaendert     timestamptz default now()
);

create table if not exists team_notiz_versionen (
  version_id    text primary key,
  notiz_id      text not null,
  titel         text,
  inhalt        text,
  projekt       text,
  geaendert_von text,                              -- wer diese Fassung geschrieben hatte
  fassung_vom   timestamptz,                       -- wann diese Fassung gespeichert worden war
  gesichert_am  timestamptz default now()          -- wann sie durch eine neuere ersetzt wurde
);
create index if not exists team_notiz_versionen_notiz on team_notiz_versionen (notiz_id, gesichert_am desc);

-- Vor jeder Änderung von Titel oder Inhalt wird die bisherige Fassung gesichert (je Notiz die letzten 30,
-- höchstens 180 Tage). So geht auch bei gleichzeitigem Bearbeiten keine Fassung verloren.
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
             or version_id not in (select version_id from team_notiz_versionen
                                   where notiz_id = old.notiz_id order by gesichert_am desc limit 30));
  end if;
  return new;
end $$;

drop trigger if exists team_notiz_version on team_notizen;
create trigger team_notiz_version before update on team_notizen
  for each row execute function team_notiz_version();

-- 5) Vorschläge (Änderungswünsche am Portal) ---------------------------------------------------------
create table if not exists team_vorschlaege (
  vorschlag_id text primary key,
  titel        text not null,
  text         text default '',
  bereich      text default 'Sonstiges',           -- welcher Teil des Portals
  status       text not null default 'neu',        -- neu | geplant | in Arbeit | umgesetzt | abgelehnt
  autor        text not null,                      -- mitglied_id
  stimmen      text[] default '{}',                -- wer "Finde ich gut" geklickt hat (mitglied_id)
  antwort      text default '',                    -- Rückmeldung der Admins
  antwort_von  text,
  aufgabe_id   text,                               -- falls daraus eine Aufgabe wurde
  erstellt     timestamptz default now(),
  geaendert    timestamptz default now()
);

-- 6) Systeme (Werkzeuge und Dienste der Firma, Register "Systeme") -----------------------------------
create table if not exists team_systeme (
  system_id      text primary key,
  name           text not null,
  bereich        text,
  beschreibung   text,
  status         text,                             -- läuft | im Bau | geplant | pausiert
  werkzeug       text,
  link           text,
  verantwortlich text,
  geaendert      timestamptz default now()
);

-- 7) Papierkorb ---------------------------------------------------------------------------------------
-- Löschen im Portal ruft team_loeschen() auf. Die Funktion kopiert die Zeile (bei Aufgaben samt Verlauf)
-- in team_papierkorb und löscht sie erst danach, beides in einem Schritt. 30 Tage lang kann man sie mit
-- team_wiederherstellen() zurückholen, danach räumt team_loeschen() sie beim nächsten Aufruf weg.
create table if not exists team_papierkorb (
  eintrag_id    text primary key,
  art           text not null,                     -- aufgabe | notiz | vorschlag | system | social | zeit | teilnehmer | idee
  objekt_id     text not null,
  titel         text,
  daten         jsonb not null,                    -- die ganze Zeile; bei Aufgaben zusätzlich _verlauf
  geloescht_von text,
  geloescht_am  timestamptz default now()
);
create index if not exists team_papierkorb_zeit on team_papierkorb (geloescht_am desc);

-- Welche Tabelle zu welcher Art gehört. Die Arten social, zeit, teilnehmer und idee gehören zu den
-- Optionen 120, 100, 110 und 120; solange die Option nicht eingespielt ist, lehnt team_loeschen() sie ab.
create or replace function team_papierkorb_ziel(p_art text, out tab text, out pk text, out titelspalte text)
language sql immutable as $$
  select t.tab, t.pk, t.titelspalte from (values
    ('aufgabe',    'team_aufgaben',     'aufgabe_id',   'titel'),
    ('notiz',      'team_notizen',      'notiz_id',     'titel'),
    ('vorschlag',  'team_vorschlaege',  'vorschlag_id', 'titel'),
    ('system',     'team_systeme',      'system_id',    'name'),
    ('social',     'team_social',       'post_id',      'thema'),
    ('zeit',       'team_zeiten',       'zeit_id',      'taetigkeit'),
    ('teilnehmer', 'team_teilnehmer',   'tn_id',        'name'),
    ('idee',       'team_social_ideen', 'idee_id',      'titel')
  ) as t(art, tab, pk, titelspalte) where t.art = p_art;
$$;

create or replace function team_loeschen(p_art text, p_id text, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare z record; zeile jsonb; neu_id text;
begin
  select * into z from team_papierkorb_ziel(p_art);
  if z.tab is null then raise exception 'Unbekannte Art: %', p_art; end if;
  if to_regclass('public.' || z.tab) is null then
    raise exception 'Der Bereich "%" ist in diesem Portal nicht eingespielt (Tabelle % fehlt).', p_art, z.tab;
  end if;
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
  if z.tab is null or to_regclass('public.' || z.tab) is null then
    raise exception 'Der Bereich "%" ist in diesem Portal nicht eingespielt.', e.art;
  end if;
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

-- 8) Rechte: RLS an (ohne Policies), Tabellenrechte nur für den Server (service_role) ------------------
alter table team_mitglieder       enable row level security;
alter table team_projekte         enable row level security;
alter table team_aufgaben         enable row level security;
alter table team_aufgaben_verlauf enable row level security;
alter table team_notizen          enable row level security;
alter table team_notiz_versionen  enable row level security;
alter table team_vorschlaege      enable row level security;
alter table team_systeme          enable row level security;
alter table team_papierkorb       enable row level security;

revoke all on table team_mitglieder, team_projekte, team_aufgaben, team_aufgaben_verlauf, team_notizen,
  team_notiz_versionen, team_vorschlaege, team_systeme, team_papierkorb from public, anon, authenticated;
grant all on table team_mitglieder, team_projekte, team_aufgaben, team_aufgaben_verlauf, team_notizen,
  team_notiz_versionen, team_vorschlaege, team_systeme, team_papierkorb to service_role;
grant usage, select on sequence team_aufgaben_verlauf_id_seq to service_role;

revoke all on function team_token_neu()                    from public, anon, authenticated;
revoke all on function team_notiz_version()                from public, anon, authenticated;
revoke all on function team_papierkorb_ziel(text)          from public, anon, authenticated;
revoke all on function team_loeschen(text, text, text)     from public, anon, authenticated;
revoke all on function team_wiederherstellen(text)         from public, anon, authenticated;
grant execute on function team_token_neu()                 to service_role;
grant execute on function team_papierkorb_ziel(text)       to service_role;
grant execute on function team_loeschen(text, text, text)  to service_role;
grant execute on function team_wiederherstellen(text)      to service_role;

-- Kontrolle: muss 9 Tabellen zeigen (team_aufgaben, team_aufgaben_verlauf, team_mitglieder, team_notiz_versionen,
-- team_notizen, team_papierkorb, team_projekte, team_systeme, team_vorschlaege)
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'team\_%' order by 1;
