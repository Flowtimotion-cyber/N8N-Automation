---
name: momentum-video-pipeline
description: "Team-Videos für Instagram (@momentumkiakademie) verarbeiten: neue Videos in den Personen-Ordnern finden, mit ffmpeg und lokalem Whisper angleichen (9:16, Lautheit, Hook-Karte, Wort-Untertitel, Abschlusskarte), Story-Video bauen, öffentlich im Bucket social-medien ablegen und als Reel mit Status „Zur Freigabe“ ins Team-Portal stellen. Nutzen bei „neue Team-Videos verarbeiten“, „Reel einstellen“, „Video-Pipeline laufen lassen“ und für den täglichen Lauf."
---

# Momentum Video-Pipeline

Macht aus einem Team-Video ein fertiges Reel plus Story-Video und stellt es zur Freigabe ins Team-Portal.
Gepostet wird erst, wenn ein Mensch im Portal freigibt (das macht der Veröffentlicher `p6DSEWCr344R0Nlt`).

## Harte Regeln

- **Nie freigeben, nie veröffentlichen, nie den Status „Geplant“ setzen**, keine geplanten Beiträge verschieben, keine DMs oder Kommentare.
- **Originale nur lesen.** Nie verändern, verschieben oder löschen. Ergebnisse überschreiben nie eine vorhandene Datei (das Skript hängt `_v2`, `_v3` an).
- **Keine bestehenden n8n-Workflows ändern.** Benutzt werden nur `KvUXkDhCMuJjssgK` (einstellen) und „SOCIAL: Video hochladen (intern)“ (ablegen).
- **Keine Schlüssel** in Code, Repo, Prompts, Chat oder Projekt-Dokumente. Das Repo ist öffentlich: auch keine Personennamen, Laufwerkspfade oder Strategie-Regeln hineinschreiben. Die stehen in der lokalen Konfiguration.
- **Nichts erfinden.** Captions nur nach den Strategie-Dateien. Fehlen sie, keine Caption schreiben, sondern melden.
- Dateien mit `_nicht` oder `_privat` im Namen (oder im Ordnernamen) bleiben liegen: Jede Person entscheidet selbst, was veröffentlicht wird.

## Voraussetzungen (einmalig)

| Was | Wo |
|---|---|
| ffmpeg und ffprobe | im PATH (geprüft mit 8.1) |
| `uv` | im PATH. Whisper und Pillow holt `uv run` beim ersten Aufruf selbst in eine eigene Umgebung. Kein fremdes Python anfassen. |
| Konfiguration | `%LOCALAPPDATA%\momentum-video-pipeline\config.json`, Vorlage: `config.beispiel.json`. Enthält Personen, Ordner, Kürzel, Ort der Schlüsseldatei und der Strategie-Dateien. |
| Schlüsseldatei | Pfad steht in der Konfiguration (`geheim_datei`). Inhalt: `MOMENTUM_UPLOAD_URL=…` und `MOMENTUM_UPLOAD_KEY=…`. Timo legt sie mit `pipeline.py schluessel-anlegen` an: Der Befehl erzeugt den Schlüssel, zeigt ihn nie an und kopiert ihn in die Zwischenablage, damit Timo ihn in n8n beim Credential „SOCIAL Video-Upload“ (Header Auth, Header-Name `X-Upload-Key`) einfügen kann. Claude führt diesen Befehl nicht selbst aus und liest die Datei nicht. |
| Strategie-Dateien | Ordner aus `strategie_ordner`: `content-strategie-momentum.md`, `<person>-reels-einplanung.md`, `<person>-skripte.md` (Kopien aus dem claude.ai-Projekt „Momentum Socialmedia“). |
| n8n | Connector „n8n“ (selbst gehostet). Liefert er nur Fehler: Timo bitten, ihn im Plus-Menü unter Connectors aus- und wieder einzuschalten. Nicht nach Schlüsseln in Dateien suchen. |

Alle Befehle laufen aus dem Repo-Hauptordner:

```bash
uv run .claude/skills/momentum-video-pipeline/scripts/pipeline.py <befehl> …
```

## Ablauf

### 1. Finden

```bash
uv run .claude/skills/momentum-video-pipeline/scripts/pipeline.py finden
```

Liefert je Person: `neu` (zu bearbeiten), `einzelaufnahmen` (Ordner mit vielen Kamera-Aufnahmen), `uebersprungen`, `schon_im_log`.
Neu ist, was noch nicht im Log der Person steht (Schlüssel: Dateiname, Größe, Änderungsdatum; Kopien werden am Inhalt erkannt).

- `art: fertig` (aus dem Ordner „zum prüfen“): schon geschnitten, **nur so wenig wie nötig ändern**.
- `art: roh`: einzelne, durchgehende Aufnahme, voller Weg.
- `einzelaufnahmen`: **nicht automatisch schneiden.** Im Log als `braucht_schnitt` eintragen und in der Abschlussmeldung nennen.
- `kennung` (z. B. `L3`) kommt aus dem Dateinamen (`…_Reel3_…`). Fehlt sie: über die Abschrift mit der Skript-Datei abgleichen. Passt kein Skript eindeutig, nicht raten, sondern melden.

Ist `neu` leer und gibt es keine `einzelaufnahmen`: kurz melden, fertig.

### 2. Prüfen und ansehen

```bash
uv run …/pipeline.py pruefen "<datei>" --bogen "<scratch>/bogen.jpg"
```

Misst Format, Lautheit, Stille, faststart und schreibt einen Kontaktbogen (8 Standbilder). **Den Kontaktbogen ansehen** und entscheiden:

| Frage | Wenn ja |
|---|---|
| Steht in Sekunde 0–2 schon eine große Textkarte? | `--hook` weglassen |
| Laufen schon Untertitel mit? | `--worte` weglassen |
| Endet das Video schon auf der Navy-Abschlusskarte? | `--abschluss` weglassen |

`hookkarte_vermutet` und `abschlusskarte_vermutet` sind nur Hinweise, das Bild entscheidet.

### 3. Abschrift (nur wenn Untertitel oder die Skript-Zuordnung sie brauchen)

```bash
uv run …/pipeline.py transkribieren "<datei>" --aus "<scratch>/worte.json"
```

Lokales Whisper, nichts verlässt den Rechner. **Die Wörter in `worte.json` gegen das Skript lesen und Fehler korrigieren** (Eigennamen, „n8n“, „Claude“, „Skill“), nur das Feld `w`, Zeiten nicht anfassen. Beginnt die Aufnahme mit einer Begrüßung oder einem Anlauf („Okay, also …“), das melden: Das ist ein Schnitt, den ein Mensch entscheidet.

### 4. Bearbeiten

```bash
uv run …/pipeline.py bearbeiten "<datei>" \
  --hook "Zeile 1|Zeile 2" --worte "<scratch>/worte.json" --abschluss "Merksatz Zeile 1|Merksatz Zeile 2"
```

- Nur die Schalter setzen, die laut Schritt 2 fehlen. Ohne Schalter prüft das Skript nur Technik.
- Hook: höchstens 6–7 Wörter, aus der Skript-Datei. Die letzte Zeile steht im Verlauf.
- Merksatz: zwei Zeilen aus der Skript-Datei (weiß, darunter Türkis).
- Das Skript gleicht selbst an: 1080×1920, H.264 + AAC, 30 fps, ca. −15 LUFS, faststart, HDR-Aufnahmen vom Handy in Normalfarben, Stille am Anfang und Ende weg.
- Passt schon alles, wird die Datei 1:1 kopiert (kein Qualitätsverlust).
- Ergebnis: `<Name>_optimiert.mp4` im Ordner „zum prüfen“ der Person. Die Ausgabe nennt `geaendert` und `nicht_geaendert`: beides in die Abschlussmeldung übernehmen.
- **Danach `bogen_nachher.jpg` im Arbeitsordner ansehen:** Karte lesbar, Untertitel nicht über dem Gesicht, Abschlusskarte da.

### 5. Story-Video

```bash
uv run …/pipeline.py story "<…_optimiert.mp4>" --hook "Zeile 1|Zeile 2" --karte "<Person> zeigt …"
```

7 Sekunden, heller Hintergrund, Pille „NEUES REEL“, Hook, runder Ausschnitt der ersten Sekunden mit Verlaufsring, Karte, Footer. Ablage daneben als `story-<name>.mp4`. **Vorschau ansehen** (`story_vorschau.jpg`); sitzt das Gesicht nicht im Kreis, mit `--ausschnitt Kante:x:y` nachstellen.
Das Story-Video wird abgelegt, aber **nicht eingestellt** (die Instagram-Schnittstelle kann keine Sticker). Der Link gehört in die Abschlussmeldung.

### 6. Ablegen

```bash
uv run …/pipeline.py hochladen "<…_optimiert.mp4>" --prefix "team-<kennung>"
uv run …/pipeline.py hochladen "<story-….mp4>" --prefix "story-<kennung>"
```

Holt bei n8n eine einmalige Upload-Adresse, lädt direkt in den Bucket `social-medien` und prüft danach, ob die öffentliche Adresse die Datei in voller Größe liefert. Ausgabe: `url`. Nur `.mp4`/`.jpg`, höchstens 200 MB. Scheitert der Schritt: nicht einstellen, im Log `status: fehler_upload`, melden.

### 7. Caption schreiben

Erst die Strategie-Dateien lesen (Regeln für die Woche, Regel 0 Reserve, Regel 9a, Sperrliste, Zielgruppen-Bedenken; Beispiel-Captions in der Einplanungs-Datei; Hook und Kennung in der Skript-Datei). Dann:

- Aufbau: Hook, nummerierte Punkte `01`–`0x`, Merksatz, **genau ein** Aufruf.
- Der Aufruf in der Caption muss zum Aufruf im Video passen (im Video hören oder in der Abschrift lesen).
- Sperrliste beachten. Nichts behaupten, was weder im Video noch im Skript steht.
- Skill-Text nur, wenn er vorliegt **und** Kurt ihn geprüft hat. Sonst wörtlich der Platzhalter `[SKILL-TEXT NACH KURTS PRÜFUNG]`.
- 8–10 Hashtags, getrennt vom Text.

### 8. Einstellen

Über den n8n-Connector, Werkzeug `execute_workflow`:

- `workflowId`: `KvUXkDhCMuJjssgK`, `executionMode`: `manual`
- `inputs`: `{ "type": "webhook", "webhookData": { "method": "POST", "body": { … } } }`

| Feld | Wert |
|---|---|
| `thema` | kurzer Titel, 3–160 Zeichen |
| `kanal` | `Instagram` |
| `format` | `Reel` |
| `uhrzeit` | `12:30` |
| `hook` | Hook, höchstens 300 Zeichen |
| `medien` | öffentliche URL aus Schritt 6 |
| `text` | Caption ohne Hashtags, höchstens 4000 Zeichen (Instagram kürzt Text + Hashtags bei 2200) |
| `hashtags` | 8–10, höchstens 500 Zeichen |
| `quelle` | `Team-Video <Person> <Kennung> \| Bedenken=…`, höchstens 400 Zeichen |

Kein `datum` mitgeben: Der Workflow nimmt den nächsten freien Reel-Tag. Der Status ist immer „Zur Freigabe“, Telegram an Timo geht von selbst. Danach mit `get_execution` die `post_id` aus der Antwort lesen. **„success“ ist kein Beleg:** Ohne `post_id` gilt der Beitrag als nicht eingestellt.

### 9. Dokumentieren

```bash
uv run …/pipeline.py log-eintrag --person "<Name>" --daten '{"schluessel":"…","fingerabdruck":"…","status":"eingestellt","ergebnis":"…","story":"…","url":"…","story_url":"…","post_id":"…","kennung":"…"}'
```

`schluessel` und `fingerabdruck` aus Schritt 1 übernehmen. Status-Werte: `eingestellt`, `trockenlauf`, `braucht_schnitt`, `uebersprungen`, `fehler_upload`, `altbestand`.

Für die Tabelle „Veröffentlichte/geplante Beiträge“ in `claude/content-strategie-momentum.md` (claude.ai-Projekt): mit `project_read` lesen, eine Zeile anhängen, mit `project_write` auf denselben Pfad zurückschreiben, alles andere unverändert. **Hat die Sitzung diese Werkzeuge nicht** (in Claude Code ist das der Normalfall), die fertige Tabellenzeile in die Abschlussmeldung schreiben, damit sie jemand mit Projektzugriff einträgt.

Im Arbeitsbereich zusätzlich die Ablage-Regeln aus `D:\Hermes\CLAUDE.md` einhalten (`_STATUS.md`, Vault nur anhängen, Herkunftsvermerk, keine PII).

## Abschlussmeldung

Kurz, auf Deutsch, per du. Je Video: Ergebnisdatei, was geändert wurde und was nicht, Link zum Reel, Link zum Story-Video, `post_id`, geplanter Tag. Dazu: was übersprungen wurde und warum, welche Ordner Schnitt brauchen, was nicht geprüft werden konnte.

## Trockenlauf

Schritte 1–5 und 7 wie oben, Schritt 6 mit `--trocken`, Schritt 8 auslassen, im Log `status: trockenlauf`. Mit `--trocken-lokal` bleiben auch die Ergebnisse von Schritt 4 und 5 im lokalen Arbeitsordner.

## Erster Lauf für eine neue Person

```bash
uv run …/pipeline.py altbestand --person "<Name>"
```

Trägt alles, was schon da ist, als erledigt ins Log ein. Sonst würden alte, längst gepostete Videos noch einmal eingestellt. Vorher mit Timo klären, was davon wirklich schon online ist.

## Grenzen

- Aus vielen Einzelaufnahmen schneidet die Pipeline kein Reel. Das braucht einen Menschen oder einen eigenen Schnitt-Schritt.
- Infokarten mitten im Video (wie in den ersten drei Reels) setzt die Pipeline nicht.
- Ob schon eine Hook-Karte oder Untertitel im Bild sind, entscheidet der Blick auf den Kontaktbogen, nicht das Skript.
- Whisper-Modell `small` verhört sich bei Fachwörtern. Deshalb Schritt 3 nie überspringen.

## Dateien

| Datei | Zweck |
|---|---|
| `scripts/pipeline.py` | alle Befehle |
| `scripts/karten.py` | Hook-Karte, Untertitel, Abschlusskarte, Story im Momentum-Look |
| `assets/fonts/` | Inter (ExtraBold, Bold, Medium), SIL Open Font License, Lizenztext liegt bei |
| `config.beispiel.json` | Vorlage für die lokale Konfiguration |
| `social/n8n/video-hochladen.workflow.js` | Quelle des n8n-Workflows „SOCIAL: Video hochladen (intern)“ |
| `social/test/video-hochladen.test.mjs` | Tests für dessen Prüflogik |

Markenfarben: Navy `#16123A`, Türkis `#12B1C8`, Verlauf `#9B2FC7` → `#3B4FD8` → `#22C2C8`, Story-Hintergrund `#FAF8F4`.
