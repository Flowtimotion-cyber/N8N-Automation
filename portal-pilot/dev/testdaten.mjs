// TESTDATEN für den Testserver des Pilot-Portals (Betriebsart „Speicher“). Alles erfunden: Firma „Musterfirma GmbH“, Personen, Aufgaben.
// Keine echten Personen, keine echten Zugangsdaten. Die Codes hier gelten nur für den Testserver auf dem eigenen Rechner.
//
// Die Daten sind dieselben wie in supabase/900_seed_musterfirma.sql (gleiche IDs, Namen, Texte), damit Tests in beiden
// Betriebsarten (Speicher und Postgres) mit denselben Kennungen arbeiten. Wer den Seed ändert, ändert auch hier.
// Zusätzlich gibt es Beispielzeilen für die Optionen Arbeitszeit, Social Media und Systeme (optionaleDaten), die der
// Testserver in der Postgres-Betriebsart nach den Migrationen einspielt, falls die Tabellen vorhanden sind.

// Synthetische Zugangscodes: 48 Hex-Zeichen wie team_token_neu() in der Datenbank. Ohne lange Ziffernfolgen (PII-Scan).
export const TOKENS = {
  'mf-anna': 'ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef3a',   // Admin, aktiv
  'mf-ben': 'ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef3b',    // Team, aktiv
  'mf-clara': 'ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef3c',  // Team, aktiv
  'mf-dan': 'ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef3d'     // Team, eingeladen (noch ohne Profil)
};

// Einstellungen wie 002_einstellungen.sql, mit den Werten, die 900_seed_musterfirma.sql setzt
export function einstellungen() {
  return [
    { schluessel: 'firma', wert: 'Musterfirma GmbH' },
    { schluessel: 'kurzname', wert: 'Musterfirma' },
    { schluessel: 'stichdatum_abrechnung', wert: null },
    { schluessel: 'raeume', wert: [] },
    { schluessel: 'rollen', wert: [
      { rolle: 'admin', titel: 'Admin', beschreibung: 'Darf alles: Team verwalten, Einstellungen, Löschen, Freigaben.' },
      { rolle: 'team', titel: 'Team', beschreibung: 'Sieht alles, bearbeitet eigene Aufgaben, Notizen und Vorschläge.' },
      { rolle: 'dozent', titel: 'Fachlich', beschreibung: 'Wie Team, zusätzlich Projekte und Systeme pflegen und Kurs- oder Teilnehmerdaten bearbeiten.' },
      { rolle: 'vertrieb', titel: 'Vertrieb', beschreibung: 'Wie Team, zusätzlich Vertriebsregister (Diktat, Kontakte), wenn eingespielt.' },
      { rolle: 'agent', titel: 'KI-Agent', beschreibung: 'Technisches Mitglied für Automationen. Darf nur lesen, Aufgaben kommentieren und Entwürfe anlegen, nie löschen oder freigeben.' }
    ] },
    { schluessel: 'pilot_ende', wert: null },
    { schluessel: 'module', wert: { zeit: false, social: false, system: false, kurs: false } },
    { schluessel: 'firmenwissen_projekt', wert: null },
    { schluessel: 'vorschlag_bereiche', wert: ['Übersicht', 'Aufgaben', 'Projekte', 'Notizen', 'Vorschläge', 'Team', 'Sonstiges'] },
    { schluessel: 'social_kanaele', wert: [] }
  ];
}

/** Alle Pflichttabellen mit den Musterdaten des Seeds, relativ zum Zeitpunkt jetztIso (Deadlines, Zeitstempel). */
export function testDaten(jetztIso) {
  const t = new Date(jetztIso || Date.now()).getTime();
  const vor = (tage, stunden) => new Date(t - tage * 86400000 - (stunden || 0) * 3600000).toISOString();
  const datum = tage => new Date(t + tage * 86400000).toISOString().slice(0, 10);
  const team_mitglieder = [
    { mitglied_id: 'mf-anna', name: 'Anna Muster', email: 'anna.muster@musterfirma.example', telefon: null, funktion: 'Geschäftsführung', rolle: 'admin', typ: 'mensch', status: 'aktiv', token: TOKENS['mf-anna'], whatsapp_ok: false, registriert: vor(30), zuletzt_aktiv: vor(0, 1) },
    { mitglied_id: 'mf-ben', name: 'Ben Beispiel', email: 'ben.beispiel@musterfirma.example', telefon: null, funktion: 'Vertrieb', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS['mf-ben'], whatsapp_ok: false, registriert: vor(28), zuletzt_aktiv: vor(0, 3) },
    { mitglied_id: 'mf-clara', name: 'Clara Probe', email: 'clara.probe@musterfirma.example', telefon: null, funktion: 'Kundenservice', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS['mf-clara'], whatsapp_ok: false, registriert: vor(27), zuletzt_aktiv: vor(1) },
    { mitglied_id: 'mf-dan', name: 'Dan Test', email: 'dan.test@musterfirma.example', telefon: null, funktion: 'Verwaltung', rolle: 'team', typ: 'mensch', status: 'eingeladen', token: TOKENS['mf-dan'], whatsapp_ok: false, registriert: null, zuletzt_aktiv: null }
  ];
  const team_projekte = [
    { projekt_id: 'mf-p1', name: 'Onboarding Pilot', beschreibung: 'Einführung des Team-Portals: Zugänge, erste Aufgaben, Rückmeldungen sammeln.', status: 'aktiv', farbe: '#4f6df5', verantwortlich: 'mf-anna', reihenfolge: 1, links: [{ titel: 'Anleitung Portal', url: 'https://www.example.com/anleitung' }], geaendert: vor(0) },
    { projekt_id: 'mf-p2', name: 'Kundenanfragen', beschreibung: 'Eingehende Anfragen bearbeiten, Angebote nachfassen, Rückrufe planen.', status: 'aktiv', farbe: '#2a9d8f', verantwortlich: 'mf-clara', reihenfolge: 2, links: [], geaendert: vor(0) },
    { projekt_id: 'mf-p3', name: 'Interne Verbesserungen', beschreibung: 'Kleine Verbesserungen im Alltag: Vorlagen, Ablage, Abläufe.', status: 'geplant', farbe: '#e76f51', verantwortlich: 'mf-ben', reihenfolge: 3, links: [], geaendert: vor(0) }
  ];
  const A = (aufgabe_id, titel, beschreibung, status, prio, label, projekt, verantwortlich, erstellt_von, deadlineTage, erstelltTage, geaendertTage, erledigtTage) =>
    ({ aufgabe_id, titel, beschreibung, status, prio, label, projekt, verantwortlich, erstellt_von, deadline: datum(deadlineTage), agent_geeignet: false, erstellt: vor(erstelltTage), geaendert: vor(geaendertTage), erledigt_am: erledigtTage == null ? null : vor(erledigtTage), geaendert_von: null });
  const team_aufgaben = [
    A('mf-a01', 'Zugangslinks an alle verteilen', 'Jedes Teammitglied bekommt seinen persönlichen Link. Bitte nicht weiterleiten.', 'Erledigt', 1, null, 'Onboarding Pilot', 'mf-anna', 'mf-anna', -20, 25, 20, 20),
    A('mf-a02', 'Erstes Teammeeting im Portal planen', 'Tagesordnung als Notiz anlegen, Aufgaben daraus ableiten.', 'Erledigt', 2, null, 'Onboarding Pilot', 'mf-ben', 'mf-anna', -10, 22, 9, 9),
    A('mf-a03', 'Rückmeldungen zur ersten Woche sammeln', 'Was läuft gut, was stört? Als Vorschlag im Portal eintragen.', 'In Arbeit', 2, '💬 Zu besprechen', 'Onboarding Pilot', 'mf-clara', 'mf-anna', 5, 12, 2, null),
    A('mf-a04', 'Profil ausfüllen (E-Mail prüfen)', 'Unter Team: eigenes Profil öffnen, E-Mail kontrollieren, speichern.', 'Offen', 3, null, 'Onboarding Pilot', 'mf-dan', 'mf-anna', 7, 12, 12, null),
    A('mf-a05', 'Anfrage Beispiel AG beantworten', 'Angebot für 10 Lizenzen gewünscht, Rückruf am Vormittag bevorzugt.', 'In Arbeit', 1, '🔥 Hohe Prio', 'Kundenanfragen', 'mf-ben', 'mf-clara', 1, 3, 1, null),
    A('mf-a06', 'Rückruf Probe KG vereinbaren', 'Hat per Formular angefragt, möchte einen Termin für eine Vorführung.', 'Offen', 2, null, 'Kundenanfragen', 'mf-clara', 'mf-clara', 2, 2, 2, null),
    A('mf-a07', 'Angebot Test GmbH nachfassen', 'Angebot ist seit 14 Tagen draußen, freundlich nachhaken.', 'Wartet', 2, 'wartet auf..', 'Kundenanfragen', 'mf-ben', 'mf-ben', 3, 15, 4, null),
    A('mf-a08', 'FAQ für häufige Anfragen schreiben', 'Die fünf häufigsten Fragen mit Antworten als Notiz, später auf die Webseite.', 'Geplant', 3, null, 'Kundenanfragen', 'mf-clara', 'mf-anna', 14, 6, 6, null),
    A('mf-a09', 'Vorlage für Angebote vereinheitlichen', 'Eine Vorlage für alle, mit Platzhaltern für Kunde, Leistung, Preis.', 'In Arbeit', 2, '🗂️ Zu klären', 'Interne Verbesserungen', 'mf-ben', 'mf-ben', 10, 8, 1, null),
    A('mf-a10', 'Ablage für Kundenunterlagen aufräumen', 'Alte Ordner archivieren, einheitliche Benennung festlegen.', 'Geplant', 3, null, 'Interne Verbesserungen', 'mf-dan', 'mf-anna', 21, 5, 5, null),
    A('mf-a11', 'Checkliste Urlaubsvertretung testen', 'Neue Checkliste einmal in der Praxis durchspielen und Lücken notieren.', 'Wird getestet', 2, null, 'Interne Verbesserungen', 'mf-clara', 'mf-ben', 4, 9, 1, null),
    A('mf-a12', 'Portal-Schulung für neue Kollegen', 'Kurze Einführung (30 Minuten) vorbereiten: Aufgaben, Notizen, Vorschläge.', 'Offen', 2, null, 'Onboarding Pilot', 'mf-anna', 'mf-anna', 30, 1, 1, null)
  ];
  let vid = 0;
  const V = (aufgabe_id, autor, art, text, tage) => ({ id: ++vid, aufgabe_id, autor, art, text, erstellt: vor(tage) });
  const team_aufgaben_verlauf = [
    V('mf-a01', 'mf-anna', 'status', 'Offen → In Arbeit', 24),
    V('mf-a01', 'mf-anna', 'kommentar', 'Links sind raus, bitte jeder einmal einloggen.', 21),
    V('mf-a01', 'mf-anna', 'status', 'In Arbeit → Erledigt', 20),
    V('mf-a02', 'mf-ben', 'status', 'Offen → In Arbeit', 15),
    V('mf-a02', 'mf-ben', 'kommentar', 'Tagesordnung steht in der Notiz „Protokoll Kickoff“.', 10),
    V('mf-a02', 'mf-anna', 'status', 'In Arbeit → Erledigt', 9),
    V('mf-a03', 'mf-clara', 'status', 'Offen → In Arbeit', 2),
    V('mf-a03', 'mf-clara', 'kommentar', 'Drei Rückmeldungen sind da, zwei fehlen noch.', 1),
    V('mf-a05', 'mf-clara', 'kommentar', 'Anfrage kam über das Kontaktformular, Rückruf vormittags gewünscht.', 3),
    V('mf-a05', 'mf-ben', 'status', 'Offen → In Arbeit', 1),
    V('mf-a07', 'mf-ben', 'status', 'In Arbeit → Wartet', 4),
    V('mf-a07', 'mf-ben', 'kommentar', 'Ansprechpartner ist bis Montag im Urlaub, danach nachfassen.', 4),
    V('mf-a09', 'mf-ben', 'kommentar', 'Erster Entwurf der Vorlage liegt im Projektordner.', 1),
    V('mf-a11', 'mf-ben', 'status', 'In Arbeit → Wird getestet', 1),
    V('mf-a11', 'mf-ben', 'kommentar', 'Clara, magst du die Checkliste einmal durchgehen?', 1)
  ];
  const team_notizen = [
    { notiz_id: 'mf-n1', titel: 'Willkommen im Portal', inhalt: 'Hallo Team,\n\nhier sammeln wir Aufgaben, Projekte und Notizen an einem Ort.\n\n- Aufgaben: was zu tun ist, wer es macht, bis wann\n- Notizen: Wissen, das bleiben soll (siehe [[Arbeitsweise]])\n- Vorschläge: was am Portal besser werden soll\n\nFragen gern an Anna.', projekt: 'Onboarding Pilot', autor: 'mf-anna', geaendert_von: 'mf-anna', erstellt: vor(25), geaendert: vor(20) },
    { notiz_id: 'mf-n2', titel: 'Arbeitsweise', inhalt: '## So arbeiten wir mit Aufgaben\n\n1. Jede Aufgabe hat genau eine verantwortliche Person.\n2. Status ehrlich halten: Offen, Geplant, In Arbeit, Wartet, Wird getestet, Erledigt.\n3. Wer etwas erledigt, schreibt einen kurzen Kommentar dazu.\n4. Deadlines sind Zusagen, keine Wünsche.', projekt: 'Onboarding Pilot', autor: 'mf-anna', geaendert_von: 'mf-ben', erstellt: vor(24), geaendert: vor(15) },
    { notiz_id: 'mf-n3', titel: 'Protokoll Kickoff', inhalt: 'Teilnehmer: Anna, Ben, Clara\n\nBeschlüsse:\n- Portal wird 8 Wochen getestet, danach Entscheidung.\n- Kundenanfragen laufen ab sofort als Aufgaben im Projekt „Kundenanfragen“.\n- Verbesserungswünsche als Vorschlag eintragen, nicht per Mail.\n\nOffen: Schulung für Dan, sobald er startet.', projekt: 'Onboarding Pilot', autor: 'mf-ben', geaendert_von: 'mf-ben', erstellt: vor(10), geaendert: vor(10) }
  ];
  const team_vorschlaege = [
    { vorschlag_id: 'mf-v1', titel: 'Dunkler Modus fürs Portal', text: 'Abends ist der helle Hintergrund anstrengend. Ein dunkler Modus wäre angenehm.', bereich: 'Übersicht', status: 'neu', autor: 'mf-ben', stimmen: ['mf-clara', 'mf-anna'], antwort: '', antwort_von: null, aufgabe_id: null, erstellt: vor(6), geaendert: vor(6) },
    { vorschlag_id: 'mf-v2', titel: 'Erinnerung per E-Mail, wenn eine Deadline naht', text: 'Einen Tag vor der Deadline eine kurze Mail an die verantwortliche Person.', bereich: 'Aufgaben', status: 'geplant', autor: 'mf-clara', stimmen: ['mf-ben'], antwort: 'Gute Idee, kommt in die nächste Runde.', antwort_von: 'mf-anna', aufgabe_id: null, erstellt: vor(4), geaendert: vor(2) }
  ];
  const team_papierkorb = [
    { eintrag_id: 'mf-pk1', art: 'aufgabe', objekt_id: 'mf-a13', titel: 'Rückruf Probe KG vereinbaren (doppelt)',
      daten: { aufgabe_id: 'mf-a13', titel: 'Rückruf Probe KG vereinbaren (doppelt)', beschreibung: 'Versehentlich zweimal angelegt.', status: 'Offen', prio: 2, label: '', projekt: 'Kundenanfragen', verantwortlich: 'mf-clara', erstellt_von: 'mf-ben', deadline: datum(2), agent_geeignet: false, erstellt: vor(2), geaendert: vor(2), erledigt_am: null,
        _verlauf: [{ aufgabe_id: 'mf-a13', autor: 'mf-ben', art: 'kommentar', text: 'Doppelt, bitte löschen.', erstellt: vor(2) }] },
      geloescht_von: 'mf-clara', geloescht_am: vor(2) }
  ];
  const T = { team_einstellungen: einstellungen(), team_mitglieder, team_projekte, team_aufgaben, team_aufgaben_verlauf, team_notizen, team_notiz_versionen: [], team_vorschlaege, team_systeme: [], team_papierkorb };
  return Object.assign(T, optionaleDaten(jetztIso));
}

/** Beispielzeilen für die Optionen Arbeitszeit (100), Social Media (120) und Systeme (001). In der Postgres-Betriebsart nur eingespielt, wenn die Tabelle da ist. */
export function optionaleDaten(jetztIso) {
  const t = new Date(jetztIso || Date.now()).getTime();
  const vor = tage => new Date(t - tage * 86400000).toISOString();
  const datum = tage => new Date(t + tage * 86400000).toISOString().slice(0, 10);
  return {
    team_zeiten: [
      { zeit_id: 'mf-z1', mitglied_id: 'mf-ben', datum: datum(-1), von: '09:00', bis: '13:00', pause_min: 0, minuten: 240, taetigkeit: 'Angebote nachgefasst', projekt: 'Kundenanfragen', aufgabe_id: 'mf-a07', kw: isoWoche(datum(-1)), status: 'offen', kommentar: null, geaendert: vor(1) },
      { zeit_id: 'mf-z2', mitglied_id: 'mf-clara', datum: datum(-2), von: '08:30', bis: '12:30', pause_min: 30, minuten: 210, taetigkeit: 'Rückmeldungen gesammelt', projekt: 'Onboarding Pilot', aufgabe_id: 'mf-a03', kw: isoWoche(datum(-2)), status: 'eingereicht', eingereicht_am: vor(1), kommentar: null, geaendert: vor(1) }
    ],
    team_abrechnung: [],
    team_social: [
      { post_id: 'mf-s1', datum: datum(5), uhrzeit: '09:00', kanal: 'LinkedIn', thema: 'Neue Vorlage für Angebote', text: 'Was sich für unsere Kunden ändert.', status: 'In Arbeit', verantwortlich: 'mf-clara', link: '', medien: '', hook: '', hashtags: '', quelle: '', format: 'Text', geaendert: vor(2) },
      { post_id: 'mf-s2', datum: datum(12), uhrzeit: '', kanal: 'Newsletter', thema: 'Rückblick auf den Pilotmonat', text: '', status: 'Idee', verantwortlich: 'mf-ben', link: '', medien: '', hook: '', hashtags: '', quelle: '', format: 'Text', geaendert: vor(1) }
    ],
    team_systeme: [
      { system_id: 'mf-y1', name: 'Team-Portal', bereich: 'Intern', beschreibung: 'Aufgaben, Projekte, Notizen für das Team.', status: 'läuft', werkzeug: 'n8n, Datenbank, statische Seite', link: '', verantwortlich: 'mf-anna', geaendert: vor(10) },
      { system_id: 'mf-y2', name: 'Angebotsvorlage', bereich: 'Vertrieb', beschreibung: 'Vorlage mit Platzhaltern für Kunde, Leistung, Preis.', status: 'im Bau', werkzeug: 'Textverarbeitung', link: '', verantwortlich: 'mf-ben', geaendert: vor(3) }
    ]
  };
}

/** ISO-Kalenderwoche „JJJJ-Wnn“ für ein Datum JJJJ-MM-TT (gleiche Rechnung wie im Portal und in der API). */
export function isoWoche(ds) {
  const t = new Date(ds + 'T12:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd + 3);
  const j = t.getUTCFullYear(); const e = new Date(Date.UTC(j, 0, 4));
  const w = 1 + Math.round(((t - e) / 864e5 - 3 + ((e.getUTCDay() + 6) % 7)) / 7);
  return j + '-W' + String(w).padStart(2, '0');
}
