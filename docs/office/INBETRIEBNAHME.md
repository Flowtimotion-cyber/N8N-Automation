# KI Office – Inbetriebnahme in 5 Schritten

Stand 17.10.2026. Ergänzt SETUP.md um eine geprüfte Reihenfolge und den Abgleich mit dem echten Portal-Bestand. Keine Zugangsdaten in dieser Datei.

## Vorab geprüft (17.10.)

| Prüfung | Ergebnis |
|---|---|
| `team_laden()` in `team_office.sql` gegen die aktuelle Fassung (`team_vorschlaege.sql`) | Alle bisherigen Schlüssel bleiben gleich (mitglieder … vorschlaege), nur `office_*` kommt dazu. Projekt-Links (`team_projekte.links`) laufen automatisch mit. |
| Portal-API v2 (kMuDaDmT9rCN5Vs2), Knoten „Antwort bauen“ | Gibt nur ausgewählte Schlüssel an den Browser weiter. `office_run_schluessel` und `office_idempotenz` gelangen über das Portal **nicht** zu Teammitgliedern. |
| Office-API „laden“ (`office/lib/verarbeitung.js`) | Gibt laut Code nie Tokens, Rückmelde-Schlüssel, Kontaktdaten, Zeiten oder Kursdaten aus. |
| Verknüpfungen Office → Portal | `../team/#/aufgabe/…`, `#/notiz/…`, `#/projekt/…`, `#/agent/…` werden vom Portal geöffnet (Hash-Router vorhanden). Logo und „Team-Portal ↗“ führen zurück, Abmelden gilt für beide. |
| Verknüpfungen Portal → Office | Reiter „KI Office“, Büro-Vorschau in der Übersicht, Kacheln Agenten-Register/Büro/Freigaben. Token wird über `localStorage mt-token` geteilt (gleiche Domain). |
| Unit-Tests `npm run test:office:unit` | 41/41 grün. |
| Andere neue Workflows (Vertrieb, Klassenbuch, Brücke KI Flow) | Nutzen `team_laden()` nicht → vom Office-SQL nicht betroffen. |

## Reihenfolge

1. **Supabase → SQL Editor:** `supabase/team_office.sql` ausführen. Kontrolle: Liste zeigt `office_agenten`, `office_runs` …, zweite Abfrage zehn Agenten.
2. **Supabase → SQL Editor:** `supabase/team_office_produktiv.sql` ausführen. Ersetzt die synthetischen Projektnamen der Testdaten in der Registry durch die echten Projekte und gibt jedem Projekt einen Raum. Die letzte Kontrollabfrage muss **leer** sein (kein Agent mit unbekanntem Projekt).
3. **Team-Portal neu laden** und kurz prüfen: Übersicht, Aufgaben, Arbeitszeit, Vorschläge laden wie vorher.
4. **n8n → Import from File:** `office/n8n/office-api.workflow.json`. In „Team-Daten laden“ und „In Supabase schreiben“ das Credential **„Supabase account“** wählen (dasselbe wie Portal-API v2). Pfad `office-api` prüfen, dann aktivieren.
5. **Office öffnen** (Portal → KI Office): Projekte in fünf Räumen, zehn Agenten, keine Fehlermeldung. Danach laufen nur Fehlerausführungen ins n8n-Protokoll.

Zurück, falls etwas hakt: Office-API-Workflow deaktivieren. Das Portal läuft unabhängig davon weiter; die `office_*`-Tabellen stören nicht.

## Raumzuordnung (Vorschlag in `team_office_produktiv.sql`)

| Raum | Projekte |
|---|---|
| Akademie | Kurs Modul 1, TEMP.Akademie |
| Marketing | Social Media, Webseite, Hermetik Marketing |
| Vertrieb | Vertrieb, KI-Agentur-Pipeline |
| Kundenprojekte | AWS GmbH, IFA GmbH, TeamRebelMedia / Max Görtler, Healthhack, Yoga mit Seher, Spirit WoMen Zentrum, Wioletta Tuschnio, AGOMED – Medtech, Technische Datenbasis … |
| Verwaltung | AZAV & GmbH, Sonstiges, Firmenwissen, Systeme, Momentum Office (und alle neuen Projekte ohne Raum) |

## Agenten → Projekte (echte Namen)

| Agent | Projekte |
|---|---|
| Akademie-Redakteur, Kurs-Wächter | Kurs Modul 1, TEMP.Akademie |
| Marketing-Texter | Social Media, Webseite, Hermetik Marketing |
| Social-Planer | Social Media |
| Vertriebs-Recherche, Angebots-Prüfer | Vertrieb, KI-Agentur-Pipeline |
| Kunden-Entwickler | alle Projekte im Raum Kundenprojekte |
| Architektur-Review | Kundenprojekte + Webseite, Systeme, Momentum Office |
| Verwaltungs-Status | alle nicht archivierten Projekte |
| Server-Wächter | Systeme |

## Danach (nicht nötig für den Start)

- Executoren anbinden (SETUP.md Abschnitt 4): erst dann führen Agenten wirklich Aufträge aus. Bis dahin zeigt das Office Projekte, Aufgaben, Agenten und Freigaben, Läufe bleiben leer.
- Modell bei Hermes-Agenten (Kurs-Wächter, Server-Wächter) und beim Kunden-Entwickler (Codex) prüfen – in der Registry steht ein Claude-Modell (RESTPUNKTE.md).
- Office-KPIs im Dashboard der Portal-Übersicht (z. B. Läufe je Woche, offene Freigaben) – erst sinnvoll, wenn Läufe stattfinden.
