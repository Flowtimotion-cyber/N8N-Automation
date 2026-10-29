"""Schnelltest: python3 -I tests/test_skill_waechter.py (aus dem Skill-Ordner)."""
import json, subprocess, sys
from pathlib import Path

hier = Path(__file__).resolve().parent
skript = hier.parent / "scripts" / "skill_waechter.py"
p = subprocess.run([sys.executable, "-I", str(skript), "--json", str(hier / "beispiele")], capture_output=True, text=True)
daten = json.loads(p.stdout)
ampel = {Path(e["einheit"]).name: e["ampel"] for e in daten["ergebnisse"]}
assert ampel["test-falle"] == "rot", ampel
assert ampel["harmloser-protokoll-skill"] == "gruen", ampel
assert p.returncode == 2, p.returncode
kategorien = {b["kategorie"] for e in daten["ergebnisse"] for b in e["befunde"]}
for k in ("kombination", "anweisung", "geheim", "netz", "rechte"):
    assert k in kategorien, k
print("OK: Test-Falle rot, harmloser Skill grün")
