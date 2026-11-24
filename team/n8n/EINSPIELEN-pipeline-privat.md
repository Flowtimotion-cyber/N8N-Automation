# Einspielen: Pipeline, private Aufgaben, „Zu entscheiden“ (Stand 24.11.2026)

Reihenfolge ist wichtig. Jeder Schritt läuft, ohne dass der nächste schon da ist.

| # | Wer | Was | Prüfen |
|---|-----|-----|--------|
| 1 | Timo | `supabase/team_aufgaben_privat.sql` komplett im Supabase SQL Editor ausführen | Probe am Ende der Datei ausführen: dreimal `true` |
| 2 | Mastersitzung (nach Timos Ja) | n8n „TEAM: Portal-API v2 (Supabase, Agenten)“ `kMuDaDmT9rCN5Vs2`: Operationen aus `team/n8n/deploy-portal-api-privat.json` | Vorher Live-Version `97ec9862…` und `live_sha256` beider Knoten abgleichen, nachher `neu_sha256`; Versionsname „Claude Code: private Aufgaben, Label Entscheidung“ |
| 3 | Timo | PR mergen (Portal geht über GitHub Pages live) | Portal neu laden: Übersicht zeigt „Zu entscheiden“, Aufgaben → Pipeline |

## Was sich wo ändert

- **Supabase:** Spalte `team_aufgaben.privat`. `team_laden()` liefert keine privaten Aufgaben mehr (KI Office, Wochenstand, Portal-Assistent, Verwaltungs-Status lesen diese Funktion). Die bisherige Funktion heißt jetzt `team_laden_alle()`, nur `team_laden_plus()` (Portal-API) liest sie.
- **Wichtig für später:** Wer `team_laden()` mit „create or replace“ neu anlegt, hebt den Filter auf. Danach `team_aufgaben_privat.sql` erneut ausführen, sie stellt alles wieder her (getestet in `team/test/sql-privat.test.mjs`).
- **n8n Portal-API:** nur der Code der Knoten „Anfrage prüfen“ und „Antwort bauen“. Fremde private Aufgaben gibt es für die API nicht (Lesen gefiltert, Schreiben 404), auch nicht für Timo und andere Agenten. Neues Label „⚖️ Entscheidung“.
- **Portal (`docs/team/index.html`):** Pipeline-Board nach Status oder Prio mit Ziehen, Haken „🔒 Privat“, Liste „Zu entscheiden“ auf der Übersicht, anklickbare Kennzahlen, Knopf „Nachweis bei Timo anfordern“ (Arbeitszeit → Monat).

## Zurück, falls etwas klemmt

- Portal: PR zurücknehmen (Revert). Die API kommt mit dem alten Portal klar.
- n8n: in der Versionshistorie auf `97ec9862…` zurück.
- Supabase: nicht nötig. Ohne private Aufgaben verhält sich alles wie vorher. Nur wenn gewünscht: `alter function team_laden() rename to team_laden_gefiltert; alter function team_laden_alle() rename to team_laden;` und in `team_laden_plus()` den Aufruf zurück auf `team_laden()` stellen.
