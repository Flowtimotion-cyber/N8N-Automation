# Pilot-Portal: n8n-Workflows (Stufe 1)

Diese Ordner enthält die n8n-Workflows für die Pilot-Kopie des Team-Portals (Planer und Übersicht: Aufgaben, Projekte, Notizen, Vorschläge, Team). Sie laufen auf **n8n Cloud** und sprechen mit **einem eigenen Supabase-Projekt je Kunden**.

**Stand:** gebaut und im Code mit Testdaten durchgespielt, aber **noch nicht in n8n importiert**. Was dabei noch schiefgehen kann, steht in `PRUEFUNG.md`.

## Was ist drin

| Datei | Was sie tut | Pflicht? |
|---|---|---|
| `portal-api.workflow.json` | Die Schnittstelle des Portals. Jeder Klick im Portal landet hier: Zugang prüfen, Rechte prüfen, lesen oder schreiben. | ja |
| `fehler-workflow.workflow.json` | Springt an, wenn ein anderer Workflow einen Fehler hat. Schreibt eine Notiz „Störung TT.MM.JJJJ“ ins Portal und kann eine E-Mail schicken (ausgeschaltet). | ja, empfohlen |
| `wochenstand.workflow.json` | Schreibt montags um 7 Uhr eine Notiz mit dem Stand der Vorwoche (erledigt, neu, fällig, überfällig). Ohne KI. | optional |
| `hinweis-vorschlaege.workflow.json` | Vorlage: schickt eine E-Mail an die Admins, wenn jemand einen Vorschlag einträgt. E-Mail-Knoten ist **ausgeschaltet**. | optional |
| `einsetzen.mjs` | Kleines Skript: trägt Supabase-Projekt, Kürzel und Portal-Adresse ein und schreibt fertige Importdateien. | ja |

## Reihenfolge: so bringst du alles in n8n Cloud

**Schritt 0: Importdateien erzeugen.** Auf deinem Rechner (Node 18 oder neuer) im Ordner des Repos:

```
node portal-pilot/n8n/einsetzen.mjs --supabase DEINE-PROJEKT-ID --kuerzel ifa --origin https://portal.beispiel.de --ausgabe fertig/ifa/
```

- `--supabase`: die Projekt-ID aus Supabase (der Teil vor `.supabase.co`). Die ganze Adresse geht auch.
- `--kuerzel`: kurzes Kürzel des Kunden, nur Kleinbuchstaben, Ziffern, Bindestrich. Wird Teil der Webhook-Adresse.
- `--origin`: die Adresse, unter der das Portal liegt, **ohne Pfad** (nur `https://…`). Nur von dieser Adresse aus darf der Browser die Schnittstelle aufrufen.
- Optional: `--portal-url` (voller Link zum Portal für E-Mails) und `--absender` (Absender der E-Mails).

Das Skript prüft, dass kein Platzhalter übrig bleibt, und schreibt vier fertige Dateien in den Ausgabeordner. Die fertigen Dateien enthalten keine Zugangsdaten; trotzdem nicht öffentlich ablegen (Supabase-Adresse des Kunden).

**Schritt 1: Credentials in n8n anlegen** (links unten „Credentials“ → „Create credential“):

1. Typ **Supabase API**, Name genau `Supabase (Pilot)`. Dort trägst du die Adresse des Supabase-Projekts (`https://DEINE-ID.supabase.co`) und den **Service-Role-Schlüssel** ein. Der Schlüssel darf nur hier stehen, nirgends sonst (nicht in Dateien, nicht im Chat, nicht im Portal-Code).
2. Optional, nur wenn du E-Mails willst: Typ **SMTP**, Name genau `E-Mail (Pilot)`.

**Schritt 2: Fehler-Workflow importieren.** „Workflows“ → „Import from file“ → `fehler-workflow.workflow.json`. Öffnen, die vier Supabase-Knoten durchklicken und überall `Supabase (Pilot)` wählen. Speichern. **Nicht aktivieren**, das ist nicht nötig: Ein Fehler-Workflow läuft, sobald ein anderer Workflow ihn als „Error Workflow“ eingetragen hat.

**Schritt 3: Portal-API importieren.** Gleicher Weg mit `portal-api.workflow.json`. In allen drei Supabase-Knoten (`Team-Daten laden`, `Einstellungen laden`, `In Supabase schreiben`) das Credential `Supabase (Pilot)` wählen.

**Schritt 4: Einstellungen des Workflows prüfen** (oben rechts die drei Punkte → „Settings“):

- „Error Workflow“: `PORTAL: Fehler-Workflow (Pilot) [ifa]` auswählen.
- „Save successful production executions“: **Do not save**.
- „Save failed production executions“: **Do not save**.
- „Save manual executions“: aus.
- Zeitzone: Europe/Berlin.

Die Datei bringt diese Werte schon mit; schau trotzdem nach, ob n8n sie übernommen hat (Datenschutz: sonst landen die Portal-Daten in den n8n-Ausführungsdaten).

**Schritt 5: Webhook-Adresse ablesen.** Den Knoten `Team-API` öffnen. Dort stehen „Test URL“ und „Production URL“. Du brauchst die **Production URL**. Sie sieht so aus:

`https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api`

Der Teil vor `/portal-api` ist der Wert für `n8n_basis_url` in der Konfiguration der Oberfläche: `https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa`. Die Oberfläche hängt `/portal-api` selbst an.

**Schritt 6: Aktivieren.** Oben rechts den Schalter „Active“ einschalten (in neueren Versionen: „Publish“). Die Production URL funktioniert erst, wenn der Workflow aktiv ist.

**Schritt 7: Testen mit `curl`** (in einem Terminal):

```
curl -i -X POST "https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api" -H "Content-Type: application/json" -d '{"aktion":"laden","token":"kein-gueltiger-token"}'
```

Erwartet: `HTTP 401` und eine Antwort mit `"ok":false` und dem Satz „Dein Zugang ist ungültig …“. Kommt das, läuft die Kette bis zur Datenbank (der Token wird gegen die Mitgliederliste geprüft). Kommt `404`, ist der Workflow nicht aktiv oder die Adresse stimmt nicht. Kommt `500` oder keine Antwort, schau in die Supabase-Knoten (falsches Credential, Funktion `team_laden_plus` fehlt).

Test mit gültigem Zugang: dasselbe mit dem echten Token eines Admins (aus der Tabelle `team_mitglieder` in Supabase). Erwartet: `"ok":true` und deine Aufgaben, Projekte usw. Token nicht in Chats oder Tickets einfügen.

**Schritt 8: Optional Wochenstand und Hinweis.** Import wie oben. Beim Wochenstand: Credential wählen, Error Workflow eintragen, aktivieren. Beim Hinweis zuerst die Hinweise unten lesen.

## Was die Datenbank liefern muss

Die Workflows rufen diese Dinge in Supabase auf. Das ist die Schnittstelle zur Datenbank-Sitzung:

- `rpc/team_laden_plus` (POST, Body `{}`): liefert **ein JSON-Objekt** mit den Listen `mitglieder`, `aufgaben`, `verlauf`, `projekte`, `notizen`, `vorschlaege`, `zeiten`, `abrechnung`, `systeme`, `social`, `community`, `papierkorb`, `notiz_versionen`, `teilnehmer`, `tn_spalten` und dem Objekt `einstellungen`. Fehlende optionale Tabellen = leere Liste. Die Funktion kommt aus `portal-pilot/supabase/003_team_laden.sql` (dort ist `team_laden_plus` = `team_laden` plus Papierkorb, Notiz-Versionen, Teilnehmer).
- Tabelle `team_einstellungen(schluessel text, wert jsonb)`: wird per PostgREST gelesen (Knoten `Einstellungen laden`). Ist sie nicht da oder leer, laufen die Workflows mit Standardwerten.
- `rpc/team_loeschen(p_art, p_id, p_von)` und `rpc/team_wiederherstellen(p_eintrag)` für den Papierkorb.
- Tabellen: `team_mitglieder`, `team_aufgaben`, `team_aufgaben_verlauf`, `team_projekte`, `team_notizen`, `team_vorschlaege` (Stufe 1). Alles Weitere nur, wenn ein Modul eingeschaltet wird (siehe Tabelle unten).

### Einstellungen, die die Workflows auslesen

| Schlüssel | Wirkung | Standard, wenn nicht gesetzt |
|---|---|---|
| `module` | Schaltet Module ein, z. B. `{"zeit": true}`. Mögliche Schlüssel: `zeit`, `social`, `system`, `kurs`. **Neu vorgeschlagen**, bitte mit der Datenbank-Sitzung abgleichen. | alles aus |
| `stichdatum_abrechnung` | Beginn der Arbeitszeit-Abrechnung, z. B. `"2026-12-01"` (nur Modul `zeit`) | 1. Januar des laufenden Jahres |
| `rollen` | Liste zusätzlicher Rollen, die man im Team vergeben darf, z. B. `["dozent"]`. `admin` und `team` gehen immer. | nur `admin`, `team` |
| `firma`, `kurzname`, `raeume`, `pilot_ende` | gehen unverändert an die Oberfläche (Feld `einstellungen` in der Antwort `laden`); `kurzname` und `firma` stehen außerdem in den Startnotizen des Wochenstands | leer |
| `firmenwissen_projekt` | `true` oder ein Projektname. Nur dann legt der Wochenstand beim ersten Lauf ein Projekt mit zwei neutralen Startnotizen („Aktuelles“, „Über uns“) an. **Neu vorgeschlagen.** | nichts wird angelegt |

## Alle Aktionen der Portal-API

Die Portal-API kennt 34 Aktionen. Der Aufruf ist immer ein POST mit `{"aktion": "...", "token": "...", "daten": {...}}`. „Stufe 1“ heißt: gehört zum Pilot-Umfang. Bei allen anderen Aktionen antwortet die API mit **„Modul nicht aktiviert“** (HTTP 403), solange das Modul nicht über die Einstellung `module` eingeschaltet ist.

| Aktion | Wer darf | Stufe 1 | Tabelle / Funktion |
|---|---|---|---|
| `laden` | alle Aktiven (Agenten bekommen eine kleinere Antwort) | ja | liest alles über `team_laden_plus` |
| `profil` | jede Person für sich (Aktivierung per Einladungslink) | ja | `team_mitglieder` |
| `aufgabe_speichern` | alle (Agent: „Erledigt“ wird zu „Wird getestet“) | ja | `team_aufgaben`, `team_aufgaben_verlauf` |
| `aufgabe_loeschen` | Admin oder wer sie angelegt hat | ja | Papierkorb über `team_loeschen` |
| `kommentar` | alle | ja | `team_aufgaben_verlauf`, `team_aufgaben` |
| `projekt_speichern` | zuständige Person, Admin, Dozent (Agent darf) | ja | `team_projekte` |
| `projekt_loeschen` | Admin (nur ungenutzte Projekte) | ja | `team_projekte` |
| `notiz_speichern` | alle (Agent darf) | ja | `team_notizen` |
| `notiz_loeschen` | Admin oder Autor | ja | Papierkorb über `team_loeschen` |
| `notiz_versionen` | alle | ja | Versionsliste aus `team_laden_plus` |
| `vorschlag_speichern` | alle (Status und Antwort nur Admin; Agent darf) | ja | `team_vorschlaege` |
| `vorschlag_stimme` | alle | ja | `team_vorschlaege` |
| `vorschlag_loeschen` | Admin oder Autor (solange „neu“) | ja | Papierkorb über `team_loeschen` |
| `papierkorb` | Admin sieht alles, andere nur Eigenes | ja | Papierkorb-Liste aus `team_laden_plus` |
| `papierkorb_wiederherstellen` | Admin oder wer gelöscht hat | ja | `team_wiederherstellen` |
| `mitglied_speichern` | Admin | ja | `team_mitglieder` |
| `zeit_speichern` | alle Menschen | nein (Modul `zeit`) | `team_zeiten` |
| `zeit_loeschen` | eigene Einträge, Admin | nein (Modul `zeit`) | Papierkorb |
| `woche_einreichen` | eigene Woche | nein (Modul `zeit`) | `team_zeiten` |
| `zeiten_pruefen` | Admin | nein (Modul `zeit`) | `team_zeiten` |
| `vertrag_speichern` | die Person selbst, Admin | nein (Modul `zeit`) | `team_mitglieder` |
| `monat_abschliessen` | Admin | nein (Modul `zeit`) | `team_abrechnung` |
| `monat_aufheben` | Admin | nein (Modul `zeit`) | `team_abrechnung` |
| `social_speichern` | alle (Agent darf, aber nie „Geplant“) | nein (Modul `social`) | `team_social` |
| `social_loeschen` | alle Menschen | nein (Modul `social`) | Papierkorb |
| `system_speichern` | Admin, Dozent | nein (Modul `system`) | `team_systeme` |
| `system_loeschen` | Admin, Dozent | nein (Modul `system`) | Papierkorb |
| `teilnehmer` | Admin, Dozent | nein (Modul `kurs`) | `team_teilnehmer`, `team_tn_spalten` |
| `tn_speichern` | Admin, Dozent | nein (Modul `kurs`) | `team_teilnehmer`, `team_tn_haken` |
| `tn_haken` | Admin, Dozent | nein (Modul `kurs`) | `team_tn_haken` |
| `tn_loeschen` | Admin | nein (Modul `kurs`) | Papierkorb |
| `tn_spalte_speichern` | Admin | nein (Modul `kurs`) | `team_tn_spalten` |
| `community_antwort` | Admin, Dozent | nein (Modul `kurs`) | `kurs_community` |
| `community_status` | Admin, Dozent | nein (Modul `kurs`) | `kurs_community` |

16 Aktionen gehören zu Stufe 1, 18 sind hinter Modulen.

Hinweis zu Rollen: „Admin“ ist die Leitung. „Dozent“ gibt es nur, wenn du die Rolle über die Einstellung `rollen` freischaltest.

## Platzhalter

Das Skript `einsetzen.mjs` ersetzt diese Platzhalter. Direkt in n8n eintragen musst du sie nicht.

| Platzhalter | Steht in | Wird ersetzt durch |
|---|---|---|
| `HIER_SUPABASE_PROJEKT` | alle Supabase-Knoten, alle Dateien | `--supabase` (Projekt-ID) |
| `PILOTKUERZEL` | Webhook-Pfad der Portal-API | `--kuerzel` |
| `HIER_PORTAL_ORIGIN` | erlaubter Ursprung (CORS) im Webhook-Knoten | `--origin` |
| `HIER_PORTAL_URL` | Link in der Hinweis-E-Mail | `--portal-url`, sonst `--origin` |
| `HIER_ABSENDER_EMAIL` | E-Mail-Knoten (ausgeschaltet) | `--absender`, sonst ein erkennbarer Dummy |

Credential-Namen (nicht ersetzbar, bitte genau so anlegen): `Supabase (Pilot)` (Typ Supabase API) und `E-Mail (Pilot)` (Typ SMTP).

## Hinweise zu n8n Cloud

- **Jeder Klick im Portal ist eine Ausführung.** Das Portal lädt beim Öffnen alles und jedes Speichern ist ein weiterer Aufruf. Bei vier Personen sind das schnell mehrere hundert Ausführungen pro Woche. Welcher Tarif der Instanz zugrunde liegt, ist nicht bekannt: Schau im n8n-Konto unter „Usage“ nach, wie viele Ausführungen im Monat enthalten sind, und rechne grob nach.
- **Der Hinweis-Workflow läuft stündlich** (rund 720 Ausführungen im Monat, auch wenn nichts passiert; im Original waren es 10 Minuten). Bei einem kleinen Tarif zählt das mit. Entweder gar nicht aktivieren oder auf Werktage tagsüber beschränken.
- Jeder Aufruf lädt die **ganze** Datenbank (`team_laden_plus`). Bei vier Personen ist das unkritisch, bei sehr vielen Notizen oder Aufgaben wird es langsamer.
- Webhook-Antworten haben bei n8n Cloud eine Zeitgrenze. Die Schreibkette ist kurz und bleibt weit darunter.
- Auf n8n Cloud gibt es kein Dateisystem und keine Server-Umgebungsvariablen. Die Workflows brauchen beides nicht. `$vars` wird nicht benutzt, `require(...)` kommt in keinem Code-Knoten vor.

## Was nicht enthalten ist

Diese Teile aus dem Original gehören **nicht** zum Pilot. Sie liegen weiter in der Original-n8n-Instanz (IDs dort):

| Teil | Original-Workflow (ID) |
|---|---|
| KI Office (API, Ausführer, Wartung) | `NuK6m10yIGKMRWxC` (Office-API), `UbQ5nph8FIUSrasi` (Text-KI), `D0jPTU1LjNzhGfyI` (Orchestrierer), `KwRsEDr743IGDPJ1` (Verwaltung-Status) |
| Portal-Assistent (Chatfragen, KI) | `TJ5E1KT5MvzxvoD9` |
| Erinnerungen und Monatsabschluss Arbeitszeit | `QwVgLNfbjDtUOPqD` (Freitag-Freigabe), `gV6jrDNtJhgKbqpp` (Monatsabschluss) |
| Webseiten-Statistik | `mkgTfndZQnmnpsdW` |
| Vertrieb-Pipeline (Twenty) und Diktat | `cWDiokGOeQT5uFsY`, `Zvn018lfOXFuzenF` |
| Social (Upload, Veröffentlichen) | `ZfStqgtH3IZugnv5`, `p6DSEWCr344R0Nlt` |
| WhatsApp (Inbox, Hinweise, Bot) | `PUrXB6zVrUjUpbGh`, `QG7TlVF1CzjlmnDf`, `DVGX3cltu2qbqLJE` |
| Kurs (Störungswächter, Klassenbuch) | `aZgKgrnuzjmG9Mjr`, `nej6aYHT2S7Ztip2`, `rQcqNn8EqBmW5yYa` |

Die drei Quellen dieser Pilot-Workflows im Original: Portal-API `kMuDaDmT9rCN5Vs2`, Wochenstand `f0AG5NxtwzSyDr2c`, Vorschlag-Hinweis `s8OfrONvk8JKXTrs`.

Aktionen der ausgeschalteten Module sind in der Portal-API noch vorhanden (so bleibt die Oberfläche kompatibel), antworten aber mit „Modul nicht aktiviert“.

## Befunde aus der Prüfung des Originalcodes

Ausführlich mit Zeilen: `PRUEFUNG.md`. Das Wichtigste in Kürze:

1. **Keine Hintertür gefunden.** Im veröffentlichten Stand der Portal-API gibt es keinen `_test`-Zugang, keinen Testmodus, der die Token-Prüfung umgeht, und keinen festen Token. Der Zugang hängt allein am persönlichen Token aus der Mitgliedertabelle. (Ein „Testmodus: nur eine Telefonnummer“ steht in der Beschreibung des WhatsApp-Bots, der gar nicht Teil des Pilots ist.)
2. **Zugangs-Token wurden mit `Math.random()` erzeugt**, das ist nicht für Geheimnisse gedacht. Der Pilot nimmt dafür den Zufallsgenerator des Systems (`crypto`), mit Rückfall auf die alte Methode, falls er in n8n nicht zur Verfügung steht. Ob er auf n8n Cloud verfügbar ist, konnte ich nicht prüfen.
3. **Das Original speicherte fehlgeschlagene Ausführungen komplett (`all`).** Darin liegen Anfrage und Token. Im Pilot ist das aus.
4. **Der Admin bekommt in der Antwort die Zugangs-Token aller Mitglieder.** Das ist gewollt (Einladungslinks weitergeben), bleibt unverändert. Folge: Wer das Admin-Konto übernimmt, kommt an alle anderen Zugänge.
5. **Der Webhook-Schutz „erlaubter Ursprung“ gilt nur für Browser.** Mit `curl` kann jeder die Adresse aufrufen. Schutz ist allein der Token (mindestens 20 Zeichen, bei neuen Zugängen 32 Zeichen). Es gibt keine Bremse gegen massenhaftes Raten, und jede Anfrage, auch eine ungültige, lädt die ganze Datenbank. Empfehlung: Webhook-Adresse nicht streuen; bei Bedarf später eine leichte Vorprüfung vor `team_laden_plus` setzen.
6. **`.first()`-Falle:** Alle Stellen geprüft. Alle laufen in Knoten, die genau einen Datensatz haben oder nur einmal je Durchlauf laufen. Nichts geändert. Details in `PRUEFUNG.md`.
7. **`require(`:** nirgends.
8. **Mehrere Schreibschritte ohne Transaktion** (z. B. Aufgabe speichern und danach Verlaufseintrag): bricht der zweite Schritt ab, ist die Aufgabe gespeichert, der Verlaufseintrag fehlt. Die Antwort meldet dann einen Fehler.
9. **Im Original wurde der Zeitstempel „bis hier gemeldet“ vor dem Versand gespeichert.** Schlug der Versand fehl, ging die Meldung verloren. In der Hinweis-Vorlage wird er erst nach dem Versand gemerkt.
10. **Telefonnummern wurden bei neuen Aufgaben im Zwischenergebnis weitergereicht** (für WhatsApp). Im Pilot entfernt.

## Abgleich mit dem Datenbankpaket (02.11.2026, abends)

- `team_laden_plus` ist die richtige Funktion (Papierkorb und Notiz-Versionen kommen nur dort). Im Datenbankpaket (`portal-pilot/supabase/003_team_laden.sql`) liefert sie zusätzlich `einstellungen`; die Workflows lesen die Einstellungen außerdem direkt aus `team_einstellungen` (Knoten „Einstellungen laden“), beides passt.
- Einstellungsschlüssel, die das Datenbankpaket anlegt: `firma`, `kurzname`, `stichdatum_abrechnung`, `raeume`, `rollen`, `pilot_ende`. Zwei weitere nutzen die Workflows optional, mit Standardwert, wenn sie fehlen: `module` (Objekt, z. B. `{"zeit": true}`; Standard: alles aus) und `firmenwissen_projekt` (Projektname für die Wochenstand-Notiz; Standard: keine Anlage). Beide lassen sich mit `team_einstellung_setzen('module', '{"zeit": true}')` setzen.
- `rollen`: die Workflows akzeptieren eine Liste von Texten oder von Objekten mit `rolle`/`id`; das Datenbankpaket liefert Objekte. Passt.
