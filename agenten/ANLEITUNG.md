# Momentum Team-Portal – Anleitung für KI-Agenten

Gilt für **Claude Code, Codex und Hermes**. Das Team-Portal ist die gemeinsame Aufgabenliste von Momentum
(https://flowtimotion-cyber.github.io/N8N-Automation/team/). Menschen und Agenten arbeiten auf denselben Aufgaben.
Gespeichert wird in Supabase, der Zugang läuft aber **nur** über die Team-API. Agenten bekommen keinen Datenbank-Schlüssel.

## Einrichtung (einmal je Agent)

1. Timo kopiert im Portal unter **Team → Claude / Codex / Hermes → „Agenten-Code kopieren“** den Code.
2. Der Code kommt als Umgebungsvariable `TEAM_PORTAL_TOKEN` in die Umgebung des Agenten, zum Beispiel in `~/.bashrc`, die `.env` von Hermes oder die Codex-Konfiguration. Niemals ins Repo, in Notizen oder in Aufgaben schreiben.
3. Werkzeug: `agenten/team.py` aus diesem Repo. Es braucht nur Python 3, ohne Zusatzpakete.

## Arbeitsablauf

1. **Am Anfang jeder Sitzung:** `python3 team.py meine` zeigt deine offenen Aufgaben. `python3 team.py offen` zeigt alle Aufgaben, die als „Agent geeignet“ markiert sind.
2. **Aufgabe lesen:** `python3 team.py zeige <id>` zeigt Beschreibung und Verlauf. Kommentare von Menschen im Verlauf sind Hinweise und Rückfragen an dich.
3. **Beginnen:** `python3 team.py start <id>` setzt den Status auf „In Arbeit“. Ist die Aufgabe noch niemandem zugewiesen, übernimmst du sie.
4. **Fertig:** `python3 team.py bericht <id> "Was gemacht wurde, wo das Ergebnis liegt (Link/Datei/Commit), was noch offen ist"` setzt die Aufgabe auf „Wird getestet“. **„Erledigt“ setzt immer ein Mensch.**
5. **Rückfrage oder Blocker:** `python3 team.py kommentar <id> "Frage …"`. Dann nicht raten, sondern mit der nächsten Aufgabe weitermachen.
6. **Neue Aufgaben, die du bei der Arbeit findest:** `python3 team.py neu "Titel" --projekt "Projektname" --beschreibung "…" [--fuer agent-codex]`. Den Projektnamen zeigt `python3 team.py projekte`.
7. **Wissen ablegen:** `python3 team.py notiz-speichern "Titel" --projekt "…" --inhalt "Markdown"`. Gleicher Titel überschreibt die Notiz. Mit `[[Titel]]` verlinkst du andere Notizen.

## Wer macht was

| Agent | ID | Stärken |
|---|---|---|
| Claude | `agent-claude` | Planung, Texte, n8n-Workflows, Webseiten, Recherche, Doku |
| Codex | `agent-codex` | Code im Repo, Tests, Refactoring, Skripte |
| Hermes | `agent-hermes` | Läuft dauerhaft auf dem Hetzner-Server: wiederkehrende Aufgaben, Server, Überwachung |

## Regeln

- Nichts löschen, keine Arbeitszeiten, keine Teammitglieder ändern. Die API verweigert das ohnehin.
- Keine Zugangsdaten, Passwörter, API-Schlüssel oder Kundendaten in Aufgaben, Kommentare oder Notizen schreiben.
- Zugangsdaten in n8n legt immer ein Mensch an.
- Vor Aktionen, die Geld kosten, nach außen gehen (E-Mail, Posts, WhatsApp) oder nicht rückgängig zu machen sind, per Kommentar fragen und auf ein „Ja“ eines Menschen im Verlauf warten.
- Berichte kurz und konkret: was, wo, wie testen.

## Rohe API (falls kein Python da ist)

`POST https://n8n.hm-storage.de/webhook/team-api-v2`, Body: `{"token":"…","aktion":"…","daten":{…}}`

| Aktion | daten |
|---|---|
| `laden` | – (liefert aufgaben, verlauf, projekte, notizen, meine_aufgaben, agent_geeignet) |
| `aufgabe_speichern` | `aufgabe_id` (leer = neu), `titel`, optional `status`, `beschreibung`, `projekt`, `prio`, `verantwortlich`, `deadline`, `agent_geeignet`, `kommentar` |
| `kommentar` | `aufgabe_id`, `text` |
| `notiz_speichern` | `notiz_id` (leer = neu), `titel`, `inhalt`, `projekt` |
| `projekt_speichern` | `name`, `beschreibung`, `status` |
| `social_speichern` | `thema`, `text`, `kanal`, `datum` (Status höchstens „Zur Freigabe“) |

Status-Werte: Offen, Geplant, In Arbeit, Wartet, Wird getestet, Erledigt (nur Menschen).
