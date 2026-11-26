-- Momentum Team-Portal: Team-Chat (Stufe 1: Gruppen-, Direkt- und Projekt-Chats, @-Markierung, WhatsApp auf Wunsch)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden. Ändert keine bestehende Tabelle.
-- Zugriff nur über den Server (n8n „TEAM: Chat (Portal)“, Webhook team-chat, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.
--
-- Regeln (Timos Entscheidungen vom 23.11.2026):
--   * Einen Chat sehen nur seine Mitglieder – auch Admins sehen fremde Chats nicht.
--   * Die KI liest einen Chat nur auf Zuruf (@Claude, Stufe 2). Pro Chat lässt sich einschalten, dass sie den ganzen Verlauf lesen darf
--     (ki_verlauf). Jede Änderung daran erscheint als Hinweis im Chat, sichtbar für alle Beteiligten.
--   * @-Markierte bekommen einen Hinweis im Posteingang (team_msgs, falls eingerichtet); eine WhatsApp nur, wenn der Absender den Haken setzt.

-- 1) Chats
create table if not exists team_chats (
	chat_id      text primary key default ('chat_' || replace(gen_random_uuid()::text, '-', '')),
	art          text not null default 'gruppe' check (art in ('gruppe', 'direkt', 'projekt')),
	titel        text not null default '',
	projekt      text,                                  -- Name aus team_projekte (wie team_aufgaben.projekt), optional
	ki_verlauf   boolean not null default false,        -- true: die KI darf den ganzen Verlauf lesen (sonst nur auf Zuruf)
	erstellt_von text,
	erstellt     timestamptz not null default now(),
	letzte       timestamptz not null default now()     -- Zeit der letzten Nachricht (Sortierung der Liste)
);

-- 2) Mitglieder je Chat mit Lesestand
create table if not exists team_chat_mitglieder (
	chat_id     text not null references team_chats (chat_id) on delete cascade,
	mitglied_id text not null,
	gelesen_bis bigint not null default 0,              -- höchste gelesene nachricht_id
	beigetreten timestamptz not null default now(),
	primary key (chat_id, mitglied_id)
);
create index if not exists team_chat_mitglieder_wer on team_chat_mitglieder (mitglied_id);

-- 3) Nachrichten
create table if not exists team_chat_nachrichten (
	nachricht_id bigint generated always as identity primary key,
	chat_id      text not null references team_chats (chat_id) on delete cascade,
	autor        text,                                  -- mitglied_id; null = Hinweis des Portals (z. B. „Kurt wurde hinzugefügt“)
	text         text not null default '',              -- Markdown wie bei Notizen und Aufgaben
	erwaehnt     text[] not null default '{}',          -- markierte Mitglieder (nur Chat-Mitglieder)
	whatsapp     text[] not null default '{}',          -- davon per WhatsApp benachrichtigt (Haken beim Senden)
	erstellt     timestamptz not null default now()
);
create index if not exists team_chat_nachrichten_chat on team_chat_nachrichten (chat_id, nachricht_id);

alter table team_chats            enable row level security;
alter table team_chat_mitglieder  enable row level security;
alter table team_chat_nachrichten enable row level security;

-- Hilfen ----------------------------------------------------------------------------------------------
create or replace function team_chat_name(p_id text) returns text
language sql stable security definer set search_path = public as $$
	select coalesce((select split_part(m.name, ' ', 1) from team_mitglieder m where m.mitglied_id = p_id), 'Jemand');
$$;

-- Ein Chat als JSON: Kopf, Mitglieder (IDs), Ungelesen und letzte Nachricht aus Sicht von p_mitglied
create or replace function team_chat_json(p_chat text, p_mitglied text) returns jsonb
language sql stable security definer set search_path = public as $$
	select jsonb_build_object(
		'chat_id', c.chat_id, 'art', c.art, 'titel', c.titel, 'projekt', c.projekt, 'ki_verlauf', c.ki_verlauf,
		'erstellt_von', c.erstellt_von, 'erstellt', c.erstellt, 'letzte', c.letzte,
		'mitglieder', coalesce((select jsonb_agg(x.mitglied_id order by x.beigetreten, x.mitglied_id) from team_chat_mitglieder x where x.chat_id = c.chat_id), '[]'),
		'ungelesen', (select count(*) from team_chat_nachrichten n where n.chat_id = c.chat_id and n.nachricht_id > coalesce(me.gelesen_bis, 0) and coalesce(n.autor, '') <> p_mitglied),
		'letzte_nachricht', (select jsonb_build_object('autor', n.autor, 'text', left(n.text, 160), 'erstellt', n.erstellt)
			from team_chat_nachrichten n where n.chat_id = c.chat_id order by n.nachricht_id desc limit 1))
	from team_chats c left join team_chat_mitglieder me on me.chat_id = c.chat_id and me.mitglied_id = p_mitglied
	where c.chat_id = p_chat;
$$;

create or replace function team_chat_pruefen(p_chat text, p_mitglied text) returns team_chats
language plpgsql stable security definer set search_path = public as $$
declare v team_chats;
begin
	select c.* into v from team_chats c join team_chat_mitglieder m on m.chat_id = c.chat_id and m.mitglied_id = p_mitglied where c.chat_id = p_chat;
	if v.chat_id is null then raise exception 'Diesen Chat gibt es nicht oder du bist nicht (mehr) dabei.'; end if;
	return v;
end;
$$;

create or replace function team_chat_hinweis(p_chat text, p_text text) returns void
language sql security definer set search_path = public as $$
	insert into team_chat_nachrichten (chat_id, autor, text) values (p_chat, null, p_text);
	update team_chats set letzte = now() where chat_id = p_chat;
$$;

-- Nur aktive Menschen dürfen in Chats (Agenten kommen in Stufe 2 auf Zuruf dazu, nicht als Mitglied)
create or replace function team_chat_personen(p_ids text[]) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v text[]; v_unbekannt text[];
begin
	select coalesce(array_agg(e order by o), '{}') into v from (
		select e, min(o) o from unnest(coalesce(p_ids, '{}')) with ordinality u(e, o) where coalesce(trim(e), '') <> '' group by e) x;
	select array_agg(e) into v_unbekannt from unnest(v) e
		where not exists (select 1 from team_mitglieder m where m.mitglied_id = e and m.status <> 'gesperrt' and coalesce(m.typ, 'mensch') <> 'agent');
	if v_unbekannt is not null then raise exception 'Diese Personen können nicht in einen Chat: %', array_to_string(v_unbekannt, ', '); end if;
	return v;
end;
$$;

-- 4) Liste: alle Chats, in denen p_mitglied ist (letzte Nachricht zuerst)
create or replace function team_chat_liste(p_mitglied text) returns jsonb
language sql stable security definer set search_path = public as $$
	select jsonb_build_object('chats', coalesce((
		select jsonb_agg(team_chat_json(c.chat_id, p_mitglied) order by c.letzte desc)
		from team_chats c join team_chat_mitglieder m on m.chat_id = c.chat_id and m.mitglied_id = p_mitglied), '[]'));
$$;

-- 5) Verlauf: Nachrichten nach p_nach (0 = die letzten p_max), markiert alles bis zur neuesten als gelesen
create or replace function team_chat_verlauf(p_mitglied text, p_chat text, p_nach bigint default 0, p_max int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_neu jsonb; v_max bigint;
begin
	perform team_chat_pruefen(p_chat, p_mitglied);
	select coalesce(jsonb_agg(to_jsonb(n) order by n.nachricht_id), '[]'), max(n.nachricht_id) into v_neu, v_max from (
		select * from team_chat_nachrichten where chat_id = p_chat and nachricht_id > coalesce(p_nach, 0)
		order by nachricht_id desc limit greatest(1, least(coalesce(p_max, 200), 500))) n;
	if v_max is not null then
		update team_chat_mitglieder set gelesen_bis = greatest(gelesen_bis, v_max) where chat_id = p_chat and mitglied_id = p_mitglied;
	end if;
	return jsonb_build_object('chat', team_chat_json(p_chat, p_mitglied), 'nachrichten', v_neu);
end;
$$;

-- 6) Anlegen. Direkt: genau zwei Personen, ein bestehender Direktchat der beiden wird wiederverwendet.
create or replace function team_chat_anlegen(p_mitglied text, p_art text, p_titel text, p_mitglieder text[], p_projekt text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_wer text[]; v_id text; v_titel text := trim(coalesce(p_titel, '')); v_proj text := nullif(trim(coalesce(p_projekt, '')), '');
begin
	if p_art not in ('gruppe', 'direkt', 'projekt') then raise exception 'Unbekannte Chat-Art.'; end if;
	v_wer := team_chat_personen(array_prepend(p_mitglied, coalesce(p_mitglieder, '{}')));
	if p_art = 'direkt' then
		if cardinality(v_wer) <> 2 then raise exception 'Ein Direktchat ist genau zwischen dir und einer weiteren Person.'; end if;
		select c.chat_id into v_id from team_chats c where c.art = 'direkt'
			and (select array_agg(m.mitglied_id order by m.mitglied_id) from team_chat_mitglieder m where m.chat_id = c.chat_id) = (select array_agg(x order by x) from unnest(v_wer) x)
			limit 1;
		if v_id is not null then return jsonb_build_object('chat', team_chat_json(v_id, p_mitglied), 'vorhanden', true); end if;
		v_titel := '';
	else
		if cardinality(v_wer) < 2 then raise exception 'Bitte wähle mindestens eine weitere Person aus.'; end if;
		if p_art = 'projekt' then
			if v_proj is null or not exists (select 1 from team_projekte p where p.name = v_proj) then raise exception 'Bitte wähle ein Projekt aus.'; end if;
			if v_titel = '' then v_titel := v_proj; end if;
		end if;
		if length(v_titel) < 2 then raise exception 'Bitte gib dem Chat einen Namen.'; end if;
	end if;
	insert into team_chats (art, titel, projekt, erstellt_von) values (p_art, left(v_titel, 80), v_proj, p_mitglied) returning chat_id into v_id;
	insert into team_chat_mitglieder (chat_id, mitglied_id) select v_id, x from unnest(v_wer) x;
	perform team_chat_hinweis(v_id, team_chat_name(p_mitglied) || ' hat den Chat angelegt.');
	return jsonb_build_object('chat', team_chat_json(v_id, p_mitglied), 'vorhanden', false);
end;
$$;

-- 7) Ändern: Name, Projekt, Personen hinzufügen/entfernen (auch sich selbst = verlassen), KI-Zugriff auf den Verlauf.
--    Jede Änderung wird als Hinweis im Chat sichtbar.
create or replace function team_chat_aendern(p_mitglied text, p_chat text, p_aenderung jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v team_chats; a jsonb := coalesce(p_aenderung, '{}'); n text := team_chat_name(p_mitglied);
	v_hinzu text[]; v_weg text[]; v_titel text; v_proj text; x text;
begin
	v := team_chat_pruefen(p_chat, p_mitglied);
	if a ? 'titel' and v.art <> 'direkt' then
		v_titel := left(trim(coalesce(a ->> 'titel', '')), 80);
		if length(v_titel) < 2 then raise exception 'Bitte gib dem Chat einen Namen.'; end if;
		if v_titel <> v.titel then update team_chats set titel = v_titel where chat_id = p_chat; perform team_chat_hinweis(p_chat, n || ' hat den Chat in „' || v_titel || '“ umbenannt.'); end if;
	end if;
	if a ? 'projekt' then
		v_proj := nullif(trim(coalesce(a ->> 'projekt', '')), '');
		if v_proj is not null and not exists (select 1 from team_projekte p where p.name = v_proj) then raise exception 'Dieses Projekt gibt es nicht.'; end if;
		if v_proj is distinct from v.projekt then
			update team_chats set projekt = v_proj, art = case when v.art = 'direkt' then 'direkt' when v_proj is null then 'gruppe' else 'projekt' end where chat_id = p_chat;
			perform team_chat_hinweis(p_chat, n || case when v_proj is null then ' hat das Projekt vom Chat gelöst.' else ' hat das Projekt „' || v_proj || '“ dazugeholt.' end);
		end if;
	end if;
	if a ? 'ki_verlauf' and (a ->> 'ki_verlauf')::boolean is distinct from v.ki_verlauf then
		update team_chats set ki_verlauf = (a ->> 'ki_verlauf')::boolean where chat_id = p_chat;
		perform team_chat_hinweis(p_chat, '🤖 ' || n || case when (a ->> 'ki_verlauf')::boolean
			then ' hat eingeschaltet: Die KI darf den ganzen Verlauf dieses Chats lesen.'
			else ' hat ausgeschaltet: Die KI liest diesen Chat nur noch, wenn jemand sie mit @ anspricht.' end);
	end if;
	if a ? 'hinzu' then
		if v.art = 'direkt' then raise exception 'In einen Direktchat kann niemand dazukommen. Leg dafür einen Gruppenchat an.'; end if;
		v_hinzu := team_chat_personen(array(select jsonb_array_elements_text(a -> 'hinzu')));
		foreach x in array v_hinzu loop
			if not exists (select 1 from team_chat_mitglieder where chat_id = p_chat and mitglied_id = x) then
				insert into team_chat_mitglieder (chat_id, mitglied_id) values (p_chat, x);
				perform team_chat_hinweis(p_chat, n || ' hat ' || team_chat_name(x) || ' hinzugefügt.');
			end if;
		end loop;
	end if;
	if a ? 'weg' then
		v_weg := array(select jsonb_array_elements_text(a -> 'weg'));
		if v.art = 'direkt' and not (v_weg <@ array[p_mitglied]) then raise exception 'Aus einem Direktchat kannst nur du selbst gehen.'; end if;
		foreach x in array v_weg loop
			delete from team_chat_mitglieder where chat_id = p_chat and mitglied_id = x;
			if found then perform team_chat_hinweis(p_chat, case when x = p_mitglied then n || ' hat den Chat verlassen.' else n || ' hat ' || team_chat_name(x) || ' entfernt.' end); end if;
		end loop;
		-- Ohne Mitglieder bleibt der Chat liegen, sieht aber niemand mehr; wird beim nächsten Aufräumen gelöscht
	end if;
	if exists (select 1 from team_chat_mitglieder where chat_id = p_chat and mitglied_id = p_mitglied) then
		return jsonb_build_object('chat', team_chat_json(p_chat, p_mitglied));
	end if;
	return jsonb_build_object('chat', null, 'verlassen', true);
end;
$$;

-- 8) Senden. Markierte (nur Chat-Mitglieder, nicht man selbst) bekommen einen Hinweis im Posteingang (team_msgs, falls eingerichtet),
--    p_whatsapp davon (Haken beim Senden) zusätzlich eine WhatsApp über die Warteschlange kom_benachrichtigungen (falls eingerichtet).
create or replace function team_chat_senden(p_mitglied text, p_chat text, p_text text, p_erwaehnt text[] default '{}', p_whatsapp text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v team_chats; v_text text := coalesce(p_text, ''); v_erw text[]; v_wa text[]; v_n team_chat_nachrichten; v_ort text;
begin
	v := team_chat_pruefen(p_chat, p_mitglied);
	if trim(v_text) = '' then raise exception 'Die Nachricht ist leer.'; end if;
	if length(v_text) > 8000 then raise exception 'Die Nachricht ist zu lang (höchstens 8000 Zeichen).'; end if;
	select coalesce(array_agg(distinct e), '{}') into v_erw from unnest(coalesce(p_erwaehnt, '{}')) e
		where e <> p_mitglied and exists (select 1 from team_chat_mitglieder m where m.chat_id = p_chat and m.mitglied_id = e);
	select coalesce(array_agg(distinct e), '{}') into v_wa from unnest(coalesce(p_whatsapp, '{}')) e where e = any (v_erw);
	insert into team_chat_nachrichten (chat_id, autor, text, erwaehnt, whatsapp) values (p_chat, p_mitglied, v_text, v_erw, v_wa) returning * into v_n;
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
	return jsonb_build_object('nachricht', to_jsonb(v_n), 'chat', team_chat_json(p_chat, p_mitglied));
end;
$$;

revoke all on function team_chat_name(text)                                  from public, anon, authenticated;
revoke all on function team_chat_json(text, text)                            from public, anon, authenticated;
revoke all on function team_chat_pruefen(text, text)                         from public, anon, authenticated;
revoke all on function team_chat_hinweis(text, text)                         from public, anon, authenticated;
revoke all on function team_chat_personen(text[])                            from public, anon, authenticated;
revoke all on function team_chat_liste(text)                                 from public, anon, authenticated;
revoke all on function team_chat_verlauf(text, text, bigint, int)            from public, anon, authenticated;
revoke all on function team_chat_anlegen(text, text, text, text[], text)     from public, anon, authenticated;
revoke all on function team_chat_aendern(text, text, jsonb)                  from public, anon, authenticated;
revoke all on function team_chat_senden(text, text, text, text[], text[])    from public, anon, authenticated;
grant execute on function team_chat_liste(text)                              to service_role;
grant execute on function team_chat_verlauf(text, text, bigint, int)         to service_role;
grant execute on function team_chat_anlegen(text, text, text, text[], text)  to service_role;
grant execute on function team_chat_aendern(text, text, jsonb)               to service_role;
grant execute on function team_chat_senden(text, text, text, text[], text[]) to service_role;
notify pgrst, 'reload schema';

-- Kontrolle: sollte team_chat_mitglieder, team_chat_nachrichten, team_chats zeigen
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'team_chat%' order by 1;
