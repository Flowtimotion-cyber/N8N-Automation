import sys; sys.path.insert(0, "../lib")
from base import build, icon, Beats, STUDIO
from common import FORM, node, line, N8N_CSS

B = Beats("L3", STUDIO / "media/words.json"); t = B.t
T = dict(stell=t("Stell"), band=t("Fließband"), wf=t("Workflow"), trig=t("Trigger"), mail=t("E-Mail"), form=t("Formular"),
         mon=t("Montag"), stat=t("Stationen"), node=t("Node"), key=t("Schlüssel"), cred=t("Credentials"), exe=t("Execution"),
         look=t("anschauen"), fail=t("schiefgeht"), end=B.end())

CLOCK = ('<svg viewBox="0 0 24 24" width="60" height="60" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#E8590C" stroke-width="2"/>'
         '<path d="M12 7v5l3.5 2" fill="none" stroke="#E8590C" stroke-width="2" stroke-linecap="round"/></svg>')
KEY = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="8" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2.4"/>'
       '<path d="M12 12h9M18 12v3M21 12v2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>')
X = [70, 340, 610, 880]

trig = (f'<div class="nodewrap" id="n0" style="left:{X[0]}px"><div class="node trigger" id="n0-box">'
        f'<div class="ic" id="ic-mail">{icon("gmail", 58)}</div><div class="ic" id="ic-form">{FORM}</div><div class="ic" id="ic-clock">{CLOCK}</div>'
        f'<div class="badge ok" id="n0-ok">✓</div></div><div class="nlabel">Auslöser</div></div>')
nodes = [trig,
         node("n1", icon("hubspot", 58), "CRM anlegen", X[1]),
         node("n2", icon("gmail", 58), "Bestätigung", X[2]),
         node("n3", icon("googlesheets" if False else "sheets", 58), "Tabelle", X[3])]
lines = [line(f"l{i}", X[i] + 132, X[i + 1] - X[i] - 140) for i in range(3)]
keys = "".join(f'<div class="key" id="k{i}" style="left:{X[i] + 96}px">{KEY}</div>' for i in (1, 2, 3))
LEG = [("Workflow", "der ganze Ablauf"), ("Trigger", "der Auslöser"), ("Node", "eine Station"), ("Credential", "der Schlüssel"), ("Execution", "ein Durchlauf")]
legend = "".join(f'<div class="lg" id="lg{i}"><span class="num">{i + 1}</span><b>{a}</b><span class="def">{d}</span></div>' for i, (a, d) in enumerate(LEG))

CSS = N8N_CSS + """
#win { left:110px; top:110px; width:1180px; height:640px; transform-origin:50% 50%; }
.nodewrap { top:170px; }
.link { top:235px; }
.dot { top:225px; }
.ic { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
#brk { position:absolute; left:60px; top:96px; width:1032px; height:28px; border:3px solid var(--accent); border-bottom:none; border-radius:14px 14px 0 0; }
#brkl { position:absolute; left:486px; top:64px; background:var(--accent); color:#fff; font-size:22px; font-weight:700; padding:6px 16px; border-radius:20px; }
.ptr { position:absolute; background:var(--ink); color:#fff; font-size:22px; font-weight:700; padding:8px 16px; border-radius:12px; white-space:nowrap; }
#ptrT { left:58px; top:410px; } #ptrN { left:330px; top:410px; }
.key { position:absolute; top:282px; width:40px; height:40px; border-radius:50%; background:#B7791F; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,.15); }
#credchip { position:absolute; left:340px; top:410px; background:#FFF7E8; border:1.5px solid #F2D49B; color:#8A5A00; font-size:22px; font-weight:500; padding:10px 16px; border-radius:12px; white-space:nowrap; }
#exlist { position:absolute; left:28px; right:28px; bottom:24px; height:120px; border-top:1px solid var(--line); padding-top:14px; font-size:22px; }
#exlist .hd { color:var(--muted); margin-bottom:8px; }
.ex { display:flex; gap:24px; align-items:center; height:36px; }
.ex b { width:80px; } .ex .s { font-weight:700; } .ex.ok .s { color:var(--ok); } .ex.bad .s { color:var(--err); }
#legend { position:absolute; left:1330px; top:110px; width:480px; height:640px; background:var(--card); border-radius:22px; box-shadow:0 30px 80px rgba(40,30,20,.12); padding:40px 34px; box-sizing:border-box; }
#legend h3 { margin:0 0 26px; font-size:34px; }
.lg { display:flex; align-items:center; gap:16px; height:92px; border-top:1px solid var(--line); font-size:30px; }
.lg .num { width:44px; height:44px; border-radius:50%; background:#EFEBE4; color:var(--muted); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; }
.lg .def { margin-left:auto; color:var(--muted); font-size:22px; }
"""

HTML = f"""
<div id="win">
  <div class="whead"><div class="brand">{icon("n8n", 40)} n8n</div><div class="crumb"><span>Workflows / Neue Anfrage</span></div></div>
  <div class="canvas">
    <div id="brk"></div><div id="brkl">Workflow</div>
    {''.join(lines)}{''.join(nodes)}{keys}<div class="dot" id="dot"></div>
    <div class="ptr" id="ptrT">Trigger</div><div class="ptr" id="ptrN">Node</div>
    <div id="credchip">🔑 HubSpot · Gmail · Sheets verbunden</div>
    <div id="exlist"><div class="hd">Executions</div>
      <div class="ex ok" id="ex1"><b>#1</b><span class="s">✓ Erfolgreich</span><span>heute 14:03</span></div>
      <div class="ex bad" id="ex2"><b>#2</b><span class="s">✕ Fehler</span><span>heute 14:07 · E-Mail-Node</span></div></div>
  </div>
</div>
<div id="legend"><h3>Die 5 Bausteine</h3>{legend}</div>
"""

JS = """
gsap.set(["#win","#legend",".nodewrap","#brk","#brkl",".ptr",".key","#credchip","#exlist",".ex",".badge",".dot","#ic-form","#ic-clock"], { opacity: 0 });
gsap.set(".lg", { opacity: .28 }); gsap.set(".link", { scaleX: 0 }); gsap.set(".nodewrap", { y: 18 }); gsap.set(".key", { scale: 0 });
tl.fromTo("#win", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .7, ease: "power3.out" }, T.stell)
  .fromTo("#legend", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: .7, ease: "power3.out" }, T.stell + .2);
const lit = (i, at) => tl.to("#lg" + i, { opacity: 1, duration: .3, ease: "sine.inOut" }, at).to("#lg" + i + " .num", { backgroundColor: "#E8590C", color: "#FFFFFF", duration: .3 }, at);
// band
tl.to(".nodewrap", { opacity: .35, y: 0, duration: .5, ease: "power2.out", stagger: .08 }, T.band).to(".link", { scaleX: 1, duration: .4, ease: "power2.out", stagger: .08 }, T.band + .2);
lit(0, T.wf); tl.to(["#brk", "#brkl"], { opacity: 1, duration: .4, ease: "power2.out" }, T.wf);
lit(1, T.trig); tl.to("#n0", { opacity: 1, duration: .3 }, T.trig).fromTo("#n0-box", { scale: .9 }, { scale: 1, duration: .45, ease: "back.out(2)" }, T.trig).to("#ptrT", { opacity: 1, duration: .3 }, T.trig + .1);
tl.fromTo("#n0-box", { scale: .92 }, { scale: 1, duration: .35, ease: "back.out(2)" }, T.mail)
  .to("#ic-mail", { opacity: 0, duration: .15 }, T.form).to("#ic-form", { opacity: 1, duration: .15 }, T.form).fromTo("#n0-box", { scale: .92 }, { scale: 1, duration: .35, ease: "back.out(2)" }, T.form)
  .to("#ic-form", { opacity: 0, duration: .15 }, T.mon).to("#ic-clock", { opacity: 1, duration: .15 }, T.mon).fromTo("#n0-box", { scale: .92 }, { scale: 1, duration: .35, ease: "back.out(2)" }, T.mon);
tl.to("#ptrT", { opacity: 0, duration: .2 }, T.stat - .1).to(["#n1", "#n2", "#n3"], { opacity: 1, duration: .35, ease: "power2.out", stagger: .15 }, T.stat);
lit(2, T.node); tl.to("#ptrN", { opacity: 1, duration: .3 }, T.node).fromTo("#n1-box", { scale: .92 }, { scale: 1, duration: .4, ease: "back.out(2)" }, T.node);
tl.to("#ptrN", { opacity: 0, duration: .2 }, T.key - .1).to(".key", { opacity: 1, scale: 1, duration: .35, ease: "back.out(2.2)", stagger: .12 }, T.key);
lit(3, T.cred); tl.to("#credchip", { opacity: 1, duration: .35, ease: "power2.out" }, T.cred);
lit(4, T.exe); tl.to("#credchip", { opacity: 0, duration: .2 }, T.exe - .1).to("#exlist", { opacity: 1, duration: .3 }, T.exe);
const X = [70, 340, 610, 880];
tl.to("#dot", { opacity: 1, x: X[0] + 54, duration: .01 }, T.exe + .05);
X.forEach((x, i) => { tl.to("#dot", { x: x + 54, duration: .25, ease: "power1.inOut" }, T.exe + .05 + i * .27); tl.to("#n" + i + "-ok", { opacity: 1, duration: .2, ease: "back.out(2)" }, T.exe + .2 + i * .27); });
tl.to("#dot", { opacity: 0, duration: .2 }, T.exe + 1.2).fromTo("#ex1", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: .35, ease: "power3.out" }, T.exe + 1.1);
tl.fromTo("#ex2", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: .35, ease: "power3.out" }, T.fail - .2).to("#n2-box", { borderColor: "#D93025", duration: .25 }, T.fail - .1).to("#n2-ok", { opacity: 0, duration: .2 }, T.fail - .1);
"""

build("L3", "../projects/m11_L3", HTML, CSS, JS, full_until=T["stell"] - .1,
      highlights=["Fließband", "Workflow", "Trigger", "Node", "Credentials", "Execution", "Schlüssel", "Auslöser"], beats_js=T)
print({k: round(v, 2) for k, v in T.items()})
