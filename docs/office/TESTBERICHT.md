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
| `unit.delegation.test.mjs` | 10 (seit 17.10.2026) | Orchestrierung: Pflichtfelder, Delegation mit Ereignissen, Idempotenz, Projektgrenze, falscher Aufrufer und Werkzeug-Allowlist, Eltern-Run nicht in Arbeit, Teamregel, Wartung, Sichtbarkeit und Löschen, Testdaten |

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

## 10. Nachtrag 17.10.2026: Orchestrierung (Branch `feature/ki-office-orchestrierer`, KI-erstellt: Claude Code)

Umgebung: Windows 11, Node 24.18, Playwright 1.56.1 (lokal in `node_modules`, nicht in `package.json`) mit Chromium. Alles gegen den TESTADAPTER; Supabase und n8n wurden nicht angefasst (Timo spielt SQL und Code-Knoten selbst ein, SETUP.md Abschnitt 9).

```
# tests 66
# pass 66
# fail 0
# duration_ms 69488
```

| Prüfung | Wo | Ergebnis |
|---|---|---|
| Projektgrenze: Zielagent nicht im Projekt, Projekt für den Orchestrierer unsichtbar, Projekt nicht in der Registry des Orchestrierers, Projekt existiert nicht | `unit.delegation.test.mjs` | 403 / 403 / 403 (Meldung „Projektgrenze“) / 404; ohne `projekt` gilt das Projekt des Eltern-Runs |
| Falscher Aufrufer: fremder Agent, Teammitglied ohne Steuerrecht, Agent ohne Werkzeug `auftrag_delegieren`, `auftrag_starten` für fremde Agenten | Unit, HTTP (`integration.test.mjs`) | jeweils 403; Dozent darf aus dem Run heraus delegieren |
| Eltern-Run nicht in Arbeit: Warteschlange, wartet auf Rückmeldung, abgebrochen | Unit | 409; nach Antwort wieder erlaubt |
| Idempotenz: gleicher Schlüssel | Unit | `wiederholt: true`, ein Kind-Run, ein Start an den Ausführer, kein zweiter Rückmelde-Schlüssel |
| Teamregel: Eltern-Run erst fertig, wenn alle Kinder beendet | Unit, HTTP | `run_beenden abgeschlossen` → 409 mit `offene_kind_runs`, solange ein Kind läuft; nach Abschluss/Abbruch aller Kinder → 200; Fehlschlag jederzeit erlaubt; Hinweis „Teilauftrag abgeschlossen“ am Eltern-Run |
| Wartung | Unit | Eltern-Run mit laufendem Kind bleibt 40 Minuten ohne eigenes Lebenszeichen „in Arbeit“; nach Kind-Ende zählt `timeout_sek` ab dem Kind-Ende (10 Min.: in Arbeit, 31 Min.: unbekannt) |
| Sichtbarkeit und Löschen | Unit | Orchestrierer sieht den Kind-Run eines Hermes-Agenten; `laden` liefert `eltern_run_id`/`team_id` bei jedem Run; Codex sieht weder Eltern- noch Kind-Run; Löschen mit laufendem Kind 409, danach Kind zuerst gelöscht |
| HTTP Ende-zu-Ende (Testadapter als Orchestrierer-Ausführer) | `integration.test.mjs` | Auftrag an Orchestrierer (Webseite) → zwei Teilaufträge mit `team_id` → Kinder laufen zu Ende → Eltern-Run abgeschlossen |
| Browser Desktop und Mobil | `browser.test.mjs` | Run-Detail des Team-Runs: „Teilaufträge (2)“ mit zwei Zweigen, Kind verlinkt, Status „in Arbeit“ sichtbar (`run-team`); Kind-Run mit Breadcrumb „Teil von“ und Link zum Eltern-Run (`run-teil`); Agenten-Arbeitsübersicht „delegiert: 2 Teilaufträge“ mit eingerückten Teilaufträgen (`agent-orchestrierer`); Projekt-Detail zeigt den Kind-Run genau einmal (eingerückt); Büro: Orchestrierer nur in der Zentrale, zwei Teamlinien, Legende „1 Team laufend: Orchestrierer mit Akademie-Redakteur, Kurs-Wächter“, Liste „Zentrale“; reduced motion stoppt Puls und Teamlinien |

Neue Screenshots: `desktop-run-team.png`, `mobil-run-team.png`, `desktop-run-teil.png`, `mobil-run-teil.png`, `desktop-agent-orchestrierer.png`, `mobil-agent-orchestrierer.png`; `*-buero.png` und `*-agenten.png` zeigen jetzt die Zentrale mit Orchestrierer und das Team. Alle anderen Screenshots wurden vom Lauf neu geschrieben.

Nicht getestet: die neuen Spalten gegen das echte Supabase (`alter table … add column if not exists … references`), der ersetzte Code-Knoten im echten n8n (das Bündel läuft in der `vm`-Sandbox des Bündeltests), ein echter Orchestrierer-Ausführer (gibt es noch nicht). Nebenbefund: `npm run test:office` fand unter Windows 0 Tests, weil der Glob in einfachen Anführungszeichen stand; `package.json` nutzt jetzt doppelte (gleicher Befund wie in PR #2).

## 11. Nachtrag 17.10.2026: Monitor je Raum und Monitorwand (Branch `feature/ki-office-monitor`)

| Lauf | Ergebnis |
|---|---|
| `npm run test:office` (Playwright-Chromium 1.56, Windows 11, Node 24.18) | **63/63 bestanden** vor dem Merge, **74/74** nach dem Merge mit main (Orchestrierung, erster Ausführer); (vorher 55; neu: 6 Unit-Tests `unit.monitor.test.mjs`, Browsertest „Monitor“ Desktop und Mobil, Leerprüfung der fünf Monitore im Szenario „leer“) |
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

## 12. Nachtrag 17.10.2026: Prüfung des gemergten Stands, große Wandbildschirme, Gehirn-Zentrale (Branch `feature/ki-office-monitor-gross`)

Prüfung „auf Herz und Nieren“ gegen `main` nach dem Merge von PR #2 (Commit cbfaf59), Windows 11, Node 24.18, Playwright-Chromium 1.56:

| Lauf | Ergebnis |
|---|---|
| `npm run test:office` auf main (cbfaf59) | 74/74 bestanden |
| Angriffsproben (eigenes Playwright-Skript gegen den Testserver): sechs feindliche Artefakte per API (`<img onerror>` im Titel, `<script>` in der Zusammenfassung, Ablageorte `javascript:`, `https://…" onload=…`, `data:image/svg+xml…`, Backslash-UNC, `http://`, `//`) | keine XSS-Variable gesetzt, kein eingeschleustes Element, keine Anfrage an fremde Hosts, alles als Text bzw. Karte; Akademie-Monitor zeigt weiter das Diagramm; nicht ladbares Bild (`testbilder/gibtsnicht.png`) lässt die Titelkarte sichtbar |
| Sandbox (HTML-Artefakt): `top.location`, Formular-Submit an fremden Host, Cookies | wirkt nicht, nichts gesendet, `window.origin === "null"`, keine Cookies |
| Rechte (Token des Hermes-Agenten): API `laden`, Büro, Monitorwand | sichtbare Projekte nur Akademie-Kurs und Verwaltung & Finanzen; keine Artefakte fremder Räume; Monitore Marketing/Vertrieb/Kundenprojekte leer; fremde Testbilder werden nicht geladen |
| Tastatur, Einbettung, Mobil | Tab vom Raum erreicht den Monitor, Enter öffnet die Wand; nur-Büro-Einbettung zeigt fünf Monitore; kein horizontaler Seitenscroll bei 390 px |
| Live (GitHub Pages, Office-API): `buero.js`/`modell.js` mit Monitorcode ausgeliefert, Testbilder abrufbar; Office-API antwortet ohne Token und mit falschem Token mit 401 | ok, nur lesend geprüft |
| Deckel 12 Kacheln | ok (14 zusätzliche Notizen → 12 Kacheln) |

**Befunde und Behebung (in diesem Branch):**

1. Monitorwand verlinkte `http://`-Ablageorte („Öffnen ↗“). Jetzt bekommen nur ladbare Adressen (`https://` oder relativ) einen Link. Niedrig, behoben.
2. In der nur-Büro-Einbettung fehlte der Rücksprung „← Zurück zum Büro“ auf allen Unteransichten (Raum, Agent, Run, Monitorwand): `app.js` fügte ihn vor dem Aufbau der Ansicht ein, die Ansicht überschrieb ihn mit `innerHTML`. Jetzt wird er nach dem Aufbau eingefügt. Bestand seit der Einbettung (PR #1), behoben.
3. Kein Befund, aber Hinweis: In der Monitorwand verdrängen viele neue Textnotizen die Grafiken aus den 12 Kacheln (Restpunkt: Filter).

**Umbau auf Timos Wunsch:** Monitore als große Wandbildschirme (160×100 statt 84×52 im Raster, fast viermal so groß) hinter jeder Plattform, Raumkarten vor allen Plattformen, Zentrale als Gehirn mit Synapsen (leuchten bei laufenden Aufträgen/Teams, `prefers-reduced-motion` stoppt sie). Tests nach dem Umbau: siehe Zeile unten.

| `npm run test:office` nach dem Umbau (Wandbildschirme, Gehirn, Befunde 1 und 2) | 74/74 bestanden; Screenshots `*-buero.png`, `*-leer-buero.png`, `*-monitorwand*.png`, `*-portal-register-ki-office.png`, `*-run-team.png` neu |

| Nachtrag Textumbruch (Branch `feature/ki-office-monitor-text`): Monitortexte werden an Wortgrenzen umbrochen (`umbruch()`, Unit-Test `unit.umbruch.test.mjs`) und der Bildschirminhalt per clipPath am Rahmen abgeschnitten; Timos Befund „Schrift steht über den Monitor“ | 76/76 bestanden |

## 13. Nachtrag 18.10.2026 (Nacht): Text-Ausführer Ende-zu-Ende (KI-erstellt: Claude Code)

| Prüfung | Ergebnis |
|---|---|
| Code-Knoten lokal mit Testdaten (Zugang, Prompt, Antwort, Ablage, Fehlertext) | bestanden |
| Zugangsdaten-Filter: Zeile „Token: …“ im Auftrag und „api_key=…“ in der Antwort | entfernt |
| Falscher Rückmelde-Schlüssel, Projekt außerhalb der Grenze, leere Modellantwort | jeweils abgewiesen |
| `validate_workflow` (24 Knoten) | gültig |
| `node --test office/test/n8n-buendel.test.mjs` nach Batching-Änderung | 4 von 4 bestanden |
| Marketing-Texter: Auftrag über Office-API, Ausführer manuell angestoßen (Schlüssel fehlte, siehe unten) | abgeschlossen in 20 s, Notiz im Projekt „Social Media“, 515/1559 Tokens, ca. 0,003 € |
| Social-Planer: Auftrag über Office-API nach der Batching-Korrektur, ohne Eingriff | abgeschlossen in 31 s, Ereignisse, Artefakt (Notiz) und Verbrauch vorhanden, ca. 0,0055 € |

Befund beim ersten Test: Für alle Aufträge seit 17.10.2026 16:06 Uhr fehlte der Eintrag in `office_run_schluessel`. Ursache war das gleichzeitige Schreiben in der Office-API (siehe SETUP.md Abschnitt 10). Nach der Korrektur hat die Office-API den Social-Planer eine Sekunde nach dem Anlegen angestoßen.

Nicht getestet: Wiederholung nach Fehlschlag über die Office-API, Abbruch eines laufenden Text-Runs, sehr lange Antworten über `max_tokens`.

## 14. Nachtrag 18.10.2026 (Nacht): Ausführer des Orchestrierers Ende-zu-Ende (KI-erstellt: Claude Code)

Echte Systeme (Supabase, n8n), kein Testadapter. Ausführer: „TEAM: Office-Ausführer orchestrierer“ (ID `D0jPTU1LjNzhGfyI`). Aufträge mit dem Token von `agent-claude` über einen temporären Hilfs-Workflow angelegt (danach archiviert). Projekt „Momentum Office“, alle Teilaufträge per `@verwaltung-status:` an den Agenten mit vorhandenem Ausführer.

| Schritt | Ergebnis |
|---|---|
| Lokale Tests der Code-Knoten (`unit.ausfuehrer-orchestrierer.test.mjs`, vm-Sandbox gegen den Testspeicher) | 7 von 7: Zerlegung (Zeilen, Semikolons, Aufzählungszeichen, `@agent-id`, Kandidaten in Registry-Reihenfolge), Abbruch bei leerer Zerlegung, unbekanntem, fremdem oder delegierendem Agenten, Zuordnung der Delegationsantworten, Zusammenführen erst nach dem letzten Kind, Fehlertext bei abgebrochenem Kind und bei nicht delegierten Teilen, Zugangsdaten-Filter, zwei Teams in einem Lauf getrennt, Datei-Hygiene, Schleife in Office-API und Ausführer |
| `validate_workflow` | gültig (33 Knoten, nach dem Umbau 34) |
| Registry: `ausfuehrer_url`, dann `ausfuehrer = n8n` gesetzt (PATCH per Hilfs-Workflow, Executions 21278 und 21376) | HTTP 200, `konfig_version` 3, `geaendert_von = agent-claude` |
| Versuch 1 (`run_mvcxzknfbc2608`) | HTTP 409 von der Office-API: `office_run_schluessel` verletzt den Fremdschlüssel. Run angelegt, Schlüssel fehlt, Ausführer nie angestoßen. Ursache: gleichzeitige Schreibaufträge der Office-API (siehe unten). Der Run endet ohne Eingriff als „unbekannt/veraltet“ |
| Versuch 2 (`run_mvcy6j1h38b1e6`), Office-API mit Batching 1 / 250 ms | Run übernommen, Zerlegung in 2 Teile, Ereignisse `aufgaben_lesen` und `registry_lesen`. Die beiden Delegationen liefen gleichzeitig: Teil 2 (`run_mvcy6lai08299a`) abgeschlossen in 4 s; Teil 1 (`run_mvcy6l9g222c9d`) angelegt, aber 409 (`office_ereignisse` vor `office_runs`), nie angestoßen. Ereignis „1 Teilaufträge delegiert, 1 nicht delegiert“ mit Fehler in den Details. Ausführer-Execution 21305 |
| Korrekturen | Office-API: Schleife „Nacheinander schreiben“ (Timos Ja, live, Version 194265d8, ins Repo mit PR #10). Ausführer: Schleife „Nacheinander delegieren“ |
| Versuch 3 (`run_mvcyf16j5155dd`), 3 Zeilen gemischt mit Zeilenumbruch und Semikolon | 22:14:24 angelegt · 22:14:26 in Arbeit · 22:14:27 `tool aufgaben_lesen` · 22:14:28 `tool registry_lesen` · 22:14:28/30/32 je ein `auftrag_delegieren` (Kinder `run_mvcyf49u4b017f`, `run_mvcyf5dgaaca97`, `run_mvcyf6n76ee3dc`, Team `team-run_mvcyf16j5155dd`, Schlüssel `deleg-…-1/2/3`) · 22:14:33 „3 Teilaufträge delegiert“ · Kinder abgeschlossen 22:14:34/35/37 (verwaltung-status, Executions 21344, 21349, 21355) · Zeitplanlauf 22:15: `schritt` „Teilergebnisse zusammengeführt: 3 von 3 Teilaufträgen abgeschlossen, Notiz gespeichert“ (`tool notiz_speichern`, `quelle_ref team_notizen/n_office_teamergebnis_run_mvcyf16j5155dd`) · 22:15:55 in Arbeit → abgeschlossen. Ausführer-Execution 21338 |
| Ergebnis von Versuch 3 | Notiz „Teamergebnis run_mvcyf16j5155dd“ im Projekt „Momentum Office“ (2446 Zeichen, drei Abschnitte „Teil n – Verwaltungs-Status (abgeschlossen)“ mit Auftrag, Ergebnis, Ablageort, Kind-Run). Artefakt `art_mvcygyme20551b` (`art = notiz`). Zusammenfassung des Runs = Status je Teil plus Ablageort. Kein Modellaufruf, Verbrauch „unbekannt“ |

Die Läufe der Ausführer selbst sind in n8n nicht sichtbar, weil erfolgreiche Läufe absichtlich nicht gespeichert werden (Token in Knotenausgaben). Die Execution-IDs stehen in den Ereignis-Details der Runs.

Befund Office-API: Seit 17.10.2026 16:06 Uhr fehlte bei jedem neuen Auftrag der Rückmelde-Schlüssel, weil der HTTP-Knoten „In Supabase schreiben“ alle Schreibaufträge einer Aktion gleichzeitig abschickt. Das Batching der Hauptsitzung (Abschnitt 13) startet die Anfragen nur zeitversetzt und wartet nicht auf die Antwort; bei zwei gleichzeitigen Aufrufen scheiterte Teil 1 von Versuch 2 deshalb trotzdem. Mit der Schleife lief Versuch 3 ohne Fehler.

Gesamtlauf `npm run test:office` (Windows 11, Node 24, Playwright-Chromium): **83 von 83 bestanden**, 86 s.

Nicht im Office-Browser geprüft: Ich habe keinen eigenen Zugang zum Office im Browser (persönlicher Token-Link). Die Darstellung (Team-Run in der Zentrale, Teilaufträge, Teamlinien) ist mit Testdaten in den Browsertests abgedeckt (Abschnitt 10). Live liefert `laden` dieselben Felder (`eltern_run_id`, `team_id`); bitte einmal im Office den Run `run_mvcyf16j5155dd` öffnen.
