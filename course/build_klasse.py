#!/usr/bin/env python3
"""Klassen-Version für GitHub Pages: docs/modul-1-1/index.html + media/."""
import base64, json, pathlib, shutil, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data
C = pathlib.Path(__file__).resolve().parent; ST = C.parent
OUT = pathlib.Path("/home/claude/n8n-automation/docs/modul-1-1"); (OUT / "media").mkdir(parents=True, exist_ok=True)
for f in (OUT / "media").iterdir(): f.unlink()
VID = C / "videos_v2"; VID.mkdir(exist_ok=True)
media = {}
for k in ["INTRO","V1","V2","V3","V4","V5","V6","V7","V8","VEND"]:
    src = VID / f"{k}.mp4"
    if src.exists(): shutil.copy2(src, OUT / "media" / src.name); media[k] = f"media/{k}.mp4"
    w = VID / f"{k}.webm"
    if w.exists(): shutil.copy2(w, OUT / "media" / w.name); media[k + "_webm"] = f"media/{k}.webm"
for f in ["img_desk.jpg","img_sort.jpg","img_done.jpg"]: shutil.copy2(C / "artifact/media" / f, OUT / "media" / f)
media.update({"IMG_DESK": "media/img_desk.jpg", "IMG_SORT": "media/img_sort.jpg", "IMG_DONE": "media/img_done.jpg"})
fd = ST / "projects/level2/assets/fonts"; fonts = ""
for f, w in [("space-grotesk-latin-500-normal.woff2", 500), ("space-grotesk-latin-700-normal.woff2", 700)]:
    fonts += f'@font-face {{ font-family:"Space Grotesk"; font-weight:{w}; src:url(data:font/woff2;base64,{base64.b64encode((fd/f).read_bytes()).decode()}) format("woff2"); }}\n'
D = {"title": data.TITLE, "subtitle": data.SUBTITLE, "intro": data.INTRO, "promise": data.PROMISE, "levels": data.LEVELS, "check": data.CHECK, "pass": data.PASS}
h = (C/"template_artifact.html").read_text()
h = h.replace('<meta charset="utf-8">\n', '')
h = h.replace("{{FONTS}}", fonts).replace("{{DATA}}", json.dumps(D, ensure_ascii=False)).replace("{{MEDIA}}", json.dumps(media))
h = h.replace("{{EXTRA_CSS}}", (C/"artifact_extra.css").read_text() + (C/"klasse_extra.css").read_text()).replace("{{EXTRA_JS}}", (C/"klasse_extra.js").read_text())
head = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n'
title_end = h.index("</style>") + len("</style>")
h = head + h[:title_end] + "\n</head>\n<body>\n" + h[title_end:] + "\n</body>\n</html>\n"
(OUT/"index.html").write_text(h); print(OUT/"index.html", round(len(h)/1e3), "KB")
