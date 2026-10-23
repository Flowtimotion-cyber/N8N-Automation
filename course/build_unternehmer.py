#!/usr/bin/env python3
"""Leadmagnet für Unternehmer: docs/unternehmer/index.html (Modul 1, offen für alle).

Basis ist die Klassen-Version von Modul 1.1 (docs/modul-1-1/index.html). Das Skript ersetzt Inhalte,
entfernt die Kurscode-Sperre und schickt den Lernstand anonym an den n8n-Webhook lm-unternehmer.
Videos: course/videos_unternehmer/U1.mp4 … U6.mp4, VEND.mp4 (optional, je mit .webm/.jpg).
"""
import json, pathlib, re, shutil, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data_unternehmer as D

C = pathlib.Path(__file__).resolve().parent; ROOT = C.parent
SRC = ROOT / "docs/modul-1-1/index.html"
OUT = ROOT / "docs/unternehmer"; MED = OUT / "media"; MED.mkdir(parents=True, exist_ok=True)
SEITE = "https://momentum-ki-akademie.de/unternehmer"
HOOK = "https://n8n.hm-storage.de/webhook/lm-unternehmer"

# Medien: alles außer den Mitarbeiter-Videos übernehmen
for f in (ROOT / "docs/modul-1-1/media").iterdir():
    if not re.match(r"^(V\d|INTRO|VEND)", f.name): shutil.copy2(f, MED / f.name)
# Kein Willkommensfilm im Kurs: Der läuft schon auf der Webseite. Stattdessen U0-Intro als erstes Video.
media = {"LOGO_FULL": "media/logo_full.png", "LOGO_MARK": "media/logo_mark.png",
         "IMG_DESK": "media/img_desk.jpg", "IMG_SORT": "media/img_sort.jpg", "IMG_DONE": "media/img_done.jpg"}
VID = C / "videos_unternehmer"
for k in ["H1", "U0", "UW", "H2", "U1", "U2", "U3", "U4", "U5", "U6", "UN", "H4", "VEND"]:
    for ext, key in [(".mp4", k), (".webm", k + "_webm"), (".jpg", k + "_poster")]:
        src = VID / (k + ext)
        if src.exists(): shutil.copy2(src, MED / src.name); media[key] = "media/" + src.name

h = SRC.read_text()
def rep(old, new, count=1):
    global h
    n = h.count(old)
    if n < 1: raise SystemExit("nicht gefunden: " + old[:90])
    h = h.replace(old, new) if count == 0 else h.replace(old, new, count)

# Videos, die (noch) nicht produziert sind, überspringen; mindestens ein Video-Schritt pro Level bleibt
LEVELS = []
for L in D.LEVELS:
    L = dict(L); da = [v for v in L["videos"] if v in media]
    if da != L["videos"]: print("Video fehlt, übersprungen:", [v for v in L["videos"] if v not in media])
    L["videos"] = da or L["videos"][:1]; LEVELS.append(L)
DATA = {"title": D.TITLE, "subtitle": D.SUBTITLE, "intro": D.INTRO, "promise": D.PROMISE, "levels": LEVELS, "check": D.CHECK, "pass": D.PASS, "hybrid": D.HYBRID, "grundregeln": D.GRUNDREGELN}
h = re.sub(r"^const DATA = .*;$", lambda m: "const DATA = " + json.dumps(DATA, ensure_ascii=False) + ";", h, count=1, flags=re.M)
h = re.sub(r"^const MEDIA = .*;$", lambda m: "const MEDIA = " + json.dumps(media) + ";", h, count=1, flags=re.M)
rep('<title>Automationen verstehen und planen</title>', '<title>Die volle Tasse · KI im Betrieb verstehen · Momentum KI Akademie</title>')
rep('<div class="htitle">Automationen verstehen und planen</div>', '<div class="htitle">Die volle Tasse · KI im Betrieb verstehen</div>')
rep('<nav class="hlinks" aria-label="Kurs-Links"><a href="../">← Meine Kurse</a>', '<nav class="hlinks" aria-label="Kurs-Links"><a href="' + SEITE + '">← Zur Übersicht</a>')
h = re.sub(r'<a href="#" id="verb"[^>]*>.*?</a><a class="n8n".*?</nav>', '<a href="' + SEITE + '#foerder-check" id="fc">🎯 Förder-Check</a></nav>', h, count=1, flags=re.S)
rep('const LS_KEY = "m11-automationen-v2";', 'const LS_KEY = "u1-unternehmer-v1";')
# Kurscode-Sperre entfernen
rep('  if (i > 0 && !kurscodeOk(S.kurscode)) { S.step = 0; toast("Bitte zuerst deinen Namen, den richtigen Kurscode und deine E-Mail eintragen."); if (STEPS[S.step]) render(); return; }\n', '')
rep('if (S.step > 0 && !kurscodeOk(S.kurscode)) S.step = 0;\n', '')
rep('STEPS.push({ k: "check" }); STEPS.push({ k: "video", lv: NLV + 1, v: "VEND" });', 'STEPS.push({ k: "check" }); if (MEDIA.H4) STEPS.push({ k: "video", lv: NLV + 1, v: "H4" }); if (MEDIA.VEND) STEPS.push({ k: "video", lv: NLV + 1, v: "VEND" });')
rep('Das Video zu diesem Abschnitt wird gerade neu aufgenommen. Bis dahin findest du hier die wichtigsten Punkte.', 'Das Wichtigste in zwei Minuten:')
rep('🔊 Ton an! Danach trägst du unten deinen Namen und den Kurscode ein.', '🔊 Ton an! Danach geht es unten los.')
rep("' hast Teil 1 geschafft</h1>'", "' hast Modul 1 geschafft</h1>'")
rep("Weiter geht es mit Teil 2: „Automationen bauen lassen“ – dort gibst du diesen Steckbrief an Claude Code.", "In Modul 2 wird umgesetzt: Du verbindest Claude Code mit n8n, und Athena stellt deinen n8n-Agenten ein, der aus diesem Steckbrief deinen ersten Ablauf baut.")
rep('saveFile("Merkblatt_Automationen.txt", merkText())', 'saveFile("Merkblatt_Die_volle_Tasse.txt", merkText())')
rep("""'<h2 style="margin-top:20px">Dein Prozess-Steckbrief</h2>' +""", """'<h2 style="margin-top:20px">Die 10 Grundregeln</h2><ol class="ml">' + DATA.grundregeln.map(g => '<li><b>' + esc(g[0]) + '</b> ' + esc(g[1]) + '</li>').join("") + '</ol>' +
    '<h2 style="margin-top:20px">Dein Prozess-Steckbrief</h2>' +""")
rep('"Mein Prozess-Steckbrief:", ...STECK.own.map', '"Die 10 Grundregeln:", ...DATA.grundregeln.map((g, i) => (i + 1) + ". " + g[0] + " " + g[1]), "",\n    "Mein Prozess-Steckbrief:", ...STECK.own.map')
rep('setNext(true, "Weiter zu Teil 2 →", true);', 'setNext(true, "Förder-Check und Termin →", true);')
rep('"Die 6 Merksätze:"', '"Die " + NLV + " Merksätze:"')
rep('" / 10" : "")', '" / " + DATA.check.length : "")')
rep("In Teil 2 wird gebaut.", "In Modul 2 wird gebaut.")
rep("brauchst du in Teil 2 – dort baut Claude Code daraus deine Automation.", "brauchst du in Modul 2 – dort baut Claude Code daraus deinen ersten Ablauf.")
rep("dein Steckbrief ist bereit für Teil 2.", "dein Steckbrief ist bereit für Modul 2.")
rep("Sie nutzt sie, um dich zu betreuen und den Kurs zu verbessern", "Sie nutzt sie, um den Kurs zu verbessern")
# Lernstand anonym an lm-unternehmer
rep('const WEBHOOK = "https://n8n.hm-storage.de/webhook/kurs-lernstand";\nconst KURS = "Modul 1.1";\nconst TID_KEY = "m11-teilnehmer-id";',
    'const WEBHOOK = "' + HOOK + '";\nconst KURS = "Unternehmer Modul 1";\nconst TID_KEY = "u1-teilnehmer-id";\nconst SEITE = "' + SEITE + '";')
rep('    kurscode: S.kurscode || "", teilnehmer_id: teilnehmerId(),', '    aktion: "lernstand", teilnehmer_id: teilnehmerId(),')
rep('  if (!S.name || !S.kurscode) return;\n  clearTimeout(syncTimer);', '  clearTimeout(syncTimer);')
rep('if (JSON.stringify(b) !== lastSent && S.name && S.kurscode) post(b)', 'if (JSON.stringify(b) !== lastSent) post(b)')
rep('if (S.name && S.kurscode) post(payload()).catch(() => {});', 'post(payload()).catch(() => {});')
# Startseite: kein Kurscode, Vorname freiwillig
start_neu = r'''// ---------- Startseite: offen für alle, Vorname freiwillig ----------
const _renderStart = renderStart;
renderStart = function (sc) {
  _renderStart(sc);
  const card = $(".card:not(.film)", sc); const nameInp = $("input[type=text]", card);
  nameInp.id = "tn-name"; nameInp.placeholder = "Vorname (freiwillig)";
  const note = $("p.small", card); if (note) note.textContent = "Dein Fortschritt wird ohne Namen und ohne E-Mail gespeichert, damit wir sehen, wo der Kurs hakt, und ihn verbessern. Mehr dazu unter „Datenschutz im Kurs“.";
  card.appendChild(el("p", "muted small", DATA.hybrid));
  card.appendChild(dzBox());
  const ai = el("div", "askai", '<div><b>Dein KI-Assistent</b><span>Unten rechts wartet ein KI-Assistent, der den Kurs kennt. Er erklärt Begriffe, beantwortet Fragen zum Einrichten und zur Förderung deines Teams. Er ist eine KI, kein Mensch.</span></div>');
  const aib = el("button", "btn sec", "Kurz ausprobieren"); aib.onclick = () => window.openAssistant(); ai.appendChild(aib); card.appendChild(ai);
  setNext(true, "Los geht’s"); updMeta();
};

'''
h = re.sub(r"// ---------- Startseite: Name \+ Kurscode sind Pflicht ----------.*?(?=// ---------- Abschluss: Zusammenfassung per Mail, Ausblick ----------)", lambda m: start_neu, h, count=1, flags=re.S)
# Abschluss: statt Mail-Zusammenfassung die zwei Wege
weiter_neu = r'''// ---------- Abschluss: Förder-Check, Termin, Modul 2 ----------
function newsletterBox(sc) {
  const c = el("div", "card nl"); sc.appendChild(c);
  c.innerHTML = '<div class="kicker">Dein nächster Schritt</div><h2>Die Grundpfeiler stehen. Jetzt bist du dran.</h2>' +
    '<div class="outlook">' +
    '<div><b>🎯 Dein Team schulen lassen, gefördert</b><span>Deine Mitarbeiter lernen das in einer zugelassenen Weiterbildung. Die Agentur für Arbeit übernimmt je nach Betriebsgröße bis zu 100 % der Kurskosten und zahlt einen Zuschuss zum Gehalt. Prüf es in zwei Minuten und buch ein kostenloses, unverbindliches Gespräch mit Karsten.</span></div>' +
    '<div><b>🛠️ Modul 2: Umsetzung mit n8n</b><span>Du verbindest Claude Code mit n8n, und Athena stellt deinen n8n-Agenten ein, der aus deinem Steckbrief den ersten Ablauf baut. Den Zugang und den n8n-Schulungszugang bekommst du nach einem kurzen Gespräch mit uns.</span></div>' +
    '</div>';
  const row = el("div", "row"); row.style.marginTop = "14px";
  const a1 = el("a", "btn", "Förder-Check machen"); a1.href = SEITE + "?utm_source=kurs&utm_medium=modul1&utm_campaign=abschluss#foerder-check"; a1.style.textDecoration = "none";
  const a2 = el("a", "btn sec", "Zugang zu Modul 2 anfragen"); a2.href = SEITE + "?utm_source=kurs&utm_medium=modul1&utm_campaign=modul2#modul-2"; a2.style.textDecoration = "none";
  row.append(a1, a2); c.appendChild(row);
  c.appendChild(el("p", "muted small", "Die geförderten Kurse laufen 2026 über unseren AZAV-zugelassenen Partner TEMP.Akademie, ab Januar 2027 über die Momentum KI Akademie. Ob und in welcher Höhe gefördert wird, entscheidet die Agentur für Arbeit."));
}

'''
h = re.sub(r"// ---------- Abschluss: Zusammenfassung per Mail, Ausblick ----------.*?(?=// ---------- Video lädt nicht)", lambda m: weiter_neu, h, count=1, flags=re.S)
rep("location.href = '../modul-1-2/'; return;", "location.href = SEITE + '?utm_source=kurs&utm_medium=modul1&utm_campaign=abschluss#foerder-check'; return;")
# Assistent: Begrüßung für Unternehmer, klar als KI gekennzeichnet
h = re.sub(r"initialMessages: \[.*?\]\,\"", "initialMessages: ['Hallo! Ich bin der KI-Assistent der Momentum KI Akademie, eine KI, kein Mensch.', 'Frag mich zu Begriffen wie KI-Agent, Claude Code, n8n oder MCP, zum Einrichten oder zur Förderung deines Teams über das Qualifizierungschancengesetz.', 'Gut zu wissen: Deine Fragen und meine Antworten werden gespeichert, damit wir den Kurs verbessern. Verarbeitet werden sie von einem KI-Dienst (OpenAI). Bitte keine Kundendaten, Passwörter oder Firmeninterna.'],\"", h, count=1, flags=re.S)
rep("title: 'Setup-Assistent', subtitle: 'Hilfe beim Einrichten, Schritt für Schritt'", "title: 'KI-Assistent', subtitle: 'Begriffe, Einrichtung, Förderung'")
# Datenschutz-Box an den offenen Kurs anpassen
h = re.sub(r"'<table class=\"dztab\"><tr><th>Was</th><th>Wo</th></tr>' \+.*?</table>' \+\n", lambda m: "'<table class=\"dztab\"><tr><th>Was</th><th>Wo</th></tr>' +\n" +
    "    '<tr><td><b>Vorname</b> (nur wenn du ihn einträgst)</td><td>Server der Kursleitung (n8n, Deutschland)</td></tr>' +\n" +
    "    '<tr><td><b>Lernstand:</b> erledigte Level, aktueller Schritt, XP, Check-Ergebnis</td><td>Server der Kursleitung</td></tr>' +\n" +
    "    '<tr><td><b>Dein Prozess-Steckbrief</b></td><td>Server der Kursleitung</td></tr>' +\n" +
    "    '<tr><td><b>Deine Fragen an den Assistenten und seine Antworten</b></td><td>Server der Kursleitung. Verarbeitet werden sie von einem KI-Dienst (OpenAI).</td></tr>' +\n" +
    "    '<tr><td><b>Fortschritt und Eingaben</b> zum Weitermachen</td><td>nur in deinem Browser</td></tr>' +\n" +
    "    '<tr><td><b>Seitenaufruf</b> (IP-Adresse)</td><td>GitHub Pages, liefert Seite und Videos aus</td></tr></table>' +\n", h, count=1, flags=re.S)
rep('body: JSON.stringify({ kurscode: S.kurscode || "", teilnehmer_id: teilnehmerId() })', 'body: JSON.stringify({ aktion: "loeschen", teilnehmer_id: teilnehmerId() })')
rep('const DELETE_HOOK = "https://n8n.hm-storage.de/webhook/kurs-daten-loeschen";', 'const DELETE_HOOK = "' + HOOK + '";')
rep("filter(k => /^m1[12]-/.test(k))", "filter(k => /^u1-/.test(k))")
rep('<a class="btn" href="../" id="pauseKurse" style="text-decoration:none">Zu meinen Kursen</a>', '<a class="btn" href="\' + SEITE + \'" id="pauseKurse" style="text-decoration:none">Zur Übersicht</a>')
rep('$("#verb").onclick = e => { e.preventDefault(); verbesserungOeffnen(); };\n', '')
# Rest-Verweise auf Führungskraft/Kursleitung in Hinweisen
h = h.replace("hilft dir, das Gespräch mit deiner Führungskraft vorzubereiten", "hilft dir bei Fragen zur Förderung")
h = re.sub(r'c\.appendChild\(el\("p", "muted small", "Dein Fortschritt wird gespeichert\. Bist du bei Claude angemeldet.*?"\)\);', 'c.appendChild(el("p", "muted small", "Dein Fortschritt bleibt in diesem Browser gespeichert. Du kannst jederzeit pausieren und später weitermachen."));', h, count=1)
h = h.replace("Server der Kursleitung", "Server der Momentum KI Akademie").replace("Die Kursleitung speichert", "Die Momentum KI Akademie speichert").replace("oder schreib der Kursleitung", "oder schreib uns")
# Erklärseiten (API/Webhook/MCP, Athena) als eigener Schritt vor der Aufgabe, siehe erklaer.py
import erklaer
h = erklaer.apply(h)
(OUT / "index.html").write_text(h)
print(OUT / "index.html", round(len(h) / 1e3), "KB", "Videos:", [k for k in media if k.startswith(("U", "VEND")) and "_" not in k])
