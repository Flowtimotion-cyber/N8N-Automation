# Restpunkte und Fragen an Timo

Stand: 18.10.2026 (ergänzt nach Nachprüfung auf Windows, TESTBERICHT.md Abschnitt 7, nach dem ersten echten Ausführer, Abschnitt 9, und nach dem Ausführer des Orchestrierers, Abschnitt 14). Priorität: A = vor Inbetriebnahme, B = in den ersten Wochen, C = später.

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
| B | Executoren bauen: ✅ 17.10.2026 **n8n-Ausführer für `verwaltung-status` läuft** (`office/n8n/ausfuehrer-verwaltung-status.workflow.js`, ARCHITEKTUR.md 10a). Offen: weitere n8n-Agenten (marketing-texter, social-planer) nach dem Muster, Hermes-Polling, Claude-Code/Codex-Ablauf; Stubs ersetzen | `office/adapter/*.stub.js` |
| B | Office-API: Token zusätzlich per Header annehmen (z. B. `X-Office-Token`), damit Ausführer ein Header-Auth-Credential nutzen können statt den Token aus `team_mitglieder` zu lesen. Änderung am bestehenden Workflow, nur mit Timos Ja | `office/n8n/bauen.mjs` (Glue), ARCHITEKTUR.md 10a |
| B | Office-API: `n8n_execution_id` bei Wiederholung (`run_wiederholen`, Auto-Wiederholung) zurücksetzen; sonst 409 beim zweiten Versuch. Bis dahin senden Ausführer die Execution-ID nur in Ereignis-Details | `office/lib/verarbeitung.js` |
| B | n8n-Executions 20708, 20713, 20714, 20716, 20723 (Hilfs-Workflow und erster Ausführer-Lauf) enthalten den Agenten-Token in Knotenausgaben: in n8n löschen oder Token des Mitglieds `agent-claude` neu setzen | TESTBERICHT.md Abschnitt 9 |
| C | Ausführer: `inhalt_hash` des Artefakts ist leer, weil `require('crypto')` im Code-Knoten gesperrt ist → Crypto-Knoten (SHA-256) einbauen | `office/n8n/ausfuehrer-verwaltung-status.workflow.js` |
| C | Ausführer: Fehlerpfad, Abbruch und Glättung (gpt-5-mini) einmal gezielt testen; Testaufgaben „test“ (Kurs Modul 1) aufräumen, sie erscheinen im Wochenstand als überfällig | TESTBERICHT.md Abschnitt 9 |
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
| A | ✅ 17.10.2026 gebaut (Branch `feature/ki-office-orchestrierer`, Pull Request): Datenmodell (`eltern_run_id`, `team_id`), Aktion `auftrag_delegieren`, Teamregel, Darstellung (Zentrale, Teamlinien, Zweige). Offen: Timo führt die SQL erneut aus und spielt `office/n8n/code/anfrage-pruefen.js` in den Code-Knoten ein (SETUP.md Abschnitt 9) | ARCHITEKTUR.md Abschnitt 11 |
| A | ✅ 18.10.2026 gebaut und Ende-zu-Ende getestet: n8n-Ausführer „TEAM: Office-Ausführer orchestrierer“ (`D0jPTU1LjNzhGfyI`), deterministisch ohne Modell, zerlegt nach Zeilen und `@agent-id:`, delegiert nacheinander, führt per Zeitplan zusammen (ARCHITEKTUR.md 10b, TESTBERICHT.md 14). Ursprünglich: Orchestrierer: Ausführer bauen (Claude Code per Subagent oder n8n), der Aufgaben liest, zerlegt, `auftrag_delegieren` aufruft, auf die Kinder wartet und zusammenführt; bis dahin nur im Testadapter simuliert | SETUP.md Abschnitt 9, `office/adapter/test.js` (Skript „team“) |
| B | Orchestrierung: Abbruch eines Eltern-Runs bricht Kind-Runs nicht automatisch ab (bewusst, damit Teilergebnisse nicht verloren gehen); Entscheidung: Kaskade anbieten (`run_abbrechen` mit `mit_kindern: true`)? | `office/lib/verarbeitung.js` |
| B | Orchestrierung: Sammellöschung (`aelter_als_tage`) lässt Eltern-Runs stehen, deren Kinder nicht in der Frist liegen; Nachkommen über mehr als eine Ebene werden nur bei Einzellöschung erfasst | LOESCHKONZEPT.md |
| C | Büro: mehr als drei Orchestrierer passen nicht in die Zentrale (Anzeige „+n weitere“ fehlt dort); Teamlinien zu Agenten ohne Platz auf der Plattform (ab dem fünften Agenten eines Raums) werden nicht gezeichnet | `docs/office/js/buero.js` |
| A | Rekruiter: Freigabe-Art `agent_anlegen` (inhaltsgebunden) und Ausführer, der nach Freigabe `agent_speichern` ausführt; bis dahin legt Timo den Steckbrief von Hand an | ARCHITEKTUR.md Abschnitt 11 |
| A | PA-Assistent: Datenschutz-Punkte aus DATENSCHUTZ_AI_ACT.md (Anwendungsfall D) klären, dann Ausführer in n8n (Gmail/Outlook/Kalender-Knoten, Hermes-Polling) bauen | DATENSCHUTZ_AI_ACT.md |
| B | Puppeteer-Ersatzpfad der Browsertests vervollständigen oder entfernen (4/7 ohne Playwright); bis dahin Playwright lokal installieren (TESTBERICHT.md Abschnitt 7) | `office/test/browser.mjs` |
| B | Registry: Executor und Modell passen nicht überall zusammen (`kunden-entwickler` läuft über Codex, `kurs-waechter`/`server-waechter` über Hermes, tragen aber Claude-Modell-IDs). Bei F4 klären, welches Modell dort wirklich läuft, sonst „unbekannt“ eintragen | `office/agenten.json` |
| B | ~~Startbestand der Registry enthält „Kundenprojekt Müller GmbH“~~ – gelöst 17.10.: `supabase/team_office_produktiv.sql` ersetzt synthetische Projektnamen und setzt Räume (siehe INBETRIEBNAHME.md) | `supabase/team_office_produktiv.sql` |
| C | Subagent `office-entwickler` darf `Bash(node *)`/`Bash(npm run *)`: auf die Testskripte einschränken | `.claude/agents/office-entwickler.md` |
| B | Monitore: **Vorschaubilder für PDF** (und Office-Dateien). Heute nur Karte mit Link; Vorschau bräuchte ein serverseitiges Rendering (z. B. n8n-Knoten erzeugt PNG und legt es als eigenes Artefakt ab) | `docs/office/js/buero.js`, ARCHITEKTUR.md 9a |
| B | Monitore: **Allowlist der Ablage-Domains** als CSP (`img-src`, `frame-src`) in `docs/office/index.html` oder am Hoster, sobald klar ist, wo Agenten Ergebnisse ablegen (Supabase Storage, Drive, Repo). Bis dahin lädt das Office jede `https://`-Adresse aus der rechtegefilterten API-Antwort | SICHERHEIT.md S20 |
| C | Monitore: Executoren sollten `art` genauer setzen (heute nur text/datei/link/commit/notiz/bericht; Typ wird aus der Dateiendung erkannt). Vorschlag: `bild`, `html`, `pdf` in `ARTEFAKT_ARTEN` aufnehmen und Bildgröße/MIME mitliefern | `office/lib/verarbeitung.js` |
| C | Monitore: Ergebnisse privater Ablagen (Drive mit Anmeldung) zeigen im `<img>`/iframe nur einen Fehler oder die Anmeldeseite; dann signierte, kurzlebige Vorschau-URLs über die Office-API ausgeben | ARCHITEKTUR.md 9a |
| C | Monitore: mehr als 12 Ergebnisse je Raum (Blättern), Filter nach Typ und Prüfstand, Vergleich zweier Versionen über den Hash | `vMonitorwand` |
| C | Die Browser-Vorschau im Claude-Desktop-Browserfenster blockiert eingebettete iframes (`ERR_BLOCKED_BY_CLIENT`); in Chromium/Playwright laden sie. Für Sichtprüfungen einen normalen Browser nehmen | TESTBERICHT.md 9 |
| B | Obsidian-Spiegelung (`office.py obsidian`, OBSIDIAN.md): **Entscheidung Timo** — mit welchem Token läuft sie? Hermes-Token sieht nur Hermes’ Registry-Projekte; für das ganze Office braucht es einen Menschen-Token mit Projektsicht (Timo) auf dem Rechner mit dem Vault, oder Hermes’ Projektliste wird erweitert | `docs/office/OBSIDIAN.md` Abschnitt 5, `office/lib/rechte.js` |
| B | Obsidian-Spiegelung: wer startet den Lauf (Hermes-Zeitplan, nach jedem `fertig`, oder Windows-Aufgabenplanung alle 30 Min.)? Noch nicht eingeplant; Übergabe an Hermes in `Projekt-Manager/22_Momentum/_UEBERGABE.md` | `agenten/office.py` |
| C | Obsidian-Spiegelung: einmaliger Hinweis-Abschnitt in `02 Projekte/Momentum KI Akademie.md` (Vault), dass Ergebnisse unter `01 Inbox/KI Office/` liegen; Maskierung ist ein Netz (E-Mail, Telefon, Schlüssel), keine Garantie gegen Kundendaten in Zusammenfassungen; gelöschte Runs (Löschkonzept) bleiben im Vault stehen | `docs/office/OBSIDIAN.md` |
| B | ✅ 18.10.2026 **Text-Ausführer** (n8n, `UbQ5nph8FIUSrasi`) für `marketing-texter` und `social-planer` live, Ende-zu-Ende getestet. Weitere n8n-Textagenten nur noch Registry-Eintrag (`ausfuehrer_url`) | SETUP.md Abschnitt 10, TESTBERICHT.md Abschnitt 13 |
| A | ✅ 18.10.2026 Office-API schrieb parallel; Rückmelde-Schlüssel fehlte seit 17.10. 16:06 bei jedem Auftrag, n8n-Ausführer wurden nie angestoßen. Behoben (Batching 1). Nachtrag 18.10.: Batching reichte bei gleichzeitigen Aufrufen nicht (Kind-Run `run_mvcy6l9g222c9d` scheiterte trotzdem); jetzt Schleife „Nacheinander schreiben“, SETUP.md Abschnitt 11. Offen: hängende Runs aus dieser Zeit prüfen (`run_mvcxzknfbc2608` Orchestrierer, zwei Server-Wächter-Runs von Hermes in der Warteschlange) | SETUP.md Abschnitt 10 |
| B | Anthropic-Credential in n8n anlegen, damit der Text-Ausführer das Claude-Modell aus der Registry nutzt (heute gpt-5-mini für alle; Kosten je Lauf unter 1 Cent) | `office/n8n/ausfuehrer-text.workflow.js` |
| B | n8n-Execution 21296 (Fehlersuche am Text-Ausführer, Protokoll kurz eingeschaltet) enthält den Agenten-Token in Knotenausgaben: in n8n löschen | n8n → Executions |
| B | Agenten mit Ausführer `claude-code` (Redakteur, Vertrieb, Angebots-Prüfer, Architektur, Rekruiter; der Orchestrierer läuft seit 18.10. über n8n) brauchen jemanden, der ihre Warteschlange abarbeitet: geplante Claude-Code-Aufgabe mit `office.py meine` oder Umstellung auf den Text-Ausführer | `agenten/ANLEITUNG.md` |
| A | Orchestrierer: Knoten „Teams prüfen“ live auf den Stand aus `office/n8n/ausfuehrer-orchestrierer.workflow.js` bringen (nicht delegierte Teile aus JSON-Text lesen, TESTBERICHT.md 14). Bis dahin endet ein Team, dessen Delegation ohne Kind-Run scheiterte (z. B. 403), fälschlich als „abgeschlossen“. Mit Timos Ja per `update_workflow` (nur `jsCode` dieses Knotens) | `office/n8n/ausfuehrer-orchestrierer.workflow.js` |
| B | Orchestrierer: Kandidatenwahl ohne `@agent-id:` weiß nicht, ob ein Agent einen Ausführer hat (`ausfuehrer_url` ist für Agenten unsichtbar). Vorschlag: Office-API liefert Agenten ein Feld `hat_ausfuehrer` (ja/nein) oder der Orchestrierer bevorzugt `ausfuehrer = n8n/hermes` | `office/lib/verarbeitung.js`, `office/n8n/ausfuehrer-orchestrierer.workflow.js` |
| B | Orchestrierer: freie Zerlegung und Agentenwahl per Modell (claude-sonnet-5-5 laut Registry) statt nach Zeilen. Kostet Geld, nur mit Timos Ja; deterministische Prüfung (Allowlist, Projektgrenze) bleibt davor | ARCHITEKTUR.md 10b |
| B | n8n-Executions 21282, 21303, 21336 (Hilfs-Workflow Testauftrag) enthalten den Agenten-Token und je einen Rückmelde-Schlüssel: in n8n löschen | SETUP.md Abschnitt 11 |
| C | `verwaltung-status` ignoriert den Auftragstext und liefert immer den Wochenstand derselben Woche (eine Notiz je Woche, Upsert). Für Team-Tests reicht das; fachlich sinnvolle Teilaufträge brauchen Agenten, die den Auftrag lesen (Text-Ausführer) | `office/n8n/ausfuehrer-verwaltung-status.workflow.js` |
| C | Orchestrierer: Zusammenführung wartet bis zu 5 Minuten (Zeitplan). Schneller wäre ein Anstoß der Office-API an den Eltern-Ausführer, sobald das letzte Kind endet (`extern.art = team_fertig`) | `office/lib/verarbeitung.js` |

## Hinweis zum Branch

Die Aufgabe nannte den Branch `feature/ki-office`; die Sitzungsumgebung hatte zusätzlich `claude/determined-curie-0gppav` vorgegeben. Die Arbeit liegt auf `feature/ki-office` (Pull Request), derselbe Stand wurde zusätzlich auf den vorgegebenen Sitzungs-Branch gepusht.

| C | Monitorwand: Filter nach Typ (Bild/HTML/PDF/Sonstiges) und Prüfstand; viele Textnotizen verdrängen Grafiken aus den 12 Kacheln (der Monitor selbst bevorzugt Grafik/PDF) | `vMonitorwand` |
| B | Ergebnisse des KI Office nach Obsidian spiegeln (Timos Wunsch 17.10.2026): je Artefakt eine Notiz oder ein Abschnitt im Vault (Titel, Run, Projekt, Prüfstand, Link), z. B. über office.py oder einen n8n-Knoten; vorher klären, welcher Vault-Ordner und ob Hermes das übernimmt | ARCHITEKTUR.md, `agenten/office.py` |
