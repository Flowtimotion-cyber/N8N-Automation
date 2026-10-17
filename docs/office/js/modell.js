// KI Office: Datenaufbereitung. Alle Kennzahlen stammen aus zählbaren Daten (Aufgaben, Runs, Ereignisse) und nennen ihre Quelle.
// Keine erfundenen Fortschrittsprozente.
import { ueberfaellig } from './util.js';

export const RAEUME = ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung'];
export const AKTIVE_RUN_STATUS = ['warteschlange', 'in_arbeit', 'wartet_rueckmeldung', 'wartet_freigabe'];
export const PROBLEM_RUN_STATUS = ['fehlgeschlagen', 'unbekannt'];

export function mitglied(D, id) { return (D.mitglieder || []).find(m => m.mitglied_id === id) || { mitglied_id: id, name: id || '–', typ: 'mensch' }; }
export function agentReg(D, id) { return (D.agenten || []).find(a => a.agent_id === id) || null; }
export function projektVon(D, name) { return (D.projekte || []).find(p => p.name === name) || null; }
export function projektById(D, id) { return (D.projekte || []).find(p => p.projekt_id === id) || null; }
export function runVon(D, id) { return (D.runs || []).find(r => r.run_id === id) || null; }
export const ereignisseVon = (D, run_id) => (D.ereignisse || []).filter(e => e.run_id === run_id);
export const artefakteVon = (D, run_id) => (D.artefakte || []).filter(a => a.run_id === run_id);
export const freigabenVon = (D, run_id) => (D.freigaben || []).filter(f => f.run_id === run_id);
export const letzteAktivitaetRun = (D, r) => { const E = ereignisseVon(D, r.run_id); return E.length ? E[E.length - 1].zeit : (r.lebenszeichen || r.erstellt); };

// ---------- Orchestrierung: Eltern-Run, Kind-Runs, Teams ----------
/** Agent mit dem Werkzeug auftrag_delegieren: sitzt im Büro in der Zentrale, führt selbst nichts aus. */
export const istOrchestrierer = a => !!a && Array.isArray(a.erlaubte_tools) && a.erlaubte_tools.includes('auftrag_delegieren');
export const kinderVon = (D, run_id) => (D.runs || []).filter(r => r.eltern_run_id === run_id).sort((a, b) => String(a.erstellt).localeCompare(String(b.erstellt)));
export const elternVon = (D, r) => (r && r.eltern_run_id) ? runVon(D, r.eltern_run_id) : null;
/** Alle Teilaufträge, die aus Runs dieses Agenten heraus delegiert wurden (Kind-Runs, deren Eltern-Run der Agent ausführt). */
export const delegierteVon = (D, agent_id) => { const eigene = new Set((D.runs || []).filter(r => r.agent_id === agent_id).map(r => r.run_id)); return (D.runs || []).filter(r => r.eltern_run_id && eigene.has(r.eltern_run_id)); };
/**
 * Laufende Teams fürs Büro: ein Eltern-Run, der noch aktiv ist und Kind-Runs hat (oder eine team_id trägt).
 * Mitglieder = Agenten der Kind-Runs mit dem Status ihres jeweiligen Teilauftrags.
 */
export function laufendeTeams(D) {
  return (D.runs || []).filter(r => !r.eltern_run_id && AKTIVE_RUN_STATUS.includes(r.status)).map(r => {
    const kinder = kinderVon(D, r.run_id);
    if (!kinder.length && !r.team_id) return null;
    const mitglieder = [];
    for (const k of kinder) { let m = mitglieder.find(x => x.agent_id === k.agent_id); if (!m) { m = { agent_id: k.agent_id, reg: agentReg(D, k.agent_id), runs: [] }; mitglieder.push(m); } m.runs.push(k); }
    return { run: r, team_id: r.team_id || null, reg: agentReg(D, r.agent_id), kinder, mitglieder, offen: kinder.filter(k => AKTIVE_RUN_STATUS.includes(k.status)).length };
  }).filter(Boolean);
}

/** Raum eines Projekts: Spalte team_projekte.raum; sonst der Raum der zugeordneten Agenten; sonst null. */
export function raumVon(D, p) {
  if (!p) return null;
  if (p.raum && RAEUME.includes(p.raum)) return p.raum;
  const ag = (D.agenten || []).filter(a => (a.projekte || []).includes(p.name));
  const z = {}; for (const a of ag) z[a.raum] = (z[a.raum] || 0) + 1;
  const best = Object.entries(z).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/** Kennzahlen je Projekt, alle mit Quelle. */
export function projektStand(D, p) {
  const A = (D.aufgaben || []).filter(a => a.projekt === p.name);
  const offen = A.filter(a => a.status !== 'Erledigt');
  const erledigt = A.length - offen.length;
  const R = (D.runs || []).filter(r => r.projekt === p.name);
  const aktiveRuns = R.filter(r => AKTIVE_RUN_STATUS.includes(r.status));
  const fehler = R.filter(r => PROBLEM_RUN_STATUS.includes(r.status));
  const ausstehend = R.filter(r => r.status === 'abgeschlossen' && r.abgenommen !== true && r.abgenommen !== false);
  const runIds = new Set(R.map(r => r.run_id));
  const freigabenOffen = (D.freigaben || []).filter(f => f.status === 'offen' && runIds.has(f.run_id));
  const blockaden = offen.filter(a => a.status === 'Wartet' || /Blockiert|wartet auf/i.test(a.label || ''));
  const ueber = offen.filter(ueberfaellig);
  const meilensteine = offen.filter(a => a.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const prio = offen.length ? Math.min(...offen.map(a => Number(a.prio) || 2)) : null;
  const naechster = offen.slice().sort((a, b) => (Number(a.prio) || 2) - (Number(b.prio) || 2) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')))[0] || null;
  const menschen = new Set([p.verantwortlich, ...A.map(a => a.verantwortlich)].filter(id => id && mitglied(D, id).typ !== 'agent'));
  const agenten = (D.agenten || []).filter(a => (a.projekte || []).includes(p.name));
  const workflows = agenten.filter(a => a.ausfuehrer === 'n8n').map(a => ({ agent_id: a.agent_id, name: a.name, version: a.workflow_version || '' }));
  // Letzte belegte Aktivität: Verlauf der Aufgaben, Run-Ereignisse, Aufgabenänderungen – mit Quelle
  const aIds = new Set(A.map(a => a.aufgabe_id));
  const kand = [];
  for (const v of (D.verlauf || [])) if (aIds.has(v.aufgabe_id)) kand.push({ zeit: v.erstellt, quelle: 'Aufgabenverlauf', text: v.text, autor: v.autor, aufgabe_id: v.aufgabe_id });
  for (const e of (D.ereignisse || [])) if (runIds.has(e.run_id)) kand.push({ zeit: e.zeit, quelle: 'Run-Ereignis', text: e.titel, autor: e.autor, run_id: e.run_id });
  for (const a of A) if (a.geaendert) kand.push({ zeit: a.geaendert, quelle: 'Aufgabe geändert', text: a.titel, aufgabe_id: a.aufgabe_id });
  kand.sort((x, y) => String(y.zeit).localeCompare(String(x.zeit)));
  return { aufgaben: A, offen, erledigt, gesamt: A.length, runs: R, aktiveRuns, fehler, ausstehend, freigabenOffen, blockaden, ueberfaellig: ueber, meilensteine, prio, naechster, menschen: [...menschen], agenten, workflows, letzte: kand[0] || null, aktivitaeten: kand };
}

/** Zustand eines Agenten im Büro: aus seinen Runs. */
export function agentZustand(D, a) {
  const R = (D.runs || []).filter(r => r.agent_id === a.agent_id);
  const akt = R.filter(r => AKTIVE_RUN_STATUS.includes(r.status));
  const letzter = R.slice().sort((x, y) => String(letzteAktivitaetRun(D, y)).localeCompare(String(letzteAktivitaetRun(D, x))))[0] || null;
  let zustand = 'frei';
  if (akt.some(r => r.status === 'in_arbeit')) zustand = 'arbeitet';
  else if (akt.some(r => r.status === 'wartet_freigabe')) zustand = 'wartet_freigabe';
  else if (akt.some(r => r.status === 'wartet_rueckmeldung')) zustand = 'wartet_rueckmeldung';
  else if (akt.some(r => r.status === 'warteschlange')) zustand = 'warteschlange';
  const probleme = R.filter(r => PROBLEM_RUN_STATUS.includes(r.status) && !r.abgenommen && (Date.now() - new Date(r.beendet || r.erstellt).getTime()) < 7 * 86400000);
  return { runs: R, aktiv: akt, letzter, zustand, probleme, zaehler: R.reduce((z, r) => { z[r.status] = (z[r.status] || 0) + 1; return z; }, {}) };
}
export const ZUSTAND_TEXT = { frei: 'frei', arbeitet: 'arbeitet', wartet_freigabe: 'wartet auf Freigabe', wartet_rueckmeldung: 'wartet auf Antwort', warteschlange: 'Auftrag wartet' };
export const ZUSTAND_FARBE = { frei: '#9A98B5', arbeitet: '#1F9D6B', wartet_freigabe: '#E98A15', wartet_rueckmeldung: '#8B5CF6', warteschlange: '#5B6EE6' };

/** Verbrauch lesbar: nur, was gemessen wurde. */
export function verbrauchText(v) {
  if (!v || v.messbar !== true) return 'unbekannt (nicht gemessen)';
  let s = (Number(v.tokens_ein) || 0).toLocaleString('de-DE') + ' Token ein, ' + (Number(v.tokens_aus) || 0).toLocaleString('de-DE') + ' Token aus';
  if (v.modell) s += ' (' + v.modell + ')';
  if (v.kosten_eur != null) s += ' · ' + Number(v.kosten_eur).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 }) + (v.kosten_art === 'gemessen' ? ' gemessen' : ' geschätzt') + (v.kosten_quelle ? ', Quelle: ' + v.kosten_quelle : '');
  else s += ' · Kosten unbekannt';
  return s;
}

// ---------- Monitore: grafische Ergebnisse je Raum ----------
// Ein Artefakt wird nur geladen, wenn seine Adresse https:// ist oder relativ zur Office-Seite liegt.
// Alles mit Schema (http:, data:, javascript:, blob:, notiz:, …), schema-relativ (//…), mit Backslash oder Leerraum wird NICHT geladen.
export function ladbareAdresse(s) {
  s = String(s ?? '').trim();
  if (!s || s.length > 500) return null;
  if (/[\s"'<>]|\\|[\u0000-\u001f\u007f]/.test(s)) return null;
  if (/^https:\/\/[^/?#]+/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (s.startsWith('//')) return null;
  return s;
}
export const ARTEFAKT_TYP_TEXT = { bild: 'Bild', html: 'HTML', pdf: 'PDF', sonst: 'Sonstiges' };
/** Typ eines Artefakts aus art und Ablageort: bild (png/jpg/jpeg/svg/webp/gif), html, pdf, sonst. url ist nur gesetzt, wenn die Adresse ladbar ist. */
export function artefaktTyp(a) {
  a = a || {};
  const art = String(a.art || '').toLowerCase();
  const url = ladbareAdresse(a.ablageort);
  const pfad = String(a.ablageort || '').trim().replace(/[?#].*$/, '').toLowerCase();
  let typ = 'sonst';
  if (/\.(png|jpe?g|svg|webp|gif)$/.test(pfad) || ['bild', 'grafik', 'diagramm', 'image'].includes(art)) typ = 'bild';
  else if (/\.(html?|xhtml)$/.test(pfad) || art === 'html') typ = 'html';
  else if (/\.pdf$/.test(pfad) || art === 'pdf') typ = 'pdf';
  // Ohne ladbare Adresse kann nichts angezeigt werden: Bild/HTML werden dann als Karte behandelt
  if (!url && (typ === 'bild' || typ === 'html')) typ = 'sonst';
  return { typ, url };
}
/** Fachliche Prüfung des Runs, zu dem ein Artefakt gehört: abgenommen, zurueckgewiesen oder ungeprueft. */
export function pruefstand(run) {
  if (!run) return 'ungeprueft';
  if (run.abgenommen === true) return 'abgenommen';
  if (run.abgenommen === false) return 'zurueckgewiesen';
  return 'ungeprueft';
}
export const PRUEFSTAND_TEXT = { abgenommen: 'fachlich abgenommen', zurueckgewiesen: 'zurückgewiesen', ungeprueft: 'ungeprüft' };
/**
 * Die letzten Artefakte eines Raums: aus den Runs aller Projekte dieses Raums, neueste zuerst (erstellt), höchstens n.
 * Jeder Eintrag trägt typ, url (nur ladbar), run, projekt und pruefstand. Rechte: nur, was die Office-API in D.artefakte liefert.
 */
export function raumArtefakte(D, raum, n = 12) {
  const P = (D.projekte || []).filter(p => raumVon(D, p) === raum);
  const namen = new Set(P.map(p => p.name));
  const runs = new Map((D.runs || []).filter(r => namen.has(r.projekt)).map(r => [r.run_id, r]));
  return (D.artefakte || []).filter(a => a && runs.has(a.run_id))
    .sort((a, b) => String(b.erstellt || '').localeCompare(String(a.erstellt || '')) || String(b.artefakt_id || '').localeCompare(String(a.artefakt_id || '')))
    .slice(0, Math.max(0, n))
    .map(a => { const run = runs.get(a.run_id); return { ...a, ...artefaktTyp(a), run, projekt: a.projekt || (run ? run.projekt : ''), pruefstand: pruefstand(run) }; });
}
/** Was der Monitor eines Raums zeigt: das neueste grafische Ergebnis (Bild oder HTML); sonst das neueste PDF; sonst das neueste Ergebnis überhaupt; sonst null. */
export function raumMonitor(D, raum) {
  const A = raumArtefakte(D, raum, 50);
  return A.find(a => a.typ === 'bild' || a.typ === 'html') || A.find(a => a.typ === 'pdf') || A[0] || null;
}
