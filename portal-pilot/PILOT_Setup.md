# Pilot-Portal einrichten: Schritt für Schritt

Diese Anleitung bringt das Pilot-Portal für **einen** Kunden in Betrieb. Du brauchst dafür kein Entwicklerwissen, nur die drei
Konten unten, einen Texteditor und etwa zwei bis drei Stunden. Jeder Schritt sagt dir, was du danach siehst. Siehst du etwas anderes,
bleib bei dem Schritt stehen und lies den Hinweis dazu; geh nicht weiter.

Die drei Teile des Portals und ihre Reihenfolge:

1. **Datenbank** (Supabase): hier liegen die Daten des Kunden.
2. **Schnittstelle** (n8n Cloud): hier läuft die Portal-API, die zwischen Oberfläche und Datenbank vermittelt.
3. **Oberfläche** (eine HTML-Datei plus Konfiguration): das, was das Team im Browser sieht.

Grundregel für den ganzen Pilot: **Jeder Kunde bekommt ein eigenes Supabase-Projekt und ein eigenes n8n-Projekt.** Nichts davon teilt
sich mit einem anderen Kunden oder mit unserem eigenen Betrieb.

---

## 0. Was du brauchst

| Was | Wofür | Wo bekommst du es |
|---|---|---|
| Ein **Supabase-Konto** | Datenbank des Kunden | supabase.com, kostenlos anlegen; Pro-Plan für den Pilot empfohlen (siehe Schritt 1) |
| Zugang zur **n8n-Cloud-Instanz** | Portal-API | die Instanz aus der n8n-Partnerschaft; du brauchst Rechte, Workflows und Credentials anzulegen |
| Ein Ort für **statische Dateien** | Oberfläche | GitHub-Konto (GitHub Pages) oder Cloudflare-Konto (Cloudflare Pages); jeder andere Webspace mit https geht auch |
| **Node** ab Version 18 auf deinem Rechner | zwei kleine Skripte (`einsetzen.mjs` für die Workflows, optional der Testserver) | nodejs.org, LTS-Version; Prüfung im Terminal: `node --version` |
| Den Ordner `portal-pilot/` aus diesem Repo | alle Dateien | als ZIP herunterladen oder das Repo klonen |
| Vom Kunden: Firmenname, Kurzname, Logo (SVG oder PNG), zwei Farben, Name und E-Mail der ersten Admin-Person, das gewünschte Kürzel (z. B. `ifa`) | Konfiguration | per Mail erfragen |

**Zwei-Faktor-Anmeldung ist Pflicht** für unsere Konten bei Supabase, n8n und dem Hosting (GitHub oder Cloudflare), bevor der erste
Kundendatensatz fließt. Einschalten jeweils in den Konto-Einstellungen unter Sicherheit: Supabase „Account → Security“, n8n Cloud
„Settings → Personal → Two-factor authentication“, GitHub „Settings → Password and authentication“, Cloudflare „My Profile → Authentication“.
Die Wiederherstellungscodes in den Passwort-Manager.

Bevor du anfängst: Abschnitt 6 (Pflichthinweise) lesen. Zwei Dinge müssen **vor dem ersten echten Datensatz** erledigt sein: der
Auftragsverarbeitungsvertrag und die Datenschutzinformation für die Mitarbeitenden.

---

## 1. Supabase-Projekt anlegen

1. Auf supabase.com anmelden, oben „New project“ wählen.
2. Organisation: eine eigene Organisation für den Kunden anlegen (Name = Kundenname). So bleibt alles sauber getrennt und lässt
   sich am Ende als Ganzes löschen.
3. Projektname: `portal-<kürzel>` (z. B. `portal-ifa`).
4. **Region: EU (Frankfurt)** wählen. Das ist Pflicht (Datenschutz: Daten bleiben in der EU).
5. Datenbank-Passwort: eines erzeugen lassen und im Passwort-Manager ablegen. Du brauchst es im Alltag nicht.
6. **Plan: Pro** wird empfohlen. Der kostenlose Plan pausiert das Projekt nach einer Woche ohne Zugriff und hat keine täglichen
   Backups; beides passt nicht zu einem Pilot mit echten Daten. Der Pro-Plan kostet laut Supabase-Preisliste etwa 25 US-Dollar im
   Monat je Organisation (Stand beim Schreiben; bitte auf der Preisseite nachsehen).
7. „Create new project“. Das Anlegen dauert ein bis zwei Minuten.

**Danach siehst du:** die Projektübersicht mit grünem Status „Active“ und links das Menü mit „Table Editor“, „SQL Editor“,
„Storage“, „Project Settings“.

8. Links unten **Project Settings → API** (in neueren Oberflächen: „Project Settings → Data API“ und „API Keys“) öffnen. Dort stehen:
   - die **Project URL** (`https://<projekt-id>.supabase.co`). Die Projekt-ID ist der Teil vor `.supabase.co`, 20 Kleinbuchstaben.
     Notiere sie, du brauchst sie in Schritt 3.
   - die Schlüssel. Du brauchst **nur den `service_role`-Schlüssel** (manchmal „Secret key“ genannt, beginnt mit `eyJ…` oder `sb_secret_…`).

**Wichtig:** Der `service_role`-Schlüssel darf **nur in n8n** hinterlegt werden (Schritt 3), sonst nirgends: nicht in einer Datei im
Repo, nicht in der Oberfläche, nicht in einem Chat, nicht in einer Mail. Wer ihn hat, kann alles in der Datenbank lesen und ändern.
Der `anon`-Schlüssel wird im Pilot gar nicht gebraucht.

**Danach siehst du:** die Projekt-ID in deinen Notizen und den Schlüssel noch gar nicht kopiert (du kopierst ihn erst in Schritt 3
direkt in n8n).

---

## 2. Datenbank einspielen

Die Dateien liegen in `portal-pilot/supabase/`. Die genaue Beschreibung jeder Datei steht in `supabase/README.md`; hier die kurze Form.

1. In Supabase links **SQL Editor** öffnen, „New query“.
2. Die Datei `001_basis.sql` in einem Texteditor öffnen, **alles** markieren und kopieren, in den SQL-Editor einfügen, **Run**.

   **Danach siehst du:** unten eine Tabelle mit 9 Zeilen, alle Namen beginnen mit `team_`. Steht dort ein roter Fehler, nicht
   weitermachen, sondern den Fehlertext kopieren und nachfragen.

3. Genauso `002_einstellungen.sql`.

   **Danach siehst du:** 10 Zeilen mit `schluessel` (unter anderem `firma`, `kurzname`, `module`, `rollen`, `vorschlag_bereiche`).

4. Genauso `003_team_laden.sql`.

   **Danach siehst du:** 23 Zeilen mit Schlüsselwörtern, darunter `mitglieder`, `projekte`, `aufgaben`, `papierkorb`.

5. Jetzt **eine** von zwei Dateien:
   - **Für den echten Kunden:** `910_erster_admin.sql`. Vorher in der Datei die zwei Platzhalter `HIER_NAME` und `HIER_MAIL` durch
     Name und Firmen-Mail der Admin-Person ersetzen (die einfachen Anführungszeichen stehen lassen). Dann einfügen und Run.
   - **Nur zum Zeigen und Testen:** `900_seed_musterfirma.sql` (erfundenes Team „Musterfirma GmbH“). Für den Kunden-Pilot nicht
     nehmen, sonst stehen Musterdaten im echten Portal.

   **Danach siehst du:** eine Zeile (910) beziehungsweise fünf Zeilen (900, darunter der KI-Agent „Claude (KI)“) mit Name, Rolle, Status
   und einem 48 Zeichen langen Zugangscode (`token`). Dieser Code ist der Zugang der Person. Kopiere ihn noch nicht irgendwohin; du liest
   ihn in Schritt 5 wieder aus. Das Agent-Mitglied für die Rückmeldungen der Tester legst du beim echten Kunden in Abschnitt 8a an.

6. Kontrollabfrage: neue Query, eingeben und Run:

   ```sql
   select jsonb_array_length(team_laden_plus() -> 'mitglieder') as mitglieder,
          jsonb_array_length(team_laden_plus() -> 'projekte')   as projekte,
          jsonb_array_length(team_laden_plus() -> 'aufgaben')   as aufgaben;
   ```

   **Danach siehst du:** `1 / 0 / 0` beim ersten Admin, `5 / 4 / 12` bei den Musterdaten.

7. Firma und Kurzname setzen (die doppelten Anführungszeichen innerhalb der einfachen sind nötig):

   ```sql
   select team_einstellung_setzen('firma',    '"Beispiel GmbH"');
   select team_einstellung_setzen('kurzname', '"Beispiel"');
   ```

   **Danach siehst du:** je Zeile eine Antwort mit `schluessel` und `wert`. Diese Werte zeigt das Portal später im Fenstertitel und in
   der Übersicht; sie haben Vorrang vor der Konfigurationsdatei.

8. Optional das Pilot-Ende eintragen, damit es in den Einstellungen steht: `select team_einstellung_setzen('pilot_ende', '"2027-02-28"');`

Die Optionen `100` bis `150` (Arbeitszeit, Teilnehmer, Social Media, Kommunikation, KI Office, Kurs) spielst du im Pilot **nicht** ein.
Sie bleiben aus; das Einschalten später beschreibt `README.md`, Abschnitt „Module an- und ausschalten“.

---

## 3. n8n Cloud: die Portal-API

### 3a. Importdateien erzeugen

Im Terminal, im Ordner des Repos (dort, wo der Ordner `portal-pilot/` liegt):

```bash
node portal-pilot/n8n/einsetzen.mjs --supabase DEINE-PROJEKT-ID --kuerzel ifa --origin https://portal.beispiel.de --ausgabe ../portal-fertig/ifa/
```

- `--supabase`: die Projekt-ID aus Schritt 1 (nur die ID, oder die ganze Adresse).
- `--kuerzel`: das Kürzel des Kunden, nur Kleinbuchstaben, Ziffern, Bindestrich. Es wird Teil der Webhook-Adresse.
- `--origin`: die Adresse, unter der die Oberfläche später liegt, **ohne Pfad** (bei Cloudflare Pages z. B. `https://portal-ifa.pages.dev`,
  bei GitHub Pages die Pages-Adresse des Kontos ohne den Repo-Pfad, oder die eigene Domain wie `https://portal.beispiel.de`). Nur von dieser Adresse aus darf der Browser die
  Schnittstelle aufrufen. Du legst sie hier schon fest, Schritt 4 muss dann dazu passen.
- `--ausgabe`: ein Ordner für die fertigen Dateien. Wähl ihn am besten **außerhalb des Repos** (im Beispiel `../portal-fertig/ifa/`,
  also eine Ebene über dem Repo-Ordner), denn er enthält die Supabase-Adresse des Kunden und darf **nie committet** werden. Legst du
  ihn doch ins Repo, dann als `portal-pilot/fertig/…`: dieser Ordner steht in `portal-pilot/.gitignore` und wird nicht mit eingecheckt.

**Danach siehst du:** fünf Zeilen `geschrieben: …/portal-fertig/ifa/…workflow.json` (vier Workflows und die Vorlage
`optional/feedback-lesen.workflow.json` für Abschnitt 8) und den Satz „Fertig. Webhook-Pfad der Portal-API: ifa/portal-api“.
Steht dort ein Fehler, ist meist die Projekt-ID oder die Adresse falsch geschrieben; die Meldung sagt, welche.

### 3b. Credential anlegen

1. In n8n links „Credentials“ (oder „Home → Credentials“) → „Create credential“ (manchmal „Add credential“).
2. Typ **Supabase API** suchen und wählen.
3. Name genau: `Supabase (Pilot)` (so heißt es in den Workflows; ein anderer Name wird nicht zugeordnet).
4. **Host**: `https://DEINE-PROJEKT-ID.supabase.co`. **Service Role Secret**: jetzt in Supabase (Project Settings → API) den
   `service_role`-Schlüssel kopieren und hier einfügen. Speichern.

**Danach siehst du:** das Credential in der Liste, oft mit grünem Haken „Connection tested successfully“. Zeigt n8n Rot, ist Host oder
Schlüssel falsch (häufig: der `anon`-Schlüssel statt `service_role`).

Wenn die Instanz ein Projekt je Kunde erlaubt: Credential und Workflows in ein **eigenes n8n-Projekt** mit dem Kundennamen legen.

Zwei Dinge jetzt notieren, beide kommen in die Unterauftragnehmer-Liste bei Pflichthinweis 1:

- **Datenstandort:** In welcher Region die n8n-Cloud-Instanz läuft, steht in n8n Cloud im Admin-Bereich bei den Instanzdaten
  (Admin Panel → Instanz). Region aufschreiben. Liegt sie außerhalb der EU, vor dem Start klären, nicht einfach weitermachen.
- **Zugriffskreis:** Welche Personen bei uns sehen die Instanz, das n8n-Projekt des Kunden und das Credential `Supabase (Pilot)`?
  (n8n: Settings → Users; im Projekt: Project settings → Members.) Namen und Rollen aufschreiben. Ist die Instanz mit anderen
  Projekten geteilt, prüfen, dass das Kundenprojekt und sein Credential nur für diesen Kreis sichtbar sind (Credential dem Projekt
  zuordnen, nicht „für alle freigeben“).

### 3c. Fehler-Workflow importieren

1. „Workflows“ → „Create workflow“ → oben rechts die drei Punkte → **Import from file** → `../portal-fertig/ifa/fehler-workflow.workflow.json`.
2. Die vier Supabase-Knoten nacheinander öffnen und bei „Credential“ jeweils `Supabase (Pilot)` wählen. Speichern (Strg+S).
3. **Nicht aktivieren.** Ein Fehler-Workflow läuft von selbst, sobald ein anderer Workflow ihn eingetragen hat.

**Danach siehst du:** den Workflow `PORTAL: Fehler-Workflow (Pilot) [ifa]` in der Liste, Status „Inactive“. Das ist richtig so.

### 3d. Portal-API importieren und einstellen

1. Wieder „Import from file“ → `../portal-fertig/ifa/portal-api.workflow.json`.
2. Die drei Supabase-Knoten `Team-Daten laden`, `Einstellungen laden`, `In Supabase schreiben` öffnen, Credential `Supabase (Pilot)` wählen.
   Das sind HTTP-Request-Knoten; die Auswahl steht dort unter „Authentication → Predefined Credential Type → Supabase API“, darunter
   das Credential.
3. Oben rechts die drei Punkte → **Settings**:
   - „Error Workflow“: `PORTAL: Fehler-Workflow (Pilot) [ifa]`.
   - „Save successful production executions“: **Do not save**.
   - „Save failed production executions“: **Do not save**.
   - „Save manual executions“: **aus**.
   - „Save execution progress“: aus. Zeitzone: Europe/Berlin.
   Die Datei bringt diese Werte mit; prüfe trotzdem jede Zeile. Grund: Gespeicherte Ausführungen enthalten die Anfragen des Portals
   samt Zugangscodes und Texten. Im Pilot wird davon nichts gespeichert.
4. Speichern.

**Danach siehst du:** 16 Knoten auf der Fläche, keine roten Warndreiecke an den Supabase-Knoten, in den Settings die vier Werte wie oben.

### 3e. Aktivieren und Webhook-Adresse ablesen

1. Oben rechts den Schalter **Active** einschalten (neuere Oberflächen: „Publish“). Bestätigen.
2. Den Knoten **Team-API** (ganz links) öffnen. Dort stehen „Test URL“ und **Production URL**. Du brauchst die Production URL. Sie sieht so aus:

   `https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api`

   Der Teil bis einschließlich `ifa` ist später der Wert `n8n_basis_url` in der Konfiguration der Oberfläche:
   `https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa`.

**Danach siehst du:** den Workflow mit grünem „Active“, und du hast die Production URL notiert.

### 3f. Zwei Tests mit curl

Die `curl`-Befehle brauchen ein Terminal: auf dem Mac die App „Terminal“, unter Windows die Git Bash oder PowerShell. In PowerShell
`curl.exe` statt `curl` schreiben (das bloße `curl` ist dort ein anderer Befehl). Im Terminal (die Adresse durch deine Production URL ersetzen):

```bash
curl -i -X POST "https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api" -H "Content-Type: application/json" -d '{"aktion":"laden","token":"kein-gueltiger-token"}'
```

**Danach siehst du:** in der ersten Zeile `HTTP/2 401` und darunter `{"ok":false,"fehler":"Dein Zugang ist ungültig. …"}`.
Das ist das gewünschte Ergebnis: Die Kette läuft bis zur Datenbank (der Code wird gegen die Mitgliederliste geprüft) und weist den
falschen Code ab.

- Kommt `404`: der Workflow ist nicht aktiv oder die Adresse stimmt nicht (Test-URL statt Production-URL?).
- Kommt `503` mit „Die Daten konnten gerade nicht geladen werden“: das Credential passt nicht, oder `003_team_laden.sql` fehlt.
  Kommt ein allgemeiner `500` ohne diesen Text: n8n hat den Lauf abgebrochen, meist weil die Datenbank gerade nicht erreichbar ist
  (Projekt pausiert oder Adresse falsch). In beiden Fällen in n8n den Knoten `Team-Daten laden` einzeln testen.

Zweiter Test, die Herkunftsprüfung (CORS). Der Browser schickt vor dem eigentlichen Aufruf eine Anfrage mit `Origin`; n8n antwortet nur
für die erlaubte Herkunft mit dem passenden Header:

```bash
curl -i -X OPTIONS "https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api" -H "Origin: https://portal.beispiel.de" -H "Access-Control-Request-Method: POST"
```

**Danach siehst du:** einen Header `access-control-allow-origin: https://portal.beispiel.de` (genau deine Adresse aus `--origin`).
Wiederhole den Aufruf mit einer anderen Herkunft, z. B. `-H "Origin: https://www.example.com"`: dann darf dieser Header **nicht**
mit dieser Adresse kommen. Fehlt der Header auch bei der richtigen Herkunft, ist `--origin` in Schritt 3a falsch gewesen: Datei neu
erzeugen, Workflow neu importieren (den alten vorher löschen oder umbenennen).

Ein Test mit gültigem Zugang (Code eines Admins aus Schritt 2) geht genauso mit `"token":"<code>"` und liefert `"ok":true` mit den
Daten. Den Code danach nicht im Terminal-Verlauf liegen lassen (`history -c` oder das Terminal schließen).

---

## 4. Oberfläche

### 4a. `config/mandant.js` ausfüllen

Die Oberfläche besteht aus `frontend/index.html`, `frontend/assets/logo.svg` und `config/mandant.js`. Öffne `config/mandant.js` im
Texteditor und ersetze die Werte. Die Vorlage mit allen Feldern ist `config/mandant.example.json`; beide müssen dieselben Felder haben.

| Feld | Eintragen |
|---|---|
| `firma` | Firmenname (zeigt das Portal, solange der Server keinen liefert; Schritt 2.7 hat Vorrang) |
| `kurzname` | Kurzform, z. B. „Beispiel“ |
| `logo` | `assets/logo.svg`, dann die Datei `frontend/assets/logo.svg` durch das Logo des Kunden ersetzen (SVG oder PNG, dann `assets/logo.png` eintragen). Leer lassen = Kurzname als Text |
| `farben.primaer`, `farben.akzent` | zwei Farben als `#rrggbb`, z. B. aus dem Logo |
| `n8n_basis_url` | aus Schritt 3e, z. B. `https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa`, **ohne** Schrägstrich am Ende |
| `portal_url` | die Adresse der Oberfläche **mit** Schrägstrich am Ende, z. B. `https://portal.beispiel.de/frontend/` oder `https://portal-ifa.pages.dev/frontend/` |
| `register` | für den Pilot so lassen: Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team auf `true`, alles andere `false` |
| `social_kanaele` | `[]` lassen (nur für die Option Social Media) |
| `anleitung_video` | leer, oder die https-Einbettungsadresse eines Erklärvideos |
| `standard_projekt` | leer, oder der Name des Projekts, das bei neuen Aufgaben vorbelegt ist |
| `sprache` | `de` |

Platzhalter, die danach **nicht mehr** in der Datei stehen dürfen: `DEINE-INSTANZ`, `PILOTKUERZEL`, `DEINE-ADRESSE`.

**Danach siehst du:** beim Öffnen von `frontend/index.html` direkt von der Festplatte (Doppelklick) die Anmeldeseite mit Logo und
Firmenname des Kunden. Anmelden geht von der Festplatte aus noch nicht (die Herkunft `file://` ist in n8n nicht erlaubt), das kommt in
Schritt 5.

### 4b. Hosting

Die Oberfläche sind drei statische Dateien. Sie brauchen keinen Server, nur einen Ort mit https. Zwei bewährte Wege:

**Weg A: GitHub Pages in einem eigenen privaten Repo**

1. Auf github.com → „New repository“, Name `portal-ifa`, **Private**, ohne README. Erstellen.
2. In das leere Repo die drei Ordner hochladen: „Add file → Upload files“, den Inhalt von `portal-pilot/frontend/` und
   `portal-pilot/config/` so ablegen, dass es im Repo `frontend/index.html`, `frontend/assets/logo.svg`, `config/mandant.js` gibt.
   Nichts anderes hochladen (keine SQL-Dateien, keine Workflows). Commit.
3. Repo-Einstellungen → **Pages** → „Build and deployment“: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`. Speichern.
   GitHub Pages aus einem privaten Repo braucht einen GitHub-Pro- oder Team-Plan; im kostenlosen Plan muss das Repo öffentlich sein.
   Öffentlich wäre nur die Oberfläche (ohne Daten, ohne Schlüssel), aber mit Firmenname und n8n-Adresse. Für den Pilot ist ein
   privates Repo mit Pro-Plan der saubere Weg.
4. Nach ein bis zwei Minuten steht unter Pages die Adresse der Seite: die Pages-Adresse deines Kontos plus `/portal-ifa/`. Die Oberfläche
   liegt dann unter dieser Adresse plus `frontend/`. Das ist deine `portal_url` (Schritt 4a); die Herkunft für n8n (Schritt 3a) ist nur
   der Teil bis zum ersten Schrägstrich nach dem Host, ohne `/portal-ifa/`.
5. Beachte: Diese Herkunft (die Adresse deines Pages-Kontos) gilt für **alle** Pages-Seiten dieses Kontos, nicht nur für `portal-ifa`.
   Jede andere Seite, die du unter demselben Konto veröffentlichst, dürfte damit die Schnittstelle aufrufen. Für den Pilot ist eine
   eigene Domain (Custom domain in den Pages-Einstellungen) oder Weg B sauberer: dort hat jedes Projekt seine eigene Adresse.

**Weg B: Cloudflare Pages**

1. Auf dash.cloudflare.com → „Workers & Pages“ → „Create“ → „Pages“ → „Upload assets“ (direkter Upload, ohne Git).
2. Projektname `portal-ifa`. Den Ordner mit `frontend/` und `config/` hochladen (als ZIP oder Ordner). Deploy.
3. Die Adresse lautet `https://portal-ifa.pages.dev`, die Oberfläche liegt unter `https://portal-ifa.pages.dev/frontend/`. Eigene
   Domain geht unter „Custom domains“.
4. Zugriffsschutz, falls gewünscht: „Cloudflare Access“ kann die Seite zusätzlich hinter einen Login legen; für den Pilot reicht der
   persönliche Zugangscode.

Bei beiden Wegen gilt: **Die Herkunft (Schema + Host, ohne Pfad) muss genau der Angabe `--origin` aus Schritt 3a entsprechen**, sonst
blockt der Browser jeden Aufruf der Schnittstelle (Fehlermeldung „Keine Verbindung“ im Portal, in der Browser-Konsole „CORS“).
Hast du dich vertan: Schritt 3a mit der richtigen Adresse wiederholen und den Workflow neu importieren.

**Danach siehst du:** die Anmeldeseite unter der öffentlichen Adresse, mit Logo und Firmenname, über https.

---

## 5. Erster Login

1. In Supabase, SQL Editor: `select name, rolle, status, token from team_mitglieder order by name;`

   **Danach siehst du:** die Admin-Person mit ihrem 48-stelligen Code.

2. Den Link bauen: `<portal_url>#z=<code>`, zum Beispiel `https://portal-ifa.pages.dev/frontend/#z=ab12…`. Das Doppelkreuz ist Absicht:
   Den Teil hinter `#` schickt der Browser nie an einen Server und nie in ein Protokoll.
3. Den Link selbst im Browser öffnen (erst du, dann die Admin-Person des Kunden; Weitergabe nur persönlich, siehe Pflichthinweis 6).

**Danach siehst du** (Checkliste, alles muss zutreffen):

- [ ] Die Adresszeile zeigt den Code **nicht** mehr (er wurde übernommen und entfernt).
- [ ] Der Fenstertitel lautet „Team-Portal · <Firma aus Schritt 2.7>“.
- [ ] Oben rechts Name und Rolle „Admin“.
- [ ] Sechs Register: Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team. Keine weiteren.
- [ ] Übersicht: „Guten Morgen, <Name>“ (vor 11 Uhr), „Hallo, <Name>“ (bis 18 Uhr) oder „Guten Abend, <Name>“; Kennzahlen (bei leerer Datenbank alles 0), kein Hinweis auf „KI Office“, kein Video (außer du hast eines eingetragen).
- [ ] Register Team: die Admin-Person mit „Verwalten“ und „Link kopieren“; unten „Auf diesem Gerät abmelden“.
- [ ] Register Aufgaben → „+ Neue Aufgabe“ → eine Testaufgabe anlegen → sie erscheint in der Liste. In Supabase (Table Editor →
      `team_aufgaben`) steht die Zeile.
- [ ] Die Testaufgabe öffnen, Status „Erledigt“, speichern. In `team_aufgaben_verlauf` stehen „Angelegt“ und „Status: Offen → Erledigt“.
- [ ] Auf dem Handy (oder Browserfenster schmal ziehen): keine waagerechte Scrollleiste der Seite; die Register-Leiste zeigt rechts
      einen Pfeil und lässt sich wischen.
- [ ] Browser-Konsole (F12) ohne rote Fehler.

Trifft ein Punkt nicht zu: „Keine Verbindung“ → Schritt 3f und 4b (CORS, Adresse). Anmeldeseite trotz Link → Code falsch kopiert oder
Status `gesperrt`. Register fehlen → `register` in `mandant.js`.

4. Weitere Mitglieder legt die Admin-Person jetzt im Portal unter **Team → Neues Teammitglied** an. Für jede Person entsteht ein
   eigener Link („Link kopieren“), den sie **persönlich** bekommt (nicht in Gruppenchats). Beim ersten Öffnen trägt die Person ihre
   E-Mail ein; danach ist der Zugang aktiv.

---

## 6. Pilot-Standard und Pflichthinweise

### Pilot-Standard

| Einstellung | Wert im Pilot | Wo |
|---|---|---|
| Register | Übersicht, Aufgaben, Projekte, Notizen, Vorschläge, Team | `config/mandant.js` |
| Module | alle aus (`zeit`, `social`, `system`, `kurs` = false) | `team_einstellungen.module` |
| Zeiterfassung, WhatsApp, KI-Funktionen, Social, Chat-Hinweise | aus, nicht eingespielt | Optionen `100`–`150` nicht einspielen; Wochenstand und Vorschlag-Hinweis in n8n nicht importieren oder nicht aktivieren |
| Ausführungsdaten in n8n | nicht speichern (Erfolg und Fehler) | Workflow-Settings |
| Region | EU (Frankfurt) | Supabase |
| Service-Role-Schlüssel | nur im n8n-Credential | n8n |
| Zugangscodes | 48 Zeichen, im Link hinter `#`, persönlich weitergeben | Portal |
| Pilotdauer | 4 Wochen, danach Export und Löschung binnen 30 Tagen | Abschnitt 9 |
| Rückmeldungen der Tester | Vorschläge und Kommentare im Portal; gelesen und beantwortet mit dem KI-Werkzeug Claude als Mitglied „Claude (KI)“, Antwort binnen eines Werktags | Abschnitt 8 |

### Pflichthinweise für den Kunden (aus der Datenschutzprüfung)

Diese neun Punkte gehören in das Vorgespräch mit dem Kunden und, wo angegeben, **vor** den ersten echten Datensatz. Sie sind keine
Rechtsberatung, sondern die Liste dessen, was der Pilot voraussetzt.

1. **Vor dem ersten echten Datensatz: Auftragsverarbeitungsvertrag (AVV) unterschrieben.** Der Kunde ist Verantwortlicher, wir sind
   Auftragsverarbeiter. Der Kunde hat die Liste der Unterauftragnehmer gelesen: Supabase (Datenbank, Region Frankfurt), n8n GmbH
   (n8n Cloud, Schnittstelle; Region der Instanz laut Schritt 3b eintragen), der Hosting-Anbieter der Oberfläche (GitHub oder Cloudflare
   oder der gewählte Webspace) und der Anbieter des KI-Werkzeugs Claude (Anthropic, Sitz in den USA), weil Rückmeldungen der Tester
   damit gelesen und beantwortet werden (Abschnitt 8; Satz dafür steht in 8g). Dazu gehört der Zugriffskreis aus Schritt 3b: welche
   Personen bei uns Instanz, Projekt und Credential sehen.
2. **Datenschutzinformation für die Mitarbeitenden (Art. 13 DSGVO), bevor der erste Zugangslink verteilt wird.** Inhalt: Zweck
   (Aufgaben- und Projektorganisation im Team), Daten (Name, Firmen-E-Mail, optional Telefon, Aufgaben, Notizen, Kommentare,
   Vorschläge, Zeitpunkt der letzten Anmeldung), Empfänger und Unterauftragnehmer (siehe 1), der Satz zu den Rückmeldungen aus 8g,
   Drittland (KI-Anbieter in den USA für die Rückmeldungen; Hosting-Anbieter prüfen), Fristen (Pilotende plus 30 Tage, siehe 9), Rechte (Auskunft, Berichtigung, Löschung, Widerspruch) und die
   Ansprechperson beim Kunden.
3. **Zeiterfassung:** Betriebsrat beziehungsweise Betriebsvereinbarung klären, bevor die Option Arbeitszeit eingeschaltet wird. Das
   Modul bleibt aus, bis der Kunde das schriftlich bestätigt.
4. **WhatsApp:** nur mit Einwilligung je Person; Standard ist aus (Option 130 nicht eingespielt, Register aus). Das Feld „Handynummer“
   im Profil darf leer bleiben.
5. **KI-Funktionen:** Im Portal Standard aus (kein Assistent, kein KI Office). Die einzige KI im Pilot ist die Feedbackschleife
   (Abschnitt 8): Vorschläge und Kommentare werden mit dem KI-Werkzeug Claude gelesen und beantwortet. Dafür vorher der Hinweis an die
   Mitarbeitenden (Satz in 8g) und die Regel: keine sensiblen Daten in Vorschläge und Kommentare schreiben.
6. **Persönlicher Link:** nicht weitergeben, nicht in Gruppenchats, nicht in Ticketsysteme. Auf fremden oder geteilten Geräten „Auf
   diesem Gerät abmelden“ nutzen. Bei Verdacht auf Weitergabe: Admin erzeugt unter Team → Verwalten → „Neuen Zugangslink erzeugen“
   einen neuen Link; der alte ist sofort ungültig. Zwei Dinge dazu klar sagen: Der Zugangscode bleibt im Browser gespeichert, bis
   jemand „Auf diesem Gerät abmelden“ drückt (auf geteilten Rechnern also nach jeder Nutzung abmelden). Und das Gerät des Admins ist
   der Schlüsselbund des Teams: Es sieht beim Laden die Zugangscodes aller Mitglieder, darum Bildschirmsperre, aktuelle Updates und
   kein Zugriff durch Dritte.
7. **Selbstbetrieb** (wenn der Kunde Supabase, n8n und Hosting selbst betreibt): eigene Konten, Zwei-Faktor-Anmeldung bei allen drei
   Anbietern, EU-Region, eigene AVVs mit den drei Anbietern.
8. **Pilotende:** Export und Löschung nach Abschnitt 9, danach schriftliche Löschbestätigung an den Kunden.
9. **Kundenseitig:** Eintrag im Verzeichnis der Verarbeitungstätigkeiten; Prüfung, ob eine Datenschutz-Folgenabschätzung nötig ist
   (Schwellenprüfung; bei Aufgabenverwaltung ohne Leistungsbewertung und ohne Zeiterfassung in der Regel nicht).

### Grenzen des Pilots

Das sagst du dem Kunden im Vorgespräch so, wie es ist:

- Keine Zwei-Faktor-Anmeldung für die Portal-Nutzer. Der persönliche Link ist der einzige Schlüssel.
- Zugangslinks laufen nicht von selbst ab. Sperren und Erneuern macht der Admin von Hand (Abschnitt 7).
- Keine Anmelde-Protokollierung. Je Person steht nur der Zeitpunkt der letzten Anmeldung in der Datenbank; einzelne Zugriffe werden
  nicht aufgezeichnet.
- Keine Bremse gegen massenhafte Aufrufe. Darum die Webhook-Adresse nirgends veröffentlichen und in Woche 1 die „Usage“ in n8n prüfen.
- Der Zugangscode bleibt im Browser gespeichert, bis jemand „Auf diesem Gerät abmelden“ drückt. Regel für geteilte Rechner: nach jeder
  Nutzung abmelden, oder das Portal dort gar nicht öffnen.
- Der Admin sieht beim Laden die Zugangscodes aller Mitglieder. Sein Gerät ist damit der Schlüsselbund des Teams.
- Eine Wiederherstellung aus dem Export (Abschnitt 7, Backups) ist Handarbeit, Tabelle für Tabelle. Es gibt keinen Knopf dafür.

---

## 7. Betrieb während des Pilots

### Ausführungsbudget in n8n Cloud

Jeder Aufruf der Portal-API ist **eine Ausführung** in n8n Cloud: jedes Öffnen des Portals, jeder Hintergrund-Reload (alle
10 Minuten je offenem Tab, nur bei sichtbarem Tab), jedes Speichern, jeder Klick auf „Finde ich gut“. Rechenbeispiel für 4 Personen:

| Was | je Person und Tag | 4 Personen, 20 Arbeitstage |
|---|---|---|
| Portal 8 Stunden offen und sichtbar: 6 Reloads je Stunde | 48 | 3 840 |
| Öffnen, Speichern, Kommentare, Stimmen (geschätzt) | 30 | 2 400 |
| Summe | 78 | **rund 6 200 im Monat** |

Im Alltag ist der Tab selten acht Stunden sichtbar (versteckte Tabs laden nicht), realistisch sind 2 000 bis 4 000 Ausführungen im
Monat. Welcher Tarif der Partner-Instanz zugrunde liegt, ist nicht bekannt. **Vor dem Start im n8n-Konto unter „Usage“ nachsehen,**
wie viele Ausführungen im Monat enthalten sind. **In Woche 1 des Pilots den Zähler unter „Usage“ verbindlich prüfen** (Termin in den
Kalender), danach jede Woche. Reicht es nicht: Reload-Abstand in
`frontend/index.html` erhöhen (Zeile `const RELOAD_MS = 10 * 60000`) oder die Begleit-Workflows (Wochenstand, Hinweis) nicht aktivieren.

### Backups

Supabase Pro macht tägliche Backups (7 Tage). Für den Pilot zusätzlich einmal pro Woche `990_export.sql` ausführen und das JSON
verschlüsselt ablegen (Passwort-ZIP), damit ein Stand unabhängig vom Anbieter existiert. Nach dem Pilot diese Kopien löschen (Abschnitt 9).

### Zugangscode sperren oder erneuern

- **Sperren:** Portal → Team → Verwalten → Zugang „gesperrt“. Oder in Supabase: `update team_mitglieder set status = 'gesperrt' where email = '…';`
- **Neuer Link:** Portal → Team → Verwalten → „Neuen Zugangslink erzeugen“. Oder: `update team_mitglieder set token = team_token_neu() where email = '…';`
  Der alte Link ist sofort ungültig; wer ihn noch offen hat, wird beim nächsten Klick abgemeldet.
- **Admin-Zugang verloren:** `select name, token from team_mitglieder where rolle = 'admin';` im SQL-Editor zeigt die Codes.

### Was du bei Störungen prüfst

1. Portal zeigt „Keine Verbindung“: in n8n ist der Workflow aktiv? `curl`-Test aus Schritt 3f. Herkunft (CORS) wie in Schritt 4b?
2. Portal zeigt „Dein Zugang ist ungültig“: Status der Person in `team_mitglieder`, Code neu erzeugen.
3. Im Portal erscheint eine Notiz „Störung TT.MM.JJJJ“: der Fehler-Workflow hat einen Fehler eines Workflows protokolliert; Text lesen,
   meist ein abgelaufener Schlüssel oder eine fehlende Tabelle.
4. „Modul nicht aktiviert“: ein Register ist in `mandant.js` an, das Modul auf dem Server aber aus (siehe `README.md`, „Module an- und
   ausschalten“). Im Pilot gewollt für alle Optionen.

### Änderungen und Support während des Pilots

**Updates einspielen** (neue `index.html`, neue `mandant.js` oder ein neuer Workflow), immer in dieser Reihenfolge:

1. Die neue Fassung zuerst im Testserver prüfen (`node portal-pilot/dev/server.mjs`, siehe `README.md`, „Schnellstart“): anmelden,
   eine Aufgabe anlegen und erledigen, Browser-Konsole ohne rote Fehler.
2. Den Kunden am Vortag informieren: was sich ändert, wann, und wie lange das Portal dabei nicht erreichbar ist.
3. Nie während der Arbeitszeit der Tester einspielen, sondern früh morgens oder abends.
4. Vorher sichern: in n8n den bisherigen Workflow herunterladen (drei Punkte → „Download“) und ihn umbenennen statt überschreiben;
   die bisherige `index.html` und `mandant.js` als Kopie mit Datum ablegen. So bist du in Minuten wieder beim alten Stand.
5. Workflow: neue Datei mit `einsetzen.mjs` erzeugen (Schritt 3a), importieren, Credential und Settings wie in 3d prüfen, alten
   Workflow deaktivieren, neuen aktivieren, `curl`-Test aus 3f. Oberfläche: Dateien im Hosting ersetzen (Schritt 4b), danach einmal
   selbst anmelden und die Checkliste aus Schritt 5 durchgehen.

**Ansprechperson und Reaktionszeit:** HIER_ANSPRECHPERSON (Name, E-Mail, Telefon). Reaktion werktags innerhalb eines Tages. Genau das
sagst du dem Kunden zu, nicht mehr.

**So melden Tester Fehler:** im Portal im Register Vorschläge (Bereich „Sonstiges“: was sie getan haben, was sie erwartet haben, was
sie gesehen haben) oder per E-Mail an die Ansprechperson. Keine Screenshots mit einem Zugangscode in der Adresszeile. Wie die
Rückmeldungen gelesen, beantwortet und zu Verbesserungen werden, steht in Abschnitt 8.

---

## 8. Rückmeldungen der Tester: Lesen, Antworten, Verbessern

Die Tester melden sich an drei Stellen: als **Vorschlag** im Register Vorschläge (mit Status und Antwort), als **Kommentar** an einer
Aufgabe, und bei Störungen schreibt der Fehler-Workflow eine **Störungsnotiz** („Störung TT.MM.JJJJ“). Diese drei Kanäle liest Claude
Code, das KI-Werkzeug, mit dem wir das Portal bauen, und antwortet **im Portal** als eigenes Mitglied **„Claude (KI)“** (Rolle `agent`,
mit 🤖-Kennzeichen). Jede Antwort endet mit „— Claude (KI-Werkzeug von Hermetikmarketing)“, damit die Tester wissen, wer schreibt.

Was das Mitglied darf, prüft die Portal-API bei jedem Aufruf (Code-Knoten „Anfrage prüfen“): lesen, Vorschläge beantworten (Status
`nachfrage`, `geplant`, `abgelehnt` und eine Antwort), Kommentare und Notizen schreiben. Es darf **nichts löschen**, nie „Erledigt“
setzen (daraus wird „Wird getestet“), nie „umgesetzt“ setzen, keine Mitglieder verwalten, und es sieht keine Zugangscodes und keine
Kontaktdaten. In Claudes Notizen stehen Rollen (Admin, Team), keine Namen.

### 8a. Das Agent-Mitglied anlegen (einmalig)

- **Mit Musterdaten (900):** schon da, Name „Claude (KI)“, dazu das Projekt „Pilot-Verbesserungen“ mit der Notiz „Was sich geändert hat“.
- **Echter Kunde (910):** in `910_erster_admin.sql` den Block „Agent-Mitglied anlegen“ einschalten: die Zeile
  `agent_anlegen boolean := false;` auf `true` ändern und die Datei (noch einmal) ausführen. Das legt den Agenten, das Projekt
  „Pilot-Verbesserungen“ und die Notiz „Was sich geändert hat“ an. Mehrfach ausführen ist unschädlich.

  **Danach siehst du:** zwei Zeilen: die Admin-Person und „Claude (KI)“ (Rolle `agent`, Status `aktiv`), je mit einem 48-stelligen Code.

Der Code des Agenten ist **kein Login-Link**. Er ist der Zugang des Werkzeugs auf deinem Rechner (8b). Später wieder anzeigen:
`select name, token from team_mitglieder where typ = 'agent';`. Sperren wie bei jeder Person: im Portal unter Team oder per
`update team_mitglieder set status = 'gesperrt' where typ = 'agent';`.

### 8b. Zugangscode nur als Umgebungsvariable (auf deinem Rechner)

Das Werkzeug `portal-pilot/agent/feedback.mjs` liest zwei Werte aus der Umgebung. Sie stehen **nie** in einer Datei, nie im Chat, nie
im Repo:

- `PILOT_PORTAL_API`: die Adresse der Portal-API, also `n8n_basis_url` aus Schritt 3e plus `/portal-api`, zum Beispiel
  `https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api`.
- `PILOT_AGENT_TOKEN`: der Code des Agenten aus 8a.

**Windows** (PowerShell oder Eingabeaufforderung; danach ein **neues** Terminal öffnen, erst dort gilt es):

```bash
setx PILOT_PORTAL_API "https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api"
```

```bash
setx PILOT_AGENT_TOKEN "HIER-DEN-CODE-EINFUEGEN"
```

**Mac** (Terminal; die zwei Zeilen am Ende der Datei `~/.zshrc` eintragen, dann Terminal neu öffnen):

```bash
export PILOT_PORTAL_API="https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api"
```

```bash
export PILOT_AGENT_TOKEN="HIER-DEN-CODE-EINFUEGEN"
```

Prüfung, im Ordner des Repos:

```bash
node portal-pilot/agent/feedback.mjs lesen
```

**Danach siehst du:** eine Liste „Rückmeldungen im Pilot-Portal, Stand …“ mit neuen Vorschlägen, Kommentaren der letzten 7 Tage und
Störungsnotizen, überall Rollen statt Namen. Kommt „PILOT_AGENT_TOKEN fehlt“, gilt die Variable noch nicht (Terminal neu öffnen). Kommt
„Dein Zugang ist ungültig“, ist der Code falsch kopiert oder der Agent gesperrt. Kommt „gehört keinem Agent-Mitglied“, hast du den Code
einer Person eingetragen; das Werkzeug schreibt nur als Agent.

### 8c. Vorlage „Feedback lesen“ in n8n importieren (inaktiv lassen)

`einsetzen.mjs` (Schritt 3a) schreibt zusätzlich `optional/feedback-lesen.workflow.json` in den Ausgabeordner. Diese Vorlage liest
dieselben drei Kanäle direkt aus der Datenbank und baut eine kompakte Liste: je Eintrag Art, Zeit, Bereich oder Projekt, Rolle des
Verfassers, Text, Status, ID. Sie hat **keinen Webhook und keinen Zeitplan**: Sie läuft nur, wenn jemand sie in n8n von Hand startet
oder Claude sie über den Connector (8d) ausführt.

1. „Import from file“ → `../portal-fertig/ifa/optional/feedback-lesen.workflow.json`.
2. Die fünf Supabase-Knoten (`Vorschläge`, `Verlauf`, `Aufgaben`, `Störungsnotizen`, `Mitglieder`) öffnen und `Supabase (Pilot)` wählen.
   Alle fünf lesen nur (GET); der Knoten `Mitglieder` holt nur ID, Rolle, Typ und Status, keine Namen.
3. Settings wie in 3d prüfen (Ausführungsdaten nicht speichern, Europe/Berlin). Speichern.
4. **Nicht aktivieren.** Es gibt nichts zu aktivieren; der Schalter bleibt aus.
5. Probelauf: „Execute workflow“ (oder „Test workflow“) klicken und den letzten Knoten `Liste bauen` öffnen.

**Danach siehst du:** im Knoten `Liste bauen` ein Element mit `zusammenfassung` (Zählung: neue Vorschläge, Kommentare, Störungen) und
`eintraege` (die Liste). Bei leerem Portal sind die Zahlen 0 und die Liste leer, das ist richtig. Ein roter Knoten heißt fast immer:
Credential nicht gewählt.

### 8d. Zweiter n8n-Connector in der Claude-App

Claude bekommt in der Claude-App einen eigenen Connector auf die n8n-Cloud-Instanz des Piloten (getrennt von unserem eigenen n8n). Über
ihn kann Claude Workflows lesen und die Vorlage aus 8c ausführen. Mehr nicht: Es gibt keinen offenen Webhook, und das Antworten läuft
über das Werkzeug aus 8b auf deinem Rechner.

1. **API-Schlüssel in n8n anlegen:** n8n Cloud → unten links Settings → **n8n API** → „Create an API key“. Name `Claude Pilot ifa`,
   Ablaufdatum: Pilotende. Erscheint eine Liste **Scopes** (Rechte), nur anhaken: Workflows lesen (`workflow:read`), Ausführungen lesen
   (`execution:read`) und Workflows ausführen (`workflow:execute`). Fehlt die Liste, hat der Schlüssel alle Rechte der Instanz: dann
   trotzdem anlegen, aber Ablaufdatum setzen, den Schlüssel nur in der Claude-App hinterlegen (nirgends sonst), und im Chat gilt die
   Regel „nur den Workflow „PILOT: Feedback lesen“ ausführen, nichts ändern“. Den Schlüssel einmal kopieren; n8n zeigt ihn nur einmal.
2. **Connector in der Claude-App:** im Chat das **Plus-Menü** (unten links im Eingabefeld) → „Connectors“ (oder Einstellungen →
   Connectors) → „Connector hinzufügen“ → **n8n** wählen. Name `n8n Pilot ifa` (damit er nicht mit unserem eigenen n8n-Connector
   verwechselt wird), Instanz-URL `https://DEINE-INSTANZ.app.n8n.cloud`, API-Schlüssel aus 1. Speichern. Der Schlüssel bleibt in der
   Claude-App; er gehört nicht in dieses Repo und nicht in den Chat.
3. **Prüfung im Chat:** „Zeig mir die Workflows im Pilot“ muss die Liste mit `PORTAL: Portal-API (Pilot) [ifa]` und
   `PILOT: Feedback lesen (intern, Claude) [ifa]` liefern. „Lies das Feedback im Pilot“ führt die Vorlage aus und fasst die Liste zusammen.

**Danach siehst du:** den Connector in der Liste der Claude-App mit grünem Status, und im n8n-Workflow „Feedback lesen“ nach dem
Probelauf keine gespeicherte Ausführung (Settings aus 3d).

Beide Wege lesen dasselbe: Weg 1 ist der Connector (Claude-App, Vorlage aus 8c), Weg 2 ist `feedback.mjs lesen` (Claude Code auf
deinem Rechner, über die Portal-API). Geantwortet wird immer über Weg 2.

### 8e. Antwortregeln

- **Binnen eines Werktags** bekommt jede Rückmeldung eine Antwort im Portal (das ist die Zusage aus Abschnitt 7).
- **Angenommen:** Status `geplant` mit Termin („kommt bis Freitag mit dem nächsten Update“).
- **Nachgefragt:** Status `nachfrage` mit der konkreten Frage; der Vorschlag bleibt offen, bis der Verfasser antwortet (Kommentar oder
  Vorschlag ergänzen).
- **Abgelehnt:** Status `abgelehnt` mit Grund („gehört nicht in den Pilot-Umfang“, „Modul bleibt aus, siehe Pflichthinweis 3“).
- **Entscheidungen zu Umfang, Kosten und Daten bleiben bei dir.** Claude darf Kleinigkeiten (Texte, Anzeige, Sortierung, Fehler)
  selbst als `geplant` zusagen und offensichtlich Fremdes selbst ablehnen. Alles, was den Pilot-Umfang erweitert, Module einschaltet,
  neue Daten erhebt oder Geld kostet, bekommt erst `nachfrage` („wird mit der Leitung besprochen“) und dann deine Entscheidung.
- **„umgesetzt“** setzt nur du, im Portal, nachdem die Änderung ausgerollt ist (8f).
- **Rollen statt Namen** in allen Notizen von Claude; Tester werden nicht bewertet, Rückmeldungen werden nicht einzelnen Personen
  zugeordnet. Störungsnotizen werden nur gelesen, nicht beantwortet; die Behebung steht in „Was sich geändert hat“.
- Die Befehle dazu (jeweils mit Unterschrift):

```bash
node portal-pilot/agent/feedback.mjs antworten <vorschlag_id> --status geplant --text "Kommt bis Freitag mit dem nächsten Update."
```

```bash
node portal-pilot/agent/feedback.mjs kommentar <aufgabe_id> --text "Danke, wir prüfen das bis morgen."
```

### 8f. Ausrollen: nur nach deiner Freigabe

1. Claude baut die Änderung im Repo (Branch, Tests grün, Testserver).
2. Du gibst frei (im Chat oder im Pull Request).
3. Einspielen **genau nach Abschnitt 7, „Änderungen und Support während des Pilots“**: zuerst im Testserver prüfen, Kunden am Vortag
   informieren, außerhalb der Arbeitszeit der Tester, vorher sichern, dann Workflow oder Oberfläche ersetzen, `curl`-Test, Checkliste
   aus Schritt 5.
4. Danach trägt Claude ein, was sich geändert hat (Notiz „Was sich geändert hat“ im Projekt „Pilot-Verbesserungen“, oder im Projekt aus
   der Einstellung `firmenwissen_projekt`, falls gesetzt; die Notiz wird angelegt, falls sie fehlt):

```bash
node portal-pilot/agent/feedback.mjs aenderungen --text "Vorschläge lassen sich jetzt nach Bereich ordnen (Vorschlag 2 aus der ersten Woche)."
```

5. Du setzt den Vorschlag im Portal auf „umgesetzt“.

### 8g. Datenschutz: AVV und Datenschutzinformation

Dieser Satz gehört in die Unterauftragnehmer-Liste des AVV (Pflichthinweis 1) und in die Datenschutzinformation für die Mitarbeitenden
(Pflichthinweis 2), **bevor** der erste Zugangslink verteilt wird:

> Rückmeldungen im Portal (Vorschläge, Kommentare an Aufgaben, Störungsmeldungen) werden von Hermetikmarketing mit dem KI-Werkzeug
> Claude (Anbieter Anthropic, USA) gelesen und beantwortet. Antworten sind im Portal als Mitglied „Claude (KI)“ gekennzeichnet. Bitte
> keine sensiblen Daten in Vorschläge und Kommentare schreiben.

Dazu im Vorgespräch: Die Texte der Rückmeldungen (nicht die ganze Datenbank) gehen an den KI-Anbieter; Namen der Verfasser werden
vorher durch Rollen ersetzt, soweit sie nicht im Text selbst stehen. Was Claude sieht, steht in `n8n/PRUEFUNG.md`, Abschnitt 9.

---

## 9. Pilotende: Übergabe und Löschung

Reihenfolge einhalten. Ziel: Der Kunde hat seine Daten, bei uns und bei den Anbietern bleibt nichts zurück, und der Kunde hat das
schriftlich. Frist: Löschung binnen 30 Tagen nach Pilotende.

1. **Workflows aus:** in n8n die Portal-API und die Begleit-Workflows deaktivieren.

   **Danach siehst du:** die Workflows mit „Inactive“; das Portal zeigt „Keine Verbindung“.

2. **Export:** in Supabase `990_export.sql` komplett ausführen. Die letzte Zelle enthält das ganze JSON. Zelle anklicken, kopieren, als
   `export-<kunde>-<datum>.json` speichern. Wer Excel-Tabellen will: die `select`-Zeilen am Ende der Datei einzeln ausführen und je
   Ergebnis „Download CSV“. Zugangscodes sind absichtlich nicht im Export.

   **Danach siehst du:** eine JSON-Datei, in der die Mitglieder, Aufgaben und Notizen des Kunden vorkommen, aber kein `token`.

3. **Übergabe:** Export verschlüsselt an den Kunden (ZIP mit Passwort, Passwort über einen anderen Kanal), Empfang schriftlich
   bestätigen lassen. Danach die eigene Kopie und die Wochen-Sicherungen aus Abschnitt 7 löschen.

4. **Datenbank löschen:** `999_loeschen.sql` öffnen, den Kopfkommentar zweimal lesen, in Supabase den Projektnamen oben links prüfen.
   In der Zeile `bestaetigung text := 'NEIN';` das `NEIN` durch `JA, ALLES LOESCHEN` ersetzen, ausführen.

   **Danach siehst du:** die Kontrollabfragen am Ende sind leer (keine `team_`-Tabellen mehr).

5. **Buckets:** nur falls die Option Social Media eingespielt war: Supabase → Storage → Buckets `medien-roh` und `social-ideen` leeren
   und löschen. Im Pilot-Standard gibt es sie nicht.

6. **Supabase-Projekt löschen:** Project Settings → General → „Delete project“. Danach die Organisation des Kunden löschen (Organization
   Settings). Backups beim Anbieter verschwinden nach dessen Frist (7 Tage im Pro-Plan).

   **Danach siehst du:** das Projekt ist aus der Liste verschwunden.

7. **n8n aufräumen:** das n8n-Projekt des Kunden mit allen Workflows löschen und das Credential `Supabase (Pilot)` löschen (es zeigt
   ohnehin auf ein gelöschtes Projekt). Gibt es kein eigenes Projekt: die vier Workflows und das Credential einzeln löschen.

8. **Oberfläche vom Netz:** das GitHub-Repo oder das Cloudflare-Pages-Projekt löschen.

9. **Löschbestätigung** an den Kunden: Datum, was gelöscht wurde (Supabase-Projekt, n8n-Workflows und -Credential, Hosting, eigene
   Export-Kopien), Hinweis auf die Backup-Frist des Anbieters. Eine Kopie der Bestätigung im eigenen Löschprotokoll ablegen.
