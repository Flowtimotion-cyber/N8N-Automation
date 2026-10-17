# Bestandsaufnahme: Team-Portal und Ausgangslage für das KI Office

Stand: 17.10.2026 · Branch `feature/ki-office` · Grundlage: Repo-Stand `606760c` auf `main`

## 1. Stack

| Bereich | Befund |
|---|---|
| Frontend | `docs/team/index.html`, eine Datei (~181 KB), Vanilla JS in einer IIFE, kein Framework, kein Build, kein Bundler. HTML wird per String zusammengesetzt, Escaping über `esc()`. |
| Designsystem | CSS-Variablen in `:root` (`--ink`, `--mut`, `--line`, `--bg`, `--card`, `--acc`, `--acc2`, `--teal`, `--red`, `--orange`, `--green`, `--soft`), Klassen `.card`, `.chip`, `.btn` (`.sec`, `.ghost`, `.danger`), `.tools`, `.seg`, `.board`/`.col`/`.bcard`, `.kpis`/`.kpi`, `.task`, `.meta`, `.empty`, `.note`. Systemschrift, keine Webfonts. |
| Fremdbibliotheken im Portal | Nur jsPDF 2.5.1, nachgeladen von cdnjs beim PDF-Export der Arbeitszeit. Sonst nichts. |
| Navigation | Hash-Routing: `#/tab/<name>`, `#/aufgabe/<id>`, `#/projekt/<id>`, `#/notiz/<id>`, `#/agent/<id>`, `#/monat/JJJJ-MM`. Letztes Register in `localStorage` (`mt-tab`). |
| Register (TABS) | Übersicht, Aufgaben, Projekte, Arbeitszeit, Notizen, Social Media, Kurs & Teilnehmer, Systeme, Webseite, Vorschläge, Team. Dazu der schwebende Chat-Assistent (`kiAufbauen`). |
| Auffrischen | Alle 2 Minuten `laden(true)`, wenn kein Dialog offen ist und niemand tippt. |
| Deployment | GitHub Pages aus `docs/`. Portal unter `https://flowtimotion-cyber.github.io/N8N-Automation/team/`. Keine CI, keine Actions-Workflows im Repo. |
| Tests | Keine automatisierten Tests für das Portal. Im Repo gibt es nur `course/test_course.py` für die Lerneinheit. `package.json` enthält `puppeteer-core`, aber keine Test-Skripte. |
| Node/Python | Node 22 (ESM, `"type": "module"`), Python 3 für `agenten/team.py` (nur Standardbibliothek). |

## 2. Auth und Rollen

- **Token**: pro Mitglied ein Hex-Token (20 bis 64 Zeichen) in `team_mitglieder.token`. Kommt per `?z=…` oder `#z=…` in die Seite, wird in `localStorage` unter `mt-token` abgelegt und aus der URL entfernt (`history.replaceState`).
- **Übertragung**: im POST-Body an die n8n-Webhook-URL `https://n8n.hm-storage.de/webhook/team-api-v2`, Body `{ token, aktion, daten }`, `Content-Type: text/plain;charset=UTF-8` (vermeidet CORS-Preflight). Der Webhook erlaubt als Origin nur `https://flowtimotion-cyber.github.io`.
- **Rollen** (`team_mitglieder.rolle`): `admin` (Timo), `dozent` (Technik/Kurs), `vertrieb`, `team`, `agent`. Typ `mensch` oder `agent`.
- **Agenten** sind Teammitglieder `agent-claude`, `agent-codex`, `agent-hermes` mit eigenem Token (`TEAM_PORTAL_TOKEN`). Sie bekommen vom Server eine reduzierte Antwort (keine Kontaktdaten, keine Zeiten, keine Kursdaten) und dürfen nur `laden`, `aufgabe_speichern`, `kommentar`, `notiz_speichern`, `projekt_speichern`, `social_speichern`, `vorschlag_speichern`. Nichts löschen, „Erledigt“ setzt nur ein Mensch.
- **Prüfung** passiert serverseitig im n8n-Workflow „TEAM: Portal-API v2“ (Code-Knoten „Anfrage prüfen“ und „Antwort bauen“). Der Code liegt nicht im Repo. In dieser Sitzung konnte er über die n8n-MCP-Anbindung **nur gelesen** werden (nichts geändert). Erkenntnisse daraus stehen in Abschnitt 4.

## 3. Datenmodell (Supabase, Projekt `llhwmzhvhluamxwemaqx`)

Tabellen (alle mit RLS, Zugriff nur per `service_role` aus n8n): `team_mitglieder`, `team_projekte` (inkl. `links jsonb`), `team_aufgaben`, `team_aufgaben_verlauf`, `team_notizen`, `team_zeiten`, `team_abrechnung`, `team_social`, `team_systeme`, `team_vorschlaege`, `kurs_community`. Zusätzlich n8n Data Tables `Kurs_Lernstand`, `Kurs_Chatfragen`, `Kurs_Anfragen` (werden vom Portal-API-Workflow gelesen).

Lesen läuft über die SQL-Funktion `team_laden()` (`security definer`, nur `service_role`), die alles in einem JSON liefert. Jede Erweiterung ersetzt die Funktion per `create or replace` (Muster: `supabase/team_vorschlaege.sql`). SQL-Dateien in `supabase/` sind idempotent und werden von Timo manuell im SQL Editor ausgeführt.

Aufgabenstatus: Offen, Geplant, In Arbeit, Wartet, Wird getestet, Erledigt. Projekte: `aktiv`, `geplant`, `pausiert`, `abgeschlossen`.

## 4. API-Vertrag der Portal-API v2 (abgeleitet aus `index.html`, `agenten/ANLEITUNG.md`, Workflow-Code)

Request: `POST …/team-api-v2`, Body `{ "token": "…", "aktion": "…", "daten": { … } }`.
Antwort: `{ ok: true, … }` oder `{ ok: false, fehler: "Text für Menschen" }` mit HTTP 400/401/403/404/500.

| Aktion | Wer | Zweck |
|---|---|---|
| `laden` | alle | liefert `ich, mitglieder, projekte, aufgaben, verlauf, notizen, social, systeme, vorschlaege, stand` und je nach Rolle `zeiten, abrechnung, community, kurs, anfragen, team_stunden`. Agenten bekommen zusätzlich `meine_aufgaben`, `agent_geeignet`, `regeln`. |
| `profil` | alle | E-Mail, Telefon, WhatsApp-Einwilligung; schaltet den Status von `eingeladen` auf `aktiv`. |
| `aufgabe_speichern`, `kommentar`, `aufgabe_loeschen` | alle / Löschen nur Ersteller oder Admin | Aufgaben und Verlauf. |
| `projekt_speichern`, `projekt_loeschen` | Bearbeiten: Verantwortliche, Admin, Dozent. Löschen: Admin | Projekte. |
| `notiz_speichern`, `notiz_loeschen` | alle / Löschen Autor oder Admin | Notizen (Wiki mit `[[Titel]]`). |
| `zeit_speichern`, `zeit_loeschen`, `woche_einreichen`, `zeiten_pruefen`, `vertrag_speichern`, `monat_abschliessen`, `monat_aufheben` | Menschen; Freigaben und Abschlüsse nur Admin | Arbeitszeit. |
| `social_speichern`, `social_loeschen` | alle (Agenten höchstens Status „Zur Freigabe“) | Social-Plan. |
| `system_speichern`, `system_loeschen` | Dozent/Admin | Systeme. |
| `vorschlag_speichern`, `vorschlag_stimme`, `vorschlag_loeschen` | alle / Ändern nur Autor solange `neu`, sonst Admin | Vorschläge. |
| `community_antwort`, `community_status` | Dozent/Admin | Kurs-Community. |
| `mitglied_speichern` | Admin | Team verwalten, neuer Link. |

Aufbau des Workflows: Webhook → HTTP-Request `rpc/team_laden` (Supabase-Credential in n8n) → Code „Anfrage prüfen“ (Token, Rolle, Validierung, erzeugt Schreibaufträge als PostgREST-Operationen `{methode, pfad, body}`) → Switch → entweder „Antwort bauen“ (rollenabhängig gefiltert) oder Schreibschleife gegen `rest/v1/<tabelle>` → Ergebnis prüfen → Antwort. Dieses Muster übernimmt das KI Office für seinen eigenen Workflow „TEAM: Office-API“, ohne die Portal-API zu verändern.

## 5. Weitere Workflows (nur dokumentiert, nicht verändert)

Chat-Assistent `TJ5E1KT5MvzxvoD9` (gpt-5-mini, siehe `assistent/workflow.js`), Wochenstand `f0AG5NxtwzSyDr2c`, Kurs-Störungswächter `aZgKgrnuzjmG9Mjr`, Portal-API v2 `kMuDaDmT9rCN5Vs2`.

## 6. Lücken, die das KI Office schließen muss

1. Keine Aufzeichnung, **was Agenten tatsächlich tun** (nur Berichte als Freitext im Aufgabenverlauf).
2. Keine Zustandsmaschine für Agentenläufe, keine Timeouts, kein Umgang mit verspäteten Rückmeldungen, kein Wiederanlauf.
3. Keine Freigaben, die an einen konkreten Inhalt gebunden sind („Ja“ im Kommentar reicht heute).
4. Keine Idempotenz: doppelter Aufruf = doppelte Aktion.
5. Keine Tests, keine Screenshots, kein lokaler Betrieb ohne Produktivdaten.
6. Keine Doku zu Datenschutz, AI Act, Lizenzen, Löschung.

## 7. Umsetzungsplan (priorisiert)

| Prio | Schritt | Ergebnis |
|---|---|---|
| 1 | Gemeinsame Bibliothek `office/lib/` (Zustandsmaschine, Freigabe-Hash, Idempotenz, Rechte, Webhook-Signatur, Verarbeitung) | läuft identisch in n8n-Code-Knoten, Testserver und Tests |
| 2 | SQL `supabase/team_office.sql` und `team_laden()`-Erweiterung | Datenmodell |
| 3 | Testserver `office/dev/server.mjs` mit synthetischen Daten (TESTADAPTER) | lokal startbar mit einem Befehl |
| 4 | Oberfläche `docs/office/` (Projekte, Projekt-Detail, Agenten, Runs, virtuelles Büro) | sichtbares Ergebnis, mobil, Tastatur, reduced motion |
| 5 | Portal-Register „KI Office“ (kleine, rückwärtskompatible Änderung in `index.html`) | Einstieg aus dem Portal |
| 6 | n8n-Workflow „TEAM: Office-API“ als SDK-Code und Import-JSON, Adapter n8n/Test/Stubs | Backend-Vertrag, importierbar nach Freigabe durch Timo |
| 7 | Tests (Unit, Integration, Browser mit Screenshots) und Pflicht-Prüfungen 1–8 | Testbericht |
| 8 | Agenten-Registry, Claude-Code-Subagenten, Doku (Architektur, Setup, Sicherheit, Datenschutz/AI Act, Lizenzen, Skills, Betrieb, Bedienung, Löschkonzept, Restpunkte) | Abgabe |
