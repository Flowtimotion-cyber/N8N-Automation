# Betrieb: KI Office

Stand: 17.10.2026. Gilt nach dem Setup (SETUP.md). Nichts hiervon wurde in dieser Sitzung produktiv ausgeführt (kein Zugang zu n8n und Supabase).

## 1. Komponenten und Verantwortung

| Komponente | Läuft wo | Wer | Was tun bei Störung |
|---|---|---|---|
| Statische Seiten `/team/`, `/office/` | GitHub Pages aus `docs/` | GitHub | Seite lädt nicht: GitHub-Status prüfen; Rollback per Git (unten) |
| Workflow „TEAM: Office-API“ | n8n auf Hetzner | Timo | Office zeigt „Keine Verbindung“: Workflow aktiv? Fehlerausführungen in n8n ansehen; Supabase-Credential gültig? |
| Workflow „TEAM: Portal-API v2“ | n8n | Timo | unverändert; falls nach dem SQL-Update Probleme: `team_laden()` liefert mehr Schlüssel, die Portal-API ignoriert sie |
| Wartung (Zeitplan im Office-Workflow) | n8n | automatisch | läuft sie nicht, bleiben veraltete Runs „in Arbeit“; manuell als Admin: `wartung` aufrufen (z. B. per `curl` mit Admin-Token aus der eigenen Umgebung, nie aus dem Repo) |
| Supabase `office_*` | Supabase | Timo | RLS an; Zugriff nur service_role; Größe der Tabellen im Blick behalten (Ereignisse wachsen am schnellsten) |
| Executoren (n8n-Agentenworkflows, Claude Code, Codex, Hermes) | je nach Agent | Timo / Team | ohne Executor bleiben Aufträge in der Warteschlange und werden nach 30 Minuten „unbekannt“ |

## 2. Tägliche und wöchentliche Prüfungen

- Office → Freigaben: offene Freigaben entscheiden (Vier-Augen-Prinzip: nicht der Anfordernde).
- Office → Projekte: KPI „fehlgeschlagen oder veraltet“ ansehen; veraltete Runs schließen („Veralteten Run schließen“) oder neu beauftragen.
- Office → Agenten: Runs „technisch abgeschlossen“ fachlich abnehmen oder zurückweisen.
- Wöchentlich: n8n-Fehlerausführungen des Office-Workflows durchsehen; Supabase-Tabellengrößen; Löschlauf nach LOESCHKONZEPT.md.

## 3. Backup und Wiederherstellung

- **Code und Konfiguration:** Git (Repo), inkl. Workflow-JSON, SQL, Registry-Startbestand. Backup = Repo-Klon. Wiederherstellung = erneuter Import des Workflow-JSON und erneutes Ausführen der idempotenten SQL.
- **Daten:** Supabase-Backups nach Plan des Anbieters (Point-in-Time-Recovery je nach Plan). Zusätzlich empfohlen: wöchentlicher Export der `office_*`-Tabellen als CSV/JSON aus dem Supabase-Dashboard in einen Ablageort unter Timos Kontrolle (verschlüsselt, Zugriff nur Admin).
- **n8n:** Workflows regelmäßig exportieren (n8n → Download) oder die Instanz-Datenbank sichern (Hetzner-Snapshot). Credentials sind im n8n-Export verschlüsselt; der Encryption-Key der Instanz gehört ins Backup-Konzept des Servers.
- **Wiederherstellungstest:** noch nie durchgeführt (Restpunkt). Vorschlag: Testprojekt in Supabase anlegen, SQL ausführen, Export einspielen, Office gegen Testinstanz zeigen.
- **Wiederanlauf nach Ausfall:** Die Office-API ist zustandslos; nach einem Neustart von n8n läuft die Wartung weiter und markiert Runs ohne Lebenszeichen als unbekannt (getestet im Testserver mit „neustart“). Executoren müssen ihre Runs per `lebenszeichen` wieder aufnehmen oder ein Mensch startet neu.

## 4. Rollback

- **Frontend:** Commit auf `main` zurücksetzen (`git revert <commit>`), GitHub Pages baut neu. Das Register „KI Office“ im Portal ist eine kleine Ergänzung; Revert des Portal-Commits entfernt es rückstandsfrei.
- **Workflow:** Office-Workflow in n8n deaktivieren. Das Portal funktioniert ohne ihn; das Office zeigt „Keine Verbindung“.
- **Datenbank:** Die SQL-Migration ist additiv. Rückbau nur, wenn gewünscht: `drop table office_ereignisse, office_artefakte, office_freigaben, office_run_schluessel, office_idempotenz, office_runs, office_agenten;` und `team_laden()` aus `supabase/team_vorschlaege.sql` erneut ausführen; `alter table team_projekte drop column raum;` optional. Vorher exportieren.

## 5. Änderungen am Code

1. Bibliothek ändern (`office/lib/`), Tests laufen lassen (`npm run test:office`).
2. `node office/n8n/bauen.mjs` ausführen, Workflow-JSON neu importieren (ersetzt den Code-Knoten).
3. Commit auf einem Branch, Pull Request, Merge auf `main`. Erst danach ist das Frontend live; Workflow-Import und SQL macht Timo bewusst getrennt.

## 6. Überwachung (Vorschlag, nicht umgesetzt)

- n8n: Error-Workflow, der bei Fehlern der Office-API eine WhatsApp/E-Mail an Timo schickt (wie bei anderen Workflows üblich).
- Office-KPI „fehlgeschlagen oder veraltet“ könnte der Wochenstand-Workflow mitliefern (Restpunkt).
