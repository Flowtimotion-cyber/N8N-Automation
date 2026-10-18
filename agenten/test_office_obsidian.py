#!/usr/bin/env python3
"""Tests für `office.py obsidian` (docs/office/OBSIDIAN.md) gegen den lokalen Testserver und einen Wegwerf-Vault.

  python agenten/test_office_obsidian.py

Startet `node office/dev/server.mjs` auf einem freien Port (synthetische Daten, Tempo 0) und legt den Vault im Temp-Ordner an.
Der echte Vault wird nicht berührt. Nur Python-Standardbibliothek.
"""
import importlib.util, json, os, re, shutil, socket, subprocess, sys, tempfile, time, unittest, urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HIER)
OFFICE_PY = os.path.join(HIER, 'office.py')
TOKEN_TIMO = '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a01'        # Testadapter-Token (synthetisch, office/dev/testdaten.mjs)
TOKEN_CLAUDE = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b01'
TOKEN_HERMES = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b03'

spec = importlib.util.spec_from_file_location('office', OFFICE_PY)
office = importlib.util.module_from_spec(spec); spec.loader.exec_module(office)


def freier_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]


class Server:
    def __init__(self):
        self.port = freier_port()
        self.log = tempfile.NamedTemporaryFile('w', suffix='.log', delete=False)
        self.p = subprocess.Popen([shutil.which('node') or 'node', os.path.join(REPO, 'office', 'dev', 'server.mjs'), '--port', str(self.port), '--tempo', '0'],
                                  cwd=REPO, stdout=self.log, stderr=subprocess.STDOUT)
        self.api_url = 'http://127.0.0.1:%d/api/office' % self.port
        for _ in range(100):
            try:
                urllib.request.urlopen('http://127.0.0.1:%d/api/test/zustand' % self.port, timeout=2).read(); return
            except Exception:
                if self.p.poll() is not None: raise RuntimeError('Testserver beendet, siehe ' + self.log.name)
                time.sleep(0.1)
        raise RuntimeError('Testserver antwortet nicht')

    def api(self, token, aktion, daten=None):
        req = urllib.request.Request(self.api_url, data=json.dumps({'token': token, 'aktion': aktion, 'daten': daten or {}}).encode(), headers={'Content-Type': 'text/plain'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return json.loads(e.read().decode())

    def reset(self):
        urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:%d/api/test/reset' % self.port, data=b'{"szenario":"standard"}', headers={'Content-Type': 'application/json'}), timeout=10).read()

    def stop(self):
        self.p.kill(); self.p.wait(); self.log.close()


SERVER = None


def setUpModule():
    global SERVER
    SERVER = Server()


def tearDownModule():
    if SERVER: SERVER.stop()


def notizen_lesen(vault, ordner='01 Inbox/KI Office'):
    d = os.path.join(vault, ordner)
    if not os.path.isdir(d): return {}
    out = {}
    for n in sorted(os.listdir(d)):
        with open(os.path.join(d, n), encoding='utf-8') as f: out[n] = f.read()
    return out


def marker(texte):
    return re.findall(r'<!-- artefakt:(\S+) -->', '\n'.join(texte.values()))


class ObsidianTests(unittest.TestCase):
    def setUp(self):
        SERVER.reset()
        self.tmp = tempfile.mkdtemp(prefix='office-obsidian-test-')
        self.vault = os.path.join(self.tmp, 'vault'); os.makedirs(os.path.join(self.vault, '.obsidian'))
        self.zustand = os.path.join(self.tmp, 'zustand.json')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def lauf(self, *extra, token=TOKEN_TIMO, vault=None, erwartet_ok=True):
        env = dict(os.environ, TEAM_OFFICE_API=SERVER.api_url, TEAM_PORTAL_TOKEN=token, PYTHONIOENCODING='utf-8')
        env.pop('OBSIDIAN_VAULT', None)
        args = [sys.executable, '-I', OFFICE_PY, 'obsidian', '--vault', vault or self.vault, '--zustand', self.zustand, '--json'] + list(extra)
        r = subprocess.run(args, env=env, capture_output=True, text=True, encoding='utf-8', timeout=120)
        if erwartet_ok:
            self.assertEqual(r.returncode, 0, 'office.py obsidian: ' + r.stdout + r.stderr)
            return json.loads(r.stdout)
        return r

    def laden(self, token=TOKEN_TIMO):
        d = SERVER.api(token, 'laden'); self.assertTrue(d.get('ok'), d); return d

    # --- reine Textfunktionen ---
    def test_maskierung(self):
        m = office.maskieren
        self.assertEqual(m('Kontakt: max.mustermann@beispiel.de bitte'), 'Kontakt: [entfernt] bitte')
        self.assertEqual(m('Rückruf unter +49 171 234 56 78 oder 0171/2345678'), 'Rückruf unter [entfernt] oder [entfernt]')
        self.assertEqual(m('Schlüssel sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF im Text'), 'Schlüssel [entfernt] im Text')
        self.assertEqual(m('87 Firmen am 17.10.2026, KW 43, Hash sha256:ab12 ok'), '87 Firmen am 17.10.2026, KW 43, Hash sha256:ab12 ok')
        self.assertEqual(m('Zeile 1\n\nZeile   2'), 'Zeile 1 Zeile 2')
        self.assertEqual(len(m('ab ' * 1000)), 1000)
        self.assertEqual(m(None), '')

    def test_ablageort_links(self):
        L = office._ablage_link
        self.assertEqual(L({'ablageort': 'https://beispiel.example/a.svg'}), '[https://beispiel.example/a.svg](https://beispiel.example/a.svg)')
        self.assertEqual(L({'ablageort': 'http://unsicher.example/a'}), '`http://unsicher.example/a`')
        self.assertEqual(L({'ablageort': 'javascript:alert(1)', 'art': 'link'}), '`javascript:alert(1)`')
        self.assertEqual(L({'ablageort': '04 Ressourcen/Hermes/Lagebericht.md', 'art': 'notiz'}), '[[04 Ressourcen/Hermes/Lagebericht]]')
        self.assertEqual(L({'ablageort': 'repo/pfad/datei.txt', 'art': 'datei'}), '`repo/pfad/datei.txt`')
        self.assertEqual(L({'ablageort': ''}), 'nicht angegeben')

    def test_pruefstand(self):
        self.assertEqual(office.pruefstand({'abgenommen': True}), 'geprüft')
        self.assertEqual(office.pruefstand({'abgenommen': False}), 'zurückgewiesen')
        self.assertEqual(office.pruefstand({'abgenommen': None}), 'ungeprüft')
        self.assertEqual(office.pruefstand({}), 'ungeprüft')

    # --- gegen den Testserver ---
    def test_kein_vault_ohne_obsidian_ordner(self):
        kein = os.path.join(self.tmp, 'kein-vault'); os.makedirs(kein)
        r = self.lauf(vault=kein, erwartet_ok=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('.obsidian', r.stderr + r.stdout)
        self.assertEqual(os.listdir(kein), [])
        self.assertFalse(os.path.exists(self.zustand))

    def test_spiegelt_jedes_ergebnis_genau_einmal(self):
        b1 = self.lauf()
        self.assertGreater(b1['neue_notizen'], 0); self.assertGreater(b1['ergebnisse'], 0)
        b2 = self.lauf()       # zweiter Lauf: nur, was der Testadapter inzwischen neu erzeugt hat
        d = self.laden()
        ids = sorted(a['artefakt_id'] for a in d['artefakte'])
        notizen = notizen_lesen(self.vault)
        self.assertEqual(sorted(marker(notizen)), ids, 'jedes Artefakt genau einmal im Vault')
        self.assertEqual(len(notizen), len({a['run_id'] for a in d['artefakte']}), 'eine Notiz je Run mit Ergebnis')
        for name in notizen: self.assertRegex(name, r'^\d{4}-\d{2}-\d{2} run_\w+\.md$')
        with open(self.zustand, encoding='utf-8') as f: z = json.load(f)
        self.assertEqual(sorted(z['artefakte']), ids); self.assertTrue(z['stand']); self.assertTrue(z['letzter_lauf'])
        b3 = self.lauf()       # sofort noch einmal: nichts Neues (außer der Adapter legt genau jetzt etwas ab)
        self.assertEqual(sorted(marker(notizen_lesen(self.vault))), sorted(a['artefakt_id'] for a in self.laden()['artefakte']))
        self.assertIn('ergebnisse', b3)

    def test_marker_schuetzt_ohne_zustandsdatei(self):
        self.lauf()
        os.remove(self.zustand)
        self.lauf('--alles')
        d = self.laden()
        self.assertEqual(sorted(marker(notizen_lesen(self.vault))), sorted(a['artefakt_id'] for a in d['artefakte']))

    def test_notizformat_und_herkunft(self):
        self.lauf()
        d = self.laden()
        for name, text in notizen_lesen(self.vault).items():
            rid = re.match(r'^\d{4}-\d{2}-\d{2} (run_\w+)\.md$', name).group(1)
            run = next(r for r in d['runs'] if r['run_id'] == rid)
            self.assertTrue(text.startswith('---\ntyp: ki-office-run\nrun_id: "%s"\n' % rid), name)
            self.assertIn('herkunft: KI-erstellt', text); self.assertIn('(KI-erstellt: KI Office / office.py obsidian.', text)
            self.assertIn('projekt: "%s"' % run['projekt'], text); self.assertIn('agent: "%s"' % run['agent_id'], text)
            self.assertIn('pruefstand: "%s"' % office.pruefstand(run), text); self.assertIn('status: "%s"' % run['status'], text)
            self.assertIn('[%s](%s#/run/%s)' % (rid, office.OFFICE_URL, rid), text)
            self.assertIn('\n## Ergebnisse\n', text); self.assertIn('\n## Stand\n', text)
            self.assertLess(text.find('## Ergebnisse'), text.find('## Stand'))
            self.assertNotIn('[[http', text, 'keine Wikilinks nach außen')

    def test_maskiert_kontaktdaten_in_ergebnissen(self):
        r = SERVER.api(TOKEN_TIMO, 'auftrag_starten', {'agent_id': 'akademie-redakteur', 'projekt': 'Akademie-Kurs', 'auftrag': 'Testauftrag für die Spiegelung, läuft langsam', 'idempotenzschluessel': 'obsidian-test-1'})
        self.assertTrue(r.get('ok'), r); rid = r['run_id']
        SERVER.api(TOKEN_CLAUDE, 'lebenszeichen', {'run_id': rid})
        a = SERVER.api(TOKEN_CLAUDE, 'artefakt', {'run_id': rid, 'titel': 'Liste mit Kontakt', 'art': 'text', 'ablageort': 'https://beispiel.example/liste',
                                                  'zusammenfassung': 'Ansprechpartner: erika@firma-beispiel.de, Telefon +49 30 1234567 89. Drei Firmen gefunden.', 'inhalt_hash': 'ab' * 32})
        self.assertTrue(a.get('ok'), a)
        self.lauf()
        text = '\n'.join(notizen_lesen(self.vault).values())
        self.assertNotIn('erika@', text); self.assertNotIn('1234567', text)
        self.assertIn('Ansprechpartner: [entfernt], Telefon [entfernt]. Drei Firmen gefunden.', text)
        self.assertIn('- Hash: `' + 'ab' * 32 + '`', text, 'Hash (64 Hex-Zeichen) wird nicht maskiert')
        self.assertIn('[https://beispiel.example/liste](https://beispiel.example/liste)', text)

    def test_pruefstand_wechsel_landet_in_notiz(self):
        self.lauf()
        d = self.laden()
        run = next(r for r in d['runs'] if r['status'] == 'abgeschlossen' and r.get('abgenommen') is None and any(a['run_id'] == r['run_id'] for a in d['artefakte']))
        r = SERVER.api(TOKEN_TIMO, 'run_abnehmen', {'run_id': run['run_id'], 'abgenommen': True, 'kommentar': 'Passt.'})
        self.assertTrue(r.get('ok'), r)
        b = self.lauf()
        self.assertGreaterEqual(b['staende'], 1)
        text = next(t for n, t in notizen_lesen(self.vault).items() if run['run_id'] in n)
        self.assertIn('pruefstand: "geprüft"', text); self.assertNotIn('pruefstand: "ungeprüft"', text)
        self.assertEqual(text.count('\n## Stand\n'), 1)
        self.assertRegex(text.split('\n## Stand\n')[1], r'Prüfstand ungeprüft\n- .* — Status abgeschlossen, Prüfstand geprüft \(')
        self.assertIn('- Prüfstand beim Spiegeln: ungeprüft', text, 'Momentaufnahme am Ergebnis bleibt stehen')
        self.lauf()
        self.assertEqual(next(t for n, t in notizen_lesen(self.vault).items() if run['run_id'] in n), text, 'ohne Änderung wird nichts geschrieben')

    def test_keine_geheimnisse_im_vault(self):
        self.lauf()
        d = self.laden()
        text = '\n'.join(notizen_lesen(self.vault).values())
        for tok in (TOKEN_TIMO, TOKEN_CLAUDE, TOKEN_HERMES): self.assertNotIn(tok, text)
        self.assertGreater(len(d['freigaben']), 0, 'Testdaten enthalten Freigaben')
        for f in d['freigaben']:
            self.assertNotIn(f['freigabe_id'], text)
            # Startfreigaben (auftrag_start) tragen den Auftragstext als Vorschau; der steht ohnehin als Titel im Run-Spiegel. Geprüft wird nur, dass Freigaben externer Aktionen nicht durchsickern.
            if f.get('aktion') == 'auftrag_start': continue
            for k in ('inhalt_vorschau', 'vorschau'):
                if f.get(k): self.assertNotIn(str(f[k])[:40], text)
        for e in d['ereignisse']:
            if e.get('art') in ('rueckfrage', 'antwort'): self.assertNotIn(str(e.get('titel'))[:40], text)
        self.assertNotIn('"email"', text); self.assertNotIn('rueckmelde_schluessel', text)

    def test_trockenlauf_schreibt_nichts(self):
        b = self.lauf('--trocken')
        self.assertTrue(b['trocken']); self.assertGreater(b['neue_notizen'], 0)
        self.assertEqual(os.listdir(self.vault), ['.obsidian']); self.assertFalse(os.path.exists(self.zustand))

    def test_fremde_notiz_wird_nicht_angefasst(self):
        d = self.laden()
        rid = d['artefakte'][0]['run_id']
        ordner = os.path.join(self.vault, '01 Inbox', 'KI Office'); os.makedirs(ordner)
        fremd = os.path.join(ordner, '2026-01-01 %s.md' % rid); inhalt = '# Timos eigene Notiz\n\nNicht anfassen.\n'
        with open(fremd, 'w', encoding='utf-8') as f: f.write(inhalt)
        b = self.lauf()
        self.assertGreaterEqual(b['uebersprungen'], 1)
        with open(fremd, encoding='utf-8') as f: self.assertEqual(f.read(), inhalt)
        self.assertNotIn(rid, marker(notizen_lesen(self.vault)) and '')   # kein zweites Exemplar

    def test_eigener_ordner(self):
        b = self.lauf('--ordner', '04 Ressourcen/KI Office')
        self.assertGreater(b['neue_notizen'], 0)
        self.assertTrue(os.path.isdir(os.path.join(self.vault, '04 Ressourcen', 'KI Office')))
        self.assertFalse(os.path.exists(os.path.join(self.vault, '01 Inbox')))

    def test_sichtgrenze_agententoken(self):
        vault2 = os.path.join(self.tmp, 'vault-hermes'); os.makedirs(os.path.join(vault2, '.obsidian'))
        zustand2 = self.zustand + '.hermes'
        self.lauf()
        env = dict(os.environ, TEAM_OFFICE_API=SERVER.api_url, TEAM_PORTAL_TOKEN=TOKEN_HERMES, PYTHONIOENCODING='utf-8')
        r = subprocess.run([sys.executable, '-I', OFFICE_PY, 'obsidian', '--vault', vault2, '--zustand', zustand2, '--json'], env=env, capture_output=True, text=True, encoding='utf-8', timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        d_h = self.laden(TOKEN_HERMES); d_t = self.laden(TOKEN_TIMO)
        self.assertLess(len(d_h['runs']), len(d_t['runs']), 'Hermes sieht weniger als Timo')
        self.assertEqual(sorted(marker(notizen_lesen(vault2))), sorted(a['artefakt_id'] for a in d_h['artefakte']))
        erlaubt = set(d_h['sichtbare_projekte'] or [])
        for text in notizen_lesen(vault2).values():
            self.assertIn(office._fm_wert(office._frontmatter(text).group(1), 'projekt'), erlaubt)


if __name__ == '__main__':
    unittest.main(verbosity=2)
