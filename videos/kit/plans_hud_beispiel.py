"""Testplan für die drei Cockpit-Anzeigen, auf der Tonspur von U6 (nur zum Prüfen des Looks, Zeiten fest)."""
from kit import S

P = {}
P["U6"] = dict(av_end=None, scenes=[
  S("logbuch", 0, kick="Flug 2", title="Das Logbuch", right="Momentum KI Akademie",
    entries=[{"n": "Flug 0", "t": "Die KI-Leitlinie liegt in deinem Betrieb."},
             {"n": "Flug 1", "t": "Dein erster Ablauf läuft, die Prozesslandkarte liegt im Betrieb."}],
    new={"n": "Flug 2", "t": "Mo kennt deinen Betrieb, die Wissensbasis liegt bereit.", "at": 2.5}),
  S("ampel", 9, kick="Level 4", title="Das Warnsystem", right="Was Mo allein darf", lamps=[
    {"c": "g", "t": "Mo macht es und meldet danach.", "at": 10.0},
    {"c": "y", "t": "Mo bereitet vor, du gibst frei.", "at": 12.0},
    {"c": "r", "t": "Mo hält an und fragt. Du entscheidest.", "at": 14.0}]),
  S("leitwort", 18, kick="Level 3 geschafft", title="Dein Leitwort wächst", word="MOMENTUM", lit=3,
    reveal=[{"i": 3, "at": 19.5}]),
  S("leitwort", 27, kick="Flug 1 beendet", title="Mos Version zum Vergleich", word="MOMENTUM", lit=8,
    words=["Mut", "Ordnung", "Mannschaft", "Einmaleins", "Nachfragen", "Trennlinie", "Umsicht", "Mensch"]),
  S("title", 36, glyph="rocket", kick="Ende Test", title="Anzeigen geprüft"),
])
