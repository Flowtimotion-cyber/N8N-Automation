from kit import S

P = {}

P["INTRO"] = dict(av_end="Bei den meisten", scenes=[
  S("hook", 0, kick="Rechne mal kurz mit", title="Wie viele Stunden pro Woche kopierst du Daten hin und her?",
    items=[{"icon": "copy", "t": "Daten übertragen", "at": "kopierst"}, {"icon": "mail", "t": "Die gleiche Mail zum 10. Mal", "at": "gleiche Mail"},
           {"icon": "search", "t": "Infos zusammensuchen", "at": "suchst Infos"}]),
  S("stat", "Bei den meisten", kick="Bei den meisten", big="5–10 h", label="pro Woche", sub="= bis zu 2 Monate Arbeitszeit im Jahr", sub_at="zwei Monate"),
  S("title", "In diesem Kurs lernst", glyph="bolt", kick="Das Ziel", title="Diese Arbeit an eine *Automation* abgeben",
    sub="Ende Teil 2: Deine erste eigene Automation läuft", sub_at="Am Ende von Teil zwei"),
  S("cards", "Und du baust sie nicht", kick="Ohne Programmieren", title="Du sagst es in normaler Sprache – die KI baut", arrows=True, cards=[
    {"icon": "chat", "t": "Du beschreibst", "d": "in ganz normalen Worten", "at": "normaler Sprache"},
    {"icon": "robot", "t": "Die KI baut", "d": "den Workflow für dich", "at": "was sie bauen soll"},
    {"icon": "bolt", "t": "Automation läuft", "d": "jeden Tag, auch nachts"}]),
  S("cards", "Was hast du davon", kick="Was hast du davon?", cards=[
    {"icon": "clock", "t": "Weniger Klickarbeit", "d": "Mehr Zeit für das, wofür du eingestellt wurdest", "at": "Erstens"},
    {"icon": "users", "t": "Die Person im Team", "d": "…die weiß, wie man mit KI Prozesse schneller macht", "at": "Zweitens"},
    {"icon": "shield", "t": "Du durchschaust KI", "d": "Du weißt, was hinter den Schlagworten steckt", "at": "Drittens"}]),
  S("title", "Und du musst nichts kaufen", kick="Offizieller n8n-Partner", title="Dein eigener Schulungszugang",
    logos=[{"i": "n8n", "n": "n8n"}], sub="Nach dem Kurs nimmst du alles mit in deine eigene Umgebung", sub_at="Alles, was du dort baust"),
  S("shot", "Und du bist dabei nie allein", kick="Dein KI-Assistent", title="Unten rechts auf der Kursseite – gebaut mit n8n",
    img="editor.jpg", width=820, left=90, top=150, zoom={"x": .6, "y": .3, "s": 1.08}, chips=[
      {"icon": "chat", "t": "Kennt den ganzen Kurs", "at": "kennt den ganzen Kurs"},
      {"icon": "monitor", "t": "Versteht Screenshots", "at": "Screenshots schicken"},
      {"icon": "users", "t": "Hilft beim Chef-Gespräch", "at": "Führungskraft"}]),
  S("chat", "Probier es gleich aus", kick="Probier es aus", title="Frag deinen Assistenten", msgs=[
    {"r": "u", "t": "Welche Aufgabe aus meinem Job eignet sich zum Automatisieren?", "at": "Frag ihn"},
    {"r": "a", "t": "Erzähl mir kurz, was du jede Woche immer gleich machst – dann prüfen wir es zusammen."}]),
  S("cards", "Vielleicht denkst du jetzt", kick="„Ich bin kein Techniker.“", title="Musst du nicht sein.", cards=[
    {"icon": "chart", "t": "Vertrieb", "at": "Vertrieb"}, {"icon": "folder", "t": "Verwaltung", "at": "Verwaltung"},
    {"icon": "spark", "t": "Marketing", "at": "Marketing"}, {"icon": "calendar", "t": "Assistenz", "at": "Assistenz"}],
    foot="Jeder Fachbegriff wird erklärt", foot_at="Jeder Fachbegriff"),
  S("check", "Teil eins dauert", kick="So läuft Teil 1", mode="icon", items=[
    {"icon": "clock", "t": "ca. 30 Minuten", "at": "dreißig Minuten"}, {"icon": "monitor", "t": "9 kurze Videos", "at": "Neun kurze Videos"},
    {"icon": "check", "t": "Nach jedem Video eine Aufgabe", "at": "nach jedem eine Aufgabe"}, {"icon": "target", "t": "Am Ende ein Check", "at": "am Ende ein Check"}]),
  S("title", "Und das Wichtigste", glyph="doc", kick="Das Wichtigste", title="Dein echter Prozess aus dem Arbeitsalltag", sub="…den bauen wir in Teil 2", sub_at="Den bauen wir"),
  S("title", "Bevor wir über Tools", glyph="warn", kick="Nächstes Video", title="Warum die meisten Automationen scheitern", sub="…und wie du das vermeidest", sub_at="vermeidest"),
])

P["V1"] = dict(av_end="In den nächsten zwei", scenes=[
  S("hook", 0, kick="Die Wahrheit", title="Automationen scheitern selten an der *Technik*.", sub="…sondern daran, dass niemand genau sagen kann, was automatisiert werden soll.", sub_at="niemand genau"),
  S("check", "In den nächsten zwei", kick="In 2 Minuten", title="Das lernst du jetzt", items=[
    {"t": "Was eine Automation wirklich ist", "at": "was eine Automation"}, {"t": "Aufgaben erkennen, die du abgeben kannst", "at": "Aufgaben erkennst"}]),
  S("cards", "Stell dir einen neuen Kollegen", kick="Stell dir vor", title="Ein neuer Kollege …", cards=[
    {"icon": "bolt", "t": "Extrem schnell", "at": "extrem schnell"}, {"icon": "clock", "t": "Macht nie Pause", "at": "nie Pause"},
    {"icon": "check", "t": "Vergisst nie etwas", "at": "vergisst nie"}, {"icon": "warn", "t": "Macht genau, was du sagst", "d": "Nicht mehr, nicht weniger.", "at": "einen Haken"}]),
  S("title", "Genau das ist eine Automation", kick="Automation =", title="*Wenn* das passiert, *dann* mach das.", sub="Ein Ablauf nach festen Regeln", sub_at="Ein Ablauf"),
  S("flow", "Ein Beispiel", kick="Beispiel", title="Kontaktformular auf eurer Website", wtitle="Neue Kontaktanfrage", nodes=[
    {"i": "form", "l": "Formular", "at": "Kontaktformular"}, {"i": "hubspot", "l": "Ins CRM", "at": "ins CRM"},
    {"i": "mail", "l": "Bestätigung", "at": "eine Bestätigungs-Mail"}, {"i": "slack", "l": "Vertrieb informieren", "at": "Vertrieb Bescheid"}],
    run=["Mit einer Automation", "auch nachts"], execs=("Dauer", "3 Sek.")),
  S("stat", "Und jetzt rechne", kick="Und jetzt rechne", pre="15 Min. am Tag × 220 Arbeitstage", num=55, unit=" h", label="pro Jahr", num_at="über fünfzig", sub="…nur für diese eine Aufgabe", sub_at="Nur für diese"),
  S("compare", "Was eine Automation nicht ist", kick="Was eine Automation nicht ist", cols=[
    {"icon": "robot", "t": "Automation", "rows": [{"t": "Daten übertragen"}, {"t": "Mails verschicken"}, {"t": "Fleißarbeit"}]},
    {"icon": "user", "t": "Du", "mk": "spark", "at": "schwieriges Kundengespräch", "rows": [{"t": "Schwieriges Kundengespräch", "at": "Kundengespräch"},
      {"t": "Preisverhandlung", "at": "Preisverhandlung"}, {"t": "Feedback an Kollegen", "at": "Feedback"}]}]),
  S("flow", "Und wenn die Automation einen Fehler", kick="Und wenn's schiefgeht?", title="Den Fehlerfall planen wir immer mit", wtitle="Neue Kontaktanfrage",
    nodes=[{"i": "form", "l": "Formular"}, {"i": "hubspot", "l": "Ins CRM"}, {"i": "mail", "l": "Bestätigung"}],
    run=["Gute Frage"], err=2, tip={"t": "Fehler → Team bekommt Nachricht", "at": "Fehlerfall"}),
  S("title", "Jetzt weißt du", kick="Nächstes Video", title="Womit baut man sie?", logos=[{"i": "n8n", "n": "n8n", "at": "n8n"}]),
])

P["V2"] = dict(av_end="Es heißt n8n", scenes=[
  S("hook", 0, kick="Made in Berlin", title="Ein Werkzeug, das deine Programme verbindet – ohne Code.",
    items=[{"icon": "sap", "t": "2026: sogar SAP investiert", "at": "sogar SAP"}]),
  S("title", "Es heißt n8n", logos=[{"i": "n8n"}], title="n8n", sub="Der Motor für alles, was du in diesem Kurs baust", sub_at="Das ist der Motor", chips=[
    {"icon": "check", "t": "Was n8n kann", "at": "was n8n kann"}, {"icon": "check", "t": "Wie ein Workflow aussieht", "at": "wie ein Workflow"},
    {"icon": "check", "t": "Warum n8n", "at": "warum wir uns"}, {"icon": "check", "t": "Alles mitnehmen", "at": "mitnimmst"}]),
  S("hub", "eine Plattform für Automation", kick="Eine Plattform für Automation", center="n8n", hub_at=False, cy=370, sats=[
    {"i": "mail", "n": "Outlook", "at": "Outlook"}, {"i": "gmail", "n": "Gmail", "at": "Gmail"}, {"i": "hubspot", "n": "CRM", "at": "CRM"},
    {"i": "table", "n": "Excel", "at": "Excel"}, {"i": "googlesheets", "n": "Google Sheets", "at": "Google Sheets"},
    {"i": "slack", "n": "Slack", "at": "Slack"}, {"i": "chat", "n": "Teams", "at": "Teams"}]),
  S("cards", "Dafür gibt es hunderte", kick="Hunderte fertige Bausteine", title="Jeder Baustein kann genau eine Sache", cards=[
    {"icon": "mail", "t": "Mail senden", "at": "eine Mail senden"}, {"icon": "table", "t": "Zeile in Tabelle schreiben", "at": "eine Zeile"},
    {"icon": "user", "t": "Kontakt anlegen", "at": "einen Kontakt"}]),
  S("flow", "So sieht ein Workflow", kick="So sieht ein Workflow aus", title="Kästchen, verbunden mit Linien", wtitle="Neue Anfrage → CRM", nodes=[
    {"i": "form", "l": "Formular"}, {"i": "hubspot", "l": "CRM"}, {"i": "gmail", "l": "Mail"}, {"i": "slack", "l": "Slack"}],
    run=["Links startet es", "jeden Schritt anklicken"], panel=("Daten im Schritt „CRM“", "name: Anna Berger", "firma: Muster GmbH", "mail: anna@muster.de"),
    panel_at="welche Daten"),
  S("title", "Stell dir n8n wie den Motor", glyph="gear", kick="Merk dir das Bild", title="n8n ist der *Motor*", sub="Er läuft rund um die Uhr – ob du hinschaust oder nicht", sub_at="Der Motor läuft"),
  S("title", "Vielleicht fragst du dich", kick="Warum n8n – und nicht …", title="Make, Zapier oder Pabbly?", logos=[
    {"i": "make", "n": "Make", "at": "Make"}, {"i": "zapier", "n": "Zapier", "at": "Zapier"}, {"i": "txt:P", "n": "Pabbly", "at": "Publy"}],
    sub="Die sind alle gut. Wir haben einen klaren Grund.", sub_at="alle gut"),
  S("cards", "Die Anbindung an KI-Agenten", kick="Grund Nr. 1", title="Die beste Anbindung an KI-Agenten", arrows=True, top=200, cards=[
    {"icon": "n8n", "t": "n8n", "d": "führt aus"}, {"icon": "claude", "t": "Claude Code", "d": "steuert & baut", "at": "Claude Code"}],
    foot="Funktioniert hier <b>am besten</b> und <b>am einfachsten</b>", foot_at="am besten"),
  S("hub", "Wir wollen keine Insellösungen", kick="Keine Insellösungen", title="Alle Systeme zentral – gesteuert von KI-Agenten", center="n8n",
    hub_at="zentral zusammenbringen", cy=385, ry=160, extra={"i": "claude", "t": "KI-Agenten orchestrieren"}, extra_at="KI-Agenten sie", sats=[
      {"i": "gmail", "n": "Mail"}, {"i": "hubspot", "n": "CRM"}, {"i": "sap", "n": "ERP"}, {"i": "googlesheets", "n": "Tabellen"},
      {"i": "slack", "n": "Chat"}, {"i": "notion", "n": "Wissen"}]),
  S("cards", "Dazu kommen zwei handfeste", kick="Dazu zwei handfeste Vorteile", cards=[
    {"icon": "server", "t": "Selbst betreiben", "d": "auf eurem eigenen Server", "at": "selbst betreiben"},
    {"icon": "euro", "t": "Nicht pro Schritt bezahlt", "d": "große Workflows bleiben bezahlbar", "at": "nicht pro Schritt"}]),
  S("compare", "kannst du auf zwei Arten", kick="Zwei Arten, n8n zu nutzen", cols=[
    {"icon": "cloud", "t": "n8n Cloud", "at": "Erstens", "rows": [{"t": "Monatlich bezahlen"}, {"t": "Du musst dich um nichts kümmern"}]},
    {"icon": "server", "t": "Eigener Server", "at": "Zweitens", "rows": [{"t": "Alle Daten bleiben im Unternehmen", "at": "Daten im Unternehmen"},
      {"t": "Interne Nutzung kostenlos", "at": "kostenlos"}, {"t": "Machen wir in Teil 3", "at": "Genau das machen"}]}]),
  S("cards", "Und so läuft es im Kurs", kick="So läuft es im Kurs", arrows=True, cards=[
    {"icon": "n8n", "t": "Schulungszugang", "d": "von uns als n8n-Partner", "at": "offizieller Partner"},
    {"icon": "bolt", "t": "Du baust", "d": "nichts kaufen, einfach loslegen", "at": "nichts kaufen"},
    {"icon": "copy", "t": "Duplizieren & mitnehmen", "d": "eigener Server oder n8n-Abo", "at": "duplizieren"}]),
  S("cards", "Warum setzen gerade deutsche", kick="Warum deutsche Unternehmen auf n8n setzen", title="Wegen der Daten.", cards=[
    {"icon": "users", "t": "Kundendaten", "at": "Kundendaten"}, {"icon": "euro", "t": "Rechnungen", "at": "Rechnungen"}, {"icon": "lock", "t": "Personalthemen", "at": "Personalthemen"}],
    foot="Eigener Server: <b>Ihr entscheidet</b>, wo die Daten liegen", foot_at="eigenen Server entscheidet"),
  S("flow", "Und n8n kann auch KI", kick="n8n kann auch KI", title="Ein KI-Modell als Baustein im Workflow", wtitle="Mails einordnen", nodes=[
    {"i": "mail", "l": "Neue Mail"}, {"i": "robot", "l": "KI: Zusammenfassen", "at": "zusammenfasst"}, {"i": "warn", "l": "Dringend?", "at": "dringend"}],
    run=["dringend ist"], below=[{"i": "openai", "t": "OpenAI"}, {"i": "claude", "t": "Claude"}, {"i": "googlegemini", "t": "Gemini"},
      {"i": "ollama", "t": "Ollama · eigener Server", "at": "Sogar ein Modell"}]),
  S("title", "Ein Workflow besteht aus genau", glyph="box", kick="Nächstes Video", title="Die 5 Bausteine jeder Automation"),
])

P["V3"] = dict(av_end="Diese fünf Begriffe", scenes=[
  S("hook", 0, kick="Bank oder Bäckerei", title="Jede Automation besteht aus denselben *5 Bausteinen*.", sub="Wer sie kennt, liest jede Automation wie einen Bauplan.", sub_at="Wer die kennt"),
  S("cards", "Diese fünf Begriffe", kick="Diese 5 Begriffe hörst du ab jetzt ständig", cards=[
    {"icon": "n8n", "t": "in n8n", "at": "in n8n"}, {"icon": "users", "t": "im Gespräch mit der IT", "at": "mit der IT"}, {"icon": "claude", "t": "mit Claude Code", "at": "Code arbeitest"}]),
  S("title", "Ich erkläre sie dir", glyph="pot", kick="Unser Bild", title="Die Restaurantküche", sub="Da läuft im Grunde auch eine Automation", sub_at="Da läuft"),
  S("compare", "Erstens: Der Trigger", kick="1 · Trigger = Auslöser", cols=[
    {"icon": "pot", "t": "In der Küche", "mk": "spark", "rows": [{"t": "Die Bestellung", "at": "die Bestellung"}, {"t": "Ohne Bestellung wird nicht gekocht", "at": "Ohne Bestellung"}]},
    {"icon": "n8n", "t": "In n8n", "at": "In n8n kann", "rows": [{"t": "Ausgefülltes Formular", "at": "Formular"}, {"t": "Neue Mail", "at": "neue Mail"}, {"t": "Uhrzeit: jeden Montag 8 Uhr", "at": "Uhrzeit"}]}]),
  S("compare", "Zweitens: der Node", kick="2 · Node = Station mit einer Aufgabe", cols=[
    {"icon": "pot", "t": "In der Küche", "mk": "spark", "at": "In der Küche", "rows": [{"t": "Gemüse schneiden", "at": "Gemüse"}, {"t": "Braten", "at": "braten"}, {"t": "Anrichten", "at": "anrichten"}]},
    {"icon": "n8n", "t": "In n8n", "at": "In n8n", "rows": [{"t": "Kontakt im CRM anlegen", "at": "Kontakt im CRM"}, {"t": "Mail senden", "at": "Mail senden"}, {"t": "Zeile in Tabelle schreiben", "at": "Zeile in Tabelle"}]}]),
  S("flow", "Drittens: der Workflow", kick="3 · Workflow = das Rezept", title="Alle Stationen in der richtigen Reihenfolge", wtitle="Kontaktanfrage", nodes=[
    {"i": "form", "l": "Formular"}, {"i": "hubspot", "l": "CRM"}, {"i": "mail", "l": "Mail"}, {"i": "table", "l": "Tabelle"}],
    run=["Zwischen den Stationen"], panel=("Daten aus dem Formular", "name: Anna Berger", "mail: anna@muster.de", "anliegen: Angebot"), panel_at="Was das Formular liefert"),
  S("cred", "Viertens: das Credential", kick="4 · Credential = Zugangsdaten", title="Der Schlüssel zum Lager", name="CRM-Zugang", field="API-Schlüssel", rows=[
    {"t": "n8n darf damit im CRM Kontakte anlegen", "at": "Kontakt anlegen darf"},
    {"t": "Credentials legst du immer selbst an", "mk": "lock", "at": "Credentials legst du"},
    {"t": "Keine KI bekommt deine Passwörter", "mk": "x", "at": "Keine KI"}]),
  S("shot", "Fünftens: die Execution", kick="5 · Execution = ein Durchlauf", title="Jeder Teller, der rausgeht", img="overview.jpg", top=150, width=1000,
    boxes=[{"r": (8, 100, 280, 118), "t": "Alle Durchläufe", "at": "Jedes Mal"}, {"r": (285, 100, 277, 118), "t": "Fehler", "at": "in einer Liste"}]),
  S("shot", "Grün für erfolgreich", kick="Dein Protokoll", title="Grün = erfolgreich, rot = Fehler", img="execs.jpg", top=140, width=880,
    boxes=[{"r": (675, 225, 520, 310), "t": "Alles grün = erfolgreich", "at": "Grün"}]),
  S("cards", "Also ein Trigger startet", kick="Zusammengefasst", arrows=True, top=200, cards=[
    {"icon": "bolt", "t": "Trigger", "d": "startet", "at": "Trigger startet"}, {"icon": "box", "t": "Nodes", "d": "arbeiten", "at": "Nodes"},
    {"icon": "key", "t": "Credentials", "d": "erlauben", "at": "Credentials geben"}, {"icon": "check", "t": "Execution", "d": "protokolliert", "at": "Ausführung ist"}]),
  S("chat", "Muss ich das alles", kick="Und jetzt?", msgs=[
    {"r": "u", "t": "Muss ich das alles selbst zusammenklicken?"},
    {"r": "a", "t": "Kannst du – musst du aber nicht. Im Kurs baut die KI. Du verstehst, was du siehst, und prüfst es.", "at": "Kannst du"}]),
  S("title", "Jetzt weißt du, was", kick="Nächstes Video", title="Wie redet n8n mit deinen Programmen?", chips=[
    {"icon": "chat", "t": "API", "at": "API und"}, {"icon": "bell", "t": "Webhook", "at": "Webhook"}]),
])

P["V4"] = dict(av_end="API und Webhook sind", scenes=[
  S("hook", 0, kick="Nächste Besprechung", title="„Das läuft über die API.“ – Und du nickst nur?", sub="Nach diesem Video nicht mehr.", sub_at="Nach diesem Video"),
  S("compare", "API und Webhook sind", kick="Die zwei Wege, wie Programme reden", cols=[
    {"icon": "chat", "t": "API", "mk": "arrow", "rows": [{"t": "Du fragst nach"}]},
    {"icon": "bell", "t": "Webhook", "mk": "arrow", "rows": [{"t": "Du wirst benachrichtigt"}]}], vs="&"),
  S("title", "Fangen wir mit der API", kick="API", title="Application Programming Interface", sub="= Programmierschnittstelle", sub_at="auf Deutsch"),
  S("cards", "Stell dir ein Restaurant vor", kick="Das Restaurant", arrows=True, cards=[
    {"icon": "user", "t": "Du", "d": "= Programm A", "at": "Du bestellst"}, {"icon": "box", "t": "Kellner", "d": "= die API", "at": "Die API ist"},
    {"icon": "pot", "t": "Küche", "d": "= Programm B", "at": "das andere Programm"}], foot="Anfrage hin – <b>Antwort</b> zurück", foot_at="schickt eine Antwort"),
  S("term", "Speisekarte gibt", kick="Die Doku = Speisekarte", title="Was nicht auf der Karte steht, geht nicht", ttl="API-Dokumentation", lines=[
    {"t": "GET   /rechnungen?status=offen   → alle offenen Rechnungen", "c": "g", "at": "alle offenen Rechnungen"},
    {"t": "POST  /kontakte                  → neuen Kontakt anlegen", "c": "g", "at": "lege einen neuen"},
    {"t": "POST  /pizza                     → gibt es nicht", "c": "r", "at": "Was nicht auf der Karte"}], height=300, top=180),
  S("cred", "Damit nicht jeder bestellen", kick="Der API-Schlüssel", title="Wie eine Kundenkarte mit Passwort", name="Credential in n8n", field="API-Schlüssel", rows=[
    {"t": "In n8n als Credential hinterlegen", "at": "als Credential"}, {"t": "Nie per Mail verschicken", "mk": "x", "at": "Nie per Mail"},
    {"t": "Nie in einen Chat kopieren", "mk": "x", "at": "nie in einen Chat"}]),
  S("json", "Die Antwort kommt meistens", kick="Die Antwort: JSON", title="Sieht technisch aus – ist nur eine ordentliche Liste", lines=[
    "{", '&nbsp;&nbsp;<span class="p">"name"</span>: "Anna",', '&nbsp;&nbsp;<span class="p">"firma"</span>: "Muster GmbH",', '&nbsp;&nbsp;<span class="p">"status"</span>: "neu"', "}"],
    table=[("Feld", "Wert"), ("name", "Anna"), ("firma", "Muster GmbH"), ("status", "neu")], table_at="als Tabelle"),
  S("compare", "Jetzt der Webhook", kick="Webhook", title="Du wartest auf ein Paket …", top=190, cols=[
    {"icon": "door", "t": "Alle 5 Min. zur Tür", "mk": "x", "at": "Variante eins", "rows": [{"t": "= Nachfragen per API", "at": "Nachfragen per API"}]},
    {"icon": "bell", "t": "Warten, bis es klingelt", "at": "Variante zwei", "rows": [{"t": "= Webhook", "at": "Das ist ein Webhook"}, {"t": "meldet sich von selbst", "at": "von selbst"}]}]),
  S("flow", "In N8N ist ein Webhook ein Trigger", kick="In n8n", title="Ein Webhook ist ein Trigger", wtitle="Neue Bestellung", nodes=[
    {"i": "bolt", "l": "Webhook"}, {"i": "hubspot", "l": "CRM"}, {"i": "mail", "l": "Bestätigung"}],
    panel=("Deine Webhook-Adresse", "https://n8n.firma.de/", "  webhook/bestellung"), panel_at="eine URL", run=["startet sofort"]),
  S("compare", "Merk dir eine einfache Regel", kick="Merk dir die Regel", cols=[
    {"icon": "bell", "t": "Webhook", "mk": "arrow", "rows": [{"t": "Soll sofort etwas passieren, wenn woanders etwas passiert"}]},
    {"icon": "chat", "t": "API", "mk": "arrow", "at": "Willst du regelmäßig", "rows": [{"t": "Regelmäßig Daten abholen"}, {"t": "Etwas in einem Programm anlegen"}]}]),
  S("flow", "In der Praxis kombinierst", kick="In der Praxis", title="Oft beides kombiniert", wtitle="Bestellung verarbeiten", nodes=[
    {"i": "bell", "l": "Webhook startet"}, {"i": "chat", "l": "API: Daten holen", "trig": False}, {"i": "table", "l": "API: schreiben"}], run=["Ein Webhook startet"]),
  S("cards", "Und wenn mein Programm", kick="Keine API?", title="Kommt vor – gerade bei älterer Software", cards=[
    {"icon": "mail", "t": "Über Mail", "at": "über Mail"}, {"icon": "folder", "t": "Dateiexport", "at": "Dateiexport"},
    {"icon": "robot", "t": "Setup-Assistent fragen", "at": "Setup-Assistenten"}]),
  S("title", "API und Webhook verbinden", glyph="plug", kick="Nächstes Video", title="Der dritte Weg: *MCP*", sub="Damit bedient eine KI deine Programme selbst", sub_at="Damit kann eine KI"),
])

P["V5"] = dict(av_end="Das ist der Teil", scenes=[
  S("hook", 0, kick="Früher klicken – heute sagen", title="„Neue Anfrage? Leg den Kontakt im CRM an und schick eine Bestätigung.“", sub="…und die KI baut den Workflow.", sub_at="Und sie baut"),
  S("title", "Das ist der Teil", kick="Der Unterschied zu jedem Klickkurs", title="Du musst nur gut *beschreiben*", sub="…und das kannst du, weil du deinen Job kennst", sub_at="weil du deinen Job"),
  S("title", "Ein KI-Chat wie", kick="Ein KI-Chat", title="Kluger Berater – nur am Telefon", logos=[{"i": "openai", "n": "ChatGPT"}, {"i": "claude", "n": "Claude"}],
    sub="Erklärt den Workflow, kann ihn aber nicht in dein n8n eintragen", sub_at="aber er kann ihn nicht"),
  S("title", "Hier kommt MCP", glyph="plug", kick="MCP", title="Model Context Protocol", sub="Offener Standard von Anthropic, Ende 2024", sub_at="Anthropic", logos=[
    {"i": "anthropic", "n": "Anthropic", "at": "Anthropic"}, {"i": "openai", "n": "OpenAI", "at": "OpenAI"}, {"i": "googlegemini", "n": "Google", "at": "Google"}]),
  S("cards", "Stell dir MCP wie eine Steckdose", kick="MCP = Steckdose", arrows=True, top=200, cards=[
    {"icon": "claude", "t": "KI mit Stecker", "d": "z. B. Claude Code", "at": "jede KI"}, {"icon": "plug", "t": "Steckdose", "d": "= MCP", "at": "Steckdose bereit"},
    {"icon": "n8n", "t": "Werkzeuge", "d": "z. B. n8n", "at": "die Werkzeuge"}]),
  S("toggle", "hat so eine Steckdose", kick="In n8n", title="Steckdose einschalten – und bestimmen, was die KI sieht", on_at="Du schaltest", rows=[
    {"t": "Kontaktanfrage → CRM", "at": "bestimmst"}, {"t": "Rechnungen ablegen"}, {"t": "Personal-Workflow", "on": False}],
    chips=[{"icon": "plus" if False else "bolt", "t": "anlegen", "at": "anlegen"}, {"icon": "gear", "t": "ändern", "at": "ändern"}, {"icon": "check", "t": "testen", "at": "testen"}]),
  S("compare", "Der Unterschied zur API", kick="API vs. MCP", cols=[
    {"icon": "chat", "t": "API", "mk": "arrow", "rows": [{"t": "Für Programme, die genau wissen, was sie bestellen"}]},
    {"icon": "plug", "t": "MCP", "mk": "arrow", "at": "MCP ist für eine KI", "rows": [{"t": "KI fragt: „Was kann ich hier tun?“", "at": "Sie fragt"},
      {"t": "…und wählt selbst das passende Werkzeug", "at": "entscheidet dann"}]}]),
  S("title", "Und wer steckt den Stecker", kick="Wer steckt den Stecker ein?", title="Claude Code", logos=[{"i": "claude"}], sub="KI-Assistent von Anthropic, der nicht nur redet, sondern arbeitet", sub_at="der nicht nur redet"),
  S("cards", "Er läuft im Terminal", kick="Claude Code läuft …", cards=[
    {"icon": "terminal", "t": "im Terminal", "at": "im Terminal"}, {"icon": "monitor", "t": "als Desktop-App", "at": "Desktop-App"}, {"icon": "globe", "t": "im Browser", "at": "im Browser"}],
    foot="Dateien lesen · Befehle ausführen · <b>n8n bedienen über MCP</b>", foot_at="Dateien lesen"),
  S("compare", "Merk dir das Bild aus Video zwei", kick="Merk dir das Bild", cols=[
    {"icon": "n8n", "t": "n8n = Motor", "at": "der Motor", "rows": [{"t": "läuft rund um die Uhr"}]},
    {"icon": "claude", "t": "Claude Code = Baumeister", "at": "der Baumeister", "rows": [{"t": "baut nach deiner Beschreibung", "at": "zusammenbaut"},
      {"t": "testet & repariert", "at": "testet und repariert"}, {"t": "muss nicht dauernd da sein", "at": "muss nicht dauernd"}]}]),
  S("term", "Im Alltag sieht das so aus", kick="Im Alltag", ttl="claude · Kurs-Projekt", lines=[
    {"t": "Hier ist mein Steckbrief: Kontaktformular → CRM → Bestätigung", "p": True, "at": "deinen Prozesssteckbrief"},
    {"t": "● Baue Workflow in n8n … 4 Nodes angelegt", "c": "y", "at": "Er baut"},
    {"t": "● Teste mit Beispieldaten …", "c": "y", "at": "testet ihn"},
    {"t": "✓ Test erfolgreich – bitte prüfe das Ergebnis", "c": "g", "at": "zeigt dir"},
    {"t": "Bitte Betreff der Mail ändern", "p": True, "at": "gibst Feedback"},
    {"t": "✓ Angepasst und erneut getestet", "c": "g", "at": "er bessert nach"}]),
  S("shot", "Genau das machst du in Teil zwei", kick="Echtes Beispiel", title="Unser Setup-Assistent – gebaut von Claude Code über MCP", img="editor.jpg", top=140, width=860, zoom={"x": .5, "y": .4, "s": 1.08}, chips=[
      {"icon": "chat", "t": "Chat-Trigger", "at": "Genau das"}, {"icon": "robot", "t": "KI-Agent + Gedächtnis"}]),
  S("check", "Zwei Regeln für die Sicherheit", kick="2 Regeln für die Sicherheit", mode="icon", items=[
    {"icon": "lock", "t": "Passwörter & API-Schlüssel trägst du selbst ein – nie die KI", "at": "Erstens"},
    {"icon": "shield", "t": "Du bestimmst, was die KI sieht – und gibst frei, bevor es live geht", "at": "Zweitens"}]),
  S("cards", "Brauche ich dafür", kick="Brauche ich ein teures Abo?", cards=[
    {"icon": "claude", "t": "Im Claude-Pro-Abo enthalten", "at": "Claude Code ist schon"}, {"icon": "openai", "t": "Mit ChatGPT geht's auch", "at": "lieber mit"}]),
  S("title", "Claude ist nicht die einzige", kick="Nächstes Video", title="Welche KI wofür?", logos=[
    {"i": "claude", "n": "Claude"}, {"i": "openai", "n": "OpenAI"}, {"i": "googlegemini", "n": "Gemini"}, {"i": "ollama", "n": "Ollama"}]),
])

P["V6"] = dict(av_end="In drei Minuten", scenes=[
  S("hook", 0, kick="Kennst du das?", title="Für jeden dieser Fälle gibt es eine Lösung.", items=[
    {"icon": "openai", "t": "„Wir dürfen nur ChatGPT nutzen.“", "at": "Wir dürfen"},
    {"icon": "lock", "t": "„Keine KI an Kundendaten!“", "at": "Bei uns darf"},
    {"icon": "euro", "t": "„Ich habe kein KI-Abo.“", "at": "Und ich habe kein"}]),
  S("check", "In drei Minuten", kick="In 3 Minuten weißt du", items=[
    {"t": "Welche KI du wofür nimmst", "at": "welche"}, {"t": "Was das kostet", "at": "was das kostet"}, {"t": "Wie ihr KI auf dem eigenen Server betreibt", "at": "eigenen Server"}]),
  S("compare", "Zuerst das Wichtigste", kick="KI hat im Kurs zwei Rollen", cols=[
    {"icon": "claude", "t": "Rolle 1: Baumeister", "at": "Rolle eins", "rows": [{"t": "baut den Workflow für dich"}]},
    {"icon": "robot", "t": "Rolle 2: Baustein", "at": "Rolle zwei", "rows": [{"t": "arbeitet bei jedem Durchlauf mit"}, {"t": "z. B. Mail zusammenfassen", "at": "zum Beispiel"}]}]),
  S("cards", "Als Baumeister nutzen wir", kick="Rolle 1: Baumeister", title="Drei, die mit n8n bauen können", cards=[
    {"icon": "claude", "t": "Claude Code", "d": "nutzen wir im Kurs – sehr zuverlässig", "at": "Als Baumeister"},
    {"icon": "openai", "t": "Codex", "d": "mit deinem ChatGPT-Abo", "at": "Codex"},
    {"icon": "googlegemini", "t": "Gemini CLI", "d": "mit Google-Konto kostenlos testen", "at": "Gemini"}],
    foot="Du beschreibst → KI baut → <b>du prüfst</b>", foot_at="Alle drei"),
  S("flow", "Im Workflow selbst", kick="Rolle 2: Baustein im Workflow", title="Fast jedes Modell einbaubar", wtitle="Mail zusammenfassen", nodes=[
    {"i": "mail", "l": "Neue Mail"}, {"i": "robot", "l": "KI-Modell"}, {"i": "chat", "l": "Zusammenfassung"}], run=["Bezahlt wird"],
    below=[{"i": "openai", "t": "GPT", "at": "von OpenAI"}, {"i": "claude", "t": "Claude", "at": "Claude von"}, {"i": "googlegemini", "t": "Gemini", "at": "Gemini von"},
      {"i": "txt:M", "t": "Mistral", "at": "Mistral"}]),
  S("compare", "Kurz der Unterschied", kick="Abo oder API-Schlüssel?", cols=[
    {"icon": "user", "t": "Abo", "mk": "arrow", "rows": [{"t": "für dich als Mensch"}, {"t": "fester Monatspreis"}, {"t": "Baumeister", "at": "Der Baumeister läuft"}]},
    {"icon": "key", "t": "API-Schlüssel", "mk": "arrow", "at": "API-Schlüssel ist für Programme", "rows": [{"t": "für Programme wie n8n"}, {"t": "pro Nutzung, oft Bruchteile eines Cents"},
      {"t": "Baustein im Workflow", "at": "der Baustein im Workflow"}]}]),
  S("title", "die stärkste Variante", kick="Die stärkste Variante für Datenschutz", title="KI auf eurem *eigenen Server*", logos=[{"i": "ollama", "n": "Ollama", "at": "Das geht mit"}],
    chips=[{"icon": "check", "t": "kostenlos", "at": "kostenloses"}, {"icon": "box", "t": "Llama · Qwen · Gemma · Mistral", "at": "wie Lama"}, {"icon": "n8n", "t": "fertiger n8n-Baustein", "at": "fertigen Baustein"}]),
  S("house", "beide auf eurem Server", kick="Alles im Haus", label="Euer Firmenserver", inner=[{"i": "n8n", "n": "n8n"}, {"i": "ollama", "n": "Ollama"}],
    foot="Kein einziger Datensatz verlässt das Haus", foot_at="kein einziger"),
  S("check", "klärt ihr vier Dinge", kick="Mit eurer IT klären", mode="icon", top=160, items=[
    {"icon": "chip", "t": "Grafikkarte: ca. 8–16 GB Speicher für kleine Modelle", "at": "Grafikkarte"},
    {"icon": "server", "t": "Genug Arbeitsspeicher & Festplatte", "at": "Arbeitsspeicher"},
    {"icon": "gear", "t": "Wer macht Updates & Backups?", "at": "Updates"},
    {"icon": "target", "t": "Welche Aufgaben soll das Modell erledigen?", "at": "Welche Aufgaben"}]),
  S("check", "Wenn ihr Cloud-Modelle nutzt", kick="Cloud-Modelle? Vorher klären:", items=[
    {"t": "Erlaubt unsere Firma diesen Anbieter?", "at": "Erlaubt"}, {"t": "Wo werden die Daten verarbeitet?", "at": "Wo werden"},
    {"t": "Werden sie zum Training genutzt?", "at": "Training"}, {"t": "Datenschutzbeauftragten früh einbinden", "at": "Datenschutzbeauftragten"}]),
  S("bars", "Und jetzt mal ehrlich", kick="Mach dir das Ausmaß klar", bars=[
    {"l": "1 Woche", "v": 1, "n": "1 h", "at": "jede Woche"}, {"l": "1 Jahr", "v": 4, "n": "~45 h", "at": "jedes Jahr"},
    {"l": "Ganzes Team", "v": 9, "n": "×10", "at": "multipliziert"}, {"l": "Vorsprung", "v": 12, "n": "↑↑", "at": "Vorsprung"}],
    foot="Du kannst die Person sein, <b>die das anstößt</b>", foot_at="Du kannst die Person"),
  S("cards", "Also fass dir ein Herz", kick="Fass dir ein Herz", title="Geh damit zu den Entscheidern", arrows=True, cards=[
    {"icon": "chart", "t": "Nutzen ausrechnen", "at": "Rechne aus"}, {"icon": "target", "t": "Kleiner erster Schritt", "at": "kleinen ersten"},
    {"icon": "users", "t": "Mit Entscheidern klären"}]),
  S("chat", "Du musst das nicht allein", kick="Dein KI-Assistent hilft", msgs=[
    {"r": "u", "t": "Hilf mir, das meiner Führungskraft vorzuschlagen.", "at": "Besprich es"},
    {"r": "a", "t": "Gern! Wir skizzieren die Strategie und gehen alle Einwände durch: Datenschutz, Kosten, Sicherheit.", "at": "Er hilft dir"}]),
  S("title", "Welches Modell ist das beste", kick="Welches Modell ist das beste?", title="Austauschbar mit zwei Klicks", sub="In n8n ist das Modell nur ein Baustein", sub_at="nur ein Baustein", logos=[
    {"i": "openai"}, {"i": "claude"}, {"i": "googlegemini"}, {"i": "ollama"}]),
  S("title", "Jetzt kennst du die Werkzeuge", glyph="hourglass", kick="Nächstes Video", title="Der 30-Sekunden-Test", sub="Welche Aufgaben solltest du automatisieren?"),
])

P["V7"] = dict(av_end="In diesem Video bekommst", scenes=[
  S("hook", 0, kick="Fehler Nr. 1", title="Gleich den größten Prozess automatisieren – und nach 2 Wochen aufgeben.", sub=None),
  S("title", "In diesem Video bekommst", glyph="hourglass", kick="Dein Werkzeug", title="Der 30-Sekunden-Test", sub="Ein schneller erster Erfolg ist mehr wert als ein großer Plan", sub_at="Ein schneller"),
  S("check", "Drei Fragen", kick="3 Fragen", items=[
    {"t": "Passiert es regelmäßig – mindestens jede Woche?", "at": "Erstens"}, {"t": "Läuft es nach festen Regeln?", "at": "Zweitens"},
    {"t": "Kopierst du Daten von einem Programm ins andere?", "at": "Drittens"}]),
  S("cards", "Dreimal Ja", kick="Auswertung", cards=[
    {"icon": "check", "t": "3× Ja", "d": "Perfekter Kandidat", "cls": "ok", "at": "Dreimal Ja"}, {"icon": "check", "t": "2× Ja", "d": "Guter Kandidat", "at": "Zweimal Ja"},
    {"icon": "x", "t": "0–1× Ja", "d": "Finger weg – für den Anfang", "cls": "bad", "at": "Einmal oder keinmal"}]),
  S("stat", "Dann rechnest du kurz", kick="Kurz rechnen", pre="10 Rechnungen × 5 Min. pro Woche", num=40, unit=" h", label="im Jahr", num_at="rund vierzig", sub="= eine ganze Arbeitswoche", sub_at="ganze Arbeitswoche"),
  S("cards", "Ein paar Beispiele", kick="Beispiele aus deiner Abteilung", top=170, cards=[
    {"icon": "chart", "t": "Vertrieb", "d": "Anfragen ins CRM + Vertrieb informieren", "at": "Vertrieb:"},
    {"icon": "folder", "t": "Verwaltung", "d": "Rechnungs-PDFs in den richtigen Ordner", "at": "Verwaltung"},
    {"icon": "calendar", "t": "Personal", "d": "Urlaubsanträge in den Teamkalender", "at": "Personal"},
    {"icon": "table", "t": "Marketing", "d": "Freitags Zahlen aus 3 Tools sammeln", "at": "Marketing"}]),
  S("compare", "Und was bleibt bei dir", kick="Was bleibt bei dir?", cols=[
    {"icon": "robot", "t": "Automation bereitet vor", "at": "Die Automation bereitet", "rows": []},
    {"icon": "user", "t": "Du entscheidest", "mk": "spark", "at": "Alles, was Urteilsvermögen", "rows": [{"t": "Schwieriges Kundengespräch"}, {"t": "Preisverhandlung"}, {"t": "Feedbackgespräch"}]}]),
  S("compare", "Für deinen ersten Prozess", kick="Dein erster Prozess: klein · häufig · wenig Risiko", cols=[
    {"icon": "check", "t": "Lieber so", "rows": [{"t": "Bestätigungsmail nach Terminbuchung", "at": "Bestätigungsmail"}]},
    {"icon": "x", "t": "Nicht so", "mk": "x", "at": "als komplette", "rows": [{"t": "Komplette Auftragsabwicklung"}]}]),
  S("cards", "Darf ich das überhaupt", kick="Darf ich das?", cards=[
    {"icon": "users", "t": "Kurz mit Führungskraft klären", "d": "gerade bei Kundendaten", "at": "Klär das"},
    {"icon": "doc", "t": "Steckbrief als Vorlage", "d": "aus dem nächsten Video", "at": "Mit dem Steckbrief"}]),
  S("title", "Im nächsten Video beschreibst", glyph="doc", kick="Nächstes Video", title="Der Prozess-Steckbrief", sub="5 Felder – damit die KI fehlerfrei baut", sub_at="fünf Feldern"),
])

P["V8"] = dict(av_end="Nach diesem Video hast", scenes=[
  S("hook", 0, kick="Merk dir", title="Gut beschrieben ist *halb gebaut*.", sub="Ungenau beschrieben = ungenaue Automation", sub_at="Beschreibst du es ungenau"),
  S("title", "Nach diesem Video hast", glyph="doc", kick="Dein erster Auftrag", title="Der Prozess-Steckbrief", chips=[
    {"icon": "check", "t": "5 Felder", "at": "fünf Felder"}, {"icon": "clock", "t": "ca. 10 Minuten", "at": "zehn Minuten"}, {"icon": "copy", "t": "wiederverwendbar", "at": "wiederverwenden"}]),
  S("brief", "Erstens: Der Auslöser", kick="Beispiel", fields=[
    {"l": "Auslöser", "v": "Kontaktformular auf der Website wird abgeschickt", "at": "Erstens: Der Auslöser", "vat": "Kontaktformular abschickt"},
    {"l": "Schritte", "v": "1. Kontakt im CRM  2. Bestätigungs-Mail  3. Vertrieb in Teams", "at": "Zweitens: Die Schritte", "vat": "Kontakt im CRM anlegen"},
    {"l": "Tools", "v": "Formulartool, CRM, Outlook, Teams", "at": "Drittens: Die Tools", "vat": "Formulartool"},
    {"l": "Ergebnis", "v": "Kontakt im CRM · Mail bei Kundin · Nachricht an Vertrieb", "at": "Viertens", "vat": "Der Kontakt steht"},
    {"l": "Fehlerfall", "v": "Mail geht nicht raus → Team bekommt Nachricht", "at": "Fünftens", "vat": "Wenn die Mail nicht", "hl": True}]),
  S("title", "Ein guter Steckbrief darf kurz", glyph="users", kick="Der beste Test", title="Würde ein neuer Kollege es verstehen?", sub="Dann klappt es auch mit der KI.", sub_at="Dann klappt"),
  S("cards", "Mein Prozess hat aber Ausnahmen", kick="„Mein Prozess hat Ausnahmen.“", title="Schreib sie dazu – wie für einen Kollegen", cards=[
    {"icon": "warn", "t": "Ausnahme", "d": "Anfrage kommt von einem Bestandskunden", "at": "Zum Beispiel"},
    {"icon": "check", "t": "Dann", "d": "keinen neuen Kontakt anlegen", "at": "keinen neuen Kontakt"}], arrows=True),
  S("check", "Jetzt bist du dran", kick="Jetzt bist du dran", items=[
    {"t": "Steckbrief mit 3 Fehlern: Finde sie", "at": "drei Fehlern"}, {"t": "Deinen eigenen Steckbrief ausfüllen", "at": "deinen eigenen"},
    {"t": "Kommt per Mail – griffbereit für Teil 2", "at": "per Mail"}]),
])

P["VEND"] = dict(av_end="Du weißt jetzt", scenes=[
  S("hook", 0, kick="Geschafft", title="Du hast etwas geschafft, das die meisten nie tun.", sub="Einen echten Prozess so beschrieben, dass er automatisiert werden kann.", sub_at="du hast einen echten"),
  S("cards", "Du weißt jetzt", kick="Das hast du jetzt drauf", top=180, cards=[
    {"icon": "n8n", "t": "n8n", "d": "der Motor", "at": "der Motor"}, {"icon": "claude", "t": "Claude Code", "d": "der Baumeister", "at": "der Baumeister"},
    {"icon": "plug", "t": "MCP", "d": "die Steckdose", "at": "die Steckdose"}, {"icon": "bell", "t": "API & Webhook", "d": "die Leitungen", "at": "die Leitungen"},
    {"icon": "doc", "t": "Steckbrief", "d": "der Bauplan", "at": "der Bauplan"}]),
  S("cards", "In Teil zwei wird es praktisch", kick="So geht's weiter", arrows=True, cards=[
    {"icon": "claude", "t": "Teil 2", "d": "n8n + Claude Code verbinden, erste Automation entsteht"},
    {"icon": "server", "t": "Teil 3", "d": "Eigener Server – die Daten bleiben bei euch", "at": "In Teil drei"},
    {"icon": "spark", "t": "Bald: Hermes", "d": "Ein KI-Agent, der mitdenkt", "at": "Hermes"}],
    foot="Kein Claude-Abo? <b>Mit ChatGPT geht es auch.</b>", foot_at="Kein Claude-Abo"),
  S("title", "Bevor du gehst", glyph="mail", kick="Bevor du gehst", title="Trag unten deine E-Mail ein", sub="Steckbrief + Merksätze direkt in dein Postfach", sub_at="Dann bekommst"),
])
