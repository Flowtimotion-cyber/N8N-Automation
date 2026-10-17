-- Momentum Team-Portal: Links bei Projekten (Webseite, Server, n8n, Twenty, Hermes, Drive …)
-- Einmal im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
alter table team_projekte add column if not exists links jsonb default '[]'::jsonb;
update team_projekte set links = '[]'::jsonb where links is null;
-- Kontrolle: muss für jedes Projekt eine Zeile mit links = [] zeigen
select name, links from team_projekte order by name;
