-- Instagram: Kommentar-Stichwort → automatische DM (@momentumkiakademie) – Phase 2 (29.10.2026)
-- Einmal im Supabase-SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
--
-- Ablauf: Unter einem Reel steht „Kommentiere PROMPT …“. Meta schickt jeden neuen Kommentar per Webhook
-- an den n8n-Workflow „SOCIAL: Kommentar-Stichwort → DM (Instagram, Momentum)“. Der Workflow liest die
-- aktiven Stichworte aus social_kommentar_trigger, trägt den Kommentar zuerst in social_kommentar_dm_log
-- ein (comment_id ist eindeutig → nie zwei DMs pro Kommentar), sendet dann die private Antwort und setzt
-- den Status auf „gesendet“ oder „fehler“.
--
-- Aus-Schalter: Gibt es keinen Trigger mit aktiv = true, passiert nichts.
-- Zugriff nur über n8n mit dem Service-Key (RLS an, keine öffentlichen Policies).

create table if not exists social_kommentar_trigger (
  id                   uuid primary key default gen_random_uuid(),
  stichwort            text not null,                  -- z. B. PROMPT; Vergleich: eigenes Wort, Groß/Klein egal
  media_id             text,                           -- Instagram-Media-ID; leer = gilt für alle Beiträge
  dm_text              text not null,                  -- Text der privaten Antwort (inkl. Link)
  oeffentliche_antwort text,                           -- optional, z. B. „Ist in deinen DMs 📩“; leer = keine
  aktiv                boolean not null default false,
  erstellt             timestamptz not null default now()
);

create index if not exists social_kommentar_trigger_aktiv on social_kommentar_trigger (aktiv);

create table if not exists social_kommentar_dm_log (
  id         bigint generated always as identity primary key,
  comment_id text not null,
  media_id   text,
  username   text,
  stichwort  text,
  status     text not null default 'in_arbeit',        -- in_arbeit | gesendet | fehler
  fehler     text,
  erstellt   timestamptz not null default now(),
  constraint social_kommentar_dm_log_comment_id_key unique (comment_id)
);

create index if not exists social_kommentar_dm_log_erstellt on social_kommentar_dm_log (erstellt desc);

alter table social_kommentar_trigger enable row level security;
alter table social_kommentar_dm_log  enable row level security;
-- Bewusst keine Policies: anon/authenticated sehen nichts, nur der Service-Key (n8n) hat Zugriff.

-- Beispiel-Trigger, AUS (aktiv = false). Vor dem Einschalten dm_text anpassen.
insert into social_kommentar_trigger (stichwort, media_id, dm_text, oeffentliche_antwort, aktiv)
select 'PROMPT', null,
       'DM_TEXT_HIER_EINTRAGEN – z. B. „Hier ist dein Prompt: <LINK>“',
       'Ist in deinen DMs 📩',
       false
where not exists (select 1 from social_kommentar_trigger where upper(stichwort) = 'PROMPT' and media_id is null);
