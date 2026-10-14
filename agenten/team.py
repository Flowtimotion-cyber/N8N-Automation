#!/usr/bin/env python3
"""Team-Portal von Momentum für KI-Agenten (Claude Code, Codex, Hermes).

Zugang: Umgebungsvariable TEAM_PORTAL_TOKEN (Agenten-Code aus dem Portal, Team → „Agenten-Code kopieren“).
Nur Python-Standardbibliothek, läuft überall.

  team.py meine                         offene Aufgaben, die mir zugewiesen sind
  team.py offen                         alle offenen Aufgaben mit „Agent geeignet“
  team.py zeige <aufgabe_id>            eine Aufgabe mit Beschreibung und Verlauf
  team.py start <aufgabe_id>            Status „In Arbeit“
  team.py bericht <aufgabe_id> "Text"   Bericht schreiben, Status „Wird getestet“
  team.py kommentar <aufgabe_id> "Text" nur Kommentar/Rückfrage
  team.py neu "Titel" --projekt "Name" [--beschreibung "..."] [--prio 1|2|3] [--fuer agent-claude|m_...] [--deadline JJJJ-MM-TT]
  team.py projekte | notizen | notiz "Titel"
  team.py notiz-speichern "Titel" --inhalt "Markdown" [--projekt "Name"]
  team.py roh <aktion> '<json-daten>'    beliebige erlaubte Aktion
"""
import argparse, json, os, sys, urllib.request

API = os.environ.get('TEAM_PORTAL_API', 'https://n8n.hm-storage.de/webhook/team-api-v2')


def api(aktion, daten=None):
    token = os.environ.get('TEAM_PORTAL_TOKEN', '').strip()
    if len(token) < 20:
        sys.exit('TEAM_PORTAL_TOKEN fehlt. Den Agenten-Code bekommst du von Timo (Portal → Team → „Agenten-Code kopieren“).')
    body = json.dumps({'token': token, 'aktion': aktion, 'daten': daten or {}}).encode()
    req = urllib.request.Request(API, data=body, headers={'Content-Type': 'text/plain', 'User-Agent': 'momentum-agent/1'})
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


def kurz(a):
    return '%s  [P%s | %s | %s] %s%s' % (a['aufgabe_id'], a.get('prio'), a.get('status'), a.get('projekt'), a.get('titel'),
                                     ('  bis ' + a['deadline']) if a.get('deadline') else '')


def finde(d, aid):
    for a in d['aufgaben']:
        if a['aufgabe_id'] == aid:
            return a
    sys.exit('Aufgabe %s gibt es nicht.' % aid)


def main():
    p = argparse.ArgumentParser(description='Momentum Team-Portal für Agenten')
    p.add_argument('befehl')
    p.add_argument('args', nargs='*')
    p.add_argument('--projekt'); p.add_argument('--beschreibung', default=''); p.add_argument('--prio', type=int, default=2)
    p.add_argument('--fuer'); p.add_argument('--deadline', default=''); p.add_argument('--inhalt', default='')
    p.add_argument('--json', action='store_true', help='Rohdaten als JSON ausgeben')
    o = p.parse_args()
    b, A = o.befehl, o.args

    if b == 'roh':
        print(json.dumps(api(A[0], json.loads(A[1]) if len(A) > 1 else {}), ensure_ascii=False, indent=2)); return
    d = api('laden')
    ich = d['ich']['mitglied_id']
    if b in ('meine', 'offen'):
        ids = d['meine_aufgaben'] if b == 'meine' else d['agent_geeignet']
        L = [a for a in d['aufgaben'] if a['aufgabe_id'] in ids]
        L.sort(key=lambda a: (a.get('prio') or 2, a.get('deadline') or '9999'))
        print(json.dumps(L, ensure_ascii=False, indent=2) if o.json else ('\n'.join(map(kurz, L)) or 'Nichts offen.'))
    elif b == 'zeige':
        a = finde(d, A[0]); V = [v for v in d['verlauf'] if v['aufgabe_id'] == A[0]]
        if o.json:
            print(json.dumps({'aufgabe': a, 'verlauf': V}, ensure_ascii=False, indent=2)); return
        print(kurz(a)); print('Zuständig:', a.get('verantwortlich'), '| Agent geeignet:', a.get('agent_geeignet'))
        print('\n' + (a.get('beschreibung') or '(keine Beschreibung)') + '\n\nVerlauf:')
        for v in V:
            print(' - %s %s (%s): %s' % (v['erstellt'][:16], v['autor'], v['art'], v['text']))
    elif b in ('start', 'bericht'):
        a = finde(d, A[0])
        daten = {'aufgabe_id': a['aufgabe_id'], 'titel': a['titel'], 'status': 'In Arbeit' if b == 'start' else 'Wird getestet'}
        if b == 'start' and not a.get('verantwortlich', '').startswith('agent-'):
            daten['verantwortlich'] = ich
        if b == 'bericht':
            daten['kommentar'] = A[1] if len(A) > 1 else sys.stdin.read()
        api('aufgabe_speichern', daten); print('OK:', daten['status'])
    elif b == 'kommentar':
        api('kommentar', {'aufgabe_id': A[0], 'text': A[1] if len(A) > 1 else sys.stdin.read()}); print('OK')
    elif b == 'neu':
        if not o.projekt:
            sys.exit('Bitte --projekt angeben. Vorhanden: ' + ', '.join(x['name'] for x in d['projekte']))
        r = api('aufgabe_speichern', {'titel': A[0], 'beschreibung': o.beschreibung, 'projekt': o.projekt, 'prio': o.prio,
                                      'status': 'Offen', 'verantwortlich': o.fuer or ich, 'deadline': o.deadline,
                                      'agent_geeignet': (o.fuer or ich).startswith('agent-')})
        print('Angelegt:', r.get('id'))
    elif b == 'projekte':
        for x in d['projekte']:
            print('%s  %s (%s)%s' % (x['projekt_id'], x['name'], x.get('status'), (' – ' + x['beschreibung'][:80]) if x.get('beschreibung') else ''))
    elif b == 'notizen':
        for n in d['notizen']:
            print('%s  %s  [%s]' % (n['notiz_id'], n['titel'], n.get('projekt') or '-'))
    elif b == 'notiz':
        n = next((n for n in d['notizen'] if n['titel'].lower() == A[0].lower()), None)
        print(n['inhalt'] if n else 'Keine Notiz mit diesem Titel.')
    elif b == 'notiz-speichern':
        alt = next((n for n in d['notizen'] if n['titel'].lower() == A[0].lower()), None)
        r = api('notiz_speichern', {'notiz_id': alt['notiz_id'] if alt else None, 'titel': A[0], 'inhalt': o.inhalt or sys.stdin.read(),
                                    'projekt': o.projekt or (alt or {}).get('projekt', '')})
        print('Gespeichert:', r.get('id'))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
