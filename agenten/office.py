#!/usr/bin/env python3
"""KI Office von Momentum für Agenten (Hermes, Claude Code, Codex): Aufträge annehmen, Arbeit melden, Ergebnisse ablegen.

Zugang: dieselbe Umgebungsvariable wie für team.py: TEAM_PORTAL_TOKEN (Agenten-Code aus dem Portal, Team → „Agenten-Code kopieren“).
Nur Python-Standardbibliothek. Produktiv spricht das Skript mit dem n8n-Workflow „TEAM: Office-API“.

  office.py meine                               meine Runs (Warteschlange, in Arbeit, wartet …)
  office.py zeige <run_id>                      ein Run mit Zeitleiste, Ergebnissen, Freigaben
  office.py start <run_id> [--n8n-execution ID] Lebenszeichen senden; aus Warteschlange → in Arbeit
  office.py schritt <run_id> "Titel" [--tool NAME] [--quelle REF] [--details JSON]   Ereignis melden
  office.py ergebnis <run_id> "Titel" [--art text|datei|link|commit|notiz|bericht] [--ablage ORT] [--zusammenfassung TEXT]
  office.py frage <run_id> "Frage an einen Menschen"       Run → wartet auf Rückmeldung
  office.py freigabe <run_id> <aktion> '<inhalt-json>' [--vorschau TEXT]   Freigabe für externe Aktion anfordern
  office.py fertig <run_id> "Zusammenfassung"              Run technisch abschließen (fachlich nimmt ein Mensch ab)
  office.py fehler <run_id> "Fehlertext"                   Run als fehlgeschlagen melden
  office.py auftrag <agent_id> "Projekt" "Auftragstext" [--aufgabe AUFGABE_ID]   neuen Auftrag für sich selbst anlegen
  office.py roh <aktion> '<json-daten>'                    beliebige erlaubte Aktion

Regeln: Nur beobachtbare Schritte melden, keine Gedankengänge. Keine Zugangsdaten in Ereignisse oder Ergebnisse schreiben.
Externe Aktionen (E-Mail, Posts, Zahlungen, Löschen, Verträge, Termine) nur nach erteilter Freigabe (Status im Office).
"""
import argparse, json, os, sys, time, urllib.request, uuid

API = os.environ.get('TEAM_OFFICE_API', 'https://n8n.hm-storage.de/webhook/office-api')


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


def main():
    p = argparse.ArgumentParser(description='Momentum KI Office für Agenten')
    p.add_argument('befehl'); p.add_argument('args', nargs='*')
    p.add_argument('--tool'); p.add_argument('--quelle'); p.add_argument('--details'); p.add_argument('--art', default='text')
    p.add_argument('--ablage', default=''); p.add_argument('--zusammenfassung', default=''); p.add_argument('--vorschau', default='')
    p.add_argument('--aufgabe'); p.add_argument('--n8n-execution', dest='n8n'); p.add_argument('--json', action='store_true')
    o = p.parse_args(); b, A = o.befehl, o.args

    if b == 'roh':
        print(json.dumps(api(A[0], json.loads(A[1]) if len(A) > 1 else {}), ensure_ascii=False, indent=2)); return
    if b == 'meine':
        d = api('laden'); ich = d['ich']['mitglied_id']
        meine = [a['agent_id'] for a in d['agenten'] if a.get('mitglied_id') == ich]
        L = [r for r in d['runs'] if r.get('agent_id') in meine and r.get('status') not in ('abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt')]
        print(json.dumps(L, ensure_ascii=False, indent=2) if o.json else ('\n'.join(map(kurz, L)) or 'Nichts offen.')); return
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
        r = api('artefakt', {'run_id': A[0], 'titel': A[1], 'art': o.art, 'ablageort': o.ablage, 'zusammenfassung': o.zusammenfassung}); print('Abgelegt:', r.get('artefakt_id')); return
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
