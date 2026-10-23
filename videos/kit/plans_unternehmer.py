"""Szenenpläne für das Unternehmer-Modul 1 „Die volle Tasse“ (Videos U0, UW, U1–U6, VEND).
Anker-Phrasen müssen im Scribe-Transkript (videos/heygen_u/words.json) vorkommen."""
from kit import S

P = {}

P["U0"] = dict(av_end="Bei den meisten", scenes=[
  S("hook", 0, kick="Kurz nachgerechnet", title="Wie viele Stunden gehen jede Woche für *Routine* drauf?", items=[
    {"icon": "mail", "t": "Mails sortieren", "at": "Mails sortieren"},
    {"icon": "doc", "t": "Angebote abtippen", "at": "Angebote abtippen"},
    {"icon": "search", "t": "Zahlen zusammensuchen", "at": "Zahlen zusammensuchen"}]),
  S("stat", "Bei den meisten", kick="Bei den meisten Unternehmern", big="5–10 h", label="pro Woche",
    sub="= über 2 Monate im Jahr", sub_at="zwei Monate"),
  S("title", "Das liegt nicht daran", glyph="pot", kick="Die volle Tasse", title="Du bist nicht zu langsam. Du bist *zu voll.*"),
  S("cards", "In den nächsten zwanzig", kick="In 20 Minuten", title="Das nimmst du mit", cards=[
    {"icon": "robot", "t": "KI-Agenten verstehen", "d": "…die genau diese Arbeit übernehmen", "at": "KI-Agenten genau"},
    {"icon": "shield", "t": "Deine Daten, deine Hand", "d": "Ohne Programmieren", "at": "Ohne Programmieren"},
    {"icon": "grad", "t": "Team gefördert schulen", "d": "Du weißt, ob es passt", "at": "gefördert"}]),
  S("check", "Sechs kurze Level", kick="So läuft es", title="Kurz, praktisch, mit Aufgaben", mode="icon", items=[
    {"icon": "target", "t": "6 kurze Level", "at": "Sechs kurze Level"},
    {"icon": "check", "t": "Nach jedem eine kleine Aufgabe", "at": "nach jedem eine"},
    {"icon": "clock", "t": "ca. 20 Minuten"}]),
  S("title", "Aber vorher", kick="Gleich im nächsten Video", title="Warum wir mit *Claude Code* und *n8n* starten",
    logos=[{"i": "claude", "n": "Claude Code"}, {"i": "n8n", "n": "n8n"}]),
])

P["UW"] = dict(av_end="Das hat sich geändert", scenes=[
  S("hook", 0, kick="Vor zwei Jahren", title="Eine Automation = ein *Programmierer*", items=[
    {"icon": "hourglass", "t": "Wochen Zeit", "at": "Wochen Zeit"},
    {"icon": "euro", "t": "Tausende Euro", "at": "tausende Euro"},
    {"icon": "lock", "t": "Nur er weiß, wie es läuft", "at": "wusste nur er"}]),
  S("title", "Das hat sich geändert", glyph="spark", kick="Heute", title="Das hat sich *komplett* geändert."),
  S("term", "Heute beschreibst du", kick="So geht es heute", title="Du beschreibst. Claude Code baut.", lines=[
    {"p": True, "t": "Wenn eine Anfrage reinkommt: sortieren und mir Bescheid geben.", "at": "in ganz normalen Worten"},
    {"c": "m", "t": "Baue Workflow „Anfragen“ in n8n …", "at": "Claude Code baut"},
    {"c": "g", "t": "✓ Workflow erstellt und getestet", "at": "testet sie"},
    {"c": "y", "t": "⚠ Fehler gefunden → repariert", "at": "findet er den Fehler"},
    {"c": "g", "t": "✓ Überwachung aktiv: meldet sich, wenn etwas hakt", "at": "überwachen"}]),
  S("compare", "Warum das für dich", kick="Warum das so wichtig ist", title="Nicht mehr *wie*, sondern *was*", cols=[
    {"t": "Das Wie", "icon": "gear", "at": "Die Frage ist nicht mehr", "rows": [
      {"t": "Programmieren, Code, Technik", "mk": "x"}, {"t": "übernimmt die KI", "at": "übernimmt die KI"}]},
    {"t": "Das Was", "icon": "target", "at": "Die entscheidende Frage", "rows": [
      {"t": "Welcher Ablauf kostet dich Zeit?", "at": "Welcher Ablauf"},
      {"t": "Was soll am Ende rauskommen?", "at": "Was soll am Ende"},
      {"t": "Wer das sagen kann, lässt bauen", "at": "Wer das klar sagen"}]}]),
  S("hub", "Und warum N8N", kick="Warum n8n?", title="Die Zentrale, in der alles zusammenläuft", center="n8n", sats=[
    {"i": "mail", "n": "Mail", "at": "Mail"}, {"i": "calendar", "n": "Kalender", "at": "Kalender"},
    {"i": "users", "n": "CRM", "at": "CRM"}, {"i": "euro", "n": "Buchhaltung", "at": "Buchhaltung"},
    {"i": "table", "n": "Deine Daten", "at": "deine eigenen Daten"}, {"i": "server", "n": "Dein Server", "at": "gemieteten Server"}]),
  S("check", "Was du dafür lernen", kick="Was du lernen musst", title="Komprimiert auf das Wesentliche", mode="icon", items=[
    {"icon": "book", "t": "Die Grundlagen", "at": "Die Grundlagen"},
    {"icon": "bolt", "t": "Ein paar Prinzipien", "at": "Prinzipien"},
    {"icon": "shield", "t": "Die Sicherheitsthemen", "at": "Sicherheitsthemen"}]),
  S("cards", "Und damit kannst du", kick="Was du danach bauen lässt", title="Praktisch alles", cards=[
    {"icon": "bolt", "t": "Automationen", "d": "für deinen Alltag", "at": "Automationen für deinen"},
    {"icon": "users", "t": "Kundenportal", "d": "für deine Kunden", "at": "Kundenportal"},
    {"icon": "rocket", "t": "Eigene Software", "d": "sogar zum Verkaufen", "at": "Softwarelösung"},
    {"icon": "table", "t": "Eigenes CRM", "d": "passend zu deinem Betrieb", "at": "eigenes CRM"}]),
  S("title", "Nicht du musst", glyph="target", kick="Merk dir", title="Lerne, *was* du willst. Das *Wie* baut die KI."),
])

P["U1"] = dict(av_end="Warum erzähle ich", scenes=[
  S("hook", 0, kick="Eine alte Geschichte", title="Der Professor und die *volle Tasse*",
    sub="…und der Tee läuft über den Tisch.", sub_at="Der Tee läuft"),
  S("cards", "Warum erzähle ich", kick="So gehen viele Betriebe KI an", title="Die Tasse wird *voller*, nicht leerer", cards=[
    {"icon": "monitor", "t": "Noch ein Tool", "at": "Noch ein Tool"},
    {"icon": "euro", "t": "Noch ein Abo", "at": "noch ein Abo"},
    {"icon": "grad", "t": "Noch ein Kurs", "at": "noch ein Kurs"}]),
  S("title", "Der Weg ist umgekehrt", glyph="pot", kick="Der Weg ist umgekehrt",
    title="Was jede Woche gleich abläuft, gehört in eine *Automation*",
    sub="Erst wenn Platz ist, hat Neues eine Chance.", sub_at="Erst wenn Platz"),
  S("check", "Gleich schiebst du", kick="Deine Aufgabe", title="Wie voll ist deine Tasse?", mode="icon", items=[
    {"icon": "clock", "t": "Deine Stunden mit Routine", "at": "Stunden mit Routine"},
    {"icon": "euro", "t": "Deine Abos", "at": "deine Abos"},
    {"icon": "users", "t": "Dein Team", "at": "dein Team"}]),
])

P["U2"] = dict(av_end="Warum das wichtig", scenes=[
  S("hook", 0, kick="Chatbot, Agent, Automation …", title="Klingt alles *gleich*?", items=[
    {"icon": "chat", "t": "Chatbot", "at": "Chatbot"}, {"icon": "robot", "t": "Agent", "at": "Agent"},
    {"icon": "bolt", "t": "Automation", "at": "Automation"}]),
  S("title", "Warum das wichtig", glyph="target", kick="Warum das wichtig ist",
    title="Du weißt, was du *kaufen* musst und was nicht.", sub="Kein Tool mehr, das du nicht brauchst.", sub_at="verkauft keiner"),
  S("cards", "Fünf Rollen", kick="Fünf Rollen wie in einem Team", title="Wer macht was?", cards=[
    {"icon": "claude", "t": "Claude Code", "d": "Der Baumeister: baut, testet, repariert", "at": "Claude Code ist der Baumeister"},
    {"icon": "users", "t": "Athena", "d": "Dein erster KI-Agent: stellt alle weiteren ein", "at": "Athena ist dein erster"}]),
  S("term", "Mit ihr stellst du", kick="Athena, die KI-Recruiterin", title="Sie fragt, du antwortest, sie stellt *ein*", ttl="athena", lines=[
    {"c": "m", "t": "Welche Aufgabe soll dein neuer KI-Mitarbeiter übernehmen?", "at": "Sie fragt dich"},
    {"p": True, "t": "Anfragen sortieren und Antworten vorbereiten.", "at": "welche Aufgabe"},
    {"c": "g", "t": "✓ Stellenbeschreibung: Aufgaben, Regeln, Grenzen", "at": "Stellenbeschreibung"},
    {"c": "y", "t": "→ Ihren Prompt bekommst du gleich zum Kopieren", "at": "zum Kopieren"}]),
  S("cards", "ist der Motor", kick="Fünf Rollen wie in einem Team", title="…dazu Motor, Steckdose und Gedächtnis", cards=[
    {"icon": "n8n", "t": "n8n", "d": "Der Motor: Abläufe Tag und Nacht", "at": "ist der Motor"},
    {"icon": "plug", "t": "MCP", "d": "Die Steckdose: nur, was du freigibst", "at": "MCP ist die"},
    {"icon": "book", "t": "Firmen-Gedächtnis", "d": "Erinnert sich an alles, was dein Betrieb weiß", "at": "Firmengedächtnis"}]),
  S("title", "Ein Racksystem", kick="Dein Firmen-Gedächtnis", title="RAG-System auf deinem eigenen oder gemieteten *Server*", logos=[
    {"i": "supabase", "n": "Supabase", "at": "Superbase"}, {"i": "obsidian", "n": "Obsidian", "at": "Obsidian"},
    {"i": "server", "n": "Dein Server", "at": "gemieteten Server"}]),
  S("title", "Und du bist nicht allein", glyph="users", kick="Und du bist nicht allein",
    title="Echte Ansprechpartner, *rund um die Uhr*", sub="…wenn der KI-Agent nicht schon weiterhilft.", sub_at="wenn der KI-Agent"),
  S("title", "Gleich lernst du", glyph="arrow", kick="Gleich im Kurs", title="Athenas Prompt holen, dann jede Aussage zur richtigen *Rolle* ziehen."),
])

P["U3"] = dict(av_end="Warum du die Bausteine", scenes=[
  S("hook", 0, kick="Nach drei Wochen abgeschaltet", title="Warum so viele Automationen *scheitern*", items=[
    {"icon": "warn", "t": "Unklar, wann sie startet", "at": "wann sie starten"},
    {"icon": "target", "t": "Unklar, was rauskommt", "at": "was am Ende"}]),
  S("title", "Warum du die Bausteine", glyph="chat", kick="Warum das wichtig ist",
    title="Nicht programmieren. *Sagen*, was du willst.", sub="Vier Bausteine: jeder Ablauf in 2 Minuten beschrieben", sub_at="Wer die vier"),
  S("flow", "Stell dir ein Rezept", kick="Wie ein Rezept", title="Die vier Bausteine", wtitle="Neue Anfrage", nodes=[
    {"i": "mail", "l": "Auslöser", "at": "Der Auslöser"}, {"i": "doc", "l": "Lesen", "at": "lesen"},
    {"i": "table", "l": "Sortieren", "at": "sortieren"}, {"i": "euro", "l": "Angebot", "at": "ein Angebot"},
    {"i": "bell", "l": "Bescheid", "at": "Bescheid geben"}],
    run=["Und die Leitungen"], below=[
      {"i": "key", "t": "Zugangsdaten legst du selbst an", "at": "Die Zugangsdaten"},
      {"i": "arrow", "t": "Leitungen verbinden alles", "at": "Und die Leitungen"}]),
  S("cards", "Davon gibt es drei", kick="Die drei Leitungen", title="Nachfragen, Bescheid sagen, Steckdose für *KI*", cards=[
    {"icon": "chat", "t": "API", "d": "n8n fragt nach, z. B. jeden Morgen die offenen Rechnungen", "at": "Die API"},
    {"icon": "bell", "t": "Webhook", "d": "Das Programm klingelt von selbst, z. B. bei jeder Bestellung", "at": "Der Webhook"},
    {"icon": "plug", "t": "MCP", "d": "Ein KI-Agent bedient nur die Abläufe, die du freigibst", "at": "Und MCP"}]),
  S("hub", "Kurz gesagt", kick="Kurz gesagt", title="API und Webhook verbinden Programme. MCP verbindet die *KI*.", center="n8n", sats=[
    {"i": "mail", "n": "Programme", "at": "verbinden Programme"}, {"i": "robot", "n": "KI-Agent", "at": "verbindet die"}]),
  S("title", "Gut beschrieben", glyph="doc", kick="Merk dir", title="Gut beschrieben ist *halb gebaut*."),
])

P["U4"] = dict(av_end="Warum das zuerst", scenes=[
  S("hook", 0, kick="Die häufigste Frage", title="„Und meine Kundendaten landen dann in *Amerika*?“",
    sub="Die Frage ist berechtigt.", sub_at="sie ist berechtigt"),
  S("title", "Warum das zuerst kommt", glyph="warn", kick="Warum das zuerst kommt",
    title="Ein falscher Ablauf kostet mehr, als jede Automation *spart*", sub="Darum sortieren wir vor dem Bauen.", sub_at="Deshalb sortieren"),
  S("cards", "Die Ampel hilft", kick="Die Datenschutz-Ampel", title="In Sekunden sortiert", cards=[
    {"icon": "globe", "t": "Grün", "d": "Öffentliches, Texte ohne Namen: darf in die Cloud", "at": "Grün", "cls": "ok"},
    {"icon": "lock", "t": "Gelb", "d": "Interne Abläufe, Preise: nur mit Vertrag und ohne Training", "at": "Gelb"},
    {"icon": "shield", "t": "Rot", "d": "Personalakten, Gesundheit, Geheimnisse: bleibt im Haus", "at": "Rot"}]),
  S("house", "Die bleiben im Haus", kick="Rot bleibt im Haus", title="Lokale KI auf deinem eigenen Server", label="Dein Server",
    inner=[{"i": "chip", "n": "Lokale KI"}, {"i": "table", "n": "Deine Daten"}],
    foot="Vor dem Livegang: <b>Datenschutzbeauftragten</b> einbinden", foot_at="sprich mit deinem"),
  S("title", "Jetzt sortierst du", glyph="check", kick="Deine Aufgabe", title="Sortier die Beispiele in die *Ampel*."),
])

P["U5"] = dict(av_end="Warum das wichtig", scenes=[
  S("hook", 0, kick="Kurze Frage", title="Kann die KI bald dein Unternehmen *führen*?",
    sub="Nein. Und genau darin liegt deine Chance.", sub_at="Kurze Antwort"),
  S("compare", "Warum das wichtig", kick="Die Kunst ist die Grenze", title="Was gibst du ab?", cols=[
    {"t": "Alles abgeben", "icon": "x", "mk": "x", "at": "Wer alles", "rows": [{"t": "Verliert, was den Betrieb besonders macht"}]},
    {"t": "Nichts abgeben", "icon": "hourglass", "mk": "x", "at": "Wer nichts", "rows": [{"t": "Ertrinkt in Routine"}]}]),
  S("compare", "Die KI beantwortet", kick="Die Grenze", title="Was-Fragen und Wer-Fragen", vs="|", cols=[
    {"t": "Was-Fragen: die KI", "icon": "robot", "at": "Die KI beantwortet", "rows": [
      {"t": "Was steht in der Mail?", "at": "Was steht"}, {"t": "Was kostet das Material?", "at": "Was kostet"},
      {"t": "Was fehlt im Angebot?", "at": "Was fehlt"}]},
    {"t": "Wer-Fragen: du", "icon": "user", "at": "Du beantwortest", "rows": [
      {"t": "Wem vertraue ich?", "at": "Wem vertraue"}, {"t": "Wen stelle ich ein?", "at": "Wen stelle"},
      {"t": "Wofür steht mein Betrieb?", "at": "Wofür steht"}]}]),
  S("title", "Verantwortung braucht", glyph="user", kick="Merk dir", title="Verantwortung braucht ein *Gesicht*.",
    sub="Gleich: Was-Frage oder Wer-Frage?", sub_at="Gleich kommen"),
])

P["U6"] = dict(av_end="Bei vielen Betrieben", scenes=[
  S("hook", 0, kick="Zähl mal mit", title="Wie viele *Software-Abos* hast du?", items=[
    {"icon": "users", "t": "CRM", "at": "CRM"}, {"icon": "calendar", "t": "Kalender", "at": "Kalender"},
    {"icon": "form", "t": "Formulare", "at": "Formulare"}, {"icon": "mail", "t": "Newsletter", "at": "Newsletter"},
    {"icon": "euro", "t": "Buchhaltung", "at": "Buchhaltung"}]),
  S("stat", "Bei vielen Betrieben", kick="Bei vielen Betrieben", num=10, unit="+", label="Abos",
    sub="Jedes kann ein bisschen, keins passt genau.", sub_at="Jedes kann"),
  S("compare", "Warum sich das", kick="Warum sich das jetzt ändert", title="Eigene Werkzeuge statt Abos", cols=[
    {"t": "Früher", "icon": "hourglass", "mk": "x", "at": "Früher", "rows": [{"t": "Eigenes Werkzeug: teuer, Monate Arbeit"}]},
    {"t": "Heute", "icon": "claude", "at": "Heute baut", "rows": [
      {"t": "Claude Code baut es an einem Nachmittag", "at": "an einem Nachmittag"},
      {"t": "Ersetzt oft zwei oder drei Abos", "at": "Oft ersetzt"}]}]),
  S("brief", "Dafür brauchst du", kick="Der Bauplan", title="Der Prozess-Steckbrief", fields=[
    {"l": "Auslöser", "v": "Neue Anfrage über die Webseite", "at": "Auslöser"},
    {"l": "Schritte", "v": "Lesen → sortieren → Angebot vorbereiten", "at": "Schritte"},
    {"l": "Programme", "v": "Postfach, CRM, Kalender", "at": "Programme"},
    {"l": "Ergebnis", "v": "Angebot liegt als Entwurf bereit", "at": "Ergebnis"},
    {"l": "Fehlerfall", "v": "Nachricht an mich, wenn etwas hakt", "at": "schiefgeht"}]),
  S("title", "Erst schauen", glyph="search", kick="Deine Aufgabe", title="Erst schauen, *dann bauen*.",
    sub="3 Fehler finden, dann deinen eigenen Steckbrief schreiben", sub_at="Gleich findest"),
])

P["VEND"] = dict(av_end="Jetzt hast du zwei", scenes=[
  S("hook", 0, kick="Geschafft", title="Rollen, Bausteine, Ampel *und dein Steckbrief*",
    sub="Damit bist du weiter als die meisten Betriebe.", sub_at="Damit bist du"),
  S("cards", "Jetzt hast du zwei", kick="Deine zwei Wege", title="Wie es weitergeht", cards=[
    {"icon": "grad", "t": "Team schulen, gefördert", "d": "bis zu 100 % plus Zuschuss zum Gehalt", "at": "Erstens"},
    {"icon": "rocket", "t": "Modul 2: Umsetzung", "d": "Zugang nach kurzem Gespräch", "at": "Zweitens"}],
    foot="Förder-Check: <b>2 Minuten</b>, dann Gespräch mit Karsten", foot_at="Mach den"),
  S("title", "Deine Tasse ist", glyph="pot", kick="Bis gleich", title="Deine Tasse ist jetzt ein bisschen *leerer*."),
])

P["UN"] = dict(av_end="Warum das wichtig ist", scenes=[
  S("hook", 0, kick="Dein Steckbrief ist fertig", title="Und dann? *Schublade?*", items=[
    {"icon": "doc", "t": "Steckbrief", "at": "deinem Steckbrief"},
    {"icon": "folder", "t": "Schublade?", "at": "Schublade"},
    {"icon": "user", "t": "Arbeitsanweisung für einen neuen Kollegen", "at": "Arbeitsanweisung"}]),
  S("title", "Warum das wichtig ist", glyph="target", kick="Warum das wichtig ist",
    title="Es fehlt nicht die Idee. Es fehlt jemand, *der baut*.", sub="Genau diese Lücke schließen wir.", sub_at="diese Lücke"),
  S("title", "Drei Rollen", glyph="users", kick="Drei Rollen greifen ineinander", title="*Motor*, *Personalchefin*, *Fachkraft*"),
  S("hub", "ist der Motor", kick="n8n ist der Motor", title="Die Zentrale für deine Abläufe", center="n8n", sats=[
    {"i": "mail", "n": "Hunderte Programme", "at": "Hunderte Programme"},
    {"i": "server", "n": "Euer eigener Server", "at": "eigenen Server"},
    {"i": "plug", "n": "MCP für KI-Agenten", "at": "direkt darin bauen"}]),
  S("cards", "Athena ist die Personalchefin", kick="Wer einstellt, wer baut", title="Personalchefin und Fachkraft", cards=[
    {"icon": "users", "t": "Athena", "d": "Die Personalchefin: stellt den Spezialisten ein, mit Regeln und Grenzen", "at": "Personalchefin"},
    {"icon": "robot", "t": "Dein n8n-Agent", "d": "Die Fachkraft: arbeitet in Claude Code", "at": "Fachkraft"},
    {"icon": "plug", "t": "Über MCP", "d": "baut er direkt in deinem n8n", "at": "baut über"}]),
  S("term", "So läuft es ab", kick="So baut dein n8n-Agent", title="Vom Steckbrief zum Ablauf", lines=[
    {"p": True, "t": "Hier ist mein Steckbrief „Anfrage beantworten“.", "at": "deinen Steckbrief"},
    {"c": "y", "t": "? Welches Postfach soll ich nutzen?", "at": "fragt nach"},
    {"c": "m", "t": "Baue den Ablauf in n8n über MCP …", "at": "baut den Ablauf"},
    {"c": "g", "t": "✓ Test mit Testdaten: alle Schritte grün", "at": "testet ihn"},
    {"c": "y", "t": "⚠ Schritt 3 rot → repariert", "at": "repariert"}]),
  S("check", "Dann kommst du", kick="Dann kommst du", title="Was immer bei dir bleibt", mode="icon", items=[
    {"icon": "key", "t": "Zugangsdaten anlegen", "at": "Zugangsdaten"},
    {"icon": "search", "t": "Ergebnis prüfen", "at": "prüfst das Ergebnis"},
    {"icon": "check", "t": "Freigeben", "at": "gibst frei"}]),
  S("title", "Einmal eingestellt", glyph="spark", kick="Merk dir",
    title="Du sagst *was*. Er *baut*. Du entscheidest, was *live* geht."),
])


# ---------------------------------------------------------------- Version 3 (23.10.2026): UW, U2, U6 neu gerendert
P["UW"] = dict(av_end="Das hat sich geändert", scenes=[
  S("hook", 0, kick="Vor zwei Jahren", title="Eine Automation = ein *Programmierer*", items=[
    {"icon": "hourglass", "t": "Wochen Zeit", "at": "Wochen Zeit"},
    {"icon": "euro", "t": "Tausende Euro", "at": "tausende Euro"},
    {"icon": "lock", "t": "Nur er weiß, wie es läuft", "at": "wusste nur er"}]),
  S("title", "Das hat sich geändert", glyph="spark", kick="Heute", title="Das hat sich *komplett* geändert."),
  S("compare", "Ein KI-Chat sagt", kick="Chat gegen Agent", title="Berater oder *Mitarbeiter*?", cols=[
    {"t": "KI-Chat", "icon": "chat", "at": "Ein KI-Chat", "rows": [{"t": "Sagt dir, wie man das Lager umräumt", "at": "wie man das Lager"}]},
    {"t": "Claude Code", "icon": "claude", "at": "Claude Code räumt", "rows": [
      {"t": "Räumt es um", "at": "räumt es"}, {"t": "Sagt Bescheid, wenn es fertig ist", "at": "sagt dir Bescheid"}]}]),
  S("term", "Du beschreibst in normalen", kick="So geht es heute", title="Du beschreibst. Claude Code baut.", lines=[
    {"p": True, "t": "Wenn eine Anfrage reinkommt: sortieren und mir Bescheid geben.", "at": "in normalen Worten"},
    {"c": "m", "t": "Baue Workflow „Anfragen“ in n8n …", "at": "Claude Code baut"},
    {"c": "g", "t": "✓ Workflow erstellt und getestet", "at": "testet sie"},
    {"c": "y", "t": "⚠ Fehler gefunden → repariert", "at": "findet er den Fehler"}]),
  S("compare", "Warum das für dich", kick="Warum das so wichtig ist", title="Nicht mehr *wie*, sondern *was*", cols=[
    {"t": "Das Wie", "icon": "gear", "at": "Die Frage ist nicht mehr", "rows": [
      {"t": "Programmieren, Code, Technik", "mk": "x"}, {"t": "übernimmt die KI", "at": "übernimmt die KI"}]},
    {"t": "Das Was", "icon": "target", "at": "Die entscheidende Frage", "rows": [
      {"t": "Welcher Ablauf kostet dich Zeit?", "at": "Welcher Ablauf"},
      {"t": "Was soll am Ende rauskommen?", "at": "Was soll am Ende"}]}]),
  S("hub", "Und warum n8n", kick="Warum n8n?", title="Die Zentrale, in der alles zusammenläuft", center="n8n", sats=[
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
  S("title", "Nicht du musst", glyph="target", kick="Merk dir", title="Lerne, *was* du willst. Das *Wie* baut die KI."),
])

P["U2"] = dict(av_end="Warum das wichtig", scenes=[
  S("hook", 0, kick="Chatbot, Agent, Automation …", title="Klingt alles *gleich*?", items=[
    {"icon": "chat", "t": "Chatbot", "at": "Chatbot"}, {"icon": "robot", "t": "Agent", "at": "Agent"},
    {"icon": "bolt", "t": "Automation", "at": "Automation"}]),
  S("title", "Warum das wichtig", glyph="target", kick="Warum das wichtig ist",
    title="Du weißt, was du *kaufen* musst und was nicht.", sub="Kein Tool mehr, das du nicht brauchst.", sub_at="verkauft keiner"),
  S("cards", "Fünf Rollen", kick="Fünf Rollen wie in einem Team", title="Wer macht was?", cards=[
    {"icon": "claude", "t": "Claude Code", "d": "Der Baumeister: baut, testet, repariert", "at": "Claude Code ist der Baumeister"},
    {"icon": "users", "t": "Athena", "d": "Dein erster KI-Agent: stellt alle weiteren ein", "at": "Athena ist dein erster"}]),
  S("term", "Mit ihr stellst du", kick="Athena, die KI-Recruiterin", title="Sie fragt, du antwortest, sie stellt *ein*", ttl="athena", lines=[
    {"c": "m", "t": "Welche Aufgabe soll dein neuer KI-Mitarbeiter übernehmen?", "at": "Sie fragt dich"},
    {"p": True, "t": "Anfragen sortieren und Antworten vorbereiten.", "at": "welche Aufgabe"},
    {"c": "g", "t": "✓ Stellenbeschreibung: Aufgaben, Regeln, Grenzen", "at": "Stellenbeschreibung"},
    {"c": "y", "t": "→ Ihren Prompt bekommst du gleich zum Kopieren", "at": "zum Kopieren"}]),
  S("cards", "ist der Motor", kick="Fünf Rollen wie in einem Team", title="…dazu Motor, Steckdose und Gedächtnis", cards=[
    {"icon": "n8n", "t": "n8n", "d": "Der Motor: Abläufe Tag und Nacht", "at": "ist der Motor"},
    {"icon": "plug", "t": "MCP", "d": "Die Steckdose: nur, was du freigibst", "at": "MCP ist die"},
    {"icon": "book", "t": "Firmen-Gedächtnis", "d": "Erinnert sich an alles, was dein Betrieb weiß", "at": "Firmengedächtnis"}]),
  S("check", "Es beginnt mit einer Seite", kick="Dein Firmen-Gedächtnis", title="Vier Stufen, drei davon sind *Textdateien*", mode="icon", items=[
    {"icon": "doc", "t": "Eine Seite Text, die jeder Agent liest", "at": "einer Seite Text"},
    {"icon": "folder", "t": "Vorlagen als einfache Dateien bei euch", "at": "Vorlagen als einfache"},
    {"icon": "table", "t": "Wird es viel: eine Datenbank zum Nachschlagen", "at": "kommt eine Datenbank"},
    {"icon": "server", "t": "Euer Server oder EU-Cloud mit Vertrag", "at": "auf eurem Server"}]),
  S("title", "Und du bist nicht allein", glyph="users", kick="Und du bist nicht allein",
    title="Echte Ansprechpartner *werktags*, der KI-Assistent rund um die Uhr", sub="…die jeden Tag mit diesen Systemen arbeiten.", sub_at="jeden Tag"),
  S("title", "Gleich lernst du", glyph="arrow", kick="Gleich im Kurs", title="Athenas Prompt holen, dann jede Aussage zur richtigen *Rolle* ziehen."),
])

P["U6"] = dict(av_end="Bei vielen Betrieben", scenes=[
  S("hook", 0, kick="Zähl mal mit", title="Wie viele *Software-Abos* hast du?", items=[
    {"icon": "users", "t": "CRM", "at": "CRM"}, {"icon": "calendar", "t": "Kalender", "at": "Kalender"},
    {"icon": "form", "t": "Formulare", "at": "Formulare"}, {"icon": "mail", "t": "Newsletter", "at": "Newsletter"},
    {"icon": "euro", "t": "Buchhaltung", "at": "Buchhaltung"}]),
  S("stat", "Bei vielen Betrieben", kick="Bei vielen Betrieben", num=10, unit="+", label="Abos",
    sub="Jedes kann ein bisschen, keins passt genau.", sub_at="Jedes kann"),
  S("compare", "Warum sich das", kick="Warum sich das jetzt ändert", title="Eigene Werkzeuge statt Abos", cols=[
    {"t": "Früher", "icon": "hourglass", "mk": "x", "at": "Früher", "rows": [{"t": "Eigenes Werkzeug: teuer, Monate Arbeit"}]},
    {"t": "Heute", "icon": "claude", "at": "Heute baut", "rows": [
      {"t": "Erster Prototyp an einem Nachmittag", "at": "an einem Nachmittag"},
      {"t": "Dann: Tests, Datenschutz, deine Freigabe", "at": "braucht er Tests"}]}]),
  S("title", "Schnell heißt nicht", glyph="warn", kick="Merk dir", title="Schnell heißt *nicht einfach*.",
    sub="Aber oft ersetzt so ein Werkzeug zwei oder drei Abos.", sub_at="Aber oft"),
  S("brief", "Dafür brauchst du", kick="Der Bauplan", title="Der Prozess-Steckbrief", fields=[
    {"l": "Auslöser", "v": "Neue Anfrage über die Webseite", "at": "Auslöser"},
    {"l": "Schritte", "v": "Lesen → sortieren → Angebot vorbereiten", "at": "Schritte"},
    {"l": "Programme", "v": "Postfach, CRM, Kalender", "at": "Programme"},
    {"l": "Ergebnis", "v": "Angebot liegt als Entwurf bereit", "at": "Ergebnis"},
    {"l": "Fehlerfall", "v": "Nachricht an mich, wenn etwas hakt", "at": "schiefgeht"}]),
  S("title", "Erst schauen", glyph="search", kick="Deine Aufgabe", title="Erst schauen, *dann bauen*.",
    sub="3 Fehler finden, dann deinen eigenen Steckbrief schreiben", sub_at="Gleich findest"),
])
