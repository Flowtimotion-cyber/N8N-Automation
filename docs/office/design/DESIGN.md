# Designsystem KI Office 2.0

Stand: 08.11.2026 · KI-erstellt: Claude Code (Paket 1, Design) · Gilt für `docs/office/` und die Vorschauen in `docs/office/design-vorschau/`. Der gstack-Skill `design-consultation` wurde nicht genutzt, weil er interaktive Rückfragen braucht; dieses Dokument übernimmt seine Rolle als Quelle der Wahrheit fürs Design.

## 1. Haltung

Das Office ist ein **Arbeitsplatz, der zeigt, was Agenten tun**, kein Dashboard voller Zahlen ohne Bezug. Drei Regeln:

1. **Jede Zahl hat eine Quelle und einen Zustand.** Kosten sind „gemessen“ oder „geschätzt“, Ergebnisse sind „geprüft“, „ungeprüft“ oder „zurückgewiesen“. Nichts wird schöngerechnet.
2. **Agenten sprechen in Ich-Form, kurz, mit Zahl.** „Ich habe 14 von 20 Betrieben geprüft.“ Nicht: „Verarbeitung abgeschlossen.“ Das macht die Arbeit greifbar (Vorbild: Mitbewerberseite claude-erfolg.de, Stadt-Metapher und Live-Ticker).
3. **Der Mensch entscheidet, das Office schlägt vor.** Freigaben, Abnahmen, Skalieren, Pausieren: immer Knopf für Timo, nie Automatik. Karten mit Vorschlägen heißen „Vorschlag“, nicht „Aktion“.

## 2. Farben

Grundlage sind die Portal-Farben (`docs/team/index.html`), ergänzt um ein dunkles Thema für den Kontrollraum und die Stadt.

| Variable | Hell (Portal, Richtung B) | Dunkel (Richtung A, C) | Wofür |
|---|---|---|---|
| `--bg` | `#F6F6FB` | `#0E0D22` (A), `#07071A` (C) | Seitenhintergrund |
| `--card` | `#FFFFFF` | `#17162F` (A), `#121130` (C) | Karten |
| `--card2` | `#EEEDF6` | `#1F1E3C` | Flächen in Karten (Kennzahlen, Balkenhintergrund) |
| `--line` | `#DFDDEC` | `#2A2952` | Linien, Rahmen |
| `--ink` | `#14123A` | `#F2F1FA` | Text |
| `--mut` | `#62607E` | `#A9A7C8` | Nebentext |
| `--acc` | `#7B3FE4` | `#B48CFF` | Akzent (Links, aktiver Reiter) |
| `--acc2` | `#5B6EE6` | `#8FA6FF` | zweiter Akzent (Sparklines, Fokus) |

Zustandsfarben sind in beiden Themen gleich (aus `docs/office/js/modell.js`, erweitert um „pausiert“):

| Zustand | Farbe | Bedeutung |
|---|---|---|
| frei | `#9A98B5` | nichts in Arbeit |
| arbeitet | `#1F9D6B` | Run in Arbeit (pulsiert leicht) |
| wartet auf Freigabe | `#E98A15` | Mensch gebraucht |
| wartet auf Antwort | `#8B5CF6` | Mensch gebraucht |
| Auftrag wartet | `#5B6EE6` | Warteschlange |
| pausiert (Guthaben leer) | `#D9452F` | startet nicht, bis Timo auffüllt |

Prüfmarken: geprüft grün (`#1F9D6B`), ungeprüft orange (`#E98A15`), zurückgewiesen rot (`#D9452F`). Urteile der Auswertung: liefert grün, beobachten orange, liefert nicht rot, Guthaben leer rot, zu wenig Daten grau.

Raumakzente (wie bisher in `buero.js`): Akademie `#A77BFF`, Marketing `#F5A94A`, Vertrieb `#3FD0D4`, Kundenprojekte `#4CCB8F`, Verwaltung `#9FA3C8`, Zentrale `#9B7BFF`.

## 3. Typografie

- Schrift: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (keine externe Schrift, kein Netzabruf; GitHub Pages ohne Abhängigkeiten).
- Zahlen: `ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace` mit `font-variant-numeric: tabular-nums`, damit Spalten und Kennzahlen untereinander stehen.
- Größen: Grundtext 15 px / 1,5; Nebentext 12,5 bis 13,5 px; Kennzahl groß 26 bis 28 px; Überschriften h1 24 px, h2 18 px, h3 15 px. Abschnittsköpfe im Kontrollraum und der Stadt in Versalien mit `letter-spacing: .1em` und 12 bis 13 px.
- Sprache: du-Form, kurze Sätze, keine Anglizismen ohne Not („Run“ und „Ticker“ bleiben, weil im Office eingeführt).

## 4. Abstände und Formen

- Raster 4 px; Karteninnenabstand 14 bis 18 px; Abstand zwischen Karten 12 bis 16 px.
- Radien: Karten 14 px, Knöpfe und Felder 10 px, Chips 999 px (Pille).
- Schatten hell: `0 10px 30px rgba(20,18,58,.06)`; dunkel: `0 14px 40px rgba(0,0,0,.35)`.
- Fokus: `3px solid var(--acc2)`, Versatz 2 px, auf allen interaktiven Elementen (Tastaturbedienung bleibt Pflicht wie heute).
- Breite: Inhalt bis 1240 px, auf dem Handy 16 px Rand, kein seitliches Scrollen außer bei Szene, Kanban und Tabellen (dort bewusst mit `overflow-x: auto`).

## 5. Bausteine

| Baustein | Pflichtinhalt | Datei |
|---|---|---|
| **Agentenkarte** | Name, Modell und Ausführer klein, Zustands-Chip mit Punkt, aktuelle Aufgabe (oder „nichts in Arbeit“), letztes Ergebnis mit Prüfmarke und Zeit, Guthaben-Balken (Rest von Monatsguthaben), Kosten je abgenommenem Ergebnis mit Trendpfeil, Sparkline 4 Wochen | `vorschau.js` (`guthaben`, `kostenJeErgebnis`, `sparkline`), später `docs/office/js/ansichten.js` |
| **Guthaben-Balken** | Rest in Euro, „von“ Monatsguthaben, Farbe grün unter 75 %, orange bis 100 %, rot bei leer | `guthaben()` |
| **Live-Ticker** | Zeit (Monospace), Agentenname mit Raumpunkt, Text in Ich-Form; Freigaben und Rückfragen fett, Fehler rot | `ticker()`; Lauftext-Variante `laufband()` |
| **Run-Zeitleiste** | Kopf mit Status, Agent, Projekt, Run-ID; Kennzahlen Kosten (gemessen/geschätzt, Limit), Dauer, Token, Ergebnis-Typ, Wirkung; Liste mit Zeit, Punkt nach Art, Text, Kosten je Schritt | `runZeitleiste()` |
| **Auswertung** | Schwellen im Kopf, Rangliste in fünf Spalten (liefert, beobachten, liefert nicht, Guthaben leer, zu wenig Daten), Tabelle je Agent mit Sparkline und Wirkung | `auswertung()` |
| **Vorschlagskarte** | Icon, Titel „X skalieren / pausieren / auffüllen“, Grund mit Zahlen, Optionen als Knöpfe, „Ablehnen“, Hinweis „Nichts passiert ohne deine Freigabe“ | `skalierungskarten()` |
| **Projektkarte** | Raum, Name, Verantwortliche, Fortschrittsbalken mit Quelle, vier Zahlen (Agent läuft, Freigaben, Fehler, Kosten), Agenten-Chips, nächster Schritt, letzte Aktivität | `projekte()` |

## 6. Bewegung

- Nur drei Animationen: Puls (arbeitende Agenten, Live-Punkt), Lauftext (Ticker-Variante), Atmen (Kern der Stadt). Alle stehen bei `prefers-reduced-motion: reduce` still.
- Keine Übergänge länger als 250 ms bei Hover und Fokus.
- Aktualisierung: alle 30 Sekunden bei sichtbarem Tab (Polling), Supabase Realtime wird geprüft (Paket 1, Umsetzung). Zahlen springen nicht, sie werden ersetzt; neue Ticker-Zeilen erscheinen oben.

## 7. Zugänglichkeit und Sicherheit

- Alle Werte aus Daten gehen durch `esc()`; HTML-Vorschauen von Agenten nur in `<iframe sandbox="">`, wie bisher (SICHERHEIT.md S20).
- Jede Grafik hat eine Textfassung darunter oder daneben (Liste, Tabelle), wie heute die Liste unter der Büroszene.
- Farben tragen nie allein die Bedeutung: Zustand steht als Text im Chip, Prüfmarke als Wort.
- Kontrast dunkel: Text `#F2F1FA` auf `#17162F` über 12:1; Nebentext `#A9A7C8` auf `#17162F` etwa 7:1.

## 8. Entscheidung

Timo wählt zwischen A Kontrollraum, B Werkbank, C Stadt (Übersicht: `docs/office/design-vorschau/index.html`). Die gewählte Richtung wird in `docs/office/` umgesetzt; die beiden anderen bleiben als Vorschau liegen. Mischformen sind möglich (z. B. A als Arbeitsansicht, C als Schauansicht).
