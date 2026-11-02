-- =====================================================================================================
-- 130_option_kommunikation.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "Inbox" und WhatsApp fürs Team
-- =====================================================================================================
-- Was macht diese Datei?
--   Teil 1: Zentrale Gesprächsablage für WhatsApp und Website-Chat (Konversationen, Nachrichten,
--           Statusmeldungen, Protokoll) mit den Funktionen, die der n8n-Eingangs-Workflow aufruft.
--   Teil 2: WhatsApp fürs Team: Teammitglied anhand seiner Nummer erkennen, Benachrichtigung bei
--           neuer Aufgabe (Warteschlange, die n8n abholt).
-- Pflicht oder Option?  OPTION. Nur einspielen, wenn ein WhatsApp- oder Chat-Kanal angebunden wird.
-- Wovon hängt sie ab?   001_basis.sql (team_mitglieder, team_aufgaben). team_laden() liefert diese
--                       Tabellen NICHT mit (der Inbox-Workflow liest sie direkt). Diese Datei definiert
--                       team_laden() NICHT neu. Sie legt einen Trigger auf team_aufgaben an.
-- Mehrfach ausführbar?  Ja.
--
-- Geheimnisse (App-Secret, Verify-Token des Kanals) kommen in kom_einstellungen. Sie werden nur in den
-- Funktionen unten gelesen und nie an n8n oder den Browser ausgegeben. Befüllen im SQL-Editor, nicht im
-- Chat und nicht im Workflow:
--   insert into kom_einstellungen (schluessel, wert) values ('wa_app_secret', '<App-Secret aus dem Meta-Entwicklerportal>')
--     on conflict (schluessel) do update set wert = excluded.wert, geaendert = now();
--   insert into kom_einstellungen (schluessel, wert) values ('wa_verify_token', '<frei gewählte lange Zufallszeichenkette>')
--     on conflict (schluessel) do update set wert = excluded.wert, geaendert = now();
-- Datenschutz: Chatverläufe sind personenbezogen. Aufbewahrung (Vorschlag, mit dem Kunden festlegen):
--   Nachrichten 180 Tage nach letzter Aktivität, Statusereignisse 30 Tage, Protokoll 1 Jahr.
-- =====================================================================================================

-- ===== Teil 1: Gesprächsablage ===========================================================================

-- Eine Konversation je Kanal und Kontakt (WhatsApp: Nummer, Website: Session-ID)
create table if not exists kom_konversationen (
  konversation_id   text primary key,                   -- 'wa:<nummer>' oder 'web:<session>'
  kanal             text not null,                      -- whatsapp | website | instagram
  kontakt_extern    text not null,                      -- Nummer bzw. Session-ID
  kontakt_name      text,                               -- Profilname aus dem Kanal, falls übermittelt
  telefon_e164      text,                               -- internationale Schreibweise, nur bei WhatsApp
  marke             text not null default 'offen',      -- Produktlinie oder Marke, frei wählbar; 'offen' = noch unklar
  twenty_person_id  text,                               -- Person im CRM (optional)
  twenty_chance_id  text,                               -- Verkaufschance im CRM (optional)
  modus             text not null default 'ki',         -- ki | mensch (KI pausiert)
  status            text not null default 'offen',      -- offen | wartet_auf_team | erledigt
  zugewiesen        text references team_mitglieder (mitglied_id) on delete set null,
  einwilligung      text not null default 'unbekannt',  -- unbekannt | erteilt | widerrufen (Marketing/Vorlagen)
  einwilligung_am   timestamptz,
  quelle            jsonb,                              -- Kampagne/Referral nur aus echten Kanaldaten
  zusammenfassung   text,
  letzte_kunde_am   timestamptz,                        -- Beginn des 24-Stunden-Fensters
  begruesst_am      timestamptz,                        -- Begrüßung höchstens einmal
  fehler            text,
  ansicht           text,                               -- null = automatisch | 'kunde' (Team testet den Kunden-Bot)
  erstellt          timestamptz not null default now(),
  geaendert         timestamptz not null default now(),
  unique (kanal, kontakt_extern)
);
alter table kom_konversationen add column if not exists ansicht text;
create index if not exists kom_konv_geaendert on kom_konversationen (geaendert desc);
create index if not exists kom_konv_status on kom_konversationen (status, modus);

-- Nachrichten. nachricht_id ist der Idempotenzschlüssel (WhatsApp: Nachrichten-ID des Kanals).
create table if not exists kom_nachrichten (
  id               bigint generated always as identity primary key,
  nachricht_id     text not null unique,
  konversation_id  text not null references kom_konversationen (konversation_id) on delete cascade,
  richtung         text not null,                       -- ein | aus
  absender         text not null,                       -- kunde | ki | system | mitglied:<id>
  typ              text not null default 'text',        -- text | image | audio | document | video | interactive | button | sticker | location | contacts | reaction | unsupported
  text             text,
  medien           jsonb,                               -- Medien-ID des Kanals, MIME-Typ, Dateiname; keine Dateien in der DB
  status           text not null default 'empfangen',   -- empfangen | gesendet | zugestellt | gelesen | fehlgeschlagen
  fehler           jsonb,
  zeit             timestamptz not null,                -- Zeitstempel laut Kanal
  erstellt         timestamptz not null default now()
);
create index if not exists kom_nachr_konv on kom_nachrichten (konversation_id, zeit);

-- Statusmeldungen (gesendet, zugestellt, gelesen, fehlgeschlagen), idempotent je Nachricht und Status
create table if not exists kom_status_ereignisse (
  schluessel   text primary key,                        -- nachricht_id || ':' || status
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

-- Geheimnisse für die Kanäle (siehe Kopf)
create table if not exists kom_einstellungen (
  schluessel text primary key,
  wert       text not null,
  geaendert  timestamptz not null default now()
);

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

-- Ausgehende Nachricht speichern (Bot oder Mensch), idempotent über nachricht_id.
-- Schreibt ein Mensch (absender 'mitglied:<id>' oder 'mensch:<kanal-app>'), schaltet die Konversation auf modus 'mensch':
-- Der Bot antwortet dann nicht mehr, bis jemand kom_modus_setzen(..., 'ki') aufruft. Gilt für alle Kanäle.
create or replace function kom_ausgang(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_neu    boolean;
  v_mensch boolean := (p->>'absender') like 'mitglied:%' or (p->>'absender') like 'mensch:%';
begin
  -- Konversation anlegen, falls die erste Nachricht von uns kommt
  if p ? 'kanal' and p ? 'kontakt_extern' then
    insert into kom_konversationen (konversation_id, kanal, kontakt_extern)
    values (p->>'konversation_id', p->>'kanal', p->>'kontakt_extern')
    on conflict (konversation_id) do nothing;
  end if;

  insert into kom_nachrichten (nachricht_id, konversation_id, richtung, absender, typ, text, medien, status, zeit)
  values (p->>'nachricht_id', p->>'konversation_id', 'aus', p->>'absender', coalesce(p->>'typ', 'text'), p->>'text',
          case when p ? 'medien' and p->'medien' <> 'null'::jsonb then p->'medien' end,
          coalesce(p->>'status', 'gesendet'), coalesce((p->>'zeit')::timestamptz, now()))
  on conflict (nachricht_id) do nothing;
  get diagnostics v_neu = row_count;

  if v_neu and v_mensch then
    update kom_konversationen
       set modus = 'mensch', status = 'offen',
           zugewiesen = coalesce(zugewiesen, case when (p->>'absender') like 'mitglied:%' then substr(p->>'absender', 10) end),
           geaendert = now()
     where konversation_id = p->>'konversation_id' and modus <> 'mensch';
    if found then
      insert into kom_audit (konversation_id, wer, aktion, details)
      values (p->>'konversation_id', p->>'absender', 'ki_pausiert', jsonb_build_object('grund', 'Mensch hat geschrieben'));
    end if;
  end if;
  if v_neu and (p->>'absender') = 'ki' then
    update kom_konversationen set begruesst_am = coalesce(begruesst_am, now()), geaendert = now()
     where konversation_id = p->>'konversation_id';
  end if;
  return jsonb_build_object('neu', v_neu, 'mensch', v_mensch);
end $$;

-- Modus bewusst umschalten (Portal-Knopf "KI pausieren" / "An KI zurückgeben"), mit Protokoll.
create or replace function kom_modus_setzen(p_konversation text, p_modus text, p_wer text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_modus not in ('ki', 'mensch') then raise exception 'modus muss ki oder mensch sein'; end if;
  update kom_konversationen set modus = p_modus, geaendert = now() where konversation_id = p_konversation;
  if not found then return jsonb_build_object('ok', false, 'fehler', 'Konversation unbekannt'); end if;
  insert into kom_audit (konversation_id, wer, aktion, details)
  values (p_konversation, p_wer, case when p_modus = 'ki' then 'ki_aktiviert' else 'ki_pausiert' end, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'modus', p_modus);
end $$;

-- Webhook-Prüfungen des Kanals (Meta). Das Secret verlässt die Datenbank nicht; zurück kommt nur wahr/falsch.
-- pgcrypto liegt bei Supabase im Schema "extensions", lokal in "public"; der search_path deckt beides ab.
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

-- ===== Teil 2: WhatsApp fürs Team =========================================================================

-- Telefonnummer vergleichbar machen: nur Ziffern; "00" am Anfang weg; führende 0 wird zur Landesvorwahl 49
-- (deutsche Nummern ohne Vorwahl); "490..." (Vorwahl mit eingeschobener 0) wird zu "49...".
create or replace function kom_norm_tel(t text)
returns text
language sql immutable as $$
  select case
    when d is null or d = '' then null
    when d like '00%'  then substr(d, 3)
    when d like '490%' then '49' || substr(d, 4)
    when d like '0%'  then '49' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x;
$$;

-- Teammitglied zu einer WhatsApp-Nummer. Nur aktive Menschen mit WhatsApp-Einwilligung. Gibt nie den Portal-Token zurück.
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

-- Portal-Zugang eines erkannten Teammitglieds, damit n8n serverseitig den Portal-Assistenten mit dessen Rechten fragen kann.
-- Nur service_role, nur aktive Menschen mit WhatsApp-Einwilligung.
create or replace function kom_team_token(p_mitglied_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('token', m.token) from team_mitglieder m
      where m.mitglied_id = p_mitglied_id and m.status = 'aktiv' and m.typ = 'mensch' and m.whatsapp_ok is true),
    '{}'::jsonb);
$$;

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

-- Neue Zuweisung einer Aufgabe -> Eintrag in die Warteschlange (nicht an die Person, die sie angelegt hat, nicht bei Erledigt)
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

-- ===== Rechte ==============================================================================================
alter table kom_einstellungen       enable row level security;
alter table kom_konversationen      enable row level security;
alter table kom_nachrichten         enable row level security;
alter table kom_status_ereignisse   enable row level security;
alter table kom_audit               enable row level security;
alter table kom_benachrichtigungen  enable row level security;
revoke all on table kom_einstellungen, kom_konversationen, kom_nachrichten, kom_status_ereignisse, kom_audit,
  kom_benachrichtigungen from public, anon, authenticated;
grant all on table kom_einstellungen, kom_konversationen, kom_nachrichten, kom_status_ereignisse, kom_audit,
  kom_benachrichtigungen to service_role;
grant usage, select on sequence kom_nachrichten_id_seq, kom_audit_id_seq, kom_benachrichtigungen_id_seq to service_role;

revoke all on function kom_eingang(jsonb)                                   from public, anon, authenticated;
revoke all on function kom_status(jsonb)                                    from public, anon, authenticated;
revoke all on function kom_ausgang(jsonb)                                   from public, anon, authenticated;
revoke all on function kom_modus_setzen(text, text, text)                   from public, anon, authenticated;
revoke all on function kom_wa_signatur_ok(text, text)                       from public, anon, authenticated;
revoke all on function kom_wa_verify_ok(text)                               from public, anon, authenticated;
revoke all on function kom_norm_tel(text)                                   from public, anon, authenticated;
revoke all on function kom_team_kontakt(text)                               from public, anon, authenticated;
revoke all on function kom_team_token(text)                                 from public, anon, authenticated;
revoke all on function kom_aufgabe_zugewiesen()                             from public, anon, authenticated;
revoke all on function kom_benachrichtigungen_holen()                       from public, anon, authenticated;
revoke all on function kom_benachrichtigung_ergebnis(bigint, boolean, text) from public, anon, authenticated;
grant execute on function kom_eingang(jsonb)                                to service_role;
grant execute on function kom_status(jsonb)                                 to service_role;
grant execute on function kom_ausgang(jsonb)                                to service_role;
grant execute on function kom_modus_setzen(text, text, text)                to service_role;
grant execute on function kom_wa_signatur_ok(text, text)                    to service_role;
grant execute on function kom_wa_verify_ok(text)                            to service_role;
grant execute on function kom_norm_tel(text)                                to service_role;
grant execute on function kom_team_kontakt(text)                            to service_role;
grant execute on function kom_team_token(text)                              to service_role;
grant execute on function kom_benachrichtigungen_holen()                    to service_role;
grant execute on function kom_benachrichtigung_ergebnis(bigint, boolean, text) to service_role;

-- Schnittstelle neu laden, damit n8n die neuen Funktionen sofort findet (bei Supabase)
notify pgrst, 'reload schema';

-- Kontrolle: 6 Tabellen kom_*
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'kom\_%' order by 1;
