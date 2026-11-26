-- Kommunikation → Vertriebs-Pipeline (Twenty CRM): Spalten für die Übergabe aus dem WhatsApp-Bot (Workflow B)
-- Einmal im Supabase SQL Editor ausführen (Run). Kann gefahrlos wiederholt werden (nur „add column if not exists“).
-- VOR dem Einspielen der neuen Knoten in „KOM: WhatsApp Antwort“ ausführen.
-- Zugriff bleibt wie in kommunikation.sql: RLS an, keine Policies, nur service_role (n8n) schreibt.
-- Ins CRM geht nur die Zusammenfassung des Bots, nie der Chatverlauf (Auftrag Abschnitt 11).

-- twenty_person_id / twenty_chance_id gibt es seit kommunikation.sql; hier nur zur Sicherheit, falls die Tabelle älter ist.
alter table kom_konversationen add column if not exists twenty_person_id  text;         -- Person in Twenty (Telefonnummer)
alter table kom_konversationen add column if not exists twenty_chance_id  text;         -- genau eine Chance je konversation_id
alter table kom_konversationen add column if not exists crm_notiz_id      text;         -- Twenty-Notiz mit der Bot-Zusammenfassung
alter table kom_konversationen add column if not exists crm_uebergeben_am timestamptz;  -- wann die Chance angelegt/übernommen wurde
alter table kom_konversationen add column if not exists crm_fehler        text;         -- letzter Fehler der Übergabe, null = in Ordnung

comment on column kom_konversationen.twenty_chance_id is 'Twenty-Opportunity dieser Konversation. Gesetzt = nur noch fortschreiben, nie neu anlegen.';
comment on column kom_konversationen.crm_fehler is 'Fehler der CRM-Übergabe. Der nächste Lauf des Bots versucht es erneut (ohne Dublette).';

-- Übersicht für die Kontrolle (nur lesen): Kundengespräche, die noch nicht in der Pipeline sind
-- select konversation_id, kontakt_name, marke, crm_fehler, geaendert from kom_konversationen
--  where kanal = 'whatsapp' and twenty_chance_id is null order by geaendert desc;
