// Ausführer des Orchestrierers (office/n8n/ausfuehrer-orchestrierer.workflow.js): Die Code-Knoten „Zerlegen“, „Teams prüfen“ und „Ablage prüfen“
// werden aus der SDK-Datei gelesen und in einer n8n-ähnlichen Sandbox gegen echte laden-Antworten des Testspeichers ausgeführt (TESTADAPTER, nichts produktiv).
// Dazu Hygiene der Datei: keine Zugangsdaten, Webhook-Pfad, jede $('Knoten')-Referenz zeigt auf einen vorhandenen Knoten, Mehrfach-Items mit .item statt .first().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { TOKENS, testSpeicher } from '../dev/testdaten.mjs';

const DATEI = new URL('../n8n/ausfuehrer-orchestrierer.workflow.js', import.meta.url);
const quelle = readFileSync(DATEI, 'utf8').replace(/\r\n/g, '\n');

/** Die Template-Literale der Code-Knoten als Strings (so, wie n8n sie bekommt). */
function codeKnoten() {
  const out = {};
  for (const m of quelle.matchAll(/const (CODE_[A-Z]+) = (`[\s\S]*?`);\n/g)) out[m[1]] = new Function('return ' + m[2])();
  return out;
}
/** Sandbox wie im Code-Knoten: $('Name').first()/.all(), $input, $execution, $workflow. Mehrere Items je Knoten als Array. */
function sandbox(code, knoten, input) {
  const items = v => (Array.isArray(v) ? v : [v]).map(json => ({ json }));
  const ctx = {
    $: name => { if (!(name in knoten)) throw new Error('Referenced node is unexecuted: ' + name); return { first: () => items(knoten[name])[0], all: () => items(knoten[name]), item: items(knoten[name])[0] }; },
    $input: { first: () => items(input || {})[0], all: () => items(input || []) },
    $execution: { id: 'exec-test-1' }, $workflow: { name: 'TEAM: Office-Ausführer orchestrierer (Test)' }
  };
  // JSON-Umweg: Objekte aus der Sandbox gehören einem anderen Realm (deepEqual würde sonst an den Prototypen scheitern)
  return JSON.parse(JSON.stringify(vm.runInNewContext('(function(){' + code + '})()', ctx)));
}
function welt() {
  const { speicher, runs } = testSpeicher({ jetzt: '2026-10-17T10:00:00Z' });
  const als = (wer, aktion, daten) => speicher.aufruf({ token: TOKENS[wer], aktion, daten });
  const laden = () => als('agent-claude', 'laden').antwort;
  return { speicher, runs, als, laden };
}

test('Zerlegen: Zeilen und Semikolons, @agent-id, Kandidaten in Registry-Reihenfolge, Nummerierung', () => {
  const C = codeKnoten();
  const w = welt();
  const r = w.als('m_timo', 'auftrag_starten', { agent_id: 'orchestrierer', projekt: 'Akademie-Kurs', idempotenzschluessel: 'test-orch-zerlegen-1',
    auftrag: '@kurs-waechter: Kursstatus Modul 1.2 prüfen\nMerkblatt Modul 1.2 schreiben; - Quizfragen zu Modul 1.2 entwerfen\n\n;  ' });
  assert.equal(r.code, 200, JSON.stringify(r.antwort));
  const D = w.laden();
  const out = sandbox(C.CODE_ZERLEGEN, { 'Zugang prüfen': { token: 'x', run_id: r.antwort.run_id }, 'Daten laden': D });
  const X = out[0].json;
  assert.equal(X.projekt, 'Akademie-Kurs'); assert.equal(X.team_id, 'team-' + r.antwort.run_id); assert.equal(X.zeilen, 3);
  assert.deepEqual(X.kandidaten, ['akademie-redakteur', 'kurs-waechter', 'verwaltung-status'], 'aktive Agenten des Projekts ohne auftrag_delegieren, Registry-Reihenfolge, nie der Orchestrierer selbst');
  assert.deepEqual(X.teile.map(t => [t.n, t.agent_id, t.auftrag]), [
    [1, 'kurs-waechter', 'Teil 1 von 3: Kursstatus Modul 1.2 prüfen'],
    [2, 'akademie-redakteur', 'Teil 2 von 3: Merkblatt Modul 1.2 schreiben'],
    [3, 'kurs-waechter', 'Teil 3 von 3: Quizfragen zu Modul 1.2 entwerfen']
  ]);
  assert.deepEqual(X.gewaehlt.map(g => g.agent_id), ['kurs-waechter', 'akademie-redakteur']);
  assert.equal(typeof X.aufgaben_offen, 'number'); assert.ok(X.agenten_gesamt >= 13);
  // Items für „Delegieren“: Idempotenzschlüssel deleg-<run_id>-<n>, Team team-<run_id>
  const T = sandbox(C.CODE_TEILE, { 'Zugang prüfen': { token: 'tok', run_id: r.antwort.run_id }, 'Zerlegen': X });
  assert.equal(T.length, 3); assert.equal(T[2].json.idempotenzschluessel, 'deleg-' + r.antwort.run_id + '-3'); assert.equal(T[0].json.team_id, 'team-' + r.antwort.run_id); assert.equal(T[0].json.token, 'tok');
});

test('Zerlegen: leerer Auftrag, unbekannter oder nicht zugeordneter @agent, Orchestrierer als Ziel → Fehler, nichts delegiert', () => {
  const C = codeKnoten();
  const w = welt();
  const start = (auftrag, key) => w.als('m_timo', 'auftrag_starten', { agent_id: 'orchestrierer', projekt: 'Akademie-Kurs', idempotenzschluessel: key, auftrag }).antwort.run_id;
  const lauf = run_id => sandbox(C.CODE_ZERLEGEN, { 'Zugang prüfen': { token: 'x', run_id }, 'Daten laden': w.laden() });
  assert.throws(() => lauf(start('ab; x ; ', 'test-orch-leer')), /Zerlegung leer/);
  assert.throws(() => lauf(start('@gibt-es-nicht: Irgendwas tun', 'test-orch-unbekannt')), /nicht in der Registry/);
  assert.throws(() => lauf(start('@marketing-texter: Text schreiben', 'test-orch-projekt')), /nicht zugeordnet/);
  assert.throws(() => lauf(start('@orchestrierer: Weiterreichen', 'test-orch-selbst')), /selbst Orchestrierer/);
  assert.throws(() => lauf(start('@kurs-waechter: ok\nZeile zwei', 'test-orch-gemischt')), /ok|Zeile/, 'Fehler in einer Zeile stoppt alles');
  assert.throws(() => sandbox(C.CODE_ZERLEGEN, { 'Zugang prüfen': { token: 'x', run_id: 'run_fremd' }, 'Daten laden': w.laden() }), /nicht sichtbar/);
  assert.throws(() => sandbox(C.CODE_ZERLEGEN, { 'Zugang prüfen': { token: 'x', run_id: 'r' }, 'Daten laden': { ok: false, fehler: 'Zugang ungültig' } }), /Office-API laden/);
});

test('Delegation prüfen: Antworten je Teil zuordnen, Fehlschläge zählen, ohne Erfolg → Fehler', () => {
  const C = codeKnoten();
  const Z = { token: 't', run_id: 'run_e' };
  const X = { run_id: 'run_e', team_id: 'team-run_e', n8n_execution_id: 'exec-test-1' };
  const T = [{ n: 1, agent_id: 'a', agent_name: 'A', team_id: 'team-run_e' }, { n: 2, agent_id: 'b', agent_name: 'B', team_id: 'team-run_e' }];
  const R = [{ statusCode: 200, body: { ok: true, run_id: 'run_k1', team_id: 'team-run_e' } }, { statusCode: 403, body: JSON.stringify({ ok: false, fehler: 'Projektgrenze' }) }];
  const out = sandbox(C.CODE_DELEGATION, { 'Zugang prüfen': Z, 'Zerlegen': X, 'Teile aufteilen': T }, R)[0].json;
  assert.equal(out.delegiert, 1); assert.equal(out.nicht_delegiert, 1);
  assert.match(out.ereignis.titel, /^1 Teilaufträge delegiert, 1 nicht delegiert/);
  assert.deepEqual(out.ereignis.details.kinder.map(k => k.kind_run_id), ['run_k1']);
  assert.deepEqual(out.ereignis.details.fehlgeschlagen.map(f => [f.n, f.http, f.fehler]), [[2, 403, 'Projektgrenze']]);
  assert.equal(out.ereignis.idempotenz, 'orch-delegiert-run_e-exec-test-1');
  assert.throws(() => sandbox(C.CODE_DELEGATION, { 'Zugang prüfen': Z, 'Zerlegen': X, 'Teile aufteilen': T }, [{ statusCode: 500, body: 'kaputt' }, { statusCode: 409, body: { ok: false, fehler: 'nicht in Arbeit' } }]), /Keine Delegation gelungen/);
});

test('Teams prüfen: wartet, solange ein Kind läuft; führt zusammen, wenn alle Kinder beendet sind (Status je Teil, Fehlertext)', () => {
  const C = codeKnoten();
  const w = welt();
  const Z = { token: 'x', mitglied_id: 'agent-claude', agent_id: 'orchestrierer' };
  const vorher = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': w.laden() });
  assert.equal(vorher.length, 0, 'r13 hat ein laufendes Kind → noch nichts zusammenführen');
  // Das laufende Kind abbrechen → alle Kinder in einem Endzustand, aber nicht alle abgeschlossen
  const kinder = w.runs.kinder13.map(id => w.speicher.T.office_runs.find(r => r.run_id === id));
  const offen = kinder.find(k => k.status === 'in_arbeit'); assert.ok(offen);
  assert.equal(w.als('m_timo', 'run_abbrechen', { run_id: offen.run_id, grund: 'Test' }).code, 200);
  const D = w.laden();
  const out = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D });
  assert.equal(out.length, 1);
  const T = out[0].json;
  assert.equal(T.run_id, w.runs.r13); assert.equal(T.status, 'fehlgeschlagen'); assert.match(T.fehler, /1 von 2 Teilaufträgen nicht abgeschlossen/); assert.match(T.fehler, /abgebrochen/);
  assert.equal(T.titel, 'Teamergebnis ' + w.runs.r13); assert.equal(T.notiz.notiz_id, 'n_office_teamergebnis_' + w.runs.r13); assert.equal(T.notiz.projekt, 'Akademie-Kurs'); assert.equal(T.notiz.autor, 'agent-claude');
  assert.match(T.text, /## Teil 1 – Akademie-Redakteur \(abgeschlossen/); assert.match(T.text, /## Teil 2 – Kurs-Wächter \(abgebrochen/); assert.match(T.text, /## Fehler/);
  assert.ok(T.text.includes('Ergebnis: '), 'Zusammenfassung des abgeschlossenen Kinds steht im Text');
  assert.ok(T.kurz.length <= 3400 && T.kurz.startsWith('Team mit 2 Teilaufträgen: 1 abgeschlossen, 1 nicht abgeschlossen.'));
  assert.equal(T.artefakt_noetig, true); assert.equal(T.token, 'x');
  assert.deepEqual(T.kinder.map(k => k.status), ['abgeschlossen', 'abgebrochen']);
  // Artefakt mit gleichem Titel vorhanden → kein zweites Artefakt
  const D2 = JSON.parse(JSON.stringify(D)); D2.artefakte.push({ artefakt_id: 'art_x', run_id: w.runs.r13, titel: T.titel, art: 'notiz' });
  assert.equal(sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D2 })[0].json.artefakt_noetig, false);
  // Nicht delegierte Teile aus dem Ereignis des Webhook-Pfads werden zum Fehler
  const D3 = JSON.parse(JSON.stringify(D)); D3.runs.forEach(r => { if (r.run_id === offen.run_id) r.status = 'abgeschlossen'; });
  D3.ereignisse.push({ run_id: w.runs.r13, art: 'schritt', titel: '1 Teilaufträge delegiert, 1 nicht delegiert', details: { fehlgeschlagen: [{ n: 2, agent_id: 'kurs-waechter', http: 403, fehler: 'Projektgrenze' }] } });
  const T3 = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D3 })[0].json;
  assert.equal(T3.status, 'fehlgeschlagen'); assert.match(T3.fehler, /konnten nicht delegiert werden: Teil 2 \(kurs-waechter\): Projektgrenze/);
  D3.ereignisse.pop();
  assert.equal(sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D3 })[0].json.status, 'abgeschlossen', 'alle Kinder abgeschlossen → abgeschlossen');
  // Echter Weg über die Office-API: verschachtelte Details kommen als JSON-Text zurück (klein()), lange Listen gekürzt → trotzdem „fehlgeschlagen“
  const abschluss = id => w.speicher.T.office_runs.find(r => r.run_id === id);
  const kindAbschliessen = () => { const k = abschluss(offen.run_id); k.status = 'abgeschlossen'; };
  kindAbschliessen();
  const ev = w.als('agent-claude', 'ereignis', { run_id: w.runs.r13, art: 'schritt', titel: '1 Teilaufträge delegiert, 1 nicht delegiert (Team x)', details: { fehlgeschlagen: [{ n: 3, agent_id: 'kurs-waechter', http: 403, fehler: 'Projektgrenze' }] } });
  assert.equal(ev.code, 200, JSON.stringify(ev.antwort));
  const D5 = w.laden();
  const gespeichert = D5.ereignisse.find(e => e.run_id === w.runs.r13 && /nicht delegiert/.test(e.titel));
  assert.equal(typeof gespeichert.details.fehlgeschlagen, 'string', 'Office-API speichert verschachtelte Details als Text');
  const T5 = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D5 })[0].json;
  assert.equal(T5.status, 'fehlgeschlagen'); assert.match(T5.fehler, /1 Teilaufträge konnten nicht delegiert werden: Teil 3 \(kurs-waechter\): Projektgrenze/);
  // Gekürzter Text (über 1000 Zeichen) → Anzahl aus dem Titel
  const D6 = JSON.parse(JSON.stringify(D5)); D6.ereignisse.find(e => e === gespeichert || (e.run_id === w.runs.r13 && /nicht delegiert/.test(e.titel))).details.fehlgeschlagen = '[{"n":3,"agent_id":"kurs-wae';
  const T6 = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D6 })[0].json;
  assert.equal(T6.status, 'fehlgeschlagen'); assert.match(T6.fehler, /1 Teilaufträge konnten nicht delegiert werden: Teil \? \(\?\): Details gekürzt/);
  // Geheimnisse aus Kind-Zusammenfassungen bleiben draußen
  const D4 = JSON.parse(JSON.stringify(D)); D4.runs.find(r => r.run_id === kinder[0].run_id).zusammenfassung = 'Alles gut.\nPasswort: geheim123\nZweite Zeile.';
  const T4 = sandbox(C.CODE_TEAMS, { 'Token prüfen': Z, 'Daten laden (Zeitplan)': D4 })[0].json;
  assert.ok(!T4.text.includes('geheim123') && T4.text.includes('Zweite Zeile'));
});

test('Ablage prüfen: zwei Teams in einem Lauf bleiben getrennt (Reihenfolge, Notiz-HTTP je Team, Fehlertext nur beim Fehlschlag)', () => {
  const C = codeKnoten();
  const team = (id, status, fehler) => ({ token: 't', run_id: id, projekt: 'P', team_id: 'team-' + id, status, fehler, titel: 'Teamergebnis ' + id, text: 'x'.repeat(50), kurz: 'Kurz ' + id, kinder: [{ run_id: 'k1', agent_id: 'a', status: 'abgeschlossen' }, { run_id: 'k2', agent_id: 'b', status }], artefakt_noetig: true, notiz: { notiz_id: 'n_office_teamergebnis_' + id }, n8n_execution_id: 'exec-test-1' });
  const T = [team('run_a', 'abgeschlossen', null), team('run_b', 'fehlgeschlagen', '1 von 2 Teilaufträgen nicht abgeschlossen')];
  const out = sandbox(C.CODE_ABLAGE, { 'Teams prüfen': T }, [{ statusCode: 201, body: '' }, { statusCode: 500, body: 'Fehler' }]).map(i => i.json);
  assert.equal(out.length, 2);
  assert.equal(out[0].run_id, 'run_a'); assert.equal(out[0].beenden.status, 'abgeschlossen'); assert.equal(out[0].beenden.fehler, undefined);
  assert.equal(out[0].ereignis.tool, 'notiz_speichern'); assert.equal(out[0].ereignis.quelle_ref, 'team_notizen/n_office_teamergebnis_run_a'); assert.equal(out[0].ereignis.idempotenz, 'orch-zusammen-run_a');
  assert.equal(out[0].artefakt.art, 'notiz'); assert.equal(out[0].artefakt.titel, 'Teamergebnis run_a'); assert.match(out[0].artefakt.ablageort, /^Notiz „Teamergebnis run_a“ im Projekt „P“/); assert.equal(out[0].artefakt.groesse, 50);
  assert.match(out[0].beenden.zusammenfassung, /^Kurz run_a Vollständiges Teamergebnis: Notiz/);
  assert.equal(out[1].run_id, 'run_b'); assert.equal(out[1].beenden.status, 'fehlgeschlagen'); assert.equal(out[1].beenden.fehler, '1 von 2 Teilaufträgen nicht abgeschlossen');
  assert.equal(out[1].ereignis.tool, null); assert.match(out[1].ereignis.titel, /Notiz nicht gespeichert \(HTTP 500\)/); assert.match(out[1].beenden.zusammenfassung, /HTTP 500/); assert.equal(out[1].artefakt.ablageort, '');
});

test('Workflow-Datei: keine Zugangsdaten, Webhook-Pfad, Knotenreferenzen vorhanden, Zeitplan-Kette mit .item, Werkzeuge nur aus der Allowlist', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(quelle)); assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(quelle)); assert.ok(!/credentials\s*:/.test(quelle), 'Credential setzt Timo bzw. update_workflow');
  assert.ok(quelle.includes("path: 'office-ausfuehrer-orchestrierer'"));
  assert.ok(quelle.includes("minutesInterval: 5"), 'Zeitplan alle 5 Minuten');
  assert.ok(!/require\(['"]crypto['"]\)/.test(quelle), 'crypto ist im Code-Knoten gesperrt');
  const namen = new Set([...quelle.matchAll(/name: '([^']+)'/g)].map(m => m[1]));
  for (const m of quelle.matchAll(/\$\(['"]([^'"]+)['"]\)/g)) assert.ok(namen.has(m[1]), 'Referenz auf unbekannten Knoten: ' + m[1]);
  // Nach „Ablage prüfen“ laufen die HTTP-Knoten je Team: Zugriff auf „Ablage prüfen“ nur über .item, nie .first()
  assert.ok(!/\$\("Ablage prüfen"\)\.first\(\)/.test(quelle)); assert.ok(/\$\("Ablage prüfen"\)\.item\.json\.beenden/.test(quelle));
  const reg = JSON.parse(readFileSync(new URL('../agenten.json', import.meta.url), 'utf8')).agenten.find(a => a.agent_id === 'orchestrierer');
  for (const m of quelle.matchAll(/tool: "([a-z_]+)"/g)) assert.ok(reg.erlaubte_tools.includes(m[1]), 'Werkzeug nicht in der Allowlist des Orchestrierers: ' + m[1]);
  assert.ok(!/openai|anthropic|chat\/completions/i.test(quelle), 'erste Fassung ohne Modellaufruf');
});

test('Office-API schreibt strikt nacheinander: Schleife „Nacheinander schreiben“ zwischen Schreibaufträgen und Supabase, Ergebnis am Fertig-Ausgang', () => {
  const json = JSON.parse(readFileSync(new URL('../n8n/office-api.workflow.json', import.meta.url), 'utf8'));
  const c = json.connections, ziele = (von, i) => ((c[von] && c[von].main[i]) || []).map(x => x.node);
  const schleife = json.nodes.find(n => n.name === 'Nacheinander schreiben');
  assert.equal(schleife.type, 'n8n-nodes-base.splitInBatches'); assert.equal(schleife.parameters.batchSize, 1);
  assert.deepEqual(ziele('Schreibaufträge', 0), ['Nacheinander schreiben']);
  assert.deepEqual(ziele('Nacheinander schreiben', 0), ['Ergebnis prüfen'], 'Fertig-Ausgang');
  assert.deepEqual(ziele('Nacheinander schreiben', 1), ['In Supabase schreiben'], 'Schleifen-Ausgang');
  assert.deepEqual(ziele('In Supabase schreiben', 0), ['Nacheinander schreiben'], 'zurück in die Schleife');
  // Der Ausführer des Orchestrierers delegiert ebenso nacheinander
  assert.ok(/schleife\.output\(1\)\.to\(delegieren\)/.test(quelle) && /delegieren\.output\(0\)\.to\(schleife\)/.test(quelle) && /schleife\.output\(0\)\.to\(delegationPruefen\)/.test(quelle));
});
