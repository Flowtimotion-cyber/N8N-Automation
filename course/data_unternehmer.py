# Leadmagnet für Unternehmer: Modul 1 „Die volle Tasse – KI im Betrieb verstehen“
# Offen für alle (ohne Kurscode). Modul 2 (Umsetzung mit n8n) gibt es nach einem kurzen Gespräch.
TITLE = "Die volle Tasse: KI im Betrieb verstehen"
SUBTITLE = "Modul 1 · für Unternehmer · ca. 20 Minuten"
INTRO = ("Du bist nicht zu langsam. Deine Tasse ist zu voll: Mails, Angebote, Abos, Prognosen. "
         "In 20 Minuten verstehst du, welche Arbeit KI-Agenten in deinem Betrieb übernehmen können, "
         "was hinter Begriffen wie Claude Code, n8n und MCP steckt, wo der Datenschutz greift und wo du "
         "am besten anfängst. Ohne Technik-Vorwissen.")
PROMISE = [
    ["Zeit zurück", "Routine läuft automatisch: Anfragen sortieren, Angebote vorbereiten, Berichte zusammenstellen. Du gewinnst Zeit für Führung und Kunden."],
    ["Eigene Werkzeuge statt Abos", "Wer das Fundament versteht, lässt sich Werkzeuge bauen, die zum eigenen Ablauf passen, statt sich an fünf Programme anzupassen."],
    ["Dein Team zieht mit", "Deine Mitarbeiter können das in einer geförderten Schulung lernen, bis zu 100 % der Kurskosten plus Zuschuss zum Gehalt."],
]

LEVELS = [
    {"id": 1, "title": "Die volle Tasse", "videos": ["U0", "UW", "U1"],
     "merksatz": "Was jede Woche gleich abläuft, gehört nicht auf deinen Tisch, sondern in eine Automation.",
     "kernpunkte": [
         "In fast jedem Betrieb laufen Stunden pro Woche in Routine: Daten abtippen, Standardmails, Angebote aus Vorlagen, Zahlen zusammensuchen.",
         "Das kostet nicht nur Zeit, sondern Klarheit. Wer den ganzen Tag reagiert, hat keinen Kopf für die Entscheidungen, die nur er treffen kann.",
         "KI-Agenten und Automationen nehmen diese Routine ab. Sie arbeiten nach deinen Regeln, rund um die Uhr, und werden nicht müde.",
         "Rechnung für einen Betrieb mit 10 Leuten: Spart jeder nur 2 Stunden Routine pro Woche, sind das über 900 Stunden im Jahr.",
         "Urteil, Beziehung und Verantwortung bleiben beim Menschen. Die KI leert die Tasse, damit Platz für das Wesentliche ist."],
     "type": "sliders",
     "intro": "Wie voll ist deine Tasse? Schieb die Regler, es gibt kein Richtig oder Falsch.",
     "sliders": [
         {"id": "hours", "q": "Wie viele Stunden pro Woche verbringst du selbst mit Routine (Mails, Angebote, Abtippen, Suchen)?", "min": 0, "max": 20, "step": 1, "val": 6, "unit": " Std.", "maxlabel": "20+ Std."},
         {"id": "tools", "q": "Für wie viele Software-Abos zahlt dein Betrieb (CRM, Kalender, Formulare, Newsletter …)?", "min": 0, "max": 15, "step": 1, "val": 5, "unit": "", "maxlabel": "15+"},
         {"id": "team", "q": "Wie viele Mitarbeiter arbeiten bei dir?", "min": 1, "max": 100, "step": 1, "val": 10, "unit": "", "maxlabel": "100+"}],
     "xp": 50},
    {"id": 2, "title": "Wer macht was?", "videos": ["U2"],
     "merksatz": "Claude Code baut, Athena stellt ein, n8n arbeitet, MCP verbindet, das Gedächtnis erinnert.",
     "kernpunkte": [
         "Ein KI-Chat wie ChatGPT redet. Ein KI-Agent arbeitet: Er hat Zugriff auf Werkzeuge und erledigt Aufgaben Schritt für Schritt.",
         "Claude Code ist der Baumeister. Du beschreibst in normaler Sprache, was du brauchst, und er baut, testet und repariert. Voraussetzung ist das Claude-Abo für etwa 20 € im Monat.",
         "Athena ist unsere Recruiterin: ein Agent, der für dich weitere Agenten „einstellt“. Sie führt ein kurzes Gespräch, schreibt die Stellenbeschreibung und legt den neuen Agenten an.",
         "n8n ist der Motor. Hier laufen deine Abläufe automatisch, auch nachts. n8n verbindet Mail, Kalender, CRM, Buchhaltung und mehr.",
         "MCP ist die Steckdose: ein offener Standard, über den ein KI-Agent Werkzeuge wie n8n bedienen darf. Du bestimmst, was er sehen und tun darf.",
         "Das Firmen-Gedächtnis speichert dein Wissen so, dass Agenten es finden: ein RAG-System auf Supabase, auf Wunsch kombiniert mit Obsidian für eure Notizen. Es läuft auf deinem eigenen oder einem gemieteten Server, deine Daten bleiben bei dir.",
         "Und du bist nie allein: Hinter den Agenten stehen echte Ansprechpartner, die täglich mit diesen Systemen arbeiten und rund um die Uhr an deiner Seite sind, wenn der KI-Agent nicht schon weiterhilft."],
     "type": "dnd",
     "intro": "Wer macht was? Ordne jede Aussage der richtigen Rolle zu.",
     "cats": ["Claude Code (Baumeister)", "Athena (Recruiterin)", "n8n (Motor)", "MCP (Steckdose)"],
     "items": [
         {"t": "Baut aus deiner Beschreibung eine fertige Automation", "c": "Claude Code (Baumeister)", "f": "Der Baumeister setzt um, was du beschreibst."},
         {"t": "Fragt nach, welche Aufgaben ein neuer Agent übernehmen soll, und schreibt seine Stellenbeschreibung", "c": "Athena (Recruiterin)", "f": "Athena stellt neue Agenten ein, wie eine Personalchefin."},
         {"t": "Schickt jeden Montag um 7 Uhr den Wochenbericht", "c": "n8n (Motor)", "f": "n8n führt Abläufe zu festen Zeiten aus, ohne dass jemand daneben sitzt."},
         {"t": "Erlaubt einem KI-Agenten, Werkzeuge in n8n zu bedienen", "c": "MCP (Steckdose)", "f": "MCP ist die standardisierte Verbindung zwischen KI und Werkzeug."},
         {"t": "Findet den Fehler in einem Ablauf und repariert ihn", "c": "Claude Code (Baumeister)", "f": "Testen und Reparieren gehört zum Baumeister."},
         {"t": "Läuft rund um die Uhr und protokolliert jeden Durchlauf", "c": "n8n (Motor)", "f": "In n8n siehst du jeden Durchlauf grün oder rot."}],
     "xp_each": 10},
    {"id": 3, "title": "Die Bausteine einer Automation", "videos": ["U3"],
     "merksatz": "Ein Auslöser startet, Schritte erledigen die Arbeit, Zugangsdaten geben die Erlaubnis.",
     "kernpunkte": [
         "Auslöser (Trigger): startet den Ablauf, z. B. ein Kontaktformular, eine neue Mail oder „jeden Montag um 7 Uhr“.",
         "Schritt (Node): eine Station mit genau einer Aufgabe, z. B. Kontakt anlegen oder Mail senden.",
         "Ablauf (Workflow): alle Schritte in der richtigen Reihenfolge. Wie ein Rezept.",
         "Zugangsdaten (Credentials): die Erlaubnis, z. B. in dein CRM zu schreiben. Die legst du selbst an, nie die KI.",
         "API und Webhook sind die Leitungen: Über eine API fragt n8n bei einem Programm nach. Über einen Webhook meldet sich ein Programm von selbst, sobald etwas passiert."],
     "type": "dnd",
     "intro": "Ordne jedes Beispiel dem richtigen Baustein zu. Ziehen oder antippen, dann die Kategorie antippen.",
     "cats": ["Auslöser", "Schritt", "Zugangsdaten", "Leitung (API/Webhook)"],
     "items": [
         {"t": "Ein Kunde schickt das Anfrageformular ab", "c": "Auslöser", "f": "Das Formular startet den Ablauf."},
         {"t": "Jeden Freitag um 16 Uhr", "c": "Auslöser", "f": "Auch eine Uhrzeit kann einen Ablauf starten."},
         {"t": "Angebot aus der Vorlage erstellen", "c": "Schritt", "f": "Eine einzelne Aufgabe im Ablauf ist ein Schritt."},
         {"t": "Der Schlüssel, mit dem n8n in dein CRM schreiben darf", "c": "Zugangsdaten", "f": "Zugangsdaten hinterlegst du selbst, sicher in n8n."},
         {"t": "Der Online-Shop meldet sofort jede neue Bestellung", "c": "Leitung (API/Webhook)", "f": "Das ist ein Webhook: Das Programm klingelt von selbst."},
         {"t": "n8n holt jeden Morgen die offenen Rechnungen aus der Buchhaltung", "c": "Leitung (API/Webhook)", "f": "Das ist eine API-Abfrage: n8n fragt aktiv nach."}],
     "xp_each": 10},
    {"id": 4, "title": "Datenschutz: die Ampel", "videos": ["U4"],
     "merksatz": "Grün darf in die Cloud, Gelb nur mit Vertrag, Rot bleibt bei lokaler KI im Haus.",
     "kernpunkte": [
         "Grün: öffentliche Infos und Testdaten. Ein normales KI-Konto ist in Ordnung.",
         "Gelb: interne Abläufe, Vorlagen, Preise. Nur mit geschäftlichem KI-Konto, Vertrag zur Auftragsverarbeitung und der Einstellung „nicht zum Training verwenden“.",
         "Rot: Personal-, Gesundheits- und Kundendaten. Nur mit lokaler KI, also einem Modell auf eurem eigenen Rechner oder Server (z. B. mit Ollama). Dann verlässt kein Datensatz das Haus.",
         "n8n kann auf eurem eigenen Server laufen. Zusammen mit lokaler KI bleiben auch sensible Abläufe im Betrieb.",
         "Immer zuerst mit Testdaten arbeiten. Echte Daten erst, wenn alles geprüft und freigegeben ist. Den Datenschutzbeauftragten früh einbinden.",
         "Wie ihr lokale KI einrichtet, lernen deine Mitarbeiter in der Momentum-Schulung, oder wir setzen es für euch um."],
     "type": "binary",
     "intro": "Welche Ampelfarbe passt? Entscheide dich.",
     "items": [
         {"q": "Du lässt dir einen Werbetext für eure Webseite schreiben.", "o": ["Grün", "Rot"], "a": 0, "r": "Öffentliche Inhalte sind unkritisch."},
         {"q": "Die KI soll Krankmeldungen deiner Mitarbeiter sortieren.", "o": ["Rot", "Gelb"], "a": 0, "r": "Gesundheitsdaten sind besonders geschützt: nur lokal."},
         {"q": "Die KI soll aus euren Preislisten Angebote vorbereiten.", "o": ["Gelb", "Rot"], "a": 0, "r": "Interne Daten: geschäftliches Konto mit Vertrag und ohne Training."},
         {"q": "Kundendaten dürfen das Haus nicht verlassen. Was passt?", "o": ["n8n und lokale KI auf eigenem Server", "Ein beliebiger KI-Chat im Browser"], "a": 0, "r": "Laufen n8n und das Modell bei euch, bleiben die Daten im Haus."},
         {"q": "Du testest deinen ersten Ablauf. Welche Daten nimmst du?", "o": ["Testdaten", "Echte Kundendaten"], "a": 0, "r": "Erst testen, dann echte Daten, wenn alles freigegeben ist."}],
     "xp_each": 15},
    {"id": 5, "title": "Was die KI übernimmt und was bei dir bleibt", "videos": ["U5"],
     "merksatz": "Die KI beantwortet Was-Fragen. Die Wer-Fragen beantwortest du.",
     "kernpunkte": [
         "Was-Fragen haben eine Antwort in deinen Daten: Was kostet das Angebot? Was hat der Kunde letztes Jahr bestellt? Was steht im Vertrag? Die beantwortet die KI in Sekunden.",
         "Wer-Fragen beantwortet nur ein Mensch: Wer willst du als Unternehmer sein? Wem vertraust du? Wofür steht dein Betrieb?",
         "Gute Kandidaten für Automationen: regelmäßig, feste Regeln, mehrere Programme. Dreimal Ja heißt: anfangen.",
         "Nicht automatisieren: Verhandlungen, schwierige Gespräche, Führung, Feedback. Hier zählt die Begegnung von Mensch zu Mensch.",
         "Fang klein an: ein häufiger, einfacher Ablauf mit wenig Risiko. Der erste Erfolg überzeugt auch das Team."],
     "type": "rapid", "image": "IMG_SORT", "seconds": 6,
     "intro": "Automatisieren, ja oder nein? Du hast pro Karte 6 Sekunden.",
     "items": [
         {"t": "Neue Anfragen aus dem Kontaktformular ins CRM übernehmen", "a": True, "r": "regelmäßig, klare Regel, zwei Programme"},
         {"t": "Angebot aus Vorlage und Preisliste vorbereiten", "a": True, "r": "wiederkehrend, du prüfst nur noch"},
         {"t": "Mit einem Großkunden über den Preis verhandeln", "a": False, "r": "Beziehung und Urteil"},
         {"t": "Eingangsrechnungen aus Mails auslesen und ablegen", "a": True, "r": "wiederkehrend und regelbasiert"},
         {"t": "Einem Mitarbeiter ein schwieriges Feedback geben", "a": False, "r": "persönlich, braucht Fingerspitzengefühl"},
         {"t": "Jeden Montag die Wochenzahlen aus drei Programmen sammeln", "a": True, "r": "regelmäßig, mehrere Programme"},
         {"t": "Entscheiden, in welchen Markt ihr nächstes Jahr geht", "a": False, "r": "Wer-Frage: Strategie bleibt bei dir"},
         {"t": "Terminerinnerung an Kunden einen Tag vorher", "a": True, "r": "feste Regel mit Datum"}],
     "xp_each": 10},
    {"id": 6, "title": "Eigene Werkzeuge statt Abos", "videos": ["U6"],
     "merksatz": "Erst schauen, dann bauen: Gut beschrieben ist halb gebaut.",
     "kernpunkte": [
         "Mit Claude Code und n8n baust du dir Werkzeuge, die genau zu deinem Ablauf passen: eine Zeiterfassung, eine Aufgabenliste, ein Angebots-Assistent. Oft ersetzt das ein Abo.",
         "Unser eigenes Team-Portal mit Aufgaben, Zeiten und Vertrieb haben KI-Agenten gebaut. Dieser Kurs auch.",
         "Bevor gebaut wird, schaust du hin: Wie läuft der Ablauf heute wirklich? Ein Agent baut genau das, was du beschreibst.",
         "Ein guter Steckbrief hat fünf Teile: Auslöser, Schritte, Programme, Ergebnis, Fehlerfall.",
         "Diesen Steckbrief nimmst du mit in Modul 2. Dort verbindest du Claude Code mit n8n, und Athena stellt deinen n8n-Agenten ein, der daraus deinen ersten Ablauf baut."],
     "type": "errors",
     "intro": "In diesem Steckbrief „Anfrage beantworten“ stecken drei Fehler. Tippe die fehlerhaften Zeilen an.",
     "lines": [
         {"l": "Auslöser", "t": "Wenn irgendwas reinkommt.", "err": True, "f": "Zu ungenau. Besser: „Wenn ein Kunde das Anfrageformular auf der Webseite abschickt.“"},
         {"l": "Schritte", "t": "1. Kontakt im CRM anlegen. 2. Antwort mit Terminlink entwerfen. 3. Entwurf an mich zur Freigabe.", "err": False, "f": "Diese Zeile ist korrekt: klare Reihenfolge, jede Aufgabe einzeln."},
         {"l": "Programme", "t": "E-Mail.", "err": True, "f": "Formular und CRM fehlen."},
         {"l": "Ergebnis", "t": "Kontakt steht im CRM, ein Antwortentwurf liegt zur Freigabe bereit.", "err": False, "f": "Diese Zeile ist korrekt: Man kann prüfen, ob es geklappt hat."},
         {"l": "Fehlerfall", "t": "Passiert schon nichts.", "err": True, "f": "Es braucht einen Plan, z. B. „Wenn etwas schiefgeht: Nachricht an mich.“"}],
     "xp_each": 20, "xp_own": 30,
     "own": ["Auslöser", "Schritte", "Programme", "Ergebnis", "Fehlerfall"],
     "own_hints": ["Was startet den Ablauf?", "Was soll der Reihe nach passieren?", "Welche Programme sind beteiligt?", "Woran erkennst du, dass es geklappt hat?", "Was soll passieren, wenn etwas schiefgeht?"]},
]

CHECK = [
    {"q": "Was unterscheidet einen KI-Agenten von einem KI-Chat?", "a": "Der Agent hat Zugriff auf Werkzeuge und erledigt Aufgaben selbst.", "d": ["Er ist immer kostenlos.", "Er braucht kein Internet.", "Er ersetzt alle Mitarbeiter."], "lv": 2},
    {"q": "Welche Rolle hat Claude Code?", "a": "Der Baumeister, der nach deiner Beschreibung baut, testet und repariert", "d": ["Der Motor, der Abläufe rund um die Uhr ausführt", "Ein CRM", "Ein Zugangsschlüssel"], "lv": 2},
    {"q": "Was macht Athena?", "a": "Sie stellt für dich neue KI-Agenten ein und schreibt deren Stellenbeschreibung.", "d": ["Sie führt deine Buchhaltung.", "Sie ersetzt n8n.", "Sie speichert Passwörter."], "lv": 2},
    {"q": "Wofür steht MCP?", "a": "Ein offener Standard, über den ein KI-Agent Werkzeuge wie n8n bedienen darf", "d": ["Ein Server-Anbieter", "Eine Förderung", "Ein E-Mail-Programm"], "lv": 2},
    {"q": "Was ist ein Auslöser (Trigger)?", "a": "Das Ereignis, das einen Ablauf startet", "d": ["Eine einzelne Aufgabe", "Ein Zugangsschlüssel", "Ein Fehler"], "lv": 3},
    {"q": "Wer legt die Zugangsdaten in n8n an?", "a": "Immer ein Mensch, nie die KI", "d": ["Die KI selbst", "Der Kunde", "Niemand, die braucht man nicht"], "lv": 3},
    {"q": "Personaldaten sollen ausgewertet werden. Was passt?", "a": "Lokale KI auf eigenem Rechner oder Server", "d": ["Ein beliebiger KI-Chat im Browser", "Ein öffentlicher Link", "Ein kostenloses Testkonto"], "lv": 4},
    {"q": "Welche Frage beantwortet nur ein Mensch?", "a": "Wofür steht mein Betrieb?", "d": ["Was hat der Kunde letztes Jahr bestellt?", "Was kostet das Angebot?", "Was steht im Vertrag?"], "lv": 5},
    {"q": "Woran erkennst du einen guten ersten Ablauf?", "a": "Regelmäßig, feste Regeln, mehrere Programme, wenig Risiko", "d": ["Möglichst groß und kompliziert", "Selten und kreativ", "Mit vielen sensiblen Daten"], "lv": 5},
    {"q": "Was gehört in einen Steckbrief?", "a": "Auslöser, Schritte, Programme, Ergebnis, Fehlerfall", "d": ["Logo und Farben", "Nur das Budget", "Nur die Programme"], "lv": 6},
]
PASS = 8
