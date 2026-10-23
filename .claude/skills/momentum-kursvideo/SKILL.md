---
name: "momentum-kursvideo"
description: "Erklärvideos für die Momentum-Kurse im bestehenden Stil produzieren (HeyGen-Avatar Timo, Scribe-Zeitmarken, HyperFrames-Szenen) und in den Kurs einbauen."
---

# Momentum-Kursvideo produzieren

Erstellt neue oder geänderte Erklärvideos für die Kurse der Momentum KI Akademie (Repo `Flowtimotion-cyber/N8N-Automation`) im immer gleichen Stil: HeyGen-Avatar „Timo Merz“ mit seiner HeyGen-Stimme, kurz im Vollbild, dann als Kreis unten links mit Label „KI-Avatar von Timo“, dahinter animierte Szenen (Karten, Logos, Terminal, Hub, Checklisten) und Wort-für-Wort-Untertitel.

## Wichtig vorab
- Die Arbeitsumgebung erreicht HeyGen und ElevenLabs NICHT direkt (Proxy blockt). Alles läuft über **Composio** (`COMPOSIO_REMOTE_WORKBENCH`), dort sind `heygen` (Alias „Hermetik“) und `elevenlabs` verbunden. Erst `COMPOSIO_SEARCH_TOOLS` aufrufen, um Session und Verbindungsstatus zu holen; dort steht auch das HeyGen-Guthaben (`remaining_balance`).
- Kosten: ca. 0,50 $ pro Minute Avatar-Video. Vor dem Rendern Guthaben nennen.
- Skripte vor dem Rendern von Timo freigeben lassen, außer er hat ausdrücklich „mach“ gesagt.
- Keine Schlüssel in Dateien oder ins Repo schreiben.

## 1. Skript
- Aufbau (Hormozi): Hook in den ersten 5 Sekunden → „Warum das wichtig ist“ → Erklärung mit Alltagsbild → Überleitung zum nächsten Kursschritt. 60–100 Sekunden (ca. 200–240 Wörter). Du-Form, einfache Sprache.
- Aussprache für HeyGen: `N-Eight-N`, `K-I`, `M-C-P`, `A-P-I`. Nicht „Agentur für Arbeit“, nur „gefördert“.
- Der Schluss muss zum tatsächlich nächsten Kursschritt passen (Erklärseite oder Aufgabe).
- Ablage: `leadmagnet/Skripte_Unternehmer_Videos.md` (Unternehmer-Kurs) bzw. Curriculum-Datei für den Mitarbeiter-Kurs. Abschnitt `## KEY · Titel (ca. N s)`.

## 2. Avatar rendern (Composio-Workbench)
```python
r,e=run_composio_tool('HEYGEN_V2_VIDEO_GENERATE',{'title':'Unternehmer KEY','dimension__width':1920,'dimension__height':1080,
  'video_inputs':[{'character':{'type':'avatar','avatar_id':'596efcf8f05943cc93738b75ac7fc3ab','avatar_style':'normal'},
  'voice':{'type':'text','voice_id':'92b27e9c4c2e403c90de56c68eb20c15','input_text':TEXT},
  'background':{'type':'color','value':'#F3F1EC'}}]})
video_id=r['data']['data']['video_id']
```
- Text vorher ohne `**` und Zeilenumbrüche, `KI` → `K-I`.
- Mehrere Videos parallel mit `ThreadPoolExecutor(3)`.
- Status: `HEYGEN_RETRIEVE_VIDEO_STATUS_DETAILS` alle ~9 s, bis `completed` (dauert ca. 2–3 Min.). Ergebnis `data.data.video_url`, `duration`.
- Hinweis: Der v2-Endpunkt läuft laut HeyGen am 31.10.2026 aus. Danach mit `COMPOSIO_SEARCH_TOOLS` das Nachfolge-Tool (v3 /videos) suchen, gleiche Avatar-/Stimmen-IDs.

## 3. Wort-Zeitmarken
```python
t,e=run_composio_tool('ELEVENLABS_TRANSCRIBE_AUDIO',{'model_id':'scribe_v2','source_url':video_url,'language_code':'de','timestamps_granularity':'word','tag_audio_events':False})
words=[{'t':x['text'],'s':x['start'],'e':x['end']} for x in t['data']['words'] if x['type']=='word']
```

## 4. Übergabe in die Arbeitsumgebung
- Im Workbench MP4 per `requests.get(video_url)` speichern, dann `upload_local_file(...)` für jede MP4 und für die Wort-JSON; das liefert `https://backend.composio.dev/api/v3/sl/...`.
- Lokal: `curl -sSL -o videos/heygen_u/raw/KEY.mp4 <url>` (Ordner `raw/` ist in .gitignore).
- Wörter in `videos/heygen_u/words.json` unter dem Schlüssel KEY einmischen (bestehende Einträge behalten).

## 5. Szenenplan
- Datei `videos/kit/plans_unternehmer.py`, Eintrag `P["KEY"] = dict(av_end="<Phrase, ab der der Avatar klein wird>", scenes=[S(...), ...])`.
- Szenentypen in `videos/kit/kit.py` (`k_*`): hook, title, stat, cards, hub, flow, shot, compare, check, term, chat, cred, json, toggle, house, bars, brief.
- Jede Szene und jedes Element startet an einer Anker-Phrase (`at`), die im **Scribe-Transkript** vorkommen muss, nicht im Skript. Scribe schreibt z. B. „Superbase“, „Racksystem“, „Cloud Code“/„CloudCode“, „N8N“, „Firmengedächtnis“. Anker ggf. anpassen.
- Szenen müssen in der Reihenfolge des Gesprochenen stehen. Warnung „'X' at … after scene end“ heißt: Element liegt nach dem Beginn der nächsten Szene → umsortieren.
- Untertitel-Korrekturen in `CAPFIX` in `kit.py` ergänzen (z. B. `CloudCode` → `Claude Code`, `Racksystem` → `RAG-System`, `N8N` → `n8n`).

## 6. Studio einrichten und Szenen bauen
```bash
mkdir -p /home/claude/studio/{out,renders,final} && cd /home/claude/studio && npm init -y && npm install hyperframes@0.8.183 simple-icons@16.35.0
cd <repo>/videos/kit && export KIT_HEYGEN=heygen_u KIT_ICONS=/home/claude/studio/node_modules/simple-icons/icons KIT_AVLABEL=1
python3 -c "import sys;sys.path.insert(0,'.');from kit import compose;from plans_unternehmer import P;print(compose('KEY',P['KEY'],'/home/claude/studio/out/KEY'))"
```
- Keine WARN-Zeilen akzeptieren. Danach Standbilder prüfen: Seite `file:///home/claude/studio/out/KEY/index.html` mit Playwright öffnen, `window.__timelines["key"].seek(t,false)` je Szene, Screenshot, als Kontaktbogen ansehen. (Der Avatar-Kreis ist im Standbild leer, das ist normal.)

## 7. Rendern und kodieren
```bash
export HYPERFRAMES_BROWSER_PATH=/opt/pw-browsers/chromium
cd /home/claude/studio/out/KEY && /home/claude/studio/node_modules/.bin/hyperframes render . -o /home/claude/studio/renders/KEY.mp4 -f 25 -q looks --crf 23 -w 2 --quiet
ffmpeg -y -i renders/KEY.mp4 -c:v libx264 -crf 24 -preset medium -af loudnorm=I=-14:TP=-1 -c:a aac -b:a 128k -movflags +faststart final/KEY.mp4
ffmpeg -y -i renders/KEY.mp4 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 36 -b:v 0 -af loudnorm=I=-14:TP=-1 -c:a libopus -b:a 96k final/KEY.webm
ffmpeg -y -ss 3 -i renders/KEY.mp4 -frames:v 1 -q:v 4 final/KEY.jpg
```
- Rendern im Hintergrund starten (mehrere Minuten pro Video). Danach 3–4 Frames aus dem fertigen MP4 ansehen (Avatar sichtbar, Untertitel, Szenen) und Ton kurz prüfen.

## 8. In den Kurs einbauen (Unternehmer-Kurs)
- Alle Videos nach `course/videos_unternehmer/` legen: vorhandene aus `docs/unternehmer/media/` kopieren, neue aus `final/` (mp4, webm, jpg).
- Neuer Schlüssel: in `course/build_unternehmer.py` in die Videoliste aufnehmen und in `course/data_unternehmer.py` beim Level unter `videos` eintragen. Der Build überspringt Videos, die noch fehlen.
- `python3 course/build_unternehmer.py`, danach `course/videos_unternehmer/` wieder löschen (nicht ins Repo).
- Kurs mit Playwright auf 390 px und 1280 px durchklicken (Video-Schritte, keine Konsolenfehler, kein seitliches Scrollen).
- Commit auf einen Feature-Branch, Push, PR. Skript, Szenenplan, `words.json` und `docs/unternehmer/media/` mit committen.

## 9. Abschluss
- Projektstand im Projekt-Dokument `claude/Leadmagnet_Unternehmer_Stand.md` aktualisieren (welche Videos neu, Video-IDs, Kosten, Guthaben).
- Timo kurz berichten: welche Videos, Länge, wo im Kurs, ob live (PR gemergt) oder nicht.