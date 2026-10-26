-- Kommunikation: zentrale Gesprächsablage für WhatsApp und Website-Chat (Teamportal-Inbox)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Zugriff nur über den Server (n8n, service_role). Browser, Widget und Agenten bekommen keinen Supabase-Schlüssel.
-- RLS ist an, es gibt bewusst keine Policies: anon/authenticated sehen nichts, service_role umgeht RLS.
-- Entwurf vom 26.10.2026, Auftrag „WhatsApp, n8n, Hermes, Website-Chat und Teamportal“ Abschnitt 4.

-- Eine Konversation je Kanal und Kontakt (WhatsApp: wa_id, Website: Session-ID)
create table if not exists kom_konversationen (
  konversation_id   text primary key,                   -- z. B. 'wa:491771234567' oder 'web:<session>'
  kanal             text not null,                      -- whatsapp | website
  kontakt_extern    text not null,                      -- wa_id bzw. Session-ID
  kontakt_name      text,                               -- Profilname aus WhatsApp, falls übermittelt
  telefon_e164      text,                               -- +49…, nur bei WhatsApp
  marke             text not null default 'offen',      -- momentum | hermetik | offen
  twenty_person_id  text,
  twenty_chance_id  text,
  modus             text not null default 'ki',         -- ki | mensch (KI pausiert)
  status            text not null default 'offen',      -- offen | wartet_auf_team | erledigt
  zugewiesen        text references team_mitglieder (mitglied_id) on delete set null,
  einwilligung      text not null default 'unbekannt',  -- unbekannt | erteilt | widerrufen (Marketing/Vorlagen)
  einwilligung_am   timestamptz,
  quelle            jsonb,                              -- Referral/Kampagne nur aus echten Meta-Daten (Click-to-WhatsApp)
  zusammenfassung   text,
  letzte_kunde_am   timestamptz,                        -- Beginn des 24-Stunden-Fensters
  begruesst_am      timestamptz,                        -- Begrüßung höchstens einmal
  fehler            text,
  erstellt          timestamptz not null default now(),
  geaendert         timestamptz not null default now(),
  unique (kanal, kontakt_extern)
);
create index if not exists kom_konv_geaendert on kom_konversationen (geaendert desc);
create index if not exists kom_konv_status on kom_konversationen (status, modus);

-- Nachrichten. nachricht_id ist der Idempotenzschlüssel (WhatsApp: wamid).
create table if not exists kom_nachrichten (
  id               bigint generated always as identity primary key,
  nachricht_id     text not null unique,
  konversation_id  text not null references kom_konversationen (konversation_id) on delete cascade,
  richtung         text not null,                       -- ein | aus
  absender         text not null,                       -- kunde | ki | system | mitglied:<id>
  typ              text not null default 'text',        -- text | image | audio | document | video | interactive | button | sticker | location | contacts | reaction | unsupported
  text             text,
  medien           jsonb,                               -- Meta-Medien-ID, MIME-Typ, Dateiname; keine Dateien in der DB
  status           text not null default 'empfangen',   -- empfangen | gesendet | zugestellt | gelesen | fehlgeschlagen
  fehler           jsonb,
  zeit             timestamptz not null,                -- Zeitstempel laut Kanal
  erstellt         timestamptz not null default now()
);
create index if not exists kom_nachr_konv on kom_nachrichten (konversation_id, zeit);

-- Statusmeldungen (gesendet, zugestellt, gelesen, fehlgeschlagen), idempotent je wamid und Status
create table if not exists kom_status_ereignisse (
  schluessel   text primary key,                        -- wamid || ':' || status
  nachricht_id text not null,
  status       text not null,
  fehler       jsonb,
  zeit         timestamptz not null,
  erstellt     timestamptz not null default now()
);

-- Protokoll: wer hat was gemacht (Zuweisung, Moduswechsel, Antwort aus dem Portal)
create table if not exists kom_audit (
  id              bigint generated always as identity primary key,
  konversation_id text,
  wer             text not null,
  aktion          text not null,
  details         jsonb,
  erstellt        timestamptz not null default now()
);

-- Geheimnisse für die Kanäle. Werden nur hier gelesen (Funktionen unten), nie an n8n oder den Browser ausgegeben.
-- Befüllen im SQL Editor, nicht im Chat und nicht im Workflow:
--   insert into kom_einstellungen (schluessel, wert) values ('wa_app_secret', '<App-Secret aus Meta>')
--     on conflict (schluessel) do update set wert = excluded.wert, geaendert = now();
--   insert into kom_einstellungen (schluessel, wert) values ('wa_verify_token', '<frei gewählte lange Zufallszeichenkette>')
--     on conflict (schluessel) do update set wert = excluded.wert, geaendert = now();
create table if not exists kom_einstellungen (
  schluessel text primary key,
  wert       text not null,
  geaendert  timestamptz not null default now()
);

alter table kom_einstellungen     enable row level security;
alter table kom_konversationen    enable row level security;
alter table kom_nachrichten       enable row level security;
alter table kom_status_ereignisse enable row level security;
alter table kom_audit             enable row level security;

-- Eingang einer Kundennachricht in einem Schritt: Konversation anlegen/auffrischen, Nachricht idempotent speichern.
-- Rückgabe: neu (false = Duplikat, nichts weiter tun), erstkontakt (Begrüßung fällig), modus, konversation_id.
create or replace function kom_eingang(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_konv   text := p->>'konversation_id';
  v_neu    boolean;
  v_row    kom_konversationen;
begin
  insert into kom_konversationen (konversation_id, kanal, kontakt_extern, kontakt_name, telefon_e164, quelle, letzte_kunde_am)
  values (v_konv, p->>'kanal', p->>'kontakt_extern', p->>'kontakt_name', p->>'telefon_e164',
          case when p ? 'quelle' and p->'quelle' <> 'null'::jsonb then p->'quelle' end, (p->>'zeit')::timestamptz)
  on conflict (konversation_id) do update
    set kontakt_name    = coalesce(excluded.kontakt_name, kom_konversationen.kontakt_name),
        quelle          = coalesce(kom_konversationen.quelle, excluded.quelle),
        letzte_kunde_am = greatest(kom_konversationen.letzte_kunde_am, excluded.letzte_kunde_am),
        status          = case when kom_konversationen.status = 'erledigt' then 'offen' else kom_konversationen.status end,
        geaendert       = now();

  insert into kom_nachrichten (nachricht_id, konversation_id, richtung, absender, typ, text, medien, zeit)
  values (p->>'nachricht_id', v_konv, 'ein', 'kunde', coalesce(p->>'typ', 'text'), p->>'text',
          case when p ? 'medien' and p->'medien' <> 'null'::jsonb then p->'medien' end, (p->>'zeit')::timestamptz)
  on conflict (nachricht_id) do nothing;
  get diagnostics v_neu = row_count;

  select * into v_row from kom_konversationen where konversation_id = v_konv;
  return jsonb_build_object(
    'neu', v_neu,
    'konversation_id', v_konv,
    'erstkontakt', v_row.begruesst_am is null,
    'modus', v_row.modus,
    'marke', v_row.marke,
    'twenty_person_id', v_row.twenty_person_id
  );
end $$;

-- Statusmeldung idempotent übernehmen; Nachrichtenstatus nur vorwärts (gesendet < zugestellt < gelesen), Fehler immer.
create or replace function kom_status(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_neu boolean;
  rang  jsonb := '{"gesendet":1,"zugestellt":2,"gelesen":3}';
begin
  insert into kom_status_ereignisse (schluessel, nachricht_id, status, fehler, zeit)
  values ((p->>'nachricht_id') || ':' || (p->>'status'), p->>'nachricht_id', p->>'status',
          case when p ? 'fehler' and p->'fehler' <> 'null'::jsonb then p->'fehler' end, (p->>'zeit')::timestamptz)
  on conflict (schluessel) do nothing;
  get diagnostics v_neu = row_count;

  if v_neu then
    update kom_nachrichten n
       set status = p->>'status',
           fehler = coalesce(case when p ? 'fehler' and p->'fehler' <> 'null'::jsonb then p->'fehler' end, n.fehler)
     where n.nachricht_id = p->>'nachricht_id'
       and (p->>'status' = 'fehlgeschlagen'
            or coalesce((rang->>(p->>'status'))::int, 0) > coalesce((rang->>n.status)::int, 0));
  end if;
  return jsonb_build_object('neu', v_neu);
end $$;

-- Webhook-Prüfungen von Meta. Das Secret verlässt die Datenbank nicht; zurück kommt nur wahr/falsch.
-- pgcrypto liegt bei Supabase im Schema „extensions“ (ist standardmäßig aktiv).
create extension if not exists pgcrypto with schema extensions;

-- Signatur: Header X-Hub-Signature-256 = 'sha256=' || hex(HMAC-SHA256(App-Secret, roher Body))
create or replace function kom_wa_signatur_ok(roh text, signatur text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_soll   text;
begin
  select wert into v_secret from kom_einstellungen where schluessel = 'wa_app_secret';
  if v_secret is null or coalesce(roh, '') = '' or lower(coalesce(signatur, '')) not like 'sha256=%' then
    return jsonb_build_object('ok', false);         -- ohne Secret wird nichts angenommen (fail closed)
  end if;
  v_soll := 'sha256=' || encode(hmac(convert_to(roh, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex');
  return jsonb_build_object('ok', length(v_soll) = length(signatur) and v_soll = lower(signatur));
end $$;

-- Verify-Token beim Einrichten des Webhooks (GET hub.verify_token)
create or replace function kom_wa_verify_ok(token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', coalesce((select wert = token from kom_einstellungen where schluessel = 'wa_verify_token' and coalesce(token, '') <> ''), false));
$$;

revoke all on function kom_wa_signatur_ok(text, text) from public, anon, authenticated;
revoke all on function kom_wa_verify_ok(text)         from public, anon, authenticated;
grant execute on function kom_wa_signatur_ok(text, text) to service_role;
grant execute on function kom_wa_verify_ok(text)         to service_role;

revoke all on function kom_eingang(jsonb) from public, anon, authenticated;
revoke all on function kom_status(jsonb)  from public, anon, authenticated;
grant execute on function kom_eingang(jsonb) to service_role;
grant execute on function kom_status(jsonb)  to service_role;

-- Aufbewahrung (Vorschlag, noch nicht als Zeitplan aktiv, Entscheidung Timo):
--   Nachrichten 180 Tage nach letzter Aktivität der Konversation, Statusereignisse 30 Tage, Audit 1 Jahr.
--   Ins CRM geht nur die Zusammenfassung, nicht der Chatverlauf (Auftrag Abschnitt 11).
