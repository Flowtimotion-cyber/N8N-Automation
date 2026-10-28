---
name: "momentum-kinofilm"
description: "Kinoreife KI-Filme für Momentum (Hero-Film, Imagefilm, Teaser, Reels) mit Seedance über kie.ai erzeugen, im Schnitt mit Logos, Texten, Musik und Kinostimme fertigstellen und auf der Webseite einbauen."
---

# Momentum-Kinofilm produzieren

Vom Story-Gespräch bis zum fertigen Film auf der Webseite. Vorbild: Hero-Film „Puls“ (28.10.2026, live auf momentum-ki-akademie.de). Projektstand und Lehren: Claude-Projekt-Doc `claude/Momentum_Hero_Film_Stand.md`.

## Grundregeln
- **Erst Story besprechen, dann skripten.** Treatment als Tabelle (Zeit · Bild · Text) vorlegen und Timos Freigabe abwarten. Vor jeder Szene kurz sagen, wie sie aussehen soll.
- **Haltung Momentum:** über Herz, Freude, Begeisterung; frei gewählt, nie Zwang oder Scham. Bestehendes Know-how würdigen („sowohl als auch“). Führerschein-Story der Webseite aufgreifen („Dein KI-Führerschein für die neue Arbeitswelt“).
- **Hook in den ersten 3–5 Sekunden** (Text + Stimme), z. B. „Was wäre, wenn jeder in deinem Team zehn Helfer mehr hätte – ohne einen einzustellen?“
- **Förder-Claim nur „bis zu 100 % gefördert“** (QCG, Unternehmen unter 50 Mitarbeitenden), nie als Zusage.
- **Im Bild spricht niemand.** Agenten nur digital auf Bildschirmen (so wie heute real), keine Roboter, keine Zukunftsbüros, keine Skelett-Figuren.
- **Seedance erzeugt nie Text, Logos oder Stimme.** Logos (Claude, Codex/OpenAI, n8n, Hermes Agent, Momentum), Texte, Musik und Stimme kommen im Schnitt dazu.
- KI-Kennzeichnung: auf der Webseite „Film und Stimme mit KI erstellt“, in Anzeigen Pflicht.

## Team und Rollen (Referenzbilder in `D:\Hermes\Team` und bei Higgsfield)
Timo = Gesicht (Strategie & KI-Architektur) · Lillien = wichtig (Team Momentum) · Karsten = Vertrieb · Kurt = IT, Entwicklung & Datenschutz · Murat = eher im Hintergrund. Maskottchen = schwarzer Kugel-Bot mit violetten Schmetterlingsflügeln und Unendlichkeits-Augen. Hermetik-Marketing-Symbol = türkiser Phönix.

## Technik (wichtig: der Arbeits-Container erreicht fast nichts direkt)
- **kie.ai, Higgsfield-CDN, GitHub Pages, ElevenLabs, HeyGen** nur über die Composio-Workbench (`COMPOSIO_REMOTE_WORKBENCH`). Dateien von dort mit `upload_local_file` → S3-Link → im Container mit `curl -L` holen.
- **kie.ai-Schlüssel** nie in Dateien, Gedächtnis oder n8n speichern; Timo gibt ihn pro Sitzung (oder Umgebungsvariable `KIE_API_KEY`).
- **Bilder für kie online stellen:** Higgsfield `media_upload` → PUT aus der Workbench → `media_confirm` → cloudfront-URL. Bilder, die nur im Container liegen, in der Workbench neu erzeugen (Pillow + Inter-Schrift aus github.com/rsms/inter), nicht als base64 übertragen.
- Referenzbilder der Team-Fotos liegen bereits bei Higgsfield (Zuordnung per 8×8-Fingerabdruck gegen die lokalen Fotos).

## Seedance 2.5 über kie.ai
- Endpunkt `POST https://api.kie.ai/api/v1/jobs/createTask`, Modell `bytedance/seedance-2-5`, Status `GET /api/v1/jobs/recordInfo?taskId=…`.
- Preis 720p: 63 Credits/s (30 s = 1.890). kie reserviert vorab mehr als abgerechnet → 402 trotz Restguthaben = aufladen.
- Bis 30 s pro Clip, bis 30 Referenzbilder (`reference_image_urls`), `generate_audio: true` für Sounddesign, `return_last_frame: true` für Anschlüsse.
- **Startbild (`first_frame_url`) und Referenzbilder schließen sich aus**; Startbild-Modus nur mit `aspect_ratio: "adaptive"`. Anschluss an vorherige Szene: letztes Frame als Referenzbild 1 + „The video must start exactly on image 1“.
- Prompts englisch, mit Pflichtzeile: `NO readable text, NO letters, NO logos, NO subtitles, NO speech, NO music. Audio: sound design only …` und „Nobody speaks, mouths closed“.
- Gesichter: „keep his face EXACTLY like image N“; Timo am besten allein im Clip (sonst verfälscht).
- **Fahrzeuge:** Erst Standbild festlegen (nano-banana-pro, ~18 Credits), dann zusätzlich ein Standbild **von hinten** erzeugen und als Referenz 1 nehmen, Verfolgerkamera von hinten vorgeben. Sonst fliegt das Auto rückwärts.
- **Jede Szene prüfen** (Kontaktbogen mit ffmpeg `fps=2,tile`): Markennamen auf Autos (z. B. „PORSCHE“), Kauderwelsch auf Karten, falsche Bewegungsrichtung → schneiden, weichzeichnen (crop+boxblur+overlay) oder rückwärts abspielen.
- Für Szenen mit eigener Grafik (z. B. Führerschein-Karte): Grafik als Startbild → Seedance animiert die Hand, die zugreift; dann sieht die Karte überall gleich aus.

## Ton
- Musik: Suno über kie (`POST /api/v1/generate`, `customMode: true, instrumental: true, model: "V5"`), zwei Stücke: Spannung (Teil 1) und treibender Beat (Bruch beim Wechsel). Musik aus, wenn die Hauptfigur den Laptop zuklappt.
- Herzschlag: aus dem Seedance-Ton von Teil 1 ausschneiden (`-ss` vor `-i`!). Schreibmaschine/Klick/„Zapp“ in Python/ffmpeg synthetisieren.
- Kinostimme: ElevenLabs „Jesco – Epic Trailer“ (`PrIzXjAjNWO7Dj0sG14D`, eleven_multilingual_v2, stability 0.5, similarity 0.8, style 0.3), pro Satz einzeln erzeugen, Stille trimmen, `atempo=1.12`, auf Szenen-Startzeiten legen. Aussprache: „N-Eight-N“, „Rag“; buchstabierte Abkürzungen meiden (zu lang). Alternative: Timos HeyGen-Stimme.
- Musik unter Stimme leiser (ca. 0.3–0.36).

## Schnitt (ffmpeg, 1920×1080, 24 fps)
- Clips mit `settb=1/24` vor `xfade`; Ton per `adelay` auf die Zeitleiste und `amix normalize=0`, `apad`, `alimiter`.
- Grafiken als PNG (Pillow, Schrift Inter): Titel unten, Werkzeug-Karten oben links (Logo + Name + Aufgabe), Team-Karten mit runden Fotos, Logo neben dem Zeigefinger, Führerschein-Karte, Schreibmaschinen-Ende (Momentum-Logo wird heller, bleibt am Schluss allein).
- Logos: simple-icons (npm) für Claude, OpenAI, n8n; Hermes Agent aus github.com/NousResearch/hermes-agent (`apps/desktop/assets/icon.png`); Momentum-Logo farbig/weiß.

## Ausgabe und Webseite
- Exporte: Film mit Ton (Desktop 1080p, mobil 960px), stummer Loop (~20 s, 1280px + 640px), Posterbild.
- Ablage auf Timos Rechner: `D:\Hermes\Team\Film\` über `device_commit_files` (max. 30 MB pro Datei).
- Webseite (Lovable-Projekt „Momentum KI: Dein System“): Dateien in diesem Repo unter `docs/media/` per Pull Request (über `gh api`, nicht GraphQL) → GitHub Pages. Dann in Lovable nur `src/components/momentum/hero-media.ts` und Beschriftungen in `Hero.tsx` per exaktem Auftrag ändern (~1 Credit) und `deploy_project`.
- Reels für Instagram: 9:16 aus dem Material zuschneiden, Hook in Sekunde 1, Untertitel, CTA zur Webseite, KI-Hinweis.

## Festhalten
Projektstand, Kosten und neue Lehren in `claude/Momentum_Hero_Film_Stand.md` (Claude-Projekt „Kurse Momentum und Temp“) ergänzen.
