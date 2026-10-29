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
| Endzustand Versuch 1 (`run_mvcxzknfbc2608`) | 22:35:07 von der Wartung als „unbekannt / veraltet“ markiert (kein Ausführer hat übernommen), wie vorgesehen |
| Endzustand Versuch 2 (`run_mvcy6j1h38b1e6`), Fehlerpfad | Teil 1 (`run_mvcy6l9g222c9d`) wurde nie angestoßen und von der Wartung als „unbekannt / veraltet“ markiert. Danach Zeitplanlauf 22:40: `schritt` „Teilergebnisse zusammengeführt: 1 von 2 Teilaufträgen abgeschlossen, Notiz gespeichert“ (`tool notiz_speichern`), Artefakt `art_mvczd3yb69a491` (Notiz „Teamergebnis run_mvcy6j1h38b1e6“, 1345 Zeichen, mit Abschnitt „Fehler“), 22:40:55 in Arbeit → **fehlgeschlagen**, `fehler` = „1 von 2 Teilaufträgen nicht abgeschlossen: Verwaltungs-Status (unbekannt / veraltet)“, Fehler-Ereignis vorhanden. Der Fehlerpfad des Zusammenführens funktioniert also live |

Die Läufe der Ausführer selbst sind in n8n nicht sichtbar, weil erfolgreiche Läufe absichtlich nicht gespeichert werden (Token in Knotenausgaben). Die Execution-IDs stehen in den Ereignis-Details der Runs.

Befund Office-API: Seit 17.10.2026 16:06 Uhr fehlte bei jedem neuen Auftrag der Rückmelde-Schlüssel, weil der HTTP-Knoten „In Supabase schreiben“ alle Schreibaufträge einer Aktion gleichzeitig abschickt. Das Batching der Hauptsitzung (Abschnitt 13) startet die Anfragen nur zeitversetzt und wartet nicht auf die Antwort; bei zwei gleichzeitigen Aufrufen scheiterte Teil 1 von Versuch 2 deshalb trotzdem. Mit der Schleife lief Versuch 3 ohne Fehler.

Gesamtlauf `npm run test:office` (Windows 11, Node 24, Playwright-Chromium): **83 von 83 bestanden**, 86 s.

Befund beim Fehlerpfad (behoben im Repo und mit Timos Ja live eingespielt, nur der Knoten „Teams prüfen“, Version 5ea25b26, zeichengleich mit dem Repo geprüft): Die Office-API speichert verschachtelte Ereignis-Details als JSON-Text (`klein()`, höchstens 1000 Zeichen). „Teams prüfen“ las die Liste der nicht delegierten Teile deshalb nie aus. In Versuch 2 fiel das nicht auf, weil der Kind-Run trotz 409 angelegt war und als „unbekannt“ zählte. Scheitert eine Delegation aber ohne Kind-Run (z. B. 403 Projektgrenze), wäre das Team fälschlich „abgeschlossen“ gewesen. Jetzt parst der Knoten den Text; bei gekürztem Text zählt er die Fehlschläge aus dem Ereignistitel. Der neue Test schickt das Ereignis durch die echte Verarbeitung der Office-API und scheitert gegen die alte Fassung.

Nicht im Office-Browser geprüft: Ich habe keinen eigenen Zugang zum Office im Browser (persönlicher Token-Link). Die Darstellung (Team-Run in der Zentrale, Teilaufträge, Teamlinien) ist mit Testdaten in den Browsertests abgedeckt (Abschnitt 10). Live liefert `laden` dieselben Felder (`eltern_run_id`, `team_id`); bitte einmal im Office den Run `run_mvcyf16j5155dd` öffnen.

## 15. Nachtrag 18.10.2026: Abholer für Claude-Code-Agenten (Branch `feature/ki-office-claude-code-ausfuehrer`, KI-erstellt: Claude Code)

Zwei Tests: ein Lauf gegen den **Testadapter** (synthetische Daten, nächster Absatz) und ein **Live-Test gegen die Produktion** (am Ende dieses Abschnitts). Die geplante Aufgabe selbst ist noch nicht angelegt und damit nicht getestet.

**Aufbau des Tests:** `OFFICE_TEST_OHNE_SIMULATION=claude-code node office/dev/server.mjs --port 8799 --szenario leer` (neue Umgebungsvariable im Testadapter: Aufträge an diese Ausführer werden nicht von der Simulation übernommen und bleiben in der Warteschlange). Drei Aufträge als `m_timo` angelegt: `akademie-redakteur` (claude-code), `rekruiter` (claude-code), `marketing-texter` (n8n). Token des Abholers: synthetischer `agent-claude`-Wert des Testservers (`TEAM_OFFICE_API=http://127.0.0.1:8799/api/office`).

| Prüfung | Ergebnis |
|---|---|
| `office.py offen` zeigt nur Claude-Code-Aufträge in der Warteschlange | ✅ 2 von 3 (der n8n-Auftrag fehlt wie gewollt); `office.py meine` zeigt dagegen alle 3, weil alle Claude-Agenten die Identität `agent-claude` teilen |
| Durchlauf nach `agenten/OFFICE_ABARBEITER.md` durch einen Sonnet-Agenten (start → schritt → ergebnis → fertig) | ✅ beide Runs „abgeschlossen (technisch)“, Zeitleiste mit Übernahme, Schritt, Ergebnis (Art `bericht`), Abschluss; danach `offen` leer |
| Werkzeug-Allowlist | ✅ `--tool registry_lesen` (erlaubt) ging durch; ohne `--tool` ebenfalls |
| Unit-Tests `npm run test:office:unit` | ✅ 59/59 (die Änderung am Testadapter ist ohne die neue Variable wirkungslos) |

**Im Testadapter nicht getestet:** (1) die geplante Aufgabe selbst; ein Probelauf über `claude -p` in einem Kindprozess scheiterte an der Anmeldung („OAuth session expired“), das ist eine Eigenschaft des Testrechners, kein Befund zum Ablauf. (2) Der Subagent-Start (`office-texter` usw.) per Agent-Werkzeug: der Testlauf war selbst ein Subagent und konnte keine weiteren starten, er hat deshalb nach den Regeln der Subagent-Datei selbst geschrieben (im Live-Test ging der Start).

**Aus dem Test in die Anleitung übernommen:** Ergebnis-Zusammenfassung wird nach 1000 Zeichen abgeschnitten, längere Texte als Notiz; Steckbrief des Rekruiters als Notiz statt Datei (dem Agenten fehlt `repo_schreiben`, und `office.py` kennt keinen Befehl für `agent_vorschlagen`); „angenommen“ in der Antwort von `fertig` heißt nur „Meldung angekommen“, nicht fachlich abgenommen; Fallback, wenn ein Subagent nicht startbar ist; `--tool` nur bei echtem Werkzeug.

### Live-Test gegen die Produktion (18.10.2026, nach dem Setzen von `TEAM_PORTAL_TOKEN`)

Ablauf nach `agenten/OFFICE_ABARBEITER.md`, durchgeführt von einer Claude-Code-Sitzung (Sonnet) mit dem echten Agenten-Token aus der Umgebungsvariablen (Wert nie ausgegeben). Kleiner Auftrag an den Agenten `rekruiter`, Projekt „Momentum Office“: Steckbrief-Entwurf für einen möglichen „Rechnungs-Vorprüfer“, nichts anlegen.

| Schritt | Ergebnis |
|---|---|
| `office.py offen` vor dem Auftrag | ✅ „Nichts in der Warteschlange“ |
| `office.py auftrag rekruiter …` | ✅ Run `run_mvczhk47edee8f`, Status Warteschlange; `offen` listet ihn |
| `start`, `schritt --tool registry_lesen`, Subagent `office-rekruiter` (per Agent-Werkzeug), `team.py notiz-speichern`, `schritt --tool notiz_speichern`, `ergebnis --art notiz`, `fertig` | ✅ alle Aufrufe ohne Fehler (kein 403 bei den Werkzeugen) |
| Ergebnis im Office | ✅ Run „abgeschlossen (technisch)“, sieben Zeitleisteneinträge, Ergebnis `art_mvczit5b12823f`, Notiz `n_mvczirit30d289` im Projekt „Momentum Office“ |

Die Produktions-Registry weicht vom Testadapter ab (Projektnamen, z. B. rekruiter → „Momentum Office“; Werkzeuge `registry_lesen`, `agent_vorschlagen`, `notiz_speichern`). Die Anleitung nennt keine festen Projekte, es war nichts anzupassen.

**Noch offen:** Die **geplante Aufgabe** `office-claude-code-abholen` ist nicht angelegt: Das Anlegen per Werkzeug hat der Berechtigungsprüfer der Sitzung abgelehnt (es wurde kein Umweg gesucht). Prompt und Einstellungen stehen in SETUP.md Abschnitt 12; ein Mensch legt sie in der Claude-App an. Erst danach ist „ohne manuellen Eingriff“ belegt (Aufgabe läuft von selbst, Run springt auf „abgeschlossen“); das Ergebnis bitte hier nachtragen.

## 16. Nachtrag 18.10.2026: Startfreigabe für Aufträge von Teammitgliedern (Branch `feature/ki-office-auftrag-freigabe`, KI-erstellt: Claude Code)

Getestet gegen den **Testadapter** (synthetische Daten, `office/dev/`), nicht gegen Supabase oder n8n. Das neue Bündel ist **nicht live**.

**Ergebnis:** `npm run test:office:unit` → 84/84 (davon neu: 18 in `office/test/unit.auftrag-freigabe.test.mjs`); `npm run test:office` mit Playwright (Chromium) → 103/103, darunter 1 neuer Browsertest (Desktop und Mobil) und 1 neuer Integrationstest über HTTP; `python agenten/test_office_obsidian.py` → 14/14.

| Fall | Erwartung | Ergebnis |
|---|---|---|
| Hauptschalter `START_REGELN.aktiv = false` | alle Teammitglieder starten sofort, keine Freigabe | ✅ |
| Admin, teurer Agent, 1500 Zeichen, Limit 5 € | startet sofort, keine Freigabe | ✅ |
| Teammitglied (team, vertrieb, dozent), günstiger Agent, kurzer Auftrag | startet sofort, `budget_eur` = 0,05 | ✅ |
| Genau 600 Zeichen / 601 Zeichen | sofort / wartet auf Timo | ✅ |
| Modell `deepseek-v4-flash` | günstig, per `agent_speichern` setzbar | ✅ |
| Teammitglied, teurer (Opus) oder normaler (Sonnet) Agent | `wartet_freigabe`, Freigabe `auftrag_start` offen, **kein Start nach außen**, kein Rückmelde-Schlüssel in der Antwort | ✅ |
| Registry `freigabe_noetig` true / false / null | überschreibt die Stufe, Länge und Limit gelten weiter | ✅ |
| Günstiger Agent, aber langer Text oder Limit 0,20 € | wartet auf Timo (Grund `laenge` bzw. `budget`); Limit −1 oder „viel“ → 400 | ✅ |
| Tagesbudget erschöpft (0,98 € gemessen) | wartet auf Timo (Grund `tagesbudget`); andere Person und Admin unberührt; am nächsten Tag wieder frei | ✅ |
| 20 kleine Aufträge à 0,05 € laufen | der 21. wartet; ein abgelehnter wartender Run reserviert nichts | ✅ |
| Freigabe durch Admin (nach 3 Stunden) | Run → Warteschlange, Ausführer genau einmal mit dem richtigen Schlüssel angestoßen, Freigabe `verwendet`, Wartung setzt ihn nicht auf „unbekannt“, zweite Entscheidung → 409 | ✅ |
| Freigabe durch Auftraggeber, Dozent, Team, Agent | 403 | ✅ |
| Agent greift vor der Freigabe auf den Run zu | 409 (`lebenszeichen`, `run_beenden`) | ✅ |
| Ablehnung | Run `abgebrochen` mit Grund und `abgebrochen_von`, nichts startet, danach nicht mehr freigebbar | ✅ |
| Text (oder Agent) nach der Anfrage geändert | 409, alte Freigabe `ungueltig`, neue offene Freigabe mit neuem Hash, nichts startet; alte Freigabe nicht mehr nutzbar, die neue schon | ✅ |
| Auftraggeber zieht zurück | `abgebrochen`, Freigabe `verfallen`, kein Abbruchsignal | ✅ |
| Doppelter Aufruf mit gleichem Schlüssel | keine zweite Freigabe | ✅ |
| Agent legt Auftrag für sich selbst an; Teilauftrag eines Dozenten an Sonnet-Agent | sofort / wartet; Eltern-Run kann nicht abschließen (`offene_kind_runs`) | ✅ |
| `laden` | Teammitglied sieht seinen wartenden Run, die Freigabe und `start_regeln`; Admin sieht die offene Freigabe; Registry zeigt `kostenstufe`, `sofort_ok` | ✅ |
| Wartung | offene Startfreigabe bleibt 2 Tage offen, verfällt nach 7 Tagen mit dem Run | ✅ |
| HTTP: Murat legt an, Kurt (Dozent) darf nicht freigeben (403), Timo lehnt ab | Run `abgebrochen`, kein Ausführer angestoßen | ✅ |
| Browser: Timo sieht „1 Auftrag wartet auf deine Freigabe“, Karte mit Agent, Kostenstufe, Auftragstext, Auftraggeber, Dialog; Lillien sieht „wartet auf Timo“ ohne Entscheidungsknöpfe und im Auftragsdialog den Vorab-Hinweis (sofort / Länge / Kostenstufe) | wie beschrieben, Desktop und Mobil | ✅ |

**Anpassungen an bestehenden Tests:** Tests, in denen Teammitglieder normale oder teure Agenten beauftragten, geben den Start jetzt in der Testhilfe (`start`) als Timo frei; die Testdaten des Testservers (Runs 1 bis 13) tun dasselbe, damit alle bisherigen Zustände erhalten bleiben. Neu in den Testdaten: Run 14 (wartet auf Timo: Lillien, Marketing-Texter) und Run 15 (Start abgelehnt: Murat, Angebots-Prüfer). Zwei Integrationstests starten als Timo bzw. geben die Startfreigabe zuerst frei. Der Obsidian-Test überspringt Startfreigaben beim Geheimnis-Check (ihre Vorschau ist der Auftragstext, der als Run-Titel ohnehin im Spiegel steht).

**Nebenbefund (behoben):** Die Warteschlangen-Frist (30 Minuten) zählte ab dem Anlegen. Ein Auftrag, den Timo erst Stunden später freigibt, wäre sofort „unbekannt“ geworden; `fristPruefen` zählt jetzt ab der letzten Zustandsänderung (`lebenszeichen`), das gilt auch für Wiederholungen.

**Nicht getestet:** Lauf gegen Supabase und die echte Office-API (SQL und Bündel noch nicht eingespielt); `toLocaleDateString` mit `Europe/Berlin` im n8n-Code-Knoten (läuft in Node ≥ 18 mit voller ICU, mit Rückfall auf UTC, aber nicht in n8n ausprobiert); Verhalten bei sehr vielen Runs pro Tag.

### Live-Test nach dem Einspielen (18.10.2026, KI-erstellt: Claude Code)

Office-API Version `bc375407` veröffentlicht, gespeicherter Code-Knoten zeichengleich mit dem Repo-Bündel (88521 Zeichen). Geprüft mit dem Agenten-Token von Claude (Wert nie ausgegeben):

| Prüfung | Ergebnis |
|---|---|
| `laden` | ✅ 200, `start_regeln` vorhanden (aktiv, 600 Zeichen, 0,05 €, 1 €); Registry zeigt Kostenstufen: Deepseek/Haiku günstig, Sonnet normal, Opus teuer; `server-waechter` mit `freigabe_noetig = true` (belegt, dass das SQL gelaufen ist) |
| Probeauftrag des Agenten an `verwaltung-status` (Run `run_mve8d15wa664b7`) | ✅ startet sofort (Agenten unterliegen der Regel nicht), `budget_eur = 0,05` gespeichert (Spalte vorhanden), Ausführer lief, Run „abgeschlossen (technisch)“, keine Freigabe angelegt |

**Nicht live getestet:** der Weg „Teammitglied, wartet auf Timo, Timo gibt frei oder lehnt ab“. Dafür fehlt ein Mitglieds-Zugang in dieser Sitzung; er ist im Testadapter vollständig geprüft (Abschnitt 16). Bitte einmal von Hand: als Teammitglied einen Auftrag an „Akademie-Redakteur“ anlegen → „Wartet auf Timo“, als Timo im Register „Freigaben“ freigeben → der Run startet.

## 17. Nachtrag 18.10.2026: Wartezeit in der Warteschlange je Ausführer (Branch `fix/warteschlange-frist-je-ausfuehrer`, KI-erstellt: Claude Code)

**Befund (Prüfung nach dem Einspielen der Startfreigabe):** Die Warteschlange galt für alle Ausführer nur 30 Minuten. Der Claude-Code-Abholer läuft aber nur stündlich von 8 bis 20 Uhr (geplante Aufgabe `ki-office-abarbeiter`, nächster Lauf am Montag um 8 Uhr). Ein Auftrag an einen Claude-Code-Agenten hätte also nach 30 Minuten den Status „unbekannt“ bekommen, und der Abholer holt nur Runs in der Warteschlange: der Auftrag wäre verloren gewesen. Aus dem Bestand: fünf Runs vom 17.10. endeten so, damals aber noch ohne Ausführer.

**Änderung:** `FRISTEN.wartezeit_je_ausfuehrer` (claude-code 14 Stunden, hermes 3 Stunden; n8n und Codex bleiben bei 30 Minuten). Neue Tests `office/test/unit.wartezeit.test.mjs` (4). Ergebnis: `npm run test:office:unit` 88/88, `npm run test:office` mit Playwright 107/107.

**Live-Smoketests derselben Sitzung (18.10.2026):** `social-planer` (Haiku, Kosten 0,0021 €) und `marketing-texter` (0,0038 €) bekamen je einen kleinen Auftrag und lieferten Ergebnis plus Notiz ab; `verwaltung-status` lief schon beim Einspielen durch. Claude-Code- und Hermes-Agenten wurden bewusst nicht beauftragt (kein Abholer bis Montag 8 Uhr; Hermes-Token nicht vorhanden).

**Live seit 18.10.2026 abends:** Office-API Version `c72cf85f-2f27-4e43-90a8-a7eadf7c90ff` (Vorversion `bc375407`), gespeicherter Code zeichengleich mit dem Repo-Bündel (89015 Zeichen). Live geprüft: `laden` liefert `wartezeit_je_ausfuehrer` (claude-code 50400 s, hermes 10800 s); ein Probeauftrag an `verwaltung-status` lief durch.

## 18. Nachtrag 18.10.2026: Freigaben auf der Team-Portal-Übersicht (Branch `feature/ki-office-freigaben-uebersicht`, KI-erstellt: Claude Code)

Neue Karte „✅ Wartet auf deine Freigabe (n)“ auf der Übersicht des Team-Portals (`docs/team/index.html`, Funktion `freigabenKarte`), unter den Kennzahlen. Sie holt die offenen Freigaben über die Office-API (`laden`), zeigt Art (Auftrag starten oder externe Aktion), Agent, Kostenstufe, Text, Auftraggeber, Zeit und einen Link zum Run. **Freigeben und Ablehnen erscheinen nur für Timo (Admin)** und rufen `freigabe_entscheiden` auf; der Server prüft die Rolle zusätzlich. Andere sehen die Liste („Offene Freigaben“, Hinweis „Freigeben kann nur Timo“), solange sie überhaupt etwas sehen dürfen; ist nichts offen, erscheint die Karte nur für Timo.

Neuer Browsertest „Portal-Übersicht“ (Desktop und Mobil, Portal-API und Office-API lokal umgeleitet): Timo sieht 2 Zeilen mit Knöpfen, gibt über den Dialog eine frei (Toast, danach 1 Zeile); Lillien sieht die Liste ohne Knöpfe. Ergebnis `npm run test:office` mit Playwright 108/108.

**Nicht geprüft:** das echte Portal gegen die echte Office-API (nur Testadapter); die Karte lädt bei jedem Aufbau der Übersicht neu (alle 2 Minuten, solange niemand tippt).

## 19. Nachtrag 18.10.2026: Vorschläge aus dem Team umgesetzt (Branch `feature/vorschlaege-umsetzen`, KI-erstellt: Claude Code)

Sieben Vorschläge von Kurt (Register „Vorschläge“ im Team-Portal) waren offen. Gelesen über einen kurzen, rein lesenden Hilfs-Workflow (Agenten dürfen Vorschläge nicht über die Portal-API lesen, nur anlegen); der Hilfs-Workflow wurde danach archiviert. Umgesetzt in `docs/team/index.html`:

| Vorschlag | Umsetzung |
|---|---|
| Notizen: Link auf lokale Laufwerke | Pfade werden erkannt und als „📁“-Link angezeigt: `[Text](\Server\Freigabe\Ordner)`, `[Text](C:\Ordner\Datei)`, `file:///C:/…` sowie bare `C:\…` und `\Server\…`. Browser dürfen lokale Dateien aus Webseiten nicht öffnen, darum kopiert ein Klick den Windows-Pfad (Hinweis „Im Explorer mit Strg+L einfügen“). Hilfe-Tabelle des Editors ergänzt |
| Arbeitszeit: Formular verbreiterbar | Der Dialog „Zeit eintragen“ hat jetzt wie Aufgaben und Notizen den Ziehgriff zum Verbreitern (Breite wird gemerkt) |
| Vorschläge: Ordnerstruktur, Filter, Schlagworte, Bereich „Vorschläge“ | Suche in Titel und Text, Bereichsfilter, Schlagworte aus `#Wort` (Klick auf ein Schlagwort filtert), Schalter „Nach Bereich ordnen“; Bereichsliste um „Vorschläge“ und „KI Office“ erweitert |

Nicht ins Portal gehören die vier Vorschläge zum **FracEncoder** (Kommandozeilenvariante für Linux, Sprachen, Benutzerstufen, Fehlermeldung ohne akzeptiertes Passwort): sie wurden als Aufgaben für Kurt angelegt und beantwortet.

Neuer Browsertest „Portal: Vorschläge …“ (Desktop und Mobil; Suche, Bereich, Schlagwort, Gruppierung, Pfad-Links inklusive Klick/Kopieren, Dialog-Ziehgriff). `npm run test:office` mit Playwright 109/109. Testdaten: vier synthetische Vorschläge und eine Notiz mit Pfaden.


## 20. Nachtrag 19.10.2026: Box „Für dich“ auf der Portal-Übersicht (KI-erstellt: Claude Code)

Neue Karte im Team-Portal (`docs/team/index.html`, Funktionen `fuerDichPunkte`, `fuerDichKarte`). Sie zeigt je Person: Rückfragen von Agenten, Erwähnungen (`@Vorname`, `@alle`, `@team`), neu zugewiesene Aufgaben, Aufgaben im Status „Wird getestet“ zum Prüfen, Agenten-Ergebnisse zum Abnehmen und Änderungen an eigenen Aufgaben seit dem letzten „Alles gesehen“. Die Office-Daten werden einmal geladen und mit der Freigabe-Karte geteilt (`officeLaden`).

| Prüfung (Playwright gegen den Testserver, eingespielte Beispieldaten) | Ergebnis |
|---|---|
| Rückfrage eines Agenten (`wartet_rueckmeldung`) erscheint mit Fragetext | bestanden |
| Erwähnung `@Timo` in einem Kommentar erscheint; `timo@example.org` gilt nicht als Erwähnung | bestanden |
| Neu zugewiesene Aufgabe, Aufgabe „Wird getestet“, Ergebnis ohne Abnahme | bestanden |
| Mehrere Einträge je Aufgabe werden zusammengefasst; interne `[run:…]`-Kennungen ausgeblendet | bestanden |
| Klick öffnet die Aufgabe; „Alles gesehen“ blendet Neues aus, Prüfpunkte bleiben | bestanden |
| Pro Abschnitt 3 Einträge, Knopf „weitere anzeigen“ | bestanden |
| Handy 390 px: kein waagerechtes Scrollen | bestanden |
| Office-API-Aufrufe beim Laden der Übersicht | 1 (geteilt mit der Freigabe-Karte) |
| `npm run test:office` (mit Playwright) | 109 von 109 |

Screenshots: `screenshots/portal-fuer-dich-desktop.png`, `screenshots/portal-fuer-dich-mobil.png`. Grenzen: „Zuletzt gesehen“ liegt nur im Browser (localStorage), auf einem zweiten Gerät erscheint Neues dort erneut. Es gibt keine Push- oder WhatsApp-Benachrichtigung für Erwähnungen.

## 21. Nachtrag 19.10.2026: Freigaben vereint, Prüfen-Dialog (KI-erstellt: Claude Code)

Timos Befund: Der SEO-Beitrag stand in „Für dich“, ein Klick öffnete aber nur die Aufgabe, und darunter stand „Wartet auf deine Freigabe (0)“, obwohl das System auf ihn wartete. Ursache: „Freigabe“ gab es in vier Formen, und nur die formellen Office-Freigaben wurden gezählt.

Jetzt sammelt der Abschnitt „✅ Wartet auf deine Freigabe“ in „Für dich“ alle vier Formen:
1. Formelle Freigaben im KI Office, also externe Aktionen und Auftragsstarts. Entscheiden darf nur der Admin, Teammitglieder sehen ihre eigenen mit dem Hinweis.
2. Agenten-Ergebnisse ohne Abnahme.
3. Aufgaben im Status „Wird getestet“.
4. Offene Aufgaben, die ein Agent der Person zugewiesen hat, zum Beispiel „SEO-Beitrag prüfen“ oder Wächter-Freigaben.

Die separate Karte „Wartet auf deine Freigabe“ ist entfallen.

Ein Klick öffnet einen **Prüfen-Dialog**. Er zeigt den Knopf „Vorschau öffnen“ für den ersten Link, die Beschreibung, mit `[[Titel]]` oder „Notiz „…““ verknüpfte Notizen im Volltext, den Verlauf und je Fall „Freigeben“ oder „Änderungen wünschen“. Bei Agenten-Aufgaben bedeutet Freigeben „Erledigt“, ein Änderungswunsch geht als Kommentar an den Agenten. Bei „Wird getestet“ setzt ein Änderungswunsch die Aufgabe zurück auf „In Arbeit“. Beim Run führt Freigeben zur Abnahme, ein Änderungswunsch zur Zurückweisung. Bei formellen Freigaben heißt es Freigeben oder Ablehnen. Rückfragen von Agenten lassen sich direkt beantworten.

| Prüfung | Ergebnis |
|---|---|
| Browsertest neu: Freigabe-Abschnitt bündelt Auftragsstart und E-Mail-Freigabe, Prüfen-Dialog, Ablehnen ohne Begründung bleibt offen, Freigeben entfernt den Eintrag, Lillien sieht nur ihren Auftrag ohne Knöpfe (Desktop und Handy) | bestanden |
| SEO-Fall (Agenten-Aufgabe mit Vorschau-Link und `[[Notiz]]`): Vorschau-Knopf mit richtiger Adresse, Notiztext sichtbar, Freigeben- und Änderungs-Knopf, Handy ohne waagerechtes Scrollen | bestanden |
| `npm run test:office` (mit Playwright) | 109 von 109 |

Screenshots: `screenshots/portal-pruefen-dialog-desktop.png`, `screenshots/portal-pruefen-dialog-mobil.png`.

## 22. Nachtrag 19.10.2026: Ordnung in „Für dich“, Berichte und genannte Aufgaben (KI-erstellt: Claude Code)

Timos Befund: Im Tagesbericht des SEO-Agenten fand er keinen Link zum Text. Der Bericht nannte die Beiträge nur beim Titel. Die eigentlichen Prüfaufgaben steckten hinter „24 weitere anzeigen“, weil 27 Einträge unter Freigabe standen: 7 Agenten-Aufgaben, 4 „Wird getestet“ und 16 Agenten-Ergebnisse, die meisten davon aus Testläufen.

Jetzt gilt:
- **Freigabe:** Hier stehen nur noch echte Entscheidungen, sortiert nach Wichtigkeit: formelle Office-Freigaben, dann Agenten-Aufgaben mit „prüfen“, „freigeben“, „Frage“ oder „entscheiden“ im Titel, dann sonstige Agenten-Aufgaben, dann „Wird getestet“.
- **Berichte:** Tagesberichte, Wochenberichte und Ähnliches ohne Frage stehen unter „📋 Berichte zur Kenntnis“. Der Dialog bietet „Gelesen (Erledigt)“ an.
- **Ergebnisse:** Agenten-Ergebnisse ohne Abnahme stehen unter „📄 Agenten-Ergebnisse abnehmen“. Teilaufträge eines Teams erscheinen dort nicht einzeln. Beides zählt nicht mehr in die Zahl oben.
- **Genannte Aufgaben:** Im Prüfen-Dialog werden offene Aufgaben, die im Text vorkommen, als Knöpfe angeboten. Ein Klick öffnet direkt deren Prüfen-Dialog.

| Prüfung (Playwright, Testserver, Szenario wie bei Timo) | Ergebnis |
|---|---|
| Tagesbericht nicht unter Freigabe, sondern unter „Berichte zur Kenntnis“ | bestanden |
| Bericht-Dialog zeigt beide SEO-Aufgaben als „Genannte Aufgaben“ und „Gelesen (Erledigt)“ | bestanden |
| Klick auf eine genannte Aufgabe öffnet den SEO-Beitrag mit Notiztext und Lovable-Hinweis | bestanden |
| Desktop und Handy ohne waagerechtes Scrollen | bestanden |
| `npm run test:office` | 109 von 109 |

Screenshots: `screenshots/portal-fuer-dich-ordnung.png`, `screenshots/portal-bericht-dialog.png`.

## 23. Nachtrag 19.10.2026: Register „Tresor“ für Passwörter (Branch `feature/tresor`, KI-erstellt: Claude Code)

Timos Wunsch: eine Seite im Portal mit Eingabe, Ausgabe und Schlüssel, um geschützte Passwörter auszutauschen, am liebsten über Kurts FracEncoder.

- **FracEncoder:** Das installierte Programm (`FracEncoder.rel.exe` 1.0.0.4, Qt) hat eine Bedienoberfläche und eine Hilfe für Kommandozeilen-Schalter (`/enc /src= /dst= /key=`). Kurt sagt aber, es ist bisher nur über die Bedienoberfläche nutzbar. Ein Browser kann ein Programm auf dem Rechner nicht direkt aufrufen. Dafür bräuchte jeder Rechner ein kleines Hilfsprogramm, und das geht erst mit einer Kommandozeilen-Version. Das Register zeigt dazu einen Hinweis.
- **Jetzt umgesetzt:** Verschlüsselung direkt im Browser (Web Crypto): AES-256-GCM, Schlüssel per PBKDF2-SHA-256 mit 600.000 Runden, zufälliges Salz (16 Byte) und IV (12 Byte) bei jedem Durchlauf. Ausgabe als `MKT1.<base64url>`. Text und Schlüssel werden weder gesendet noch gespeichert. Die Felder leeren sich nach 5 Minuten ohne Eingabe, und das Auffrischen im Hintergrund baut das Register nicht neu auf.
- **Abgefangen:** Schlüssel unter 10 Zeichen, ein falscher Schlüssel, ein abgeschnittener Text und ein schon verschlüsselter Text beim Verschlüsseln. Zeilenumbrüche, die beim Kopieren entstehen, schaden nicht.

| Prüfung (Playwright, Testserver, Desktop und Handy) | Ergebnis |
|---|---|
| Ver- und Entschlüsseln mit Umlauten, ß und € ergibt den Originaltext | bestanden |
| Zwei Verschlüsselungen desselben Textes ergeben unterschiedliche Ausgaben | bestanden |
| Falscher Schlüssel, abgeschnittener Text, zu kurzer Schlüssel ergeben klare Meldungen | bestanden |
| Kopieren, Schlüssel anzeigen/verbergen, „Alles leeren“ | bestanden |
| Kein Request enthält den Klartext | bestanden |
| `npm run test:office` | 110 von 110 |

Screenshots: `screenshots/desktop-portal-tresor.png`, `screenshots/mobil-portal-tresor.png`.

## 24. Nachtrag 19.10.2026: KI-Agenten im Portal selbst anlegen (Branch `feature/agenten-anlegen`, KI-erstellt: Claude Code)

Timos Wunsch: Er will KI-Agenten, zum Beispiel „Kurts Claude Code“, selbst im Portal anlegen. Bisher ging das nur direkt in der Datenbank.

- **Portal-API (n8n `kMuDaDmT9rCN5Vs2`, Knoten „Anfrage prüfen“):** `mitglied_speichern` mit `typ: 'agent'` legt einen KI-Agenten an. Das geht nur für Admins und nur bei neuen Einträgen. Der Agent bekommt die ID `agent-<name>` (Umlaute umgeschrieben, bei Doppelung ein Zufallsanhang), die Rolle `agent` und den Status `aktiv` sowie einen Agenten-Code mit 32 Zeichen. Die Rolle `agent` erlaubt weiterhin nur, was in `AGENT_DARF` steht. Ein bestehender Mensch wird nicht zum Agenten. Version „Claude: Timo kann KI-Agenten anlegen“ ist veröffentlicht (2d550020). Die Vorversion 7731e467 liegt gesichert in `Team-Portal/_archiv/2026-10-19_Portal-API-v2_vor-Agenten-anlegen_7731e467.json`.
- **Team-Seite:** Neuer Knopf „+ KI-Agent“ neben „+ Mitglied“, nur für Admins. Im Dialog gibt es keine Rollenwahl, dafür erklärt ein Hinweis, was ein Agent darf und wie der Agenten-Code verschickt wird (über den Tresor, den Schlüssel am Telefon). Bei bestehenden Agenten heißt die Option jetzt „Neuen Agenten-Code erzeugen“.

| Prüfung | Ergebnis |
|---|---|
| Logik der Portal-API lokal getestet: Agent anlegen, ID-Doppelung, Umlaute, Mensch weiterhin mit Rolle, Kurt und Agent bekommen 403, kein Umbau bestehender Menschen | bestanden |
| Code in n8n Zeichen für Zeichen mit der geprüften Datei verglichen | identisch |
| Live: Laden über `team.py meine` | funktioniert |
| Live: Agent versucht `mitglied_speichern` | 403 „Das dürfen Agenten nicht“ |
| Browser (Desktop und Handy): „+ KI-Agent“ sendet `typ: agent`, „+ Mitglied“ bleibt mit Rollenwahl, bei bestehendem Agenten „Neuen Agenten-Code erzeugen“, Kurt sieht den Knopf nicht | bestanden |
| `npm run test:office` | 111 von 111 |

Screenshots: `screenshots/desktop-portal-agent-anlegen.png`, `screenshots/mobil-portal-agent-anlegen.png`.

## 25. Nachtrag 20.10.2026: Papierkorb, Notiz-Versionen, Schutz vor Datenverlust (Branch `feature/papierkorb-versionen`, KI-erstellt: Claude Code)

Anlass: Kurt hat im Portal Inhalte verloren, eine Aufgabe zu Modul 2 und Text. Wiederherstellen war nicht möglich: Gelöschtes war sofort endgültig weg, Notizen hatten keine Versionen, und n8n speichert erfolgreiche Portal-Anfragen nicht.

- **Papierkorb (Supabase, `supabase/team_papierkorb.sql`):** `team_loeschen(art, id, von)` kopiert die Zeile (bei Aufgaben samt Kommentaren) in `team_papierkorb` und löscht sie erst danach, beides in einem Schritt. `team_wiederherstellen(eintrag)` holt sie zurück, bei gleichem Notiztitel mit dem Zusatz „(wiederhergestellt)“. Gelöschtes bleibt 30 Tage im Papierkorb. Gilt für Aufgaben, Notizen, Vorschläge, Social-Beiträge, Systeme und Zeiteinträge.
- **Notiz-Versionen:** Ein Trigger sichert vor jeder Änderung von Titel oder Inhalt die alte Fassung, je Notiz die letzten 30, höchstens 180 Tage alt. Damit gilt das für jeden Weg, auf dem eine Notiz geändert wird, auch für Agenten.
- **Portal-API:** lädt über `team_laden_plus()`, löscht über `team_loeschen`, neue Aktionen `papierkorb`, `papierkorb_wiederherstellen` und `notiz_versionen`. Beim Speichern von Notizen und Aufgaben schickt das Portal den Stand mit, den es geöffnet hatte. Weicht der ab, antwortet die API mit 409 statt still zu überschreiben. Agenten schicken keinen Stand mit, für sie ändert sich nichts.
- **Portal:** „🗑 Papierkorb“ unter Aufgaben und Notizen. Das Team sieht dort, was es selbst gelöscht hat, Timo sieht alles. Im Notiz-Dialog gibt es „Versionen“ (ansehen, in den Editor übernehmen). Bei gleichzeitigem Bearbeiten erscheint ein Hinweis mit „Meine Fassung trotzdem speichern“, „Meinen Text kopieren“ und „Abbrechen und neu laden“. Bei ungespeicherten Änderungen fragen Abbrechen, Zurück-Taste, Adresswechsel, [[Link]]-Klick und das Neuladen der Seite vorher nach. Der Lösch-Knopf heißt „In den Papierkorb“.

| Prüfung | Ergebnis |
|---|---|
| SQL in lokalem Postgres (PGlite), zweimal ausgeführt: Versionen, Begrenzung auf 30, Aufgabe samt Kommentaren in den Papierkorb und zurück, Titelkonflikt, Fehlerfälle, Aufräumen nach 30 Tagen, `team_laden_plus` | 14 von 14 |
| Logik der Portal-API lokal: Löschen über den Papierkorb, Rechte (Team sieht nur Eigenes, Agenten dürfen nicht löschen), Wiederherstellen, Versionen, Konflikt mit und ohne „trotzdem“ | bestanden |
| Browser (Desktop und Handy): Papierkorb-Liste und Wiederherstellen, Versionen ansehen und übernehmen, Abbrechen und Adresswechsel fragen nach (bei „Nein“ bleibt der Text), Konflikt-Hinweis und „trotzdem speichern“, Löschen über den Papierkorb | bestanden |
| `npm run test:office` | 112 von 112 |

**Reihenfolge beim Einspielen:** (1) SQL im Supabase-SQL-Editor ausführen, (2) Portal-API in n8n auf `team_laden_plus` und den neuen Code umstellen, (3) diesen PR mergen. In anderer Reihenfolge funktioniert das Laden nicht, oder das Portal zeigt „Papierkorb“, obwohl noch endgültig gelöscht wird.

Screenshots: `screenshots/*-portal-papierkorb.png`, `*-portal-notiz-versionen.png`, `*-portal-notiz-konflikt.png`.

## 26. Nachtrag 22.10.2026: Kursstände getrennt nach Modulen, Testeinträge gelöscht (Branch `feature/kurs-module`, KI-erstellt: Claude Code)

Timos Wunsch: In der Übersicht die Stände der Kurse nach Modulen getrennt zeigen und alle Tests löschen.

- **Portal-API (n8n, Knoten „Antwort bauen“):** liefert zusätzlich `kurs.module`. Je Modul sind das Teilnehmende, aktive in den letzten 7 Tagen, Ø Fortschritt, fertig (100 %), Check bestanden, wo die Teilnehmenden stehen, Check-Fehler und Fragen an den Assistenten. Bei den Fragen steht jetzt das Modul dabei. Der Kurscode „OFFEN“ des Unternehmer-Moduls gilt nicht mehr als falscher Kurscode. Die bisherigen Felder bleiben, ältere Portal-Fassungen laufen also weiter. Veröffentlicht (44c91266, Vorversion a55ebbe9).
- **Übersicht (Dashboard „Kurse & Teilnehmer“):** je Modul eine Karte (Modul 1.1, Modul 1.2, Unternehmer Modul 1) mit Kennzahlen und „Wo sie stehen“.
- **Kursseite:** Auswahl „Alle Module / Modul 1.1 / …“. Bei „Alle Module“ gibt es zusätzlich die Tabelle „Module im Vergleich“. Bei einem gewählten Modul zeigen Kennzahlen, Diagramme, Teilnehmenden-Liste und Fragen nur dieses Modul. Die Spalte heißt jetzt „Modul“ statt „Teil“.
- **Testeinträge gelöscht:** über einen vorübergehenden Workflow, erst im Probelauf (dry run), dann echt. Danach wurde der Workflow archiviert. Gelöscht wurden 6 Lernstände (Test (Claude), Test Claude, test5, Tristan test, test2, Test3), 8 Chatfragen (Tristan, Test3) und 6 Anfragen (TEST Claude, Test Claude, TEST Leadmagnet, dreimal Timos eigene Fördercheck-Tests). Danach erneut gelesen: Alle echten Teilnehmenden sind noch da. Stehen gelassen, Rückfrage an Timo: Kurt (Modul 1.1 und 1.2, Zugangsanfrage) und ein namenloser Eintrag im Unternehmer-Modul vom 22.10.

| Prüfung | Ergebnis |
|---|---|
| Logik je Modul lokal: Zählung, Aktivität, Ø, fertig, Check-Fehler, Fragen, Gesamtzahlen unverändert, OFFEN kein falscher Code | bestanden |
| Code in n8n mit der geprüften Datei verglichen, „Anfrage prüfen“ unverändert | identisch |
| Live: Laden über `team.py` | funktioniert |
| Browser (Desktop und Handy): Übersicht mit drei Modul-Karten, Kursseite mit Vergleich und Modulwahl, Liste und Fragen gefiltert | bestanden |
| `npm run test:office` | 113 von 113 |

Screenshots: `screenshots/*-portal-kurs-module-uebersicht.png`, `*-portal-kurs-modul-12.png`.

## 27. Nachtrag 22.10.2026: Teilnehmer-Register (Branch `feature/teilnehmer-register`, KI-erstellt: Claude Code)

Timos Wunsch: Unter „Kurs & Teilnehmer“ soll es ein Register der Kursteilnehmer als saubere Tabelle geben. Die Spalten sind „Antrag genehmigt“, „Bildungsgutschein im Haus“, „Seminarvertrag unterzeichnet“, „Brandschutzordnung“, „Google-Bewertung“ und „was noch so kommt“. Die Automationen kommen später dazu.

- **Supabase (`supabase/team_teilnehmer.sql`, nach `team_papierkorb.sql` ausführen):** Tabellen `team_teilnehmer` und `team_tn_spalten`, dazu die 5 Startspalten. Die Funktion `team_tn_haken()` setzt einen einzelnen Punkt, ohne gleichzeitige Änderungen anderer zu überschreiben. Über sie setzen auch die späteren Automationen ihre Haken. Der Papierkorb kennt jetzt die Art „teilnehmer“, und `team_laden_plus()` liefert Register und Spalten mit.
- **Portal-API:** neue Aktionen `teilnehmer` (lesen), `tn_speichern` (mit Stand-Prüfung und Haken-Änderungen), `tn_haken`, `tn_loeschen` (in den Papierkorb, nur Timo) und `tn_spalte_speichern` (nur Timo). Sehen und pflegen dürfen nur Timo und die Dozenten. Vertrieb, Team und Agenten bekommen 403.
- **Portal:** Die Karte „Teilnehmer-Register“ auf der Kursseite ist eine Tabelle mit einer Zeile je Teilnehmer und einer Spalte je Punkt. Ein Klick auf eine Zelle schaltet offen → ✓ (mit Datum) → – entfällt → offen. Dazu kommen Suche, Statusfilter (Standard: Interessenten und aktive), die Spalte „Stand x/y“ und der Dialog für Stammdaten, Punkte mit Datum und Notiz. „Spalten verwalten“ (nur Timo) erlaubt Umbenennen, Reihenfolge, Ausblenden und neue Spalten. Die Namensspalte bleibt beim seitlichen Scrollen auf dem Handy stehen.

| Prüfung | Ergebnis |
|---|---|
| SQL in lokalem Postgres (PGlite), zweimal ausgeführt: Startspalten ohne Doppel, Haken setzen und zurücknehmen ohne Nebenwirkung, Fehlerfälle, `team_laden_plus`, Papierkorb und Wiederherstellen samt Haken | 9 von 9 |
| Logik der Portal-API lokal: Rechte (Dozent ja, Vertrieb und Agent nein, Löschen und Spalten nur Timo), Anlegen mit gültigen Haken, Konflikt, E-Mail-Prüfung, Haken bleiben beim Ändern erhalten, Spalten, Papierkorb-Anzeige; die Prüfungen aus Abschnitt 25 laufen weiter | bestanden |
| Browser (Desktop und Handy): Tabelle mit 5 Spalten, Filter, Klick-Häkchen (✓, dann –), neuer Teilnehmer mit Haken und Datum, neue Spalte | bestanden |
| `npm run test:office` | 114 von 114 |

Screenshots: `screenshots/*-portal-teilnehmer-register.png`, `*-portal-teilnehmer-dialog.png`.

**Datenschutz:** Das Register enthält Personendaten und Förderangaben (Bildungsgutschein). Sichtbar ist es nur für Timo und die Dozenten, gespeichert wird es in Supabase wie die übrigen Teamdaten. Gehört ins Löschkonzept (z. B. Löschen nach Ende der Aufbewahrungsfrist der Maßnahme). Offen für Timo bzw. den Datenschutz-Check.

## 28. Nachtrag 28.10.2026: Social Media – eigene Videos hochladen und Ideen-Liste (Branch `feature/social-upload-ideen`, KI-erstellt: Claude Code)

Timos Wunsch (Portal-Aufgabe `a_mvrzfqb4ca093f`): Im Register „Social Media“ eine Zeile, um eigene Videos hochzuladen, die der Agent im Momentum-Stil schneidet und mit Grafiken für Social Media versieht, und eine Zeile für Ideen und starke Posts von Mitbewerbern (Links). Upload-Ort laut Timo: Supabase Storage. n8n wird erst nach Timos Ja angefasst.

- **Supabase (`supabase/team_social_ideen_upload.sql`, nach `team_teilnehmer.sql`):** Tabellen `team_social_ideen` (Link, Titel, Quelle, Kanal, warum stark, Thema für uns, Status neu/geprüft/umgesetzt/verworfen) und `team_social_uploads` (Pfad im Bucket, Dateiname, Größe, Thema, Kanal, Kontext, Einwilligung mit Zeitpunkt, Status, Run, `aufbewahren_bis` = 90 Tage). Funktionen `team_idee_speichern`, `team_upload_anlegen` (verweigert ohne Einwilligung), `team_upload_status`. Privater Storage-Bucket `medien-roh` (2 GB je Datei, keine Policies: nur service_role und signierte URLs). Papierkorb kennt die Art „idee“. Agent `medien-cutter` in der Registry mit `freigabe_noetig = true` (jeder Schnittauftrag wartet auf Timo).
- **n8n, neuer Workflow „TEAM: Social-Upload“ (Webhook `team-social`), Portal-API v2 unberührt:** Logik in `social/lib/social.js` (Rechte, Eingaben, Pfade, Antworten), Generator `social/n8n/bauen-social.mjs` → `social/n8n/social.workflow.gen.js` nach dem Muster der WhatsApp-Inbox (PR #45). Aktionen `laden`, `idee_speichern`, `idee_loeschen`, `upload_url` (legt den Eintrag an und holt eine signierte Upload-Adresse, 2 h), `upload_status`, `upload_loeschen` (nur Admin: Datei aus dem Bucket, Eintrag „geloescht“). Agenten dürfen nur `laden` und `upload_status`. API-Vertrag in BESTANDSAUFNAHME.md (Nachtrag 28.10.).
- **Portal (`docs/team/index.html`, Register Social Media):** Karte „🎬 Eigenes Video hochladen“ mit Dialog (Videodatei bis 2 GB, Thema, Kanal, fester Stil „Momentum“, Kontext für den Schnitt, Pflicht-Häkchen Einwilligung, Fortschrittsbalken). Ablauf: `upload_url` → PUT der Datei auf die signierte Adresse (XMLHttpRequest, kein Supabase-Schlüssel im Browser) → `upload_status` hochgeladen → `auftrag_starten` an `medien-cutter` (Office-API, Projekt „Social Media“, Eingabe mit `upload_id`, `bucket`, `pfad`, Thema, Kanal, Kontext) → `upload_status` beauftragt mit `run_id`. Scheitert der Auftrag (z. B. Agent noch nicht angelegt), bleibt der Upload mit dem Knopf „Auftrag an Medien-Cutter“ zum Nachholen. Liste zeigt Status (hochgeladen, beim Medien-Cutter, Entwurf zur Abnahme, Fehler), Link ins KI Office, Löschen nur für Timo (zwei Klicks). Karte „💡 Ideen & starke Mitbewerber-Posts“ mit Dialog (Link https Pflicht, Titel, Quelle, Kanal automatisch aus dem Link, warum stark, Thema für uns, Status), Filter (Standard: neu und geprüft), Papierkorb-Löschen. Ist der Workflow noch nicht eingerichtet, zeigen beide Karten einen ruhigen Hinweis, der Rest des Registers läuft weiter.
- **Agent `medien-cutter`:** in `office/agenten.json` und im SQL-Seed; Werkzeuge `medien_lesen`, `video_schnitt`, `medien_entwurf_ablegen` sind noch zu bauen (Steckbrief v2, Restpunkt A). Der Registry-Test liest Seeds jetzt aus `team_office.sql` und `team_social_ideen_upload.sql`.

| Prüfung | Ergebnis |
|---|---|
| `node --test social/test/social.test.mjs`: Zugang (401, Agent 403 beim Schreiben), Ideen (nur https, Kanal aus dem Link, unbekannter Status → neu, Ersatztitel), Upload (nur Video, 0 Bytes, über 2 GB, Einwilligung muss `true` sein, Thema Pflicht, Pfad `JJJJ/MM/<id>_<name>`, MIME), Status (run_id-Format, löschen nur Admin), Helfer, `laden` (sortiert, ohne gelöschte, Pfad nur Admin/Agent) | 5 von 5 |
| Code-Knoten der SDK-Datei (9 Stück) als Funktionskörper geparst, SDK-Datei `node --check` | bestanden |
| Portal-Skript (`index.html`) `node --check` | bestanden |
| Browser (Desktop und Handy, Chrome über puppeteer-core): beide Karten mit Daten, verworfene Ideen standardmäßig ausgeblendet, Filter „Alle“, Idee einfügen (`idee_speichern` mit Link, Status neu, Kanal leer = automatisch), Upload ohne Häkchen → keine Upload-Adresse, mit Häkchen → `upload_url` (Dateiname, 2048 Bytes, Einwilligung true) → genau ein PUT mit `token=test` → `upload_status` hochgeladen → Run im Office-Testadapter (`agent_id` medien-cutter, Projekt Social Media, `eingabe.upload_id`, Auftragstext „Momentum-Stil“) → `upload_status` beauftragt mit `run_id`; keine JavaScript-Fehler | bestanden |
| `npm run test:office` | 115 von 115 |
| Live gegen Supabase und n8n | **nicht geprüft** (Workflow noch nicht angelegt, SQL noch nicht ausgeführt; Reihenfolge unten) |

Screenshots: `screenshots/*-portal-social-upload-ideen.png`, `*-portal-social-idee-dialog.png`, `*-portal-social-upload-dialog.png`.

**Reihenfolge beim Einspielen (SETUP.md Abschnitt 14):** (1) `supabase/team_social_ideen_upload.sql` im SQL Editor, Kontrollabfrage `bucket = 1`, `agent = 1`; (2) Workflow „TEAM: Social-Upload“ aus `social/n8n/social.workflow.gen.js` in n8n anlegen, Credential „Supabase account“, aktivieren; (3) PR mergen; (4) als Timo einen Link einfügen und ein kleines Video hochladen, Auftrag unter Freigaben prüfen.

**Offen für Timo (RESTPUNKTE.md):** Transkription lokal oder Cloud, schriftliche Einwilligungs-Vorlage, Löschlauf nach 90 Tagen, Werkzeuge des Medien-Cutters.

**Nachtrag 28.10.2026 (abends): Zusammenführung mit PR #49, Freitext-Ideen und Bilder.** Beim Anlegen des n8n-Workflows fiel auf, dass PR #49 „Ideen-Briefkasten fürs ganze Team“ (27.10., claude.ai-Sitzung, nicht im Vault oder Status vermerkt) dasselbe Thema mit einer Tabelle gleichen Namens, öffentlichem Bucket und aktivem Workflow `gThnlTbObVDF67Wl` gebaut hatte. Timo hat entschieden: #50 ist die Basis. Übernommen aus #49: Freitext-Ideen ohne Link (`art = idee`) und Bilder zu Ideen (`art = bild`, Aktion `idee_bild_url`, öffentlicher Bucket `social-ideen`, 20 MB, Vorschaubild in der Liste). Die SQL zieht fehlende Spalten nach, falls #49s Tabelle schon existiert. PR #49 geschlossen, Workflow `gThnlTbObVDF67Wl` deaktiviert.

| Prüfung | Ergebnis |
|---|---|
| `social/test/social.test.mjs` (neu: leere Idee abgelehnt, Freitext ohne Link, Bild ohne Link, kaputter Bildpfad, `idee_bild_url` mit Endung/Größe/Agent-Verbot, `bildUrl`, `laden` mit `bild_url`) | 6 von 6 |
| Code-Knoten der SDK-Datei (10 Stück) und `node --check`, Portal-Skript `node --check` | bestanden |
| n8n `validate_workflow` der SDK-Datei | bestanden |
| Browser (Desktop und Handy): Freitext-Idee mit Bild → `idee_bild_url` → ein PUT mit `token=bild` → `idee_speichern` mit `bild_pfad` und ohne Link, Vorschaubild in der Liste; alle Prüfungen von oben weiterhin | bestanden |
| `npm run test:office` | 115 von 115 |

Screenshots zusätzlich: `screenshots/*-portal-social-idee-bild.png`.

**n8n (28.10.2026, abends):** Workflow „TEAM: Social-Upload“ als `ZfStqgtH3IZugnv5` angelegt (26 Knoten, Credential „Supabase account“ per `setNodeCredential` gesetzt und mit manuellem Lauf 44187 bestätigt, inaktiv; erster Anlauf `rA6Rc7Ojv5NYyBZe` archiviert). `gThnlTbObVDF67Wl` (PR #49) deaktiviert, PR #49 geschlossen. Live-Test steht aus, bis Timo die SQL ausgeführt hat; dann aktivieren und als Timo einen Link, ein Bild und ein kleines Video als Probe einstellen.

## 30. Nachtrag 29.10.2026: Anleitungs-Video in der Übersicht (Branch `feature/portal-anleitung-video`, KI-erstellt: Claude Code)

Timos Wunsch: Sein Loom-Video, in dem er Kurt das Portal erklärt, soll in der Übersicht für alle sichtbar sein, auch für Neue.

- **Portal (`docs/team/index.html`, `anleitungVideoHtml`, `bindAnleitungVideo`):** Karte „🎬 So funktioniert das Portal – Timo erklärt es in 9½ Minuten“ direkt unter den Kennzahlen, für alle Rollen. Loom-Einbettung (`loom.com/embed/d8374b76435f44bba6bae75895ded4bf`, 4:3, ohne Loom-Kopfleiste, Vollbild erlaubt, `loading="lazy"`) plus Link „In Loom öffnen“. Die Karte ist ein `<details>`: standardmäßig offen, nach dem Zuklappen merkt sich das Gerät den Zustand (`localStorage mt-video-zu`), und der Iframe wird beim Zuklappen entfernt (Video stoppt, kein Datenverkehr). Beim Aufklappen kommt er wieder. Das Video ist öffentlich (Loom-oEmbed liefert Titel „Portal-Übersicht für Teamaufgaben und Social Media“, 570 Sekunden); keine CSP im Portal, kein Supabase, kein n8n.
- **Falle beim Bauen:** Chrome feuert das `toggle`-Ereignis auch beim ersten Aufbau eines offenen `<details>`. Die erste Fassung baute die Karte im Handler neu und lief damit in eine Endlosschleife (Browsertest: Element 61-mal „detached“). Jetzt bleibt das Element stehen, nur Iframe und Beschriftung wechseln.

| Prüfung | Ergebnis |
|---|---|
| Browser (Desktop und Handy, Loom per Route-Stub): Karte mit Titel, genau ein Iframe mit der Video-ID, Klick auf die Kopfzeile → Iframe weg und `mt-video-zu = 1`, zweiter Klick → Iframe wieder da | bestanden |
| Portal-Skript `node --check` | bestanden |
| `npm run test:office` | 115 von 115 (Stand main; PR #60 bringt einen weiteren Test) |

Screenshots: `screenshots/*-portal-freigaben-admin.png` zeigen die Karte oben in der Übersicht.
