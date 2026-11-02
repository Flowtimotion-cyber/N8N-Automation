-- =====================================================================================================
-- 110_option_teilnehmer.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION  ·  Register "Teilnehmer"
-- =====================================================================================================
-- Was macht diese Datei?
--   Ein Register für Kursteilnehmer, Bewerber, Kunden im Onboarding oder ähnliche Personenlisten.
--   Eine Zeile je Person (team_teilnehmer), eine Spalte je Prüfpunkt (team_tn_spalten). Die Prüfpunkte
--   lassen sich im Portal ergänzen, umbenennen oder ausblenden. Je Person liegt der Stand in "haken":
--     { "<spalte_id>": { "s": "ja" | "entfaellt", "d": "JJJJ-MM-TT", "von": "<mitglied_id>" } }
--   Fehlt eine Spalte in haken, ist der Punkt offen. Automationen setzen Haken über team_tn_haken().
-- Pflicht oder Option?  OPTION.
-- Wovon hängt sie ab?   001_basis.sql, 003_team_laden.sql. team_laden_plus() liefert "teilnehmer" und
--                       "tn_spalten" automatisch, sobald die Tabellen da sind. Der Papierkorb kennt die
--                       Art "teilnehmer" bereits. Diese Datei definiert team_laden() NICHT neu.
-- Mehrfach ausführbar?  Ja.
--
-- Datenschutz: Hier stehen Namen und Kontaktdaten Dritter. Nur so viel erfassen wie nötig; Löschfrist
--   mit dem Kunden festlegen (Vorschlag: 6 Monate nach "ende"). Beim Pilotende exportiert 990_export.sql
--   auch diese Tabelle, 999_loeschen.sql löscht sie.
-- =====================================================================================================

create table if not exists team_tn_spalten (
  spalte_id   text primary key,
  titel       text not null,
  reihenfolge int default 50,
  aktiv       boolean default true,
  erstellt    timestamptz default now()
);

create table if not exists team_teilnehmer (
  tn_id         text primary key,
  name          text not null,
  email         text,
  telefon       text,
  massnahme     text,                              -- Gruppe oder Kurs, z. B. "Onboarding Frühjahr"
  start         date,
  ende          date,
  status        text default 'aktiv',              -- interessent | aktiv | abgeschlossen | abgebrochen
  notiz         text,
  haken         jsonb default '{}'::jsonb,
  erstellt      timestamptz default now(),
  erstellt_von  text,
  geaendert     timestamptz default now(),
  geaendert_von text
);

-- BEISPIEL-Prüfpunkte. Sie zeigen nur, wie die Spalten aussehen; der Kunde benennt sie im Portal um
-- oder blendet sie aus (aktiv = false). Bestehende Einträge werden nicht überschrieben.
insert into team_tn_spalten (spalte_id, titel, reihenfolge) values
  ('unterlagen', 'Unterlagen vollständig',      10),
  ('vertrag',    'Vertrag unterzeichnet',       20),
  ('einweisung', 'Einweisung erhalten',         30),
  ('zugang',     'Zugänge eingerichtet',        40),
  ('feedback',   'Rückmeldung eingeholt',       50)
on conflict (spalte_id) do nothing;

-- Einen Punkt setzen, ohne andere gleichzeitige Änderungen zu überschreiben (für Portal und Automationen).
-- p_wert: 'ja', 'entfaellt' oder '' (= wieder offen)
create or replace function team_tn_haken(p_tn text, p_spalte text, p_wert text, p_datum date, p_von text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from team_tn_spalten where spalte_id = p_spalte) then raise exception 'Unbekannte Spalte: %', p_spalte; end if;
  if coalesce(p_wert, '') = '' then
    update team_teilnehmer set haken = coalesce(haken, '{}'::jsonb) - p_spalte, geaendert = now(), geaendert_von = p_von where tn_id = p_tn;
  elsif p_wert in ('ja', 'entfaellt') then
    update team_teilnehmer set haken = coalesce(haken, '{}'::jsonb) || jsonb_build_object(p_spalte,
        jsonb_build_object('s', p_wert, 'd', to_char(coalesce(p_datum, current_date), 'YYYY-MM-DD'), 'von', p_von)),
      geaendert = now(), geaendert_von = p_von where tn_id = p_tn;
  else
    raise exception 'Unbekannter Wert: %', p_wert;
  end if;
  if not found then raise exception 'Teilnehmer nicht gefunden: %', p_tn; end if;
end $$;

-- Rechte
alter table team_tn_spalten enable row level security;
alter table team_teilnehmer enable row level security;
revoke all on table team_tn_spalten, team_teilnehmer from public, anon, authenticated;
grant all on table team_tn_spalten, team_teilnehmer to service_role;
revoke all on function team_tn_haken(text, text, text, date, text) from public, anon, authenticated;
grant execute on function team_tn_haken(text, text, text, date, text) to service_role;

-- Kontrolle: 5 Beispielspalten, und team_laden_plus() liefert "tn_spalten" als Liste
select spalte_id, titel, reihenfolge, aktiv from team_tn_spalten order by reihenfolge;
select jsonb_array_length(team_laden_plus() -> 'tn_spalten') as tn_spalten;
