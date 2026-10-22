"""Erklärseiten als eigener Kursschritt vor der Aufgabe eines Levels.

Ein Level bekommt in den Kursdaten ein Feld "erklaer". Alle Teile sind optional:
  titel, kicker, intro, hook            Kopf der Seite
  karten   [{icon, name, kurz, satz, zeilen: [[label, text], ...]}]
  schritte_titel, schritte  [[titel, text], ...]     nummerierte Anleitung
  prompt   {titel, text, datei, hinweis}             kopierbarer Prompt
  kette    [[name, unterzeile], ...], kette_leitungen [text, ...]
  kern     Merksatz-Kasten
  warum_titel, warum [[fett, text], ...]

apply(html) baut Renderer und Styles in eine fertige Kursseite ein (idempotent).
"""

JS = r"""
function renderExplain(sc, st) {
  const L = LV(st.lv); const E = L.erklaer;
  const c = el("div", "card ex");
  c.innerHTML = '<div class="kicker">Level ' + L.id + ' · ' + esc(E.kicker || "Verstehen") + '</div><h2>' + esc(E.titel) + '</h2>' +
    (E.hook ? '<p class="exhook">' + esc(E.hook) + '</p>' : '') +
    (E.intro ? '<p class="muted" style="font-size:17px;max-width:72ch">' + esc(E.intro) + '</p>' : '');
  if (E.karten) {
    const g = el("div", "exgrid");
    E.karten.forEach(k => {
      const d = el("article", "excard");
      d.innerHTML = '<div class="exhead"><span class="exicon" aria-hidden="true">' + k.icon + '</span><div><b>' + esc(k.name) + '</b><span>' + esc(k.kurz) + '</span></div></div>' +
        '<p class="exsatz">' + esc(k.satz) + '</p><dl>' + k.zeilen.map(z => '<dt>' + esc(z[0]) + '</dt><dd>' + esc(z[1]) + '</dd>').join("") + '</dl>';
      g.appendChild(d);
    });
    c.appendChild(g);
  }
  if (E.schritte) {
    const s = el("div", "exsteps"); s.innerHTML = (E.schritte_titel ? '<h3>' + esc(E.schritte_titel) + '</h3>' : '') +
      '<ol>' + E.schritte.map(x => '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>').join("") + '</ol>';
    c.appendChild(s);
  }
  if (E.prompt) {
    const P = E.prompt; const b = el("div", "exprompt");
    b.innerHTML = '<h3>' + esc(P.titel || "Der Prompt zum Kopieren") + '</h3>' + (P.hinweis ? '<p class="muted">' + esc(P.hinweis) + '</p>' : '');
    const row = el("div", "row");
    const cp = el("button", "btn", "Prompt kopieren"); cp.onclick = () => { copyText(P.text); addXPonce("prompt-" + L.id, 10, "Prompt geholt"); };
    const dl = el("button", "btn sec", "Als Datei speichern"); dl.onclick = () => { saveFile(P.datei || "prompt.txt", P.text); addXPonce("prompt-" + L.id, 10, "Prompt geholt"); };
    row.append(cp, dl); b.appendChild(row);
    const det = document.createElement("details"); det.className = "exdetails";
    det.innerHTML = '<summary>Prompt ansehen</summary>'; const pre = el("pre", "expre"); pre.textContent = P.text; det.appendChild(pre); b.appendChild(det);
    c.appendChild(b);
  }
  if (E.kette) {
    const kt = el("div", "exkette");
    kt.innerHTML = '<h3>So hängt es zusammen</h3><div class="exflow">' + E.kette.map((s, i) =>
      '<div class="exnode"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>' + (i < E.kette.length - 1 ? '<div class="exlink"><span>' + esc(E.kette_leitungen[i]) + '</span></div>' : '')).join("") + '</div>';
    c.appendChild(kt);
  }
  if (E.kern) c.appendChild(el("p", "merk exkern", esc(E.kern)));
  if (E.warum) {
    const w = el("div", "kp"); w.innerHTML = '<h3>' + esc(E.warum_titel || "Warum das für dich wichtig ist") + '</h3><ol>' + E.warum.map(x => '<li><b>' + esc(x[0]) + ':</b> ' + esc(x[1]) + '</li>').join("") + '</ol>';
    c.appendChild(w);
  }
  sc.appendChild(c);
  setNext(true, "Zur Aufgabe");
}
function addXPonce(key, n, why) { S.bonus = S.bonus || {}; if (S.bonus[key]) return; S.bonus[key] = true; addXP(n, why); save(); }
"""

CSS = """
.ex h3 { margin:0 0 10px; font-size:20px; }
.exhook { font-size:19px; font-weight:700; line-height:1.45; max-width:72ch; margin:4px 0 10px; border-left:6px solid var(--accent); padding:4px 0 4px 14px; }
.exgrid { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-top:18px; }
.excard { border:1.5px solid var(--line); border-radius:16px; padding:16px 18px; background:#fff; min-width:0; }
.exhead { display:flex; gap:12px; align-items:center; }
.exicon { font-size:28px; width:48px; height:48px; border-radius:14px; background:var(--accent-2); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.exhead div { display:flex; flex-direction:column; } .exhead b { font-size:20px; } .exhead span { color:var(--accent); font-weight:700; font-size:14px; }
.exsatz { font-weight:700; font-size:16px; line-height:1.45; margin:12px 0 4px; }
.excard dl { margin:0; } .excard dt { color:var(--muted); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; margin-top:10px; }
.excard dd { margin:2px 0 0; font-size:15.5px; line-height:1.45; }
.exsteps { margin-top:20px; } .exsteps ol { list-style:none; counter-reset:exs; margin:0; padding:0; display:grid; gap:10px; }
.exsteps li { counter-increment:exs; display:grid; grid-template-columns:36px 1fr; column-gap:12px; align-items:start; background:var(--accent-2); border-radius:14px; padding:12px 14px; }
.exsteps li::before { content:counter(exs); grid-row:span 2; width:32px; height:32px; border-radius:50%; background:var(--accent); color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; }
.exsteps li b { font-size:16.5px; } .exsteps li span { font-size:15.5px; line-height:1.45; color:var(--ink); }
.exprompt { margin-top:20px; border:2px solid var(--accent); border-radius:16px; padding:16px 18px; background:#fff; }
.exprompt p { margin:0 0 12px; line-height:1.45; }
.exdetails { margin-top:12px; } .exdetails summary { cursor:pointer; font-weight:700; color:var(--accent); padding:6px 0; }
.expre { white-space:pre-wrap; word-break:break-word; font-size:13px; line-height:1.45; max-height:340px; overflow:auto; background:#F6F6FB; border:1px solid var(--line); border-radius:12px; padding:12px; margin:8px 0 0; }
.exkette { margin-top:22px; }
.exflow { display:flex; align-items:stretch; flex-wrap:nowrap; }
.exnode { flex:1 1 0; min-width:0; border-radius:14px; background:var(--accent-2); padding:12px 14px; display:flex; flex-direction:column; gap:2px; text-align:center; }
.exnode b { font-size:16px; } .exnode span { color:var(--muted); font-size:14px; }
.exlink { flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:0 8px; position:relative; min-width:96px; }
.exlink::before { content:""; position:absolute; left:4px; right:4px; top:50%; border-top:2px dashed var(--accent); }
.exlink span { position:relative; background:#fff; border:1.5px solid var(--accent); color:var(--accent); font-weight:700; font-size:13px; border-radius:999px; padding:3px 10px; white-space:nowrap; }
.exkern { font-size:17px; }
@media (max-width:640px) {
  .exflow { flex-direction:column; }
  .exlink { min-height:44px; min-width:0; }
  .exlink::before { left:50%; right:auto; top:2px; bottom:2px; border-top:none; border-left:2px dashed var(--accent); }
}
"""

STEPS_OLD = 'DATA.levels.forEach(L => { L.videos.forEach(v => STEPS.push({ k: "video", lv: L.id, v })); STEPS.push({ k: "task", lv: L.id }); });'
STEPS_NEW = 'DATA.levels.forEach(L => { L.videos.forEach(v => STEPS.push({ k: "video", lv: L.id, v })); if (L.erklaer) STEPS.push({ k: "explain", lv: L.id }); STEPS.push({ k: "task", lv: L.id }); });'
RENDER_OLD = '({ start: renderStart, video: renderVideo, task: renderTask, check: renderCheck, summary: renderSummary })[st.k](sc, st);'
RENDER_NEW = '({ start: renderStart, video: renderVideo, explain: renderExplain, task: renderTask, check: renderCheck, summary: renderSummary })[st.k](sc, st);'
NAME_OLD = 'if (st.k === "task") return "Level " + st.lv + " · Aufgabe";'
NAME_NEW = 'if (st.k === "explain") return "Level " + st.lv + " · Erklärung"; if (st.k === "task") return "Level " + st.lv + " · Aufgabe";'
JS_START, JS_END = "// ---------- Erklärseiten (erklaer.py) ----------\n", "// ---------- Ende Erklärseiten ----------\n"
CSS_START, CSS_END = "/* Erklärseiten (erklaer.py) */\n", "/* Ende Erklärseiten */\n"


def _between(h, a, b, new):
    i = h.find(a)
    if i < 0: return None
    j = h.index(b, i) + len(b)
    return h[:i] + new + h[j:]


def apply(h):
    """Fügt Renderer und Styles ein bzw. ersetzt eine ältere Fassung davon."""
    for old, new in [(STEPS_OLD, STEPS_NEW), (RENDER_OLD, RENDER_NEW), (NAME_OLD, NAME_NEW)]:
        if new not in h:
            if h.count(old) != 1: raise SystemExit("erklaer.apply: Stelle nicht gefunden: " + old[:70])
            h = h.replace(old, new)
    js = JS_START + JS.strip() + "\n" + JS_END
    r = _between(h, JS_START, JS_END, js)
    if r is None:
        if h.count("function renderTask(sc, st) {") != 1: raise SystemExit("erklaer.apply: renderTask nicht gefunden")
        r = h.replace("function renderTask(sc, st) {", js + "\nfunction renderTask(sc, st) {")
    h = r
    css = CSS_START + CSS.strip() + "\n" + CSS_END
    r = _between(h, CSS_START, CSS_END, css)
    h = r if r is not None else h.replace("</style>", css + "</style>", 1)
    return h
