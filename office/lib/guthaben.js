// KI Office: Euro-Guthaben je Agent und Vorschläge zum Skalieren, Pausieren und Auffüllen (KI Office 2.0, Paket 3).
// Läuft identisch im n8n-Code-Knoten, im Testserver und in den Tests. Durchgesetzt wird ausschließlich hier auf dem Server:
// Ein Agent mit leerem Guthaben bekommt keinen Start. Die Oberfläche zeigt nur an.
// Vorschläge sind Hinweise aus Zahlen. Nichts davon geschieht automatisch: Jede Erhöhung, jede zweite Instanz und jede Pause ist eine Entscheidung von Timo (Admin).
// Kein Krypto, keine Selbstvermehrung: Ein Agent kann sein Guthaben nicht selbst ändern und keine Kopie von sich anlegen.
import { kennzahlZeile, kennzahlFaehig, kennzahlenAusZeilen } from './kennzahlen.js';
import { tagBerlin } from './kosten.js';

// ---- Stellschrauben (Timo kann sie ändern; danach `node office/n8n/bauen.mjs` und das Bündel einspielen) ----
export const GUTHABEN_REGELN = {
  knapp_ab: 0.75,                 // ab diesem verbrauchten Anteil gilt das Guthaben als knapp (orange)
  auffuellen_ab: 0.9,             // ab diesem Anteil erscheint die Karte „Guthaben auffüllen“
  reserve_je_lauf_eur: 0.05,      // laufende Aufträge reservieren ihr Kostenlimit (budget_eur), mindestens diesen Betrag
  max_monat_eur: 500              // Obergrenze für Eingaben, gegen Tippfehler
};
export const VORSCHLAG_REGELN = {
  tage: 14,                        // Zeitraum der Skalierungsregel: zwei Wochen
  mindest_bewertet: 3,             // darunter kein Vorschlag
  kosten_je_ergebnis_max_eur: 0.5, // skalieren nur, wenn ein abgenommenes Ergebnis höchstens so viel kostet
  zurueck_quote_max: 0.2,          // skalieren nur bis zu dieser Zurückweisungsquote; darüber: pausieren
  ruhe_tage: 14,                   // nach einer Entscheidung kommt derselbe Vorschlag so lange nicht wieder
  erhoehen_faktor: 1.5,            // Vorschlag „Guthaben erhöhen“: bisheriges Monatsguthaben mal diesen Faktor
  auffuellen_anteil: 0.5           // Vorschlag „auffüllen“: so viel vom Monatsguthaben für den laufenden Monat dazu
};
// Startvorschlag für das Monatsguthaben nach Modell (Vorschlag aus dem Papier „KI Office 2.0“: zusammen rund 40 €). Timo übernimmt oder ändert.
export const GUTHABEN_START_EUR = { 'claude-haiku-5-5': 2, 'claude-sonnet-5-5': 3, 'claude-opus-5-5': 4, 'gpt-5-mini': 2, 'deepseek-v4-flash': 2 };
export const VORSCHLAG_ARTEN = { auffuellen: 'Guthaben auffüllen', pausieren: 'Agent pausieren', skalieren: 'Agent skalieren', einrichten: 'Guthaben einrichten' };

const ghRund = x => Math.round(x * 10000) / 10000;
const ghEur = x => (Math.round(Number(x) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const ghProz = x => Math.round(x * 100) + ' %';
const ghZahl = x => (x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x))) ? Number(x) : null;
/** Kalendermonat in Berlin (JJJJ-MM). Das Monatsguthaben gilt je Kalendermonat und verfällt am Monatsende. */
export const monatBerlin = ms => tagBerlin(ms).slice(0, 7);

/** Ist für diesen Agenten ein Monatsguthaben eingerichtet? Leer (null) = nicht eingerichtet, dann wird nichts begrenzt. */
export const guthabenEingerichtet = agent => !!agent && ghZahl(agent.budget_eur_monat) !== null && Number(agent.budget_eur_monat) >= 0;

/**
 * Kennzahlzeilen eines Agenten: die Zeilen der Tabelle, ergänzt um beendete Runs ohne Zeile (aus dem Run gebildet).
 * So stimmt der Verbrauch auch für Läufe, die vor dem Anlegen der Tabelle endeten.
 */
export function agentZeilen(agent, zeilen, runs, artefakte) {
  const tab = (zeilen || []).filter(z => z && z.agent_id === agent.agent_id);
  const bekannt = new Set(tab.map(z => z.run_id));
  return tab.concat((runs || []).filter(r => r && r.agent_id === agent.agent_id && !bekannt.has(r.run_id) && kennzahlFaehig(r)).map(r => kennzahlZeile(r, agent, artefakte || [], null)));
}

/**
 * Stand des Guthabens eines Agenten im laufenden Kalendermonat (Berlin). Null, wenn keins eingerichtet ist.
 * verbraucht = gemessene und geschätzte Kosten aller in diesem Monat beendeten Läufe; Läufe ohne Kostenwert zählen nicht (ohne_angabe).
 * reserviert = Kostenlimit der Aufträge, die gerade laufen oder in der Warteschlange stehen (sie haben noch keine Kosten gemeldet).
 * leer = nichts mehr übrig: Dann startet kein weiterer Auftrag, bis Timo auffüllt oder der nächste Monat beginnt.
 */
export function guthabenStand(agent, zeilen, runs, artefakte, jetztMs) {
  if (!guthabenEingerichtet(agent)) return null;
  const monat = monatBerlin(jetztMs);
  const monat_eur = Number(agent.budget_eur_monat);
  const zusatz_eur = agent.budget_zusatz_monat === monat ? Math.max(0, ghZahl(agent.budget_zusatz_eur) || 0) : 0;
  let verbraucht = 0, ohne = 0, geschaetzt = 0;
  for (const z of agentZeilen(agent, zeilen, runs, artefakte)) {
    const t = z.beendet ? new Date(z.beendet).getTime() : NaN;
    if (!Number.isFinite(t) || monatBerlin(t) !== monat) continue;
    const k = ghZahl(z.kosten_eur);
    if (k === null || z.kosten_art === 'unbekannt') { ohne++; continue; }
    verbraucht += Math.max(0, k); if (z.kosten_art !== 'gemessen') geschaetzt++;
  }
  let reserviert = 0, laufend = 0;
  for (const r of runs || []) {
    if (!r || r.agent_id !== agent.agent_id || !['warteschlange', 'in_arbeit', 'wartet_rueckmeldung'].includes(r.status) && !(r.status === 'wartet_freigabe' && r.gestartet)) continue;
    reserviert += Math.max(GUTHABEN_REGELN.reserve_je_lauf_eur, ghZahl(r.budget_eur) || 0); laufend++;
  }
  const verfuegbar = monat_eur + zusatz_eur;
  const belegt = verbraucht + reserviert;
  const rest = ghRund(verfuegbar - belegt);
  const anteil = verfuegbar > 0 ? Math.min(1, belegt / verfuegbar) : 1;
  return { monat, monat_eur: ghRund(monat_eur), zusatz_eur: ghRund(zusatz_eur), verfuegbar_eur: ghRund(verfuegbar), verbraucht_eur: ghRund(verbraucht), reserviert_eur: ghRund(reserviert),
    rest_eur: Math.max(0, rest), anteil: ghRund(anteil), leer: rest <= 0, knapp: rest > 0 && anteil >= GUTHABEN_REGELN.knapp_ab, laufend, geschaetzt: geschaetzt > 0, ohne_angabe: ohne };
}

/** Text für die Ablehnung eines Starts wegen leerem Guthaben. */
export function guthabenLeerText(agent, g) {
  return 'Das Guthaben von ' + ((agent && agent.name) || 'diesem Agenten') + ' für ' + g.monat + ' ist aufgebraucht (' + ghEur(g.verbraucht_eur + g.reserviert_eur) + ' von ' + ghEur(g.verfuegbar_eur) + '). Timo füllt auf oder der Agent bleibt bis zum Monatsende pausiert.';
}

/** Vorgeschlagenes Monatsguthaben für einen Agenten ohne Guthaben (nach Modell). */
export const guthabenStartwert = agent => GUTHABEN_START_EUR[String((agent && agent.modell) || '')] || 3;
const ghAufrunden = x => Math.max(1, Math.ceil(x));

/**
 * Vorschläge aus den Kennzahlen der letzten zwei Wochen. Jede Karte ist ein Vorschlag, nie eine Handlung:
 *  - auffuellen: Guthaben leer oder fast leer
 *  - pausieren:  zu viele Zurückweisungen oder nichts abgenommen
 *  - skalieren:  günstig je abgenommenem Ergebnis und selten zurückgewiesen → Guthaben erhöhen oder zweite Instanz für ein Segment
 *  - einrichten: aktive Agenten ohne Monatsguthaben (eine gemeinsame Karte)
 * entscheidungen = Zeilen aus office_vorschlaege; eine Entscheidung (angenommen oder abgelehnt) lässt denselben Vorschlag ruhe_tage lang ruhen.
 */
export function vorschlaege(agenten, zeilen, runs, artefakte, entscheidungen, jetztMs) {
  const R = VORSCHLAG_REGELN, out = [];
  const ruht = (art, agent_id) => (entscheidungen || []).some(e => e && e.art === art && (e.agent_id || null) === (agent_id || null) && e.entschieden_am && (jetztMs - new Date(e.entschieden_am).getTime()) < R.ruhe_tage * 86400000);
  const ohneGuthaben = [];
  for (const a of agenten || []) {
    if (!a || !a.agent_id) continue;
    const Z = agentZeilen(a, zeilen, runs, artefakte);
    const kz = kennzahlenAusZeilen(Z, a.agent_id, jetztMs, R.tage);
    const g = guthabenStand(a, zeilen, runs, artefakte, jetztMs);
    const bewertet = kz.abgenommen + kz.zurueck;
    const zahlen = { tage: R.tage, ergebnisse: kz.ergebnisse, abgenommen: kz.abgenommen, zurueck: kz.zurueck, zurueck_quote: kz.zurueck_quote, kosten_eur: kz.kosten_eur, kosten_je_abgenommen: kz.kosten_je_abgenommen, guthaben: g };
    const wartend = (runs || []).filter(r => r && r.agent_id === a.agent_id && r.status === 'wartet_freigabe' && !r.gestartet).length;
    if (a.aktiv === false) continue;                       // pausierte Agenten bekommen keine Vorschläge; reaktivieren ist eine eigene Handlung
    if (!g) ohneGuthaben.push(a);
    // Ein leeres Guthaben wird immer gemeldet (sonst stünde der Agent still, ohne dass es jemand sieht); nur die Vorwarnung „fast leer“ ruht nach einer Entscheidung.
    if (g && (g.leer || (g.anteil >= GUTHABEN_REGELN.auffuellen_ab && !ruht('auffuellen', a.agent_id)))) {
      const wert = ghAufrunden(g.monat_eur * R.auffuellen_anteil);
      out.push({ art: 'auffuellen', agent_id: a.agent_id, name: a.name, rang: g.leer ? 0 : 1, titel: a.name + ': Guthaben ' + (g.leer ? 'leer' : 'fast leer'),
        grund: ghEur(g.verbraucht_eur + g.reserviert_eur) + ' von ' + ghEur(g.verfuegbar_eur) + ' für ' + g.monat + ' verbraucht oder reserviert.' + (g.leer ? ' Neue Aufträge starten nicht.' : '') + (wartend ? ' ' + wartend + (wartend === 1 ? ' Auftrag wartet.' : ' Aufträge warten.') : '') + (kz.abgenommen ? ' In den letzten ' + R.tage + ' Tagen ' + kz.abgenommen + ' von ' + kz.ergebnisse + ' Ergebnissen abgenommen.' : ''),
        zahlen, optionen: [{ option: 'auffuellen', text: 'Für diesen Monat auffüllen', wert }] });
    }
    if (bewertet >= R.mindest_bewertet && ((kz.zurueck_quote !== null && kz.zurueck_quote > R.zurueck_quote_max) || kz.abgenommen === 0)) {
      if (!ruht('pausieren', a.agent_id)) out.push({ art: 'pausieren', agent_id: a.agent_id, name: a.name, rang: 2, titel: a.name + ' pausieren',
        grund: kz.zurueck + ' von ' + bewertet + ' bewerteten Ergebnissen zurückgewiesen (' + ghProz(kz.zurueck_quote || 0) + ', Schwelle ' + ghProz(R.zurueck_quote_max) + ') in ' + R.tage + ' Tagen.' + (kz.kosten_eur != null ? ' Kosten in dieser Zeit: ' + ghEur(kz.kosten_eur) + '.' : ''),
        zahlen, optionen: [{ option: 'pausieren', text: 'Pausieren, bis du ihn wieder einschaltest' }] });
    } else if (bewertet >= R.mindest_bewertet && kz.kosten_je_abgenommen !== null && kz.kosten_je_abgenommen <= R.kosten_je_ergebnis_max_eur && (kz.zurueck_quote || 0) <= R.zurueck_quote_max) {
      if (!ruht('skalieren', a.agent_id)) {
        const neu = ghAufrunden((g ? g.monat_eur : guthabenStartwert(a)) * R.erhoehen_faktor);
        out.push({ art: 'skalieren', agent_id: a.agent_id, name: a.name, rang: 3, titel: a.name + ' skalieren',
          grund: kz.abgenommen + ' von ' + bewertet + ' bewerteten Ergebnissen abgenommen (' + ghProz(kz.zurueck_quote || 0) + ' zurückgewiesen), ' + ghEur(kz.kosten_je_abgenommen) + ' je abgenommenem Ergebnis in ' + R.tage + ' Tagen. Beide Werte liegen unter der Schwelle.',
          zahlen, optionen: [{ option: 'guthaben', text: 'Monatsguthaben erhöhen', wert: neu }, { option: 'instanz', text: 'Zweite Instanz für ein Segment anlegen', wert: g ? g.monat_eur : guthabenStartwert(a) }] });
      }
    }
  }
  if (ohneGuthaben.length && !ruht('einrichten', null)) {
    const werte = {}; let summe = 0; for (const a of ohneGuthaben) { werte[a.agent_id] = guthabenStartwert(a); summe += werte[a.agent_id]; }
    out.push({ art: 'einrichten', agent_id: null, name: '', rang: 4, titel: 'Guthaben einrichten für ' + ohneGuthaben.length + (ohneGuthaben.length === 1 ? ' Agenten' : ' Agenten'),
      grund: ohneGuthaben.length + ' aktive Agenten haben noch kein Monatsguthaben und sind damit nicht begrenzt. Vorschlag nach Modell: zusammen ' + ghEur(summe) + ' im Monat.',
      zahlen: { werte, summe_eur: summe }, optionen: [{ option: 'einrichten', text: 'Vorschlag übernehmen', wert: summe }] });
  }
  return out.sort((x, y) => x.rang - y.rang || String(x.name).localeCompare(String(y.name)));
}
