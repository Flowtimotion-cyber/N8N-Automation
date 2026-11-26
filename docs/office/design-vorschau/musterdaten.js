// Musterdaten für die Design-Vorschauen des KI Office 2.0. Alles synthetisch: keine echten Personen, Kunden oder Kosten.
// Dieselben Daten speisen alle drei Richtungen (A Kontrollraum, B Werkbank, C Stadt), damit der Vergleich fair bleibt.
// Zahlen sind erfunden, aber so gewählt, wie sie nach Paket 2 (Kennzahlen) und Paket 3 (Guthaben) im Office stehen würden.
window.MUSTER = (function () {
  const jetzt = Date.now();
  const vor = (min) => new Date(jetzt - min * 60000).toISOString();
  const RAEUME = ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung'];
  const RAUM_ICON = { Akademie: '📘', Marketing: '📣', Vertrieb: '🤝', Kundenprojekte: '🧩', Verwaltung: '🗂️' };
  const RAUM_AKZENT = { Akademie: '#A77BFF', Marketing: '#F5A94A', Vertrieb: '#3FD0D4', Kundenprojekte: '#4CCB8F', Verwaltung: '#9FA3C8' };
  const ZUSTAND_TEXT = { frei: 'frei', arbeitet: 'arbeitet', wartet_freigabe: 'wartet auf Freigabe', wartet_rueckmeldung: 'wartet auf Antwort', warteschlange: 'Auftrag wartet', pausiert: 'pausiert (Guthaben leer)' };
  const ZUSTAND_FARBE = { frei: '#9A98B5', arbeitet: '#1F9D6B', wartet_freigabe: '#E98A15', wartet_rueckmeldung: '#8B5CF6', warteschlange: '#5B6EE6', pausiert: '#D9452F' };

  // Je Agent: Zustand, aktuelle Aufgabe, letztes Ergebnis, Guthaben (Monat), Kennzahlen der letzten 4 Wochen, Wirkungsfeld der Rolle.
  // kz.trend = Kosten je abgenommenem Ergebnis in Euro, Woche -3 bis heute.
  const agenten = [
    { id: 'akademie-redakteur', name: 'Akademie-Redakteur', raum: 'Akademie', modell: 'claude-sonnet-5-5', ausfuehrer: 'claude-code', zustand: 'arbeitet', aufgabe: 'Merkblatt Modul 1.3 „Dein eigener Server“ überarbeiten', letztes: { titel: 'Quizfragen Modul 1.2 (10 Fragen)', pruef: 'abgenommen', zeit: vor(190) }, budget: { monat: 8, verbraucht: 3.12 }, kz: { ergebnisse: 11, abgenommen: 9, zurueck: 1, offen: 1, kosten: 3.12, dauer_min: 14, trend: [0.41, 0.38, 0.33, 0.35] }, wirkung: { text: 'Lektionen fertig', wert: 4 } },
    { id: 'kurs-waechter', name: 'Kurs-Wächter', raum: 'Akademie', modell: 'claude-haiku-5-5', ausfuehrer: 'hermes', zustand: 'frei', aufgabe: null, letztes: { titel: 'Kursstatus 08.11.: 2 neue Fragen, keine Störung', pruef: 'ungeprueft', zeit: vor(420) }, budget: { monat: 3, verbraucht: 0.44 }, kz: { ergebnisse: 14, abgenommen: 12, zurueck: 0, offen: 2, kosten: 0.44, dauer_min: 2, trend: [0.04, 0.04, 0.03, 0.04] }, wirkung: { text: 'Störungen früh gemeldet', wert: 1 } },
    { id: 'marketing-texter', name: 'Marketing-Texter', raum: 'Marketing', modell: 'claude-sonnet-5-5', ausfuehrer: 'n8n', zustand: 'wartet_freigabe', aufgabe: 'LinkedIn-Beitrag KW 46: „Was eine KI-Weiterbildung wirklich kostet“', letztes: { titel: 'Newsletter November, 3 Betreffzeilen', pruef: 'abgenommen', zeit: vor(95) }, budget: { monat: 8, verbraucht: 5.60 }, kz: { ergebnisse: 18, abgenommen: 15, zurueck: 2, offen: 1, kosten: 5.60, dauer_min: 6, trend: [0.45, 0.40, 0.37, 0.37] }, wirkung: { text: 'Texte veröffentlicht', wert: 9 } },
    { id: 'social-planer', name: 'Social-Planer', raum: 'Marketing', modell: 'claude-haiku-5-5', ausfuehrer: 'n8n', zustand: 'frei', aufgabe: null, letztes: { titel: 'Redaktionsplan KW 46 bis 48', pruef: 'zurueckgewiesen', zeit: vor(1300) }, budget: { monat: 3, verbraucht: 1.05 }, kz: { ergebnisse: 9, abgenommen: 4, zurueck: 4, offen: 1, kosten: 1.05, dauer_min: 3, trend: [0.18, 0.22, 0.26, 0.26] }, wirkung: { text: 'Lücken im Plan geschlossen', wert: 2 } },
    { id: 'medien-cutter', name: 'Medien-Cutter', raum: 'Marketing', modell: 'claude-sonnet-5-5', ausfuehrer: 'claude-code', zustand: 'warteschlange', aufgabe: 'Rohvideo „Modul 1.3 Einstieg“ zu zwei 9:16-Clips schneiden', letztes: { titel: 'Clip „Fördercheck in 60 Sekunden“', pruef: 'abgenommen', zeit: vor(2900) }, budget: { monat: 6, verbraucht: 1.90 }, kz: { ergebnisse: 3, abgenommen: 2, zurueck: 0, offen: 1, kosten: 1.90, dauer_min: 41, trend: [null, 0.95, 0.95, 0.95] }, wirkung: { text: 'Clips geschnitten', wert: 2 } },
    { id: 'vertrieb-recherche', name: 'Vertriebs-Recherche', raum: 'Vertrieb', modell: 'claude-sonnet-5-5', ausfuehrer: 'claude-code', zustand: 'arbeitet', aufgabe: 'Firmenliste Region Süd: 20 Betriebe mit QCG-Förderfähigkeit prüfen', letztes: { titel: 'Dossier Metallbau Region Süd (12 Firmen)', pruef: 'abgenommen', zeit: vor(60) }, budget: { monat: 10, verbraucht: 4.20 }, kz: { ergebnisse: 16, abgenommen: 14, zurueck: 1, offen: 1, kosten: 4.20, dauer_min: 19, trend: [0.38, 0.33, 0.30, 0.30] }, wirkung: { text: 'qualifizierte Firmen', wert: 31, detail: '4 Termine daraus' } },
    { id: 'angebots-pruefer', name: 'Angebots-Prüfer', raum: 'Vertrieb', modell: 'claude-opus-5-5', ausfuehrer: 'claude-code', zustand: 'pausiert', aufgabe: null, letztes: { titel: 'Prüfbericht Angebot Musterfirma (7 Befunde)', pruef: 'abgenommen', zeit: vor(2200) }, budget: { monat: 5, verbraucht: 5.00 }, kz: { ergebnisse: 5, abgenommen: 5, zurueck: 0, offen: 0, kosten: 5.00, dauer_min: 23, trend: [0.90, 1.00, 1.00, 1.00] }, wirkung: { text: 'Angebote geprüft', wert: 5 } },
    { id: 'kunden-entwickler', name: 'Kunden-Entwickler', raum: 'Kundenprojekte', modell: 'claude-sonnet-5-5', ausfuehrer: 'codex', zustand: 'wartet_rueckmeldung', aufgabe: 'n8n-Workflow Angebotsannahme: Welches Feld ist der Schlüssel, Kundennummer oder E-Mail?', letztes: { titel: 'Datenfluss-Skizze Angebotsannahme', pruef: 'ungeprueft', zeit: vor(800) }, budget: { monat: 6, verbraucht: 2.35 }, kz: { ergebnisse: 6, abgenommen: 4, zurueck: 1, offen: 1, kosten: 2.35, dauer_min: 35, trend: [0.60, 0.55, 0.59, 0.59] }, wirkung: { text: 'Workflows gebaut', wert: 3 } },
    { id: 'architektur-review', name: 'Architektur-Review', raum: 'Kundenprojekte', modell: 'claude-opus-5-5', ausfuehrer: 'claude-code', zustand: 'frei', aufgabe: null, letztes: { titel: 'Review Datenfluss Kunde (3 Befunde, 1 kritisch)', pruef: 'abgenommen', zeit: vor(4100) }, budget: { monat: 5, verbraucht: 1.80 }, kz: { ergebnisse: 2, abgenommen: 2, zurueck: 0, offen: 0, kosten: 1.80, dauer_min: 28, trend: [null, 0.90, 0.90, 0.90] }, wirkung: { text: 'Reviews vor Livegang', wert: 2 } },
    { id: 'verwaltung-status', name: 'Verwaltungs-Status', raum: 'Verwaltung', modell: 'claude-haiku-5-5', ausfuehrer: 'n8n', zustand: 'frei', aufgabe: null, letztes: { titel: 'Wochenstand KW 45', pruef: 'abgenommen', zeit: vor(2600) }, budget: { monat: 2, verbraucht: 0.00 }, kz: { ergebnisse: 4, abgenommen: 4, zurueck: 0, offen: 0, kosten: 0, dauer_min: 1, trend: [0, 0, 0, 0] }, wirkung: { text: 'Wochenstände', wert: 4, detail: 'deterministisch, 0 €' } },
    { id: 'server-waechter', name: 'Server-Wächter', raum: 'Verwaltung', modell: 'claude-haiku-5-5', ausfuehrer: 'hermes', zustand: 'frei', aufgabe: null, letztes: { titel: 'Backup-Prüfung: alle Sicherungen vorhanden', pruef: 'ungeprueft', zeit: vor(300) }, budget: { monat: 2, verbraucht: 0.21 }, kz: { ergebnisse: 8, abgenommen: 6, zurueck: 0, offen: 2, kosten: 0.21, dauer_min: 1, trend: [0.03, 0.03, 0.04, 0.03] }, wirkung: { text: 'Prüfungen ohne Befund', wert: 8 } },
    { id: 'rekruiter', name: 'Rekruiter', raum: 'Verwaltung', modell: 'claude-sonnet-5-5', ausfuehrer: 'claude-code', zustand: 'frei', aufgabe: null, letztes: { titel: 'Steckbrief „Newsletter-Redakteur“ zur Freigabe', pruef: 'zurueckgewiesen', zeit: vor(7000) }, budget: { monat: 2, verbraucht: 0.35 }, kz: { ergebnisse: 1, abgenommen: 0, zurueck: 1, offen: 0, kosten: 0.35, dauer_min: 12, trend: [null, null, null, null] }, wirkung: { text: 'Steckbriefe', wert: 1 } },
    { id: 'orchestrierer', name: 'Orchestrierer', raum: 'Zentrale', modell: 'claude-sonnet-5-5', ausfuehrer: 'n8n', zustand: 'arbeitet', aufgabe: 'Team „Modul 1.3 fertigstellen“: 2 Teilaufträge, 1 offen', letztes: { titel: 'Teamergebnis „Wochenmail Kurs“', pruef: 'abgenommen', zeit: vor(1500) }, budget: { monat: 4, verbraucht: 0.00 }, kz: { ergebnisse: 5, abgenommen: 4, zurueck: 0, offen: 1, kosten: 0, dauer_min: 48, trend: [0, 0, 0, 0] }, wirkung: { text: 'Teams zusammengeführt', wert: 5 } },
    { id: 'pa-assistent', name: 'PA-Assistent', raum: 'Verwaltung', modell: 'claude-sonnet-5-5', ausfuehrer: 'hermes', zustand: 'frei', aufgabe: null, letztes: null, budget: { monat: 3, verbraucht: 0 }, kz: { ergebnisse: 0, abgenommen: 0, zurueck: 0, offen: 0, kosten: 0, dauer_min: 0, trend: [null, null, null, null] }, wirkung: { text: 'noch kein Ausführer', wert: null } }
  ];

  const projekte = [
    { id: 'p_kurs', name: 'Akademie-Kurs', raum: 'Akademie', farbe: '#7B3FE4', verantwortlich: 'Kurt', offen: 5, erledigt: 12, laufend: 2, freigaben: 0, fehler: 0, kosten: 3.56, letzte: 'Redakteur: Merkblatt-Entwurf abgelegt', agenten: ['akademie-redakteur', 'kurs-waechter', 'orchestrierer'], naechster: 'Screenshots für Teil 3 einbauen' },
    { id: 'p_web', name: 'Webseite', raum: 'Marketing', farbe: '#5B6EE6', verantwortlich: 'Lillien', offen: 2, erledigt: 7, laufend: 0, freigaben: 0, fehler: 0, kosten: 0.80, letzte: 'Texter: Landingpage-Text Fördercheck überarbeitet', agenten: ['marketing-texter', 'architektur-review'], naechster: 'Impressum auf neue GmbH umstellen' },
    { id: 'p_social', name: 'Social Media', raum: 'Marketing', farbe: '#E98A15', verantwortlich: 'Lillien', offen: 4, erledigt: 9, laufend: 1, freigaben: 1, fehler: 0, kosten: 7.75, letzte: 'Texter wartet auf Freigabe: LinkedIn KW 46', agenten: ['marketing-texter', 'social-planer', 'medien-cutter'], naechster: 'Instagram-Reel Imagefilm' },
    { id: 'p_vertrieb', name: 'Vertrieb Herbst', raum: 'Vertrieb', farbe: '#1FA9B0', verantwortlich: 'Murat', offen: 3, erledigt: 6, laufend: 1, freigaben: 0, fehler: 0, kosten: 9.20, letzte: 'Recherche: Dossier Metallbau abgenommen', agenten: ['vertrieb-recherche', 'angebots-pruefer'], naechster: 'Angebot Musterfirma prüfen (Prüfer pausiert)' },
    { id: 'p_kunde', name: 'Kundenprojekt Musterfirma', raum: 'Kundenprojekte', farbe: '#1F9D6B', verantwortlich: 'Timo', offen: 2, erledigt: 1, laufend: 1, freigaben: 0, fehler: 1, kosten: 4.15, letzte: 'Entwickler fragt: Schlüsselfeld?', agenten: ['kunden-entwickler', 'architektur-review'], naechster: 'Rückfrage beantworten' },
    { id: 'p_verw', name: 'Verwaltung & Finanzen', raum: 'Verwaltung', farbe: '#62607E', verantwortlich: 'Timo', offen: 3, erledigt: 14, laufend: 0, freigaben: 0, fehler: 0, kosten: 0.56, letzte: 'Server-Wächter: Backups geprüft', agenten: ['verwaltung-status', 'server-waechter', 'rekruiter', 'pa-assistent'], naechster: 'Rechnung Lohnbüro freigeben' }
  ];

  // Live-Ticker: Agenten sprechen in Ich-Form (wie auf der Mitbewerberseite), kurz, mit Zahl und Quelle. Neueste zuerst.
  const ticker = [
    { zeit: vor(2), agent: 'vertrieb-recherche', art: 'schritt', text: 'Ich habe 14 von 20 Betrieben gegen das Handelsregister geprüft. 9 kommen für die Förderberatung in Frage.' },
    { zeit: vor(6), agent: 'marketing-texter', art: 'freigabe', text: 'Mein LinkedIn-Entwurf für KW 46 ist fertig. Ich warte auf deine Freigabe, bevor etwas rausgeht.' },
    { zeit: vor(11), agent: 'akademie-redakteur', art: 'artefakt', text: 'Merkblatt Modul 1.3 als Entwurf abgelegt, 1.840 Wörter, du-Form. Kostet bisher 0,28 €.' },
    { zeit: vor(18), agent: 'kunden-entwickler', art: 'rueckfrage', text: 'Ich brauche eine Entscheidung: Ist die Kundennummer oder die E-Mail der Schlüssel im Angebots-Workflow?' },
    { zeit: vor(27), agent: 'orchestrierer', art: 'tool', text: 'Team „Modul 1.3 fertigstellen“: Teil 1 an den Redakteur, Teil 2 an den Kurs-Wächter delegiert.' },
    { zeit: vor(44), agent: 'server-waechter', art: 'schritt', text: 'Backups der letzten 7 Nächte sind vollständig. Kein Befund, 0,03 €.' },
    { zeit: vor(60), agent: 'vertrieb-recherche', art: 'abnahme', text: 'Murat hat mein Dossier „Metallbau Region Süd“ fachlich abgenommen. 12 Firmen, 4 davon mit Terminwunsch.' },
    { zeit: vor(95), agent: 'marketing-texter', art: 'abnahme', text: 'Lillien hat den Newsletter November abgenommen. Betreffzeile 2 wurde gewählt.' },
    { zeit: vor(130), agent: 'angebots-pruefer', art: 'fehler', text: 'Mein Guthaben für November ist aufgebraucht (5,00 € von 5,00 €). Ich starte keine neuen Prüfungen, bis Timo auffüllt.' },
    { zeit: vor(190), agent: 'akademie-redakteur', art: 'abnahme', text: 'Kurt hat die 10 Quizfragen für Modul 1.2 abgenommen. Zwei Tippfehler hat er selbst korrigiert.' },
    { zeit: vor(300), agent: 'kurs-waechter', art: 'artefakt', text: 'Kursstatus: 2 neue Fragen in der Community, keine Störung auf der Kursseite.' },
    { zeit: vor(420), agent: 'social-planer', art: 'abnahme', text: 'Lillien hat meinen Redaktionsplan zurückgewiesen: „Zu viele Termine am Wochenende.“ Ich merke mir das.' }
  ];

  // Ein Run im Detail für die Zeitleiste: Kosten je Schritt, Dauer, Abnahme.
  const run = {
    id: 'run_mxk4f2a9b7c1', agent: 'vertrieb-recherche', projekt: 'Vertrieb Herbst', auftraggeber: 'Murat', status: 'abgeschlossen', abgenommen: true,
    auftrag: 'Dossier Metallbau Region Süd: 12 Betriebe mit 20 bis 200 Mitarbeitenden, Förderfähigkeit QCG, Ansprechpartner aus Impressum, je Firma ein Aufhänger für das Erstgespräch.',
    budget: 0.60, kosten: 0.31, kosten_art: 'gemessen', tokens_ein: 48200, tokens_aus: 9100, dauer_min: 19, ergebnis_typ: 'Dossier', wirkung: '12 qualifizierte Firmen, 4 Termine',
    ereignisse: [
      { zeit: vor(84), art: 'status', titel: 'Auftrag angelegt von Murat (Versuch 1 von 2)', kosten: 0 },
      { zeit: vor(83), art: 'status', titel: 'Warteschlange → in Arbeit: Abholer hat übernommen', kosten: 0 },
      { zeit: vor(82), art: 'tool', titel: 'Aufgaben und Projektkontext gelesen', tool: 'aufgaben_lesen', kosten: 0.01 },
      { zeit: vor(79), art: 'quelle', titel: '20 Treffer aus öffentlichen Verzeichnissen (Handelsregister, Webseiten)', tool: 'web_recherche', kosten: 0.08 },
      { zeit: vor(74), art: 'schritt', titel: 'Betriebsgröße und Branche je Firma geprüft, 8 ausgeschlossen', kosten: 0.07 },
      { zeit: vor(69), art: 'schritt', titel: 'Je Firma Aufhänger formuliert (Website-Auffälligkeit, Stellenanzeige)', kosten: 0.11 },
      { zeit: vor(66), art: 'artefakt', titel: 'Ergebnis: Dossier Metallbau Region Süd (12 Firmen)', tool: 'notiz_speichern', kosten: 0.04 },
      { zeit: vor(65), art: 'status', titel: 'in Arbeit → abgeschlossen (technisch): 0,31 € gemessen, 19 Minuten', kosten: 0 },
      { zeit: vor(60), art: 'abnahme', titel: 'Fachlich abgenommen von Murat: „4 davon rufe ich diese Woche an.“', kosten: 0 }
    ]
  };

  // Schwellen für die Skalierungsregel (Paket 3). Vorschlag, Timo entscheidet.
  const SCHWELLEN = { kosten_je_ergebnis_max: 0.50, zurueck_quote_max: 0.20, mindest_ergebnisse: 3, wochen: 2 };
  function bewertung(a) {
    const k = a.kz;
    const bewertet = k.abgenommen + k.zurueck;
    const quote = bewertet ? k.zurueck / bewertet : null;
    const je = k.abgenommen ? k.kosten / k.abgenommen : null;
    if (a.budget.monat > 0 && a.budget.verbraucht >= a.budget.monat) return { stufe: 'guthaben_leer', text: 'Guthaben leer', je, quote };
    if (k.ergebnisse < SCHWELLEN.mindest_ergebnisse) return { stufe: 'zu_wenig', text: 'zu wenig Daten', je, quote };
    if (quote !== null && quote > SCHWELLEN.zurueck_quote_max) return { stufe: 'liefert_nicht', text: 'liefert nicht', je, quote };
    if (je !== null && je <= SCHWELLEN.kosten_je_ergebnis_max && quote !== null && quote <= SCHWELLEN.zurueck_quote_max) return { stufe: 'liefert', text: 'liefert', je, quote };
    return { stufe: 'beobachten', text: 'beobachten', je, quote };
  }
  // Skalierungskarten: nie automatisch, jede Karte ist eine Freigabe für Timo.
  const karten = [
    { art: 'skalieren', agent: 'vertrieb-recherche', titel: 'Vertriebs-Recherche skalieren', grund: '14 von 16 Ergebnissen abgenommen (6 % zurückgewiesen), 0,30 € je abgenommenem Dossier, zwei Wochen stabil unter der Schwelle.', optionen: ['Guthaben auf 15 € erhöhen', 'Zweite Instanz für Segment „Handwerk Region Nord“'] },
    { art: 'skalieren', agent: 'marketing-texter', titel: 'Marketing-Texter skalieren', grund: '15 von 18 abgenommen (12 % zurückgewiesen), 0,37 € je Text. Guthaben zu 70 % verbraucht, Monat halb vorbei.', optionen: ['Guthaben auf 12 € erhöhen'] },
    { art: 'pausieren', agent: 'social-planer', titel: 'Social-Planer pausieren', grund: '4 von 8 bewerteten Ergebnissen zurückgewiesen (50 %). Kosten je abgenommenem Ergebnis steigen seit drei Wochen.', optionen: ['Pausieren und Auftragstext überarbeiten', 'Weiter beobachten (2 Wochen)'] },
    { art: 'auffuellen', agent: 'angebots-pruefer', titel: 'Angebots-Prüfer: Guthaben leer', grund: '5,00 € von 5,00 € verbraucht, alle 5 Prüfungen abgenommen. 1 Auftrag wartet in der Warteschlange und startet nicht.', optionen: ['Auf 8 € auffüllen', 'Bis Monatsende pausiert lassen'] }
  ];

  const eur = x => x == null ? '–' : x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const prozent = x => x == null ? '–' : Math.round(x * 100) + ' %';
  const relativ = s => { const m = Math.round((jetzt - new Date(s).getTime()) / 60000); if (m < 1) return 'gerade eben'; if (m < 60) return 'vor ' + m + ' Min.'; const h = Math.round(m / 60); if (h < 48) return 'vor ' + h + ' Std.'; return 'vor ' + Math.round(h / 24) + ' Tagen'; };
  const uhr = s => new Date(s).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const agent = id => agenten.find(a => a.id === id);

  return { jetzt, RAEUME, RAUM_ICON, RAUM_AKZENT, ZUSTAND_TEXT, ZUSTAND_FARBE, agenten, projekte, ticker, run, SCHWELLEN, bewertung, karten, eur, prozent, relativ, uhr, esc, agent };
})();
