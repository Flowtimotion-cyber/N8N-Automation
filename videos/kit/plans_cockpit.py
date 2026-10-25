"""Szenenpläne für Lernvideos im Cockpit-Modus (Flugplan Gesamtstory, 25.10.2026).

Je Video: `mo` = Mos Sätze (Datei-Kürzel in Mo_Audio/Saetze_jessica, Text, Anker-Phrase: Timos letztes Wort vor der Pause),
`scenes` = Szenen wie in plans_unternehmer.py. Mo startet 0,3 s nach Beginn der gemessenen Pause (`lead` ändert das je Satz). Zeiten können zusätzlich relativ zu Mos Sätzen stehen: at=("mo", Index, Versatz).
Timos HeyGen-Text braucht an jeder Mo-Stelle eine Pause: <break time="Xs" /> mit X = Mo-Dauer + 0,5 s."""
from kit import S

P = {}

# Level 4 „Datenschutz-Ampel“, Version 4 (Cockpit, Mo-Dialog). HeyGen-Text siehe leadmagnet/Skripte_Unternehmer_Videos.md.
P["U4"] = dict(av_end=None, mo=[
  {"k": "M4_01", "t": "Neue Anfrage. Angebot, Preisliste, und eine Krankmeldung hängt dran. Ich lade alles in die Cloud.", "after": "was liegt an"},
  {"k": "M4_02", "t": "Ampel an.", "after": "die Ampel", "from": 25},
  {"k": "M4_03", "t": "Rot. Das entscheidest du.", "after": "die Krankmeldung", "lead": .15},
  {"k": "M4_04", "t": "Buchstabe fünf leuchtet. Dein Wort dazu findest du.", "after": "der Buchstabe"},
], scenes=[
  S("hook", 0, kick="Die häufigste Frage", title="„Und meine Kundendaten landen dann in *Amerika*?“",
    sub="Die Frage ist berechtigt.", sub_at="sie ist berechtigt"),
  S("logbuch", ("mo", 0, -.3), kick="Funk", title="Eine Anfrage kommt rein", label="Eingang", right="Mo will handeln",
    entries=[{"n": "Anfrage", "t": "Angebot und Preisliste"}],
    new={"n": "Anhang", "t": "Krankmeldung vom Monteur … in die Cloud?", "at": ("mo", 0, 2.2)}),
  S("title", "Stopp", glyph="warn", kick="Stopp", title="Ein falscher Ablauf kostet mehr, als jede Automation *spart*",
    sub="Darum sortieren wir vor dem Bauen.", sub_at="Deshalb sortieren"),
  S("ampel", ("mo", 1, -.3), kick="Die Datenschutz-Ampel", title="In Sekunden sortiert", label="Ampel", right="Welche Daten wohin", lamps=[
    {"c": "g", "t": "Öffentliches, Texte ohne Namen: darf in die Cloud", "at": "Grün"},
    {"c": "y", "t": "Interne Abläufe, Preise: nur mit Vertrag, ohne Training", "at": "Gelb"},
    {"c": "r", "t": "Personalakten, Gesundheit, Geheimnisse: bleibt im Haus", "at": "Rot"},
    {"c": "r", "t": "Die Krankmeldung? Rot. Mo hält an, du entscheidest.", "at": ("mo", 2, .1)}]),
  S("check", "Richtig", kick="Die Regel", title="Bei Rot hält Mo an", mode="icon", items=[
    {"icon": "warn", "t": "Mo fragt, bevor etwas rausgeht", "at": "hält Mo an"},
    {"icon": "user", "t": "Du entscheidest", "at": "Ich entscheide"},
    {"icon": "shield", "t": "Vor dem Livegang: Datenschutzbeauftragter", "at": "sprich mit deinem"}]),
  S("leitwort", ("mo", 3, -.3), kick="Level 4 geschafft", title="Dein Leitwort wächst", word="MOMENTUM", lit=4,
    reveal=[{"i": 4, "at": ("mo", 3, .6)}]),
  S("title", "Jetzt sortierst du", glyph="check", kick="Deine Aufgabe", title="Sortier die Beispiele in die *Ampel*."),
])
