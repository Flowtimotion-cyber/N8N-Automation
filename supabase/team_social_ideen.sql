-- Team-Portal: Ideen-Briefkasten für Social Media (27.10.2026)
-- Einmal im Supabase-SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
--
-- Das Team teilt oben im Social-Media-Reiter Ideen, Links zu guten Posts, Bilder oder eigene Videos.
-- Die tägliche Content-Aufgabe (Claude) liest neue Einträge, bezieht sie in die Planung ein und
-- schneidet aus hochgeladenen Videos Reels im Momentum-Design. Zugriff nur über n8n (service_role).

create table if not exists team_social_ideen (
  idee_id     text primary key,
  autor       text,                         -- mitglied_id
  art         text default 'idee',          -- idee | link | bild | video
  text        text,
  link        text,
  datei_url   text,                         -- öffentliche URL im Bucket social-ideen
  datei_typ   text,                         -- MIME-Typ
  status      text default 'neu',           -- neu | eingeplant | umgesetzt | verworfen
  notiz       text,                         -- Rückmeldung von Claude oder Timo
  post_id     text,                         -- daraus entstandener Beitrag in team_social
  erstellt    timestamptz default now(),
  geaendert   timestamptz default now()
);
create index if not exists team_social_ideen_status on team_social_ideen (status, erstellt desc);
alter table team_social_ideen enable row level security;

-- Öffentlicher Bucket für Bilder und Videos aus dem Team (Upload nur über signierte Links aus n8n)
insert into storage.buckets (id, name, public)
values ('social-ideen', 'social-ideen', true)
on conflict (id) do nothing;

-- Kontrolle
select count(*) as ideen from team_social_ideen;
select id, public from storage.buckets where id in ('social-ideen', 'social-medien');
