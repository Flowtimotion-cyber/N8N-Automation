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

## Stufe 2 (noch nicht gebaut)

@Claude / @Hermes im Chat: Die KI liest diesen einen Chat (oder den ganzen Verlauf, wenn eingeschaltet), antwortet im Chat und schlägt Aufgaben oder Notizen mit einem Knopf „Anlegen“ vor. Größere Arbeiten gehen als Auftrag ins KI Office. Danach: Chat in der Team-App.
