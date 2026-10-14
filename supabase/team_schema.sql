-- Momentum Team-Portal: Speicher in Supabase
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Zugriff nur über den Server (n8n, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.

create table if not exists team_mitglieder (
  mitglied_id   text primary key,
  name          text not null,
  email         text,
  telefon       text,
  funktion      text,
  rolle         text not null default 'team',      -- admin | dozent | vertrieb | team | agent
  typ           text not null default 'mensch',    -- mensch | agent
  status        text not null default 'eingeladen',
  token         text unique,
  whatsapp_ok   boolean default false,
  registriert   timestamptz,
  zuletzt_aktiv timestamptz
);

create table if not exists team_projekte (
  projekt_id     text primary key,
  name           text not null unique,
  beschreibung   text,
  status         text default 'aktiv',
  farbe          text,
  verantwortlich text,
  reihenfolge    int default 0,
  geaendert      timestamptz default now()
);

create table if not exists team_aufgaben (
  aufgabe_id     text primary key,
  titel          text not null,
  beschreibung   text,
  status         text default 'offen',
  prio           int default 2,
  label          text,
  projekt        text,
  verantwortlich text,
  erstellt_von   text,
  deadline       text,
  agent_geeignet boolean default false,   -- kann ein Agent (Claude, Codex, Hermes) das erledigen?
  erstellt       timestamptz default now(),
  geaendert      timestamptz default now(),
  erledigt_am    timestamptz
);
create index if not exists team_aufgaben_projekt on team_aufgaben (projekt);
create index if not exists team_aufgaben_verantw on team_aufgaben (verantwortlich);

-- Verlauf je Aufgabe: Kommentare, Statuswechsel, Berichte der Agenten
create table if not exists team_aufgaben_verlauf (
  id         bigint generated always as identity primary key,
  aufgabe_id text not null references team_aufgaben (aufgabe_id) on delete cascade,
  autor      text,
  art        text default 'kommentar',   -- kommentar | status | bericht
  text       text,
  erstellt   timestamptz default now()
);
create index if not exists team_verlauf_aufgabe on team_aufgaben_verlauf (aufgabe_id, erstellt);

create table if not exists team_notizen (
  notiz_id      text primary key,
  titel         text not null,
  inhalt        text,
  projekt       text,
  autor         text,
  geaendert_von text,
  erstellt      timestamptz default now(),
  geaendert     timestamptz default now()
);

create table if not exists team_zeiten (
  zeit_id         text primary key,
  mitglied_id     text,
  datum           text,
  von             text,
  bis             text,
  pause_min       int default 0,
  minuten         int,
  taetigkeit      text,
  projekt         text,
  aufgabe_id      text,
  kw              text,
  status          text default 'offen',
  eingereicht_am  timestamptz,
  freigegeben_von text,
  freigegeben_am  timestamptz,
  kommentar       text,
  geaendert       timestamptz default now()
);
create index if not exists team_zeiten_mitglied on team_zeiten (mitglied_id, kw);

create table if not exists team_social (
  post_id        text primary key,
  datum          text,
  kanal          text,
  thema          text,
  text           text,
  status         text,
  verantwortlich text,
  link           text,
  geaendert      timestamptz default now()
);

create table if not exists team_systeme (
  system_id      text primary key,
  name           text not null,
  bereich        text,
  beschreibung   text,
  status         text,
  werkzeug       text,
  link           text,
  verantwortlich text,
  geaendert      timestamptz default now()
);

-- Niemand außer dem Server darf direkt lesen oder schreiben
alter table team_mitglieder       enable row level security;
alter table team_projekte         enable row level security;
alter table team_aufgaben         enable row level security;
alter table team_aufgaben_verlauf enable row level security;
alter table team_notizen          enable row level security;
alter table team_zeiten           enable row level security;
alter table team_social           enable row level security;
alter table team_systeme          enable row level security;

-- Alles auf einmal laden (ein Aufruf statt sieben)
create or replace function team_laden() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mitglieder', coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from team_mitglieder m), '[]'),
    'projekte',   coalesce((select jsonb_agg(to_jsonb(p) order by p.reihenfolge, p.name) from team_projekte p), '[]'),
    'aufgaben',   coalesce((select jsonb_agg(to_jsonb(a) order by a.prio, a.deadline nulls last) from team_aufgaben a), '[]'),
    'verlauf',    coalesce((select jsonb_agg(to_jsonb(v) order by v.erstellt) from team_aufgaben_verlauf v
                            where v.erstellt > now() - interval '120 days'), '[]'),
    'notizen',    coalesce((select jsonb_agg(to_jsonb(n) order by n.titel) from team_notizen n), '[]'),
    'zeiten',     coalesce((select jsonb_agg(to_jsonb(z) order by z.datum desc) from team_zeiten z
                            where z.datum >= to_char(now() - interval '120 days', 'YYYY-MM-DD')), '[]'),
    'social',     coalesce((select jsonb_agg(to_jsonb(s) order by s.datum) from team_social s), '[]'),
    'systeme',    coalesce((select jsonb_agg(to_jsonb(y) order by y.name) from team_systeme y), '[]')
  );
$$;
revoke all on function team_laden() from public, anon, authenticated;
grant execute on function team_laden() to service_role;

-- Die drei Agenten als Teammitglieder (Token setzt Timo später im Portal unter „Verwalten“)
insert into team_mitglieder (mitglied_id, name, funktion, rolle, typ, status) values
  ('agent-claude', 'Claude', 'KI-Agent (Claude Code)', 'agent', 'agent', 'aktiv'),
  ('agent-codex',  'Codex',  'KI-Agent (Codex CLI)',   'agent', 'agent', 'aktiv'),
  ('agent-hermes', 'Hermes', 'KI-Agent (Hermes, Hetzner)', 'agent', 'agent', 'aktiv')
on conflict (mitglied_id) do nothing;

-- Kontrolle: sollte 8 Tabellen zeigen
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'team_%' order by 1;
