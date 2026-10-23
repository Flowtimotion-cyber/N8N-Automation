#!/usr/bin/env python3
"""Erklärseiten in die fertige Klassen-Version docs/modul-1-1/index.html einsetzen.

Die Seite wird nicht komplett neu gebaut (Videos liegen nicht im Repo). Das Skript übernimmt nur
die Felder "erklaer" aus course/data.py in die eingebetteten Kursdaten und baut den Renderer aus
course/erklaer.py ein. Mehrfach ausführbar. Danach course/build_unternehmer.py laufen lassen,
weil der Unternehmer-Kurs auf dieser Seite aufbaut.
"""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import data, erklaer

ZIEL = pathlib.Path(__file__).resolve().parent.parent / "docs/modul-1-1/index.html"
h = ZIEL.read_text()
m = re.search(r"^const DATA = (.*);$", h, flags=re.M)
if not m: raise SystemExit("DATA nicht gefunden")
D = json.loads(m.group(1))
quelle = {L["id"]: L for L in data.LEVELS}
for L in D["levels"]:
    if quelle.get(L["id"], {}).get("erklaer"): L["erklaer"] = quelle[L["id"]]["erklaer"]
    else: L.pop("erklaer", None)
h = h[:m.start(1)] + json.dumps(D, ensure_ascii=False) + h[m.end(1):]
h = erklaer.apply(h)
ZIEL.write_text(h)
print(ZIEL, "Erklärseiten:", [L["id"] for L in D["levels"] if L.get("erklaer")])
