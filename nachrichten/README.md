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
| `nachrichten/test/` | 9 Logik-Tests, 4 Browsertests (Desktop und Handy) |
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

Die Schritte unten gelten für einen Neuaufbau.

1. `supabase/team_nachrichten.sql` im Supabase SQL Editor ausführen.
2. `npm run nachrichten:bauen` ausführen.
3. Den Inhalt von `nachrichten/n8n/nachrichten.workflow.gen.js` per n8n-MCP als neuen Workflow anlegen.
4. In n8n prüfen, dass die Knoten „Mitglied prüfen“ und „Datenbank“ die Zugangsdaten „Supabase account“ haben. Dann den Fehler-Workflow eintragen und veröffentlichen.
5. Das Portal veröffentlichen.

Die Reihenfolge ist egal: Ohne Workflow oder Datenbank bleibt die Liste leer, und das Portal läuft normal weiter.
