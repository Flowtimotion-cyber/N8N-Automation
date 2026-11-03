# Prüfbericht: Pilot-Workflows (Stand 02.11.2026)

Geprüft wurde die **veröffentlichte Fassung** (`activeVersion`) der drei Original-Workflows aus n8n, nur lesend abgerufen:

- Portal-API `kMuDaDmT9rCN5Vs2` (20 Knoten, 34 Aktionen)
- Wochenstand `f0AG5NxtwzSyDr2c`
- Vorschlag-Hinweis `s8OfrONvk8JKXTrs`

In n8n wurde nichts geändert, nichts ausgeführt, nichts angelegt. Zusätzlich lesend abgefragt: die Liste der Workflows (für die IDs in der README) und die Knoten-Beschreibung von `emailSend` und `errorTrigger`.

## 1. Was geprüft wurde und mit welchem Ergebnis

| Prüfung | Ergebnis |
|---|---|
| Alle Code-Knoten des Originals Zeile für Zeile gelesen (Anfrage prüfen 471 Zeilen, Antwort bauen, Social-Felder, Schreibaufträge, Ergebnis prüfen) | Ablauf verstanden, Änderungen siehe Abschnitt 2 |
| `require(` in allen Code-Knoten (Original und Pilot) | nicht vorhanden |
| Zugriff auf `$env`, `$vars`, `process`, Dateisystem, `fetch`, `helpers.` | nicht vorhanden |
| Hintertür `_test` / Testmodus / fester Token in den drei Workflows | **nicht gefunden.** Zugang nur über den Token aus `team_mitglieder` (mindestens 20 Zeichen, gesperrte Zugänge werden abgewiesen). Der „Testmodus: nur eine Telefonnummer“ steht in der Beschreibung des WhatsApp-Bots (`DVGX3cltu2qbqLJE`), der nicht zum Pilot gehört und von mir nicht geöffnet wurde. Das KI Office, der Assistent und die Kurs-Workflows wurden nicht geprüft. |
| Fest eingebaute Zugangsdaten im Original | Telegram-Chat-ID in zwei Knoten (Wochenstand, Vorschlag-Hinweis) und ein WhatsApp-Platzhalter. Alles im Pilot entfernt. Keine Schlüssel oder Passwörter im Klartext gefunden (n8n liefert Credential-Verweise ohnehin nicht mit aus). |
| Eingaben in Datenbankpfade (PostgREST) | IDs werden mit `encodeURIComponent` eingebaut oder vorher per Muster geprüft (`^p_\w+$`, `^s_\w+$`); Spaltennamen und Tabellen sind fest. Keine Einschleusung gefunden. |
| Rechteprüfung je Aktion | Admin-/Dozent-/Eigentümer-Prüfungen sind vorhanden und folgerichtig; Agenten sind per Liste `AGENT_DARF` eingeschränkt. Keine Aktion ohne Prüfung außer `laden` und `profil` (beide brauchen einen gültigen Token). |
| Ausführungsdaten im Original | `saveDataErrorExecution: all`: Fehlerläufe speichern Anfrage mit Token und Daten. Im Pilot auf `none`. |
| `.first()`-Falle (Projektregel) | siehe Abschnitt 3: keine Fundstelle, die Daten vertauscht. Nichts geändert. |
| Code-Knoten des Pilots auf Syntax prüfen | alle Code-Knoten aller vier Workflows lassen sich fehlerfrei übersetzen (mit `AsyncFunction`) |
| Pilot-Code mit Testdaten und nachgebauten n8n-Funktionen (`$()`, `$input`) in Node ausgeführt | ok: ungültiger Token = 401; `laden` als Admin, Team-Mitglied, Agent; neue Aufgabe erzeugt zwei Schreibaufträge (Aufgabe, Verlauf); Modul aus = 403 „Modul nicht aktiviert“ (Arbeitszeit, Social, Kurs); Modul an = Aktion läuft weiter; Rolle `dozent` wird ohne Freigabe zu `team`, mit Einstellung `rollen` vergeben; Token nur für Admin sichtbar; `Ergebnis prüfen` meldet fehlende Tabelle als „Modul nicht aktiviert“; Wochenstand mit und ohne `firmenwissen_projekt`; Störungs-Notiz inklusive Anhängen; Hinweis-Text mit zwei Vorschlägen |
| Importdatei-Format | Felder `name`, `nodes`, `connections`, `settings`; keine Verweise auf fehlende Knoten (per Skript geprüft); alle Knoten-IDs neu, keine `webhookId`, keine `meta`, kein `pinData`, kein `staticData`, kein `errorWorkflow` |
| `einsetzen.mjs` | läuft; setzt alle fünf Platzhalter ein, lehnt falsche Eingaben ab (zu kurze Projekt-ID, Adresse mit Pfad), prüft, dass kein Platzhalter und keine fremde Supabase-Adresse übrig ist |
| Knoten-Parameter neuer Knoten (`emailSend` 2.1, `errorTrigger` 1) | gegen die Typbeschreibung aus n8n abgeglichen (`resource`, `operation`, `fromEmail`, `toEmail`, `subject`, `emailFormat`, `text`, `options`) |

## 2. Was im Original der Portal-API geändert wurde

Zeilennummern beziehen sich auf den Code des jeweiligen Original-Knotens (veröffentlichte Fassung). Personennamen sind maskiert.

| Knoten | Zeile(n) | Änderung | vorher (maskiert) | nachher |
|---|---|---|---|---|
| Anfrage prüfen | 4 | Daten-Prüfung (Antwort ohne Mitgliederliste = 503 statt falschem „Zugang ungültig“); Einstellungen lesen, `STICHTAG` und `MODULE` bestimmen | `const D = $('Team-Daten laden').first().json \|\| {};` | gleiche Zeile plus Prüfung `Array.isArray(D.mitglieder)` und Einstellungsblock |
| Anfrage prüfen | 20 | Personenname im Text | `Bitte frag T*** nach einem neuen Link.` | `Bitte frag die Leitung nach einem neuen Link.` |
| Anfrage prüfen | 26 | Zufall für Token und IDs: `crypto.getRandomValues`, Rückfall auf `Math.random` | `s += Math.floor(Math.random() * 16)…` | `z[i] % 16`, sonst wie vorher |
| Anfrage prüfen | 124 | WhatsApp-Vorbereitung (Empfänger, Telefonnummer) entfernt | `const benachrichtigen = … empf.whatsapp_ok === true && /^\+\d{8,15}$/.test(empf.telefon …` | Kommentar |
| Anfrage prüfen | 137 | Telefonnummer und Nachricht nicht mehr im Zwischenergebnis | `schreiben(ops, { id, benachrichtigen, nachricht: { an: …telefon… } })` | `schreiben(ops, { id: row.aufgabe_id })` |
| Anfrage prüfen | 82, 316 | fest eingebautes Stichdatum | `'2026-10-05'` | `STICHTAG` (Einstellung `stichdatum_abrechnung`, sonst 1. Januar des Jahres) |
| Anfrage prüfen | 155, 165, 191, 202, 255 | Namen in Fehlertexten | `T***, K*** und M***` | `die Leitung und Dozenten` |
| Anfrage prüfen | 401, 407, 425 | Namen in Fehlertexten und Kommentar | `T*** und die Dozenten` | `die Leitung und die Dozenten` |
| Anfrage prüfen | 143, 243, 281, 304, 311, 320, 338, 348, 370, 374, 389, 399, 433, 439, 450, 455 | einzelner Name in Fehlertexten und Kommentaren | `… oder T***.` / `… gibt T*** frei.` u. ä. | `… oder die Leitung.` / `… gibt die Leitung frei.` |
| Anfrage prüfen | 103 (vor `switch`) | **neu:** Modul-Sperre für 18 Aktionen (`zeit`, `social`, `system`, `kurs`), Rollenliste `ROLLEN` | – | Antwort 403 mit `modul_nicht_aktiviert: true` |
| Anfrage prüfen | 463 | Rollenvergabe aus Einstellung statt fester Liste | `['admin','dozent','vertrieb','team'].includes(d.rolle)` | `ROLLEN.includes(d.rolle)` oder bisherige Rolle beibehalten |
| Ergebnis prüfen | 5 bis 6 | fehlende Tabelle oder Funktion wird „Modul nicht aktiviert“; Datenbank-Meldung sauber ausgelesen | `String((body.message \|\| JSON.stringify(body))…` (der Körper ist dort Text, `.message` war nie gesetzt) | Muster `PGRST205`, `42P01`, `Could not find the table` usw., sonst Meldung aus JSON |
| Antwort bauen | 7 | Stunden-Sicht für eine feste Person | `STUNDEN_SICHT = ['m_m***']` | entfernt, nur Admin (und nur mit Modul `zeit`) |
| Antwort bauen | 33, 91 | Stichdatum | `'2026-10-05'` | `STICHTAG` |
| Antwort bauen | 10, 37 bis 80 (Kurscodes in Zeile 57) | Kurs-Datentabellen (`Kurs_Lernstand`, `Kurs_Chatfragen`, `Kurs_Anfragen`) und Kursauswertung; Kurscodes | `rows('Lernstand lesen')`, `['MOMENTUM26','OFFEN']` | entfernt; `kurs` und `anfragen` kommen als leere Felder, damit die Oberfläche nicht ins Leere greift |
| Antwort bauen | 26, 33, 81 bis 92 | Social, Systeme, Zeiten, Abrechnung, Community nur bei eingeschaltetem Modul; Team-Stunden-Sicht für Nicht-Admins entfernt | immer geliefert | `MODULE.…` oder leere Liste |
| Antwort bauen | Ende | Antwort enthält jetzt `einstellungen` (firma, kurzname, raeume, rollen, pilot_ende, module) | – | neues Feld, rein ergänzend |
| Workflow | – | Knoten `Einstellungen laden` eingefügt (liest `team_einstellungen`, mit `alwaysOutputData`, damit eine leere Tabelle die Kette nicht stoppt) | – | neu |
| Workflow | – | Datentabellen-Knoten `Lernstand lesen`, `Chatfragen lesen`, `Anfragen lesen` entfernt | 3 Knoten | Weiche führt direkt zu `Antwort bauen` |
| Workflow | – | Knoten `WhatsApp schicken?` und `WhatsApp an zuständige Person` entfernt | 2 Knoten | `Gespeichert?` führt direkt zu `Gespeichert` |
| Workflow | – | `team_laden_plus` bleibt (nach Abgleich mit `003_team_laden.sql`: nur dort sind Papierkorb und Notiz-Versionen) | `…/rpc/team_laden_plus` | `…/rpc/team_laden_plus` |
| Workflow | – | Webhook-Pfad, erlaubter Ursprung, Supabase-Adresse, Credential-Verweis | `team-api-v2`, Ursprung und Projekt des Originals | Platzhalter; Credential nur als Name `Supabase (Pilot)` ohne ID |
| Einstellungen | – | `errorWorkflow` entfernt; Ausführungsdaten aus (Erfolg und Fehler), Zeitzone Europe/Berlin | Fehler: `all` | beide `none` |

Unverändert übernommen: `Social-Felder ergänzen`, `Schreibaufträge`, die Schleife `Nacheinander schreiben` mit `In Supabase schreiben`, die Antwortknoten und die Weiche. Alle Aktionen, die nicht in den Tabellen oben stehen, sind im Code unverändert.

**Wochenstand** (Original `f0AG5NxtwzSyDr2c`): Telegram-Knoten und die Kurs-Hinweise-Prüfung entfernt; Abschnitte Kurs, Social, Systeme, KI-Agenten gestrichen; festverdrahtete Autoren-/Verantwortlichen-IDs ersetzt durch das erste Mitglied mit Rolle admin; Startnotizen „Über …“ durch eine neutrale Vorlage ersetzt und nur noch angelegt, wenn die Einstellung `firmenwissen_projekt` gesetzt ist; Link und Chat-ID entfernt; `Einstellungen laden` ergänzt.

**Vorschlag-Hinweis** (Original `s8OfrONvk8JKXTrs`): Telegram durch E-Mail ersetzt (Knoten ausgeschaltet); Empfänger aus `team_mitglieder` (Rolle admin, Feld `email`); der Zeitstempel „bis hier gemeldet“ wird erst nach dem Versand gemerkt (Knoten `Zeitstempel merken`); Portal-Link über Platzhalter.

**Fehler-Workflow:** neu, kein Gegenstück im Original (das Original hatte einen eigenen Fehler-Workflow `pka7MaqDJwuhjHpY`, der nicht abgerufen wurde).

## 3. `.first()`-Falle: alle Fundstellen

Die Regel betrifft Knoten, die pro Datensatz laufen. Ergebnis je Fundstelle (Pilot-Dateien):

| Workflow | Knoten | Befund |
|---|---|---|
| Portal-API | Anfrage prüfen, Social-Felder, Antwort bauen, Ergebnis prüfen (Code, „einmal für alle Einträge“) | greifen auf Webhook und Datenabruf zu. Beide liefern genau einen Datensatz. Unkritisch. |
| Portal-API | Schreibaufträge (`$input.first()`) | bekommt genau einen Datensatz von der Weiche und macht daraus die Liste der Schreibaufträge. Unkritisch. |
| Portal-API | Gespeichert (Antwortknoten) | `$('Ergebnis prüfen').first()`: Dieser Knoten liefert immer genau einen Datensatz. Unkritisch. |
| Portal-API | In Supabase schreiben (läuft je Schreibauftrag) | benutzt nur `$json`, kein `.first()`. Richtig. |
| Wochenstand | Wochenstand bauen | ein Datensatz aus `Team-Daten laden`. Unkritisch. `In Supabase schreiben` (je Auftrag) benutzt nur `$json`. |
| Fehler-Workflow | Störung vorbereiten, Notiz bauen, Bisherige Notiz | je ein Datensatz; die Suchen haben `Nur einmal ausführen` und `alwaysOutputData`, die Admin-Suche ist auf einen Treffer begrenzt (`limit=1`). Unkritisch. |
| Hinweis | Nachricht bauen | nimmt alle Vorschläge mit `.all()`, `Mitglieder` läuft nur einmal. `Zeitstempel merken`: ein Datensatz. Unkritisch. |

Beobachtungen dazu, **nicht** geändert:

- Mehrere Datensätze: Die Kette verarbeitet je Anfrage immer nur einen Auftragsblock. Die Schleife schreibt die Aufträge nacheinander. Ich konnte das nicht mit zwei echten Datensätzen in n8n durchlaufen lassen (kein Import-Test möglich). Ein Test mit mindestens zwei Schreibaufträgen (z. B. „neue Aufgabe“ = Aufgabe plus Verlauf) gehört deshalb in den ersten Praxistest; die Testdaten oben haben diesen Fall im Code geprüft, nicht in n8n.
- Würde eine Aktion einmal **keinen** Schreibauftrag liefern, bekäme die Schleife keinen Datensatz und der Webhook bliebe ohne Antwort. Aktuell erzeugt jede Schreib-Aktion mindestens einen. Merkposten für spätere Änderungen.
- Abfragen, die eine leere Liste liefern können, stoppen die Kette ohne Fehler. Darum haben `Einstellungen laden`, `Admin suchen`, `Projekt des Admins` und `Bisherige Notiz` die Option „immer eine Ausgabe“. Bei `Neue Vorschläge` ist das Stoppen gewollt (nichts zu melden).

## 4. Weitere Befunde im Original

1. Zufall mit `Math.random()` für Zugangs-Token (im Pilot ersetzt, siehe oben; ob `crypto` auf n8n Cloud im Code-Knoten verfügbar ist, ist unbekannt, deshalb der Rückfall).
2. Fehlerläufe wurden samt Anfrage gespeichert (Token, Namen, Texte).
3. Der Admin sieht in der Antwort die Token aller Mitglieder (gewollt, unverändert).
4. Kein Schutz gegen massenhafte Anfragen, und jede Anfrage lädt die ganze Datenbank, auch mit falschem Token.
5. Schreibschritte ohne Transaktion (Aufgabe plus Verlauf getrennt).
6. Im Original meldete die Ergebnis-Prüfung rohe Datenbanktexte an den Browser (jetzt auf 300 Zeichen gekürzt und bei fehlenden Tabellen durch eine verständliche Meldung ersetzt; der Rest bleibt wie im Original).
7. Das Original markierte im Hinweis-Workflow den Zeitstempel schon vor dem Versand als gemeldet.
8. Bei `Prefer: return=minimal` gibt der Schreibknoten bewusst nichts zurück; die Antwort „gespeichert“ beruht allein auf dem Statuscode. Das ist so gewollt und richtig, ein erfolgreicher Durchlauf beweist aber nur, dass die Datenbank „2xx“ gesagt hat.
9. In `team_mitglieder` darf `whatsapp_ok`/`telefon` über `profil` weiter gesetzt werden (Feldnamen enthalten „whatsapp“). Im Pilot wird damit nichts versendet.

## 5. Was NICHT verifiziert werden konnte

- **Import in n8n** ist nicht erfolgt. Ob n8n Cloud die Dateien ohne Meldung annimmt, ist offen. Besonders:
  - Credential-Verweis ohne `id` (nur Name): n8n sollte das als „nicht zugewiesen“ anzeigen; ein Ausfall ist möglich.
  - Webhook-Knoten ohne `webhookId`: n8n vergibt beim Import eine neue; die Production-URL nutzt den festen Pfad.
  - Die Wenn-Bedingung (`Gespeichert?`) und die Schleife (Ausgänge „fertig“ = 0, „Schleife“ = 1) sind aus dem Original übernommen.
- **`crypto` im Code-Knoten von n8n Cloud:** unbekannt; sonst Rückfall auf den alten Zufall.
- **`$getWorkflowStaticData`** (Hinweis-Workflow) funktioniert nur bei aktivierten Workflows mit Zeitplan und wird nicht im Testlauf gespeichert. Wie im Original.
- **Form von `team_laden`:** Ich habe die Funktion nicht gesehen. Der Code erwartet ein Objekt mit Listen (README, Abschnitt „Was die Datenbank liefern muss“). Der Original-Workflow rief `team_laden_plus` auf; ob `team_laden` in der Endfassung Papierkorb, Notizversionen, Teilnehmer, Spalten und Community enthält, ist offen. Fehlt `papierkorb`, ist der Papierkorb leer; fehlt `notiz_versionen`, gibt es keine Notizversionen.
- **Tabelle `team_einstellungen`:** Spalten `schluessel`, `wert` laut Auftrag angenommen. Ob die Rolle des Service-Schlüssels sie lesen darf, ist offen. Die neuen Schlüssel `module` und `firmenwissen_projekt` sind Vorschläge von mir und müssen mit der Datenbank-Sitzung abgestimmt werden. Auch das Format von `rollen` (Liste von Texten angenommen; Objekte mit `rolle`, `id` oder `name` werden ebenfalls verstanden).
- **Upsert bei Notizen** (`on_conflict=notiz_id`) setzt voraus, dass `notiz_id` Primärschlüssel oder eindeutig ist (so benutzt es auch das Original).
- **E-Mail-Knoten:** nur gegen die Typbeschreibung geprüft, nie ausgeführt; sie sind ausgeschaltet und brauchen das SMTP-Credential `E-Mail (Pilot)`.
- **Tabellennamen** für Papierkorb und Notizversionen habe ich nicht gesehen (Zugriff nur über `team_laden` und die Funktionen).
- **Oberfläche:** Ob die Oberfläche (andere Sitzung) mit leeren Kurs-/Zeitfeldern, dem neuen Feld `einstellungen` und der 403-Antwort „Modul nicht aktiviert“ sauber umgeht, ist nicht geprüft.
- Das Verhalten bei **zwei gleichzeitigen Speichervorgängen** (Konfliktmeldung 409) stammt unverändert aus dem Original und wurde nicht getestet.
- Ich habe `_STATUS.md` des Projekts nicht angefasst (Auftrag: nur Dateien in `portal-pilot/n8n/`).

## 6. Kontrolle auf Altlasten (grep)

Befehl (im Ordner des Repos):

```
grep -rniE "llhwmz|hm-storage|github.io|1535|timo|kurt|murat|momentum|hermetik|telegram|chatId" portal-pilot/n8n/
```

Ergebnis:

- In den fünf Dateien `portal-api.workflow.json`, `wochenstand.workflow.json`, `fehler-workflow.workflow.json`, `hinweis-vorschlaege.workflow.json` und `einsetzen.mjs`: **keine Treffer**.
- Treffer gibt es nur in diesem Bericht (6 Zeilen; `README.md` hat keine), und zwar ausschließlich als erklärender Text (Hinweis auf das, was entfernt wurde, Namen der Original-Workflows, maskierte Namen).
- Zusätzlich gesucht, ohne Treffer außer den erklärten: `agent-claude`, `m_timo`, `2026-10-05`, `MOMENTUM26`, `require(`. Erklärte Restwörter in der Portal-API: `whatsapp_ok` (Datenbankfeld der Mitglieder), `kurs_community` (Tabelle hinter dem ausgeschalteten Modul `kurs`), das Wort „WhatsApp“ in einem Kommentar.
- Keine Telefonnummer, keine Chat-ID, keine Supabase-Projekt-ID, keine Portal-Adresse des Originals in den Zieldateien.

## 7. Abgleich beim Zusammenführen (03.11.2026, Branch `feature/portal-pilot`)

Geändert wurde nur der Code der Knoten „Anfrage prüfen“ und „Antwort bauen“ in `portal-api.workflow.json`; Knoten, Verbindungen, Einstellungen und die drei anderen Workflows sind unverändert. Zeilennummern beziehen sich auf den Code des Knotens „Anfrage prüfen“ in der Fassung vor der Änderung.

| Knoten | Zeile(n) | Änderung | vorher | nachher |
|---|---|---|---|---|
| Anfrage prüfen | 44, 70 | Ländervorwahl als Konstante aus der Einstellung `landesvorwahl` (Standard 49); Beispielnummer im Fehlertext ohne Pluszeichen | feste Vorwahl 49 im Code, Beispielnummer mit Pluszeichen im Fehlertext | `'+' + LANDESVORWAHL + s.slice(1)`, `z. B. 0049 170 …` |
| Anfrage prüfen | 82, 364 | Vorschlags-Bereich: Liste aus der Einstellung `vorschlag_bereiche` (unbekannt → „Sonstiges“), ohne Liste freier Text bis 40 Zeichen; beim Bearbeiten ohne Angabe bleibt der alte Bereich | feste Liste mit zwölf Registernamen | `listeAus('vorschlag_bereiche')`, `ausListe(…)` |
| Anfrage prüfen | 192, 196 | Social-Kanal: Liste aus der Einstellung `social_kanaele`, sonst freier Text bis 40 Zeichen | feste Liste mit acht Kanälen (darunter ein Markenname, der im Pilot nicht vorkommen darf) | `listeAus('social_kanaele')` |
| Anfrage prüfen | 138, 167 | `geaendert_von` bei `aufgabe_speichern` und `kommentar` (Spalte in `001_basis.sql` ergänzt) | nur `geaendert` | `geaendert, geaendert_von: ich.mitglied_id` |
| Anfrage prüfen | 479, 481 | Zugangscodes neuer Mitglieder und bei „neuer Link“: 48 Hex-Zeichen wie `team_token_neu()` | `rnd(32)` | `rnd(48)` |
| Antwort bauen | 26 | Antwort `einstellungen` enthält zusätzlich `vorschlag_bereiche` und `social_kanaele` (Listen, bereinigt) | sechs Felder | acht Felder |

Geprüft nach der Änderung: alle Code-Knoten lassen sich übersetzen (`AsyncFunction`), `einsetzen.mjs` läuft, JSON gültig; `node --test portal-pilot/test/*.test.mjs` grün, darunter `server.test.mjs` (Speicher) und `ende-zu-ende.test.mjs` (lokaler PostgreSQL mit `001`–`003`, `900`, `100`, `120`), beide mit genau diesem Workflow-Code über `dev/n8n-laufzeit.mjs`.

Nachgebildet werden in `dev/n8n-laufzeit.mjs` nur die n8n-Funktionen, die der Workflow nutzt: `$('Knoten').first()/.all()/.item`, `$input.all()/.first()`, `$json` in Ausdrücken `={{ … }}`, die Knoten-Typen webhook, httpRequest (mit `fullResponse`/`neverError`/`responseFormat text`), code (`runOnceForAllItems`), switch (Ausdruck), if (boolean true), respondToWebhook, splitInBatches (Ausgang 0 = fertig, Ausgang 1 = Schleife) sowie `alwaysOutputData` und `executeOnce`. Ob n8n Cloud sich in Randfällen anders verhält (z. B. Reihenfolge bei mehreren Ausgängen, Umgang mit `text/plain`-Bodies), bleibt ein Punkt für den ersten Praxistest.

### Original-Workflows, die nicht übernommen wurden (nur hier, nicht im Paket)

| Teil | Original-Workflow (ID in der Original-Instanz) |
|---|---|
| KI Office (API, Ausführer, Wartung) | `NuK6m10yIGKMRWxC` (Office-API), `UbQ5nph8FIUSrasi` (Text-KI), `D0jPTU1LjNzhGfyI` (Orchestrierer), `KwRsEDr743IGDPJ1` (Verwaltung-Status) |
| Portal-Assistent (Chatfragen, KI) | `TJ5E1KT5MvzxvoD9` |
| Erinnerungen und Monatsabschluss Arbeitszeit | `QwVgLNfbjDtUOPqD` (Freitag-Freigabe), `gV6jrDNtJhgKbqpp` (Monatsabschluss) |
| Webseiten-Statistik | `mkgTfndZQnmnpsdW` |
| Vertriebs-Pipeline (CRM) und Diktat | `cWDiokGOeQT5uFsY`, `Zvn018lfOXFuzenF` |
| Social (Upload, Veröffentlichen) | `ZfStqgtH3IZugnv5`, `p6DSEWCr344R0Nlt` |
| WhatsApp (Inbox, Hinweise, Bot) | `PUrXB6zVrUjUpbGh`, `QG7TlVF1CzjlmnDf`, `DVGX3cltu2qbqLJE` |
| Kurs (Störungswächter, Klassenbuch) | `aZgKgrnuzjmG9Mjr`, `nej6aYHT2S7Ztip2`, `rQcqNn8EqBmW5yYa` |

Die drei Quellen der Pilot-Workflows im Original: Portal-API `kMuDaDmT9rCN5Vs2`, Wochenstand `f0AG5NxtwzSyDr2c`, Vorschlag-Hinweis `s8OfrONvk8JKXTrs`.
