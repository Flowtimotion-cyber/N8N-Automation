-- Team-Portal, Register „Social Media“: eigene Videos ansehen und im Team freigeben (27.11.2026)
-- Einmal im Supabase-SQL-Editor ausführen, NACH team_social_ideen_upload.sql. Kann gefahrlos mehrfach laufen.
--
-- Wer darf was (geprüft im n8n-Workflow „TEAM: Social-Upload“, team/n8n/C_Social.js → uploadAuftraege):
--   ansehen:   wer das Video hochgeladen hat, Admins, und alle im Team, wenn es freigegeben ist (im_team = true)
--   freigeben: nur wer das Video hochgeladen hat (auch wieder zurücknehmen)
--   löschen:   wer das Video hochgeladen hat, und Admins
-- Angesehen wird über eine befristete, signierte Adresse (1 Stunde), die n8n ausstellt. Der Bucket medien-roh bleibt privat.

alter table team_social_uploads add column if not exists im_team    boolean not null default false; -- für alle im Team sichtbar
alter table team_social_uploads add column if not exists im_team_am timestamptz;                    -- wann zuletzt freigegeben

-- Freigabe setzen oder zurücknehmen. Ändert nur Uploads, die p_von selbst hochgeladen hat (zweite Sicherung neben n8n).
create or replace function team_upload_teilen(p_id text, p_im_team boolean, p_von text) returns text
language plpgsql security definer set search_path = public as $$
begin
	if p_im_team is null then raise exception 'p_im_team fehlt'; end if;
	update team_social_uploads
		set im_team = p_im_team, im_team_am = case when p_im_team then now() else im_team_am end, geaendert = now(), geaendert_von = p_von
		where upload_id = p_id and erstellt_von = p_von and status <> 'geloescht';
	if not found then raise exception 'Upload nicht gefunden oder nicht von %: %', p_von, p_id; end if;
	return p_id;
end $$;

revoke all on function team_upload_teilen(text, boolean, text) from public, anon, authenticated;
grant execute on function team_upload_teilen(text, boolean, text) to service_role;
notify pgrst, 'reload schema';
