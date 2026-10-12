import sys; sys.path.insert(0, "../lib")
from base import build, icon, Beats, STUDIO

B = Beats("L2", STUDIO / "media/words.json")
t = B.t
T = dict(title=t("Das", 1), win=t("n8n.", 1), a0=t("verbindet"), la0=t("also"), a1=t("E-Mail,"), a2=t("Kalender,"),
         a3=t("Tabellen"), a4=t("CRM,"), act=t("automatisch"), cnt=t("Tag"), s3=t("Claude", 1), type1=t("Du", 1),
         type2=t("was", 1), build=t("baut"), built=t("n8n", 3), test=t("testet"), repair=t("repariert"), green=t("wenn"),
         merk=t("Merk"), roleA=t("n8n", 4), roleB=t("Claude", 3), cred=t("Nur", 2), btn=t("trägst"))

FORM = ('<svg viewBox="0 0 24 24" width="60" height="60" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="#E8590C" stroke-width="2"/>'
        '<rect x="7" y="7" width="10" height="2" rx="1" fill="#E8590C"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#E8590C"/><rect x="7" y="15" width="6" height="2" rx="1" fill="#E8590C"/></svg>')
LOCK = ('<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="#E8590C"/>'
        '<path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#E8590C" stroke-width="2.2"/></svg>')

def node(nid, inner, label, x, trigger=False):
    return (f'<div class="nodewrap" id="{nid}" style="left:{x}px"><div class="node{" trigger" if trigger else ""}" id="{nid}-box">{inner}'
            f'<div class="badge ok" id="{nid}-ok">✓</div><div class="badge err" id="{nid}-err">✕</div></div><div class="nlabel">{label}</div></div>')
def line(lid, x, w): return f'<div class="link" id="{lid}" style="left:{x}px;width:{w}px"></div>'

AX = [90, 350, 610, 870, 1130]; BX = [250, 640, 1030]
set_a = [node("a0", FORM, "Neue Anfrage", AX[0], True), node("a1", icon("gmail", 58), "E-Mail", AX[1]), node("a2", icon("gcal", 58), "Kalender", AX[2]),
         node("a3", icon("sheets", 58), "Tabelle", AX[3]), node("a4", icon("hubspot", 58), "CRM", AX[4])]
lines_a = [line(f"la{i}", AX[i] + 132, AX[i + 1] - AX[i] - 140) for i in range(4)]
set_b = [node("b0", FORM, "Neue Anfrage", BX[0], True), node("b1", icon("hubspot", 58), "CRM anlegen", BX[1]), node("b2", icon("gmail", 58), "Bestätigung", BX[2])]
lines_b = [line(f"lb{i}", BX[i] + 132, BX[i + 1] - BX[i] - 140) for i in range(2)]

CSS = """
.title { position:absolute; left:0; right:0; top:380px; text-align:center; font-weight:700; font-size:110px; letter-spacing:-2px; }
.title small { display:block; font-weight:500; font-size:38px; color:var(--muted); letter-spacing:0; margin-top:10px; }
#win { position:absolute; left:240px; top:110px; width:1440px; height:700px; background:var(--card); border-radius:22px; box-shadow:0 30px 80px rgba(40,30,20,.12), 0 2px 6px rgba(40,30,20,.06); overflow:hidden; transform-origin:100% 0; }
.whead { position:absolute; left:0; right:0; top:0; height:72px; border-bottom:1px solid var(--line); display:flex; align-items:center; padding:0 28px; gap:16px; }
.whead .brand { font-weight:700; font-size:28px; display:flex; align-items:center; gap:10px; }
.crumb { position:relative; font-size:24px; color:var(--muted); width:520px; height:32px; }
.crumb span { position:absolute; left:0; top:0; white-space:nowrap; }
.toggle { margin-left:auto; display:flex; align-items:center; gap:12px; font-size:22px; color:var(--muted); }
.sw { width:56px; height:30px; border-radius:15px; background:#CFCAC1; position:relative; }
.sw i { position:absolute; left:3px; top:3px; width:24px; height:24px; border-radius:50%; background:#fff; }
#swon { position:absolute; inset:0; border-radius:15px; background:var(--ok); }
#knob { z-index:2; }
.canvas { position:absolute; left:0; right:0; top:73px; bottom:0; background-image:radial-gradient(#D9D4CA 1.6px, transparent 1.6px); background-size:28px 28px; }
.layer { position:absolute; inset:0; }
.nodewrap { position:absolute; top:200px; width:132px; display:flex; flex-direction:column; align-items:center; }
.node { position:relative; width:132px; height:132px; background:#fff; border:2.5px solid #CFC9BF; border-radius:22px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(40,30,20,.08); }
.node.trigger { border-radius:66px 22px 22px 66px; }
.nlabel { margin-top:16px; font-size:24px; font-weight:500; white-space:nowrap; }
.badge { position:absolute; right:-14px; top:-14px; width:40px; height:40px; border-radius:50%; color:#fff; font-size:24px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.badge.ok { background:var(--ok); } .badge.err { background:var(--err); }
.link { position:absolute; top:265px; height:4px; background:#BDB6AA; border-radius:2px; transform-origin:0 50%; }
.dot { position:absolute; top:255px; left:0; width:24px; height:24px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 8px rgba(232,89,12,.18); }
#execs { position:absolute; right:28px; bottom:28px; background:#F7F5F1; border:1px solid var(--line); border-radius:16px; padding:16px 22px; font-size:22px; color:var(--muted); text-align:right; }
#execs b { display:block; font-size:44px; color:var(--ink); font-weight:700; }
#errtip { position:absolute; left:960px; top:420px; background:#FDECEA; color:var(--err); border:1.5px solid #F5C2BD; border-radius:12px; padding:12px 18px; font-size:24px; font-weight:500; white-space:nowrap; }
#term { position:absolute; left:80px; top:150px; width:860px; height:600px; background:#1F1E1C; border-radius:20px; box-shadow:0 30px 80px rgba(20,15,10,.25); overflow:hidden; font-family:"JetBrains Mono", monospace; }
.thead { height:64px; display:flex; align-items:center; gap:14px; padding:0 24px; border-bottom:1px solid #34322E; color:#EDE9E3; font-size:22px; }
.thead .dots i { display:inline-block; width:14px; height:14px; border-radius:50%; background:#4A4741; margin-right:8px; }
.thead .path { margin-left:auto; color:#8E887E; }
.tbody { padding:26px 30px; color:#EDE9E3; font-size:25px; line-height:1.55; }
.tl { white-space:nowrap; }
.tl .p { color:var(--accent); font-weight:600; }
.tl.g { color:#7FD49B; } .tl.r { color:#FF8A80; } .tl.m { color:#A9A398; }
.typed { display:inline-block; white-space:nowrap; }
.role { position:absolute; top:190px; width:640px; height:420px; background:var(--card); border-radius:26px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; box-shadow:0 30px 80px rgba(40,30,20,.12); }
.role .nm { font-size:34px; font-weight:500; color:var(--muted); }
.role .rl { white-space:nowrap; font-size:76px; font-weight:700; letter-spacing:-1px; }
.role .rl em { font-style:normal; color:var(--accent); }
.role .sub { font-size:26px; color:var(--muted); }
#roleA { left:300px; } #roleB { left:980px; }
#cred { position:absolute; left:610px; top:470px; width:700px; height:360px; background:var(--card); border-radius:22px; padding:30px 36px; box-sizing:border-box; box-shadow:0 30px 80px rgba(40,30,20,.14); }
#cred .ch { display:flex; align-items:center; gap:16px; font-size:30px; font-weight:700; }
.field { margin-top:22px; height:56px; border:1.5px solid var(--line); border-radius:12px; display:flex; align-items:center; padding:0 18px; font-size:24px; color:var(--muted); }
.field b { margin-left:auto; color:var(--ink); letter-spacing:4px; }
#btn, #btnok { position:absolute; right:36px; bottom:28px; color:#fff; font-size:24px; font-weight:700; padding:14px 26px; border-radius:12px; }
#btn { background:var(--accent); } #btnok { background:var(--ok); }
#credtag { position:absolute; left:36px; bottom:40px; font-size:24px; font-weight:700; color:var(--accent); }
"""

HTML = f"""
<div class="title" id="title">Zwei Werkzeuge<small>für deine Automationen</small></div>
<div id="win">
  <div class="whead"><div class="brand">{icon("n8n", 40)} n8n</div>
    <div class="crumb"><span id="crA">Workflows / Neue Anfrage verarbeiten</span><span id="crB">Workflows / Neuer Workflow</span></div>
    <div class="toggle">Aktiv <div class="sw"><div id="swon"></div><i id="knob"></i></div></div></div>
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
<div id="cred"><div class="ch">{LOCK} Zugangsdaten · {icon("gmail", 34)} Gmail</div>
  <div class="field">E-Mail-Konto <b>••••••••</b></div><div class="field">Passwort <b>••••••••••</b></div>
  <div id="credtag">trägst du selbst ein</div><div id="btn">Speichern</div><div id="btnok">Gespeichert ✓</div></div>
"""

JS = """
gsap.set(["#win","#term",".role","#cred",".nodewrap",".badge","#execs","#crB","#errtip",".dot","#btnok","#swon",".tl"], { opacity: 0 });
gsap.set(".link", { scaleX: 0 }); gsap.set("#win", { y: 40 }); gsap.set("#title", { opacity: 0, y: 30 }); gsap.set(".nodewrap", { y: 18 });
gsap.set(["#ty1","#ty2"], { clipPath: "inset(0 100% 0 0)" });
tl.to("#title", { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, T.title)
  .to("#title", { opacity: 0, y: -20, duration: .35, ease: "power2.in" }, T.win - .4)
  .to("#win", { opacity: 1, y: 0, duration: .7, ease: "power3.out" }, T.win - .1);
const pop = (s, at) => tl.to(s, { opacity: 1, y: 0, duration: .45, ease: "back.out(1.7)" }, at);
const grow = (s, at) => tl.to(s, { scaleX: 1, duration: .35, ease: "power2.out" }, at);
pop("#a0", T.a0); grow("#la0", T.la0); pop("#a1", T.a1); grow("#la1", T.a1 + .4); pop("#a2", T.a2); grow("#la2", T.a2 + .4);
pop("#a3", T.a3); grow("#la3", T.a3 + .5); pop("#a4", T.a4);
tl.to("#swon", { opacity: 1, duration: .3, ease: "sine.inOut" }, T.act - .1).to("#knob", { x: 26, duration: .3, ease: "power2.out" }, T.act - .1);
const AX = [90, 350, 610, 870, 1130];
tl.to("#dotA", { opacity: 1, x: AX[0] + 54, duration: .01 }, T.act);
AX.forEach((x, i) => { tl.to("#dotA", { x: x + 54, duration: .26, ease: "power1.inOut" }, T.act + i * .28);
  tl.to("#a" + i + "-ok", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.act + .15 + i * .28); });
tl.to("#dotA", { opacity: 0, duration: .2 }, T.act + 1.45);
tl.to("#execs", { opacity: 1, duration: .3, ease: "power2.out" }, T.cnt - .05);
const cnt = { v: 1 };
tl.to(cnt, { v: 248, duration: 1.0, ease: "power2.out", onUpdate: () => { document.getElementById("execn").textContent = Math.round(cnt.v); } }, T.cnt);
tl.to("#win", { scale: .62, x: 170, y: 40, duration: .7, ease: "power3.inOut" }, T.s3 - .1)
  .to(["#layerA", "#execs"], { opacity: 0, duration: .35, ease: "power2.in" }, T.s3)
  .to("#crA", { opacity: 0, duration: .2 }, T.s3 + .1).to("#crB", { opacity: 1, duration: .2 }, T.s3 + .3)
  .to("#swon", { opacity: 0, duration: .2 }, T.s3 + .1).to("#knob", { x: 0, duration: .2 }, T.s3 + .1)
  .to("#term", { opacity: 1, duration: .5, ease: "power3.out" }, T.s3 + .6)
  .fromTo("#term", { x: -40 }, { x: 0, duration: .6, ease: "expo.out" }, T.s3 + .6)
  .to("#t0", { opacity: 1, duration: .3 }, T.s3 + 1.0);
const d1 = Math.max(.6, T.type2 - T.type1 - .1);
tl.to("#t1", { opacity: 1, duration: .01 }, T.type1).to("#ty1", { clipPath: "inset(0 0% 0 0)", duration: d1, ease: "steps(33)" }, T.type1 + .05)
  .to("#t2", { opacity: 1, duration: .01 }, T.type1 + d1 + .1).to("#ty2", { clipPath: "inset(0 0% 0 0)", duration: d1, ease: "steps(35)" }, T.type1 + d1 + .15);
tl.to("#t3", { opacity: 1, duration: .25 }, T.build - .1).to("#t4", { opacity: 1, duration: .25 }, T.built);
pop("#b0", T.build + .15); grow("#lb0", T.build + .45); pop("#b1", T.build + .5); grow("#lb1", T.build + .8); pop("#b2", T.build + .85);
const BX = [250, 640, 1030];
tl.to("#t5", { opacity: 1, duration: .25 }, T.test).to("#dotB", { opacity: 1, x: BX[0] + 54, duration: .01 }, T.test + .05)
  .to("#dotB", { x: BX[1] + 54, duration: .3, ease: "power1.inOut" }, T.test + .1).to("#b0-ok", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.test + .15)
  .to("#dotB", { x: BX[2] + 54, duration: .3, ease: "power1.inOut" }, T.test + .42).to("#b1-ok", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.test + .47)
  .to("#dotB", { opacity: 0, duration: .15 }, T.test + .75).to("#b2-err", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.test + .75)
  .to("#b2-box", { borderColor: "#D93025", duration: .2 }, T.test + .75).to("#errtip", { opacity: 1, duration: .25, ease: "power2.out" }, T.test + .8)
  .to("#t6", { opacity: 1, duration: .25 }, T.test + .8);
tl.to("#t7", { opacity: 1, duration: .25 }, T.repair + .3).to(["#b2-err", "#errtip"], { opacity: 0, duration: .2 }, T.repair + .35)
  .to("#b2-box", { borderColor: "#1F9D55", duration: .3, ease: "sine.inOut" }, T.repair + .35).to("#b2-ok", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.repair + .4)
  .to("#t8", { opacity: 1, duration: .25 }, T.green).to("#swon", { opacity: 1, duration: .3 }, T.green + .1).to("#knob", { x: 26, duration: .3, ease: "power2.out" }, T.green + .1);
tl.to(["#win", "#term"], { opacity: 0, y: -30, duration: .45, ease: "power2.in" }, T.merk)
  .fromTo("#roleA", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, T.roleA)
  .fromTo("#roleB", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, T.roleB);
tl.to(".role", { y: -110, scale: .72, duration: .6, ease: "power3.inOut" }, T.cred - .1)
  .fromTo("#cred", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .55, ease: "expo.out" }, T.cred + .2)
  .to("#btn", { scale: .94, duration: .12, ease: "power1.inOut", yoyo: true, repeat: 1 }, T.btn + .2)
  .to("#btnok", { opacity: 1, duration: .2 }, T.btn + .45);
"""

build("L2", "../projects/m11_L2", HTML, CSS, JS, full_until=T["title"] - .1,
      highlights=["n8n", "Claude", "Code", "CRM", "automatisch", "KI", "arbeitet", "baut", "testet", "repariert", "Motor", "Baumeister", "Passwörter"],
      beats_js=T)
print({k: round(v, 2) for k, v in T.items()})
