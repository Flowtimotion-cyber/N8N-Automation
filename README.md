# N8N-Automation – Kursmodule

Interaktive Lerneinheiten zum Thema **Automationen bauen mit n8n und Claude Code**. Jede Einheit ist eine einzige, offline lauffähige HTML-Datei mit Erklärvideos (Avatar + Animationen), Interaktionen, XP, Abschluss-Check und Merkblatt.

## Inhalt

| Ordner | Inhalt |
|---|---|
| `course/dist/` | **Fertige Lerneinheit** Modul 1.1 „Automationen verstehen und planen“ – per Doppelklick im Browser öffnen |
| `curriculum/` | Curriculum (Inhalt, Skripte, Interaktionen, Quellen) – Grundlage für die Produktion |
| `course/` | `data.py` (alle Lerntexte, Quiz, Interaktionen), `template.html` (Player/SPA), `build.py` (bettet Medien ein), `test_course.py` (Browser-Test) |
| `levels/` | Erklär-Animationen je Level als HyperFrames-Kompositionen (HTML/GSAP), beat-synchron zur Stimme |
| `lib/` | Gemeinsame Bausteine: Wort-Timing-Abgleich, Avatar-Kreis, Untertitel, n8n-Oberflächen-Nachbau |
| `media/` | Wort-Zeitstempel der Avatar-Spuren, Illustrationen |
| `projects/level2/` | Probestück, Schriften, GSAP, Icon-Daten |

## Pipeline

1. **Curriculum** schreiben und freigeben (kostet nichts)
2. **Avatar-Spuren** in HeyGen rendern (Avatar „Timo Merz“ mit eigener Stimme)
3. **Wort-Zeitstempel** per ElevenLabs Scribe → `media/words.json`
4. **Animationen** bauen: `cd levels && python3 l2.py` → `npx hyperframes render ../projects/m11_L2`
5. **Lerneinheit** bauen: `python3 course/build.py` → `course/dist/*.html`
6. **Testen**: `python3 course/test_course.py`

Nicht im Repository (zu groß bzw. Rohmaterial): `node_modules/`, Avatar-Rohvideos, Renders, Trailer-Clips. Setup: `npm install --ignore-scripts`.

## Stand

- [x] Modul 1.1 – Automationen verstehen und planen
- [ ] Modul 1.2 – Automationen bauen lassen (Schulungs-Instanz, Claude Code, Live-Build)
- [ ] Modul 1.3 – Dein eigener Server (Hetzner, n8n installieren, Umzug)
