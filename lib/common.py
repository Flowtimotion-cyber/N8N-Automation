from base import icon
FORM = ('<svg viewBox="0 0 24 24" width="60" height="60" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="#E8590C" stroke-width="2"/>'
        '<rect x="7" y="7" width="10" height="2" rx="1" fill="#E8590C"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#E8590C"/><rect x="7" y="15" width="6" height="2" rx="1" fill="#E8590C"/></svg>')
LOCK = ('<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="#E8590C"/>'
        '<path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#E8590C" stroke-width="2.2"/></svg>')

def node(nid, inner, label, x, trigger=False):
    return (f'<div class="nodewrap" id="{nid}" style="left:{x}px"><div class="node{" trigger" if trigger else ""}" id="{nid}-box">{inner}'
            f'<div class="badge ok" id="{nid}-ok">✓</div><div class="badge err" id="{nid}-err">✕</div></div><div class="nlabel">{label}</div></div>')
def line(lid, x, w): return f'<div class="link" id="{lid}" style="left:{x}px;width:{w}px"></div>'


N8N_CSS = """
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
