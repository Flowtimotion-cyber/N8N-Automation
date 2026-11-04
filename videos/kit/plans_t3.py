# Szenenpläne Modul 1 · Teil 3 „Dein eigener Server“ (T3INTRO, X1–X6, T3END).
# Anker (at) sind Phrasen aus dem Scribe-Transkript (videos/heygen_t3/words.json), nicht aus dem Skript.
# Bauen:  KIT_HEYGEN=heygen_t3 KIT_AVLABEL=1 python3 -c "from kit import compose; from plans_t3 import P; compose('X1', P['X1'], out)"
from kit import S

P = {}

P["T3INTRO"] = dict(av_end="lief deine erste", scenes=[
  S("hook", 0, kick="Teil 3 · Dein eigener Server", title="Wo steht deine Automation, wenn du abends nach Hause gehst?",
    items=[{"icon": "bolt", "t": "Deine Automation läuft", "at": "Automation läuft"}, {"icon": "home", "t": "Aber wo steht sie?", "at": "wo steht"}]),
  S("title", "lief deine erste", glyph="server", kick="Modul 1 · Teil 3 von 3", title="Dein eigener Server", sub="ca. 45 Minuten · als Pilot mit eigenem Server ca. 90", sub_at="Testdaten"),
  S("flow", "Das war die", kick="Von der Werkstatt ins Zuhause", wtitle="Deine Automation", nodes=[
    {"i": "gear", "l": "Werkstatt = Kurs-Instanz", "at": "Werkstatt"}, {"i": "bolt", "l": "Auto gebaut und eingefahren", "at": "eingefahren"},
    {"i": "home", "l": "Zuhause für echte Daten", "at": "Zuhause"}], run=["dein Betrieb"]),
  S("house", "Stell dir einen", kick="Das Bild für Teil 3", label="Dein Hangar", inner=[
    {"i": "server", "n": "Gemietet, in Deutschland", "at": "Deutschland"}, {"i": "lock", "n": "Schloss an der Tür", "at": "Schloss"}],
    foot="Eigene Adresse · Wartungsplan · du musst ihn nur mieten und einrichten", foot_at="Wartungsplan"),
  S("cards", "Du hast zwei", kick="Zwei Wege", cards=[
    {"icon": "rocket", "t": "Pilot", "d": "mietet selbst einen Server, baut Schritt für Schritt mit", "at": "Als Pilot"}]),
  S("stat", "Das kostet ab", kick="Kosten für den Pilot-Weg", big="ab ca. 7 €", label="pro Monat", sub="Stand November 2026 · monatlich kündbar", sub_at="monatlich"),
  S("cards", "Als Beobachter schaust", kick="Zwei Wege", cards=[
    {"icon": "rocket", "t": "Pilot", "d": "mietet selbst, baut mit"},
    {"icon": "search", "t": "Beobachter", "d": "schaut zu, schreibt den fertigen Vorschlag für Chef oder IT", "at": "fertigen Vorschlag"}]),
  S("check", "Beide Wege führen", kick="So läuft Teil 3", mode="icon", items=[
    {"icon": "target", "t": "Sechs Level, beide Wege", "at": "sechs Level"}, {"icon": "gear", "t": "Am Ende: Update, Backup, Fehler lesen", "at": "etwas klemmt"}]),
  S("title", "Los geht es", glyph="home", kick="Level 1", title="Der Hangar: Warum ein eigener Server?", sub="Die wichtigste Frage zuerst", sub_at="wichtigsten Frage"),
])

P["X1"] = dict(av_end="Bis jetzt lief", scenes=[
  S("hook", 0, kick="Dein Chef fragt", title="„Wo liegen eigentlich unsere Kundendaten, wenn die Automation läuft?“",
    items=[{"icon": "users", "t": "Kundendaten", "at": "Kundendaten"}, {"icon": "bolt", "t": "Automation läuft", "at": "Automation läuft"}]),
  S("compare", "Bis jetzt lief", kick="Bis jetzt und ab jetzt", cols=[
    {"icon": "cloud", "t": "Kurs-Instanz", "rows": [{"t": "Von uns gemietet", "at": "gemietet"}, {"t": "Nur für Testdaten", "at": "Testdaten"}]},
    {"icon": "home", "t": "Echte Daten", "at": "echten Daten", "rows": [{"t": "Dein Betrieb entscheidet, wo n8n läuft", "at": "entscheidet"}]}]),
  S("ampel", "Die Ampel aus", kick="Die Ampel aus Teil 1", label="Ampel", right="Wo darf was hin?", lamps=[
    {"c": "g", "t": "Öffentliche Sachen: jede Cloud", "at": "Grün"},
    {"c": "y", "t": "Kunden- und Mitarbeiterdaten: Cloud mit Vertrag (AVV) oder eigener Server", "at": "Gelb"},
    {"c": "r", "t": "Gesundheit, Gehälter, Verträge: eigener Server", "at": "Rot"}]),
  S("title", "Was im Haus", kick="Merksatz", title="Was im Haus bleiben muss, läuft im Haus."),
  S("house", "Ein Server ist", kick="Was ein Server ist", label="Dein Hangar", inner=[
    {"i": "server", "n": "Rechner im Rechenzentrum", "at": "Rechenzentrum"}, {"i": "key", "n": "Du hast den Schlüssel", "at": "Schlüssel"}],
    foot="Der Anbieter stellt Strom und Netz. Das ist dein Hangar.", foot_at="Strom und Netz"),
  S("compare", "Jetzt die Rechnung", kick="Die Rechnung · Stand November 2026", cols=[
    {"icon": "cloud", "t": "n8n Cloud Starter", "at": "Cloud Starter", "rows": [{"t": "20 € / Monat bei Jahreszahlung", "at": "zwanzig Euro"}, {"t": "2.500 Ausführungen im Monat", "at": "Ausführungen"}]},
    {"icon": "server", "t": "Eigener Server", "at": "kleiner Server", "rows": [{"t": "ca. 7–10 € / Monat", "at": "sieben bis zehn"}, {"t": "Software: 0 €", "at": "Software ist frei"}]}]),
  S("bars", "Dazu kommt deine", kick="Dazu kommt deine Zeit", bars=[
    {"v": 60, "n": "ca. 1 Stunde", "l": "Einrichtung", "at": "eine Stunde"}, {"v": 15, "n": "ca. 15 Min", "l": "pro Monat danach", "at": "fünfzehn Minuten"}]),
  S("cards", "Und ehrlich", kick="Und ehrlich", cards=[
    {"icon": "warn", "t": "n8n sagt selbst", "d": "Selbsthosting nur, wenn jemand im Haus Server kennt", "at": "Server kennt"},
    {"icon": "grad", "t": "Teil 3", "d": "gibt dir genau dieses Wissen", "at": "dieses Wissen"}]),
  S("flow", "Wir machen es", kick="So machen wir es selbst", wtitle="Unsere Akademie", nodes=[
    {"i": "doc", "l": "Dein Lernstand", "at": "Lernstand"}, {"i": "mail", "l": "Die Mails", "at": "Mails"}, {"i": "server", "l": "n8n auf unserem Server (Deutschland)", "at": "unserem Server"}], run=["Deutschland"]),
  S("cards", "Jetzt wählst du", kick="Aufgabe", title="Wähl deinen Weg", cards=[
    {"icon": "rocket", "t": "Pilot", "d": "mietet selbst"}, {"icon": "search", "t": "Beobachter", "d": "schaut zu, schreibt den Vorschlag"}]),
])

P["X2"] = dict(av_end="Wir zeigen es", scenes=[
  S("hook", 0, kick="Level 2", title="Einen Server mieten klingt nach Technikabteilung.", sub="Es sind 15 Minuten und ein paar Klicks, wie ein Hotelzimmer buchen.", sub_at="Hotelzimmer"),
  S("cards", "Wir zeigen es", kick="Wir zeigen es bei Hetzner", title="Konto und Projekt", cards=[
    {"icon": "hetzner", "t": "Hetzner", "d": "wir mieten dort selbst", "at": "Hetzner"},
    {"icon": "user", "t": "Konto anlegen", "at": "Konto"}, {"icon": "folder", "t": "Projekt", "d": "Schublade für Server, Firewall, Backups", "at": "Schublade"}]),
  S("cards", "Beim Server wählst", kick="Der Server", cards=[
    {"icon": "globe", "t": "Standort", "d": "Falkenstein oder Nürnberg, also Deutschland", "at": "Falkenstein"},
    {"icon": "server", "t": "Typ: der kleinste", "d": "2 Kerne · 4 GB Arbeitsspeicher", "at": "kleinsten"},
    {"icon": "chart", "t": "Reicht für Dutzende Workflows", "d": "vergrößern später mit 2 Klicks", "at": "Dutzend"}]),
  S("check", "Dann kommt die", kick="Firewall = das Schloss an der Hangar-Tür", title="Nur drei Türen bleiben offen", mode="icon", items=[
    {"icon": "terminal", "t": "22 · zum Verwalten", "at": "Verwalten"}, {"icon": "shield", "t": "80 · für das Schloss-Zertifikat", "at": "Schlosszertifikat"},
    {"icon": "n8n", "t": "443 · für n8n, verschlüsselt", "at": "Nummern"}, {"icon": "x", "t": "Alles andere bleibt zu", "at": "andere bleibt"}]),
  S("toggle", "Schalte die Backups", kick="Backups", title="Dein Sicherheitsnetz", win=("Server", "/ Backups"), main="Backups aktivieren", main_icon="shield",
    hint="Sieben Sicherungen rollierend, täglich automatisch", rowtag="täglich", on_at="Sicherheitsnetz", rows=[{"t": "Ganzer Server, jede Nacht", "icon": "server"}]),
  S("cred", "Zum Schluss schließt", kick="AVV", title="Vertrag zur Auftragsverarbeitung", name="AV-Vertrag mit Hetzner", field="Kundenkonto", rows=[
    {"t": "Im Kundenkonto per Häkchen", "at": "Kundenkonto"}, {"t": "Dauert zwei Minuten", "at": "zwei Minuten"}, {"t": "Pflicht, sobald Personendaten verarbeitet werden", "mk": "warn"}]),
  S("compare", "Preise und Bestellbarkeit", kick="Plan A und Plan B · Stand November 2026", cols=[
    {"icon": "hetzner", "t": "Hetzner", "rows": [{"t": "Falkenstein / Nürnberg"}, {"t": "Preise und Typen ändern sich", "at": "ändern sich"}]},
    {"icon": "txt:N", "t": "Netcup", "at": "Netcup", "rows": [{"t": "Standort Nürnberg"}, {"t": "Fast gleiche Schritte", "at": "fast gleich"}]}], vs="oder"),
  S("title", "Jetzt zu den", glyph="monitor", kick="Weiter", title="Die Schritte mit Screenshots", sub="Konto · Projekt · Server · Firewall · Backups · AVV"),
])

P["X3"] = dict(av_end="Also gibst du", scenes=[
  S("hook", 0, kick="Level 3", title="Dein Server hat nur eine Nummer. Und Nummern merkt sich niemand.",
    items=[{"icon": "server", "t": "Beispiel: 203.0.113.42", "at": "Nummer"}]),
  S("title", "Also gibst du", glyph="globe", kick="Die Adresse", title="n8n.deinefirma.de", sub="Eine Unteradresse reicht völlig", sub_at="reicht"),
  S("cards", "Du legst sie", kick="Wo du sie anlegst", title="Beim Anbieter eurer Internetadresse", cards=[
    {"icon": "txt:IO", "t": "IONOS", "at": "Ionos"}, {"icon": "txt:St", "t": "Strato", "at": "Strato"}, {"icon": "txt:AI", "t": "All-Inkl", "at": "All-Inkl"}, {"icon": "hetzner", "t": "Hetzner", "at": "Hetzner"}]),
  S("flow", "Dort trägst du", kick="Eine Zeile im Adressbuch des Internets", wtitle="DNS", nodes=[
    {"i": "globe", "l": "n8n.deinefirma.de"}, {"i": "book", "l": "Eintrag Typ A", "at": "Typ A"},
    {"i": "server", "l": "Nummer deines Servers", "at": "Nummer deines"}], run=["zeigt auf"]),
  S("stat", "Das kann bis", kick="Geduld", big="bis zu 1 Std.", label="bis die Adresse überall bekannt ist", sub="Danach: Verbinden mit dem Server", sub_at="verbindest du"),
  S("term", "Am einfachsten geht", kick="Verbinden ohne Installation", title="Die Konsole in der Hetzner-Oberfläche", ttl="Konsole", lines=[
    {"t": "login: root", "p": True, "at": "Konsole"}, {"t": "apt update && apt upgrade -y", "p": True, "at": "aktualisierst"},
    {"t": "0 upgraded, 0 newly installed", "c": "g", "type": False}], height=300, top=170),
  S("hub", "Danach installierst du", kick="Docker = dein Werkzeugkasten", center="Docker", hub_at="Werkzeugkasten", cy=380, sats=[
    {"i": "n8n", "n": "n8n", "at": "Pakete"}, {"i": "postgresql", "n": "Datenbank", "at": "Container"}, {"i": "door", "n": "Türsteher"}],
    extra={"i": "box", "t": "Fertige Pakete, nichts von Hand"}, extra_at="nichts von Hand"),
  S("check", "Das Gute", kick="Das Gute", mode="icon", items=[
    {"icon": "copy", "t": "Alles Kopieren und Einfügen", "at": "Kopieren"}, {"icon": "terminal", "t": "Die Befehle stehen in Boxen", "at": "Boxen"},
    {"icon": "chat", "t": "Setup-Assistent hilft bei anderen Meldungen", "at": "Setup-Assistent"}]),
  S("title", "Gehen wir zu", glyph="terminal", kick="Weiter", title="Die Terminal-Schritte", sub="Adresse · Verbinden · Passwort · Update · Docker · Ordner"),
])

P["X4"] = dict(av_end="Die erste Datei", scenes=[
  S("hook", 0, kick="Level 4", title="Ein Programm installieren heißt sonst: zehnmal auf „Weiter“ klicken.", sub="Auf deinem Server: drei Dateien und ein Befehl.", sub_at="drei Dateien"),
  S("json", "Die erste Datei", kick="Datei 1 · .env = deine Einstellungen", lines=[
    'N8N_HOST=<span class="p">n8n.deinefirma.de</span>', 'GENERIC_TIMEZONE=<span class="p">Europe/Berlin</span>',
    'N8N_ENCRYPTION_KEY=<span class="p">&lt;langer Zufallswert&gt;</span>', 'POSTGRES_PASSWORD=<span class="p">&lt;langes Passwort&gt;</span>'],
    table=[("Einstellung", "Bedeutung"), ("Adresse", "n8n.deinefirma.de"), ("Zeitzone", "Berlin"), ("Zufallswerte", "zwei, lang")], table_at="Zufallswerte"),
  S("hub", "Die zweite legt", kick="Datei 2 · docker-compose.yml = welche Programme laufen", center="txt:3", hub_at=False, cy=380, sats=[
    {"i": "n8n", "n": "n8n (feste Version)", "at": "Programme laufen"}, {"i": "postgresql", "n": "Datenbank", "at": "Datenbank"}, {"i": "door", "n": "Türsteher", "at": "Türsteher"}]),
  S("cred", "Die dritte ist", kick="Datei 3 · Caddyfile = der Türsteher", title="Eine Zeile", name="n8n.deinefirma.de { reverse_proxy n8n:5678 }", field="Schloss-Symbol", rows=[
    {"t": "Besorgt das Schloss im Browser selbst", "at": "selbst"}, {"t": "Dafür waren die Türen 80 und 443 offen", "at": "offenen Türen"},
    {"t": "Namen stehen in den Boxen, du kopierst nur", "at": "kopierst"}]),
  S("cred", "Jetzt das Wichtigste", kick="Das Wichtigste", title="Der Verschlüsselungsschlüssel", name="N8N_ENCRYPTION_KEY", field="Zufallswert", rows=[
    {"t": "Schützt alle Zugangsdaten in n8n", "at": "Zugangsdaten"}, {"t": "Verloren = alle Zugangsdaten unlesbar", "mk": "x", "at": "unlesbar"},
    {"t": "Ort 1: die Datei", "at": "in der Datei"}, {"t": "Ort 2: euer Passwort-Manager", "at": "Passwort-Manager"}]),
  S("term", "Dann tippst du", kick="Ein Befehl", title="n8n startet", ttl="root@server", lines=[
    {"t": "docker compose up -d", "p": True, "at": "einen Befehl"}, {"t": "✔ Container postgres  Started", "c": "g", "type": False},
    {"t": "✔ Container n8n       Started", "c": "g", "type": False}, {"t": "✔ Container caddy     Started", "c": "g", "type": False, "at": "einer Minute"},
    {"t": "https://n8n.deinefirma.de  🔒", "c": "g", "at": "Schloss davor"}], height=330, top=160),
  S("toggle", "Vorsicht", kick="Vorsicht", title="Erster Besucher wird Chef", win=("n8n", "/ Owner-Konto anlegen"), main="Owner-Konto jetzt anlegen", main_icon="user",
    hint="Die erste Person, die die Seite öffnet, wird Owner", rowtag="Pflicht", on_at="sofort an", rows=[
      {"t": "Vorname, Nachname, E-Mail", "icon": "user"}, {"t": "Starkes Passwort", "icon": "key"}]),
  S("title", "Die Dateien findest", glyph="copy", kick="Weiter", title="Die Code-Boxen", sub=".env · docker-compose.yml · Caddyfile · Start · Owner-Konto"),
])

P["X5"] = dict(av_end="Ein Workflow ist", scenes=[
  S("hook", 0, kick="Level 5", title="Dein Workflow läuft noch in der Kurs-Instanz. Jetzt zieht er um.", sub="Ohne Chaos.", sub_at="ohne Chaos"),
  S("flow", "Ein Workflow ist", kick="Export und Import", wtitle="ideen-briefkasten.json", nodes=[
    {"i": "cloud", "l": "Kurs-Instanz: Download", "at": "Download"}, {"i": "doc", "l": "JSON-Datei", "at": "JSON-Datei"}, {"i": "server", "l": "Dein Server: Import from File", "at": "Import"}], run=["Zwei Klicks"]),
  S("cred", "Aber die Zugangsdaten", kick="Zugangsdaten", title="Kommen nie mit, und das ist gut so", name="Gmail / Outlook", field="Passwort", rows=[
    {"t": "Dein Mail-Zugang liegt nicht in einer Datei herum", "at": "herumliegen"}, {"t": "Neu anlegen wie in Teil 2", "at": "neu an"},
    {"t": "Im Kästchen des Workflows auswählen", "at": "Kästchen"}, {"t": "Rote Kästchen = hier fehlt noch etwas", "mk": "warn", "at": "Rote Kästchen"}]),
  S("flow", "Auch die Datentabelle", kick="Die Datentabelle", wtitle="Ideen", nodes=[
    {"i": "table", "l": "Download CSV", "at": "herunter"}, {"i": "doc", "l": "Tabellen-Datei, öffnet auch Excel", "at": "Excel"}, {"i": "table", "l": "Import auf dem Server", "at": "importierst"}]),
  S("compare", "Dann tauschst du", kick="Adressen tauschen", cols=[
    {"icon": "x", "t": "Alte Adresse", "mk": "x", "rows": [{"t": "Kurs-Instanz: Formular und Webhook", "at": "Formular"}]},
    {"icon": "check", "t": "Neue Adresse", "at": "alte Link", "rows": [{"t": "Dein Server: überall den neuen Link eintragen", "at": "neuen ein"}]}], vs="→"),
  S("check", "Dann testest du", kick="Testen wie ein Nutzer", items=[
    {"t": "Formular ausfüllen", "at": "Formular ausfüllen"}, {"t": "Lauf grün", "at": "grün"}, {"t": "Zeile in der Tabelle", "at": "Zeile"}, {"t": "Mail angekommen", "at": "Mail angekommen"}]),
  S("toggle", "Erst danach schaltest", kick="Alte Version", title="Deaktivieren, nicht löschen", win=("Kurs-Instanz", "/ Workflows"), main="Ideen-Briefkasten (alt) aktiv", main_icon="bolt",
    hint="Erst abschalten, wenn der neue läuft", rowtag="deaktiviert", on_at="Deaktivieren", rows=[{"t": "Nicht löschen", "icon": "x", "on": False}]),
  S("check", "Export, Import", kick="Merksatz", title="Die Reihenfolge", items=[
    {"t": "Export", "at": "Export"}, {"t": "Import", "at": "Import"}, {"t": "Zugangsdaten neu", "at": "Zugangsdaten neu"}, {"t": "Testen", "at": "testen"}, {"t": "Erst dann abschalten", "at": "abschalten"}]),
  S("title", "Die Schritte gleich", glyph="box", kick="Weiter", title="Die Umzugs-Schritte", sub="Export · Import · Zugangsdaten · Tabelle · Adressen · Test · Abschalten"),
])

P["X6"] = dict(av_end="Drei Handgriffe und", scenes=[
  S("hook", 0, kick="Level 6", title="Auch dein Auto braucht Service, sonst bleibt es irgendwann stehen.", sub="Dein Server genauso.", sub_at="Server genauso"),
  S("cards", "Drei Handgriffe und", kick="Drei Handgriffe und ein Schloss", cards=[
    {"icon": "gear", "t": "1 · Update"}, {"icon": "copy", "t": "2 · Backup"}, {"icon": "search", "t": "3 · Fehler lesen"}, {"icon": "lock", "t": "Das Schloss", "at": "Schloss halten"}]),
  S("term", "Erstens das Update", kick="1 · Update · monatlich · 2 Minuten", ttl="root@server", lines=[
    {"t": "# docker-compose.yml: neue stabile Version eintragen", "c": "g", "type": False, "at": "Versionsnummer"},
    {"t": "cd /opt/n8n && docker compose pull && docker compose down && docker compose up -d", "p": True, "at": "neu starten"},
    {"t": "Nicht am Freitagnachmittag.", "c": "r", "type": False, "at": "Freitagnachmittag"}], height=300, top=170),
  S("bars", "Zweitens das Backup", kick="2 · Backup · täglich", bars=[
    {"v": 100, "n": "Hetzner-Backup", "l": "ganzer Server", "at": "Hetzner sichert"}, {"v": 70, "n": "pg_dump", "l": "Datenbank als Datei", "at": "als Datei"}],
    foot="Einmal zurückspielen üben, sonst ist es kein Backup, sondern eine Hoffnung.", foot_at="Hoffnung"),
  S("cred", "Und sichere den", kick="Der Schlüssel", title="Ohne ihn ist jede Sicherung wertlos", name="N8N_ENCRYPTION_KEY", field="Zufallswert", rows=[
    {"t": "In der .env", "at": "sichere"}, {"t": "Im Passwort-Manager", "at": "wertlos"}]),
  S("term", "Drittens Fehler lesen", kick="3 · Fehler lesen", title="Lauf-Liste und Fehlerprotokoll", ttl="root@server", lines=[
    {"t": "Executions: rote Einträge ansehen", "c": "r", "type": False, "at": "rote Einträge"},
    {"t": "docker compose logs n8n --tail 50", "p": True, "at": "Fehlerprotokoll"}], height=260, top=180),
  S("toggle", "Dazu das Schloss", kick="Das Schloss", title="Zwei-Faktor-Anmeldung für das Owner-Konto", win=("Settings", "/ Personal"), main="Two-factor authentication", main_icon="lock",
    hint="Owner-Passwort nie weitergeben", rowtag="an", on_at="Zwei-Faktor-Anmeldung", rows=[{"t": "Owner-Konto", "icon": "user"}]),
  S("title", "Update, Backup, Fehler", kick="Merksatz", title="Update, Backup, Fehler lesen, Schloss davor."),
  S("chat", "Ein Bonus noch", kick="Bonus · Claude Code an deinen Server", title="Wie in Teil 2, nur mit deiner Adresse", msgs=[
    {"r": "u", "t": "claude mcp add --transport http n8n-server https://n8n.deinefirma.de/mcp-server/http", "at": "Claude Code"},
    {"r": "a", "t": "n8n-server verbunden. Ich baue ab jetzt auf deinem Server.", "at": "deiner Adresse"}]),
  S("brief", "Bleibt die Frage", kick="Wer ist zuständig?", label="Server-Steckbrief", fields=[
    {"l": "Anbieter und Standort", "v": "Hetzner, Nürnberg, AVV abgeschlossen", "at": "Server-Steckbrief"},
    {"l": "Adresse", "v": "n8n.deinefirma.de", "at": "Server steht"},
    {"l": "Verantwortlich", "v": "Name, Vertretung", "at": "verantwortlich"},
    {"l": "Backup", "v": "Hetzner täglich, pg_dump 3 Uhr, Schlüssel im Passwort-Manager", "at": "Backup läuft"},
    {"l": "Notfall", "v": "Wer wird angerufen, erster Schritt", "at": "Notfall", "hl": True}]),
  S("title", "Den füllst du", glyph="doc", kick="Aufgabe", title="Dein Server-Steckbrief", sub="Pilot und Beobachter · fünf Zeilen", sub_at="Beobachter"),
])

P["T3END"] = dict(av_end="Du weißt, wie", scenes=[
  S("hook", 0, kick="Geschafft", title="Wo deine Automation nachts stehen soll, weißt du jetzt.", sub="Glückwunsch zu Teil 3.", sub_at="Glückwunsch"),
  S("compare", "Du weißt, wie", kick="Dein Hangar", cols=[
    {"icon": "rocket", "t": "Pilot", "at": "Warst du Pilot", "rows": [{"t": "Server läuft", "at": "steht er"}, {"t": "Workflows zu Hause", "at": "zu Hause"}]},
    {"icon": "search", "t": "Beobachter", "at": "Warst du Beobachter", "rows": [{"t": "Fertiger Vorschlag für Chef oder IT", "at": "Vorschlag"}]}], vs="&"),
  S("check", "In beiden Fällen", kick="Wartungsplan mit einem Namen dahinter", items=[
    {"t": "Update", "at": "Update"}, {"t": "Backup", "at": "Backup"}, {"t": "Fehler lesen", "at": "Fehler lesen"}]),
  S("leitwort", "Im Leitwort", kick="Leitwort", word="BAU", lit=1, reveal=[{"i": 1, "at": "zweite Buchstabe"}], label="Leitwort BAU",
    words=["Bauen lassen", "Ablage auf dem eigenen Server", ""], own=""),
  S("cards", "Fordere unten die", kick="Zusammenfassung per Mail", cards=[
    {"icon": "doc", "t": "Merksätze", "at": "Merksätze"}, {"icon": "server", "t": "Server-Steckbrief", "at": "Server-Steckbrief"}, {"icon": "gear", "t": "Drei Handgriffe", "at": "Handgriffe"}]),
  S("cards", "Danach geht es", kick="Wie es weitergeht", cards=[
    {"icon": "target", "t": "Modulaufgabe", "d": "Dein Prozess läuft im Betrieb", "at": "Modulaufgabe"},
    {"icon": "book", "t": "Bald · Firmen-Gedächtnis", "at": "Firmen-Gedächtnis"}, {"icon": "robot", "t": "Bald · Modul Hermes", "d": "dein eigener KI-Agent", "at": "Hermes"}]),
  S("title", "Und dann klick", glyph="check", kick="Fertig", title="Zu meinen Kursen", sub="Danke, dass du dabei warst."),
])
