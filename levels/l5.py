import sys; sys.path.insert(0, "../lib")
from base import build, icon, Beats, STUDIO

B = Beats("L5", STUDIO / "media/words.json"); t = B.t
T = dict(stell=t("Stell"), e1=t("Erstens:"), jahr=t("Jahr"), e2=t("Zweitens:"), wenn=t("wenn", 1), kunde=t("Kundengespräch"),
         e3=t("Drittens:"), kop=t("kopierst,"), drei=t("Dreimal"), kand=t("Kandidat."))

CSS = """
#chk { position:absolute; left:110px; top:110px; width:820px; height:640px; background:var(--card); border-radius:24px; box-shadow:0 30px 80px rgba(40,30,20,.12); padding:40px 44px; box-sizing:border-box; }
#chk h2 { margin:0 0 20px; font-size:44px; letter-spacing:-.5px; }
.row { display:flex; align-items:center; gap:24px; height:150px; border-top:1px solid var(--line); }
.box { width:64px; height:64px; border-radius:16px; border:3px solid #CFC9BF; display:flex; align-items:center; justify-content:center; font-size:40px; color:#fff; font-weight:700; position:relative; }
.box i { position:absolute; inset:-3px; border-radius:16px; background:var(--ok); display:flex; align-items:center; justify-content:center; font-style:normal; }
.row b { font-size:44px; } .row small { display:block; font-size:24px; color:var(--muted); font-weight:500; margin-top:4px; }
.ex { position:absolute; left:990px; width:820px; background:var(--card); border-radius:22px; box-shadow:0 20px 60px rgba(40,30,20,.12); padding:28px 32px; box-sizing:border-box; font-size:30px; }
.ex .lbl { font-size:22px; color:var(--muted); margin-bottom:10px; }
.ex.bad { border-left:8px solid var(--err); } .ex.good { border-left:8px solid var(--ok); }
.ex .v { float:right; font-weight:700; } .ex.bad .v { color:var(--err); } .ex.good .v { color:var(--ok); }
#x1 { top:140px; } #x1b { top:290px; } #x2 { top:140px; } #x2b { top:400px; } #x3 { top:140px; }
.rule { font-family:"JetBrains Mono", monospace; font-size:28px; line-height:1.6; }
.rule .k { color:var(--accent); font-weight:600; }
.flow { display:flex; align-items:center; gap:30px; margin-top:12px; }
.flow .ic { width:110px; height:110px; border-radius:24px; background:#F7F5F1; display:flex; align-items:center; justify-content:center; }
.lane { position:relative; flex:1; height:6px; background:#E6E1D8; border-radius:3px; }
.pkt { position:absolute; top:-17px; left:0; width:40px; height:40px; border-radius:10px; background:#fff; border:2px solid var(--accent); }
#stamp { position:absolute; left:1080px; top:520px; padding:24px 44px; border:6px solid var(--ok); color:var(--ok); border-radius:22px; font-size:64px; font-weight:700; transform:rotate(-6deg); background:rgba(255,255,255,.9); }
"""

rows = [("regelmäßig?", "passiert jede Woche, jeden Tag"), ("klare Regeln?", "„wenn dies, dann das“"), ("mehrere Programme?", "Daten wandern von Tool zu Tool")]
rows_html = "".join(f'<div class="row" id="r{i}"><div class="box"><i id="ck{i}">✓</i></div><div><b>{a}</b><small>{b}</small></div></div>' for i, (a, b) in enumerate(rows))

HTML = f"""
<div id="chk"><h2>Lohnt sich das?</h2>{rows_html}</div>
<div class="ex good" id="x1"><div class="lbl">Beispiel</div>Jede neue Anfrage ins CRM<span class="v">✓ lohnt sich</span></div>
<div class="ex bad" id="x1b"><div class="lbl">Beispiel</div>Einmal im Jahr die Strategie planen<span class="v">✕ eher nicht</span></div>
<div class="ex good" id="x2"><div class="lbl">Feste Regel</div><div class="rule"><span class="k">WENN</span> Rechnung 14 Tage offen<br><span class="k">DANN</span> Erinnerung senden</div></div>
<div class="ex bad" id="x2b"><div class="lbl">Braucht Fingerspitzengefühl</div>Schwieriges Kundengespräch<span class="v">bleibt bei dir</span></div>
<div class="ex good" id="x3"><div class="lbl">Hier verschwindet die Zeit</div>
  <div class="flow"><div class="ic">{icon("sheets", 64)}</div><div class="lane"><div class="pkt" id="pk1"></div><div class="pkt" id="pk2"></div><div class="pkt" id="pk3"></div></div><div class="ic">{icon("hubspot", 64)}</div></div></div>
<div id="stamp">✓ Kandidat</div>
"""
HTML = HTML.replace("<br>", "</div><div class=\"rule\">")

JS = """
gsap.set(["#chk",".row",".ex","#stamp",".box i",".pkt"], { opacity: 0 });
tl.fromTo("#chk", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, T.stell);
const row = (i, at) => tl.fromTo("#r" + i, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: .45, ease: "power3.out" }, at);
const ex = (s, at) => tl.fromTo(s, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: .5, ease: "expo.out" }, at);
const out = (s, at) => tl.to(s, { opacity: 0, x: 30, duration: .3, ease: "power2.in" }, at);
row(0, T.e1); ex("#x1", T.e1 + .4); ex("#x1b", T.jahr - .3);
out(["#x1", "#x1b"], T.e2 - .3); row(1, T.e2); ex("#x2", T.wenn - .2); ex("#x2b", T.kunde - .3);
out(["#x2", "#x2b"], T.e3 - .3); row(2, T.e3); ex("#x3", T.e3 + .4);
[0, 1, 2].forEach(k => {
  const s0 = T.kop - .6 + k * .45;
  tl.to("#pk" + (k + 1), { opacity: 1, duration: .1 }, s0).fromTo("#pk" + (k + 1), { x: 0 }, { x: 330, duration: .9, ease: "power1.inOut" }, s0).to("#pk" + (k + 1), { opacity: 0, duration: .15 }, s0 + .85);
});
[0, 1, 2].forEach(i => tl.fromTo("#ck" + i, { opacity: 0, scale: .4 }, { opacity: 1, scale: 1, duration: .35, ease: "back.out(2.4)" }, T.drei + i * .25));
out("#x3", T.drei); tl.fromTo("#stamp", { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: .45, ease: "back.out(1.8)" }, T.kand - .2);
"""

build("L5", "../projects/m11_L5", HTML, CSS, JS, full_until=T["stell"] - .1,
      highlights=["regelmäßig", "Regeln", "Programme", "Kandidat", "Dreimal", "Ja"], beats_js=T)
print({k: round(v, 2) for k, v in T.items()})
