#!/usr/bin/env python3
"""Assemble the offline HTML: encode embed copies, inline media as data URIs."""
import base64, json, pathlib, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data

ST = pathlib.Path(__file__).resolve().parent.parent
OUT = ST / "course/dist"; EMB = ST / "course/embed"; OUT.mkdir(exist_ok=True); EMB.mkdir(exist_ok=True)
VIDEOS = {"TRAILER": ST / "media/trailer.mp4", "V1": ST / "renders/m11_L1.mp4", "V2": ST / "renders/m11_L2.mp4",
          "V3": ST / "renders/m11_L3.mp4", "V4": ST / "renders/m11_L4.mp4", "V5": ST / "renders/m11_L5.mp4",
          "V6": ST / "renders/m11_L6.mp4", "VEND": ST / "renders/m11_END.mp4"}
IMAGES = {"IMG_DESK": ST / "media/img_desk.jpg", "IMG_SORT": ST / "media/img_sort.jpg", "IMG_DONE": ST / "media/img_done.jpg"}

def enc(src, dst):
    if dst.exists() and dst.stat().st_mtime > src.stat().st_mtime:
        return
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", "scale=1280:-2,fps=30",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-ar", "44100",
                    "-movflags", "+faststart", str(dst)], check=True)

def uri(p, mime):
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()

media = {}
for k, src in VIDEOS.items():
    dst = EMB / f"{k}.mp4"; enc(src, dst); media[k] = uri(dst, "video/mp4")
    print(k, round(dst.stat().st_size / 1e6, 2), "MB")
for k, src in IMAGES.items():
    media[k] = uri(src, "image/jpeg")

fonts_dir = ST / "projects/level2/assets/fonts"
fonts = ""
for fam, f, w in [("Space Grotesk", "space-grotesk-latin-500-normal.woff2", 500), ("Space Grotesk", "space-grotesk-latin-700-normal.woff2", 700)]:
    fonts += f'@font-face {{ font-family:"{fam}"; font-weight:{w}; src:url({uri(fonts_dir / f, "font/woff2")}) format("woff2"); }}\n'

D = {"title": data.TITLE, "subtitle": data.SUBTITLE, "levels": data.LEVELS, "check": data.CHECK, "pass": data.PASS}
html = (ST / "course/template.html").read_text()
html = html.replace("{{FONTS}}", fonts).replace("{{DATA}}", json.dumps(D, ensure_ascii=False)).replace("{{MEDIA}}", json.dumps(media))
out = OUT / "Modul-1-1_Automationen-verstehen-und-planen.html"
out.write_text(html)
print("OUT", out, round(out.stat().st_size / 1e6, 1), "MB")
