-- Momentum Team-Portal: KI Office 2.0, Paket 2 „Messbarkeit“ (Kennzahlen je Agentenlauf und Auswertung)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden (idempotent).
-- Ändert nichts Bestehendes: legt eine Tabelle und drei Funktionen neu an. team_laden() bleibt unverändert, das Team-Portal merkt nichts davon.
-- Reihenfolge beim Einspielen: erst dieses SQL, dann den Workflow „TEAM: Office-API“ aktualisieren (docs/office/SETUP.md Abschnitt 16).
-- Zugriff nur über den Server (n8n, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.

-- 1) Kennzahlen: eine Zeile je beendetem Agentenlauf.
--    Bewusst OHNE Personendaten und ohne Freitext: kein Auftraggeber, kein Abnehmer, kein Auftragstext, kein Projektname.
--    Nur Agent, Raum, Modell, Zahlen und feste Kategorien. Darum darf die Zeile länger leben als der Run (kein Fremdschlüssel auf office_runs).
create table if not exists office_kennzahlen (
  run_id        text primary key,                  -- Kennung des Laufs; beim Löschen des Runs ersetzt die Office-API sie durch eine Zufallskennung (geloescht_…)
  agent_id      text not null,                     -- Registry-Eintrag (office_agenten.agent_id), kein Mensch
  raum          text,                              -- Akademie | Marketing | Vertrieb | Kundenprojekte | Verwaltung
  ausfuehrer    text,                              -- n8n | claude-code | codex | hermes
  modell        text check (modell is null or modell ~ '^[a-z0-9][a-z0-9._-]{1,59}$'),  -- nur bekannte Modellnamen (Preistabelle oder Registry), sonst 'sonstiges'
  status        text not null check (status in ('abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt')),
  beendet       timestamptz not null,
  dauer_sek     int,                               -- Start bis Ende
  tokens_ein    int,
  tokens_aus    int,
  kosten_eur    numeric(12,4),                     -- leer = unbekannt (nie 0 als Platzhalter)
  kosten_art    text not null default 'unbekannt' check (kosten_art in ('gemessen', 'geschaetzt', 'unbekannt')),
  kosten_basis  text check (kosten_basis is null or kosten_basis in ('ausfuehrer', 'preistabelle', 'textlaenge')),
  ergebnis_typ  text check (ergebnis_typ is null or ergebnis_typ in ('text', 'dossier', 'bericht', 'code', 'workflow', 'medien', 'plan', 'pruefung', 'sonstiges', 'ohne')),
  ergebnisse    int not null default 0,            -- Anzahl abgelegter Ergebnisse (Artefakte)
  abnahme       text not null default 'offen' check (abnahme in ('offen', 'abgenommen', 'zurueckgewiesen')),
  wirkung       jsonb not null default '{}'::jsonb check (jsonb_typeof(wirkung) = 'object'),  -- nur Zahlen je Wirkungsfeld des Raums, z. B. {"firmen": 12, "termine": 4}
  versuche      int not null default 1,
  geaendert     timestamptz default now()
);
create index if not exists office_kennzahlen_agent on office_kennzahlen (agent_id, beendet desc);
create index if not exists office_kennzahlen_beendet on office_kennzahlen (beendet);
alter table office_kennzahlen enable row level security;   -- keine Policy: niemand außer service_role liest oder schreibt
revoke all on office_kennzahlen from public, anon, authenticated;   -- zweite Absicherung neben RLS

-- 2) Laden für die Office-API: der bisherige Stand aus team_laden() plus die Kennzahlen der letzten 120 Tage.
--    Eigene Funktion statt Änderung an team_laden(): Das Portal bekommt keine größere Antwort, und spätere Änderungen an team_laden() bleiben erhalten.
create or replace function team_laden_office() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select team_laden() || jsonb_build_object(
    'office_kennzahlen', coalesce((select jsonb_agg(to_jsonb(k) order by k.beendet desc) from office_kennzahlen k
                                   where k.beendet > now() - interval '120 days'), '[]'::jsonb)
  );
$$;
revoke all on function team_laden_office() from public, anon, authenticated;
grant execute on function team_laden_office() to service_role;

-- 3) Auswertung je Agent über die letzten p_tage Tage (Standard 28). Gleiche Regeln wie office/lib/kennzahlen.js:
--    ergebnisse = technisch abgeschlossene Läufe; Kosten zählen auch für fehlgeschlagene Läufe; unbekannte Kosten zählen nicht als 0.
--    urteil: zu_wenig (unter 3 bewertete Ergebnisse) | liefert_nicht (über 20 % zurückgewiesen oder nichts abgenommen)
--            | beobachten (Kosten unbekannt oder über 0,50 € je abgenommenem Ergebnis) | liefert
create or replace function office_auswertung(p_tage int default 28)
returns table (
  agent_id text, raum text, laeufe bigint, ergebnisse bigint, abgenommen bigint, zurueckgewiesen bigint, offen bigint, fehlgeschlagen bigint,
  kosten_eur numeric, kosten_gemessen_eur numeric, kosten_geschaetzt_eur numeric, laeufe_ohne_kosten bigint,
  kosten_je_abgenommen numeric, zurueck_quote numeric, dauer_median_min numeric, wirkung jsonb, urteil text
)
language sql stable security definer set search_path = public, pg_temp as $$
  with z as (
    select * from office_kennzahlen k where k.beendet > now() - make_interval(days => greatest(1, least(coalesce(p_tage, 28), 400)))
  ), a as (
    select z.agent_id,
      max(z.raum) as raum,
      count(*) as laeufe,
      count(*) filter (where z.status = 'abgeschlossen') as ergebnisse,
      count(*) filter (where z.status = 'abgeschlossen' and z.abnahme = 'abgenommen') as abgenommen,
      count(*) filter (where z.status = 'abgeschlossen' and z.abnahme = 'zurueckgewiesen') as zurueckgewiesen,
      count(*) filter (where z.status = 'abgeschlossen' and z.abnahme = 'offen') as offen,
      count(*) filter (where z.status in ('fehlgeschlagen', 'unbekannt')) as fehlgeschlagen,
      sum(z.kosten_eur) filter (where z.kosten_art <> 'unbekannt' and z.kosten_eur is not null) as kosten_eur,
      coalesce(sum(z.kosten_eur) filter (where z.kosten_art = 'gemessen'), 0) as kosten_gemessen_eur,
      coalesce(sum(z.kosten_eur) filter (where z.kosten_art = 'geschaetzt'), 0) as kosten_geschaetzt_eur,
      count(*) filter (where z.kosten_art = 'unbekannt' or z.kosten_eur is null) as laeufe_ohne_kosten,
      (percentile_disc(0.5) within group (order by z.dauer_sek) filter (where z.status = 'abgeschlossen' and z.dauer_sek is not null))::numeric as dauer_median_sek
    from z group by z.agent_id
  ), w as (
    select e.agent_id, jsonb_object_agg(e.feld, e.summe) as wirkung
    from (select z.agent_id, t.key as feld, sum((t.value)::numeric) as summe
          from z, jsonb_each_text(z.wirkung) t where t.value ~ '^[0-9]+(\.[0-9]+)?$' group by z.agent_id, t.key) e
    group by e.agent_id
  )
  select a.agent_id, a.raum, a.laeufe, a.ergebnisse, a.abgenommen, a.zurueckgewiesen, a.offen, a.fehlgeschlagen,
    round(a.kosten_eur, 4), round(a.kosten_gemessen_eur, 4), round(a.kosten_geschaetzt_eur, 4), a.laeufe_ohne_kosten,
    case when a.abgenommen > 0 and a.kosten_eur is not null then round(a.kosten_eur / a.abgenommen, 4) end as kosten_je_abgenommen,
    case when a.abgenommen + a.zurueckgewiesen > 0 then round(a.zurueckgewiesen::numeric / (a.abgenommen + a.zurueckgewiesen), 4) end as zurueck_quote,
    round(a.dauer_median_sek / 60, 1) as dauer_median_min,
    coalesce(w.wirkung, '{}'::jsonb) as wirkung,
    case
      when a.abgenommen + a.zurueckgewiesen < 3 then 'zu_wenig'
      when a.zurueckgewiesen::numeric / (a.abgenommen + a.zurueckgewiesen) > 0.2 or a.abgenommen = 0 then 'liefert_nicht'
      when a.kosten_eur is null or a.kosten_eur / a.abgenommen > 0.5 then 'beobachten'
      else 'liefert'
    end as urteil
  from a left join w on w.agent_id = a.agent_id
  order by a.abgenommen desc, a.agent_id;
$$;
revoke all on function office_auswertung(int) from public, anon, authenticated;
grant execute on function office_auswertung(int) to service_role;

-- 4) Trend je Agent und Kalenderwoche (Montag als Wochenbeginn, Zeitzone Berlin) über die letzten p_wochen Wochen (Standard 4).
create or replace function office_auswertung_wochen(p_wochen int default 4)
returns table (agent_id text, woche date, laeufe bigint, ergebnisse bigint, abgenommen bigint, zurueckgewiesen bigint, kosten_eur numeric, kosten_je_abgenommen numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select k.agent_id,
    (date_trunc('week', k.beendet at time zone 'Europe/Berlin'))::date as woche,
    count(*) as laeufe,
    count(*) filter (where k.status = 'abgeschlossen') as ergebnisse,
    count(*) filter (where k.status = 'abgeschlossen' and k.abnahme = 'abgenommen') as abgenommen,
    count(*) filter (where k.status = 'abgeschlossen' and k.abnahme = 'zurueckgewiesen') as zurueckgewiesen,
    round(sum(k.kosten_eur) filter (where k.kosten_art <> 'unbekannt' and k.kosten_eur is not null), 4) as kosten_eur,
    case when count(*) filter (where k.status = 'abgeschlossen' and k.abnahme = 'abgenommen') > 0
              and sum(k.kosten_eur) filter (where k.kosten_art <> 'unbekannt' and k.kosten_eur is not null) is not null
         then round(sum(k.kosten_eur) filter (where k.kosten_art <> 'unbekannt' and k.kosten_eur is not null)
                    / count(*) filter (where k.status = 'abgeschlossen' and k.abnahme = 'abgenommen'), 4) end as kosten_je_abgenommen
  from office_kennzahlen k
  where k.beendet > now() - make_interval(weeks => greatest(1, least(coalesce(p_wochen, 4), 52)))
  group by k.agent_id, 2
  order by k.agent_id, 2;
$$;
revoke all on function office_auswertung_wochen(int) from public, anon, authenticated;
grant execute on function office_auswertung_wochen(int) to service_role;

-- Kontrolle: muss 'office_kennzahlen' in der Liste zeigen und zwei leere Auswertungen ohne Fehler liefern
select 'office_kennzahlen' = any (array(select jsonb_object_keys(team_laden_office()))) as kennzahlen_im_laden;
select * from office_auswertung(28);
select * from office_auswertung_wochen(4);
