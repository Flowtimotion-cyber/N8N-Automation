"""Shared builder: avatar track (full -> circle), captions, light look."""
import json, pathlib, re, shutil, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from align import Beats, norm

STUDIO = pathlib.Path(__file__).resolve().parent.parent
ICONS = json.loads((STUDIO / "projects/level2/icons.json").read_text())

def icon(key, size, color=None):
    c = color or "#" + ICONS[key]["hex"]
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true">'
            f'<path fill="{c}" d="{ICONS[key]["path"]}"/></svg>')

BASE_CSS = """
@font-face { font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
@font-face { font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
@font-face { font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
:root { --bg:#F3F1EC; --card:#FFFFFF; --ink:#1C1B19; --muted:#6F6A62; --line:#DDD8CF; --accent:#E8590C; --ok:#1F9D55; --err:#D93025; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:"Space Grotesk", sans-serif; }
#root { position:relative; width:100%; height:100%; overflow:hidden; background:var(--bg); }
.scene { position:absolute; inset:0; }
.card { position:absolute; background:var(--card); border-radius:22px; box-shadow:0 30px 80px rgba(40,30,20,.12), 0 2px 6px rgba(40,30,20,.06); }
.mono { font-family:"JetBrains Mono", monospace; }
#avfull { position:absolute; left:0; top:0; width:1920px; height:1080px; object-fit:cover; z-index:20; }
#avcircle { position:absolute; left:40px; top:802px; width:238px; height:238px; border-radius:50%; overflow:hidden; z-index:20;
            box-shadow:0 14px 40px rgba(40,30,20,.28); }
#avc { position:absolute; left:-198px; top:-79px; width:635px; height:357px; object-fit:cover; }
#avring { position:absolute; inset:0; border-radius:50%; box-shadow:inset 0 0 0 5px #FFFFFF; }
.cap { position:absolute; left:340px; right:340px; bottom:70px; text-align:center; font-weight:700; font-size:60px; letter-spacing:-.5px; opacity:0; white-space:nowrap; z-index:30; }
.cap .w { display:inline-block; opacity:0; }
.cap .hl { color:var(--accent); }
.cap.onfull { color:#fff; text-shadow:0 3px 18px rgba(0,0,0,.55); }
.cap.onfull .hl { color:#FFB27A; }
"""

def caption_groups(words, maxw=4):
    groups, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= maxw or re.search(r"[.,:?!“]$", w[0]):
            groups.append(cur); cur = []
    if cur: groups.append(cur)
    merged = []
    for g in groups:
        if merged and len(g) == 1 and len(merged[-1]) < 5:
            merged[-1] = merged[-1] + g
        else:
            merged.append(g)
    groups = merged
    out = []
    for i, g in enumerate(groups):
        s = g[0][1]
        e = (groups[i + 1][0][1] - .04) if i + 1 < len(groups) else g[-1][2] + .6
        out.append({"s": round(s - .02, 2), "e": round(e, 2), "w": g})
    return out

def build(key, out_dir, scene_html="", scene_css="", scene_js="", full_until=None, highlights=(), full_whole=False, beats_js=None):
    out = pathlib.Path(out_dir); (out / "assets").mkdir(parents=True, exist_ok=True)
    src_assets = STUDIO / "projects/level2/assets"
    if not (out / "assets/fonts").exists():
        shutil.copytree(src_assets / "fonts", out / "assets/fonts")
    shutil.copy(src_assets / "gsap.min.js", out / "assets/gsap.min.js")
    shutil.copy(STUDIO / f"media/av_{key}.mp4", out / "assets/avatar.mp4")
    B = Beats(key, STUDIO / "media/words.json")
    dur = round(B.end() + 1.0, 2)
    groups = caption_groups(B.w)
    hl = {norm(h) for h in highlights}
    caps = []
    for gi, g in enumerate(groups):
        spans = " ".join(f'<span class="w{" hl" if norm(w) in hl else ""}" id="w{gi}_{wi}">{w}</span>' for wi, (w, s, e) in enumerate(g["w"]))
        onfull = full_whole or (full_until is not None and g["s"] < full_until)
        caps.append(f'<div class="cap{" onfull" if onfull else ""}" id="cap{gi}">{spans}</div>')
    G = [{"s": g["s"], "e": g["e"], "t": [s for _, s, _ in g["w"]]} for g in groups]
    fu = dur if full_whole else full_until
    fu = round(fu, 2)
    avatar_html = f'<video id="avfull" src="assets/avatar.mp4" playsinline data-has-audio="true" data-start="0" data-duration="{fu}" data-track-index="5"></video>'
    if fu < dur:
        avatar_html += (f'<div id="avcircle"><video id="avc" src="assets/avatar.mp4" playsinline data-has-audio="true" '
                        f'data-start="{fu}" data-media-start="{fu}" data-duration="{round(dur-fu,2)}" data-track-index="6"></video><div id="avring"></div></div>')
    html = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>{key}</title>
<script src="assets/gsap.min.js"></script>
<style>{BASE_CSS}{scene_css}</style>
</head>
<body>
<div id="root" data-composition-id="{key.lower()}" data-start="0" data-width="1920" data-height="1080" data-duration="{dur}">
  <section class="scene clip" id="main" data-start="0" data-duration="{dur}" data-track-index="0">
    {scene_html}
  </section>
  {avatar_html}
  {''.join(caps)}
</div>
<script>
const T = {json.dumps(beats_js or {})};
const G = {json.dumps(G)};
const FULL_UNTIL = {json.dumps(fu)};
const tl = gsap.timeline({{ paused: true }});
if (document.getElementById("avcircle")) {{ gsap.set("#avcircle", {{ opacity: 0 }}); tl.to("#avcircle", {{ opacity: 1, duration: .01 }}, FULL_UNTIL); }}
{scene_js}
G.forEach((g, gi) => {{
  tl.to("#cap" + gi, {{ opacity: 1, duration: .01 }}, Math.max(0, g.s));
  g.t.forEach((t, wi) => tl.fromTo("#w" + gi + "_" + wi, {{ opacity: 0, y: 12 }}, {{ opacity: 1, y: 0, duration: .18, ease: "power2.out" }}, t));
  tl.to("#cap" + gi, {{ opacity: 0, duration: .01 }}, g.e);
}});
window.__timelines["{key.lower()}"] = tl;
</script>
</body>
</html>
"""
    (out / "index.html").write_text(html)
    return B, dur
