# Pilot-Portal: konfigurierbare Kopie des Team-Portals

Hier liegt die Fassung des Team-Portals, die ein Pilotkunde bekommt: dieselbe Oberfläche wie `docs/team/`, aber ohne unsere eigenen
Angaben, je Kunde über eine Konfigurationsdatei einstellbar, mit einem eigenen Supabase-Projekt und einer n8n-Cloud-Instanz je Kunde.
Umfang der Stufe 1: Planer und Übersicht (Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team). Alles Weitere (Arbeitszeit,
Social Media, Systeme, Kurs, WhatsApp, KI Office) ist als Option vorbereitet und bleibt im Pilot aus.

Das bestehende Portal unter `docs/team/`, die Datenbank unter `supabase/` und das KI Office unter `office/` bleiben unverändert.

**Für den Aufbau beim Kunden:** [`PILOT_Setup.md`](PILOT_Setup.md), Schritt für Schritt, ohne Entwicklerwissen.

## Ordnerstruktur

| Ordner / Datei | Inhalt |
|---|---|
| `frontend/index.html`, `frontend/assets/` | Die Oberfläche (eine Datei) und ein Platzhalter-Logo |
| `config/mandant.example.json`, `config/mandant.js` | Konfiguration je Kunde (Firma, Farben, Adressen, Register-Schalter, Social-Kanäle). Die `.js` ist das, was die Seite lädt |
| `supabase/*.sql`, `supabase/README.md` | Datenbankpaket: Pflichtmigrationen `001`–`003`, Optionen `100`–`150`, Musterdaten `900`, erster Admin `910`, Export `990`, Löschung `999` |
| `n8n/*.workflow.json`, `n8n/einsetzen.mjs`, `n8n/README.md`, `n8n/PRUEFUNG.md` | Die Portal-API und drei Begleit-Workflows für n8n Cloud, das Skript, das die Platzhalter einsetzt, Anleitung und Prüfbericht |
| `n8n/optional/feedback-lesen.workflow.json` | Vorlage „PILOT: Feedback lesen (intern, Claude)“: manueller Trigger, kein Webhook; liest Vorschläge, Kommentare und Störungsnotizen und baut eine Liste mit Rollen statt Namen. Nur von Hand oder per n8n-Connector (MCP) ausführbar |
| `agent/feedback.mjs` | Werkzeug der Feedbackschleife: liest die Rückmeldungen über die Portal-API und antwortet als Mitglied „Claude (KI)“ (Vorschläge beantworten, kommentieren, „Was sich geändert hat“ fortschreiben). Zugang nur über `PILOT_PORTAL_API` und `PILOT_AGENT_TOKEN` |
| `dev/server.mjs` | Testserver: liefert die Oberfläche aus und führt den **echten** Code der Portal-API aus, wahlweise mit Daten im Speicher oder gegen einen lokalen PostgreSQL |
| `dev/n8n-laufzeit.mjs`, `dev/postgrest.mjs`, `dev/portal-api.mjs`, `dev/postgres.mjs`, `dev/testdaten.mjs` | Die Teile des Testservers: n8n-Nachbildung, PostgREST-Nachbildung (Speicher und Postgres), Adapter, Datenbank-Aufbau, Musterdaten |
| `dev/screenshots/` | Screenshots aus dem Browsertest (Desktop 1280 px, Mobil 375 px; mit Vorsilbe `postgres-` aus der Postgres-Betriebsart) |
| `test/*.test.mjs` | Alle Tests (siehe unten) |
| `PILOT_Setup.md` | Setup-Anleitung für den Pilotkunden |

## Schnellstart: Testserver

Der Testserver braucht nur Node (ab Version 18), keine npm-Installation und kein n8n. Er bildet n8n nicht nach, sondern führt die
Code-Knoten aus `n8n/portal-api.workflow.json` wirklich aus (siehe „Eine Wahrheit“ unten). Die Daten kommen aus einer von zwei Quellen:

**(a) Speicher**, schnell, ohne Datenbank. Die Musterdaten der „Musterfirma GmbH“ (5 Mitglieder, davon der KI-Agent „Claude (KI)“,
4 Projekte, 12 Aufgaben, 4 Notizen, 2 Vorschläge, 1 Papierkorb-Eintrag) stehen in `dev/testdaten.mjs` und sind dieselben wie in
`supabase/900_seed_musterfirma.sql`.

```bash
node portal-pilot/dev/server.mjs
```

**(b) Postgres**, der eigentliche Ende-zu-Ende-Test: ein lokaler PostgreSQL (Version 14 oder neuer, `psql` im Pfad, Benutzer darf
Datenbanken anlegen). `--neu` legt die Datenbank neu an und spielt die Migrationen `001`, `002`, `003`, `900` sowie die Optionen `100`
und `120` ein (damit die Modul-Schalter eine Tabelle vorfinden), dazu die Beispielzeilen für Arbeitszeit, Social und Systeme aus
`dev/testdaten.mjs`.

```bash
node portal-pilot/dev/server.mjs --postgres pilot_dev --neu
```

Danach steht in der Ausgabe je Person ein Link, zum Beispiel `http://127.0.0.1:8790/frontend/#z=…` für den Admin „Anna Muster“.
Die Codes gelten nur für diesen Testserver (im Speicher fest, in Postgres bei jedem `--neu` neu erzeugt). Im Speicher ist nach
einem Neustart alles wieder wie am Anfang; in Postgres bleibt es, bis du `--neu` angibst.

Der Testserver ändert `config/mandant.js` nicht. Er liefert unter `/config/mandant.js` eine eigene Test-Konfiguration aus: die
Vorlage `mandant.example.json`, nur mit `n8n_basis_url` und `portal_url` auf sich selbst. Weitere Register schaltest du für den
Test so ein (das setzt beide Schalter: Register in der Konfiguration und Modul auf dem Server):

```bash
node portal-pilot/dev/server.mjs --an social,arbeitszeit,systeme,tresor
```

Weitere Schalter: `--port 8790`, `--host 127.0.0.1`, `--kuerzel PILOTKUERZEL`, `--still`.

Der Testserver beantwortet nur `POST /webhook/PILOTKUERZEL/portal-api`. Jeden anderen Aufruf unter `/webhook/` zählt er mit
und antwortet mit 404. So prüfen die Tests, dass ausgeschaltete Register wirklich nichts aufrufen. Für Tests gibt es außerdem
`GET /api/test/zustand` (Betriebsart, Codes, Zähler, Tabellen), `POST /api/test/reset` und `POST /api/test/einstellung`
(`team_einstellung_setzen`, zum Beispiel um ein Modul einzuschalten).

## Eine Wahrheit: der Testserver führt den echten API-Code aus

Bis zum Zusammenführen hatte der Testserver eine eigene Nachbildung der Portal-API. Die ist weg. Jetzt gilt:

1. `dev/n8n-laufzeit.mjs` lädt `n8n/portal-api.workflow.json`, übersetzt die Code-Knoten („Anfrage prüfen“, „Social-Felder ergänzen“,
   „Antwort bauen“, „Schreibaufträge“, „Ergebnis prüfen“) genau wie n8n (`AsyncFunction`) und läuft den Knoten entlang der
   Verbindungen: Webhook → Daten laden → Einstellungen laden → Anfrage prüfen → Weiche → Antwort bauen oder Schreibschleife →
   Ergebnis prüfen → Gespeichert / Speicherfehler. Nachgebildet sind nur die n8n-Helfer, die der Workflow benutzt: `$('Knoten').first()`
   / `.all()`, `$input`, `$json` in Ausdrücken, Weiche, Wenn, Schleife, Antwortknoten, `alwaysOutputData`, `executeOnce`. Dieselbe
   Laufzeit führt in den Tests auch die Vorlage `n8n/optional/feedback-lesen.workflow.json` aus (manueller Trigger statt Webhook,
   `ausfuehren(…, { ohneAntwort: true })` liefert die Ausgabe des letzten Knotens).
2. `dev/postgrest.mjs` nimmt die HTTP-Aufrufe der Knoten „Team-Daten laden“, „Einstellungen laden“ und „In Supabase schreiben“ entgegen
   und beantwortet sie wie PostgREST: im Speicher (Betriebsart a) oder als SQL über `psql` (Betriebsart b). Antworten und Fehlercodes
   folgen PostgREST (`201`/`204` bei `Prefer: return=minimal`, `{ code, message }` bei Fehlern, `404 PGRST205` bei fehlender Tabelle).

Was der Code an Supabase schickt (aus dem Code herausgelesen, vollständige Liste):

| Methode | Pfad | Wer | Body |
|---|---|---|---|
| POST | `rpc/team_laden_plus` | Knoten „Team-Daten laden“, jede Anfrage | `{}` |
| GET | `team_einstellungen?select=schluessel,wert` | Knoten „Einstellungen laden“, jede Anfrage | – |
| GET | `<tabelle>?select=…&<spalte>=<op>.<wert>&or=(…)&order=…&limit=…` | nur Begleit-Workflows („Feedback lesen“, Fehler-Workflow); Operatoren eq, neq, gt, gte, lt, lte, in, like, ilike | – |
| POST | `<tabelle>` | neue Zeile (`neu`), `Prefer: return=minimal` | die Zeile |
| PATCH | `<tabelle>?<pk>=eq.<id>` | Änderung (`aend`) | die geänderten Felder |
| PATCH | `<tabelle>?<pk>=in.(<id>,…)` | mehrere Zeilen (`aendViele`, nur Arbeitszeit) | die geänderten Felder |
| DELETE | `<tabelle>?<pk>=eq.<id>` | endgültig löschen (`weg`: Projekte, Monatsabschlüsse) | `{}` |
| POST | `rpc/team_loeschen` | Papierkorb | `{ p_art, p_id, p_von }` |
| POST | `rpc/team_wiederherstellen` | Papierkorb | `{ p_eintrag }` |
| POST | `rpc/team_tn_haken` | nur Modul `kurs` | `{ p_tn, p_spalte, p_wert, p_datum, p_von }` |

Tabellen: `team_mitglieder`, `team_aufgaben`, `team_aufgaben_verlauf`, `team_projekte`, `team_notizen`, `team_vorschlaege` (Stufe 1);
`team_zeiten`, `team_abrechnung`, `team_social`, `team_systeme`, `team_teilnehmer`, `team_tn_spalten`, `kurs_community` (Optionen).

## Module an- und ausschalten

Ein Zusatz-Register (Arbeitszeit, Social Media, Systeme, Kurs & Teilnehmer) hat **zwei Schalter**, die beide an sein müssen:

| Schalter | Wo | Wirkung | Beispiel |
|---|---|---|---|
| `register` | `config/mandant.js` (Oberfläche) | Ob das Register im Menü erscheint und seine Daten anzeigt | `"arbeitszeit": true` |
| `module` | Tabelle `team_einstellungen` (Server) | Ob die Portal-API die Aktionen des Moduls erlaubt und die Daten mitliefert | `select team_einstellung_setzen('module', '{"zeit": true}');` |

Zuordnung: `arbeitszeit` ↔ `zeit`, `social` ↔ `social`, `systeme` ↔ `system`, `kurs` ↔ `kurs`. Die Oberfläche zeigt ein Register nur,
wenn ihr Schalter **und** das Modul an sind (sie liest `einstellungen.module` aus der Antwort von `laden`). Antwortet der Server
trotzdem einmal mit „Modul nicht aktiviert“ (403), blendet die Oberfläche das Register aus und zeigt einen Hinweis in der Übersicht.
Für Arbeitszeit und Social Media muss außerdem die passende Option (`100`, `120`) in der Datenbank eingespielt sein; fehlt die Tabelle,
meldet der Server „Dafür fehlt in der Datenbank noch etwas“.

Register, die kein Server-Modul brauchen: Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team (Stufe 1), außerdem Tresor
(läuft nur im Browser). Vertrieb, WhatsApp und KI Office brauchen je einen eigenen n8n-Workflow, der nicht Teil des Pilots ist.

Im Pilot-Standard sind alle Module aus und nur die sechs Register der Stufe 1 an.

## Oberfläche

### Was in der Konfiguration steht

Die Oberfläche liest alles, was je Kunde anders ist, aus `config/mandant.js`. Die Datei setzt `window.MANDANT` und
hat genau dieselben Felder wie die Vorlage `config/mandant.example.json`:

| Feld | Bedeutung |
|---|---|
| `firma` | Voller Firmenname, erscheint im Fenstertitel, auf der Anmeldeseite und auf PDF-Nachweisen. Liefert der Server in `team_einstellungen` einen Wert (`firma`), gilt der. |
| `kurzname` | Kurzform für Texte wie „Das läuft gerade bei …“. Ersatz, wenn kein Logo geladen werden kann. Server-Wert `kurzname` hat Vorrang. |
| `logo` | Pfad zum Logo, relativ zu `frontend/` (Vorgabe `assets/logo.svg`, ein neutraler Platzhalter). Leer lassen, dann steht der Kurzname als Text da. |
| `farben.primaer`, `farben.akzent` | Zwei Farben als `#rrggbb`. Alles andere (helle Töne, Balken, Knöpfe) leitet sich daraus ab. |
| `n8n_basis_url` | Basis-Adresse der n8n-Instanz des Kunden bis einschließlich Pilotkürzel, ohne Schrägstrich am Ende. Daraus entstehen alle Webhook-Adressen: `…/portal-api` (Pflicht), `…/team-vertrieb`, `…/team-inbox`, `…/office-api` (nur bei eingeschaltetem Register). |
| `portal_url` | Adresse, unter der das Portal für das Team erreichbar ist, mit Schrägstrich am Ende. Daraus baut „Link kopieren“ die persönlichen Zugangslinks. |
| `register` | Sechzehn Schalter (`true`/`false`). Ein ausgeschaltetes Register erscheint nirgends, auch nicht in der Übersicht, und löst keinen Aufruf an seine Schnittstelle aus. |
| `social_kanaele` | Liste der Kanäle im Social-Register (nur Option Social Media). Leer: der Kanal ist ein freies Textfeld. Die Server-Liste `social_kanaele` in `team_einstellungen` gilt, wenn die Konfiguration leer ist. |
| `anleitung_video` | Leer, oder die Einbettungs-Adresse (https) eines Erklärvideos. Nur dann erscheint das Video in der Übersicht. |
| `standard_projekt` | Name des Projekts, das bei neuen Aufgaben vorbelegt ist. Leer, dann das erste Projekt der Liste. |
| `sprache` | Zurzeit nur `de`. |

Warum eine `.js`- und keine `.json`-Datei: Öffnet jemand die Seite direkt von der Festplatte (`file://`), darf der Browser keine
JSON-Datei nachladen, ein Skript aber schon. In `mandant.js` stehen nur Adressen und Anzeigewerte, nie Zugangsdaten.

### Was die Oberfläche vom Server übernimmt

Die Antwort von `laden` enthält das Feld `einstellungen` (aus `team_einstellungen`). Die Oberfläche nutzt daraus:

- `firma`, `kurzname`: haben Vorrang vor `mandant.js`, wenn gesetzt.
- `module`: Register nur anzeigen, wenn Konfig-Schalter und Modul an sind (siehe oben).
- `rollen`: die Rollen im Dialog „Mitglied verwalten“ (Objekte mit `rolle` und `titel`); `admin` und `team` sind immer dabei, `agent`
  wird nie über diese Liste vergeben.
- `vorschlag_bereiche`: die Auswahl „Bereich“ bei Vorschlägen. Fehlt die Liste, nimmt die Oberfläche die Namen der sichtbaren Register
  plus „Sonstiges“, und der Server akzeptiert freien Text.
- `social_kanaele`: Kanalliste, wenn `mandant.js` keine hat.

### Verhalten bei Fehlern der Schnittstelle

- **401** (Zugang ungültig, gesperrt, neuer Link): die Oberfläche meldet sich bei jeder Aktion sofort ab, löscht den gemerkten Code
  und zeigt die Anmeldeseite mit der Meldung.
- **403 mit `modul_nicht_aktiviert`**: das Register verschwindet, in der Übersicht steht ein Hinweis statt eines Toasts.
- **409** (Konflikt beim gleichzeitigen Bearbeiten): der Dialog zeigt, wer inzwischen gespeichert hat, und bietet „trotzdem speichern“.

### Hintergrund-Reload

Die Oberfläche lädt alle **10 Minuten** neu, nur wenn der Tab sichtbar ist, kein Dialog offen ist und niemand tippt. Kommt jemand
nach mehr als 5 Minuten Pause zurück (Tab wieder sichtbar oder Fenster im Fokus), lädt sie sofort. Grund: jede Anfrage ist eine
Ausführung in n8n Cloud und lädt die ganze Datenbank; die Rechnung dazu steht in `PILOT_Setup.md`, Abschnitt 7.

### Was gegenüber dem bestehenden Portal anders ist

- Alle festen Angaben (Firmen- und Personennamen, Adressen, Video, CRM-Adresse, Pipeline-Stufen, WhatsApp-Nummer, E-Mail-Adresse,
  Webseiten, Standardprojekt, Repo-Link, Kanalliste) sind entfernt oder kommen aus der Konfiguration beziehungsweise vom Server.
  Personennamen in Hilfetexten sind zu Rollen geworden („die Leitung“, „ein Admin“, „dein Team“).
- Anmeldung: Der persönliche Link trägt den Code im Fragment (`#z=…`). Das Fragment schickt der Browser nie an den Server und
  nie als Referer, es landet also nicht in Server-Protokollen. Alte Links mit `?z=…` werden noch angenommen, der Code wird aber
  sofort übernommen und aus der Adresse entfernt. Dazu `<meta name="referrer" content="no-referrer">`. „Link kopieren“ im Register
  Team baut Links aus `portal_url` + `#z=` + Code. Abmelden gibt es weiterhin. Zugangscodes haben 48 Hex-Zeichen (Datenbank und API).
- Nicht übernommen, weil an unseren Betrieb gebunden: der Chat-Assistent, das Diktat, der Video-Upload mit Medien-Cutter, die
  Ideen-Sammlung im Social-Register, das eingebettete virtuelle Büro, die automatische WhatsApp bei Zuweisung. Das Register
  „KI Office“ zeigt nur noch Kennzahlen der Office-API und verweist auf eine eigene Office-Seite, falls sie der Kunde später bekommt.
- Eine Rollenbezeichnung ist neutraler: die Rolle `dozent` heißt in der Oberfläche standardmäßig „Fachleitung / Technik“ (der Server
  liefert in `rollen` den Titel „Fachlich“, der dann gilt). Die Rollen-Schlüssel selbst (`admin`, `dozent`, `vertrieb`, `team`, `agent`)
  sind unverändert, damit Datenbank und n8n-Workflow passen.
- Auf dem Handy zeigt die Register-Leiste rechts einen Pfeil, solange sie weiter scrollt; das aktive Register wird ins Bild geholt.
- Ein Admin ohne eigene offene Aufgaben sieht beim ersten Öffnen der Aufgaben „Alle Personen · Alles Offene“ statt einer leeren Liste.

## Tests

```bash
node --test portal-pilot/test/*.test.mjs
```

(Node 22 nimmt keinen Ordnernamen, darum das Muster mit `*.test.mjs`. Alle Tests zusammen brauchen rund drei Minuten.) Für die
Feedbackschleife in der Cloud: `pg_ctlcluster 16 main start` startet den vorinstallierten PostgreSQL, Playwright ist dort vorhanden.

| Datei | Prüft | Braucht |
|---|---|---|
| `test/pii.test.mjs` | Scan über ganz `portal-pilot/` (Wortliste aus dem Auftrag, Zahlen ab 9 Stellen, `eyJ`, `sk-`, Ländervorwahl außerhalb von Kommentaren; `n8n/PRUEFUNG.md` darf die Wörter als erklärenden Text enthalten; der Anbietername ist nur in der vereinbarten Unterschrift „… von <Anbieter>“ erlaubt). Dazu: `index.html` ohne feste Adressen, Workflows (auch `n8n/optional/`) ohne Projekt-IDs, Credential-IDs, Chat-IDs, `require`, `$env`; Ausführungsdaten aus. | – |
| `test/konfig.test.mjs` | `mandant.example.json` und `mandant.js`: genau die vereinbarten Schlüssel, Register boolesch, Adressen richtig, `social_kanaele` eine Liste kurzer Texte, beide Dateien inhaltsgleich. | – |
| `test/server.test.mjs` | Testserver (Speicher) mit dem echten API-Code: Login (401), unbekannte Aktion (400), fremder Webhook (404), Laden je Rolle (Admin sieht 48-stellige Codes), Aufgaben (zwei anlegen, Admin erledigt, `geaendert_von`, Konflikt 409), Rollen (403), Module aus (403 `modul_nicht_aktiviert`), Projekte (Link-400, doppelter Name), Papierkorb (zählen, wiederherstellen samt Verlauf), Notizen (Versionen, Konflikt), Vorschläge (Liste aus Einstellung, freier Text), Team (zwei Mitglieder, Rollen aus Einstellung, Einrichtung, neuer Link, Sperren), KI-Agent, Feedbackschleife (Agent „Claude (KI)“ liest Vorschläge ohne Codes und Stimmenliste, beantwortet zwei mit Status und Antwort, 403 bei Löschen, „umgesetzt“ und Mitgliederverwaltung, „Erledigt“ wird „Wird getestet“, zwei Kommentare, zweimal an „Was sich geändert hat“ anhängen mit 409 bei altem Stand; `agent/feedback.mjs` als Prozess: lesen ohne Namen, antworten, kommentar, aenderungen mit Unterschrift, Abbruch ohne Zugang oder als Mensch), Module einschalten mit Arbeitszeit bis Monatsabschluss, Social, Systeme, Reset. Immer zwei Datensätze je Fall. | – |
| `test/feedback.test.mjs` | Vorlage `n8n/optional/feedback-lesen.workflow.json`: Struktur (manueller Trigger, nur GET, Credential nur per Name, Settings, nur der Supabase-Platzhalter, keine Namen), Code-Knoten per `node --check`, `einsetzen.mjs` schreibt sie nach `optional/` ohne Platzhalter-Reste, echter Lauf des Workflow-Codes gegen die Speicher-Nachbildung (Zählung, Zeitfenster 7 und 14 Tage, Rollen statt Namen), Auswertung „lesen“ des Werkzeugs als reine Funktion. | – |
| `test/ende-zu-ende.test.mjs` | Dasselbe Drehbuch gegen einen lokalen PostgreSQL (Betriebsart b): Seed-Token, laden, Aufgabe als Team-Mitglied, Kommentar, Admin erledigt, 409, Notiz mit Versionen (Trigger), Vorschlag mit Stimmen (`text[]`), Papierkorb mit `team_loeschen`/`team_wiederherstellen`, Mitglied anlegen (48 Hex) und einloggen, 403, Modul aus → 403, Modul an per `team_einstellung_setzen` → Zeiten in `team_zeiten`; Feedbackschleife mit dem Agenten aus dem Seed (Antworten in `team_vorschlaege`, Berichte in `team_aufgaben_verlauf`, zwei Fassungen von „Was sich geändert hat“ per Trigger, `feedback.mjs` als Prozess) und die Vorlage „Feedback lesen“ mit echtem SQL (`or`, `gt`, `like`). Nach jedem Schritt wird per `psql` in der Tabelle nachgesehen. | Postgres, sonst übersprungen |
| `test/supabase.test.mjs` | Datenbankpaket allein: Migrationen zweimal, Seed, Optionen, Rechte (RLS, Rollen), 910, 990, 999, Dateiprüfungen. | Postgres, sonst nur Dateiprüfungen |
| `test/browser.test.mjs` | Browser (Desktop 1280 px und Mobil 375 px) in **beiden Betriebsarten**: Login über `#z=` und `?z=`, Abmelden, Anmelden per Code, Scroll-Hinweis der Register-Leiste, nur eingeschaltete Register, keine fremden Webhooks, Aufgabe anlegen (Team) und erledigen (Admin), Board, Papierkorb, Admin-Startfilter, Notiz-Versionen und Wiki-Link, Vorschlag (Bereiche vom Server), Projekt-Dialog, Rollen vom Server, Zugangslink, Zusatz-Register, Kanal als freies Feld, Firma vom Server, 401 → abgemeldet, Modul aus → Register weg mit Hinweis, übrige Register ohne Skriptfehler, Reload-Einstellungen im Quelltext, Konsole ohne Fehler. Screenshots nach `dev/screenshots/`. | Playwright oder `puppeteer-core` + Chromium (sonst übersprungen); Postgres für den Postgres-Lauf |

Für `puppeteer-core` den Pfad zum Chrome in `CHROME_PFAD` setzen. Postgres: Verbindung über `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`
oder den lokalen Socket; `psql -d postgres` muss funktionieren. Testdatenbanken: `pilot_test`, `pilot_e2e`, `pilot_browser`,
`pilot_browser2` (werden bei jedem Lauf neu angelegt). Keine npm-Abhängigkeiten im Repo; Playwright nur lokal.

## Stand (03.11.2026)

- Drei Stränge zusammengeführt (Oberfläche, Datenbankpaket, n8n-Workflows), Schnittstellen abgeglichen: Bereiche und Kanäle als
  Listen in `team_einstellungen` oder freier Text, Rollen mit Titel, `geaendert_von` bei Aufgaben, 48-stellige Codes, `#z=`-Links überall,
  Labels im Seed aus der Liste der API, Register an Module gekoppelt, 401/403-Verhalten der Oberfläche, Reload alle 10 Minuten.
- Alle Tests grün (72 Tests, darunter Ende-zu-Ende gegen PostgreSQL 16 und Browsertests in beiden Betriebsarten), PII-Scan leer.
- Setup-Anleitung `PILOT_Setup.md` geschrieben.
- **Nacharbeiten 03.11. nach dem Abschluss-Review:** `crypto` im Code-Knoten „Anfrage prüfen“ ist jetzt Pflicht (kein Rückfall auf
  `Math.random()` mehr; fehlt `crypto`, bricht die Aktion mit einem klaren Fehler ab, statt schwache Codes zu erzeugen). In
  `PILOT_Setup.md` neu: Zwei-Faktor-Pflicht für unsere Konten, Datenstandort und Zugriffskreis der n8n-Instanz, „Grenzen des Pilots“,
  „Änderungen und Support während des Pilots“, Hinweise zu Terminal, Credential-Auswahl, GitHub-Pages-Herkunft und n8n-Usage in Woche 1.
  `portal-pilot/.gitignore` nimmt den Ausgabeordner `fertig/` von `einsetzen.mjs` aus.
- **Feedbackschleife (03.11., zweiter Teil):** Rückmeldungen der Tester (Vorschläge, Kommentare, Störungsnotizen) werden mit dem
  KI-Werkzeug Claude gelesen und im Portal als Mitglied „Claude (KI)“ (Rolle `agent`) beantwortet. Neu: Vorlage
  `n8n/optional/feedback-lesen.workflow.json` (manueller Trigger, nur per n8n-Oberfläche oder MCP), Werkzeug `agent/feedback.mjs`
  (`lesen`, `antworten`, `kommentar`, `aenderungen`; Zugang nur über Umgebungsvariablen), Agent-Mitglied, Projekt „Pilot-Verbesserungen“
  und Notiz „Was sich geändert hat“ im Seed und als optionaler Block in `910_erster_admin.sql`, Vorschlagsstatus `nachfrage`. In der
  Portal-API darf ein Agent fremde Vorschläge beantworten (Status `nachfrage`/`geplant`/`abgelehnt` und Antwort, nie `umgesetzt`, nie
  löschen; `n8n/PRUEFUNG.md`, Abschnitt 9) und bekommt bei `laden` die Vorschläge (nur die Zahl der Stimmen) und die Einstellung
  `firmenwissen_projekt`. `einsetzen.mjs` schreibt die Vorlagen aus `n8n/optional/` mit. Die PostgREST-Nachbildung des Testservers
  versteht jetzt `or`, `gt`, `like`, `order` und `limit`, die n8n-Laufzeit manuelle Trigger. Anleitung in `PILOT_Setup.md`, Abschnitt 8.
  Tests: 83 (alle grün in der Cloud mit PostgreSQL 16 und Playwright), PII-Scan leer.

## Offene Punkte

- **Nicht verifiziert:** echter Import in n8n Cloud (Credential-Verweis nur über den Namen, `crypto` im Code-Knoten, seit 03.11.
  ohne Rückfall: ohne `crypto` schlägt jede Aktion fehl, die neue IDs oder Zugangscodes erzeugt; Verhalten bei
  `text/plain`-Bodies), echtes Supabase-Projekt (Rechte des Service-Schlüssels auf `team_einstellungen`, `rpc/team_laden_plus`),
  CORS mit der echten Herkunft, Safari und Firefox (getestet wurde Chromium). Der erste Praxistest nach `PILOT_Setup.md` deckt das ab.
  Ebenso nicht verifiziert: die Vorlage „Feedback lesen“ in echtem n8n Cloud (PostgREST-Filter `or=(…)` und `like.St*rung*` in der
  URL des HTTP-Knotens), der zweite n8n-Connector in der Claude-App (Scopes des API-Schlüssels) und das Werkzeug gegen die echte
  Portal-API.
- **Ausführungsbudget n8n Cloud:** welcher Tarif der Partner-Instanz zugrunde liegt, ist unbekannt; Rechnung in `PILOT_Setup.md`.
- **Zugangscodes per E-Mail:** Der Link mit `#z=` bleibt ein Geheimnis. Der Admin sollte ihn über einen sicheren Kanal weitergeben;
  ein Ablauf oder Einmal-Links sind nicht enthalten.
- **PDF-Export** der Arbeitszeit lädt jsPDF von cdnjs nach (nur Option Arbeitszeit). Will der Kunde keine fremden Skripte, die Datei
  lokal ablegen.
- **Register Kurs & Teilnehmer, Skills, Webseite** sind nur Platzhalter.
- **Logo:** `assets/logo.svg` ist ein Platzhalter und wird je Kunde ersetzt.
