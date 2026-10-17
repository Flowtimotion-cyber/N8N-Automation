// Delegationsregeln (Orchestrierung, ARCHITEKTUR.md Abschnitt 11) gegen den echten Verarbeitungscode über den In-Memory-Speicher (TESTADAPTER).
// Projektgrenze, falscher Aufrufer, Eltern-Run nicht in Arbeit, Werkzeug-Allowlist, Idempotenz, Teamregel (erst fertig, wenn die Kinder fertig sind), Wartung, Sichtbarkeit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speicher, Uhr, zufallsQuelle } from '../dev/speicher.mjs';
import { basisTabellen, TOKENS, tokenVonAgent, testSpeicher } from '../dev/testdaten.mjs';
import { TestAdapter } from '../adapter/test.js';
import { AGENT_DARF } from '../lib/rechte.js';

function welt() {
  const uhr = new Uhr('2026-10-17T08:00:00.000Z');
  const sp = new Speicher({ tabellen: basisTabellen(uhr.iso()), uhr, zufall: zufallsQuelle(11) });
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const run = id => sp.T.office_runs.find(r => r.run_id === id);
  // Orchestrierer-Run in Arbeit (ohne Testadapter-Skript, damit die Tests die Delegation selbst steuern)
  const eltern = als('m_timo', 'auftrag_starten', { agent_id: 'orchestrierer', projekt: 'Akademie-Kurs', auftrag: 'Modul 1.2 fertigstellen (Team)', idempotenzschluessel: 'del-eltern-0001' }).antwort.run_id;
  als('agent-claude', 'lebenszeichen', { run_id: eltern });
  const deleg = (wer, daten) => als(wer, 'auftrag_delegieren', Object.assign({ eltern_run_id: eltern, agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'Teil 1: Merkblatt schreiben', idempotenzschluessel: 'del-kind-0001' }, daten || {}));
  return { uhr, sp, als, run, eltern, deleg };
}

test('AGENT_DARF enthält auftrag_delegieren; eltern_run_id und Idempotenzschlüssel sind Pflicht', () => {
  assert.ok(AGENT_DARF.includes('auftrag_delegieren'));
  const w = welt();
  assert.equal(w.als('agent-claude', 'auftrag_delegieren', { agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'x y z', idempotenzschluessel: 'del-ohne-eltern' }).code, 404, 'ohne eltern_run_id');
  assert.equal(w.deleg('agent-claude', { idempotenzschluessel: '' }).code, 400, 'ohne Idempotenzschlüssel');
  assert.equal(w.deleg('agent-claude', { team_id: 'x' }).code, 400, 'team_id zu kurz');
});

test('Delegation legt Kind-Run mit eltern_run_id und team_id an, Ereignisse an beiden Runs, Start an den Ausführer', () => {
  const w = welt();
  const r = w.deleg('agent-claude', { team_id: 'team-modul-12' });
  assert.equal(r.code, 200, JSON.stringify(r.antwort));
  assert.equal(r.antwort.eltern_run_id, w.eltern); assert.equal(r.antwort.team_id, 'team-modul-12'); assert.ok(r.antwort.rueckmelde_schluessel);
  const kind = w.run(r.antwort.run_id);
  assert.equal(kind.eltern_run_id, w.eltern); assert.equal(kind.team_id, 'team-modul-12'); assert.equal(kind.agent_id, 'akademie-redakteur'); assert.equal(kind.status, 'warteschlange');
  assert.equal(w.run(w.eltern).team_id, 'team-modul-12', 'Eltern-Run übernimmt die team_id');
  const E = w.sp.T.office_ereignisse;
  assert.ok(E.some(e => e.run_id === w.eltern && e.tool === 'auftrag_delegieren' && /Teilauftrag delegiert an Akademie-Redakteur/.test(e.titel) && e.details.kind_run_id === kind.run_id), 'Ereignis am Eltern-Run mit Kind-run_id');
  assert.ok(E.some(e => e.run_id === kind.run_id && /Teilauftrag von Orchestrierer/.test(e.titel) && e.details.eltern_run_id === w.eltern), 'Ereignis am Kind-Run');
  assert.ok(w.sp.externe.some(x => x.art === 'start' && x.run_id === kind.run_id && x.eltern_run_id === w.eltern), 'Ausführer des Kindes wird angestoßen');
  // zweites Kind ohne team_id erbt die team_id des Eltern-Runs; eine andere team_id wird abgelehnt
  const r2 = w.deleg('agent-claude', { agent_id: 'kurs-waechter', auftrag: 'Teil 2: Kursstatus prüfen', idempotenzschluessel: 'del-kind-0002' });
  assert.equal(r2.antwort.team_id, 'team-modul-12');
  assert.equal(w.deleg('agent-claude', { agent_id: 'kurs-waechter', auftrag: 'Teil 3', idempotenzschluessel: 'del-kind-0003', team_id: 'anderes-team' }).code, 409);
});

test('Idempotenz: gleicher Schlüssel legt keinen zweiten Teilauftrag an und stößt nichts doppelt an', () => {
  const w = welt();
  const a = w.deleg('agent-claude'); const b = w.deleg('agent-claude');
  assert.equal(a.code, 200); assert.equal(b.code, 200); assert.equal(b.antwort.wiederholt, true); assert.equal(b.antwort.run_id, a.antwort.run_id);
  assert.ok(!b.antwort.rueckmelde_schluessel);
  assert.equal(w.sp.T.office_runs.filter(r => r.eltern_run_id === w.eltern).length, 1);
  assert.equal(w.sp.externe.filter(x => x.art === 'start' && x.run_id === a.antwort.run_id).length, 1);
});

test('Projektgrenze: nur in Projekte, die Orchestrierer und Zielagent sehen; Zielagent muss dem Projekt zugeordnet sein', () => {
  const w = welt();
  // Zielagent nicht dem Projekt zugeordnet (Vertriebs-Recherche gehört nicht zu Akademie-Kurs)
  assert.equal(w.deleg('agent-claude', { agent_id: 'vertrieb-recherche' }).code, 403);
  // Projekt für Orchestrierer unsichtbar (Vertrauliches Projekt ist keinem Agenten zugeordnet), auch wenn Timo delegiert
  assert.equal(w.deleg('m_timo', { projekt: 'Vertrauliches Projekt' }).code, 403);
  // Orchestrierer ohne dieses Projekt in seiner Registry: Registry-Eintrag temporär beschneiden
  const reg = w.sp.T.office_agenten.find(a => a.agent_id === 'orchestrierer'); const alt = reg.projekte; reg.projekte = ['Verwaltung & Finanzen'];
  const r = w.deleg('agent-claude'); assert.equal(r.code, 403); assert.match(r.antwort.fehler, /Projektgrenze/);
  reg.projekte = alt;
  // Projekt gibt es nicht
  assert.equal(w.deleg('agent-claude', { projekt: 'Gibt es nicht' }).code, 404);
  // Ohne projekt gilt das Projekt des Eltern-Runs
  assert.equal(w.deleg('agent-claude', { projekt: undefined }).code, 200);
});

test('Falscher Aufrufer: fremder Agent, Mensch ohne Steuerrecht, Agent ohne Werkzeug auftrag_delegieren → 403', () => {
  const w = welt();
  assert.equal(w.deleg('agent-hermes').code, 403, 'Hermes führt den Orchestrierer nicht aus');
  assert.equal(w.deleg('m_lillien').code, 403, 'Teammitglied ohne Dozentenrolle, nicht Auftraggeberin');
  assert.equal(w.deleg('m_kurt').code, 200, 'Dozent darf aus dem Run heraus delegieren');
  // Agent ohne das Werkzeug: Akademie-Redakteur-Run versucht zu delegieren
  const e2 = w.als('m_kurt', 'auftrag_starten', { agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'Merkblatt', idempotenzschluessel: 'del-red-0001' }).antwort.run_id;
  w.als('agent-claude', 'lebenszeichen', { run_id: e2 });
  const r = w.als('agent-claude', 'auftrag_delegieren', { eltern_run_id: e2, agent_id: 'kurs-waechter', projekt: 'Akademie-Kurs', auftrag: 'Teil', idempotenzschluessel: 'del-red-kind-01' });
  assert.equal(r.code, 403); assert.match(r.antwort.fehler, /auftrag_delegieren/);
  // auftrag_starten für fremde Agenten bleibt verboten (Delegation ist der einzige Weg)
  assert.equal(w.als('agent-claude', 'auftrag_starten', { agent_id: 'kurs-waechter', projekt: 'Akademie-Kurs', auftrag: 'Fremd', idempotenzschluessel: 'del-fremd-0001' }).code, 403);
});

test('Eltern-Run nicht in Arbeit: Warteschlange, wartet auf Rückmeldung und beendet → 409', () => {
  const w = welt();
  const e2 = w.als('m_timo', 'auftrag_starten', { agent_id: 'orchestrierer', projekt: 'Webseite', auftrag: 'Noch nicht gestartet', idempotenzschluessel: 'del-ws-0001' }).antwort.run_id;
  assert.equal(w.als('agent-claude', 'auftrag_delegieren', { eltern_run_id: e2, agent_id: 'marketing-texter', auftrag: 'Teil', idempotenzschluessel: 'del-ws-kind-01' }).code, 409, 'Warteschlange');
  w.als('agent-claude', 'rueckfrage', { run_id: w.eltern, frage: 'Welche Module?' });
  assert.equal(w.deleg('agent-claude').code, 409, 'wartet auf Rückmeldung');
  w.als('m_timo', 'antwort', { run_id: w.eltern, text: '1.2' });
  assert.equal(w.deleg('agent-claude').code, 200, 'wieder in Arbeit');
  w.als('m_timo', 'run_abbrechen', { run_id: w.eltern, grund: 'Test' });
  assert.equal(w.deleg('agent-claude', { idempotenzschluessel: 'del-kind-0009' }).code, 409, 'abgebrochen');
});

test('Teamregel: Eltern-Run ist erst abgeschlossen, wenn alle Kind-Runs beendet sind; Fehlschlag darf er immer melden', () => {
  const w = welt();
  const k1 = w.deleg('agent-claude').antwort.run_id;
  const k2 = w.deleg('agent-claude', { agent_id: 'kurs-waechter', auftrag: 'Teil 2', idempotenzschluessel: 'del-kind-0002' }).antwort.run_id;
  const ende = w.als('agent-claude', 'run_beenden', { run_id: w.eltern, status: 'abgeschlossen', zusammenfassung: 'Fertig?' });
  assert.equal(ende.code, 409); assert.match(ende.antwort.fehler, /2 offene Teilaufträge/); assert.deepEqual(ende.antwort.offene_kind_runs.sort(), [k1, k2].sort());
  assert.equal(w.run(w.eltern).status, 'in_arbeit');
  // Kind 1 fertig → Hinweis am Eltern-Run, Eltern-Run weiter blockiert
  w.als('agent-claude', 'lebenszeichen', { run_id: k1 });
  assert.equal(w.als('agent-claude', 'run_beenden', { run_id: k1, status: 'abgeschlossen', zusammenfassung: 'Merkblatt fertig' }).code, 200);
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === w.eltern && e.art === 'hinweis' && /Teilauftrag abgeschlossen/.test(e.titel) && e.details.kind_run_id === k1));
  assert.equal(w.als('agent-claude', 'run_beenden', { run_id: w.eltern, status: 'abgeschlossen' }).code, 409);
  // Kind 2 wird abgebrochen (Endzustand) → Eltern-Run darf abschließen
  assert.equal(w.als('m_timo', 'run_abbrechen', { run_id: k2, grund: 'nicht nötig' }).code, 200);
  const ok = w.als('agent-claude', 'run_beenden', { run_id: w.eltern, status: 'abgeschlossen', zusammenfassung: 'Team fertig' });
  assert.equal(ok.code, 200); assert.equal(w.run(w.eltern).status, 'abgeschlossen'); assert.equal(w.run(w.eltern).abgenommen, null, 'fachliche Abnahme bleibt beim Menschen');
  // Fehlschlag mit offenen Kindern ist erlaubt
  const w2 = welt(); w2.deleg('agent-claude');
  assert.equal(w2.als('agent-claude', 'run_beenden', { run_id: w2.eltern, status: 'fehlgeschlagen', fehler: 'Orchestrierer abgestürzt' }).code, 200);
  assert.equal(w2.run(w2.eltern).status, 'fehlgeschlagen');
});

test('Wartung: Eltern-Run mit offenen Kindern wird nicht veraltet; nach dem letzten Kind-Ende zählt timeout_sek ab dem Kind-Ende', () => {
  const w = welt();
  const k1 = w.deleg('agent-claude').antwort.run_id;
  w.als('agent-claude', 'lebenszeichen', { run_id: k1 });
  // 40 Minuten ohne Lebenszeichen des Orchestrierers (timeout 1800 s): Kind arbeitet (Lebenszeichen alle 10 Minuten), Eltern-Run bleibt in Arbeit
  for (let i = 0; i < 4; i++) { w.uhr.vor(600); w.als('agent-claude', 'lebenszeichen', { run_id: k1 }); w.als('m_timo', 'wartung', {}); }
  assert.equal(w.run(w.eltern).status, 'in_arbeit', 'Kinder sind das Lebenszeichen des Eltern-Runs');
  // Kind beendet sich; 10 Minuten später: Eltern-Run noch in Ordnung (Frist zählt ab Kind-Ende); nach 31 Minuten: unbekannt
  w.als('agent-claude', 'run_beenden', { run_id: k1, status: 'abgeschlossen', zusammenfassung: 'ok' });
  w.uhr.vor(600); w.als('m_timo', 'wartung', {}); assert.equal(w.run(w.eltern).status, 'in_arbeit');
  w.uhr.vor(21 * 60); const wt = w.als('m_timo', 'wartung', {});
  assert.ok(wt.antwort.veraltet.includes(w.eltern)); assert.equal(w.run(w.eltern).status, 'unbekannt');
});

test('Sichtbarkeit und Löschen: Orchestrierer sieht seine Kind-Runs, laden liefert eltern_run_id/team_id, Löschung nimmt Kinder mit', () => {
  const w = welt();
  const k1 = w.deleg('agent-claude', { agent_id: 'kurs-waechter', team_id: 'team-sicht-01' }).antwort.run_id;   // Kurs-Wächter läuft über Hermes
  const L = w.als('agent-claude', 'laden', {}).antwort;
  const kind = L.runs.find(r => r.run_id === k1); assert.ok(kind, 'Orchestrierer (agent-claude) sieht den Kind-Run des Hermes-Agenten');
  assert.equal(kind.eltern_run_id, w.eltern); assert.equal(kind.team_id, 'team-sicht-01');
  assert.equal(L.runs.find(r => r.run_id === w.eltern).team_id, 'team-sicht-01');
  assert.ok(L.runs.every(r => 'eltern_run_id' in r && 'team_id' in r), 'Felder immer vorhanden');
  const H = w.als('agent-hermes', 'laden', {}).antwort;
  assert.ok(H.runs.some(r => r.run_id === k1), 'Hermes sieht seinen eigenen Teilauftrag');
  assert.ok(H.runs.some(r => r.run_id === w.eltern), 'Eltern-Run liegt in Akademie-Kurs, einem Projekt des Kurs-Wächters → über die Projektgrenze sichtbar');
  const V = w.als('agent-codex', 'laden', {}).antwort;
  assert.ok(!V.runs.some(r => r.run_id === k1 || r.run_id === w.eltern), 'Codex (nur Kundenprojekt) sieht weder Eltern- noch Kind-Run');
  // Löschen: laufende Kinder blockieren, beendete werden mit gelöscht
  w.als('agent-hermes', 'lebenszeichen', { run_id: k1 });
  w.als('m_timo', 'run_abbrechen', { run_id: w.eltern, grund: 'Test' });
  assert.equal(w.als('m_timo', 'loeschen', { run_id: w.eltern }).code, 409, 'Kind läuft noch');
  w.als('m_timo', 'run_abbrechen', { run_id: k1, grund: 'Test' });
  const d = w.als('m_timo', 'loeschen', { run_id: w.eltern });
  assert.equal(d.code, 200); assert.equal(d.antwort.geloescht, 2); assert.equal(d.antwort.run_ids[0], k1, 'Kind zuerst (Fremdschlüssel)');
  assert.equal(w.sp.T.office_runs.filter(r => r.run_id === k1 || r.run_id === w.eltern).length, 0);
});

test('Testdaten: Team-Run des Orchestrierers mit zwei Kind-Runs (einer abgeschlossen, einer in Arbeit)', () => {
  const { speicher, runs } = testSpeicher({ jetzt: '2026-10-17T10:00:00Z' });
  const R = speicher.T.office_runs;
  const p = R.find(r => r.run_id === runs.r13);
  assert.equal(p.agent_id, 'orchestrierer'); assert.equal(p.status, 'in_arbeit'); assert.ok(p.team_id);
  const K = R.filter(r => r.eltern_run_id === runs.r13);
  assert.equal(K.length, 2); assert.deepEqual(K.map(k => k.status).sort(), ['abgeschlossen', 'in_arbeit']);
  assert.ok(K.every(k => k.team_id === p.team_id));
  assert.deepEqual(runs.kinder13.sort(), K.map(k => k.run_id).sort());
});
