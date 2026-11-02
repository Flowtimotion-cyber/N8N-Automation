-- =====================================================================================================
-- 003_team_laden.sql  ·  Team-Portal (Pilot-Kopie)  ·  PFLICHT  ·  Reihenfolge: 3 von 3 Pflichtdateien
-- =====================================================================================================
-- Was macht diese Datei?
--   Legt die zentrale Lesefunktion team_laden() und die erweiterte Fassung team_laden_plus() an.
--   Der Server (n8n) ruft team_laden_plus() einmal je Anfrage auf und bekommt ALLE Daten des Portals
--   als ein JSON. Das ist die EINZIGE Stelle, an der diese beiden Funktionen definiert werden.
--   Keine Option (100 bis 150) definiert sie neu.
--
--   Für Bereiche, die als Option kommen (Arbeitszeit, Teilnehmer, Social, KI Office, Kurs), prüft die
--   Funktion zur Laufzeit, ob die Tabelle vorhanden ist. Fehlt sie, liefert sie eine leere Liste [].
--   So bricht die Oberfläche mit ausgeschalteten Registern nicht, und eine Option kann jederzeit
--   nachträglich eingespielt werden, ohne dass hier etwas geändert werden muss.
--
-- Pflicht oder Option?  PFLICHT.
-- Wovon hängt sie ab?   001_basis.sql (Tabellen) und 002_einstellungen.sql (Stichdatum, Einstellungen).
-- Was kommt danach?     Optionen 100 bis 150 nach Bedarf, dann 900_seed_musterfirma.sql oder 910_erster_admin.sql.
-- Mehrfach ausführbar?  Ja (create or replace).
--
-- Schlüssel im JSON (gleich wie im Original, damit die n8n-Workflows unverändert passen):
--   team_laden():      einstellungen, mitglieder, projekte, aufgaben, verlauf, notizen, zeiten, abrechnung,
--                      social, systeme, community, vorschlaege, office_agenten, office_runs,
--                      office_run_schluessel, office_ereignisse, office_artefakte, office_freigaben, office_idempotenz
--   team_laden_plus(): alles von team_laden() plus papierkorb, notiz_versionen, teilnehmer, tn_spalten
-- Zeitfenster: verlauf 120 Tage, zeiten ab Stichdatum (team_einstellungen.stichdatum_abrechnung) oder
--   120 Tage, community 180 Tage, Office-Runs 90 Tage oder noch offen, Idempotenz 30 Tage, Papierkorb 30 Tage.
-- =====================================================================================================

-- Hilfsfunktion: führt eine Abfrage nur aus, wenn die Tabelle existiert; sonst [] (leere Liste).
-- Die Abfrage muss genau einen jsonb-Wert liefern (jsonb_agg ...). Sie wird nur mit festen Texten aus
-- team_laden() aufgerufen, nie mit Eingaben von außen.
create or replace function team_laden_optional(p_tabelle text, p_abfrage text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if to_regclass('public.' || p_tabelle) is null then return '[]'::jsonb; end if;
  execute p_abfrage into r;
  return coalesce(r, '[]'::jsonb);
end $$;

-- Bedingung für Office-Runs: letzte 90 Tage oder noch nicht beendet (gleicher Text wie im Original).
-- Steht als Konstante hier, damit team_laden() unten lesbar bleibt.
create or replace function team_laden_office_fenster() returns text
language sql immutable as $$
  select $f$ o.erstellt > now() - interval '90 days' or o.status not in ('abgeschlossen','fehlgeschlagen','abgebrochen','unbekannt') $f$;
$$;

create or replace function team_laden() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  fenster text := team_laden_office_fenster();
begin
  return jsonb_build_object(
    -- Einstellungen der Firma (002), als Objekt { schluessel: wert }
    'einstellungen', team_einstellungen_alle(),

    -- Pflichttabellen (001)
    'mitglieder', coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from team_mitglieder m), '[]'::jsonb),
    'projekte',   coalesce((select jsonb_agg(to_jsonb(p) order by p.reihenfolge, p.name) from team_projekte p), '[]'::jsonb),
    'aufgaben',   coalesce((select jsonb_agg(to_jsonb(a) order by a.prio, a.deadline nulls last) from team_aufgaben a), '[]'::jsonb),
    'verlauf',    coalesce((select jsonb_agg(to_jsonb(v) order by v.erstellt) from team_aufgaben_verlauf v
                            where v.erstellt > now() - interval '120 days'), '[]'::jsonb),
    'notizen',    coalesce((select jsonb_agg(to_jsonb(n) order by n.titel) from team_notizen n), '[]'::jsonb),
    'systeme',    coalesce((select jsonb_agg(to_jsonb(y) order by y.name) from team_systeme y), '[]'::jsonb),
    'vorschlaege', coalesce((select jsonb_agg(to_jsonb(x) order by x.erstellt desc) from team_vorschlaege x), '[]'::jsonb),

    -- Option 100 Arbeitszeit: Zeiten ab Stichdatum (sonst 120 Tage), Monatsabschlüsse
    'zeiten', team_laden_optional('team_zeiten', $q$
        select jsonb_agg(to_jsonb(z) order by z.datum desc) from team_zeiten z
        where z.datum >= coalesce(team_einstellung('stichdatum_abrechnung') #>> '{}',
                                  to_char(now() - interval '120 days', 'YYYY-MM-DD')) $q$),
    'abrechnung', team_laden_optional('team_abrechnung', $q$
        select jsonb_agg(to_jsonb(r) order by r.monat) from team_abrechnung r $q$),

    -- Option 120 Social Media
    'social', team_laden_optional('team_social', $q$
        select jsonb_agg(to_jsonb(s) order by s.datum) from team_social s $q$),

    -- Option 150 Kurs-Community (180 Tage)
    'community', team_laden_optional('kurs_community', $q$
        select jsonb_agg(to_jsonb(c) order by c.erstellt) from kurs_community c
        where c.erstellt > now() - interval '180 days' $q$),

    -- Option 140 KI Office (Runs 90 Tage oder offen; Ereignisse, Artefakte, Freigaben dazu; Idempotenz 30 Tage)
    'office_agenten', team_laden_optional('office_agenten', $q$
        select jsonb_agg(to_jsonb(g) order by g.raum, g.name) from office_agenten g $q$),
    'office_runs', team_laden_optional('office_runs', $q$
        select jsonb_agg(to_jsonb(o) order by o.erstellt desc) from office_runs o where $q$ || fenster),
    'office_run_schluessel', team_laden_optional('office_run_schluessel', $q$
        select jsonb_agg(to_jsonb(k)) from office_run_schluessel k join office_runs o on o.run_id = k.run_id where $q$ || fenster),
    'office_ereignisse', team_laden_optional('office_ereignisse', $q$
        select jsonb_agg(to_jsonb(e) order by e.zeit, e.id) from office_ereignisse e join office_runs o on o.run_id = e.run_id where $q$ || fenster),
    'office_artefakte', team_laden_optional('office_artefakte', $q$
        select jsonb_agg(to_jsonb(t) order by t.erstellt desc) from office_artefakte t join office_runs o on o.run_id = t.run_id where $q$ || fenster),
    'office_freigaben', team_laden_optional('office_freigaben', $q$
        select jsonb_agg(to_jsonb(f) order by f.angefordert_am desc) from office_freigaben f join office_runs o on o.run_id = f.run_id where $q$ || fenster),
    'office_idempotenz', team_laden_optional('office_idempotenz', $q$
        select jsonb_agg(to_jsonb(i)) from office_idempotenz i where i.erstellt > now() - interval '30 days' $q$)
  );
end $$;

-- Erweiterte Fassung: Papierkorb (30 Tage), Notiz-Versionen (180 Tage) und, falls Option 110 eingespielt
-- ist, Teilnehmer und deren Prüfpunkte. Der Server ruft diese Funktion auf.
create or replace function team_laden_plus() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return team_laden() || jsonb_build_object(
    'papierkorb', coalesce((select jsonb_agg(to_jsonb(p) order by p.geloescht_am desc) from team_papierkorb p
                            where p.geloescht_am > now() - interval '30 days'), '[]'::jsonb),
    'notiz_versionen', coalesce((select jsonb_agg(to_jsonb(v) order by v.gesichert_am desc) from team_notiz_versionen v
                            where v.gesichert_am > now() - interval '180 days'), '[]'::jsonb),
    'teilnehmer', team_laden_optional('team_teilnehmer', $q$
        select jsonb_agg(to_jsonb(t) order by t.name) from team_teilnehmer t $q$),
    'tn_spalten', team_laden_optional('team_tn_spalten', $q$
        select jsonb_agg(to_jsonb(s) order by s.reihenfolge, s.titel) from team_tn_spalten s $q$)
  );
end $$;

-- Rechte: nur der Server darf laden
revoke all on function team_laden_optional(text, text) from public, anon, authenticated;
revoke all on function team_laden_office_fenster()     from public, anon, authenticated;
revoke all on function team_laden()                    from public, anon, authenticated;
revoke all on function team_laden_plus()               from public, anon, authenticated;
grant execute on function team_laden()      to service_role;
grant execute on function team_laden_plus() to service_role;

-- Kontrolle: muss 23 Schlüssel zeigen, darunter mitglieder, projekte, aufgaben, papierkorb, teilnehmer
select jsonb_object_keys(team_laden_plus()) as schluessel order by 1;
