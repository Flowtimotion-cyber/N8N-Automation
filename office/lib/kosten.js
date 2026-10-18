// KI Office: Kostenstufen und Startregeln. Wer darf einen Auftrag sofort starten, wer braucht Timos Freigabe?
// Läuft identisch im n8n-Code-Knoten, im Testserver und in den Tests. Die Oberfläche bekommt die Werte in der Antwort auf „laden“ (start_regeln),
// rechnet sie aber nur für Hinweise nach; entschieden wird ausschließlich hier auf dem Server.

// ---- Stellschrauben (Timo kann sie ändern; danach `node office/n8n/bauen.mjs` und das Bündel in die Office-API einspielen) ----
export const START_REGELN = {
  aktiv: true,              // Hauptschalter: false = Regel aus, alle Teammitglieder starten wie früher sofort (nichts anderes ändert sich)
  klein_max_zeichen: 600,   // „klein“: Auftragstext höchstens so lang (Zeichen)
  klein_budget_eur: 0.05,   // „klein“: Kostenlimit je Run in Euro (Standard, wenn der Auftrag kein budget_eur mitbringt; höher = nicht klein)
  tagesbudget_eur: 1,       // Tagesbudget je Person in Euro (Summe der Run-Kosten des Tages); darüber braucht jeder weitere Auftrag Timos Freigabe
  guenstige_modelle: ['deepseek-v4-flash', 'gpt-5-mini', 'claude-haiku-5-5'],  // Kostenstufe „günstig“
  teure_modelle: ['claude-opus-5-5']                                          // Kostenstufe „teuer“; alles andere ist „normal“
};
export const KOSTENSTUFE_TEXT = { guenstig: 'günstig', normal: 'normal', teuer: 'teuer' };
export const FREIGABE_START = { aktion: 'auftrag_start', text: 'Auftrag starten', stufe: 'start' };

/** Kostenstufe nach Modell: guenstig | normal | teuer. */
export function kostenstufe(agent) {
  const m = String((agent && agent.modell) || '');
  if (START_REGELN.guenstige_modelle.includes(m)) return 'guenstig';
  if (START_REGELN.teure_modelle.includes(m)) return 'teuer';
  return 'normal';
}

/**
 * Gilt der Agent für Teammitglieder als „günstig genug“ für einen Sofortstart?
 * Das optionale Registry-Feld freigabe_noetig überschreibt die Stufe: true = immer Freigabe, false = nie wegen des Agenten.
 */
export function agentSofortOk(agent) {
  if (agent && agent.freigabe_noetig === true) return false;
  if (agent && agent.freigabe_noetig === false) return true;
  return kostenstufe(agent) === 'guenstig';
}

/** Kalendertag in Berlin (JJJJ-MM-TT) für das Tagesbudget; fällt auf UTC zurück, falls die Zeitzone fehlt. */
export function tagBerlin(ms) {
  try { return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); } catch (e) { return new Date(ms).toISOString().slice(0, 10); }
}

/** Kosten eines Runs für das Tagesbudget: gemessene Kosten, sonst das Kostenlimit des Runs als Obergrenze. Nie gestartete Runs kosten nichts. */
export function runKostenEur(run) {
  if (!run.gestartet && ['wartet_freigabe', 'abgebrochen', 'unbekannt'].includes(run.status)) return 0;
  const v = run.verbrauch;
  if (v && v.messbar && Number.isFinite(Number(v.kosten_eur))) return Number(v.kosten_eur);
  const b = Number(run.budget_eur);
  return b > 0 ? b : START_REGELN.klein_budget_eur;
}

/** Verbrauch einer Person heute (Euro): alle Runs, die sie heute angelegt hat. */
export function tagesverbrauchEur(runs, mitglied_id, jetztMs) {
  const heute = tagBerlin(jetztMs);
  let s = 0;
  for (const r of runs || []) if (r.auftraggeber === mitglied_id && r.erstellt && tagBerlin(new Date(r.erstellt).getTime()) === heute) s += runKostenEur(r);
  return Math.round(s * 10000) / 10000;
}

const eur = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',') + ' €';

/**
 * Darf der Auftrag sofort starten? mensch_ohne_admin = der Auftraggeber ist ein Mensch und nicht Admin (nur für sie gelten die Regeln).
 * Liefert { sofort, gruende: [{ code, text }], stufe, tagesverbrauch_eur }.
 */
export function startPruefung({ mensch_ohne_admin, agent, auftrag, budget_eur, runs, mitglied_id, jetztMs }) {
  const stufe = kostenstufe(agent);
  const verbrauch = tagesverbrauchEur(runs, mitglied_id, jetztMs);
  if (!mensch_ohne_admin || !START_REGELN.aktiv) return { sofort: true, gruende: [], stufe, tagesverbrauch_eur: verbrauch };
  const gruende = [];
  if (!agentSofortOk(agent)) gruende.push({ code: 'agent', text: agent && agent.freigabe_noetig === true ? 'Für diesen Agenten ist in der Registry immer eine Freigabe eingestellt.' : 'Der Agent gehört zur Kostenstufe „' + KOSTENSTUFE_TEXT[stufe] + '“ (Modell ' + ((agent && agent.modell) || '?') + ').' });
  const laenge = String(auftrag || '').length;
  if (laenge > START_REGELN.klein_max_zeichen) gruende.push({ code: 'laenge', text: 'Der Auftrag ist mit ' + laenge + ' Zeichen länger als ' + START_REGELN.klein_max_zeichen + '.' });
  if (!(budget_eur <= START_REGELN.klein_budget_eur)) gruende.push({ code: 'budget', text: 'Das Kostenlimit des Auftrags (' + eur(budget_eur) + ') liegt über ' + eur(START_REGELN.klein_budget_eur) + '.' });
  if (verbrauch + budget_eur > START_REGELN.tagesbudget_eur) gruende.push({ code: 'tagesbudget', text: 'Das Tagesbudget von ' + eur(START_REGELN.tagesbudget_eur) + ' wäre überschritten (heute schon ' + eur(verbrauch) + ' plus ' + eur(budget_eur) + ').' });
  return { sofort: gruende.length === 0, gruende, stufe, tagesverbrauch_eur: verbrauch };
}
