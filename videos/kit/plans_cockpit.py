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
  S("logbuch", ("mo", 0, -.3), kick="Eingang", title="Eine Anfrage kommt rein", label="Eingang", right="Mo will handeln",
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

# ---------------------------------------------------------------- Drehbuch v5.2 (25.10.2026): alle übrigen Lernvideos im Cockpit
P["U0"] = dict(av_end=None, mo=[
  {"k": "M0_01", "t": "Zuladung rot. Zu viel an Bord.", "after": "Mo, Zuladung"},
], scenes=[
  S("hook", 0, kick="Kurz nachgerechnet", title="Wie viele Stunden gehen jede Woche für *Routine* drauf?", items=[
    {"icon": "mail", "t": "Mails sortieren", "at": "sortieren"},
    {"icon": "doc", "t": "Angebote abtippen", "at": "Angebote abtippen"},
    {"icon": "search", "t": "Zahlen zusammensuchen", "at": "Zahlen zusammensuchen"}]),
  S("stat", "Bei den meisten", kick="Bei den meisten Unternehmern", big="5–10 h", label="pro Woche", sub="= über 2 Monate im Jahr", sub_at="zwei Monate"),
  S("zuladung", ("mo", 0, -.4), kick="Die volle Tasse", title="Du bist nicht zu langsam. Du bist *zu voll.*",
    text="Zu viel an Bord: 5 bis 10 Stunden Routine pro Woche"),
  S("cards", "In gut", kick="In gut 20 Minuten", title="Das nimmst du mit", cards=[
    {"icon": "robot", "t": "KI-Agenten verstehen", "d": "…die genau diese Arbeit übernehmen", "at": "genau diese Arbeit"},
    {"icon": "shield", "t": "Deine Daten, deine Hand", "d": "Ohne Programmieren", "at": "Ohne Programmieren"},
    {"icon": "grad", "t": "Team gefördert schulen", "d": "Du weißt, ob es passt", "at": "gefördert"}]),
  S("check", "Sechs kurze Level", kick="So läuft es", title="Kurz, praktisch, mit Aufgaben", mode="icon", items=[
    {"icon": "target", "t": "6 kurze Level", "at": "Sechs kurze Level"},
    {"icon": "check", "t": "Nach jedem eine kleine Aufgabe", "at": "nach jedem eine"},
    {"icon": "clock", "t": "gut 20 Minuten"}]),
])

P["U1"] = dict(av_end=None, mo=[
  {"k": "M1_01", "t": "Ladung reduziert. Leichter fliegt es sich besser.", "after": "Ballast abwerfen"},
  {"k": "M1_02", "t": "Buchstabe eins leuchtet. Dein Wort dazu findest du.", "after": "gerade ist"},
], scenes=[
  S("title", 0, glyph="pot", kick="Eine kurze Geschichte", title="Der Professor und der *Zen-Meister*"),
  S("check", "Wie diese Tasse", kick="Wie diese Tasse", title="„Bist du voll. Wie soll ich dir etwas zeigen?“", mode="icon", items=[
    {"icon": "pot", "t": "Die Tasse ist voll", "at": "Wie diese Tasse"},
    {"icon": "x", "t": "Noch ein Tool, noch ein Abo, noch ein Kurs", "at": "noch ein Tool"}]),
  S("compare", "Der Weg ist umgekehrt", kick="Der Weg ist umgekehrt", title="Erst *Platz* schaffen", cols=[
    {"t": "Voller", "icon": "x", "rows": [{"t": "Noch ein Tool", "mk": "x"}, {"t": "Noch ein Abo", "mk": "x"}]},
    {"t": "Leerer", "icon": "check", "at": "Erst schauen", "rows": [{"t": "Was läuft jede Woche gleich?", "at": "jede Woche gleich"}, {"t": "Das gehört in eine Automation", "at": "Automation"}]}]),
  S("zuladung", ("mo", 0, -.4), kick="Ballast abwerfen", title="Zuladung", text="Zu viel an Bord", switch_at=("mo", 0, .6), text2="Ballast abgeworfen. Leichter fliegt es sich besser."),
  S("check", "Gleich schiebst du", kick="Deine Aufgabe", title="Drei Regler", mode="num", items=[
    {"icon": "clock", "t": "Deine Stunden mit Routine", "at": "Stunden mit Routine"},
    {"icon": "euro", "t": "Deine Abos", "at": "deine Abos"},
    {"icon": "users", "t": "Dein Team", "at": "dein Team"}]),
  S("leitwort", ("mo", 1, -.4), kick="Level 1 geschafft", title="Dein Leitwort beginnt", word="MOMENTUM", lit=0, reveal=[{"i": 0, "at": ("mo", 1, .5)}]),
])

P["UW"] = dict(av_end=None, mo=[
  {"k": "MW_01", "t": "Zwei Werkzeuge, nicht zwanzig.", "after": "an Bord"},
  {"k": "MW_02", "t": "Der Baumeister. Der baut.", "after": "Mo, Claude Code"},
  {"k": "MW_03", "t": "Der Motor. Da laufen die Abläufe.", "after": "N-Eight-N, Mo"},
  {"k": "MW_04", "t": "Buchstabe zwei leuchtet.", "after": "eigenes CRM"},
], scenes=[
  S("title", 0, kick="An Bord", title="Zwei Werkzeuge, *nicht zwanzig*", logos=[{"i": "claude", "n": "Claude Code", "at": ("mo", 0, .6)}, {"i": "n8n", "n": "n8n", "at": ("mo", 0, 1.6)}]),
  S("hook", "Vor zwei Jahren", kick="Vor zwei Jahren", title="Eine Automation = ein *Programmierer*", items=[
    {"icon": "hourglass", "t": "Wochen Zeit", "at": "Wochen Zeit"},
    {"icon": "euro", "t": "Tausende Euro", "at": "tausende Euro"},
    {"icon": "lock", "t": "Nur er weiß, wie es läuft", "at": "wusste nur er"}]),
  S("compare", "Ein KI-Chat sagt", kick="Chat gegen Agent", title="Berater oder *Mitarbeiter*?", cols=[
    {"t": "KI-Chat", "icon": "chat", "at": "Ein KI-Chat", "rows": [{"t": "Sagt dir, wie man das Lager umräumt", "at": "wie man das Lager"}]},
    {"t": "Claude Code", "icon": "claude", "at": "Claude Code räumt", "rows": [{"t": "Räumt es um", "at": "räumt es"}, {"t": "Sagt Bescheid, wenn es fertig ist", "at": "sagt dir Bescheid"}]}]),
  S("term", "Du beschreibst in normalen", kick="So geht es heute", title="Du beschreibst. Claude Code baut.", lines=[
    {"p": True, "t": "Wenn eine Anfrage reinkommt: sortieren und mir Bescheid geben.", "at": "in normalen Worten"},
    {"c": "m", "t": "Baue Workflow „Anfragen“ in n8n …", "at": "Claude Code baut"},
    {"c": "g", "t": "✓ Workflow erstellt und getestet", "at": "testet sie"},
    {"c": "y", "t": "⚠ Fehler gefunden → repariert", "at": "findet er den Fehler"}]),
  S("compare", "Warum das für dich", kick="Warum das so wichtig ist", title="Nicht mehr *wie*, sondern *was*", cols=[
    {"t": "Das Wie", "icon": "gear", "at": "Die Frage ist nicht mehr", "rows": [{"t": "Programmieren, Code, Technik", "mk": "x"}, {"t": "übernimmt die KI", "at": "übernimmt die KI"}]},
    {"t": "Das Was", "icon": "target", "at": "Die entscheidende Frage", "rows": [{"t": "Welcher Ablauf kostet dich Zeit?", "at": "Welcher Ablauf"}, {"t": "Was soll am Ende rauskommen?", "at": "Was soll am Ende"}]}]),
  S("hub", "läuft alles zusammen", kick="Der Motor", title="Die Zentrale, in der alles zusammenläuft", center="n8n", cx=855, rx=290, ry=150, sats=[
    {"i": "mail", "n": "Mail", "at": "Mail"}, {"i": "calendar", "n": "Kalender", "at": "Kalender"},
    {"i": "users", "n": "CRM", "at": "CRM"}, {"i": "euro", "n": "Buchhaltung", "at": "Buchhaltung"},
    {"i": "table", "n": "Deine Daten", "at": "deine eigenen Daten"}, {"i": "server", "n": "Dein Server", "at": "gemieteten Server"}]),
  S("check", "Was du dafür lernen", kick="Was du lernen musst", title="Keine Programmiersprache. *Zehn Grundregeln.*", mode="icon", items=[
    {"icon": "x", "t": "Keine Programmiersprache", "at": "keine Programmiersprache"},
    {"icon": "bolt", "t": "10 Grundregeln", "at": "zehn Grundregeln"},
    {"icon": "target", "t": "Werkzeuge wechseln, Regeln bleiben", "at": "Werkzeuge wechseln"},
    {"icon": "folder", "t": "Deine Dateien bleiben bei dir", "at": "als Datei bei dir"}]),
  S("cards", "Damit kannst du", kick="Was du danach bauen lässt", title="Praktisch alles", cards=[
    {"icon": "bolt", "t": "Automationen", "d": "für deinen Alltag", "at": "für deinen Alltag"},
    {"icon": "users", "t": "Kundenportal", "d": "für deine Kunden", "at": "Kundenportal"},
    {"icon": "table", "t": "Eigenes CRM", "d": "passend zu deinem Betrieb", "at": "eigenes CRM"}]),
  S("leitwort", ("mo", 3, -.4), kick="Level 2, erster Teil", title="Dein Leitwort wächst", word="MOMENTUM", lit=1, reveal=[{"i": 1, "at": ("mo", 3, .5)}]),
  S("title", "Nicht du musst", glyph="target", kick="Merk dir", title="Lerne, *was* du willst. Das *Wie* baut die KI."),
])

P["U2"] = dict(av_end=None, mo=[
  {"k": "M2_01", "t": "Fünf Rollen, ein Pilot.", "after": "die Mannschaft"},
  {"k": "M2_02", "t": "Du kennst mich. Ich melde, ich frage, du entscheidest.", "after": "Mo, und du", "lead": .2},
  {"k": "M2_03", "t": "Buchstabe drei. Was fällt dir dazu ein?", "after": "wir werktags"},
], scenes=[
  S("hook", 0, kick="Woran es wirklich scheitert", title="Nicht an der Technik. Daran, dass niemand sagt, *wer was macht.*", items=[
    {"icon": "chat", "t": "Chatbot", "at": "Chatbot"}, {"icon": "robot", "t": "Agent", "at": "Agent"}, {"icon": "bolt", "t": "Automation", "at": "Automation"}]),
  S("check", "Warum das wichtig ist", kick="Warum das wichtig ist", title="Wer die Rollen kennt, *entscheidet*", mode="icon", items=[
    {"icon": "target", "t": "Du weißt, was du kaufen musst", "at": "was du kaufen"},
    {"icon": "shield", "t": "Keiner verkauft dir ein Tool, das du nicht brauchst", "at": "verkauft keiner"}]),
  S("mannschaft", ("mo", 0, -.4), kick="Die Mannschaft", title="Fünf Rollen, ein Pilot", seats=[
    {"t": "Baumeister", "sub": "Claude Code", "icon": "gear", "at": "Claude Code ist der Baumeister"},
    {"t": "Recruiterin", "sub": "Athena", "icon": "users", "at": "Athena ist dein"},
    {"t": "Motor", "sub": "n8n", "icon": "bolt", "at": "ist der Motor"},
    {"t": "Steckdose", "sub": "MCP", "icon": "plug", "at": "ist die Steckdose"},
    {"t": "Gedächtnis", "sub": "Firmenwissen", "icon": "book", "at": "Firmen-Gedächtnis"},
    {"t": "Bordcomputer", "sub": "Mo", "icon": "robot", "at": ("mo", 1, .3), "mo": True}]),
  S("check", "Und du bist nicht allein", kick="Und du bist nicht allein", title="Echte Ansprechpartner", mode="icon", items=[
    {"icon": "users", "t": "Menschen, die täglich damit arbeiten", "at": "echte Ansprechpartner"},
    {"icon": "chat", "t": "KI-Assistent im Kurs: rund um die Uhr", "at": "rund um die Uhr"},
    {"icon": "calendar", "t": "Wir: werktags", "at": "wir werktags"}]),
  S("leitwort", ("mo", 2, -.4), kick="Level 2 geschafft", title="Dein Leitwort wächst", word="MOMENTUM", lit=2, reveal=[{"i": 2, "at": ("mo", 2, .5)}]),
  S("title", "Gleich lernst du Athena", glyph="users", kick="Deine Aufgabe", title="Athena kennenlernen, Prompt holen, *Rollen zuordnen*"),
])

P["U3"] = dict(av_end=None, mo=[
  {"k": "M3_01", "t": "Vier Instrumente. Mehr brauchst du am Anfang nicht.", "after": "die Instrumente"},
  {"k": "M3_02", "t": "Buchstabe vier leuchtet. Höhe gehalten.", "after": "diesen Programmen"},
], scenes=[
  S("hook", 0, kick="Nach drei Wochen abgeschaltet", title="Weil niemand gesagt hat, *wann* es startet und *was* rauskommt", items=[
    {"icon": "x", "t": "Kein klarer Start", "at": "wann sie starten"}, {"icon": "x", "t": "Kein klares Ergebnis", "at": "rauskommen soll"}]),
  S("title", "Warum du die Bausteine", glyph="target", kick="Warum du die Bausteine kennen solltest", title="Sagen können, *was* du willst", sub="Vier Bausteine, zwei Minuten, die KI baut.", sub_at="in zwei Minuten"),
  S("check", ("mo", 0, -.4), kick="Die Instrumente", title="Vier Bausteine, wie ein Rezept", mode="icon", items=[
    {"icon": "bell", "t": "Auslöser: neue Mail, Formular, Montag 8 Uhr", "at": "Der Auslöser"},
    {"icon": "gear", "t": "Schritte: lesen, sortieren, vorbereiten, melden", "at": "Die Schritte"},
    {"icon": "key", "t": "Zugangsdaten: legst immer du an", "at": "Die Zugangsdaten"},
    {"icon": "plug", "t": "Leitungen: verbinden alles", "at": "die Leitungen"}]),
  S("cards", "Davon gibt es drei", kick="Drei Leitungen", title="API, Webhook, MCP", cards=[
    {"icon": "globe", "t": "API", "d": "n8n ruft an und fragt nach", "at": "Die A-P-I"},
    {"icon": "bell", "t": "Webhook", "d": "Das Programm klingelt von selbst", "at": "Der Webhook"},
    {"icon": "plug", "t": "MCP", "d": "Die Steckdose für KI", "at": "Und M-C-P"}]),
  S("compare", "Kurz gesagt", kick="Kurz gesagt", title="Programme verbinden, *KI* verbinden", cols=[
    {"t": "API und Webhook", "icon": "globe", "at": "A-P-I und Webhook", "rows": [{"t": "verbinden Programme", "at": "verbinden Programme"}]},
    {"t": "MCP", "icon": "plug", "at": "M-C-P verbindet", "rows": [{"t": "verbindet die KI mit diesen Programmen", "at": "mit diesen Programmen"}]}]),
  S("leitwort", ("mo", 1, -.4), kick="Level 3 geschafft", title="Dein Leitwort wächst", word="MOMENTUM", lit=3, reveal=[{"i": 3, "at": ("mo", 1, .5)}]),
  S("title", "Gut beschrieben", glyph="check", kick="Merk dir", title="Gut beschrieben ist *halb gebaut*."),
])

P["U5"] = dict(av_end=None, mo=[
  {"k": "M5_01", "t": "Ich kann rechnen. Entscheiden kannst du.", "after": "willst du übernehmen"},
  {"k": "M5_02", "t": "Angebot ist fertig. Soll ich es abschicken?", "after": "ein Beispiel"},
  {"k": "M5_03", "t": "Buchstabe sechs. Fast am Ziel.", "after": "Das entscheide ich"},
], scenes=[
  S("hook", 0, kick="Die Frage", title="Kann die KI bald dein Unternehmen *führen*?", sub="Kurze Antwort: nein. Darin liegt deine Chance.", sub_at="Kurze Antwort"),
  S("ampel", ("mo", 0, -.4), kick="Autopilot", title="Autopilot gegen Pilot", label="Autopilot", right="Wer übernimmt", lamps=[
    {"c": "y", "t": "Mo will übernehmen", "at": ("mo", 0, -.2)},
    {"c": "g", "t": "Rechnen: Mo. Entscheiden: du.", "at": ("mo", 0, 1.2)}]),
  S("compare", "Warum das wichtig ist", kick="Die Kunst ist die Grenze", title="Alles abgeben oder *nichts* abgeben?", cols=[
    {"t": "Alles abgeben", "icon": "x", "at": "Wer alles", "rows": [{"t": "verliert, was den Betrieb besonders macht", "at": "besonders macht"}]},
    {"t": "Nichts abgeben", "icon": "x", "at": "Wer nichts", "rows": [{"t": "ertrinkt in Routine", "at": "ertrinkt"}]}]),
  S("compare", "Die KI beantwortet", kick="Was und Wer", title="*Was*-Fragen an die KI, *Wer*-Fragen an dich", cols=[
    {"t": "Was", "icon": "chip", "at": "Was-Fragen", "rows": [{"t": "Was steht in der Mail?", "at": "Was steht"}, {"t": "Was kostet das Material?", "at": "Was kostet"}, {"t": "Was fehlt im Angebot?", "at": "Was fehlt"}]},
    {"t": "Wer", "icon": "user", "at": "Wer-Fragen", "rows": [{"t": "Wem vertraue ich?", "at": "Wem vertraue"}, {"t": "Wen stelle ich ein?", "at": "Wen stelle"}, {"t": "Wofür steht mein Betrieb?", "at": "Wofür steht"}]}]),
  S("ampel", ("mo", 1, -.4), kick="Ein Beispiel", title="Die Grenze im Alltag", label="Autopilot", right="Wer-Frage", lamps=[
    {"c": "g", "t": "Angebot vorbereitet: das macht Mo", "at": ("mo", 1, -.2)},
    {"c": "r", "t": "Abschicken? Das entscheidet der Pilot.", "at": ("mo", 1, 1.3)}]),
  S("leitwort", ("mo", 2, -.4), kick="Level 5 geschafft", title="Dein Leitwort wächst", word="MOMENTUM", lit=5, reveal=[{"i": 5, "at": ("mo", 2, .5)}]),
  S("title", "Gleich kommen schnelle", glyph="target", kick="Deine Aufgabe", title="Übernimmt das die KI, oder bleibt es beim *Menschen*?"),
])

P["U6"] = dict(av_end=None, mo=[
  {"k": "M6_01", "t": "Elf. Drei davon machen fast dasselbe.", "after": "Abos siehst du"},
  {"k": "M6_02", "t": "Was hast du gemacht? Was geprüft? Was ist schwach?", "after": "drei Dinge. Mo"},
  {"k": "M6_03", "t": "Buchstabe sieben. Einer fehlt noch.", "after": "Werkstatt an Claude Code"},
], scenes=[
  S("bars", 0, kick="Zähl mal deine Abos", title="Jedes kann ein bisschen, *keins passt genau*", bars=[
    {"n": "CRM", "v": 60, "at": "CRM"}, {"n": "Kalender", "v": 45, "at": "Kalender"}, {"n": "Formulare", "v": 50, "at": "Formulare"},
    {"n": "Newsletter", "v": 40, "at": "Newsletter"}, {"n": "Buchhaltung", "v": 70, "at": "Buchhaltung"}], foot="Mo zählt: <b>elf</b>, drei fast gleich", foot_at=("mo", 0, .3)),
  S("compare", "Warum sich das jetzt", kick="Warum sich das jetzt ändert", title="Früher Monate, heute ein *Prototyp* am Nachmittag", cols=[
    {"t": "Früher", "icon": "hourglass", "at": "Früher war", "rows": [{"t": "Teuer, dauerte Monate", "at": "dauerte Monate"}]},
    {"t": "Heute", "icon": "claude", "at": "Heute baut", "rows": [{"t": "Prototyp an einem Nachmittag", "at": "Nachmittag"}, {"t": "Dann: Tests, Datenschutz, Freigabe", "at": "Tests, Datenschutz"}]}]),
  S("brief", "Dafür brauchst du nur", kick="Der Prozess-Steckbrief", title="Fünf Felder", fields=[
    {"l": "Auslöser", "v": "Neue Anfrage über das Webformular", "at": "Auslöser"},
    {"l": "Schritte", "v": "Lesen, sortieren, Angebot vorbereiten", "at": "Schritte"},
    {"l": "Programme", "v": "Mail, CRM", "at": "Programme"},
    {"l": "Ergebnis", "v": "Angebot liegt zur Freigabe bereit", "at": "Ergebnis"},
    {"l": "Fehlerfall", "v": "Meldung an dich, nichts geht raus", "at": "schiefgeht"}]),
  S("check", ("mo", 1, -.4), kick="Führen statt Blindflug", title="Drei Fragen vor jeder Freigabe", mode="num", items=[
    {"t": "Was hast du gemacht?", "at": ("mo", 1, .2)}, {"t": "Was hast du geprüft?", "at": ("mo", 1, 1.3)}, {"t": "Was ist daran schwach?", "at": ("mo", 1, 2.3)}]),
  S("leitwort", ("mo", 2, -.4), kick="Level 6, erster Teil", title="Dein Leitwort wächst", word="MOMENTUM", lit=6, reveal=[{"i": 6, "at": ("mo", 2, .5)}]),
])

P["UN"] = dict(av_end=None, mo=[
  {"k": "MN_01", "t": "Steckbrief liegt vor. Der Ablauf wartet in der Werkstatt.", "after": "Mo, Logbuch"},
], scenes=[
  S("hook", 0, kick="Und dann?", title="Dein Steckbrief wird zur *Arbeitsanweisung* für einen neuen Kollegen", sub="Die meisten scheitern nicht an der Idee, sondern an der Umsetzung.", sub_at="an der Umsetzung"),
  S("mannschaft", "Drei Rollen greifen", kick="Drei Rollen", title="Motor, Personalchefin, Fachkraft", seats=[
    {"t": "Motor", "sub": "n8n", "icon": "bolt", "at": "ist der Motor"},
    {"t": "Personalchefin", "sub": "Athena", "icon": "users", "at": "Personalchefin"},
    {"t": "Fachkraft", "sub": "n8n-Agent", "icon": "gear", "at": "ist die Fachkraft"}]),
  S("check", "So läuft es ab", kick="So läuft es ab", title="Vom Steckbrief zum Ablauf", mode="num", items=[
    {"t": "Du gibst ihm deinen Steckbrief", "at": "deinen Steckbrief"},
    {"t": "Er fragt nach, baut, testet, repariert", "at": "fragt nach"},
    {"t": "Du legst Zugangsdaten an, prüfst, gibst frei", "at": "Zugangsdaten an"},
    {"t": "Geht später etwas schief: Meldung und Vorschlag", "at": "schiefgeht"}]),
  S("title", "Einmal eingestellt", glyph="spark", kick="Einmal eingestellt", title="Du sagst, was du willst. Er baut. *Du* entscheidest, was live geht."),
  S("logbuch", ("mo", 0, -.4), kick="Logbuch", title="Flug 1", entries=[], new={"n": "Flug 1", "t": "Steckbrief liegt vor. Der Ablauf wartet in der Werkstatt.", "at": ("mo", 0, .3)}, label="Logbuch", right="Momentum KI Akademie"),
  S("title", "Auf der nächsten Seite", glyph="doc", kick="Deine Aufgabe", title="Dein eigener *Steckbrief*"),
])

P["VEND"] = dict(av_end=None, mo=[
  {"k": "MV_01", "t": "Sechs Level. Mit dir geprüft.", "after": "was hast du gemacht"},
  {"k": "MV_02", "t": "Dein Steckbrief läuft noch nicht. Das kommt in der Werkstatt.", "after": "daran schwach"},
  {"k": "MV_03", "t": "Steht drin. Der Rest passiert draußen, bei dir.", "after": "Mo, Logbuch"},
  {"k": "MV_04", "t": "Buchstabe acht. Mein Wort: Mensch.", "after": "letzte Buchstabe"},
], scenes=[
  S("check", 0, kick="Stark", title="Das hast du jetzt", mode="icon", items=[
    {"icon": "users", "t": "Die Rollen", "at": "die Rollen"}, {"icon": "gear", "t": "Die Bausteine", "at": "die Bausteine"},
    {"icon": "shield", "t": "Die Ampel", "at": "die Ampel"}, {"icon": "doc", "t": "Dein erster Steckbrief", "at": "ersten Steckbrief"}]),
  S("check", ("mo", 0, -1.6), kick="Die Abnahme", title="So nimmt man ab", mode="num", items=[
    {"t": "Was hast du gemacht? Sechs Level, mit dir geprüft.", "at": ("mo", 0, .2)},
    {"t": "Was ist daran schwach? Der Steckbrief läuft noch nicht.", "at": ("mo", 1, .2)},
    {"t": "Ehrlich. Genau so nimmt man ab.", "at": "Ehrlich"}]),
  S("logbuch", ("mo", 2, -.6), kick="Logbuch", title="Flug 1", label="Logbuch", right="Momentum KI Akademie",
    entries=[{"n": "Flug 1", "t": "Steckbrief liegt vor. Der Ablauf wartet in der Werkstatt."}]),
  S("leitwort", ("mo", 3, -.4), kick="Das Leitwort", title="MOMENTUM", word="MOMENTUM", lit=7, reveal=[{"i": 7, "at": ("mo", 3, .4)}],
    words=[{"t": "Mut", "at": ("mo", 3, 2.4)}, "Ordnung", "Mannschaft", "Einmaleins", "Nachfragen", "Trennlinie", "Umsicht", "Mensch"]),
  S("cards", "Jetzt hast du zwei Wege", kick="Zwei Wege", title="Wie es weitergeht", cards=[
    {"icon": "grad", "t": "Dein Team, gefördert", "d": "Förder-Check, dann Gespräch mit Karsten", "at": "Erstens"},
    {"icon": "gear", "t": "Die Werkstatt", "d": "Hier wird gebaut. Zugang nach einem kurzen Gespräch", "at": "Zweitens"}]),
  S("title", "Deine Tasse ist jetzt", glyph="pot", kick="Bis bald", title="Deine Tasse ist leerer. *Du bleibst der Pilot.*"),
])
