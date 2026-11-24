// KI Office, Kontrollraum: Datenaufbereitung ohne Browser (läuft auch in den Unit-Tests).
// Alles aus der schon rechtegefilterten Antwort auf „laden“ (ctx.D); keine zweite Datenquelle.
// Kennzahlen kommen aus office/lib/kennzahlen.js (Kopie ./kennzahlen.js): nur gemeldete Werte, Kosten ohne Meldung heißen „unbekannt“.
import { AKTIVE_RUN_STATUS, PROBLEM_RUN_STATUS, agentReg, runVon, mitglied, agentZustand, letzteAktivitaetRun, darfEntscheiden, istStartFreigabe, pruefstand } from './modell.js';
import { agentKennzahlen, trendRichtung, runKostenGemeldet, bewertung, kennzahlZeile, kennzahlFaehig, WIRKUNG_FELDER } from './kennzahlen.js';

export const STILL_NACH_MIN = 5;          // Agent „in Arbeit“ ohne Lebenszeichen seit so vielen Minuten bekommt einen roten Rand
export const RAUM_AKZENT = { Akademie: '#A77BFF', Marketing: '#F5A94A', Vertrieb: '#3FD0D4', Kundenprojekte: '#4CCB8F', Verwaltung: '#9FA3C8', Zentrale: '#9B7BFF' };
export const RAUM_ICON = { Akademie: '📘', Marketing: '📣', Vertrieb: '🤝', Kundenprojekte: '🧩', Verwaltung: '🗂️', Zentrale: '🧠' };
const zeit = s => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : null; };
const kurz = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
/** Euro-Betrag; Kleinbeträge unter 10 Cent mit drei Nachkommastellen, damit ein Lauf für 0,4 Cent nicht als 0,00 € erscheint. */
export const euro = x => { if (x == null || !Number.isFinite(Number(x))) return '–'; const n = Number(x); return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.1 ? 3 : 2 }); };
/** „Jetzt“ der Auswertung: der Stand der Daten (Serverzeit), damit Uhr des Browsers und Testdaten keine Rolle spielen. */
export const standMs = D => zeit(D && D.stand) || Date.now();

/**
 * Guthaben eines Agenten im laufenden Monat, aus agent.guthaben vom Server (office/lib/guthaben.js). Durchgesetzt wird dort, nie im Browser.
 * null = kein Monatsguthaben eingerichtet (nicht begrenzt) → die Karte zeigt nur die Kosten.
 * monat = was diesen Monat zur Verfügung steht (Monatsguthaben plus Auffüllung); belegt = verbraucht plus reserviert (laufende Aufträge).
 */
export function guthabenVon(agent) {
  const g = agent && agent.guthaben;
  if (!g || g.monat_eur == null || !Number.isFinite(Number(g.monat_eur))) return null;
  const zusatz = Math.max(0, Number(g.zusatz_eur) || 0);
  const monat = g.verfuegbar_eur != null ? Number(g.verfuegbar_eur) : Number(g.monat_eur) + zusatz;
  const verbraucht = Math.max(0, Number(g.verbraucht_eur) || 0), reserviert = Math.max(0, Number(g.reserviert_eur) || 0);
  const rest = Math.max(0, Math.round((monat - verbraucht - reserviert) * 10000) / 10000);
  const anteil = monat > 0 ? Math.min(1, (verbraucht + reserviert) / monat) : 1;
  return { monat, verbraucht, reserviert, zusatz, rest, anteil, stufe: rest <= 0 ? 'leer' : anteil >= 0.75 ? 'knapp' : 'ok', geschaetzt: g.geschaetzt === true, ohne: Number(g.ohne_angabe) || 0 };
}

/**
 * Kennzahlen eines Agenten: vom Server (Tabelle office_kennzahlen, mit Bewertung), sonst mit derselben Bibliothek aus den Runs gerechnet
 * (solange der Server die Kennzahlen noch nicht liefert; dann ohne Wirkung und nur über die Runs, die diese Rolle sieht).
 */
export function kennzahlenVon(D, a) {
  const vomServer = D.kennzahlen && D.kennzahlen[a.agent_id];
  if (vomServer) return vomServer;
  const kz = agentKennzahlen(D.runs || [], a.agent_id, standMs(D), undefined, { agent: a, artefakte: D.artefakte || [], zeilen: D.kennzahl_zeilen || [] });
  kz.bewertung = bewertung(kz, (D.auswertung || {}).schwellen);
  return kz;
}
/** Zeilen der Auswertung: ein Eintrag je aktivem Agenten mit Kennzahlen und Bewertung, sortiert nach Urteil, dann nach abgenommenen Ergebnissen. */
export function auswertungZeilen(D) {
  const ordnung = { liefert: 0, beobachten: 1, liefert_nicht: 2, zu_wenig: 3 };
  return (D.agenten || []).filter(a => a.aktiv !== false).map(a => { const kz = kennzahlenVon(D, a); return { agent: a, kz, bw: kz.bewertung || bewertung(kz, (D.auswertung || {}).schwellen) }; })
    .sort((x, y) => (ordnung[x.bw.stufe] ?? 9) - (ordnung[y.bw.stufe] ?? 9) || y.kz.abgenommen - x.kz.abgenommen || x.agent.name.localeCompare(y.agent.name));
}
/** Wirkungsfelder eines Agenten (nach seinem Raum), vom Server oder aus der Bibliothek. */
export const wirkungFelder = (D, agent) => (((D.auswertung || {}).wirkung_felder || WIRKUNG_FELDER)[(agent || {}).raum] || []);
/** Wirkung lesbar: „42 qualifizierte Firmen, 4 Termine“. Leer, wenn nichts eingetragen ist. */
export function wirkungText(D, agent, wirkung) {
  const felder = wirkungFelder(D, agent);
  return Object.entries(wirkung || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => n + ' ' + ((felder.find(f => f.feld === k) || {}).text || k)).join(', ');
}
/** Kennzahlzeile eines Runs: vom Server, sonst für beendete Läufe aus dem Run gebildet, sonst null. */
export function kennzahlZeileVon(D, run) {
  const z = (D.kennzahl_zeilen || []).find(k => k.run_id === run.run_id);
  if (z) return z;
  if (!kennzahlFaehig(run)) return null;
  return kennzahlZeile(run, agentReg(D, run.agent_id), D.artefakte || [], null);
}

/** Alles, was eine Agentenkarte braucht: Zustand, aktuelle Aufgabe, letztes Ergebnis, Stille, Kennzahlen, Guthaben. */
export function agentKarteDaten(D, a) {
  const jetzt = standMs(D);
  const z = agentZustand(D, a);
  const rang = { in_arbeit: 0, wartet_freigabe: 1, wartet_rueckmeldung: 2, warteschlange: 3 };
  const aktuell = z.aktiv.slice().sort((x, y) => (rang[x.status] ?? 9) - (rang[y.status] ?? 9) || String(y.erstellt).localeCompare(String(x.erstellt)))[0] || null;
  // Letztes Ergebnis: das neueste Artefakt aus den Runs des Agenten; sonst der zuletzt technisch abgeschlossene Run.
  const eigene = new Map(z.runs.map(r => [r.run_id, r]));
  const art = (D.artefakte || []).filter(x => x && eigene.has(x.run_id)).sort((x, y) => String(y.erstellt || '').localeCompare(String(x.erstellt || '')))[0] || null;
  const fertig = z.runs.filter(r => r.status === 'abgeschlossen').sort((x, y) => String(y.beendet || '').localeCompare(String(x.beendet || '')))[0] || null;
  let letztes = null;
  if (art) { const r = eigene.get(art.run_id); letztes = { titel: art.titel, zeit: art.erstellt, run_id: art.run_id, pruefstand: pruefstand(r), run_status: r.status }; }
  else if (fertig) letztes = { titel: kurz(fertig.zusammenfassung || fertig.auftrag, 80), zeit: fertig.beendet, run_id: fertig.run_id, pruefstand: pruefstand(fertig), run_status: fertig.status };
  // Stille: Run „in Arbeit“, aber seit STILL_NACH_MIN Minuten kein Lebenszeichen (noch vor dem Timeout, der ihn „veraltet“ macht).
  let still_min = null;
  const arbeitet = z.aktiv.filter(r => r.status === 'in_arbeit');
  if (arbeitet.length) { const juengstes = Math.max(...arbeitet.map(r => zeit(r.lebenszeichen) || zeit(r.gestartet) || zeit(r.erstellt) || 0)); const m = (jetzt - juengstes) / 60000; if (m >= STILL_NACH_MIN) still_min = Math.round(m); }
  const kz = kennzahlenVon(D, a);
  return { agent: a, z, zustand: a.aktiv === false ? 'inaktiv' : z.zustand, aktuell, letztes, still_min, kz, trend: trendRichtung(kz.trend), guthaben: guthabenVon(a) };
}

/** Kopfzahlen des Kontrollraums, alle gezählt. */
export function kontrollraumZahlen(D, karten, fuerDich) {
  const jetzt = standMs(D);
  const runs = D.runs || [];
  const woche = jetzt - 7 * 86400000;
  const kz = karten.map(k => k.kz);
  const gemeldet = kz.reduce((s, k) => s + k.kosten_gemeldet, 0);
  return {
    arbeiten: karten.filter(k => k.zustand === 'arbeitet').length,
    warten_auf_dich: fuerDich.filter(f => f.typ !== 'abnahme').length,
    probleme: runs.filter(r => PROBLEM_RUN_STATUS.includes(r.status) && r.abgenommen == null && (zeit(r.beendet) || zeit(r.erstellt) || 0) > woche).length + karten.filter(k => k.still_min !== null).length,
    abgenommen: kz.reduce((s, k) => s + k.abgenommen, 0),
    ergebnisse: kz.reduce((s, k) => s + k.ergebnisse, 0),
    kosten_eur: gemeldet ? Math.round(kz.reduce((s, k) => s + (k.kosten_eur || 0), 0) * 10000) / 10000 : null,
    kosten_geschaetzt: kz.reduce((s, k) => s + k.kosten_geschaetzt, 0), kosten_unbekannt: kz.reduce((s, k) => s + k.kosten_unbekannt, 0),
    aktiv: runs.some(r => r.status === 'in_arbeit' || r.status === 'warteschlange')
  };
}

/**
 * Was gerade einen Menschen braucht, für die angemeldete Person: offene Freigaben, die sie entscheiden darf; Rückfragen und
 * Ergebnisse ohne Abnahme an Runs, die sie steuern darf (Auftraggeber, Dozent, Admin); stille Agenten. Agenten bekommen nichts.
 */
export function fuerDichListe(D, karten) {
  const ich = D.ich || {}; if (ich.typ === 'agent' || ich.rolle === 'agent') return [];
  const dozent = ich.rolle === 'admin' || ich.rolle === 'dozent';
  const steuert = r => dozent || r.auftraggeber === ich.mitglied_id;
  const name = r => { const reg = agentReg(D, r.agent_id); return reg ? reg.name : r.agent_id; };
  const L = [];
  for (const f of (D.freigaben || []).filter(f => f.status === 'offen')) {
    const r = runVon(D, f.run_id); if (!r || !darfEntscheiden(D, f)) continue;
    const ext = (D.externe_aktionen || {})[f.aktion] || { text: f.aktion };
    L.push({ typ: 'freigabe', zeit: f.angefordert_am, run_id: f.run_id, freigabe_id: f.freigabe_id, start: istStartFreigabe(f), titel: (istStartFreigabe(f) ? 'Start freigeben: ' : 'Freigabe: ') + (istStartFreigabe(f) ? name(r) : ext.text), text: kurz(f.inhalt_vorschau || r.auftrag, 110), agent: name(r) });
  }
  for (const r of (D.runs || []).filter(r => r.status === 'wartet_rueckmeldung' && steuert(r))) {
    const frage = (D.ereignisse || []).filter(e => e.run_id === r.run_id && e.art === 'rueckfrage').pop();
    L.push({ typ: 'frage', zeit: frage ? frage.zeit : r.lebenszeichen, run_id: r.run_id, titel: 'Frage von ' + name(r), text: kurz(frage ? ((frage.details || {}).frage || frage.titel) : r.auftrag, 140), agent: name(r) });
  }
  for (const k of karten || []) if (k.still_min !== null && k.aktuell) L.push({ typ: 'problem', zeit: k.aktuell.lebenszeichen, run_id: k.aktuell.run_id, titel: k.agent.name + ' meldet sich nicht', text: 'Seit ' + k.still_min + ' Minuten kein Lebenszeichen. Der Auftrag läuft vielleicht noch, vielleicht hängt er.', agent: k.agent.name });
  for (const r of (D.runs || []).filter(r => r.status === 'abgeschlossen' && r.abgenommen == null && steuert(r)).sort((a, b) => String(b.beendet || '').localeCompare(String(a.beendet || '')))) {
    L.push({ typ: 'abnahme', zeit: r.beendet, run_id: r.run_id, titel: 'Ergebnis prüfen: ' + name(r), text: kurz(r.zusammenfassung || r.auftrag, 110), agent: name(r) });
  }
  return L;
}

// ---------- Live-Ticker: Ereignisse in Ich-Form des Agenten ----------
const NACH = t => { const m = /→\s*([^:]+?)(?::\s*(.*))?$/.exec(t); return m ? { von: t.split('→')[0].trim(), nach: m[1].trim(), grund: (m[2] || '').trim() } : null; };
const punkt = s => /[.!?…“"]$/.test(s) ? s : s + '.';

/**
 * Macht aus einem Ereignis einen kurzen Satz in Ich-Form des Agenten. Deterministisch, kein Modell: Die Server-Ereignisse
 * (Statuswechsel, Freigaben, Abnahmen) haben feste Texte; Schritte und Werkzeugaufrufe der Ausführer bleiben wörtlich.
 * Liefert null für Ereignisse, die nur ein anderes doppeln (z. B. „→ wartet auf Rückmeldung“ neben der Rückfrage selbst).
 */
export function ichForm(D, e) {
  const t = String(e.titel || '').trim();
  const r = runVon(D, e.run_id) || {};
  const wer = id => mitglied(D, id).name;
  const autor = e.autor && e.autor !== 'system' ? wer(e.autor) : '';
  switch (e.art) {
    case 'status': {
      if (/^(Teila|A)uftrag angelegt/.test(t)) return punkt('Neuer Auftrag von ' + wer(r.auftraggeber) + ': ' + kurz(r.auftrag, 110));
      const w = NACH(t); if (!w) return punkt(t);
      if (w.nach === 'in Arbeit') return w.von === 'Warteschlange' ? 'Ich habe den Auftrag übernommen und lege los.' : w.von === 'wartet auf Rückmeldung' ? 'Ich habe die Antwort und arbeite weiter.' : 'Die Entscheidung ist da, ich arbeite weiter.';
      if (w.nach.startsWith('abgeschlossen')) { const k = runKostenGemeldet(r); return 'Ich bin fertig' + (k ? ', das hat ' + euro(k.eur) + ' gekostet (' + k.art + ')' : '') + '. Bitte prüf mein Ergebnis.'; }
      if (w.nach === 'fehlgeschlagen') return punkt('Bei mir ist etwas schiefgegangen' + (w.grund ? ': ' + kurz(w.grund, 140) : ''));
      if (w.nach === 'abgebrochen') return punkt('Mein Auftrag wurde abgebrochen' + (w.grund && w.grund !== 'ohne Angabe' ? ': ' + kurz(w.grund, 140) : ''));
      if (w.nach.startsWith('unbekannt')) return 'Von mir kam zu lange kein Lebenszeichen. Der Auftrag gilt als veraltet.';
      if (w.nach === 'Warteschlange') return w.von === 'wartet auf Freigabe' ? 'Mein Start ist freigegeben. Ich warte, bis mein Ausführer übernimmt.' : 'Ich versuche es noch einmal.';
      return null;   // „→ wartet auf Rückmeldung / Freigabe“: die Rückfrage bzw. Freigabe-Anfrage steht als eigenes Ereignis daneben
    }
    case 'freigabe': {
      let m;
      if (/^Start wartet auf Freigabe/.test(t)) return 'Ich warte auf Timos Startfreigabe.';
      if ((m = /^Freigabe angefordert:\s*(.+)$/.exec(t))) return punkt('Ich brauche deine Freigabe: ' + m[1]);
      if ((m = /^Freigabe (erteilt|abgelehnt|verwendet) von (.+?)(?:\s*\(|$)/.exec(t))) return m[2] + (m[1] === 'abgelehnt' ? ' hat meine Freigabe abgelehnt.' : ' hat mir die Freigabe erteilt.');
      if ((m = /^Start freigegeben von (.+?)(?::\s*(.*))?$/.exec(t))) return m[1] + ' hat meinen Start freigegeben.';
      if ((m = /^Start abgelehnt von (.+?)(?::\s*(.*))?$/.exec(t))) return punkt(m[1] + ' hat meinen Start abgelehnt' + (m[2] ? ': ' + kurz(m[2], 120) : ''));
      return punkt(t);
    }
    case 'artefakt': return punkt('Ich habe ein Ergebnis abgelegt: ' + t.replace(/^(?:Ergebnis:\s*)+/, ''));
    case 'rueckfrage': return punkt('Ich brauche eine Antwort: ' + kurz((e.details || {}).frage || t, 160));
    case 'antwort': return punkt((autor || 'Jemand') + ' hat mir geantwortet: ' + kurz(t, 140));
    case 'abnahme': { const k = (e.details || {}).kommentar; const ok = /abgenommen/.test(t); const m = /von (.+)$/.exec(t); return punkt((m ? m[1] : autor || 'Ein Mensch') + (ok ? ' hat mein Ergebnis abgenommen' : ' hat mein Ergebnis zurückgewiesen') + (k ? ': „' + kurz(k, 120) + '“' : '')); }
    case 'fehler': return punkt('Fehler: ' + kurz(t, 160));
    case 'wiederholung': return punkt('Ich starte ' + t.replace(/^Automatischer Versuch/, 'automatisch Versuch'));
    case 'tool': {
      let m;
      if ((m = /^Teilauftrag delegiert an (.+?):\s*(.*)$/.exec(t))) return punkt('Ich habe einen Teilauftrag an ' + m[1] + ' gegeben: ' + kurz(m[2], 100));
      if ((m = /^Externe Aktion ausgeführt:\s*(.*)$/.exec(t))) return punkt('Ich habe nach der Freigabe ausgeführt: ' + m[1]);
      return punkt(t);
    }
    case 'hinweis': return /^Teilauftrag von /.test(t) ? null : punkt(t);
    default: return punkt(t);
  }
}

/** Die letzten n Ticker-Zeilen, neueste zuerst: { zeit, art, run_id, agent_id, agent, raum, text }. */
export function tickerEintraege(D, n = 12) {
  const E = (D.ereignisse || []).slice().sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)) || (Number(b.sequenz) || 0) - (Number(a.sequenz) || 0));
  const out = [];
  for (const e of E) {
    const text = ichForm(D, e); if (!text) continue;
    const r = runVon(D, e.run_id); const reg = r ? agentReg(D, r.agent_id) : null;
    out.push({ zeit: e.zeit, art: e.art, run_id: e.run_id, agent_id: r ? r.agent_id : '', agent: reg ? reg.name : (r ? r.agent_id : '–'), raum: reg ? reg.raum : '', text });
    if (out.length >= n) break;
  }
  return out;
}

/** Ist gerade etwas in Bewegung (Run in der Warteschlange oder in Arbeit)? Dann lädt das Office alle 30 Sekunden nach, sonst alle 5 Minuten. */
export const istLive = D => (D.runs || []).some(r => r.status === 'in_arbeit' || r.status === 'warteschlange');
export const TAKT = { live_ms: 30000, ruhig_ms: 300000 };
export const aktiveRuns = D => (D.runs || []).filter(r => AKTIVE_RUN_STATUS.includes(r.status));
export { letzteAktivitaetRun };
