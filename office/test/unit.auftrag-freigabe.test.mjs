// Startfreigabe für Aufträge von Teammitgliedern (ARCHITEKTUR.md Abschnitt 13): Admin startet immer sofort, Teammitglieder nur günstige Agenten mit
// kleinen Aufträgen und freiem Tagesbudget; alles andere wartet auf Timos Freigabe (Freigabe-Art auftrag_start, gebunden an den Hash des Auftrags).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speicher, Uhr, zufallsQuelle } from '../dev/speicher.mjs';
import { basisTabellen, TOKENS } from '../dev/testdaten.mjs';
import { START_REGELN, kostenstufe, agentSofortOk } from '../lib/kosten.js';

function welt() {
  const uhr = new Uhr('2026-10-18T09:00:00.000Z');
  const sp = new Speicher({ tabellen: basisTabellen(uhr.iso()), uhr, zufall: zufallsQuelle(5) });
  let n = 0;
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const start = (wer, agent, projekt, auftrag, extra) => als(wer, 'auftrag_starten', Object.assign({ agent_id: agent, projekt, auftrag, idempotenzschluessel: 'frg-test-' + (++n) + '-' + sp.zufall(6) }, extra || {}));
  const run = id => sp.T.office_runs.find(r => r.run_id === id);
  const startFreigabe = run_id => sp.T.office_freigaben.find(f => f.run_id === run_id && f.aktion === 'auftrag_start');
  // agent_speichern ersetzt die Felder wie die Oberfläche: den bestehenden Eintrag mitschicken und nur ändern, was geändert werden soll
  const speichern = (agent_id, extra) => als('m_timo', 'agent_speichern', Object.assign({}, sp.T.office_agenten.find(a => a.agent_id === agent_id), extra));
  const starts = () => sp.externe.filter(e => e.art === 'start').length;
  return { uhr, sp, als, start, run, startFreigabe, starts, speichern };
}
const GUENSTIG = ['social-planer', 'Social Media'];   // claude-haiku-5-5, n8n
const NORMAL = ['marketing-texter', 'Social Media'];  // claude-sonnet-5-5
const TEUER = ['angebots-pruefer', 'Vertrieb Herbst']; // claude-opus-5-5

test('Kostenstufen: Modelle ordnen sich günstig, normal, teuer; freigabe_noetig überschreibt', () => {
  for (const m of ['deepseek-v4-flash', 'gpt-5-mini', 'claude-haiku-5-5']) assert.equal(kostenstufe({ modell: m }), 'guenstig', m);
  assert.equal(kostenstufe({ modell: 'claude-sonnet-5-5' }), 'normal');
  assert.equal(kostenstufe({ modell: 'claude-opus-5-5' }), 'teuer');
  assert.equal(kostenstufe({ modell: 'unbekannt-xyz' }), 'normal', 'Unbekanntes Modell gilt vorsichtig als normal');
  assert.equal(agentSofortOk({ modell: 'deepseek-v4-flash' }), true);
  assert.equal(agentSofortOk({ modell: 'claude-opus-5-5' }), false);
  assert.equal(agentSofortOk({ modell: 'claude-haiku-5-5', freigabe_noetig: true }), false, 'true erzwingt Freigabe auch bei günstigem Modell');
  assert.equal(agentSofortOk({ modell: 'claude-opus-5-5', freigabe_noetig: false }), true, 'false erlaubt Sofortstart auch bei teurem Modell');
  assert.equal(START_REGELN.klein_max_zeichen, 600); assert.equal(START_REGELN.klein_budget_eur, 0.05); assert.equal(START_REGELN.tagesbudget_eur, 1);
});

test('Admin startet immer sofort – auch teuren Agenten mit langem Text und hohem Kostenlimit', () => {
  const w = welt();
  const r = w.start('m_timo', TEUER[0], TEUER[1], 'x'.repeat(1500), { budget_eur: 5 });
  assert.equal(r.code, 200); assert.equal(r.antwort.status, 'warteschlange');
  assert.ok(r.antwort.rueckmelde_schluessel, 'Admin-Start wie bisher');
  assert.equal(w.run(r.antwort.run_id).budget_eur, 5);
  assert.equal(w.sp.T.office_freigaben.length, 0); assert.equal(w.starts(), 1);
});

test('Teammitglied mit günstigem Agenten und kleinem Auftrag startet sofort (Standardlimit 0,05 €)', () => {
  const w = welt();
  for (const wer of ['m_lillien', 'm_murat', 'm_kurt']) {   // team, vertrieb, dozent
    const r = w.start(wer, GUENSTIG[0], GUENSTIG[1], 'Redaktionsplan für November sortieren');
    assert.equal(r.code, 200, wer); assert.equal(r.antwort.status, 'warteschlange', wer); assert.ok(!r.antwort.freigabe_id);
    assert.equal(w.run(r.antwort.run_id).budget_eur, 0.05);
  }
  assert.equal(w.sp.T.office_freigaben.length, 0); assert.equal(w.starts(), 3);
  // genau 600 Zeichen sind noch klein, 601 nicht
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'a'.repeat(600)).antwort.status, 'warteschlange');
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'a'.repeat(601)).antwort.status, 'wartet_freigabe');
});

test('deepseek-v4-flash zählt als günstig und ist als Modell in der Registry speicherbar', () => {
  const w = welt();
  const s = w.speichern('social-planer', { modell: 'deepseek-v4-flash' });
  assert.equal(s.code, 200); assert.equal(w.sp.T.office_agenten.find(a => a.agent_id === 'social-planer').modell, 'deepseek-v4-flash');
  const r = w.start('m_lillien', 'social-planer', 'Social Media', 'Drei Hashtag-Ideen sammeln');
  assert.equal(r.antwort.status, 'warteschlange');
  assert.equal(w.als('m_lillien', 'laden', {}).antwort.agenten.find(a => a.agent_id === 'social-planer').kostenstufe, 'guenstig');
});

test('Teammitglied mit teurem oder normalem Agenten: Run wartet auf Freigabe, Ausführer wird nicht angestoßen', () => {
  const w = welt();
  for (const [wer, ziel, stufe] of [['m_murat', TEUER, 'teuer'], ['m_lillien', NORMAL, 'normal']]) {
    const vorher = w.starts();
    const r = w.start(wer, ziel[0], ziel[1], 'Kurzer Auftrag');
    assert.equal(r.code, 200); assert.equal(r.antwort.status, 'wartet_freigabe'); assert.equal(r.antwort.wartet_auf, 'Timo'); assert.equal(r.antwort.kostenstufe, stufe);
    assert.deepEqual(r.antwort.gruende.map(g => g.code), ['agent']);
    assert.ok(!r.antwort.rueckmelde_schluessel, 'Der Rückmelde-Schlüssel wird erst beim Start an den Ausführer gegeben');
    assert.equal(w.starts(), vorher, 'kein Start nach außen');
    const run = w.run(r.antwort.run_id), fr = w.startFreigabe(run.run_id);
    assert.equal(run.status, 'wartet_freigabe'); assert.equal(run.gestartet, null); assert.equal(fr.status, 'offen'); assert.equal(fr.angefordert_von, wer);
    assert.match(fr.inhalt_hash, /^[a-f0-9]{64}$/); assert.equal(fr.inhalt_vorschau, 'Kurzer Auftrag');
    assert.ok(w.sp.T.office_run_schluessel.some(k => k.run_id === run.run_id), 'Schlüssel liegt bereit');
  }
});

test('Registry-Feld freigabe_noetig überschreibt die Kostenstufe', () => {
  const w = welt();
  const reg = id => w.sp.T.office_agenten.find(a => a.agent_id === id);
  reg('social-planer').freigabe_noetig = true;      // günstig, aber immer Freigabe
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Plan sortieren').antwort.status, 'wartet_freigabe');
  reg('marketing-texter').freigabe_noetig = false;  // normal, aber nie wegen des Agenten
  assert.equal(w.start('m_lillien', NORMAL[0], NORMAL[1], 'Beitrag entwerfen').antwort.status, 'warteschlange');
  // false hebt die anderen Regeln nicht auf
  assert.equal(w.start('m_lillien', NORMAL[0], NORMAL[1], 'z'.repeat(700)).antwort.status, 'wartet_freigabe');
  // über agent_speichern setzen und zurücknehmen
  assert.equal(w.speichern('social-planer', { freigabe_noetig: null }).code, 200);
  assert.equal(reg('social-planer').freigabe_noetig, null);
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Wieder sofort').antwort.status, 'warteschlange');
});

test('Langer Text oder höheres Kostenlimit: auch ein günstiger Agent braucht die Freigabe', () => {
  const w = welt();
  const lang = w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Sehr lang. '.repeat(70));
  assert.equal(lang.antwort.status, 'wartet_freigabe'); assert.deepEqual(lang.antwort.gruende.map(g => g.code), ['laenge']);
  const teuerLimit = w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Kurz, aber mit hohem Limit', { budget_eur: 0.2 });
  assert.equal(teuerLimit.antwort.status, 'wartet_freigabe'); assert.deepEqual(teuerLimit.antwort.gruende.map(g => g.code), ['budget']);
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Kurz, Limit 0,03', { budget_eur: 0.03 }).antwort.status, 'warteschlange');
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Kurz', { budget_eur: -1 }).code, 400);
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Kurz', { budget_eur: 'viel' }).code, 400);
});

test('Tagesbudget je Person: erschöpft → Freigabe nötig; am nächsten Tag wieder frei; andere Personen unberührt', () => {
  const w = welt();
  // Lillien verbraucht heute 0,98 € (gemessen) mit einem günstigen Auftrag
  const a = w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Plan sortieren');
  assert.equal(a.antwort.status, 'warteschlange');
  const agent = 'agent-claude';
  assert.equal(w.als(agent, 'lebenszeichen', { run_id: a.antwort.run_id }).code, 200);
  assert.equal(w.als(agent, 'run_beenden', { run_id: a.antwort.run_id, status: 'abgeschlossen', zusammenfassung: 'fertig', verbrauch: { tokens_ein: 900000, tokens_aus: 80000, kosten_eur: 0.98, kosten_quelle: 'Test' } }).code, 200);
  assert.equal(w.als('m_lillien', 'laden', {}).antwort.start_regeln.heute_verbraucht_eur, 0.98);
  // 0,98 + Limit 0,05 > 1 € → Freigabe
  const b = w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Noch ein kleiner Auftrag');
  assert.equal(b.antwort.status, 'wartet_freigabe'); assert.deepEqual(b.antwort.gruende.map(g => g.code), ['tagesbudget']);
  // eine andere Person hat ihr eigenes Budget
  assert.equal(w.start('m_murat', GUENSTIG[0], GUENSTIG[1], 'Plan sortieren').antwort.status, 'warteschlange');
  // Timo ist vom Budget ausgenommen
  assert.equal(w.start('m_timo', GUENSTIG[0], GUENSTIG[1], 'Noch einer').antwort.status, 'warteschlange');
  // Ein noch laufender Run zählt mit seinem Limit (Obergrenze): 0,98 + 0,05 ist knapp drüber, 0,90 + 0,05 nicht
  // nächster Tag (Berlin): Budget wieder frei
  w.uhr.vor(24 * 3600);
  assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Neuer Tag, neues Budget').antwort.status, 'warteschlange');
});

test('Offene Aufträge reservieren Budget; nie gestartete (wartend, abgebrochen) kosten nichts', () => {
  const w = welt();
  // 19 kleine Aufträge à 0,05 € = 0,95 € laufen; der 20. (1,00 € gesamt) passt gerade noch, der 21. nicht
  for (let i = 0; i < 20; i++) assert.equal(w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Auftrag ' + i).antwort.status, 'warteschlange', 'Auftrag ' + i);
  const r21 = w.start('m_lillien', GUENSTIG[0], GUENSTIG[1], 'Auftrag 21');
  assert.equal(r21.antwort.status, 'wartet_freigabe'); assert.deepEqual(r21.antwort.gruende.map(g => g.code), ['tagesbudget']);
  // der wartende Run reserviert nichts: Timo lehnt ihn ab, der Verbrauch bleibt bei 1,00 €
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: r21.antwort.freigabe_id, entscheidung: 'abgelehnt', begruendung: 'Budget' }).code, 200);
  assert.equal(w.als('m_lillien', 'laden', {}).antwort.start_regeln.heute_verbraucht_eur, 1);
});

test('Freigabe durch Admin: Run → Warteschlange, Ausführer wird angestoßen, Freigabe ist verwendet', () => {
  const w = welt();
  const r = w.start('m_murat', TEUER[0], TEUER[1], 'Angebot prüfen');
  const id = r.antwort.run_id, fr = w.startFreigabe(id);
  // vorher kann der Agent den Run nicht anfassen
  assert.equal(w.als('agent-claude', 'lebenszeichen', { run_id: id }).code, 409);
  assert.equal(w.als('agent-claude', 'run_beenden', { run_id: id, status: 'fehlgeschlagen', fehler: 'x' }).code, 409);
  assert.equal(w.run(id).status, 'wartet_freigabe');
  // Auftraggeber, Dozent und Team dürfen nicht entscheiden, Agenten sowieso nicht
  for (const wer of ['m_murat', 'm_kurt', 'm_lillien', 'agent-claude']) assert.equal(w.als(wer, 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 403, wer);
  assert.equal(w.starts(), 0);
  const vorher = w.starts();
  w.uhr.vor(3 * 3600);   // Timo antwortet erst nach 3 Stunden
  const e = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt', begruendung: 'passt' });
  assert.equal(e.code, 200); assert.equal(e.antwort.run_status, 'warteschlange');
  assert.equal(w.run(id).status, 'warteschlange'); assert.equal(w.startFreigabe(id).status, 'verwendet'); assert.equal(w.startFreigabe(id).entschieden_von, 'm_timo');
  assert.equal(w.starts(), vorher + 1);
  const ext = w.sp.externe.filter(x => x.art === 'start').pop();
  assert.equal(ext.run_id, id); assert.equal(ext.agent_id, TEUER[0]); assert.equal(ext.schluessel, w.sp.T.office_run_schluessel.find(k => k.run_id === id).schluessel);
  assert.ok(w.sp.T.office_ereignisse.some(x => x.run_id === id && x.art === 'freigabe' && /Start freigegeben von Timo/.test(x.titel)));
  // zweite Entscheidung zählt nicht, nichts startet doppelt
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 409);
  assert.equal(w.starts(), vorher + 1);
  // der Agent übernimmt jetzt ganz normal, die Wartezeit beginnt erst mit der Freigabe (kein „unbekannt“ nach 3 Stunden Wartezeit)
  assert.equal(w.als('m_timo', 'wartung', {}).code, 200); assert.equal(w.run(id).status, 'warteschlange');
  assert.equal(w.als('agent-claude', 'lebenszeichen', { run_id: id }).antwort.status, 'in_arbeit');
});

test('Ablehnung: Run → abgebrochen mit Grund, nichts startet, zweite Entscheidung nicht möglich', () => {
  const w = welt();
  const r = w.start('m_lillien', NORMAL[0], NORMAL[1], 'Newsletter schreiben');
  const id = r.antwort.run_id, fr = w.startFreigabe(id);
  const e = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'abgelehnt', begruendung: 'Machen wir nächste Woche gemeinsam.' });
  assert.equal(e.code, 200); assert.equal(e.antwort.run_status, 'abgebrochen');
  const run = w.run(id);
  assert.equal(run.status, 'abgebrochen'); assert.match(run.grund, /abgelehnt.*Machen wir nächste Woche/); assert.equal(run.abgebrochen_von, 'm_timo'); assert.ok(run.beendet);
  assert.equal(w.startFreigabe(id).status, 'abgelehnt'); assert.equal(w.starts(), 0);
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 409, 'abgelehnt bleibt abgelehnt');
  assert.equal(w.run(id).status, 'abgebrochen'); assert.equal(w.starts(), 0);
  // Die Person sieht Grund und Entscheidung
  const sicht = w.als('m_lillien', 'laden', {}).antwort;
  assert.equal(sicht.runs.find(x => x.run_id === id).status, 'abgebrochen'); assert.ok(sicht.freigaben.some(f => f.freigabe_id === fr.freigabe_id && f.status === 'abgelehnt'));
});

test('Text nach der Anfrage geändert: Freigabe wird ungültig, nichts startet, neue Anfrage für den neuen Text', () => {
  const w = welt();
  const r = w.start('m_murat', TEUER[0], TEUER[1], 'Harmloser Auftrag');
  const id = r.antwort.run_id, fr = w.startFreigabe(id);
  w.run(id).auftrag = 'Etwas ganz anderes, das Timo nicht gesehen hat';   // Manipulation in der Datenbank nach der Anfrage
  const e = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' });
  assert.equal(e.code, 409); assert.equal(e.antwort.neue_freigabe_noetig, true); assert.match(e.antwort.fehler, /geändert/);
  assert.equal(w.run(id).status, 'wartet_freigabe'); assert.equal(w.starts(), 0);
  assert.equal(w.sp.T.office_freigaben.find(f => f.freigabe_id === fr.freigabe_id).status, 'ungueltig');
  const neu = w.sp.T.office_freigaben.find(f => f.freigabe_id === e.antwort.neue_freigabe_id);
  assert.equal(neu.status, 'offen'); assert.notEqual(neu.inhalt_hash, fr.inhalt_hash); assert.match(neu.inhalt_vorschau, /Etwas ganz anderes/);
  // Die alte Freigabe lässt sich nicht mehr verwenden; die neue schon, wenn Timo den neuen Text sieht und freigibt
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 409);
  assert.equal(w.starts(), 0);
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: neu.freigabe_id, entscheidung: 'erteilt' }).code, 200);
  assert.equal(w.run(id).status, 'warteschlange'); assert.equal(w.starts(), 1);
  // Auch Agent oder Projekt zu ändern, macht die Freigabe ungültig
  const r2 = w.start('m_murat', TEUER[0], TEUER[1], 'Zweiter Auftrag'); w.run(r2.antwort.run_id).agent_id = 'architektur-review';
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: w.startFreigabe(r2.antwort.run_id).freigabe_id, entscheidung: 'erteilt' }).code, 409);
});

test('Zurückziehen: Auftraggeber bricht den wartenden Auftrag ab, Freigabe verfällt, kein Abbruchsignal an den Ausführer', () => {
  const w = welt();
  const r = w.start('m_lillien', NORMAL[0], NORMAL[1], 'Doch nicht');
  const ext0 = w.sp.externe.length;
  assert.equal(w.als('m_lillien', 'run_abbrechen', { run_id: r.antwort.run_id, grund: 'Hat sich erledigt' }).code, 200);
  assert.equal(w.run(r.antwort.run_id).status, 'abgebrochen'); assert.equal(w.startFreigabe(r.antwort.run_id).status, 'verfallen');
  assert.equal(w.sp.externe.length, ext0, 'nichts nach außen');
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: w.startFreigabe(r.antwort.run_id).freigabe_id, entscheidung: 'erteilt' }).code, 409);
  assert.equal(w.starts(), 0);
});

test('Wiederholter Aufruf mit demselben Idempotenzschlüssel legt keine zweite Freigabe an', () => {
  const w = welt();
  const d = { agent_id: TEUER[0], projekt: TEUER[1], auftrag: 'Doppelklick', idempotenzschluessel: 'frg-doppelt-0001' };
  const a = w.als('m_murat', 'auftrag_starten', d), b = w.als('m_murat', 'auftrag_starten', d);
  assert.equal(b.antwort.wiederholt, true); assert.equal(b.antwort.run_id, a.antwort.run_id);
  assert.equal(w.sp.T.office_runs.length, 1); assert.equal(w.sp.T.office_freigaben.length, 1);
});

test('Agenten starten Aufträge für sich selbst ohne Freigabe; Teilaufträge eines Menschen folgen derselben Regel', () => {
  const w = welt();
  // Hermes legt einen Auftrag für den Server-Wächter an (nur für sich selbst) – unabhängig von der Kostenstufe
  const h = w.als('agent-hermes', 'auftrag_starten', { agent_id: 'pa-assistent', projekt: 'Verwaltung & Finanzen', auftrag: 'Termine prüfen', idempotenzschluessel: 'frg-agent-0001' });
  assert.equal(h.code, 200); assert.equal(h.antwort.status, 'warteschlange');
  // Delegation durch einen Dozenten aus einem laufenden Orchestrierer-Run an einen normalen Agenten: braucht Freigabe
  const o = w.als('m_timo', 'auftrag_starten', { agent_id: 'orchestrierer', projekt: 'Akademie-Kurs', auftrag: 'Modul zerlegen', idempotenzschluessel: 'frg-orch-0001' });
  w.als('agent-claude', 'lebenszeichen', { run_id: o.antwort.run_id });
  const t = w.als('m_kurt', 'auftrag_delegieren', { eltern_run_id: o.antwort.run_id, agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'Merkblatt', idempotenzschluessel: 'frg-teil-0001' });
  assert.equal(t.code, 200); assert.equal(t.antwort.status, 'wartet_freigabe');
  // Der Eltern-Run kann nicht abschließen, solange der Teilauftrag auf Timo wartet
  const ende = w.als('agent-claude', 'run_beenden', { run_id: o.antwort.run_id, status: 'abgeschlossen', zusammenfassung: 'fertig' });
  assert.equal(ende.code, 409); assert.deepEqual(ende.antwort.offene_kind_runs, [t.antwort.run_id]);
});

test('Laden: Teammitglied sieht eigenen wartenden Auftrag und die Startregeln, Admin sieht die offene Freigabe; Registry zeigt Kostenstufe', () => {
  const w = welt();
  const r = w.start('m_murat', TEUER[0], TEUER[1], 'Angebot prüfen');
  const murat = w.als('m_murat', 'laden', {}).antwort, timo = w.als('m_timo', 'laden', {}).antwort;
  assert.equal(murat.runs.find(x => x.run_id === r.antwort.run_id).status, 'wartet_freigabe');
  assert.ok(murat.freigaben.some(f => f.aktion === 'auftrag_start' && f.status === 'offen'));
  assert.equal(murat.externe_aktionen.auftrag_start.text, 'Auftrag starten');
  assert.equal(murat.start_regeln.klein_max_zeichen, 600); assert.equal(murat.start_regeln.startet_sofort, false); assert.equal(timo.start_regeln.startet_sofort, true);
  assert.equal(timo.freigaben.filter(f => f.status === 'offen' && f.aktion === 'auftrag_start').length, 1);
  assert.equal(timo.agenten.find(a => a.agent_id === TEUER[0]).kostenstufe, 'teuer');
  assert.equal(timo.agenten.find(a => a.agent_id === 'kurs-waechter').sofort_ok, true);
  assert.equal(timo.agenten.find(a => a.agent_id === 'server-waechter').sofort_ok, false, 'freigabe_noetig aus agenten.json');
  assert.ok(!JSON.stringify(murat).includes('rueckmelde_schluessel'));
});

test('Wartung: wartende Startfreigaben verfallen erst nach der Wartefrist für Menschen (7 Tage)', () => {
  const w = welt();
  const r = w.start('m_lillien', NORMAL[0], NORMAL[1], 'Newsletter');
  w.uhr.vor(2 * 24 * 3600); w.als('m_timo', 'wartung', {});
  assert.equal(w.run(r.antwort.run_id).status, 'wartet_freigabe'); assert.equal(w.startFreigabe(r.antwort.run_id).status, 'offen');
  w.uhr.vor(6 * 24 * 3600); w.als('m_timo', 'wartung', {});
  assert.equal(w.run(r.antwort.run_id).status, 'unbekannt'); assert.equal(w.startFreigabe(r.antwort.run_id).status, 'verfallen');
});

test('Hauptschalter START_REGELN.aktiv = false: alle Teammitglieder starten wieder sofort, nichts wartet', () => {
  const w = welt();
  START_REGELN.aktiv = false;
  try {
    const r = w.start('m_murat', TEUER[0], TEUER[1], 'x'.repeat(900), { budget_eur: 3 });
    assert.equal(r.antwort.status, 'warteschlange'); assert.ok(r.antwort.rueckmelde_schluessel);
    assert.equal(w.sp.T.office_freigaben.length, 0); assert.equal(w.starts(), 1);
    assert.equal(w.als('m_murat', 'laden', {}).antwort.start_regeln.startet_sofort, true);
  } finally { START_REGELN.aktiv = true; }
  assert.equal(w.start('m_murat', TEUER[0], TEUER[1], 'Wieder an').antwort.status, 'wartet_freigabe');
});
