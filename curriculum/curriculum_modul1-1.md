# Curriculum – Modul 1.1: Automationen verstehen und planen

*Interaktive Lerneinheit (eine HTML-Datei) · Stand: 12.10.2026 · Status: Entwurf zur Freigabe*

---

## Steckbrief

| Punkt | Festlegung |
|---|---|
| Kurs | Modul 1 „Automationen bauen mit n8n und Claude Code“ – Datei 1 von 3 |
| Thema dieser Datei | Grundlagen (n8n, Claude Code, Bausteine, Schnittstellen) und den richtigen Prozess finden |
| Zielgruppe | Unternehmer:innen sowie Führungskräfte und Angestellte in Unternehmen, jeweils ohne Technikhintergrund (Einsteiger). Beispiele funktionieren für die eigene Firma ebenso wie für die eigene Abteilung. |
| Sprache | Deutsch (alle Texte, Stimme, Bildschirmtexte) |
| Dauer | ca. 25–30 Minuten |
| Struktur | 6 Level + Abschluss-Check + Merkblatt |
| Ansprache | Du, locker, praxisnah *(Annahme – bei Firmenschulungen für Führungskräfte ist oft „Sie“ üblich; bitte festlegen, eine Sie-Fassung ist vor der Produktion noch gratis)* |
| Guide | **Timo als Avatar** (HeyGen „Timo Merz“): Vollbild zur Begrüßung je Level, sonst als Kreis unten links |
| Stimme | HeyGen-Stimme „Timo Merz“ – Ton kommt direkt aus dem Avatar-Render |
| Look | 16:9, dunkler Hintergrund, eine warme Akzentfarbe (Gold/Bernstein), XP + Level-Badges |
| Branding | **neutral** – kein Logo, kein Akademie-Name, damit die Datei mehrfach verwendbar ist |

**Bewusste Abweichung von der Standard-Vorlage:** Die Vorlage empfiehlt eine abstrakte Guide-Figur, weil Menschen in KI-Filmen nicht konsistent bleiben. Wir nutzen trotzdem Timos Avatar, weil er aus HeyGen immer gleich aussieht. Die Seedance-Filme zeigen deshalb **keine Hauptfigur mit Gesicht**, sondern Situationen, Hände, Räume und abstrakte Bilder. Das umgeht auch den Higgsfield-Filter, der bei Personen-Shots mehrfach angeschlagen hat.

### So hängen die 3 Dateien zusammen

| Datei | Titel | Inhalt | Dauer |
|---|---|---|---|
| **1.1 (diese)** | Automationen verstehen und planen | Was n8n und Claude Code sind, Bausteine, Schnittstellen, Prozess-Steckbrief | ~25–30 Min |
| 1.2 | Automationen bauen lassen | Schulungs-Instanz, Claude Code einrichten, Live-Build, Tools anbinden, testen, überwachen | ~40 Min |
| 1.3 | Dein eigener Server | Warum eigener Server, Hetzner mieten, n8n installieren, Umzug, Wartung | ~35 Min |

Datei 1.2 und 1.3 bekommen jeweils ein eigenes Curriculum, sobald 1.1 freigegeben ist. Datei 1.2 setzt den Test der Schulungs-Instanz voraus.

---

## Lernziele

**Übergeordnet:** Die Lernenden können erklären, wie n8n und Claude Code zusammen Automationen bauen, und haben am Ende einen eigenen Prozess so beschrieben, dass Claude Code ihn umsetzen kann.

| Level | Die Lernenden können … |
|---|---|
| 1 | einschätzen, wie viel Zeit sie heute mit wiederkehrenden Aufgaben verlieren |
| 2 | in je einem Satz erklären, was n8n und was Claude Code macht |
| 3 | die fünf Bausteine Workflow, Trigger, Node, Credential und Execution unterscheiden |
| 4 | API, Webhook und MCP an einem Alltagsbeispiel auseinanderhalten |
| 5 | beurteilen, ob sich ein Prozess für eine Automation lohnt |
| 6 | einen eigenen Prozess-Steckbrief schreiben |

---

## Level-Übersicht

| Level | Titel | Merksatz | Medium | Interaktion |
|---|---|---|---|---|
| 1 | Der Mitarbeiter, der nie müde wird | Was du zweimal pro Woche von Hand machst, ist ein Kandidat für eine Automation. | FILM (Trailer) | Selbsteinschätzung (Slider) |
| 2 | Motor und Baumeister | n8n führt aus, Claude Code baut. | ANIMATION | Irrtum-oder-Fakt-Karten |
| 3 | Die fünf Bausteine | Ein Trigger startet den Workflow, Nodes erledigen die Arbeit. | ANIMATION | Drag & Drop in Kategorien |
| 4 | Wie Programme miteinander reden | API = du fragst nach, Webhook = du wirst benachrichtigt, MCP = die KI darf die Werkzeuge bedienen. | ANIMATION | Szenario-Quiz mit 2 Buttons |
| 5 | Lohnt sich das? | Wiederkehrend, regelbasiert, mehrere Tools – dann lohnt es sich. | ANIMATION + BILD | Rapid-Fire mit Timer |
| 6 | Der Prozess-Steckbrief | Gut beschrieben ist halb gebaut. | ANIMATION | Finde die 3 Fehler |
| – | Abschluss-Check | – | – | 10 Fragen, gemischt |

---

## Level 1 – Der Mitarbeiter, der nie müde wird

**Lernziel:** Die Lernenden können einschätzen, wie viel Zeit sie heute mit wiederkehrenden Aufgaben verlieren.

**Merksatz:** Was du zweimal pro Woche von Hand machst, ist ein Kandidat für eine Automation.

**Lehrtext:**
In fast jedem Unternehmen und in jeder Abteilung gibt es Arbeit, die sich ständig wiederholt. Eine Anfrage kommt per Formular rein, jemand kopiert sie ins CRM, schreibt eine Bestätigung und gibt dem Team Bescheid. Jede einzelne Aufgabe dauert nur ein paar Minuten. Über eine Woche verteilt summiert sich das schnell auf mehrere Stunden. Dazu kommt: Wer müde oder abgelenkt ist, vergisst einen Schritt. Eine Automation erledigt solche Abläufe immer gleich, rund um die Uhr. In diesem Modul lernst du, solche Automationen nicht mehr selbst zusammenzuklicken, sondern sie von einer KI bauen zu lassen. Du beschreibst, was passieren soll. Die KI setzt es um.

**Ablauf:** Trailer (28 s, ohne Sprecher) → Timo im Vollbild mit Begrüßung → Interaktion.

**Voiceover-Skript (Timo, Vollbild, ca. 30 s / 75 Wörter):**
> Hallo und willkommen. Stell dir vor, du hast einen Mitarbeiter, der nie müde wird. Er kopiert keine Daten mehr von A nach B, vergisst keine Erinnerung und arbeitet auch nachts. Genau das baust du in diesem Modul. Und das Beste: Du musst dafür nicht programmieren können. Du beschreibst einfach, was passieren soll. Bevor wir loslegen, schauen wir kurz, wo bei dir die meiste Zeit verloren geht.

**Medienplan:** `FILM` – Trailer aus den vorhandenen Clips, finale Version in 1080p:
- Shot 1 (15 s): `Cinematic shot of a cozy home office at night, cool blue light, hands rubbing temples in front of three bright monitors full of abstract colorful windows and blinking notifications, soft pinging sounds, handheld camera; in the second half the hands pause and type a short line into a simple dark text window, the room becomes silent and warm light slowly fills the space. Face not visible. No readable text, no captions, no speech, nobody talking.`
- Shot 2 (10 s): `Abstract motion graphic: thin glowing golden lines grow from the center of a dark space and connect simple floating circles and squares into a growing network, small light pulses travel along the lines, slow orbiting camera, elegant, calm. No people, no readable text, no captions.`
- Danach Timos Avatar: „Genau das baust du in diesem Kurs. Willkommen.“ (liegt schon vor, 3,3 s)

**Interaktion – Selbsteinschätzung (Slider), 3 Fragen:**
1. „Wie viele Stunden pro Woche verbringst du mit Aufgaben, die sich ständig wiederholen?“ – Slider 0 bis 15+ Std.
2. „Wie viele verschiedene Programme nutzt du oder dein Team täglich (E-Mail, Kalender, CRM, Tabellen …)?“ – Slider 1 bis 10+
3. „Wie fit fühlst du dich mit Technik?“ – Slider 1 („Ich bin froh, wenn der Drucker geht“) bis 5 („Ich richte gern Tools ein“)

**Feedback:** Rechnet Frage 1 hoch: „Das sind rund **X Stunden im Jahr**. Wenn du davon nur die Hälfte automatisierst, gewinnst du etwa **Y Arbeitstage**. Für ein Team mit fünf Leuten sind es fünfmal so viele.“ (X = Wert × 46 Wochen, Y = X ÷ 2 ÷ 8). Bei Frage 3 unter 3: „Perfekt, dieses Modul ist genau für dich gemacht. Wir gehen jeden Schritt gemeinsam.“
**XP:** 50 für das Ausfüllen (keine richtigen oder falschen Antworten).

---

## Level 2 – Motor und Baumeister

**Lernziel:** Die Lernenden können in je einem Satz erklären, was n8n und was Claude Code macht.

**Merksatz:** n8n führt aus, Claude Code baut.

**Lehrtext:**
n8n ist eine Plattform für Automationen. Sie verbindet Hunderte Programme wie E-Mail, Kalender, Tabellen und CRM und führt Abläufe automatisch aus, rund um die Uhr. Man kann n8n in der Cloud nutzen oder auf einem eigenen Server betreiben. Dann bleiben die Daten im eigenen Haus, was gerade in Deutschland ein Argument ist. Claude Code ist ein KI-Assistent von Anthropic, der nicht nur antwortet, sondern selbst arbeitet. Er plant, baut, testet und repariert. Seit 2026 hat n8n eine eingebaute Schnittstelle, über die sich Claude Code direkt verbinden und Workflows bauen kann. Die Arbeitsteilung ist klar: n8n ist der Motor, der läuft. Claude Code ist der Baumeister, der den Motor zusammensetzt und wartet. Eine Sache macht Claude Code bewusst nicht: Zugangsdaten zu deinen Programmen anlegen. Die hinterlegst du selbst.

**Voiceover-Skript (ca. 38 s / 95 Wörter):**
> Für unsere Automationen brauchen wir zwei Werkzeuge. Das erste ist n8n. n8n verbindet deine Programme, also E-Mail, Kalender, Tabellen oder dein CRM, und führt Abläufe automatisch aus. Tag und Nacht. Das zweite ist Claude Code. Claude Code ist eine KI, die nicht nur redet, sondern selbst arbeitet. Du beschreibst ihm, was passieren soll, und er baut den Ablauf in n8n, testet ihn und repariert ihn, wenn etwas hakt. Merk dir ein Bild: n8n ist der Motor. Claude Code ist der Baumeister. Nur deine Passwörter, die trägst du selbst ein.

**Medienplan:** `ANIMATION` – Beat-Plan:
| Aussage im VO | Element erscheint |
|---|---|
| „Das erste ist n8n“ | Karte „n8n“ links, darunter vier Symbole (Brief, Kalender, Tabelle, Kartei), mit Linien verbunden |
| „Tag und Nacht“ | Sonne/Mond-Symbol wechselt über der Karte |
| „Das zweite ist Claude Code“ | Karte „Claude Code“ rechts, Chatfenster mit Cursor |
| „baut den Ablauf … testet … repariert“ | drei Häkchen erscheinen nacheinander: „baut“, „testet“, „repariert“ |
| „n8n ist der Motor“ | Zahnrad-Symbol über der n8n-Karte |
| „Claude Code ist der Baumeister“ | Werkzeug-Symbol über der Claude-Code-Karte, Verbindungslinie dazwischen mit Label „MCP“ |
| „deine Passwörter“ | Schloss-Symbol mit „Zugangsdaten: legst du selbst an“ |

**Interaktion – Irrtum oder Fakt? (4 Flip-Karten):**
1. „Für n8n muss ich programmieren können.“ → **Irrtum.** n8n arbeitet mit Bausteinen. Und mit Claude Code beschreibst du den Ablauf sogar nur in normaler Sprache.
2. „n8n kann auf meinem eigenen Server laufen.“ → **Fakt.** Dann bleiben deine Daten bei dir. Wie das geht, lernst du in Datei 1.3.
3. „Claude Code legt automatisch meine Passwörter und Zugänge in n8n an.“ → **Irrtum.** Zugangsdaten hinterlegst du immer selbst. So behältst du die Kontrolle.
4. „Claude Code kann einen Fehler im Workflow finden und reparieren.“ → **Fakt.** Er liest die Fehlermeldung, schlägt eine Lösung vor und setzt sie um.

**XP:** 25 pro richtig getippter Karte (vor dem Umdrehen „Irrtum“ oder „Fakt“ wählen), 12 beim zweiten Versuch.

---

## Level 3 – Die fünf Bausteine

**Lernziel:** Die Lernenden können die fünf Bausteine Workflow, Trigger, Node, Credential und Execution unterscheiden.

**Merksatz:** Ein Trigger startet den Workflow, Nodes erledigen die Arbeit.

**Lehrtext:**
Jede Automation in n8n besteht aus denselben Bausteinen. Der **Workflow** ist der gesamte Ablauf, wie ein Fließband von Anfang bis Ende. Der **Trigger** ist der Auslöser, der das Fließband startet: eine neue E-Mail, ein ausgefülltes Formular, eine feste Uhrzeit. Eine **Node** ist eine einzelne Station auf dem Band, die genau eine Aufgabe erledigt, zum Beispiel einen Kontakt ins CRM eintragen. **Credentials** sind die hinterlegten Zugangsdaten, mit denen n8n sich bei deinen Programmen anmelden darf. Eine **Execution** ist ein einzelner Durchlauf: Jedes Mal, wenn der Workflow läuft, entsteht eine Execution, die du nachträglich ansehen kannst. Dort siehst du auch, wenn etwas schiefgegangen ist.

**Voiceover-Skript (ca. 40 s / 100 Wörter):**
> Jede Automation besteht aus fünf Bausteinen. Stell dir ein Fließband vor. Das ganze Band heißt Workflow. Damit es losläuft, braucht es einen Auslöser, den Trigger. Das kann eine neue E-Mail sein, ein ausgefülltes Formular oder einfach jeden Montag um acht Uhr. Auf dem Band gibt es Stationen. Jede Station heißt Node und erledigt genau eine Aufgabe. Damit die Stationen in deine Programme dürfen, brauchen sie Schlüssel. Das sind die Credentials. Und jedes Mal, wenn das Band einmal durchläuft, entsteht eine Execution. Die kannst du dir später anschauen, auch wenn mal etwas schiefgeht.

**Medienplan:** `ANIMATION` – Beat-Plan:
| Aussage im VO | Element erscheint |
|---|---|
| „Das ganze Band heißt Workflow“ | horizontales Fließband, Klammer darüber mit „Workflow“ |
| „den Trigger“ | Startknopf links am Band leuchtet, Label „Trigger“; daneben drei kleine Symbole: Brief, Formular, Uhr |
| „Jede Station heißt Node“ | drei Stationen auf dem Band leuchten nacheinander auf, Label „Node“ an einer |
| „Das sind die Credentials“ | kleine Schlüssel-Symbole hängen an jeder Station, Label „Credentials“ |
| „entsteht eine Execution“ | Paket fährt einmal durch, rechts erscheint ein Protokoll-Eintrag „Execution #1 ✓“ |
| „auch wenn mal etwas schiefgeht“ | zweiter Eintrag „Execution #2 ✗“ in Rot |

**Interaktion – Drag & Drop in Kategorien:**
Aufgabe: „Ordne jedes Beispiel dem richtigen Baustein zu.“
Kategorien: Trigger · Node · Credential · Execution

| Karte | Richtige Kategorie | Feedback bei falscher Zuordnung |
|---|---|---|
| „Ein Kunde füllt das Kontaktformular aus“ | Trigger | Das Formular *startet* den Ablauf, ist also der Auslöser. |
| „Jeden Montag um 8 Uhr“ | Trigger | Auch eine Uhrzeit kann einen Workflow starten. |
| „Kontakt im CRM anlegen“ | Node | Das ist eine einzelne Aufgabe auf dem Band, also eine Node. |
| „Bestätigungsmail versenden“ | Node | Eine Station mit genau einer Aufgabe ist eine Node. |
| „Der API-Schlüssel für dein CRM“ | Credential | Zugangsdaten, mit denen n8n sich anmelden darf, sind Credentials. |
| „Der Durchlauf von heute 14:03 Uhr mit Fehler“ | Execution | Jeder einzelne Durchlauf ist eine Execution. |

**XP:** 10 pro Karte beim ersten Versuch, 5 beim zweiten.

---

## Level 4 – Wie Programme miteinander reden

**Lernziel:** Die Lernenden können API, Webhook und MCP an einem Alltagsbeispiel auseinanderhalten.

**Merksatz:** API = du fragst nach, Webhook = du wirst benachrichtigt, MCP = die KI darf die Werkzeuge bedienen.

**Lehrtext:**
Programme tauschen Daten über **Schnittstellen** aus. Die häufigste ist die **API**: Ein Programm stellt eine Anfrage und bekommt eine Antwort, wie bei einer Bestellung im Restaurant. Du fragst, der Kellner bringt. Ein **Webhook** dreht das um. Du musst nicht ständig nachfragen, sondern wirst automatisch benachrichtigt, sobald etwas passiert, wie eine Türklingel. In n8n startet ein Webhook oft den Workflow, zum Beispiel wenn ein Formular abgeschickt wird. **MCP** steht für Model Context Protocol. Das ist ein offener Standard, über den eine KI wie Claude Werkzeuge bedienen kann. Man kann es sich wie einen Dolmetscher vorstellen, der der KI erklärt, welche Knöpfe es gibt und was sie tun. Über MCP kann Claude Code in n8n Workflows anlegen, testen und ändern.

**Voiceover-Skript (ca. 40 s / 100 Wörter):**
> Damit Programme zusammenarbeiten, brauchen sie Schnittstellen. Die bekannteste ist die API. Das ist wie im Restaurant: Du bestellst, der Kellner bringt dir, was du willst. Ein Programm fragt also nach und bekommt eine Antwort. Ein Webhook funktioniert andersherum, wie eine Türklingel. Du musst nicht ständig nachschauen, ob jemand da ist, es klingelt einfach, sobald etwas passiert. Und dann gibt es MCP. MCP ist wie ein Dolmetscher zwischen der KI und deinen Werkzeugen. Er erklärt Claude, welche Knöpfe es in n8n gibt, damit Claude sie selbst bedienen kann.

**Medienplan:** `ANIMATION` – Beat-Plan:
| Aussage im VO | Element erscheint |
|---|---|
| „die API“ | Spalte 1: Symbol Teller mit Glocke, Label „API“, Pfeil hin („Anfrage“) und zurück („Antwort“) |
| „Ein Webhook“ | Spalte 2: Türklingel-Symbol, Label „Webhook“, Pfeil nur in eine Richtung, Wellen beim „Klingeln“ |
| „MCP“ | Spalte 3: Sprechblasen-Paar, Label „MCP“, Claude-Chatfenster links, n8n-Karte rechts, dazwischen Knöpfe |
| „damit Claude sie selbst bedienen kann“ | Knöpfe in der n8n-Karte leuchten nacheinander auf |

**Interaktion – Szenario-Quiz mit 2 Buttons (5 Szenarien):**
| Szenario | Buttons | Richtig | Auflösung |
|---|---|---|---|
| „Dein Online-Shop soll n8n sofort melden, wenn eine Bestellung eingeht.“ | Webhook / API | Webhook | Der Shop klingelt bei n8n, sobald etwas passiert. |
| „n8n soll jeden Morgen den aktuellen Kontostand aus deinem Buchhaltungsprogramm abfragen.“ | Webhook / API | API | n8n fragt aktiv nach und bekommt eine Antwort. |
| „Claude Code soll in deinem n8n einen neuen Workflow anlegen.“ | MCP / Webhook | MCP | Über MCP darf die KI die Werkzeuge in n8n bedienen. |
| „Ein Kunde füllt dein Kontaktformular aus, und der Workflow startet sofort.“ | Webhook / API | Webhook | Das Formular benachrichtigt n8n von selbst. |
| „n8n holt sich die Liste aller offenen Rechnungen.“ | API / MCP | API | Ein Programm fragt ein anderes nach Daten. |

**XP:** 15 pro richtiger Antwort, 7 beim zweiten Versuch.

---

## Level 5 – Lohnt sich das?

**Lernziel:** Die Lernenden können beurteilen, ob sich ein Prozess für eine Automation lohnt.

**Merksatz:** Wiederkehrend, regelbasiert, mehrere Tools – dann lohnt es sich.

**Lehrtext:**
Nicht jeder Ablauf eignet sich zur Automation. Drei Fragen helfen bei der Entscheidung. Erstens: Passiert es **regelmäßig**? Was einmal im Jahr vorkommt, lohnt den Aufwand selten. Zweitens: Folgt es **festen Regeln**? Wenn du den Ablauf in „wenn dies, dann das“ beschreiben kannst, kann ihn auch eine Automation erledigen. Braucht er dagegen Bauchgefühl, Verhandlungsgeschick oder persönliche Beziehung, bleibt er beim Menschen. Drittens: Sind **mehrere Programme** beteiligt? Gerade das Hin-und-her-Kopieren zwischen Tools frisst Zeit und erzeugt Fehler. Gute Startprozesse sind zum Beispiel neue Anfragen ins CRM übernehmen, Termine bestätigen, Rechnungen ablegen oder Erinnerungen verschicken.

**Voiceover-Skript (ca. 35 s / 88 Wörter):**
> Nicht alles sollte man automatisieren. Stell dir drei Fragen. Erstens: Passiert es regelmäßig? Einmal im Jahr lohnt sich der Aufwand meist nicht. Zweitens: Gibt es klare Regeln? Wenn du es mit „wenn dies, dann das“ beschreiben kannst, kann es auch eine Automation. Ein schwieriges Kundengespräch dagegen bleibt bei dir. Drittens: Sind mehrere Programme beteiligt? Genau dort, wo du Daten von einem Tool ins nächste kopierst, liegt die meiste verschenkte Zeit. Dreimal Ja heißt: Das ist dein Kandidat.

**Medienplan:** `ANIMATION` + `BILD`
- Animation – Beat-Plan: drei Checkboxen erscheinen nacheinander („regelmäßig“, „feste Regeln“, „mehrere Programme“), bei „Dreimal Ja“ leuchtet ein großes Häkchen mit „Kandidat“.
- Bild für den Rapid-Fire-Screen: `Clean flat illustration of a tidy desk seen from above with a laptop, a calendar, a stack of envelopes and a coffee cup, connected by thin glowing golden lines, dark navy background, warm amber accent, minimal style, no readable text, no faces, no captions.`

**Interaktion – Rapid-Fire mit Timer (10 Karten, je 6 Sekunden):**
Frage: „Automatisieren – ja oder nein?“
| Karte | Richtig | Begründung |
|---|---|---|
| Neue Kontaktanfragen ins CRM übernehmen | Ja | regelmäßig, klare Regel, zwei Programme |
| Terminbestätigung nach einer Buchung verschicken | Ja | passiert bei jeder Buchung gleich |
| Ein schwieriges Reklamationsgespräch führen | Nein | braucht Fingerspitzengefühl |
| Rechnungs-PDFs aus E-Mails in einen Ordner ablegen | Ja | wiederkehrend und regelbasiert |
| Einmal jährlich die Firmenstrategie planen | Nein | selten und kreativ |
| Erinnerung an Kunden mit offener Rechnung nach 14 Tagen | Ja | feste Regel mit Datum |
| Mit einem neuen Großkunden über den Preis verhandeln | Nein | persönliche Beziehung, keine feste Regel |
| Urlaubsanträge des Teams ins Teamkalender-Tool übertragen und bestätigen | Ja | regelmäßig, klare Regel, mehrere Programme |
| Ein Feedbackgespräch mit einem Mitarbeiter führen | Nein | persönlich, braucht Fingerspitzengefühl |
| Jeden Freitag die Wochenzahlen aus drei Tools in eine Tabelle sammeln | Ja | regelmäßig, mehrere Programme |

**Fehlerpfad:** Läuft der Timer ab, zählt die Karte als falsch und die Begründung wird angezeigt.
**XP:** 10 pro richtiger Karte (kein zweiter Versuch beim Rapid-Fire).

---

## Level 6 – Der Prozess-Steckbrief

**Lernziel:** Die Lernenden können einen eigenen Prozess-Steckbrief schreiben.

**Merksatz:** Gut beschrieben ist halb gebaut.

**Lehrtext:**
Claude Code baut genau das, was du beschreibst. Je klarer die Beschreibung, desto besser das Ergebnis. Dafür gibt es den Prozess-Steckbrief mit fünf Feldern. **Auslöser:** Was startet den Ablauf? **Schritte:** Was soll der Reihe nach passieren? **Tools:** Welche Programme sind beteiligt? **Ergebnis:** Woran erkennst du, dass es geklappt hat? **Fehlerfall:** Was soll passieren, wenn etwas schiefgeht, zum Beispiel wenn eine E-Mail-Adresse fehlt? Die häufigsten Fehler sind ungenaue Auslöser („wenn was reinkommt“), fehlende Tools und kein Plan für den Fehlerfall. Diesen Steckbrief gibst du in Datei 1.2 an Claude Code, und daraus entsteht deine erste echte Automation.

**Voiceover-Skript (ca. 38 s / 95 Wörter):**
> Claude Code baut genau das, was du ihm beschreibst. Deshalb nutzen wir einen Steckbrief mit fünf Feldern. Erstens der Auslöser: Was startet den Ablauf? Zweitens die Schritte, schön der Reihe nach. Drittens die Tools: Welche Programme sind beteiligt? Viertens das Ergebnis: Woran merkst du, dass es geklappt hat? Und fünftens der Fehlerfall: Was soll passieren, wenn etwas schiefgeht? Gleich schauen wir uns einen Steckbrief an, in dem drei Fehler stecken. Findest du sie? Danach füllst du deinen eigenen aus. Den brauchen wir im nächsten Teil.

**Medienplan:** `ANIMATION` – Beat-Plan: Ein leeres Formular mit fünf Feldern baut sich auf. Bei jedem genannten Feld wird es hervorgehoben und mit einem Beispiel gefüllt: „Neue Anfrage über das Kontaktformular“, „1. Kontakt anlegen, 2. Bestätigung senden, 3. Team informieren“, „Formular, CRM, E-Mail, Team-Chat“, „Kontakt steht im CRM, Kunde hat Mail“, „Fehlt die E-Mail-Adresse: Nachricht an das Team“.

**Interaktion – Finde die 3 Fehler (Sätze anklicken):**
Steckbrief „Terminbuchung“:
1. Auslöser: *„Wenn irgendwas reinkommt.“* → **Fehler:** zu ungenau. Besser: „Wenn jemand im Kalender-Tool einen Termin bucht.“
2. Schritte: „1. Kontakt im CRM anlegen oder aktualisieren. 2. Bestätigungsmail mit Termin und Link senden. 3. Erinnerung einen Tag vorher.“ → korrekt
3. Tools: *„E-Mail.“* → **Fehler:** Kalender-Tool und CRM fehlen.
4. Ergebnis: „Termin steht im CRM, Kunde hat Bestätigung und Erinnerung bekommen.“ → korrekt
5. Fehlerfall: *„Passiert schon nichts.“* → **Fehler:** Es braucht einen Plan, z. B. „Wenn die Mail nicht zugestellt wird: Nachricht ans Team.“

**Danach – eigener Steckbrief (ohne Bewertung):** fünf Textfelder zum Ausfüllen, Speicherung im Browser, Button „Als Text kopieren“ und „Drucken“. Hinweis: „Diesen Steckbrief brauchst du in Datei 1.2.“
**XP:** 20 pro gefundenem Fehler, 10 beim zweiten Versuch, 30 für einen ausgefüllten eigenen Steckbrief.

---

## Abschluss-Check (10 Fragen, gemischt; Fragen und Antworten werden gemischt)

| # | Frage | Richtig | Ablenker | Themen-Hinweis bei Fehler |
|---|---|---|---|---|
| 1 | Was macht n8n? | Es verbindet Programme und führt Abläufe automatisch aus. | Es schreibt Texte für deine Website. · Es ist ein CRM. · Es ersetzt deine E-Mail. | Level 2 |
| 2 | Was macht Claude Code in diesem Kurs? | Es baut, testet und repariert Workflows nach deiner Beschreibung. | Es führt die Workflows rund um die Uhr aus. · Es speichert deine Passwörter. · Es ersetzt n8n. | Level 2 |
| 3 | Was legt Claude Code **nicht** selbst an? | Die Zugangsdaten (Credentials) zu deinen Programmen | Neue Workflows · Neue Nodes · Tests | Level 2 |
| 4 | Was ist ein Trigger? | Der Auslöser, der einen Workflow startet | Eine einzelne Aufgabe im Workflow · Ein Durchlauf · Ein Zugangsschlüssel | Level 3 |
| 5 | Was ist eine Execution? | Ein einzelner Durchlauf eines Workflows | Der gesamte Ablauf · Ein Programm · Ein Fehler | Level 3 |
| 6 | Dein Shop soll n8n sofort Bescheid geben, wenn eine Bestellung eingeht. Was nutzt du? | Webhook | API-Abfrage jede Stunde · MCP · Eine E-Mail an dich | Level 4 |
| 7 | Wofür steht MCP in diesem Kurs? | Eine Schnittstelle, über die eine KI Werkzeuge wie n8n bedienen kann | Ein Programm zum Mailversand · Ein Server-Anbieter · Eine Art Trigger | Level 4 |
| 8 | Welcher Prozess eignet sich am besten für eine Automation? | Jede neue Anfrage ins CRM übernehmen und bestätigen | Ein Preisgespräch mit einem Großkunden · Die Jahresstrategie · Ein Bewerbungsgespräch | Level 5 |
| 9 | Welche drei Fragen prüfen, ob sich eine Automation lohnt? | Regelmäßig? Feste Regeln? Mehrere Programme? | Teuer? Neu? Kompliziert? · Dringend? Wichtig? Spaß? · Online? Mobil? Schnell? | Level 5 |
| 10 | Was gehört in einen Prozess-Steckbrief? | Auslöser, Schritte, Tools, Ergebnis, Fehlerfall | Budget, Logo, Farben · Nur die Tools · Nur das Ergebnis | Level 6 |

**Bestanden ab 7 von 10.** Wiederholen ist jederzeit möglich. XP: 10 pro richtiger Antwort, +25 je abgeschlossenem Level.

**Timo im Vollbild zum Abschluss (ca. 20 s / 50 Wörter):**
> Stark, du hast es geschafft. Du weißt jetzt, was n8n und Claude Code machen, wie eine Automation aufgebaut ist und welche Prozesse sich lohnen. Und du hast deinen ersten Steckbrief. Im nächsten Teil geben wir genau den an Claude Code und schauen zu, wie er deine Automation baut. Bis gleich.

---

## Merkblatt (Zusammenfassungs-Screen, druckbar)

1. Was du zweimal pro Woche von Hand machst, ist ein Kandidat für eine Automation.
2. n8n führt aus, Claude Code baut.
3. Ein Trigger startet den Workflow, Nodes erledigen die Arbeit.
4. API = du fragst nach, Webhook = du wirst benachrichtigt, MCP = die KI darf die Werkzeuge bedienen.
5. Wiederkehrend, regelbasiert, mehrere Tools – dann lohnt es sich.
6. Gut beschrieben ist halb gebaut.

Dazu: der eigene Prozess-Steckbrief und die erreichten XP.

---

## Quellen & Stand (12.10.2026)

- n8n bietet seit August 2026 einen eingebauten MCP-Server auf Instanzebene, den Claude Code per HTTP anbindet: [automationatlas.io](https://automationatlas.io/answers/can-you-build-n8n-workflows-with-claude-code/)
- Claude Code kann über MCP keine Credentials in n8n anlegen: [dailyaiworld.com](https://dailyaiworld.com/public/workflow/claude-code-n8n-build-workflows-10-min-2026)
- Workflows sind für MCP-Clients unsichtbar, bis sie freigegeben werden: [agence-scroll.com](https://agence-scroll.com/en/blog/mcp-n8n-connecter-claude-a-vos-workflows-et-passer-en-production-sans-surprises)

---

## Produktionsschätzung

| Posten | Menge | Kosten |
|---|---|---|
| Seedance-Film Level 1 (1080p, std) | 25 s (15 + 10) | ca. **225 Credits** Higgsfield |
| Bild Level 5 + Startscreen + Abschlussbild | 3 Bilder | ca. **12 Credits** Higgsfield |
| Animationen Level 2–6 (lokal mit HyperFrames gerendert) | 5 Szenen | **0 Credits** |
| Avatar-Spuren (HeyGen, Stimme inklusive) | ca. 4 Min. (6 Level-VOs + Begrüßung + Abschluss) | nach HeyGen-Tarif, **bitte Preis pro Minute prüfen** |
| **Summe Higgsfield** | | **ca. 237 von 940 Credits** |

**Spar-Option:** Den Trailer aus den vorhandenen 480p-Entwürfen nehmen und nur hochskalieren. Spart ca. 225 Credits, sieht aber im Vollbild sichtbar weicher aus.

**Hinweis zu den Animationen:** Die Animationen baue ich lokal mit den HyperFrames-Skills (HTML/GSAP, beat-genau zur Stimme), nicht mehr über den HyperFrames-Cloud-Dienst. Dadurch habe ich volle Kontrolle über Look, Timing und die Schutzzone für den Avatar-Kreis.

**Animations-Regeln (nach den Motion-Graphics-Vorlagen):**
- **Das echte Ding statt Symbol:** Geht es um n8n, sieht man eine nachgebaute n8n-Oberfläche, in der gerade ein Workflow entsteht. Geht es um Claude Code, sieht man ein Terminal, in dem der Satz getippt wird. Eine Rechnung ist ein lesbares Blatt, kein Kreis mit Kürzel.
- **Echte Logos und Screenshots** der erklärten Tools (n8n, Claude Code) aus offiziellen Quellen, jede Aussage gegen die offizielle Doku geprüft. Unser eigenes Branding bleibt weg.
- **Kurzer Text ja, Absätze nein:** Dateiname, Regel, Statusmeldung – kein Code, den man erst lesen muss.
- **Untertitel** in fetter Grotesk, wenige Wörter auf einmal, Schlüsselbegriffe in der Akzentfarbe, nie über dem Avatar-Kreis oder der Grafik.
- **Bewegung nur in der Grafik**, der Avatar-Kreis bleibt fest stehen. Wechsel Vollbild ↔ Kreis als harter Schnitt.
- **Ton:** Stimme vorn (−14 LUFS), Musik sehr leise darunter (−36 bis −38 LUFS), Sounds nur dort, wo im Bild etwas passiert, Gesamtmix −12 LUFS.
- **Look offen:** helle, ruhige Welt aus weißen Karten mit einer Akzentfarbe *oder* der bisher geplante dunkle Look – wird am Probestück entschieden.

---

## Zur Prüfung vor dem „Go“

1. Decken die 6 Level die Lernziele ab – fehlt etwas Handlungsrelevantes für Einsteiger?
2. Stimmen die Fakten (Quellen oben)?
3. Passen Du-Ansprache und Beispiele (Formular, CRM, Termin, Rechnung, Urlaubsanträge, Team-Wochenzahlen) zu Unternehmer:innen **und** Führungskräften/Angestellten?
4. Sind 25–30 Minuten realistisch?
5. Ist die Credit-Schätzung in Ordnung – Trailer in 1080p neu oder Spar-Option?
