-- Momentum Team-Portal: Vorschläge vom 20.11.2026 – SCHRITT 2 von 2: Priorität 1–10
-- Erst ausführen, NACHDEM die neue Portal-API in n8n live ist (sie rechnet Angaben alter
-- Portal-Fenster und Agenten mit der Skala 1–3 selbst um). Danach den PR mergen.
--
-- Rechnet die bisherigen Werte einmalig um: 1 → 1 (am wichtigsten), 2 → 5 (normal), 3 → 8 (wenn Zeit ist).
-- Eine Merker-Tabelle sorgt dafür, dass ein zweiter Lauf nichts mehr umrechnet.

create table if not exists team_migrationen (
  name text primary key,
  am   timestamptz not null default now()
);
alter table team_migrationen enable row level security;

do $$
begin
  if exists (select 1 from team_migrationen where name = 'prio_1_bis_10') then
    raise notice 'Prio wurde schon umgerechnet – nichts zu tun.';
    return;
  end if;
  update team_aufgaben set prio = case prio when 2 then 5 when 3 then 8 end where prio in (2, 3);
  insert into team_migrationen (name) values ('prio_1_bis_10');
end $$;

alter table team_aufgaben alter column prio set default 5;

-- Kontrolle: Verteilung der Prioritäten (nach der Umrechnung nur noch 1, 5, 8 und neue Werte)
select prio, count(*) as anzahl from team_aufgaben group by prio order by prio;
