#!/usr/bin/env python3
"""Skills für das Team-Portal: liest .claude/skills/*/SKILL.md und schreibt docs/team/skills.json.

Aufruf nach jeder Änderung an einem Skill:  python3 agenten/skills_json.py
Optionale Felder im Kopf (YAML-Frontmatter) eines Skills: bereich, verantwortlich.
"""
import json, pathlib, re, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUELLE = ROOT / ".claude/skills"
ZIEL = ROOT / "docs/team/skills.json"


def kopf(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, flags=re.S)
    if not m: return {}, text
    felder = {}
    for zeile in m.group(1).splitlines():
        if ":" in zeile:
            k, v = zeile.split(":", 1)
            felder[k.strip()] = v.strip().strip('"').strip("'")
    return felder, m.group(2)


skills = []
for datei in sorted(QUELLE.glob("*/SKILL.md")):
    text = datei.read_text(encoding="utf-8")
    f, rumpf = kopf(text)
    schritte = [re.sub(r"^#+\s*(\d+\.\s*)?", "", z).strip() for z in rumpf.splitlines() if re.match(r"^##\s+\S", z)]
    geaendert = datetime.datetime.fromtimestamp(datei.stat().st_mtime).strftime("%Y-%m-%d")
    skills.append({
        "name": f.get("name") or datei.parent.name,
        "beschreibung": f.get("description", ""),
        "bereich": f.get("bereich", "Akademie"),
        "verantwortlich": f.get("verantwortlich", "Timo"),
        "pfad": str(datei.relative_to(ROOT)),
        "schritte": schritte,
        "inhalt": text,
        "stand": geaendert,
    })

ZIEL.write_text(json.dumps({"skills": skills}, ensure_ascii=False, indent=1), encoding="utf-8")
print(ZIEL, len(skills), "Skill(s):", ", ".join(s["name"] for s in skills))
