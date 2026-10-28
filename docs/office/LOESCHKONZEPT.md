# Löschkonzept: KI Office

Stand: 17.10.2026 · Orientierung an DIN 66398 (Datenarten → Löschklassen → Startzeitpunkt und Regelfrist) · Fristen sind **Vorschläge**, die Timo bestätigt oder ändert (Restpunkt). Rechtsgrundlagen: DSGVO Art. 5 Abs. 1 lit. e, Art. 17.

## 1. Datenarten und Löschklassen

| Datenart | Wo | Personenbezug | Startzeitpunkt | Regelfrist (Vorschlag) | Umsetzung |
|---|---|---|---|---|---|
| Run (Auftrag, Status, Zusammenfassung, Fehler, Verbrauch) | `office_runs` | Auftraggeber, Entscheider; mittelbar Inhalte | Ende des Runs (`beendet`) | 180 Tage | Aktion `loeschen` mit `aelter_als_tage` (min. 30) durch Admin; `team_laden()` liefert ohnehin nur 90 Tage |
| Ereignisse (Schritte, Tool-Aufrufe, Quellen-Referenzen) | `office_ereignisse` | wie Run | mit dem Run | mit dem Run | `on delete cascade` + explizite DELETE-Aufträge in `loeschen` |
| Artefakt-Einträge (Titel, Ablageort, Hash) | `office_artefakte` | wie Run | mit dem Run | mit dem Run | cascade + DELETE; **Ablageorte** werden in der Antwort gelistet, die Dateien/Notizen selbst löscht ein Mensch (Drive, Repo, Notiz) |
| Freigaben (Vorschau, Hash, Entscheider, Begründung) | `office_freigaben` | Entscheider | mit dem Run | mit dem Run | cascade + DELETE |
| Rückmelde-Schlüssel | `office_run_schluessel` | nein | Run beendet | mit dem Run; könnte schon beim Endzustand gelöscht werden (Restpunkt) | cascade + DELETE |
| Idempotenzschlüssel und Nonces | `office_idempotenz` | nein (gespeicherte Antwort enthält Run-ID) | Erstellung | 30 Tage | Wartung löscht automatisch (`erstellt < now - 30 Tage`), zusätzlich mit dem Run |
| Gespiegelte Verlaufseinträge im Portal (Rückfragen, Berichte, Freigabehinweise mit `[run:ID]`) | `team_aufgaben_verlauf` | Autor, Inhalt | mit dem Run | mit dem Run | `loeschen` entfernt alle Einträge mit dem Run-Marker (Pflichtprüfung 7) |
| Aufgabenstatus „Wird getestet“ (gesetzt durch Run) | `team_aufgaben` | nein | – | bleibt (fachlicher Stand der Aufgabe) | nicht abgeleitet im Sinne des Konzepts; bewusst nicht zurückgesetzt |
| Registry | `office_agenten` | nein (Agenten) | – | solange genutzt | Admin per `agent_speichern` (`aktiv: false`) |
| n8n-Ausführungsdaten (nur Fehler) | n8n | ja (Request-Body ohne Anzeige des Tokens im Office-Code, aber im Webhook-Knoten) | Ausführung | 14 Tage | n8n-Umgebungsvariablen `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=336` (Restpunkt für Timo) |
| Supabase-Backups | Supabase | ja | Backup | Anbieterfrist (Plan prüfen) | gelöschte Daten leben bis zum Ablauf der Backups weiter; in der Information ans Team erwähnen |
| Browser-Speicher (`mt-token`, Filter, Register) | Browser der Nutzenden | Token | – | bis Abmelden | „Auf diesem Gerät abmelden“ löscht Token (Portal und Office) |
| Screenshots und Testdaten im Repo | `docs/office/screenshots`, `office/dev/testdaten.mjs` | nein (synthetisch) | – | – | – |
| GitHub-Pages-Zugriffslogs | GitHub | IP | – | Anbieter | nicht beeinflussbar; in Datenschutzinformation nennen |

## 2. Löschauslöser

1. **Regelmäßig:** Admin ruft `loeschen` mit `{ "aelter_als_tage": 180 }` auf (z. B. monatlich; ein Zeitplan-Knoten im Workflow ist als Restpunkt vorgesehen, bewusst nicht aktiviert, bis Timo die Frist bestätigt). Die Wartung löscht Idempotenzschlüssel automatisch nach 30 Tagen.
2. **Anlassbezogen:** Einzelner Run per `loeschen { run_id }`, nur in Endzuständen (laufende Runs erst abbrechen). Antwort nennt die externen Ablageorte, die manuell zu löschen sind.
3. **Betroffenenanfrage (Art. 17):** Runs der Person über `auftraggeber`, `abgenommen_von`, `entschieden_von`, `autor` in Ereignissen suchen (SQL im Supabase-Editor, Restpunkt: Hilfsabfrage) und per `loeschen` entfernen; gespiegelte Verlaufseinträge werden mitgelöscht.

## 3. Was Löschung nicht erfasst (bewusst)

- Aufgaben, Projekte, Notizen des Portals: eigene Lebenszyklen im Portal.
- Ergebnisse außerhalb des Office (Dateien in Drive, Commits im Repo, versendete E-Mails): werden nur referenziert; die Antwort auf `loeschen` listet sie zur manuellen Löschung.
- Backups beim Anbieter.

## 4. Nachweis

Die Löschaktion erzeugt im Office selbst keinen Eintrag (der Run ist weg). Als Nachweis dienen die n8n-Fehlerausführungen nicht (Erfolge werden nicht gespeichert). Restpunkt: schlankes Lösch-Protokoll (Zeit, Admin, Anzahl, Run-IDs ohne Inhalte) in einer eigenen Tabelle.

Pflichtprüfung 7 (`office/test/verarbeitung.test.mjs`) belegt, dass Run, Ereignisse, Artefakte, Freigaben, Idempotenzschlüssel, Rückmelde-Schlüssel und gespiegelte Verlaufseinträge gemeinsam gelöscht werden und Ablageorte zurückgemeldet werden.

## 5. Nachtrag 28.10.2026: Rohvideos und Ideen-Links im Social-Register (KI-erstellt: Claude Code)

| Datenart | Wo | Personenbezug | Startzeitpunkt | Regelfrist (Vorschlag) | Umsetzung |
|---|---|---|---|---|---|
| Rohvideos (Dozenten, Teilnehmer, Gäste im Bild und Ton) | Supabase Storage, Bucket `medien-roh` (privat) | ja, stark (Bild, Stimme, Inhalte) | Upload | **90 Tage** (`team_social_uploads.aufbewahren_bis`), fertige Entwürfe leben als Social-Beitrag weiter | Heute: Admin löscht im Portal („Löschen“ beim Upload) oder per `upload_loeschen`. **Offen:** Lauf, der Dateien mit `aufbewahren_bis < heute` löscht (Restpunkt) |
| Upload-Eintrag (Thema, Kontext, Dateiname, wer, Einwilligung mit Zeitpunkt, Run) | `team_social_uploads` | Uploader; Einwilligungs-Nachweis | Upload | wie Video + 1 Jahr als Nachweis der Einwilligung (Status `geloescht`, Pfad bleibt ohne Datei) | nur Admin |
| Ideen-Links (fremde Beiträge, Autor/Firma als Quelle), Freitext-Ideen | `team_social_ideen` | Dritte (öffentliche Profile), Erfasser | Erfassung | solange genutzt; `verworfen` nach 180 Tagen aufräumen | Papierkorb (`idee_loeschen`, 30 Tage), danach weg |
| Bilder zu Ideen (Screenshots fremder Beiträge, eigene Motive) | Supabase Storage, Bucket `social-ideen` (**öffentlich**, 20 MB) | möglich (Personen auf Screenshots) | Upload | wie die Idee; keine Rohvideos und keine Aufnahmen von Teilnehmern hier (dafür `medien-roh`) | **Offen:** Datei wird beim Löschen der Idee nicht mitgelöscht (Restpunkt) |

Einwilligung: Beim Upload ist das Häkchen „Die gezeigten Personen sind mit Aufnahme und Veröffentlichung einverstanden“ Pflicht (`einwilligung_am` wird gespeichert). Das ersetzt keine schriftliche Einwilligung der Dozenten; die Vorlage dafür ist ein Restpunkt (DATENSCHUTZ_AI_ACT.md, Anwendungsfall E).
