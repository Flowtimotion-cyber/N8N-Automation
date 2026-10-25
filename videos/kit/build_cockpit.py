"""Lernvideo im Cockpit-Modus bauen (Vorlage, erstes Video: U4, 25.10.2026).

Ablauf je Video:
  0. Pausen höchstens 4 s, Mo-Sätze vorher erzeugen und messen (Pause = Mo-Dauer + 0,7 s, aufgerundet).
  1. HeyGen-Avatar mit <break>-Pausen erzeugen (1920x1080, Hintergrund egal) -> $KIT_HEYGEN/raw/KEY.mp4
  2. Wortzeiten (faster-whisper, Format [{"t","s","e"}]) -> $KIT_HEYGEN/words.json {"KEY": [...]}
  3. Mo-Sätze (ElevenLabs) -> $MO_DIR/jessica_KEY.mp3
  3b. python build_cockpit.py prep KEY words_roh.json  (streckt zu kurze Pausen, schreibt raw/KEY.mp4 neu; danach Wortzeiten neu)
  4. Avatar freistellen: hyperframes remove-background raw/KEY.mp4 -o KEY_matte.mov (im Terminal, dauert ~0,25 s je Bild)
  5. python build_cockpit.py compose KEY            -> Komposition in $KIT_OUT/KEY (transparent, Szenen rechts)
  6. hyperframes render $KIT_OUT/KEY -o KEY_kit.mov --format mov -f 25
  7. python build_cockpit.py final KEY KEY_matte.mov KEY_kit.mov out.mp4
     -> Cockpit-Schleife + Avatar (linker Sitz) + Mo (oben rechts, im Wechsel: fliegt für seinen Satz ein) + Overlay + Ton

Umgebung: KIT_HEYGEN (Ordner mit words.json und raw/, relativ zu videos/), KIT_HEYGEN_ABS (derselbe Ordner absolut), KIT_OUT (Ausgabeordner), MO_DIR (Mo-Sätze),
KIT_ASSETS (cockpit_auto_loop.mp4, mo_idle.mp4, mo_test.mp4, ambience.wav; Original in
Projekt-Manager/22_Momentum/Pilot_Flug/Cockpit_Auto/Assets)."""
import os, sys, json, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
os.environ.setdefault("KIT_COCKPIT", "1")
sys.path.insert(0, str(HERE))
from kit import compose, WORDS, norm
from plans_cockpit import P

MO_DIR = pathlib.Path(os.environ.get("MO_DIR", r"D:\Hermes\Projekt-Manager\22_Momentum\Mo_Audio\Saetze_jessica"))
ASSETS = pathlib.Path(os.environ.get("KIT_ASSETS", r"D:\Hermes\Projekt-Manager\22_Momentum\Pilot_Flug\Cockpit_Auto\Assets"))
OUT = pathlib.Path(os.environ.get("KIT_OUT", str(HERE / "out_cockpit")))

def dur(p): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).decode().strip())

def pauses(src, min_len=1.2, db=-30):
    """Echte Stillephasen in der HeyGen-Tonspur (ffmpeg silencedetect), als [(start, ende)]."""
    import re
    out = subprocess.run(["ffmpeg", "-i", str(src), "-af", f"silencedetect=n={db}dB:d={min_len}", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = re.findall(r"silence_start: ([0-9.]+)", out); en = re.findall(r"silence_end: ([0-9.]+)", out)
    return [(float(a), float(b)) for a, b in zip(st, en)]

def src_of(key):
    return pathlib.Path(os.environ["KIT_HEYGEN_ABS"]) / "raw" / f"{key}.mp4" if os.environ.get("KIT_HEYGEN_ABS") else (HERE.parent / os.environ.get("KIT_HEYGEN", "heygen2") / "raw" / f"{key}.mp4")

def anchor_end(words, phrase, start=0.0):
    toks = [norm(x) for x in phrase.split() if norm(x)]; n = [norm(w["t"]) for w in words]
    for i in range(len(n) - len(toks) + 1):
        if n[i:i + len(toks)] == toks and words[i]["s"] >= start: return words[i + len(toks) - 1]["e"]
    return None

def match_pauses(key, plan, ps, words=None):
    """Je Mo-Satz die Pause, die am nächsten hinter seinem Anker liegt; ohne Wortzeiten die k-te Pause."""
    out, used = [], set()
    for k, m in enumerate(plan["mo"]):
        e = anchor_end(words, m["after"], m.get("from", 0)) if words else None
        if e is None:
            cand = [i for i in range(len(ps)) if i not in used]
            if not cand: raise SystemExit(f"{key}: keine Pause mehr für {m['k']}")
            i = cand[0]
        else:
            i = min((i for i in range(len(ps)) if i not in used), key=lambda i: abs(ps[i][0] - e))
        used.add(i); out.append((m, ps[i]))
    return out

def mo_times(key, plan):
    """Mo spricht `lead` (Standard 0,3 s) nach Beginn seiner gemessenen Pause. Warnt, wenn die Pause zu kurz ist."""
    ps = pauses(src_of(key))
    out = []
    for m, (a, b) in match_pauses(key, plan, ps, WORDS.get(key)):
        d = round(dur(MO_DIR / f"jessica_{m['k']}.mp3"), 3); t = round(a + m.get("lead", .3), 3)
        if t + d > b - .15: print(f"  WARN {key} {m['k']}: Pause {a:.2f}-{b:.2f} ({b-a:.1f} s) zu kurz für {d:.1f} s Mo-Satz")
        out.append({"k": m["k"], "txt": m["t"], "t": t, "d": d, "pause": [round(a, 2), round(b, 2)]})
    return out

def do_prep(key, words_json=None):
    """Vor dem Freistellen: jede Mo-Pause, die kürzer ist als Mo-Satz + 0,8 s, wird verlängert.
    Füllstück = die Pause selbst vor und zurück (der Avatar hört weiter zu), Ton = Stille. Original bleibt als KEY_orig.mp4."""
    import json as _j
    src = src_of(key); orig = src.with_name(f"{key}_orig.mp4")
    if not orig.exists(): src.replace(orig)
    words = _j.load(open(words_json, encoding="utf-8")) if words_json else None
    ps = pauses(orig)
    cuts = []   # (pausenmitte, verlängerung)
    for m, (a, b) in match_pauses(key, P[key], ps, words):
        need = dur(MO_DIR / f"jessica_{m['k']}.mp3") + m.get("lead", .3) + .5
        if b - a < need: cuts.append((a, b, round(need - (b - a) + .2, 2)))
    if not cuts:
        import shutil; shutil.copy(orig, src); print(key, "prep: alle Pausen lang genug"); return
    vf, af, vl, al, pos, n = [], [], [], [], 0.0, 0
    for a, b, add in cuts:
        mid = (a + b) / 2; L = min(b - a, add) / 2 + .01
        vf.append(f"[0:v]trim={pos}:{mid},setpts=PTS-STARTPTS[v{n}]"); af.append(f"[0:a]atrim={pos}:{mid},asetpts=PTS-STARTPTS[a{n}]"); vl += [f"[v{n}]"]; al += [f"[a{n}]"]; n += 1
        reps = max(1, int(add / (2 * L)) + 1)
        vf.append(f"[0:v]trim={mid - L}:{mid},setpts=PTS-STARTPTS,split[f{n}a][f{n}b];[f{n}b]reverse[f{n}r];[f{n}a][f{n}r]concat=n=2:v=1:a=0,loop=loop={reps}:size={int(2*L*25)+2}:start=0,trim=0:{add},setpts=PTS-STARTPTS[v{n}]")
        af.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{add}[a{n}]"); vl += [f"[v{n}]"]; al += [f"[a{n}]"]; n += 1
        pos = mid
    vf.append(f"[0:v]trim={pos},setpts=PTS-STARTPTS[v{n}]"); af.append(f"[0:a]atrim={pos},asetpts=PTS-STARTPTS,aresample=48000[a{n}]"); vl += [f"[v{n}]"]; al += [f"[a{n}]"]; n += 1
    af = [x if "anullsrc" in x or "aresample" in x else x.replace("asetpts=PTS-STARTPTS[", "asetpts=PTS-STARTPTS,aresample=48000[") for x in af]
    fc = ";".join(vf + af) + ";" + "".join(f"{v}{a}" for v, a in zip(vl, al)) + f"concat=n={n}:v=1:a=1[v][a]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(orig), "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-r", "25",
                    "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-c:a", "aac", "-b:a", "160k", str(src)], check=True)
    print(key, "prep: verlängert", [(round(a, 1), add) for a, b, add in cuts], "->", round(dur(src), 2), "s")

def resolve(obj, mo):
    """("mo", i, offset) -> Sekunden, rekursiv in Szenen-Argumenten."""
    if isinstance(obj, tuple) and len(obj) == 3 and obj[0] == "mo": return mo[obj[1]]["t"] + obj[2]
    if isinstance(obj, dict): return {k: resolve(v, mo) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return type(obj)(resolve(v, mo) for v in obj)
    return obj

def do_compose(key):
    plan = P[key]; mo = mo_times(key, plan)
    for sc in plan["scenes"]:
        sc.at = resolve(sc.at, mo); sc.kw = resolve(sc.kw, mo)
    d, starts = compose(key, plan, str(OUT / key))
    (OUT / key / "mo_times.json").write_text(json.dumps(mo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(key, "dur", d, "scenes", [round(x, 1) for x in starts], "mo", [(m["k"], m["t"]) for m in mo])

def do_final(key, matte, kit_mov, out):
    mo = json.loads((OUT / key / "mo_times.json").read_text(encoding="utf-8"))
    src = src_of(key)
    TOTAL = min(dur(matte), dur(kit_mov))
    work = OUT / key
    # Ton: HeyGen (stille Pausen) + Mo-Sätze + leises Cockpit-Ambiente, -14 LUFS
    ain = ["-i", str(src)]; af = ["[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0]"]; chain = "[a0]"; idx = 1
    for m in mo:
        ain += ["-i", str(MO_DIR / f"jessica_{m['k']}.mp3")]
        af.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(m['t']*1000)}|{int(m['t']*1000)}[m{idx}]"); chain += f"[m{idx}]"; idx += 1
    ain += ["-stream_loop", "-1", "-i", str(ASSETS / "ambience.wav")]
    af.append(f"[{idx}:a]atrim=0:{TOTAL},volume=0.35[amb]")
    af.append(chain + f"[amb]amix=inputs={len(mo)+2}:normalize=0:dropout_transition=0,loudnorm=I=-14:TP=-1[aout]")
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + ain + ["-filter_complex", ";".join(af), "-map", "[aout]", "-t", f"{TOTAL:.3f}", "-ar", "48000", str(work / "audio.wav")], check=True)
    # Bild 1280x720: Cockpit-Schleife, Avatar links (860 breit, x=-100), Mo oben rechts (200 breit), Overlay
    talk = "+".join(f"between(t,{m['t']:.3f},{m['t']+m['d']:.3f})" for m in mo)
    MOX, MOY, MOW = 1050, 28, 200
    # Mo im Wechsel (Timos Vorgabe): fliegt 0,8 s vor seinem Satz von rechts ein, bleibt 3 s nach dem Satz, fliegt wieder raus.
    # Fenster, die sich überlappen, werden zusammengelegt.
    win = []
    for m in sorted(mo, key=lambda m: m["t"]):
        a, b = max(0.0, m["t"] - 0.8), min(TOTAL, m["t"] + m["d"] + 3.0)
        if win and a <= win[-1][1] + 0.3: win[-1][1] = max(win[-1][1], b)
        else: win.append([a, b])
    vis = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in win)
    x = str(MOX)
    for a, b in reversed(win):   # Einflug 0,6 s, Ausflug 0,6 s, dazwischen stehen
        x = (f"if(between(t,{a:.3f},{b:.3f}),"
             f"if(lt(t,{a:.3f}+0.6),1280-(1280-{MOX})*((t-{a:.3f})/0.6),"
             f"if(gt(t,{b:.3f}-0.6),{MOX}+(1280-{MOX})*((t-({b:.3f}-0.6))/0.6),{MOX})),{x})")
    y = f"{MOY}+8*sin(2*PI*t/2.6)"
    keyf = f"chromakey=0x00B140:0.14:0.1,despill=type=green,crop=620:660:330:30,scale={MOW}:-1,format=rgba"
    fc = (f"[0:v]scale=1280:720:flags=lanczos,trim=0:{TOTAL},setpts=PTS-STARTPTS[bg];"
          f"[1:v]scale=860:-1,format=rgba[av];[bg][av]overlay=x=-100:y=H-h+8:format=auto[v1];"
          f"[2:v]{keyf}[moi];[3:v]{keyf}[mot];"
          f"[v1][moi]overlay=x='{x}':y='{y}':enable='({vis})*not({talk})'[v2];"
          f"[v2][mot]overlay=x='{x}':y='{y}':enable='{talk}'[v3];"
          f"[4:v]format=rgba[kit];[v3][kit]overlay=0:0:format=auto[v]")
    (work / "final_fc.txt").write_text(fc, encoding="utf-8")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", str(ASSETS / "cockpit_auto_loop.mp4"), "-i", str(matte),
                    "-stream_loop", "-1", "-i", str(ASSETS / "mo_idle.mp4"), "-stream_loop", "-1", "-i", str(ASSETS / "mo_test.mp4"), "-i", str(kit_mov),
                    "-i", str(work / "audio.wav"), "-filter_complex_script", str(work / "final_fc.txt"), "-map", "[v]", "-map", "5:a",
                    "-t", f"{TOTAL:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)], check=True)
    print(key, "FERTIG", round(TOTAL, 1), "s ->", out)

if __name__ == "__main__":
    cmd, key = sys.argv[1], sys.argv[2]
    if cmd == "prep": do_prep(key, sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == "compose": do_compose(key)
    elif cmd == "final": do_final(key, pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]), pathlib.Path(sys.argv[5]))
    else: raise SystemExit("prep KEY [words.json] | compose KEY | final KEY matte.mov kit.mov out.mp4")
