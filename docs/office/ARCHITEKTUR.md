# Architektur: Momentum KI Office

Stand: 17.10.2026 · Branch `feature/ki-office`

## 1. Überblick

```
Browser (GitHub Pages)                         n8n (n8n.hm-storage.de)                    Supabase
┌──────────────────────┐   POST {token,aktion}  ┌──────────────────────────┐  rpc/team_laden   ┌──────────────┐
│ docs/team/index.html │ ───────────────────▶  │ TEAM: Portal-API v2       │ ───────────────▶ │ team_*       │
│  Register „KI Office“│                        │ (unverändert)             │ ◀─── PostgREST ── │              │
├──────────────────────┤   POST {token,aktion}  ├──────────────────────────┤                   │ office_*     │
│ docs/office/index.html│ ───────────────────▶ │ TEAM: Office-API (neu)    │ ───────────────▶ │  agenten     │
│  + js/*.js            │ ◀── JSON ───────────  │  Code „Anfrage prüfen“ =  │ ◀─── PostgREST ── │  runs        │
│  gleicher Token       │                        │  office/lib/* (gebündelt) │                   │  ereignisse  │
└──────────────────────┘                        │  Zeitplan: Wartung 5 min  │                   │  artefakte   │
                                                 └──────────┬───────────────┘                   │  freigaben   │
             Executor (n8n-Workflow, Claude Code, Codex, Hermes)  │ startRun / cancelRun        │  idempotenz  │
             ◀───────────────────────────────────────────────────┘                              │  run_schluessel│
             ───▶ lebenszeichen, ereignis, artefakt, rueckfrage, freigabe_anfordern (Token)      └──────────────┘
             ───▶ rueckmeldung (signiert: HMAC, Zeitfenster, Nonce)
```

Grundsätze: eine Datenquelle (`team_laden()`), gleiche Projekte und Aufgaben wie das Portal, gesamte Logik serverseitig im Workflow-Code, der Browser zeigt nur an. Der Code in `office/lib/` läuft wortgleich im n8n-Code-Knoten, im lokalen Testserver und in den Tests (Bündelung durch `office/n8n/bauen.mjs`).

## 2. Datenmodell (supabase/team_office.sql)

| Tabelle | Zweck | Schlüssel und Eindeutigkeiten |
|---|---|---|
| `office_agenten` | Registry: Rolle, Raum, Fähigkeiten, erlaubte Tools, Modell und Begründung, Ausführer, Token-Identität (`mitglied_id`), Projektzuordnung, Fristen, Konfig-Version | `agent_id` |
| `office_runs` | Ein Auftrag an einen Agenten: Projekt, Aufgabe, Auftraggeber, Agent, Workflow-/Konfig-Version, Status, Zeitstempel, Versuche, Fehler, Zusammenfassung mit Quelle, Verbrauch, fachliche Abnahme; seit 17.10.2026 zusätzlich `eltern_run_id` (Teilauftrag zeigt auf den Run des Orchestrierers, Fremdschlüssel auf `office_runs.run_id`) und `team_id` (eine Teambildung; Eltern-Run und Kind-Runs tragen dieselbe ID), beide nullable, additiv per `add column if not exists`, mit Teilindizes | `run_id`; unique `idempotenzschluessel`; unique `n8n_execution_id`; Index `eltern_run_id`, `team_id` |
| `office_run_schluessel` | HMAC-Geheimnis je Run für den Rückmelde-Webhook (nie im Browser) | `run_id` |
| `office_ereignisse` | Zeitleiste: Schritte, Tool-Aufrufe, Quellen-Referenzen, Fehler, Wiederholungen, Statuswechsel, Freigaben, Abnahmen | `id`; unique `idempotenz` |
| `office_artefakte` | Ergebnisse: Art, Titel, Ablageort, Inhalts-Hash, Größe, Zusammenfassung; verweisen auf Run, Aufgabe, Projekt | `artefakt_id` |
| `office_freigaben` | Freigabe für genau eine Aktion mit genau einem Inhalts-Hash; Status offen/erteilt/abgelehnt/verfallen/ungueltig/verwendet | `freigabe_id`; unique (`run_id`, `aktion`, `inhalt_hash`) |
| `office_idempotenz` | Idempotenzschlüssel für Aufträge (`auftrag`), externe Aktionen (`aktion`) und Webhook-Nonces (`nonce`) mit gespeicherter Antwort | `schluessel` |
| `team_projekte.raum` | neue Spalte: Raum fürs virtuelle Büro | – |

Verknüpfung zum Portal: Rückfragen, Freigabe-Anfragen, Berichte und Abnahmen werden zusätzlich als Einträge in `team_aufgaben_verlauf` gespiegelt (mit Marker `[run:<run_id>]`), damit sie im Portal sichtbar sind. Ein technisch abgeschlossener Run setzt eine Aufgabe höchstens von „In Arbeit“ auf „Wird getestet“; „Erledigt“ setzt nur ein Mensch.

Datensparsamkeit: Ereignis-Details sind auf 2000 Zeichen begrenzt, Freitext wird von Schlüsselmustern bereinigt (`bereinige()`), Quellen werden nur als Referenz (URL/ID) gespeichert. Es gibt kein Feld für Prompts oder Gedankengänge.

## 3. Schnittstelle „TEAM: Office-API“

Request: `POST https://n8n.hm-storage.de/webhook/office-api`, Body `{ "token": "…", "aktion": "…", "daten": { … } }` (`Content-Type: text/plain`, wie Portal-API). Antwort `{ ok: true, … }` oder `{ ok: false, fehler }` mit HTTP 400/401/403/404/409/500.

| Aktion | Wer | Zweck |
|---|---|---|
| `laden` | alle | Rollenabhängig gefilterte Daten: ich, mitglieder (minimal), projekte, aufgaben, verlauf, notizen (Metadaten), agenten, runs, ereignisse, artefakte, freigaben, sichtbare_projekte, status_text, uebergaenge, fristen, externe_aktionen, quelle, stand |
| `auftrag_starten` | Menschen; Agenten nur für sich selbst | Neuer Run (Pflicht: `idempotenzschluessel`); liefert einmalig `rueckmelde_schluessel` |
| `auftrag_delegieren` | ausführender Agent des Eltern-Runs (oder ein Mensch, der ihn steuern darf) | `auftrag_starten` mit `eltern_run_id` (Pflicht) und optional `team_id`: Teilauftrag an einen anderen Agenten. Nur wenn der Eltern-Run `in_arbeit` ist, der Registry-Eintrag des Eltern-Agenten das Werkzeug `auftrag_delegieren` hat, das Zielprojekt für Aufrufer, Eltern-Agent und Zielagent sichtbar ist (Projektgrenze) und der Zielagent dem Projekt zugeordnet ist. Ohne `projekt` gilt das Projekt des Eltern-Runs. Ereignis am Eltern-Run („Teilauftrag delegiert an …“, Werkzeug `auftrag_delegieren`, Kind-`run_id` in den Details) und am Kind-Run („Teilauftrag von …“). Antwort wie `auftrag_starten` plus `eltern_run_id`, `team_id` |
| `lebenszeichen` | ausführender Agent | Heartbeat; Warteschlange → in Arbeit; optional `n8n_execution_id` (eindeutig) |
| `ereignis` | ausführender Agent | Schritt/Tool/Quelle/Fehler; Tool muss in `erlaubte_tools` sein; optional `idempotenz` |
| `artefakt` | ausführender Agent | Ergebnis mit Ablageort und optionalem Hash |
| `rueckfrage` / `antwort` | Agent / Auftraggeber, Dozent, Admin | in Arbeit ↔ wartet auf Rückmeldung |
| `freigabe_anfordern` | ausführender Agent | Freigabe für externe Aktion (Hash über Aktion + Inhalt); ältere offene/erteilte Freigaben derselben Aktion werden ungültig |
| `freigabe_entscheiden` | Menschen; kritisch (Zahlung, Löschung, Vertrag) nur Admin; nie der Anfordernde | erteilt (24 h gültig, einmalig) oder abgelehnt |
| `aktion_ausfuehren` | ausführender Agent | Externe Aktion nur mit gültiger Freigabe und Idempotenzschlüssel; markiert Freigabe als verwendet; n8n leitet an Executor-Knoten weiter |
| `run_beenden` | ausführender Agent (Token) | abgeschlossen oder fehlgeschlagen, Zusammenfassung, Verbrauch, Artefakte; verspätet → nur Hinweis. Teamregel: `abgeschlossen` mit offenen Kind-Runs → 409 mit `offene_kind_runs`; `fehlgeschlagen` geht immer. Ein beendeter Teilauftrag schreibt einen Hinweis in die Zeitleiste des Eltern-Runs |
| `rueckmeldung` | Executor ohne Token | wie `run_beenden`, aber HMAC-signiert (Zeitfenster 300 s, Nonce einmalig) |
| `run_abbrechen`, `run_wiederholen`, `run_abnehmen` | Auftraggeber, Dozent, Admin | Steuerung; Abnahme nur bei technisch abgeschlossen |
| `wartung` | Zeitplan (intern) oder Admin | Timeouts, veraltete Runs, verfallene Freigaben, alte Idempotenzschlüssel |
| `agent_speichern`, `loeschen` | Admin | Registry; Löschung nach Löschkonzept |

Agenten dürfen ausschließlich: laden, auftrag_starten (für sich), auftrag_delegieren (nur aus einem eigenen laufenden Run und nur mit dem Werkzeug `auftrag_delegieren` in `erlaubte_tools`, sonst 403), lebenszeichen, ereignis, artefakt, rueckfrage, freigabe_anfordern, aktion_ausfuehren, run_beenden. Alles andere beantwortet der Server mit 403 (`office/lib/rechte.js`). `laden` liefert bei jedem Run `eltern_run_id` und `team_id` (null, wenn keine Orchestrierung) und zeigt dem Orchestrierer seine Kind-Runs auch dann, wenn ein anderer Agent sie ausführt (Projektgrenze bleibt).

## 4. Zustandsmaschine

Status: Warteschlange, in Arbeit, wartet auf Rückmeldung, wartet auf Freigabe, abgeschlossen (technisch), fehlgeschlagen, abgebrochen, unbekannt/veraltet. „Technisch erfolgreich“ (`status = abgeschlossen`) und „fachlich abgenommen“ (`abgenommen = true`, nur Menschen) sind getrennte Felder.

Diese Tabelle wird aus `office/lib/zustand.js` erzeugt (`uebergangsTabelleMarkdown()`):

| Von | Nach | Wer | Anlass |
|---|---|---|---|
| Warteschlange | in Arbeit | agent, system | Executor meldet Start oder erstes Lebenszeichen |
| Warteschlange | fehlgeschlagen | agent, system | Start nicht möglich (Dispatch-Fehler) |
| Warteschlange | abgebrochen | mensch | Auftrag zurückgezogen |
| Warteschlange | unbekannt / veraltet | system | Wartezeit überschritten, kein Executor hat übernommen |
| in Arbeit | wartet auf Rückmeldung | agent | Agent stellt eine Rückfrage |
| in Arbeit | wartet auf Freigabe | agent | Agent fordert Freigabe für eine externe Aktion an |
| in Arbeit | abgeschlossen (technisch) | agent | Ergebnis gemeldet (technisch erfolgreich, noch nicht abgenommen) |
| in Arbeit | fehlgeschlagen | agent, system | Fehler gemeldet |
| in Arbeit | abgebrochen | mensch | Mensch bricht ab (cancelRun) |
| in Arbeit | unbekannt / veraltet | system | Kein Lebenszeichen länger als timeout_sek (auch nach Neustart) |
| wartet auf Rückmeldung | in Arbeit | mensch | Mensch beantwortet die Rückfrage |
| wartet auf Rückmeldung | abgebrochen | mensch | Mensch bricht ab |
| wartet auf Rückmeldung | fehlgeschlagen | agent, system | Executor meldet Fehler |
| wartet auf Rückmeldung | unbekannt / veraltet | system | Wartefrist für Menschen überschritten |
| wartet auf Freigabe | in Arbeit | mensch | Freigabe erteilt oder abgelehnt (Agent entscheidet dann, wie es weitergeht) |
| wartet auf Freigabe | Warteschlange | mensch | Timo (Admin) gibt den Start eines Auftrags frei, den ein Teammitglied angelegt hat |
| wartet auf Freigabe | abgebrochen | mensch | Mensch bricht ab, oder Timo lehnt den Start eines Auftrags ab |
| wartet auf Freigabe | fehlgeschlagen | agent, system | Executor meldet Fehler |
| wartet auf Freigabe | unbekannt / veraltet | system | Wartefrist für Menschen überschritten |
| fehlgeschlagen | Warteschlange | mensch, system | Wiederholung, nur solange versuche < max_versuche |
| unbekannt / veraltet | abgebrochen | mensch | Mensch schließt den veralteten Run ab (Aufräumen); nie nachträglich „abgeschlossen“ |

**Teamregel (Orchestrierung, 17.10.2026).** Ein Run mit Kind-Runs (`eltern_run_id` zeigt auf ihn) gilt erst als technisch abgeschlossen, wenn alle Kind-Runs in einem Endzustand sind; `run_beenden` mit `abgeschlossen` liefert vorher 409. Die Wartung behandelt offene Kind-Runs als Lebenszeichen des Eltern-Runs: Solange ein Kind läuft, wird der Eltern-Run nicht als veraltet markiert; sind alle Kinder beendet, zählt `timeout_sek` ab dem letzten Kind-Ende (oder dem letzten eigenen Lebenszeichen, je nachdem, was später war). Die fachliche Abnahme bleibt beim Menschen und gilt je Run. Abbruch eines Eltern-Runs bricht Kinder nicht automatisch ab (RESTPUNKTE.md).

Fristen (Standard, je Agent und Run überschreibbar): Warteschlange 30 Minuten bis ein Executor übernimmt (n8n und Codex; Claude-Code-Aufträge 14 Stunden, weil der Abholer nur stündlich von 8 bis 20 Uhr läuft, Hermes 3 Stunden; `FRISTEN.wartezeit_je_ausfuehrer` in `office/lib/zustand.js`); Timeout ohne Lebenszeichen 15 Minuten; Wartefrist auf Menschen 7 Tage; erteilte Freigabe 24 Stunden; höchstens 3 Versuche. Die Wartung läuft alle 5 Minuten per Zeitplan und bei jedem Neustart greift sie automatisch, weil sie nur Zeitstempel in der Datenbank vergleicht: Runs „in Arbeit“ ohne Lebenszeichen werden als unbekannt/veraltet markiert. Verspätete Rückmeldungen nach einem Endzustand werden als Hinweis-Ereignis gespeichert und ändern den Status nie; insbesondere wird nichts nachträglich „abgeschlossen“.

## 5. Freigaben und Idempotenz

- Freigabe-Hash: `sha256(kanonisch({ aktion, inhalt }))`. Kanonisches JSON mit sortierten Schlüsseln, damit Reihenfolge keine Rolle spielt, jedes Zeichen aber schon.
- Eine Freigabe gilt für genau eine Ausführung (`verwendet`) und verfällt nach 24 Stunden. Geänderter Inhalt → `ungueltig`, neue Freigabe nötig (serverseitig geprüft, Pflichtprüfung 4).
- Idempotenz: Aufträge und externe Aktionen brauchen einen Schlüssel (8 bis 120 Zeichen). Gleicher Schlüssel → gespeicherte Antwort mit `wiederholt: true`, keine zweite Wirkung. Zusätzlich sichern Unique-Indizes in Supabase (Idempotenzschlüssel, n8n-Execution-ID, Nonce, Freigabe je Aktion und Hash) Wettläufe ab; der Testserver simuliert dieselben Eindeutigkeiten (409).
- Rückmelde-Webhook: `signatur = HMAC-SHA256(schluessel, zeit + '.' + nonce + '.' + sha256(kanonisch(ergebnis)))`, Zeitfenster ±300 s, Nonce einmalig (Tabelle `office_idempotenz`, Art `nonce`).

## 6. Adaptergrenze (office/adapter/)

| Datei | Status | Beschreibung |
|---|---|---|
| `schnittstelle.js` | definiert | `startRun(auftrag)`, `cancelRun(auftrag)`, `rueckmeldung(nachricht)` plus Regeln für alle Ausführer |
| `n8n.js` | echt, **live getestet 17.10.2026** (Knoten „Ausführer anstoßen“ hat den n8n-Ausführer aufgerufen, Abschnitt 10a) | Übergibt Aufträge an die `ausfuehrer_url` des Agenten (im Workflow: Knoten „Ausführer anstoßen“); Hilfsfunktion zum Signieren |
| `test.js` | TESTADAPTER | Simuliert Executoren: Lebenszeichen, Schritte, Rückfragen, Freigaben, Ergebnisse, Fehler, Stille (Timeout), verspätete Rückmeldung, Abbruch |
| `hermes.stub.js`, `claude-code.stub.js` | Stubs | Geplanter Ablauf und Pflichten (isolierte Umgebung, begrenzte Rechte, keine Shell aus Eingaben) |

Die Office-API kennt nur die Schnittstelle. Damit bleibt n8n ein austauschbares Backend (wichtig für die n8n-Lizenzfrage bei späterem Kundenzugang, siehe QUELLEN_UND_LIZENZEN.md).

## 7. Oberfläche (docs/office/)

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst und CSS (gleiche Variablen und Klassen wie das Portal) |
| `js/app.js` | Routing (`#/tab/…`, `#/projekt/…`, `#/agent/…`, `#/run/…`, `#/raum/…`), Laden, Auffrischen alle 60 s, Anmeldung |
| `js/api.js` | Token (`mt-token`, `?z=`), API-URL (lokal `/api/office`, sonst n8n) |
| `js/modell.js` | Kennzahlen aus zählbaren Daten mit Quelle, Agentenzustand, Raumzuordnung |
| `js/ansichten.js` | Projekte (Liste/Kanban, Suche, Filter), Projekt-Detail, Agenten, Agent-Detail, Run, Freigaben, Dialoge |
| `js/buero.js` | Virtuelles Büro als SVG mit Monitor je Raum, Monitorwand (`#/monitor/<Raum>`), Liste darunter für Tastatur und Screenreader |
| `js/util.js` | `esc()`, Datum, Chips |

Im Portal (`docs/team/index.html`) kam nur das Register „KI Office“ dazu (TABS-Eintrag, Funktion `vOffice`), rückwärtskompatibel.

## 8. Lokaler Betrieb und Tests

`node office/dev/server.mjs` startet den TESTADAPTER (statische Seiten, Office-API, Portal-`laden`, Testendpunkte für Zeitsprung, Wartung, Neustart, Szenario). `npm run test:office` führt Unit-, Szenario-, Bündel-, Integrations- und Browsertests aus. Details in TESTBERICHT.md.

## 9. Büroszene und Einbettung ins Team-Portal (Ergänzung 17.10.2026)

**Szene.** `docs/office/js/buero.js` zeichnet das Büro als isometrische 2D-Szene in einem eigenen SVG: fünf schwebende Plattformen (Räume) um eine Zentrale, Agenten als Figuren an Schreibtischen, Sprechblasen „Freigabe?“ und „Frage“, wenn ein Mensch gebraucht wird, Verbindungslinien zur Zentrale fließen nur bei laufenden Aufträgen. Rechts ein Live-Panel mit offenen Freigaben (mit Entscheidungsknöpfen) und den letzten zehn Ereignissen aller Runs. Alles aus `ctx.D`, keine zweite Datenquelle. Tastatur: 1–5 springt zum Raum, Tab läuft durch Räume, Zentrale und Agenten, Enter öffnet. `prefers-reduced-motion` schaltet alle Animationen ab. Eigene Grafik, keine fremden Assets, kein 3D.

**Einbettung.** Das Team-Portal zeigt das Office direkt auf seiner Oberfläche, bleibt aber technisch getrennt:

| Ort im Portal | Einbettung | Verhalten |
|---|---|---|
| Register „KI Office“ | `<iframe src="../office/?einbetten=1#/tab/buero">` | vollständiges Office ohne eigenen Kopf und Fuß, mit seinen vier Reitern |
| Register „Übersicht“ | `<iframe src="../office/?einbetten=1&nur=buero#/tab/buero">` | nur die Büroszene und das Live-Panel, ohne Reiter; wer einen Raum oder Agenten öffnet, bekommt einen Rücksprung „← Zurück zum Büro“ |

Gleiche Herkunft (GitHub Pages, derselbe Host und Pfad `/N8N-Automation/`), darum teilen Portal und Office den Token in `localStorage` ohne Weitergabe per URL. Das Office meldet seine Höhe per `postMessage({typ:'ko-hoehe'})` an das Portal; das Portal akzeptiert nur Nachrichten mit `e.origin === location.origin` und nur von seinen eigenen iframes. Links aus dem Office ins Portal (Aufgaben, Notizen) öffnen im Elternfenster (`target=_parent`), damit das Portal nicht im Portal lädt. Die Parameter stehen in `docs/office/js/app.js` (`EINGEBETTET`, `NUR`).

## 9a. Monitore je Raum und Monitorwand (Ergänzung 17.10.2026)

**Daten.** `modell.js` liefert mit `raumArtefakte(D, raum, n)` die letzten n Artefakte aus den Runs aller Projekte eines Raums (Raum über `team_projekte.raum` oder Agentenzuordnung, wie überall), sortiert nach `erstellt` absteigend, jedes mit `typ`, `url`, `run`, `projekt` und `pruefstand` (`abgenommen` / `zurueckgewiesen` / `ungeprueft` aus `run.abgenommen`). `artefaktTyp(a)` erkennt aus `art` und Dateiendung des Ablageorts: `bild` (png, jpg, jpeg, svg, webp, gif), `html`, `pdf`, sonst `sonst`. `ladbareAdresse(s)` lässt nur `https://` und relative Pfade (ohne Schema, nicht `//`, kein Backslash, kein Leerraum, keine Steuerzeichen) durch; Bild und HTML ohne ladbare Adresse werden zu `sonst`. `raumMonitor(D, raum)` wählt für den Monitor das neueste Bild- oder HTML-Artefakt, sonst das neueste PDF, sonst das neueste überhaupt (eine neuere Textnotiz verdrängt also kein Diagramm und keinen PDF-Verweis). Keine zweite Datenquelle: alles aus `ctx.D`, also aus der schon rechtegefilterten `laden`-Antwort.

**Szene.** `buero.js` zeichnet je Raum ein Monitor-Element (`<a class="monitor" href="#/monitor/<Raum>">`) als großen Wandbildschirm hinter der Plattform (160×100 im 1000×690-Raster, zwei Stützen zur hinteren Kante): Rahmen mit Raumakzent, Inhalt, Prüfmarke, Titelzeile. Die Raumkarten stehen deshalb bei allen Räumen vor der Plattform, die Zentrale ist auf y=410 gerückt und als Gehirn gezeichnet (`gehirn()`: Umriss, Windungen, Stamm, Synapsen mit `.puls` bei laufender Arbeit). Bild → `<image href>`, HTML → `<foreignObject>` mit `<iframe sandbox="" referrerpolicy="no-referrer" loading="lazy">` (verkleinert dargestellt, `pointer-events:none`), PDF/sonst → Karte, kein Artefakt → „noch kein Ergebnis“. Unter dem Bild steht immer eine Textkarte, damit ein nicht ladbares Bild nicht leer bleibt. Die Figuren sitzen vor dem Bildschirm; Sprechblasen liegen darüber.

**Monitorwand.** Route `#/monitor/<Raum>` (app.js) → `vMonitorwand(ctx, raum)`: bis zu 12 Kacheln (`.kacheln`/`.kachel`), gleiche Regeln für die Vorschau, dazu Run-Link, Aufgabe (Portal), Projekt, Zeit, Hash, Prüftext und „Öffnen ↗“ (`target=_blank rel=noopener noreferrer`). Vorschauen sind nie interaktiv; der Weg zum Original ist der explizite Link.

**Testdaten.** `office/dev/testdaten.mjs` legt über die normale `artefakt`-Aktion vier grafische Ergebnisse an (drei selbst gezeichnete SVG-Diagramme und eine HTML-Vorschau aus `docs/office/testbilder/`, Hash = echter SHA-256 der Datei) sowie einen PDF-Verweis ohne Vorschau; Verwaltung bleibt ohne Ergebnis. Keine fremden Bilder.

## 10. Anbindung von Werkzeugen (API, MCP) über n8n

Alle Werkzeuge der Agenten laufen über n8n, nie direkt aus dem Browser. Das ist bewusst: Credentials bleiben in n8n, jede Aktion läuft durch dieselbe Rechte- und Freigabeprüfung, und das Office sieht nur das Ergebnis als Ereignis.

| Weg | Wofür | Stand |
|---|---|---|
| **n8n-Agentenworkflow als Ausführer** (`ausfuehrer_url` je Agent in der Registry) | Agent bekommt den Auftrag per signiertem Webhook, nutzt in n8n seine Werkzeugknoten (HTTP, Supabase, Twenty CRM, E-Mail, Kalender …) und meldet Schritte, Werkzeugaufrufe und Ergebnisse an die Office-API zurück | **läuft** für `verwaltung-status`: Workflow „TEAM: Office-Ausführer verwaltung-status“ (ID `KwRsEDr743IGDPJ1`), Ende-zu-Ende getestet 17.10.2026 (Abschnitt 10a); für `orchestrierer`: „TEAM: Office-Ausführer orchestrierer“ (ID `D0jPTU1LjNzhGfyI`), Ende-zu-Ende getestet 18.10.2026 (Abschnitt 10b); weitere n8n-Agenten nach demselben Muster |
| **n8n MCP-Server-Trigger** | Externe Agenten (Claude Code, Codex, Hermes) rufen n8n-Workflows als Werkzeuge über MCP auf; n8n prüft Token und Rechte, schreibt Ereignisse ins Office | Konzept; n8n bietet den MCP-Server-Trigger und Instance-level MCP (siehe Kursinhalt Anleitung B) |
| **n8n MCP-Client-Knoten** | n8n-Agenten nutzen fremde MCP-Server (z. B. Obsidian, CRM) als Werkzeuge | Konzept; jedes Werkzeug muss in der Registry unter `werkzeuge` stehen, sonst darf der Agent es nicht nutzen |
| **Portal-API v2 / Office-API per HTTP** | Agenten lesen Aufgaben und melden Berichte (heute `agenten/team.py`) | läuft (Portal) bzw. wartet auf Import (Office) |

Regeln, die für alle Wege gelten: Werkzeuge nur aus der Allowlist der Registry; externe Aktionen (E-Mail, Posts, Zahlungen, Löschen) nur mit inhaltsgebundener Freigabe; Rückmeldungen signiert (HMAC, Zeitfenster, Nonce); Allowlist für `ausfuehrer_url`-Domains ist offen (SICHERHEIT.md S6).

### 10a. Erster echter Ausführer: verwaltung-status (ergänzt 17.10.2026, KI-erstellt: Claude Code)

Quelle: `office/n8n/ausfuehrer-verwaltung-status.workflow.js` (SDK-Code, per MCP angelegt). Webhook: `POST https://n8n.hm-storage.de/webhook/office-ausfuehrer-verwaltung`, eingetragen als `ausfuehrer_url` des Agenten `verwaltung-status` in `office_agenten`.

Ablauf eines Runs (24 Knoten, ein Durchlauf etwa 4 Sekunden):

1. **Auftrag vom Office**: Die Office-API ruft den Webhook mit `{ art, run_id, agent_id, rueckmelde_schluessel }` auf; der Webhook antwortet sofort (HTTP 200), die Office-API wartet nicht.
2. **Einstellungen** (Set-Knoten): Mitglied `agent-claude`, Adressen, `glaettung = false`, `modell = gpt-5-mini`. Hier wird die Glättung ein- oder ausgeschaltet.
3. **Start?**: nur `art = start`, `run_id` und Schlüssel mit erlaubten Zeichen. `abbruch` wird nur zur Kenntnis genommen (der Run ist serverseitig schon abgebrochen).
4. **Zugang laden / Schlüssel prüfen / Zugang prüfen**: Der Token des Mitglieds `agent-claude` wird zur Laufzeit aus `team_mitglieder` gelesen (Supabase-Credential in n8n; der Token steht nirgends im Workflow). Der mitgeschickte Rückmelde-Schlüssel muss zu `office_run_schluessel` passen, sonst wird der Aufruf verworfen. Das ersetzt eine Signatur des Startaufrufs: Nur wer den Schlüssel des Runs kennt (die Office-API), kann den Ausführer arbeiten lassen.
5. **Lebenszeichen** → Warteschlange → in Arbeit. **Daten laden** (`laden` mit Agenten-Token, also nur die Projekte des Agenten).
6. **Wochenstand bauen** (Code, deterministisch, kein Modell): offene Aufgaben je Projekt (Tabelle), überfällig, fällig in 7 Tagen, Blockaden (Status „Wartet“ oder Label „blockiert/wartet auf“), Liste je Projekt. Zeilen mit Passwort-/Token-Wörtern werden herausgefiltert. Kurzfassung bis 900 Zeichen für Office und Artefakt.
7. **Ereignis: Aufgaben gelesen** (`art = tool`, `tool = aufgaben_lesen`, `quelle_ref = …/webhook/office-api#laden`, Kennzahlen und n8n-Execution-ID in den Details).
8. **Glättung an?** → optional `gpt-5-mini` über HTTP mit dem OpenAI-Credential; die Antwort wird nur übernommen, wenn alle Zahlen im Text unverändert sind, sonst bleibt der deterministische Text. Standard AUS (kostet sonst Geld).
9. **Notiz speichern**: Markdown als `team_notizen` (`n_office_wochenstand_JJJJwWW`, Upsert, Projekt des Runs). **Ereignis: Wochenstand erstellt** (`tool = notiz_speichern`, `quelle_ref = team_notizen/<id>`), **Artefakt** (`art = bericht`, `ablageort` = Notiz-Titel und Projekt), **Run abschließen** (`run_beenden`, `status = abgeschlossen`, Zusammenfassung = Kurzfassung plus Ablageort).
10. **Fehler**: Jeder Knoten nach dem Lebenszeichen hat einen Fehlerausgang → „Fehlertext bauen“ → `run_beenden` mit `status = fehlgeschlagen` und Fehlertext (inkl. n8n-Execution-ID). Fehler vor dem Lebenszeichen (kein Token, falscher Schlüssel) bleiben n8n-Fehlerläufe; die Office-API markiert den Run nach 30 Minuten als veraltet.

Bewusst so entschieden:
- **Token aus Supabase statt Header-Credential**: Die Office-API nimmt den Token nur im Body an. Ein Header-Auth-Credential käme dort nicht an. Der Weg über das Supabase-Credential ist derselbe, den die bestehenden TEAM-Workflows (Wochenstand, Störungswächter) nutzen. Alternative für später: Office-API akzeptiert zusätzlich einen Header (RESTPUNKTE).
- **`run_beenden` mit Token statt signierter `rueckmeldung`**: beides erlaubt die Schnittstelle; mit Token entfällt HMAC im Code-Knoten (`require('crypto')` ist dort gesperrt).
- **`n8n_execution_id` nur in Ereignis-Details**, nicht im Run: Der Unique-Index auf `office_runs.n8n_execution_id` würde bei einer Wiederholung (neue Execution) ein 409 auslösen (RESTPUNKTE).
- **Erfolgreiche Läufe werden nicht gespeichert** (`saveDataSuccessExecution: none`, wie bei der Office-API), weil Knotenausgaben den Agenten-Token enthalten. Fehlerläufe werden gespeichert.

Weitere n8n-Ausführer (marketing-texter, social-planer) entstehen nach demselben Muster: Datei kopieren, Webhook-Pfad, `mitglied_id`, Werkzeugknoten und Rückmeldungen anpassen, `ausfuehrer_url` in der Registry setzen.

### 10b. Ausführer des Orchestrierers (ergänzt 18.10.2026, KI-erstellt: Claude Code)

Quelle: `office/n8n/ausfuehrer-orchestrierer.workflow.js` (SDK-Code, per MCP angelegt). n8n-Workflow „TEAM: Office-Ausführer orchestrierer“ (ID `D0jPTU1LjNzhGfyI`). Webhook: `POST https://n8n.hm-storage.de/webhook/office-ausfuehrer-orchestrierer`, eingetragen als `ausfuehrer_url` des Agenten `orchestrierer` (Ausführer `n8n`). Erste Fassung ohne Modellaufruf: Zerlegen, Agentenwahl und Zusammenführen sind deterministisch und kosten nichts außer n8n-Laufzeit.

Der Orchestrierer arbeitet in zwei getrennten Läufen, weil er nicht aktiv auf seine Teilaufträge wartet. Offene Kind-Runs zählen als sein Lebenszeichen (Teamregel, Abschnitt 4).

**Pfad A, Webhook (zerlegen und delegieren):**

1. Auftrag vom Office, Einstellungen, „Start?“, Zugang und Rückmelde-Schlüssel prüfen: genau wie beim Muster (Abschnitt 10a, Schritte 1 bis 4).
2. **Lebenszeichen** (Warteschlange → in Arbeit), **Daten laden** mit dem Agenten-Token.
3. **Zerlegen** (Code): Der Auftragstext wird an Zeilenumbrüchen und Semikolons in Teile zerlegt. Aufzählungszeichen (`-`, `*`, `•`, `1.`) am Zeilenanfang werden entfernt, Teile unter 3 Zeichen ignoriert. Ein Teil darf mit `@agent-id:` beginnen, dann geht er an genau diesen Agenten. Ohne Angabe wählt der Workflow aus der Registry einen aktiven Agenten desselben Projekts ohne das Werkzeug `auftrag_delegieren`, in Registry-Reihenfolge; mehrere Teile ohne Angabe gehen der Reihe nach an die Kandidaten. Jeder Teil heißt „Teil n von m: …“.
4. **Abbruch vor jeder Delegation**, wenn die Zerlegung leer ist, ein `@agent` nicht in der Registry steht, deaktiviert ist, selbst delegieren darf oder dem Projekt nicht zugeordnet ist, oder wenn das Projekt keinen Kandidaten hat. Dann meldet der Fehlerpfad `run_beenden fehlgeschlagen` mit einer Meldung, die die Zeile nennt. So entsteht nie ein halbes Team aus einem fehlerhaften Auftrag.
5. **Ereignis: Aufgaben gelesen** (`tool = aufgaben_lesen`) und **Ereignis: Registry gelesen** (`tool = registry_lesen`, gewählte Agenten und Kandidaten in den Details).
6. **Nacheinander delegieren** (Schleife, ein Teil je Runde) → **Delegieren**: je Teil `auftrag_delegieren` mit `eltern_run_id = run_id`, `team_id = team-<run_id>`, `idempotenzschluessel = deleg-<run_id>-<n>`. Die Office-API legt den Kind-Run an und stößt seinen Ausführer an. Wiederholt n8n den Lauf, entsteht durch den Idempotenzschlüssel kein zweiter Kind-Run.
7. **Delegation prüfen**: ordnet die Antworten den Teilen zu. Gelingt keine Delegation, Fehlerpfad. Gelingen nur einige, steht das im Ereignis **„n Teilaufträge delegiert, m nicht delegiert“** (`art = schritt`, Kinder und Fehlschläge in den Details). Danach endet der Lauf.

**Pfad B, Zeitplan alle 5 Minuten (zusammenführen):**

1. Token von `agent-claude` laden, **Daten laden** mit dem Agenten-Token.
2. **Teams prüfen** (Code): alle Runs des Orchestrierers in `in_arbeit` mit Kind-Runs, bei denen alle Kinder in einem Endzustand sind. Für jedes solche Team entsteht deterministisch ein Markdown-Text: je Teil Agent, Status, Auftrag, Zusammenfassung oder Fehler, Ergebnisse (Artefakt-Titel und Ablageort) und Kind-Run-ID. Zeilen mit Passwort-, Token- oder Schlüsselwörtern werden herausgefiltert.
3. **Notiz speichern**: `team_notizen` mit `notiz_id = n_office_teamergebnis_<run_id>`, Titel „Teamergebnis <run_id>“, Projekt des Runs (Upsert).
4. **Ereignis: Teamergebnis** (`tool = notiz_speichern`, `quelle_ref = team_notizen/<id>`), **Artefakt** (`art = notiz`, nur wenn es noch keins mit diesem Titel gibt), **Run abschließen** mit `run_beenden`: `abgeschlossen`, wenn alle Kinder abgeschlossen und alle Teile delegiert sind; sonst `fehlgeschlagen` mit Fehlertext (welcher Teil, welcher Agent, welcher Status).
5. Mehrere fertige Teams in einem Lauf bleiben getrennt: die Knoten nach „Ablage prüfen“ greifen mit `.item` auf ihr eigenes Team zu, nie mit `.first()`.
6. Scheitert ein Schritt, bleibt der Lauf ein gespeicherter n8n-Fehlerlauf. Der nächste Takt versucht es erneut; Notiz (Upsert), Ereignis (Idempotenz) und Artefakt (nur einmal) entstehen dabei nicht doppelt.

Bewusst so entschieden:
- **Kein Modell in der ersten Fassung.** Zerlegen nach Zeilen und Zusammenführen nach Status sind für heutige Aufträge ausreichend und prüfbar. Ein Modell für freie Zerlegung kommt erst mit Timos Ja (RESTPUNKTE.md).
- **Kein aktives Warten.** Ein n8n-Lauf, der minutenlang auf Kinder wartet, bindet einen Worker und verliert bei einem Neustart seinen Zustand. Der Zeitplan liest den Zustand dagegen jedes Mal frisch aus der Datenbank.
- **Nacheinander delegieren.** Ein HTTP-Knoten schickt mehrere Items gleichzeitig ab. Die Office-API bekäme dann mehrere Aufrufe für denselben Eltern-Run zur selben Zeit.
- **Fehler, Token, Läufe:** wie beim Muster (Abschnitt 10a). Erfolgreiche Läufe werden nicht gespeichert, weil Knotenausgaben den Agenten-Token enthalten.

**Schreibreihenfolge der Office-API (behoben 18.10.2026).** Beim ersten echten Team-Lauf scheiterte ein Kind-Run am Fremdschlüssel. Ursache: Der Knoten „In Supabase schreiben“ schickte die Schreibaufträge einer Aktion gleichzeitig, `office_ereignisse` und `office_run_schluessel` kamen vor der Zeile in `office_runs` an. Batching allein ordnet die Anfragen nicht sicher. Die Office-API schreibt deshalb jetzt in einer Schleife „Nacheinander schreiben“ (Loop Over Items, eine Zeile je Runde); „Ergebnis prüfen“ hängt am Fertig-Ausgang.

## 11. Rekruiter, Orchestrierer und PA-Assistent (ergänzt 17.10.2026)

Drei weitere Registry-Einträge, auf Timos Wunsch angelegt. Der Orchestrierer hat seit 18.10.2026 einen n8n-Ausführer (Abschnitt 10b); Rekruiter und PA-Assistent haben noch keinen (siehe RESTPUNKTE.md).

| Agent | Aufgabe | Was er darf | Was er nicht darf |
|---|---|---|---|
| `rekruiter` | Neue Agenten „einstellen“: Bedarf klären, Steckbrief (Rolle, Fähigkeiten, Werkzeuge, Modell, Raum, Projekte) als Artefakt vorlegen | `registry_lesen`, `agent_vorschlagen`, `notiz_speichern` | Agenten selbst anlegen. `agent_speichern` bleibt Admin-Aktion; Timo übernimmt den Steckbrief oder lehnt ab. Später: eigene Freigabe-Art „agent_anlegen“ (inhaltsgebunden), dann legt der Workflow nach Freigabe an. |
| `orchestrierer` | Aufgaben erkennen, zerlegen, an passende Agenten delegieren, bei Bedarf Teams bilden | `aufgaben_lesen`, `registry_lesen`, `auftrag_delegieren`, `notiz_speichern` | Selbst ausführen; über Projektgrenzen delegieren; externe Aktionen auslösen. |
| `pa-assistent` | Termine im Blick, Postfächer lesen, Entscheidungsbedarf als Rückfrage oder Aufgabe auf Timos Tisch legen | `kalender_lesen`, `email_lesen`, `aufgaben_lesen`, `rueckfrage`, `notiz_speichern` | Mails beantworten, Termine ändern (nur mit Freigabe `email_senden` / `kalender_aendern`). |

**Orchestrierung im Datenmodell (gebaut 17.10.2026, Branch `feature/ki-office-orchestrierer`, KI-erstellt: Claude Code).** `office_runs.eltern_run_id` (Teilauftrag zeigt auf den Run des Orchestrierers, Fremdschlüssel) und `office_runs.team_id` (eine Teambildung; der Eltern-Run übernimmt die `team_id` des ersten Teilauftrags, weitere Teilaufträge erben sie, eine abweichende `team_id` wird mit 409 abgelehnt). Die Aktion `auftrag_delegieren` (Abschnitt 3) ist `auftrag_starten` mit `eltern_run_id` und läuft durch dieselben Prüfungen: Idempotenzschlüssel Pflicht, Zielagent aktiv, Projekt vorhanden und für den Aufrufer sichtbar, Zielagent dem Projekt zugeordnet; zusätzlich muss der Eltern-Run `in_arbeit` sein, der Aufrufer der ausführende Agent des Eltern-Runs (oder ein Mensch mit Steuerrecht) und der Eltern-Agent das Werkzeug `auftrag_delegieren` in seiner Allowlist haben; delegiert wird nur in Projekte des Eltern-Agenten (Projektgrenze). Der Kind-Run wird wie jeder Run an seinen Ausführer übergeben (`extern.art = start`, mit `eltern_run_id` und `team_id`). Teamregel: siehe Abschnitt 4. Löschen: Die Einzellöschung eines Eltern-Runs nimmt seine beendeten Nachkommen mit (Kinder zuerst, Fremdschlüssel); laufende Kinder blockieren mit 409. Die Sammellöschung lässt Eltern-Runs stehen, deren Kinder nicht selbst erfasst sind.

**Darstellung (gebaut).** Run-Detail: Eltern-Run als Breadcrumb („Teil von ↑ …“, Link; ist er für die Rolle unsichtbar, nur die ID), Kind-Runs im Block „Teilaufträge (n)“ als eingerückte Zweige mit Status, Agent, Projekt, letzter Aktivität und Link (bis drei Ebenen), Chips „Team: n Teilaufträge, m offen“ und „Teilauftrag“. Projekt-Detail und Agenten-Arbeitsübersicht zeigen Teilaufträge eingerückt unter ihrem Eltern-Run (`runBaum`), jeder Run genau einmal; die Kennzahlen zählen jeden Run in seinem Projekt. Agenten-Register: beim Orchestrierer „delegiert: n Teilaufträge“ (Kind-Runs, deren Eltern-Run er ausführt). Büro (`buero.js`): Agenten mit dem Werkzeug `auftrag_delegieren` sitzen in der Zentrale (`istOrchestrierer`), nicht auf einer Raumplattform; laufende Teams (`laufendeTeams`: aktiver Eltern-Run mit Kind-Runs) erscheinen als rosa, fließende Linien von der Orchestrierer-Figur zu den Figuren der Teammitglieder (aktive Teilaufträge animiert, beendete gedimmt; `prefers-reduced-motion` stoppt die Animation), die Legende nennt die Teams mit Mitgliedern, die Liste unter der Szene hat einen Abschnitt „Zentrale“ mit Orchestrierern und Teams. Testadapter: Agenten mit `auftrag_delegieren` delegieren zwei Teilaufträge an Agenten desselben Projekts (`team_id = team-<run_id>`), warten auf die Kinder und führen zusammen; Testdaten enthalten einen Team-Run des Orchestrierers in „Akademie-Kurs“ mit einem abgeschlossenen und einem laufenden Teilauftrag.

**PA-Assistent und Datenschutz.** Postfächer lesen ist eine neue Verarbeitung (Mails Dritter, ggf. Beschäftigtendaten). Vor dem ersten echten Lauf: Zweck und Rechtsgrundlage festhalten, betroffene Postfächer benennen, AV-Vertrag mit dem Mailanbieter prüfen, Datensparsamkeit (nur Betreff, Absender, Fristen und ein kurzer Entscheidungssatz landen im Office, nie der Mailinhalt). Siehe DATENSCHUTZ_AI_ACT.md, Anwendungsfall D.

## 12. Obsidian-Spiegelung der Ergebnisse (ergänzt 17.10.2026, KI-erstellt: Claude Code)

Der zentrale Speicher bleibt Supabase. Obsidian bekommt einen **Lesespiegel der Artefakte**: `agenten/office.py obsidian` ruft `laden` auf (rollengefilterte Antwort, kein zusätzlicher Endpunkt, keine Änderung an n8n oder Supabase), vergleicht die Artefakte mit einer Zustandsdatei neben dem Skript (`office.obsidian.json`: Zeitstempel des neuesten gespiegelten Artefakts, Liste der IDs) und schreibt pro Run eine Notiz in `01 Inbox/KI Office/` des Vaults. Idempotenz dreifach: ID-Liste, Zeitstempel mit 24 h Spielraum, Marker `<!-- artefakt:ID -->` in der Notiz. Textteile werden nur angehängt; im Frontmatter ändert das Skript ausschließlich `status`, `pruefstand`, `aktualisiert` seiner eigenen Notizen (`typ: ki-office-run`). Freitext (Titel, Zusammenfassung, Auftrag) wird vor dem Schreiben maskiert (E-Mail, Telefon, schlüsselartige Zeichenketten). Nie in den Vault: Token, Freigaben, Ereignisse, Rückfragen, Mitgliederdaten.

Das Skript läuft dort, wo der Vault liegt (Hermes auf Timos Rechner oder Aufgabenplanung). Die Sichtgrenze ist die des verwendeten Tokens: Mit dem Hermes-Token sind es die Runs in Hermes’ Registry-Projekten, nicht das ganze Office. Konzept, Format und Ausschlüsse: `docs/office/OBSIDIAN.md`; Tests: `agenten/test_office_obsidian.py` gegen `office/dev/server.mjs` und einen Wegwerf-Vault.

## 13. Startfreigabe für Aufträge von Teammitgliedern (ergänzt 18.10.2026, KI-erstellt: Claude Code)

**Regel (Timo, 18.10.2026).** Teammitglieder (Rollen dozent, vertrieb, team) dürfen Aufträge an Agenten anlegen; ob der Agent sofort losläuft, hängt von Kosten und Größe ab. Timo (Rolle admin) startet immer sofort. Agenten legen Aufträge nur für sich selbst an und unterliegen der Regel nicht.

Ein Auftrag eines Teammitglieds startet **sofort**, wenn alle vier Bedingungen gelten, sonst wartet er auf Timo:

| Bedingung | Standard | Stelle im Code |
|---|---|---|
| Agent ist „günstig“ | Modell `deepseek-v4-flash`, `gpt-5-mini` oder `claude-haiku-5-5` | `START_REGELN.guenstige_modelle` |
| Auftragstext ist kurz | höchstens 600 Zeichen | `START_REGELN.klein_max_zeichen` |
| Kostenlimit des Runs ist klein | höchstens 0,05 € (`budget_eur` im Run, Standard 0,05; ein höheres Limit beim Anlegen macht den Auftrag „nicht klein“) | `START_REGELN.klein_budget_eur` |
| Tagesbudget der Person reicht | Summe der Run-Kosten des Tages plus Limit dieses Runs höchstens 1 € | `START_REGELN.tagesbudget_eur` |

Alle Werte stehen als Konstanten mit Kommentar oben in `office/lib/kosten.js` (`START_REGELN`); dort schaltet `aktiv: false` die ganze Regel aus (alle starten wie früher sofort). Nach einer Änderung `node office/n8n/bauen.mjs` und das Bündel in „Anfrage prüfen“ einspielen (SETUP.md Abschnitt 13).

**Kostenstufe je Agent** (`kostenstufe()`): günstig (die drei Modelle oben), teuer (`claude-opus-5-5`), alles andere normal (auch unbekannte Modelle). Das optionale Registry-Feld `freigabe_noetig` überschreibt die Stufe für den Sofortstart: `true` = Teammitglieder brauchen für diesen Agenten immer Timos Freigabe (im Startbestand: `server-waechter`), `false` = nie wegen des Agenten, leer = nach Modell. Die übrigen Bedingungen (Länge, Limit, Tagesbudget) gelten weiter. Pflege über `agent_speichern` oder SQL; `laden` liefert je Agent `kostenstufe`, `freigabe_noetig` und `sofort_ok`. `deepseek-v4-flash` ist jetzt auch als Modell in der Registry zulässig.

**Tagesbudget.** Zählt alle Runs, die die Person am selben Kalendertag (Europe/Berlin) angelegt hat: gemessene Kosten (`verbrauch.kosten_eur`), sonst das Kostenlimit des Runs als Obergrenze. Nie gestartete Runs (wartend auf Freigabe, abgelehnt, abgebrochen) kosten nichts. Die Regel prüft, ob Verbrauch plus Limit des neuen Runs das Tagesbudget übersteigt; ein Run, der schon läuft, reserviert also sein Limit.

**Ablauf bei `auftrag_starten` und `auftrag_delegieren` durch einen Menschen ohne Admin-Rolle, der die Bedingungen nicht erfüllt:**

1. Der Run entsteht mit Status `wartet_freigabe` (nie gestartet: `gestartet = null`), dazu der Rückmelde-Schlüssel (liegt in `office_run_schluessel`, wird aber nicht herausgegeben) und eine Freigabe `aktion = 'auftrag_start'` (Status `offen`). Ihr Hash ist `inhaltsHash('auftrag_start', { agent_id, projekt, auftrag })` (Muster aus `office/lib/freigabe.js`). Es geht **kein Start** an den Ausführer (`extern = null`). Die Antwort enthält `status: 'wartet_freigabe'`, `wartet_auf: 'Timo'`, die Gründe (`gruende`) und die Kostenstufe.
2. Solange der Run wartet, lehnt die API Aktionen des Agenten auf diesem Run mit 409 ab (`lebenszeichen`, `ereignis`, `artefakt`, `run_beenden` …). Ein Eltern-Run kann nicht abgeschlossen werden, solange ein Teilauftrag auf Timo wartet.
3. **Freigabe** (`freigabe_entscheiden`, nur Admin; Dozent, Auftraggeber und Agenten bekommen 403): Der Server prüft den Hash gegen die aktuellen Felder des Runs. Stimmt er: Freigabe `verwendet`, Run → `warteschlange`, Ausführer wird angestoßen (`extern.art = 'start'`, genau wie beim Sofortstart). Die Wartezeit der Warteschlange (30 Minuten) zählt ab der Freigabe, nicht ab dem Anlegen (`fristPruefen` nutzt `lebenszeichen`).
4. **Ablehnung:** Freigabe `abgelehnt`, Run → `abgebrochen` mit `grund` („Start von Timo abgelehnt: …“) und `abgebrochen_von`. Nichts startet. Die Entscheidung gilt endgültig.
5. **Text nachträglich geändert** (Hash passt nicht mehr; nur durch Eingriff in die Datenbank möglich): 409, die alte Freigabe wird `ungueltig`, eine neue offene Freigabe für den geänderten Text wird angelegt, nichts startet. Timo sieht den neuen Text und entscheidet neu. Gebunden sind Agent, Projekt und Auftragstext.
6. **Zurückziehen:** Der Auftraggeber (oder ein Dozent/Admin) bricht den wartenden Run ab; die offene Startfreigabe wird `verfallen`, es geht kein Abbruchsignal an einen Ausführer. Unbeantwortet verfällt die Freigabe mit dem Run nach 7 Tagen (Wartefrist für Menschen).

**Oberfläche.** Im Kopf erscheint für Timo „n Aufträge warten auf deine Freigabe“ (Link zum Register „Freigaben“), für Teammitglieder „n deiner Aufträge warten auf Timo“. Im Register „Freigaben“ steht oben die Karte „Wartet auf deine Freigabe“ mit Agent, Kostenstufe, Auftraggeber, Projekt, Kostenlimit und dem vollen Auftragstext; „Start freigeben“ öffnet den Dialog (Begründung optional), „Ablehnen“ verlangt eine Begründung. Auf der Run-Seite steht für Teammitglieder „Wartet auf Timo“. Im Auftragsdialog zeigt ein Hinweis schon beim Tippen, ob der Auftrag sofort startet oder auf Timo wartet (nur Anzeige, der Server entscheidet).

**Datenmodell (additiv, `supabase/team_office.sql` Abschnitt 2b):** `office_runs.budget_eur numeric`, `office_agenten.freigabe_noetig boolean`. Die Freigabe nutzt `office_freigaben` unverändert. **Reihenfolge beim Einspielen: erst das SQL, dann der Code-Knoten**, sonst scheitert jedes Anlegen eines Runs an der fehlenden Spalte.

**Grenzen:** `budget_eur` ist heute Angabe und Grundlage der Regel; kein Ausführer bricht bei Überschreitung ab (RESTPUNKTE.md). Das Tagesbudget beruht auf gemeldetem Verbrauch; wo ein Ausführer keinen Verbrauch meldet, zählt das Run-Limit als Obergrenze. Delegierte Teilaufträge von Menschen ohne Admin-Rolle unterliegen derselben Regel, Teilaufträge eines Orchestrierer-Agenten nicht (der Eltern-Run wurde bereits freigegeben oder war ein Sofortstart).
