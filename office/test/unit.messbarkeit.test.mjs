// KI Office 2.0, Paket 2 „Messbarkeit“: Kennzahlzeile je Lauf, Schätzung, Wirkung, Bewertung und der Weg durch die Office-API.
// Läuft gegen den echten Verarbeitungscode (identisch mit dem n8n-Code-Knoten) über den In-Memory-Speicher (TESTADAPTER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speicher, Uhr, zufallsQuelle } from '../dev/speicher.mjs';
import { basisTabellen, testSpeicher, musterKennzahlen, TOKENS, tokenVonAgent } from '../dev/testdaten.mjs';
import { kennzahlZeile, kennzahlModell, kennzahlFaehig, kostenAusToken, kostenSchaetzen, wirkungPruefen, bewertung, kennzahlenAusZeilen, agentKennzahlen, AUSWERTUNG_SCHWELLEN, WIRKUNG_FELDER, ERGEBNIS_TYPEN, KZ_PREISE_USD_MIO } from '../lib/kennzahlen.js';
import { auswertungZeilen, kennzahlenVon, wirkungText, kennzahlZeileVon } from '../../docs/office/js/kontrollraum.daten.js';

function welt(ohneTabelle) {
  const uhr = new Uhr('2026-11-24T08:00:00.000Z');
  const T = basisTabellen(uhr.iso()); if (ohneTabelle) delete T.office_kennzahlen;
  const sp = new Speicher({ tabellen: T, uhr, zufall: zufallsQuelle(5) });
  const als = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const agent = (agentId, aktion, daten) => sp.aufruf({ token: tokenVonAgent(agentId), aktion, daten });
  let n = 0;
  /** Legt als Timo einen Auftrag an und lässt den Agenten ihn übernehmen. */
  const lauf = (agentId, projekt, auftrag) => { const r = als('m_timo', 'auftrag_starten', { agent_id: agentId, projekt, auftrag, idempotenzschluessel: 'mess-' + (++n) + '-' + agentId }); assert.equal(r.code, 200, JSON.stringify(r.antwort)); uhr.vor(5); assert.equal(agent(agentId, 'lebenszeichen', { run_id: r.antwort.run_id }).code, 200); return r.antwort.run_id; };
  const zeile = id => (sp.T.office_kennzahlen || []).find(k => k.run_id === id);
  return { uhr, sp, als, agent, lauf, zeile };
}

test('Schätzung: Preistabelle, Textlänge, unbekannte Modelle', () => {
  assert.equal(kostenAusToken('claude-sonnet-5-5', 1000000, 0), 1.84); assert.equal(kostenAusToken('claude-haiku-5-5', 0, 1000000), 0.46); assert.equal(kostenAusToken('unbekanntes-modell', 1000, 1000), null);
  const s = kostenSchaetzen('claude-sonnet-5-5', 350, 3500);
  assert.equal(s.tokens_aus, 1000); assert.equal(s.tokens_ein, 100 + 4 * 1000); assert.equal(s.kosten_eur, kostenAusToken('claude-sonnet-5-5', 4100, 1000));
  assert.equal(kostenSchaetzen('deepseek-v4-flash', 100, 100), null, 'ohne Preis keine Schätzung'); assert.equal(kostenSchaetzen('claude-sonnet-5-5', 0, 0), null);
  for (const m of Object.keys(KZ_PREISE_USD_MIO)) assert.equal(KZ_PREISE_USD_MIO[m].length, 2);
});

test('wirkungPruefen: nur bekannte Felder des Raums, nur ganze Zahlen', () => {
  assert.deepEqual(wirkungPruefen('Vertrieb', { firmen: 12, termine: '4' }), { wirkung: { firmen: 12, termine: 4 } });
  assert.deepEqual(wirkungPruefen('Vertrieb', null), { wirkung: {} }); assert.deepEqual(wirkungPruefen('Vertrieb', { firmen: '' }), { wirkung: {} });
  assert.ok(wirkungPruefen('Vertrieb', { lektionen: 1 }).fehler, 'Feld eines anderen Raums'); assert.ok(wirkungPruefen('Vertrieb', { firmen: 'Müller GmbH' }).fehler, 'kein Text'); assert.ok(wirkungPruefen('Vertrieb', { firmen: -1 }).fehler); assert.ok(wirkungPruefen('Vertrieb', { firmen: 1.5 }).fehler);
  assert.ok(wirkungPruefen('Vertrieb', ['firmen']).fehler); assert.ok(wirkungPruefen('Vertrieb', { firmen: true }).fehler, 'kein Wahrheitswert'); assert.ok(wirkungPruefen('Vertrieb', { firmen: [12] }).fehler, 'keine Liste'); assert.ok(wirkungPruefen('Gibtsnicht', { firmen: 1 }).fehler);
  for (const raum of ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung']) assert.ok(WIRKUNG_FELDER[raum].length >= 1, raum);
});

test('kennzahlZeile: gemessen, geschätzt (Ausführer, Preistabelle, Textlänge), unbekannt; keine Personendaten in der Zeile', () => {
  const basis = { run_id: 'r', agent_id: 'a', status: 'abgeschlossen', auftraggeber: 'm_timo', auftrag: 'x'.repeat(350), zusammenfassung: 'y'.repeat(3500), erstellt: '2026-11-24T10:00:00Z', gestartet: '2026-11-24T10:01:00Z', beendet: '2026-11-24T10:20:00Z', abgenommen: true, abgenommen_von: 'm_kurt', abgenommen_am: '2026-11-24T11:00:00Z', abnahme_kommentar: 'Passt', projekt: 'Kundenprojekt Müller GmbH', versuche: 2 };
  const cc = { agent_id: 'a', raum: 'Vertrieb', modell: 'claude-sonnet-5-5', ausfuehrer: 'claude-code' }, n8n = { agent_id: 'a', raum: 'Marketing', modell: 'claude-sonnet-5-5', ausfuehrer: 'n8n' };
  const gem = kennzahlZeile({ ...basis, ausfuehrer: 'n8n', verbrauch: { messbar: true, tokens_ein: 1200, tokens_aus: 400, modell: 'gpt-5-mini', kosten_eur: 0.004, kosten_art: 'gemessen', kosten_quelle: 'Preisliste' } }, n8n, []);
  assert.equal(gem.kosten_art, 'gemessen'); assert.equal(gem.kosten_basis, 'ausfuehrer'); assert.equal(gem.kosten_eur, 0.004); assert.equal(gem.modell, 'gpt-5-mini', 'tatsächlich genutztes Modell'); assert.equal(gem.dauer_sek, 1140); assert.equal(gem.abnahme, 'abgenommen'); assert.equal(gem.versuche, 2);
  // Das Modell ist Freitext des Ausführers: in die Zeile kommt nur ein bekannter Modellname, sonst der der Registry oder „sonstiges“
  assert.equal(kennzahlZeile({ ...basis, ausfuehrer: 'n8n', verbrauch: { messbar: true, tokens_ein: 1, tokens_aus: 1, modell: 'Max Mustermann, Beispiel GmbH', kosten_eur: 0.01 } }, n8n, []).modell, 'claude-sonnet-5-5');
  assert.equal(kennzahlModell('irgendein text', 'auch unbekannt'), 'sonstiges'); assert.equal(kennzahlModell('', ''), null); assert.equal(kennzahlModell('gpt-5-mini', 'claude-opus-5-5'), 'gpt-5-mini');
  const ohneQuelle = kennzahlZeile({ ...basis, ausfuehrer: 'n8n', verbrauch: { messbar: true, tokens_ein: 1200, tokens_aus: 400, kosten_eur: 0.004, kosten_art: 'geschätzt' } }, n8n, []);
  assert.equal(ohneQuelle.kosten_art, 'geschaetzt'); assert.equal(ohneQuelle.kosten_basis, 'ausfuehrer');
  const nurToken = kennzahlZeile({ ...basis, ausfuehrer: 'n8n', verbrauch: { messbar: true, tokens_ein: 100000, tokens_aus: 20000 } }, n8n, []);
  assert.equal(nurToken.kosten_art, 'geschaetzt'); assert.equal(nurToken.kosten_basis, 'preistabelle'); assert.equal(nurToken.kosten_eur, kostenAusToken('claude-sonnet-5-5', 100000, 20000));
  const text = kennzahlZeile({ ...basis, ausfuehrer: 'claude-code', verbrauch: { messbar: false, hinweis: 'unbekannt' } }, cc, [{ run_id: 'r', art: 'notiz', groesse: 7000 }, { run_id: 'anderer', art: 'notiz', groesse: 99999 }]);
  assert.equal(text.kosten_art, 'geschaetzt'); assert.equal(text.kosten_basis, 'textlaenge'); assert.equal(text.tokens_aus, 3000); assert.equal(text.ergebnisse, 1); assert.equal(text.ergebnis_typ, 'text');
  const n8nOhne = kennzahlZeile({ ...basis, ausfuehrer: 'n8n', verbrauch: null }, n8n, []);
  assert.equal(n8nOhne.kosten_art, 'unbekannt'); assert.equal(n8nOhne.kosten_eur, null, 'n8n ohne Meldung (z. B. deterministisch): unbekannt, nicht aus Textlänge geraten');
  const mitTyp = kennzahlZeile({ ...basis, ausfuehrer: 'claude-code', ergebnis_typ: 'dossier', wirkung: { firmen: 12, unbekannt: 3 } }, cc, []);
  assert.equal(mitTyp.ergebnis_typ, 'dossier'); assert.deepEqual(mitTyp.wirkung, {}, 'ungültige Wirkung wird nicht übernommen');
  assert.deepEqual(kennzahlZeile({ ...basis, ergebnis_typ: 'dossier', wirkung: { firmen: 12 } }, cc, []).wirkung, { firmen: 12 });
  // Datenschutz: nur diese Felder, keine Namen, kein Text, kein Projekt
  assert.deepEqual(Object.keys(gem).sort(), ['abnahme', 'agent_id', 'ausfuehrer', 'beendet', 'dauer_sek', 'ergebnis_typ', 'ergebnisse', 'geaendert', 'kosten_art', 'kosten_basis', 'kosten_eur', 'modell', 'raum', 'run_id', 'status', 'tokens_aus', 'tokens_ein', 'versuche', 'wirkung']);
  const roh = JSON.stringify(text); for (const verboten of ['m_timo', 'm_kurt', 'Passt', 'Müller', 'xxxx', 'yyyy']) assert.ok(!roh.includes(verboten), verboten + ' darf nicht in der Zeile stehen');
  assert.ok(kennzahlFaehig({ status: 'abgeschlossen' })); assert.ok(!kennzahlFaehig({ status: 'abgebrochen', gestartet: null }), 'nie gestartet'); assert.ok(kennzahlFaehig({ status: 'abgebrochen', gestartet: 'x' })); assert.ok(!kennzahlFaehig({ status: 'in_arbeit', gestartet: 'x' }));
  assert.ok(ERGEBNIS_TYPEN.includes('dossier'));
});

test('bewertung: liefert, beobachten, liefert nicht, zu wenig Daten', () => {
  const kz = o => Object.assign({ abgenommen: 5, zurueck: 0, zurueck_quote: 0, kosten_je_abgenommen: 0.3 }, o);
  assert.equal(bewertung(kz({})).stufe, 'liefert');
  assert.equal(bewertung(kz({ abgenommen: 2, zurueck: 0 })).stufe, 'zu_wenig');
  assert.equal(bewertung(kz({ abgenommen: 4, zurueck: 2, zurueck_quote: 0.3333 })).stufe, 'liefert_nicht');
  assert.equal(bewertung(kz({ abgenommen: 4, zurueck: 1, zurueck_quote: 0.2 })).stufe, 'liefert', 'genau auf der Schwelle zählt noch');
  assert.equal(bewertung(kz({ abgenommen: 0, zurueck: 3, zurueck_quote: 1 })).stufe, 'liefert_nicht');
  assert.equal(bewertung(kz({ kosten_je_abgenommen: 0.51 })).stufe, 'beobachten'); assert.equal(bewertung(kz({ kosten_je_abgenommen: null })).stufe, 'beobachten');
  assert.equal(bewertung(kz({ kosten_je_abgenommen: 0.51 }), { kosten_je_ergebnis_max_eur: 1 }).stufe, 'liefert', 'Schwellen sind einstellbar');
  assert.ok(bewertung(kz({})).gruende.length >= 1); assert.equal(AUSWERTUNG_SCHWELLEN.mindest_bewertet, 3);
});

test('Office-API: run_beenden schreibt die Kennzahlzeile, Abnahme und Wirkung aktualisieren sie, Löschen des Runs lässt sie stehen', () => {
  const w = welt();
  const id = w.lauf('vertrieb-recherche', 'Vertrieb Herbst', 'Dossier Metallbau Region Süd mit zwölf Betrieben');
  w.agent('vertrieb-recherche', 'artefakt', { run_id: id, art: 'notiz', titel: 'Dossier Metallbau', ablageort: 'notiz:Dossier', groesse: 7000 });
  w.uhr.vor(600);
  const r = w.agent('vertrieb-recherche', 'run_beenden', { run_id: id, status: 'abgeschlossen', zusammenfassung: 'Zwölf Betriebe geprüft, Dossier liegt als Notiz vor.', ergebnis_typ: 'dossier', wirkung: { dossiers: 1, firmen: 12 } });
  assert.equal(r.code, 200, JSON.stringify(r.antwort));
  let z = w.zeile(id);
  assert.equal(z.status, 'abgeschlossen'); assert.equal(z.ergebnis_typ, 'dossier'); assert.deepEqual(z.wirkung, { dossiers: 1, firmen: 12 }); assert.equal(z.abnahme, 'offen'); assert.equal(z.ergebnisse, 1);
  assert.equal(z.kosten_art, 'geschaetzt'); assert.equal(z.kosten_basis, 'textlaenge'); assert.ok(z.kosten_eur > 0); assert.equal(z.raum, 'Vertrieb'); assert.ok(z.dauer_sek >= 600);
  assert.ok(!JSON.stringify(z).includes('m_timo') && !JSON.stringify(z).includes('Metallbau'), 'kein Auftraggeber, kein Text');
  // Abnahme mit weiterer Wirkung: Zeile wird aktualisiert, vorhandene Wirkung bleibt, Ergebnis-Typ bleibt
  assert.equal(w.als('m_murat', 'run_abnehmen', { run_id: id, abgenommen: true, kommentar: 'Gut' }).code, 403, 'fremder Auftrag: Murat darf nicht abnehmen');
  assert.equal(w.als('m_timo', 'run_abnehmen', { run_id: id, abgenommen: true, kommentar: 'Gut', wirkung: { termine: 'vier' } }).code, 400, 'Wirkung nur als Zahl');
  assert.equal(w.als('m_timo', 'run_abnehmen', { run_id: id, abgenommen: true, kommentar: 'Gut, vier rufe ich an.', wirkung: { termine: 2 } }).code, 200);
  z = w.zeile(id); assert.equal(z.abnahme, 'abgenommen'); assert.equal(z.abnahme_am, undefined, 'kein Zeitpunkt der Abnahme in den Kennzahlen'); assert.deepEqual(z.wirkung, { dossiers: 1, firmen: 12, termine: 2 }); assert.equal(z.ergebnis_typ, 'dossier');
  assert.equal(w.sp.T.office_kennzahlen.filter(k => k.run_id === id).length, 1, 'eine Zeile je Run, kein Duplikat');
  // Wirkung nachtragen: nur Menschen mit Steuerrecht, nur abgeschlossene Runs, nur Zahlen
  assert.equal(w.agent('vertrieb-recherche', 'wirkung_setzen', { run_id: id, wirkung: { termine: 9 } }).code, 403, 'Agenten tragen keine Wirkung nach');
  assert.equal(w.als('m_lillien', 'wirkung_setzen', { run_id: id, wirkung: { termine: 9 } }).code, 403, 'fremder Auftrag');
  assert.equal(w.als('m_timo', 'wirkung_setzen', { run_id: id, wirkung: {} }).code, 400);
  assert.equal(w.als('m_timo', 'wirkung_setzen', { run_id: id, wirkung: { termine: 4 } }).code, 200);
  assert.deepEqual(w.zeile(id).wirkung, { dossiers: 1, firmen: 12, termine: 4 });
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === id && e.art === 'hinweis' && e.titel.includes('Wirkung eingetragen') && e.titel.includes('Termine 4')));
  // laden: Kennzahlen je Agent mit Bewertung, Zeile des Runs, Einstellungen
  const D = w.als('m_timo', 'laden').antwort;
  assert.equal(D.auswertung.tabelle, true); assert.equal(D.kennzahlen['vertrieb-recherche'].abgenommen, 1); assert.deepEqual(D.kennzahlen['vertrieb-recherche'].wirkung, { dossiers: 1, firmen: 12, termine: 4 }); assert.equal(D.kennzahlen['vertrieb-recherche'].bewertung.stufe, 'zu_wenig');
  assert.equal(D.kennzahl_zeilen.length, 1); assert.equal(D.auswertung.schwellen.zurueck_quote_max, 0.2); assert.ok(D.auswertung.wirkung_felder.Vertrieb.some(f => f.feld === 'termine'));
  // Agenten sehen nur die Kennzahlen der Registry-Einträge, die sie selbst ausführen
  const DH = w.agent('kurs-waechter', 'laden').antwort; assert.deepEqual(Object.keys(DH.kennzahlen).sort(), ['kurs-waechter', 'pa-assistent', 'server-waechter']); assert.equal(DH.kennzahl_zeilen.length, 0);
  // Löschen des Runs (Löschkonzept): die Kennzahlzeile bleibt, sie enthält keine Personendaten
  w.uhr.vor(31 * 86400);
  assert.equal(w.als('m_timo', 'loeschen', { run_id: id }).code, 200); assert.equal(w.sp.T.office_runs.some(x => x.run_id === id), false);
  assert.equal(w.zeile(id), undefined, 'die Kennung des Runs steht nicht mehr in den Kennzahlen'); const rest = w.sp.T.office_kennzahlen.filter(k => k.agent_id === 'vertrieb-recherche');
  assert.equal(rest.length, 1, 'die Zeile selbst überlebt den Run'); assert.ok(rest[0].run_id.startsWith('geloescht_') && !rest[0].run_id.includes(id)); assert.deepEqual(rest[0].wirkung, { dossiers: 1, firmen: 12, termine: 4 });
});

test('Office-API: Fehlschlag, automatische Wiederholung, Abbruch und veraltete Runs', () => {
  const w = welt();
  // Ungültige Wirkung vom Ausführer: der Abschluss gilt trotzdem, die Wirkung wird verworfen und als Hinweis festgehalten
  const u = w.lauf('vertrieb-recherche', 'Vertrieb Herbst', 'Dossier mit falsch gemeldeter Wirkung');
  const ru = w.agent('vertrieb-recherche', 'run_beenden', { run_id: u, status: 'abgeschlossen', zusammenfassung: 'Fertig.', wirkung: { firmen_qualifiziert: 12 } });
  assert.equal(ru.code, 200); assert.ok(ru.antwort.wirkung_verworfen.includes('Unbekanntes Wirkungsfeld')); assert.deepEqual(w.zeile(u).wirkung, {}); assert.equal(w.zeile(u).status, 'abgeschlossen');
  assert.ok(w.sp.T.office_ereignisse.some(e => e.run_id === u && e.art === 'hinweis' && e.titel.startsWith('Gemeldete Wirkung nicht übernommen')));
  // Fehlschlag ohne Wiederholung (Redakteur: auto_wiederholen false): Zeile mit Status fehlgeschlagen, Kosten geschätzt
  const f = w.lauf('akademie-redakteur', 'Akademie-Kurs', 'Merkblatt schreiben, geht schief');
  assert.equal(w.agent('akademie-redakteur', 'run_beenden', { run_id: f, status: 'fehlgeschlagen', fehler: 'Quelle nicht erreichbar' }).code, 200);
  assert.equal(w.zeile(f).status, 'fehlgeschlagen'); assert.equal(w.zeile(f).ergebnis_typ, 'ohne');
  // Wiederholung durch einen Menschen, dann Erfolg: dieselbe Zeile wird fortgeschrieben
  assert.equal(w.als('m_timo', 'run_wiederholen', { run_id: f }).code, 200); w.uhr.vor(5); w.agent('akademie-redakteur', 'lebenszeichen', { run_id: f }); w.uhr.vor(120);
  assert.equal(w.agent('akademie-redakteur', 'run_beenden', { run_id: f, status: 'abgeschlossen', zusammenfassung: 'Merkblatt liegt vor.', ergebnis_typ: 'text' }).code, 200);
  assert.equal(w.zeile(f).status, 'abgeschlossen'); assert.equal(w.zeile(f).versuche, 2); assert.equal(w.sp.T.office_kennzahlen.filter(k => k.run_id === f).length, 1);
  // Automatische Wiederholung (Kurs-Wächter): der Lauf geht weiter, noch keine Zeile
  const a = w.lauf('kurs-waechter', 'Akademie-Kurs', 'Kursstatus prüfen');
  assert.equal(w.agent('kurs-waechter', 'run_beenden', { run_id: a, status: 'fehlgeschlagen', fehler: 'Zeitüberschreitung' }).antwort.status, 'warteschlange'); assert.equal(w.zeile(a), undefined);
  // Gemeldeter Verbrauch mit Quelle: gemessen
  w.uhr.vor(5); w.agent('kurs-waechter', 'lebenszeichen', { run_id: a });
  w.agent('kurs-waechter', 'run_beenden', { run_id: a, status: 'abgeschlossen', zusammenfassung: 'Keine Störung.', verbrauch: { tokens_ein: 1200, tokens_aus: 300, modell: 'claude-haiku-5-5', kosten_eur: 0.0003, kosten_quelle: 'Abrechnung Anbieter' } });
  assert.equal(w.zeile(a).kosten_art, 'gemessen'); assert.equal(w.zeile(a).kosten_eur, 0.0003); assert.equal(w.zeile(a).tokens_ein, 1200);
  // Abbruch eines gestarteten Runs: Zeile mit Status abgebrochen; Abbruch eines nie gestarteten Runs: keine Zeile
  const b = w.lauf('vertrieb-recherche', 'Vertrieb Herbst', 'Firmenliste, wird abgebrochen');
  assert.equal(w.als('m_timo', 'run_abbrechen', { run_id: b, grund: 'Thema erledigt' }).code, 200); assert.equal(w.zeile(b).status, 'abgebrochen');
  const nie = w.als('m_timo', 'auftrag_starten', { agent_id: 'rekruiter', projekt: 'Verwaltung & Finanzen', auftrag: 'Steckbrief, nie gestartet', idempotenzschluessel: 'mess-nie-gestartet' }).antwort.run_id;
  assert.equal(w.als('m_timo', 'run_abbrechen', { run_id: nie }).code, 200); assert.equal(w.zeile(nie), undefined);
  // Veraltet durch die Wartung: Zeile mit Status unbekannt
  const v = w.lauf('angebots-pruefer', 'Vertrieb Herbst', 'Angebot prüfen, meldet sich nie wieder');
  w.uhr.vor(3 * 3600); assert.equal(w.sp.aufruf({ aktion: 'wartung', intern: true }).code, 200);
  assert.equal(w.zeile(v).status, 'unbekannt'); assert.equal(w.zeile(v).kosten_art, 'unbekannt', 'ohne Ergebnis keine Schätzung');
});

test('Ohne Kennzahlen-Tabelle (SQL noch nicht ausgeführt): nichts wird dorthin geschrieben, die Auswertung rechnet aus den Runs', () => {
  const w = welt(true);
  const id = w.lauf('vertrieb-recherche', 'Vertrieb Herbst', 'Dossier ohne Tabelle');
  const r = w.agent('vertrieb-recherche', 'run_beenden', { run_id: id, status: 'abgeschlossen', zusammenfassung: 'Fertig, Dossier liegt vor.', ergebnis_typ: 'dossier', wirkung: { firmen: 3 } });
  assert.equal(r.code, 200); assert.equal(w.sp.T.office_kennzahlen, undefined, 'kein Schreibauftrag auf eine Tabelle, die es nicht gibt');
  assert.equal(w.als('m_timo', 'run_abnehmen', { run_id: id, abgenommen: true }).code, 200);
  assert.equal(w.als('m_timo', 'wirkung_setzen', { run_id: id, wirkung: { firmen: 3 } }).code, 409);
  const D = w.als('m_timo', 'laden').antwort;
  assert.equal(D.auswertung.tabelle, false); assert.deepEqual(D.kennzahl_zeilen, []);
  assert.equal(D.kennzahlen['vertrieb-recherche'].abgenommen, 1); assert.ok(D.kennzahlen['vertrieb-recherche'].kosten_eur > 0, 'Schätzung aus dem Run');
  assert.equal(kennzahlZeileVon(D, D.runs.find(x => x.run_id === id)).kosten_basis, 'textlaenge');
});

test('Musterdaten und Auswertung: Rangliste aus den Testdaten, Oberfläche rechnet wie der Server', () => {
  const M = musterKennzahlen('2026-11-24T12:00:00Z');
  assert.ok(M.length > 80); assert.equal(new Set(M.map(z => z.run_id)).size, M.length, 'eindeutige Kennungen'); assert.ok(M.every(z => z.run_id.startsWith('muster_')));
  assert.ok(M.every(z => new Date(z.beendet).getTime() < Date.parse('2026-11-24T12:00:00Z') - 86400000 + 1 && new Date(z.beendet).getTime() > Date.parse('2026-11-24T12:00:00Z') - 28 * 86400000));
  const { speicher } = testSpeicher({ jetzt: '2026-11-24T12:00:00Z' });
  const D = speicher.aufruf({ token: TOKENS.m_timo, aktion: 'laden' }).antwort;
  const Z = auswertungZeilen(D); const stufe = id => Z.find(z => z.agent.agent_id === id).bw.stufe;
  assert.equal(stufe('vertrieb-recherche'), 'liefert'); assert.equal(stufe('marketing-texter'), 'liefert'); assert.equal(stufe('social-planer'), 'liefert_nicht'); assert.equal(stufe('angebots-pruefer'), 'beobachten'); assert.equal(stufe('kurs-waechter'), 'beobachten'); assert.equal(stufe('rekruiter'), 'zu_wenig');
  assert.deepEqual(Z.map(z => z.bw.stufe), Z.map(z => z.bw.stufe).slice().sort((a, b) => ['liefert', 'beobachten', 'liefert_nicht', 'zu_wenig'].indexOf(a) - ['liefert', 'beobachten', 'liefert_nicht', 'zu_wenig'].indexOf(b)), 'sortiert nach Urteil');
  const vr = D.agenten.find(a => a.agent_id === 'vertrieb-recherche');
  assert.equal(wirkungText(D, vr, kennzahlenVon(D, vr).wirkung), '14 Dossiers, 42 qualifizierte Firmen, 4 Termine');
  assert.equal(kennzahlenVon(D, vr).trend.filter(x => x !== null).length, 4, 'Trend über vier Wochen');
  // Dieselbe Rechnung ohne Server-Kennzahlen (Rückfall der Oberfläche) ergibt für die Zeilen der Tabelle dieselben Zahlen
  const jetzt = Date.parse(D.stand);
  for (const a of D.agenten) { const server = D.kennzahlen[a.agent_id]; const lokal = agentKennzahlen(D.runs, a.agent_id, jetzt, undefined, { agent: a, artefakte: D.artefakte, zeilen: speicher.T.office_kennzahlen }); assert.equal(lokal.abgenommen, server.abgenommen, a.agent_id); assert.equal(lokal.kosten_eur, server.kosten_eur, a.agent_id); }
  assert.equal(kennzahlenAusZeilen(M, 'social-planer', Date.parse('2026-11-24T12:00:00Z')).zurueck_quote, 0.5);
});
