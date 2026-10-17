// Szenario-Tests gegen den echten Verarbeitungscode (identisch mit dem n8n-Code-Knoten) über den In-Memory-Speicher (TESTADAPTER).
// Deckt die Pflichtprüfungen 1 bis 7 aus der Aufgabenstellung ab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speicher, Uhr, zufallsQuelle } from '../dev/speicher.mjs';
import { basisTabellen, TOKENS, tokenVonAgent } from '../dev/testdaten.mjs';
import { TestAdapter } from '../adapter/test.js';
import { signiere } from '../lib/signatur.js';
import { RUN_MARKER, bereinige } from '../lib/verarbeitung.js';

function welt() {
  const uhr = new Uhr('2026-10-17T08:00:00.000Z');
  const sp = new Speicher({ tabellen: basisTabellen(uhr.iso()), uhr, zufall: zufallsQuelle(3) });
  const ad = new TestAdapter({ speicher: sp, uhr, tokenVon: tokenVonAgent });
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const start = (wer, agent, projekt, auftrag, key, extra) => als(wer, 'auftrag_starten', Object.assign({ agent_id: agent, projekt, auftrag, idempotenzschluessel: key }, extra || {}));
  const run = id => sp.T.office_runs.find(r => r.run_id === id);
  return { uhr, sp, ad, als, start, run };
}

test('Pflichtprüfung 1: fremdes Projekt ist per direktem API-Aufruf nicht lesbar und nicht beauftragbar', () => {
  const w = welt();
  // Hermes (Kurs-Wächter, Server-Wächter) darf Akademie-Kurs und Verwaltung sehen, nicht Vertrieb oder das vertrauliche Projekt
  const r = w.als('m_timo', 'auftrag_starten', { agent_id: 'vertrieb-recherche', projekt: 'Vertrieb Herbst', auftrag: 'Firmenliste', idempotenzschluessel: 'p1-vertrieb-001' });
  assert.equal(r.code, 200);
  const laden = w.als('agent-hermes', 'laden', {});
  assert.deepEqual(laden.antwort.projekte.map(p => p.name).sort(), ['Akademie-Kurs', 'Verwaltung & Finanzen']);
  assert.ok(!laden.antwort.aufgaben.some(a => a.projekt === 'Vertrauliches Projekt'));
  assert.equal(laden.antwort.runs.length, 0, 'Run im Vertrieb ist für Hermes unsichtbar');
  assert.ok(!JSON.stringify(laden.antwort).includes('rueckmelde_schluessel'));
  assert.ok(!JSON.stringify(laden.antwort).includes(TOKENS.m_timo));
  // direkter Zugriff auf den fremden Run
  assert.equal(w.als('agent-hermes', 'lebenszeichen', { run_id: r.antwort.run_id }).code, 403);
  assert.equal(w.als('agent-hermes', 'ereignis', { run_id: r.antwort.run_id, titel: 'Einmischung' }).code, 403);
  assert.equal(w.als('agent-hermes', 'run_beenden', { run_id: r.antwort.run_id, status: 'abgeschlossen' }).code, 403);
  // Agent darf keinen Auftrag in einem nicht zugeordneten Projekt anlegen, auch nicht für sich selbst
  assert.equal(w.als('agent-hermes', 'auftrag_starten', { agent_id: 'kurs-waechter', projekt: 'Vertrauliches Projekt', auftrag: 'Spionage', idempotenzschluessel: 'p1-geheim-001' }).code, 403);
  // auch Timo kann einen Agenten nicht in ein Projekt schicken, dem er nicht zugeordnet ist (Projektgrenze liegt in der Registry)
  assert.equal(w.als('m_timo', 'auftrag_starten', { agent_id: 'kurs-waechter', projekt: 'Vertrauliches Projekt', auftrag: 'Test', idempotenzschluessel: 'p1-geheim-002' }).code, 403);
  // Agent darf keine Aufträge für andere Agenten anlegen
  assert.equal(w.als('agent-hermes', 'auftrag_starten', { agent_id: 'akademie-redakteur', projekt: 'Akademie-Kurs', auftrag: 'Test', idempotenzschluessel: 'p1-fremd-001' }).code, 403);
  // Mensch ohne Admin darf nichts löschen, Agent sowieso nicht
  assert.equal(w.als('m_lillien', 'loeschen', { run_id: r.antwort.run_id }).code, 403);
  assert.equal(w.als('agent-claude', 'loeschen', { run_id: r.antwort.run_id }).code, 403);
  assert.equal(w.als('agent-claude', 'freigabe_entscheiden', { freigabe_id: 'x', entscheidung: 'erteilt' }).code, 403);
});

test('Pflichtprüfung 2: doppelte Aufrufe lösen keine doppelte externe Aktion aus', () => {
  const w = welt();
  const a = w.start('m_murat', 'angebots-pruefer', 'Vertrieb Herbst', 'Angebot prüfen', 'p2-auftrag-001');
  const b = w.start('m_murat', 'angebots-pruefer', 'Vertrieb Herbst', 'Angebot prüfen', 'p2-auftrag-001');
  assert.equal(a.code, 200); assert.equal(b.code, 200); assert.equal(b.antwort.wiederholt, true); assert.equal(b.antwort.run_id, a.antwort.run_id);
  assert.equal(w.sp.T.office_runs.length, 1); assert.equal(w.sp.externe.filter(e => e.art === 'start').length, 1);
  assert.ok(!b.antwort.rueckmelde_schluessel, 'Schlüssel wird nur beim ersten Mal herausgegeben');
  const id = a.antwort.run_id;
  w.als('agent-claude', 'lebenszeichen', { run_id: id });
  const inhalt = { an: 'kunde@example.invalid', text: 'Nachfrage' };
  const fr = w.als('agent-claude', 'freigabe_anfordern', { run_id: id, aktion: 'email_senden', inhalt });
  const fr2 = w.als('agent-claude', 'freigabe_anfordern', { run_id: id, aktion: 'email_senden', inhalt });
  assert.equal(fr2.antwort.wiederholt, true); assert.equal(w.sp.T.office_freigaben.length, 1);
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.antwort.freigabe_id, entscheidung: 'erteilt' }).code, 200);
  const x1 = w.als('agent-claude', 'aktion_ausfuehren', { run_id: id, aktion: 'email_senden', inhalt, freigabe_id: fr.antwort.freigabe_id, idempotenzschluessel: 'p2-aktion-001' });
  const x2 = w.als('agent-claude', 'aktion_ausfuehren', { run_id: id, aktion: 'email_senden', inhalt, freigabe_id: fr.antwort.freigabe_id, idempotenzschluessel: 'p2-aktion-001' });
  assert.equal(x1.code, 200); assert.equal(x1.antwort.ausgefuehrt, true);
  assert.equal(x2.code, 200); assert.equal(x2.antwort.wiederholt, true);
  assert.equal(w.sp.externe.filter(e => e.art === 'aktion').length, 1, 'genau eine externe Wirkung');
  assert.equal(w.ad.ausgefuehrt.length, 1);
  // neuer Schlüssel, aber Freigabe schon verwendet → keine zweite Ausführung
  const x3 = w.als('agent-claude', 'aktion_ausfuehren', { run_id: id, aktion: 'email_senden', inhalt, freigabe_id: fr.antwort.freigabe_id, idempotenzschluessel: 'p2-aktion-002' });
  assert.equal(x3.code, 409); assert.equal(w.sp.externe.filter(e => e.art === 'aktion').length, 1);
  // ohne Idempotenzschlüssel geht gar nichts
  assert.equal(w.als('agent-claude', 'aktion_ausfuehren', { run_id: id, aktion: 'email_senden', inhalt, freigabe_id: fr.antwort.freigabe_id }).code, 400);
  // Replay einer signierten Rückmeldung
  const schluessel = a.antwort.rueckmelde_schluessel, zeit = w.uhr.iso(), nonce = 'nonce-0123456789abcdef', erg = { status: 'abgeschlossen', zusammenfassung: 'ok' };
  const m1 = w.sp.aufruf({ aktion: 'rueckmeldung', daten: { run_id: id, zeit, nonce, ergebnis: erg, signatur: signiere(schluessel, zeit, nonce, erg) } });
  const m2 = w.sp.aufruf({ aktion: 'rueckmeldung', daten: { run_id: id, zeit, nonce, ergebnis: erg, signatur: signiere(schluessel, zeit, nonce, erg) } });
  assert.equal(m1.code, 200); assert.equal(m2.code, 401); assert.match(m2.antwort.fehler, /Replay/);
  // Datenbank-Eindeutigkeit als letzte Linie: zweiter Run mit gleichem Schlüssel direkt in die Tabelle → 409 vom Speicher
  const { wendeAn } = awaitImport();
  assert.equal(wendeAn(w.sp.T, { methode: 'POST', pfad: 'office_runs', body: { run_id: 'neu', idempotenzschluessel: 'p2-auftrag-001' } }).statusCode, 409);
});
function awaitImport() { return { wendeAn: wendeAnRef }; }
import { wendeAn as wendeAnRef } from '../lib/postgrest.js';

test('Pflichtprüfung 3: Ausfall, Neustart, Timeout und verspätete Rückmeldung erzeugen korrekte Zustände', () => {
  const w = welt();
  const nie = w.start('m_timo', 'verwaltung-status', 'Verwaltung & Finanzen', 'Nie übernehmen', 'p3-nie-00001').antwort;
  const langsam = w.start('m_timo', 'server-waechter', 'Verwaltung & Finanzen', 'Läuft, dann Stille', 'p3-still-0001').antwort;
  w.als('agent-hermes', 'lebenszeichen', { run_id: langsam.run_id });
  assert.equal(w.run(langsam.run_id).status, 'in_arbeit');
  // 5 Minuten später: nichts veraltet
  w.uhr.vor(300); let wt = w.als('m_timo', 'wartung', {}); assert.deepEqual(wt.antwort.veraltet, []);
  // Neustart: Executor-Skripte weg, Daten bleiben; nach 11 Minuten ohne Lebenszeichen (Timeout 600 s) → unbekannt; Warteschlange nach 30 Minuten → unbekannt
  w.uhr.vor(360); wt = w.als('m_timo', 'wartung', {});
  assert.ok(wt.antwort.veraltet.includes(langsam.run_id)); assert.equal(w.run(langsam.run_id).status, 'unbekannt'); assert.match(w.run(langsam.run_id).grund, /Lebenszeichen/);
  assert.equal(w.run(nie.run_id).status, 'warteschlange');
  w.uhr.vor(20 * 60); wt = w.als('m_timo', 'wartung', {});
  assert.equal(w.run(nie.run_id).status, 'unbekannt'); assert.match(w.run(nie.run_id).grund, /Executor/);
  // verspätete Rückmeldung (signiert, korrekt) nach Timeout → bleibt unbekannt, wird als Hinweis protokolliert, nie „abgeschlossen“
  const zeit = w.uhr.iso(), nonce = 'late-0123456789abcdef', erg = { status: 'abgeschlossen', zusammenfassung: 'Doch fertig' };
  const sp = w.sp.aufruf({ aktion: 'rueckmeldung', daten: { run_id: langsam.run_id, zeit, nonce, ergebnis: erg, signatur: signiere(langsam.rueckmelde_schluessel, zeit, nonce, erg) } });
  assert.equal(sp.code, 200); assert.equal(sp.antwort.hinweis, 'verspaetet'); assert.equal(sp.antwort.angenommen, false);
  assert.equal(w.run(langsam.run_id).status, 'unbekannt'); assert.equal(w.run(langsam.run_id).zusammenfassung, null);
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === langsam.run_id && e.art === 'hinweis' && /Verspätete Rückmeldung/.test(e.titel)));
  // verspätetes Lebenszeichen und Ereignis ändern den Status nicht
  assert.equal(w.als('agent-hermes', 'lebenszeichen', { run_id: langsam.run_id }).code, 409);
  assert.equal(w.als('agent-hermes', 'ereignis', { run_id: langsam.run_id, titel: 'Nachzügler' }).antwort.hinweis, 'verspaetet');
  assert.equal(w.run(langsam.run_id).status, 'unbekannt');
  // Mensch kann den veralteten Run schließen, nicht aber „abschließen“
  assert.equal(w.als('m_timo', 'run_abnehmen', { run_id: langsam.run_id, abgenommen: true }).code, 409);
  assert.equal(w.als('m_timo', 'run_abbrechen', { run_id: langsam.run_id, grund: 'aufgeräumt' }).code, 200);
  assert.equal(w.run(langsam.run_id).status, 'abgebrochen');
  // Fehlschlag mit begrenzter Wiederholung
  const f = w.start('m_timo', 'kunden-entwickler', 'Kundenprojekt Müller GmbH', 'Baut etwas', 'p3-fehl-00001', { max_versuche: 2 }).antwort;
  w.als('agent-codex', 'lebenszeichen', { run_id: f.run_id });
  assert.equal(w.als('agent-codex', 'run_beenden', { run_id: f.run_id, status: 'fehlgeschlagen', fehler: 'Kaputt' }).code, 200);
  assert.equal(w.run(f.run_id).status, 'fehlgeschlagen');
  assert.equal(w.als('m_timo', 'run_wiederholen', { run_id: f.run_id }).code, 200); assert.equal(w.run(f.run_id).versuche, 2); assert.equal(w.run(f.run_id).status, 'warteschlange');
  w.als('agent-codex', 'lebenszeichen', { run_id: f.run_id }); w.als('agent-codex', 'run_beenden', { run_id: f.run_id, status: 'fehlgeschlagen', fehler: 'Wieder kaputt' });
  assert.equal(w.als('m_timo', 'run_wiederholen', { run_id: f.run_id }).code, 409, 'Höchstzahl erreicht');
  // Abbruch durch Mensch wird dem Ausführer gemeldet
  const c = w.start('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'Text', 'p3-abbr-00001').antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: c.run_id });
  assert.equal(w.als('m_lillien', 'run_abbrechen', { run_id: c.run_id }).code, 403, 'fremder Auftraggeber ohne Dozentenrolle');
  assert.equal(w.als('m_kurt', 'run_abbrechen', { run_id: c.run_id, grund: 'nicht mehr nötig' }).code, 200);
  assert.ok(w.sp.externe.some(e => e.art === 'abbruch' && e.run_id === c.run_id));
  assert.equal(w.als('agent-claude', 'run_beenden', { run_id: c.run_id, status: 'abgeschlossen' }).antwort.hinweis, 'verspaetet');
  assert.equal(w.run(c.run_id).status, 'abgebrochen');
});

test('Pflichtprüfung 4: Freigabe bindet an Aktion und Inhalt; Agenten entscheiden nie', () => {
  const w = welt();
  const r = w.start('m_lillien', 'marketing-texter', 'Social Media', 'Beitrag', 'p4-post-00001').antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: r.run_id });
  const inhalt = { kanal: 'LinkedIn', text: 'Version A' };
  const fr = w.als('agent-claude', 'freigabe_anfordern', { run_id: r.run_id, aktion: 'post_veroeffentlichen', inhalt }).antwort;
  assert.equal(w.run(r.run_id).status, 'wartet_freigabe');
  assert.equal(w.als('agent-claude', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 403, 'Agent');
  assert.equal(w.als('m_lillien', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt' }).code, 200, 'Auftraggeberin darf (Anfordernder war der Agent)');
  assert.equal(w.run(r.run_id).status, 'in_arbeit');
  // Ausführen mit anderer Aktion scheitert trotz gleichem Inhalt
  assert.equal(w.als('agent-claude', 'aktion_ausfuehren', { run_id: r.run_id, aktion: 'email_senden', inhalt, freigabe_id: fr.freigabe_id, idempotenzschluessel: 'p4-aktion-0000' }).code, 409);
  assert.equal(w.sp.externe.filter(e => e.art === 'aktion').length, 0);
});
test('Pflichtprüfung 4b: erteilte Freigabe, dann geänderter Inhalt → 409, Freigabe ungültig, keine externe Wirkung', () => {
  const w = welt();
  const r = w.start('m_lillien', 'marketing-texter', 'Social Media', 'Beitrag', 'p4-post-00002').antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: r.run_id });
  const inhalt = { kanal: 'LinkedIn', text: 'Version A' };
  const fr = w.als('agent-claude', 'freigabe_anfordern', { run_id: r.run_id, aktion: 'post_veroeffentlichen', inhalt }).antwort;
  assert.equal(w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'erteilt', begruendung: 'ok' }).code, 200);
  const x = w.als('agent-claude', 'aktion_ausfuehren', { run_id: r.run_id, aktion: 'post_veroeffentlichen', inhalt: { kanal: 'LinkedIn', text: 'Version B' }, freigabe_id: fr.freigabe_id, idempotenzschluessel: 'p4-aktion-0001' });
  assert.equal(x.code, 409); assert.equal(x.antwort.neue_freigabe_noetig, true);
  assert.equal(w.sp.T.office_freigaben.find(f => f.freigabe_id === fr.freigabe_id).status, 'ungueltig');
  assert.equal(w.sp.externe.filter(e => e.art === 'aktion').length, 0);
  // auch die alte, unveränderte Version geht jetzt nicht mehr
  assert.equal(w.als('agent-claude', 'aktion_ausfuehren', { run_id: r.run_id, aktion: 'post_veroeffentlichen', inhalt, freigabe_id: fr.freigabe_id, idempotenzschluessel: 'p4-aktion-0002' }).code, 409);
  // neue Anfrage mit neuem Inhalt ersetzt offene/erteilte Freigaben derselben Aktion
  const fr2 = w.als('agent-claude', 'freigabe_anfordern', { run_id: r.run_id, aktion: 'post_veroeffentlichen', inhalt: { kanal: 'LinkedIn', text: 'Version B' } }).antwort;
  assert.notEqual(fr2.freigabe_id, fr.freigabe_id); assert.equal(fr2.status, 'offen');
  assert.equal(w.sp.externe.filter(e => e.art === 'aktion').length, 0);
});

test('Pflichtprüfung 5: fehlgeschlagene Aktionen erscheinen nie als erfolgreich', () => {
  const w = welt();
  const r = w.start('m_timo', 'kunden-entwickler', 'Kundenprojekt Müller GmbH', 'Workflow bauen', 'p5-fail-00001', { aufgabe_id: 'a_m1' }).antwort;
  w.als('agent-codex', 'lebenszeichen', { run_id: r.run_id });
  w.als('agent-codex', 'run_beenden', { run_id: r.run_id, status: 'fehlgeschlagen', fehler: 'Tests rot' });
  const run = w.run(r.run_id);
  assert.equal(run.status, 'fehlgeschlagen'); assert.equal(run.abgenommen, null);
  assert.equal(w.sp.T.team_aufgaben.find(a => a.aufgabe_id === 'a_m1').status, 'In Arbeit', 'Aufgabe wird bei Fehlschlag nicht auf „Wird getestet“ gesetzt');
  assert.ok(w.sp.T.team_aufgaben_verlauf.some(v => v.aufgabe_id === 'a_m1' && /fehlgeschlagen/.test(v.text)));
  // nachträgliches „abgeschlossen“ vom Agenten ist kein zulässiger Übergang
  const sp = w.als('agent-codex', 'run_beenden', { run_id: r.run_id, status: 'abgeschlossen', zusammenfassung: 'Doch gut' });
  assert.equal(sp.antwort.angenommen, false); assert.equal(w.run(r.run_id).status, 'fehlgeschlagen'); assert.equal(w.run(r.run_id).zusammenfassung, null);
  // fachliche Abnahme nur bei technisch abgeschlossen
  assert.equal(w.als('m_timo', 'run_abnehmen', { run_id: r.run_id, abgenommen: true }).code, 409);
  // in der Antwort auf laden bleibt der Status fehlgeschlagen und die Zusammenfassung leer
  const L = w.als('m_timo', 'laden', {}).antwort.runs.find(x => x.run_id === r.run_id);
  assert.equal(L.status, 'fehlgeschlagen'); assert.ok(!L.zusammenfassung);
  // Agent darf nicht „Erledigt“ setzen: Erfolg setzt Aufgabe höchstens auf „Wird getestet“
  const r2 = w.start('m_timo', 'kunden-entwickler', 'Kundenprojekt Müller GmbH', 'Zweiter Versuch', 'p5-ok-000001', { aufgabe_id: 'a_m1' }).antwort;
  w.als('agent-codex', 'lebenszeichen', { run_id: r2.run_id });
  w.als('agent-codex', 'run_beenden', { run_id: r2.run_id, status: 'abgeschlossen', zusammenfassung: 'Fertig' });
  assert.equal(w.sp.T.team_aufgaben.find(a => a.aufgabe_id === 'a_m1').status, 'Wird getestet');
  assert.equal(w.run(r2.run_id).abgenommen, null, 'technisch erfolgreich ≠ fachlich abgenommen');
});

test('Pflichtprüfung 6: Ergebnisse sind bis Aufgabe und Run rückverfolgbar', () => {
  const w = welt();
  const r = w.start('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'Merkblatt', 'p6-trace-0001', { aufgabe_id: 'a_k1' }).antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: r.run_id });
  w.als('agent-claude', 'ereignis', { run_id: r.run_id, art: 'tool', titel: 'Repo gelesen', tool: 'repo_lesen', quelle_ref: 'https://github.com/flowtimotion-cyber/N8N-Automation' });
  assert.equal(w.als('agent-claude', 'ereignis', { run_id: r.run_id, art: 'tool', titel: 'Shell', tool: 'shell' }).code, 403, 'Werkzeug nicht in Allowlist');
  const a = w.als('agent-claude', 'artefakt', { run_id: r.run_id, art: 'commit', titel: 'Merkblatt v1', ablageort: 'https://github.com/flowtimotion-cyber/N8N-Automation/commit/abc', inhalt_hash: 'a'.repeat(64) }).antwort;
  w.als('agent-claude', 'run_beenden', { run_id: r.run_id, status: 'abgeschlossen', zusammenfassung: 'Merkblatt geschrieben.', artefakte: [{ art: 'notiz', titel: 'Merkblatt Text', ablageort: 'notiz:Merkblatt' }] });
  const art = w.sp.T.office_artefakte.find(x => x.artefakt_id === a.artefakt_id);
  assert.equal(art.run_id, r.run_id); assert.equal(art.aufgabe_id, 'a_k1'); assert.equal(art.projekt, 'Akademie-Kurs');
  const run = w.run(r.run_id); assert.equal(run.aufgabe_id, 'a_k1'); assert.equal(run.projekt, 'Akademie-Kurs');
  assert.ok(run.zusammenfassung_quelle.ereignisse.length >= 2, 'Zusammenfassung verweist auf Ereignisse'); assert.ok(run.zusammenfassung_zeit);
  assert.equal(w.sp.T.office_artefakte.filter(x => x.run_id === r.run_id).length, 2);
  const v = w.sp.T.team_aufgaben_verlauf.filter(x => x.aufgabe_id === 'a_k1' && x.text.includes(RUN_MARKER(r.run_id)));
  assert.ok(v.length >= 2, 'Aufgabenverlauf im Portal verweist auf den Run');
  assert.ok(w.sp.T.office_ereignisse.find(e => e.run_id === r.run_id && e.art === 'tool').quelle_ref.startsWith('https://'));
});

test('Pflichtprüfung 7: Löschregeln erfassen abgeleitete Daten laut Konzept', () => {
  const w = welt();
  const r = w.start('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'Löschtest', 'p7-del-000001', { aufgabe_id: 'a_k2' }).antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: r.run_id });
  w.als('agent-claude', 'artefakt', { run_id: r.run_id, titel: 'Datei', ablageort: 'https://drive.example.invalid/x' });
  const fr = w.als('agent-claude', 'freigabe_anfordern', { run_id: r.run_id, aktion: 'email_senden', inhalt: { an: 'a' } }).antwort;
  w.als('m_timo', 'freigabe_entscheiden', { freigabe_id: fr.freigabe_id, entscheidung: 'abgelehnt', begruendung: 'nein' });
  assert.equal(w.als('m_timo', 'loeschen', { run_id: r.run_id }).code, 409, 'laufende Runs erst abbrechen');
  w.als('m_kurt', 'run_abbrechen', { run_id: r.run_id });
  const vorher = w.sp.T.team_aufgaben_verlauf.filter(v => v.text.includes(RUN_MARKER(r.run_id))).length; assert.ok(vorher >= 2);
  const d = w.als('m_timo', 'loeschen', { run_id: r.run_id });
  assert.equal(d.code, 200); assert.equal(d.antwort.geloescht, 1); assert.equal(d.antwort.ablageorte.length, 1);
  for (const t of ['office_runs', 'office_ereignisse', 'office_artefakte', 'office_freigaben', 'office_idempotenz', 'office_run_schluessel']) assert.equal(w.sp.T[t].filter(x => x.run_id === r.run_id).length, 0, t);
  assert.equal(w.sp.T.team_aufgaben_verlauf.filter(v => v.text.includes(RUN_MARKER(r.run_id))).length, 0, 'gespiegelte Verlaufseinträge gelöscht');
  assert.ok(!w.sp.T.office_idempotenz.some(i => i.schluessel === 'p7-del-000001'));
  // Wartung löscht alte Idempotenzschlüssel (30 Tage); Freigaben beendeter Runs verfallen
  const r2 = w.start('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'Alt', 'p7-alt-000001').antwort;
  w.uhr.vor(31 * 86400); const wt = w.als('m_timo', 'wartung', {});
  assert.ok(wt.antwort.geloeschte_schluessel >= 1); assert.equal(w.run(r2.run_id).status, 'unbekannt');
  assert.equal(w.als('m_timo', 'loeschen', { aelter_als_tage: 10 }).code, 400, 'Mindestfrist 30 Tage');
  assert.equal(w.als('m_timo', 'loeschen', { aelter_als_tage: 30 }).antwort.geloescht, 0, 'beendet erst heute');
});

test('Datensparsamkeit: Zugangsdaten-Muster werden aus Freitext entfernt', () => {
  assert.equal(bereinige('Key sk-abcdefghijklmnopqrstu und Token ' + 'a'.repeat(40) + ' fertig'), 'Key [entfernt] und Token [entfernt] fertig');
  assert.match(bereinige('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'), /Bearer \[entfernt\]/);
  assert.match(bereinige('passwort: geheim123'), /\[entfernt\]/);
  assert.equal(bereinige('normaler Text 1234'), 'normaler Text 1234');
});

test('Validierung und Rollen: Eingaben, gesperrte und nicht eingerichtete Nutzer', () => {
  const w = welt();
  assert.equal(w.als('m_gesperrt', 'laden', {}).code, 401);
  assert.equal(w.als('m_neu', 'laden', {}).code, 403);
  assert.equal(w.sp.aufruf({ token: 'zu-kurz', aktion: 'laden' }).code, 401);
  assert.equal(w.sp.aufruf({ token: 'f'.repeat(32), aktion: 'laden' }).code, 401);
  assert.equal(w.als('m_timo', 'unbekannt', {}).code, 400);
  assert.equal(w.start('m_timo', 'akademie-redakteur', 'Akademie-Kurs', 'ab', 'kurz-aber-gueltig').code, 400, 'Auftrag zu kurz');
  assert.equal(w.start('m_timo', 'gibt-es-nicht', 'Akademie-Kurs', 'Text', 'agent-fehlt-0001').code, 404);
  assert.equal(w.start('m_timo', 'akademie-redakteur', 'Akademie-Kurs', 'Text', 'aufgabe-fremd-001', { aufgabe_id: 'a_v1' }).code, 400, 'Aufgabe aus anderem Projekt');
  assert.equal(w.als('m_timo', 'agent_speichern', { agent_id: 'Böse Id' }).code, 400);
  const ok = w.als('m_timo', 'agent_speichern', { agent_id: 'neuer-agent', name: 'Neuer', raum: 'Vertrieb', modell: 'claude-haiku-5-5', mitglied_id: 'agent-hermes', projekte: ['Vertrieb Herbst', 'Gibt es nicht'], ausfuehrer_url: 'http://unsicher' });
  assert.equal(ok.code, 400, 'ausfuehrer_url muss https sein');
  const ok2 = w.als('m_timo', 'agent_speichern', { agent_id: 'neuer-agent', name: 'Neuer', raum: 'Vertrieb', modell: 'claude-haiku-5-5', mitglied_id: 'agent-hermes', projekte: ['Vertrieb Herbst', 'Gibt es nicht'] });
  assert.equal(ok2.code, 200); assert.deepEqual(w.sp.T.office_agenten.find(a => a.agent_id === 'neuer-agent').projekte, ['Vertrieb Herbst']);
  assert.equal(w.als('m_kurt', 'agent_speichern', { agent_id: 'neuer-agent', name: 'X' }).code, 403);
  // Rückfrage/Antwort-Rollen
  const r = w.start('m_murat', 'vertrieb-recherche', 'Vertrieb Herbst', 'Recherche', 'rollen-00000001').antwort;
  w.als('agent-claude', 'lebenszeichen', { run_id: r.run_id });
  assert.equal(w.als('agent-claude', 'rueckfrage', { run_id: r.run_id, frage: 'Welche Region?' }).code, 200);
  assert.equal(w.als('agent-claude', 'antwort', { run_id: r.run_id, text: 'Süd' }).code, 403, 'Agenten antworten nicht selbst');
  assert.equal(w.als('m_lillien', 'antwort', { run_id: r.run_id, text: 'Süd' }).code, 403);
  assert.equal(w.als('m_murat', 'antwort', { run_id: r.run_id, text: 'Süd' }).code, 200);
  assert.equal(w.run(r.run_id).status, 'in_arbeit');
});
