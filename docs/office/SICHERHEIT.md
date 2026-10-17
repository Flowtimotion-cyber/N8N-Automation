# Sicherheitsbericht: KI Office

Stand: 17.10.2026 · Prüfer: Entwicklung (Claude Code) mit den Checklisten differential-review und sharp-edges als Arbeitshilfe (SKILLS.md), **kein unabhängiger Pentest**. Geprüft: `docs/office/`, `office/`, `supabase/team_office.sql`, Änderung in `docs/team/index.html`, Git-Historie.

## 1. Schutzziele und Grundentscheidungen

- **Geringste Rechte:** Alle Prüfungen (Rolle, Projektgrenze, Run-Zugehörigkeit, Freigabe, Werkzeug-Allowlist) laufen serverseitig im Workflow-Code (`office/lib/rechte.js`, `verarbeitung.js`). Der Browser blendet nur aus.
- **Trennung Projekte/Nutzer:** Agenten sehen nur Registry-Projekte; Runs, Ereignisse, Artefakte, Freigaben und Suche (die Suche läuft über die schon gefilterte `laden`-Antwort) folgen derselben Sicht. Artefakt-Downloads sind Links auf externe Ablageorte; die Rechte dort (Drive, Repo) gelten zusätzlich.
- **Secrets:** Supabase nur als n8n-Credential; Rückmelde-Schlüssel nur in `office_run_schluessel` (service_role) und einmalig in der Antwort auf `auftrag_starten`; nie in `laden`. Keine n8n-Admin-Daten, keine Modellschlüssel im Browser oder Repo.
- **Logs bereinigt:** Freitext wird von Schlüsselmustern befreit (`bereinige()`), Details begrenzt, keine Prompts/Gedankengänge speicherbar.

## 2. Befunde

Schwere: hoch / mittel / niedrig / info. Status: behoben (im Code dieses PR), offen (Restpunkt), akzeptiert (begründet).

| # | Bereich | Befund | Schwere | Behebung | Re-Test |
|---|---|---|---|---|---|
| S1 | IDOR / Rechteausweitung | Ohne Prüfung könnte ein Agent fremde Runs steuern oder Projekte lesen | hoch | behoben: `darfRunSehen/Steuern`, `fuehrtAus`, Projektgrenze aus Registry, Agenten nur eigene Aufträge; Freigaben nie durch Agenten; kritische Aktionen nur Admin; Vier-Augen-Prinzip | Tests 31–35, 46, Integration 8, Browsertest (Agent sieht `p_geheim` nicht) |
| S2 | Replay / manipulierte Webhooks | Rückmelde-Webhook ohne Token wäre fälschbar | hoch | behoben: HMAC-SHA256 über Zeit, Nonce, Inhalts-Hash; Zeitfenster 300 s; Nonce einmalig (Tabelle); Vergleich in konstanter Zeit | Tests 36–38, 47 (Replay → 401) |
| S3 | Doppelte Wirkung | Doppelklick, Netz-Retry oder Wiederholung eines Executors könnte E-Mails doppelt senden | hoch | behoben: Idempotenzschlüssel Pflicht für Aufträge und externe Aktionen, gespeicherte Antwort, Freigabe genau einmal, Unique-Indizes in SQL | Tests 47, 11 |
| S4 | XSS | Portal und Office bauen HTML per String | hoch | behoben: `esc()` für jeden Datenwert, Links nur nach `https?://`-Prüfung, JSON in `<pre>` escaped, Projektfarbe serverseitig auf Hex geprüft | Review aller Template-Strings; Test 55 (Farbe); Browsertests ohne Fehler. Restrisiko: menschliche Durchsicht, kein automatischer Scanner |
| S5 | Injection (PostgREST) | Filterwerte in Pfaden | mittel | behoben: Tabellennamen fest, Werte `encodeURIComponent`, keine freien SQL-Strings; SQL-Datei statisch | Unit (`postgrest.js`) indirekt über alle Szenariotests |
| S6 | SSRF | `ausfuehrer_url` wird vom Workflow per HTTP aufgerufen | mittel | teilweise: nur Admin darf setzen, nur `https://`; **offen:** Allowlist auf eigene Domains (z. B. `n8n.hm-storage.de`) im Code oder n8n-Knoten | Test 55 (`http://` abgelehnt) |
| S7 | Token im n8n-Fehlerprotokoll | `saveDataErrorExecution: all` speichert den Webhook-Body inklusive Token bei Fehlern (wie bei der Portal-API) | mittel | offen: `EXECUTIONS_DATA_MAX_AGE` kurz halten (BETRIEB.md), Fehlerausführungen nur bei Bedarf einschalten; Token rotieren, wenn n8n-Zugang kompromittiert | – |
| S8 | Brute Force auf Token | keine Ratenbegrenzung am Webhook (Bestand wie Portal) | niedrig | akzeptiert: Token 20–64 Hex (≥ 80 Bit); Empfehlung: Rate-Limit am Reverse-Proxy (Restpunkt) | – |
| S9 | Rückmelde-Schlüssel im Klartext in DB | HMAC braucht den Schlüssel serverseitig | niedrig | akzeptiert: Tabelle nur service_role, nie ausgeliefert, mit Run gelöscht; Alternative (Ableitung aus Server-Geheimnis) als Restpunkt | Test 46 (nicht in `laden`) |
| S10 | CSRF | Cross-Origin-POST mit `text/plain` ist möglich | info | akzeptiert: Auth per Token im Body (kein Cookie); fremde Seiten kennen den Token nicht; `allowedOrigins` am Webhook begrenzt CORS-Antworten | – |
| S11 | Prompt Injection aus Dokumenten/Tool-Ergebnissen | Executoren könnten Anweisungen aus Inhalten befolgen | mittel | teilweise: externe Aktionen nur mit Freigabe, Werkzeuge allowlisted, Stubs und Subagenten verbieten Shell aus Eingaben; **offen:** inhaltliche Filter auf Executor-Seite (existiert noch nicht) | Tests 52 (Tool außerhalb Allowlist → 403) |
| S12 | Datenabfluss | `laden` könnte zu viel liefern | mittel | behoben: Whitelist der Felder (keine Tokens, Kontaktdaten, Zeiten, Kursdaten, Schlüssel; `ausfuehrer_url` nur Admin; Notizen nur Metadaten) | Tests 8, 46 |
| S13 | Secrets im Repo | – | – | geprüft: grep-Scan über alle 52 Commits (Muster für OpenAI/Anthropic/GitHub/AWS/Slack-Schlüssel, JWTs, private Keys, service_role, Passwörter, TEAM_PORTAL_TOKEN, Dateinamen .env/credentials) ohne Treffer; gitleaks nicht verfügbar. Fund: n8n-Credential-**ID** (`rkuYTCGaH7Maoaf2`) in `assistent/workflow.js` (Bestand, kein Geheimnis, info) | – |
| S14 | Abhängigkeiten | – | info | keine neuen Laufzeitabhängigkeiten; Tests nutzen Playwright/puppeteer-core nur lokal; jsPDF 2.5.1 im Portal veraltet (Restpunkt) | – |
| S15 | Uploads | keine Uploads im Office | info | Artefakte sind Referenzen; Größen nur als Zahl | – |
| S16 | Denial of Service | große Bodys, lange Texte | niedrig | Textlängen begrenzt (Auftrag 2000, Details 2000, Zusammenfassung 4000); Testserver 1 MB Body; n8n-Limit gilt produktiv | – |
| S17 | Timing-Angriff auf Signatur/Hash-Vergleich | – | niedrig | behoben: `gleich()` konstant | Test 28 |
| S18 | Wartungspfad ohne Token | Der Zeitplan ruft `wartung` ohne Token mit `intern: true`; ein externer Aufruf mit demselben Body dürfte das nicht können | niedrig | behoben: `intern` wird im n8n-Glue und im Testserver verworfen, sobald der Body über den Webhook kommt; von außen antwortet die API mit 401 | Test 16 (Bündel), Integration 9 |
| S19 | Projektgrenze für Menschen | Menschen sehen (wie im Portal) alle Projekte | info | akzeptiert für das Team; Kundenrolle über `mitglieder.projekte` vorbereitet, nicht aktiviert | Test 32 |

### Härtung zu S18

Ein externer Aufruf des Webhooks mit `{ "aktion": "wartung", "intern": true }` ohne Token hätte die Wartung ausgelöst (keine Datenpreisgabe, aber Fristen von außen anstoßbar). Der n8n-Glue setzt `intern` jetzt nur, wenn der Webhook-Knoten nicht ausgeführt wurde (`$('Office-API')` wirft im Zeitplan-Pfad); kommt der Body über den Webhook, wird `intern` entfernt. Siehe `office/n8n/bauen.mjs` und Test 16.

## 3. Re-Test

Nach allen Behebungen: `npm run test:office` → 55/55 bestanden (TESTBERICHT.md). Secret-Scan erneut ohne Treffer.

## 4. Empfehlungen (priorisiert, siehe RESTPUNKTE.md)

1. Allowlist für `ausfuehrer_url`-Domains (S6).
2. n8n-Executions-Aufbewahrung begrenzen, Fehlerausführungen minimieren (S7).
3. Rate-Limit am Reverse-Proxy für `/webhook/*` (S8).
4. Unabhängige Sicherheitsprüfung vor Kundenzugang.
