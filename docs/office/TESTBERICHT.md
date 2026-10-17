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
