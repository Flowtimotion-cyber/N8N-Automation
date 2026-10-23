-- Team-Portal: Teilnehmer-Register (22.10.2026)
-- Einmal im Supabase-SQL-Editor ausführen, NACH team_papierkorb.sql. Kann gefahrlos mehrfach laufen.
--
-- Eine Zeile je Kursteilnehmer, eine Spalte je Punkt (Antrag genehmigt, Bildungsgutschein im Haus, ...).
-- Die Punkte stehen in team_tn_spalten und lassen sich im Portal ergänzen, umbenennen oder ausblenden.
-- Je Teilnehmer liegt der Stand der Punkte in haken: { "<spalte_id>": { "s": "ja" | "entfaellt", "d": "JJJJ-MM-TT", "von": "<mitglied_id>" } }.
-- Fehlt eine Spalte in haken, ist der Punkt offen. Spätere Automationen setzen Haken über team_tn_haken().

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
  massnahme     text,                      -- z. B. TEMP-Kurs, Modul 1
  start         date,
  ende          date,
  status        text default 'aktiv',      -- interessent | aktiv | abgeschlossen | abgebrochen
  notiz         text,
  haken         jsonb default '{}'::jsonb,
  erstellt      timestamptz default now(),
  erstellt_von  text,
  geaendert     timestamptz default now(),
  geaendert_von text
);

alter table team_tn_spalten enable row level security;
alter table team_teilnehmer enable row level security;

insert into team_tn_spalten (spalte_id, titel, reihenfolge) values
  ('antrag',      'Antrag genehmigt',             10),
  ('gutschein',   'Bildungsgutschein im Haus',    20),
  ('vertrag',     'Seminarvertrag unterzeichnet', 30),
  ('brandschutz', 'Brandschutzordnung',           40),
  ('google',      'Google-Bewertung',             50)
on conflict (spalte_id) do nothing;

-- Einen Punkt setzen, ohne andere gleichzeitige Änderungen zu überschreiben (für Portal und spätere Automationen).
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

-- Papierkorb kennt jetzt auch Teilnehmer (sonst wie in team_papierkorb.sql)
create or replace function team_papierkorb_ziel(p_art text, out tab text, out pk text, out titelspalte text)
language sql immutable as $$
  select t.tab, t.pk, t.titelspalte from (values
    ('aufgabe',    'team_aufgaben',    'aufgabe_id',   'titel'),
    ('notiz',      'team_notizen',     'notiz_id',     'titel'),
    ('vorschlag',  'team_vorschlaege', 'vorschlag_id', 'titel'),
    ('social',     'team_social',      'post_id',      'thema'),
    ('system',     'team_systeme',     'system_id',    'name'),
    ('zeit',       'team_zeiten',      'zeit_id',      'taetigkeit'),
    ('teilnehmer', 'team_teilnehmer',  'tn_id',        'name')
  ) as t(art, tab, pk, titelspalte) where t.art = p_art;
$$;

-- Laden wie bisher, dazu Papierkorb, Versionen und das Register
create or replace function team_laden_plus() returns jsonb
language sql stable security definer set search_path = public as $$
  select team_laden() || jsonb_build_object(
    'papierkorb', coalesce((select jsonb_agg(to_jsonb(p) order by p.geloescht_am desc) from team_papierkorb p
                            where p.geloescht_am > now() - interval '30 days'), '[]'::jsonb),
    'notiz_versionen', coalesce((select jsonb_agg(to_jsonb(v) order by v.gesichert_am desc) from team_notiz_versionen v
                            where v.gesichert_am > now() - interval '180 days'), '[]'::jsonb),
    'teilnehmer', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from team_teilnehmer t), '[]'::jsonb),
    'tn_spalten', coalesce((select jsonb_agg(to_jsonb(s) order by s.reihenfolge, s.titel) from team_tn_spalten s), '[]'::jsonb)
  );
$$;

revoke all on function team_tn_haken(text, text, text, date, text) from public, anon, authenticated;
revoke all on function team_papierkorb_ziel(text)                 from public, anon, authenticated;
revoke all on function team_laden_plus()                          from public, anon, authenticated;
grant execute on function team_tn_haken(text, text, text, date, text) to service_role;
grant execute on function team_papierkorb_ziel(text)                 to service_role;
grant execute on function team_laden_plus()                          to service_role;
