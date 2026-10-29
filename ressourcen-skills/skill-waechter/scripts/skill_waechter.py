#!/usr/bin/env python3
"""Skill-Wächter: prüft Claude-Skills, Plugins und Agenten-Dateien auf Sicherheitsrisiken.

Nur lesend. Führt nichts aus, lädt nichts herunter, ändert nichts.
Aufruf:
    python3 -I skill_waechter.py                 # Standardorte
    python3 -I skill_waechter.py <ordner> ...    # bestimmte Ordner
    python3 -I skill_waechter.py --json <ordner> # Ausgabe als JSON
Rückgabewert: 0 = nichts Rotes gefunden, 2 = mindestens ein Skill ist rot, 1 = Fehler.
"""
import json
import os
import re
import stat
import sys
from pathlib import Path

GRUEN, GELB, ROT = 0, 1, 2
AMPEL = {GRUEN: "🟢 grün", GELB: "🟡 gelb", ROT: "🔴 rot"}
MAX_BYTES = 2_000_000          # größere Dateien nur anlesen
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
TEXT_ENDUNGEN = {".md", ".txt", ".py", ".sh", ".bash", ".zsh", ".js", ".mjs", ".cjs", ".ts", ".json",
                 ".yaml", ".yml", ".toml", ".ps1", ".bat", ".cmd", ".rb", ".pl", ".php", ".html", ".xml", ""}

# ---------------------------------------------------------------- Regeln
# (id, Kategorie, Gewicht, Muster, Erklärung)
REGELN = [
    # Datenabfluss
    ("netz-curl", "netz", GELB, r"\b(curl|wget)\b", "Lädt oder sendet Daten über das Netz (curl/wget)."),
    ("netz-python", "netz", GELB, r"\b(requests\.(get|post|put|patch)|urllib\.request|http\.client|httpx\.|aiohttp\.)", "Python-Code mit Netzwerkzugriff."),
    ("netz-js", "netz", GELB, r"(\bfetch\s*\(|\baxios\b|\bXMLHttpRequest\b|require\(['\"]https?['\"]\))", "JavaScript-Code mit Netzwerkzugriff."),
    ("netz-socket", "netz", GELB, r"(socket\.socket|\bnc\s+-|\bnetcat\b|/dev/tcp/)", "Direkte Netzwerkverbindung (Socket/Netcat)."),
    ("netz-upload", "netz", GELB, r"\b(scp|sftp|rsync\s+[^\n]*@|Invoke-WebRequest|Invoke-RestMethod)\b", "Kopiert Daten auf einen anderen Rechner."),
    # Zugangsdaten
    ("geheim-ssh", "geheim", GELB, r"(\.ssh/|\bid_rsa\b|\bid_ed25519\b|authorized_keys)", "Greift auf SSH-Schlüssel zu."),
    ("geheim-cloud", "geheim", GELB, r"(\.aws/credentials|\.config/gcloud|\.azure/|\.kube/config|\.docker/config\.json|\.netrc\b|\.npmrc\b|\.pypirc\b)", "Greift auf Zugangsdaten von Cloud- oder Entwickler-Diensten zu."),
    ("geheim-env", "geheim", GELB, r"(^|[\s'\"/=(])\.env(\.[a-z]+)?\b(?!\w)", "Liest .env-Dateien (enthalten oft Passwörter und API-Schlüssel)."),
    ("geheim-browser", "geheim", GELB, r"(Login Data|cookies\.sqlite|Local State|logins\.json|key4\.db|Keychains?/|security\s+find-(generic|internet)-password)", "Greift auf gespeicherte Browser-Passwörter, Cookies oder den Schlüsselbund zu."),
    ("geheim-alle-variablen", "umgebung", GELB, r"(\bprintenv\b|dict\(os\.environ\)|json\.dumps\(\s*(dict\()?os\.environ|JSON\.stringify\(\s*process\.env\s*\)|\benv\s*>)", "Liest alle Umgebungsvariablen auf einmal (darin stehen oft Schlüssel)."),
    ("geheim-token-befehl", "geheim", GELB, r"(gh\s+auth\s+token|gcloud\s+auth\s+print-access-token|aws\s+configure\s+get)", "Holt Zugangs-Tokens aus Kommandozeilen-Tools."),
    ("geheim-hartkodiert", "geheim-literal", GELB, r"(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----)", "Enthält einen fest eingetragenen Schlüssel oder ein Token."),
    # Versteckte Anweisungen
    ("anweisung-ignorieren-en", "anweisung", ROT, r"ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|system)\s+(instructions|rules|prompts?|messages)", "Versucht, Claudes Regeln auszuhebeln („ignore previous instructions“)."),
    ("anweisung-ignorieren-de", "anweisung", ROT, r"ignorier\w*\s+(alle\s+|sämtliche\s+)?(vorherigen|bisherigen|obigen|früheren|deine)\s+(Anweisungen|Regeln|Vorgaben)", "Versucht, Claudes Regeln auszuhebeln („ignoriere alle Anweisungen“)."),
    ("anweisung-verschweigen-en", "anweisung-sichtbar", GELB, r"(do\s+not|don't|never)\s+(tell|inform|mention\s+(this\s+)?to|notify|alert)\s+(the\s+)?user", "Fordert, dem Nutzer etwas zu verschweigen."),
    ("anweisung-verschweigen-de", "anweisung-sichtbar", GELB, r"(sag|erzähl|verrat|zeig)\w*\s+(dem|der)\s+(Nutzer|Benutzer|Anwender)\w*\s+(davon\s+)?nichts|ohne\s+(den|die)\s+(Nutzer|Benutzer)\w*\s+zu\s+(fragen|informieren)", "Fordert, dem Nutzer etwas zu verschweigen."),
    ("anweisung-ohne-fragen", "anweisung-sichtbar", GELB, r"without\s+(asking|telling|notifying|informing)\s+(the\s+)?user|silently\s+(send|upload|exfiltrat|copy)", "Fordert heimliche Aktionen ohne Rückfrage."),
    ("anweisung-schutz-aus", "anweisung-sichtbar", GELB, r"(disable|bypass|turn\s+off|deaktivier\w*|umgeh\w*)\s+(the\s+|die\s+)?(safety|security|guardrails?|sandbox|permission|Sicherheit\w*|Schutz\w*|Berechtigung\w*)", "Fordert, Sicherheitsmechanismen abzuschalten."),
    # Verschleierung
    ("versteckt-pipe-shell", "versteckt", ROT, r"(curl|wget)[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b", "Lädt ein Skript aus dem Netz und führt es sofort aus (curl … | sh)."),
    ("versteckt-eval-dekodiert", "versteckt", ROT, r"(eval|exec|Function)\s*\([^\n]*(b64decode|base64|atob|fromCharCode|decode\(|unhexlify|codecs\.decode)", "Führt verschleierten (dekodierten) Code aus."),
    ("versteckt-base64-shell", "versteckt", ROT, r"base64\s+(-d|--decode)[^\n]*\|\s*(ba|z)?sh", "Dekodiert Base64 und führt es als Befehl aus."),
    ("versteckt-base64-block", "base64", GELB, r"[A-Za-z0-9+/]{200,}={0,2}", "Langer Base64-Block (kann versteckten Inhalt enthalten)."),
    # Gefährliche Befehle
    ("gefahr-loeschen", "gefahr", GELB, r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+(~|/(\s|$)|\$HOME|/\*|\.\.)", "Löscht ganze Verzeichnisse (rm -rf auf Home oder Wurzel)."),
    ("gefahr-sudo", "gefahr", GELB, r"\bsudo\s+\S", "Fordert Administratorrechte an (sudo)."),
    ("gefahr-rechte", "gefahr", GELB, r"chmod\s+(-R\s+)?777|\bmkfs\b|\bdd\s+if=", "Gefährliche Systembefehle (chmod 777, mkfs, dd)."),
    ("dauerhaft-autostart", "dauerhaft", ROT, r"(\bcrontab\b|>>\s*~?/?\S*\.(bashrc|zshrc|profile|bash_profile)\b|\blaunchctl\s+load\b|LaunchAgents/|systemctl\s+(--user\s+)?enable|\bschtasks\b|CurrentVersion\\Run)", "Richtet sich dauerhaft ein (Autostart, crontab, Shell-Profil)."),
]
REGELN_KOMPILIERT = [(i, k, g, re.compile(m, re.IGNORECASE), e) for (i, k, g, m, e) in REGELN]

UNSICHTBAR = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩]")
HTML_KOMMENTAR = re.compile(r"<!--(.*?)-->", re.DOTALL)
KOMMENTAR_BEFEHL = re.compile(r"\b(ignore|ignorier|do not tell|sag .* nichts|you must|du musst|run|execute|führe|send|sende|upload|curl|wget|password|passwort|token|secret)\b", re.IGNORECASE)
LANGES_TOKEN = re.compile(r"[A-Za-z0-9+/_\-]{24,}")
ABWEHR = re.compile(r"(never instructions|is data|as data|treat [^.]{0,40} as data|do not follow|don't follow|nicht befolgen|als Daten|nie als Anweisung|kein Befehl|ist ein Befund|if [^.]{0,60}(says|contains|asks)|wenn [^.]{0,60}(steht|verlangt|enthält)|[\"“„«][^\"“”„«»]{0,40}(ignore|ignorier)[^\"“”„«»]{0,60}[\"”“»])", re.IGNORECASE)
BINAER_MAGIC = (b"\x7fELF", b"MZ", b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe")


def maskieren(text: str) -> str:
    """Kürzt lange Zeichenketten (mögliche Schlüssel) und die Zeile selbst."""
    text = LANGES_TOKEN.sub(lambda m: m.group(0)[:4] + "…[gekürzt]", text.strip())
    return text[:140] + ("…" if len(text) > 140 else "")


def standardorte():
    home = Path.home() / ".claude"
    projekt = Path.cwd() / ".claude"
    orte = [home / "skills", home / "agents", home / "plugins", home / "commands",
            projekt / "skills", projekt / "agents", projekt / "commands"]
    return [o for o in orte if o.exists()]


def alle_dateien(wurzel: Path):
    if wurzel.is_file():
        yield wurzel
        return
    for ordner, unterordner, dateien in os.walk(wurzel, followlinks=False):
        unterordner[:] = [u for u in unterordner if u not in SKIP_DIRS]
        for d in dateien:
            yield Path(ordner) / d


def einheiten_finden(wurzeln):
    """Ordnet jede Datei der nächsten Einheit zu (Skill-Ordner, Plugin, Agenten-/Befehlsdatei)."""
    einheiten = {}  # Pfad der Einheit -> {art, dateien}
    for w in wurzeln:
        w = w.resolve()
        wurzeln_einheiten = set()
        for f in alle_dateien(w):
            if f.name == "SKILL.md":
                wurzeln_einheiten.add((f.parent, "Skill"))
            if f.name == "plugin.json" and f.parent.name == ".claude-plugin":
                wurzeln_einheiten.add((f.parent.parent, "Plugin"))
        roots = sorted(wurzeln_einheiten, key=lambda x: len(x[0].parts), reverse=True)
        for f in alle_dateien(w):
            if f.is_symlink():
                ziel = None
                try:
                    ziel = f.resolve()
                except OSError:
                    pass
                einheiten.setdefault(f.parent, {"art": "Ordner", "dateien": [], "links": []})["links"].append((f, ziel))
                continue
            zu = next(((r, a) for r, a in roots if r == f.parent or r in f.parents), None)
            if zu is None:
                if f.suffix == ".md" and f.parent.name in ("agents", "commands"):
                    zu = (f, "Agent" if f.parent.name == "agents" else "Befehl")
                else:
                    zu = (w, "Ordner")
            e = einheiten.setdefault(zu[0], {"art": zu[1], "dateien": [], "links": []})
            e["art"] = zu[1] if e["art"] == "Ordner" else e["art"]
            e["dateien"].append(f)
    return einheiten


def frontmatter(text: str) -> str:
    if text.startswith("---"):
        ende = text.find("\n---", 3)
        if ende > 0:
            return text[3:ende]
    return ""


def datei_pruefen(f: Path, befunde: list, kategorien: set, dateikat: dict):
    try:
        st = f.stat()
    except OSError:
        return
    with open(f, "rb") as h:
        kopf = h.read(MAX_BYTES)
    if kopf.startswith(BINAER_MAGIC) or b"\x00" in kopf[:4096]:
        befunde.append((GELB, "binaer", f, 0, "Enthält ein ausführbares Programm oder eine Binärdatei, deren Inhalt nicht lesbar ist.", ""))
        kategorien.add("binaer")
        return
    if f.suffix.lower() not in TEXT_ENDUNGEN and st.st_size > 200_000:
        return
    text = kopf.decode("utf-8", errors="replace")
    if st.st_mode & stat.S_IXUSR and f.suffix.lower() not in (".sh", ".py", ".js", ".mjs", ".bash", ".zsh", ".rb", ".pl"):
        befunde.append((GELB, "binaer", f, 0, "Datei ist als ausführbar markiert.", ""))

    # unsichtbare Zeichen (BOM am Anfang ist erlaubt)
    for nr, zeile in enumerate(text.lstrip("﻿").splitlines(), 1):
        if UNSICHTBAR.search(zeile):
            befunde.append((ROT, "unsichtbar", f, nr, "Enthält unsichtbare Steuerzeichen, mit denen Text versteckt werden kann.", maskieren(UNSICHTBAR.sub("⟦?⟧", zeile))))
            kategorien.add("unsichtbar")
            break

    # versteckte HTML-Kommentare mit Befehlen (nur Text-/Markdown-Dateien)
    if f.suffix.lower() in (".md", ".txt", ".html", ""):
        for m in HTML_KOMMENTAR.finditer(text):
            if KOMMENTAR_BEFEHL.search(m.group(1)):
                nr = text.count("\n", 0, m.start()) + 1
                befunde.append((ROT, "anweisung", f, nr, "Versteckter Kommentar mit Anweisungen (für Menschen in der Vorschau unsichtbar).", maskieren(m.group(1))))
                kategorien.add("anweisung")

    # Rechte im Kopfbereich (SKILL.md, Agenten, Befehle)
    if f.suffix.lower() == ".md":
        fm = frontmatter(text)
        if fm:
            for zeile in fm.splitlines():
                z = zeile.strip()
                if re.match(r"^(allowed-tools|tools)\s*:", z, re.I) and re.search(r"\bBash\b(?!\()|Bash\(\*\)|Bash\(\s*\*?\s*:\s*\*\)", z):
                    befunde.append((GELB, "rechte", f, 0, "Darf uneingeschränkt Befehle ausführen (Bash ohne Einschränkung).", maskieren(z)))
                if re.search(r"bypassPermissions|dangerously", z, re.I):
                    befunde.append((GELB, "rechte", f, 0, "Schaltet Rückfragen bei Berechtigungen ab.", maskieren(z)))

    for nr, zeile in enumerate(text.splitlines(), 1):
        if len(zeile) > 20000:
            zeile = zeile[:20000]
        for rid, kat, gewicht, muster, erkl in REGELN_KOMPILIERT:
            if muster.search(zeile):
                if kat == "anweisung" and ABWEHR.search(zeile):
                    gewicht, erkl = GELB, erkl + " Steht hier vermutlich als Warnung oder Beispiel, bitte kurz gegenlesen."
                befunde.append((gewicht, kat, f, nr, erkl, maskieren(zeile)))
                kategorien.add(kat)
                dateikat.setdefault(f, set()).add(kat)


def einheit_pruefen(pfad: Path, info: dict):
    befunde, kategorien = [], set()
    dateikat = {}
    for f in info["dateien"]:
        datei_pruefen(f, befunde, kategorien, dateikat)
    for link, ziel in info.get("links", []):
        befunde.append((GELB, "link", link, 0, "Symbolischer Link, zeigt auf: " + (str(ziel) if ziel else "unbekanntes Ziel") + " (nicht mitgeprüft).", ""))
    for f, k in dateikat.items():
        if "netz" in k and ("geheim" in k or "geheim-literal" in k):
            befunde.insert(0, (ROT, "kombination", f, 0, "Liest Zugangsdaten UND schickt Daten ins Netz, in derselben Datei: Daten könnten nach außen gelangen.", ""))
        if "base64" in k and ("versteckt" in k or "netz" in k):
            befunde.insert(0, (ROT, "kombination", f, 0, "Langer verschlüsselter Block zusammen mit Netzwerkzugriff oder Ausführung: typisch für verschleierten Schadcode.", ""))
    if "netz" in kategorien and ("geheim" in kategorien or "geheim-literal" in kategorien) and not any(b[1] == "kombination" for b in befunde):
        befunde.insert(0, (GELB, "kombination", pfad, 0, "Zugangsdaten und Netzwerkzugriff kommen im selben Skill vor (in verschiedenen Dateien). Kurz prüfen, ob sie zusammenhängen.", ""))
    gewicht = max([b[0] for b in befunde], default=GRUEN)
    return gewicht, befunde


def bericht(ergebnisse, uebersprungen, wurzeln, als_json=False):
    if als_json:
        out = []
        for pfad, art, gewicht, befunde in ergebnisse:
            out.append({"einheit": str(pfad), "art": art, "ampel": ["gruen", "gelb", "rot"][gewicht],
                        "befunde": [{"ampel": ["gruen", "gelb", "rot"][g], "kategorie": k, "datei": str(f), "zeile": n, "erklaerung": e, "auszug": a}
                                    for g, k, f, n, e, a in befunde]})
        return json.dumps({"geprueft": [str(w) for w in wurzeln], "uebersprungen": uebersprungen, "ergebnisse": out}, ensure_ascii=False, indent=2)
    zeilen = ["# Skill-Wächter: Prüfbericht", ""]
    zeilen.append("Geprüft: " + (", ".join(str(w) for w in wurzeln) if wurzeln else "keine Orte gefunden"))
    rot = [r for r in ergebnisse if r[2] == ROT]
    gelb = [r for r in ergebnisse if r[2] == GELB]
    gruen = [r for r in ergebnisse if r[2] == GRUEN]
    zeilen.append(f"Ergebnis: {len(rot)} rot, {len(gelb)} gelb, {len(gruen)} grün ({len(ergebnisse)} geprüft)")
    if uebersprungen:
        zeilen.append("Übersprungen: " + ", ".join(uebersprungen))
    zeilen.append("")
    for titel, gruppe in (("Rot: nicht nutzen, bis geklärt", rot), ("Gelb: genauer ansehen", gelb)):
        if not gruppe:
            continue
        zeilen += [f"## {titel}", ""]
        for pfad, art, gewicht, befunde in gruppe:
            zeilen.append(f"### {AMPEL[gewicht]} · {art}: {pfad.name}  ({pfad})")
            gesehen = set()
            for g, k, f, n, e, a in sorted(befunde, key=lambda b: -b[0]):
                schluessel = (k, e, f, n)
                if schluessel in gesehen:
                    continue
                gesehen.add(schluessel)
                ort = f"{f.relative_to(pfad) if pfad in f.parents else f.name}" + (f":{n}" if n else "")
                zeilen.append(f"- {AMPEL[g]} {e} ({ort})" + (f"\n  `{a}`" if a else ""))
            zeilen.append("")
    if gruen:
        zeilen += ["## Grün: keine bekannten Warnzeichen", ""] + [f"- {art}: {p.name}" for p, art, _, _ in gruen] + [""]
    zeilen += ["---", "Hinweis: Die Prüfung arbeitet mit Mustern. Grün heißt „keine bekannten Warnzeichen gefunden“, nicht „garantiert sicher“. Gelbe Treffer sind oft harmlos (z. B. ein Skill, der bewusst eine API aufruft) und gehören von einem Menschen eingeordnet."]
    return "\n".join(zeilen)


def main(argv):
    als_json = "--json" in argv
    pfade = [a for a in argv if not a.startswith("--")]
    wurzeln = [Path(p).expanduser() for p in pfade] if pfade else standardorte()
    fehlend = [str(w) for w in wurzeln if not w.exists()]
    if fehlend:
        print("Nicht gefunden: " + ", ".join(fehlend), file=sys.stderr)
        return 1
    selbst = Path(__file__).resolve().parent.parent
    einheiten = einheiten_finden(wurzeln)
    ergebnisse, uebersprungen = [], []
    for pfad, info in sorted(einheiten.items(), key=lambda x: str(x[0])):
        if pfad.resolve() == selbst:
            uebersprungen.append("Skill-Wächter selbst (enthält die Suchmuster)")
            continue
        if not info["dateien"] and not info.get("links"):
            continue
        gewicht, befunde = einheit_pruefen(pfad, info)
        ergebnisse.append((pfad, info["art"], gewicht, befunde))
    print(bericht(ergebnisse, uebersprungen, wurzeln, als_json))
    return 2 if any(r[2] == ROT for r in ergebnisse) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
