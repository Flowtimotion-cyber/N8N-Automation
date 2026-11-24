# Nachrichten im Team-Portal

Teammitglieder schicken sich im Portal Nachrichten, an eine oder mehrere Personen und auch an sich selbst. Das Portal kann auch selbst Nachrichten schicken (ohne Absender), z. B. zu einem Ereignis.

## Was man sieht

- **Symbol neben dem eigenen Avatar** (rechts oben): Es erscheint nur, wenn die eigene Liste nicht leer ist. **Rot** mit Zahl, solange es ungelesene Nachrichten gibt, sonst **grau**. Ein Klick öffnet den Posteingang.
- **Posteingang:** neueste zuerst. Ungelesene Nachrichten sind fett, rot hinterlegt und haben einen roten Punkt.
- **Nachricht lesen:** Absender, Empfänger, Absendezeit, die eigene Empfangszeit (erstes Öffnen) und der formatierte Text. Beim Öffnen gilt die Nachricht als gelesen. Knöpfe:
  - **Als ungelesen schließen:** Die Nachricht wird wieder ungelesen, z. B. zur Wiedervorlage am nächsten Tag. Die Empfangszeit bleibt.
  - **Antworten:** Der Absender ist vorausgewählt, die Nachricht wird zitiert.
  - **Schließen**
- **Nachricht schreiben:** im Register „Team“ oben über „✉ Nachricht schreiben“ und bei jeder Person über „✉ Nachricht“ (die Person ist dann vorausgewählt), außerdem im Posteingang. Den Text formatiert man wie bei Notizen und Aufgaben.

## Markieren mit @Vorname

Schreibt jemand in einem Text `@Vorname`, z. B. `@kurt`, bekommt diese Person beim Speichern automatisch eine Nachricht vom Schreibenden: „**Timo** hat Dich [hier](…) markiert.“ Darunter steht, wo das war, z. B. „Notiz: ‚Planung Workshop‘“. „hier“ öffnet die Stelle im Portal.

- **Ausgewertet beim Speichern von:** Aufgaben (Beschreibung und Kommentar, auch Kommentare aus „Für dich“), Notizen, Projekten (Beschreibung), Vorschlägen (Text und Antwort) und Social-Beiträgen (Text).
- **Ziel des Links:** Aufgaben, Notizen und Projekte öffnen direkt. Bei Vorschlägen und Social-Beiträgen führt der Link zum Register, weil es für sie keine eigene Adresse gibt.
- **Wer benachrichtigt wird:** nur **neu** markierte Personen. Wer schon im alten Text markiert war, bekommt beim nächsten Speichern nichts mehr. Auch wer sich **selbst** markiert, bekommt die Nachricht (Wiedervorlage). Mehrere neu Markierte bekommen eine gemeinsame Nachricht.
- **Gültige Kennungen:**
  - `@Vorname`, nur wenn der Vorname im Team eindeutig ist
  - oder der ganze eingetragene Name, jedes Leerzeichen durch `_` ersetzt: „Anna Müller“ → `@Anna_Müller`, „Anna von Kurz“ → `@Anna_von_Kurz`

  Leerzeichen gehören nie zu einer Kennung: `@Anna Müller` ist nur `@Anna`. Ein Punkt gehört nur dazu, wenn er im eingetragenen Namen steht: `@anna.von.kurz` ist nur `@anna`. Ein Satzzeichen direkt dahinter (`@Anna_Müller.`) stört nicht.
- **Nicht eindeutig:** Ein nicht eindeutiges `@Anna` geht an niemanden. Der Schreibende sieht eine orange Warnung (10 Sekunden, Klick schließt sie) mit den gültigen Kennungen, z. B. „Bitte so markieren: @Anna_Berg oder @Anna_von_Kurz“. Gültige Markierungen im selben Text werden trotzdem verschickt.
- **Unbekannt:** Passt eine Markierung zu keinem Mitglied (Tippfehler wie `@Timmo`, falscher Name wie `@Kurt_Mueller`), geht ebenfalls nichts raus, und es erscheint dieselbe orange Warnung. Ausnahme Social-Beiträge: Dort sind @-Namen meist Instagram-Konten, darum keine Warnung.
- **Keine Markierung:** `@alle` und `@team` lösen keine Nachricht aus; sie erscheinen weiter nur in „Für dich“. E-Mail-Adressen wie `mail@kurt.de` gelten nicht als Markierung. Groß-/Kleinschreibung ist egal.
- **„Für dich“** (Übersicht, „Du wurdest erwähnt“) nutzt dieselben Regeln.
- **Wo das steckt:** in der Klasse `C_MsgsList_Global` in `docs/team/index.html`: `kennungen(m)`, `markierungen(text)`, `markierte(text)` und `markierungenMelden(paare, ort)`. Der Versand läuft über den normalen Nachrichtendienst; n8n und Supabase bleiben unverändert.

## Nachrichten bearbeiten (Posteingang und Team-Chat)

Timos Entscheidungen vom 23.11.2026:

- **Wer:** nur wer die Nachricht geschrieben hat. Nachrichten des Portals (ohne Absender) und Hinweise im Chat kann niemand bearbeiten.
- **Wie lange:** bis **24 Stunden** nach dem Senden. Danach verschwindet der Knopf, und die Datenbank lehnt ab.
- **Was die anderen sehen:** „bearbeitet“ mit Zeitpunkt (im Chat unter der Nachricht, im Posteingang in der Liste und im Lesedialog). Der Lesestand bleibt; eine bearbeitete Nachricht wird nicht wieder ungelesen.
- **Alte Fassung:** bleibt in der Tabelle `team_nachricht_fassungen` gespeichert (eine Zeile je Bearbeitung, Text vor der Änderung). Im Portal wird sie nicht gezeigt.
- **@-Markierungen im Chat:** Kommt beim Bearbeiten jemand neu dazu, bekommt nur diese Person einen Hinweis im Posteingang („… in einer bearbeiteten Nachricht“). Wer schon einmal markiert war, auch in einer früheren Fassung, bekommt nichts. Beim Bearbeiten nie eine WhatsApp. Im Posteingang lösen @-Namen wie bisher nichts aus.

**Wo man bearbeitet:**
- **Chat:** an der eigenen Nachricht das kleine **✎** neben der Uhrzeit.
- **Posteingang:** oben im Posteingang der Reiter **📤 Gesendet** (auch im Register „Team“ neben „✉ Nachricht schreiben“), Nachricht öffnen, **✎ Bearbeiten**. Dort steht auch, wer die Nachricht wann zuerst geöffnet hat. Nachrichten an sich selbst lassen sich auch direkt im Lesedialog bearbeiten.

**Technik:** `supabase/team_bearbeiten.sql` (neue Spalte `bearbeitet` in `team_msgs` und `team_chat_nachrichten`, Tabelle `team_nachricht_fassungen`, Funktionen `team_msgs_gesendet`, `team_msgs_bearbeiten`, `team_chat_bearbeiten`; `team_chat_verlauf` liefert zusätzlich `bearbeitete`, damit alle die Änderung beim Nachladen sehen). Neue Aktionen im Server: `gesendet` und `bearbeiten` (Nachrichten), `bearbeiten` (Chat). Alles rückwärtsverträglich: Alte Portal-Fassung, Team-App und n8n laufen ohne Änderung weiter.

**Einspielen (Reihenfolge egal, bis alles da ist, meldet „Bearbeiten“ verständlich, dass es noch fehlt):**
1. **Timo:** `supabase/team_bearbeiten.sql` im Supabase SQL Editor ausführen. Die Kontrollabfrage am Ende zeigt zweimal `bearbeitet` und `team_nachricht_fassungen`.
2. **n8n nach Timos Ja:** `nachrichten/n8n/deploy/bearbeiten-deploy.json` (gebaut mit `node nachrichten/n8n/bauen-deploy-bearbeiten.mjs`). Ändert in „TEAM: Nachrichten (Portal)“ und „TEAM: Chat (Portal)“ nur den Code von „Anfrage prüfen“ und „Antwort bauen“. Abgleich und Schritte stehen in der Datei („anleitung“). Achtung: Im Nachrichten-Workflow lag am 23.11.2026 ein unveröffentlichter Entwurf über der Live-Version.
3. **PR mergen**, GitHub Pages liefert die Oberfläche aus.

**Tests:** `nachrichten/test/nachrichten.test.mjs` (Logik, Nachbildung, Deploy-Datei), `nachrichten/test/sql-bearbeiten.test.mjs` (SQL gegen echtes Postgres, mit `PGLITE_PFAD`, siehe `chat/README.md`), `nachrichten/test/bearbeiten.browser.test.mjs` (Chat und Posteingang, Desktop und Handy, 24-Stunden-Grenze). Bildschirmfotos: `nachrichten/screenshots/*bearbeit*.png`, `desktop-gesendet.png`.

## Aufbau

| Ebene | Datenbank | Im Portal |
|---|---|---|
| Alle Nachrichten: Absender (`null` = Team-Portal), Empfänger (nicht leere Liste), Text, Absendezeit, Empfangszeit je Empfänger (`empfangen`, erstes Öffnen) | `team_msgs` | `MsgsList_Global`, Singleton der Klasse `C_MsgsList_Global` |
| Je Mitglied: Verweise in die globale Liste mit Lesestand (`gelesen`) | `team_msgs_user` | `MsgsList_User`, Singleton der Klasse `C_MsgsList_User` |

Beide Objekte gibt es immer. Fehlt die Datenbank noch oder ist sie nicht erreichbar, sind sie leer: `MsgsList_User.laenge` und `MsgsList_Global.anzahl` sind dann 0, und das Symbol erscheint nicht. Die Liste eines Mitglieds besteht aus seinen Zeilen in `team_msgs_user`. Bevor die erste Nachricht kommt, gibt es dort keine Zeilen.

```
Portal (Browser)  ──POST { token, aktion, daten }──▶  n8n „TEAM: Nachrichten (Portal)“ (Webhook team-msgs)
                                                        1. Mitglied per Token in Supabase prüfen
                                                        2. Eingaben prüfen; Absender = angemeldetes Mitglied
                                                        3. Supabase-Funktion team_msgs_laden | _senden | _oeffnen | _ungelesen
                                                        4. Fehlt die Datenbank: „laden“ → leere Liste, sonst Hinweis
```

Jedes Mitglied liest und ändert nur die eigene Liste. Die ID des Mitglieds kommt immer aus dem Token, nie aus den Daten des Browsers. Die Portal-API v2 bleibt unverändert.

## Nachrichten vom Portal selbst (ohne Absender)

Andere n8n-Workflows rufen die Funktion mit `p_absender = null` auf, z. B. per HTTP-Knoten mit den Zugangsdaten „Supabase account“:

```
POST https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/rpc/team_msgs_senden
{ "p_absender": null, "p_empfaenger": ["<mitglied_id>", "..."], "p_text": "**Hinweis:** ..." }
```

Über die Portal-Oberfläche ist das nicht möglich, dort ist immer das angemeldete Mitglied der Absender.

## Dateien

| Datei | Zweck |
|---|---|
| `docs/team/index.html` | Oberfläche: Klassen `C_MsgsList_Global` (Senden, Dialog „Neue Nachricht“) und `C_MsgsList_User` (Laden, Öffnen, Als ungelesen, Symbol, Posteingang, Lesedialog) |
| `supabase/team_nachrichten.sql` | Tabellen `team_msgs`, `team_msgs_user` und die Funktionen `team_msgs_*` (idempotent) |
| `nachrichten/lib/nachrichten.js` | Logik des Servers: Anfragen prüfen, Antworten der Datenbank auswerten. Läuft in n8n und im Test. |
| `nachrichten/n8n/bauen-nachrichten.mjs` | baut `nachrichten/n8n/nachrichten.workflow.gen.js` (n8n-SDK-Datei für den Import per n8n-MCP) |
| `nachrichten/dev/mock.mjs` | Nachbildung der SQL-Funktionen im Speicher, für Testserver (`/api/nachrichten`) und Tests |
| `nachrichten/test/` | Logik-Tests, SQL-Test „Bearbeiten“ (PGlite), Browsertests (Desktop und Handy) |
| `nachrichten/screenshots/` | Bildschirmfotos aus den Browsertests |

## Tests

```bash
npm run test:nachrichten
```

Die Browsertests brauchen `playwright` oder `playwright-core`. Mit `playwright-core` benutzen sie das installierte Chrome. Liegt das Paket nicht im Repo, setzt man `NODE_PATH` auf dessen `node_modules`. Ohne Playwright werden die Browsertests übersprungen.

## Einrichten (einmalig)

**Stand 16.11.2026:**
- Das SQL ist in Supabase eingespielt.
- Der Workflow „TEAM: Nachrichten (Portal)“ ist angelegt und veröffentlicht (ID `0tUWBdqqBPtnlfAj` auf n8n.hm-storage.de), mit den Zugangsdaten „Supabase account“, dem Fehler-Workflow `pka7MaqDJwuhjHpY` wie bei den anderen TEAM-Workflows; erfolgreiche Läufe werden nicht gespeichert (Datenschutz: sie enthielten die Nachrichtentexte).
- Die SQL-Funktionen sind gegen die echte Datenbank getestet. Senden, Lesen, „Als ungelesen“ und Markierungen sind lokal über den TesterProxy mit echten Daten ausprobiert.
- Das Portal ist noch nicht veröffentlicht (Änderungen an `docs/team/index.html` nicht auf GitHub).

Die Schritte unten gelten für einen Neuaufbau, auch mit einem anderen Supabase-Projekt. Auf diesen Abschnitt verweist die Meldung „Der Nachrichtendienst ist noch nicht eingerichtet“ im Portal.

**Voraussetzung:** Das Supabase-Projekt enthält schon die Tabellen des Team-Portals, vor allem `team_mitglieder` (`supabase/team_schema.sql`). Beim Senden prüft die Datenbank die Empfänger gegen diese Tabelle.

1. **Datenbank:** `supabase/team_nachrichten.sql` im Supabase SQL Editor ausführen (Supabase → Projekt → links „SQL Editor“ → „New query“ → einfügen → „Run“). Am Ende müssen `team_msgs` und `team_msgs_user` aufgelistet sein. Das Skript kann man gefahrlos mehrfach ausführen.
2. **Anderes Supabase-Projekt?** Dann in `nachrichten/n8n/bauen-nachrichten.mjs` die Adresse in `SUPA` anpassen. Das Projekt muss dasselbe sein, das die Portal-API v2 benutzt.
3. `npm run nachrichten:bauen` ausführen.
4. Den Inhalt von `nachrichten/n8n/nachrichten.workflow.gen.js` per n8n-MCP als neuen Workflow anlegen.
5. In n8n prüfen, dass die Knoten „Mitglied prüfen“ und „Datenbank“ die Supabase-Zugangsdaten des Projekts haben (heute „Supabase account“). Fehler-Workflow `pka7MaqDJwuhjHpY` eintragen, „erfolgreiche Läufe speichern“ ausschalten, veröffentlichen.
6. Das Portal veröffentlichen.

Die Reihenfolge ist egal: Ohne Workflow oder Datenbank bleibt die Liste leer, und das Portal läuft normal weiter. Wer dann eine Nachricht senden will, bekommt die Meldung mit dem Verweis auf diesen Abschnitt.

Ändert sich `nachrichten/lib/nachrichten.js`, müssen die beiden Code-Knoten „Anfrage prüfen“ und „Antwort bauen“ im laufenden Workflow mit dem neu gebauten Code aktualisiert werden.
