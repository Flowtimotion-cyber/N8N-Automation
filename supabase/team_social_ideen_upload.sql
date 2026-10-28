-- Team-Portal: Register „Social Media“ bekommt zwei neue Bereiche (28.10.2026, KI-erstellt: Claude Code).
-- Einmal im Supabase-SQL-Editor ausführen, NACH team_teilnehmer.sql. Kann gefahrlos mehrfach laufen.
--
-- 1) Ideen & starke Mitbewerber-Posts: Link-Liste als Steinbruch für Themen (nie zum Kopieren).
-- 2) Eigene Videos hochladen: Rohvideos landen im privaten Storage-Bucket „medien-roh“, die Tabelle
--    team_social_uploads führt Herkunft, Einwilligung, Status und den Auftrag an den Medien-Cutter.
-- Zugriff wie überall: nur der Server (n8n-Workflow „TEAM: Social-Upload“ mit service_role). Der Browser
-- lädt Videos über eine signierte Upload-URL hoch, die n8n ausstellt. Kein Supabase-Schlüssel im Portal.

-- 1) Ideen und Mitbewerber-Posts ------------------------------------------------------------------
create table if not exists team_social_ideen (
  idee_id       text primary key,
  link          text not null,
  titel         text not null default '',          -- worum geht es (kurz)
  quelle        text not null default '',          -- Autor / Firma / Profil
  kanal         text not null default 'LinkedIn',  -- LinkedIn, Instagram, YouTube, TikTok, Sonstiges
  warum_stark   text not null default '',          -- was daran gut ist (Hook, Aufbau, Bild, Zahl …)
  thema_fuer_uns text not null default '',         -- welches Thema wir daraus machen könnten
  status        text not null default 'neu',       -- neu, geprüft, umgesetzt, verworfen
  post_id       text,                              -- wenn daraus ein eigener Beitrag wurde (team_social.post_id)
  erstellt      timestamptz not null default now(),
  erstellt_von  text not null default '',
  geaendert     timestamptz not null default now(),
  geaendert_von text not null default ''
);
create index if not exists team_social_ideen_status on team_social_ideen (status, geaendert desc);
alter table team_social_ideen enable row level security;

-- Anlegen oder ändern. p = Felder aus dem Portal (schon geprüft von social/lib/social.js), p_von = mitglied_id.
create or replace function team_idee_speichern(p jsonb, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare id text := p ->> 'idee_id';
begin
  if id is null or id = '' then raise exception 'idee_id fehlt'; end if;
  insert into team_social_ideen (idee_id, link, titel, quelle, kanal, warum_stark, thema_fuer_uns, status, post_id, erstellt_von, geaendert_von)
  values (id, p ->> 'link', coalesce(p ->> 'titel', ''), coalesce(p ->> 'quelle', ''), coalesce(p ->> 'kanal', 'LinkedIn'),
          coalesce(p ->> 'warum_stark', ''), coalesce(p ->> 'thema_fuer_uns', ''), coalesce(p ->> 'status', 'neu'), nullif(p ->> 'post_id', ''), p_von, p_von)
  on conflict (idee_id) do update set
    link = excluded.link, titel = excluded.titel, quelle = excluded.quelle, kanal = excluded.kanal, warum_stark = excluded.warum_stark,
    thema_fuer_uns = excluded.thema_fuer_uns, status = excluded.status, post_id = excluded.post_id, geaendert = now(), geaendert_von = p_von;
  return id;
end $$;

-- 2) Eigene Videos --------------------------------------------------------------------------------
create table if not exists team_social_uploads (
  upload_id      text primary key,
  bucket         text not null default 'medien-roh',
  pfad           text not null,                    -- Pfad im Bucket: JJJJ/MM/<upload_id>_<dateiname>
  dateiname      text not null,
  groesse        bigint not null default 0,        -- Bytes, wie vom Browser gemeldet
  mime           text not null default '',
  thema          text not null default '',
  kanal          text not null default 'LinkedIn',
  kontext        text not null default '',         -- was im Video passiert, worauf der Schnitt achten soll
  stil           text not null default 'momentum', -- Markenstil für Grafiken und Bauchbinden
  einwilligung   boolean not null default false,   -- gezeigte Personen sind einverstanden (Häkchen beim Upload)
  einwilligung_am timestamptz,
  status         text not null default 'hochladen', -- hochladen, hochgeladen, beauftragt, geschnitten, fehler, geloescht
  run_id         text,                             -- Auftrag im KI Office (office_runs.run_id)
  post_id        text,                             -- fertiger Beitrag im Social-Plan
  fehler         text,
  aufbewahren_bis date not null default (current_date + 90), -- Löschkonzept: Rohmaterial 90 Tage, danach weg
  erstellt       timestamptz not null default now(),
  erstellt_von   text not null default '',
  geaendert      timestamptz not null default now(),
  geaendert_von  text not null default ''
);
create index if not exists team_social_uploads_status on team_social_uploads (status, erstellt desc);
alter table team_social_uploads enable row level security;

create or replace function team_upload_anlegen(p jsonb, p_von text) returns text
language plpgsql security definer set search_path = public as $$
declare id text := p ->> 'upload_id';
begin
  if id is null or id = '' then raise exception 'upload_id fehlt'; end if;
  if coalesce((p ->> 'einwilligung')::boolean, false) is not true then raise exception 'Ohne Einwilligung kein Upload'; end if;
  insert into team_social_uploads (upload_id, pfad, dateiname, groesse, mime, thema, kanal, kontext, stil, einwilligung, einwilligung_am, status, erstellt_von, geaendert_von)
  values (id, p ->> 'pfad', p ->> 'dateiname', coalesce((p ->> 'groesse')::bigint, 0), coalesce(p ->> 'mime', ''), coalesce(p ->> 'thema', ''),
          coalesce(p ->> 'kanal', 'LinkedIn'), coalesce(p ->> 'kontext', ''), coalesce(p ->> 'stil', 'momentum'), true, now(), 'hochladen', p_von, p_von)
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

-- 3) Storage-Bucket für Rohvideos: privat, 2 GB je Datei. Keine Policies: nur service_role und signierte URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('medien-roh', 'medien-roh', false, 2147483648)
on conflict (id) do nothing;

-- 4) Papierkorb kennt jetzt auch Ideen (sonst wie in team_teilnehmer.sql)
create or replace function team_papierkorb_ziel(p_art text, out tab text, out pk text, out titelspalte text)
language sql immutable as $$
  select t.tab, t.pk, t.titelspalte from (values
    ('aufgabe',    'team_aufgaben',       'aufgabe_id',   'titel'),
    ('notiz',      'team_notizen',        'notiz_id',     'titel'),
    ('vorschlag',  'team_vorschlaege',    'vorschlag_id', 'titel'),
    ('social',     'team_social',         'post_id',      'thema'),
    ('system',     'team_systeme',        'system_id',    'name'),
    ('zeit',       'team_zeiten',         'zeit_id',      'taetigkeit'),
    ('teilnehmer', 'team_teilnehmer',     'tn_id',        'name'),
    ('idee',       'team_social_ideen',   'idee_id',      'titel')
  ) as t(art, tab, pk, titelspalte) where t.art = p_art;
$$;

-- 5) Agent „Medien-Cutter“ in der Registry (Steckbrief v2, Notiz im Projekt „Momentum Office“).
--    Bewusst mit freigabe_noetig = true: jeder Schnittauftrag wartet auf Timos Freigabe, egal wer ihn anlegt.
--    Bestehende Einträge werden nicht überschrieben.
insert into office_agenten (agent_id, name, rolle, raum, beschreibung, faehigkeiten, erlaubte_tools, modell, modell_grund, ausfuehrer, mitglied_id, projekte, timeout_sek, max_versuche, auto_wiederholen) values
  ('medien-cutter', 'Medien-Cutter', 'Schneidet hochgeladene Rohvideos zu Social-Clips und Kursvideos im Momentum-Stil. Veröffentlicht nichts, alles geht zur Abnahme.', 'Marketing',
   'Nimmt Uploads aus dem Portal (Register Social Media, Bucket medien-roh) entgegen: prüft den Einwilligungs-Vermerk, erstellt Transkript und Wort-Zeiten, schlägt 3–5 Clip-Stellen mit Zeitmarken vor (Notiz), schneidet nach Freigabe mit Untertiteln, Bauchbinden und Logo nach Momentum-Marke in 9:16 und 16:9 und legt Entwürfe zur Abnahme ab. Verändert keine Personen per KI, veröffentlicht nie. Werkzeuge medien_lesen, video_schnitt und medien_entwurf_ablegen sind noch zu bauen (Steckbrief v2, Notiz im Projekt Momentum Office).',
   array['Transkript','Clip-Stellen vorschlagen','Rohschnitt','Untertitel','Grafiken und Bauchbinden','Ton normalisieren','9:16 und 16:9']::text[],
   array['medien_lesen','video_schnitt','medien_entwurf_ablegen','notiz_speichern','rueckfrage']::text[],
   'claude-sonnet-5-5', 'Clip-Auswahl und Schnittplan brauchen Urteilsvermögen; Transkription, Rendern und Ton laufen ohne KI.', 'claude-code', 'agent-claude', array['Social Media']::text[], 3600, 1, false)
on conflict (agent_id) do nothing;
update office_agenten set freigabe_noetig = true where agent_id = 'medien-cutter' and freigabe_noetig is distinct from true;

-- 6) Rechte: nur der Server
revoke all on function team_idee_speichern(jsonb, text)                    from public, anon, authenticated;
revoke all on function team_upload_anlegen(jsonb, text)                    from public, anon, authenticated;
revoke all on function team_upload_status(text, text, text, text, text)    from public, anon, authenticated;
revoke all on function team_papierkorb_ziel(text)                          from public, anon, authenticated;
grant execute on function team_idee_speichern(jsonb, text)                 to service_role;
grant execute on function team_upload_anlegen(jsonb, text)                 to service_role;
grant execute on function team_upload_status(text, text, text, text, text) to service_role;
grant execute on function team_papierkorb_ziel(text)                       to service_role;
notify pgrst, 'reload schema';

-- Kontrolle: beide Tabellen da, Bucket da, Agent da?
select (select count(*) from team_social_ideen) as ideen, (select count(*) from team_social_uploads) as uploads,
       (select count(*) from storage.buckets where id = 'medien-roh') as bucket, (select count(*) from office_agenten where agent_id = 'medien-cutter') as agent;
