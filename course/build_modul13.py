#!/usr/bin/env python3
"""Baut Modul 1 · Teil 3 „Dein eigener Server“ (docs/modul-1-3/index.html) aus der Teil-2-Seite.

Die Teil-2-Seite (docs/modul-1-2/index.html) ist die Vorlage: Player, Styles, Lernstand, Assistent, Datenschutz
und die Schritt-für-Schritt-Level (guide) bleiben. Ausgetauscht werden Kursdaten (course/data_13.py), Medien,
Speicherschlüssel, Kursname und die Teil-3-Besonderheiten (Weg wählen, Ampel, Server-Steckbrief, Merkblatt, Ausblick).
Außerdem: Kursseite docs/index.html (Karte 3 wird Link) und Teil 2 (Ende führt zu Teil 3). Mehrfach ausführbar.

    python3 course/build_modul13.py
"""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data_13 as D13

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/modul-1-2/index.html"
OUT_DIR = ROOT / "docs/modul-1-3"; MEDIA_DIR = OUT_DIR / "media"; MEDIA_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "index.html"
INDEX = ROOT / "docs/index.html"
VIDEOS = ["T3INTRO", "X1", "X2", "X3", "X4", "X5", "X6", "T3END"]

def must(h, old, new, count=1):
    if old not in h: raise SystemExit("Vorlage passt nicht, nicht gefunden: " + old[:80])
    return h.replace(old, new, count)

# ---------------------------------------------------------------- Kursdaten
have = {p.name for p in MEDIA_DIR.iterdir()}
levels = json.loads(json.dumps(D13.LEVELS))
missing_imgs = set()
for L in levels:
    for s in L["steps"]:
        for k in ("img", "img2"):
            if s.get(k) and s[k] not in have: missing_imgs.add(s.pop(k)); s.pop(k + "cap", None)
        for t in s.get("tabs", []):
            for k in ("img", "img2"):
                if t.get(k) and t[k] not in have: missing_imgs.add(t.pop(k))
DATA = {"title": D13.TITLE, "subtitle": D13.SUBTITLE, "intro": D13.INTRO, "promise": D13.PROMISE, "levels": levels,
        "check": D13.CHECK, "pass": D13.PASS, "prompts": D13.PROMPTS, "steck": D13.STECK, "ampel": D13.AMPEL, "ausblick": D13.AUSBLICK}
MEDIA = {}
for k in VIDEOS:
    if f"{k}.mp4" in have: MEDIA[k] = f"media/{k}.mp4"
    if f"{k}.webm" in have: MEDIA[k + "_webm"] = f"media/{k}.webm"
    if f"{k}.jpg" in have: MEDIA[k + "_poster"] = f"media/{k}.jpg"
MEDIA.update({"LOGO_FULL": "media/logo_full.png", "LOGO_MARK": "media/logo_mark.png", "IMG_DESK": "media/logo_full.png", "IMG_DONE": "media/logo_full.png"})

# ---------------------------------------------------------------- Seite
h = SRC.read_text(encoding="utf-8")
h = must(h, "<title>Automationen bauen lassen</title>", "<title>Dein eigener Server</title>")
h = must(h, '<div class="htitle">Automationen bauen lassen</div>', '<div class="htitle">Dein eigener Server</div>')
h = re.sub(r"^const DATA = .*;$", lambda m: "const DATA = " + json.dumps(DATA, ensure_ascii=False) + ";", h, count=1, flags=re.M)
h = re.sub(r"^const MEDIA = .*;$", lambda m: "const MEDIA = " + json.dumps(MEDIA) + ";", h, count=1, flags=re.M)
h = must(h, 'const LS_KEY = "m12-automationen-v1";', 'const LS_KEY = "m13-server-v1";')
h = must(h, 'const KURS = "Modul 1.2";', 'const KURS = "Modul 1.3";')
h = h.replace('"m12-tab-"', '"m13-tab-"')
h = h.replace("modul=Modul%201.2", "modul=Modul%201.3")
h = must(h, 'const isEnd = st.v === "T2END";', 'const isEnd = st.v === "T3END";')
h = must(h, 'STEPS.push({ k: "video", lv: NLV + 1, v: "T2END" });', 'STEPS.push({ k: "video", lv: NLV + 1, v: "T3END" });')
h = must(h, "Dein Prozess-Steckbrief</b></td>", "Dein Server-Steckbrief</b></td>")
h = must(h, "So hast du alles für Teil 3 griffbereit.", "So hast du deinen Server-Steckbrief und die drei Handgriffe griffbereit.")
# Ausblick am Ende
a0 = h.index("  const next = el(\"div\", \"card nl\");"); a1 = h.index("  sc.appendChild(next);", a0)
ausblick = ("  const next = el(\"div\", \"card nl\");\n"
            "  next.innerHTML = '<div class=\"kicker\">Wie es weitergeht</div><h2>Modulaufgabe und das nächste Modul: Hermes</h2><div class=\"outlook\">' +\n"
            "    DATA.ausblick.map((a, i) => '<div' + (i ? ' class=\"soon\"' : '') + '><b>' + esc(a[0]) + '</b><span>' + esc(a[1]) + '</span></div>').join('') +\n"
            "    '</div><p class=\"muted\" style=\"margin-top:14px\">Fragen zum Einrichten? Unten rechts hilft dir der Setup-Assistent, auch mit Screenshots.</p>';\n")
h = h[:a0] + ausblick + h[a1:]
# Setup-Assistent: Metadaten und Begrüßung passen schon (Kurs kommt aus KURS). Begrüßung um Server ergänzen:
h = h.replace("Frag mich alles zum Einrichten: Claude Code, ChatGPT, die Verbindung zu n8n oder deinen eigenen Server.",
              "Frag mich alles zum eigenen Server: Hetzner, Docker, die drei Dateien, den Umzug deiner Workflows oder eine Fehlermeldung aus dem Terminal.")

TEIL3_JS = r"""
// ---------- Teil 3: Weg wählen, Ampel, Server-Steckbrief, Merkblatt ----------
function widgetWeg() {
  const box = el("div", "gwidget"); box.appendChild(el("label", "", "Dein Weg durch Teil 3"));
  const g = el("div", "gchoice");
  [["pilot", "Pilot: Ich miete selbst und baue mit"], ["beobachter", "Beobachter: Ich schaue zu und schreibe den Vorschlag"]].forEach(([v, t]) => {
    const b = el("button", "chip", esc(t)); b.type = "button"; if (S.weg === v) b.classList.add("sel");
    b.onclick = () => { const first = !S.weg; S.weg = v; save(); g.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b)); if (first) addXP(20, "Weg gewählt"); msg.innerHTML = '<div class="fb ok">' + (v === "pilot" ? "Pilot. Ab Level 2 brauchst du eine Zahlungsmethode für den Server (ab etwa 7 € im Monat, Stand November 2026). Frag vorher deinen Chef, wenn der Betrieb zahlt." : "Beobachter. Du machst alle Level mit, ohne etwas zu mieten. In Level 6 schreibst du den Server-Steckbrief als Vorschlag für Chef oder IT.") + '</div>'; };
    g.appendChild(b);
  });
  const msg = el("div"); box.append(g, msg); return box;
}
function widgetAmpel() {
  const box = el("div", "gwidget"); T3 = S.ampel = S.ampel || {};
  const farben = [["gruen", "Grün"], ["gelb", "Gelb"], ["rot", "Rot"]];
  DATA.ampel.forEach((it, i) => {
    const row = el("div", "gf"); row.appendChild(el("label", "", esc(it.t))); const g = el("div", "gchoice"); const fb = el("div");
    farben.forEach(([v, t]) => { const b = el("button", "chip amp-" + v, t); b.type = "button"; if (S.ampel[i] === v) b.classList.add("sel");
      b.onclick = () => { g.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b)); const ok = v === it.a; fb.innerHTML = '<div class="fb ' + (ok ? "ok" : "bad") + '">' + (ok ? "Richtig. " : "Nicht ganz: " + farben.find(f => f[0] === it.a)[1] + ". ") + esc(it.r) + '</div>'; if (ok && S.ampel[i] !== v) { S.ampel[i] = v; save(); addXP(10, "Ampel"); } };
      g.appendChild(b); });
    row.append(g, fb); box.appendChild(row);
  });
  return box;
}
let T3 = null;
function widgetServersteckbrief() {
  const box = el("div", "gwidget"); const names = DATA.steck.own, hints = DATA.steck.hint;
  if (!Array.isArray(S.own) || S.own.length < 5) S.own = ["", "", "", "", ""];
  const state = el("div");
  const upd = () => { const n = S.own.filter(x => (x || "").trim().length > 2).length; state.innerHTML = n >= 5 ? '<div class="fb ok">Dein Server-Steckbrief ist vollständig. Er wandert in deine Zusammenfassung.</div>' : '<p class="muted small">' + n + ' von 5 Zeilen ausgefüllt. Ein Satz pro Zeile reicht.</p>'; if (n >= 5 && !S.steckXP) { S.steckXP = true; save(); addXP(60, "Server-Steckbrief"); } };
  names.forEach((n, k) => { const [w, i] = field(n, "textarea", S.own[k], hints[k], true); i.rows = 2; i.oninput = () => { S.own[k] = i.value; save(); upd(); syncLater(); }; box.appendChild(w); });
  box.appendChild(state); upd(); return box;
}
const _tGuide3 = tGuide;
tGuide = function (c, L, T, finish) {
  _tGuide3(c, L, T, finish);
  c.querySelectorAll("li.gstep").forEach((li, i) => { const s = L.steps[i]; if (!s) return; const body = li.querySelector(".gbody");
    if (s.widget === "weg") body.appendChild(widgetWeg());
    if (s.widget === "ampel") body.appendChild(widgetAmpel());
    if (s.widget === "serversteckbrief") body.appendChild(widgetServersteckbrief()); });
};
function widgetPrompt() { const box = el("div", "gwidget"); DATA.prompts.forEach(p => box.appendChild(codeBox(p[1], p[0]))); return box; }
const HANDGRIFFE = [["Update (monatlich)", "Versionsnummer in docker-compose.yml setzen, dann: cd /opt/n8n && docker compose pull && docker compose down && docker compose up -d"],
  ["Backup (täglich)", "Hetzner-Backup an; Datenbank per Zeitplan: docker compose exec -T postgres pg_dump -U n8n n8n > /opt/n8n/backups/n8n_$(date +%F).sql; Schlüssel im Passwort-Manager"],
  ["Fehler lesen", "Executions (rote Einträge) und docker compose logs n8n --tail 50"]];
function merkText() {
  return [DATA.title, "", "Die " + NLV + " Merksätze:", ...DATA.levels.map((L, i) => (i + 1) + ". " + L.merksatz), "",
    "Mein Server-Steckbrief:", ...DATA.steck.own.map((n, k) => n + ": " + ((S.own || [])[k] || "–")), "",
    "Die drei Handgriffe:", ...HANDGRIFFE.map(h => h[0] + ": " + h[1]), "",
    "XP: " + S.xp + (S.check ? " · Abschluss-Check: " + S.check.best + " / " + DATA.check.length : "")].join("\n");
}
function renderSummary(sc) {
  const hero = el("div", "hero brand noprint"); hero.style.backgroundImage = "url(" + MEDIA.LOGO_FULL + ")"; sc.appendChild(hero);
  const c = el("div", "card"); sc.appendChild(c);
  c.innerHTML = '<div class="kicker">Merkblatt</div><h1>' + (S.name ? esc(S.name) + ", du" : "Du") + ' hast Teil 3 geschafft</h1>' +
    '<p class="muted">' + esc(DATA.title) + ' · ' + S.xp + ' XP' + (S.check ? ' · Abschluss-Check: ' + S.check.best + ' / ' + DATA.check.length : '') + (S.weg ? ' · Weg: ' + (S.weg === "pilot" ? "Pilot" : "Beobachter") : '') + '</p>' +
    '<h2 style="margin-top:20px">Die ' + NLV + ' Merksätze</h2><ol class="ml">' + DATA.levels.map(L => '<li>' + esc(L.merksatz) + '</li>').join("") + '</ol>' +
    '<h2 style="margin-top:20px">Dein Server-Steckbrief</h2><div>' + DATA.steck.own.map((n, k) => '<p><b>' + esc(n) + ':</b> ' + (esc((S.own || [])[k] || "") || '<span class="muted">– noch leer –</span>') + '</p>').join("") + '</div>' +
    '<h2 style="margin-top:20px">Die drei Handgriffe</h2>';
  HANDGRIFFE.forEach(hg => c.appendChild(codeBox(hg[1], hg[0])));
  const row = el("div", "row noprint"); const p = el("button", "btn", "Merkblatt kopieren"); p.onclick = () => copyText(merkText());
  const dl = el("button", "btn sec", "Merkblatt speichern"); dl.onclick = () => saveFile("Merkblatt_Teil3.txt", merkText());
  const rs = el("button", "btn sec", "Fortschritt zurücksetzen"); confirmBtn(rs, () => { S = fresh(); save(); go(0); });
  row.append(p, dl, rs); c.appendChild(row);
  newsletterBox(sc);
  const c2 = el("div", "card"); c2.appendChild(dzBox()); sc.appendChild(c2);
  setNext(true, "Fertig – zu meinen Kursen", true);
}
"""
# vor die Schlusszeilen einhängen (nach den Teil-2-Anpassungen, vor den Klick-Handlern)
h = must(h, '$("#verb").onclick = e =>', TEIL3_JS + '\n$("#verb").onclick = e =>')
# Datenschutz-Box nicht doppelt (Teil 2 hängt sie per renderSummary-Wrapper an; unser renderSummary ersetzt das komplett)
h = must(h, "renderSummary = function (sc) { _renderSummaryDz(sc); const c = el(\"div\", \"card\"); c.appendChild(dzBox()); sc.appendChild(c); };",
         "// (Teil 3: Datenschutz-Box wird in renderSummary unten angehängt)")
# Ampel-Chips einfärben
h = must(h, "</style>", ".chip.amp-gruen.sel{background:#1F9D55;color:#fff;border-color:#1F9D55}.chip.amp-gelb.sel{background:#E0A100;color:#fff;border-color:#E0A100}.chip.amp-rot.sel{background:#D93025;color:#fff;border-color:#D93025}\n</style>")
OUT.write_text(h, encoding="utf-8", newline="\n")
print(OUT, round(len(h) / 1e3), "KB", "| Videos:", [k for k in VIDEOS if k in MEDIA], "| fehlende Screenshots:", sorted(missing_imgs))

# ---------------------------------------------------------------- Kursseite: Karte 3 wird Link
ix = INDEX.read_text(encoding="utf-8")
card_old = '<div class="m off"><div class="n">3</div><div class="mi"><b>Dein eigener Server</b><span class="d">n8n im eigenen Unternehmen betreiben, Workflows umziehen · folgt</span></div></div>'
card_new = '<a class="m" href="modul-1-3/" data-ls="m13-server-v1"><div class="n">3</div><div class="mi"><b>Dein eigener Server</b><span class="d">ca. 45 Min (als Pilot ca. 90) · Server mieten, n8n installieren, Workflows umziehen, Wartung</span><div class="fs"></div></div><div class="go">Starten →</div></a>'
if card_old in ix: ix = ix.replace(card_old, card_new); INDEX.write_text(ix, encoding="utf-8", newline="\n"); print("Kursseite: Karte 3 ist jetzt ein Link")
elif card_new in ix: print("Kursseite: Karte 3 war schon ein Link")
else: print("WARNUNG: Karte 3 auf der Kursseite nicht gefunden, bitte von Hand prüfen")

# ---------------------------------------------------------------- Teil 2: Ende führt zu Teil 3
t2 = SRC.read_text(encoding="utf-8")
o1 = "'<div><b>Teil 3 · Dein eigener Server</b><span>n8n so betreiben, dass alle Daten bei euch bleiben, inklusive Umzug deiner Workflows.</span></div>' +"
n1 = "'<a href=\"../modul-1-3/\" style=\"text-decoration:none;color:inherit\"><b>Teil 3 · Dein eigener Server →</b><span>n8n so betreiben, dass alle Daten bei euch bleiben, inklusive Umzug deiner Workflows. Jetzt freigeschaltet.</span></a>' +"
o2 = "  setNext(true, \"Fertig – zu meinen Kursen\", true);\n}\n\n// Pause / Kurs beenden"
n2 = "  setNext(true, \"Weiter mit Teil 3: Dein eigener Server\", true);\n}\n\n// Pause / Kurs beenden"
o3 = '$("#next").onclick = () => { if (STEPS[S.step] && STEPS[S.step].k === "summary") { fortschrittJetztSenden(); fuerHeuteBeenden(true); return; } go(S.step + 1); };'
n3 = '$("#next").onclick = () => { if (STEPS[S.step] && STEPS[S.step].k === "summary") { fortschrittJetztSenden(); location.href = "../modul-1-3/"; return; } go(S.step + 1); };'
changed = 0
for o, n in ((o1, n1), (o2, n2), (o3, n3)):
    if o in t2: t2 = t2.replace(o, n); changed += 1
    elif n not in t2: print("WARNUNG Teil 2, Stelle nicht gefunden:", o[:60])
if changed: SRC.write_text(t2, encoding="utf-8", newline="\n"); print("Teil 2: Ende führt jetzt zu Teil 3 (" + str(changed) + " Stellen)")
else: print("Teil 2: schon angepasst")
