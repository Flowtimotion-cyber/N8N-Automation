-- Momentum Team-Portal: Nachrichten (Messaging zwischen Teammitgliedern und vom Portal selbst)
-- Einmal komplett im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden.
-- Zugriff nur über den Server (n8n „TEAM: Nachrichten (Portal)“, service_role). Browser und Agenten bekommen keinen Supabase-Schlüssel.
--
-- Zwei Ebenen, im Portal gekapselt als C_MsgsList_Global und C_MsgsList_User (docs/team/index.html):
--   team_msgs       globale Liste aller Nachrichten (MsgsList_Global)
--   team_msgs_user  je Mitglied die Verweise auf seine Nachrichten in team_msgs, mit Lesestand (MsgsList_User)

-- 1) Globale Liste: eine Zeile je Nachricht
create table if not exists team_msgs (
	msg_id     text primary key default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
	absender   text,                                  -- mitglied_id; null = das Team-Portal selbst (z. B. Benachrichtigung zu einem Ereignis)
	empfaenger text[] not null check (cardinality(empfaenger) > 0),
	text       text not null default '',              -- Markdown wie bei Notizen und Aufgaben
	gesendet   timestamptz not null default now(),    -- Absendezeit
	empfangen  jsonb not null default '{}'::jsonb     -- Empfangszeit je Mitglied: { "<mitglied_id>": "<erstes Öffnen>" }
);
create index if not exists team_msgs_gesendet on team_msgs (gesendet desc);

-- 2) Liste je Mitglied: Verweise in die globale Liste und der Lesestand
create table if not exists team_msgs_user (
	mitglied_id text not null,
	msg_id      text not null references team_msgs (msg_id) on delete cascade,
	gelesen     boolean not null default false,       -- false: neu oder ausdrücklich „als ungelesen“ zurückgelegt (Wiedervorlage)
	geaendert   timestamptz not null default now(),
	primary key (mitglied_id, msg_id)
);
create index if not exists team_msgs_user_offen on team_msgs_user (mitglied_id, gelesen);

-- Niemand außer dem Server darf direkt lesen oder schreiben
alter table team_msgs      enable row level security;
alter table team_msgs_user enable row level security;

-- 3) Senden: Nachricht in die globale Liste, Verweis in die Liste jedes Empfängers (ein Vorgang, alles oder nichts)
--    p_absender null = Nachricht vom Team-Portal selbst (für andere Workflows, nicht über die Portal-Oberfläche).
create or replace function team_msgs_senden(p_absender text, p_empfaenger text[], p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v_empf text[];
	v_unbekannt text[];
	v_msg team_msgs;
begin
	select coalesce(array_agg(distinct e), '{}') into v_empf
		from unnest(coalesce(p_empfaenger, '{}')) e where coalesce(trim(e), '') <> '';
	if cardinality(v_empf) = 0 then
		raise exception 'Bitte wähle mindestens einen Empfänger aus.';
	end if;
	if coalesce(trim(p_text), '') = '' then
		raise exception 'Die Nachricht ist leer.';
	end if;
	select array_agg(e) into v_unbekannt from unnest(v_empf) e
		where not exists (select 1 from team_mitglieder m where m.mitglied_id = e and m.status <> 'gesperrt');
	if v_unbekannt is not null then
		raise exception 'Unbekannte oder gesperrte Empfänger: %', array_to_string(v_unbekannt, ', ');
	end if;
	insert into team_msgs (absender, empfaenger, text) values (nullif(trim(p_absender), ''), v_empf, p_text)
		returning * into v_msg;
	insert into team_msgs_user (mitglied_id, msg_id) select e, v_msg.msg_id from unnest(v_empf) e;
	return jsonb_build_object('nachricht', to_jsonb(v_msg));
end;
$$;

-- 4) Laden: die Liste des Mitglieds und die Nachrichten, auf die sie verweist (neueste zuerst)
create or replace function team_msgs_laden(p_mitglied text, p_max int default 300) returns jsonb
language sql stable security definer set search_path = public as $$
	with l as (
		select u.msg_id, u.gelesen, m.gesendet, to_jsonb(m) as msg
		from team_msgs_user u join team_msgs m on m.msg_id = u.msg_id
		where u.mitglied_id = p_mitglied
		order by m.gesendet desc
		limit greatest(1, least(coalesce(p_max, 300), 1000))
	)
	select jsonb_build_object(
		'liste',       coalesce((select jsonb_agg(jsonb_build_object('msg_id', msg_id, 'gelesen', gelesen) order by gesendet desc) from l), '[]'),
		'nachrichten', coalesce((select jsonb_agg(msg order by gesendet desc) from l), '[]')
	);
$$;

-- 5) Öffnen: als gelesen markieren; beim ersten Öffnen die Empfangszeit dieses Mitglieds festhalten
create or replace function team_msgs_oeffnen(p_mitglied text, p_msg_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
	v_msg team_msgs;
begin
	update team_msgs_user set gelesen = true, geaendert = now()
		where mitglied_id = p_mitglied and msg_id = p_msg_id;
	if not found then
		raise exception 'Diese Nachricht gibt es nicht (mehr).';
	end if;
	update team_msgs set empfangen = empfangen || jsonb_build_object(p_mitglied, now())
		where msg_id = p_msg_id and not (empfangen ? p_mitglied)
		returning * into v_msg;
	if v_msg is null then
		select * into v_msg from team_msgs where msg_id = p_msg_id;
	end if;
	return jsonb_build_object('nachricht', to_jsonb(v_msg), 'eintrag', jsonb_build_object('msg_id', p_msg_id, 'gelesen', true));
end;
$$;

-- 6) Als ungelesen zurücklegen (Wiedervorlage). Die Empfangszeit (erstes Öffnen) bleibt.
create or replace function team_msgs_ungelesen(p_mitglied text, p_msg_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
	update team_msgs_user set gelesen = false, geaendert = now()
		where mitglied_id = p_mitglied and msg_id = p_msg_id;
	if not found then
		raise exception 'Diese Nachricht gibt es nicht (mehr).';
	end if;
	return jsonb_build_object('eintrag', jsonb_build_object('msg_id', p_msg_id, 'gelesen', false));
end;
$$;

revoke all on function team_msgs_senden(text, text[], text)  from public, anon, authenticated;
revoke all on function team_msgs_laden(text, int)            from public, anon, authenticated;
revoke all on function team_msgs_oeffnen(text, text)         from public, anon, authenticated;
revoke all on function team_msgs_ungelesen(text, text)       from public, anon, authenticated;
grant execute on function team_msgs_senden(text, text[], text) to service_role;
grant execute on function team_msgs_laden(text, int)           to service_role;
grant execute on function team_msgs_oeffnen(text, text)        to service_role;
grant execute on function team_msgs_ungelesen(text, text)      to service_role;

-- Kontrolle: sollte team_msgs und team_msgs_user zeigen
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'team_msgs%' order by 1;
