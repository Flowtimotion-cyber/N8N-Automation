-- Momentum Team-Portal: Team-Chat – Bilder, PDFs und andere Dateien anhängen (Stufe 1, nur Team-Chat)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden. Läuft als ein Vorgang (begin … commit).
-- Voraussetzung: supabase/team_chat.sql, team_bearbeiten.sql und team_chat_reaktionen.sql sind schon eingespielt.
-- Rückwärtsverträglich: Es kommen eine Tabelle, eine Spalte (leer erlaubt), ein privater Bucket und neue Funktionen dazu.
-- Bestehende Funktionen bleiben unverändert; der laufende Workflow „TEAM: Chat (Portal)“ merkt nichts davon.
-- Zugriff nur über den Server (neuer n8n-Workflow „TEAM: Anhänge (Portal)“, Webhook team-anhang, service_role).
-- Browser und Agenten bekommen keinen Supabase-Schlüssel und keine Dauer-Links.
--
-- Regeln (Timos Entscheidungen vom 24./25.11.2026):
--   * Erlaubt: Bilder (jpg, png, webp, gif, heic), PDF, Word, Excel, PowerPoint (auch OpenDocument), txt, csv, Audio. Bis 25 MB je Datei,
--     höchstens 10 Dateien je Nachricht. Keine Videos, kein HTML/SVG, keine Programme.
--   * Speicher: privater Bucket „team-anhaenge“. Lesen nur mit kurzlebigen signierten Links (60 Minuten), nur für Mitglieder des Chats.
--   * Entfernen: nur wer die Datei geschickt hat. Sie ist dann für alle weg und 30 Tage wiederherstellbar, danach löscht
--     der tägliche Aufräumlauf die Datei endgültig. Abgebrochene Uploads (nie gesendet) löscht er nach einem Tag.
--   * Agenten und KI bekommen keine Anhänge (Agenten sind ohnehin nicht in Chats).

begin;

-- 1) Privater Bucket: Größengrenze und erlaubte Typen prüft Supabase selbst beim Hochladen. Keine Policies: nur service_role
--    und signierte Adressen. Bei Wiederholung werden Grenze und Typenliste auf diesen Stand gebracht (öffentlich bleibt aus).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-anhaenge', 'team-anhaenge', false, 26214400, array[
	'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
	'application/pdf',
	'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
	'text/plain', 'text/csv',
	'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) Ein Eintrag je Datei
create table if not exists team_anhaenge (
	anhang_id    text primary key default ('an_' || replace(gen_random_uuid()::text, '-', '')),
	chat_id      text not null references team_chats (chat_id) on delete cascade,
	nachricht_id bigint references team_chat_nachrichten (nachricht_id) on delete set null,   -- gesetzt beim Senden
	pfad         text not null unique,                    -- im Bucket team-anhaenge: chat/<chat_id>/<anhang_id>/<name>
	name         text not null,                           -- Dateiname wie hochgeladen (für Anzeige und Download)
	mime         text not null,
	groesse      bigint not null default 0,               -- Bytes (nach dem Hochladen aus dem Speicher übernommen)
	breite       int,                                     -- Bilder: Maße nach dem Verkleinern im Browser
	hoehe        int,
	von          text not null,                           -- mitglied_id
	status       text not null default 'hochladen' check (status in ('hochladen', 'bereit', 'entfernt', 'geloescht')),
	erstellt     timestamptz not null default now(),
	entfernt_am  timestamptz,
	geloescht_am timestamptz
);
create index if not exists team_anhaenge_chat on team_anhaenge (chat_id, nachricht_id);
create index if not exists team_anhaenge_offen on team_anhaenge (status, erstellt) where status in ('hochladen', 'entfernt');
alter table team_anhaenge enable row level security;

-- 3) Kurzfassung an der Nachricht (kommt über team_chat_nachricht_json automatisch in Verlauf und Senden mit)
alter table team_chat_nachrichten add column if not exists anhaenge jsonb not null default '[]'::jsonb;

-- Erlaubte Typen (gleiche Liste wie der Bucket und chat/lib/anhaenge.js)
create or replace function team_anhang_mime_ok(p_mime text) returns boolean
language sql immutable as $$
	select coalesce(p_mime, '') = any (array[
		'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf',
		'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
		'text/plain', 'text/csv', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac']);
$$;

-- Ein Anhang so, wie er an der Nachricht steht (ohne Pfad: den kennt nur der Server)
create or replace function team_anhang_kurz(a team_anhaenge) returns jsonb
language sql stable as $$
	select jsonb_build_object('anhang_id', a.anhang_id, 'name', a.name, 'mime', a.mime, 'groesse', a.groesse, 'breite', a.breite, 'hoehe', a.hoehe,
		'von', a.von, 'entfernt', a.status <> 'bereit', 'entfernt_am', a.entfernt_am, 'endgueltig', a.status = 'geloescht');
$$;

-- Die Kurzfassung an einer Nachricht neu schreiben (Reihenfolge wie beim Senden)
create or replace function team_anhang_an_nachricht(p_nachricht bigint) returns void
language sql security definer set search_path = public as $$
	update team_chat_nachrichten n set anhaenge = coalesce((
		select jsonb_agg(team_anhang_kurz(a) order by a.erstellt, a.anhang_id) from team_anhaenge a where a.nachricht_id = p_nachricht), '[]'::jsonb)
	where n.nachricht_id = p_nachricht;
$$;

-- 4) Vorbereiten: Eintrag anlegen, Pfad vergeben. Danach holt n8n die signierte Upload-Adresse für genau diesen Pfad.
create or replace function team_anhang_vorbereiten(p_mitglied text, p_chat text, p_name text, p_mime text, p_groesse bigint, p_breite int default null, p_hoehe int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(coalesce(p_name, '')), 180); v_sicher text; v_id text; v_pfad text;
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	if v_name = '' then raise exception 'Die Datei hat keinen Namen.'; end if;
	if not team_anhang_mime_ok(p_mime) then raise exception 'Diese Dateiart geht hier nicht. Erlaubt sind Bilder, PDF, Office-Dateien, txt, csv und Audio.'; end if;
	if coalesce(p_groesse, 0) < 1 then raise exception 'Die Datei ist leer.'; end if;
	if p_groesse > 26214400 then raise exception 'Die Datei ist zu groß (höchstens 25 MB).'; end if;
	if (select count(*) from team_anhaenge where von = p_mitglied and status = 'hochladen' and erstellt > now() - interval '1 hour') >= 40 then
		raise exception 'Zu viele offene Uploads. Bitte erst senden oder kurz warten.';
	end if;
	v_id := 'an_' || replace(gen_random_uuid()::text, '-', '');
	-- Pfad nur aus sicheren Zeichen (der echte Name bleibt in der Spalte name)
	v_sicher := left(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9._-]+', '_', 'g'), '^[._]+', ''), 100);
	if v_sicher = '' then v_sicher := 'datei'; end if;
	v_pfad := 'chat/' || p_chat || '/' || v_id || '/' || v_sicher;
	insert into team_anhaenge (anhang_id, chat_id, pfad, name, mime, groesse, breite, hoehe, von)
		values (v_id, p_chat, v_pfad, v_name, p_mime, p_groesse,
			case when p_breite between 1 and 20000 then p_breite end, case when p_hoehe between 1 and 20000 then p_hoehe end, p_mitglied);
	return jsonb_build_object('anhang_id', v_id, 'pfad', v_pfad, 'mime', p_mime);
end;
$$;

-- 5) Senden: Nachricht mit Anhängen. Ruft team_chat_senden auf (@-Markierung, Posteingang, WhatsApp-Haken, Antwort wie gewohnt).
--    Ohne Text steht „📎 Dateiname“ als Text da (so zeigen ihn auch Chat-Liste, Posteingang und die Team-App).
create or replace function team_anhang_senden(p_mitglied text, p_chat text, p_text text, p_anhaenge text[], p_erwaehnt text[] default '{}', p_whatsapp text[] default '{}', p_antwort_auf bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids text[]; v_n int; v_fehlt int; v_text text := coalesce(p_text, ''); v_r jsonb; v_nr bigint; v_msg team_chat_nachrichten;
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	select coalesce(array_agg(distinct e), '{}') into v_ids from unnest(coalesce(p_anhaenge, '{}')) e where coalesce(e, '') <> '';
	if cardinality(v_ids) = 0 then raise exception 'Es ist keine Datei angehängt.'; end if;
	if cardinality(v_ids) > 10 then raise exception 'Höchstens 10 Dateien je Nachricht.'; end if;
	select count(*) into v_n from (select 1 from team_anhaenge
		where anhang_id = any (v_ids) and chat_id = p_chat and von = p_mitglied and status = 'hochladen' and nachricht_id is null for update) x;
	if v_n <> cardinality(v_ids) then raise exception 'Eine Datei fehlt oder wurde schon gesendet. Bitte noch einmal anhängen.'; end if;
	-- Liegt die Datei wirklich im Speicher? (In Supabase gibt es storage.objects; dort steht auch die echte Größe.)
	if to_regclass('storage.objects') is not null then
		execute 'select count(*) from team_anhaenge a where a.anhang_id = any ($1) and not exists (select 1 from storage.objects o where o.bucket_id = ''team-anhaenge'' and o.name = a.pfad)'
			into v_fehlt using v_ids;
		if v_fehlt > 0 then raise exception 'Eine Datei ist noch nicht fertig hochgeladen. Bitte warte kurz und sende noch einmal.'; end if;
		execute 'update team_anhaenge a set groesse = coalesce(nullif(o.metadata ->> ''size'', '''')::bigint, a.groesse) from storage.objects o where o.bucket_id = ''team-anhaenge'' and o.name = a.pfad and a.anhang_id = any ($1)'
			using v_ids;
	end if;
	if trim(v_text) = '' then
		select '📎 ' || string_agg(name, ', ' order by erstellt, anhang_id) into v_text from team_anhaenge where anhang_id = any (v_ids);
		v_text := left(v_text, 8000);
	end if;
	v_r := team_chat_senden(p_mitglied, p_chat, v_text, p_erwaehnt, p_whatsapp, p_antwort_auf);
	v_nr := (v_r -> 'nachricht' ->> 'nachricht_id')::bigint;
	update team_anhaenge set nachricht_id = v_nr, status = 'bereit' where anhang_id = any (v_ids);
	perform team_anhang_an_nachricht(v_nr);
	select * into v_msg from team_chat_nachrichten where nachricht_id = v_nr;
	return jsonb_build_object('nachricht', team_chat_nachricht_json(v_msg), 'chat', v_r -> 'chat');
end;
$$;

-- 6) Links: Pfade der gewünschten Anhänge, nur für Mitglieder dieses Chats und nur gesendete, nicht entfernte.
--    n8n signiert daraus Lese-Links (60 Minuten). Höchstens 60 auf einmal.
create or replace function team_anhang_links(p_mitglied text, p_chat text, p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	return jsonb_build_object('anhaenge', coalesce((
		select jsonb_agg(jsonb_build_object('anhang_id', a.anhang_id, 'pfad', a.pfad, 'name', a.name, 'mime', a.mime) order by a.erstellt)
		from (select * from team_anhaenge where chat_id = p_chat and status = 'bereit' and nachricht_id is not null
			and anhang_id = any (coalesce(p_ids, '{}')) order by erstellt limit 60) a), '[]'::jsonb));
end;
$$;

-- 7) Entfernen und Wiederherstellen: nur wer die Datei geschickt hat. Wiederherstellen geht 30 Tage lang.
create or replace function team_anhang_entfernen(p_mitglied text, p_chat text, p_anhang_id text, p_zurueck boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v team_anhaenge; v_msg team_chat_nachrichten;
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	select * into v from team_anhaenge where anhang_id = p_anhang_id and chat_id = p_chat and nachricht_id is not null for update;
	if v.anhang_id is null then raise exception 'Diese Datei gibt es nicht.'; end if;
	if v.von <> p_mitglied then raise exception 'Nur wer die Datei geschickt hat, kann sie entfernen.'; end if;
	if coalesce(p_zurueck, false) then
		if v.status <> 'entfernt' or v.entfernt_am < now() - interval '30 days' then raise exception 'Diese Datei lässt sich nicht mehr wiederherstellen.'; end if;
		update team_anhaenge set status = 'bereit', entfernt_am = null where anhang_id = v.anhang_id;
	else
		if v.status <> 'bereit' then raise exception 'Diese Datei ist schon entfernt.'; end if;
		update team_anhaenge set status = 'entfernt', entfernt_am = now() where anhang_id = v.anhang_id;
	end if;
	perform team_anhang_an_nachricht(v.nachricht_id);
	-- Damit alle die Änderung beim nächsten Nachladen sehen (Verlauf liefert Nachrichten mit frischer reaktion_am unter „bearbeitete“)
	update team_chat_nachrichten set reaktion_am = now() where nachricht_id = v.nachricht_id returning * into v_msg;
	return jsonb_build_object('nachricht', team_chat_nachricht_json(v_msg));
end;
$$;

-- 8) Aufräumen (täglicher Lauf in n8n): Liste holen, Dateien im Speicher löschen, dann als gelöscht melden.
create or replace function team_anhang_aufraeumen_liste() returns jsonb
language sql stable security definer set search_path = public as $$
	select jsonb_build_object('anhaenge', coalesce(jsonb_agg(jsonb_build_object('anhang_id', x.anhang_id, 'pfad', x.pfad)), '[]'::jsonb)) from (
		select anhang_id, pfad from team_anhaenge
		where (status = 'entfernt' and entfernt_am < now() - interval '30 days')
		   or (status = 'hochladen' and nachricht_id is null and erstellt < now() - interval '1 day')
		order by erstellt limit 200) x;
$$;

create or replace function team_anhang_aufraeumen_fertig(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int; v_nr bigint;
begin
	update team_anhaenge set status = 'geloescht', geloescht_am = now()
		where anhang_id = any (coalesce(p_ids, '{}')) and status in ('entfernt', 'hochladen');
	get diagnostics v_n = row_count;
	for v_nr in select distinct nachricht_id from team_anhaenge where anhang_id = any (coalesce(p_ids, '{}')) and nachricht_id is not null loop
		perform team_anhang_an_nachricht(v_nr);
	end loop;
	return jsonb_build_object('geloescht', v_n);
end;
$$;

-- 9) Rechte: nur der Server
revoke all on table team_anhaenge from anon, authenticated;
revoke all on function team_anhang_mime_ok(text)                                                       from public, anon, authenticated;
revoke all on function team_anhang_kurz(team_anhaenge)                                                 from public, anon, authenticated;
revoke all on function team_anhang_an_nachricht(bigint)                                                from public, anon, authenticated;
revoke all on function team_anhang_vorbereiten(text, text, text, text, bigint, int, int)              from public, anon, authenticated;
revoke all on function team_anhang_senden(text, text, text, text[], text[], text[], bigint)           from public, anon, authenticated;
revoke all on function team_anhang_links(text, text, text[])                                          from public, anon, authenticated;
revoke all on function team_anhang_entfernen(text, text, text, boolean)                               from public, anon, authenticated;
revoke all on function team_anhang_aufraeumen_liste()                                                 from public, anon, authenticated;
revoke all on function team_anhang_aufraeumen_fertig(text[])                                          from public, anon, authenticated;
grant execute on function team_anhang_vorbereiten(text, text, text, text, bigint, int, int)           to service_role;
grant execute on function team_anhang_senden(text, text, text, text[], text[], text[], bigint)        to service_role;
grant execute on function team_anhang_links(text, text, text[])                                       to service_role;
grant execute on function team_anhang_entfernen(text, text, text, boolean)                            to service_role;
grant execute on function team_anhang_aufraeumen_liste()                                              to service_role;
grant execute on function team_anhang_aufraeumen_fertig(text[])                                       to service_role;

comment on table team_anhaenge is 'Dateien im Team-Chat (Bucket team-anhaenge, privat). Lesen nur über signierte Links aus n8n „TEAM: Anhänge (Portal)“, nur für Chat-Mitglieder.';

commit;
notify pgrst, 'reload schema';

-- Kontrolle: sollte eine Zeile „team-anhaenge | false | 26214400“ zeigen
select id, public, file_size_limit from storage.buckets where id = 'team-anhaenge';
