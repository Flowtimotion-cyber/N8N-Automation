# Testbericht: KI Office

Stand: 17.10.2026 · Branch `feature/ki-office` · Umgebung: Node 22.22, Playwright 1.56.1 (global installiert) mit Chromium, Linux.
**Wichtig:** Alle Tests laufen gegen den lokalen **TESTADAPTER** (`office/dev/server.mjs`, In-Memory-Speicher, synthetische Daten, simulierte Executoren). Supabase, n8n und Modellaufrufe wurden **nicht** getestet (kein Zugang in dieser Sitzung). Mock-Tests ersetzen keinen echten Integrationstest; was ungetestet bleibt, steht in Abschnitt 5.

## 1. Befehle

| Befehl | Zweck |
|---|---|
| `npm run test:office` | alle Tests (`node --test 'office/test/*.test.mjs'`) |
| `npm run test:office:unit` | nur Unit-, Szenario- und Bündeltests (ohne Browser, ohne Server) |
| `npm run test:office:browser` | Browsertests mit Screenshots nach `docs/office/screenshots/` |
| `node office/dev/server.mjs` | Testserver von Hand starten (Port 8787) |

Browser: Der Test nutzt `playwright` (global oder lokal), sonst `puppeteer-core` aus `package.json` mit `CHROME_PFAD`. Ohne Browser werden die Browsertests übersprungen und als solche gemeldet.

## 2. Ergebnis des letzten Laufs

```
# tests 55
# pass 55
# fail 0
# skipped 0
# duration_ms 49646
```

| Datei | Tests | Inhalt |
|---|---|---|
| `unit.hash.test.mjs` | 4 | SHA-256/HMAC gegen `node:crypto`, kanonisches JSON, konstante Vergleichszeit |
| `unit.zustand.test.mjs` | 7 | Zustände, Übergangstabelle, Rollenbindung, Endzustände, Fristen |
| `unit.freigabe.test.mjs` | 6 | Hash-Bindung, geänderter Inhalt, Einmaligkeit, Ablauf, Entscheidungen |
| `unit.rechte.test.mjs` | 5 | Agentenrechte, Projektgrenzen, Run-Steuerung, Vier-Augen-Prinzip, Werkzeug-Allowlist |
| `unit.signatur.test.mjs` | 3 | Signatur, Zeitfenster, Replay |
| `unit.idempotenz.test.mjs` | 2 | Schlüsselformat, Wiedererkennung |
| `verarbeitung.test.mjs` | 10 | Pflichtprüfungen 1 bis 7 gegen den echten Verarbeitungscode, Datensparsamkeit, Validierung |
| `n8n-buendel.test.mjs` | 4 | Bündel = eingecheckte Datei, läuft in n8n-ähnlicher Sandbox (Webhook- und Wartungspfad), Workflow-JSON ohne Credentials, Registry = SQL |
| `integration.test.mjs` | 7 | HTTP gegen Testserver: Rollen, Idempotenz, Zeitsprung, Neustart, Freigabe-Ablauf, Portal-Nachbildung, statische Auslieferung, Szenario leer |
| `browser.test.mjs` | 7 | Desktop 1280×900 und Mobil 390×844: alle Register, Detailseiten, Dialoge, Tastatur, reduced motion, Fehler- und Leerzustände, Portal-Register, keine JS-Fehler |

## 3. Pflicht-Prüfungen

| # | Prüfung | Wo | Ergebnis |
|---|---|---|---|
| 1 | Fremdes Projekt ist per direktem API-Aufruf nicht lesbar | `verarbeitung.test.mjs` (Pflichtprüfung 1), `integration.test.mjs` (über HTTP), Browsertest (Agent sieht `p_geheim` nicht) | bestanden: Agenten sehen nur Registry-Projekte, fremde Runs liefern 403, Aufträge in nicht zugeordneten Projekten 403, Agenten können keine Aufträge für andere Agenten anlegen, Lösch-/Freigabeaktionen 403 |
| 2 | Doppelte Aufrufe lösen keine doppelte externe Aktion aus | Pflichtprüfung 2, Integrationstest „Freigabe über HTTP“ | bestanden: gleicher Idempotenzschlüssel → `wiederholt: true`, genau ein Run, genau eine externe Wirkung; verwendete Freigabe → 409; Nonce-Replay → 401; Unique-Index-Simulation → 409 |
| 3 | Ausfall, Neustart, Timeout, verspätete Rückmeldung erzeugen korrekte Zustände | Pflichtprüfung 3, Integrationstest mit `neustart` und Zeitsprung | bestanden: Warteschlange ohne Executor → unbekannt nach 30 Min.; in Arbeit ohne Lebenszeichen → unbekannt nach Timeout (auch nach Neustart); verspätete signierte Rückmeldung → Hinweis, Status bleibt; Wiederholung begrenzt auf max_versuche; Abbruch meldet dem Executor |
| 4 | Änderung nach Freigabe macht die Freigabe ungültig | `unit.freigabe.test.mjs`, Pflichtprüfung 4/4b | bestanden: geänderter Inhalt → 409, Freigabe `ungueltig`, keine Wirkung; auch der alte Inhalt ist danach gesperrt; andere Aktion mit gleichem Inhalt gilt nicht |
| 5 | Fehlgeschlagene Aktionen erscheinen nie als erfolgreich | Pflichtprüfung 5, Browsertest `run-fehlgeschlagen` | bestanden: Übergang fehlgeschlagen → abgeschlossen existiert nicht; späte Erfolgsmeldung → nur Hinweis; Aufgabe bleibt „In Arbeit“; fachliche Abnahme nur bei abgeschlossen |
| 6 | Ergebnisse sind bis Aufgabe und Run rückverfolgbar | Pflichtprüfung 6, Run-Seite („Rückverfolgbar: …“) | bestanden: Artefakt trägt run_id, aufgabe_id, projekt; Zusammenfassung verweist auf Ereignis-IDs und Zeit; Verlaufseinträge im Portal tragen den Run-Marker; Werkzeuge außerhalb der Allowlist werden abgelehnt |
| 7 | Löschregeln erfassen abgeleitete Daten laut Konzept | Pflichtprüfung 7 | bestanden: Run, Ereignisse, Artefakte, Freigaben, Idempotenz, Rückmelde-Schlüssel und gespiegelte Verlaufseinträge werden gelöscht, Ablageorte gemeldet; Wartung löscht Schlüssel > 30 Tage; Mindestfrist 30 Tage |
| 8 | Desktop und Mobil inkl. Fehler- und Leerzustände | `browser.test.mjs`, 45 Screenshots in `docs/office/screenshots/` | bestanden: alle Register, Projekt-/Agent-/Run-Detail (wartet auf Freigabe, unbekannt, fehlgeschlagen, abgenommen), Kanban, Raumfilter per Tastatur, Dialoge, Anmeldung, ungültiger Code, API nicht erreichbar, Run nicht gefunden, Szenario leer, Portal-Register, reduced motion ohne Animation, keine JavaScript-Fehler |

## 4. Screenshots

`docs/office/screenshots/desktop-*.png` und `mobil-*.png`: projekte, projekte-kanban, projekte-raumfilter, projekt-detail, agenten, agent-detail, run-wartet-freigabe, run-unbekannt, run-fehlgeschlagen, run-abgeschlossen, freigaben, buero, dialog-auftrag, dialog-freigabe (Desktop), anmeldung, api-nicht-erreichbar, run-nicht-gefunden, leer-projekte, leer-agenten, leer-freigaben, leer-buero, leer-agent-detail, portal-register-ki-office. Alle zeigen den roten TESTADAPTER-Hinweis.

## 5. Ausdrücklich ungetestet (mangels Zugang)

| Bereich | Warum ungetestet | Was Timo prüfen sollte |
|---|---|---|
| Supabase: `supabase/team_office.sql` | kein Datenbankzugang | SQL im Editor ausführen; Kontrollabfragen am Ende; danach Portal einmal neu laden (Portal-API ignoriert neue Schlüssel, Annahme) |
| n8n: Import von `office-api.workflow.json`, Node-Versionen, Credential-Zuweisung, Webhook-Pfad | kein n8n-Zugang; der Portal-API-Workflow wurde nur lesend als Vorbild genutzt | Import, Credentials setzen, aktivieren, dann `laden` aus dem Office; Fehlerausführungen ansehen |
| n8n Code-Knoten: Verhalten des Bündels in der echten Sandbox | nur Node-`vm`-Sandbox mit nachgestelltem `$()` | erster `laden`-Aufruf; falls `$('Office-API')` im Zeitplan-Pfad anders fehlschlägt als angenommen, meldet die Wartung einen Fehler statt zu laufen |
| Schreibpfad gegen PostgREST (409 bei Unique-Verletzung, `Prefer: return=minimal`) | nur In-Memory-Simulation | einen Auftrag doppelt starten, Reaktion prüfen |
| `@n8n/workflow-sdk`-Datei `office-api.workflow.js` | SDK nicht installiert, kein Zugang | optional mit dem SDK validieren; der JSON-Import ist der vorgesehene Weg |
| Executoren (n8n-Agenten-Workflows, Hermes, Claude Code, Codex) | existieren noch nicht (Stubs) | erst nach Anbindung |
| Modellaufrufe (Anthropic, OpenAI) | keine Schlüssel, bewusst keine Aufrufe | – |
| GitHub Pages Auslieferung von `docs/office/` mit ES-Modulen | nur lokal | nach Merge `…/office/` öffnen; Pages liefert `.js` mit `text/javascript` |
| Zeitverhalten über Tage (Wartefrist 7 Tage, Freigabe 24 h) | nur per virtueller Uhr | im Betrieb beobachten |
| Barrierefreiheit über Tastatur/Screenreader hinaus (Kontrast, Zoom 200 %) | nicht geprüft | manuell |

## 6. Bekannte Einschränkungen des Testadapters

- Der Testadapter leitet Verhalten aus Stichwörtern im Auftragstext ab („langsam“, „verspätet“, „nie übernehmen“, „fehler“, „rückfrage“, „e-mail/post/zahlung“). Das ist Simulation, kein Modellverhalten.
- Die virtuelle Uhr läuft mit `--tempo 10` zehnmal schneller als echt; in den Tests ist sie eingefroren und wird per Testendpunkt vorgestellt.
- `/api/team` bildet nur `laden` der Portal-API nach, damit das Portal-Register lokal geprüft werden kann; alle Schreibaktionen des Portals bleiben ungetestet.

## 7. Nachprüfung auf Windows (17.10.2026, Claude Code lokal)

Unabhängig vom Cloud-Lauf wurde der Branch auf Windows 11 (Node 24.18, Chrome 141 bzw. Playwright-Chromium 1.56.1) erneut geprüft.

| Lauf | Ergebnis |
|---|---|
| `npm run test:office` mit Playwright (lokal installiert, nicht in package.json) | 55/55 bestanden, auch nach dem Merge von `main` (Reiter „Vertrieb“) |
| Erstlauf mit Standard-Git-Checkout (`core.autocrlf=true`) | `n8n-buendel` schlug fehl: CRLF im Arbeitsverzeichnis ergab ein anderes Bündel. Behoben durch `.gitattributes` (LF für Quelltext) und CRLF-Normalisierung in `bauen.mjs` und im Test. Gegenprobe mit `autocrlf=true`: bestanden |
| Browsertests über den Puppeteer-Ersatzpfad (`CHROME_PFAD`, ohne Playwright) | 4/7. Die Brücke in `office/test/browser.mjs` deckt Playwright-Aufrufe nur teilweise ab (Fehlerzustände, Portal-Register, JS-Fehler-Sammlung). Playwright ist der Referenzpfad; der Ersatzpfad ist ein Restpunkt |
| Sichtprüfung im Browser (Desktop und Mobil 375 px): Projekte, Agenten, Büro, Freigaben, Run-Zeitleiste | funktioniert; Testadapter-Hinweis überall sichtbar, keine erfundenen Prozente, Freigabe an Inhalts-Hash gebunden, Rückverfolgung Ergebnis → Run → Aufgabe → Projekt angezeigt |
| Secret-Muster im Branch-Diff, externe Skriptquellen in `docs/office/` | keine Treffer; einzige externe Adresse ist der n8n-Webhook |
| Merge-Test gegen `main` | zwei Konflikte in `docs/team/index.html` (Reiterliste und Ansichten-Zuordnung, beide Seiten hatten die Zeile geändert). Aufgelöst: „Vertrieb“ und „KI Office“ stehen nebeneinander, Vertriebs-Rechteprüfung von `main` bleibt |

Weiterhin ungetestet: alles aus Abschnitt 5 (Supabase, n8n, Modelle). Die Browsertests schreiben die Screenshots bei jedem Lauf neu; die eingecheckten Bilder stammen aus dem Cloud-Lauf (Linux-Rendering).

## 8. Nachtrag 17.10.2026: isometrische Büroszene und Einbettung ins Portal

| Lauf | Ergebnis |
|---|---|
| `npm run test:office` (Playwright, Windows) nach Umbau der Szene und Einbettung | 55/55 bestanden |
| Portal mit eingebettetem Office (Übersicht und Register „KI Office“), Desktop 1280 und Mobil 390, Portal-API lokal umgeleitet | Office lädt im iframe mit geteiltem Token, Höhenmeldung kommt an, keine JS-Fehler; Screenshots `docs/office/screenshots/portal-{desktop,mobil}-{start,office}.png` |
| Sichtprüfung Szene Desktop und Mobil (375 px, seitlich scrollbar) | Räume, Figuren, Sprechblasen, Linien, Live-Panel wie vorgesehen |

Die eingecheckten Screenshots stammen ab jetzt aus dem Windows-Lauf (Playwright-Chromium). Die Einbettung ist nur lokal geprüft; auf GitHub Pages muss einmal kontrolliert werden, dass `…/team/` und `…/office/` denselben Token sehen (gleiche Herkunft, siehe ARCHITEKTUR.md Abschnitt 9).

## 9. Nachtrag 17.10.2026 (abends): erster echter Ausführer Ende-zu-Ende gegen Supabase und n8n

Erster Lauf gegen die echten Systeme (nicht Testadapter). Ausführer: n8n-Workflow „TEAM: Office-Ausführer verwaltung-status“ (ID `KwRsEDr743IGDPJ1`, aktiv). Auftrag angelegt mit dem Agenten-Token (Agenten dürfen Aufträge für sich selbst anlegen) über einen temporären Hilfs-Workflow (danach archiviert).

| Schritt | Ergebnis |
|---|---|
| `laden` mit Agenten-Token (Kontrolle vor dem Lauf) | HTTP 200, `ich = agent-claude (agent)`, 21 Projekte, 28 Aufgaben sichtbar, Registry zeigt 13 Agenten |
| `ausfuehrer_url` per PATCH auf `office_agenten` gesetzt | HTTP 200, `konfig_version` 2, `geaendert_von = agent-claude` |
| `auftrag_starten` (Projekt „Momentum Office“, Idempotenzschlüssel `test-ausfuehrer-verwaltung-2026-10-17-1`) | HTTP 200, `run_mvcl9lam058aa9`, Status Warteschlange, Rückmelde-Schlüssel einmalig in der Antwort |
| Office-API „Ausführer anstoßen“ → Executor-Webhook | n8n-Execution 20716, Start 16:06:16 UTC, Ende 16:06:20, letzter Knoten „Fertig“ (kein Fehlerpfad) |
| Zeitleiste des Runs (aus `laden`) | 16:06:16 Auftrag angelegt · 16:06:17 Warteschlange → in Arbeit (Executor hat übernommen) · 16:06:18 `tool aufgaben_lesen` „Aufgaben und Projekte über die Office-API geladen (28 Aufgaben, 21 Projekte)“, `quelle_ref …/office-api#laden` · 16:06:19 `schritt` „Wochenstand erstellt und als Notiz gespeichert“, `tool notiz_speichern`, `quelle_ref team_notizen/n_office_wochenstand_2026w42` · 16:06:20 `artefakt` „Ergebnis: Wochenstand KW 42/2026“ · 16:06:20 in Arbeit → abgeschlossen (technisch) |
| Run-Felder | `status = abgeschlossen`, `gestartet`/`beendet`/`lebenszeichen` gesetzt, `fehler = null`, `verbrauch = unbekannt` (kein Modellaufruf), Zusammenfassung = Kurzfassung plus Ablageort |
| Artefakt | `art_mvcl9odsbcc034`, `art = bericht`, Titel „Wochenstand KW 42/2026“, Ablageort = Notiz-Titel im Projekt „Momentum Office“, 2744 Zeichen, `inhalt_hash = null` (siehe RESTPUNKTE) |
| Notiz im Team-Portal | `n_office_wochenstand_2026w42` „Wochenstand KW 42/2026 – KI Office (Verwaltungs-Status)“, Projekt „Momentum Office“, 2744 Zeichen (Upsert, ein Eintrag je Woche) |
| Inhalt des Berichts (Stichprobe) | 24 offene Aufgaben in 5 Projekten, 4 überfällig, 2 fällig bis 24.10.2026, 1 Blockade („Träger auf der Webseite anpassen“, Status Wartet). Zahlen stimmen mit den Portaldaten überein |

Nicht getestet: der Fehlerpfad (`run_beenden fehlgeschlagen`), der Abbruchpfad, die Glättung mit gpt-5-mini (Standard AUS) und eine Wiederholung nach Fehler. Hinweis: Die n8n-Executions des Hilfs-Workflows (20708, 20713, 20714, 20723) und die erste Ausführer-Execution 20716 enthalten in Knotenausgaben den Agenten-Token; der Ausführer speichert seit dem Test keine erfolgreichen Läufe mehr. Timo kann die Executions in n8n löschen oder den Token des Mitglieds `agent-claude` neu setzen (RESTPUNKTE).

## 10. Nachtrag 17.10.2026: Monitor je Raum und Monitorwand (Branch `feature/ki-office-monitor`)

| Lauf | Ergebnis |
|---|---|
| `npm run test:office` (Playwright-Chromium 1.56, Windows 11, Node 24.18) | **63/63 bestanden** (vorher 55; neu: 6 Unit-Tests `unit.monitor.test.mjs`, Browsertest „Monitor“ Desktop und Mobil, Leerprüfung der fünf Monitore im Szenario „leer“) |
| Unit: `ladbareAdresse`, `artefaktTyp`, `raumArtefakte`, `raumMonitor` | nur `https://` oder relativ wird geladen; `http:`, `data:`, `javascript:` (auch mit eingestreutem Zeilenumbruch), `blob:`, `file:`, `notiz:`, `//…`, Backslash, Leerraum, Anführungszeichen werden abgelehnt; Typ aus Endung (png/jpg/jpeg/svg/webp/gif, html/htm, pdf) oder `art`; Bild/HTML ohne ladbare Adresse wird zur Karte; Artefakte nur aus Runs der Raumprojekte, neueste zuerst, höchstens n; Monitor bevorzugt Bild/HTML, dann PDF, dann das neueste überhaupt |
| Browser „Monitor zeigt Bild“ | Akademie: `<image href="testbilder/akademie-quiz-modul-1-2.svg">`, Marke „geprüft“ (Run fachlich abgenommen); Bild in der Monitorwand geladen (`naturalWidth > 0`) |
| Browser „Monitor zeigt ungeprüft“ | Vertrieb: Bild mit Marke „ungeprüft“ (Run abgeschlossen, keine Abnahme); Kundenprojekte: PDF-Karte ohne `image`/`iframe`, „ungeprüft“ |
| Browser „Monitor leer“ | Verwaltung: `data-typ="leer"`, Text „noch kein Ergebnis“; Szenario „leer“: alle fünf Monitore leer; Monitorwand Verwaltung: „Noch kein Ergebnis in diesem Raum“ |
| Browser „HTML nur in der Sandbox“ | Marketing: `<iframe sandbox="" referrerpolicy="no-referrer">` in Szene und Monitorwand; im Frame `window.origin === "null"`, das Prüfskript der Testseite lief nicht (Text bleibt „Skript nicht ausgeführt (Sandbox)“, Titel unverändert), der Prompt-Injection-Satz ist nur Text; Chromium protokolliert „Blocked script execution … sandboxed“ – im Test als erwarteter Beleg gefiltert, nur für `testbilder/` |
| Browser „Monitorwand“ | Klick auf den Monitor → `#/monitor/Marketing`, 3 Kacheln in der Reihenfolge HTML, Bild, Sonstiges; jede mit Run-Link, Aufgabe, Zeit, Hash, Prüftext, „Öffnen ↗“; unbekannter Raum → Hinweis |
| Screenshots | `desktop-/mobil-buero.png` (Szene mit Monitoren), `desktop-/mobil-monitorwand.png`, `desktop-/mobil-monitorwand-leer.png`, `desktop-/mobil-leer-buero.png`, `portal-*.png` (eingebettete Szene) neu; die übrigen Screenshots wurden nicht ausgetauscht (unveränderte Ansichten) |
| Sichtprüfung | Desktop 1280 und Mobil 390: Monitore liegen hinten rechts auf den Plattformen, Figuren überdecken nichts, Prüfmarke lesbar; Monitorwand bricht auf eine Spalte um. Hinweis: Das Browserfenster der Claude-Desktop-App blockiert eingebettete iframes (`ERR_BLOCKED_BY_CLIENT`), in Chromium laden sie |
| `npm run test:office` unter Windows | Vorher fand der Befehl 0 Tests, weil cmd.exe die einfachen Anführungszeichen des Globs nicht auflöst (der Lauf aus Abschnitt 7 nutzte den Glob direkt). Jetzt doppelte Anführungszeichen in `package.json`; Node löst den Glob selbst auf, in Bash und cmd |

Weiterhin ungetestet: alles aus Abschnitt 5. Produktiv hängt die Monitor-Anzeige davon ab, dass Executoren Ablageorte als `https://`-Adressen melden, die der Browser der angemeldeten Person laden darf (RESTPUNKTE.md).
