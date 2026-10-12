"""Align script words to Scribe word timings (Scribe spelling may differ)."""
import json, re, difflib, pathlib

SCRIPTS = {
 "L1": "Hallo und willkommen. Stell dir vor, du hast einen Mitarbeiter, der nie müde wird. Er kopiert keine Daten mehr von A nach B, vergisst keine Erinnerung und arbeitet auch nachts. Genau das baust du in diesem Modul. Und das Beste: Du musst dafür nicht programmieren können. Du beschreibst einfach, was passieren soll. Bevor wir loslegen, schauen wir kurz, wo bei dir die meiste Zeit verloren geht.",
 "L2": "Für unsere Automationen brauchen wir zwei Werkzeuge. Das erste ist n8n. n8n verbindet deine Programme, also E-Mail, Kalender, Tabellen oder dein CRM, und führt Abläufe automatisch aus. Tag und Nacht. Das zweite ist Claude Code. Claude Code ist eine KI, die nicht nur redet, sondern selbst arbeitet. Du beschreibst ihm, was passieren soll, und er baut den Ablauf in n8n, testet ihn und repariert ihn, wenn etwas hakt. Merk dir ein Bild: n8n ist der Motor. Claude Code ist der Baumeister. Nur deine Passwörter, die trägst du selbst ein.",
 "L3": "Jede Automation besteht aus fünf Bausteinen. Stell dir ein Fließband vor. Das ganze Band heißt Workflow. Damit es losläuft, braucht es einen Auslöser, den Trigger. Das kann eine neue E-Mail sein, ein ausgefülltes Formular oder einfach jeden Montag um acht Uhr. Auf dem Band gibt es Stationen. Jede Station heißt Node und erledigt genau eine Aufgabe. Damit die Stationen in deine Programme dürfen, brauchen sie Schlüssel. Das sind die Credentials. Und jedes Mal, wenn das Band einmal durchläuft, entsteht eine Execution. Die kannst du dir später anschauen, auch wenn mal etwas schiefgeht.",
 "L4": "Damit Programme zusammenarbeiten, brauchen sie Schnittstellen. Die bekannteste ist die API. Das ist wie im Restaurant: Du bestellst, der Kellner bringt dir, was du willst. Ein Programm fragt also nach und bekommt eine Antwort. Ein Webhook funktioniert andersherum, wie eine Türklingel. Du musst nicht ständig nachschauen, ob jemand da ist, es klingelt einfach, sobald etwas passiert. Und dann gibt es MCP. MCP ist wie ein Dolmetscher zwischen der KI und deinen Werkzeugen. Er erklärt Claude, welche Knöpfe es in n8n gibt, damit Claude sie selbst bedienen kann.",
 "L5": "Nicht alles sollte man automatisieren. Stell dir drei Fragen. Erstens: Passiert es regelmäßig? Einmal im Jahr lohnt sich der Aufwand meist nicht. Zweitens: Gibt es klare Regeln? Wenn du es mit „wenn dies, dann das“ beschreiben kannst, kann es auch eine Automation. Ein schwieriges Kundengespräch dagegen bleibt bei dir. Drittens: Sind mehrere Programme beteiligt? Genau dort, wo du Daten von einem Tool ins nächste kopierst, liegt die meiste verschenkte Zeit. Dreimal Ja heißt: Das ist dein Kandidat.",
 "L6": "Claude Code baut genau das, was du ihm beschreibst. Deshalb nutzen wir einen Steckbrief mit fünf Feldern. Erstens der Auslöser: Was startet den Ablauf? Zweitens die Schritte, schön der Reihe nach. Drittens die Tools: Welche Programme sind beteiligt? Viertens das Ergebnis: Woran merkst du, dass es geklappt hat? Und fünftens der Fehlerfall: Was soll passieren, wenn etwas schiefgeht? Gleich schauen wir uns einen Steckbrief an, in dem drei Fehler stecken. Findest du sie? Danach füllst du deinen eigenen aus. Den brauchen wir im nächsten Teil.",
 "END": "Stark, du hast es geschafft. Du weißt jetzt, was n8n und Claude Code machen, wie eine Automation aufgebaut ist und welche Prozesse sich lohnen. Und du hast deinen ersten Steckbrief. Im nächsten Teil geben wir genau den an Claude Code und schauen zu, wie er deine Automation baut. Bis gleich.",
}

def norm(w):
    w = w.lower()
    w = re.sub(r"[^\wäöüß]", "", w)
    return {"nachten": "n8n", "cloud": "claude", "n8n": "n8n"}.get(w, w)

def align(key, words_path):
    tr = json.loads(pathlib.Path(words_path).read_text())[key]
    script = SCRIPTS[key].split()
    a = [norm(w) for w in script]
    b = [norm(w[0]) for w in tr]
    times = [None] * len(script)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for blk in sm.get_matching_blocks():
        for i in range(blk.size):
            times[blk.a + i] = (tr[blk.b + i][1], tr[blk.b + i][2])
    # interpolate gaps
    for i in range(len(times)):
        if times[i] is None:
            prev = next((times[j] for j in range(i - 1, -1, -1) if times[j]), (0, 0))
            nxt = next((times[j] for j in range(i + 1, len(times)) if times[j]), (prev[1] + .3, prev[1] + .5))
            times[i] = (prev[1] + .02, max(prev[1] + .05, nxt[0] - .02))
    return [(w, round(s, 2), round(e, 2)) for w, (s, e) in zip(script, times)]

class Beats:
    def __init__(self, key, words_path):
        self.w = align(key, words_path)
    def t(self, word, n=1):
        """start time of nth occurrence of a script word (punctuation ignored)."""
        c = 0
        for w, s, e in self.w:
            if norm(w) == norm(word):
                c += 1
                if c == n:
                    return s
        raise KeyError(word)
    def end(self):
        return self.w[-1][2]
