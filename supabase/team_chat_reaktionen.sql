-- Momentum Team-Portal: Team-Chat – auf eine Nachricht antworten (Zitat) und mit Smileys reagieren
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden. Läuft als ein Vorgang (begin … commit).
-- Voraussetzung: supabase/team_chat.sql und supabase/team_bearbeiten.sql sind schon eingespielt.
-- Rückwärtsverträglich: Es kommen nur Spalten (leer erlaubt) und eine Funktion dazu. team_chat_senden bekommt einen zusätzlichen,
-- freiwilligen Wert p_antwort_auf; der laufende n8n-Workflow ruft wie bisher ohne ihn auf. team_chat_verlauf behält seine Aufrufform.
--
-- Regeln (Timos Entscheidungen vom 24.11.2026):
--   * Reaktionen: sechs feste Smileys 👍 ❤️ 😂 😮 🙏 ✅. Jede Person kann mehrere setzen; nochmal klicken nimmt den Smiley weg.
--     Gespeichert direkt an der Nachricht: reaktionen = { "👍": ["m_kurt", "m_timo"], … }. Keine Benachrichtigung.
--   * Antworten: Eine Nachricht kann auf eine andere Nachricht desselben Chats verweisen (antwort_auf). Keine Benachrichtigung
--     (Hinweis im Posteingang nur bei @-Markierung wie bisher).

begin;

-- 1) Spalten
alter table team_chat_nachrichten add column if not exists antwort_auf bigint references team_chat_nachrichten (nachricht_id) on delete set null;
alter table team_chat_nachrichten add column if not exists reaktionen  jsonb not null default '{}'::jsonb;
alter table team_chat_nachrichten add column if not exists reaktion_am timestamptz;

-- 2) Eine Nachricht als JSON, mit kurzem Zitat der Nachricht, auf die sie antwortet
create or replace function team_chat_nachricht_json(p_n team_chat_nachrichten) returns jsonb
language sql stable security definer set search_path = public as $$
	select to_jsonb(p_n) || jsonb_build_object('zitat', (
		select jsonb_build_object('nachricht_id', z.nachricht_id, 'autor', z.autor, 'text', left(z.text, 160))
		from team_chat_nachrichten z where z.nachricht_id = p_n.antwort_auf and z.chat_id = p_n.chat_id));
$$;

-- 3) Reagieren: Smiley setzen oder wegnehmen (nur Chat-Mitglieder, nur auf Nachrichten von Menschen, nicht auf Hinweise)
create or replace function team_chat_reagieren(p_mitglied text, p_chat text, p_nachricht_id bigint, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v team_chat_nachrichten; v_liste jsonb; v_neu jsonb;
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '😮', '🙏', '✅') then raise exception 'Diesen Smiley gibt es hier nicht.'; end if;
	select * into v from team_chat_nachrichten where nachricht_id = p_nachricht_id and chat_id = p_chat for update;
	if v.nachricht_id is null or v.autor is null then raise exception 'Auf diese Nachricht kann man nicht reagieren.'; end if;
	v_liste := coalesce(v.reaktionen -> p_emoji, '[]'::jsonb);
	if v_liste ? p_mitglied then
		select coalesce(jsonb_agg(x), '[]'::jsonb) into v_liste from jsonb_array_elements_text(v_liste) x where x <> p_mitglied;
	else
		v_liste := v_liste || to_jsonb(p_mitglied);
	end if;
	v_neu := case when jsonb_array_length(v_liste) = 0 then v.reaktionen - p_emoji else jsonb_set(v.reaktionen, array[p_emoji], v_liste) end;
	update team_chat_nachrichten set reaktionen = v_neu, reaktion_am = now() where nachricht_id = v.nachricht_id returning * into v;
	return jsonb_build_object('nachricht', team_chat_nachricht_json(v));
end;
$$;

-- 4) Senden wie bisher, dazu freiwillig p_antwort_auf (nur eine Nachricht desselben Chats, sonst ohne Verweis)
drop function if exists team_chat_senden(text, text, text, text[], text[]);
create or replace function team_chat_senden(p_mitglied text, p_chat text, p_text text, p_erwaehnt text[] default '{}', p_whatsapp text[] default '{}', p_antwort_auf bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v team_chats; v_text text := coalesce(p_text, ''); v_erw text[]; v_wa text[]; v_n team_chat_nachrichten; v_ort text; v_antw bigint;
begin
	v := team_chat_pruefen(p_chat, p_mitglied);
	if trim(v_text) = '' then raise exception 'Die Nachricht ist leer.'; end if;
	if length(v_text) > 8000 then raise exception 'Die Nachricht ist zu lang (höchstens 8000 Zeichen).'; end if;
	select coalesce(array_agg(distinct e), '{}') into v_erw from unnest(coalesce(p_erwaehnt, '{}')) e
		where e <> p_mitglied and exists (select 1 from team_chat_mitglieder m where m.chat_id = p_chat and m.mitglied_id = e);
	select coalesce(array_agg(distinct e), '{}') into v_wa from unnest(coalesce(p_whatsapp, '{}')) e where e = any (v_erw);
	select nachricht_id into v_antw from team_chat_nachrichten where nachricht_id = p_antwort_auf and chat_id = p_chat;
	insert into team_chat_nachrichten (chat_id, autor, text, erwaehnt, whatsapp, antwort_auf) values (p_chat, p_mitglied, v_text, v_erw, v_wa, v_antw) returning * into v_n;
	update team_chats set letzte = v_n.erstellt where chat_id = p_chat;
	update team_chat_mitglieder set gelesen_bis = greatest(gelesen_bis, v_n.nachricht_id) where chat_id = p_chat and mitglied_id = p_mitglied;
	v_ort := case when v.art = 'direkt' then 'im Direktchat' else 'im Chat „' || v.titel || '“' end;
	if cardinality(v_erw) > 0 and to_regprocedure('team_msgs_senden(text,text[],text)') is not null then
		perform team_msgs_senden(p_mitglied, v_erw, '**' || team_chat_name(p_mitglied) || '** hat dich [' || v_ort || '](#/chat/' || p_chat || ') erwähnt:' || chr(10) || chr(10) || '> ' || replace(left(v_text, 300), chr(10), chr(10) || '> '));
	end if;
	if cardinality(v_wa) > 0 and to_regclass('public.kom_benachrichtigungen') is not null then
		insert into kom_benachrichtigungen (art, mitglied_id, aufgabe_id, titel, von)
			select 'chat_erwaehnung', e, p_chat, left(case when v.art = 'direkt' then 'Direktchat' else v.titel end, 200), p_mitglied from unnest(v_wa) e;
	end if;
	return jsonb_build_object('nachricht', team_chat_nachricht_json(v_n), 'chat', team_chat_json(p_chat, p_mitglied));
end;
$$;

-- 5) Verlauf wie bisher (inkl. „bearbeitete“ aus team_bearbeiten.sql), jetzt mit Zitat je Nachricht und auch Nachrichten,
--    an denen sich in den letzten zwei Tagen die Reaktionen geändert haben. Aufrufform bleibt gleich.
create or replace function team_chat_verlauf(p_mitglied text, p_chat text, p_nach bigint default 0, p_max int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_neu jsonb; v_max bigint; v_bearb jsonb := '[]';
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	select coalesce(jsonb_agg(team_chat_nachricht_json(n) order by n.nachricht_id), '[]'), max(n.nachricht_id) into v_neu, v_max from (
		select * from team_chat_nachrichten where chat_id = p_chat and nachricht_id > coalesce(p_nach, 0)
		order by nachricht_id desc limit greatest(1, least(coalesce(p_max, 200), 500))) n;
	if v_max is not null then
		update team_chat_mitglieder set gelesen_bis = greatest(gelesen_bis, v_max) where chat_id = p_chat and mitglied_id = p_mitglied;
	end if;
	if coalesce(p_nach, 0) > 0 then
		select coalesce(jsonb_agg(team_chat_nachricht_json(n) order by n.nachricht_id), '[]') into v_bearb from team_chat_nachrichten n
			where n.chat_id = p_chat and n.nachricht_id <= p_nach and (n.bearbeitet > now() - interval '2 days' or n.reaktion_am > now() - interval '2 days');
	end if;
	return jsonb_build_object('chat', team_chat_json(p_chat, p_mitglied), 'nachrichten', v_neu, 'bearbeitete', v_bearb);
end;
$$;

revoke all on function team_chat_nachricht_json(team_chat_nachrichten)                  from public, anon, authenticated;
revoke all on function team_chat_reagieren(text, text, bigint, text)                     from public, anon, authenticated;
revoke all on function team_chat_senden(text, text, text, text[], text[], bigint)        from public, anon, authenticated;
revoke all on function team_chat_verlauf(text, text, bigint, int)                        from public, anon, authenticated;
grant execute on function team_chat_reagieren(text, text, bigint, text)                  to service_role;
grant execute on function team_chat_senden(text, text, text, text[], text[], bigint)     to service_role;
grant execute on function team_chat_verlauf(text, text, bigint, int)                     to service_role;

commit;
notify pgrst, 'reload schema';

-- Kontrolle: sollte antwort_auf, reaktion_am, reaktionen zeigen
select column_name from information_schema.columns
	where table_schema = 'public' and table_name = 'team_chat_nachrichten' and column_name in ('antwort_auf', 'reaktionen', 'reaktion_am')
	order by 1;
