# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["faster-whisper>=1.1", "pillow>=10"]
# ///
"""Momentum Video-Pipeline: Team-Videos finden, prüfen, bearbeiten, ablegen, protokollieren.

Aufruf (aus dem Repo-Hauptordner):
    uv run .claude/skills/momentum-video-pipeline/scripts/pipeline.py <befehl> ...

Befehle: finden, altbestand, pruefen, transkribieren, bearbeiten, story, hochladen, log-eintrag, schluessel-anlegen.
Originale werden nur gelesen. Ergebnisse überschreiben nie eine vorhandene Datei.
Personen, Ordner und der Ort der Schlüsseldatei stehen in einer Konfiguration außerhalb des Repos.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

VIDEO_ENDUNGEN = {".mp4", ".mov", ".m4v"}
SPERR_MARKEN = ("_nicht", "_privat")
MAX_UPLOAD = 200 * 1024 * 1024
LUFS_MIN, LUFS_MAX, LUFS_SOLL = -16.5, -13.5, -15.0
NAVY = (0x16, 0x12, 0x3A)


# ------------------------------------------------------------------ Grundlagen

def ausgeben(daten) -> None:
    print(json.dumps(daten, ensure_ascii=False, indent=2))


def abbruch(text: str) -> None:
    print("FEHLER: " + text, file=sys.stderr)
    sys.exit(2)


def lauf(befehl: list[str], eingabe: bytes | None = None, binaer: bool = False):
    """Startet ein Programm und gibt (stdout, stderr) zurück. Bricht bei Fehlern mit Klartext ab."""
    p = subprocess.run([str(b) for b in befehl], input=eingabe, capture_output=True)
    err = p.stderr.decode("utf-8", "replace")
    if p.returncode != 0:
        abbruch(f"{Path(str(befehl[0])).name} ist gescheitert:\n" + "\n".join(err.strip().splitlines()[-12:]))
    return (p.stdout if binaer else p.stdout.decode("utf-8", "replace")), err


def config_pfad() -> Path:
    """Konfiguration im Benutzerordner, bewusst nicht unter AppData.

    Die Claude-Desktop-App leitet Schreibzugriffe auf AppData in einen eigenen App-Ordner um. Eine dort
    von Claude angelegte Datei sieht ein normales Terminal nicht (und umgekehrt). Der Benutzerordner
    selbst wird nicht umgeleitet.
    """
    return Path.home() / ".momentum-video-pipeline" / "config.json"


def config_laden(pfad: str | None) -> dict:
    p = Path(pfad) if pfad else config_pfad()
    if not p.exists():
        abbruch(f"Konfiguration fehlt: {p}\nVorlage: config.beispiel.json im Skill-Ordner dorthin kopieren und ausfüllen.")
    cfg = json.loads(p.read_text(encoding="utf-8"))
    cfg.setdefault("handle", "@momentumkiakademie")
    cfg.setdefault("marke", "MOMENTUM KI AKADEMIE")
    cfg.setdefault("personen", [])
    return cfg


def person_holen(cfg: dict, name: str | None) -> list[dict]:
    personen = cfg["personen"]
    if name:
        personen = [p for p in personen if p["name"].lower() == name.lower()]
        if not personen:
            abbruch(f"Person „{name}“ steht nicht in der Konfiguration.")
    return personen


def arbeitsordner(name: str) -> Path:
    p = Path(tempfile.gettempdir()) / "momentum-video-pipeline" / re.sub(r"[^A-Za-z0-9_.-]+", "_", name)
    p.mkdir(parents=True, exist_ok=True)
    return p


def lokal_holen(quelle: Path, ordner: Path) -> Path:
    """Kopiert die Quelle in den lokalen Arbeitsordner (Netzlaufwerke sind langsam). Original bleibt unberührt."""
    ziel = ordner / ("quelle" + quelle.suffix.lower())
    if not ziel.exists() or ziel.stat().st_size != quelle.stat().st_size:
        shutil.copy2(quelle, ziel)
    return ziel


def freier_pfad(pfad: Path) -> Path:
    """Gibt einen Pfad zurück, der noch nicht existiert (hängt _v2, _v3 … an)."""
    if not pfad.exists():
        return pfad
    for n in range(2, 100):
        kandidat = pfad.with_name(f"{pfad.stem}_v{n}{pfad.suffix}")
        if not kandidat.exists():
            return kandidat
    abbruch(f"Kein freier Dateiname für {pfad}")


# ------------------------------------------------------------------------ Log

def log_laden(pfad: Path) -> dict:
    if not pfad.exists():
        return {"version": 1, "eintraege": []}
    return json.loads(pfad.read_text(encoding="utf-8"))


def log_speichern(pfad: Path, daten: dict) -> None:
    if pfad.exists():
        shutil.copy2(pfad, pfad.with_name(pfad.name + ".bak"))
    tmp = pfad.with_name(pfad.name + ".tmp")
    tmp.write_text(json.dumps(daten, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, pfad)


def log_eintragen(pfad: Path, eintrag: dict) -> dict:
    daten = log_laden(pfad)
    eintrag = {**eintrag, "datum": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
    for i, alt in enumerate(daten["eintraege"]):
        if alt.get("schluessel") == eintrag.get("schluessel"):
            daten["eintraege"][i] = {**alt, **eintrag}
            break
    else:
        daten["eintraege"].append(eintrag)
    log_speichern(pfad, daten)
    return eintrag


# --------------------------------------------------------------------- Finden

def schluessel(p: Path) -> str:
    st = p.stat()
    return f"{p.name}|{st.st_size}|{int(st.st_mtime)}"


def fingerabdruck(p: Path) -> str:
    """Größe plus Prüfsumme über das erste und letzte Megabyte: erkennt Kopien mit anderem Datum."""
    groesse = p.stat().st_size
    h = hashlib.sha1(str(groesse).encode())
    with p.open("rb") as f:
        h.update(f.read(1 << 20))
        if groesse > (2 << 20):
            f.seek(-(1 << 20), os.SEEK_END)
            h.update(f.read(1 << 20))
    return h.hexdigest()[:20]


def ist_kamera_name(name: str) -> bool:
    return re.match(r"^(IMG|MVI|VID|PXL|DSC|MOV|GX|GH)[_-]?\d+", name, re.I) is not None


def ist_eigenes_ergebnis(p: Path) -> bool:
    return re.search(r"_optimiert(_v\d+)?$", p.stem, re.I) is not None or p.name.lower().startswith("story-")


def kennung_aus_name(name: str, kuerzel: str) -> str:
    m = re.search(r"Reel\s*[_-]?(\d+)", name, re.I)
    return f"{kuerzel}{m.group(1)}" if (m and kuerzel) else ""


def finden(cfg: dict, name: str | None) -> list[dict]:
    berichte = []
    for person in person_holen(cfg, name):
        basis = Path(person["ordner"])
        if not basis.exists():
            berichte.append({"person": person["name"], "fehler": f"Ordner nicht erreichbar: {basis}"})
            continue
        log = log_laden(basis / person.get("log", "_pipeline-log.json"))
        bekannte_schluessel = {e.get("schluessel") for e in log["eintraege"]}
        bekannte_abdruecke = {e.get("fingerabdruck") for e in log["eintraege"] if e.get("fingerabdruck")}
        neu, gruppen, uebersprungen, bekannt = [], [], [], 0
        gesehen: set[str] = set()
        for art in ("fertig", "roh"):
            wurzel = basis / person[art]
            if not wurzel.exists():
                uebersprungen.append({"pfad": str(wurzel), "grund": "Ordner fehlt"})
                continue
            dateien = [p for p in sorted(wurzel.rglob("*")) if p.is_file() and p.suffix.lower() in VIDEO_ENDUNGEN]
            dateien = [p for p in dateien if not ist_eigenes_ergebnis(p)]
            je_ordner: dict[Path, list[Path]] = {}
            for p in dateien:
                je_ordner.setdefault(p.parent, []).append(p)
            for ordner, inhalt in je_ordner.items():
                relativ = str(ordner.relative_to(basis)).lower()
                takes = [p for p in inhalt if ist_kamera_name(p.name)]
                # Mehrere Kamera-Aufnahmen in einem Unterordner = Einzelaufnahmen, die erst geschnitten werden müssen.
                if art == "roh" and ordner != wurzel and len(takes) >= 2 and len(takes) * 2 >= len(inhalt):
                    k = f"ORDNER:{ordner.name}|{len(inhalt)}|{sum(p.stat().st_size for p in inhalt)}"
                    if any(m in relativ for m in SPERR_MARKEN):
                        uebersprungen.append({"pfad": str(ordner), "grund": "gesperrt (_nicht/_privat)"})
                    elif k in bekannte_schluessel:
                        bekannt += 1
                    else:
                        gruppen.append({"ordner": str(ordner), "anzahl": len(inhalt), "schluessel": k,
                                        "grund": "Einzelaufnahmen, braucht Schnitt"})
                    continue
                for p in inhalt:
                    if any(m in str(p.relative_to(basis)).lower() for m in SPERR_MARKEN):
                        uebersprungen.append({"pfad": str(p), "grund": "gesperrt (_nicht/_privat)"})
                        continue
                    k = schluessel(p)
                    if k in bekannte_schluessel:
                        bekannt += 1
                        continue
                    fp = fingerabdruck(p)
                    if fp in bekannte_abdruecke:
                        bekannt += 1
                        continue
                    if fp in gesehen:
                        uebersprungen.append({"pfad": str(p), "grund": "Kopie einer Datei aus diesem Lauf"})
                        continue
                    gesehen.add(fp)
                    neu.append({"pfad": str(p), "art": art, "schluessel": k, "fingerabdruck": fp,
                                "groesse": p.stat().st_size,
                                "kennung": kennung_aus_name(p.name, person.get("kuerzel", ""))})
        berichte.append({"person": person["name"], "neu": neu, "einzelaufnahmen": gruppen,
                         "uebersprungen": uebersprungen, "schon_im_log": bekannt})
    return berichte


def altbestand(cfg: dict, name: str | None, hinweis: str) -> list[dict]:
    """Trägt alles, was jetzt gefunden wird, als Altbestand ins Log ein (nichts wird bearbeitet)."""
    ergebnis = []
    for bericht in finden(cfg, name):
        if "fehler" in bericht:
            ergebnis.append(bericht)
            continue
        person = person_holen(cfg, bericht["person"])[0]
        log = Path(person["ordner"]) / person.get("log", "_pipeline-log.json")
        n = 0
        for d in bericht["neu"]:
            log_eintragen(log, {"schluessel": d["schluessel"], "fingerabdruck": d["fingerabdruck"], "datei": d["pfad"],
                                "kennung": d["kennung"], "status": "altbestand", "hinweis": hinweis})
            n += 1
        for g in bericht["einzelaufnahmen"]:
            log_eintragen(log, {"schluessel": g["schluessel"], "datei": g["ordner"], "status": "altbestand",
                                "hinweis": hinweis + " (Ordner mit Einzelaufnahmen)"})
            n += 1
        ergebnis.append({"person": bericht["person"], "eingetragen": n, "log": str(log)})
    return ergebnis


# --------------------------------------------------------------------- Prüfen

def hat_faststart(pfad: Path) -> bool | None:
    """True, wenn der Index (moov) vor den Bilddaten (mdat) steht."""
    try:
        with pfad.open("rb") as f:
            ende = pfad.stat().st_size
            pos = 0
            while pos + 8 <= ende:
                f.seek(pos)
                kopf = f.read(16)
                groesse, typ = int.from_bytes(kopf[:4], "big"), kopf[4:8]
                if groesse == 1:
                    groesse = int.from_bytes(kopf[8:16], "big")
                if typ == b"moov":
                    return True
                if typ == b"mdat":
                    return False
                if groesse < 8:
                    break
                pos += groesse
    except OSError:
        pass
    return None


def _bild_bei(pfad: Path, t: float, b: int = 54, h: int = 96) -> bytes:
    roh, _ = lauf(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", pfad, "-frames:v", "1",
                   "-vf", f"scale={b}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], binaer=True)
    return roh


def pruefen(pfad: Path, bogen: Path | None = None) -> dict:
    roh, _ = lauf(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", pfad])
    daten = json.loads(roh)
    v = next((s for s in daten["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in daten["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        abbruch(f"Keine Bildspur in {pfad}")
    dauer = float(daten["format"]["duration"])
    breite, hoehe = int(v["width"]), int(v["height"])
    drehung = 0
    for sd in v.get("side_data_list", []):
        if "rotation" in sd:
            drehung = int(sd["rotation"])
    if abs(drehung) in (90, 270):
        breite, hoehe = hoehe, breite
    z, n = (v.get("avg_frame_rate") or "0/1").split("/")
    fps = round(float(z) / float(n), 3) if float(n) else 0.0
    hdr = v.get("color_transfer") in ("arib-std-b67", "smpte2084")

    info = {
        "datei": str(pfad), "dauer": round(dauer, 3), "breite": breite, "hoehe": hoehe,
        "video_codec": v.get("codec_name"), "pix_fmt": v.get("pix_fmt"), "fps": fps, "hdr": hdr,
        "audio_codec": a.get("codec_name") if a else None,
        "audio_hz": int(a["sample_rate"]) if a else None, "audio_kanaele": int(a["channels"]) if a else None,
        "faststart": hat_faststart(pfad), "groesse": pfad.stat().st_size,
    }

    # Lautheit und Stille
    info.update({"lufs": None, "stille_anfang": 0.0, "stille_ende": 0.0})
    if a:
        _, err = lauf(["ffmpeg", "-hide_banner", "-nostats", "-i", pfad, "-vn",
                       "-af", "silencedetect=noise=-35dB:d=0.25,ebur128", "-f", "null", "-"])
        m = re.findall(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", err)
        if m:
            info["lufs"] = float(m[-1])
        starts = [float(x) for x in re.findall(r"silence_start: (-?\d+(?:\.\d+)?)", err)]
        enden = [float(x) for x in re.findall(r"silence_end: (-?\d+(?:\.\d+)?)", err)]
        if starts and starts[0] <= 0.05 and enden:
            info["stille_anfang"] = round(enden[0], 3)
        if starts and (len(enden) < len(starts) or enden[-1] >= dauer - 0.08):
            info["stille_ende"] = round(dauer - max(0.0, starts[-1]), 3)

    # Vermutungen aus Einzelbildern (nur Hinweise, die Entscheidung trifft der Blick auf den Kontaktbogen)
    ende_bild = _bild_bei(pfad, dauer - 0.6)
    pixel = [ende_bild[i:i + 3] for i in range(0, len(ende_bild), 3)]
    nah = sum(1 for p in pixel if sum((p[k] - NAVY[k]) ** 2 for k in range(3)) < 40 ** 2)
    info["abschlusskarte_vermutet"] = bool(pixel) and nah / len(pixel) > 0.75
    start_bild = _bild_bei(pfad, min(1.0, dauer / 2))
    hell, gesamt = 0, 0
    for y in range(6, 21):          # Zeilen 6–20 von 96 = oberes Bildfünftel
        for x in range(5, 49):
            i = (y * 54 + x) * 3
            p = start_bild[i:i + 3]
            if len(p) == 3:
                gesamt += 1
                hell += 1 if min(p) > 228 else 0
    info["hookkarte_vermutet"] = gesamt > 0 and hell / gesamt > 0.2

    info["format_ok"] = {
        "9:16 und 1080x1920": breite == 1080 and hoehe == 1920,
        "H.264": info["video_codec"] == "h264" and info["pix_fmt"] == "yuv420p" and not hdr,
        "30 fps": abs(fps - 30) < 0.01,
        "AAC": info["audio_codec"] == "aac",
        "Lautheit -14 bis -16 LUFS": info["lufs"] is not None and LUFS_MIN <= info["lufs"] <= LUFS_MAX,
        "faststart": info["faststart"] is True,
    }

    if bogen:
        zeiten = [0.5, 1.5, dauer * 0.25, dauer * 0.5, dauer * 0.75, dauer - 2.5, dauer - 1.2, dauer - 0.3]
        zeiten = sorted({min(max(0.0, t), max(0.0, dauer - 0.05)) for t in zeiten})
        nummern = sorted({int(t * fps) for t in zeiten}) if fps else [0]
        auswahl = "+".join(f"eq(n\\,{n})" for n in nummern)
        tm = (TONEMAP + ",format=yuv420p,") if hdr else ""
        lauf(["ffmpeg", "-v", "error", "-y", "-i", pfad, "-vf",
              f"select='{auswahl}',{tm}scale=270:480,tile={len(nummern)}x1", "-frames:v", "1", "-update", "1", bogen])
        info["kontaktbogen"] = str(bogen)
    return info


# -------------------------------------------------------------- Transkribieren

def transkribieren(pfad: Path, modell: str) -> dict:
    from faster_whisper import WhisperModel

    ton = pfad.with_suffix(".whisper.wav")
    lauf(["ffmpeg", "-v", "error", "-y", "-i", pfad, "-vn", "-ac", "1", "-ar", "16000", ton])
    m = WhisperModel(modell, device="cpu", compute_type="int8")
    segmente, meta = m.transcribe(str(ton), language="de", word_timestamps=True, vad_filter=True,
                                  condition_on_previous_text=False)
    woerter = []
    for s in segmente:
        for w in s.words or []:
            text = w.word.strip()
            if text:
                woerter.append({"w": text, "start": round(w.start, 3), "ende": round(w.end, 3)})
    ton.unlink(missing_ok=True)
    return {"quelle": str(pfad), "modell": modell, "text": " ".join(w["w"] for w in woerter), "woerter": woerter}


def wortgruppen(woerter: list[dict]) -> list[list[dict]]:
    """Kurze Gruppen (höchstens 3 Wörter / ca. 18 Zeichen), neue Gruppe nach Satzende oder Pause."""
    gruppen: list[list[dict]] = []
    for w in woerter:
        anzeige = w["w"].strip().strip(".,;:!?„“\"")
        if not anzeige:
            continue
        eintrag = {**w, "anzeige": anzeige, "satzende": w["w"].rstrip().endswith((".", "!", "?"))}
        g = gruppen[-1] if gruppen else None
        if (g is None or len(g) >= 3 or g[-1]["satzende"] or w["start"] - g[-1]["ende"] > 0.6
                or sum(len(x["anzeige"]) for x in g) + len(anzeige) > 18):
            gruppen.append([eintrag])
        else:
            g.append(eintrag)
    return gruppen


def untertitel_bauen(woerter: list[dict], versatz: float, dauer: float, ordner: Path) -> Path | None:
    """Zeichnet jeden Untertitel-Zustand als Bild und schreibt die Abspielliste für ffmpeg."""
    import karten

    ordner.mkdir(parents=True, exist_ok=True)
    leer = ordner / "leer.png"
    karten.untertitel_streifen([], None).save(leer)
    abschnitte: list[tuple[float, float, str]] = []  # (start, ende, datei)
    gruppen = wortgruppen([w for w in woerter if w["ende"] - versatz > 0 and w["start"] - versatz < dauer])
    for gi, g in enumerate(gruppen):
        gruppen_ende = min(g[-1]["ende"] + 0.25, gruppen[gi + 1][0]["start"] if gi + 1 < len(gruppen) else dauer)
        for wi, w in enumerate(g):
            start = max(0.0, w["start"] - versatz)
            ende = (g[wi + 1]["start"] if wi + 1 < len(g) else gruppen_ende) - versatz
            ende = min(dauer, ende)
            if ende - start < 0.02:
                continue
            datei = ordner / f"u_{gi:03d}_{wi}.png"
            karten.untertitel_streifen([x["anzeige"] for x in g], wi).save(datei)
            abschnitte.append((start, ende, datei.name))
    if not abschnitte:
        return None
    zeilen, zeit = ["ffconcat version 1.0"], 0.0
    for start, ende, datei in abschnitte:
        start = max(start, zeit)
        if ende - start < 0.02:
            continue
        if start - zeit > 0.01:
            zeilen += [f"file '{leer.name}'", f"duration {start - zeit:.3f}"]
        zeilen += [f"file '{datei}'", f"duration {ende - start:.3f}"]
        zeit = ende
    zeilen += [f"file '{leer.name}'", f"duration {max(0.04, dauer - zeit):.3f}", f"file '{leer.name}'"]
    liste = ordner / "untertitel.ffconcat"
    liste.write_text("\n".join(zeilen) + "\n", encoding="utf-8")
    return liste


# ------------------------------------------------------------------ Bearbeiten

TONEMAP = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
           "zscale=t=bt709:m=bt709:r=tv")
VIDEO_AUS = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
             "-profile:v", "high", "-level", "4.1", "-colorspace", "bt709", "-color_primaries", "bt709",
             "-color_trc", "bt709"]
AUDIO_AUS = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]


def lautheit_filter(quelle: Path, start: float, laenge: float | None) -> str:
    """Erst messen, dann gleichmäßig lauter oder leiser stellen; ein Begrenzer fängt Spitzen ab.

    Bewusst kein dynamisches loudnorm: das blendet die erste halbe Sekunde leise ein, und
    ein Reel muss mit dem ersten Wort voll da sein.
    """
    schnitt = (["-ss", f"{start:.3f}"] if start > 0 else []) + (["-t", f"{laenge:.3f}"] if laenge else [])
    _, err = lauf(["ffmpeg", "-hide_banner", "-nostats", *schnitt, "-i", quelle, "-vn",
                   "-af", "ebur128", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", err)
    if not m or float(m[-1]) < -60:
        return "anull"
    hub = max(-20.0, min(30.0, LUFS_SOLL - float(m[-1])))
    return f"volume={hub:.2f}dB,alimiter=limit=0.84:attack=5:release=50:level=false"


def bearbeiten(args, cfg: dict) -> dict:
    import karten

    quelle = Path(args.datei)
    if not quelle.exists():
        abbruch(f"Datei nicht gefunden: {quelle}")
    name = args.name or quelle.stem
    arbeit = arbeitsordner(name)
    lokal = lokal_holen(quelle, arbeit)
    vorher = pruefen(lokal, arbeit / "bogen_vorher.jpg")

    hook = [z for z in (args.hook or "").split("|") if z.strip()]
    merksatz = [z for z in (args.abschluss or "").split("|") if z.strip()]
    woerter = json.loads(Path(args.worte).read_text(encoding="utf-8"))["woerter"] if args.worte else None

    hat_karte = vorher["abschlusskarte_vermutet"] and not merksatz
    # 0,08 s Vorlauf stehen lassen, damit der erste Laut nicht angeschnitten wird.
    start = max(0.0, vorher["stille_anfang"] - 0.08) if (not args.kein_schnitt and vorher["stille_anfang"] > 0.2) else 0.0
    ende_weg = 0.0
    if not args.kein_schnitt and not hat_karte and vorher["stille_ende"] > 0.4:
        ende_weg = vorher["stille_ende"] - 0.15
    laenge = vorher["dauer"] - start - ende_weg
    schnitt = start > 0 or ende_weg > 0

    ok = vorher["format_ok"]
    bild_ok = ok["9:16 und 1080x1920"] and ok["H.264"] and ok["30 fps"]
    ton_ok = ok["AAC"] and ok["Lautheit -14 bis -16 LUFS"]
    bild_arbeit = bool(hook or merksatz or woerter or schnitt or not bild_ok)

    ziel_ordner = Path(args.ziel_ordner) if args.ziel_ordner else quelle.parent
    ziel = freier_pfad(ziel_ordner / f"{name}_optimiert.mp4")
    roh_aus = arbeit / "ergebnis.mp4"
    geaendert, gelassen = [], []

    if not bild_arbeit and ton_ok:
        if ok["faststart"] and quelle.suffix.lower() == ".mp4":
            shutil.copy2(lokal, roh_aus)
            gelassen.append("Bild und Ton unverändert, Datei 1:1 kopiert")
        else:
            lauf(["ffmpeg", "-v", "error", "-y", "-i", lokal, "-c", "copy", "-movflags", "+faststart", roh_aus])
            geaendert.append("faststart gesetzt (ohne Neuberechnung von Bild und Ton)")
    elif not bild_arbeit:
        lauf(["ffmpeg", "-v", "error", "-y", "-i", lokal, "-c:v", "copy",
              "-af", lautheit_filter(lokal, 0, None) + ",aresample=48000", *AUDIO_AUS,
              "-movflags", "+faststart", roh_aus])
        geaendert.append(f"Lautheit angeglichen (vorher {vorher['lufs']} LUFS), Bild unverändert")
    else:
        eingaben = (["-ss", f"{start:.3f}"] if start > 0 else []) + (["-t", f"{laenge:.3f}"] if schnitt else []) \
            + ["-i", str(lokal)]
        n = 1
        kette = [TONEMAP] if vorher["hdr"] else []
        verhaeltnis = vorher["breite"] / vorher["hoehe"]
        if abs(verhaeltnis - 9 / 16) < 0.04:
            kette.append("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920")
            graph = [f"[0:v]{','.join(kette)},fps=30,setsar=1,format=yuv420p[v0]"]
        else:
            vor = (",".join(kette) + ",") if kette else ""
            graph = [f"[0:v]{vor}split[ga][gb]",
                     "[ga]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[gbg]",
                     "[gb]scale=1080:1920:force_original_aspect_ratio=decrease[gfg]",
                     "[gbg][gfg]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1,format=yuv420p[v0]"]
            geaendert.append("Querformat/abweichendes Format in 9:16 eingepasst (unscharfer Hintergrund)")
        bild = "v0"
        if not bild_ok:
            geaendert.append("Bild auf 1080×1920, H.264, 30 fps gebracht" + (" (HDR in Normalfarben umgerechnet)" if vorher["hdr"] else ""))
        if schnitt:
            geaendert.append(f"Stille gekürzt: {start:.2f} s am Anfang, {ende_weg:.2f} s am Ende")
        if woerter:
            liste = untertitel_bauen(woerter, start, laenge, arbeit / "untertitel")
            if liste:
                eingaben += ["-f", "concat", "-safe", "0", "-i", str(liste)]
                graph.append(f"[{bild}][{n}:v]overlay=0:{karten.UNTERTITEL_Y}:eof_action=pass[v1]")
                bild, n = "v1", n + 1
                geaendert.append("Wort-Untertitel im Momentum-Look eingesetzt")
        if hook:
            hook_bild = arbeit / "hook.png"
            karten.hook_karte(hook).save(hook_bild)
            eingaben += ["-loop", "1", "-framerate", "30", "-t", "2.3", "-i", str(hook_bild)]
            graph.append(f"[{n}:v]format=rgba,fade=t=out:st=2.0:d=0.3:alpha=1[hk]")
            graph.append(f"[{bild}][hk]overlay=0:0:eof_action=pass[v2]")
            bild, n = "v2", n + 1
            geaendert.append("Hook-Karte in Sekunde 0–2 eingesetzt: " + " / ".join(hook))
        if vorher["audio_codec"]:
            ton_quelle = "[0:a]"
        else:
            eingaben += ["-f", "lavfi", "-t", f"{laenge:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
            ton_quelle, n = f"[{n}:a]", n + 1
        lf = lautheit_filter(lokal, start, laenge if schnitt else None) + "," if vorher["audio_codec"] else ""
        graph.append(f"{ton_quelle}{lf}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                     f"afade=t=in:st=0:d=0.02[am]")
        if not ton_ok and vorher["audio_codec"]:
            geaendert.append(f"Lautheit angeglichen (vorher {vorher['lufs']} LUFS)")
        if merksatz:
            end_bild = arbeit / "abschluss.png"
            karten.abschluss_karte(merksatz, cfg["marke"], cfg["handle"]).save(end_bild)
            eingaben += ["-loop", "1", "-framerate", "30", "-t", "2", "-i", str(end_bild),
                         "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=48000:cl=stereo"]
            graph.append(f"[{n}:v]fps=30,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.3:color=0x16123A[ve]")
            graph.append(f"[{bild}][am][ve][{n + 1}:a]concat=n=2:v=1:a=1[vaus][aaus]")
            bild_aus, ton_aus = "[vaus]", "[aaus]"
            geaendert.append("Abschlusskarte (2 s) angehängt: " + " / ".join(merksatz))
        else:
            bild_aus, ton_aus = f"[{bild}]", "[am]"
        lauf(["ffmpeg", "-v", "error", "-y", *eingaben, "-filter_complex", ";".join(graph),
              "-map", bild_aus, "-map", ton_aus, *VIDEO_AUS, *AUDIO_AUS, "-movflags", "+faststart", str(roh_aus)])

    if not hook:
        gelassen.append("Hook-Karte: keine neue eingesetzt" + (" (vermutlich schon vorhanden)" if vorher["hookkarte_vermutet"] else ""))
    if not woerter:
        gelassen.append("Untertitel: keine neuen eingesetzt")
    if not merksatz:
        gelassen.append("Abschlusskarte: keine neue angehängt" + (" (schon vorhanden)" if vorher["abschlusskarte_vermutet"] else ""))
    if not schnitt:
        gelassen.append("Kein Schnitt an Anfang oder Ende")
    if bild_ok and not bild_arbeit:
        gelassen.append("Bildformat passte schon (1080×1920, H.264, 30 fps)")
    if ton_ok:
        gelassen.append(f"Lautheit passte schon ({vorher['lufs']} LUFS)")

    nachher = pruefen(roh_aus, arbeit / "bogen_nachher.jpg")
    if args.trocken_lokal:
        ergebnis = roh_aus
    else:
        ziel_ordner.mkdir(parents=True, exist_ok=True)
        shutil.copy2(roh_aus, ziel)
        ergebnis = ziel
    return {"quelle": str(quelle), "ergebnis": str(ergebnis), "geaendert": geaendert, "nicht_geaendert": gelassen,
            "vorher": vorher, "nachher": nachher, "arbeitsordner": str(arbeit)}


# ----------------------------------------------------------------------- Story

def story(args, cfg: dict) -> dict:
    import karten

    reel = Path(args.reel)
    name = args.name or re.sub(r"_optimiert(_v\d+)?$", "", reel.stem)
    arbeit = arbeitsordner("story-" + name)
    lokal = lokal_holen(reel, arbeit)
    info = pruefen(lokal)
    dauer = min(7.0, info["dauer"])
    hg, ring, maske = arbeit / "hintergrund.png", arbeit / "ring.png", arbeit / "maske.png"
    karten.story_hintergrund(args.hook, args.karte, cfg["marke"], cfg["handle"]).save(hg)
    karten.story_ring().save(ring)
    karten.kreis_maske().save(maske)
    kante, x, y = (int(v) for v in args.ausschnitt.split(":"))
    d = karten.STORY_KREIS_D
    ox, oy = (karten.W - d) // 2, karten.STORY_KREIS_CY - d // 2
    graph = [f"[1:v]crop={kante}:{kante}:{x}:{y},scale={d}:{d},fps=30,format=rgba[c]",
             f"[2:v]format=gray,scale={d}:{d}[m]", "[c][m]alphamerge[cm]",
             f"[0:v][cm]overlay={ox}:{oy}[b]", "[b][3:v]overlay=0:0,fps=30,format=yuv420p[v]"]
    ton = []
    if info["audio_codec"]:
        graph.append(f"[1:a]afade=t=out:st={dauer - 0.6:.2f}:d=0.6,aresample=48000,"
                     f"aformat=sample_fmts=fltp:channel_layouts=stereo[a]")
        ton = ["-map", "[a]", *AUDIO_AUS]
    roh_aus = arbeit / "story.mp4"
    bild = ["-loop", "1", "-framerate", "30", "-t", f"{dauer:.2f}"]
    lauf(["ffmpeg", "-v", "error", "-y", *bild, "-i", hg, "-t", f"{dauer:.2f}", "-i", lokal,
          *bild, "-i", maske, *bild, "-i", ring, "-filter_complex", ";".join(graph),
          "-map", "[v]", *ton, *VIDEO_AUS, "-t", f"{dauer:.2f}", "-movflags", "+faststart", roh_aus])
    if args.trocken_lokal:
        ergebnis = roh_aus
    else:
        ziel_ordner = Path(args.ziel_ordner) if args.ziel_ordner else reel.parent
        ergebnis = freier_pfad(ziel_ordner / f"story-{name}.mp4")
        shutil.copy2(roh_aus, ergebnis)
    vorschau = arbeit / "story_vorschau.jpg"
    lauf(["ffmpeg", "-v", "error", "-y", "-ss", "3", "-i", roh_aus, "-frames:v", "1", "-vf", "scale=540:960", vorschau])
    return {"ergebnis": str(ergebnis), "dauer": dauer, "vorschau": str(vorschau)}


# -------------------------------------------------------------------- Hochladen

def env_lesen(pfad: Path) -> dict:
    werte = {}
    for zeile in pfad.read_text(encoding="utf-8-sig").splitlines():
        zeile = zeile.strip()
        if zeile and not zeile.startswith("#") and "=" in zeile:
            k, w = zeile.split("=", 1)
            werte[k.strip()] = w.strip().strip('"').strip("'")
    return werte


def hochladen(args, cfg: dict) -> dict:
    datei = Path(args.datei)
    endung = datei.suffix.lower().lstrip(".")
    if endung not in ("mp4", "jpg"):
        abbruch("Nur .mp4 und .jpg werden abgelegt.")
    groesse = datei.stat().st_size
    if groesse > MAX_UPLOAD:
        abbruch(f"Datei ist größer als 200 MB ({groesse / 1e6:.0f} MB).")
    prefix = re.sub(r"[^a-z0-9-]+", "-", args.prefix.lower()).strip("-")[:60]
    if not prefix:
        abbruch("Prefix fehlt (Kleinbuchstaben, Ziffern, Bindestrich).")
    if args.trocken:
        return {"trocken": True, "wuerde_ablegen": f"social-medien/{prefix}-<zeitstempel>.{endung}", "groesse": groesse}
    geheim = Path(os.path.expandvars(cfg.get("geheim_datei", "")))
    if not geheim.is_file():
        abbruch(f"Schlüsseldatei fehlt: {geheim}")
    env = env_lesen(geheim)
    url, key = env.get("MOMENTUM_UPLOAD_URL"), env.get("MOMENTUM_UPLOAD_KEY")
    if not url or not key:
        abbruch("In der Schlüsseldatei fehlen MOMENTUM_UPLOAD_URL oder MOMENTUM_UPLOAD_KEY.")
    kopf = {env.get("MOMENTUM_UPLOAD_HEADER", "X-Upload-Key"): key, "Content-Type": "application/json"}
    anfrage = urllib.request.Request(url, data=json.dumps({"prefix": prefix, "endung": endung, "groesse": groesse}).encode(),
                                     headers=kopf, method="POST")
    try:
        with urllib.request.urlopen(anfrage, timeout=60) as r:
            antwort = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        abbruch(f"Upload-Adresse nicht erhalten (HTTP {e.code}). Ist der Workflow aktiv und der Schlüssel richtig?")
    if not antwort.get("ok") or not antwort.get("upload_url") or not antwort.get("public_url"):
        abbruch("Upload-Adresse nicht erhalten: " + str(antwort.get("fehler", "unbekannte Antwort")))
    typ = "video/mp4" if endung == "mp4" else "image/jpeg"
    with datei.open("rb") as f:
        hoch = urllib.request.Request(antwort["upload_url"], data=f, method="PUT",
                                      headers={"Content-Type": typ, "Content-Length": str(groesse)})
        try:
            with urllib.request.urlopen(hoch, timeout=1800) as r:
                r.read()
        except urllib.error.HTTPError as e:
            abbruch(f"Ablegen im Speicher gescheitert (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:300]}")
    # Gegenprobe: „success“ ist kein Beleg. Die öffentliche Adresse muss die Datei in voller Größe liefern.
    probe = urllib.request.Request(antwort["public_url"], method="HEAD")
    try:
        with urllib.request.urlopen(probe, timeout=60) as r:
            laenge = int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        abbruch(f"Datei ist unter der öffentlichen Adresse nicht abrufbar (HTTP {e.code}).")
    if laenge != groesse:
        abbruch(f"Größe stimmt nicht: lokal {groesse} Bytes, im Speicher {laenge} Bytes.")
    return {"ok": True, "url": antwort["public_url"], "pfad": antwort.get("pfad"), "groesse": groesse}


def schluessel_anlegen(cfg: dict) -> dict:
    """Legt die Schlüsseldatei an (falls sie fehlt) und kopiert den Schlüssel in die Zwischenablage.

    Der Schlüssel wird nie ausgegeben. So kann er in n8n eingefügt werden, ohne im Chat oder Terminal zu stehen.
    """
    import secrets

    pfad = os.path.expandvars(cfg.get("geheim_datei", ""))
    if not pfad:
        abbruch("In der Konfiguration fehlt „geheim_datei“.")
    geheim = Path(pfad)
    vorhanden = env_lesen(geheim).get("MOMENTUM_UPLOAD_KEY") if geheim.is_file() else None
    if vorhanden:
        key, neu = vorhanden, False
    else:
        url = cfg.get("upload_url")
        if not url:
            abbruch("In der Konfiguration fehlt „upload_url“ (Adresse des n8n-Webhooks).")
        geheim.parent.mkdir(parents=True, exist_ok=True)
        key, neu = secrets.token_hex(32), True
        zeilen = [f"MOMENTUM_UPLOAD_URL={url}", f"MOMENTUM_UPLOAD_KEY={key}", ""]
        geheim.write_text(os.linesep.join(zeilen), encoding="utf-8", newline="")
    subprocess.run(["clip"], input=key.encode("ascii"), check=True)
    return {"datei": str(geheim), "neu_angelegt": neu, "in_zwischenablage": True,
            "naechster_schritt": "In n8n beim Credential „SOCIAL Video-Upload“ ins Feld „Value“ einfügen (Strg+V)."}


# ------------------------------------------------------------------------ CLI

def main() -> None:
    for strom in (sys.stdout, sys.stderr):
        strom.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="Momentum Video-Pipeline")
    p.add_argument("--config", help="Pfad zur Konfiguration (Standard: ~/.momentum-video-pipeline/config.json)")
    sub = p.add_subparsers(dest="befehl", required=True)

    s = sub.add_parser("finden", help="Neue Videos suchen")
    s.add_argument("--person")

    s = sub.add_parser("altbestand", help="Alles jetzt Vorhandene als erledigt ins Log schreiben")
    s.add_argument("--person")
    s.add_argument("--hinweis", default="Vor dem Start der Pipeline vorhanden")

    s = sub.add_parser("pruefen", help="Technische Werte messen und Kontaktbogen schreiben")
    s.add_argument("datei")
    s.add_argument("--bogen")

    s = sub.add_parser("transkribieren", help="Wortgenaue Abschrift mit lokalem Whisper")
    s.add_argument("datei")
    s.add_argument("--aus", required=True)
    s.add_argument("--modell", default="small")

    s = sub.add_parser("bearbeiten", help="Video angleichen und nur das ergänzen, was angegeben ist")
    s.add_argument("datei")
    s.add_argument("--name", help="Grundname des Ergebnisses (Standard: Name der Quelle)")
    s.add_argument("--hook", help="Hook-Karte, Zeilen mit | trennen, höchstens 6–7 Wörter")
    s.add_argument("--worte", help="JSON aus „transkribieren“ für Wort-Untertitel")
    s.add_argument("--abschluss", help="Merksatz für die Abschlusskarte: Zeile 1|Zeile 2")
    s.add_argument("--kein-schnitt", action="store_true", help="Stille an Anfang und Ende nicht kürzen")
    s.add_argument("--ziel-ordner")
    s.add_argument("--trocken-lokal", action="store_true", help="Ergebnis nur im lokalen Arbeitsordner lassen")

    s = sub.add_parser("story", help="Story-Video (7 s) zu einem Reel bauen")
    s.add_argument("reel")
    s.add_argument("--hook", required=True, help="Zeilen mit | trennen")
    s.add_argument("--karte", required=True, help="Text der Karte, z. B. „<Person> zeigt …“")
    s.add_argument("--name")
    s.add_argument("--ausschnitt", default="860:110:440", help="Quadrat im Reel: Kante:x:y")
    s.add_argument("--ziel-ordner")
    s.add_argument("--trocken-lokal", action="store_true")

    s = sub.add_parser("hochladen", help="Datei öffentlich im Speicher ablegen")
    s.add_argument("datei")
    s.add_argument("--prefix", required=True)
    s.add_argument("--trocken", action="store_true", help="Nur prüfen, nichts ablegen")

    sub.add_parser("schluessel-anlegen", help="Upload-Schlüssel anlegen bzw. erneut in die Zwischenablage kopieren (wird nie angezeigt)")

    s = sub.add_parser("log-eintrag", help="Eintrag im Log der Person anlegen oder ergänzen")
    s.add_argument("--person", required=True)
    s.add_argument("--daten", required=True, help="JSON mit mindestens „schluessel“")

    args = p.parse_args()
    if args.befehl == "pruefen":
        return ausgeben(pruefen(Path(args.datei), Path(args.bogen) if args.bogen else None))
    if args.befehl == "transkribieren":
        ergebnis = transkribieren(Path(args.datei), args.modell)
        Path(args.aus).write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")
        return ausgeben({"aus": args.aus, "woerter": len(ergebnis["woerter"]), "text": ergebnis["text"]})
    cfg = config_laden(args.config)
    if args.befehl == "finden":
        return ausgeben(finden(cfg, args.person))
    if args.befehl == "altbestand":
        return ausgeben(altbestand(cfg, args.person, args.hinweis))
    if args.befehl == "bearbeiten":
        return ausgeben(bearbeiten(args, cfg))
    if args.befehl == "story":
        return ausgeben(story(args, cfg))
    if args.befehl == "schluessel-anlegen":
        return ausgeben(schluessel_anlegen(cfg))
    if args.befehl == "hochladen":
        return ausgeben(hochladen(args, cfg))
    if args.befehl == "log-eintrag":
        person = person_holen(cfg, args.person)[0]
        daten = json.loads(args.daten)
        if not daten.get("schluessel"):
            abbruch("„schluessel“ fehlt im Eintrag.")
        return ausgeben(log_eintragen(Path(person["ordner"]) / person.get("log", "_pipeline-log.json"), daten))


if __name__ == "__main__":
    main()
