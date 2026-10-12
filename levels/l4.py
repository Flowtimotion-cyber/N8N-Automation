import sys; sys.path.insert(0, "../lib")
from base import build, icon, Beats, STUDIO

B = Beats("L4", STUDIO / "media/words.json"); t = B.t
T = dict(die=t("Die", 1), api=t("API."), rest=t("Restaurant:"), best=t("bestellst,"), bring=t("bringt"), antw=t("Antwort."),
         wh=t("Webhook"), bell=t("Türklingel."), passiert=t("passiert."), mcp=t("MCP.", 1), dolm=t("Dolmetscher"),
         knoepfe=t("Knöpfe"), bedienen=t("bedienen"))

CLOCHE = ('<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true"><path d="M6 34h36" stroke="#E8590C" stroke-width="3" stroke-linecap="round"/>'
          '<path d="M10 34a14 14 0 0 1 28 0" fill="none" stroke="#E8590C" stroke-width="3"/><circle cx="24" cy="17" r="2.5" fill="#E8590C"/></svg>')
BELL = ('<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true"><path d="M14 32V22a10 10 0 0 1 20 0v10l3 4H11z" fill="none" stroke="#E8590C" stroke-width="3" stroke-linejoin="round"/>'
        '<path d="M20 40a4 4 0 0 0 8 0" fill="none" stroke="#E8590C" stroke-width="3"/></svg>')
TRANS = ('<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true"><rect x="4" y="8" width="22" height="16" rx="4" fill="none" stroke="#E8590C" stroke-width="3"/>'
         '<rect x="22" y="24" width="22" height="16" rx="4" fill="none" stroke="#E8590C" stroke-width="3"/></svg>')

CSS = """
.col { position:absolute; top:96px; width:540px; height:660px; background:var(--card); border-radius:24px; box-shadow:0 30px 80px rgba(40,30,20,.12); padding:34px; box-sizing:border-box; }
#c1 { left:110px; } #c2 { left:690px; } #c3 { left:1270px; }
.col .hd { display:flex; align-items:center; gap:18px; }
.col h2 { margin:0; font-size:60px; letter-spacing:-1px; }
.col .tag { font-size:24px; color:var(--muted); margin-top:4px; }
.an { position:absolute; right:30px; top:30px; }
.bub { position:absolute; left:34px; right:34px; border-radius:16px; padding:18px 20px; font-size:24px; }
.req { top:230px; background:#1F1E1C; color:#EDE9E3; font-family:"JetBrains Mono", monospace; }
.req .m { color:#FFB27A; font-weight:600; }
.res { top:350px; background:#EAF6EF; color:#14532D; border:1.5px solid #BFE3CC; font-weight:500; }
.res b { display:block; font-size:34px; margin-top:4px; }
.arrow { position:absolute; left:34px; right:34px; height:4px; background:var(--accent); border-radius:2px; transform-origin:0 50%; }
#ar1 { top:316px; } #ar2 { top:330px; transform-origin:100% 50%; background:var(--ok); }
.shop { top:230px; background:#fff; border:1.5px solid var(--line); box-shadow:0 8px 20px rgba(40,30,20,.08); display:flex; gap:14px; align-items:center; }
.shop .ico { width:44px; height:44px; border-radius:12px; background:#FFF1E8; display:flex; align-items:center; justify-content:center; font-size:26px; }
.whn { top:420px; border:2.5px solid #CFC9BF; background:#fff; display:flex; gap:14px; align-items:center; font-weight:500; }
.whn small { display:block; color:var(--muted); font-family:"JetBrains Mono", monospace; font-size:20px; }
#ring { position:absolute; left:34px; right:34px; top:420px; height:92px; border-radius:16px; box-shadow:0 0 0 6px rgba(232,89,12,.35); }
.pair { position:absolute; left:34px; right:34px; top:210px; display:flex; align-items:center; justify-content:space-between; }
.pair .ic { width:96px; height:96px; border-radius:22px; background:#F7F5F1; display:flex; align-items:center; justify-content:center; }
#bridge { flex:1; height:4px; margin:0 14px; background:var(--accent); border-radius:2px; position:relative; transform-origin:0 50%; }
#bridge span { position:absolute; left:50%; top:-22px; transform:translateX(-50%); background:var(--accent); color:#fff; font-weight:700; font-size:20px; padding:4px 12px; border-radius:12px; }
.tools { position:absolute; left:34px; right:34px; top:350px; }
.tool { height:56px; border:1.5px solid var(--line); border-radius:12px; margin-bottom:12px; display:flex; align-items:center; padding:0 16px; font-family:"JetBrains Mono", monospace; font-size:22px; color:var(--muted); }
.tool i { width:14px; height:14px; border-radius:50%; background:#D9D4CA; margin-right:14px; }
"""

HTML = f"""
<div class="col" id="c1"><div class="hd"><div><h2>API</h2><div class="tag">du fragst nach</div></div></div><div class="an" id="an1">{CLOCHE}</div>
  <div class="bub req" id="req"><span class="m">GET</span> /rechnungen?status=offen</div>
  <div class="arrow" id="ar1"></div><div class="arrow" id="ar2"></div>
  <div class="bub res" id="res">Antwort<b>3 offene Rechnungen</b></div></div>
<div class="col" id="c2"><div class="hd"><div><h2>Webhook</h2><div class="tag">du wirst benachrichtigt</div></div></div><div class="an" id="an2">{BELL}</div>
  <div class="bub shop" id="shop"><div class="ico">🛒</div><div>Neue Bestellung #1042</div></div>
  <div class="bub whn" id="whn">{icon("n8n", 44)}<div>Webhook-Trigger<small>POST /bestellung</small></div></div><div id="ring"></div></div>
<div class="col" id="c3"><div class="hd"><div><h2>MCP</h2><div class="tag">die KI bedient Werkzeuge</div></div></div><div class="an" id="an3">{TRANS}</div>
  <div class="pair" id="pair"><div class="ic">{icon("claude", 60)}</div><div id="bridge"><span>MCP</span></div><div class="ic">{icon("n8n", 60)}</div></div>
  <div class="tools" id="tools"><div class="tool" id="tl0"><i></i>create_workflow</div><div class="tool" id="tl1"><i></i>test_workflow</div>
  <div class="tool" id="tl2"><i></i>get_execution</div><div class="tool" id="tl3"><i></i>update_workflow</div></div></div>
"""

JS = """
gsap.set([".col",".an","#req","#res","#shop","#whn","#ring","#pair",".tool"], { opacity: 0 });
gsap.set([".arrow","#bridge"], { scaleX: 0 });
const card = (s, at) => tl.fromTo(s, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, at);
const popi = (s, at) => tl.fromTo(s, { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .45, ease: "back.out(2)" }, at);
card("#c1", T.api - .1); popi("#an1", T.rest);
tl.fromTo("#req", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: .4, ease: "power3.out" }, T.best)
  .to("#ar1", { scaleX: 1, duration: .45, ease: "power2.inOut" }, T.best + .2)
  .to("#ar2", { scaleX: 1, duration: .45, ease: "power2.inOut" }, T.bring)
  .fromTo("#res", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .45, ease: "expo.out" }, T.bring + .3)
  .fromTo("#res", { scale: 1 }, { scale: 1.04, duration: .2, ease: "sine.inOut", yoyo: true, repeat: 1 }, T.antw);
card("#c2", T.wh - .1); popi("#an2", T.bell);
tl.to("#an2", { rotation: 14, duration: .08, ease: "sine.inOut", yoyo: true, repeat: 5 }, T.bell + .3)
  .fromTo("#whn", { opacity: 0 }, { opacity: 1, duration: .4, ease: "power2.out" }, T.bell + .2)
  .fromTo("#shop", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: .5, ease: "back.out(1.6)" }, T.passiert - .4)
  .to("#shop", { y: 120, opacity: 0, duration: .45, ease: "power2.in" }, T.passiert + .3)
  .to("#ring", { opacity: 1, duration: .2 }, T.passiert + .7).to("#ring", { opacity: 0, duration: .6, ease: "sine.inOut" }, T.passiert + 1.0)
  .to("#an2", { rotation: -14, duration: .08, ease: "sine.inOut", yoyo: true, repeat: 3 }, T.passiert + .7);
card("#c3", T.mcp - .1); popi("#an3", T.dolm);
tl.to("#pair", { opacity: 1, duration: .4, ease: "power2.out" }, T.dolm).to("#bridge", { scaleX: 1, duration: .6, ease: "power3.inOut" }, T.dolm + .3);
tl.to(".tool", { opacity: 1, duration: .3, ease: "power2.out", stagger: .12 }, T.knoepfe);
for (let i = 0; i < 4; i++) {
  tl.to("#tl" + i, { borderColor: "#E8590C", color: "#1C1B19", duration: .2 }, T.knoepfe + 1.0 + i * .45)
    .to("#tl" + i + " i", { backgroundColor: "#1F9D55", duration: .2 }, T.knoepfe + 1.0 + i * .45);
}
"""

build("L4", "../projects/m11_L4", HTML, CSS, JS, full_until=T["die"] - .1,
      highlights=["Schnittstellen", "API", "Webhook", "MCP", "Dolmetscher", "Antwort", "Türklingel", "Kellner"], beats_js=T)
print({k: round(v, 2) for k, v in T.items()})
