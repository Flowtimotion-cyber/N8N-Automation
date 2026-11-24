// GENERIERT von office/n8n/bauen.mjs aus office/lib/kennzahlen.js – nicht von Hand ändern.
// KI Office: Kennzahlen je Agent aus den Runs. Reine Funktionen ohne Abhängigkeiten, damit derselbe Code
// in der Oberfläche (Kopie docs/office/js/kennzahlen.js, erzeugt von office/n8n/bauen.mjs) und im Server-Bündel läuft.
// Grundsatz: Es zählt nur, was gemeldet wurde. Kosten ohne Meldung sind „unbekannt“, nie null Euro.
// Keine Personendaten: gerechnet wird je Agent (Registry-Eintrag), nie je Mensch.

export const KENNZAHLEN_TAGE = 28;       // Auswertungsfenster: vier Wochen
export const KENNZAHLEN_WOCHEN = 4;      // Trend: vier Wochenscheiben, älteste zuerst
const KZ_TAG_MS = 86400000;
const kzZeit = s => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : null; };
const kzRund = (x, stellen) => { const f = Math.pow(10, stellen); return Math.round(x * f) / f; };

/** Gemeldete Kosten eines Runs: { eur, art: 'gemessen' | 'geschätzt' } oder null, wenn der Ausführer nichts gemeldet hat. */
export function runKostenGemeldet(run) {
  const v = run && run.verbrauch;
  if (!v || v.messbar !== true || v.kosten_eur == null) return null;
  const eur = Number(v.kosten_eur);
  if (!Number.isFinite(eur) || eur < 0) return null;
  return { eur, art: v.kosten_art === 'gemessen' ? 'gemessen' : 'geschätzt' };
}

/** Zeitpunkt, zu dem ein Run für die Auswertung zählt: Ende, sonst Start, sonst Anlage. */
export function runStichzeit(run) { return kzZeit(run.beendet) || kzZeit(run.gestartet) || kzZeit(run.erstellt); }

/** Dauer eines beendeten Runs in Minuten (Start bis Ende) oder null. */
export function runDauerMin(run) {
  const a = kzZeit(run.gestartet), b = kzZeit(run.beendet);
  return a !== null && b !== null && b >= a ? kzRund((b - a) / 60000, 1) : null;
}

/**
 * Kennzahlen eines Agenten über das Fenster (Standard 28 Tage bis jetztMs).
 * ergebnisse = technisch abgeschlossene Runs; abgenommen / zurueck = fachliche Entscheidung eines Menschen; offen = noch nicht entschieden.
 * kosten_eur = Summe der gemeldeten Kosten aller gelaufenen Runs im Fenster (auch der fehlgeschlagenen, sie haben auch gekostet).
 * kosten_je_abgenommen = kosten_eur / abgenommen, nur wenn es abgenommene Ergebnisse und mindestens eine Kostenmeldung gibt.
 * trend = Kosten je abgenommenem Ergebnis je Wochenscheibe (älteste zuerst), null wo nichts abgenommen wurde.
 */
export function agentKennzahlen(runs, agent_id, jetztMs, tage) {
  const fenster = (Number(tage) > 0 ? Number(tage) : KENNZAHLEN_TAGE) * KZ_TAG_MS;
  const von = jetztMs - fenster;
  const R = (runs || []).filter(r => r && r.agent_id === agent_id).filter(r => { const t = runStichzeit(r); return t !== null && t > von && t <= jetztMs + 60000; });
  const gelaufen = R.filter(r => r.gestartet || ['abgeschlossen', 'fehlgeschlagen'].includes(r.status));
  const fertig = R.filter(r => r.status === 'abgeschlossen');
  const abgenommen = fertig.filter(r => r.abgenommen === true).length;
  const zurueck = fertig.filter(r => r.abgenommen === false).length;
  let kosten = 0, gemeldet = 0, geschaetzt = 0;
  for (const r of gelaufen) { const k = runKostenGemeldet(r); if (!k) continue; kosten += k.eur; gemeldet++; if (k.art !== 'gemessen') geschaetzt++; }
  const dauern = fertig.map(runDauerMin).filter(x => x !== null).sort((a, b) => a - b);
  const bewertet = abgenommen + zurueck;
  const scheibe = fenster / KENNZAHLEN_WOCHEN;
  const trend = [];
  for (let i = 0; i < KENNZAHLEN_WOCHEN; i++) {
    const a = von + i * scheibe, b = a + scheibe;
    const S = gelaufen.filter(r => { const t = runStichzeit(r); return t > a && t <= b; });
    const ok = S.filter(r => r.status === 'abgeschlossen' && r.abgenommen === true).length;
    let k = 0, n = 0; for (const r of S) { const x = runKostenGemeldet(r); if (x) { k += x.eur; n++; } }
    trend.push(ok > 0 && n > 0 ? kzRund(k / ok, 4) : null);
  }
  return {
    agent_id, tage: fenster / KZ_TAG_MS, runs: R.length, gelaufen: gelaufen.length,
    ergebnisse: fertig.length, abgenommen, zurueck, offen: fertig.length - bewertet,
    fehlgeschlagen: R.filter(r => r.status === 'fehlgeschlagen' || r.status === 'unbekannt').length,
    kosten_eur: gemeldet ? kzRund(kosten, 4) : null, kosten_gemeldet: gemeldet, kosten_geschaetzt: geschaetzt, kosten_unbekannt: gelaufen.length - gemeldet,
    kosten_je_abgenommen: abgenommen > 0 && gemeldet > 0 ? kzRund(kosten / abgenommen, 4) : null,
    zurueck_quote: bewertet > 0 ? kzRund(zurueck / bewertet, 4) : null,
    dauer_min: dauern.length ? dauern[Math.floor((dauern.length - 1) / 2)] : null,
    trend
  };
}

/** Richtung des Trends aus den letzten beiden Wochenscheiben mit Wert: 'runter' (günstiger), 'hoch' (teurer), 'gleich' oder null. */
export function trendRichtung(trend) {
  const t = (trend || []).filter(x => x !== null && x !== undefined);
  if (t.length < 2) return null;
  const a = t[t.length - 2], b = t[t.length - 1];
  if (b < a - 0.005) return 'runter';
  if (b > a + 0.005) return 'hoch';
  return 'gleich';
}
