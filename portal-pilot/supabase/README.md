# Team-Portal (Pilot-Kopie): Datenbank einrichten

Dieser Ordner enthält alles, was die Datenbank des Portals für einen Pilotkunden braucht. Jede Datei ist eine fertige
Abfrage für den Supabase-SQL-Editor. Du spielst sie in der Reihenfolge unten ein, Datei für Datei. Alles ist so gebaut,
dass du eine Datei auch zweimal ausführen kannst, ohne etwas kaputt zu machen.

**Grundregel:** Jeder Kunde bekommt ein **eigenes Supabase-Projekt**. Niemals das Projekt eines anderen Kunden oder das
eigene Produktivsystem verwenden. Die Datenbank ist von außen nicht erreichbar; nur der Server (n8n) mit dem
`service_role`-Schlüssel darf lesen und schreiben. Dieser Schlüssel gehört in n8n, sonst nirgendwohin.

## 1. Welche Datei wofür

| Datei | Pflicht? | Was sie macht |
|---|---|---|
| `001_basis.sql` | **Pflicht** | Grundaufbau: Mitglieder, Projekte, Aufgaben mit Verlauf, Notizen mit Versionen, Vorschläge, Systeme, Papierkorb |
| `002_einstellungen.sql` | **Pflicht** | Tabelle `team_einstellungen`: Firmenname, Kurzname, Räume, Rollen, Stichtag, Pilot-Ende, Module, Wochenstand-Projekt |
| `003_team_laden.sql` | **Pflicht** | Die Lesefunktionen `team_laden()` / `team_laden_plus()` (der Server ruft bei jeder Anfrage `team_laden_plus()`) |
| `100_option_arbeitszeit.sql` | Option | Register „Arbeitszeit“: Zeiterfassung, Vertragsstunden, Monatsabschlüsse |
| `110_option_teilnehmer.sql` | Option | Register „Teilnehmer“: Personenliste mit Prüfpunkten (Haken) |
| `120_option_social.sql` | Option | Register „Social Media“: Beitragsplan mit Freigabe, Ideen-Liste, eigene Videos |
| `130_option_kommunikation.sql` | Option | WhatsApp- und Website-Chat-Eingang, WhatsApp-Benachrichtigungen ans Team |
| `140_option_office.sql` | Option | Register „KI Office“: Agenten, Aufträge, Freigaben (ohne vorgefertigte Agenten) |
| `150_option_kurs.sql` | Option | Register „Kurs“: Fragen und Antworten aus einer Kursseite |
| `900_seed_musterfirma.sql` | eins von dreien | Beispielteam „Musterfirma GmbH“ mit erfundenen Daten, zum Zeigen und Testen; enthält den KI-Agenten „Claude (KI)“, das Projekt „Pilot-Verbesserungen“ und die Notiz „Was sich geändert hat“ für die Feedbackschleife |
| `910_erster_admin.sql` | eins von dreien | Für einen echten Kunden: legt den ersten Admin an (ohne Musterdaten); optionaler Block legt den KI-Agenten für die Feedbackschleife an |
| `920_zugaenge_pilot.sql` | eins von dreien | Für den Pilot mit festem Team: Admin, vier Tester („Tester 1“ bis „Tester 4“, im Portal umbenennen), KI-Agent, Projekt „Pilot-Verbesserungen“, Notizen „Willkommen im Pilot“ (Regel: keine sensiblen Daten) und „Was sich geändert hat“ |
| `990_export.sql` | am Pilotende | Alle Daten als JSON (oder je Tabelle als CSV) zur Übergabe an den Kunden |
| `999_loeschen.sql` | am Pilotende | Löscht alle Daten und Tabellen des Portals. Mit Sicherheitsabfrage |

Die Optionen brauchst du für die Stufe 1 des Piloten (Planer und Übersicht: Aufgaben, Projekte, Notizen, Vorschläge,
Team) **nicht**. Du kannst sie jederzeit später einspielen, ohne dass du an den Pflichtdateien etwas ändern musst.

## 2. Reihenfolge

1. `001_basis.sql`
2. `002_einstellungen.sql`
3. `003_team_laden.sql`
4. Eine von drei Dateien: `900_seed_musterfirma.sql` (Vorführung, Test), `910_erster_admin.sql` (echter Kunde, nur ein Admin) oder
   `920_zugaenge_pilot.sql` (Pilot mit festem Team: Admin, vier Tester, KI-Agent)
5. Optionen nach Bedarf, in aufsteigender Nummer: `100`, `110`, `120`, `130`, `140`, `150`. Jede Option ist für sich
   allein lauffähig; die Nummer ist nur die empfohlene Reihenfolge.

Am Pilotende: erst `990_export.sql`, dann `999_loeschen.sql` (siehe Abschnitt 7).

## 3. So spielst du eine Datei ein

1. Supabase öffnen, das Projekt des Kunden auswählen. Oben links steht der Projektname. Bitte prüfen, bevor du
   etwas ausführst.
2. Links im Menü **SQL Editor** anklicken, dann **New query** (neue Abfrage).
3. Die Datei (z. B. `001_basis.sql`) in einem Texteditor öffnen, **alles markieren und kopieren**, im SQL-Editor
   einfügen.
4. Auf **Run** klicken (oder Strg + Enter).
5. Unten erscheint das Ergebnis. Der SQL-Editor zeigt nur das Ergebnis der **letzten** Abfrage der Datei; genau dafür
   steht am Ende jeder Datei eine Kontrollabfrage (siehe Abschnitt 4). Steht dort ein roter Fehler, nichts weiter
   einspielen, sondern den Fehlertext kopieren und nachfragen.
6. Mit der nächsten Datei genauso weitermachen.

Die Zeilen, die mit `--` beginnen, sind Kommentare für Menschen. Ganz oben in jeder Datei steht, was sie tut, ob sie
Pflicht ist und was vorher gelaufen sein muss.

## 4. Woran du erkennst, dass es geklappt hat

Nach jeder Datei zeigt der SQL-Editor unten die Kontrollabfrage:

| Nach Datei | Erwartetes Ergebnis |
|---|---|
| `001_basis.sql` | Liste mit 9 Tabellennamen, alle beginnen mit `team_` |
| `002_einstellungen.sql` | 10 Zeilen: `firma`, `firmenwissen_projekt`, `kurzname`, `module`, `pilot_ende`, `raeume`, `rollen`, `social_kanaele`, `stichdatum_abrechnung`, `vorschlag_bereiche` |
| `003_team_laden.sql` | 23 Zeilen mit Schlüsselwörtern, darunter `mitglieder`, `projekte`, `aufgaben`, `papierkorb` |
| `900_seed_musterfirma.sql` | 5 Zeilen mit Name, Rolle, Status und Zugangscode (siehe Abschnitt 5), darunter „Claude (KI)“ mit Rolle `agent` |
| `910_erster_admin.sql` | 1 Zeile mit dem neuen Admin und seinem Zugangscode; 2 Zeilen, wenn der Agent-Block eingeschaltet ist |
| `920_zugaenge_pilot.sql` | 6 Zeilen: Admin, Tester 1 bis 4, „Claude (KI)“, je mit Zugangscode |
| Optionen `100` bis `150` | kleine Kontrolltabelle, z. B. `social = array` oder die Liste der neuen Tabellen |

Die Probe aufs Exempel nach dem Seed: neue Abfrage, eingeben

```sql
select team_laden();
```

und auf Run klicken. Das Ergebnis ist ein langer Text (JSON). Darin müssen „Anna Muster“, „Onboarding Pilot“ und
„Musterfirma GmbH“ vorkommen. Wenn du statt des ganzen Textes nur die Mengen sehen willst:

```sql
select jsonb_array_length(team_laden() -> 'mitglieder') as mitglieder,
       jsonb_array_length(team_laden() -> 'projekte')   as projekte,
       jsonb_array_length(team_laden() -> 'aufgaben')   as aufgaben;
```

Erwartet: 5, 4, 12.

## 5. Zugangscodes

Jedes Teammitglied hat einen persönlichen Zugangscode (Token). Der Login-Link ist

```
<Adresse des Portals>#z=<token>
```

Das Doppelkreuz ist Absicht: Den Teil hinter `#` schickt der Browser nie an einen Server und nie in ein Protokoll.

Beim Seed (`900`) und beim ersten Admin (`910`) werden die Codes zufällig erzeugt und am Ende angezeigt. Später zeigst
du sie jederzeit wieder an mit

```sql
select name, rolle, token from team_mitglieder order by name;
```

Codes nur persönlich weitergeben (nicht in Gruppenchats, nicht in Tickets). Ist ein Code verbrannt, bekommt die Person
einen neuen, der alte Link wird dadurch ungültig:

```sql
update team_mitglieder set token = team_token_neu() where name = 'Anna Muster';
```

Alle weiteren Mitglieder legt der Admin im Portal unter „Team“ an; dort entsteht der Code automatisch.

Der Code des KI-Agenten „Claude (KI)“ (Rolle `agent`, aus `900` oder aus dem Agent-Block in `910`) ist **kein Login-Link**. Er ist der
Zugang des Werkzeugs `portal-pilot/agent/feedback.mjs` und gehört nur in die Umgebungsvariable `PILOT_AGENT_TOKEN` auf dem Rechner,
der die Rückmeldungen beantwortet (`PILOT_Setup.md`, Abschnitt 8). Anzeigen: `select name, token from team_mitglieder where typ = 'agent';`

## 6. Einstellungen je Kunde

Alles, was je Firma anders ist, steht in der Tabelle `team_einstellungen` und wird von den n8n-Workflows gelesen.
Ändern geht im SQL-Editor so (die doppelten Anführungszeichen innerhalb der einfachen sind nötig, weil die Werte als
JSON gespeichert sind):

```sql
select team_einstellung_setzen('firma', '"Beispiel GmbH"');
select team_einstellung_setzen('kurzname', '"Beispiel"');
select team_einstellung_setzen('raeume', '["Vertrieb", "Verwaltung", "Produktion"]');
select team_einstellung_setzen('stichdatum_abrechnung', '"2026-01-01"');
select team_einstellung_setzen('pilot_ende', '"2027-02-28"');
select team_einstellung_setzen('module', '{"zeit": true, "social": false, "system": false, "kurs": false}');
select team_einstellung_setzen('firmenwissen_projekt', '"Firmenwissen"');
```

| Schlüssel | Bedeutung | Standard |
|---|---|---|
| `firma`, `kurzname` | Name der Firma im Portal, Kurzform für Überschrift und Browser-Tab | `Meine Firma`, `Portal` |
| `raeume` | Bereiche der Firma für die Option KI Office | `[]` |
| `rollen` | Rollen mit Beschreibung; Rechte prüft der Server | 5 Rollen |
| `stichdatum_abrechnung` | Ab wann die Option Arbeitszeit Monate abrechnet | `null` (aus) |
| `pilot_ende` | Geplantes Ende des Piloten | `null` (offen) |
| `module` | Welche Optionen der Server erlaubt: `zeit`, `social`, `system`, `kurs`; `true` = an. Einschalten: `select team_einstellung_setzen('module', '{"zeit": true}');` (fehlende Schlüssel gelten als aus) | alle `false` |
| `firmenwissen_projekt` | Projektname, in den der Wochenstand seine Notizen legt; die Feedbackschleife legt dort auch „Was sich geändert hat“ an (sonst im Projekt „Pilot-Verbesserungen“) | `null` (kein Wochenstand) |
| `vorschlag_bereiche` | Liste der Bereiche, die man einem Vorschlag zuordnen kann (Auswahl im Portal). Leere Liste = freier Text | 7 Einträge (die Register der Stufe 1 und „Sonstiges“) |
| `social_kanaele` | Kanäle, die der Server bei Social-Beiträgen annimmt. Leere Liste = jeder Name. Die Auswahlliste der Oberfläche steht in `config/mandant.js` | `[]` |
| `landesvorwahl` | Optional: Ländervorwahl ohne Plus für Telefonnummern, die mit 0 beginnen | nicht angelegt (Server nimmt 49) |

Alle Werte ansehen: `select * from team_einstellungen order by schluessel;`

## 7. Pilotende: Export und Löschung

1. **Workflows aus:** In n8n die Workflows des Kunden deaktivieren.
2. **Export:** `990_export.sql` einspielen. Die letzte Abfrage liefert eine Zelle mit dem gesamten Datenbestand als
   JSON. Zelle anklicken, kopieren, als `export-<kunde>-<datum>.json` speichern. Wer lieber Excel-Tabellen will: die
   Zeilen am Ende der Datei einzeln markieren und ausführen, dann im Ergebnisbereich „Download CSV“ wählen.
   Zugangscodes und Geheimnisse sind absichtlich nicht im Export.
3. **Übergabe:** Export verschlüsselt an den Kunden geben (ZIP mit Passwort oder geschützter Ordner), Empfang bestätigen
   lassen, eigene Kopie danach löschen.
4. **Löschen:** `999_loeschen.sql` öffnen, den Kopfkommentar zweimal lesen, Projektname in Supabase prüfen. Dann in der
   Zeile `bestaetigung text := 'NEIN';` das Wort `NEIN` durch `JA, ALLES LOESCHEN` ersetzen und ausführen. Solange
   `NEIN` drinsteht, passiert nichts. Die Kontrollabfragen am Ende müssen leer sein.
   War die Option 120 (Social Media) eingespielt: **vorher** in Supabase unter **Storage** die beiden Buckets
   `medien-roh` und `social-ideen` leeren („Empty bucket“) und löschen. Die Datei entfernt nur die Datenbankzeilen
   der Buckets (`delete from storage.objects`), nicht die Videos und Bilder selbst. Wer das Projekt in Schritt 5
   ohnehin löscht, kann sich diesen Handgriff sparen; beim bloßen Pausieren nicht.
5. **Aufräumen:** Supabase-Projekt pausieren oder löschen, das n8n-Credential des Kunden löschen, die Löschung mit Datum
   im Löschprotokoll vermerken. Backups beim Anbieter verschwinden erst nach dessen Frist.

## 8. Häufige Fragen

**Kann ich eine Datei versehentlich zweimal ausführen?** Ja, das ist unschädlich. Nichts wird doppelt angelegt,
Zugangscodes bleiben, ein geänderter Firmenname wird nicht überschrieben.

**Was ist, wenn ich eine Option später brauche?** Einfach einspielen. Die Lesefunktion erkennt die neuen Tabellen von
selbst; an den Pflichtdateien änderst du nichts.

**Woher weiß das Portal, welche Register es zeigt?** Zwei Schalter, die zusammenpassen müssen: Die Oberfläche hat
eigene Schalter in `config/mandant.js` (`register`, was angezeigt wird). Der Server erlaubt Aktionen einer Option nur, wenn
`module` in `team_einstellungen` sie freigibt, zum Beispiel `select team_einstellung_setzen('module', '{"zeit": true}');`
(siehe Abschnitt 6). Die Oberfläche zeigt ein Register nur, wenn **beide** Schalter an sind. Die Datenbank liefert für nicht
eingespielte Bereiche einfach leere Listen. Beide Schalter nebeneinander erklärt der Abschnitt „Module an- und ausschalten“
in `portal-pilot/README.md`.

**Darf ich die Tabellen im Supabase-Table-Editor direkt bearbeiten?** Lieber nicht, außer zum Nachsehen. Änderungen
an Aufgaben, Notizen und Mitgliedern gehören ins Portal, damit Verlauf und Versionen stimmen.

**Was ist Row Level Security (RLS)?** Eine Sperre in der Datenbank: Ohne den Server-Schlüssel sieht niemand eine
einzige Zeile. Sie ist bei allen Tabellen an und bewusst ohne Ausnahmen (keine „Policies“).

**Wie wurde das geprüft?** Mit einem automatischen Test gegen einen lokalen PostgreSQL (Datei
`portal-pilot/test/supabase.test.mjs`): alle Dateien in dieser Reihenfolge, jede zweimal, Seed, Optionen, Export,
Löschung und ein Scan auf Namen, Nummern und Schlüssel, die nicht ins Paket gehören. Aufruf für Entwickler:
`node --test portal-pilot/test/supabase.test.mjs`.
