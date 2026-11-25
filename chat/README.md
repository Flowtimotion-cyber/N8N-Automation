# Team-Chat im Team-Portal (Stufe 1)

Gruppen-, Direkt- und Projekt-Chats für das Momentum-Team, im Register **Chat** des Team-Portals. Entscheidungen von Timo (23.11.2026):

- Einen Chat sehen **nur seine Mitglieder**. Auch Admins sehen fremde Chats nicht.
- Die **KI liest nur auf Zuruf** (@Claude, kommt in Stufe 2). Pro Chat lässt sich einschalten, dass sie den ganzen Verlauf lesen darf. Wer das umschaltet, steht **für alle sichtbar** im Chat, und der Chatkopf zeigt dauerhaft „🤖 KI-Zugriff eingeschaltet“.
- **@-Markierung:** Die Person bekommt einen Hinweis im Posteingang (Nachrichtendienst). Eine **WhatsApp nur mit Haken** beim Senden (ca. 5 Cent je Nachricht, nur an Personen mit Handynummer und Einwilligung im Profil).
- Ein **@Agent** schlägt in Stufe 2 Aufgaben vor, ein Mensch bestätigt mit einem Klick.

## Was man sieht

- **Register „Chat“** (zweites Register). Links die Gespräche mit Suche, Zeit der letzten Nachricht und „n neu“, rechts der Verlauf. Am Register steht die Zahl ungelesener Nachrichten.
- **Neuer Chat:** 👥 Gruppe (mit Namen), 👤 Direkt (genau eine Person; gibt es den Direktchat schon, öffnet er sich), 📁 Projekt (Name = Projektname, wenn leer).
- **Im Chat:** formatierter Text wie bei Notizen, `@Vorname` wird hervorgehoben, Nachrichten an dich sind gelb umrandet. Enter sendet, Umschalt+Enter macht eine neue Zeile. Hinweise des Portals (angelegt, hinzugefügt, KI-Zugriff …) stehen mittig.
- **Projekt-Chat:** Über dem Verlauf „📁 Offene Aufgaben in …“, ein Klick öffnet die Aufgabe.
- **⚙ Einstellungen:** Name, Projekt dazuholen oder lösen, Personen hinzufügen oder entfernen, KI-Zugriff, Chat verlassen. Direktchats: nur KI-Zugriff und Verlassen.
- **Adresse:** `#/chat/<chat_id>` öffnet einen Chat direkt (auch aus dem Posteingang-Hinweis).
- **Aktualisierung:** Die Liste alle 60 Sekunden, ein offener Chat alle 5 Sekunden, nur solange das Fenster sichtbar ist.

## Aufbau

```
Portal (Browser)  ──POST { token, aktion, daten }──▶  n8n „TEAM: Chat (Portal)“ (Webhook team-chat)
                                                        1. Mitglied per Token in Supabase prüfen (Agenten: 403)
                                                        2. Eingaben prüfen (chat/lib/chat.js); Absender = angemeldetes Mitglied
                                                        3. Supabase-Funktion team_chat_liste | _verlauf | _senden | _anlegen | _aendern
                                                        4. Fehlt die Datenbank: „liste“ → leere Liste, sonst Hinweis
```

| Datei | Zweck |
|---|---|
| `supabase/team_chat.sql` | Tabellen `team_chats`, `team_chat_mitglieder`, `team_chat_nachrichten` und Funktionen `team_chat_*`. Prüft Mitgliedschaft in jeder Funktion. Markierung → `team_msgs_senden` (falls eingerichtet), WhatsApp-Haken → `kom_benachrichtigungen` mit `art = 'chat_erwaehnung'` (falls eingerichtet). |
| `chat/lib/chat.js` | Logik des Servers: Anfragen prüfen, Antworten auswerten. Läuft in n8n (ohne `URL`, ohne `require`) und im Test. |
| `chat/n8n/bauen-chat.mjs` | baut `chat/n8n/chat.workflow.gen.js` (n8n-SDK-Datei), Muster wie `nachrichten/` |
| `chat/n8n/deploy/kom-whatsapp-chat-vorlage.json` | Änderung am bestehenden Workflow „KOM: WhatsApp an Team bei neuer Aufgabe“: Vorlage je Art (`neue_aufgabe` oder `chat_erwaehnung`) |
| `chat/dev/mock.mjs` | Nachbildung der SQL-Funktionen im Speicher für den Testserver (`/api/chat`) |
| `docs/team/index.html` | Register „Chat“ (`vChat`, `chListeZeigen`, `chChatZeigen`, `chNeuDialog`, `chEinstellungen`) |

## Einrichten (Reihenfolge)

1. **Meta-Vorlage `chat_erwaehnung`** im WhatsApp-Konto „HermetikFlow“ (ID 1666267811876429) anlegen: Kategorie Verwaltung, Deutsch, Text
   `Hallo {{1}}, {{2}} hat dich im Team-Chat „{{3}}“ erwähnt. Schau im Team-Portal nach.` und auf die Freigabe warten.
2. **n8n „KOM: WhatsApp an Team bei neuer Aufgabe“** (`QG7TlVF1CzjlmnDf`): `chat/n8n/deploy/kom-whatsapp-chat-vorlage.json` einspielen (vorher Abgleich `sha256_live_vorher`). Ohne diesen Schritt bekäme eine Chat-Markierung den Text „neue Aufgabe“.
3. **Supabase:** `supabase/team_chat.sql` im SQL Editor ausführen. Die Kontrollabfrage am Ende zeigt die drei Tabellen.
4. **n8n „TEAM: Chat (Portal)“** neu anlegen aus `chat/n8n/chat.workflow.gen.js` (`node chat/n8n/bauen-chat.mjs`), Credential „Supabase account“ in beiden HTTP-Knoten setzen, veröffentlichen.
5. **PR mergen**, GitHub Pages liefert das Register aus.

Bis Schritt 3 und 4 erledigt sind, zeigt das Register „Der Team-Chat ist noch nicht eingerichtet …“, sonst passiert nichts.

## Tests

```bash
node --test chat/test/chat.test.mjs
PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test chat/test/sql.test.mjs
NODE_PATH=<Hauptordner>/node_modules node --test chat/test/chat.browser.test.mjs
```

Logik 8, SQL 1 (gegen echtes Postgres), Browser 5 (drei Personen, Handy). Bildschirmfotos in `chat/screenshots/`.

## Nachrichten bearbeiten

Eigene Nachrichten lassen sich bis 24 Stunden nach dem Senden bearbeiten (✎ neben der Uhrzeit). Alle sehen „bearbeitet“ mit Uhrzeit, die alte Fassung bleibt gespeichert, neu Markierte bekommen einen Hinweis im Posteingang, nie eine WhatsApp. Regeln, SQL (`supabase/team_bearbeiten.sql`) und Deploy-Datei: `nachrichten/README.md`, Abschnitt „Nachrichten bearbeiten“.

## Sprachnachricht und „KI korrigieren“ (Chat-Helfer)

Timos Entscheidungen vom 23.11.2026: Sprachnachricht dürfen **alle im Team** (keine Agenten). Mit dem Haken **„✨ KI korrigieren“** korrigiert die KI beim Senden erst, zeigt die Fassung, und das **zweite Senden** schickt sie.

- **🎙️ neben dem Eingabefeld:** Klick startet die Aufnahme (Anzeige ⏹ mit Zeit), zweiter Klick stoppt. Der Text erscheint im Eingabefeld (an vorhandenen Text angehängt). Gesendet wird erst mit „Senden“. Höchstens 5 Minuten. Kosten ca. 0,3 Cent je Sprechminute (OpenAI `gpt-4o-mini-transcribe`, wie das Vertriebs-Diktat). Die Aufnahme wird nicht gespeichert.
- **Haken „✨ KI korrigieren“** (über dem Eingabefeld, merkt sich der Browser): Beim ersten Senden korrigiert die KI (`gpt-5-mini`) nur Rechtschreibung, Grammatik und Zeichensetzung. Steht danach etwas anderes im Feld, heißt es „Korrigiert. Prüfen und nochmal Senden.“ mit **Rückgängig**. Ist nichts zu korrigieren, geht die Nachricht gleich raus.
- **Sicherheitsnetz:** Ändert die KI zu viel (Länge stark anders) oder verändert sie @-Markierungen, bleibt dein Text unverändert, und du siehst einen Hinweis. Ist der Dienst nicht erreichbar, wird nichts gesendet; ein zweites Senden schickt den Text so.
- **Technik:** neuer n8n-Workflow **„TEAM: Chat-Helfer (Portal)“** (Webhook `team-chat-helfer`), Logik `chat/lib/helfer.js`, Bau `node chat/n8n/bauen-helfer.mjs` → `chat/n8n/helfer.workflow.gen.js`, Nachbildung ohne OpenAI `chat/dev/helfer-mock.mjs` (Testserver `/api/chat-helfer`). Das Vertriebs-Diktat („TEAM: Diktat“) und „TEAM: Chat (Portal)“ bleiben unverändert. Keine Datenbank-Änderung.
- **Einrichten:** Workflow aus `chat/n8n/helfer.workflow.gen.js` per n8n-MCP anlegen, Zugangsdaten „Supabase account“ (Mitglied prüfen) und „OpenAI account“ (beide OpenAI-Knoten) setzen, Fehler-Workflow `pka7MaqDJwuhjHpY`, erfolgreiche Läufe nicht speichern (Datenschutz: Texte), veröffentlichen. Ohne Workflow zeigt das Portal „noch nicht eingerichtet“, der Chat läuft normal.
- **Tests:** `node --test chat/test/helfer.test.mjs` (8, Logik und Sicherheitsnetz), `chat/test/helfer.browser.test.mjs` (4, mit simuliertem Mikrofon). Bildschirmfotos `chat/screenshots/*ki-korrigiert*`, `*sprachnachricht*`.

## Antworten und Smiley-Reaktionen

Timos Entscheidungen vom 24.11.2026: sechs feste Smileys, keine Benachrichtigung bei Antwort oder Reaktion (Posteingang-Hinweis nur bei @ wie bisher).

- **Unter jeder Nachricht** stehen neben der Uhrzeit **↩** (antworten) und **☺** (Smiley).
- **☺** öffnet 👍 ❤️ 😂 😮 🙏 ✅. Ein Klick setzt den Smiley, ein Klick auf deinen eigenen (lila umrandet) nimmt ihn wieder weg. Fährst du darüber, siehst du, wer reagiert hat. Mehrere Smileys pro Person sind erlaubt.
- **↩** zeigt über dem Eingabefeld „Antwort an …“ mit ✕ zum Abbrechen. Die gesendete Nachricht trägt oben ein kleines Zitat, ein Klick darauf springt zur Ursprungsnachricht und hebt sie kurz hervor.
- Alle sehen neue Reaktionen beim nächsten Nachladen (alle 5 Sekunden). Beim Neuzeichnen bleibt die Stelle im Verlauf stehen, nach dem eigenen Senden springt der Chat ans Ende.
- **Technik:** `supabase/team_chat_reaktionen.sql` (Spalten `antwort_auf`, `reaktionen`, `reaktion_am`, Funktion `team_chat_reagieren`, `team_chat_senden` mit freiwilligem `p_antwort_auf`, Verlauf mit Zitat). Aktion `reagieren` und `antwort_auf` beim Senden in `chat/lib/chat.js`.
- **Achtung:** `supabase/team_chat.sql` danach nicht noch einmal allein ausführen. Es legt die alte Fassung von `team_chat_senden` wieder an. Falls doch, `team_chat_reaktionen.sql` direkt danach erneut ausführen.
- **Einspielen:** (1) Timo führt `supabase/team_chat_reaktionen.sql` aus. (2) n8n nach Timos Ja: `chat/n8n/deploy/reaktionen-deploy.json` (`node chat/n8n/bauen-deploy-reaktionen.mjs`), nur die zwei Code-Knoten. (3) PR mergen. Reihenfolge egal: Ohne SQL melden ↩ und ☺ „noch nicht eingerichtet“, normales Senden läuft weiter.
- **Tests:** `chat/test/chat.test.mjs`, `chat/test/sql-reaktionen.test.mjs` (PGlite), `chat/test/reaktionen.browser.test.mjs`. Bildschirmfotos `chat/screenshots/*smiley*`, `*antwort*`.

## Dateien im Chat

Timos Entscheidungen vom 24./25.11.2026: Bilder, PDFs und andere Dateien in allen Team-Chats (Gruppe, Direkt, Projekt). Bis 25 MB je Datei, höchstens 10 je Nachricht. WhatsApp-Inbox (Kunden), Posteingang, Aufgaben-Kommentare und die Handy-App kommen später als eigene Schritte.

- **Erlaubt:** Bilder (jpg, png, webp, gif, heic), PDF, Word, Excel, PowerPoint (auch OpenDocument), txt, csv, Audio (mp3, m4a, wav, ogg …). Keine Videos, kein HTML/SVG, keine Programme. Der Typ kommt aus der Endung, Supabase prüft ihn beim Hochladen noch einmal (Bucket-Regel).
- **Anhängen:** 📎 neben dem Eingabefeld, Datei ins Chatfenster ziehen oder ein Bild mit Strg+V einfügen. Am Handy zusätzlich 📷 (Kamera). Vorgemerkte Dateien stehen über dem Eingabefeld (✕ nimmt sie wieder weg), Text ist freiwillig. Große Fotos verkleinert der Browser vor dem Hochladen auf höchstens 2560 px (JPEG).
- **Anzeige:** Bilder als Vorschau (Klick = groß, mit Download), sonst eine Karte mit Name, Größe, ⬇ Herunterladen, bei PDF und txt auch „Öffnen“, bei Audio ein Abspieler. HEIC zeigen die meisten Browser nicht, es kommt als Karte. Ohne Text steht in der Chat-Liste, im Posteingang und in der Team-App „📎 Dateiname“.
- **Entfernen:** 🗑 an der eigenen Datei, zweimal klicken. Sie ist dann für alle weg („Datei entfernt“), wer sie geschickt hat, kann sie 30 Tage lang wiederherstellen. Danach löscht der tägliche Aufräumlauf (03:40) die Datei endgültig aus dem Speicher, ebenso abgebrochene Uploads nach einem Tag. Fremde Dateien kann niemand entfernen, auch Admins nicht.
- **Datenschutz:** privater Bucket `team-anhaenge` ohne öffentliche Links. Der Browser bekommt eine signierte Upload-Adresse (2 Stunden, nur für diese eine Datei) und signierte Lese-Links (60 Minuten), beides nur für Mitglieder des Chats. Kein Supabase-Schlüssel im Browser, der Speicherpfad geht nicht ans Portal. Agenten bekommen keine Dateien (403), die KI auch nicht. Kein KI-Knoten, also keine KI-Kosten.

```
Portal ──{ token, aktion: vorbereiten }──▶ n8n „TEAM: Anhänge (Portal)“ (Webhook team-anhang)
          ◀── signierte Upload-Adresse ───  1. Mitglied prüfen (Agenten: 403)  2. chat/lib/anhaenge.js prüft Name, Typ, Größe
Portal ──PUT Datei──▶ Supabase Storage      3. team_anhang_vorbereiten (Chat-Mitglied?)  4. Storage: object/upload/sign
Portal ──{ aktion: senden }──▶ n8n  ──▶ team_anhang_senden (liegt die Datei wirklich im Speicher?) → team_chat_senden (wie gewohnt)
Portal ──{ aktion: links }───▶ n8n  ──▶ team_anhang_links (nur Mitglieder) → Storage: object/sign (60 Min.)
täglich 03:40: team_anhang_aufraeumen_liste → Storage DELETE → team_anhang_aufraeumen_fertig
```

| Datei | Zweck |
|---|---|
| `supabase/team_chat_anhaenge.sql` | Bucket `team-anhaenge` (privat, 25 MB, Typenliste), Tabelle `team_anhaenge`, Spalte `anhaenge` an `team_chat_nachrichten`, Funktionen `team_anhang_*`. Ändert keine bestehende Funktion. |
| `chat/lib/anhaenge.js` | Logik des Servers (Prüfen, Signieren vorbereiten, Antworten bauen). Läuft in n8n und im Test. |
| `chat/n8n/bauen-anhaenge.mjs` | baut `chat/n8n/anhaenge.workflow.gen.js` (neuer Workflow, Webhook + täglicher Aufräumlauf) |
| `chat/dev/anhaenge-mock.mjs` | Nachbildung von SQL und Storage für den Testserver (`/api/chat-anhang`, `/api/test/speicher/…`) |
| `docs/team/index.html` | 📎/📷, Vormerkliste, Hochladen mit Fortschritt, Anzeige im Verlauf (`chDateienDazu`, `chMitDateienSenden`, `chLinksHolen`, `chAnhaengeHtml`) |

**Einrichten (Reihenfolge egal, ohne Schritt 1 und 2 meldet das Portal „noch nicht eingerichtet“, der Chat läuft normal weiter):**

1. **Supabase:** `supabase/team_chat_anhaenge.sql` im SQL Editor ausführen (Timo). Die Kontrolle am Ende zeigt `team-anhaenge | false | 26214400`.
2. **n8n „TEAM: Anhänge (Portal)“** aus `chat/n8n/anhaenge.workflow.gen.js` (`node chat/n8n/bauen-anhaenge.mjs`) neu anlegen: Zugangsdaten „Supabase account“ in allen HTTP-Knoten, Fehler-Workflow `pka7MaqDJwuhjHpY`, erfolgreiche Läufe nicht speichern (die Antworten enthalten signierte Links), dann veröffentlichen.
3. **PR mergen**, GitHub Pages liefert das Portal aus.

**Kosten:** keine KI. Speicher zählt zum Supabase-Paket (Free 1 GB, Pro 100 GB inklusive), Bilder werden vorher verkleinert.

**Tests:** `node --test chat/test/anhaenge.test.mjs` (9, Logik und gleiche Typenliste in SQL/Portal), `chat/test/sql-anhaenge.test.mjs` (PGlite, mit nachgebildetem `storage`-Schema), `chat/test/anhaenge.browser.test.mjs` (4: Büroklammer, Hineinziehen mit Verkleinern, Einfügen, Download, Entfernen/Wiederherstellen, Handy mit Kamera, ohne Datenbank). Bildschirmfotos `chat/screenshots/*dateien*`.

## Stufe 2 (noch nicht gebaut)

@Claude / @Hermes im Chat: Die KI liest diesen einen Chat (oder den ganzen Verlauf, wenn eingeschaltet), antwortet im Chat und schlägt Aufgaben oder Notizen mit einem Knopf „Anlegen“ vor. Größere Arbeiten gehen als Auftrag ins KI Office. Danach: Chat in der Team-App.
