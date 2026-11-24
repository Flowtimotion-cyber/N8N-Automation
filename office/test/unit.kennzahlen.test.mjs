// Kennzahlen je Agent (office/lib/kennzahlen.js) und Datenaufbereitung des Kontrollraums (docs/office/js/kontrollraum.daten.js). Läuft ohne Browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentKennzahlen, runKostenGemeldet, runDauerMin, trendRichtung, KENNZAHLEN_TAGE } from '../lib/kennzahlen.js';
import { kennzahlenKopie, KENNZAHLEN_KOPIE } from '../n8n/bauen.mjs';
import { agentKarteDaten, fuerDichListe, kontrollraumZahlen, ichForm, tickerEintraege, guthabenVon, istLive, euro, STILL_NACH_MIN } from '../../docs/office/js/kontrollraum.daten.js';
import { testSpeicher, TOKENS } from '../dev/testdaten.mjs';

const JETZT = Date.parse('2026-11-24T12:00:00Z');
const vor = tage => new Date(JETZT - tage * 86400000).toISOString();
const run = (id, tage, felder) => Object.assign({ run_id: id, agent_id: 'a', status: 'abgeschlossen', erstellt: vor(tage + 0.02), gestartet: vor(tage + 0.01), beendet: vor(tage), abgenommen: null, verbrauch: null }, felder || {});
const leer = s => String(s).split(String.fromCharCode(160)).join(' ');   // Intl setzt ein geschütztes Leerzeichen vor das Euro-Zeichen
const kosten = (eur, quelle) => ({ messbar: true, tokens_ein: 1000, tokens_aus: 200, kosten_eur: eur, kosten_art: quelle ? 'gemessen' : 'geschätzt', kosten_quelle: quelle || null });

test('Kopie der Kennzahlen-Bibliothek in docs/office/js ist aktuell (bauen.mjs wurde ausgeführt)', () => {
  assert.equal(readFileSync(KENNZAHLEN_KOPIE, 'utf8').replace(/\r\n/g, '\n'), kennzahlenKopie());
});

test('runKostenGemeldet: nur gemeldete Kosten zählen, ohne Meldung null (nie 0 €)', () => {
  assert.equal(runKostenGemeldet({ verbrauch: null }), null);
  assert.equal(runKostenGemeldet({ verbrauch: { messbar: false, hinweis: 'unbekannt' } }), null);
  assert.equal(runKostenGemeldet({ verbrauch: { messbar: true, tokens_ein: 5, tokens_aus: 5 } }), null, 'Token ohne Kosten: Kosten unbekannt');
  assert.deepEqual(runKostenGemeldet({ verbrauch: kosten(0.12, 'Preisliste') }), { eur: 0.12, art: 'gemessen' });
  assert.deepEqual(runKostenGemeldet({ verbrauch: kosten(0.05) }), { eur: 0.05, art: 'geschätzt' });
  assert.equal(runKostenGemeldet({ verbrauch: { messbar: true, kosten_eur: -1 } }), null);
  assert.equal(runDauerMin({ gestartet: '2026-11-24T10:00:00Z', beendet: '2026-11-24T10:19:00Z' }), 19);
  assert.equal(runDauerMin({ gestartet: null, beendet: '2026-11-24T10:19:00Z' }), null);
});

test('agentKennzahlen: abgenommen, zurückgewiesen, Kosten je abgenommenem Ergebnis, Quote, Fenster 28 Tage', () => {
  const runs = [
    run('r1', 1, { abgenommen: true, verbrauch: kosten(0.30, 'x') }),
    run('r2', 3, { abgenommen: true, verbrauch: kosten(0.20, 'x') }),
    run('r3', 5, { abgenommen: false, verbrauch: kosten(0.10) }),
    run('r4', 6, { abgenommen: null }),                                             // technisch fertig, nicht bewertet, keine Kostenmeldung
    run('r5', 8, { status: 'fehlgeschlagen', verbrauch: kosten(0.40, 'x') }),       // hat gekostet, zählt bei den Kosten mit
    run('r6', 40, { abgenommen: true, verbrauch: kosten(9, 'x') }),                 // außerhalb des Fensters
    run('r7', 2, { agent_id: 'b', abgenommen: true, verbrauch: kosten(5, 'x') }),   // anderer Agent
    run('r8', 0.5, { status: 'wartet_freigabe', gestartet: null, beendet: null })   // nie gestartet: kein Lauf
  ];
  const k = agentKennzahlen(runs, 'a', JETZT);
  assert.equal(k.tage, KENNZAHLEN_TAGE); assert.equal(k.ergebnisse, 4); assert.equal(k.abgenommen, 2); assert.equal(k.zurueck, 1); assert.equal(k.offen, 1); assert.equal(k.fehlgeschlagen, 1);
  assert.equal(k.kosten_eur, 1); assert.equal(k.kosten_gemeldet, 4); assert.equal(k.kosten_geschaetzt, 1); assert.equal(k.kosten_unbekannt, 1, 'r4 lief ohne Kostenmeldung');
  assert.equal(k.kosten_je_abgenommen, 0.5); assert.equal(k.zurueck_quote, 0.3333); assert.equal(k.dauer_min, 14.4);
  assert.equal(k.trend.length, 4); assert.equal(k.trend[0], null); assert.equal(k.trend[2], null, 'Woche davor: nur der Fehlschlag, nichts abgenommen'); assert.equal(k.trend[3], 0.3, 'letzte Woche: 0,60 € Kosten, 2 abgenommen');
  const leer = agentKennzahlen(runs, 'niemand', JETZT);
  assert.equal(leer.ergebnisse, 0); assert.equal(leer.kosten_eur, null, 'ohne Läufe: Kosten unbekannt, nicht 0'); assert.equal(leer.kosten_je_abgenommen, null); assert.equal(leer.zurueck_quote, null);
  const ohneMeldung = agentKennzahlen([run('x', 1, { abgenommen: true })], 'a', JETZT);
  assert.equal(ohneMeldung.kosten_eur, null); assert.equal(ohneMeldung.kosten_je_abgenommen, null, 'abgenommen, aber keine Kostenmeldung: kein erfundener Wert'); assert.equal(ohneMeldung.kosten_unbekannt, 1);
});

test('trendRichtung: letzte zwei Wochen mit Wert', () => {
  assert.equal(trendRichtung([0.4, 0.38, 0.33, 0.30]), 'runter'); assert.equal(trendRichtung([null, 0.2, null, 0.3]), 'hoch'); assert.equal(trendRichtung([0.3, 0.3, null, null]), 'gleich'); assert.equal(trendRichtung([null, null, null, 0.3]), null);
});

test('guthabenVon: ohne Monatsguthaben vom Server null; mit Guthaben Rest, Anteil und Stufe', () => {
  assert.equal(guthabenVon({ agent_id: 'a' }), null); assert.equal(guthabenVon({ guthaben: { monat_eur: 0 } }), null);
  assert.deepEqual(guthabenVon({ guthaben: { monat_eur: 8, verbraucht_eur: 2 } }), { monat: 8, verbraucht: 2, rest: 6, anteil: 0.25, stufe: 'ok', geschaetzt: false });
  assert.equal(guthabenVon({ guthaben: { monat_eur: 8, verbraucht_eur: 6.5 } }).stufe, 'knapp'); assert.equal(guthabenVon({ guthaben: { monat_eur: 5, verbraucht_eur: 5.2 } }).stufe, 'leer'); assert.equal(guthabenVon({ guthaben: { monat_eur: 5, verbraucht_eur: 5.2 } }).rest, 0);
  assert.equal(leer(euro(0.004)), '0,004 €'); assert.equal(leer(euro(1.5)), '1,50 €'); assert.equal(euro(null), '–');
});

test('Kontrollraum aus den Testdaten: Karten, stiller Agent, „Für dich“ nach Rolle, Ticker in Ich-Form', () => {
  const { speicher, runs } = testSpeicher({ jetzt: '2026-11-24T12:00:00Z' });
  const laden = tok => speicher.aufruf({ token: tok, aktion: 'laden' }).antwort;
  const D = laden(TOKENS.m_timo);
  const karten = D.agenten.filter(a => a.aktiv !== false).map(a => agentKarteDaten(D, a));
  const karte = id => karten.find(k => k.agent.agent_id === id);
  assert.equal(karte('marketing-texter').zustand, 'wartet_freigabe'); assert.ok(karte('marketing-texter').aktuell, 'aktuelle Aufgabe gesetzt');
  assert.equal(karte('marketing-texter').letztes.titel, 'LinkedIn-Beitrag KW 43 (Vorschau)'); assert.equal(karte('marketing-texter').letztes.pruefstand, 'ungeprueft');
  assert.equal(karte('akademie-redakteur').letztes.run_id !== undefined, true); assert.equal(karte('social-planer').aktuell, null);
  assert.ok(karte('akademie-redakteur').kz.kosten_eur > 0, 'Claude-Code-Läufe melden keinen Verbrauch: der Server schätzt aus der Textlänge'); assert.ok(karte('akademie-redakteur').kz.kosten_geschaetzt >= 1); assert.ok(karte('akademie-redakteur').kz.abgenommen >= 1);
  assert.equal(karte('kurs-waechter').kz.kosten_eur, null, 'ohne jede Kostenangabe: unbekannt, nicht 0');
  assert.ok(karte('marketing-texter').kz.kosten_eur > 0, 'n8n-Lauf der Testdaten meldet Kosten'); assert.equal(karte('marketing-texter').guthaben, null);
  const still = karten.filter(k => k.still_min !== null); assert.ok(still.length >= 1); assert.ok(still.every(k => k.still_min >= STILL_NACH_MIN && k.zustand === 'arbeitet'));
  // Für dich: Timo (Admin) entscheidet Start und externe Freigaben, sieht Rückfrage und stillen Agenten
  const fd = fuerDichListe(D, karten);
  assert.ok(fd.some(f => f.typ === 'freigabe' && f.start === true)); assert.ok(fd.some(f => f.typ === 'freigabe' && f.start === false)); assert.ok(fd.some(f => f.typ === 'frage' && f.run_id === runs.r4)); assert.ok(fd.some(f => f.typ === 'problem')); assert.ok(fd.some(f => f.typ === 'abnahme' && f.run_id === runs.r2));
  const Z = kontrollraumZahlen(D, karten, fd); assert.equal(Z.warten_auf_dich, fd.filter(f => f.typ !== 'abnahme').length); assert.ok(Z.aktiv); assert.ok(Z.arbeiten >= 1); assert.ok(Z.kosten_eur > 0); assert.ok(Z.kosten_unbekannt >= 1); assert.ok(istLive(D));
  // Lillien (Team): keine Startfreigaben (nur Admin), eigene Rückfrage ja, fremde Abnahmen nein
  const DL = laden(TOKENS.m_lillien); const fdL = fuerDichListe(DL, DL.agenten.map(a => agentKarteDaten(DL, a)));
  assert.ok(!fdL.some(f => f.typ === 'freigabe' && f.start)); assert.ok(fdL.some(f => f.typ === 'frage' && f.run_id === runs.r4)); assert.ok(!fdL.some(f => f.typ === 'abnahme' && f.run_id === runs.r2), 'Murats Auftrag gehört nicht in Lilliens Liste');
  // Agenten bekommen keine Liste
  const DA = laden(TOKENS['agent-hermes']); assert.deepEqual(fuerDichListe(DA, []), []);
  // Ticker: neueste zuerst, Ich-Form, keine Dopplung der Wartezustände
  const T = tickerEintraege(D, 200);
  assert.ok(T.length > 20); assert.ok(T.every(e => e.text && e.agent && e.run_id)); assert.ok(T[0].zeit >= T[T.length - 1].zeit);
  assert.ok(T.some(e => e.text === 'Ich habe den Auftrag übernommen und lege los.')); assert.ok(T.some(e => e.text.startsWith('Ich habe ein Ergebnis abgelegt: '))); assert.ok(T.some(e => e.text.startsWith('Ich brauche eine Antwort: ')));
  assert.ok(T.some(e => e.text.startsWith('Ich brauche deine Freigabe: '))); assert.ok(T.some(e => e.text === 'Kurt (Test) hat mein Ergebnis abgenommen: „Passt, zwei Tippfehler selbst korrigiert.“')); assert.ok(T.some(e => e.text.startsWith('Timo (Test) hat meinen Start abgelehnt: ')));
  assert.ok(T.some(e => e.text.startsWith('Ich habe einen Teilauftrag an '))); assert.ok(T.some(e => e.text === 'Von mir kam zu lange kein Lebenszeichen. Der Auftrag gilt als veraltet.'));
  assert.ok(!T.some(e => e.text.includes('→')), 'Statuspfeile sind übersetzt'); assert.ok(!T.some(e => e.text.includes('undefined')));
});

test('ichForm: feste Server-Texte werden zu Sätzen, freie Texte der Ausführer bleiben wörtlich', () => {
  const D = { mitglieder: [{ mitglied_id: 'm1', name: 'Timo' }], runs: [{ run_id: 'r', agent_id: 'a', auftraggeber: 'm1', auftrag: 'Dossier bauen', verbrauch: { messbar: true, kosten_eur: 0.31, kosten_art: 'gemessen' } }], agenten: [] };
  const e = (art, titel, extra) => Object.assign({ run_id: 'r', art, titel }, extra || {});
  assert.equal(ichForm(D, e('status', 'Auftrag angelegt für X (Versuch 1 von 2)')), 'Neuer Auftrag von Timo: Dossier bauen.');
  assert.equal(leer(ichForm(D, e('status', 'in Arbeit → abgeschlossen (technisch)'))), 'Ich bin fertig, das hat 0,31 € gekostet (gemessen). Bitte prüf mein Ergebnis.');
  assert.equal(ichForm(D, e('status', 'in Arbeit → fehlgeschlagen: Zielsystem antwortet nicht')), 'Bei mir ist etwas schiefgegangen: Zielsystem antwortet nicht.');
  assert.equal(ichForm(D, e('status', 'in Arbeit → wartet auf Rückmeldung')), null); assert.equal(ichForm(D, e('status', 'in Arbeit → wartet auf Freigabe')), null);
  assert.equal(ichForm(D, e('status', 'wartet auf Rückmeldung → in Arbeit')), 'Ich habe die Antwort und arbeite weiter.');
  assert.equal(ichForm(D, e('status', 'fehlgeschlagen → Warteschlange: automatische Wiederholung')), 'Ich versuche es noch einmal.');
  assert.equal(ichForm(D, e('freigabe', 'Freigabe erteilt von Timo (E-Mail senden)')), 'Timo hat mir die Freigabe erteilt.');
  assert.equal(ichForm(D, e('freigabe', 'Freigabe abgelehnt von Timo (E-Mail senden)')), 'Timo hat meine Freigabe abgelehnt.');
  assert.equal(ichForm(D, e('abnahme', 'Fachlich zurückgewiesen von Timo', { details: { kommentar: 'Zu lang' } })), 'Timo hat mein Ergebnis zurückgewiesen: „Zu lang“');
  assert.equal(ichForm(D, e('schritt', 'Ich habe 14 von 20 Betrieben geprüft')), 'Ich habe 14 von 20 Betrieben geprüft.');
  assert.equal(ichForm(D, e('tool', 'Aufgaben gelesen')), 'Aufgaben gelesen.'); assert.equal(ichForm(D, e('hinweis', 'Teilauftrag von Orchestrierer (Run x)')), null);
  assert.equal(ichForm(D, e('wiederholung', 'Versuch 2 von 3')), 'Ich starte Versuch 2 von 3.');
});
