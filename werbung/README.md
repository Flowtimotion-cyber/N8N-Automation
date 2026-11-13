# ChatGPT-Werbung im Team-Portal

Register „ChatGPT-Werbung“ im Team-Portal: Kennzahlen der Anzeigenkampagne in ChatGPT, von der Einblendung bis zum Termin.

## Was man sieht

- Sechs Kacheln: Kosten, Klicks, CTR, CPC, Leads, Kosten pro Lead
- Trichter: Impressionen → Klicks → Besuche → Check gestartet → Leads → Termin geöffnet. Balken und Prozentzahl zeigen den Anteil der Stufe davor.
- Tabelle der Situationen, sortierbar per Klick auf die Spaltenüberschrift
- Zeitraum 7, 14 oder 30 Tage (die Auswahl bleibt je Gerät gespeichert)
- Der Text aus `hinweis` als Fußnote
- Gibt es noch keine Leads, steht bei „Kosten pro Lead“ ein Strich. Hat noch keine Situation Impressionen, steht statt der Tabelle ein Hinweis.

Sichtbar ist das Register für die Rollen in `ADS_ROLLEN` (heute nur `admin`). Die Liste steht an zwei Stellen, ein Test hält sie gleich: `werbung/lib/kennzahlen.js` (Server) und `docs/team/index.html` (Oberfläche).

## Wie die Zahlen ins Portal kommen

```
Portal (Browser)  ──POST { token, daten: { tage } }──▶  n8n „TEAM: ChatGPT-Werbung (Portal)“  (Webhook team-ads)
                                                          1. Mitglied und Rolle in Supabase prüfen
                                                          2. tage auf 1 bis 90 begrenzen
                                                          3. Zwischenspeicher: 5 Minuten je Zeitraum
                                                          4. sonst GET /webhook/ads-kpis?tage=N
                                                             mit den Zugangsdaten „Team-Portal KPI“ (Header x-api-key)
                                                          5. Antwort auf die bekannten Felder zuschneiden
```

Das Portal ist eine statische Seite ohne eigenen Server. „Serverseitig“ ist deshalb ein eigener kleiner n8n-Workflow, gebaut wie „TEAM: Webseiten-Statistik (Portal)“. Die Portal-API v2 und die Quelle „ChatGPT Ads – Kennzahlen-Schnittstelle (Team-Portal)“ bleiben unverändert.

**Der Schlüssel der Quelle steht nur in n8n**, als Zugangsdaten vom Typ „Header Auth“ mit dem Namen „Team-Portal KPI“. Er steht nicht im Repo, nicht im Portal und nicht in dieser Anleitung. Der Browser schickt nur den Mitglieds-Token, wie bei jedem anderen Register. Der Test „Schlüssel bleibt serverseitig“ prüft das bei jedem Lauf.

Ist die Quelle einmal nicht erreichbar, zeigt das Portal den letzten bekannten Stand (höchstens 24 Stunden alt) mit einem Hinweis, sonst eine verständliche Fehlermeldung mit „Erneut versuchen“.

## Dateien

| Datei | Zweck |
|---|---|
| `docs/team/index.html` | Oberfläche (Abschnitt „ChatGPT-Werbung“, Funktionen `vWerbung`, `adsZeigen`, `adsLaden`) |
| `werbung/lib/kennzahlen.js` | Logik: Rollen, Zeitraum, Zwischenspeicher, Zuschnitt der Antwort. Läuft in n8n und im Test. |
| `werbung/n8n/bauen-werbung.mjs` | baut `werbung/n8n/werbung.workflow.gen.js` (n8n-SDK-Datei für den Import per n8n-MCP) |
| `werbung/dev/mock.mjs` | Musterdaten in der Form der Quelle, Szenarien `standard`, `ohne-leads`, `leer`, `kaputt`, `abgelehnt` |
| `werbung/test/` | 9 Logik-Tests, 10 Browsertests (Desktop und Handy) |
| `werbung/screenshots/` | Bildschirmfotos aus den Browsertests |

## Tests

```bash
npm run test:werbung
```

Die Browsertests brauchen Playwright. Liegt es nur im Hauptordner, vorher `NODE_PATH` auf dessen `node_modules` setzen. Ohne Playwright werden sie übersprungen.

Lokal ansehen: `npm run office`, dann `http://127.0.0.1:8787/team/?z=<Test-Zugang>#/tab/werbung` (Zugänge stehen in der Ausgabe des Testservers). Die Seite ruft die echten n8n-Adressen auf; die Browsertests leiten sie auf die Musterdaten um.

## Einrichten in n8n (einmalig)

1. `node werbung/n8n/bauen-werbung.mjs` ausführen.
2. Den Inhalt von `werbung/n8n/werbung.workflow.gen.js` per n8n-MCP als neuen Workflow anlegen (macht Claude Code nach Timos Ja).
3. In n8n prüfen, dass zwei Knoten ihre Zugangsdaten haben: „Mitglied prüfen“ → „Supabase account“, „Kennzahlen abrufen“ → „Team-Portal KPI“.
4. Fehler-Workflow eintragen (wie bei den anderen TEAM-Workflows), veröffentlichen.
5. Lesetest: Portal öffnen, Register „ChatGPT-Werbung“, alle drei Zeiträume durchklicken.

## Schlüssel tauschen (für Timo, ohne Programmieren)

Die Quelle und das Portal-Register benutzen dieselben Zugangsdaten. Ein neuer Schlüssel wird deshalb nur an einer Stelle eingetragen:

1. In n8n links unten auf „Credentials“ klicken.
2. „Team-Portal KPI“ öffnen.
3. Im Feld „Value“ den neuen Schlüssel eintragen. Das Feld „Name“ bleibt `x-api-key`.
4. „Save“ klicken. Fertig, beide Workflows nutzen sofort den neuen Schlüssel.

Den Schlüssel nie in den Chat, in eine Datei oder ins Repo schreiben.

## Rollen ändern

`ADS_ROLLEN` in `werbung/lib/kennzahlen.js` und in `docs/team/index.html` anpassen, `node werbung/n8n/bauen-werbung.mjs` ausführen, die beiden Code-Knoten „Anfrage prüfen“ und „Antwort bauen“ in n8n aktualisieren, Tests laufen lassen.
