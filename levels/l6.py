import sys; sys.path.insert(0, "../lib")
from base import build, icon, Beats, STUDIO
from common import FORM

B = Beats("L6", STUDIO / "media/words.json"); t = B.t
T = dict(desh=t("Deshalb"), f1=t("Erstens"), f2=t("Zweitens"), f3=t("Drittens"), f4=t("Viertens"), f5=t("fünftens"),
         gleich=t("Gleich"), fehler=t("Fehler", 1), eigen=t("eigenen"), next=t("nächsten"))

FIELDS = [("Auslöser", "Neue Anfrage über das Kontaktformular"),
          ("Schritte", "1. Kontakt im CRM anlegen  ·  2. Bestätigung senden  ·  3. Team informieren"),
          ("Tools", None),
          ("Ergebnis", "Kontakt steht im CRM, Kunde hat eine Bestätigung"),
          ("Fehlerfall", "E-Mail-Adresse fehlt → Nachricht ans Team")]
tools = f'<span class="chip">{FORM.replace("60", "30")} Formular</span><span class="chip">{icon("hubspot", 30)} CRM</span><span class="chip">{icon("gmail", 30)} Gmail</span>'
rows = "".join(f'<div class="fr" id="f{i}"><div class="fl"><span>{i + 1}</span>{a}</div><div class="fv" id="v{i}">{b if b else tools}</div></div>' for i, (a, b) in enumerate(FIELDS))
erows = "".join(f'<div class="fr"><div class="fl"><span>{i + 1}</span>{a}</div><div class="fv empty"><i class="cur" id="cur{i}"></i></div></div>' for i, (a, _) in enumerate(FIELDS))

CSS = """
.doc { position:absolute; left:330px; top:84px; width:1260px; height:700px; background:var(--card); border-radius:24px; box-shadow:0 30px 80px rgba(40,30,20,.12); padding:36px 44px; box-sizing:border-box; }
.doc h2 { margin:0 0 14px; font-size:44px; display:flex; align-items:center; gap:16px; }
.doc h2 small { font-size:24px; color:var(--muted); font-weight:500; }
.fr { display:flex; align-items:center; height:112px; border-top:1px solid var(--line); }
.fl { width:270px; font-size:32px; font-weight:700; display:flex; align-items:center; gap:14px; }
.fl span { width:42px; height:42px; border-radius:50%; background:#EFEBE4; color:var(--muted); display:flex; align-items:center; justify-content:center; font-size:22px; }
.fv { flex:1; font-size:28px; display:flex; gap:14px; align-items:center; white-space:nowrap; }
.fv.empty { height:60px; border:1.5px dashed #CFC9BF; border-radius:12px; }
.chip { display:inline-flex; align-items:center; gap:10px; background:#F7F5F1; border:1.5px solid var(--line); border-radius:14px; padding:8px 16px; font-size:26px; }
.cur { display:block; width:3px; height:34px; background:var(--accent); margin-left:16px; }
#find { position:absolute; left:1300px; top:40px; background:var(--err); color:#fff; font-size:30px; font-weight:700; padding:16px 26px; border-radius:18px; transform:rotate(4deg); box-shadow:0 14px 40px rgba(217,48,37,.35); }
#next { position:absolute; left:1060px; top:810px; background:var(--ink); color:#fff; font-size:30px; font-weight:700; padding:18px 30px; border-radius:18px; }
#next em { font-style:normal; color:#FFB27A; }
"""

HTML = f"""
<div class="doc" id="d1"><h2>Prozess-Steckbrief <small>Beispiel: Neue Anfrage</small></h2>{rows}</div>
<div class="doc" id="d2"><h2>Dein Steckbrief <small>füllst du gleich selbst aus</small></h2>{erows}</div>
<div id="find">🔍 Finde 3 Fehler</div>
<div id="next">→ Datei 1.2: <em>Claude Code baut ihn</em></div>
"""

JS = """
gsap.set(["#d1","#d2","#find","#next",".fv",".cur"], { opacity: 0 });
tl.fromTo("#d1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: "power3.out" }, T.desh);
const keys = [T.f1, T.f2, T.f3, T.f4, T.f5];
keys.forEach((k, i) => {
  tl.to("#f" + i + " .fl span", { backgroundColor: "#E8590C", color: "#FFFFFF", duration: .25 }, k)
    .fromTo("#v" + i, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: .45, ease: "power3.out" }, k + .5);
});
tl.fromTo("#find", { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .45, ease: "back.out(2.2)" }, T.fehler)
  .to("#d1", { opacity: 0, x: -60, duration: .4, ease: "power2.in" }, T.eigen - .3)
  .to("#find", { opacity: 0, duration: .25 }, T.eigen - .3)
  .fromTo("#d2", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: .5, ease: "expo.out" }, T.eigen)
  .to("#d2 .fv", { opacity: 1, duration: .3, stagger: .08 }, T.eigen + .2)
  .to("#cur0", { opacity: 1, duration: .01 }, T.eigen + .6)
  .to("#cur0", { opacity: 0, duration: .01, repeat: 5, yoyo: true, repeatDelay: .35 }, T.eigen + 1.0)
  .fromTo("#next", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .5, ease: "power3.out" }, T.next - .2);
"""

build("L6", "../projects/m11_L6", HTML, CSS, JS, full_until=T["desh"] - .1,
      highlights=["Steckbrief", "Auslöser", "Schritte", "Tools", "Ergebnis", "Fehlerfall", "Fehler"], beats_js=T)
print({k: round(v, 2) for k, v in T.items()})
