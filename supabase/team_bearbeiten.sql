-- Momentum Team-Portal: gesendete Nachrichten nachträglich bearbeiten (Posteingang und Team-Chat)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Voraussetzung: supabase/team_nachrichten.sql und supabase/team_chat.sql sind schon eingespielt.
-- Rückwärtsverträglich: Es kommen nur Spalten (leer erlaubt), eine Tabelle und Funktionen dazu. team_chat_verlauf behält seine
-- Aufrufform und liefert nur ein Feld mehr. Alte Portal-Fassung, Team-App und n8n laufen ohne Änderung weiter.
--
-- Regeln (Timos Entscheidungen vom 23.11.2026):
--   * Bearbeiten darf nur, wer die Nachricht geschrieben hat, und nur bis 24 Stunden nach dem Senden.
--   * Die anderen sehen „bearbeitet“ mit Zeitpunkt. Die alte Fassung bleibt in team_nachricht_fassungen gespeichert (im Portal nicht sichtbar).
--   * Kommt im Chat beim Bearbeiten eine @-Markierung dazu, bekommt nur die neu markierte Person einen Hinweis im Posteingang.
--     Wer schon einmal markiert war (auch in einer früheren Fassung), bekommt nichts. Beim Bearbeiten nie eine WhatsApp.
--   * Nachrichten des Portals selbst (ohne Absender) und Chat-Hinweise kann niemand bearbeiten.

-- 1) Zeitpunkt der letzten Bearbeitung (null = nie bearbeitet)
alter table team_msgs             add column if not exists bearbeitet timestamptz;
alter table team_chat_nachrichten add column if not exists bearbeitet timestamptz;

-- 2) Alte Fassungen: eine Zeile je Bearbeitung, mit dem Text VOR der Änderung (gemeinsam für Posteingang und Chat)
create table if not exists team_nachricht_fassungen (
	fassung_id   bigint generated always as identity primary key,
	quelle       text not null check (quelle in ('posteingang', 'chat')),
	nachricht    text not null,                         -- team_msgs.msg_id bzw. team_chat_nachrichten.nachricht_id (als Text)
	autor        text not null,                         -- mitglied_id des Bearbeitenden (= Absender)
	text         text not null,                         -- alter Text
	erwaehnt     text[] not null default '{}',          -- Chat: damals markierte Mitglieder (damit niemand zweimal benachrichtigt wird)
	gueltig_bis  timestamptz not null default now()     -- Zeitpunkt, an dem diese Fassung ersetzt wurde
);
create index if not exists team_nachricht_fassungen_wo on team_nachricht_fassungen (quelle, nachricht, fassung_id);
alter table team_nachricht_fassungen enable row level security;

-- 3) Posteingang: eigene gesendete Nachrichten (neueste zuerst), damit man sie wiederfindet und bearbeiten kann
create or replace function team_msgs_gesendet(p_mitglied text, p_max int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
	select jsonb_build_object('nachrichten', coalesce((
		select jsonb_agg(to_jsonb(m) order by m.gesendet desc) from (
			select * from team_msgs where absender = p_mitglied
			order by gesendet desc limit greatest(1, least(coalesce(p_max, 100), 300))) m), '[]'));
$$;

-- 4) Posteingang: Nachricht bearbeiten (nur Absender, nur 24 Stunden). Empfänger und Lesestand bleiben.
create or replace function team_msgs_bearbeiten(p_mitglied text, p_msg_id text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v team_msgs;
begin
	select * into v from team_msgs where msg_id = p_msg_id for update;
	if v.msg_id is null then raise exception 'Diese Nachricht gibt es nicht (mehr).'; end if;
	if v.absender is distinct from p_mitglied then raise exception 'Bearbeiten kann nur, wer die Nachricht geschrieben hat.'; end if;
	if v.gesendet < now() - interval '24 hours' then raise exception 'Nachrichten kann man nur bis 24 Stunden nach dem Senden bearbeiten.'; end if;
	if coalesce(trim(p_text), '') = '' then raise exception 'Die Nachricht ist leer.'; end if;
	if length(p_text) > 20000 then raise exception 'Die Nachricht ist zu lang (höchstens 20000 Zeichen).'; end if;
	if p_text = v.text then return jsonb_build_object('nachricht', to_jsonb(v), 'unveraendert', true); end if;
	insert into team_nachricht_fassungen (quelle, nachricht, autor, text) values ('posteingang', v.msg_id, p_mitglied, v.text);
	update team_msgs set text = p_text, bearbeitet = now() where msg_id = v.msg_id returning * into v;
	return jsonb_build_object('nachricht', to_jsonb(v));
end;
$$;

-- 5) Chat: Nachricht bearbeiten (nur Autor, nur 24 Stunden, nur solange man im Chat ist).
--    p_erwaehnt = Markierungen im neuen Text (wie beim Senden). Neu Markierte bekommen einen Hinweis im Posteingang.
create or replace function team_chat_bearbeiten(p_mitglied text, p_chat text, p_nachricht_id bigint, p_text text, p_erwaehnt text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	c team_chats; v team_chat_nachrichten; v_text text := coalesce(p_text, ''); v_erw text[]; v_schon text[]; v_neu text[]; v_ort text;
begin
	c := team_chat_pruefen(p_chat, p_mitglied);
	select * into v from team_chat_nachrichten where nachricht_id = p_nachricht_id and chat_id = p_chat for update;
	if v.nachricht_id is null then raise exception 'Diese Nachricht gibt es nicht (mehr).'; end if;
	if v.autor is distinct from p_mitglied then raise exception 'Bearbeiten kann nur, wer die Nachricht geschrieben hat.'; end if;
	if v.erstellt < now() - interval '24 hours' then raise exception 'Nachrichten kann man nur bis 24 Stunden nach dem Senden bearbeiten.'; end if;
	if trim(v_text) = '' then raise exception 'Die Nachricht ist leer.'; end if;
	if length(v_text) > 8000 then raise exception 'Die Nachricht ist zu lang (höchstens 8000 Zeichen).'; end if;
	select coalesce(array_agg(distinct e), '{}') into v_erw from unnest(coalesce(p_erwaehnt, '{}')) e
		where e <> p_mitglied and exists (select 1 from team_chat_mitglieder m where m.chat_id = p_chat and m.mitglied_id = e);
	if v_text = v.text and v_erw <@ v.erwaehnt and v.erwaehnt <@ v_erw then
		return jsonb_build_object('nachricht', to_jsonb(v), 'unveraendert', true, 'chat', team_chat_json(p_chat, p_mitglied));
	end if;
	-- Wer schon benachrichtigt wurde: jetzt markiert oder in einer früheren Fassung markiert
	select coalesce(array_agg(distinct x), '{}') into v_schon from (
		select unnest(v.erwaehnt) x
		union select unnest(f.erwaehnt) from team_nachricht_fassungen f where f.quelle = 'chat' and f.nachricht = v.nachricht_id::text) s;
	select coalesce(array_agg(e), '{}') into v_neu from unnest(v_erw) e where not (e = any (v_schon));
	insert into team_nachricht_fassungen (quelle, nachricht, autor, text, erwaehnt) values ('chat', v.nachricht_id::text, p_mitglied, v.text, v.erwaehnt);
	update team_chat_nachrichten set text = v_text, erwaehnt = v_erw, bearbeitet = now() where nachricht_id = v.nachricht_id returning * into v;
	v_ort := case when c.art = 'direkt' then 'im Direktchat' else 'im Chat „' || c.titel || '“' end;
	if cardinality(v_neu) > 0 and to_regprocedure('team_msgs_senden(text,text[],text)') is not null then
		perform team_msgs_senden(p_mitglied, v_neu, '**' || team_chat_name(p_mitglied) || '** hat dich [' || v_ort || '](#/chat/' || p_chat || ') erwähnt (in einer bearbeiteten Nachricht):' || chr(10) || chr(10) || '> ' || replace(left(v_text, 300), chr(10), chr(10) || '> '));
	end if;
	return jsonb_build_object('nachricht', to_jsonb(v), 'benachrichtigt', to_jsonb(v_neu), 'chat', team_chat_json(p_chat, p_mitglied));
end;
$$;

-- 6) Chat-Verlauf wie bisher, zusätzlich „bearbeitete“: Nachrichten dieses Chats, die in den letzten zwei Tagen bearbeitet wurden.
--    Damit sehen alle eine Änderung beim nächsten Nachladen, auch wenn das Portal nur Neues holt (p_nach > 0).
--    Aufrufform und alle bisherigen Felder bleiben gleich.
create or replace function team_chat_verlauf(p_mitglied text, p_chat text, p_nach bigint default 0, p_max int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_neu jsonb; v_max bigint; v_bearb jsonb := '[]';
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	select coalesce(jsonb_agg(to_jsonb(n) order by n.nachricht_id), '[]'), max(n.nachricht_id) into v_neu, v_max from (
		select * from team_chat_nachrichten where chat_id = p_chat and nachricht_id > coalesce(p_nach, 0)
		order by nachricht_id desc limit greatest(1, least(coalesce(p_max, 200), 500))) n;
	if v_max is not null then
		update team_chat_mitglieder set gelesen_bis = greatest(gelesen_bis, v_max) where chat_id = p_chat and mitglied_id = p_mitglied;
	end if;
	if coalesce(p_nach, 0) > 0 then
		select coalesce(jsonb_agg(to_jsonb(n) order by n.nachricht_id), '[]') into v_bearb from team_chat_nachrichten n
			where n.chat_id = p_chat and n.nachricht_id <= p_nach and n.bearbeitet > now() - interval '2 days';
	end if;
	return jsonb_build_object('chat', team_chat_json(p_chat, p_mitglied), 'nachrichten', v_neu, 'bearbeitete', v_bearb);
end;
$$;

revoke all on function team_msgs_gesendet(text, int)                               from public, anon, authenticated;
revoke all on function team_msgs_bearbeiten(text, text, text)                      from public, anon, authenticated;
revoke all on function team_chat_bearbeiten(text, text, bigint, text, text[])      from public, anon, authenticated;
revoke all on function team_chat_verlauf(text, text, bigint, int)                  from public, anon, authenticated;
grant execute on function team_msgs_gesendet(text, int)                            to service_role;
grant execute on function team_msgs_bearbeiten(text, text, text)                   to service_role;
grant execute on function team_chat_bearbeiten(text, text, bigint, text, text[])   to service_role;
grant execute on function team_chat_verlauf(text, text, bigint, int)               to service_role;
notify pgrst, 'reload schema';

-- Kontrolle: sollte bearbeitet zweimal zeigen (team_chat_nachrichten, team_msgs) und die Tabelle team_nachricht_fassungen
select table_name, column_name from information_schema.columns
	where table_schema = 'public' and ((column_name = 'bearbeitet' and table_name in ('team_msgs', 'team_chat_nachrichten')) or (table_name = 'team_nachricht_fassungen' and column_name = 'fassung_id'))
	order by 1;
