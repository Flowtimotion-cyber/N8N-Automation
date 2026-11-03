-- =====================================================================================================
-- 900_seed_musterfirma.sql  ·  Team-Portal (Pilot-Kopie)  ·  OPTION (Musterdaten)  ·  "Musterfirma GmbH"
-- =====================================================================================================
-- Was macht diese Datei?
--   Füllt ein leeres Portal mit erfundenen Beispieldaten, damit man sofort sieht, wie es aussieht:
--   4 Mitglieder (1 Admin, 3 Team), 3 Projekte, 12 Aufgaben in allen Status mit Verlauf, 3 Notizen,
--   2 Vorschläge, 1 Eintrag im Papierkorb. Alle Personen, Mail-Adressen und Inhalte sind erfunden
--   (Domain musterfirma.example ist reserviert und gehört niemandem). Keine Telefonnummern.
-- Pflicht oder Option?  OPTION. Für einen Kunden ohne Musterdaten stattdessen 910_erster_admin.sql nutzen.
-- Wovon hängt sie ab?   001_basis.sql, 002_einstellungen.sql, 003_team_laden.sql. Keine Option nötig.
-- Mehrfach ausführbar?  Ja. Beim zweiten Mal wird nichts doppelt angelegt und kein Zugangscode geändert.
--
-- ZUGANGSCODES: Die Codes (Token) werden beim Einspielen zufällig erzeugt. Die letzte Abfrage dieser
--   Datei zeigt sie an: name, rolle, token. Der Login-Link lautet <Portal-Adresse>#z=<token>.
--   Später jederzeit wieder anzeigen mit:  select name, rolle, token from team_mitglieder order by name;
-- Musterdaten wieder entfernen: 999_loeschen.sql löscht alles (auch die Tabellen), oder gezielt
--   delete from team_mitglieder where mitglied_id like 'mf-%';  (und ebenso für die anderen Tabellen).
-- =====================================================================================================

-- 0) Firmenname nur setzen, wenn noch der Standardwert aus 002 drinsteht
update team_einstellungen set wert = '"Musterfirma GmbH"'::jsonb, geaendert = now()
 where schluessel = 'firma' and wert = '"Meine Firma"'::jsonb;
update team_einstellungen set wert = '"Musterfirma"'::jsonb, geaendert = now()
 where schluessel = 'kurzname' and wert = '"Portal"'::jsonb;

-- 1) Mitglieder (Token wird je Zeile neu erzeugt; bei Wiederholung bleibt die vorhandene Zeile samt Token)
insert into team_mitglieder (mitglied_id, name, email, funktion, rolle, typ, status, token, registriert, zuletzt_aktiv) values
  ('mf-anna',  'Anna Muster',  'anna.muster@musterfirma.example',  'Geschäftsführung', 'admin', 'mensch', 'aktiv',      team_token_neu(), now() - interval '30 days', now() - interval '1 hour'),
  ('mf-ben',   'Ben Beispiel', 'ben.beispiel@musterfirma.example', 'Vertrieb',         'team',  'mensch', 'aktiv',      team_token_neu(), now() - interval '28 days', now() - interval '3 hours'),
  ('mf-clara', 'Clara Probe',  'clara.probe@musterfirma.example',  'Kundenservice',    'team',  'mensch', 'aktiv',      team_token_neu(), now() - interval '27 days', now() - interval '1 day'),
  ('mf-dan',   'Dan Test',     'dan.test@musterfirma.example',     'Verwaltung',       'team',  'mensch', 'eingeladen', team_token_neu(), null, null)
on conflict (mitglied_id) do nothing;

-- 2) Projekte
insert into team_projekte (projekt_id, name, beschreibung, status, farbe, verantwortlich, reihenfolge, links) values
  ('mf-p1', 'Onboarding Pilot',        'Einführung des Team-Portals: Zugänge, erste Aufgaben, Rückmeldungen sammeln.', 'aktiv',   '#4f6df5', 'mf-anna',  1,
     '[{"titel": "Anleitung Portal", "url": "https://www.example.com/anleitung"}]'::jsonb),
  ('mf-p2', 'Kundenanfragen',          'Eingehende Anfragen bearbeiten, Angebote nachfassen, Rückrufe planen.',        'aktiv',   '#2a9d8f', 'mf-clara', 2, '[]'::jsonb),
  ('mf-p3', 'Interne Verbesserungen',  'Kleine Verbesserungen im Alltag: Vorlagen, Ablage, Abläufe.',                  'geplant', '#e76f51', 'mf-ben',   3, '[]'::jsonb)
on conflict (projekt_id) do nothing;

-- 3) Aufgaben (Deadlines relativ zum Tag des Einspielens). Label: nur Werte aus der Liste der Portal-API (LABELS) oder null.
insert into team_aufgaben (aufgabe_id, titel, beschreibung, status, prio, label, projekt, verantwortlich, erstellt_von, deadline, erstellt, geaendert, erledigt_am) values
  ('mf-a01', 'Zugangslinks an alle verteilen',          'Jedes Teammitglied bekommt seinen persönlichen Link. Bitte nicht weiterleiten.',        'Erledigt',      1, null,       'Onboarding Pilot',       'mf-anna',  'mf-anna',  to_char(current_date - 20, 'YYYY-MM-DD'), now() - interval '25 days', now() - interval '20 days', now() - interval '20 days'),
  ('mf-a02', 'Erstes Teammeeting im Portal planen',     'Tagesordnung als Notiz anlegen, Aufgaben daraus ableiten.',                            'Erledigt',      2, null,       'Onboarding Pilot',       'mf-ben',   'mf-anna',  to_char(current_date - 10, 'YYYY-MM-DD'), now() - interval '22 days', now() - interval '9 days',  now() - interval '9 days'),
  ('mf-a03', 'Rückmeldungen zur ersten Woche sammeln',  'Was läuft gut, was stört? Als Vorschlag im Portal eintragen.',                         'In Arbeit',     2, '💬 Zu besprechen', 'Onboarding Pilot',       'mf-clara', 'mf-anna',  to_char(current_date + 5,  'YYYY-MM-DD'), now() - interval '12 days', now() - interval '2 days',  null),
  ('mf-a04', 'Profil ausfüllen (E-Mail prüfen)',        'Unter Team: eigenes Profil öffnen, E-Mail kontrollieren, speichern.',                  'Offen',         3, null,       'Onboarding Pilot',       'mf-dan',   'mf-anna',  to_char(current_date + 7,  'YYYY-MM-DD'), now() - interval '12 days', now() - interval '12 days', null),
  ('mf-a05', 'Anfrage Beispiel AG beantworten',         'Angebot für 10 Lizenzen gewünscht, Rückruf am Vormittag bevorzugt.',                   'In Arbeit',     1, '🔥 Hohe Prio', 'Kundenanfragen',         'mf-ben',   'mf-clara', to_char(current_date + 1,  'YYYY-MM-DD'), now() - interval '3 days',  now() - interval '1 day',   null),
  ('mf-a06', 'Rückruf Probe KG vereinbaren',            'Hat per Formular angefragt, möchte einen Termin für eine Vorführung.',                 'Offen',         2, null,       'Kundenanfragen',         'mf-clara', 'mf-clara', to_char(current_date + 2,  'YYYY-MM-DD'), now() - interval '2 days',  now() - interval '2 days',  null),
  ('mf-a07', 'Angebot Test GmbH nachfassen',            'Angebot ist seit 14 Tagen draußen, freundlich nachhaken.',                             'Wartet',        2, 'wartet auf..', 'Kundenanfragen',         'mf-ben',   'mf-ben',   to_char(current_date + 3,  'YYYY-MM-DD'), now() - interval '15 days', now() - interval '4 days',  null),
  ('mf-a08', 'FAQ für häufige Anfragen schreiben',      'Die fünf häufigsten Fragen mit Antworten als Notiz, später auf die Webseite.',         'Geplant',       3, null,       'Kundenanfragen',         'mf-clara', 'mf-anna',  to_char(current_date + 14, 'YYYY-MM-DD'), now() - interval '6 days',  now() - interval '6 days',  null),
  ('mf-a09', 'Vorlage für Angebote vereinheitlichen',   'Eine Vorlage für alle, mit Platzhaltern für Kunde, Leistung, Preis.',                  'In Arbeit',     2, '🗂️ Zu klären', 'Interne Verbesserungen', 'mf-ben',   'mf-ben',   to_char(current_date + 10, 'YYYY-MM-DD'), now() - interval '8 days',  now() - interval '1 day',   null),
  ('mf-a10', 'Ablage für Kundenunterlagen aufräumen',   'Alte Ordner archivieren, einheitliche Benennung festlegen.',                           'Geplant',       3, null,       'Interne Verbesserungen', 'mf-dan',   'mf-anna',  to_char(current_date + 21, 'YYYY-MM-DD'), now() - interval '5 days',  now() - interval '5 days',  null),
  ('mf-a11', 'Checkliste Urlaubsvertretung testen',     'Neue Checkliste einmal in der Praxis durchspielen und Lücken notieren.',               'Wird getestet', 2, null,       'Interne Verbesserungen', 'mf-clara', 'mf-ben',   to_char(current_date + 4,  'YYYY-MM-DD'), now() - interval '9 days',  now() - interval '1 day',   null),
  ('mf-a12', 'Portal-Schulung für neue Kollegen',       'Kurze Einführung (30 Minuten) vorbereiten: Aufgaben, Notizen, Vorschläge.',            'Offen',         2, null,       'Onboarding Pilot',       'mf-anna',  'mf-anna',  to_char(current_date + 30, 'YYYY-MM-DD'), now() - interval '1 day',   now() - interval '1 day',   null)
on conflict (aufgabe_id) do nothing;

-- 4) Verlauf zu den Aufgaben (nur beim ersten Einspielen; die Tabelle hat laufende Nummern)
do $$
begin
  if not exists (select 1 from team_aufgaben_verlauf where aufgabe_id like 'mf-a%') then
    insert into team_aufgaben_verlauf (aufgabe_id, autor, art, text, erstellt) values
      ('mf-a01', 'mf-anna',  'status',    'Offen → In Arbeit',                                                    now() - interval '24 days'),
      ('mf-a01', 'mf-anna',  'kommentar', 'Links sind raus, bitte jeder einmal einloggen.',                       now() - interval '21 days'),
      ('mf-a01', 'mf-anna',  'status',    'In Arbeit → Erledigt',                                                 now() - interval '20 days'),
      ('mf-a02', 'mf-ben',   'status',    'Offen → In Arbeit',                                                    now() - interval '15 days'),
      ('mf-a02', 'mf-ben',   'kommentar', 'Tagesordnung steht in der Notiz „Protokoll Kickoff“.',                 now() - interval '10 days'),
      ('mf-a02', 'mf-anna',  'status',    'In Arbeit → Erledigt',                                                 now() - interval '9 days'),
      ('mf-a03', 'mf-clara', 'status',    'Offen → In Arbeit',                                                    now() - interval '2 days'),
      ('mf-a03', 'mf-clara', 'kommentar', 'Drei Rückmeldungen sind da, zwei fehlen noch.',                        now() - interval '1 day'),
      ('mf-a05', 'mf-clara', 'kommentar', 'Anfrage kam über das Kontaktformular, Rückruf vormittags gewünscht.',  now() - interval '3 days'),
      ('mf-a05', 'mf-ben',   'status',    'Offen → In Arbeit',                                                    now() - interval '1 day'),
      ('mf-a07', 'mf-ben',   'status',    'In Arbeit → Wartet',                                                   now() - interval '4 days'),
      ('mf-a07', 'mf-ben',   'kommentar', 'Ansprechpartner ist bis Montag im Urlaub, danach nachfassen.',         now() - interval '4 days'),
      ('mf-a09', 'mf-ben',   'kommentar', 'Erster Entwurf der Vorlage liegt im Projektordner.',                    now() - interval '1 day'),
      ('mf-a11', 'mf-ben',   'status',    'In Arbeit → Wird getestet',                                            now() - interval '1 day'),
      ('mf-a11', 'mf-ben',   'kommentar', 'Clara, magst du die Checkliste einmal durchgehen?',                    now() - interval '1 day');
  end if;
end $$;

-- 5) Notizen (Wiki: [[Titel]] verlinkt auf eine andere Notiz)
insert into team_notizen (notiz_id, titel, inhalt, projekt, autor, geaendert_von, erstellt, geaendert) values
  ('mf-n1', 'Willkommen im Portal',
     E'Hallo Team,\n\nhier sammeln wir Aufgaben, Projekte und Notizen an einem Ort.\n\n- Aufgaben: was zu tun ist, wer es macht, bis wann\n- Notizen: Wissen, das bleiben soll (siehe [[Arbeitsweise]])\n- Vorschläge: was am Portal besser werden soll\n\nFragen gern an Anna.',
     'Onboarding Pilot', 'mf-anna', 'mf-anna', now() - interval '25 days', now() - interval '20 days'),
  ('mf-n2', 'Arbeitsweise',
     E'## So arbeiten wir mit Aufgaben\n\n1. Jede Aufgabe hat genau eine verantwortliche Person.\n2. Status ehrlich halten: Offen, Geplant, In Arbeit, Wartet, Wird getestet, Erledigt.\n3. Wer etwas erledigt, schreibt einen kurzen Kommentar dazu.\n4. Deadlines sind Zusagen, keine Wünsche.',
     'Onboarding Pilot', 'mf-anna', 'mf-ben', now() - interval '24 days', now() - interval '15 days'),
  ('mf-n3', 'Protokoll Kickoff',
     E'Teilnehmer: Anna, Ben, Clara\n\nBeschlüsse:\n- Portal wird 8 Wochen getestet, danach Entscheidung.\n- Kundenanfragen laufen ab sofort als Aufgaben im Projekt „Kundenanfragen“.\n- Verbesserungswünsche als Vorschlag eintragen, nicht per Mail.\n\nOffen: Schulung für Dan, sobald er startet.',
     'Onboarding Pilot', 'mf-ben', 'mf-ben', now() - interval '10 days', now() - interval '10 days')
on conflict (notiz_id) do nothing;

-- 6) Vorschläge
insert into team_vorschlaege (vorschlag_id, titel, text, bereich, status, autor, stimmen, antwort, antwort_von, erstellt, geaendert) values
  ('mf-v1', 'Dunkler Modus fürs Portal', 'Abends ist der helle Hintergrund anstrengend. Ein dunkler Modus wäre angenehm.',
     'Übersicht', 'neu', 'mf-ben', array['mf-clara', 'mf-anna']::text[], '', null, now() - interval '6 days', now() - interval '6 days'),
  ('mf-v2', 'Erinnerung per E-Mail, wenn eine Deadline naht', 'Einen Tag vor der Deadline eine kurze Mail an die verantwortliche Person.',
     'Aufgaben', 'geplant', 'mf-clara', array['mf-ben']::text[], 'Gute Idee, kommt in die nächste Runde.', 'mf-anna', now() - interval '4 days', now() - interval '2 days')
on conflict (vorschlag_id) do nothing;

-- 7) Papierkorb: eine versehentlich doppelt angelegte Aufgabe, vor 2 Tagen gelöscht (30 Tage wiederherstellbar)
insert into team_papierkorb (eintrag_id, art, objekt_id, titel, daten, geloescht_von, geloescht_am) values
  ('mf-pk1', 'aufgabe', 'mf-a13', 'Rückruf Probe KG vereinbaren (doppelt)',
   jsonb_build_object(
     'aufgabe_id', 'mf-a13', 'titel', 'Rückruf Probe KG vereinbaren (doppelt)', 'beschreibung', 'Versehentlich zweimal angelegt.',
     'status', 'Offen', 'prio', 2, 'label', '', 'projekt', 'Kundenanfragen', 'verantwortlich', 'mf-clara', 'erstellt_von', 'mf-ben',
     'deadline', to_char(current_date + 2, 'YYYY-MM-DD'), 'agent_geeignet', false,
     'erstellt', now() - interval '2 days', 'geaendert', now() - interval '2 days', 'erledigt_am', null,
     '_verlauf', jsonb_build_array(jsonb_build_object('aufgabe_id', 'mf-a13', 'autor', 'mf-ben', 'art', 'kommentar',
                                                       'text', 'Doppelt, bitte löschen.', 'erstellt', now() - interval '2 days'))),
   'mf-clara', now() - interval '2 days')
on conflict (eintrag_id) do nothing;

-- Kontrolle: Mengen (4 / 3 / 12 / 15 / 3 / 2 / 1) ...
select (select count(*) from team_mitglieder)       as mitglieder,
       (select count(*) from team_projekte)         as projekte,
       (select count(*) from team_aufgaben)         as aufgaben,
       (select count(*) from team_aufgaben_verlauf) as verlauf,
       (select count(*) from team_notizen)          as notizen,
       (select count(*) from team_vorschlaege)      as vorschlaege,
       (select count(*) from team_papierkorb)       as papierkorb;

-- ... und die ZUGANGSCODES (Login-Link: <Portal-Adresse>#z=<token>)
select name, rolle, status, token from team_mitglieder order by rolle, name;
