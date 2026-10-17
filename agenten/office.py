#!/usr/bin/env python3
"""KI Office von Momentum für Agenten (Hermes, Claude Code, Codex): Aufträge annehmen, Arbeit melden, Ergebnisse ablegen.

Zugang: dieselbe Umgebungsvariable wie für team.py: TEAM_PORTAL_TOKEN (Agenten-Code aus dem Portal, Team → „Agenten-Code kopieren“).
Nur Python-Standardbibliothek. Produktiv spricht das Skript mit dem n8n-Workflow „TEAM: Office-API“.

  office.py meine                               meine Runs (Warteschlange, in Arbeit, wartet …)
  office.py offen [--ausfuehrer claude-code] [--json]   nur Aufträge in der Warteschlange von Agenten mit diesem Ausführer (für den Abholer)
  office.py zeige <run_id>                      ein Run mit Zeitleiste, Ergebnissen, Freigaben
  office.py start <run_id> [--n8n-execution ID] Lebenszeichen senden; aus Warteschlange → in Arbeit
  office.py schritt <run_id> "Titel" [--tool NAME] [--quelle REF] [--details JSON]   Ereignis melden
  office.py ergebnis <run_id> "Titel" [--art text|datei|link|commit|notiz|bericht] [--ablage ORT] [--zusammenfassung TEXT] [--hash SHA256]
  office.py frage <run_id> "Frage an einen Menschen"       Run → wartet auf Rückmeldung
  office.py freigabe <run_id> <aktion> '<inhalt-json>' [--vorschau TEXT]   Freigabe für externe Aktion anfordern
  office.py fertig <run_id> "Zusammenfassung"              Run technisch abschließen (fachlich nimmt ein Mensch ab)
  office.py fehler <run_id> "Fehlertext"                   Run als fehlgeschlagen melden
  office.py auftrag <agent_id> "Projekt" "Auftragstext" [--aufgabe AUFGABE_ID]   neuen Auftrag für sich selbst anlegen
  office.py roh <aktion> '<json-daten>'                    beliebige erlaubte Aktion
  office.py obsidian [--vault PFAD] [--ordner "01 Inbox/KI Office"] [--trocken] [--alles] [--zustand DATEI]
                                                Ergebnisse (Artefakte) seit dem letzten Lauf als Notizen in den Obsidian-Vault
                                                spiegeln; eine Notiz je Run, jedes Ergebnis genau einmal (docs/office/OBSIDIAN.md).
                                                Vault-Pfad aus --vault oder OBSIDIAN_VAULT; Zustandsdatei liegt neben office.py.

Regeln: Nur beobachtbare Schritte melden, keine Gedankengänge. Keine Zugangsdaten in Ereignisse oder Ergebnisse schreiben.
Externe Aktionen (E-Mail, Posts, Zahlungen, Löschen, Verträge, Termine) nur nach erteilter Freigabe (Status im Office).
"""
import argparse, datetime, json, os, re, sys, time, urllib.request, uuid

API = os.environ.get('TEAM_OFFICE_API', 'https://n8n.hm-storage.de/webhook/office-api')
OFFICE_URL = os.environ.get('TEAM_OFFICE_URL', 'https://flowtimotion-cyber.github.io/N8N-Automation/office/')
ZUSTAND_DATEI = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'office.obsidian.json')
OBSIDIAN_ORDNER = '01 Inbox/KI Office'


def api(aktion, daten=None):
    token = os.environ.get('TEAM_PORTAL_TOKEN', '').strip()
    if len(token) < 20:
        sys.exit('TEAM_PORTAL_TOKEN fehlt. Den Agenten-Code bekommst du von Timo (Portal → Team → „Agenten-Code kopieren“).')
    body = json.dumps({'token': token, 'aktion': aktion, 'daten': daten or {}}).encode()
    req = urllib.request.Request(API, data=body, headers={'Content-Type': 'text/plain', 'User-Agent': 'momentum-office-agent/1'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            res = json.loads(e.read().decode())
        except Exception:
            res = {'ok': False, 'fehler': 'HTTP %s' % e.code}
    if not res.get('ok'):
        sys.exit('Fehler: ' + str(res.get('fehler', res)))
    return res


def kurz(r):
    return '%s  [%s | %s | %s] %s' % (r['run_id'], r.get('status'), r.get('agent_id'), r.get('projekt'), (r.get('auftrag') or '')[:90])


# ---------------------------------------------------------------------------------------------
# Obsidian-Spiegelung (Konzept: docs/office/OBSIDIAN.md)
# Eine Notiz je Run im Vault-Ordner, je Ergebnis ein Abschnitt mit Marker <!-- artefakt:ID -->.
# Nie in den Vault: Token, Freigaben, Zeitleiste, Rückfragen, Mitgliederdaten. Textteil nur anhängen.
# ---------------------------------------------------------------------------------------------

_MASKEN = [
    re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+'),                  # E-Mail-Adressen
    re.compile(r'(?<![\w/.])\+?(?:\d[ \-/()]?){9,}\d(?!\w)'),     # Telefonnummern (10+ Ziffern mit Trennern)
    re.compile(r'(?<![\w/=.-])[A-Za-z0-9_\-]{32,}(?![\w/.-])'),   # Schlüssel/Token-ähnliche Zeichenketten
]


def maskieren(text, limit=1000):
    """Entfernt E-Mail, Telefon und schlüsselartige Zeichenketten aus Freitext, bevor er in den Vault geht."""
    t = ' '.join(str(text or '').split())
    for m in _MASKEN:
        t = m.sub('[entfernt]', t)
    return t[:limit]


def pruefstand(run):
    a = run.get('abgenommen')
    return 'geprüft' if a is True else ('zurückgewiesen' if a is False else 'ungeprüft')


def _zeit(iso):
    """ISO-Zeit (UTC oder mit Offset) als lokale Zeit; liefert (datetime, 'TT.MM.JJJJ HH:MM', 'JJJJ-MM-TT')."""
    try:
        dt = datetime.datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        dt = dt.astimezone()
    except (ValueError, TypeError):
        dt = datetime.datetime.now().astimezone()
    return dt, dt.strftime('%d.%m.%Y %H:%M'), dt.strftime('%Y-%m-%d')


def _yaml(v):
    return '"' + str(v if v is not None else '').replace('\\', '\\\\').replace('"', '\\"') + '"'


def _ablage_link(a):
    ort = str(a.get('ablageort') or '').strip()
    if not ort:
        return 'nicht angegeben'
    if re.match(r'^https://[^\s<>"\']+$', ort):
        return '[%s](%s)' % (ort, ort)
    if a.get('art') == 'notiz' and '://' not in ort and not ort.startswith(('/', '\\')):
        return '[[%s]]' % re.sub(r'\.md$', '', ort).replace(']]', '').replace('[[', '')
    return '`' + ort.replace('`', '') + '`'


def notiz_kopf(run, datum):
    rid = run['run_id']
    titel = maskieren(run.get('auftrag'), 200) or rid
    zeilen = ['---', 'typ: ki-office-run', 'run_id: ' + _yaml(rid), 'projekt: ' + _yaml(run.get('projekt')), 'agent: ' + _yaml(run.get('agent_id')),
              'aufgabe_id: ' + _yaml(run.get('aufgabe_id') or ''), 'status: ' + _yaml(run.get('status')), 'pruefstand: ' + _yaml(pruefstand(run)),
              'erstellt: ' + datum, 'aktualisiert: ' + datum, 'quelle: "KI Office (office.py obsidian)"', 'herkunft: KI-erstellt', '---',
              '# KI Office: ' + titel.replace('#', ''), '',
              '**Run:** [%s](%s#/run/%s) · **Projekt:** %s · **Agent:** %s · **Aufgabe:** %s' % (rid, OFFICE_URL, rid, run.get('projekt') or '-', run.get('agent_id') or '-', run.get('aufgabe_id') or '-'), '',
              '(KI-erstellt: KI Office / office.py obsidian. Ergebnisse des Agenten, nicht von Timo. Fachlich geprüft nur, wenn Prüfstand „geprüft“.)', '',
              '## Ergebnisse', '']
    return '\n'.join(zeilen)


def artefakt_abschnitt(a, run):
    _, wann, _ = _zeit(a.get('erstellt'))
    h = str(a.get('inhalt_hash') or '').strip()
    return '\n'.join(['### %s — %s [%s]' % (wann, maskieren(a.get('titel'), 200) or 'Ergebnis', a.get('art') or 'text'),
                      '<!-- artefakt:%s -->' % a['artefakt_id'],
                      '- Zusammenfassung: ' + (maskieren(a.get('zusammenfassung')) or 'keine'),
                      '- Ablageort: ' + _ablage_link(a),
                      '- Hash: ' + ('`' + re.sub(r'[^\w:.-]', '', h)[:120] + '`' if h else 'nicht gemeldet'),
                      '- Prüfstand beim Spiegeln: ' + pruefstand(run), ''])


def _frontmatter(text):
    m = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n', text, re.S)
    return m


def _fm_wert(fm, feld):
    m = re.search(r'^%s:\s*(.*?)\s*$' % re.escape(feld), fm, re.M)
    if not m:
        return None
    v = m.group(1)
    return v[1:-1].replace('\\"', '"').replace('\\\\', '\\') if len(v) >= 2 and v[0] == v[-1] == '"' else v


def _fm_setzen(fm, feld, wert):
    return re.sub(r'^%s:.*$' % re.escape(feld), lambda _: feld + ': ' + wert, fm, count=1, flags=re.M)


def _stand_zeile(run, wann):
    s = '- %s — Status %s, Prüfstand %s' % (wann, run.get('status') or '-', pruefstand(run))
    if run.get('abgenommen') is not None and run.get('abgenommen_am'):
        s += ' (%s)' % _zeit(run.get('abgenommen_am'))[1]
    return s + '\n'


def obsidian_spiegeln(daten, vault, ordner=OBSIDIAN_ORDNER, zustand=None, trocken=False, jetzt=None):
    """Spiegelt Artefakte aus einer laden-Antwort in den Vault. Liefert (bericht, neuer_zustand). Reine Datei-Logik, testbar ohne Netz."""
    zustand = dict(zustand or {})
    bekannt = set(zustand.get('artefakte') or [])
    jetzt_dt = jetzt or datetime.datetime.now().astimezone()
    heute = jetzt_dt.strftime('%Y-%m-%d'); jetzt_txt = jetzt_dt.strftime('%d.%m.%Y %H:%M')
    ziel = os.path.normpath(os.path.join(vault, ordner))
    runs = {r['run_id']: r for r in daten.get('runs', []) if r.get('run_id')}
    grenze = None
    if zustand.get('stand'):
        grenze = (_zeit(zustand['stand'])[0] - datetime.timedelta(hours=24)).astimezone(datetime.timezone.utc).isoformat()
    neue = [a for a in daten.get('artefakte', []) if a.get('artefakt_id') and a.get('run_id') in runs and a['artefakt_id'] not in bekannt
            and (not grenze or str(a.get('erstellt') or '') >= grenze)]
    neue.sort(key=lambda a: (str(a.get('erstellt') or ''), a['artefakt_id']))
    vorhanden = {}
    if os.path.isdir(ziel):
        for name in os.listdir(ziel):
            m = re.match(r'^\d{4}-\d{2}-\d{2} (\S+)\.md$', name)
            if m:
                vorhanden[m.group(1)] = os.path.join(ziel, name)
    bericht = {'neue_notizen': 0, 'ergebnisse': 0, 'staende': 0, 'uebersprungen': 0, 'ordner': ziel, 'notizen': []}
    je_run = {}
    for a in neue:
        je_run.setdefault(a['run_id'], []).append(a)
    betroffen = list(je_run.keys()) + [rid for rid in vorhanden if rid in runs and rid not in je_run]
    stand_max = zustand.get('stand') or ''
    for rid in betroffen:
        run = runs[rid]; arts = je_run.get(rid, [])
        pfad = vorhanden.get(rid)
        if pfad:
            with open(pfad, encoding='utf-8') as f:
                text = f.read()
            fm = _frontmatter(text)
            if not fm or _fm_wert(fm.group(1), 'typ') != 'ki-office-run':
                bericht['uebersprungen'] += len(arts); continue   # fremde Notiz mit passendem Namen: nicht anfassen
            neu_angelegt = False
        else:
            if not arts:
                continue
            datum = _zeit(arts[0].get('erstellt'))[2]
            pfad = os.path.join(ziel, '%s %s.md' % (datum, re.sub(r'[^\w-]', '', rid)))
            text = notiz_kopf(run, datum); neu_angelegt = True
        geaendert = False
        for a in arts:
            marker = '<!-- artefakt:%s -->' % a['artefakt_id']
            if marker in text:
                bekannt.add(a['artefakt_id']); continue
            abschnitt = artefakt_abschnitt(a, run)
            i = text.find('\n## Stand')
            text = (text[:i].rstrip('\n') + '\n\n' + abschnitt + text[i:]) if i >= 0 else (text.rstrip('\n') + '\n\n' + abschnitt)
            bekannt.add(a['artefakt_id']); bericht['ergebnisse'] += 1; geaendert = True
            if str(a.get('erstellt') or '') > stand_max:
                stand_max = str(a.get('erstellt'))
        fm = _frontmatter(text)
        if fm and (neu_angelegt or _fm_wert(fm.group(1), 'status') != str(run.get('status') or '') or _fm_wert(fm.group(1), 'pruefstand') != pruefstand(run)):
            kopf = _fm_setzen(_fm_setzen(_fm_setzen(fm.group(1), 'status', _yaml(run.get('status'))), 'pruefstand', _yaml(pruefstand(run))), 'aktualisiert', heute)
            text = text[:fm.start(1)] + kopf + text[fm.end(1):]
            if '\n## Stand' not in text:
                text = text.rstrip('\n') + '\n\n## Stand\n'
            text = text.rstrip('\n') + '\n' + _stand_zeile(run, jetzt_txt)
            if not neu_angelegt:
                bericht['staende'] += 1
            geaendert = True
        if not geaendert:
            continue
        if neu_angelegt:
            bericht['neue_notizen'] += 1
        bericht['notizen'].append(os.path.relpath(pfad, vault))
        if not trocken:
            os.makedirs(ziel, exist_ok=True)
            with open(pfad, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text if text.endswith('\n') else text + '\n')
    zustand.update({'stand': stand_max, 'artefakte': sorted(bekannt), 'letzter_lauf': jetzt_dt.isoformat()})
    return bericht, zustand


def obsidian_befehl(o):
    vault = (o.vault or os.environ.get('OBSIDIAN_VAULT') or '').strip().strip('"')
    if not vault:
        sys.exit('Vault-Pfad fehlt: --vault PFAD oder Umgebungsvariable OBSIDIAN_VAULT.')
    vault = os.path.abspath(vault)
    if not os.path.isdir(os.path.join(vault, '.obsidian')):
        sys.exit('Kein Obsidian-Vault (Ordner .obsidian fehlt): ' + vault + ' – nichts geschrieben.')
    zustand_datei = o.zustand or ZUSTAND_DATEI
    zustand = {}
    if not o.alles and os.path.isfile(zustand_datei):
        with open(zustand_datei, encoding='utf-8') as f:
            zustand = json.load(f)
    daten = api('laden')
    bericht, neu = obsidian_spiegeln(daten, vault, ordner=o.ordner or OBSIDIAN_ORDNER, zustand=zustand, trocken=o.trocken)
    if not o.trocken:
        with open(zustand_datei, 'w', encoding='utf-8') as f:
            json.dump(neu, f, ensure_ascii=False, indent=1)
    bericht['trocken'] = bool(o.trocken); bericht['sichtbare_runs'] = len(daten.get('runs', [])); bericht['sichtbare_artefakte'] = len(daten.get('artefakte', []))
    if o.json:
        print(json.dumps(bericht, ensure_ascii=False, indent=2)); return
    print('%sObsidian: %d neue Notizen, %d Ergebnisse angehängt, %d Stände aktualisiert, %d übersprungen · %d Runs / %d Ergebnisse sichtbar · Ordner: %s'
          % ('(Trockenlauf) ' if o.trocken else '', bericht['neue_notizen'], bericht['ergebnisse'], bericht['staende'], bericht['uebersprungen'], bericht['sichtbare_runs'], bericht['sichtbare_artefakte'], bericht['ordner']))
    for n in bericht['notizen']:
        print(' - ' + n)


def main():
    for s in (sys.stdout, sys.stderr):   # Umlaute auch in der Windows-Konsole
        try: s.reconfigure(encoding='utf-8', errors='replace')
        except Exception: pass
    p = argparse.ArgumentParser(description='Momentum KI Office für Agenten')
    p.add_argument('befehl'); p.add_argument('args', nargs='*')
    p.add_argument('--tool'); p.add_argument('--quelle'); p.add_argument('--details'); p.add_argument('--art', default='text')
    p.add_argument('--ablage', default=''); p.add_argument('--zusammenfassung', default=''); p.add_argument('--vorschau', default='')
    p.add_argument('--aufgabe'); p.add_argument('--n8n-execution', dest='n8n'); p.add_argument('--json', action='store_true'); p.add_argument('--ausfuehrer', default='claude-code')
    p.add_argument('--hash', help='SHA-256 (64 Hex-Zeichen) des Ergebnisinhalts, für „ergebnis“')
    p.add_argument('--vault'); p.add_argument('--ordner'); p.add_argument('--zustand'); p.add_argument('--trocken', action='store_true'); p.add_argument('--alles', action='store_true')
    o = p.parse_args(); b, A = o.befehl, o.args

    if b == 'obsidian':
        obsidian_befehl(o); return
    if b == 'roh':
        print(json.dumps(api(A[0], json.loads(A[1]) if len(A) > 1 else {}), ensure_ascii=False, indent=2)); return
    if b == 'meine':
        d = api('laden'); ich = d['ich']['mitglied_id']
        meine = [a['agent_id'] for a in d['agenten'] if a.get('mitglied_id') == ich]
        L = [r for r in d['runs'] if r.get('agent_id') in meine and r.get('status') not in ('abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt')]
        print(json.dumps(L, ensure_ascii=False, indent=2) if o.json else ('\n'.join(map(kurz, L)) or 'Nichts offen.')); return
    if b == 'offen':
        # Alle Claude-Agenten teilen sich eine Token-Identität (agent-claude): 'meine' zeigt deshalb auch Runs der n8n-Agenten.
        # 'offen' filtert zusätzlich nach Ausführer und Status, damit der Abholer nur Aufträge nimmt, die sonst keiner bearbeitet.
        d = api('laden'); ich = d['ich']['mitglied_id']
        reg = {a['agent_id']: a for a in d['agenten'] if a.get('mitglied_id') == ich and a.get('ausfuehrer') == o.ausfuehrer and a.get('aktiv', True)}
        L = [dict(r, agent={k: reg[r['agent_id']].get(k) for k in ('name', 'rolle', 'erlaubte_tools', 'modell', 'timeout_sek')})
             for r in d['runs'] if r.get('agent_id') in reg and r.get('status') == 'warteschlange']
        L.sort(key=lambda r: str(r.get('erstellt') or r.get('run_id')))
        print(json.dumps(L, ensure_ascii=False, indent=2) if o.json else (chr(10).join(map(kurz, L)) or 'Nichts in der Warteschlange.')); return
    if b == 'zeige':
        d = api('laden'); r = next((x for x in d['runs'] if x['run_id'] == A[0]), None)
        if not r: sys.exit('Run %s nicht sichtbar.' % A[0])
        E = [e for e in d['ereignisse'] if e['run_id'] == A[0]]; T = [a for a in d['artefakte'] if a['run_id'] == A[0]]; F = [f for f in d['freigaben'] if f['run_id'] == A[0]]
        if o.json: print(json.dumps({'run': r, 'ereignisse': E, 'artefakte': T, 'freigaben': F}, ensure_ascii=False, indent=2)); return
        print(kurz(r)); print('Auftraggeber:', r.get('auftraggeber'), '| Versuch', r.get('versuche'), '/', r.get('max_versuche'), '| Aufgabe:', r.get('aufgabe_id') or '-')
        print('\n' + (r.get('auftrag') or '') + '\n\nZeitleiste:')
        for e in E: print(' - %s %s (%s): %s' % (str(e.get('zeit', ''))[:16], e.get('autor'), e.get('art'), e.get('titel')))
        for a in T: print(' * Ergebnis: %s [%s] %s' % (a.get('titel'), a.get('art'), a.get('ablageort') or ''))
        for f in F: print(' ! Freigabe %s: %s (%s)' % (f.get('freigabe_id'), f.get('aktion'), f.get('status')))
        return
    if b == 'start':
        d = {'run_id': A[0]}
        if o.n8n: d['n8n_execution_id'] = o.n8n
        print('OK:', api('lebenszeichen', d).get('status')); return
    if b == 'schritt':
        d = {'run_id': A[0], 'art': 'tool' if o.tool else 'schritt', 'titel': A[1], 'idempotenz': 'ev-' + uuid.uuid4().hex[:16]}
        if o.tool: d['tool'] = o.tool
        if o.quelle: d['art'] = 'quelle' if not o.tool else d['art']; d['quelle_ref'] = o.quelle
        if o.details: d['details'] = json.loads(o.details)
        api('ereignis', d); print('OK'); return
    if b == 'ergebnis':
        d = {'run_id': A[0], 'titel': A[1], 'art': o.art, 'ablageort': o.ablage, 'zusammenfassung': o.zusammenfassung}
        if o.hash: d['inhalt_hash'] = o.hash
        r = api('artefakt', d); print('Abgelegt:', r.get('artefakt_id')); return
    if b == 'frage':
        api('rueckfrage', {'run_id': A[0], 'frage': A[1]}); print('OK: wartet auf Rückmeldung'); return
    if b == 'freigabe':
        r = api('freigabe_anfordern', {'run_id': A[0], 'aktion': A[1], 'inhalt': json.loads(A[2]) if len(A) > 2 else {}, 'vorschau': o.vorschau}); print('Freigabe angefordert:', r.get('freigabe_id'), r.get('status')); return
    if b in ('fertig', 'fehler'):
        d = {'run_id': A[0], 'status': 'abgeschlossen' if b == 'fertig' else 'fehlgeschlagen'}
        d['zusammenfassung' if b == 'fertig' else 'fehler'] = A[1] if len(A) > 1 else sys.stdin.read()
        r = api('run_beenden', d); print('OK:', r.get('status'), '(angenommen)' if r.get('angenommen') else '(verspätet, Status unverändert)'); return
    if b == 'auftrag':
        d = {'agent_id': A[0], 'projekt': A[1], 'auftrag': A[2], 'idempotenzschluessel': 'cli-' + uuid.uuid4().hex[:20]}
        if o.aufgabe: d['aufgabe_id'] = o.aufgabe
        r = api('auftrag_starten', d); print('Angelegt:', r.get('run_id'), r.get('status')); return
    print(__doc__)


if __name__ == '__main__':
    main()
