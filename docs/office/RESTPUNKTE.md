# Restpunkte und Fragen an Timo

Stand: 17.10.2026 (ergänzt nach Nachprüfung auf Windows, siehe TESTBERICHT.md Abschnitt 7). Priorität: A = vor Inbetriebnahme, B = in den ersten Wochen, C = später.

## Fragen an Timo (bitte entscheiden)

| # | Frage | Warum | Vorschlag |
|---|---|---|---|
| F1 | ✅ 17.10.2026 erledigt (angelegt per MCP, aktiv). Ursprünglich: Darf der neue Workflow **„TEAM: Office-API“** importiert und aktiviert werden (`office/n8n/office-api.workflow.json`)? | Ohne ihn zeigt das Office „Keine Verbindung“; das Portal läuft unverändert | Ja, nach dem SQL (SETUP.md) |
| F2 | ✅ 17.10.2026 erledigt (Timo hat die SQL ausgeführt). Ursprünglich: Darf `supabase/team_office.sql` laufen? Es ersetzt `team_laden()` (wie bisher jede Erweiterung) und legt `office_*`-Tabellen an | Portal-API v2 bekommt dadurch mehr Daten im JSON, ignoriert sie aber nach Lesart des Codes | Ja; danach Portal einmal prüfen |
| F3 | ✅ 17.10.2026 als KI-Vorschlag gesetzt (SETUP.md Abschnitt 7), bitte prüfen. Ursprünglich: Welche **Räume** bekommen die bestehenden Projekte (`team_projekte.raum`)? | Büro und Raumfilter | SQL-Update je Projekt (SETUP.md Abschnitt 1.4) |
| F4 | ✅ 17.10.2026 Projektlisten als KI-Vorschlag gesetzt (SETUP.md Abschnitt 7), Modelle/Executor noch zu prüfen. Ursprünglich: Stimmt die **Agenten-Registry** (`office/agenten.json`): zehn Rollen, Modellzuordnung, Projektzuordnung, Executor-Identität (agent-claude/-codex/-hermes)? | Projektgrenzen hängen daran | Durchsehen, per `agent_speichern` anpassen |
| F5 | Löschfristen laut LOESCHKONZEPT.md (180 Tage Runs, 30 Tage Idempotenz, 14 Tage n8n-Fehlerausführungen)? | Datenschutz | bestätigen oder ändern |
| F6 | Sollen Menschen außer Admin/Dozent **alle** Projekte im Office sehen (wie im Portal) oder soll es eine Projektliste je Person geben? | Vorbereitet über `mitglieder.projekte`, nicht aktiviert | wie Portal lassen |
| F7 | Wer darf **normale Freigaben** (E-Mail, Post, Termin) erteilen: jede Person im Team oder nur Admin/Dozent? | aktuell: jeder Mensch mit Projektsicht außer dem Anfordernden; kritische nur Admin | so lassen |
| F8 | Kundenzugang oder Verkauf des KI Office geplant? | n8n-Lizenz (QUELLEN_UND_LIZENZEN.md Abschnitt 4), DSFA | vorher schriftlich mit n8n klären |
| F9 | Skills aus SKILLS.md (frontend-design, webapp-testing, differential-review, sharp-edges, n8n-io/skills) installieren? | Arbeitshilfe, nichts wurde installiert | ja, auf die genannten Commits gepinnt |
| F10 | `ecom-orbit.de` konnte nicht abgerufen werden: Beschreibung in QUELLEN_UND_LIZENZEN.md Abschnitt 3.3 ergänzen? | Vollständigkeit der Quellenliste | drei Sätze von dir |

## Offene Punkte (priorisiert)

| Prio | Punkt | Bezug |
|---|---|---|
| A | Workflow importieren, Credentials setzen, SQL ausführen, erster echter `laden`-Aufruf (alles ungetestet mangels Zugang) | SETUP.md, TESTBERICHT.md Abschnitt 5 |
| A | Prüfen, dass die Portal-API v2 mit dem größeren `team_laden()`-JSON weiter funktioniert (n8n-Payload-Grenzen). Code-Prüfung 17.10.: Schlüssel unverändert, Office-Schlüssel werden nicht an den Browser weitergegeben (INBETRIEBNAHME.md) – Live-Test nach dem SQL steht aus | TESTBERICHT.md |
| A | Echte Integrationstests gegen Supabase und n8n (PostgREST-409, Webhook-Pfad, Zeitplan) | TESTBERICHT.md |
| B | Executoren bauen: n8n-Agentenworkflow (Webhook, Lebenszeichen, signierte Rückmeldung), Hermes-Polling, Claude-Code/Codex-Ablauf; Stubs ersetzen | `office/adapter/*.stub.js` |
| B | Allowlist für `ausfuehrer_url`-Domains; Rate-Limit am Reverse-Proxy; n8n-Executions-Aufbewahrung | SICHERHEIT.md S6–S8 |
| B | Lösch-Protokoll (wer, wann, wie viele) und Hilfsabfrage für Betroffenenanfragen | LOESCHKONZEPT.md |
| B | Zeitplan für den regelmäßigen Löschlauf (erst nach F5) | LOESCHKONZEPT.md |
| B | KI-Richtlinie und Schulungsnachweis (Art. 4 AI Act), Verzeichnis der Verarbeitungstätigkeiten, AV-Verträge, DSFA Chat-Assistent, Datenschutzinformation fürs Team | DATENSCHUTZ_AI_ACT.md Abschnitt 4.2/4.3 |
| B | KI-Hinweis im Kurs-Chat prüfen (Art. 50 Abs. 1); gpt-5-mini laut Suchauszug als deprecated markiert, Nachfolgemodell prüfen (Workflow nicht angefasst) | DATENSCHUTZ_AI_ACT.md, QUELLEN_UND_LIZENZEN.md |
| B | Wiederherstellungstest (Supabase-Export einspielen) | BETRIEB.md |
| C | Verbrauch/Kosten: Executoren melden Token und Kosten mit Quelle; Office zeigt sonst „unbekannt“ | ARCHITEKTUR.md |
| C | Kundenrolle mit Projektliste aktivieren (nach F6) | `office/lib/rechte.js` |
| C | 3D-Ansicht des Büros (optional, nicht Kern) | BEDIENUNG.md |
| C | Repo-Hygiene: LICENSE-Datei fürs Repo, `playwright` als devDependency, `simple-icons`/`hyperframes` pinnen, jsPDF-Update im Portal | QUELLEN_UND_LIZENZEN.md |
| C | Office-KPIs in den Wochenstand-Workflow aufnehmen (nur nach Freigabe durch Timo, Workflow wird sonst nicht angefasst) | BETRIEB.md |
| C | `@n8n/workflow-sdk`-Datei gegen das SDK validieren | `office/n8n/office-api.workflow.js` |
| B | Werkzeuganbindung der Agenten über n8n ausbauen (ARCHITEKTUR.md Abschnitt 10): n8n-Agentenworkflow als Ausführer mit Werkzeugknoten, MCP-Server-Trigger für Claude Code/Codex/Hermes, MCP-Client für fremde Werkzeuge; Werkzeuge nur aus der Registry-Allowlist | `office/adapter/n8n.js`, `office/agenten.json` |
| C | Einbettung auf GitHub Pages einmal prüfen (Token-Teilung Portal/Office, iframe-Höhe) | `docs/team/index.html`, `docs/office/js/app.js` |
| B | Puppeteer-Ersatzpfad der Browsertests vervollständigen oder entfernen (4/7 ohne Playwright); bis dahin Playwright lokal installieren (TESTBERICHT.md Abschnitt 7) | `office/test/browser.mjs` |
| B | Registry: Executor und Modell passen nicht überall zusammen (`kunden-entwickler` läuft über Codex, `kurs-waechter`/`server-waechter` über Hermes, tragen aber Claude-Modell-IDs). Bei F4 klären, welches Modell dort wirklich läuft, sonst „unbekannt“ eintragen | `office/agenten.json` |
| B | ~~Startbestand der Registry enthält „Kundenprojekt Müller GmbH“~~ – gelöst 17.10.: `supabase/team_office_produktiv.sql` ersetzt synthetische Projektnamen und setzt Räume (siehe INBETRIEBNAHME.md) | `supabase/team_office_produktiv.sql` |
| C | Subagent `office-entwickler` darf `Bash(node *)`/`Bash(npm run *)`: auf die Testskripte einschränken | `.claude/agents/office-entwickler.md` |

## Hinweis zum Branch

Die Aufgabe nannte den Branch `feature/ki-office`; die Sitzungsumgebung hatte zusätzlich `claude/determined-curie-0gppav` vorgegeben. Die Arbeit liegt auf `feature/ki-office` (Pull Request), derselbe Stand wurde zusätzlich auf den vorgegebenen Sitzungs-Branch gepusht.
