#!/usr/bin/env python3
"""Generates index.html for Level 2 'Motor und Baumeister'."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
icons = json.loads((HERE / "icons.json").read_text())

WORDS = [
    ("Für", .10), ("unsere", .22), ("Automationen", .52), ("brauchen", 1.26), ("wir", 1.54), ("zwei", 1.70), ("Werkzeuge.", 1.92),
    ("Das", 2.70), ("Erste", 2.92), ("ist", 3.28), ("n8n.", 3.80),
    ("n8n", 4.68), ("verbindet", 5.32), ("deine", 5.76), ("Programme,", 6.06),
    ("also", 6.68), ("E-Mail,", 7.10), ("Kalender,", 7.74), ("Tabellen", 8.52),
    ("oder", 9.24), ("dein", 9.48), ("CRM", 9.70),
    ("und", 10.46), ("führt", 10.66), ("Abläufe", 11.06), ("automatisch", 11.76), ("aus,", 12.70),
    ("Tag", 13.34), ("und", 13.66), ("Nacht.", 13.84),
    ("Das", 14.40), ("Zweite", 14.58), ("ist", 14.98), ("Claude", 15.24), ("Code.", 15.56),
    ("Claude", 16.20), ("Code", 16.46), ("ist", 16.88), ("eine", 17.08), ("KI,", 17.32),
    ("die", 17.96), ("nicht", 18.10), ("nur", 18.34), ("redet,", 18.52),
    ("sondern", 19.18), ("selbst", 19.50), ("arbeitet.", 19.94),
    ("Du", 20.64), ("beschreibst", 20.74), ("ihm,", 21.28), ("was", 21.68), ("passieren", 21.88), ("soll,", 22.34),
    ("und", 22.78), ("er", 22.98), ("baut", 23.16), ("den", 23.38), ("Ablauf", 23.58), ("in", 24.06), ("n8n,", 24.32),
    ("testet", 25.20), ("ihn", 25.68), ("und", 25.98), ("repariert", 26.14), ("ihn,", 26.70),
    ("wenn", 27.14), ("etwas", 27.34), ("hakt.", 27.68),
    ("Merk", 28.20), ("dir", 28.42), ("ein", 28.54), ("Bild:", 28.70),
    ("n8n", 29.18), ("ist", 29.94), ("der", 30.08), ("Motor,", 30.22),
    ("Claude", 30.76), ("Code", 31.02), ("ist", 31.46), ("der", 31.60), ("Baumeister.", 31.74),
    ("Nur", 32.52), ("deine", 32.68), ("Passwörter,", 32.92),
    ("die", 33.54), ("trägst", 33.68), ("du", 33.98), ("selbst", 34.10), ("ein.", 34.44),
]
GROUP_STARTS = [.10, 1.26, 2.70, 4.68, 6.68, 9.24, 10.46, 13.34, 14.40, 16.20, 17.96, 19.18,
                20.64, 22.78, 25.20, 27.14, 28.20, 29.18, 30.76, 32.52, 33.54]
END = 35.6
DURATION = 36
HL = {"n8n", "Claude", "Code", "CRM", "automatisch", "KI", "arbeitet", "baut", "testet",
      "repariert", "Motor", "Baumeister", "Passwörter", "selbst"}

groups = []
for i, gs in enumerate(GROUP_STARTS):
    ge = (GROUP_STARTS[i + 1] - 0.04) if i + 1 < len(GROUP_STARTS) else END
    ws = [(w, t) for (w, t) in WORDS if gs - 0.001 <= t < ge]
    groups.append({"s": gs, "e": round(ge, 2), "w": ws})

def strip(w):
    return w.strip(".,:")

cap_html = []
for gi, g in enumerate(groups):
    spans = []
    for wi, (w, t) in enumerate(g["w"]):
        cls = "w hl" if strip(w) in HL else "w"
        spans.append(f'<span class="{cls}" id="w{gi}_{wi}">{w}</span>')
    cap_html.append(f'<div class="cap" id="cap{gi}">{" ".join(spans)}</div>')

def icon(key, size, color=None):
    c = color or "#" + icons[key]["hex"]
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true">'
            f'<path fill="{c}" d="{icons[key]["path"]}"/></svg>')

FORM_ICON = ('<svg viewBox="0 0 24 24" width="{s}" height="{s}" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" '
             'fill="none" stroke="#E8590C" stroke-width="2"/><rect x="7" y="7" width="10" height="2" rx="1" fill="#E8590C"/>'
             '<rect x="7" y="11" width="10" height="2" rx="1" fill="#E8590C"/><rect x="7" y="15" width="6" height="2" rx="1" fill="#E8590C"/></svg>')

def node(nid, inner, label, x, trigger=False):
    cls = "node trigger" if trigger else "node"
    return (f'<div class="nodewrap" id="{nid}" style="left:{x}px">'
            f'<div class="{cls}" id="{nid}-box">{inner}'
            f'<div class="badge ok" id="{nid}-ok">✓</div><div class="badge err" id="{nid}-err">✕</div></div>'
            f'<div class="nlabel">{label}</div></div>')

def line(lid, x, w):
    return f'<div class="link" id="{lid}" style="left:{x}px;width:{w}px"></div>'

# Set A: 5 nodes, chain
A_X = [90, 350, 610, 870, 1130]
set_a = [
    node("a0", FORM_ICON.format(s=60), "Neue Anfrage", A_X[0], trigger=True),
    node("a1", icon("gmail", 58), "E-Mail", A_X[1]),
    node("a2", icon("gcal", 58), "Kalender", A_X[2]),
    node("a3", icon("sheets", 58), "Tabelle", A_X[3]),
    node("a4", icon("hubspot", 58), "CRM", A_X[4]),
]
lines_a = [line(f"la{i}", A_X[i] + 132, A_X[i + 1] - A_X[i] - 140) for i in range(4)]
# Set B: 3 nodes
B_X = [250, 640, 1030]
set_b = [
    node("b0", FORM_ICON.format(s=60), "Neue Anfrage", B_X[0], trigger=True),
    node("b1", icon("hubspot", 58), "CRM anlegen", B_X[1]),
    node("b2", icon("gmail", 58), "Bestätigung", B_X[2]),
]
lines_b = [line(f"lb{i}", B_X[i] + 132, B_X[i + 1] - B_X[i] - 140) for i in range(2)]

LOCK = ('<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="#E8590C"/>'
        '<path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#E8590C" stroke-width="2.2"/></svg>')

html = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>Level 2 – Motor und Baumeister</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face {{ font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk-latin-500-normal.woff2") format("woff2"); font-weight: 500; }}
@font-face {{ font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk-latin-700-normal.woff2") format("woff2"); font-weight: 700; }}
@font-face {{ font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2"); font-weight: 400; }}
@font-face {{ font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono-latin-600-normal.woff2") format("woff2"); font-weight: 600; }}
:root {{ --bg:#F3F1EC; --card:#FFFFFF; --ink:#1C1B19; --muted:#6F6A62; --line:#DDD8CF; --accent:#E8590C; --ok:#1F9D55; --err:#D93025; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font-family:"Space Grotesk", sans-serif; }}
#root {{ position:relative; width:100%; height:100%; overflow:hidden; background:var(--bg); }}
.scene {{ position:absolute; inset:0; }}
.title {{ position:absolute; left:0; right:0; top:380px; text-align:center; font-weight:700; font-size:110px; letter-spacing:-2px; }}
.title small {{ display:block; font-weight:500; font-size:38px; color:var(--muted); letter-spacing:0; margin-top:10px; }}

/* n8n window */
#win {{ position:absolute; left:240px; top:110px; width:1440px; height:700px; background:var(--card); border-radius:22px;
        box-shadow:0 30px 80px rgba(40,30,20,.12), 0 2px 6px rgba(40,30,20,.06); overflow:hidden; transform-origin:100% 0; }}
.whead {{ position:absolute; left:0; right:0; top:0; height:72px; border-bottom:1px solid var(--line); display:flex; align-items:center; padding:0 28px; gap:16px; }}
.whead .brand {{ font-weight:700; font-size:28px; display:flex; align-items:center; gap:10px; }}
.crumb {{ position:relative; font-size:24px; color:var(--muted); width:520px; height:32px; }}
.crumb span {{ position:absolute; left:0; top:0; white-space:nowrap; }}
.toggle {{ margin-left:auto; display:flex; align-items:center; gap:12px; font-size:22px; color:var(--muted); }}
.sw {{ width:56px; height:30px; border-radius:15px; background:#CFCAC1; position:relative; }}
.sw i {{ position:absolute; left:3px; top:3px; width:24px; height:24px; border-radius:50%; background:#fff; }}
#swon {{ position:absolute; inset:0; border-radius:15px; background:var(--ok); opacity:0; }}
#knob {{ z-index:2; }}
.canvas {{ position:absolute; left:0; right:0; top:73px; bottom:0;
          background-image:radial-gradient(#D9D4CA 1.6px, transparent 1.6px); background-size:28px 28px; }}
.layer {{ position:absolute; inset:0; }}
.nodewrap {{ position:absolute; top:200px; width:132px; display:flex; flex-direction:column; align-items:center; }}
.node {{ position:relative; width:132px; height:132px; background:#fff; border:2.5px solid #CFC9BF; border-radius:22px;
        display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(40,30,20,.08); }}
.node.trigger {{ border-radius:66px 22px 22px 66px; }}
.nlabel {{ margin-top:16px; font-size:24px; font-weight:500; white-space:nowrap; }}
.badge {{ position:absolute; right:-14px; top:-14px; width:40px; height:40px; border-radius:50%; color:#fff; font-size:24px; font-weight:700;
         display:flex; align-items:center; justify-content:center; opacity:0; }}
.badge.ok {{ background:var(--ok); }} .badge.err {{ background:var(--err); }}
.link {{ position:absolute; top:265px; height:4px; background:#BDB6AA; border-radius:2px; transform-origin:0 50%; }}
.dot {{ position:absolute; top:255px; left:0; width:24px; height:24px; border-radius:50%; background:var(--accent);
       box-shadow:0 0 0 8px rgba(232,89,12,.18); opacity:0; }}
#execs {{ position:absolute; right:28px; bottom:28px; background:#F7F5F1; border:1px solid var(--line); border-radius:16px; padding:16px 22px;
         font-size:22px; color:var(--muted); text-align:right; opacity:0; }}
#execs b {{ display:block; font-size:44px; color:var(--ink); font-weight:700; }}
#errtip {{ position:absolute; left:960px; top:420px; background:#FDECEA; color:var(--err); border:1.5px solid #F5C2BD; border-radius:12px;
          padding:12px 18px; font-size:24px; font-weight:500; white-space:nowrap; opacity:0; }}

/* terminal */
#term {{ position:absolute; left:80px; top:150px; width:860px; height:600px; background:#1F1E1C; border-radius:20px;
         box-shadow:0 30px 80px rgba(20,15,10,.25); overflow:hidden; opacity:0; font-family:"JetBrains Mono", monospace; }}
.thead {{ height:64px; display:flex; align-items:center; gap:14px; padding:0 24px; border-bottom:1px solid #34322E; color:#EDE9E3; font-size:22px; }}
.thead .dots i {{ display:inline-block; width:14px; height:14px; border-radius:50%; background:#4A4741; margin-right:8px; }}
.thead .path {{ margin-left:auto; color:#8E887E; }}
.tbody {{ padding:26px 30px; color:#EDE9E3; font-size:25px; line-height:1.55; }}
.tl {{ white-space:nowrap; opacity:0; }}
.tl .p {{ color:var(--accent); font-weight:600; }}
.tl.g {{ color:#7FD49B; }} .tl.r {{ color:#FF8A80; }} .tl.m {{ color:#A9A398; }}
.typed {{ display:inline-block; white-space:nowrap; }}

/* roles */
.role {{ position:absolute; top:190px; width:640px; height:420px; background:var(--card); border-radius:26px; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:18px; box-shadow:0 30px 80px rgba(40,30,20,.12); opacity:0; }}
.role .nm {{ font-size:34px; font-weight:500; color:var(--muted); }}
.role .rl {{ white-space:nowrap; font-size:76px; font-weight:700; letter-spacing:-1px; }}
.role .rl em {{ font-style:normal; color:var(--accent); }}
.role .sub {{ font-size:26px; color:var(--muted); }}
#roleA {{ left:300px; }} #roleB {{ left:980px; }}

/* credentials dialog */
#cred {{ position:absolute; left:610px; top:470px; width:700px; height:360px; background:var(--card); border-radius:22px; padding:30px 36px; box-sizing:border-box;
        box-shadow:0 30px 80px rgba(40,30,20,.14); opacity:0; }}
#cred .ch {{ display:flex; align-items:center; gap:16px; font-size:30px; font-weight:700; }}
.field {{ margin-top:22px; height:56px; border:1.5px solid var(--line); border-radius:12px; display:flex; align-items:center; padding:0 18px; font-size:24px; color:var(--muted); }}
.field b {{ margin-left:auto; color:var(--ink); letter-spacing:4px; }}
#btn {{ position:absolute; right:36px; bottom:28px; background:var(--accent); color:#fff; font-size:24px; font-weight:700; padding:14px 26px; border-radius:12px; }}
#btnok {{ position:absolute; right:36px; bottom:28px; background:var(--ok); color:#fff; font-size:24px; font-weight:700; padding:14px 26px; border-radius:12px; opacity:0; }}
#credtag {{ position:absolute; left:36px; bottom:40px; font-size:24px; font-weight:700; color:var(--accent); }}

/* avatar circle placeholder (real HeyGen avatar goes here) */
#avatar {{ position:absolute; left:40px; bottom:40px; width:238px; height:238px; border-radius:50%; border:3px dashed var(--accent);
          background:rgba(28,27,25,.04); display:flex; align-items:center; justify-content:center; text-align:center; font-size:22px; color:var(--muted); box-sizing:border-box; }}

/* captions */
.cap {{ position:absolute; left:340px; right:340px; bottom:70px; text-align:center; font-weight:700; font-size:60px; letter-spacing:-.5px; opacity:0; white-space:nowrap; }}
.cap .w {{ display:inline-block; opacity:0; }}
.cap .hl {{ color:var(--accent); }}
</style>
</head>
<body>
<div id="root" data-composition-id="level2" data-start="0" data-width="1920" data-height="1080" data-duration="{DURATION}">
  <audio id="vo" src="assets/vo.mp3" data-start="0" data-duration="{DURATION}" data-track-index="9"></audio>
  <section class="scene clip" id="main" data-start="0" data-duration="{DURATION}" data-track-index="0">

    <div class="title" id="title">Zwei Werkzeuge<small>für deine Automationen</small></div>

    <div id="win">
      <div class="whead">
        <div class="brand">{icon("n8n", 40)} n8n</div>
        <div class="crumb"><span id="crA">Workflows / Neue Anfrage verarbeiten</span><span id="crB">Workflows / Neuer Workflow</span></div>
        <div class="toggle">Aktiv <div class="sw"><div id="swon"></div><i id="knob"></i></div></div>
      </div>
      <div class="canvas">
        <div class="layer" id="layerA">{''.join(lines_a)}{''.join(set_a)}<div class="dot" id="dotA"></div></div>
        <div class="layer" id="layerB">{''.join(lines_b)}{''.join(set_b)}<div class="dot" id="dotB"></div><div id="errtip">Empfänger fehlt</div></div>
        <div id="execs">Ausführungen heute<b id="execn">0</b></div>
      </div>
    </div>

    <div id="term">
      <div class="thead"><span class="dots"><i></i><i></i><i></i></span>{icon("claude", 30)} Claude Code<span class="path">~/automationen</span></div>
      <div class="tbody">
        <div class="tl m" id="t0">✻ Willkommen bei Claude Code</div>
        <div class="tl" id="t1"><span class="p">&gt; </span><span class="typed" id="ty1">Wenn eine neue Anfrage reinkommt:</span></div>
        <div class="tl" id="t2"><span class="p">&nbsp;&nbsp;</span><span class="typed" id="ty2">im CRM anlegen, Bestätigung senden.</span></div>
        <div class="tl m" id="t3">● Plane Workflow … 3 Schritte</div>
        <div class="tl g" id="t4">● n8n: Workflow erstellt ✓</div>
        <div class="tl m" id="t5">● n8n: Test läuft …</div>
        <div class="tl r" id="t6">✕ E-Mail: Empfänger fehlt</div>
        <div class="tl g" id="t7">● Repariert: Empfänger aus Formular ✓</div>
        <div class="tl g" id="t8">● Test erneut: alles grün ✓</div>
      </div>
    </div>

    <div class="role" id="roleA">{icon("n8n", 96)}<div class="nm">n8n</div><div class="rl">der <em>Motor</em></div><div class="sub">führt aus · rund um die Uhr</div></div>
    <div class="role" id="roleB">{icon("claude", 96)}<div class="nm">Claude Code</div><div class="rl">der <em>Baumeister</em></div><div class="sub">baut · testet · repariert</div></div>

    <div id="cred">
      <div class="ch">{LOCK} Zugangsdaten · {icon("gmail", 34)} Gmail</div>
      <div class="field">E-Mail-Konto <b>••••••••</b></div>
      <div class="field">Passwort <b>••••••••••</b></div>
      <div id="credtag">trägst du selbst ein</div>
      <div id="btn">Speichern</div><div id="btnok">Gespeichert ✓</div>
    </div>

    <div id="avatar">Avatar-Kreis</div>
    {''.join(cap_html)}
  </section>
</div>
<script>
const G = {json.dumps([{"s": g["s"], "e": g["e"], "n": len(g["w"]), "t": [t for _, t in g["w"]]} for g in groups])};
const tl = gsap.timeline({{ paused: true }});

// initial states
gsap.set(["#win", "#term", ".role", "#cred", ".cap", ".cap .w", ".nodewrap", ".badge", "#execs", "#crB", "#errtip", ".dot", "#btnok"], {{ opacity: 0 }});
gsap.set(".link", {{ scaleX: 0 }});
gsap.set("#win", {{ y: 40 }});
gsap.set("#title", {{ opacity: 0, y: 30 }});
gsap.set(".nodewrap", {{ y: 18 }});
gsap.set(".tl", {{ opacity: 0 }});
gsap.set(["#ty1", "#ty2"], {{ clipPath: "inset(0 100% 0 0)" }});

// S1 title
tl.to("#title", {{ opacity: 1, y: 0, duration: .6, ease: "power3.out" }}, .15)
  .to("#title", {{ opacity: 0, y: -20, duration: .4, ease: "power2.in" }}, 2.45);

// S2 n8n window + nodes appear on the words
tl.to("#win", {{ opacity: 1, y: 0, duration: .7, ease: "power3.out" }}, 3.7);
const pop = (sel, t) => tl.to(sel, {{ opacity: 1, y: 0, duration: .45, ease: "back.out(1.7)" }}, t);
const grow = (sel, t) => tl.to(sel, {{ scaleX: 1, duration: .35, ease: "power2.out" }}, t);
pop("#a0", 4.70); grow("#la0", 6.70);
pop("#a1", 7.10); grow("#la1", 7.55);
pop("#a2", 7.74); grow("#la2", 8.30);
pop("#a3", 8.52); grow("#la3", 9.45);
pop("#a4", 9.70);
// activate + execution run
tl.to("#swon", {{ opacity: 1, duration: .3, ease: "sine.inOut" }}, 11.6)
  .to("#knob", {{ x: 26, duration: .3, ease: "power2.out" }}, 11.6);
const AX = [90, 350, 610, 870, 1130];
tl.to("#dotA", {{ opacity: 1, x: AX[0] + 54, duration: .01 }}, 11.8);
AX.forEach((x, i) => {{
  tl.to("#dotA", {{ x: x + 54, duration: .26, ease: "power1.inOut" }}, 11.8 + i * .28);
  tl.to("#a" + i + "-ok", {{ opacity: 1, scale: 1, duration: .2, ease: "back.out(2)" }}, 11.95 + i * .28);
}});
tl.to("#dotA", {{ opacity: 0, duration: .2 }}, 13.25);
// day & night: counter
tl.to("#execs", {{ opacity: 1, duration: .3, ease: "power2.out" }}, 13.3);
const cnt = {{ v: 1 }};
tl.to(cnt, {{ v: 248, duration: 1.0, ease: "power2.out", onUpdate: () => {{ document.getElementById("execn").textContent = Math.round(cnt.v); }} }}, 13.34);

// S3 Claude Code: window shrinks right, terminal appears
tl.to("#win", {{ scale: .62, x: 170, y: 40, duration: .7, ease: "power3.inOut" }}, 14.45)
  .to(["#layerA", "#execs"], {{ opacity: 0, duration: .35, ease: "power2.in" }}, 14.6)
  .to("#crA", {{ opacity: 0, duration: .2 }}, 14.7).to("#crB", {{ opacity: 1, duration: .2 }}, 14.9)
  .to("#swon", {{ opacity: 0, duration: .2 }}, 14.7).to("#knob", {{ x: 0, duration: .2 }}, 14.7)
  .to("#term", {{ opacity: 1, duration: .5, ease: "power3.out" }}, 15.2)
  .fromTo("#term", {{ x: -40 }}, {{ x: 0, duration: .6, ease: "expo.out" }}, 15.2)
  .to("#t0", {{ opacity: 1, duration: .3 }}, 15.6);
// typing the prompt
tl.to("#t1", {{ opacity: 1, duration: .01 }}, 20.64)
  .to("#ty1", {{ clipPath: "inset(0 0% 0 0)", duration: 1.0, ease: "steps(33)" }}, 20.7)
  .to("#t2", {{ opacity: 1, duration: .01 }}, 21.75)
  .to("#ty2", {{ clipPath: "inset(0 0% 0 0)", duration: 1.0, ease: "steps(35)" }}, 21.8);
// build
tl.to("#t3", {{ opacity: 1, duration: .25 }}, 23.1)
  .to("#t4", {{ opacity: 1, duration: .25 }}, 24.3);
pop("#b0", 23.40); grow("#lb0", 23.75);
pop("#b1", 23.85); grow("#lb1", 24.20);
pop("#b2", 24.30);
// test
const BX = [250, 640, 1030];
tl.to("#t5", {{ opacity: 1, duration: .25 }}, 25.2)
  .to("#dotB", {{ opacity: 1, x: BX[0] + 54, duration: .01 }}, 25.25);
tl.to("#dotB", {{ x: BX[1] + 54, duration: .3, ease: "power1.inOut" }}, 25.3)
  .to("#b0-ok", {{ opacity: 1, duration: .2, ease: "back.out(2)" }}, 25.35)
  .to("#dotB", {{ x: BX[2] + 54, duration: .3, ease: "power1.inOut" }}, 25.62)
  .to("#b1-ok", {{ opacity: 1, duration: .2, ease: "back.out(2)" }}, 25.67)
  .to("#dotB", {{ opacity: 0, duration: .15 }}, 25.95)
  .to("#b2-err", {{ opacity: 1, duration: .2, ease: "back.out(2)" }}, 25.95)
  .to("#b2-box", {{ borderColor: "#D93025", duration: .2 }}, 25.95)
  .to("#errtip", {{ opacity: 1, duration: .25, ease: "power2.out" }}, 26.0)
  .to("#t6", {{ opacity: 1, duration: .25 }}, 26.0);
// repair
tl.to("#t7", {{ opacity: 1, duration: .25 }}, 26.65)
  .to(["#b2-err", "#errtip"], {{ opacity: 0, duration: .2 }}, 26.7)
  .to("#b2-box", {{ borderColor: "#1F9D55", duration: .3, ease: "sine.inOut" }}, 26.7)
  .to("#b2-ok", {{ opacity: 1, duration: .2, ease: "back.out(2)" }}, 26.75)
  .to("#t8", {{ opacity: 1, duration: .25 }}, 27.3)
  .to("#swon", {{ opacity: 1, duration: .3 }}, 27.4).to("#knob", {{ x: 26, duration: .3, ease: "power2.out" }}, 27.4);

// S4 roles
tl.to(["#win", "#term"], {{ opacity: 0, y: -30, duration: .45, ease: "power2.in" }}, 28.25)
  .fromTo("#roleA", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: .6, ease: "power3.out" }}, 29.18)
  .fromTo("#roleB", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: .6, ease: "power3.out" }}, 30.76);

// S5 credentials
tl.to(".role", {{ y: -110, scale: .72, duration: .6, ease: "power3.inOut" }}, 32.45)
  .fromTo("#cred", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: .55, ease: "expo.out" }}, 32.75)
  .to("#btn", {{ scale: .94, duration: .12, ease: "power1.inOut", yoyo: true, repeat: 1 }}, 33.95)
  .to("#btnok", {{ opacity: 1, duration: .2 }}, 34.2);

// captions: group shows, words appear on their timestamp
G.forEach((g, gi) => {{
  tl.to("#cap" + gi, {{ opacity: 1, duration: .01 }}, g.s - .02);
  g.t.forEach((t, wi) => tl.fromTo("#w" + gi + "_" + wi, {{ opacity: 0, y: 12 }}, {{ opacity: 1, y: 0, duration: .18, ease: "power2.out" }}, t));
  tl.to("#cap" + gi, {{ opacity: 0, duration: .01 }}, g.e);
}});

window.__timelines["level2"] = tl;
</script>
</body>
</html>
"""
(HERE / "index.html").write_text(html)
print("ok", len(groups), "caption groups")
