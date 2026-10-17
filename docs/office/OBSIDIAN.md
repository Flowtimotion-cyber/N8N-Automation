# Obsidian-Spiegelung der KI-Office-Ergebnisse

Stand: 17.10.2026 (KI-erstellt: Claude Code, Sitzung „KI Office Obsidian“). Timos Wunsch vom 17.10.2026: „auch sollten wir Obsidian die Infos auch geben, was das KI Office produziert“.

Kurz: Alles, was Agenten im KI Office als **Ergebnis** (Artefakt) ablegen, landet als Notiz im Obsidian-Vault. Pro Run eine Notiz, pro Artefakt ein Abschnitt darin. Geschrieben wird von `agenten/office.py obsidian`, ausgeführt von Hermes (oder einer geplanten Aufgabe auf Timos Rechner). Der zentrale Speicher bleibt Supabase; Obsidian ist ein Spiegel zum Lesen, Verlinken und Weiterdenken.

## 1. Was gespiegelt wird und was nicht

**Hinein kommt** (aus der Antwort von `laden`, nur Felder, die die Office-API ohnehin rollengefiltert liefert):

| Quelle | Feld | Verwendung in der Notiz |
|---|---|---|
| Artefakt | `artefakt_id` | Marker `<!-- artefakt:… -->`, Idempotenz |
| Artefakt | `titel`, `art`, `erstellt` | Abschnittsüberschrift |
| Artefakt | `zusammenfassung` | Text im Abschnitt (maskiert, siehe unten) |
| Artefakt | `ablageort` | Link (`https://`), Wikilink (Art `notiz`) oder Pfad in Backticks |
| Artefakt | `inhalt_hash` | Zeile „Hash“, damit sich Versionen vergleichen lassen |
| Run | `run_id` | Link ins Office (`…/office/#/run/<run_id>`), Dateiname |
| Run | `projekt`, `agent_id`, `aufgabe_id`, `status` | Frontmatter und Kopfzeile |
| Run | `auftrag` (gekürzt auf 200 Zeichen) | Titel der Notiz |
| Run | `abgenommen`, `abgenommen_am` | Prüfstand: geprüft / ungeprüft / zurückgewiesen |

**Nicht hinein kommt**, auch nicht in gekürzter Form:

- der Token oder irgendein Zugangsdatum (das Skript liest ihn nur aus der Umgebung, er taucht in keiner Ausgabe auf),
- Freigaben (`freigaben`): weder Aktion, Inhalt, Vorschau noch Entscheidung. Freigaben enthalten E-Mail-Texte, Empfänger, Beträge,
- die Zeitleiste (`ereignisse`), Rückfragen und Antworten, Zusammenfassungen des Runs, Verbrauch/Kosten,
- Namen und Kontaktdaten von Mitgliedern (`mitglieder`), Kursdaten, Aufgabenbeschreibungen,
- Ergebnis-Inhalte selbst: das Office kennt nur Ablageort und Hash, die Spiegelung lädt nichts nach.

**Maskierung:** E-Mail-Adressen, Telefonnummern und lange Zeichenketten, die wie Schlüssel aussehen (32+ Zeichen Hex/Base64), werden in Titel, Zusammenfassung und Auftrag durch `[entfernt]` ersetzt. Das ist ein Netz, keine Garantie: Was ein Agent in eine Zusammenfassung schreibt, verantwortet der Ausführer (Regel in `agenten/ANLEITUNG.md`: keine Kundendaten in Ergebnisse). Projektnamen werden übernommen, wie sie im Portal stehen.

## 2. Wohin im Vault

Ordner `01 Inbox/KI Office/` (anpassbar mit `--ordner`). **Eine Notiz je Run**, Dateiname `JJJJ-MM-TT <run_id>.md` (Datum des ersten gespiegelten Ergebnisses).

Warum nicht ein täglicher Sammelabschnitt in `02 Projekte/Momentum KI Akademie.md`:

- Die Projektnotiz ist Timos Datei (Vault-Regel: nur anhängen). Bei mehreren Runs am Tag würde sie schnell unlesbar, und Agenten-Ausgaben gehörten nicht zwischen Timos Entscheidungen.
- Eine Notiz je Run ist einzeln verlinkbar (`[[01 Inbox/KI Office/2026-10-17 run_…]]`), lässt sich in Obsidian nach `projekt`, `agent`, `pruefstand` filtern (Frontmatter) und bei Bedarf von Timo ins Archiv oder in ein Projekt verschieben.
- Die Inbox ist laut Vault-CLAUDE.md der Ort für Unverarbeitetes. Genau das sind Agentenergebnisse, bis ein Mensch sie abgenommen hat.

Die Projektnotiz bekommt einmalig einen Hinweis-Abschnitt (im üblichen Muster `## Update … (KI-erstellt …)`), dass die Ergebnisse unter `01 Inbox/KI Office/` liegen. Das schreibt nicht das Skript, sondern die Hauptsitzung oder Timo. Tagesnotizen fasst das Skript nicht an; Hermes kann die Inbox-Notizen für seinen Wochen-Lagebericht lesen.

## 3. Format einer Run-Notiz

```markdown
---
typ: ki-office-run
run_id: run_m2x3…
projekt: Akademie-Kurs
agent: akademie-redakteur
aufgabe_id: a_k1
status: abgeschlossen
pruefstand: geprüft
erstellt: 2026-10-17
aktualisiert: 2026-10-17
quelle: KI Office (office.py obsidian)
herkunft: KI-erstellt
---
# KI Office: Merkblatt Modul 1.2 als Entwurf schreiben

**Run:** [run_m2x3…](https://flowtimotion-cyber.github.io/N8N-Automation/office/#/run/run_m2x3…) · **Projekt:** Akademie-Kurs · **Agent:** akademie-redakteur · **Aufgabe:** a_k1

(KI-erstellt: KI Office / office.py obsidian. Ergebnisse des Agenten, nicht von Timo. Fachlich geprüft nur, wenn Prüfstand „geprüft“.)

## Ergebnisse

### 17.10.2026 14:03 — Quiz-Auswertung Modul 1.2 (Diagramm) [datei]
<!-- artefakt:art_m2x4… -->
- Zusammenfassung: Richtige Antworten je Frage als Balkendiagramm; Frage 8 fällt ab.
- Ablageort: [https://…/akademie-quiz-modul-1-2.svg](https://…/akademie-quiz-modul-1-2.svg)
- Hash: `3f9a…` (SHA-256, 64 Hex-Zeichen, wie vom Ausführer gemeldet)
- Prüfstand beim Spiegeln: ungeprüft

## Stand
- 17.10.2026 14:20 — Status abgeschlossen, Prüfstand geprüft (17.10.2026)
```

Regeln:

- **Herkunftsvermerk** steht zweimal: im Frontmatter (`herkunft: KI-erstellt`) und als Satz unter der Kopfzeile. Damit ist die Governance-Entscheidung vom 22.07.2026 erfüllt, auch wenn jemand nur den Text liest.
- **Prüfstand** = fachliche Abnahme im Office (`run_abnehmen`): `geprüft` (abgenommen), `zurückgewiesen`, sonst `ungeprüft`. Er steht im Frontmatter (aktueller Stand) und je Ergebnis als Momentaufnahme.
- **Ablageort:** `https://`-Adressen als Markdown-Link; Art `notiz` ohne `://` als `[[Wikilink]]` (Agenten legen Vault-Wissen laut Anleitung mit dem Notiz-Pfad ab); alles andere in Backticks. `http://`, `javascript:` und ähnliche Adressen werden nicht verlinkt, nur in Backticks gezeigt.
- Es gibt **keine Wikilinks** auf Ziele außerhalb des Vaults.

## 4. Idempotenz und Zustand

- Ein Artefakt wird nie doppelt angehängt. Drei Sicherungen: Zustandsdatei mit allen gespiegelten `artefakt_id`s, Zeitstempel des neuesten gespiegelten Artefakts (Vorfilter mit 24 h Spielraum, damit nachträglich sichtbar gewordene Ergebnisse nicht verloren gehen) und der Marker `<!-- artefakt:ID -->` in der Notiz selbst (greift auch, wenn die Zustandsdatei fehlt).
- Zustandsdatei: `agenten/office.obsidian.json` neben `office.py` (gitignored, nicht im Vault). Inhalt: `stand` (ISO-Zeit des neuesten gespiegelten Artefakts), `artefakte` (Liste der IDs), `letzter_lauf`.
- **Anhängen, nie überschreiben** im Textteil. Einzige Änderung an Bestehendem: die Frontmatter-Felder `status`, `pruefstand`, `aktualisiert` der vom Skript angelegten Notizen (`typ: ki-office-run`). Ändert sich Status oder Prüfstand, kommt zusätzlich eine Zeile unter `## Stand`. Notizen ohne diesen `typ` fasst das Skript nicht an.
- Runs ohne Ergebnis bekommen keine Notiz. Gelöschte Runs (Löschkonzept, 180 Tage) bleiben im Vault stehen; das Skript löscht nie.

## 5. Wer schreibt: office.py, nicht n8n

Entscheidung (KI-Vorschlag): **`office.py obsidian`**, ausgeführt dort, wo der Vault liegt.

- Hermes läuft auf Timos Rechner und pflegt den Vault ohnehin; er braucht nur `TEAM_PORTAL_TOKEN` (hat er) und den Vault-Pfad (`OBSIDIAN_VAULT` oder `--vault`).
- Ein n8n-Knoten auf Hetzner hat keinen Zugriff auf die Vault-Dateien. Er bräuchte einen zweiten Weg (Sync-Dienst, Git, Dateifreigabe) und damit einen zweiten Schreiber im Vault, mehr Angriffsfläche und eine Änderung am produktiven Workflow. Das ist nicht nötig.
- Falls Hermes nicht läuft: Die Windows-Aufgabenplanung kann `python agenten/office.py obsidian` alle 30 Minuten starten; dasselbe Skript, derselbe Token.

**Sichtgrenze:** Das Skript sieht genau das, was der verwendete Token sieht. Mit dem Hermes-Token sind das die Runs in Hermes’ Registry-Projekten (`office/agenten.json`, Rechteregel in `office/lib/rechte.js`), nicht das ganze Office. Für eine vollständige Spiegelung muss der Lauf mit einem Menschen-Token mit Projektsicht laufen (Timo) oder Hermes’ Projektliste erweitert werden. Das ist eine Entscheidung für Timo (RESTPUNKTE.md).

## 6. Bedienung (kurz)

```
set OBSIDIAN_VAULT=D:\Hermes\Obsidian zweites Gehirn\Zweites Gehirn Osidian
python agenten/office.py obsidian                 Neues seit dem letzten Lauf spiegeln
python agenten/office.py obsidian --trocken       nur zeigen, nichts schreiben
python agenten/office.py obsidian --alles         Zustandsdatei ignorieren (Marker schützen trotzdem vor Doppeln)
python agenten/office.py obsidian --ordner "04 Ressourcen/KI Office"   anderer Zielordner
```

Das Skript prüft, dass im Vault-Pfad ein Ordner `.obsidian` liegt. Sonst schreibt es nichts (Schutz gegen Tippfehler im Pfad). Ausgabe: Anzahl neuer Notizen, angehängter Ergebnisse und aktualisierter Stände.

## 7. Tests

`python agenten/test_office_obsidian.py` startet den lokalen Testserver (`node office/dev/server.mjs`, synthetische Daten) auf einem freien Port und einen Wegwerf-Vault im Temp-Ordner. Geprüft wird: Notizen entstehen nur für Runs mit Ergebnissen, jedes Artefakt genau einmal, zweiter Lauf hängt nichts an, Marker schützt ohne Zustandsdatei, Maskierung von E-Mail/Telefon, Prüfstand-Wechsel landet in Frontmatter und `## Stand`, Token taucht nirgends auf, Freigaben tauchen nirgends auf, falscher Vault-Pfad wird abgelehnt. Der echte Vault wird von den Tests nicht berührt.
