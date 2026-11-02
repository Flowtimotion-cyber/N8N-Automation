# Pilot-Portal: konfigurierbare Kopie des Team-Portals

Hier liegt die Fassung des Team-Portals, die ein Pilotkunde bekommt: dieselbe Oberfläche, aber ohne unsere eigenen Angaben
und je Kunde über eine Konfigurationsdatei einstellbar. Das bestehende Portal unter `docs/team/` bleibt unverändert.

Drei Stränge, drei Ordner:

| Ordner | Inhalt | Stand |
|---|---|---|
| `frontend/`, `config/`, `dev/`, `test/` | Oberfläche, Konfiguration, Testserver, Tests (dieser Abschnitt) | fertig für den Pilot |
| `supabase/` | Datenbank-Migrationen und Musterdaten | eigener Strang |
| `n8n/` | Portal-API als n8n-Workflow (Export und Bereinigung) | eigener Strang |

## Oberfläche

### Was in der Konfiguration steht

Die Oberfläche liest alles, was je Kunde anders ist, aus `config/mandant.js`. Die Datei setzt `window.MANDANT` und
hat genau dieselben Felder wie die Vorlage `config/mandant.example.json`:

| Feld | Bedeutung |
|---|---|
| `firma` | Voller Firmenname, erscheint im Fenstertitel, auf der Anmeldeseite und auf PDF-Nachweisen. |
| `kurzname` | Kurzform für Texte wie „Das läuft gerade bei …“. Ersatz, wenn kein Logo geladen werden kann. |
| `logo` | Pfad zum Logo, relativ zu `frontend/` (Vorgabe `assets/logo.svg`, ein neutraler Platzhalter). Leer lassen, dann steht der Kurzname als Text da. |
| `farben.primaer`, `farben.akzent` | Zwei Farben als `#rrggbb`. Alles andere (helle Töne, Balken, Knöpfe) leitet sich daraus ab. |
| `n8n_basis_url` | Basis-Adresse der n8n-Instanz des Kunden bis einschließlich Pilotkürzel, ohne Schrägstrich am Ende. Daraus entstehen alle Webhook-Adressen: `…/portal-api` (Pflicht), `…/team-vertrieb`, `…/team-inbox`, `…/office-api` (nur bei eingeschaltetem Register). |
| `portal_url` | Adresse, unter der das Portal für das Team erreichbar ist, mit Schrägstrich am Ende. Daraus baut „Link kopieren“ die persönlichen Zugangslinks. |
| `register` | Sechzehn Schalter (`true`/`false`). Ein ausgeschaltetes Register erscheint nirgends, auch nicht in der Übersicht, und löst keinen Aufruf an seine Schnittstelle aus. |
| `anleitung_video` | Leer, oder die Einbettungs-Adresse (https) eines Erklärvideos. Nur dann erscheint das Video in der Übersicht. |
| `standard_projekt` | Name des Projekts, das bei neuen Aufgaben vorbelegt ist. Leer, dann das erste Projekt der Liste. |
| `sprache` | Zurzeit nur `de`. |

Warum eine `.js`- und keine `.json`-Datei: Öffnet jemand die Seite direkt von der Festplatte (`file://`), darf der Browser keine
JSON-Datei nachladen, ein Skript aber schon. In `mandant.js` stehen nur Adressen und Anzeigewerte, nie Zugangsdaten.

Register im Pilot (Vorgabe in der Vorlage):

- **an**: Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team.
- **aus, aber fertig und einschaltbar**: Arbeitszeit, Social Media (Beitragsplan), Systeme, Tresor, Vertrieb, WhatsApp, KI Office.
  Vertrieb, WhatsApp und KI Office brauchen je einen eigenen n8n-Workflow hinter der Basis-Adresse; fehlt er, zeigt das Register
  einen Hinweis statt Daten.
- **aus, nur Platzhalter**: Kurs & Teilnehmer, Skills, Webseite. Diese Register waren zu stark auf unseren Betrieb zugeschnitten
  (Klassenbuch, Kursplattform, Skills-Export aus dem Repo, Webseiten-Statistik). Schaltet man sie ein, erscheint eine Seite mit dem
  Hinweis „im Pilot noch nicht enthalten“.

### Was gegenüber dem bestehenden Portal anders ist

- Alle festen Angaben (Firmen- und Personennamen, Adressen, Video, CRM-Adresse, Pipeline-Stufen, WhatsApp-Nummer, E-Mail-Adresse,
  Webseiten, Standardprojekt, Repo-Link) sind entfernt oder kommen aus der Konfiguration. Personennamen in Hilfetexten sind zu Rollen
  geworden („die Leitung“, „ein Admin“, „dein Team“).
- Anmeldung: Der persönliche Link trägt den Code im Fragment (`#z=…`). Das Fragment schickt der Browser nie an den Server und
  nie als Referer, es landet also nicht in Server-Protokollen. Alte Links mit `?z=…` werden noch angenommen, der Code wird aber
  sofort übernommen und aus der Adresse entfernt. Dazu `<meta name="referrer" content="no-referrer">`. „Link kopieren“ im Register
  Team baut Links aus `portal_url` + `#z=` + Code. Abmelden gibt es weiterhin.
- Nicht übernommen, weil an unseren Betrieb gebunden: der Chat-Assistent, das Diktat, der Video-Upload mit Medien-Cutter, die
  Ideen-Sammlung im Social-Register, das eingebettete virtuelle Büro, die automatische WhatsApp bei Zuweisung. Das Register
  „KI Office“ zeigt nur noch Kennzahlen der Office-API und verweist auf eine eigene Office-Seite, falls sie der Kunde später bekommt.
- Eine Rollenbezeichnung ist neutraler: die Rolle `dozent` heißt in der Oberfläche „Fachleitung / Technik“. Die Rollen-Schlüssel
  selbst (`admin`, `dozent`, `vertrieb`, `team`, `agent`) sind unverändert, damit Datenbank und n8n-Workflow passen.
- Social-Kanäle: In der Kanalliste fehlt bewusst ein großer Bildkanal, weil die Prüfregel für diese Kopie den Namen ausschließt.
  Der Kunde kann die Liste `KANAELE` in `frontend/index.html` um seine Kanäle ergänzen.

### Testserver starten

Der Testserver braucht nur Node (ab Version 18), keine Installation, keine Datenbank, kein n8n. Er liefert die Oberfläche aus und
bildet die Portal-API mit erfundenen Daten der „Musterfirma GmbH“ nach (4 Mitglieder, 3 Projekte, 13 Aufgaben, Notizen, Vorschläge,
Papierkorb, Notiz-Versionen, zwei Zeiteinträge, zwei Beiträge, zwei Systeme).

```bash
node portal-pilot/dev/server.mjs
```

Danach steht in der Ausgabe je Person ein Link, zum Beispiel `http://127.0.0.1:8790/frontend/#z=…` für den Admin „Anna Muster“.
Die Codes gelten nur für diesen Testserver. Alles, was du dort änderst, lebt nur im Speicher und ist nach einem Neustart wieder
wie am Anfang.

Der Testserver ändert `config/mandant.js` nicht. Er liefert unter `/config/mandant.js` eine eigene Test-Konfiguration aus: die
Vorlage `mandant.example.json`, nur mit `n8n_basis_url` und `portal_url` auf sich selbst. Weitere Register schaltest du für den
Test so ein:

```bash
node portal-pilot/dev/server.mjs --an social,arbeitszeit,systeme,tresor
```

Weitere Schalter: `--port 8790`, `--host 127.0.0.1`, `--kuerzel PILOTKUERZEL`.

Der Testserver beantwortet nur `POST /webhook/PILOTKUERZEL/portal-api`. Jeden anderen Aufruf unter `/webhook/` zählt er mit
und antwortet mit 404. So prüfen die Tests, dass ausgeschaltete Register wirklich nichts aufrufen.

Nachgebildete Aktionen mit Rollenprüfung (Code → Mitglied → Rolle) und demselben Antwortformat wie die echte Portal-API
(`{ ok: true, … }` oder `{ ok: false, fehler }` mit 400/401/403/404/409): `laden`, `profil`, `aufgabe_speichern`,
`aufgabe_loeschen`, `kommentar`, `projekt_speichern`, `projekt_loeschen`, `notiz_speichern`, `notiz_loeschen`, `notiz_versionen`,
`vorschlag_speichern`, `vorschlag_stimme`, `vorschlag_loeschen`, `mitglied_speichern`, `papierkorb`,
`papierkorb_wiederherstellen`, `zeit_speichern`, `zeit_loeschen`, `woche_einreichen`, `zeiten_pruefen`, `vertrag_speichern`,
`monat_abschliessen`, `monat_aufheben`, `social_speichern`, `social_loeschen`, `system_speichern`, `system_loeschen`.
Die Logik steht in `dev/portal-api.mjs`, die Daten in `dev/testdaten.mjs`.

### Tests

```bash
node --test portal-pilot/test/*.test.mjs
```

(Node 22 nimmt keinen Ordnernamen, darum das Muster mit `*.test.mjs`.)

| Datei | Prüft |
|---|---|
| `test/pii.test.mjs` | Scan über ganz `portal-pilot/`: keine Angaben unseres Betriebs, keine echten Namen, keine Zahlen ab 9 Stellen, keine Schlüssel (`eyJ…`, `sk-…`). Dazu: `index.html` lädt die Konfiguration, hat keine feste Webhook-Adresse, als externe Adressen nur jsPDF (PDF-Export) und `wa.me`. |
| `test/konfig.test.mjs` | `mandant.example.json` und `mandant.js` haben genau die vereinbarten Schlüssel, Register-Schalter sind boolesch, Adressen haben die richtige Form, beide Dateien sind inhaltsgleich. |
| `test/server.test.mjs` | Testserver: Login (401), unbekannte Aktion (400), fremder Webhook (404), Laden je Rolle, Aufgaben anlegen (zwei hintereinander) und als Admin erledigen, Konflikt bei gleichzeitigem Bearbeiten (409), Rollenverstöße (403), Projekte, Papierkorb mit Wiederherstellen, Notiz-Versionen, Vorschläge, Team-Verwaltung mit neuem Link, Arbeitszeit bis Monatsabschluss, Social und Systeme, Reset. |
| `test/browser.test.mjs` | Browser (Desktop 1280 px und Mobil 375 px): Login über `#z=` und `?z=`, Code verschwindet aus der Adresse; Abmelden; Anmelden per Code; nur eingeschaltete Register im Menü; jedes Register öffnet sich; kein waagerechtes Scrollen; keine Anfrage an fremde Webhooks; Aufgabe im Dialog anlegen (Team) und erledigen (Admin); Board; Papierkorb; Notiz-Versionen und Wiki-Link; Vorschlag unterstützen; Projekt-Dialog; Zugangslink mit `#z=`; Zusatz-Register; übrige Register ohne Skriptfehler; Konsole ohne Fehler. Screenshots nach `dev/screenshots/`. |

Der Browsertest braucht Playwright oder `puppeteer-core` mit einem Chromium. In der Cloud-Umgebung war Playwright vorhanden,
alle Browsertests liefen dort durch. Fehlt der Browser, werden diese Tests übersprungen und das steht in der Testausgabe.
Für `puppeteer-core` den Pfad zum Chrome in `CHROME_PFAD` setzen.

### Was geprüft wurde

- Alle Tests grün: PII-Scan, Konfig-Schema, Testserver, Browser (Desktop und Mobil).
- `grep -niE "…"` mit der Wortliste aus dem Auftrag über `frontend/index.html`: keine Fundstelle.
- Screenshots in `dev/screenshots/`: Anmeldung, Übersicht, Aufgaben (Liste und Board), Projekte, Notizen, Vorschläge, Team,
  Dialoge, Papierkorb, Notiz-Versionen, Arbeitszeit und Social (zusätzlich eingeschaltet), je Desktop und Mobil (375 px).
- Browser-Konsole ohne Fehler bei allen eingeschalteten Registern.

### Was offen ist

- **Echte Anbindung**: Die Oberfläche spricht mit `n8n_basis_url + '/portal-api'`. Ob der n8n-Workflow des Kunden (Strang `n8n/`)
  genau dieselben Aktionen, Felder und Fehlercodes liefert wie der Testserver, lässt sich erst mit dem Export prüfen. Die Nachbildung
  in `dev/portal-api.mjs` ist die Vorlage dafür.
- **CORS**: Der Webhook in der n8n-Instanz des Kunden muss die Herkunft aus `portal_url` erlauben. Der Browser schickt den Body als
  `text/plain`, damit kein Preflight nötig ist.
- **Kanalliste** im Social-Register siehe oben.
- **PDF-Export** der Arbeitszeit lädt jsPDF von cdnjs nach. Will der Kunde keine fremden Skripte, die Datei lokal ablegen.
- **Register Kurs & Teilnehmer, Skills, Webseite** sind nur Platzhalter.
- **Zugangscodes per E-Mail**: Der Link mit `#z=` ist besser als `?z=`, bleibt aber ein Geheimnis. Der Admin sollte ihn über einen
  sicheren Kanal weitergeben; ein Ablauf oder Einmal-Links sind Sache des n8n-Workflows.
- **Logo**: `assets/logo.svg` ist ein Platzhalter und wird je Kunde ersetzt.
