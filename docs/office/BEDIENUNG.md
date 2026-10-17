# Bedienung: KI Office (kurz)

Adresse: `https://flowtimotion-cyber.github.io/N8N-Automation/office/` oder im Team-Portal das Register **KI Office**. Anmeldung läuft über deinen Portal-Link; du bist automatisch angemeldet, wenn du das Portal schon einmal geöffnet hast.

## Register

- **Projekte:** Alle Projekte des Portals als Karten oder Kanban. Je Projekt: Verantwortliche, Status, höchste offene Priorität, nächste Frist, nächster Schritt, Fortschritt als Zählung („3 von 8 Aufgaben erledigt, Quelle: Aufgaben im Team-Portal“), Blockaden, laufende Agenten, offene Freigaben, Fehler, Ergebnisse ohne Abnahme, letzte belegte Aktivität mit Quelle. Suche und Filter nach Raum, Zuständigkeit (Mensch oder Agent), Status, Zeitraum.
- **Projekt-Detail** (Klick auf ein Projekt): Aufgaben nach Status (Links ins Portal), Agentenläufe, Aktivitäten (Zeitleiste aus Aufgabenverlauf und Run-Ereignissen), Ergebnisse, Dokumente (Notizen und Links), Entscheidungen, KI-Zusammenfassungen mit Zeitstempel und Link auf die zugrunde liegenden Ereignisse.
- **KI Office (Agenten):** Je Agent Rolle, Modell mit Begründung, Fähigkeiten, erlaubte Werkzeuge, Projekte, Zustand, Ausführungen. Klick → Arbeitsübersicht mit allen Runs.
- **Run:** Auftrag, Zeitleiste (Schritte, Werkzeugaufrufe, Quellen, Fehler, Wiederholungen, Freigaben, Statuswechsel), Ergebnisse, Freigaben, Zusammenfassung der Arbeit (mit Stand und Quelle), Verbrauch nur wenn gemessen, sonst „unbekannt“. Knöpfe je nach Zustand: Rückfrage beantworten, Abbrechen, Erneut versuchen, Fachlich abnehmen / Zurückweisen, Link kopieren.
- **Virtuelles Büro:** Fünf Räume. Klick auf einen Raum filtert die Projekte, Klick auf einen Agenten öffnet seine Arbeitsübersicht. Farbpunkt = Zustand. Darunter dieselben Inhalte als Liste (Tastatur, Screenreader).
- **Freigaben:** Offene Anfragen für externe Aktionen (E-Mail, Veröffentlichung, Zahlung, Löschung, Vertrag, Termin). Freigeben oder Ablehnen mit Begründung. Die Freigabe gilt nur für genau diesen Inhalt (Hash) und genau einmal. Wer sie angefordert hat, darf sie nicht selbst erteilen. Zahlungen, Löschungen und Verträge gibt nur Timo frei.

## Auftrag an einen Agenten

„+ Auftrag an Agent“ (Projekte, Agenten oder Projekt-Detail): Agent wählen, Projekt (nur Projekte, denen der Agent zugeordnet ist), optional Aufgabe, Auftrag beschreiben. Keine Zugangsdaten, keine unnötigen Kundendaten. Doppelklick startet nichts doppelt.

## Zustände eines Runs

Warteschlange → in Arbeit → (wartet auf Rückmeldung | wartet auf Freigabe) → abgeschlossen (technisch) | fehlgeschlagen | abgebrochen | unbekannt/veraltet. „Abgeschlossen“ heißt nur: Der Agent hat ein Ergebnis gemeldet. Ob es fachlich passt, entscheidest du mit „Fachlich abnehmen“. „Unbekannt/veraltet“ bekommt ein Run, der sich zu lange nicht meldet; kommt später doch ein Ergebnis, wird das nur als Hinweis festgehalten.

## Was gespeichert wird

Schritte, Werkzeugaufrufe, Quellen-Referenzen, Ergebnisse, Statuswechsel, Freigaben und Entscheidungen mit Zeit und Person. Keine Prompts, keine Zwischenüberlegungen, keine Gedankengänge. Zugangsdaten-Muster werden aus Texten entfernt. Details in DATENSCHUTZ_AI_ACT.md und LOESCHKONZEPT.md.

## Tastatur

Tab durch Register, Karten und Knöpfe; Enter öffnet. Im Büro sind Räume und Agenten Links. Escape schließt Dialoge. Bewegungen (Pulsieren) sind bei „Bewegung reduzieren“ im Betriebssystem aus.

## Lokal ausprobieren

`node office/dev/server.mjs` und die Adresse aus der Konsole öffnen. Rot gekennzeichnet: TESTADAPTER mit synthetischen Daten, nichts davon ist echt.
