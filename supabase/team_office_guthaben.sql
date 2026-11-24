-- Momentum Team-Portal: KI Office 2.0, Paket 3 „Guthaben und Skalierung“
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden (idempotent).
-- Voraussetzung: supabase/team_office_kennzahlen.sql (Paket 2) ist schon ausgeführt.
-- Ändert nichts am Verhalten, solange kein Monatsguthaben eingetragen ist: Die neuen Spalten sind leer, leer heißt „nicht begrenzt“.
-- team_laden() bleibt unverändert. Reihenfolge beim Einspielen: erst dieses SQL, dann den Workflow „TEAM: Office-API“ aktualisieren (docs/office/SETUP.md Abschnitt 17).
-- Zugriff nur über den Server (n8n, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.

-- 1) Guthaben je Agent (Euro je Kalendermonat, Zeitzone Berlin). Gesetzt wird es nur von Timo über das Office (Aktion guthaben_setzen), nie von einem Agenten.
alter table office_agenten add column if not exists budget_eur_monat    numeric(10,2);  -- Monatsguthaben; leer = nicht eingerichtet (nicht begrenzt), 0 = kein Start
alter table office_agenten add column if not exists budget_zusatz_eur   numeric(10,2);  -- Auffüllung, gilt nur im Monat budget_zusatz_monat
alter table office_agenten add column if not exists budget_zusatz_monat text;           -- JJJJ-MM
alter table office_agenten add column if not exists instanz_von         text;           -- agent_id des Vorbilds, wenn dieser Eintrag eine zweite Instanz ist
alter table office_agenten add column if not exists pausiert_grund      text;           -- warum der Agent pausiert ist (aktiv = false)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'office_agenten_budget_check') then
    alter table office_agenten add constraint office_agenten_budget_check
      check ((budget_eur_monat is null or (budget_eur_monat >= 0 and budget_eur_monat <= 500))
         and (budget_zusatz_eur is null or (budget_zusatz_eur >= 0 and budget_zusatz_eur <= 5000))
         and (budget_zusatz_monat is null or budget_zusatz_monat ~ '^[0-9]{4}-[0-9]{2}$'));
  end if;
end $$;

-- 2) Protokoll der Entscheidungen über Guthaben, Pause und Skalierung. Jede Zeile ist eine Entscheidung von Timo (Admin), nie eine automatische Handlung.
--    art: auffuellen | pausieren | skalieren | einrichten (Vorschlagskarten), guthaben | aktiv (direkt gesetzt)
--    entschieden_von ist eine mitglied_id (Admin). Sonst keine Personendaten; zahlen enthält nur die Kennzahlen, die zum Vorschlag führten.
create table if not exists office_vorschlaege (
  vorschlag_id    text primary key,
  art             text not null check (art in ('auffuellen', 'pausieren', 'skalieren', 'einrichten', 'guthaben', 'aktiv')),
  agent_id        text,                              -- leer bei „einrichten“ (betrifft mehrere Agenten)
  entscheidung    text not null check (entscheidung in ('angenommen', 'abgelehnt', 'gesetzt')),
  option          text check (option is null or option in ('auffuellen', 'pausieren', 'guthaben', 'instanz', 'einrichten', 'monat', 'einschalten')),
  wert            numeric(10,2),                     -- Euro (aufgefüllter Betrag, neues Monatsguthaben)
  segment         text,                              -- Name des Segments bei einer zweiten Instanz
  neuer_agent     text,                              -- agent_id der angelegten Instanz
  begruendung     text,
  zahlen          jsonb check (zahlen is null or jsonb_typeof(zahlen) = 'object'),
  entschieden_von text not null,
  entschieden_am  timestamptz not null default now()
);
create index if not exists office_vorschlaege_agent on office_vorschlaege (agent_id, entschieden_am desc);
alter table office_vorschlaege enable row level security;   -- keine Policy: niemand außer service_role liest oder schreibt
revoke all on office_vorschlaege from public, anon, authenticated;

-- 3) Laden für die Office-API: wie in Paket 2, zusätzlich die Entscheidungen der letzten 400 Tage.
--    Der Schlüssel office_vorschlaege ist zugleich der Schalter: Erst wenn er da ist, setzt die Office-API Guthaben durch.
create or replace function team_laden_office() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select team_laden() || jsonb_build_object(
    'office_kennzahlen', coalesce((select jsonb_agg(to_jsonb(k) order by k.beendet desc) from office_kennzahlen k
                                   where k.beendet > now() - interval '120 days'), '[]'::jsonb),
    'office_vorschlaege', coalesce((select jsonb_agg(to_jsonb(v) order by v.entschieden_am desc) from office_vorschlaege v
                                    where v.entschieden_am > now() - interval '400 days'), '[]'::jsonb)
  );
$$;
revoke all on function team_laden_office() from public, anon, authenticated;
grant execute on function team_laden_office() to service_role;

-- 4) Stand je Agent im laufenden Monat, zum Nachsehen im SQL Editor (das Office rechnet selbst, mit Reservierung laufender Aufträge).
create or replace function office_guthaben()
returns table (agent_id text, name text, aktiv boolean, monat text, monat_eur numeric, zusatz_eur numeric, verbraucht_eur numeric, rest_eur numeric, laeufe_ohne_kosten bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with m as (select to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM') as monat),
  v as (
    select k.agent_id,
           coalesce(sum(k.kosten_eur) filter (where k.kosten_art <> 'unbekannt' and k.kosten_eur is not null), 0) as verbraucht,
           count(*) filter (where k.kosten_art = 'unbekannt' or k.kosten_eur is null) as ohne
    from office_kennzahlen k, m
    where to_char(k.beendet at time zone 'Europe/Berlin', 'YYYY-MM') = m.monat
    group by k.agent_id
  )
  select a.agent_id, a.name, coalesce(a.aktiv, true), m.monat, a.budget_eur_monat,
         case when a.budget_zusatz_monat = m.monat then coalesce(a.budget_zusatz_eur, 0) else 0 end,
         round(coalesce(v.verbraucht, 0), 4),
         case when a.budget_eur_monat is null then null
              else greatest(0, round(a.budget_eur_monat + case when a.budget_zusatz_monat = m.monat then coalesce(a.budget_zusatz_eur, 0) else 0 end - coalesce(v.verbraucht, 0), 4)) end,
         coalesce(v.ohne, 0)
  from office_agenten a cross join m left join v on v.agent_id = a.agent_id
  order by a.raum, a.name;
$$;
revoke all on function office_guthaben() from public, anon, authenticated;
grant execute on function office_guthaben() to service_role;

-- Kontrolle: muss true zeigen und je Agent eine Zeile (monat_eur leer = noch kein Guthaben eingerichtet)
select 'office_vorschlaege' = any (array(select jsonb_object_keys(team_laden_office()))) as vorschlaege_im_laden;
select * from office_guthaben();
