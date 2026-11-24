// KI Office 2.0, Paket 3 „Guthaben und Skalierung“: Guthaben je Agent durchsetzen, Vorschläge nur als Karte, jede Entscheidung durch den Admin.
// Dazu die Sicherheitsbasis: Allowlist für Ausführer-Adressen. Läuft gegen den echten Verarbeitungscode über den In-Memory-Speicher (TESTADAPTER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Speicher, Uhr, zufallsQuelle } from '../dev/speicher.mjs';
import { basisTabellen, testSpeicher, TOKENS, tokenVonAgent } from '../dev/testdaten.mjs';
import { guthabenStand, guthabenEingerichtet, monatBerlin, vorschlaege, guthabenStartwert, GUTHABEN_REGELN, VORSCHLAG_REGELN } from '../lib/guthaben.js';
import { ausfuehrerUrlErlaubt, AUSFUEHRER_HOSTS, NUR_ADMIN } from '../lib/rechte.js';

function welt(ohneTabelle) {
  const uhr = new Uhr('2026-11-24T08:00:00.000Z');
  const T = basisTabellen(uhr.iso()); if (ohneTabelle) delete T.office_vorschlaege;
  const sp = new Speicher({ tabellen: T, uhr, zufall: zufallsQuelle(9) });
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const agent = (agentId, aktion, daten) => sp.aufruf({ token: tokenVonAgent(agentId), aktion, daten });
  let n = 0;
  const start = (wer, agentId, projekt, auftrag, extra) => als(wer, 'auftrag_starten', Object.assign({ agent_id: agentId, projekt, auftrag, idempotenzschluessel: 'gh-' + (++n) + '-' + agentId }, extra || {}));
  const reg = id => sp.T.office_agenten.find(a => a.agent_id === id);
  const run = id => sp.T.office_runs.find(r => r.run_id === id);
  const laden = wer => als(wer, 'laden').antwort;
  return { uhr, sp, als, agent, start, reg, run, laden };
}

test('guthabenStand: nicht eingerichtet, Verbrauch im Monat, Auffüllung nur im selben Monat, Reservierung, leer', () => {
  const jetzt = new Date('2026-11-24T12:00:00Z').getTime();
  assert.equal(monatBerlin(jetzt), '2026-11'); assert.equal(monatBerlin(new Date('2026-11-30T23:30:00Z').getTime()), '2026-12', 'Berlin ist schon im Dezember');
  const a = { agent_id: 'a', name: 'A', budget_eur_monat: 4 };
  assert.equal(guthabenStand({ agent_id: 'a' }, [], [], [], jetzt), null); assert.equal(guthabenEingerichtet({ budget_eur_monat: null }), false); assert.equal(guthabenEingerichtet({ budget_eur_monat: 0 }), true);
  const Z = [
    { run_id: '1', agent_id: 'a', beendet: '2026-11-03T10:00:00Z', kosten_eur: 1.2, kosten_art: 'gemessen' }, { run_id: '2', agent_id: 'a', beendet: '2026-11-20T10:00:00Z', kosten_eur: 0.8, kosten_art: 'geschaetzt' },
    { run_id: '3', agent_id: 'a', beendet: '2026-11-21T10:00:00Z', kosten_eur: null, kosten_art: 'unbekannt' }, { run_id: '4', agent_id: 'a', beendet: '2026-10-30T10:00:00Z', kosten_eur: 9, kosten_art: 'gemessen' },
    { run_id: '5', agent_id: 'b', beendet: '2026-11-20T10:00:00Z', kosten_eur: 9, kosten_art: 'gemessen' }
  ];
  let g = guthabenStand(a, Z, [], [], jetzt);
  assert.deepEqual({ v: g.verbraucht_eur, r: g.rest_eur, o: g.ohne_angabe, leer: g.leer, knapp: g.knapp, gs: g.geschaetzt, anteil: g.anteil }, { v: 2, r: 2, o: 1, leer: false, knapp: false, gs: true, anteil: 0.5 }, 'Vormonat und andere Agenten zählen nicht, unbekannte Kosten nicht als 0');
  // Laufende Aufträge reservieren ihr Kostenlimit (mindestens den Sockel); ein Auftrag, der noch auf seine Startfreigabe wartet, reserviert nichts
  const R = [{ run_id: 'r1', agent_id: 'a', status: 'in_arbeit', budget_eur: 1.5 }, { run_id: 'r2', agent_id: 'a', status: 'warteschlange', budget_eur: 0 }, { run_id: 'r3', agent_id: 'a', status: 'wartet_freigabe', gestartet: null, budget_eur: 3 }, { run_id: 'r4', agent_id: 'b', status: 'in_arbeit', budget_eur: 3 }];
  g = guthabenStand(a, Z, R, [], jetzt);
  assert.equal(g.reserviert_eur, 1.5 + GUTHABEN_REGELN.reserve_je_lauf_eur); assert.equal(g.laufend, 2); assert.equal(g.rest_eur, 0.45); assert.equal(g.knapp, true); assert.equal(g.leer, false);
  assert.equal(guthabenStand({ ...a, budget_eur_monat: 3.55 }, Z, R, [], jetzt).leer, true, 'genau aufgebraucht ist leer');
  assert.equal(guthabenStand({ ...a, budget_eur_monat: 0 }, [], [], [], jetzt).leer, true, '0 € heißt: kein Start');
  // Auffüllung gilt nur im eingetragenen Monat
  assert.equal(guthabenStand({ ...a, budget_zusatz_eur: 5, budget_zusatz_monat: '2026-11' }, Z, [], [], jetzt).verfuegbar_eur, 9);
  assert.equal(guthabenStand({ ...a, budget_zusatz_eur: 5, budget_zusatz_monat: '2026-10' }, Z, [], [], jetzt).verfuegbar_eur, 4);
  // Beendete Runs ohne Kennzahlzeile zählen über den Run (Läufe aus der Zeit vor der Tabelle)
  const alt = { run_id: 'x', agent_id: 'a', status: 'abgeschlossen', beendet: '2026-11-22T10:00:00Z', gestartet: '2026-11-22T09:50:00Z', auftrag: 'x', verbrauch: { messbar: true, tokens_ein: 1, tokens_aus: 1, kosten_eur: 0.5, kosten_art: 'gemessen', kosten_quelle: 'Preisliste' } };
  assert.equal(guthabenStand(a, Z, [alt], [], jetzt).verbraucht_eur, 2.5);
});

test('Allowlist der Ausführer-Adressen: nur https, nur eigene Hosts, nur /webhook/', () => {
  assert.deepEqual(AUSFUEHRER_HOSTS, ['n8n.hm-storage.de']);
  for (const ok of ['https://n8n.hm-storage.de/webhook/agent-x', 'https://N8N.hm-storage.de/webhook/a/b?x=1', 'https://n8n.hm-storage.de:443/webhook/a']) assert.equal(ausfuehrerUrlErlaubt(ok), true, ok);
  for (const nein of ['http://n8n.hm-storage.de/webhook/a', 'https://evil.example.com/webhook/a', 'https://n8n.hm-storage.de.evil.example/webhook/a', 'https://n8n.hm-storage.de@evil.example/webhook/a', 'https://evil.example/n8n.hm-storage.de/webhook/a',
    'https://n8n.hm-storage.de:8443/webhook/a', 'https://n8n.hm-storage.de/rest/workflows', 'https://n8n.hm-storage.de/webhook/../rest/x', 'https://n8n.hm-storage.de', 'https://169.254.169.254/webhook/a', 'https://localhost/webhook/a', '', null, 'javascript:alert(1)'])
    assert.equal(ausfuehrerUrlErlaubt(nein), false, String(nein));
  assert.equal(ausfuehrerUrlErlaubt('https://n8n.example.invalid/webhook/a', ['n8n.example.invalid']), true, 'Testserver übergibt eigene Hosts');
});

test('Office-API: fremde Ausführer-Adresse wird weder gespeichert noch angestoßen', () => {
  const w = welt();
  const voll = Object.assign({}, w.reg('marketing-texter'));
  assert.equal(w.als('m_timo', 'agent_speichern', Object.assign({}, voll, { ausfuehrer_url: 'https://evil.example.com/webhook/x' })).code, 400);
  assert.equal(w.als('m_timo', 'agent_speichern', Object.assign({}, voll, { ausfuehrer_url: 'https://n8n.hm-storage.de/webhook/agent-marketing' })).code, 200);
  // Steht trotzdem eine fremde Adresse in der Datenbank (alter Eintrag, direkter Eingriff), wird sie nicht aufgerufen
  w.reg('marketing-texter').ausfuehrer_url = 'https://evil.example.com/webhook/x';
  const r = w.start('m_timo', 'marketing-texter', 'Social Media', 'Beitrag zur Woche');
  assert.equal(r.code, 200); assert.equal(r.extern.ausfuehrer_url, null); assert.equal(r.extern.adresse_abgelehnt, true);
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === r.antwort.run_id && e.art === 'hinweis' && e.titel.startsWith('Ausführer nicht angestoßen')));
  assert.ok(!JSON.stringify(w.sp.externe).includes('evil.example.com'), 'die fremde Adresse erreicht den Aufruf nie');
});

test('Office-API: Guthaben setzen darf nur der Admin; leer heißt kein Start, auffüllen und freigeben startet', () => {
  const w = welt();
  for (const a of ['guthaben_setzen', 'vorschlag_entscheiden', 'agent_aktiv']) assert.ok(NUR_ADMIN.includes(a));
  assert.equal(w.als('m_kurt', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: 100 }).code, 403);
  assert.equal(w.agent('marketing-texter', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: 100 }).code, 403, 'kein Agent ändert sein Guthaben');
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: -1 }).code, 400); assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: 9999 }).code, 400);
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter' }).code, 400); assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'gibt-es-nicht', monat_eur: 3 }).code, 404);
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: 5, begruendung: 'Start' }).code, 200);
  assert.equal(w.reg('marketing-texter').budget_eur_monat, 5); assert.equal(w.sp.T.office_vorschlaege.length, 1); assert.equal(w.sp.T.office_vorschlaege[0].entschieden_von, 'm_timo');
  // Erster Lauf: startet, meldet 5,20 € (über dem Kostenlimit des Auftrags) → Guthaben leer
  const r1 = w.start('m_timo', 'marketing-texter', 'Social Media', 'Beitrag eins'); assert.equal(r1.code, 200); assert.ok(r1.extern && r1.extern.art === 'start');
  w.uhr.vor(5); assert.equal(w.agent('marketing-texter', 'lebenszeichen', { run_id: r1.antwort.run_id }).code, 200);
  assert.equal(w.laden('m_timo').agenten.find(a => a.agent_id === 'marketing-texter').guthaben.laufend, 1, 'laufender Auftrag reserviert');
  w.uhr.vor(60); assert.equal(w.agent('marketing-texter', 'run_beenden', { run_id: r1.antwort.run_id, status: 'abgeschlossen', zusammenfassung: 'Fertig.', verbrauch: { tokens_ein: 1000, tokens_aus: 500, kosten_eur: 5.2, kosten_quelle: 'Abrechnung' } }).code, 200);
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === r1.antwort.run_id && e.art === 'hinweis' && e.titel.startsWith('Kostenlimit des Auftrags überschritten')));
  let g = w.laden('m_timo').agenten.find(a => a.agent_id === 'marketing-texter').guthaben;
  assert.equal(g.leer, true); assert.equal(g.verbraucht_eur, 5.2); assert.equal(g.rest_eur, 0);
  // Zweiter Auftrag (auch vom Admin): wird angelegt, startet aber nicht
  w.uhr.vor(5); const r2 = w.start('m_timo', 'marketing-texter', 'Social Media', 'Beitrag zwei');
  assert.equal(r2.code, 200); assert.equal(r2.extern, null, 'kein Anstoß des Ausführers'); assert.equal(w.run(r2.antwort.run_id).status, 'wartet_freigabe'); assert.ok(r2.antwort.gruende.some(x => x.code === 'guthaben')); assert.ok(r2.antwort.freigabe_id);
  // Agent kann nicht an der Sperre vorbei: Lebenszeichen und Abschluss auf den wartenden Run werden abgelehnt, er bleibt angehalten
  assert.notEqual(w.agent('marketing-texter', 'lebenszeichen', { run_id: r2.antwort.run_id }).code, 200); assert.equal(w.run(r2.antwort.run_id).status, 'wartet_freigabe');
  // Freigeben ohne Auffüllen geht nicht
  const zu = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: r2.antwort.freigabe_id, entscheidung: 'erteilt' });
  assert.equal(zu.code, 409); assert.equal(zu.antwort.guthaben_leer, true); assert.equal(w.run(r2.antwort.run_id).status, 'wartet_freigabe');
  // Auffüllen (zweimal: die Beträge addieren sich im selben Monat), dann freigeben → startet
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', zusatz_eur: 1 }).code, 200); assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', zusatz_eur: 2 }).code, 200);
  assert.equal(w.reg('marketing-texter').budget_zusatz_eur, 3); assert.equal(w.reg('marketing-texter').budget_zusatz_monat, '2026-11');
  const auf = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: r2.antwort.freigabe_id, entscheidung: 'erteilt' });
  assert.equal(auf.code, 200, JSON.stringify(auf.antwort)); assert.equal(w.run(r2.antwort.run_id).status, 'warteschlange'); assert.ok(auf.extern && auf.extern.art === 'start');
  assert.equal(w.agent('marketing-texter', 'lebenszeichen', { run_id: r2.antwort.run_id }).code, 200); assert.equal(w.run(r2.antwort.run_id).status, 'in_arbeit');
  // Teammitglied sieht den Stand, aber keine Vorschläge und kein Protokoll
  const DL = w.laden('m_lillien'); assert.deepEqual(DL.vorschlaege, []); assert.deepEqual(DL.entscheidungen, []); assert.ok(DL.agenten.find(a => a.agent_id === 'marketing-texter').guthaben);
  // Neuer Monat: das Monatsguthaben ist wieder voll, die Auffüllung verfallen
  w.uhr.vor(8 * 86400);
  g = w.laden('m_timo').agenten.find(a => a.agent_id === 'marketing-texter').guthaben;
  assert.equal(g.monat, '2026-12'); assert.equal(g.verbraucht_eur, 0); assert.equal(g.zusatz_eur, 0); assert.equal(g.verfuegbar_eur, 5);
});

test('Office-API: Guthaben wird beim Übernehmen nachgeprüft; angehaltener Start wartet wieder auf Timo', () => {
  const w = welt();
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'vertrieb-recherche', monat_eur: 5 }).code, 200);
  // a) vom Admin direkt gestartet, b) vom Teammitglied mit Startfreigabe (die Freigabe ist danach verbraucht)
  const a = w.start('m_timo', 'vertrieb-recherche', 'Vertrieb Herbst', 'Dossier A'); assert.equal(w.run(a.antwort.run_id).status, 'warteschlange');
  const b = w.start('m_murat', 'vertrieb-recherche', 'Vertrieb Herbst', 'Dossier B'); assert.ok(b.antwort.freigabe_id, 'Teammitglied braucht für diesen Agenten Timos Startfreigabe');
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: b.antwort.freigabe_id, entscheidung: 'erteilt' }).code, 200); assert.equal(w.run(b.antwort.run_id).status, 'warteschlange');
  // Timo dreht das Guthaben auf 0, bevor die Ausführer übernehmen
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'vertrieb-recherche', monat_eur: 0 }).code, 200);
  for (const x of [a, b]) {
    w.uhr.vor(5); const l = w.agent('vertrieb-recherche', 'lebenszeichen', { run_id: x.antwort.run_id });
    assert.equal(l.code, 409); assert.equal(l.antwort.guthaben_leer, true); assert.equal(l.antwort.status, 'wartet_freigabe');
    const run = w.run(x.antwort.run_id); assert.equal(run.status, 'wartet_freigabe'); assert.equal(run.gestartet, null);
    const F = w.sp.T.office_freigaben.filter(f => f.run_id === run.run_id && f.aktion === 'auftrag_start'); assert.equal(F.length, 1, 'genau eine Startfreigabe je Auftrag'); assert.equal(F[0].status, 'offen');
    assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === run.run_id && e.art === 'freigabe' && e.titel.startsWith('Start angehalten')));
  }
  assert.equal(w.laden('m_timo').agenten.find(x => x.agent_id === 'vertrieb-recherche').guthaben.reserviert_eur, 0, 'angehaltene Aufträge reservieren nichts');
  // Auffüllen, beide freigeben, beide laufen
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'vertrieb-recherche', monat_eur: 20 }).code, 200);
  for (const x of [a, b]) {
    const f = w.sp.T.office_freigaben.find(f => f.run_id === x.antwort.run_id && f.aktion === 'auftrag_start');
    const e = w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: f.freigabe_id, entscheidung: 'erteilt' }); assert.equal(e.code, 200, JSON.stringify(e.antwort));
    w.uhr.vor(5); assert.equal(w.agent('vertrieb-recherche', 'lebenszeichen', { run_id: x.antwort.run_id }).code, 200); assert.equal(w.run(x.antwort.run_id).status, 'in_arbeit');
  }
});

test('Vorschläge aus den Musterdaten: nur Karten, entscheiden kann nur der Admin, jede Entscheidung steht im Protokoll', () => {
  const { speicher: sp } = testSpeicher({ jetzt: '2026-11-24T12:00:00Z' });
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const reg = id => sp.T.office_agenten.find(a => a.agent_id === id);
  const V = () => als('m_timo', 'laden').antwort.vorschlaege;
  const hat = (art, id) => V().some(v => v.art === art && (v.agent_id || null) === id);
  let L = V();
  assert.deepEqual(L.map(v => v.art + ':' + (v.agent_id || '')), ['auffuellen:kunden-entwickler', 'auffuellen:server-waechter', 'pausieren:social-planer', 'skalieren:akademie-redakteur', 'skalieren:marketing-texter', 'skalieren:server-waechter', 'skalieren:vertrieb-recherche', 'einrichten:'], 'Reihenfolge: dringend zuerst');
  assert.ok(L[0].titel.includes('Guthaben leer')); assert.ok(L[1].titel.includes('fast leer')); assert.ok(L.find(v => v.art === 'skalieren').optionen.map(o => o.option).join() === 'guthaben,instanz');
  // Vorschläge ändern nichts: Der Stand der Registry ist nach dem Laden derselbe
  const vorher = JSON.stringify(sp.T.office_agenten); V(); assert.equal(JSON.stringify(sp.T.office_agenten), vorher);
  assert.deepEqual(als('m_kurt', 'laden').antwort.vorschlaege, []); assert.deepEqual(sp.aufruf({ token: tokenVonAgent('social-planer'), aktion: 'laden' }).antwort.vorschlaege, []);
  // Rechte und Eingaben
  assert.equal(als('m_kurt', 'vorschlag_entscheiden', { art: 'pausieren', agent_id: 'social-planer', entscheidung: 'angenommen' }).code, 403);
  assert.equal(sp.aufruf({ token: tokenVonAgent('vertrieb-recherche'), aktion: 'vorschlag_entscheiden', daten: { art: 'skalieren', agent_id: 'vertrieb-recherche', entscheidung: 'angenommen', option: 'instanz', segment: 'Mehr von mir' } }).code, 403, 'kein Agent vermehrt sich selbst');
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'vergroessern', agent_id: 'social-planer', entscheidung: 'angenommen' }).code, 400);
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'pausieren', agent_id: 'social-planer', entscheidung: 'vielleicht' }).code, 400);
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'social-planer', entscheidung: 'angenommen' }).code, 409, 'nur was die Zahlen hergeben');
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'pausieren', agent_id: 'social-planer', entscheidung: 'angenommen', option: 'instanz' }).code, 400);
  // Auffüllen: Architektur-Review ist leer, ein Auftrag wartet; danach nicht mehr leer
  assert.equal(als('m_timo', 'auftrag_starten', { agent_id: 'kunden-entwickler', projekt: reg('kunden-entwickler').projekte[0], auftrag: 'Review der Schnittstelle', idempotenzschluessel: 'gh-arch-1' }).extern, null);
  let e = als('m_timo', 'vorschlag_entscheiden', { art: 'auffuellen', agent_id: 'kunden-entwickler', entscheidung: 'angenommen', wert: 2.5, begruendung: 'Review ist nötig.' });
  assert.equal(e.code, 200, JSON.stringify(e.antwort)); assert.equal(reg('kunden-entwickler').budget_zusatz_eur, 2.5); assert.equal(reg('kunden-entwickler').budget_zusatz_monat, '2026-11'); assert.ok(!hat('auffuellen', 'kunden-entwickler'));
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'auffuellen', agent_id: 'server-waechter', entscheidung: 'angenommen', wert: 0 }).code, 400);
  // Pausieren: Agent nimmt nichts mehr an; wieder einschalten ist eine eigene Handlung des Admins; der Vorschlag ruht danach
  e = als('m_timo', 'vorschlag_entscheiden', { art: 'pausieren', agent_id: 'social-planer', entscheidung: 'angenommen' }); assert.equal(e.code, 200);
  assert.equal(reg('social-planer').aktiv, false); assert.ok(reg('social-planer').pausiert_grund.includes('zurückgewiesen'));
  assert.equal(als('m_timo', 'auftrag_starten', { agent_id: 'social-planer', projekt: 'Social Media', auftrag: 'Plan', idempotenzschluessel: 'gh-soc-1' }).code, 409);
  assert.equal(sp.aufruf({ token: tokenVonAgent('social-planer'), aktion: 'agent_aktiv', daten: { agent_id: 'social-planer', aktiv: true } }).code, 403, 'kein Agent schaltet sich selbst ein');
  assert.equal(als('m_timo', 'agent_aktiv', { agent_id: 'social-planer', aktiv: 'ja' }).code, 400); assert.equal(als('m_timo', 'agent_aktiv', { agent_id: 'social-planer', aktiv: true }).code, 200);
  assert.equal(reg('social-planer').aktiv, true); assert.equal(reg('social-planer').pausiert_grund, null); assert.ok(!hat('pausieren', 'social-planer'), 'ruht 14 Tage nach der Entscheidung');
  // Skalieren a) Guthaben erhöhen
  e = als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'vertrieb-recherche', entscheidung: 'angenommen', option: 'guthaben', wert: 24 }); assert.equal(e.code, 200); assert.equal(reg('vertrieb-recherche').budget_eur_monat, 24);
  // Skalieren b) zweite Instanz für ein Segment: eigener Registry-Eintrag mit eigenem Guthaben, nur mit Segmentnamen
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'marketing-texter', entscheidung: 'angenommen', option: 'instanz' }).code, 400);
  const anzahl = sp.T.office_agenten.length;
  e = als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'marketing-texter', entscheidung: 'angenommen', option: 'instanz', segment: 'Handwerk Nord', wert: 3 });
  assert.equal(e.code, 200, JSON.stringify(e.antwort)); assert.equal(e.antwort.neuer_agent, 'marketing-texter-handwerk-nord'); assert.equal(sp.T.office_agenten.length, anzahl + 1);
  const inst = reg('marketing-texter-handwerk-nord');
  assert.equal(inst.instanz_von, 'marketing-texter'); assert.equal(inst.name, 'Marketing-Texter (Handwerk Nord)'); assert.equal(inst.budget_eur_monat, 3); assert.equal(inst.aktiv, true); assert.equal(inst.modell, reg('marketing-texter').modell); assert.deepEqual(inst.projekte, reg('marketing-texter').projekte);
  assert.equal(als('m_timo', 'auftrag_starten', { agent_id: inst.agent_id, projekt: inst.projekte[0], auftrag: 'Beitrag für Handwerk Nord', idempotenzschluessel: 'gh-inst-1' }).code, 200, 'die Instanz nimmt Aufträge an');
  // Ablehnen: Zeile im Protokoll, Vorschlag ruht, nichts ändert sich am Agenten
  const vorG = reg('akademie-redakteur').budget_eur_monat;
  e = als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'akademie-redakteur', entscheidung: 'abgelehnt', begruendung: 'Erst Modul 2 abwarten.' }); assert.equal(e.code, 200);
  assert.equal(reg('akademie-redakteur').budget_eur_monat, vorG); assert.ok(!hat('skalieren', 'akademie-redakteur'));
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'skalieren', agent_id: 'akademie-redakteur', entscheidung: 'angenommen', option: 'guthaben', wert: 20 }).code, 409, 'entschieden ist entschieden');
  // Einrichten: alle aktiven Agenten ohne Guthaben bekommen den Startwert nach Modell
  e = als('m_timo', 'vorschlag_entscheiden', { art: 'einrichten', entscheidung: 'angenommen' }); assert.equal(e.code, 200);
  assert.equal(reg('pa-assistent').budget_eur_monat, guthabenStartwert(reg('pa-assistent'))); assert.equal(reg('medien-cutter').budget_eur_monat, 3); assert.ok(!hat('einrichten', null));
  // Protokoll: jede Entscheidung mit Person und Zeit, für den Admin sichtbar
  const P = sp.T.office_vorschlaege;
  for (const [art, option, entscheidung] of [['auffuellen', 'auffuellen', 'angenommen'], ['pausieren', 'pausieren', 'angenommen'], ['aktiv', 'einschalten', 'gesetzt'], ['skalieren', 'guthaben', 'angenommen'], ['skalieren', 'instanz', 'angenommen'], ['skalieren', null, 'abgelehnt'], ['einrichten', 'einrichten', 'angenommen']])
    assert.ok(P.some(p => p.art === art && p.option === option && p.entscheidung === entscheidung && p.entschieden_von === 'm_timo' && p.entschieden_am), art + '/' + option);
  assert.equal(P.find(p => p.option === 'instanz').neuer_agent, 'marketing-texter-handwerk-nord'); assert.equal(P.find(p => p.option === 'instanz').segment, 'Handwerk Nord');
  assert.ok(als('m_timo', 'laden').antwort.entscheidungen.length >= 7);
  // Ein leeres Guthaben wird auch nach einer Ablehnung weiter gemeldet (sonst stünde der Agent still, ohne dass es jemand sieht)
  assert.equal(als('m_timo', 'guthaben_setzen', { agent_id: 'server-waechter', monat_eur: 0 }).code, 200);
  assert.equal(als('m_timo', 'vorschlag_entscheiden', { art: 'auffuellen', agent_id: 'server-waechter', entscheidung: 'abgelehnt' }).code, 200); assert.ok(hat('auffuellen', 'server-waechter'));
});

test('vorschlaege (Bibliothek): Schwellen, zu wenig Daten, pausierte Agenten', () => {
  const jetzt = new Date('2026-11-24T12:00:00Z').getTime(); const R = VORSCHLAG_REGELN;
  const z = (agent_id, n, abnahme, kosten, tage) => Array.from({ length: n }, (_, i) => ({ run_id: agent_id + abnahme + i, agent_id, status: 'abgeschlossen', beendet: new Date(jetzt - (tage || 2) * 86400000 - i * 3600000).toISOString(), kosten_eur: kosten, kosten_art: 'gemessen', ergebnisse: 1, abnahme, wirkung: {} }));
  const A = [{ agent_id: 'gut', name: 'Gut', budget_eur_monat: 10, modell: 'claude-sonnet-5-5' }, { agent_id: 'teuer', name: 'Teuer', budget_eur_monat: 50 }, { agent_id: 'schlecht', name: 'Schlecht', budget_eur_monat: 10 },
    { agent_id: 'wenig', name: 'Wenig', budget_eur_monat: 10 }, { agent_id: 'pause', name: 'Pause', budget_eur_monat: 10, aktiv: false }, { agent_id: 'alt', name: 'Alt', budget_eur_monat: 10 }];
  const Z = [...z('gut', 4, 'abgenommen', 0.2), ...z('teuer', 4, 'abgenommen', 2), ...z('schlecht', 2, 'abgenommen', 0.1), ...z('schlecht', 2, 'zurueckgewiesen', 0.1), ...z('wenig', 2, 'abgenommen', 0.1), ...z('pause', 4, 'zurueckgewiesen', 0.1), ...z('alt', 4, 'abgenommen', 0.1, R.tage + 3)];
  const V = vorschlaege(A, Z, [], [], [], jetzt);
  assert.deepEqual(V.map(v => v.art + ':' + v.agent_id), ['pausieren:schlecht', 'skalieren:gut'], 'teuer je Ergebnis, zu wenig bewertet, pausiert und älter als 14 Tage: kein Vorschlag');
  assert.equal(V[1].optionen[0].wert, 15, 'Monatsguthaben mal 1,5, aufgerundet');
  // Entscheidung vor 15 Tagen ruht nicht mehr
  assert.equal(vorschlaege(A, Z, [], [], [{ art: 'skalieren', agent_id: 'gut', entschieden_am: new Date(jetzt - 13 * 86400000).toISOString() }], jetzt).length, 1);
  assert.equal(vorschlaege(A, Z, [], [], [{ art: 'skalieren', agent_id: 'gut', entschieden_am: new Date(jetzt - 15 * 86400000).toISOString() }], jetzt).length, 2);
});

test('Ohne die Guthaben-Tabelle: nichts wird begrenzt, nichts dorthin geschrieben', () => {
  const w = welt(true);
  w.reg('marketing-texter').budget_eur_monat = 0;   // selbst ein Wert in der Registry bleibt ohne Wirkung, solange die Migration fehlt
  const r = w.start('m_timo', 'marketing-texter', 'Social Media', 'Beitrag'); assert.equal(r.code, 200); assert.ok(r.extern && r.extern.art === 'start');
  assert.equal(w.agent('marketing-texter', 'lebenszeichen', { run_id: r.antwort.run_id }).code, 200);
  assert.equal(w.als('m_timo', 'guthaben_setzen', { agent_id: 'marketing-texter', monat_eur: 5 }).code, 409);
  assert.equal(w.als('m_timo', 'vorschlag_entscheiden', { art: 'einrichten', entscheidung: 'angenommen' }).code, 409);
  assert.equal(w.als('m_timo', 'agent_aktiv', { agent_id: 'social-planer', aktiv: false, grund: 'Pause' }).code, 200); assert.equal(w.reg('social-planer').aktiv, false); assert.equal(w.reg('social-planer').pausiert_grund, undefined, 'keine Spalte, die es noch nicht gibt');
  const D = w.laden('m_timo'); assert.deepEqual(D.vorschlaege, []); assert.equal(D.guthaben_regeln.tabelle, false); assert.ok(D.agenten.every(a => a.guthaben === null)); assert.equal(w.sp.T.office_vorschlaege, undefined);
});

test('n8n-Workflow speichert keine Fehlerläufe (dort stünden Token aus der Anfrage)', () => {
  const wf = JSON.parse(readFileSync(new URL('../n8n/office-api.workflow.json', import.meta.url), 'utf8'));
  assert.equal(wf.settings.saveDataErrorExecution, 'none'); assert.equal(wf.settings.saveDataSuccessExecution, 'none');
});
