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
| `office_runs` | Ein Auftrag an einen Agenten: Projekt, Aufgabe, Auftraggeber, Agent, Workflow-/Konfig-Version, Status, Zeitstempel, Versuche, Fehler, Zusammenfassung mit Quelle, Verbrauch, fachliche Abnahme | `run_id`; unique `idempotenzschluessel`; unique `n8n_execution_id` |
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
| `lebenszeichen` | ausführender Agent | Heartbeat; Warteschlange → in Arbeit; optional `n8n_execution_id` (eindeutig) |
| `ereignis` | ausführender Agent | Schritt/Tool/Quelle/Fehler; Tool muss in `erlaubte_tools` sein; optional `idempotenz` |
| `artefakt` | ausführender Agent | Ergebnis mit Ablageort und optionalem Hash |
| `rueckfrage` / `antwort` | Agent / Auftraggeber, Dozent, Admin | in Arbeit ↔ wartet auf Rückmeldung |
| `freigabe_anfordern` | ausführender Agent | Freigabe für externe Aktion (Hash über Aktion + Inhalt); ältere offene/erteilte Freigaben derselben Aktion werden ungültig |
| `freigabe_entscheiden` | Menschen; kritisch (Zahlung, Löschung, Vertrag) nur Admin; nie der Anfordernde | erteilt (24 h gültig, einmalig) oder abgelehnt |
| `aktion_ausfuehren` | ausführender Agent | Externe Aktion nur mit gültiger Freigabe und Idempotenzschlüssel; markiert Freigabe als verwendet; n8n leitet an Executor-Knoten weiter |
| `run_beenden` | ausführender Agent (Token) | abgeschlossen oder fehlgeschlagen, Zusammenfassung, Verbrauch, Artefakte; verspätet → nur Hinweis |
| `rueckmeldung` | Executor ohne Token | wie `run_beenden`, aber HMAC-signiert (Zeitfenster 300 s, Nonce einmalig) |
| `run_abbrechen`, `run_wiederholen`, `run_abnehmen` | Auftraggeber, Dozent, Admin | Steuerung; Abnahme nur bei technisch abgeschlossen |
| `wartung` | Zeitplan (intern) oder Admin | Timeouts, veraltete Runs, verfallene Freigaben, alte Idempotenzschlüssel |
| `agent_speichern`, `loeschen` | Admin | Registry; Löschung nach Löschkonzept |

Agenten dürfen ausschließlich: laden, auftrag_starten (für sich), lebenszeichen, ereignis, artefakt, rueckfrage, freigabe_anfordern, aktion_ausfuehren, run_beenden. Alles andere beantwortet der Server mit 403 (`office/lib/rechte.js`).

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
| wartet auf Freigabe | abgebrochen | mensch | Mensch bricht ab |
| wartet auf Freigabe | fehlgeschlagen | agent, system | Executor meldet Fehler |
| wartet auf Freigabe | unbekannt / veraltet | system | Wartefrist für Menschen überschritten |
| fehlgeschlagen | Warteschlange | mensch, system | Wiederholung, nur solange versuche < max_versuche |
| unbekannt / veraltet | abgebrochen | mensch | Mensch schließt den veralteten Run ab (Aufräumen); nie nachträglich „abgeschlossen“ |

Fristen (Standard, je Agent und Run überschreibbar): Warteschlange 30 Minuten bis ein Executor übernimmt; Timeout ohne Lebenszeichen 15 Minuten; Wartefrist auf Menschen 7 Tage; erteilte Freigabe 24 Stunden; höchstens 3 Versuche. Die Wartung läuft alle 5 Minuten per Zeitplan und bei jedem Neustart greift sie automatisch, weil sie nur Zeitstempel in der Datenbank vergleicht: Runs „in Arbeit“ ohne Lebenszeichen werden als unbekannt/veraltet markiert. Verspätete Rückmeldungen nach einem Endzustand werden als Hinweis-Ereignis gespeichert und ändern den Status nie; insbesondere wird nichts nachträglich „abgeschlossen“.

## 5. Freigaben und Idempotenz

- Freigabe-Hash: `sha256(kanonisch({ aktion, inhalt }))`. Kanonisches JSON mit sortierten Schlüsseln, damit Reihenfolge keine Rolle spielt, jedes Zeichen aber schon.
- Eine Freigabe gilt für genau eine Ausführung (`verwendet`) und verfällt nach 24 Stunden. Geänderter Inhalt → `ungueltig`, neue Freigabe nötig (serverseitig geprüft, Pflichtprüfung 4).
- Idempotenz: Aufträge und externe Aktionen brauchen einen Schlüssel (8 bis 120 Zeichen). Gleicher Schlüssel → gespeicherte Antwort mit `wiederholt: true`, keine zweite Wirkung. Zusätzlich sichern Unique-Indizes in Supabase (Idempotenzschlüssel, n8n-Execution-ID, Nonce, Freigabe je Aktion und Hash) Wettläufe ab; der Testserver simuliert dieselben Eindeutigkeiten (409).
- Rückmelde-Webhook: `signatur = HMAC-SHA256(schluessel, zeit + '.' + nonce + '.' + sha256(kanonisch(ergebnis)))`, Zeitfenster ±300 s, Nonce einmalig (Tabelle `office_idempotenz`, Art `nonce`).

## 6. Adaptergrenze (office/adapter/)

| Datei | Status | Beschreibung |
|---|---|---|
| `schnittstelle.js` | definiert | `startRun(auftrag)`, `cancelRun(auftrag)`, `rueckmeldung(nachricht)` plus Regeln für alle Ausführer |
| `n8n.js` | echt, nur konfiguriert, **nicht getestet** | Übergibt Aufträge an die `ausfuehrer_url` des Agenten (im Workflow: Knoten „Ausführer anstoßen“); Hilfsfunktion zum Signieren |
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

**Szene.** `buero.js` zeichnet je Raum ein Monitor-Element (`<a class="monitor" href="#/monitor/<Raum>">`) an der hinteren rechten Plattformkante: Rahmen mit Raumakzent, Standfuß, Inhalt und Prüfmarke. Bild → `<image href>`, HTML → `<foreignObject>` mit `<iframe sandbox="" referrerpolicy="no-referrer" loading="lazy">` (verkleinert dargestellt, `pointer-events:none`), PDF/sonst → Karte, kein Artefakt → „noch kein Ergebnis“. Unter dem Bild steht immer eine Textkarte, damit ein nicht ladbares Bild nicht leer bleibt. Die Schreibtischplätze wurden so verschoben, dass die hintere rechte Ecke frei bleibt.

**Monitorwand.** Route `#/monitor/<Raum>` (app.js) → `vMonitorwand(ctx, raum)`: bis zu 12 Kacheln (`.kacheln`/`.kachel`), gleiche Regeln für die Vorschau, dazu Run-Link, Aufgabe (Portal), Projekt, Zeit, Hash, Prüftext und „Öffnen ↗“ (`target=_blank rel=noopener noreferrer`). Vorschauen sind nie interaktiv; der Weg zum Original ist der explizite Link.

**Testdaten.** `office/dev/testdaten.mjs` legt über die normale `artefakt`-Aktion vier grafische Ergebnisse an (drei selbst gezeichnete SVG-Diagramme und eine HTML-Vorschau aus `docs/office/testbilder/`, Hash = echter SHA-256 der Datei) sowie einen PDF-Verweis ohne Vorschau; Verwaltung bleibt ohne Ergebnis. Keine fremden Bilder.

## 10. Anbindung von Werkzeugen (API, MCP) über n8n

Alle Werkzeuge der Agenten laufen über n8n, nie direkt aus dem Browser. Das ist bewusst: Credentials bleiben in n8n, jede Aktion läuft durch dieselbe Rechte- und Freigabeprüfung, und das Office sieht nur das Ergebnis als Ereignis.

| Weg | Wofür | Stand |
|---|---|---|
| **n8n-Agentenworkflow als Ausführer** (`ausfuehrer_url` je Agent in der Registry) | Agent bekommt den Auftrag per signiertem Webhook, nutzt in n8n seine Werkzeugknoten (HTTP, Supabase, Twenty CRM, E-Mail, Kalender …) und meldet Schritte, Werkzeugaufrufe und Ergebnisse an die Office-API zurück | Schnittstelle fertig, Executor noch Stub (RESTPUNKTE Prio B) |
| **n8n MCP-Server-Trigger** | Externe Agenten (Claude Code, Codex, Hermes) rufen n8n-Workflows als Werkzeuge über MCP auf; n8n prüft Token und Rechte, schreibt Ereignisse ins Office | Konzept; n8n bietet den MCP-Server-Trigger und Instance-level MCP (siehe Kursinhalt Anleitung B) |
| **n8n MCP-Client-Knoten** | n8n-Agenten nutzen fremde MCP-Server (z. B. Obsidian, CRM) als Werkzeuge | Konzept; jedes Werkzeug muss in der Registry unter `werkzeuge` stehen, sonst darf der Agent es nicht nutzen |
| **Portal-API v2 / Office-API per HTTP** | Agenten lesen Aufgaben und melden Berichte (heute `agenten/team.py`) | läuft (Portal) bzw. wartet auf Import (Office) |

Regeln, die für alle Wege gelten: Werkzeuge nur aus der Allowlist der Registry; externe Aktionen (E-Mail, Posts, Zahlungen, Löschen) nur mit inhaltsgebundener Freigabe; Rückmeldungen signiert (HMAC, Zeitfenster, Nonce); Allowlist für `ausfuehrer_url`-Domains ist offen (SICHERHEIT.md S6).
