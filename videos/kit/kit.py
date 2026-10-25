"""Scene kit: builds an animated 1280x720 HyperFrames composition from a cue list.

Each video = voice-over (HeyGen audio) + small avatar circle during the hook + scenes
anchored to spoken phrases (Scribe word timestamps)."""
import json, os, pathlib, re, shutil, subprocess, html as H
from PIL import Image

KIT = pathlib.Path(__file__).resolve().parent
STUDIO = KIT.parent
SI = pathlib.Path(os.environ.get("KIT_ICONS", "/tmp/si/package/icons"))
HG = STUDIO / os.environ.get("KIT_HEYGEN", "heygen2")
WORDS = json.loads((HG / "words.json").read_text()) if (HG / "words.json").exists() else {}
RAW = HG / "raw"
W, HH = 1280, 720

BRAND = {"n8n": "EA4B71", "claude": "D97757", "anthropic": "191919", "openai": "412991", "googlegemini": "8E75B2",
         "ollama": "000000", "make": "6D00CC", "zapier": "FF4F00", "gmail": "EA4335", "googlesheets": "34A853",
         "googlecalendar": "4285F4", "slack": "4A154B", "hubspot": "FF7A59", "notion": "000000", "docker": "2496ED",
         "hetzner": "D50C2D", "supabase": "3FCF8E", "obsidian": "7C3AED", "sap": "0FAAFF", "ubuntu": "E95420", "github": "181717", "googlechrome": "4285F4"}

G = {  # simple stroke glyphs, 24x24
 "form": '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 "mail": '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
 "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-6.5 8-6.5s8 2.1 8 6.5"/>',
 "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-5.6 6.5-5.6s6.5 1.8 6.5 5.6"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.6c2.2.6 3.5 2.3 3.5 5.4"/>',
 "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
 "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
 "key": '<circle cx="8" cy="15" r="4.5"/><path d="M11.3 11.7L20 3M16.5 6.5l3 3M14 9l2 2"/>',
 "server": '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
 "cloud": '<path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 11.5 3.8 3.8 0 0 0 7 19z"/>',
 "bell": '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
 "door": '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M15 12h.01M3 21h18"/>',
 "table": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 4v16"/>',
 "check": '<path d="M5 12.5l4.5 4.5L19 7"/>',
 "x": '<path d="M6 6l12 12M18 6L6 18"/>',
 "bolt": '<path d="M13 2L4 14h7l-1 8 10-12h-7z"/>',
 "robot": '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/><circle cx="12" cy="3.5" r="1"/>',
 "plug": '<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z M12 17v4"/>',
 "chat": '<path d="M4 5h16v11H10l-6 4z"/>',
 "doc": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
 "euro": '<path d="M17 6.5a7 7 0 1 0 0 11M4.5 10.5h9M4.5 13.5h9"/>',
 "shield": '<path d="M12 3l8 3v6c0 5-3.6 8-8 9.5C7.6 20 4 17 4 12V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
 "chip": '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
 "chart": '<path d="M4 20V11M10 20V5M16 20v-8M3 20.5h18"/>',
 "building": '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10.5 21v-3h3v3"/>',
 "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 "folder": '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
 "terminal": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>',
 "monitor": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
 "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
 "warn": '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
 "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
 "pot": '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6.5c0-1.5 1-1.5 1-3M14 6.5c0-1.5 1-1.5 1-3"/>',
 "box": '<path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
 "book": '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20M8 7.5h8M8 11h6"/>',
 "home": '<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
 "rocket": '<path d="M12 15l-3-3c1.5-5 5-8.5 11-9-.5 6-4 9.5-8 12z"/><path d="M9 12l-4 .5-2 3 4.5.5M12 15l-.5 4-3 2-.5-4.5"/><circle cx="15" cy="9" r="1.5"/>',
 "spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
 "search": '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
 "arrow": '<path d="M4 12h16M14 6l6 6-6 6"/>',
 "copy": '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
 "hourglass": '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
 "grad": '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
}

def icon(name, size=40, color=None):
    """name: simple-icons slug, glyph name, or 'txt:AB'."""
    if name.startswith("txt:"):
        t = name[4:]
        return (f'<span class="txtic" style="width:{size}px;height:{size}px;font-size:{int(size*.42)}px">{H.escape(t)}</span>')
    if name in G:
        c = color or "var(--accent)"
        return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" fill="none" stroke="{c}" stroke-width="2" '
                f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{G[name]}</svg>')
    p = SI / f"{name}.svg"
    svg = p.read_text()
    d = re.search(r' d="([^"]+)"', svg).group(1)
    c = color or "#" + BRAND.get(name, "1C1B19")
    return f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true"><path fill="{c}" d="{d}"/></svg>'

def esc(s):
    s = H.escape(s)
    return re.sub(r"\*(.+?)\*", r'<em>\1</em>', s)

# ---------------------------------------------------------------- timing
def norm(w):
    w = w.lower().replace("ß", "ss")
    w = re.sub(r"[^0-9a-zäöü]", "", w)
    return {"cloud": "claude"}.get(w, w)

class Clock:
    def __init__(self, key):
        self.w = WORDS[key]
        self.n = [norm(x["t"]) for x in self.w]
        self.pos = 0
    def find(self, phrase, start=None, move=True):
        toks = [norm(t) for t in phrase.split() if norm(t)]
        i0 = self.pos if start is None else start
        for i in range(i0, len(self.n) - len(toks) + 1):
            if self.n[i:i + len(toks)] == toks:
                if move: self.pos = i
                return self.w[i]["s"], i
        raise KeyError(f"phrase not found after {self.w[i0]['s'] if i0 < len(self.w) else 'end'}: {phrase!r}")
    def end(self):
        return self.w[-1]["e"]

# ---------------------------------------------------------------- CSS
CSS = """
@font-face { font-family:"SG"; src:url("assets/fonts/space-grotesk-latin-500-normal.woff2") format("woff2"); font-weight:500; }
@font-face { font-family:"SG"; src:url("assets/fonts/space-grotesk-latin-700-normal.woff2") format("woff2"); font-weight:700; }
@font-face { font-family:"JB"; src:url("assets/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2"); font-weight:400; }
@font-face { font-family:"JB"; src:url("assets/fonts/jetbrains-mono-latin-600-normal.woff2") format("woff2"); font-weight:600; }
:root { --bg:#F3F1EC; --card:#FFFFFF; --ink:#1C1B19; --muted:#6F6A62; --line:#DDD8CF; --accent:#E8590C; --soft:#FCE9DD; --ok:#1F9D55; --err:#D93025; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:"SG", sans-serif; }
#root { position:relative; width:1280px; height:720px; overflow:hidden; background:var(--bg); }
#bgdots { position:absolute; inset:0; background-image:radial-gradient(#E3DED5 1.3px, transparent 1.3px); background-size:26px 26px; opacity:.55; }
.sc { position:absolute; left:0; top:0; width:1280px; height:640px; opacity:0; }
.it { opacity:0; }
em { font-style:normal; color:var(--accent); }
.kick { font-size:18px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--accent); }
.hd { font-size:50px; font-weight:700; letter-spacing:-1.2px; line-height:1.08; }
.sub { font-size:24px; color:var(--muted); line-height:1.35; }
.top { position:absolute; left:90px; right:90px; top:44px; }
.top .hd { font-size:40px; margin-top:6px; }
.center { position:absolute; left:110px; right:110px; top:0; height:640px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:16px; }
.center .hd { font-size:62px; }
.logorow { display:flex; gap:26px; justify-content:center; align-items:center; margin-top:14px; }
.lg { display:flex; flex-direction:column; align-items:center; gap:10px; font-size:19px; font-weight:500; }
.tile { width:92px; height:92px; border-radius:22px; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 14px 34px rgba(40,30,20,.10), 0 1px 3px rgba(40,30,20,.06); }
.txtic { display:inline-flex; align-items:center; justify-content:center; border-radius:10px; background:var(--ink); color:#fff; font-weight:700; }
.card { background:var(--card); border-radius:20px; box-shadow:0 22px 60px rgba(40,30,20,.10), 0 1px 4px rgba(40,30,20,.06); }
.zone { position:absolute; left:0; right:0; display:flex; flex-direction:column; justify-content:center; }
.cards { position:relative; margin:0 90px; display:flex; gap:22px; justify-content:center; align-items:stretch; }
.cards .card { flex:1; max-width:340px; padding:26px 24px; display:flex; flex-direction:column; gap:12px; }
.cards .card .ic { width:64px; height:64px; border-radius:16px; background:var(--soft); display:flex; align-items:center; justify-content:center; }
.cards .card .ic.white { background:#F6F4F0; }
.cards .card .t { font-size:28px; font-weight:700; line-height:1.15; }
.cards .card .d { font-size:21px; color:var(--muted); line-height:1.35; }
.cards .card.ok { box-shadow:0 0 0 3px var(--ok), 0 22px 60px rgba(40,30,20,.10); }
.cards .card.bad { opacity:.9; }
.cards .arr { align-self:center; flex:0 0 auto; }
.foot { position:absolute; left:90px; right:90px; bottom:40px; text-align:center; }
.foot span { display:inline-block; background:var(--ink); color:#fff; font-size:23px; font-weight:500; padding:13px 26px; border-radius:40px; }
.foot span b { color:#FFB27A; }
.big { font-size:150px; font-weight:700; letter-spacing:-5px; line-height:1; color:var(--accent); }
.pre { font-size:30px; font-weight:500; color:var(--muted); }
.chip { display:inline-flex; align-items:center; gap:10px; background:#fff; border-radius:40px; padding:10px 20px 10px 14px; font-size:22px; font-weight:500; box-shadow:0 10px 26px rgba(40,30,20,.12); }
/* hub */
.sat { position:absolute; width:150px; margin-left:-75px; margin-top:-46px; display:flex; flex-direction:column; align-items:center; gap:8px; font-size:20px; font-weight:500; }
.sat .tile { width:84px; height:84px; }
.hubc { position:absolute; width:150px; height:150px; margin-left:-75px; margin-top:-75px; border-radius:36px; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 6px var(--soft), 0 24px 60px rgba(40,30,20,.16); }
.spoke { position:absolute; height:3px; background:repeating-linear-gradient(90deg, var(--accent) 0 10px, transparent 10px 18px); transform-origin:0 50%; opacity:.55; }
/* n8n window */
.win { position:absolute; left:90px; top:150px; width:1100px; height:440px; background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 26px 70px rgba(40,30,20,.12), 0 2px 6px rgba(40,30,20,.06); }
.wh { position:absolute; left:0; right:0; top:0; height:54px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; padding:0 22px; font-size:19px; color:var(--muted); }
.wh b { color:var(--ink); }
.wh .pub { margin-left:auto; display:flex; align-items:center; gap:8px; font-size:16px; }
.wh .pub i { width:9px; height:9px; border-radius:50%; background:var(--ok); }
.cv { position:absolute; left:0; right:0; top:55px; bottom:0; background-image:radial-gradient(#DAD5CC 1.4px, transparent 1.4px); background-size:24px 24px; }
.nw { position:absolute; top:120px; width:120px; margin-left:-60px; display:flex; flex-direction:column; align-items:center; }
.nd { position:relative; width:100px; height:100px; background:#fff; border:2.5px solid #CFC9BF; border-radius:20px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(40,30,20,.08); }
.nd.trig { border-radius:50px 20px 20px 50px; }
.nl { margin-top:12px; font-size:20px; font-weight:500; white-space:nowrap; text-align:center; }
.bdg { position:absolute; right:-12px; top:-12px; width:32px; height:32px; border-radius:50%; color:#fff; font-size:19px; font-weight:700; display:flex; align-items:center; justify-content:center; opacity:0; }
.bdg.ok { background:var(--ok); } .bdg.er { background:var(--err); }
.lk { position:absolute; top:168px; height:4px; background:#BDB6AA; border-radius:2px; transform-origin:0 50%; transform:scaleX(0); }
.dot { position:absolute; top:160px; width:20px; height:20px; margin-left:-10px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 7px rgba(232,89,12,.18); opacity:0; }
.panel { position:absolute; right:26px; bottom:22px; width:360px; background:#FAF8F4; border:1px solid var(--line); border-radius:14px; padding:14px 18px; font-family:"JB", monospace; font-size:16px; line-height:1.6; }
.panel .ph { font-family:"SG"; font-size:15px; font-weight:700; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:4px; }
.below { position:absolute; left:0; right:0; bottom:26px; display:flex; justify-content:center; gap:16px; }
.below .chip { box-shadow:0 4px 12px rgba(40,30,20,.10); border:1px solid var(--line); }
.tip { position:absolute; background:#FDECEA; color:var(--err); border:1.5px solid #F5C2BD; border-radius:12px; padding:9px 15px; font-size:18px; font-weight:500; white-space:nowrap; }
.execs { position:absolute; right:22px; top:72px; background:#F7F5F1; border:1px solid var(--line); border-radius:14px; padding:10px 16px; font-size:15px; color:var(--muted); text-align:right; }
.execs b { display:block; font-size:30px; color:var(--ok); font-weight:700; }
/* screenshot */
.shot { position:absolute; left:90px; top:140px; width:1100px; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 26px 70px rgba(40,30,20,.14), 0 2px 6px rgba(40,30,20,.06); }
.bar { height:34px; background:#F1EEE8; display:flex; align-items:center; gap:8px; padding:0 14px; }
.bar i { width:11px; height:11px; border-radius:50%; background:#D6D0C6; }
.bar span { margin-left:14px; background:#fff; border-radius:8px; padding:3px 14px; font-size:13px; color:var(--muted); }
.vp { position:relative; overflow:hidden; }
.vp img { display:block; width:100%; transform-origin:50% 50%; }
.hl { position:absolute; border:3.5px solid var(--accent); border-radius:12px; box-shadow:0 0 0 9999px rgba(28,27,25,.0); }
.hl b { position:absolute; left:-3px; top:-38px; background:var(--accent); color:#fff; font-size:17px; font-weight:700; padding:5px 12px; border-radius:8px; white-space:nowrap; }
.chips { position:absolute; right:60px; bottom:34px; display:flex; flex-direction:column; align-items:flex-end; gap:12px; }
/* compare */
.cmp { position:relative; margin:0 90px; display:flex; gap:30px; align-items:stretch; }
.cmp .col { flex:1; padding:28px 30px; display:flex; flex-direction:column; gap:14px; }
.cmp .ch { display:flex; align-items:center; gap:16px; font-size:30px; font-weight:700; }
.cmp .ch .ic { width:64px; height:64px; border-radius:16px; background:var(--soft); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.cmp .row { display:flex; gap:12px; align-items:flex-start; font-size:24px; line-height:1.35; }
.cmp .row svg { flex:0 0 auto; margin-top:3px; }
.cmp .vs { align-self:center; font-size:26px; font-weight:700; color:var(--muted); }
/* checklist */
.cl { position:relative; margin:0 200px; display:flex; flex-direction:column; gap:16px; }
.cl .ci { display:flex; align-items:center; gap:20px; padding:18px 26px; font-size:27px; font-weight:500; }
.cl .num { width:46px; height:46px; border-radius:50%; background:var(--accent); color:#fff; font-weight:700; font-size:22px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.cl .ck { width:46px; height:46px; border-radius:12px; background:var(--soft); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
/* terminal */
.term { position:absolute; left:130px; top:150px; width:1020px; height:420px; background:#1F1E1C; border-radius:18px; overflow:hidden; box-shadow:0 30px 80px rgba(20,15,10,.25); font-family:"JB", monospace; }
.th { height:48px; display:flex; align-items:center; gap:10px; padding:0 20px; border-bottom:1px solid #34322E; color:#EDE9E3; font-size:16px; }
.th i { width:12px; height:12px; border-radius:50%; background:#4A4741; }
.th .ttl { margin-left:12px; display:flex; align-items:center; gap:8px; }
.tb { padding:20px 26px; color:#EDE9E3; font-size:20px; line-height:1.7; }
.tl { white-space:nowrap; overflow:hidden; }
.tl .p { color:var(--accent); font-weight:600; }
.tl.g { color:#7FD49B; } .tl.r { color:#FF8A80; } .tl.m { color:#A9A398; } .tl.y { color:#F2C46D; }
/* chat */
.chat { position:relative; margin:0 250px; display:flex; flex-direction:column; gap:18px; }
.msg { max-width:640px; padding:18px 22px; border-radius:20px; font-size:23px; line-height:1.4; }
.msg.u { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:6px; }
.msg.a { align-self:flex-start; background:#fff; border-bottom-left-radius:6px; box-shadow:0 12px 30px rgba(40,30,20,.10); display:flex; gap:14px; }
.msg.a .av { width:40px; height:40px; border-radius:50%; background:var(--soft); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
/* custom */
.field { display:flex; align-items:center; gap:14px; height:54px; border:1.5px solid var(--line); border-radius:12px; padding:0 18px; font-size:21px; color:var(--muted); }
.field b { margin-left:auto; color:var(--ink); letter-spacing:4px; }
.sf { display:grid; grid-template-columns:200px 1fr; gap:16px; align-items:center; padding:12px 0; border-bottom:1px solid var(--line); }
.sf .lab { display:flex; align-items:center; gap:12px; font-size:22px; font-weight:700; }
.sf .lab span { width:34px; height:34px; border-radius:50%; background:var(--accent); color:#fff; font-size:17px; display:flex; align-items:center; justify-content:center; }
.sf .val { font-size:21px; color:var(--ink); min-height:28px; white-space:nowrap; overflow:hidden; }
.house { position:absolute; left:250px; top:150px; width:780px; height:400px; border:3px dashed var(--accent); border-radius:28px; background:rgba(252,233,221,.35); }
.house .lbl { position:absolute; left:28px; top:-20px; background:var(--bg); padding:0 12px; font-size:20px; font-weight:700; color:var(--accent); display:flex; gap:10px; align-items:center; }
.bars { position:absolute; left:200px; right:200px; top:125px; height:345px; display:flex; align-items:flex-end; gap:34px; border-bottom:3px solid var(--ink); }
.bars .b { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.bars .bv { width:100%; border-radius:12px 12px 0 0; background:var(--accent); transform-origin:50% 100%; }
.bars .bl { position:absolute; bottom:-44px; font-size:20px; font-weight:500; }
.bars .bn { font-size:22px; font-weight:700; margin-bottom:8px; }
.tg { width:54px; height:30px; border-radius:15px; background:#CFCAC1; position:relative; flex:0 0 auto; }
.tg .on { position:absolute; inset:0; border-radius:15px; background:var(--ok); opacity:0; }
.tg .kn { position:absolute; left:3px; top:3px; width:24px; height:24px; border-radius:50%; background:#fff; z-index:2; }
/* avatar + captions */
#avw { position:absolute; left:860px; top:150px; width:320px; height:320px; border-radius:50%; overflow:hidden; z-index:20; box-shadow:0 0 0 7px #fff, 0 24px 60px rgba(40,30,20,.25); opacity:0; }
#av { position:absolute; left:-169px; top:-45px; width:658px; height:370px; object-fit:cover; }
.hook { position:absolute; left:100px; width:700px; top:0; height:640px; display:flex; flex-direction:column; justify-content:center; gap:18px; }
.hook .hd { font-size:56px; }
#avlab { position:absolute; left:900px; top:486px; width:240px; text-align:center; z-index:21; font-size:17px; font-weight:700; color:#fff; background:rgba(28,27,25,.78); border-radius:30px; padding:7px 0; opacity:0; }
.cap { position:absolute; left:120px; right:120px; top:654px; text-align:center; font-weight:700; font-size:25px; opacity:0; white-space:nowrap; z-index:30; color:var(--ink); }
.cap .w { opacity:.18; }
.cap .w.k { color:var(--accent); }
"""

# ---------------------------------------------------------------- Cockpit-Anzeigen (HUD): Logbuch, Ampel, Leitwort
CSS_HUD = """
.hud { position:relative; margin:0 auto; width:1020px; background:#121A22; border-radius:20px; color:#EAF6F5; overflow:hidden;
       box-shadow:0 30px 80px rgba(20,15,10,.28), inset 0 0 0 1.5px rgba(46,230,214,.35); }
.hud .hh { display:flex; align-items:center; gap:12px; padding:15px 26px; border-bottom:1px solid rgba(46,230,214,.22); font-family:"JB", monospace; font-size:16px; letter-spacing:3px; text-transform:uppercase; color:#2EE6D6; }
.hud .hh i { width:10px; height:10px; border-radius:50%; background:#2EE6D6; box-shadow:0 0 12px #2EE6D6; }
.hud .hh span { margin-left:auto; letter-spacing:1px; color:#7F9BA0; text-transform:none; }
/* Logbuch */
.lb { padding:20px 30px 24px; display:flex; flex-direction:column; gap:14px; font-family:"JB", monospace; font-size:22px; line-height:1.45; }
.lb .le { display:flex; gap:18px; align-items:flex-start; color:#8FA6A8; }
.lb .le .n { color:#2EE6D6; font-weight:600; flex:0 0 auto; min-width:92px; }
.lb .le.new { color:#EAF6F5; }
.lb .le.new .n { color:#9B6CFF; }
.lb .cur { display:inline-block; width:11px; height:24px; background:#2EE6D6; margin-left:3px; vertical-align:-3px; }
/* Ampel */
.amp { padding:22px 30px 26px; display:flex; gap:44px; align-items:center; }
.amp .box { width:112px; padding:14px 0; background:#0A1015; border-radius:34px; display:flex; flex-direction:column; gap:14px; align-items:center; border:1.5px solid rgba(255,255,255,.08); flex:0 0 auto; }
.amp .l { width:70px; height:70px; border-radius:50%; background:#243038; }
.amp .rows { display:flex; flex-direction:column; gap:14px; flex:1; }
.amp .row { display:flex; align-items:center; gap:18px; font-size:25px; font-weight:500; padding:14px 22px; border-radius:14px; background:rgba(255,255,255,.04); border:1.5px solid rgba(255,255,255,.07); }
.amp .row b { font-family:"JB", monospace; letter-spacing:2px; text-transform:uppercase; font-size:15px; padding:6px 11px; border-radius:8px; flex:0 0 auto; }
.amp .row.g b { background:rgba(46,213,115,.16); color:#2ED573; } .amp .row.y b { background:rgba(255,192,72,.16); color:#FFC048; } .amp .row.r b { background:rgba(255,77,79,.16); color:#FF4D4F; }
/* Leitwort */
.lw { padding:28px 30px 26px; display:flex; flex-direction:column; align-items:center; gap:22px; }
.lw .slots { display:flex; gap:14px; }
.lw .sl { width:104px; height:118px; border-radius:16px; background:#0A1015; border:1.5px solid rgba(46,230,214,.22); display:flex; align-items:center; justify-content:center; font-size:64px; font-weight:700; color:#26363E; }
.lw .sl.lit { color:#2EE6D6; text-shadow:0 0 18px rgba(46,230,214,.7); border-color:rgba(46,230,214,.75); }
.lw .wds { display:flex; gap:14px; }
.lw .wd { width:104px; text-align:center; font-size:17px; font-weight:500; color:#EAF6F5; line-height:1.2; }
.lw .own { display:flex; align-items:flex-end; gap:16px; font-size:24px; color:#8FA6A8; }
.lw .own .ul { width:440px; height:36px; border-bottom:2px solid #2EE6D6; }
"""

CAPFIX = [(r"Prozesssteckbrief", "Prozess-Steckbrief"), (r"Beispielsteckbrief", "Beispiel-Steckbrief"), (r"\bCloud Code\b", "Claude Code"), (r"\bCloudCode\b", "Claude Code"), (r"\bRacksystem\b", "RAG-System"), (r"\bN8N\b", "n8n"), (r"rund die Uhr", "rund um die Uhr"), (r"\bPubly\b", "Pabbly"), (r"\b2224\b", "2024"), (r"\bChat, GPT\b", "ChatGPT \u200b"),
          (r"\bChat GPT\b", "ChatGPT \u200b"), (r"\bOlama\b", "Ollama"), (r"\bLama\b", "Llama"), (r"\bQuen\b", "Qwen"), (r"\bCL eins\b", "CLI \u200b"), (r"Video Fünften", "Video fünf"), (r"Teil dritten", "Teil drei"), (r"Teil zweiten", "Teil zwei"),
          (r"Video sechsten", "Video sechs"), (r"\bN8N\b", "n8n"), (r"\bN8n\b", "n8n"), (r"Claude Pro-Abo", "Claude-Pro-Abo"), (r"Supa-Base", "Supabase"), (r"\bSupa Base\b", "Supabase"), (r"\bRack-System", "RAG-System"), (r"\bRAG System\b", "RAG-System"), (r"\bC-R-M\b", "CRM"), (r"\bSuperbase\b", "Supabase"), (r"\bCarsten\b", "Karsten"), (r"Modul zweite", "Modul zwei"), (r"\bFördercheck\b", "Förder-Check"), (r"\bK-I\b", "KI"), (r"\bM-C-P\b", "MCP")]
KEYW = {"n8n", "api", "webhook", "mcp", "claude", "trigger", "node", "workflow", "credential", "execution", "ollama", "ki",
        "automation", "steckbrief", "motor", "baumeister", "steckdose", "chatgpt", "codex", "gemini", "assistent", "athena", "supabase", "obsidian", "rag", "ragsystem", "recruiterin", "gedächtnis", "firmengedächtnis", "ampel", "gefördert"}

# ---------------------------------------------------------------- scene builders
class Scene:
    def __init__(self, kind, at, **kw):
        self.kind, self.at, self.kw = kind, at, kw

def S(kind, at, **kw):
    return Scene(kind, at, **kw)

class Builder:
    def __init__(self, key, clock):
        self.key, self.C = key, clock
        self.js = []
        self.n = 0

    def uid(self, p="e"):
        self.n += 1
        return f"{p}{self.n}"

    def t(self, at, default):
        if at is None: return default
        if isinstance(at, (int, float)): return float(at)
        try:
            s, _ = self.C.find(at, move=False, start=self._scene_i)
        except KeyError as ex:
            print("  WARN", self.key, ex)
            return default if default is not None else self._s + 1.0
        if s > self._e:
            print("  WARN", self.key, f"{at!r} at {s:.1f} after scene end {self._e:.1f}")
            return default if default is not None else self._s + 1.0
        return s

    def IN(self, el, t, kind="pop"):
        self.js.append(f'IN("#{el}",{t:.2f},"{kind}");')

    def items(self, specs, s, e, gap=.38, first=.35):
        """resolve item times: explicit 'at' phrase or auto-stagger"""
        out, auto = [], 0
        for sp in specs:
            at = sp.get("at") if isinstance(sp, dict) else None
            if at is not None:
                tt = self.t(at, None)
            else:
                tt = s + first + auto * gap
                auto += 1
            out.append(min(max(tt, s + .1), e - .4))
        return out

    # ---- builders return html; times via self.s / self.e
    def build_scene(self, sc, s, e, idx):
        self._scene_i, self._s, self._e = idx, s, e
        fn = getattr(self, "k_" + sc.kind)
        return fn(s, e, **sc.kw)

    def zone(self, title, foot=False):
        zt = 135 if title else 95
        zb = 105 if foot else 25
        return f'<div class="zone" style="top:{zt}px;bottom:{zb}px">'

    def head(self, s, kick=None, title=None):
        h = ""
        if kick or title:
            i = self.uid("h")
            h = f'<div class="top it" id="{i}">' + (f'<div class="kick">{esc(kick)}</div>' if kick else "") + \
                (f'<div class="hd">{esc(title)}</div>' if title else "") + "</div>"
            self.IN(i, s + .05, "up")
        return h

    def k_hook(self, s, e, kick=None, title="", sub=None, sub_at=None, items=()):
        a = self.uid("a")
        h = f'<div class="hook">'
        if kick: h += f'<div class="kick it" id="{a}k">{esc(kick)}</div>'; self.IN(a + "k", s + .1, "up")
        h += f'<div class="hd it" id="{a}t">{esc(title)}</div>'; self.IN(a + "t", s + .25, "up")
        if sub:
            h += f'<div class="sub it" id="{a}s">{esc(sub)}</div>'; self.IN(a + "s", self.t(sub_at, s + 1.0), "up")
        if items:
            ts = self.items(items, s, e)
            h += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">'
            for k, (it, tt) in enumerate(zip(items, ts)):
                i = f"{a}i{k}"
                h += f'<div class="it" id="{i}"><span class="chip">{icon(it.get("icon","chat"),26)}{esc(it["t"])}</span></div>'
                self.IN(i, tt, "left")
            h += "</div>"
        return h + "</div>"

    def k_title(self, s, e, kick=None, title="", sub=None, sub_at=None, logos=(), glyph=None, chips=()):
        a = self.uid("a")
        h = '<div class="center">'
        if glyph:
            h += f'<div class="tile it" id="{a}g" style="width:120px;height:120px;border-radius:30px">{icon(glyph, 70)}</div>'
            self.IN(a + "g", s + .05, "pop")
        if kick: h += f'<div class="kick it" id="{a}k">{esc(kick)}</div>'; self.IN(a + "k", s + .15, "up")
        h += f'<div class="hd it" id="{a}t">{esc(title)}</div>'; self.IN(a + "t", s + .3, "up")
        if sub:
            h += f'<div class="sub it" id="{a}s">{esc(sub)}</div>'; self.IN(a + "s", self.t(sub_at, s + .9), "up")
        if logos:
            ts = self.items([l if isinstance(l, dict) else {"i": l} for l in logos], s + .6, e)
            h += '<div class="logorow">'
            for k, (l, tt) in enumerate(zip(logos, ts)):
                l = l if isinstance(l, dict) else {"i": l}
                i = f"{a}l{k}"
                h += f'<div class="lg it" id="{i}"><div class="tile">{icon(l["i"], 52)}</div>{esc(l.get("n",""))}</div>'
                self.IN(i, tt, "pop")
            h += "</div>"
        if chips:
            ts = self.items(chips, s + .8, e)
            h += '<div class="logorow">'
            for k, (c, tt) in enumerate(zip(chips, ts)):
                i = f"{a}c{k}"
                h += f'<span class="chip it" id="{i}">{icon(c.get("icon","check"),24)}{esc(c["t"])}</span>'
                self.IN(i, tt, "pop")
            h += "</div>"
        return h + "</div>"

    def k_stat(self, s, e, kick=None, pre=None, num=None, big=None, unit="", label="", num_at=None, sub=None, sub_at=None, frm=0):
        a = self.uid("a")
        h = '<div class="center">'
        if kick: h += f'<div class="kick it" id="{a}k">{esc(kick)}</div>'; self.IN(a + "k", s + .1, "up")
        if pre: h += f'<div class="pre it" id="{a}p">{esc(pre)}</div>'; self.IN(a + "p", s + .25, "up")
        tn = self.t(num_at, s + .6)
        if num is not None:
            h += f'<div class="big it" id="{a}b"><span id="{a}n">{frm}</span>{esc(unit)}</div>'
            self.IN(a + "b", tn, "pop")
            self.js.append(f'CNT("#{a}n",{frm},{num},{tn:.2f},1.3);')
        else:
            h += f'<div class="big it" id="{a}b">{esc(big)}</div>'; self.IN(a + "b", tn, "pop")
        if label: h += f'<div class="hd it" id="{a}l" style="font-size:40px">{esc(label)}</div>'; self.IN(a + "l", tn + .35, "up")
        if sub: h += f'<div class="sub it" id="{a}s">{esc(sub)}</div>'; self.IN(a + "s", self.t(sub_at, tn + 1.2), "up")
        return h + "</div>"

    def k_cards(self, s, e, kick=None, title=None, cards=(), arrows=False, foot=None, foot_at=None, top=190):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(cards, s, e, gap=.5)
        h += self.zone(title, bool(foot)) + '<div class="cards">'
        for k, (c, tt) in enumerate(zip(cards, ts)):
            i = f"{a}c{k}"
            if arrows and k:
                h += f'<div class="arr it" id="{i}x">{icon("arrow", 40, "#B9B2A6")}</div>'
                self.IN(i + "x", tt - .12, "left")
            cls = " " + c["cls"] if c.get("cls") else ""
            ic = c.get("icon", "check")
            white = "" if ic in G or ic.startswith("txt:") else " white"
            h += (f'<div class="card it{cls}" id="{i}"><div class="ic{white}">{icon(ic, 38)}</div>'
                  f'<div class="t">{esc(c["t"])}</div>' + (f'<div class="d">{esc(c["d"])}</div>' if c.get("d") else "") + "</div>")
            self.IN(i, tt, "pop")
        h += "</div></div>"
        if foot:
            i = f"{a}f"
            h += f'<div class="foot it" id="{i}"><span>{foot}</span></div>'
            self.IN(i, self.t(foot_at, ts[-1] + .8 if ts else s + 1), "up")
        return h

    def k_hub(self, s, e, kick=None, title=None, center="n8n", sats=(), hub_at=None, extra=None, extra_at=None, cy=380, rx=380, ry=170):
        import math
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(sats, s, e, gap=.3)
        th = self.t(hub_at, s + .2) if hub_at is not False else s + .2
        cx = 640
        n = len(sats)
        for k, (sat, tt) in enumerate(zip(sats, ts)):
            ang = -math.pi / 2 + 2 * math.pi * k / n + (math.pi / n if n % 2 == 0 else 0)
            x, y = cx + rx * math.cos(ang), cy + ry * math.sin(ang)
            dx, dy = x - cx, y - cy
            L, A = math.hypot(dx, dy), math.degrees(math.atan2(dy, dx))
            sp = f"{a}p{k}"
            h += f'<div class="spoke" id="{sp}" style="left:{cx}px;top:{cy}px;width:{L-50:.0f}px;transform:rotate({A:.1f}deg) scaleX(0)"></div>'
            self.js.append(f'tl.fromTo("#{sp}",{{scaleX:0,rotation:{A:.1f}}},{{scaleX:1,rotation:{A:.1f},duration:.5,ease:"power2.out"}},{max(th, tt)+.15:.2f});')
            i = f"{a}s{k}"
            h += f'<div class="sat it" id="{i}" style="left:{x:.0f}px;top:{y:.0f}px"><div class="tile">{icon(sat["i"], 46)}</div>{esc(sat.get("n",""))}</div>'
            self.IN(i, tt, "pop")
        i = f"{a}c"
        h += f'<div class="hubc it" id="{i}" style="left:{cx}px;top:{cy}px">{icon(center, 84)}</div>'
        self.IN(i, th, "pop")
        if extra:
            i = f"{a}x"
            h += f'<div class="chip it" id="{i}" style="position:absolute;left:{cx}px;top:{cy+92}px;transform:translateX(-50%)">{icon(extra["i"],26)}{esc(extra["t"])}</div>'
            self.js.append(f'tl.fromTo("#{i}",{{opacity:0,xPercent:-50,y:14}},{{opacity:1,xPercent:-50,y:0,duration:.45,ease:"back.out(1.6)"}},{self.t(extra_at, th+1):.2f});')
        return h

    def k_flow(self, s, e, kick=None, title=None, wtitle="Workflow", nodes=(), run=(), err=None, panel=None, panel_at=None,
               below=(), execs=None, tip=None):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(nodes, s, e, gap=.45)
        n = len(nodes)
        Wd = 1100
        xs = [Wd * (k + 1) / (n + 1) for k in range(n)]
        if panel: xs = [x * .68 for x in xs]
        if below or panel: pass
        h += f'<div class="win it" id="{a}w"><div class="wh">{icon("n8n", 26)}<span>Personal /</span><b>{esc(wtitle)}</b>' \
             f'<span class="pub"><i></i>Published</span></div><div class="cv">'
        self.IN(a + "w", s + .15, "up")
        for k in range(n - 1):
            x0, x1 = xs[k] + 52, xs[k + 1] - 52
            h += f'<div class="lk" id="{a}k{k}" style="left:{x0:.0f}px;width:{x1-x0:.0f}px"></div>'
            self.js.append(f'tl.fromTo("#{a}k{k}",{{scaleX:0}},{{scaleX:1,duration:.4,ease:"power2.out"}},{ts[k+1]-.05:.2f});')
        for k, (nd, tt) in enumerate(zip(nodes, ts)):
            i = f"{a}n{k}"
            h += (f'<div class="nw it" id="{i}" style="left:{xs[k]:.0f}px"><div class="nd{" trig" if k==0 and nd.get("trig",True) else ""}">'
                  f'{icon(nd["i"], 50)}<div class="bdg ok" id="{i}o">✓</div><div class="bdg er" id="{i}e">✕</div></div>'
                  f'<div class="nl">{esc(nd["l"])}</div></div>')
            self.IN(i, tt, "pop")
        h += f'<div class="dot" id="{a}d"></div>'
        for r, rt in enumerate(run):
            rt = self.t(rt, None) if isinstance(rt, str) else rt
            last = n - 1 if err is None else err
            self.js.append(f'tl.set("#{a}d",{{opacity:1,left:{xs[0]:.0f}}},{rt:.2f});')
            self.js.append(f'tl.set("{",".join(f"#{a}n{k}o,#{a}n{k}e" for k in range(n))}",{{opacity:0}},{rt:.2f});')
            for k in range(last + 1):
                tk = rt + k * .55
                if k > 0:
                    self.js.append(f'tl.to("#{a}d",{{left:{xs[k]:.0f},duration:.5,ease:"power1.inOut"}},{tk-.5:.2f});')
                b = "e" if (err is not None and k == err) else "o"
                self.js.append(f'tl.fromTo("#{a}n{k}{b}",{{opacity:0,scale:.3}},{{opacity:1,scale:1,duration:.3,ease:"back.out(2)"}},{tk:.2f});')
            self.js.append(f'tl.to("#{a}d",{{opacity:0,duration:.2}},{rt + last*.55 + .1:.2f});')
            if execs:
                self.js.append(f'tl.call(()=>{{}},[],{rt:.2f});')
        if execs:
            h += f'<div class="execs it" id="{a}x">{esc(execs[0])}<b>{esc(execs[1])}</b></div>'
            r0 = run[0] if run else s + 1
            r0 = self.t(r0, None) if isinstance(r0, str) else r0
            self.IN(a + "x", r0 + .3 + (n - 1) * .55, "pop")
        if tip:
            i = f"{a}tp"
            h += f'<div class="tip it" id="{i}" style="left:{xs[err]-80:.0f}px;top:290px">{esc(tip["t"])}</div>'
            self.IN(i, self.t(tip.get("at"), s + 2), "pop")
        if panel:
            i = f"{a}pn"
            h += f'<div class="panel it" id="{i}"><div class="ph">{esc(panel[0])}</div>' + "".join(f'<div>{esc(l)}</div>' for l in panel[1:]) + "</div>"
            self.IN(i, self.t(panel_at, s + 2), "pop")
        if below:
            bts = self.items(below, s + 1, e, gap=.3)
            h += '<div class="below">'
            for k, (b, tt) in enumerate(zip(below, bts)):
                i = f"{a}b{k}"
                h += f'<span class="chip it" id="{i}">{icon(b["i"], 24)}{esc(b["t"])}</span>'
                self.IN(i, tt, "pop")
            h += "</div>"
        h += "</div></div>"
        return h

    def k_shot(self, s, e, kick=None, title=None, img="", url="n8n.hm-storage.de", boxes=(), chips=(), zoom=None, width=1100, left=None, top=140):
        a = self.uid("a")
        h = self.head(s, kick, title)
        nat = Image.open(KIT / "shots" / img).size
        sc = width / nat[0]
        vh = min(int(nat[1] * sc), 640 - top - 34 - 20)
        left = (1280 - width) // 2 if left is None else left
        h += (f'<div class="shot it" id="{a}w" style="left:{left}px;top:{top}px;width:{width}px"><div class="bar"><i></i><i></i><i></i><span>{esc(url)}</span></div>'
              f'<div class="vp" style="height:{vh}px"><img id="{a}i" src="assets/{img}" />')
        self.IN(a + "w", s + .1, "up")
        if zoom:
            zx, zy, zs = zoom.get("x", .5), zoom.get("y", .5), zoom.get("s", 1.12)
            self.js.append(f'tl.fromTo("#{a}i",{{scale:1,transformOrigin:"{zx*100:.0f}% {zy*100:.0f}%"}},{{scale:{zs},duration:{max(1,e-s-.3):.2f},ease:"none"}},{s:.2f});')
        bts = self.items(boxes, s + .6, e, gap=1.2)
        for k, (b, tt) in enumerate(zip(boxes, bts)):
            i = f"{a}b{k}"
            x, y, w, hh = [v * sc for v in b["r"]]
            h += f'<div class="hl it" id="{i}" style="left:{x:.0f}px;top:{y:.0f}px;width:{w:.0f}px;height:{hh:.0f}px">' + (f'<b>{esc(b["t"])}</b>' if b.get("t") else "") + "</div>"
            self.IN(i, tt, "pop")
        h += "</div></div>"
        if chips:
            cts = self.items(chips, s + 1, e, gap=1.0)
            h += '<div class="chips">'
            for k, (c, tt) in enumerate(zip(chips, cts)):
                i = f"{a}c{k}"
                h += f'<span class="chip it" id="{i}">{icon(c.get("icon","check"),26)}{esc(c["t"])}</span>'
                self.IN(i, tt, "left")
            h += "</div>"
        return h

    def k_compare(self, s, e, kick=None, title=None, cols=(), vs="vs", top=170):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += self.zone(title) + '<div class="cmp">'
        cur = s + .3
        for c, col in enumerate(cols):
            i = f"{a}c{c}"
            tcol = self.t(col.get("at"), cur)
            if c:
                h += f'<div class="vs it" id="{i}v">{esc(vs)}</div>'; self.IN(i + "v", tcol - .1, "pop")
            ic = col.get("icon", "check")
            bg = "" if ic in G else ' style="background:#F6F4F0"'
            h += f'<div class="card col it" id="{i}"><div class="ch"><div class="ic"{bg}>{icon(ic, 38)}</div><div>{esc(col["t"])}</div></div>'
            self.IN(i, tcol, "pop")
            rts = self.items(col.get("rows", []), tcol, e, gap=.5, first=.5)
            for r, (row, rt) in enumerate(zip(col.get("rows", []), rts)):
                j = f"{i}r{r}"
                mk = row.get("mk", col.get("mk", "check"))
                mc = {"check": "var(--ok)", "x": "var(--err)"}.get(mk, "var(--accent)")
                h += f'<div class="row it" id="{j}">{icon(mk, 26, mc)}<div>{esc(row["t"])}</div></div>'
                self.IN(j, rt, "left")
            h += "</div>"
            cur = (rts[-1] if rts else tcol) + .6
        return h + "</div></div>"

    def k_check(self, s, e, kick=None, title=None, items=(), mode="num", top=180):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(items, s, e, gap=.55)
        h += self.zone(title) + '<div class="cl">'
        for k, (it, tt) in enumerate(zip(items, ts)):
            i = f"{a}i{k}"
            m = f'<div class="num">{k+1}</div>' if mode == "num" else f'<div class="ck">{icon(it.get("icon","check"), 28)}</div>'
            h += f'<div class="card ci it" id="{i}">{m}<div>{esc(it["t"])}</div></div>'
            self.IN(i, tt, "left")
        return h + "</div></div>"

    def k_term(self, s, e, kick=None, title=None, ttl="claude", lines=(), top=150, height=420):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += (f'<div class="term it" id="{a}w" style="top:{top}px;height:{height}px"><div class="th"><i></i><i></i><i></i>'
              f'<span class="ttl">{icon("claude", 20)} {esc(ttl)}</span></div><div class="tb">')
        self.IN(a + "w", s + .1, "up")
        ts = self.items(lines, s + .3, e, gap=.6)
        for k, (ln, tt) in enumerate(zip(lines, ts)):
            i = f"{a}l{k}"
            cls = ln.get("c", "")
            txt = esc(ln["t"])
            if ln.get("p"): txt = f'<span class="p">&gt;</span> ' + txt
            h += f'<div class="tl {cls}" id="{i}" style="clip-path:inset(0 100% 0 0)">{txt}</div>'
            dur = min(1.6, .03 * len(ln["t"]) + .2) if ln.get("type", True) else .1
            self.js.append(f'tl.fromTo("#{i}",{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:{dur:.2f},ease:"steps({max(4,len(ln["t"])//2)})"}},{tt:.2f});')
        return h + "</div></div>"

    def k_chat(self, s, e, kick=None, title=None, msgs=(), top=170):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(msgs, s, e, gap=1.4)
        h += self.zone(title) + '<div class="chat">'
        for k, (m, tt) in enumerate(zip(msgs, ts)):
            i = f"{a}m{k}"
            if m.get("r", "u") == "u":
                h += f'<div class="msg u it" id="{i}">{esc(m["t"])}</div>'
            else:
                h += f'<div class="msg a it" id="{i}"><div class="av">{icon("robot", 24)}</div><div>{esc(m["t"])}</div></div>'
            self.IN(i, tt, "up")
        return h + "</div></div>"

    def k_cred(self, s, e, kick=None, title=None, name="CRM-Zugang", field="API-Schlüssel", rows=()):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += (f'<div class="card it" id="{a}w" style="position:absolute;left:330px;top:170px;width:620px;padding:28px 32px;display:flex;flex-direction:column;gap:18px">'
              f'<div style="display:flex;align-items:center;gap:14px;font-size:28px;font-weight:700">{icon("key", 34)}{esc(name)}</div>'
              f'<div class="field">{esc(field)}<b id="{a}pw">••••••••••••</b></div>')
        self.IN(a + "w", s + .15, "pop")
        ts = self.items(rows, s + .5, e, gap=.8)
        for k, (r, tt) in enumerate(zip(rows, ts)):
            i = f"{a}r{k}"
            mk = r.get("mk", "check")
            mc = {"check": "var(--ok)", "x": "var(--err)"}.get(mk, "var(--accent)")
            h += f'<div class="it" id="{i}" style="display:flex;gap:12px;align-items:center;font-size:22px">{icon(mk, 26, mc)}{esc(r["t"])}</div>'
            self.IN(i, tt, "left")
        return h + "</div>"

    def k_json(self, s, e, kick=None, title=None, lines=(), table=(), table_at=None):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += f'<div class="term it" id="{a}j" style="left:90px;top:170px;width:520px;height:330px"><div class="th"><i></i><i></i><i></i><span class="ttl">antwort.json</span></div><div class="tb">'
        self.IN(a + "j", s + .1, "up")
        ts = self.items([{}] * len(lines), s + .3, e, gap=.35)
        for k, (ln, tt) in enumerate(zip(lines, ts)):
            i = f"{a}l{k}"
            h += f'<div class="tl it" id="{i}">{ln}</div>'
            self.IN(i, tt, "left")
        h += "</div></div>"
        tt = self.t(table_at, s + 2.5)
        h += f'<div class="it" id="{a}ar" style="position:absolute;left:625px;top:310px">{icon("arrow", 44, "#B9B2A6")}</div>'
        self.IN(a + "ar", tt - .2, "left")
        h += f'<div class="card it" id="{a}t" style="position:absolute;left:690px;top:200px;width:500px;overflow:hidden">'
        h += '<div style="display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--line);font-size:18px;color:var(--muted)">' + icon("n8n", 22) + ' Tabellenansicht</div>'
        for r, row in enumerate(table):
            st = "font-weight:700;background:#FAF8F4" if r == 0 else ""
            h += f'<div style="display:grid;grid-template-columns:1fr 1.4fr;padding:12px 20px;border-bottom:1px solid var(--line);font-size:21px;{st}">' + "".join(f"<div>{esc(c)}</div>" for c in row) + "</div>"
        h += "</div>"
        self.IN(a + "t", tt, "pop")
        return h

    def k_toggle(self, s, e, kick=None, title=None, on_at=None, rows=(), chips=()):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ton = self.t(on_at, s + 1.2)
        h += (f'<div class="win it" id="{a}w" style="left:190px;width:900px;height:400px"><div class="wh">{icon("n8n", 26)}<b>Settings</b><span>/ Instance-level MCP</span></div>'
              f'<div style="position:absolute;left:0;right:0;top:55px;padding:26px 34px;display:flex;flex-direction:column;gap:14px">'
              f'<div style="display:flex;align-items:center;gap:16px;font-size:24px;font-weight:700">{icon("plug",30)} MCP-Zugriff aktivieren'
              f'<div class="tg" style="margin-left:auto"><div class="on" id="{a}on"></div><div class="kn" id="{a}kn"></div></div></div>'
              f'<div style="font-size:18px;color:var(--muted);margin-top:4px">Welche Workflows darf die KI sehen?</div>')
        self.IN(a + "w", s + .1, "up")
        self.js.append(f'tl.to("#{a}on",{{opacity:1,duration:.25}},{ton:.2f}); tl.fromTo("#{a}kn",{{x:0}},{{x:24,duration:.25}},{ton:.2f});')
        ts = self.items(rows, ton + .4, e, gap=.5)
        for k, (r, tt) in enumerate(zip(rows, ts)):
            i = f"{a}r{k}"
            h += (f'<div class="it" id="{i}" style="display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid var(--line);border-radius:12px;font-size:20px">'
                  f'{icon("bolt",22)}{esc(r["t"])}<span style="margin-left:auto;font-size:15px;color:var(--muted)">Available in MCP</span>'
                  f'<div class="tg"><div class="on" id="{i}on"></div><div class="kn" id="{i}kn"></div></div></div>')
            self.IN(i, tt, "left")
            if r.get("on", True):
                self.js.append(f'tl.to("#{i}on",{{opacity:1,duration:.2}},{tt+.5:.2f}); tl.fromTo("#{i}kn",{{x:0}},{{x:24,duration:.2}},{tt+.5:.2f});')
        h += "</div></div>"
        if chips:
            cts = self.items(chips, s + 1, e, gap=.6)
            h += '<div class="foot"><div style="display:flex;gap:14px;justify-content:center">'
            for k, (c, tt) in enumerate(zip(chips, cts)):
                i = f"{a}c{k}"
                h += f'<span class="chip it" id="{i}">{icon(c.get("icon","check"),24)}{esc(c["t"])}</span>'
                self.IN(i, tt, "pop")
            h += "</div></div>"
        return h

    def k_house(self, s, e, kick=None, title=None, label="Euer Server", inner=(), out_at=None, foot=None, foot_at=None):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += f'<div class="house it" id="{a}h"><div class="lbl">{icon("server", 24)}{esc(label)}</div>'
        self.IN(a + "h", s + .1, "pop")
        ts = self.items(inner, s + .4, e, gap=.5)
        xs = [210, 570]
        for k, (it, tt) in enumerate(zip(inner, ts)):
            i = f"{a}i{k}"
            h += f'<div class="lg it" id="{i}" style="position:absolute;left:{xs[k%2]-75}px;top:120px;width:150px"><div class="tile" style="width:110px;height:110px">{icon(it["i"], 64)}</div>{esc(it["n"])}</div>'
            self.IN(i, tt, "pop")
        h += f'<div class="lk" id="{a}lk" style="left:300px;top:175px;width:180px;background:var(--accent)"></div>'
        self.js.append(f'tl.fromTo("#{a}lk",{{scaleX:0}},{{scaleX:1,duration:.5}},{ts[-1]+.3:.2f});')
        h += f'<div class="dot" id="{a}d" style="top:166px"></div>'
        t0 = ts[-1] + .9
        loops = int(max(1, (e - t0 - .5) // 1.6))
        self.js.append(f'tl.set("#{a}d",{{opacity:1,left:300}},{t0:.2f});')
        self.js.append(f'tl.to("#{a}d",{{left:480,duration:.8,ease:"power1.inOut",yoyo:true,repeat:{min(loops*2-1, 40)}}},{t0:.2f});')
        h += "</div>"
        if foot:
            i = f"{a}f"
            h += f'<div class="foot it" id="{i}"><span>{foot}</span></div>'
            self.IN(i, self.t(foot_at, t0 + .5), "up")
        return h

    def k_bars(self, s, e, kick=None, title=None, bars=(), foot=None, foot_at=None):
        a = self.uid("a")
        h = self.head(s, kick, title)
        ts = self.items(bars, s + .3, e, gap=.7)
        mx = max(b["v"] for b in bars)
        h += '<div class="bars">'
        for k, (b, tt) in enumerate(zip(bars, ts)):
            i = f"{a}b{k}"
            hh = 300 * b["v"] / mx
            h += (f'<div class="b" style="position:relative"><div class="bn it" id="{i}n">{esc(b.get("n",""))}</div>'
                  f'<div class="bv" id="{i}" style="height:{hh:.0f}px;transform:scaleY(0)"></div><div class="bl">{esc(b["l"])}</div></div>')
            self.js.append(f'tl.fromTo("#{i}",{{scaleY:0}},{{scaleY:1,duration:.6,ease:"power3.out"}},{tt:.2f});')
            self.IN(i + "n", tt + .4, "pop")
        h += "</div>"
        if foot:
            i = f"{a}f"
            h += f'<div class="foot it" id="{i}" style="bottom:20px"><span>{foot}</span></div>'
            self.IN(i, self.t(foot_at, ts[-1] + .8), "up")
        return h

    def k_brief(self, s, e, kick=None, title=None, fields=()):
        a = self.uid("a")
        h = self.head(s, kick, title)
        h += f'<div class="card it" id="{a}w" style="position:absolute;left:130px;top:140px;width:1020px;padding:12px 34px 18px">'
        h += f'<div style="display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700;color:var(--muted);padding:10px 0 6px">{icon("doc",26)} Prozess-Steckbrief: Kontaktanfrage</div>'
        self.IN(a + "w", s + .1, "up")
        for k, f in enumerate(fields):
            i = f"{a}f{k}"
            tl_ = self.t(f.get("at"), s + .5 + k * .5)
            tv = self.t(f.get("vat"), tl_ + 1.2)
            h += f'<div class="sf it" id="{i}"><div class="lab"><span>{k+1}</span>{esc(f["l"])}</div><div class="val" id="{i}v" style="clip-path:inset(0 100% 0 0)">{esc(f["v"])}</div></div>'
            self.IN(i, tl_, "left")
            self.js.append(f'tl.fromTo("#{i}v",{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:1.4,ease:"steps(24)"}},{tv:.2f});')
            if f.get("hl"):
                self.js.append(f'tl.fromTo("#{i}",{{backgroundColor:"rgba(252,233,221,0)"}},{{backgroundColor:"rgba(252,233,221,1)",duration:.4}},{tl_:.2f});')
        return h + "</div>"


    # ---- Cockpit-Anzeigen (Flugplan 25.10.2026): Logbuch, Ampel, Leitwort
    def hud(self, a, s, label, right=None, title=None):
        h = self.zone(title) + f'<div class="hud it" id="{a}w"><div class="hh"><i></i>{esc(label)}' + (f'<span>{esc(right)}</span>' if right else "") + '</div>'
        self.IN(a + "w", s + .1, "up")
        return h

    def k_logbuch(self, s, e, kick=None, title=None, entries=(), new=None, new_at=None, label="Logbuch", right=None):
        """entries: [{"n": "Flug 0", "t": "…"}] (alte Einträge, gedimmt); new: {"n": "Flug 1", "t": "…", "at": Phrase} wird getippt."""
        a = self.uid("a")
        h = self.head(s, kick, title) + self.hud(a, s, label, right, title) + '<div class="lb">'
        for k, en in enumerate(entries):
            i = f"{a}e{k}"
            h += f'<div class="le it" id="{i}"><span class="n">{esc(en.get("n", f"Flug {k}"))}</span><span>{esc(en["t"])}</span></div>'
            self.IN(i, s + .45 + k * .3, "left")
        if new:
            i = f"{a}n"; tn = self.t(new_at or new.get("at"), s + .9 + len(entries) * .3)
            h += f'<div class="le new it" id="{i}"><span class="n">{esc(new.get("n", "Neu"))}</span><span><span id="{i}t"></span><span class="cur" id="{i}c"></span></span></div>'
            self.IN(i, tn, "left")
            self.js.append(f'TYPE("#{i}t",{json.dumps(new["t"])},{tn+.25:.2f},{max(1.0, len(new["t"])*.045):.2f});')
            self.js.append(f'tl.fromTo("#{i}c",{{opacity:1}},{{opacity:0,duration:.45,repeat:30,yoyo:true,ease:"steps(1)"}},{tn:.2f});')
        return h + "</div></div></div>"

    def k_ampel(self, s, e, kick=None, title=None, lamps=(), label="Ampel", right=None):
        """lamps: [{"c": "g"|"y"|"r", "t": "Text", "at": Phrase}] in Sprechreihenfolge; die Lampe leuchtet, wenn ihre Zeile kommt."""
        a = self.uid("a")
        col = {"g": "#2ED573", "y": "#FFC048", "r": "#FF4D4F"}
        h = self.head(s, kick, title) + self.hud(a, s, label, right, title) + '<div class="amp"><div class="box">'
        for c in ("r", "y", "g"): h += f'<div class="l" id="{a}l{c}"></div>'
        h += '</div><div class="rows">'
        ts = self.items(lamps, s, e, gap=1.1, first=.6)
        for k, (lp, tt) in enumerate(zip(lamps, ts)):
            i = f"{a}r{k}"; c = lp["c"]
            h += f'<div class="row {c} it" id="{i}"><b>{ {"g": "Grün", "y": "Gelb", "r": "Rot"}[c] }</b><span>{esc(lp["t"])}</span></div>'
            self.IN(i, tt, "left")
            for cc in ("r", "y", "g"):
                on = cc == c
                self.js.append(f'tl.to("#{a}l{cc}",{{backgroundColor:"{col[cc] if on else "#243038"}",boxShadow:"0 0 {30 if on else 0}px {col[cc] if on else "rgba(0,0,0,0)"}",duration:.35}},{tt:.2f});')
            self.js.append(f'tl.to("#{i}",{{borderColor:"{col[c]}",duration:.35}},{tt:.2f});')
            if k: self.js.append(f'tl.to("#{a}r{k-1}",{{borderColor:"rgba(255,255,255,.07)",duration:.35}},{tt:.2f});')
        return h + "</div></div></div></div>"

    def k_leitwort(self, s, e, kick=None, title=None, word="MOMENTUM", lit=0, reveal=(), words=(), own="Dein Wort dazu:", label="Leitwort", right=None):
        """word: das Leitwort; lit: so viele Buchstaben leuchten schon; reveal: [{"i": Index, "at": Phrase}] leuchten neu auf;
        words: Mos Wörter je Buchstabe (nur in der Schluss-Szene); own: Zeile zum Selbstausfüllen (wenn keine words)."""
        a = self.uid("a")
        h = self.head(s, kick, title) + self.hud(a, s, label, right, title) + '<div class="lw"><div class="slots">'
        for k, ch in enumerate(word):
            h += f'<div class="sl{" lit" if k < lit else ""}" id="{a}s{k}">{ch}</div>'
        h += '</div>'
        for r in reveal:
            k = r["i"]; tt = self.t(r.get("at"), s + .8)
            self.js.append(f'tl.to("#{a}s{k}",{{color:"#2EE6D6",borderColor:"rgba(46,230,214,.75)",textShadow:"0 0 18px rgba(46,230,214,.7)",duration:.5,ease:"power2.out"}},{tt:.2f});')
            self.js.append(f'tl.fromTo("#{a}s{k}",{{scale:1}},{{scale:1.12,duration:.25,yoyo:true,repeat:1,ease:"power2.inOut"}},{tt:.2f});')
        if words:
            ts = self.items([w if isinstance(w, dict) else {"t": w} for w in words], s + .6, e, gap=.35, first=.6)
            h += '<div class="wds">'
            for k, (w, tt) in enumerate(zip(words, ts)):
                w = w if isinstance(w, dict) else {"t": w}
                i = f"{a}w{k}"; h += f'<div class="wd it" id="{i}">{esc(w["t"])}</div>'; self.IN(i, tt, "up")
            h += '</div>'
        elif own:
            i = f"{a}o"; h += f'<div class="own it" id="{i}"><span>{esc(own)}</span><span class="ul"></span></div>'
            self.IN(i, (self.t(reveal[0].get("at"), s + .8) + .9) if reveal else s + 1.0, "up")
        return h + "</div></div></div>"


# ---------------------------------------------------------------- composition
JS_HEAD = """
const tl = gsap.timeline({ paused: true });
function IN(sel, t, k) {
  const f = {opacity:0}, to = {opacity:1, duration:.45, ease:"back.out(1.5)"};
  if (k === "up") { f.y = 22; to.y = 0; to.ease = "power3.out"; }
  else if (k === "left") { f.x = -26; to.x = 0; to.ease = "power3.out"; }
  else { f.scale = .85; to.scale = 1; }
  tl.fromTo(sel, f, to, t);
}
function SC(sel, s, e) { tl.fromTo(sel, {opacity:0}, {opacity:1, duration:.3}, s); tl.to(sel, {opacity:0, duration:.3}, e - .3); }
function CNT(sel, a, b, t, d) {
  const o = {v:a}, el = document.querySelector(sel);
  tl.to(o, {v:b, duration:d, ease:"power2.out", onUpdate:() => { el.textContent = Math.round(o.v).toLocaleString("de-DE"); }}, t);
}
function TYPE(sel, text, t, d) {
  const el = document.querySelector(sel), o = {n:0};
  tl.to(o, {n:text.length, duration:d, ease:"none", onUpdate:() => { el.textContent = text.slice(0, Math.round(o.n)); }}, t);
}
"""

def caption_groups(words, maxw=7):
    groups, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= maxw or re.search(r"[.,:?!]$", w["t"]) and len(cur) >= 3:
            groups.append(cur); cur = []
    if cur: groups.append(cur)
    return groups

def fixcap(text):
    for a, b in CAPFIX: text = re.sub(a, b, text)
    return text

def compose(key, plan, out_dir):
    out = pathlib.Path(out_dir)
    if out.exists(): shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    src = STUDIO.parent / "projects/level2/assets"
    shutil.copytree(src / "fonts", out / "assets/fonts")
    shutil.copy(src / "gsap.min.js", out / "assets/gsap.min.js")
    for p in (KIT / "shots").glob("*.jpg"): shutil.copy(p, out / "assets" / p.name)
    raw = RAW / f"{key}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-vn", "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-b:a", "160k", str(out / "assets/vo.mp3")], check=True)
    C = Clock(key)
    dur = round(C.end() + 1.2, 2)
    B = Builder(key, C)
    # resolve scene starts sequentially
    starts = []
    for sc in plan["scenes"]:
        if isinstance(sc.at, (int, float)): starts.append(float(sc.at)); continue
        t, i = C.find(sc.at)
        starts.append(t - .15)
    starts[0] = 0.0
    av_end = plan.get("av_end")
    if isinstance(av_end, str):
        av_end, _ = C.find(av_end, start=0, move=False)
        av_end -= .2
    body = []
    for k, sc in enumerate(plan["scenes"]):
        s = max(0, starts[k]); e = starts[k + 1] if k + 1 < len(starts) else dur
        sid = f"sc{k}"
        # word index lower bound for item phrase search = scene start word
        wi = next((j for j, w in enumerate(C.w) if w["s"] >= s), 0)
        inner = B.build_scene(sc, s + (.05 if k else .1), e, wi)
        body.append(f'<div class="sc" id="{sid}">{inner}</div>')
        B.js.append(f'SC("#{sid}",{s:.2f},{e:.2f});')
    # captions
    caps, cjs = [], []
    for gi, g in enumerate(caption_groups(C.w)):
        gs = g[0]["s"] - .05
        ge = caption_groups(C.w)[gi + 1][0]["s"] - .08 if gi + 1 < len(caption_groups(C.w)) else g[-1]["e"] + .5
        txt = fixcap(" ".join(w["t"] for w in g)).split(" ")
        spans = []
        for wi, w in enumerate(g):
            word = txt[wi] if wi < len(txt) else w["t"]
            k = " k" if norm(word) in KEYW or norm(word).startswith("n8n") else ""
            spans.append(f'<span class="w{k}" id="c{gi}_{wi}">{H.escape(word)}</span>')
        caps.append(f'<div class="cap" id="cap{gi}">{" ".join(spans)}</div>')
        cjs.append(f'tl.set("#cap{gi}",{{opacity:1}},{gs:.2f});tl.set("#cap{gi}",{{opacity:0}},{ge:.2f});')
        for wi, w in enumerate(g):
            cjs.append(f'tl.to("#c{gi}_{wi}",{{opacity:1,duration:.12}},{w["s"]:.2f});')
    av_html = ""
    if av_end:
        av_html = (f'<div id="avw"><video id="av" src="assets/avatar.mp4" muted playsinline data-start="0" data-duration="{av_end+1.2:.2f}" data-track-index="5"></video></div>'
                   + ('<div id="avlab">KI-Avatar von Timo</div>' if os.environ.get("KIT_AVLABEL") else ''))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-t", f"{av_end+1.5:.2f}", "-an", "-vf", "scale=640:-2", "-r", "25", "-g", "25", "-keyint_min", "25", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-movflags", "+faststart", str(out / "assets/avatar.mp4")], check=True)
        B.js.insert(0, f'tl.fromTo("#avw",{{opacity:0,scale:.6}},{{opacity:1,scale:1,duration:.5,ease:"back.out(1.6)"}},0.05);'
                       f'tl.to("#avw",{{left:40,top:520,width:110,height:110,duration:.6,ease:"power2.inOut"}},{av_end:.2f});'
                       f'tl.to("#av",{{left:-58,top:-15,width:226,height:127,duration:.6,ease:"power2.inOut"}},{av_end:.2f});'
                       f'tl.to("#avw",{{opacity:0,scale:.4,duration:.35}},{av_end+.6:.2f});'
                       + (f'tl.to("#avlab",{{opacity:1,duration:.4}},0.4);tl.to("#avlab",{{opacity:0,duration:.25}},{av_end-.1:.2f});' if os.environ.get("KIT_AVLABEL") else ''))
    html = f"""<!doctype html>
<html lang="de"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1280, height=720" />
<title>{key}</title><script src="assets/gsap.min.js"></script><style>{CSS}{CSS_HUD}</style></head>
<body>
<div id="root" data-composition-id="{key.lower()}" data-start="0" data-width="1280" data-height="720" data-duration="{dur}">
  <div id="bgdots"></div>
  {''.join(body)}
  {av_html}
  {''.join(caps)}
  <audio id="vo" src="assets/vo.mp3" data-start="0" data-duration="{dur}" data-track-index="9"></audio>
</div>
<script>
{JS_HEAD}
{chr(10).join(B.js)}
{chr(10).join(cjs)}
window.__timelines = window.__timelines || {{}};
window.__timelines["{key.lower()}"] = tl;
</script>
</body></html>
"""
    (out / "index.html").write_text(html)
    return dur, starts
