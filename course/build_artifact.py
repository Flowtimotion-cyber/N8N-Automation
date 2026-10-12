#!/usr/bin/env python3
"""Artifact build: media as published files next to the page, fonts inline."""
import base64, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data
C = pathlib.Path(__file__).resolve().parent; ST = C.parent
media = {k: f"media/{k}.mp4" for k in ["TRAILER","V1","V2","V3","V4","V5","V6","VEND"]}
media.update({"IMG_DESK": "media/img_desk.jpg", "IMG_SORT": "media/img_sort.jpg", "IMG_DONE": "media/img_done.jpg"})
fd = ST / "projects/level2/assets/fonts"; fonts = ""
for f, w in [("space-grotesk-latin-500-normal.woff2", 500), ("space-grotesk-latin-700-normal.woff2", 700)]:
    fonts += f'@font-face {{ font-family:"Space Grotesk"; font-weight:{w}; src:url(data:font/woff2;base64,{base64.b64encode((fd/f).read_bytes()).decode()}) format("woff2"); }}\n'
D = {"title": data.TITLE, "subtitle": data.SUBTITLE, "levels": data.LEVELS, "check": data.CHECK, "pass": data.PASS}
h = (C/"template_artifact.html").read_text()
h = h.replace("{{FONTS}}", fonts).replace("{{DATA}}", json.dumps(D, ensure_ascii=False)).replace("{{MEDIA}}", json.dumps(media))
h = h.replace("{{EXTRA_CSS}}", (C/"artifact_extra.css").read_text()).replace("{{EXTRA_JS}}", (C/"artifact_extra.js").read_text())
out = C/"artifact/index.html"; out.write_text(h); print(out, round(len(h)/1e3), "KB")
