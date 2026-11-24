-- Momentum Team-Portal: alle Diktate und Mitschnitte speichern (Register „Diktat“ → „Letzte Diktate“)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden. Ändert keine bestehende Tabelle.
-- Zugriff nur über den Server (n8n „TEAM: Diktat“, Webhook team-diktat, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.
--
-- Regeln (Timos Wunsch vom 24.11.2026):
--   * Jede fertige Aufnahme (Diktat, Gesprächsmitschnitt, Mitschnitt mit PC-Ton) wird automatisch gespeichert: bereinigter Text,
--     Rohtranskript, Zusammenfassung. Audio wird nie gespeichert.
--   * Jede Person sieht nur ihre eigenen Aufnahmen (auch Admins sehen fremde nicht).
--   * Die KI darf eine Aufnahme nur lesen, wenn der Haken „KI darf lesen“ gesetzt ist (ki_lesen). Dafür gibt es die Sicht team_diktate_ki.
--   * Löschen im Portal leert den Inhalt sofort (Text, Rohtranskript, Zusammenfassung) und markiert die Zeile als gelöscht.

create table if not exists team_diktate (
	diktat_id         text primary key default ('dk_' || replace(gen_random_uuid()::text, '-', '')),
	mitglied_id       text not null,                       -- wer aufgenommen hat (team_mitglieder.mitglied_id)
	erstellt          timestamptz not null default now(),
	geaendert         timestamptz not null default now(),
	titel             text not null default '',
	art               text not null default 'anruf',       -- anruf, notiz, termin, mail
	modus             text not null default 'diktat',      -- diktat oder gespraech (Mitschnitt)
	pc_ton            boolean not null default false,      -- mit Ton vom Computer (Zoom, Workshop, YouTube)
	dauer_sek         integer not null default 0,
	chance_id         text,                                -- Verkaufschance in Twenty, falls zugeordnet
	ziel              text,                                -- Name des Leads/Kontakts oder „nur kopiert“
	text              text not null default '',            -- bereinigter Wortlaut (ganz)
	roh               text not null default '',            -- Rohtranskript (ganz)
	zusammenfassung   text not null default '',
	punkte            jsonb not null default '[]'::jsonb,
	naechste_schritte jsonb not null default '[]'::jsonb,
	termine           jsonb not null default '[]'::jsonb,
	ki_lesen          boolean not null default false,      -- true: die KI darf diese Aufnahme lesen
	geloescht_am      timestamptz,                         -- gesetzt = gelöscht (Inhalt ist dann leer)
	vorschau          text generated always as (left(text, 600)) stored
);
create index if not exists team_diktate_wer on team_diktate (mitglied_id, erstellt desc) where geloescht_am is null;
create index if not exists team_diktate_ki_idx on team_diktate (erstellt desc) where ki_lesen and geloescht_am is null;

alter table team_diktate enable row level security;
revoke all on table team_diktate from anon, authenticated;

-- Sicht für die KI: nur Aufnahmen mit Haken „KI darf lesen“, ohne gelöschte. Lesen nur mit service_role (n8n, Server-Agenten).
create or replace view team_diktate_ki with (security_invoker = true) as
	select d.diktat_id, d.mitglied_id, m.name as von, d.erstellt, d.titel, d.art, d.modus, d.pc_ton, d.dauer_sek, d.chance_id, d.ziel,
	       d.zusammenfassung, d.punkte, d.naechste_schritte, d.termine, d.text, d.roh
	from team_diktate d
	left join team_mitglieder m on m.mitglied_id = d.mitglied_id
	where d.ki_lesen and d.geloescht_am is null;
revoke all on table team_diktate_ki from public, anon, authenticated;

comment on table team_diktate is 'Diktate und Mitschnitte aus dem Team-Portal (Text, kein Audio). Nur eigene sichtbar; KI nur über team_diktate_ki (Haken ki_lesen).';
comment on view team_diktate_ki is 'Für die KI freigegebene Diktate (Haken „KI darf lesen“ im Portal).';
