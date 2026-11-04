// (a) PII- und Markenscan: Nichts unter portal-pilot/ darf Angaben des Anbieters, echte Namen, lange Zahlen oder Schlüssel enthalten.
// Die Wortliste steht hier absichtlich zerlegt, damit diese Datei selbst beim Scan (und bei einem grep) sauber bleibt.
// Ausnahmen laut Auftrag: n8n/PRUEFUNG.md darf die Wörter als erklärenden Text enthalten (nicht aber Nummern oder Schlüssel);
// ein Ländervorwahl-Muster in einer Kommentarzeile ist ein Platzhalter. Seit der Feedbackschleife (03.11.2026) außerdem: der Anbietername
// darf GENAU in der vereinbarten Unterschrift des KI-Werkzeugs und im Satz für AVV/Datenschutzinformation stehen („… von <Anbieter>“,
// damit die Tester wissen, wer antwortet); jede andere Erwähnung bleibt ein Treffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { PILOT } from './hilfe.mjs';

const w = (...t) => t.join('');
const WOERTER = [w('mom', 'entum'), w('herm', 'etik'), w('ti', 'mo'), w('ku', 'rt'), w('mu', 'rat'), w('kar', 'sten'), w('lil', 'lien'), w('immo', '-job'), w('q', 'cg'), w('az', 'av'), w('hm-', 'storage'), w('llh', 'wmz'), w('github', '.io'), w('lo', 'om'), w('twe', 'nty'), w('insta', 'gram'), w('tele', 'gram'), w('flowti', 'motion')];
const MUSTER = [
  ['Zahl mit 9 oder mehr Ziffern (Telefon, Chat-ID, Kundennummer)', /\d{9,}/],
  ['JWT / Supabase-Schlüssel', /eyJ[A-Za-z0-9_-]{10,}/],
  ['API-Schlüssel', /\bsk-[A-Za-z0-9]{8,}/],
  ['Telefonnummer mit Ländervorwahl', new RegExp('\\' + w('+', '49')), 'nur Kommentarzeilen erlaubt']
];
const TEXT = new Set(['.html', '.js', '.mjs', '.json', '.md', '.svg', '.css', '.txt', '.sql', '.yml', '.yaml']);
const KOMMENTAR = /^\s*(\/\/|--|\*|<!--|#)/;
const ERKLAERT = ['n8n/PRUEFUNG.md'];
// Vereinbarte Nennung des Anbieters (Unterschrift des KI-Werkzeugs, Satz für AVV und Datenschutzinformation): wird vor dem Wortvergleich entfernt
const ERLAUBT = new RegExp('\\bvon ' + w('Herm', 'etik') + 'marketing\\b', 'gi');

export function dateien(dir, aus = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n); const st = statSync(p);
    if (st.isDirectory()) { if (n !== 'node_modules' && n !== 'screenshots') dateien(p, aus); }
    else if (TEXT.has(extname(n))) aus.push(p);
  }
  return aus;
}

test('Scan über portal-pilot/: keine Anbieter-Angaben, Namen, langen Zahlen, Nummern oder Schlüssel', () => {
  const L = dateien(PILOT);
  assert.ok(L.length >= 30, 'Dateien gefunden: ' + L.length);
  const treffer = [];
  for (const p of L) {
    const inhalt = readFileSync(p, 'utf8'); const rel = relative(PILOT, p).split('\\').join('/');
    inhalt.split('\n').forEach((zeile, i) => {
      const klein = zeile.replace(ERLAUBT, 'von ANBIETER').toLowerCase();
      if (!ERKLAERT.includes(rel)) for (const wort of WOERTER) if (klein.includes(wort)) treffer.push(rel + ':' + (i + 1) + ' enthält „' + wort + '“: ' + zeile.trim().slice(0, 100));
      for (const [name, re, nurKommentar] of MUSTER) if (re.test(zeile) && !(nurKommentar && KOMMENTAR.test(zeile))) treffer.push(rel + ':' + (i + 1) + ' ' + name + ': ' + zeile.trim().slice(0, 100));
    });
  }
  assert.deepEqual(treffer, [], 'Fundstellen:\n' + treffer.join('\n'));
});

test('index.html lädt die Konfiguration und trägt keine feste Webhook- oder Portal-Adresse', () => {
  const html = readFileSync(join(PILOT, 'frontend', 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="../config/mandant.js"></script>'));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(!/n8n\.[a-z0-9-]+\.[a-z]+\/webhook/i.test(html), 'keine feste n8n-Adresse');
  assert.ok(!/https?:\/\/[^'" ]*\/webhook\//.test(html), 'keine feste Webhook-Adresse');
  const extern = [...html.matchAll(/https?:\/\/[^'" <)…]+/g)].map(m => m[0]);
  assert.deepEqual([...new Set(extern)].sort(), ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://wa.me/'], 'nur jsPDF (PDF-Export) und wa.me (Nachricht an ein Teammitglied) als feste Adressen');
});

test('n8n-Workflows (auch optional/): keine Supabase-Projekt-ID, keine Credential-IDs, keine Chat-IDs, Ausführungsdaten aus', () => {
  const ordner = join(PILOT, 'n8n');
  const alle = readdirSync(ordner).filter(x => x.endsWith('.workflow.json')).concat(readdirSync(join(ordner, 'optional')).filter(x => x.endsWith('.workflow.json')).map(x => 'optional/' + x));
  assert.ok(alle.includes('optional/feedback-lesen.workflow.json'));
  for (const f of alle) {
    const w = JSON.parse(readFileSync(join(ordner, f), 'utf8')); const text = JSON.stringify(w);
    assert.ok(!/https:\/\/(?!HIER_SUPABASE_PROJEKT)[a-z0-9]+\.supabase\.co/.test(text), f + ': nur der Platzhalter als Supabase-Adresse');
    for (const n of w.nodes) for (const c of Object.values(n.credentials || {})) assert.ok(!c.id, f + ': Credential ohne ID (' + n.name + ')');
    assert.ok(!/chatId|\bchat_id\b/i.test(text), f + ': keine Chat-ID');
    assert.equal(w.settings.saveDataSuccessExecution, 'none', f); assert.equal(w.settings.saveDataErrorExecution, 'none', f); assert.equal(w.settings.saveManualExecutions, false, f);
    assert.ok(!('errorWorkflow' in w.settings), f + ': kein fester Fehler-Workflow');
    assert.ok(!/require\(|\$env|\$vars|process\.env/.test(text), f + ': kein require/$env/$vars/process.env');
  }
});
