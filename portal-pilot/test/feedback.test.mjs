// (f) Feedbackschleife, Teil Vorlage und Werkzeug (ohne Server, ohne Postgres):
//   - Workflow-Vorlage n8n/optional/feedback-lesen.workflow.json: Struktur wie die anderen Pilot-Workflows (Felder, Knoten, Verbindungen auf
//     vorhandene Knoten, manueller Trigger statt Webhook, Credential nur per Name, Settings mit Ausführungsdaten aus und Europe/Berlin,
//     nur der Supabase-Platzhalter, keine Namen), Code-Knoten mit `node --check` übersetzbar
//   - einsetzen.mjs schreibt die Vorlage nach optional/ des Ausgabeordners, ohne Platzhalter-Reste; die vier bisherigen Dateien wie gehabt
//   - der echte Code der Vorlage läuft in dev/n8n-laufzeit.mjs gegen die Speicher-Nachbildung: Zählung, Einträge, Rollen statt Namen, Zeitfenster
//   - agent/feedback.mjs: Auswertung „lesen“ (reine Funktion) und Textausgabe ohne Namen, Signatur
// Die Fälle mit Testserver stehen in server.test.mjs (Speicher) und ende-zu-ende.test.mjs (Postgres, dort auch die Vorlage mit echtem SQL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PILOT } from './hilfe.mjs';

const VORLAGE = join(PILOT, 'n8n', 'optional', 'feedback-lesen.workflow.json');
const w = JSON.parse(readFileSync(VORLAGE, 'utf8'));
const NAMEN = ['Anna Muster', 'Ben Beispiel', 'Clara Probe', 'Dan Test', 'Claude (KI)', 'musterfirma'];

test('Vorlage „Feedback lesen“: Felder, Knoten, Verbindungen, manueller Trigger ohne Webhook, Credential nur per Name, Settings, Platzhalter', () => {
  assert.deepEqual(Object.keys(w).sort(), ['connections', 'name', 'nodes', 'settings']);
  assert.equal(w.name, 'PILOT: Feedback lesen (intern, Claude)');
  assert.deepEqual(w.settings, { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false, saveExecutionProgress: false, timezone: 'Europe/Berlin' });
  const namen = w.nodes.map(n => n.name);
  assert.deepEqual(namen, ['Von Hand starten', 'Zeitfenster', 'Vorschläge', 'Verlauf', 'Aufgaben', 'Störungsnotizen', 'Mitglieder', 'Liste bauen']);
  assert.equal(w.nodes[0].type, 'n8n-nodes-base.manualTrigger', 'nur von Hand oder per MCP startbar');
  assert.ok(!w.nodes.some(n => /webhook|scheduleTrigger|cron|emailSend|chat|message/i.test(n.type)), 'kein Webhook, kein Zeitplan, kein Versand');
  for (const n of w.nodes) {
    assert.match(n.id, /^[0-9a-f-]{36}$/, n.name + ': UUID');
    assert.ok(Array.isArray(n.position) && n.position.length === 2);
    if (n.type === 'n8n-nodes-base.httpRequest') {
      assert.equal(n.parameters.method, 'GET', n.name + ': nur lesen');
      assert.deepEqual(n.credentials, { supabaseApi: { name: 'Supabase (Pilot)' } }, n.name + ': Credential nur per Name');
      assert.equal(n.parameters.nodeCredentialType, 'supabaseApi');
      assert.ok(n.alwaysOutputData === true && n.executeOnce === true, n.name + ': immer eine Ausgabe, nur einmal');
      assert.ok(n.parameters.options.response.response.neverError === true);
      assert.match(n.parameters.url, /^=?https:\/\/HIER_SUPABASE_PROJEKT\.supabase\.co\/rest\/v1\/team_(vorschlaege|aufgaben_verlauf|aufgaben|notizen|mitglieder)\?select=/, n.name);
    }
    if (n.type === 'n8n-nodes-base.code') assert.equal(n.parameters.mode, 'runOnceForAllItems');
  }
  // Mitglieder nur mit ID, Rolle, Typ, Status (keine Namen, keine E-Mail, keine Codes)
  assert.match(w.nodes.find(n => n.name === 'Mitglieder').parameters.url, /select=mitglied_id,rolle,typ,status&/);
  // Verbindungen: eine Kette, jede auf vorhandene Knoten
  for (const [von, c] of Object.entries(w.connections)) { assert.ok(namen.includes(von), von); for (const z of c.main.flat()) assert.ok(namen.includes(z.node), von + ' → ' + z.node); }
  assert.equal(Object.keys(w.connections).length, namen.length - 1);
  const text = JSON.stringify(w);
  assert.deepEqual([...new Set(text.match(/HIER_[A-Z_]+|PILOTKUERZEL/g))], ['HIER_SUPABASE_PROJEKT'], 'nur der Supabase-Platzhalter');
  assert.ok(!/require\(|\$env|\$vars|process\.env|\$getWorkflowStaticData/.test(text));
  for (const n of NAMEN) assert.ok(!text.includes(n), 'kein Name in der Vorlage: ' + n);
});

test('Vorlage: Code-Knoten lassen sich mit node --check übersetzen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-feedback-'));
  for (const n of w.nodes.filter(n => n.parameters && n.parameters.jsCode)) {
    const p = join(dir, n.name.replace(/\W+/g, '_') + '.js');
    writeFileSync(p, '(async function ($, $input, $json, $now) {\n' + n.parameters.jsCode + '\n})');
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(r.status, 0, n.name + ': ' + r.stderr);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('einsetzen.mjs: schreibt die vier bisherigen Dateien und optional/feedback-lesen.workflow.json, ohne Platzhalter-Reste, Kürzel im Namen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-einsetzen-'));
  const r = spawnSync(process.execPath, [join(PILOT, 'n8n', 'einsetzen.mjs'), '--supabase', 'abcdefghijklmnopqrst', '--kuerzel', 'ifa', '--origin', 'https://portal.example.com', '--ausgabe', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(dir).sort(), ['fehler-workflow.workflow.json', 'hinweis-vorschlaege.workflow.json', 'optional', 'portal-api.workflow.json', 'wochenstand.workflow.json']);
  assert.deepEqual(readdirSync(join(dir, 'optional')), ['feedback-lesen.workflow.json']);
  const f = JSON.parse(readFileSync(join(dir, 'optional', 'feedback-lesen.workflow.json'), 'utf8'));
  assert.equal(f.name, 'PILOT: Feedback lesen (intern, Claude) [ifa]');
  const text = JSON.stringify(f);
  assert.ok(!/HIER_[A-Z_]+|PILOTKUERZEL/.test(text), 'kein Platzhalter übrig');
  assert.ok(text.includes('https://abcdefghijklmnopqrst.supabase.co/rest/v1/team_vorschlaege'));
  assert.equal(f.nodes.length, w.nodes.length);
  assert.ok(f.nodes.filter(n => n.credentials).every(n => n.credentials.supabaseApi.name === 'Supabase (Pilot)' && !n.credentials.supabaseApi.id));
  assert.match(r.stdout, /geschrieben: .*optional[\\/]feedback-lesen\.workflow\.json/);
  rmSync(dir, { recursive: true, force: true });
});

test('Vorlage im Testlauf (Speicher-Nachbildung): Zählung und Einträge, Störungsnotiz nur binnen 14 Tagen, Kommentare nur 7 Tage, Rollen statt Namen', async () => {
  const { ladeWorkflow, ausfuehren } = await import('../dev/n8n-laufzeit.mjs');
  const { SpeicherRest } = await import('../dev/postgrest.mjs');
  const { testDaten } = await import('../dev/testdaten.mjs');
  const T = testDaten(); const rest = new SpeicherRest(T);
  const jetzt = new Date().toISOString();
  // zwei Störungsnotizen wie vom Fehler-Workflow: eine frisch, eine 20 Tage alt (fällt raus); dazu eine Notiz, die nur so ähnlich heißt
  await rest.anfrage('POST', 'team_notizen', { notiz_id: 'n_stoerung_20270101', titel: 'Störung 01.01.2027', inhalt: 'Automatische Störungsmeldungen des Portals. Neueste unten.\n\n### 08:15 Uhr – PORTAL: Portal-API (Pilot)\n- Knoten: Team-Daten laden\n- Meldung: timeout\n\n### 09:00 Uhr – PORTAL: Wochenstand (Pilot)\n- Meldung: 401', projekt: 'Onboarding Pilot', autor: 'mf-anna', geaendert_von: 'mf-anna', erstellt: jetzt, geaendert: jetzt }, { prefer: 'return=minimal' });
  await rest.anfrage('POST', 'team_notizen', { notiz_id: 'n_stoerung_alt', titel: 'Störung 01.01.2020', inhalt: 'alt', autor: 'mf-anna', geaendert_von: 'mf-anna', erstellt: jetzt, geaendert: new Date(Date.now() - 20 * 864e5).toISOString() }, { prefer: 'return=minimal' });
  await rest.anfrage('POST', 'team_notizen', { notiz_id: 'n_steuerung', titel: 'Steuerung der Heizung', inhalt: 'keine Störung', autor: 'mf-anna', geaendert_von: 'mf-anna', erstellt: jetzt, geaendert: jetzt }, { prefer: 'return=minimal' });
  // ein alter Kommentar (10 Tage) fällt raus, der Agent hat einen Bericht geschrieben
  await rest.anfrage('POST', 'team_aufgaben_verlauf', { aufgabe_id: 'mf-a12', autor: 'mf-ben', art: 'kommentar', text: 'Alt.', erstellt: new Date(Date.now() - 10 * 864e5).toISOString() }, { prefer: 'return=minimal' });
  await rest.anfrage('POST', 'team_aufgaben_verlauf', { aufgabe_id: 'mf-a12', autor: 'mf-claude', art: 'bericht', text: 'Vom Agenten.', erstellt: jetzt }, { prefer: 'return=minimal' });
  const wf = ladeWorkflow(VORLAGE);
  assert.equal(wf.start.type, 'n8n-nodes-base.manualTrigger'); assert.equal(wf.pfad, '', 'kein Webhook-Pfad');
  const aufrufe = [];
  const r = await ausfuehren(wf, {}, rest, { ohneAntwort: true, aufrufe });
  assert.deepEqual(r.protokoll, ['Von Hand starten', 'Zeitfenster', 'Vorschläge', 'Verlauf', 'Aufgaben', 'Störungsnotizen', 'Mitglieder', 'Liste bauen']);
  assert.deepEqual(aufrufe.map(a => a.knoten + ':' + a.methode + ':' + a.status), ['Vorschläge:GET:200', 'Verlauf:GET:200', 'Aufgaben:GET:200', 'Störungsnotizen:GET:200', 'Mitglieder:GET:200']);
  assert.equal(r.antwort.length, 1, 'ein Item');
  const { zusammenfassung: z, eintraege: E } = r.antwort[0];
  assert.equal(z.vorschlaege_neu, 1); assert.equal(z.vorschlaege_gesamt, 2, 'mf-v1 (neu) und mf-v2 (vor 2 Tagen geändert)'); assert.equal(z.vorschlaege_nachfrage, 0);
  assert.equal(z.kommentare, 6, 'fünf aus dem Seed (7 Tage) plus der Bericht des Agenten, ohne den alten und ohne Statuswechsel');
  assert.equal(z.stoerungen, 1, 'nur die Störung der letzten 14 Tage, nicht „Steuerung“'); assert.equal(z.eintraege, E.length); assert.equal(E.length, 9);
  assert.match(z.stand, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/); assert.ok(z.vorschlaege_und_kommentare_seit < z.stoerungen_seit === false);
  const st = E.find(e => e.art === 'stoerung'); assert.equal(st.id, 'n_stoerung_20270101'); assert.equal(st.meldungen, 2); assert.match(st.text, /^### 09:00 Uhr/); assert.equal(st.rolle, 'admin'); assert.equal(st.bereich, 'Onboarding Pilot');
  const v = E.find(e => e.art === 'vorschlag' && e.id === 'mf-v2'); assert.equal(v.status, 'geplant'); assert.equal(v.rolle, 'team'); assert.equal(v.antwort_von_rolle, 'admin'); assert.equal(v.stimmen, 1); assert.equal(v.bereich, 'Aufgaben');
  const k = E.find(e => e.art === 'kommentar' && e.aufgabe_id === 'mf-a11'); assert.equal(k.titel, 'Checkliste Urlaubsvertretung testen'); assert.equal(k.bereich, 'Interne Verbesserungen'); assert.equal(k.status, 'Wird getestet'); assert.equal(k.rolle, 'team');
  assert.ok(E.some(e => e.art === 'bericht' && e.rolle === 'agent' && e.aufgabe_id === 'mf-a12'));
  assert.ok(!E.some(e => e.text === 'Alt.'), 'alter Kommentar fällt raus');
  assert.ok(E.every((e, i) => i === 0 || String(E[i - 1].zeit) >= String(e.zeit)), 'neueste zuerst');
  for (const e of E) { assert.deepEqual(Object.keys(e).filter(k => ['name', 'email', 'token', 'autor', 'telefon'].includes(k)), [], 'keine Personenfelder'); assert.ok(['admin', 'team', 'agent'].includes(e.rolle), e.rolle); }
  const text = JSON.stringify(r.antwort);
  for (const n of NAMEN.concat(['mf-anna', 'mf-ben', 'mf-clara', 'mf-dan', 'mf-claude'])) assert.ok(!text.includes(n), 'nicht in der Ausgabe: ' + n);
});

test('agent/feedback.mjs: Auswertung „lesen“ aus einer laden-Antwort (reine Funktion), Textausgabe ohne Namen, Unterschrift', async () => {
  const { rueckmeldungen, lesenText, SIGNATUR } = await import('../agent/feedback.mjs');
  const { SpeicherRest } = await import('../dev/postgrest.mjs');
  const { testDaten } = await import('../dev/testdaten.mjs');
  // Antwort von „laden“ für den Agenten nachstellen: so liefert sie „Antwort bauen“ (Mitglieder ohne Kontaktdaten, Vorschläge mit stimmen_anzahl)
  const T = testDaten(); const D = new SpeicherRest(T).laden();
  const jetzt = new Date().toISOString();
  D.notizen.push({ notiz_id: 'n_stoerung_x', titel: 'Störung 02.02.2027', inhalt: 'Kopf\n\n### 10:00 Uhr – PORTAL: Portal-API (Pilot)\n- Meldung: 503', projekt: '', autor: 'mf-anna', geaendert_von: 'mf-anna', erstellt: jetzt, geaendert: jetzt });
  D.verlauf.push({ id: 99, aufgabe_id: 'mf-a12', autor: 'mf-claude', art: 'bericht', text: 'Vom Agenten, zählt nicht als Rückmeldung.', erstellt: jetzt });
  D.vorschlaege = D.vorschlaege.map(v => ({ ...v, stimmen_anzahl: v.stimmen.length, stimmen: undefined }));
  D.mitglieder = D.mitglieder.map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ, funktion: m.funktion }));
  const R = rueckmeldungen(D, 7);
  assert.equal(R.neu.length, 1); assert.equal(R.neu[0].id, 'mf-v1'); assert.equal(R.neu[0].rolle, 'team'); assert.equal(R.neu[0].stimmen, 2);
  assert.equal(R.nachfrage.length, 0); assert.equal(R.beantwortet.length, 1); assert.equal(R.beantwortet[0].antwort_von_rolle, 'admin');
  assert.equal(R.kommentare.length, 5, 'Kommentare der letzten 7 Tage von Menschen'); assert.equal(R.rueckfragen, 1); assert.ok(R.kommentare.find(k => k.rueckfrage).text.includes('?'));
  assert.equal(R.stoerungen.length, 1); assert.equal(R.stoerungen[0].meldungen, 1); assert.match(R.stoerungen[0].letzte, /503/);
  assert.equal(rueckmeldungen(D, 1).kommentare.length, 0, 'Zeitfenster 1 Tag: nichts (Seed-Kommentare sind mindestens 1 Tag alt)');
  const text = lesenText(R);
  assert.match(text, /NEUE VORSCHLÄGE \(1\)/); assert.match(text, /\? mf-a11/); assert.match(text, /STÖRUNGSNOTIZEN \(1\)/); assert.match(text, /n_stoerung_x/);
  for (const n of NAMEN) assert.ok(!text.includes(n), 'kein Name: ' + n);
  assert.equal(SIGNATUR, '— Claude (KI-Werkzeug von Herm' + 'etikmarketing)');
  assert.ok(existsSync(join(PILOT, 'agent', 'feedback.mjs')));
  // Hilfe ohne Zugangsdaten
  const h = spawnSync(process.execPath, [join(PILOT, 'agent', 'feedback.mjs'), '--hilfe'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(h.status, 1, 'ohne Befehl: Hilfe und Code 1'); assert.match(h.stdout, /PILOT_AGENT_TOKEN/); assert.match(h.stdout, /feedback\.mjs antworten/);
});
