// TESTDATEN für den lokalen Testserver des Pilot-Portals. Alles erfunden: Firma „Musterfirma GmbH“, Personen, Aufgaben.
// Keine echten Personen, keine echten Zugangsdaten. Die Codes hier gelten nur für den Testserver auf dem eigenen Rechner.

// Synthetische Zugangscodes (Hex, 32 Zeichen). Im echten Portal vergibt der Admin über „Team → Verwalten“ andere.
export const TOKENS = {
  m_anna: 'ab12cd34ef56ab78cd90ef12ab34cd01',   // Admin
  m_ben: 'ab12cd34ef56ab78cd90ef12ab34cd02',    // Team
  m_clara: 'ab12cd34ef56ab78cd90ef12ab34cd03',  // Team
  m_dan: 'ab12cd34ef56ab78cd90ef12ab34cd04'     // Team
};

/** Alle Tabellen mit Musterdaten, relativ zum Zeitpunkt jetztIso (Deadlines, Zeitstempel). */
export function testDaten(jetztIso) {
  const t = new Date(jetztIso || Date.now()).getTime();
  const vor = tage => new Date(t - tage * 86400000).toISOString();
  const datum = tage => new Date(t + tage * 86400000).toISOString().slice(0, 10);
  const mitglieder = [
    { mitglied_id: 'm_anna', name: 'Anna Muster', email: 'anna.muster@example.invalid', telefon: '', funktion: 'Geschäftsführung', rolle: 'admin', typ: 'mensch', status: 'aktiv', token: TOKENS.m_anna, whatsapp_ok: false, registriert: vor(60), zuletzt_aktiv: vor(0), vertrag_std: 0, startguthaben_min: 0, abrechnung_ab: null },
    { mitglied_id: 'm_ben', name: 'Ben Beispiel', email: 'ben.beispiel@example.invalid', telefon: '', funktion: 'Entwicklung', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS.m_ben, whatsapp_ok: false, registriert: vor(55), zuletzt_aktiv: vor(1), vertrag_std: 0, startguthaben_min: 0, abrechnung_ab: null },
    { mitglied_id: 'm_clara', name: 'Clara Probe', email: 'clara.probe@example.invalid', telefon: '', funktion: 'Projektleitung', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS.m_clara, whatsapp_ok: false, registriert: vor(50), zuletzt_aktiv: vor(2), vertrag_std: 0, startguthaben_min: 0, abrechnung_ab: null },
    { mitglied_id: 'm_dan', name: 'Dan Test', email: 'dan.test@example.invalid', telefon: '', funktion: 'Support & Qualität', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS.m_dan, whatsapp_ok: false, registriert: vor(40), zuletzt_aktiv: vor(3), vertrag_std: 0, startguthaben_min: 0, abrechnung_ab: null }
  ];
  const projekte = [
    { projekt_id: 'p_alpha', name: 'Kundenprojekt Alpha', beschreibung: 'Einführung der neuen Auftragsverwaltung beim Kunden Alpha (synthetisch).', status: 'aktiv', farbe: '#1f4e79', verantwortlich: 'm_clara', reihenfolge: 1, geaendert: vor(3), links: [{ titel: 'Projektordner', url: 'https://example.invalid/alpha' }] },
    { projekt_id: 'p_intern', name: 'Interne Werkzeuge', beschreibung: 'Automatisierungen, Portal, Ablage.', status: 'aktiv', farbe: '#e07a1f', verantwortlich: 'm_ben', reihenfolge: 2, geaendert: vor(5), links: [] },
    { projekt_id: 'p_support', name: 'Support & Wartung', beschreibung: 'Laufende Betreuung der Bestandskunden.', status: 'aktiv', farbe: '#1F9D6B', verantwortlich: 'm_dan', reihenfolge: 3, geaendert: vor(8), links: [] }
  ];
  const A = (id, titel, projekt, status, prio, verantwortlich, extra) => Object.assign({ aufgabe_id: id, titel, beschreibung: '', status, prio, label: '', projekt, verantwortlich, erstellt_von: 'm_anna', deadline: '', agent_geeignet: false, erstellt: vor(12), geaendert: vor(2), erledigt_am: null }, extra || {});
  const aufgaben = [
    A('a_01', 'Anforderungen mit dem Kunden abstimmen', 'Kundenprojekt Alpha', 'Erledigt', 1, 'm_clara', { erledigt_am: vor(6), geaendert: vor(6), beschreibung: 'Ergebnis steht in der Notiz [[Kickoff Kundenprojekt Alpha]].' }),
    A('a_02', 'Datenmodell für die Auftragsverwaltung entwerfen', 'Kundenprojekt Alpha', 'In Arbeit', 1, 'm_ben', { deadline: datum(4), beschreibung: '**Ziel:** Tabellen und Beziehungen festlegen.\n\n- Aufträge\n- Positionen\n- Kunden' }),
    A('a_03', 'Testplan schreiben', 'Kundenprojekt Alpha', 'Geplant', 2, 'm_dan', { deadline: datum(10), erstellt_von: 'm_clara' }),
    A('a_04', 'Angebot für Erweiterung prüfen', 'Kundenprojekt Alpha', 'Wartet', 2, 'm_clara', { label: 'wartet auf..', deadline: datum(-2) }),
    A('a_05', 'Import-Schnittstelle testen', 'Kundenprojekt Alpha', 'Wird getestet', 1, 'm_dan', { erstellt_von: 'm_ben', deadline: datum(1) }),
    A('a_06', 'Portal-Zugänge für das Team einrichten', 'Interne Werkzeuge', 'Erledigt', 2, 'm_anna', { erledigt_am: vor(9), geaendert: vor(9) }),
    A('a_07', 'Ablagestruktur für Projektdokumente festlegen', 'Interne Werkzeuge', 'Offen', 2, 'm_clara', { label: '💬 Zu besprechen' }),
    A('a_08', 'Wöchentlichen Statusbericht automatisieren', 'Interne Werkzeuge', 'In Arbeit', 3, 'm_ben', { agent_geeignet: true }),
    A('a_09', 'Backup-Konzept dokumentieren', 'Interne Werkzeuge', 'Offen', 1, 'm_ben', { deadline: datum(-1), label: '🔥 Hohe Prio' }),
    A('a_10', 'Ticket: Rechnungsdruck zeigt falsches Datum', 'Support & Wartung', 'In Arbeit', 1, 'm_dan', { deadline: datum(0), erstellt_von: 'm_dan' }),
    A('a_11', 'Wartungsfenster mit Kunden abstimmen', 'Support & Wartung', 'Offen', 2, 'm_dan', { deadline: datum(7) }),
    A('a_12', 'Schulungsunterlagen für neue Version aktualisieren', 'Support & Wartung', 'Geplant', 3, 'm_clara', { deadline: datum(21) }),
    A('a_13', 'Serverzertifikat erneuern', 'Support & Wartung', 'Erledigt', 1, 'm_ben', { erledigt_am: vor(1), geaendert: vor(1) })
  ];
  let vid = 0;
  const V = (aufgabe_id, autor, art, text, tage) => ({ id: ++vid, aufgabe_id, autor, art, text, erstellt: vor(tage) });
  const verlauf = [
    V('a_02', 'm_clara', 'kommentar', 'Bitte die Positionen so planen, dass Teillieferungen möglich sind.', 4),
    V('a_02', 'm_ben', 'kommentar', 'Verstanden, kommt in den Entwurf. @Clara kannst du mir das Beispiel vom Kunden schicken?', 3),
    V('a_02', 'm_ben', 'status', 'Status: Offen → In Arbeit', 3),
    V('a_04', 'm_clara', 'kommentar', 'Warte auf Rückmeldung vom Kunden.', 2),
    V('a_05', 'm_dan', 'kommentar', 'Import läuft mit den Testdaten durch. Bitte prüfen und freigeben.', 1),
    V('a_05', 'm_dan', 'status', 'Status: In Arbeit → Wird getestet', 1),
    V('a_10', 'm_dan', 'kommentar', 'Ursache gefunden: Zeitzone beim Druck.', 0)
  ];
  const notizen = [
    { notiz_id: 'n_01', titel: 'Kickoff Kundenprojekt Alpha', inhalt: '## Ergebnis des Kickoffs\n\n- Start der Einführung im nächsten Quartal\n- Ansprechpartner beim Kunden: Projektleitung\n- Offene Punkte siehe [[Entscheidungen Kundenprojekt Alpha]]\n\n| Thema | Stand |\n| --- | --- |\n| Datenmodell | in Arbeit |\n| Testplan | geplant |', projekt: 'Kundenprojekt Alpha', autor: 'm_clara', geaendert_von: 'm_clara', erstellt: vor(20), geaendert: vor(6) },
    { notiz_id: 'n_02', titel: 'Entscheidungen Kundenprojekt Alpha', inhalt: '1. Teillieferungen werden unterstützt.\n2. Rechnungen entstehen erst nach Lieferung.\n\n==Noch offen:== Mahnwesen.', projekt: 'Kundenprojekt Alpha', autor: 'm_clara', geaendert_von: 'm_ben', erstellt: vor(15), geaendert: vor(4) },
    { notiz_id: 'n_03', titel: 'So nutzen wir das Team-Portal', inhalt: '::: blau Kurz erklärt\nAufgaben haben eine Prio, einen Status und eine Deadline. Wer etwas erledigt hat, setzt den Status auf **Erledigt**.\n:::\n\n- [x] Zugänge verteilt\n- [ ] Projekte angelegt\n- [ ] Erste Vorschläge gesammelt', projekt: 'Interne Werkzeuge', autor: 'm_anna', geaendert_von: 'm_anna', erstellt: vor(30), geaendert: vor(10) },
    { notiz_id: 'n_04', titel: 'Checkliste Wartungsfenster', inhalt: '- Kunden 3 Tage vorher informieren\n- Backup prüfen\n- Nach dem Update: Rechnungsdruck testen (siehe Ticket)', projekt: 'Support & Wartung', autor: 'm_dan', geaendert_von: 'm_dan', erstellt: vor(25), geaendert: vor(12) }
  ];
  const vorschlaege = [
    { vorschlag_id: 'v_01', titel: 'Aufgaben nach Deadline sortieren', text: 'In der Liste wäre eine Sortierung nach Deadline hilfreich. #Aufgaben', bereich: 'Aufgaben', status: 'neu', autor: 'm_dan', stimmen: ['m_dan', 'm_ben'], antwort: '', antwort_von: null, aufgabe_id: null, erstellt: vor(5), geaendert: vor(5) },
    { vorschlag_id: 'v_02', titel: 'Projektfarben im Kalender', text: 'Deadlines pro Projekt farbig markieren.', bereich: 'Projekte', status: 'geplant', autor: 'm_clara', stimmen: ['m_clara'], antwort: 'Gute Idee, kommt mit der nächsten Runde.', antwort_von: 'm_anna', aufgabe_id: null, erstellt: vor(9), geaendert: vor(7) },
    { vorschlag_id: 'v_03', titel: 'Dunkles Design', text: 'Ein dunkles Farbschema für den Abend. #Design', bereich: 'Sonstiges', status: 'abgelehnt', autor: 'm_ben', stimmen: ['m_ben'], antwort: 'Erst einmal nicht, wir halten das Portal schlank.', antwort_von: 'm_anna', aufgabe_id: null, erstellt: vor(14), geaendert: vor(11) }
  ];
  const papierkorb = [
    { eintrag_id: 'pk_01', art: 'aufgabe', objekt_id: 'a_90', titel: 'Alte Aufgabe: Druckertreiber prüfen', daten: Object.assign(A('a_90', 'Alte Aufgabe: Druckertreiber prüfen', 'Support & Wartung', 'Offen', 3, 'm_dan', { beschreibung: 'Ist durch das neue Gerät hinfällig.' }), { _verlauf: [V('a_90', 'm_dan', 'kommentar', 'Kann weg.', 20)] }), geloescht_von: 'm_dan', geloescht_am: vor(3) },
    { eintrag_id: 'pk_02', art: 'notiz', objekt_id: 'n_90', titel: 'Entwurf Urlaubsregelung', daten: { notiz_id: 'n_90', titel: 'Entwurf Urlaubsregelung', inhalt: 'Erster Entwurf, wurde in die Personalakte übernommen.', projekt: '', autor: 'm_anna', geaendert_von: 'm_anna', erstellt: vor(40), geaendert: vor(30) }, geloescht_von: 'm_anna', geloescht_am: vor(8) }
  ];
  const notiz_versionen = [
    { version_id: 'nv_01', notiz_id: 'n_02', titel: 'Entscheidungen Kundenprojekt Alpha', inhalt: '1. Teillieferungen werden unterstützt.\n\nNoch offen: Rechnungsstellung, Mahnwesen.', projekt: 'Kundenprojekt Alpha', geaendert_von: 'm_clara', fassung_vom: vor(15), gesichert_am: vor(4) }
  ];
  const zeiten = [
    { zeit_id: 'z_01', mitglied_id: 'm_ben', datum: datum(-1), von: '09:00', bis: '13:00', pause_min: 0, minuten: 240, taetigkeit: 'Datenmodell entworfen', projekt: 'Kundenprojekt Alpha', aufgabe_id: 'a_02', kw: isoWoche(datum(-1)), status: 'offen', kommentar: '', geaendert: vor(1) },
    { zeit_id: 'z_02', mitglied_id: 'm_dan', datum: datum(-2), von: '08:30', bis: '12:30', pause_min: 30, minuten: 210, taetigkeit: 'Ticket Rechnungsdruck analysiert', projekt: 'Support & Wartung', aufgabe_id: 'a_10', kw: isoWoche(datum(-2)), status: 'eingereicht', eingereicht_am: vor(1), kommentar: '', geaendert: vor(1) }
  ];
  const social = [
    { post_id: 's_01', datum: datum(5), uhrzeit: '09:00', kanal: 'LinkedIn', thema: 'Neue Version der Auftragsverwaltung', text: 'Was sich für unsere Kunden ändert.', status: 'In Arbeit', verantwortlich: 'm_clara', link: '', medien: '', hook: '', hashtags: '', quelle: '', format: 'Text', geaendert: vor(2) },
    { post_id: 's_02', datum: datum(12), uhrzeit: '', kanal: 'Newsletter', thema: 'Wartungsfenster im nächsten Monat', text: '', status: 'Idee', verantwortlich: 'm_dan', link: '', medien: '', hook: '', hashtags: '', quelle: '', format: 'Text', geaendert: vor(1) }
  ];
  const systeme = [
    { system_id: 'y_01', name: 'Team-Portal', bereich: 'Intern', beschreibung: 'Aufgaben, Projekte, Notizen für das Team.', status: 'läuft', werkzeug: 'n8n, Datenbank, statische Seite', link: '', verantwortlich: 'm_ben', geaendert: vor(10) },
    { system_id: 'y_02', name: 'Statusbericht-Automation', bereich: 'Intern', beschreibung: 'Wöchentliche Zusammenfassung der offenen Aufgaben.', status: 'im Bau', werkzeug: 'n8n', link: '', verantwortlich: 'm_ben', geaendert: vor(3) }
  ];
  return { team_mitglieder: mitglieder, team_projekte: projekte, team_aufgaben: aufgaben, team_aufgaben_verlauf: verlauf, team_notizen: notizen, team_vorschlaege: vorschlaege, team_papierkorb: papierkorb, team_notiz_versionen: notiz_versionen, team_zeiten: zeiten, team_abrechnung: [], team_social: social, team_systeme: systeme };
}

/** ISO-Kalenderwoche „JJJJ-Wnn“ für ein Datum JJJJ-MM-TT (gleiche Rechnung wie im Portal). */
export function isoWoche(ds) {
  const t = new Date(ds + 'T12:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd + 3);
  const j = t.getUTCFullYear(); const e = new Date(Date.UTC(j, 0, 4));
  const w = 1 + Math.round(((t - e) / 864e5 - 3 + ((e.getUTCDay() + 6) % 7)) / 7);
  return j + '-W' + String(w).padStart(2, '0');
}
