# Setup: KI Office in Betrieb nehmen

Ohne Zugangsdaten in diesem Dokument. Credentials legt Timo selbst in n8n an. Reihenfolge einhalten.

## 0. Was schon läuft, ohne dass du etwas tust

- Nach dem Merge liefert GitHub Pages das KI Office unter `https://flowtimotion-cyber.github.io/N8N-Automation/office/` aus und das Portal zeigt das Register „KI Office“.
- Solange der Workflow „TEAM: Office-API“ nicht aktiv ist, zeigt das Office die Meldung „Keine Verbindung zur Office-API“ und das Portal-Register den Hinweis, dass der Workflow fehlt. Nichts anderes im Portal ändert sich.
- Lokal kannst du alles sofort ansehen: `node office/dev/server.mjs`, dann die Adresse aus der Konsole öffnen (TESTADAPTER, synthetische Daten).

## 1. Supabase: SQL ausführen

1. Supabase → SQL Editor → Inhalt von `supabase/team_office.sql` einfügen → Run.
2. Die Datei ist idempotent (mehrfach ausführbar). Sie legt die `office_*`-Tabellen mit RLS an, ergänzt `team_projekte.raum`, ersetzt `team_laden()` um die Office-Daten und trägt die zehn Agenten aus `office/agenten.json` ein (bestehende Einträge bleiben).
3. Kontrolle am Ende der Ausgabe: `jsonb_object_keys(team_laden())` muss `office_runs`, `office_agenten` usw. enthalten; die zweite Abfrage zeigt die Agenten.
4. Räume: `update team_projekte set raum = 'Vertrieb' where name = '…';` für Projekte, die noch keinen Raum haben (das Office zeigt sie sonst unter „Ohne Raum“).

Hinweis: `team_laden()` liefert jetzt mehr Daten. Die Portal-API v2 ignoriert die neuen Schlüssel; getestet werden konnte das in dieser Sitzung nicht (kein Zugang), siehe RESTPUNKTE.md.

## 2. n8n: Workflow importieren

1. n8n → Workflows → „Import from File“ → `office/n8n/office-api.workflow.json`.
2. In den Knoten **„Team-Daten laden“** und **„In Supabase schreiben“** das vorhandene Supabase-Credential (Typ „Supabase API“, service_role, dasselbe wie in der Portal-API v2) auswählen. Die Datei enthält absichtlich keine Credential-IDs.
3. Webhook prüfen: Produktions-URL muss `https://n8n.hm-storage.de/webhook/office-api` lauten (Pfad `office-api`). Erlaubter Origin ist `https://flowtimotion-cyber.github.io`.
4. Workflow aktivieren. Der Zeitplan „Wartung alle 5 Minuten“ läuft dann mit (markiert veraltete Runs, lässt Freigaben verfallen, räumt Idempotenzschlüssel auf).
5. Test: Office öffnen, anmelden wie im Portal. Es müssen Projekte und die zehn Agenten erscheinen. In n8n erscheinen nur Fehlerausführungen (saveDataSuccessExecution: none).
6. Optional: Im Knoten „Externe Aktion ausführen (Platzhalter)“ echte Knoten anschließen (E-Mail, Social). Bis dahin passiert bei `aktion_ausfuehren` nach außen nichts; die Freigabe wird trotzdem als verwendet markiert und der Run bekommt ein Ereignis.

Der Code im Knoten „Anfrage prüfen“ wird aus `office/lib/*.js` erzeugt. Nach Änderungen an der Bibliothek: `node office/n8n/bauen.mjs`, dann den Workflow erneut importieren (oder den Knoteninhalt aus `office/n8n/code/anfrage-pruefen.js` einfügen). Die SDK-Fassung `office/n8n/office-api.workflow.js` beschreibt denselben Workflow für `@n8n/workflow-sdk`; sie wurde ohne n8n-Zugang nicht ausgeführt.

## 3. Token und Rollen

- Es gibt keine neuen Tokens. Jedes Teammitglied nutzt seinen Portal-Link; der Browser teilt den Token (`localStorage` `mt-token`) zwischen `/team/` und `/office/`.
- Agenten nutzen ihren Agenten-Code (`TEAM_PORTAL_TOKEN`) auch für die Office-API. Welche Registry-Agenten ein Teammitglied vom Typ `agent` ausführt, steht in `office_agenten.mitglied_id`.
- Rollen: `admin` darf alles (Registry, Löschen, kritische Freigaben). `dozent` und Auftraggeber steuern Runs und erteilen normale Freigaben. `team`/`vertrieb` sehen alles, steuern eigene Aufträge. Agenten: nur Arbeitsaktionen, nie Freigaben, nie Löschen.

## 4. Executor anbinden (später)

- n8n-Agenten: einen Workflow je Agent mit Webhook bauen und dessen URL in `office_agenten.ausfuehrer_url` eintragen (`agent_speichern` als Admin oder direkt in Supabase). Die Office-API ruft ihn bei `auftrag_starten` mit `run_id` und `rueckmelde_schluessel` auf. Der Executor meldet sich mit `lebenszeichen`, `ereignis`, `artefakt` (Token des Agenten) und am Ende per signierter `rueckmeldung` (siehe `office/adapter/n8n.js`, `office/lib/signatur.js`).
- Claude Code / Codex / Hermes: nutzen die Office-API mit ihrem Token (`run_beenden` statt Signatur). Stubs und Pflichten in `office/adapter/*.stub.js`, Subagenten in `.claude/agents/`.

## 5. Lokal entwickeln

```
node office/dev/server.mjs                 # Testserver (Port 8787), Tokens in der Konsole
node office/dev/server.mjs --szenario leer # Leerzustände
node office/dev/server.mjs --tempo 0       # eingefrorene Uhr (für manuelle Prüfungen)
npm run test:office                        # alle Tests inkl. Browser (Playwright global oder puppeteer-core + CHROME_PFAD)
node office/n8n/bauen.mjs                  # n8n-Dateien neu erzeugen
```

## 6. Stand 17.10.2026: was schon erledigt ist

- Supabase: `supabase/team_office.sql` wurde von Timo im SQL Editor ausgeführt (Kontrollabfragen siehe Dateiende).
- n8n: Der Workflow **„TEAM: Office-API“** wurde per MCP aus `office/n8n/office-api.workflow.js` angelegt (ID `NuK6m10yIGKMRWxC`, https://n8n.hm-storage.de/workflow/NuK6m10yIGKMRWxC), 19 Knoten, Webhook-Pfad `office-api`, Zeitplan alle 5 Minuten. Der Code-Knoten enthält `office/n8n/code/anfrage-pruefen.js` ohne Kommentarzeilen.
- Noch offen, nur in der n8n-Oberfläche möglich: in **„Team-Daten laden“** und **„In Supabase schreiben“** das Credential „Supabase account“ auswählen (die Schnittstelle vergibt Credentials nicht an HTTP-Knoten), unter Einstellungen „Save successful executions“ auf „Do not save“ stellen, dann aktivieren.
- Die SDK-Datei brauchte für die Schnittstelle drei Anpassungen: keine `.settings(...)`, Verzweigungen als `.add(x.output(n).to(y))`, Code-Knoten als eine Zeichenkette statt langer `+`-Kette. Die JSON-Importdatei bleibt der Weg für den manuellen Import.

## 7. Stand 17.10.2026 (später): Office-API aktiv, Räume und Registry auf echte Projekte umgestellt

- „TEAM: Office-API“ ist aktiv. Live-Test der Webhook-Adresse mit ungültigen Tokens: dreimal HTTP 401 mit korrekter Meldung (Supabase-Zugriff damit belegt). Einstellung „erfolgreiche Läufe nicht speichern“ und Zeitzone Europe/Berlin per Schnittstelle gesetzt.
- Räume und Agenten-Projekte wurden per temporärem Hilfs-Workflow (archiviert) direkt in Supabase geschrieben. Das ist ein **KI-Vorschlag von Claude Code**, Timo kann ihn jederzeit ändern (Office-API `agent_speichern` als Admin oder SQL):

| Raum | Projekte |
|---|---|
| Akademie | Kurs Modul 1, TEMP.Akademie, AZAV & GmbH |
| Marketing | Webseite, Social Media, Hermetik Marketing |
| Vertrieb | Vertrieb, KI-Agentur-Pipeline |
| Kundenprojekte | Healthhack, TeamRebelMedia / Max Görtler, Technische Datenbasis …, AGOMED – Medtech, AWS GmbH, IFA GmbH, Spirit WoMen Zentrum, Wioletta Tuschnio, Yoga mit Seher |
| Verwaltung | Systeme, Momentum Office, Firmenwissen, Sonstiges |

| Agent | Projekte |
|---|---|
| akademie-redakteur | Kurs Modul 1, TEMP.Akademie |
| kurs-waechter | Kurs Modul 1 |
| marketing-texter | Webseite, Social Media, Hermetik Marketing |
| social-planer | Social Media |
| vertrieb-recherche | Vertrieb, KI-Agentur-Pipeline |
| angebots-pruefer | Vertrieb, KI-Agentur-Pipeline und alle Kundenprojekte |
| kunden-entwickler | alle Kundenprojekte |
| architektur-review | alle Kundenprojekte, Systeme, Momentum Office, Webseite |
| verwaltung-status | alle Projekte |
| server-waechter | Systeme, Momentum Office |

Hinweis zur Schnittstelle: `update_workflow` kann Credentials an HTTP-Knoten setzen (`setNodeCredential`), `create_workflow_from_code` nicht. Für künftige Anlagen per MCP also erst anlegen, dann Credential per Update setzen.

## 8. Stand 17.10.2026 (abends): erster Ausführer „verwaltung-status“ aktiv

- Workflow **„TEAM: Office-Ausführer verwaltung-status“** (ID `KwRsEDr743IGDPJ1`, https://n8n.hm-storage.de/workflow/KwRsEDr743IGDPJ1) ist aktiv. Quelle: `office/n8n/ausfuehrer-verwaltung-status.workflow.js`. Credentials: „Supabase account“ an „Zugang laden“, „Schlüssel prüfen“, „Notiz speichern“; „OpenAI account“ an „Glättung (gpt-5-mini)“ (per MCP `setNodeCredential`). Erfolgreiche Läufe werden nicht gespeichert.
- `office_agenten.ausfuehrer_url` für `verwaltung-status` = `https://n8n.hm-storage.de/webhook/office-ausfuehrer-verwaltung` (gesetzt per temporärem Hilfs-Workflow, archiviert).
- Ende-zu-Ende getestet: Auftrag → Warteschlange → in Arbeit → Ereignisse → Artefakt → abgeschlossen, Notiz im Team-Portal (TESTBERICHT.md Abschnitt 9).
- **Einen Auftrag starten:** im KI Office beim Agenten „Verwaltungs-Status“ einen Auftrag anlegen (beliebiges Projekt aus seiner Liste, z. B. „Momentum Office“). Nach etwa 5 Sekunden steht der Run auf „abgeschlossen“, das Ergebnis liegt als Notiz „Wochenstand KW …/… – KI Office (Verwaltungs-Status)“ im gewählten Projekt.
- **Glättung einschalten (kostet Geld):** im Workflow im Knoten „Einstellungen“ `glaettung` auf `true` setzen. Modell dort ebenfalls (`gpt-5-mini`). Standard ist AUS; die Antwort wird nur übernommen, wenn keine Zahl verändert wurde.
- **Weiteren n8n-Ausführer anlegen:** Datei kopieren, Webhook-Pfad (`office-ausfuehrer-<agent>`), `mitglied_id`, Werkzeugknoten und Ereignisse anpassen; `validate_workflow` → `create_workflow_from_code` → `update_workflow` (Credentials, Einstellungen) → `publish_workflow`; dann `ausfuehrer_url` in der Registry setzen (als Admin per `agent_speichern` oder PATCH auf `office_agenten`). Für die SDK-Datei gilt: keine Pfeilfunktionen außerhalb der Code-Knoten-Strings, Verzweigungen als `.add(knoten.output(n).to(ziel))`.

## 9. Orchestrierung einspielen (Branch `feature/ki-office-orchestrierer`, 17.10.2026)

Zwei Handgriffe von dir, nichts davon macht der Branch allein. Reihenfolge: erst Supabase, dann n8n.

1. **Supabase:** `supabase/team_office.sql` erneut im SQL Editor ausführen (Run). Die Datei ist weiterhin idempotent; neu sind nur `alter table office_runs add column if not exists eltern_run_id …`, `… team_id text` und zwei Teilindizes (Abschnitt 2a). Bestehende Runs behalten `null`. Kontrolle: `select column_name from information_schema.columns where table_name = 'office_runs' and column_name in ('eltern_run_id','team_id');` muss zwei Zeilen liefern. `team_laden()` liefert die neuen Spalten automatisch mit (`to_jsonb`).
2. **n8n, Workflow „TEAM: Office-API“ (ID `NuK6m10yIGKMRWxC`):** den Code-Knoten **„Anfrage prüfen“** öffnen und den Inhalt durch `office/n8n/code/anfrage-pruefen.js` ersetzen (Datei komplett kopieren; sie ist mit `node office/n8n/bauen.mjs` aus `office/lib/*.js` erzeugt). Alternativ `office/n8n/office-api.workflow.json` neu importieren, dann aber Credentials in „Team-Daten laden“ und „In Supabase schreiben“ erneut wählen und den alten Workflow deaktivieren. Speichern, Workflow bleibt aktiv.
3. **Prüfen:** Office öffnen, Agenten-Register → „Orchestrierer“ zeigt „delegiert: 0 Teilaufträge“; im Büro sitzt der Orchestrierer in der Zentrale. Ein echter Team-Lauf braucht einen Ausführer für den Orchestrierer (Claude Code oder n8n), der `auftrag_delegieren` aufruft; den gibt es noch nicht (RESTPUNKTE.md). Ohne Ausführer bleibt ein Auftrag an den Orchestrierer nach 30 Minuten als „unbekannt/veraltet“ stehen, wie bei jedem Agenten ohne Ausführer.

Was ein Ausführer des Orchestrierers aufruft (alles mit seinem Agenten-Token; Projekt = Projekt des Eltern-Runs, wenn nicht angegeben):

```
POST …/webhook/office-api
{ "token": "<Agenten-Token>", "aktion": "auftrag_delegieren",
  "daten": { "eltern_run_id": "<eigener run_id>", "agent_id": "marketing-texter", "projekt": "Webseite",
             "auftrag": "Teil 1: …", "team_id": "team-<run_id>", "idempotenzschluessel": "deleg-<run_id>-1" } }
```

Antwort: `run_id` des Teilauftrags, `eltern_run_id`, `team_id`, einmalig `rueckmelde_schluessel`. Danach wartet der Orchestrierer (offene Teilaufträge zählen als sein Lebenszeichen) und meldet `run_beenden` erst, wenn alle Teilaufträge beendet sind, sonst antwortet die API mit 409.

## 10. Stand 18.10.2026 (Nacht): Text-Ausführer aktiv, Schreibreihenfolge der Office-API korrigiert

- Workflow **„TEAM: Office-Ausführer Text (KI)“** (ID `UbQ5nph8FIUSrasi`, https://n8n.hm-storage.de/workflow/UbQ5nph8FIUSrasi) ist aktiv. Quelle: `office/n8n/ausfuehrer-text.workflow.js`. Webhook: `https://n8n.hm-storage.de/webhook/office-ausfuehrer-text`.
- Ein Workflow für alle Textagenten mit Ausführer `n8n`. Er liest die Registry-Zeile des aufgerufenen Agenten zur Laufzeit, baut aus Auftrag und Projektkontext einen Prompt, ruft einmal das Modell auf und legt das Ergebnis als Notiz ins Projekt. Nichts ist pro Agent fest verdrahtet.
- Credentials: „Supabase account“ an „Agent laden“, „Zugang laden“, „Schlüssel prüfen“, „Notiz speichern“; „OpenAI account“ an „Modell (OpenAI)“. Erfolgreiche Läufe werden nicht gespeichert, Fehlläufe schon.
- **Modell:** In n8n gibt es kein Anthropic-Credential. Der Ausführer nutzt deshalb `gpt-5-mini` (Knoten „Einstellungen“: `modell`, `max_tokens`, Preise je Million Tokens). Das tatsächlich genutzte Modell und die geschätzten Kosten stehen in jedem Run unter „Verbrauch“. Ein Lauf kostet bisher 0,3 bis 0,6 Cent.
- **Angebunden** (`ausfuehrer_url` gesetzt): `marketing-texter`, `social-planer`. Die übrigen Textagenten (`akademie-redakteur`, `vertrieb-recherche`, `angebots-pruefer`, `architektur-review`, `rekruiter`, `orchestrierer`) haben in der Live-Registry den Ausführer `claude-code`. Sie bekommen keinen n8n-Webhook, sondern werden von Claude Code über `agenten/office.py` abgearbeitet. Soll einer davon über n8n laufen: in der Registry `ausfuehrer` auf `n8n` und `ausfuehrer_url` auf den Webhook oben setzen.
- **Grenzen:** Das Modell hat keine Werkzeuge (kein Internet, keine E-Mail, keine Social-Konten). Verlangt ein Auftrag eine externe Aktion, liefert der Agent nur den Entwurf mit der Zeile „Freigabe nötig: …“. Zeilen, die wie Zugangsdaten aussehen, werden aus Prompt und Antwort entfernt. Projektgrenze wird im Ausführer ein zweites Mal geprüft.
- **Behobener Fehler in der Office-API:** Der Knoten „In Supabase schreiben“ schickte alle Schreibaufträge gleichzeitig. Der Rückmelde-Schlüssel kam dadurch oft vor dem Run an und scheiterte am Fremdschlüssel. Der Ausführer wurde dann nie angestoßen, der Run blieb in der Warteschlange. Seit 17.10.2026 16:06 Uhr betraf das jeden neuen Auftrag. Jetzt läuft der Knoten mit Batching (ein Auftrag je Schritt). Live eingespielt und veröffentlicht.
- **Hinweis n8n:** Auf dieser Instanz ist `require('crypto')` in Code-Knoten gesperrt. Ausführer müssen das abfangen (der Text-Ausführer lässt dann nur die Prüfsumme weg).
- **Nachtrag 18.10.2026 (Sitzung „Ausführer orchestrierer“):** Batching allein reichte nicht. Der HTTP-Knoten startet die Items nur zeitversetzt und wartet nicht aufeinander. Bei zwei gleichzeitigen `auftrag_delegieren` scheiterte deshalb noch ein Ereignis am Fremdschlüssel. Live und im Repo steht jetzt eine echte Schleife: „Schreibaufträge“ → „Nacheinander schreiben“ (Split in Batches, Größe 1) → „In Supabase schreiben“ → zurück in die Schleife; wenn fertig → „Ergebnis prüfen“. Das Batching im HTTP-Knoten ist wieder entfernt.

## 11. Stand 18.10.2026 (Nacht): Ausführer für den Orchestrierer aktiv (KI-erstellt: Claude Code)

- Workflow **„TEAM: Office-Ausführer orchestrierer“** (ID `D0jPTU1LjNzhGfyI`, https://n8n.hm-storage.de/workflow/D0jPTU1LjNzhGfyI) ist aktiv. Quelle: `office/n8n/ausfuehrer-orchestrierer.workflow.js`. Webhook: `https://n8n.hm-storage.de/webhook/office-ausfuehrer-orchestrierer`. Ablauf: ARCHITEKTUR.md Abschnitt 10b.
- Credential „Supabase account“ an „Zugang laden“, „Schlüssel prüfen“, „Zugang laden (Zeitplan)“, „Notiz speichern“. Erfolgreiche Läufe werden nicht gespeichert, Fehlerläufe schon. Kein Modellaufruf, kein OpenAI-Credential.
- Registry (mit Timos Ja per temporärem Hilfs-Workflow gesetzt, danach archiviert): `orchestrierer.ausfuehrer = n8n`, `ausfuehrer_url` = Webhook oben, `workflow_version = D0jPTU1LjNzhGfyI`, `konfig_version` 3. `office/agenten.json` und `supabase/team_office.sql` tragen jetzt ebenfalls `n8n`.
- **Einen Team-Auftrag starten:** im KI Office beim Agenten „Orchestrierer“ einen Auftrag anlegen. Eine Zeile (oder ein Semikolon-Abschnitt) je Teilauftrag. Wer einen bestimmten Agenten will, schreibt `@agent-id:` davor, zum Beispiel:

```
@verwaltung-status: Wochenstand für das Team erstellen
@marketing-texter: Drei LinkedIn-Posts zum Wochenstand entwerfen
```

  Ohne `@agent-id:` nimmt der Orchestrierer den ersten passenden Agenten des Projekts aus der Registry. Das kann ein Agent ohne Ausführer sein (z. B. `architektur-review` in „Momentum Office“), dessen Teilauftrag dann nach 30 Minuten als veraltet endet. Darum vorerst Agenten mit Ausführer per `@` nennen: `verwaltung-status`, `marketing-texter`, `social-planer`, `server-waechter` (Hermes).
- **Was dann passiert:** Sekunden später ist der Run „in Arbeit“, die Teilaufträge stehen darunter, im Büro laufen Teamlinien aus der Zentrale. Spätestens 5 Minuten nach dem letzten fertigen Teilauftrag liegt die Notiz „Teamergebnis <run_id>“ im Projekt, und der Run ist abgeschlossen. Ist ein Teil fehlgeschlagen, abgebrochen oder veraltet, endet der Team-Run als „fehlgeschlagen“ mit Grund; die Notiz gibt es trotzdem.
- **Office-API, mit deinem Ja geändert:** Vor „In Supabase schreiben“ steht jetzt die Schleife „Nacheinander schreiben“ (Loop Over Items, eine Zeile je Runde), „Ergebnis prüfen“ hängt am Fertig-Ausgang. Das Batching aus Abschnitt 10 reichte nicht: Bei zwei Aufrufen gleichzeitig scheiterte ein Kind-Run trotzdem am Fremdschlüssel. Versionen in n8n: „Claude Code: Schreibaufträge strikt nacheinander (Schleife)“ (aktiv), davor 6c630162 (Batching) und 2d31b793 (Ausgangsstand). `office/n8n/bauen.mjs`, `office-api.workflow.js` und `office-api.workflow.json` hat die Hauptsitzung mit PR #10 nachgezogen (Repo = Live).
- **Bitte löschen (enthalten den Agenten-Token):** n8n-Executions 21282, 21303, 21336 des archivierten Hilfs-Workflows „TEMP: Office-Hilfe orchestrierer Testauftrag“.

## 12. Claude-Code-Agenten abarbeiten lassen (Branch `feature/ki-office-claude-code-ausfuehrer`, 18.10.2026)

Betrifft die Agenten mit Ausführer `claude-code`: `akademie-redakteur`, `vertrieb-recherche`, `angebots-pruefer`, `architektur-review`, `rekruiter` (der `orchestrierer` hat seit Abschnitt 11 einen eigenen n8n-Ausführer und wird hier übersprungen). Ihre Aufträge blieben bisher in der Warteschlange, weil niemand sie abholte.

**Entscheidung: geplante Claude-Code-Aufgabe statt n8n-Ausführer.** Der n8n-Text-Ausführer (Abschnitt 10) kann nur Text erzeugen und Notizen ablegen: kein Repo-Zugriff (`repo_lesen`, `repo_schreiben`), keine Websuche (`web_recherche`), kein Dokumentzugriff. Das brauchen vier der fünf Agenten. Zwei Wege für einen Agenten ohne diese Werkzeuge (`rekruiter`, teils `angebots-pruefer`) bleiben möglich: Registry auf `ausfuehrer = n8n`, `ausfuehrer_url = https://n8n.hm-storage.de/webhook/office-ausfuehrer-text`; das ist eine Datenänderung in Supabase und wurde nicht ohne dich gemacht. Ein einziger Abholer für alle fünf ist einfacher zu betreiben als ein Mix.

**Wie es läuft:** Alle 30 Minuten startet Claude Code eine Sitzung im Ordner dieses Repos, liest `agenten/OFFICE_ABARBEITER.md` und arbeitet jeden Auftrag in der Warteschlange ab (`office.py offen` → `start` → `schritt` → `ergebnis` → `fertig`). Pro Durchlauf höchstens 3 Aufträge. Je Agent der Subagent aus `.claude/agents/office-*.md` (Zuordnung in der Anleitung). Der Abholer selbst nimmt nichts Externes vor; E-Mail, Post, Push, Zahlung, Löschen und Termine gehen nur über eine Freigabe im Office.

**Einmalig von dir:**
1. Den Agenten-Code von Claude (Portal → Team → „Agenten-Code kopieren“) als Benutzer-Umgebungsvariable setzen: `setx TEAM_PORTAL_TOKEN "<Code>"` in der PowerShell, danach die Claude-App neu starten. Der Code gehört in keine Datei im Repo.
2. Die geplante Aufgabe **noch nicht angelegt** (sie braucht erst die Variable aus Schritt 1 und diesen Branch auf `main`). Anlegen in der Claude-App unter „Geplante Aufgaben“: Name `office-claude-code-abholen`, alle 30 Minuten (`*/30 * * * *`), Arbeitsordner = Klon dieses Repos auf `main`, Modell Sonnet, Prompt:
   > Du bist der Abholer des Momentum KI Office. Lies zuerst agenten/OFFICE_ABARBEITER.md in diesem Arbeitsordner und führe genau einen Durchlauf nach dieser Anleitung aus (Aufträge mit `python agenten/office.py offen --json` holen, nacheinander abarbeiten, höchstens 3). Den Token nie ausgeben oder in Dateien schreiben. Zum Schluss eine Zeile Zusammenfassung auf Deutsch.

   Erlaubt sein müssen `python agenten/office.py *`, `python agenten/team.py *`, Lesen und das Starten von Subagenten. Der Rechner und die App müssen laufen; ist die App zu, läuft die Aufgabe beim nächsten Start nach.
3. Ein Auftrag testen: im KI Office beim Agenten „Akademie-Redakteur“ einen Auftrag anlegen. Spätestens nach 30 Minuten steht der Run auf „abgeschlossen“ (sofort: in der App „Jetzt ausführen“). Nach Ablauf von `timeout_sek` (20 bis 30 Minuten) würde die Wartung einen liegengebliebenen Auftrag als „unbekannt/veraltet“ markieren: der Takt von 30 Minuten gilt nur für die Warteschlange, die Frist läuft erst ab „in Arbeit“.

**Grenzen:** Läuft nur, solange der Rechner an ist und die App offen. Wer das nicht will: Hermes (Hetzner-Server) könnte denselben Ablauf übernehmen (`claude -p` mit derselben Anleitung), das ist ein eigener Schritt.

## 13. Startfreigabe für Aufträge von Teammitgliedern einspielen (Branch `feature/ki-office-auftrag-freigabe`, 18.10.2026, KI-erstellt: Claude Code)

**Live seit 18.10.2026 (Timo: „Ja, spiel die Startfreigabe ein“).** Reihenfolge war: SQL von Timo im Supabase SQL Editor (Abschnitt 2b der `team_office.sql`), danach Code-Knoten „Anfrage prüfen“ der Office-API ersetzt und veröffentlicht (Version `bc375407-4c7a-4051-b5cd-4fbcc6c19e29`, Vorversion `194265d8`; gespeicherter Code zeichengleich mit `office/n8n/code/anfrage-pruefen.js`), danach PR #14 gemergt. Die Regel ist **an** (`START_REGELN.aktiv = true`). Timo hatte nachts geschrieben, die anderen sollten vorerst direkt starten dürfen, und das Einspielen dann ausdrücklich beauftragt; wer das ausschalten will, setzt `aktiv: false` in `office/lib/kosten.js` und spielt das Bündel wie unten ein. Die Schritte unten sind das Verfahren für spätere Änderungen der Grenzwerte.

**Gesichert (18.10.2026):** Live-Stand vor der Änderung = Version `194265d8-3a63-4956-ae90-86beb39559b0` der Office-API (aktiv). Der Code-Knoten „Anfrage prüfen“ dieser Version ist zeichengleich mit `office/n8n/code/anfrage-pruefen.js` auf `main` (Commit 85fd1aa) und liegt zusätzlich als Datei `Projekt-Manager/22_Momentum/_sicherung/office-api_anfrage-pruefen_live_194265d8.js`. Rückweg: n8n → Workflow → Versionsverlauf → Version `194265d8` wiederherstellen, oder die Datei in den Code-Knoten einfügen. Das SQL ist additiv und muss für den Rückweg nicht zurückgenommen werden.

**Verfahren (bei jeder Änderung der Regel, in dieser Reihenfolge):**

1. `supabase/team_office.sql` im Supabase SQL Editor ausführen (idempotent). Neu: `office_runs.budget_eur`, `office_agenten.freigabe_noetig`, `freigabe_noetig = true` für `server-waechter`.
2. In n8n im Workflow „TEAM: Office-API“ den Code-Knoten **„Anfrage prüfen“** durch den Inhalt von `office/n8n/code/anfrage-pruefen.js` ersetzen (nur diesen Knoten), speichern, Version benennen (z. B. „Startfreigabe für Teammitglieder“).
3. Oberfläche: Der Branch muss auf `main` (GitHub Pages baut `docs/office/` automatisch).
4. Prüfen: Als Teammitglied im KI Office einen Auftrag an „Akademie-Redakteur“ (Sonnet) anlegen → „Wartet auf Timo“; als Timo im Register „Freigaben“ freigeben → der Run startet; ein kleiner Auftrag an „Verwaltungs-Status“ (Haiku) startet ohne Freigabe.

**Werte ändern:** Grenzen (600 Zeichen, 0,05 € je Run, 1 € je Tag, Modelllisten) stehen oben in `office/lib/kosten.js`. Danach `node office/n8n/bauen.mjs`, Tests (`npm run test:office:unit`), Bündel wie in Schritt 2 einspielen. Einzelne Agenten gezielt: Registry-Feld `freigabe_noetig`, z. B. im SQL Editor `update office_agenten set freigabe_noetig = true where agent_id = 'pa-assistent';` (`false` = nie, `null` = nach Modell).

**Vorsicht beim Einspielen:** Wird der Code-Knoten vor dem SQL ersetzt, scheitert jedes neue `auftrag_starten` (unbekannte Spalte `budget_eur`). Laufende Aufträge stört der Wechsel nicht (der Zustand liegt in Supabase).

## 14. Social-Upload und Ideen-Liste einspielen (Branch `feature/social-upload-ideen`, 28.10.2026, KI-erstellt: Claude Code)

**Noch nicht live.** Timos Wunsch vom 28.10.2026: Im Register „Social Media“ eine Zeile, um eigene Videos hochzuladen (der Medien-Cutter schneidet im Momentum-Stil mit Grafiken), und eine Zeile für Ideen und starke Mitbewerber-Posts (Links). Upload-Ort laut Timo: Supabase Storage.

**Reihenfolge (genau so, sonst sieht das Portal nur Fehlermeldungen):**

1. `supabase/team_social_ideen_upload.sql` im Supabase SQL Editor ausführen (idempotent). Legt `team_social_ideen`, `team_social_uploads`, die Funktionen `team_idee_speichern`, `team_upload_anlegen`, `team_upload_status`, den privaten Bucket `medien-roh` (2 GB je Datei), die Papierkorb-Art „idee“ und den Agenten `medien-cutter` (`freigabe_noetig = true`) an. Die Kontrollabfrage am Ende muss `bucket = 1` und `agent = 1` zeigen.
2. In n8n den Workflow **„TEAM: Social-Upload“** anlegen: SDK-Datei `social/n8n/social.workflow.gen.js` (erzeugt aus `social/n8n/bauen-social.mjs`, Logik `social/lib/social.js`). Credential in allen HTTP-Knoten: „Supabase account“ (`NpKrSLYxAsarf8ar`, service_role). Webhook-Pfad `team-social`, erlaubte Herkunft `https://flowtimotion-cyber.github.io`. Aktivieren. Portal-API v2 und Office-API werden **nicht** angefasst.
3. Branch nach `main` (GitHub Pages baut das Portal).
4. Prüfen: Als Timo im Register „Social Media“ → „+ Link einfügen“ (erscheint in der Liste) → „+ Video hochladen“ mit einer kleinen .mp4 und gesetztem Einwilligungs-Häkchen → Fortschritt, dann Hinweis „Auftrag angelegt, wartet auf Timos Freigabe“ → im KI Office unter Freigaben sichtbar. Datei liegt in Supabase → Storage → `medien-roh/JJJJ/MM/`.

**Was der Browser darf:** nur `POST …/team-social` mit dem Portal-Token und ein `PUT` auf die signierte Adresse (2 h gültig). Kein Supabase-Schlüssel, keine Bucket-Policies nötig.

**Rückweg:** Workflow deaktivieren; das Portal zeigt dann in beiden Karten „noch nicht eingerichtet“, der Rest des Registers läuft weiter. Tabellen und Bucket bleiben.
