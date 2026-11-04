"""Kursseitentexte für Modul 1.3 „Dein eigener Server“ – im Format von Teil 2 (docs/modul-1-2/index.html, const DATA).

Stand: 03.11.2026 · KI-erstellt: Claude Code · ENTWURF zur Freigabe durch Timo.
Baut auf dem Teil-2-Player auf: Level vom Typ "guide" (Schritte mit t, d, d2, code, term, img, note, link, widget, tabs),
Abschluss über "checks" (Haken „Hat alles geklappt?“). Neue Widgets, die der Player noch nicht kennt: "weg", "ampel", "serversteckbrief".
Beim Bau: KURS = "Modul 1.3", localStorage-Schlüssel "m13-server-v1", Videos T3INTRO, X1–X6, T3END.
Zahlen mit Datum stammen aus 2026-11-03_Recherche_n8n-Selbsthosting.md; vor dem Live-Gang prüfen.
"""

TITLE = "Dein eigener Server"
SUBTITLE = "Modul 1 · Teil 3 von 3 · ca. 45 Minuten, als Pilot mit eigenem Server ca. 90"

INTRO = ("In Teil 2 lief deine erste Automation in unserer Kurs-Instanz, mit Testdaten. Für echte Kundendaten braucht sie ein Zuhause, "
         "über das dein Betrieb bestimmt. Heute bekommt dein n8n einen eigenen Server in Deutschland: mieten, einrichten, Workflows umziehen, warten. "
         "Du kannst mitbauen (ab etwa 7 Euro im Monat, monatlich kündbar, Stand November 2026; rechne mit 90 Minuten) oder zuschauen (45 Minuten) und am Ende einen fertigen Vorschlag für Chef oder IT in der Hand haben.")

PROMISE = [
    ["Deine Daten bleiben bei dir", "n8n läuft unter der Adresse deiner Firma auf einem Server in Deutschland, den du jederzeit kündigen kannst."],
    ["Keine Abo-Stufen, keine Überraschung", "Ein kleiner Server kostet ab etwa 7 Euro im Monat (Stand November 2026), die Software selbst kostet nichts."],
    ["Du weißt, was zu tun ist, wenn etwas klemmt", "Update, Backup, Fehler lesen: drei Handgriffe, die du am Ende kennst."],
]

LEVELS = [
 {"id": 1, "title": "Der Hangar: Warum ein eigener Server?", "videos": ["T3INTRO", "X1"],
  "merksatz": "Was im Haus bleiben muss, läuft im Haus.",
  "kernpunkte": [
    "Bis jetzt lief deine Automation in der Kurs-Instanz: n8n Cloud, von uns gemietet, nur für Testdaten. Für echte Kundendaten entscheidet ihr, wo n8n läuft.",
    "Ein Server ist ein gemieteter Rechner im Rechenzentrum, der rund um die Uhr läuft. Ihr habt den Schlüssel; der Anbieter stellt Strom, Netz und Hardware.",
    "Die Ampel aus Teil 1 entscheidet: Grün darf in jede Cloud, Gelb in eine Cloud mit Vertrag (AVV), Rot gehört auf euren eigenen Server oder bleibt ganz im Haus."],
  "assist": "Unsicher, welche Farbe dein Prozess hat? Beschreib ihn dem Assistenten unten rechts, ohne echte Namen.",
  "type": "guide",
  "intro": "Erst verstehen, dann mieten. Lies die fünf Punkte und wähl am Ende deinen Weg.",
  "steps": [
    {"t": "Wo laufen eure Automationen heute?", "d": "In der <b>Kurs-Instanz</b>: n8n Cloud, von der Akademie gemietet, nur für Testdaten. Das bleibt so bis Kursende. Danach brauchen deine Workflows ein neues Zuhause: n8n Cloud mit eigenem Abo oder dein eigener Server.",
     "note": "So machen wir es selbst: Der Lernstand, den du gerade erzeugst, und die Zusammenfassungs-Mails laufen über n8n auf unserem Server in Deutschland. Die Kursseite selbst liefert GitHub aus."},
    {"t": "Die Ampel anwenden", "d": "<b>Grün</b> (öffentlich, intern ohne Personenbezug): jede Cloud. <b>Gelb</b> (gewöhnliche Kunden- und Mitarbeiterdaten wie Namen, Adressen, Termine): Cloud nur mit Auftragsverarbeitungsvertrag und EU-Rechenzentrum, oder eigener Server. <b>Rot</b> (Gesundheitsdaten, Gehälter, Verträge, alles mit Schweigepflicht): eigener Server, kein Cloud-KI-Modell ohne Prüfung.",
     "d2": "Ordne drei Fälle ein, dann weißt du, wie es geht:", "widget": "ampel"},
    {"t": "Was ein Server ist, in einem Bild", "d": "Der Hangar. Stell dir deine Automation als Auto vor. In Teil 2 ist es in unserer Werkstatt gefahren. Jetzt bekommt es einen eigenen Hangar bei dir: gemietet, in Deutschland, mit Schloss (Firewall), Adresse (Domain) und Wartungsplan. Du musst ihn nicht bauen, nur mieten und einrichten."},
    {"t": "Die Rechnung (Stand November 2026)", "d": "<b>n8n Cloud:</b> Starter 20 € im Monat bei Jahreszahlung, 2.500 Ausführungen; Pro 50 € für 10.000. <b>Eigener Server:</b> kleinster Server in Deutschland etwa 7 bis 10 € brutto im Monat, Backups etwa 1,50 € dazu, Software 0 €. Dazu kommt deine Zeit: etwa eine Stunde Einrichtung, danach rund 15 Minuten im Monat.",
     "d2": "Was die Cloud dir abnimmt: Updates, Backups, Ausfallsicherheit. Was der eigene Server dir gibt: Daten im Haus, keine Grenze bei Ausführungen, keine Abo-Stufen.",
     "note": "Ehrlich: n8n selbst empfiehlt den eigenen Server nur, wenn jemand im Haus Server kennt. Genau das lernst du in diesem Teil. Preise ändern sich, die Zahlen sind vom 03.11.2026."},
    {"t": "Wähl deinen Weg", "d": "<b>Pilot:</b> Du mietest in Level 2 selbst einen Server (Firmen- oder Privatkonto, Chef vorher fragen). <b>Beobachter:</b> Du schaust bei Level 2 bis 6 zu, füllst in Level 6 den Server-Steckbrief aus und hast damit einen fertigen Vorschlag. Beide Wege machen den Abschluss-Check.",
     "widget": "weg",
     "note": "Wer n8n nicht selbst betreiben will, kann das Betreiben an uns übergeben. Den Knopf dafür findest du in Level 6. Nicht in der Rechnung oben: eine eigene Internetadresse (Domain), falls dein Betrieb noch keine hat, meist unter 15 € im Jahr."}],
  "checks": ["Ich weiß, welche Ampelfarbe mein Prozess aus Teil 1 hat.", "Ich habe meinen Weg gewählt: Pilot oder Beobachter."]},

 {"id": 2, "title": "Server mieten in 15 Minuten", "videos": ["X2"],
  "merksatz": "Deutschland als Standort, Firewall an, AVV abgeschlossen.",
  "kernpunkte": [
    "Wir zeigen Hetzner (Nürnberg oder Falkenstein), weil unser eigener n8n-Server dort läuft und n8n eine eigene Hetzner-Anleitung hat. Plan B: Netcup, Standort Nürnberg, fast gleiche Schritte.",
    "Ein kleiner Server mit 2 Kernen und 4 GB Arbeitsspeicher reicht für n8n mit ein paar Dutzend Workflows. Vergrößern geht später mit zwei Klicks.",
    "Der AVV mit dem Server-Anbieter ist Pflicht, sobald Personendaten verarbeitet werden. Bei Hetzner schließt du ihn im Kundenkonto ab, zwei Minuten."],
  "assist": "Steht bei Hetzner „nicht bestellbar“ oder sieht die Seite anders aus? Schick dem Assistenten einen Screenshot.",
  "type": "guide",
  "intro": "Pilot: Leg los, rechne mit 15 Minuten. Beobachter: Lies mit und merk dir die drei Pflichtpunkte Standort, Firewall, AVV.",
  "steps": [
    {"t": "Konto anlegen", "d": "Geh auf <b>console.hetzner.cloud</b>, registriere dich, bestätige die E-Mail und hinterlege eine Zahlungsmethode. Zahlt der Betrieb, nimm ein Firmenkonto mit Firmenadresse.",
     "link": {"href": "https://console.hetzner.cloud", "label": "Hetzner Cloud öffnen ↗"}, "img": "50_hetzner_registrieren.jpg"},
    {"t": "Projekt anlegen", "d": "Ein Projekt ist eine Schublade für Server, Firewall und Backups. Name zum Beispiel <b>n8n-Firma</b>.", "img": "51_projekt_anlegen.jpg"},
    {"t": "Server hinzufügen", "d": "Standort <b>Falkenstein</b> oder <b>Nürnberg</b> (nicht Helsinki). Image <b>Ubuntu 24.04</b> (das Betriebssystem). Typ: der kleinste mit 2 Kernen und 4 GB Arbeitsspeicher, bei Hetzner <b>CX23</b> (7,13 € im Monat, Stand 03.11.2026). Den Haken bei <b>öffentliche IPv4</b> anlassen, das ist die Nummer deines Servers im Internet (etwa 0,60 € im Monat extra). Rest Standard. Alle Preise hier mit Mehrwertsteuer.",
     "note": "Steht dort „aktuell nicht bestellbar“: nimm den nächstgrößeren Typ oder Plan B Netcup. Die Schritte danach bleiben gleich.", "img": "52_server_konfig.jpg"},
    {"t": "Zugang: Passwort oder SSH-Schlüssel", "d": "Einsteiger: den Punkt SSH-Schlüssel überspringen, Hetzner schickt dir das Passwort für <b>root</b> per Mail. Root heißt: der Hauptbenutzer mit allen Rechten. Beim ersten Login musst du das Passwort ändern. Das neue gehört in einen <b>Passwort-Manager</b> (ein Passwort-Tresor wie Bitwarden oder der eurer IT), nie in einen Chat oder eine Mail.",
     "note": "Ein SSH-Schlüssel ist ein Schlüssel statt eines Passworts und sicherer. Wer einen hat, trägt ihn hier ein; wer nicht, macht das später mit der IT."},
    {"t": "Firewall anlegen", "d": "Im Projekt <b>Firewalls → Firewall erstellen</b>. Eingehend erlauben nur <b>22</b> (Verwaltung per Terminal), <b>80</b> (für das Zertifikat) und <b>443</b> (verschlüsselte n8n-Oberfläche). Auf den Server anwenden. Alles andere bleibt zu.", "img": "53_firewall.jpg"},
    {"t": "Backups einschalten", "d": "Server → <b>Backups</b> → aktivieren. Etwa 20 % Aufschlag auf den Serverpreis (ab 1,43 € im Monat, Stand 03.11.2026), sieben Sicherungen rollierend, täglich automatisch. Das ist dein Sicherheitsnetz für Level 6.", "img": "54_backups.jpg"},
    {"t": "AVV abschließen und IP notieren", "d": "Kundenkonto → <b>AV-Vertrag</b> (Data Processing Agreement) → akzeptieren, PDF ablegen. Dann in der Serverliste die <b>IP-Adresse</b> deines Servers notieren, die brauchst du in Level 3.",
     "link": {"href": "https://accounts.hetzner.com/account/dpa", "label": "AV-Vertrag bei Hetzner ↗"}, "img": "55_avv.jpg"}],
  "checks": ["Pilot: Mein Server läuft, die IP ist notiert. Beobachter: Ich kann sagen, welche Türen die Firewall offen lässt und wozu.", "Ich weiß, wo der AVV abgeschlossen wird."]},

 {"id": 3, "title": "Adresse und Werkzeugkasten", "videos": ["X3"],
  "merksatz": "Die Adresse zeigt auf deinen Server, Docker verpackt die Programme.",
  "kernpunkte": [
    "Eine Unteradresse wie n8n.deinefirma.de genügt. Du legst sie dort an, wo eure Firmen-Domain liegt. Ein Eintrag vom Typ A zeigt auf die IP des Servers.",
    "Docker ist der Werkzeugkasten: Programme laufen darin als fertige Pakete (Container), ohne dass du etwas von Hand installierst. n8n zeigt in seiner Doku genau diesen Weg.",
    "Alles in diesem Level ist Kopieren und Einfügen. Sieht eine Meldung anders aus als in der Box, frag den Setup-Assistenten."],
  "assist": "Terminal zeigt rot? Screenshot an den Assistenten, er liest die Meldung mit dir.",
  "type": "guide",
  "intro": "Zwei Dinge: eine Adresse, die auf den Server zeigt, und Docker auf dem Server. Rechne mit 15 Minuten plus Wartezeit für die Adresse.",
  "steps": [
    {"t": "Unteradresse anlegen", "d": "Beim Anbieter eurer Domain (IONOS, Strato, All-Inkl, Hetzner DNS …): <b>DNS → neuer Eintrag</b> → Typ <b>A</b>, Name <b>n8n</b>, Wert = IP deines Servers, Rest Standard. Es dauert bis zu einer Stunde, bis die Adresse überall bekannt ist.", "img": "60_dns_a_record.jpg",
     "note": "Keine Firmen-Domain zur Hand? Für den Kurs geht auch eine günstige Übungs-Domain. Für den Betrieb später die echte."},
    {"t": "Mit dem Server verbinden", "d": "Weg A, ohne Installation: In der Hetzner-Konsole beim Server auf <b>Konsole</b> (Symbol <b>&gt;_</b>), anmelden mit <b>root</b> und dem Passwort aus der Mail.",
     "tabs": [
       {"label": "Weg A: Hetzner-Konsole", "d": "Klick beim Server auf das Konsolen-Symbol. Es öffnet sich ein schwarzes Fenster im Browser. Tipp <b>root</b>, Enter, dann das Passwort aus der Mail (es wird beim Tippen nicht angezeigt), Enter.", "img": "61_hetzner_konsole.jpg"},
       {"label": "Weg B: Terminal am eigenen Rechner", "d": "Terminal öffnen wie in Teil 2, Level 2, und eingeben:", "code": "ssh root@DEINE-IP", "d2": "Beim ersten Mal fragt der Rechner, ob er dem Server vertrauen soll: <b>yes</b> tippen, Enter. Dann das Passwort."}]},
    {"t": "Passwort ändern", "d": "Der Server verlangt das beim ersten Login von selbst: altes Passwort, dann zweimal das neue. Lang, nur im Passwort-Manager."},
    {"t": "System aktualisieren", "d": "Kopieren, einfügen, Enter. Dauert ein bis drei Minuten.", "code": "apt update && apt upgrade -y",
     "term": ["Reading package lists... Done", "Building dependency tree... Done", "…", "0 upgraded, 0 newly installed, 0 to remove"]},
    {"t": "Docker installieren", "d": "Docker liefert ein Programm mit, das alles selbst einrichtet (die erste Zeile). Danach prüfst du mit den beiden anderen Zeilen, ob Docker und Docker Compose da sind.", "code": "curl -fsSL https://get.docker.com | sh\ndocker --version\ndocker compose version",
     "term": ["Docker version 28.x.x, build …", "Docker Compose version v2.x.x"]},
    {"t": "Ordner für n8n anlegen", "d": "Alles, was zu n8n gehört, liegt ab jetzt in einem Ordner. Das macht Backups einfach.", "code": "mkdir -p /opt/n8n && cd /opt/n8n"}],
  "checks": ["Pilot: docker compose version zeigt eine Versionsnummer. Beobachter: Ich kann in einem Satz sagen, was Docker auf dem Server macht.", "Ich weiß, wo die Unteradresse angelegt wird."]},

 {"id": 4, "title": "n8n starten: drei Dateien, ein Befehl", "videos": ["X4"],
  "merksatz": "Erster Besucher wird Chef, der Schlüssel liegt zweimal.",
  "kernpunkte": [
    "Drei Dateien reichen: .env (deine Einstellungen), docker-compose.yml (welche Programme laufen: n8n, Datenbank, Türsteher), Caddyfile (eine Zeile für den Türsteher Caddy, der das Schloss-Symbol im Browser selbst besorgt).",
    "Die Datenbank heißt Postgres. Sie ist das Regal, in dem n8n Workflows und Zugangsdaten ablegt. n8n empfiehlt sie für den Dauerbetrieb statt der eingebauten Datei-Datenbank, und ein späterer Wechsel wäre mühsam.",
    "Der Verschlüsselungsschlüssel schützt alle Zugangsdaten in n8n. Verlierst du ihn, sind alle Credentials unlesbar. Er gehört an zwei Orte: in die .env und in euren Passwort-Manager."],
  "assist": "Seite lädt nicht oder zeigt eine Zertifikatswarnung? Warte zwei Minuten, dann Screenshot an den Assistenten.",
  "type": "guide",
  "intro": "Die Dateien liegen fertig zum Kopieren vor. Du änderst nur deine Adresse, den Schlüssel und das Datenbank-Passwort. Rechne mit 20 Minuten.",
  "steps": [
    {"t": "Datei 1: deine Einstellungen (.env)", "d": "Öffne den Editor mit <b>nano .env</b>, füge den Inhalt ein und ersetze die drei Platzhalter in Großbuchstaben. Speichern: Strg+O, Enter, schließen: Strg+X.",
     "code": "N8N_HOST=n8n.DEINEFIRMA.de\nN8N_PROTOCOL=https\nN8N_WEBHOOK_URL=https://n8n.DEINEFIRMA.de/\nN8N_PROXY_HOPS=1\nGENERIC_TIMEZONE=Europe/Berlin\nTZ=Europe/Berlin\nN8N_ENCRYPTION_KEY=HIER-DEN-LANGEN-ZUFALLSWERT\nPOSTGRES_USER=n8n\nPOSTGRES_PASSWORD=HIER-EIN-LANGES-PASSWORT\nPOSTGRES_DB=n8n\nEXECUTIONS_DATA_PRUNE=true\nEXECUTIONS_DATA_MAX_AGE=336\nN8N_PUBLIC_API_DISABLED=true",
     "note": "Den Zufallswert für den Schlüssel erzeugst du mit <b>openssl rand -hex 32</b>. Kopiere ihn sofort auch in den Passwort-Manager (Level 2, Schritt 4)."},
    {"t": "Datei 2: die Programme (docker-compose.yml)", "d": "<b>nano docker-compose.yml</b>, Inhalt aus der Box einfügen, nichts ändern. Drei Dienste: <b>postgres</b> (Datenbank, spricht nur intern mit n8n), <b>n8n</b> (der Motor, feste Versionsnummer), <b>caddy</b> (Türsteher auf Port 80 und 443).",
     "code": "services:\n  postgres:\n    image: postgres:16\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: ${POSTGRES_USER}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      POSTGRES_DB: ${POSTGRES_DB}\n    volumes:\n      - pg_data:/var/lib/postgresql/data\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n  n8n:\n    image: docker.n8n.io/n8nio/n8n:2.46.4\n    restart: unless-stopped\n    env_file: .env\n    environment:\n      DB_TYPE: postgresdb\n      DB_POSTGRESDB_HOST: postgres\n      DB_POSTGRESDB_PORT: 5432\n      DB_POSTGRESDB_DATABASE: ${POSTGRES_DB}\n      DB_POSTGRESDB_USER: ${POSTGRES_USER}\n      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}\n      N8N_PORT: 5678\n    volumes:\n      - n8n_data:/home/node/.n8n\n    depends_on:\n      postgres:\n        condition: service_healthy\n\n  caddy:\n    image: caddy:2\n    restart: unless-stopped\n    ports:\n      - \"80:80\"\n      - \"443:443\"\n    volumes:\n      - ./Caddyfile:/etc/caddy/Caddyfile\n      - caddy_data:/data\n      - caddy_config:/config\n    depends_on:\n      - n8n\n\nvolumes:\n  pg_data:\n  n8n_data:\n  caddy_data:\n  caddy_config:",
     "note": "Die Versionsnummer 2.46.4 ist die stabile Version vom 03.11.2026. n8n 3.0 (erschienen Ende Oktober 2026) kann alte Workflows brechen; wechsle erst, wenn du die Änderungsliste des Herstellers (Release-Notes) gelesen hast."},
    {"t": "Datei 3: der Türsteher (Caddyfile)", "d": "<b>nano Caddyfile</b>, eine Regel, deine Adresse einsetzen. Caddy besorgt das Zertifikat (den Ausweis für das Schloss-Symbol im Browser) automatisch und kostenlos bei Let's Encrypt. Deshalb mussten die Türen 80 und 443 offen sein.",
     "code": "n8n.DEINEFIRMA.de {\n    reverse_proxy n8n:5678\n}"},
    {"t": "Starten", "d": "Ein Befehl. Danach prüfen, ob alle drei laufen. In der ersten Minute holt Caddy das Zertifikat.", "code": "docker compose up -d\ndocker compose ps",
     "term": [" ✔ Container n8n-postgres-1  Started", " ✔ Container n8n-n8n-1       Started", " ✔ Container n8n-caddy-1     Started"]},
    {"t": "Owner-Konto anlegen", "d": "Im Browser <b>https://n8n.DEINEFIRMA.de</b> öffnen. Die erste Person, die diese Seite öffnet, wird <b>Owner</b>, also Chef der Instanz. Deshalb sofort: Vorname, Nachname, E-Mail, starkes Passwort.", "img": "70_owner_setup.jpg",
     "note": "Schloss-Symbol in der Adresszeile = Verschlüsselung läuft. Fehlt es nach fünf Minuten, prüf den A-Eintrag aus Level 3 und die Firewall aus Level 2."},
    {"t": "Gratis-Funktionen freischalten", "d": "<b>Settings → Usage and plan → Unlock</b>: n8n schickt einen kostenlosen Registrierungsschlüssel per Mail. Er schaltet Ordner, Debugging im Editor und eigene Ausführungsdaten frei.", "img": "71_community_key.jpg"},
    {"t": "Vergleich mit der Kurs-Instanz", "d": "Gleiche Oberfläche, gleiche vier Reiter wie in Teil 2, Level 1. Unterschied: Du bist Owner, du legst Nutzer an, und es gibt keine Grenze bei Ausführungen.",
     "d2": "Was in der kostenlosen Version fehlt (Stand November 2026): Projekte als Ordner für Teams · Teilen von Workflows und Zugangsdaten zwischen Nutzern · zentrale Variablen · Anmeldung über den Firmen-Login. Für ein bis drei Nutzer reicht sie, und die Lizenz erlaubt die Nutzung im eigenen Betrieb kostenlos."}],
  "checks": ["Pilot: Owner-Konto angelegt, Schloss-Symbol gesehen, Schlüssel liegt im Passwort-Manager. Beobachter: Ich kann sagen, was passiert, wenn der Verschlüsselungsschlüssel verloren geht.", "Ich weiß, welche drei Dateien n8n braucht."]},

 {"id": 5, "title": "Umzug: deine Workflows ziehen ein", "videos": ["X5"],
  "merksatz": "Export, Import, Zugangsdaten neu, testen, erst dann abschalten.",
  "kernpunkte": [
    "Ein Workflow ist eine JSON-Datei. Export in der Kurs-Instanz (Teil 2, Level 8), Import auf deinem Server: zwei Klicks.",
    "Zugangsdaten (Credentials) kommen nie mit. Das ist Absicht und gut so: Du legst Gmail oder Outlook auf dem neuen Server neu an, wie in Teil 2, Level 5.",
    "Alles, was eine Adresse hat (Formulare, Webhooks), bekommt auf dem neuen Server eine neue Adresse. Wer den Link irgendwo eingetragen hat, tauscht ihn."],
  "assist": "Roter Knoten nach dem Import? Das ist fast immer eine fehlende Zugangsdaten-Auswahl. Screenshot an den Assistenten.",
  "type": "guide",
  "intro": "Zieh den Ideen-Briefkasten und deinen eigenen Prozess aus Teil 2 um. Rechne mit 20 Minuten.",
  "steps": [
    {"t": "Exportieren in der Kurs-Instanz", "d": "Workflow öffnen → Menü <b>…</b> → <b>Download</b> (das ist der Export als JSON aus Teil 2, Level 8). Für jeden Workflow eine Datei. Du brauchst den Ideen-Briefkasten und deinen eigenen Prozess.", "img": "35_menu_export.jpg",
     "link": {"href": "https://momentumki.app.n8n.cloud/home/workflows", "label": "Kurs-Instanz öffnen ↗"}},
    {"t": "Importieren auf deinem Server", "d": "Auf deiner Instanz: neuer Workflow → Menü <b>…</b> → <b>Import from File</b> → Datei wählen → Speichern.", "img": "80_import_file.jpg"},
    {"t": "Zugangsdaten neu anlegen", "d": "Rote Knoten zeigen, wo Zugangsdaten fehlen. <b>Credentials → neu</b> → Gmail oder Outlook, wie in Teil 2. Dann im Knoten auswählen.",
     "note": "Dass Zugangsdaten nicht mitreisen, schützt dich: Eine Export-Datei kann man weitergeben, ohne ein Passwort zu verraten."},
    {"t": "Datentabelle mitnehmen", "d": "Die Tabelle <b>Ideen</b> aus Teil 2 kommt nicht mit dem Export, ihre Zeilen auch nicht. In der Kurs-Instanz: <b>Data tables → Ideen → Download CSV</b>. Auf deinem Server: Data tables → neue Tabelle → CSV importieren. Danach im Workflow die Tabelle neu auswählen.",
     "d2": "Alternative, wenn Claude Code schon an deinem Server hängt (Level 6, Schritt 5): gib ihm den Auftrag aus der Box.", "widget": "prompt", "optional": True},
    {"t": "Adressen tauschen", "d": "Formular-Knoten öffnen → neue Produktions-Adresse kopieren → überall ersetzen, wo der alte Link stand. Webhook-Knoten genauso."},
    {"t": "Testen wie ein Nutzer", "d": "Formular ausfüllen, Lauf in den Executions grün, Zeile in der Tabelle, Mail angekommen. Genau wie in Teil 2, Level 6.", "img": "25_form_done.jpg"},
    {"t": "Alte Version abschalten", "d": "In der Kurs-Instanz den Workflow <b>deaktivieren</b>, nicht löschen. Am besten erst, wenn der neue eine Woche sauber läuft; trag dir den Termin ein.",
     "note": "Die Kurs-Instanz bleibt bis Kursende dein Übungsraum, nur mit Testdaten."}],
  "checks": ["Pilot: Mein Workflow läuft auf meinem Server; die alte Version ist aus oder der Termin dafür steht. Beobachter: Ich kann die Schritte des Umzugs in der richtigen Reihenfolge nennen.", "Ich weiß, was beim Export nicht mitkommt."]},

 {"id": 6, "title": "Wartung: der Hangar bleibt sauber", "videos": ["X6"],
  "merksatz": "Update, Backup, Fehler lesen, Schloss davor.",
  "kernpunkte": [
    "Auch dein Auto braucht Service, sonst bleibt es stehen. Dein Server genauso. Drei Handgriffe: Update, Backup, Fehler lesen. Dazu ein Schloss: die Zwei-Faktor-Anmeldung.",
    "Das wichtigste Backup ist der Verschlüsselungsschlüssel. Ohne ihn sind die Zugangsdaten in jeder Sicherung unlesbar.",
    "Verantwortung braucht einen Namen. Der Server-Steckbrief hält fest: wo, wer, wie oft, was im Notfall."],
  "assist": "Update schiefgegangen? Nicht löschen. Screenshot der Fehlermeldung an den Setup-Assistenten, meist reicht ein Neustart.",
  "type": "guide",
  "intro": "Drei Handgriffe, ein Schloss und ein Steckbrief. Der Steckbrief ist deine Abschlussaufgabe, für Pilot und Beobachter.",
  "steps": [
    {"t": "Update (monatlich, 2 Minuten)", "d": "Erst in der docker-compose.yml die Versionsnummer auf die aktuelle stabile Version setzen (nachsehen unter docs.n8n.io/release-notes, der Änderungsliste des Herstellers). Dann:", "code": "cd /opt/n8n && docker compose pull && docker compose down && docker compose up -d",
     "note": "Nicht am Freitagnachmittag. Nicht auf eine brandneue Hauptversion wie 3.0, ohne die Änderungen gelesen zu haben."},
    {"t": "Backup (Server täglich automatisch, Datenbank per Zeitplan)", "d": "Zwei Ebenen. <b>Erstens</b> das Hetzner-Backup des ganzen Servers aus Level 2, das läuft von selbst. <b>Zweitens</b> die Datenbank als Datei. Einmal von Hand, damit du siehst, dass es geht:", "code": "mkdir -p /opt/n8n/backups\ndocker compose exec -T postgres pg_dump -U n8n n8n > /opt/n8n/backups/n8n_$(date +%F).sql",
     "d2": "Dann der Zeitplan, jede Nacht um 3 Uhr, alte Dateien nach 14 Tagen weg (eine Zeile in eine neue Datei, speichern, fertig):",
     "term": ["nano /etc/cron.d/n8n-backup", "0 3 * * * root cd /opt/n8n && docker compose exec -T postgres pg_dump -U n8n n8n > /opt/n8n/backups/n8n_$(date +\\%F).sql && find /opt/n8n/backups -name \"*.sql\" -mtime +14 -delete"],
     "note": "Einmal zurückspielen üben, sonst ist es kein Backup, sondern eine Hoffnung. Den Befehl dafür gibt dir der Setup-Assistent, wenn du ihm sagst, dass du eine Sicherung testen willst. Und die .env mit dem Schlüssel liegt im Passwort-Manager (Level 4)."},
    {"t": "Das Schloss: Zugriff schützen", "d": "Owner-Konto mit Zwei-Faktor-Anmeldung: <b>Settings → Personal → Two-factor authentication</b>. Weitere Nutzer nur einladen, nie das Owner-Passwort teilen. Die Firewall bleibt wie in Level 2.", "img": "90_2fa.jpg"},
    {"t": "Fehler lesen", "d": "<b>Executions</b> → rote Einträge, wie in Teil 2, Level 6. Dazu auf dem Server das Fehlerprotokoll, die letzten 50 Zeilen:", "code": "docker compose logs n8n --tail 50",
     "d2": "Ausführungsdaten werden nach 14 Tagen automatisch gelöscht (Einstellung aus Level 4)."},
    {"t": "Claude Code an deinen Server anschließen", "d": "<b>Settings → Instance-level MCP → Enable MCP access</b> (nur Owner oder Admin), dann je Workflow <b>Available in MCP</b> setzen. Im Terminal, wie in Teil 2, Level 3, nur mit deiner Adresse und einem eigenen Namen, damit die Verbindung zur Kurs-Instanz bleibt:", "code": "claude mcp add --transport http n8n-server https://n8n.DEINEFIRMA.de/mcp-server/http",
     "d2": "Danach in Claude Code <b>/mcp</b> → n8n-server → anmelden. Ab jetzt baut Claude auf deinem Server statt in der Kurs-Instanz.", "img": "91_mcp_selfhosted.jpg",
     "note": "Wer MCP nicht will, schaltet es komplett ab: N8N_DISABLED_MODULES=mcp in der .env."},
    {"t": "Wer ist verantwortlich? Dein Server-Steckbrief", "d": "Fünf Zeilen, die in deine Zusammenfassung wandern. Beobachter füllen das als Vorschlag für Chef oder IT aus.", "widget": "serversteckbrief"},
    {"t": "Wenn du das nicht selbst willst", "d": "Ehrlich: Für manche Betriebe ist n8n Cloud mit Vertrag der bessere Weg (Starter 20 € im Monat bei Jahreszahlung, Stand 03.11.2026), für andere ein Partner, der den Server betreibt. Beides ist in Ordnung. Wichtig ist nur, dass es jemand bewusst entscheidet.", "widget": "angebot", "optional": True}],
  "checks": ["Mein Server-Steckbrief hat fünf ausgefüllte Zeilen.", "Ich kenne die drei Handgriffe (Update, Backup, Fehler lesen) und weiß, wo das Schloss ist.", "Pilot: Ich habe ein Backup einmal zurückgespielt oder mir den Termin dafür notiert. Beobachter: Ich habe das in den Steckbrief geschrieben."]},
]

# Server-Steckbrief: fünf Felder, landen in den Steckbrief-Spalten des Lernstands (steckbrief_ausloeser … steckbrief_fehlerfall)
STECK = {"own": ["Anbieter und Standort", "Adresse", "Verantwortlich", "Backup", "Notfall"],
         "hint": ["z. B. Hetzner, Nürnberg, CX23, AVV abgeschlossen", "z. B. n8n.deinefirma.de", "Name oder Rolle, dazu die Vertretung",
                  "wie, wie oft, wo liegt der Schlüssel", "wer wird angerufen, was ist der erste Schritt"]}

# Ampel-Widget (Level 1, Schritt 2)
AMPEL = [
    {"t": "Wetterbericht für die Baustellenplanung", "a": "gruen", "r": "Keine Personen betroffen. Darf in jede Cloud."},
    {"t": "Neukunden-Formular ins CRM", "a": "gelb", "r": "Personendaten, aber mit AVV in einer EU-Cloud erlaubt. Oder eigener Server."},
    {"t": "Arztbriefe sortieren", "a": "rot", "r": "Gesundheitsdaten, besondere Kategorie. Gehört ins Haus."},
]

# Prompt-Widget (Level 5, Schritt 4)
PROMPTS = [
    ["Datentabelle Ideen neu anlegen", "Du arbeitest in meiner eigenen n8n-Instanz über MCP.\n\nLege die Datentabelle „Ideen“ mit den Spalten idee (Text), name (Text) und eingegangen (Datum) an. Verbinde sie mit dem importierten Workflow „Ideen-Briefkasten“, sodass jede Formular-Eingabe als neue Zeile gespeichert wird. Ändere sonst nichts am Workflow. Sag mir am Ende, was du geändert hast, und veröffentliche noch nicht."],
]

CHECK = [
    {"q": "Eure Workflows verarbeiten Arztbriefe. Wo gehören sie hin?", "a": "Auf den eigenen Server, denn das ist Rot", "d": ["In jede Cloud, denn das ist Grün", "In eine Cloud ohne Vertrag", "Egal, solange die Verbindung verschlüsselt ist"], "lv": 1},
    {"q": "Was ist ein AVV?", "a": "Ein Vertrag, mit dem der Anbieter in eurem Auftrag Daten verarbeitet", "d": ["Ein Plan, wann der Server gesichert wird", "Ein Paket aus Server und Speicherplatz", "Eine Regel, welche Türen die Firewall öffnet"], "lv": 2},
    {"q": "Was gehört zu einem Backup, auf das du dich verlassen kannst?", "a": "Einmal zurückspielen üben und den Schlüssel sichern", "d": ["Nur die Hetzner-Sicherung einschalten", "Die Datenbank einmal im Jahr als Datei speichern", "Den Schlüssel in den Team-Chat legen, damit ihn alle haben"], "lv": 6},
    {"q": "Was trägst du beim Domain-Anbieter ein, damit n8n.deinefirma.de auf deinen Server zeigt?", "a": "Einen A-Eintrag mit der IP-Adresse deines Servers", "d": ["Einen Eintrag mit der Adresse der Kurs-Instanz", "Die E-Mail-Adresse des Owners als Kontakt", "Den Verschlüsselungsschlüssel aus der .env"], "lv": 3},
    {"q": "Wozu dient Docker auf dem Server?", "a": "Programme laufen darin als fertige Pakete, die Container heißen", "d": ["Es verschlüsselt die Verbindung zwischen Browser und Server", "Es mietet den Server beim Anbieter und zahlt ihn", "Es ersetzt n8n durch eine eigene Oberfläche"], "lv": 3},
    {"q": "Was passiert, wenn der Verschlüsselungsschlüssel verloren geht?", "a": "Die gespeicherten Zugangsdaten sind unlesbar, neu anlegen", "d": ["Nichts, n8n erzeugt beim nächsten Start einen neuen", "Die Workflows sind weg, die Zugangsdaten bleiben", "Die Datenbank wird gelöscht und neu angelegt"], "lv": 4},
    {"q": "Wer wird Owner einer neuen n8n-Instanz?", "a": "Die erste Person, die die Seite öffnet und sich registriert", "d": ["Der Server-Anbieter, bis du ihn änderst", "Die Person, die den AVV abschließt", "Immer die IT-Abteilung des Betriebs"], "lv": 4},
    {"q": "Was kommt beim Workflow-Export NICHT mit?", "a": "Die Zugangsdaten, also die Credentials", "d": ["Die Kästchen, also die Knoten", "Die Linien zwischen den Kästchen", "Der Name und die Beschreibung des Workflows"], "lv": 5},
    {"q": "Die richtige Reihenfolge beim Umzug?", "a": "Export, Import, Zugangsdaten neu, testen, alte Version aus", "d": ["Alte Version aus, Export, Import, Zugangsdaten neu, testen", "Export, Import, testen, Zugangsdaten neu, alte Version aus", "Export, Zugangsdaten neu, Import, alte Version aus, testen"], "lv": 5},
    {"q": "Was machst du beim monatlichen Update als Erstes?", "a": "Die Versionsnummer in der docker-compose.yml auf die aktuelle stabile setzen", "d": ["Den Server beim Anbieter löschen und neu bestellen", "Alle Workflows exportieren und neu importieren", "Den Verschlüsselungsschlüssel neu erzeugen"], "lv": 6},
]
PASS = 8

# Ausblick am Ende (Kasten „Wie es weitergeht“)
AUSBLICK = [
    ["Modulaufgabe · Dein Prozess läuft im Betrieb", "Der Steckbrief aus Teil 1, gebaut in Teil 2, zu Hause seit Teil 3. Zeig ihn der Klasse in der Community und trag ein, was er im Monat spart."],
    ["Bald · Firmen-Gedächtnis", "Notizen, Dokumente und Zahlen so speichern, dass KI-Agenten zuverlässig darauf zugreifen."],
    ["Bald · Modul Hermes", "Dein eigener KI-Agent, der für dich mitarbeitet."],
]
