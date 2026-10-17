# Setup: KI Office in Betrieb nehmen

Ohne Zugangsdaten in diesem Dokument. Credentials legt Timo selbst in n8n an. Reihenfolge einhalten.

## 0. Was schon läuft, ohne dass du etwas tust

- Nach dem Merge liefert GitHub Pages das KI Office unter `https://flowtimotion-cyber.github.io/N8N-Automation/office/` aus und das Portal zeigt das Register „KI Office“.
- Solange der Workflow „TEAM: Office-API“ nicht aktiv ist, zeigt das Office die Meldung „Keine Verbindung zur Office-API“ und das Portal-Register den Hinweis, dass der Workflow fehlt. Nichts anderes im Portal ändert sich.
- Lokal kannst du alles sofort ansehen: `node office/dev/server.mjs`, dann die Adresse aus der Konsole öffnen (TESTADAPTER, synthetische Daten).

## 1. Supabase: SQL ausführen

1. Supabase → SQL Editor → Inhalt von `supabase/team_office.sql` einfügen → Run.
2. Die Datei ist idempotent (mehrfach ausführbar). Sie legt die `office_*`-Tabellen mit RLS an, ergänzt `team_projekte.raum`, ersetzt `team_laden()` um die Office-Daten und trägt die zehn Agenten aus `office/agenten.json` ein (bestehende Einträge bleiben).
3. Kontrolle am Ende der Ausgabe: `jsonb_object_keys(team_laden())` muss `office_runs`, `office_agenten` usw. enthalten; die zweite Abfrage zeigt die Agenten.
4. Räume: `update team_projekte set raum = 'Vertrieb' where name = '…';` für Projekte, die noch keinen Raum haben (das Office zeigt sie sonst unter „Ohne Raum“).

Hinweis: `team_laden()` liefert jetzt mehr Daten. Die Portal-API v2 ignoriert die neuen Schlüssel; getestet werden konnte das in dieser Sitzung nicht (kein Zugang), siehe RESTPUNKTE.md.

## 2. n8n: Workflow importieren

1. n8n → Workflows → „Import from File“ → `office/n8n/office-api.workflow.json`.
2. In den Knoten **„Team-Daten laden“** und **„In Supabase schreiben“** das vorhandene Supabase-Credential (Typ „Supabase API“, service_role, dasselbe wie in der Portal-API v2) auswählen. Die Datei enthält absichtlich keine Credential-IDs.
3. Webhook prüfen: Produktions-URL muss `https://n8n.hm-storage.de/webhook/office-api` lauten (Pfad `office-api`). Erlaubter Origin ist `https://flowtimotion-cyber.github.io`.
4. Workflow aktivieren. Der Zeitplan „Wartung alle 5 Minuten“ läuft dann mit (markiert veraltete Runs, lässt Freigaben verfallen, räumt Idempotenzschlüssel auf).
5. Test: Office öffnen, anmelden wie im Portal. Es müssen Projekte und die zehn Agenten erscheinen. In n8n erscheinen nur Fehlerausführungen (saveDataSuccessExecution: none).
6. Optional: Im Knoten „Externe Aktion ausführen (Platzhalter)“ echte Knoten anschließen (E-Mail, Social). Bis dahin passiert bei `aktion_ausfuehren` nach außen nichts; die Freigabe wird trotzdem als verwendet markiert und der Run bekommt ein Ereignis.

Der Code im Knoten „Anfrage prüfen“ wird aus `office/lib/*.js` erzeugt. Nach Änderungen an der Bibliothek: `node office/n8n/bauen.mjs`, dann den Workflow erneut importieren (oder den Knoteninhalt aus `office/n8n/code/anfrage-pruefen.js` einfügen). Die SDK-Fassung `office/n8n/office-api.workflow.js` beschreibt denselben Workflow für `@n8n/workflow-sdk`; sie wurde ohne n8n-Zugang nicht ausgeführt.

## 3. Token und Rollen

- Es gibt keine neuen Tokens. Jedes Teammitglied nutzt seinen Portal-Link; der Browser teilt den Token (`localStorage` `mt-token`) zwischen `/team/` und `/office/`.
- Agenten nutzen ihren Agenten-Code (`TEAM_PORTAL_TOKEN`) auch für die Office-API. Welche Registry-Agenten ein Teammitglied vom Typ `agent` ausführt, steht in `office_agenten.mitglied_id`.
- Rollen: `admin` darf alles (Registry, Löschen, kritische Freigaben). `dozent` und Auftraggeber steuern Runs und erteilen normale Freigaben. `team`/`vertrieb` sehen alles, steuern eigene Aufträge. Agenten: nur Arbeitsaktionen, nie Freigaben, nie Löschen.

## 4. Executor anbinden (später)

- n8n-Agenten: einen Workflow je Agent mit Webhook bauen und dessen URL in `office_agenten.ausfuehrer_url` eintragen (`agent_speichern` als Admin oder direkt in Supabase). Die Office-API ruft ihn bei `auftrag_starten` mit `run_id` und `rueckmelde_schluessel` auf. Der Executor meldet sich mit `lebenszeichen`, `ereignis`, `artefakt` (Token des Agenten) und am Ende per signierter `rueckmeldung` (siehe `office/adapter/n8n.js`, `office/lib/signatur.js`).
- Claude Code / Codex / Hermes: nutzen die Office-API mit ihrem Token (`run_beenden` statt Signatur). Stubs und Pflichten in `office/adapter/*.stub.js`, Subagenten in `.claude/agents/`.

## 5. Lokal entwickeln

```
node office/dev/server.mjs                 # Testserver (Port 8787), Tokens in der Konsole
node office/dev/server.mjs --szenario leer # Leerzustände
node office/dev/server.mjs --tempo 0       # eingefrorene Uhr (für manuelle Prüfungen)
npm run test:office                        # alle Tests inkl. Browser (Playwright global oder puppeteer-core + CHROME_PFAD)
node office/n8n/bauen.mjs                  # n8n-Dateien neu erzeugen
```

## 6. Stand 17.10.2026: was schon erledigt ist

- Supabase: `supabase/team_office.sql` wurde von Timo im SQL Editor ausgeführt (Kontrollabfragen siehe Dateiende).
- n8n: Der Workflow **„TEAM: Office-API“** wurde per MCP aus `office/n8n/office-api.workflow.js` angelegt (ID `NuK6m10yIGKMRWxC`, https://n8n.hm-storage.de/workflow/NuK6m10yIGKMRWxC), 19 Knoten, Webhook-Pfad `office-api`, Zeitplan alle 5 Minuten. Der Code-Knoten enthält `office/n8n/code/anfrage-pruefen.js` ohne Kommentarzeilen.
- Noch offen, nur in der n8n-Oberfläche möglich: in **„Team-Daten laden“** und **„In Supabase schreiben“** das Credential „Supabase account“ auswählen (die Schnittstelle vergibt Credentials nicht an HTTP-Knoten), unter Einstellungen „Save successful executions“ auf „Do not save“ stellen, dann aktivieren.
- Die SDK-Datei brauchte für die Schnittstelle drei Anpassungen: keine `.settings(...)`, Verzweigungen als `.add(x.output(n).to(y))`, Code-Knoten als eine Zeichenkette statt langer `+`-Kette. Die JSON-Importdatei bleibt der Weg für den manuellen Import.

## 7. Stand 17.10.2026 (später): Office-API aktiv, Räume und Registry auf echte Projekte umgestellt

- „TEAM: Office-API“ ist aktiv. Live-Test der Webhook-Adresse mit ungültigen Tokens: dreimal HTTP 401 mit korrekter Meldung (Supabase-Zugriff damit belegt). Einstellung „erfolgreiche Läufe nicht speichern“ und Zeitzone Europe/Berlin per Schnittstelle gesetzt.
- Räume und Agenten-Projekte wurden per temporärem Hilfs-Workflow (archiviert) direkt in Supabase geschrieben. Das ist ein **KI-Vorschlag von Claude Code**, Timo kann ihn jederzeit ändern (Office-API `agent_speichern` als Admin oder SQL):

| Raum | Projekte |
|---|---|
| Akademie | Kurs Modul 1, TEMP.Akademie, AZAV & GmbH |
| Marketing | Webseite, Social Media, Hermetik Marketing |
| Vertrieb | Vertrieb, KI-Agentur-Pipeline |
| Kundenprojekte | Healthhack, TeamRebelMedia / Max Görtler, Technische Datenbasis …, AGOMED – Medtech, AWS GmbH, IFA GmbH, Spirit WoMen Zentrum, Wioletta Tuschnio, Yoga mit Seher |
| Verwaltung | Systeme, Momentum Office, Firmenwissen, Sonstiges |

| Agent | Projekte |
|---|---|
| akademie-redakteur | Kurs Modul 1, TEMP.Akademie |
| kurs-waechter | Kurs Modul 1 |
| marketing-texter | Webseite, Social Media, Hermetik Marketing |
| social-planer | Social Media |
| vertrieb-recherche | Vertrieb, KI-Agentur-Pipeline |
| angebots-pruefer | Vertrieb, KI-Agentur-Pipeline und alle Kundenprojekte |
| kunden-entwickler | alle Kundenprojekte |
| architektur-review | alle Kundenprojekte, Systeme, Momentum Office, Webseite |
| verwaltung-status | alle Projekte |
| server-waechter | Systeme, Momentum Office |

Hinweis zur Schnittstelle: `update_workflow` kann Credentials an HTTP-Knoten setzen (`setNodeCredential`), `create_workflow_from_code` nicht. Für künftige Anlagen per MCP also erst anlegen, dann Credential per Update setzen.
