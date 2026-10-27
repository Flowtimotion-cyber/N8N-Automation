-- Team-Portal: Social-Media-Plan wird zur Veröffentlichungs-Queue (27.10.2026)
-- Einmal im Supabase-SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
--
-- Ablauf: Claude (oder ein Mensch) legt Beiträge an und setzt sie höchstens auf „Zur Freigabe“.
-- Ein Mensch prüft im Portal und setzt „Geplant“ – erst dann trägt das Portal freigegeben_von/_am ein.
-- Der n8n-Workflow „SOCIAL: Veröffentlicher“ holt alle 15 Minuten über social_faellig() die freigegebenen,
-- fälligen Beiträge, postet sie und schreibt Permalink und Status „Veröffentlicht“ zurück.
-- Schlägt etwas fehl, zählt social_fehler() die Versuche hoch; nach 3 Fehlversuchen geht der Beitrag
-- zurück auf „Zur Freigabe“, damit ein Mensch draufschaut.

alter table team_social add column if not exists uhrzeit           text;          -- HH:MM, Europe/Berlin; leer = 09:00
alter table team_social add column if not exists format            text;          -- Bild | Karussell | Reel | Text
alter table team_social add column if not exists medien            text;          -- öffentliche URLs, eine pro Zeile (Karussell: 2–10)
alter table team_social add column if not exists hook              text;          -- erste Zeile / erste Sekunde, intern
alter table team_social add column if not exists hashtags          text;
alter table team_social add column if not exists quelle            text;          -- Inspiration, z. B. Link zum Vorbild-Post
alter table team_social add column if not exists freigegeben_von   text;
alter table team_social add column if not exists freigegeben_am    timestamptz;
alter table team_social add column if not exists in_arbeit_seit    timestamptz;   -- Sperre, solange n8n postet
alter table team_social add column if not exists versuche          integer default 0;
alter table team_social add column if not exists fehler            text;
alter table team_social add column if not exists plattform_id      text;          -- Media-ID von Instagram / URN von LinkedIn
alter table team_social add column if not exists permalink         text;
alter table team_social add column if not exists veroeffentlicht_am timestamptz;

create index if not exists team_social_faellig on team_social (status, datum);

-- Fällige Beiträge holen und im selben Schritt sperren (kein Doppelposten, auch wenn zwei Läufe überlappen).
-- Nur Kanäle, die n8n bedienen kann, nur mit Freigabe durch einen Menschen, nur ohne Plattform-ID.
create or replace function social_faellig(p_kanaele text[] default array['Instagram']) returns setof team_social
language plpgsql security definer set search_path = public as $$
begin
  return query
  update team_social s set in_arbeit_seit = now()
  where s.post_id in (
    select x.post_id from team_social x
    where x.status = 'Geplant'
      and x.kanal = any(p_kanaele)
      and x.freigegeben_von is not null
      and coalesce(x.plattform_id, '') = ''
      and coalesce(x.versuche, 0) < 3
      and x.datum ~ '^\d{4}-\d{2}-\d{2}$'
      and (x.datum || ' ' || coalesce(nullif(x.uhrzeit, ''), '09:00'))::timestamp at time zone 'Europe/Berlin' <= now()
      and (x.in_arbeit_seit is null or x.in_arbeit_seit < now() - interval '30 minutes')
    order by x.datum, x.uhrzeit
    limit 5
    for update skip locked
  )
  returning s.*;
end;
$$;

-- Erfolg zurückschreiben
create or replace function social_erledigt(p_id text, p_plattform_id text, p_permalink text) returns void
language sql security definer set search_path = public as $$
  update team_social set status = 'Veröffentlicht', plattform_id = p_plattform_id, permalink = p_permalink,
    link = coalesce(nullif(p_permalink, ''), link), veroeffentlicht_am = now(), in_arbeit_seit = null,
    fehler = null, geaendert = now()
  where post_id = p_id;
$$;

-- Fehler zurückschreiben; nach 3 Versuchen zurück zur Freigabe
create or replace function social_fehler(p_id text, p_fehler text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update team_social set versuche = coalesce(versuche, 0) + 1, fehler = left(p_fehler, 1500), in_arbeit_seit = null,
    status = case when coalesce(versuche, 0) + 1 >= 3 then 'Zur Freigabe' else status end,
    freigegeben_von = case when coalesce(versuche, 0) + 1 >= 3 then null else freigegeben_von end,
    freigegeben_am  = case when coalesce(versuche, 0) + 1 >= 3 then null else freigegeben_am end,
    geaendert = now()
  where post_id = p_id returning versuche into v;
  return jsonb_build_object('post_id', p_id, 'versuche', v, 'zurueck_zur_freigabe', coalesce(v, 0) >= 3);
end;
$$;

revoke all on function social_faellig(text[])            from public, anon, authenticated;
revoke all on function social_erledigt(text, text, text) from public, anon, authenticated;
revoke all on function social_fehler(text, text)         from public, anon, authenticated;
grant execute on function social_faellig(text[])            to service_role;
grant execute on function social_erledigt(text, text, text) to service_role;
grant execute on function social_fehler(text, text)         to service_role;

-- Kontrolle: die neuen Spalten
select column_name from information_schema.columns where table_name = 'team_social' order by ordinal_position;
