// KI Office: virtuelles Büro als isometrische 2D-Szene (eigenes SVG, keine fremden Assets, kein 3D).
// Bedienkonzept: schwebende Plattformen je Raum um eine Zentrale, Agenten als kleine Figuren an Schreibtischen,
// Sprechblasen bei Freigabe- oder Rückfragebedarf, Verbindungslinien zur Zentrale fließen, wenn dort gearbeitet wird,
// rechts ein Live-Panel mit offenen Freigaben und den letzten Ereignissen. Büro und Übersicht nutzen dieselben Daten (ctx.D).
// Klick auf Raum → Projekte des Raums; Klick auf Agent → seine echte Arbeitsübersicht; Klick auf die Zentrale → alle Projekte.
// Tastatur: 1–5 springt zum Raum, Tab läuft durch Räume und Agenten, Enter öffnet. Unter der Szene steht alles noch einmal als Liste.
// Monitor je Raum: eine Bildschirmfläche an der hinteren rechten Kante der Plattform zeigt das neueste grafische Ergebnis (Artefakt) des Raums
// (Bild oder HTML; gibt es keins, das neueste Ergebnis überhaupt als Karte) – Bilder direkt, HTML nur in einem iframe mit sandbox=""
// (keine Skripte, keine gleiche Herkunft), alles andere als Karte. Klick → Monitorwand (#/monitor/<Raum>) mit den letzten 12 Ergebnissen.
import { $, $$, esc, relativ, fmtZeit, fmtDT, chip, kurz } from './util.js';
import { RAEUME, agentZustand, projektStand, raumVon, ZUSTAND_TEXT, ZUSTAND_FARBE, letzteAktivitaetRun, runVon, agentReg, mitglied, istOrchestrierer, laufendeTeams, raumArtefakte, raumMonitor, ARTEFAKT_TYP_TEXT, PRUEFSTAND_TEXT } from './modell.js';
import { freigabeDialog } from './ansichten.js';
import { PORTAL } from './api.js';

const RAUM = {
  Akademie:       { cx: 200, cy: 190, akzent: '#A77BFF', icon: '📘', nr: 1 },
  Marketing:      { cx: 500, cy: 190, akzent: '#F5A94A', icon: '📣', nr: 2 },
  Vertrieb:       { cx: 800, cy: 190, akzent: '#3FD0D4', icon: '🤝', nr: 3 },
  Kundenprojekte: { cx: 290, cy: 490, akzent: '#4CCB8F', icon: '🧩', nr: 4 },
  Verwaltung:     { cx: 710, cy: 490, akzent: '#9FA3C8', icon: '🗂️', nr: 5 }
};
const HUB = { cx: 500, cy: 410, r: 58 };          // Zentrale: das „Gehirn“ zwischen den unteren Räumen
const PW = 140, PH = 70, DICKE = 18;              // Plattform: halbe Breite, halbe Höhe, Dicke
const PLAETZE = [[-62, -6], [-6, -36], [54, -6], [-2, 26]]; // Schreibtische je Plattform (isometrisches Raster), die Figuren sitzen vor dem Wandbildschirm
const MON = { dx: -80, dy: -142, w: 160, h: 100 }; // Monitor: großer Wandbildschirm hinter der Plattform, relativ zur Plattformmitte (Bild 16:10)
const PRUEF_FARBE = { abgenommen: '#1F9D6B', zurueckgewiesen: '#D9452F', ungeprueft: '#E98A15' };
const PRUEF_KURZ = { abgenommen: 'geprüft', zurueckgewiesen: 'zurückgewiesen', ungeprueft: 'ungeprüft' };
const PRUEF_CHIP = { abgenommen: 'fs-erteilt', zurueckgewiesen: 'fs-abgelehnt', ungeprueft: 'fs-offen' };
const TYP_ICON = { bild: '🖼️', html: '🌐', pdf: '📄', sonst: '🔗' };
const EREIGNIS_ICON = { schritt: '•', tool: '🔧', quelle: '📎', fehler: '⚠️', wiederholung: '↻', hinweis: 'ℹ️', status: '→', rueckfrage: '❓', antwort: '💬', freigabe: '✅', artefakt: '📄', abnahme: '🏁', entscheidung: '⚖️' };

const raute = (cx, cy, w, h) => [[cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]].map(p => p.join(',')).join(' ');
const initialen = n => String(n || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const kurzName = n => kurz(n, 15);

function plattform(L, info) {
  const { cx, cy } = L;
  const seiteL = [[cx - PW, cy], [cx, cy + PH], [cx, cy + PH + DICKE], [cx - PW, cy + DICKE]].map(p => p.join(',')).join(' ');
  const seiteR = [[cx, cy + PH], [cx + PW, cy], [cx + PW, cy + DICKE], [cx, cy + PH + DICKE]].map(p => p.join(',')).join(' ');
  const unruhig = info.freigaben > 0 || info.fehler > 0;
  return '<ellipse cx="' + cx + '" cy="' + (cy + PH + DICKE + 14) + '" rx="' + (PW * 0.8) + '" ry="14" fill="#000" opacity=".35"/>' +
    '<polygon points="' + seiteL + '" fill="#1B1A3A"/><polygon points="' + seiteR + '" fill="#232250"/>' +
    '<polygon class="raumboden" points="' + raute(cx, cy, PW, PH) + '" fill="#2A2956" stroke="' + L.akzent + '" stroke-width="' + (unruhig ? 2.5 : 1.5) + '"/>' +
    '<polygon points="' + raute(cx, cy, PW - 10, PH - 5) + '" fill="url(#raster)" opacity=".5"/>' +
    '<text x="' + (cx - PW + 22) + '" y="' + (cy + 4) + '" font-size="11" font-weight="700" fill="' + L.akzent + '" opacity=".9">' + L.nr + '</text>';
}

function figur(x, y, a, z, akzent) {
  const f = ZUSTAND_FARBE[z.zustand];
  const arbeitet = z.zustand === 'arbeitet', freigabe = z.zustand === 'wartet_freigabe', frage = z.zustand === 'wartet_rueckmeldung', wartet = z.zustand === 'warteschlange';
  const dimm = z.zustand === 'frei' ? ' opacity=".7"' : '';
  let s = '<g class="figur' + (freigabe ? ' winkt' : '') + '"' + dimm + '>';
  // Person hinter dem Schreibtisch
  s += '<ellipse cx="' + x + '" cy="' + (y + 2) + '" rx="9" ry="3" fill="#000" opacity=".3"/>';
  s += '<rect x="' + (x - 6.5) + '" y="' + (y - 11) + '" width="13" height="14" rx="4" fill="' + akzent + '"/>';
  s += '<circle cx="' + x + '" cy="' + (y - 16) + '" r="5.5" fill="#F6E7D3"/>';
  if (freigabe) s += '<path class="arm" d="M' + (x + 6) + ' ' + (y - 8) + ' l6 -9" stroke="' + akzent + '" stroke-width="3" stroke-linecap="round"/>';
  if (z.probleme.length) s += '<text x="' + (x - 17) + '" y="' + (y - 16) + '" font-size="11">⚠️</text>';
  s += '</g>';
  // Schreibtisch davor, Bildschirm leuchtet beim Arbeiten
  s += '<polygon points="' + raute(x, y + 8, 17, 8) + '" fill="#3B3A66" stroke="#5B5A8C" stroke-width="1"/>';
  s += '<rect x="' + (x - 6) + '" y="' + (y - 1) + '" width="12" height="8" rx="1.5" fill="' + (arbeitet ? '#8FA6FF' : '#1C1B3A') + '" stroke="#6E6DA0" stroke-width=".8"' + (arbeitet ? ' class="puls"' : '') + '/>';
  // Zustandspunkt und Sprechblase
  s += '<circle cx="' + (x + 8) + '" cy="' + (y - 21) + '" r="3.6" fill="' + f + '" stroke="#15132B" stroke-width="1.2"' + (wartet || frage ? ' class="puls"' : '') + '/>';
  if (freigabe || frage) {
    const txt = freigabe ? 'Freigabe?' : 'Frage';
    const bw = freigabe ? 58 : 40;
    s += '<g class="blase puls"><rect x="' + (x - bw / 2) + '" y="' + (y - 42) + '" width="' + bw + '" height="16" rx="8" fill="' + f + '"/><path d="M' + (x - 3) + ' ' + (y - 26) + ' l3 4 l3 -4z" fill="' + f + '"/><text x="' + x + '" y="' + (y - 30.5) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">' + txt + '</text></g>';
  }
  s += '<text x="' + x + '" y="' + (y + 27) + '" text-anchor="middle" font-size="9.5" fill="#D9D8EE">' + esc(kurzName(a.name)) + '</text>';
  return s;
}

function labelKarte(L, info, oben) {
  // Raumkarte immer vor der Plattform (unten); hinter der Plattform steht der Wandbildschirm
  const w = 200, h = 60, x = L.cx - w / 2, y = L.cy + PH + DICKE + 8;
  const warn = info.freigaben ? '⏳ ' + info.freigaben + ' Freigabe' + (info.freigaben > 1 ? 'n' : '') : (info.fehler ? '⚠️ ' + info.fehler + ' Fehler' : '');
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="#1E1D40" stroke="' + L.akzent + '" stroke-opacity=".6"/>' +
    '<rect x="' + x + '" y="' + y + '" width="4" height="' + h + '" rx="2" fill="' + L.akzent + '"/>' +
    '<text x="' + (x + 14) + '" y="' + (y + 20) + '" font-size="13" font-weight="700" fill="#fff">' + esc(L.icon + ' ' + info.raum) + '</text>' +
    '<text x="' + (x + w - 10) + '" y="' + (y + 20) + '" text-anchor="end" font-size="11" fill="#B9B8D6">' + info.agenten.length + ' Agent' + (info.agenten.length === 1 ? '' : 'en') + '</text>' +
    '<text x="' + (x + 14) + '" y="' + (y + 38) + '" font-size="11" fill="#B9B8D6">' + esc(info.projekte.length + ' Projekte · ' + info.offen + ' Aufgaben offen · ' + info.laufend + ' laufend') + '</text>' +
    (warn ? '<rect x="' + (x + 12) + '" y="' + (y + 45) + '" width="' + (warn.length * 6.4 + 14) + '" height="15" rx="7.5" fill="' + (info.freigaben ? '#E98A15' : '#D9452F') + '"/><text x="' + (x + 19) + '" y="' + (y + 56) + '" font-size="10" font-weight="700" fill="#fff">' + esc(warn) + '</text>'
          : '<text x="' + (x + 14) + '" y="' + (y + 56) + '" font-size="10.5" fill="#8E8DB0">' + (info.agenten.length ? 'alles ruhig' : 'kein Agent zugeordnet') + '</text>');
}

/** Monitor eines Raums: Rahmen, Standfuß, Inhalt (Bild / HTML-Sandbox / Karte / leer), Prüfmarke, Beschriftung. m = neuestes Artefakt oder null. */
function monitor(L, raum, m) {
  const x = L.cx + MON.dx, y = L.cy + MON.dy, w = MON.w, h = MON.h, mx = x + w / 2;
  let s = '<a href="#/monitor/' + esc(raum) + '" class="monitor" data-raum="' + esc(raum) + '" data-typ="' + esc(m ? m.typ : 'leer') + '" aria-label="' + esc('Monitor ' + raum + ': ' + (m ? 'zeigt „' + m.titel + '“ (' + ARTEFAKT_TYP_TEXT[m.typ] + ', ' + PRUEFSTAND_TEXT[m.pruefstand] + ')' : 'noch kein Ergebnis') + '. Öffnet die Monitorwand mit den letzten Ergebnissen des Raums.') + '">' +
    '<title>' + esc('Monitor ' + raum + ' · ' + (m ? m.titel + ' · ' + ARTEFAKT_TYP_TEXT[m.typ] + ' · ' + PRUEFSTAND_TEXT[m.pruefstand] : 'noch kein Ergebnis') + ' · Klick öffnet die Monitorwand') + '</title>';
  // Wandbildschirm hinter der Plattform, Lichtschein auf dem Boden
  s += '<ellipse cx="' + mx + '" cy="' + (L.cy - PH + 10) + '" rx="' + (w / 2 - 10) + '" ry="9" fill="' + L.akzent + '" opacity=".14"/>';
  // Rahmen und Bildschirm
  s += '<rect class="schirm" x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (w + 8) + '" height="' + (h + 8) + '" rx="7" fill="#0E0D22" stroke="' + L.akzent + '" stroke-width="2"/>';
  if (!m) {
    s += '<g class="leer"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#1A1938"/><text x="' + mx + '" y="' + (y + h / 2 - 2) + '" text-anchor="middle" font-size="13" fill="#8E8DB0">noch kein Ergebnis</text><text x="' + mx + '" y="' + (y + h / 2 + 16) + '" text-anchor="middle" font-size="9.5" fill="#5F5E88">Der Monitor zeigt das neueste Ergebnis der Agenten</text></g>';
  } else {
    // Karte (Titel, Typ) liegt immer darunter: sichtbar bei PDF/Sonstigem und wenn ein Bild nicht geladen werden kann
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#1E1D40"/>' +
      '<text x="' + (x + 10) + '" y="' + (y + 30) + '" font-size="22">' + TYP_ICON[m.typ] + '</text>' +
      '<text x="' + (x + 40) + '" y="' + (y + 24) + '" font-size="11" font-weight="700" fill="#fff">' + esc(kurz(m.titel, 20)) + '</text>' +
      '<text x="' + (x + 40) + '" y="' + (y + 38) + '" font-size="9.5" fill="#B9B8D6">' + esc(ARTEFAKT_TYP_TEXT[m.typ] + ' · ' + kurz(m.projekt || '', 22)) + '</text>' +
      '<text x="' + (x + 10) + '" y="' + (y + 60) + '" font-size="9" fill="#8E8DB0">' + esc(m.typ === 'pdf' ? 'Keine Vorschau · Link in der Monitorwand' : m.url ? 'Vorschau wird geladen …' : 'Ablage: ' + kurz(m.ablageort || '–', 30)) + '</text>' +
      '<text x="' + (x + 10) + '" y="' + (y + 74) + '" font-size="9" fill="#8E8DB0">' + esc(relativ(m.erstellt)) + '</text>';
    if (m.typ === 'bild') s += '<image href="' + esc(m.url) + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" preserveAspectRatio="xMidYMid meet"><title>' + esc(m.titel) + '</title></image>';
    else if (m.typ === 'html') s += '<foreignObject x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"><div xmlns="http://www.w3.org/1999/xhtml" class="mini"><iframe src="' + esc(m.url) + '" sandbox="" referrerpolicy="no-referrer" loading="lazy" tabindex="-1" aria-hidden="true" title="' + esc('Vorschau: ' + m.titel) + '"></iframe></div></foreignObject>';
    // Prüfmarke unten rechts im Bild
    const t = PRUEF_KURZ[m.pruefstand], bw = t.length * 6 + 14;
    s += '<rect class="marke" x="' + (x + w - bw - 5) + '" y="' + (y + h - 19) + '" width="' + bw + '" height="14" rx="7" fill="' + PRUEF_FARBE[m.pruefstand] + '"/><text x="' + (x + w - 5 - bw / 2) + '" y="' + (y + h - 8.5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">' + esc(t) + '</text>';
  }
  s += '</a>';   // Titel steht im Tooltip, in der Liste unter der Szene und in der Monitorwand
  return s;
}

/** Die Zentrale als Gehirn: zwei Hälften mit Windungen, Stamm, Synapsen leuchten bei laufender Arbeit. */
function gehirn(cx, cy, aktiv) {
  const p = (dx, dy) => (cx + dx) + ' ' + (cy + dy);
  const umriss = 'M' + p(0, -50) + ' C' + p(-26, -56) + ' ' + p(-58, -40) + ' ' + p(-62, -14) + ' C' + p(-66, 12) + ' ' + p(-52, 38) + ' ' + p(-26, 42) + ' C' + p(-14, 46) + ' ' + p(-6, 42) + ' ' + p(0, 38) +
    ' C' + p(6, 42) + ' ' + p(14, 46) + ' ' + p(26, 42) + ' C' + p(52, 38) + ' ' + p(66, 12) + ' ' + p(62, -14) + ' C' + p(58, -40) + ' ' + p(26, -56) + ' ' + p(0, -50) + ' Z';
  const windungen = [
    'M' + p(-50, -16) + ' q10 -16 20 -4 t18 -2 t10 8', 'M' + p(-54, 6) + ' q12 -12 24 -2 t20 4', 'M' + p(-44, 26) + ' q10 -10 20 -2 t14 2',
    'M' + p(50, -16) + ' q-10 -16 -20 -4 t-18 -2 t-10 8', 'M' + p(54, 6) + ' q-12 -12 -24 -2 t-20 4', 'M' + p(44, 26) + ' q-10 -10 -20 -2 t-14 2',
    'M' + p(-20, -40) + ' q8 -6 16 0', 'M' + p(4, -40) + ' q8 -6 16 0'
  ];
  const synapsen = [[-36, -8], [-22, 18], [30, -4], [40, 20], [-8, -30], [16, -28]];
  return '<path class="gehirn" d="' + umriss + '" fill="url(#gehirnfuell)" stroke="#B48CFF" stroke-width="2"/>' +
    '<path d="M' + p(0, -48) + ' C' + p(-6, -20) + ' ' + p(6, 10) + ' ' + p(0, 38) + '" fill="none" stroke="#B48CFF" stroke-width="1.6" opacity=".8"/>' +
    windungen.map(d => '<path d="' + d + '" fill="none" stroke="#C9ADFF" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>').join('') +
    '<path d="M' + p(-7, 40) + ' q7 12 14 0" fill="#2A2956" stroke="#B48CFF" stroke-width="1.6"/>' +
    synapsen.map(([dx, dy], i) => '<circle cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="2.2" fill="#F0E6FF"' + (aktiv ? ' class="puls" style="animation-delay:' + (i * .27) + 's"' : ' opacity=".5"') + '/>').join('');
}

export function vBuero(ctx) {
  const D = ctx.D;
  const agenten = D.agenten || [];
  const projekte = D.projekte || [];
  // Orchestrierer (Werkzeug auftrag_delegieren) sitzen in der Zentrale, nicht auf einer Raumplattform.
  const zentraleAgenten = agenten.filter(a => a.aktiv !== false && istOrchestrierer(a)).map(a => ({ a, z: agentZustand(D, a) }));
  const teams = laufendeTeams(D);
  const position = new Map();   // agent_id → { x, y } der Figur (für Teamlinien)
  const infos = RAEUME.map(raum => {
    const A = agenten.filter(a => a.raum === raum && a.aktiv !== false && !istOrchestrierer(a));
    const P = projekte.filter(p => p.status !== 'abgeschlossen' && raumVon(D, p) === raum);
    const st = P.map(p => projektStand(D, p));
    return { raum, agenten: A.map(a => ({ a, z: agentZustand(D, a) })), projekte: P, laufend: st.reduce((s, x) => s + x.aktiveRuns.length, 0), freigaben: st.reduce((s, x) => s + x.freigabenOffen.length, 0), fehler: st.reduce((s, x) => s + x.fehler.length, 0), offen: st.reduce((s, x) => s + x.offen.length, 0), monitor: raumMonitor(D, raum) };
  });
  const ohneRaum = projekte.filter(p => p.status !== 'abgeschlossen' && !raumVon(D, p));
  const aktiveProjekte = projekte.filter(p => p.status !== 'abgeschlossen').length;
  const laufendGesamt = infos.reduce((s, i) => s + i.laufend, 0);
  const freigabenOffen = (D.freigaben || []).filter(f => f.status === 'offen');
  const fehlerGesamt = infos.reduce((s, i) => s + i.fehler, 0);

  const svg = ['<svg class="buero" viewBox="0 0 1000 690" role="img" aria-labelledby="bueroTitel bueroDesc" xmlns="http://www.w3.org/2000/svg"><title id="bueroTitel">Virtuelles Büro der Momentum KI Akademie</title><desc id="bueroDesc">Fünf schwebende Räume um die Zentrale. Figuren an Schreibtischen sind Agenten; Farbpunkte zeigen den Zustand: grün arbeitet, orange wartet auf Freigabe, violett wartet auf Antwort, blau Auftrag wartet, grau frei. Sprechblasen zeigen, wo ein Mensch gebraucht wird. Orchestrierer sitzen in der Zentrale; rosa Linien von der Zentrale zu Figuren sind laufende Teams. Hinter jedem Raum steht ein großer Wandbildschirm mit dem neuesten Ergebnis seiner Agenten; „ungeprüft“ heißt, der Run ist noch nicht fachlich abgenommen. Die Zentrale in der Mitte ist als Gehirn gezeichnet; dort sitzt der Orchestrierer.</desc>',
    '<defs><linearGradient id="himmel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D1B40"/><stop offset="1" stop-color="#0F0E24"/></linearGradient>',
    '<pattern id="raster" width="20" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 L20 5 L10 10 L0 5 Z" fill="none" stroke="#4A4880" stroke-width=".6"/></pattern>',
    '<radialGradient id="hubglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7B3FE4" stop-opacity=".55"/><stop offset="1" stop-color="#7B3FE4" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="gehirnfuell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A3BA8"/><stop offset="1" stop-color="#2A2956"/></linearGradient></defs>',
    '<rect width="1000" height="690" fill="url(#himmel)"/>'];
  // Sterne (ruhig, kein Flackern)
  for (let i = 0; i < 40; i++) svg.push('<circle cx="' + ((i * 257) % 1000) + '" cy="' + ((i * 131) % 690) + '" r="' + (i % 3 ? .8 : 1.4) + '" fill="#fff" opacity="' + (.15 + (i % 5) * .08) + '"/>');
  // Verbindungen zur Zentrale (hinter allem)
  for (const info of infos) {
    const L = RAUM[info.raum];
    svg.push('<line class="' + (info.laufend ? 'fluss' : 'ruhe') + '" x1="' + L.cx + '" y1="' + L.cy + '" x2="' + HUB.cx + '" y2="' + HUB.cy + '" stroke="' + (info.laufend ? L.akzent : '#3C3A6A') + '" stroke-width="' + (info.laufend ? 2 : 1.2) + '" stroke-dasharray="4 7" opacity="' + (info.laufend ? .9 : .6) + '"/>');
  }
  // Räume: oben zuerst, damit die Zentrale und die unteren Räume davor liegen
  const reihenfolge = infos.slice().sort((a, b) => RAUM[a.raum].cy - RAUM[b.raum].cy);
  const zeichneRaum = info => {
    const L = RAUM[info.raum]; const oben = L.cy < HUB.cy;
    svg.push('<a href="#/raum/' + esc(info.raum) + '" class="raum" aria-label="Raum ' + esc(info.raum) + ' (Taste ' + L.nr + '): ' + info.projekte.length + ' Projekte, ' + info.laufend + ' laufende Aufträge, ' + info.freigaben + ' offene Freigaben, ' + info.fehler + ' Fehler. Klick filtert die Projekte."><title>' + esc(info.raum) + ' · ' + info.projekte.length + ' Projekte · ' + info.laufend + ' laufend · ' + info.freigaben + ' Freigaben · ' + info.fehler + ' Fehler</title>' + plattform(L, info) + labelKarte(L, info, oben) + '</a>');
    // Monitor an der hinteren rechten Kante, vor der Plattform und hinter den Figuren
    svg.push(monitor(L, info.raum, info.monitor));
    // Plätze von hinten nach vorn zeichnen (kleineres y zuerst), damit vordere Figuren die hinteren überdecken
    const plaetze = info.agenten.slice(0, PLAETZE.length).map((p, i) => ({ ...p, x: L.cx + PLAETZE[i][0], y: L.cy + PLAETZE[i][1] })).sort((p, q) => p.y - q.y);
    plaetze.forEach(({ a, z, x, y }) => {
      position.set(a.agent_id, { x, y });
      svg.push('<a href="#/agent/' + esc(a.agent_id) + '" class="agent" aria-label="Agent ' + esc(a.name) + ', ' + esc(ZUSTAND_TEXT[z.zustand]) + ', ' + z.runs.length + ' Ausführungen. Öffnet die Arbeitsübersicht."><title>' + esc(a.name + ' · ' + ZUSTAND_TEXT[z.zustand] + ' · ' + a.modell + ' · zuletzt ' + (z.letzter ? relativ(letzteAktivitaetRun(D, z.letzter)) : 'nie')) + '</title>' + figur(x, y, a, z, L.akzent) + '</a>');
    });
    if (info.agenten.length > PLAETZE.length) svg.push('<text x="' + (L.cx + PW - 30) + '" y="' + (L.cy + PH - 6) + '" text-anchor="end" font-size="10.5" fill="#B9B8D6">+' + (info.agenten.length - PLAETZE.length) + ' weitere</text>');
  };
  reihenfolge.filter(i => RAUM[i.raum].cy < HUB.cy).forEach(zeichneRaum);
  // Zentrale
  svg.push('<a href="#/tab/projekte" class="zentrale" aria-label="Zentrale: ' + aktiveProjekte + ' aktive Projekte, ' + laufendGesamt + ' laufende Aufträge, ' + freigabenOffen.length + ' offene Freigaben. Öffnet die Projektübersicht."><title>Zentrale · alle Projekte</title>',
    '<circle cx="' + HUB.cx + '" cy="' + HUB.cy + '" r="' + (HUB.r + 44) + '" fill="url(#hubglow)"' + (laufendGesamt ? ' class="puls"' : '') + '/>',
    gehirn(HUB.cx, HUB.cy, laufendGesamt > 0 || teams.length > 0),
    '<rect x="' + (HUB.cx - 40) + '" y="' + (HUB.cy - 22) + '" width="80" height="44" rx="10" fill="#15132B" opacity=".82"/>',
    '<text x="' + HUB.cx + '" y="' + (HUB.cy - 9) + '" text-anchor="middle" font-size="9.5" fill="#B9B8D6" letter-spacing=".08em">ZENTRALE</text>',
    '<text x="' + HUB.cx + '" y="' + (HUB.cy + 9) + '" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">' + aktiveProjekte + '</text>',
    '<text x="' + HUB.cx + '" y="' + (HUB.cy + 19) + '" text-anchor="middle" font-size="8.5" fill="#B9B8D6">Projekte · ' + laufendGesamt + ' laufend</text>' +
    (zentraleAgenten.length ? '' : '<text x="' + HUB.cx + '" y="' + (HUB.cy + 62) + '" text-anchor="middle" font-size="9.5" fill="#8E8DB0">kein Orchestrierer</text>') + '</a>');
  // Orchestrierer in der Zentrale (eigene Figuren, violett wie die Zentrale), unterhalb des Gehirns
  zentraleAgenten.slice(0, 3).forEach(({ a, z }, i, arr) => {
    const x = HUB.cx + (i - (arr.length - 1) / 2) * 54, y = HUB.cy + 66;
    position.set(a.agent_id, { x, y });
    svg.push('<a href="#/agent/' + esc(a.agent_id) + '" class="agent zentrale-agent" aria-label="Orchestrierer ' + esc(a.name) + ' in der Zentrale, ' + esc(ZUSTAND_TEXT[z.zustand]) + ', ' + z.runs.length + ' Ausführungen. Öffnet die Arbeitsübersicht."><title>' + esc(a.name + ' · Zentrale · ' + ZUSTAND_TEXT[z.zustand] + ' · ' + a.modell + ' · zuletzt ' + (z.letzter ? relativ(letzteAktivitaetRun(D, z.letzter)) : 'nie')) + '</title>' + figur(x, y, a, z, '#9B7BFF') + '</a>');
  });
  reihenfolge.filter(i => RAUM[i.raum].cy >= HUB.cy).forEach(zeichneRaum);
  // Laufende Teams: fließende Linien vom Orchestrierer (Zentrale) zu den Figuren der Teammitglieder. reduced motion: CSS stoppt die Animation.
  for (const t of teams) {
    const von = position.get(t.run.agent_id) || { x: HUB.cx, y: HUB.cy };
    for (const m of t.mitglieder) {
      const zu = position.get(m.agent_id); if (!zu) continue;
      const aktiv = m.runs.some(k => ['in_arbeit', 'warteschlange', 'wartet_rueckmeldung', 'wartet_freigabe'].includes(k.status));
      svg.push('<line class="teamlinie' + (aktiv ? ' fluss' : '') + '" x1="' + von.x + '" y1="' + (von.y - 10) + '" x2="' + zu.x + '" y2="' + (zu.y - 10) + '"' + (aktiv ? '' : ' opacity=".45"') + '><title>' + esc('Team ' + (t.team_id || t.run.run_id) + ': ' + (t.reg ? t.reg.name : t.run.agent_id) + ' → ' + (m.reg ? m.reg.name : m.agent_id) + ' (' + m.runs.length + ' Teilauftrag' + (m.runs.length === 1 ? '' : 'e') + ')') + '</title></line>');
    }
  }
  // Kopfzeile in der Szene
  svg.push('<text x="18" y="24" font-size="12" font-weight="700" fill="#fff" letter-spacing=".1em">MOMENTUM KI OFFICE</text><text x="18" y="40" font-size="10.5" fill="#8E8DB0">Stand ' + esc(relativ(D.stand)) + ' · ' + laufendGesamt + ' laufend · ' + freigabenOffen.length + ' Freigaben offen · ' + fehlerGesamt + ' Fehler/veraltet</text>');
  svg.push('<text x="982" y="24" text-anchor="end" font-size="10.5" fill="#8E8DB0">Tasten 1–5 springen zum Raum · Enter öffnet</text>');
  svg.push('</svg>');

  // Live-Panel rechts: offene Freigaben, letzte Ereignisse
  const ich = D.ich || {}; const mensch = ich.typ !== 'agent';
  const ereignisse = (D.ereignisse || []).slice().sort((a, b) => String(b.zeit).localeCompare(String(a.zeit))).slice(0, 10);
  const feed = ereignisse.map(e => { const r = runVon(D, e.run_id); const reg = r ? agentReg(D, r.agent_id) : null; return '<li class="e-' + esc(e.art) + '"><span class="zt">' + esc(fmtZeit(e.zeit)) + ' · ' + esc(reg ? reg.name : (r ? r.agent_id : '–')) + '</span><br>' + (EREIGNIS_ICON[e.art] || '•') + ' <a href="#/run/' + esc(e.run_id) + '">' + esc(kurz(e.titel, 70)) + '</a></li>'; }).join('');
  const frei = freigabenOffen.map(f => { const r = runVon(D, f.run_id); const ext = (D.externe_aktionen || {})[f.aktion] || { text: f.aktion }; const darf = mensch && f.angefordert_von !== ich.mitglied_id && (!f.kritisch || ich.rolle === 'admin');
    return '<div class="small" style="border-top:1px solid var(--line);padding:8px 0"><b>' + esc(ext.text) + '</b> <span class="chip fs-offen">offen</span><div class="muted">' + esc(kurz(f.inhalt_vorschau || '', 90)) + '</div><div class="quelle">' + esc(relativ(f.angefordert)) + ' · <a href="#/run/' + esc(f.run_id) + '">' + esc(kurz(r ? r.auftrag : f.run_id, 40)) + '</a></div>' +
      (darf ? '<div style="display:flex;gap:6px;margin-top:6px"><button class="btn ok" style="padding:5px 10px" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="erteilt">Freigeben</button><button class="btn danger" style="padding:5px 10px" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="abgelehnt">Ablehnen</button></div>' : '') + '</div>'; }).join('');
  const zaehler = Object.keys(ZUSTAND_TEXT).map(k => { const n = infos.reduce((s, i) => s + i.agenten.filter(x => x.z.zustand === k).length, 0) + zentraleAgenten.filter(x => x.z.zustand === k).length; return '<span><i style="background:' + esc(ZUSTAND_FARBE[k]) + '"></i>' + n + ' ' + esc(ZUSTAND_TEXT[k]) + '</span>'; }).join('');
  const teamName = t => (t.reg ? t.reg.name : t.run.agent_id) + ' mit ' + (t.mitglieder.map(m => m.reg ? m.reg.name : m.agent_id).join(', ') || 'noch niemandem');
  const teamLegende = '<span><i class="teamlinie"></i>' + teams.length + ' Team' + (teams.length === 1 ? '' : 's') + ' laufend' + (teams.length ? ': ' + esc(teams.map(t => teamName(t) + ' (' + t.kinder.length + ' Teilaufträge, ' + t.offen + ' offen)').join(' · ')) : '') + '</span>';
  const zentraleListe = '<h3 style="margin-top:12px"><a href="#/tab/projekte">Zentrale</a> <span class="small muted">' + zentraleAgenten.length + ' Orchestrierer · ' + teams.length + ' Teams laufend</span></h3>' +
    (zentraleAgenten.length ? '<ul style="margin:0;padding-left:18px">' + zentraleAgenten.map(({ a, z }) => '<li><a href="#/agent/' + esc(a.agent_id) + '">' + esc(a.name) + '</a> · ' + chip(ZUSTAND_TEXT[z.zustand]) + ' · ' + esc(a.modell) + ' · ' + z.runs.length + ' Ausführungen · delegiert, führt selbst nichts aus</li>').join('') + '</ul>' : '<p class="small muted">Kein Agent mit dem Werkzeug auftrag_delegieren.</p>') +
    (teams.length ? '<p class="small" style="margin:6px 0 0"><b>Teams:</b></p><ul class="teams" style="margin:0;padding-left:18px">' + teams.map(t => '<li><a href="#/run/' + esc(t.run.run_id) + '">' + esc(kurz(t.run.auftrag, 70)) + '</a> · ' + esc(teamName(t)) + ' · ' + t.kinder.length + ' Teilaufträge, ' + t.offen + ' offen' + (t.team_id ? ' · <span class="hash">' + esc(t.team_id) + '</span>' : '') + '</li>').join('') + '</ul>' : '');

  $('#main').innerHTML = (ctx.nur === 'buero' ? '' : '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>Virtuelles Büro</h1><p class="sub">Klick auf einen Raum filtert Projekte und Aufgaben, Klick auf einen Agenten zeigt seine tatsächliche Arbeit. Gleiche Daten wie die Übersicht, Stand ' + esc(relativ(D.stand)) + '.</p></div><a class="btn sec" href="#/tab/agenten">Agenten-Register</a></div>') +
    '<div class="szene"><div class="card" style="padding:10px;margin:0"><div class="szene-scroll">' + svg.join('') + '</div>' +
    '<div class="legende" style="margin-top:10px">' + zaehler + '<span>⚠️ Fehler oder veraltet in den letzten 7 Tagen</span>' + teamLegende + '</div></div>' +
    '<div class="livepanel"><div class="card" style="margin:0 0 12px"><h2 style="display:flex;justify-content:space-between;align-items:center">Freigaben <span class="chip ' + (freigabenOffen.length ? 'fs-offen' : '') + '">' + freigabenOffen.length + ' offen</span></h2>' + (frei || '<p class="empty small">Nichts wartet auf dich.</p>') + (freigabenOffen.length ? '<a class="btn ghost" href="#/tab/freigaben">Alle Freigaben →</a>' : '') + '</div>' +
    '<div class="card" style="margin:0"><h2>Live</h2><p class="small muted" style="margin:-6px 0 8px">Die letzten Ereignisse aller Agenten, mit Link zum Run.</p>' + (feed ? '<ul class="zl feed">' + feed + '</ul>' : '<p class="empty small">Noch keine Ereignisse.</p>') + '</div></div></div>' +
    (ctx.nur === 'buero' ? '' :
    '<div class="card"><h2>Räume und Agenten als Liste</h2><p class="small muted">Für Tastatur und Screenreader: dieselben Inhalte wie im Bild.</p>' + zentraleListe +
    infos.map(info => '<h3 style="margin-top:12px"><a href="#/raum/' + esc(info.raum) + '">' + esc(info.raum) + '</a> <span class="small muted">' + info.projekte.length + ' Projekte · ' + info.laufend + ' laufend · ' + info.freigaben + ' Freigaben · ' + info.fehler + ' Fehler</span></h3>' +
      (info.agenten.length ? '<ul style="margin:0;padding-left:18px">' + info.agenten.map(({ a, z }) => '<li><a href="#/agent/' + esc(a.agent_id) + '">' + esc(a.name) + '</a> · ' + chip(ZUSTAND_TEXT[z.zustand]) + ' · ' + esc(a.modell) + ' · ' + z.runs.length + ' Ausführungen' + (z.probleme.length ? ' · ' + chip(z.probleme.length + ' Problem(e)', 'rs-fehlgeschlagen') : '') + '</li>').join('') + '</ul>' : '<p class="small muted">Kein Agent zugeordnet.</p>') +
      (info.projekte.length ? '<p class="small">Projekte: ' + info.projekte.map(p => '<a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>').join(', ') + '</p>' : '') +
      '<p class="small">Monitor: ' + (info.monitor ? '<a href="#/monitor/' + esc(info.raum) + '">' + esc(info.monitor.titel) + '</a> · ' + esc(ARTEFAKT_TYP_TEXT[info.monitor.typ]) + ' · ' + chip(PRUEFSTAND_TEXT[info.monitor.pruefstand], PRUEF_CHIP[info.monitor.pruefstand]) + ' · ' + esc(relativ(info.monitor.erstellt)) : 'noch kein Ergebnis · <a href="#/monitor/' + esc(info.raum) + '">Monitorwand</a>') + '</p>').join('') +
    (ohneRaum.length ? '<h3 style="margin-top:12px">Ohne Raum</h3><p class="small">' + ohneRaum.map(p => '<a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>').join(', ') + ' · Raum setzt Timo in Supabase (team_projekte.raum) oder über die Office-API.</p>' : '') +
    '<p class="small muted">3D ist bewusst nicht Teil dieser Version (optional später, siehe RESTPUNKTE.md).</p></div>');

  $$('[data-freigabe]').forEach(b => b.onclick = () => freigabeDialog(ctx, b.dataset.freigabe, b.dataset.entscheidung));
  // Tastatur: 1–5 springt zum Raum (Fokus auf den Raum-Link, Enter öffnet ihn)
  if (vBuero.tasten) document.removeEventListener('keydown', vBuero.tasten);
  vBuero.tasten = ev => {
    if (!$('svg.buero') || $('#dlg').open) return;
    const a = document.activeElement; if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    const n = Number(ev.key); if (!(n >= 1 && n <= 5)) return;
    const raum = Object.keys(RAUM).find(r => RAUM[r].nr === n);
    const link = $$('svg.buero a.raum').find(x => x.getAttribute('href') === '#/raum/' + raum);
    if (link) { link.focus(); ev.preventDefault(); }
  };
  document.addEventListener('keydown', vBuero.tasten);
}

// ---------- Monitorwand: die letzten 12 Ergebnisse eines Raums als Vorschaukacheln ----------
function kachel(D, a) {
  const r = a.run || {}; const reg = r.agent_id ? agentReg(D, r.agent_id) : null;
  const linkbar = a.url;   // nur https:// oder relativ (ladbareAdresse); http:, data:, javascript: usw. bekommen keinen Link
  let vorschau;
  if (a.typ === 'bild') vorschau = '<img src="' + esc(a.url) + '" alt="' + esc(a.titel) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  else if (a.typ === 'html') vorschau = '<iframe src="' + esc(a.url) + '" sandbox="" referrerpolicy="no-referrer" loading="lazy" tabindex="-1" title="' + esc('Vorschau: ' + a.titel) + '"></iframe>';
  else vorschau = '<div><div style="font-size:30px;line-height:1.2">' + TYP_ICON[a.typ] + '</div>' + esc(ARTEFAKT_TYP_TEXT[a.typ]) + ' · keine Vorschau' + (a.typ === 'pdf' ? '<br><span class="muted" style="font-size:12px">PDF-Vorschaubilder sind ein Restpunkt</span>' : '') + '</div>';
  const pruef = a.pruefstand === 'abgenommen' ? 'fachlich abgenommen von ' + esc(mitglied(D, r.abgenommen_von).name) + ' am ' + esc(fmtDT(r.abgenommen_am))
    : a.pruefstand === 'zurueckgewiesen' ? 'zurückgewiesen von ' + esc(mitglied(D, r.abgenommen_von).name) + ' am ' + esc(fmtDT(r.abgenommen_am))
    : '<b>ungeprüft</b> – Run ' + esc((D.status_text || {})[r.status] || r.status || 'unbekannt') + ', keine fachliche Abnahme durch einen Menschen';
  return '<div class="kachel ' + esc(a.pruefstand) + '" data-typ="' + esc(a.typ) + '"><div class="vorschau">' + vorschau + '<span class="marke">' + chip(PRUEFSTAND_TEXT[a.pruefstand], PRUEF_CHIP[a.pruefstand]) + '</span></div>' +
    '<div class="text"><b>' + esc(a.titel) + '</b>' + chip(ARTEFAKT_TYP_TEXT[a.typ]) + ' ' + chip(a.art) + (a.zusammenfassung ? '<div class="muted" style="margin-top:4px">' + esc(kurz(a.zusammenfassung, 160)) + '</div>' : '') +
    '<dl class="kv"><dt>Run</dt><dd><a href="#/run/' + esc(a.run_id) + '">' + esc(kurz(r.auftrag || a.run_id, 60)) + '</a>' + (reg ? ' · ' + esc(reg.name) : '') + '</dd>' +
    '<dt>Aufgabe</dt><dd>' + (a.aufgabe_id ? '<a href="' + PORTAL + '#/aufgabe/' + esc(a.aufgabe_id) + '" title="Im Team-Portal öffnen">' + esc(a.aufgabe_id) + '</a>' : '<span class="muted">keine Aufgabe verknüpft</span>') + (a.projekt ? ' · ' + esc(a.projekt) : '') + '</dd>' +
    '<dt>Zeit</dt><dd>' + esc(fmtDT(a.erstellt)) + ' <span class="muted">(' + esc(relativ(a.erstellt)) + ')</span></dd>' +
    '<dt>Hash</dt><dd>' + (a.inhalt_hash ? '<span class="hash" title="' + esc(a.inhalt_hash) + '">' + esc(a.inhalt_hash.slice(0, 16)) + '…</span>' : '<span class="muted">kein Hash übermittelt</span>') + '</dd>' +
    '<dt>Prüfung</dt><dd>' + pruef + '</dd>' +
    '<dt>Ablage</dt><dd>' + (linkbar ? '<a href="' + esc(linkbar) + '" target="_blank" rel="noopener noreferrer">Öffnen ↗</a> <span class="muted">' + esc(kurz(linkbar, 50)) + '</span>' : esc(a.ablageort || '–')) + '</dd></dl></div></div>';
}

export function vMonitorwand(ctx, raum) {
  const D = ctx.D;
  if (!RAEUME.includes(raum)) { $('#main').innerHTML = '<div class="card"><h2>Diesen Raum gibt es nicht</h2><p class="muted">Bekannte Räume: ' + esc(RAEUME.join(', ')) + '.</p><a class="btn" href="#/tab/buero">Zum Büro</a></div>'; return; }
  const L = RAUM[raum];
  const A = raumArtefakte(D, raum, 12);
  const ungeprueft = A.filter(a => a.pruefstand !== 'abgenommen').length;
  $('#main').innerHTML = (ctx.nur === 'buero' ? '' : '<p style="margin:0 0 10px"><a href="#/tab/buero">← Zurück zum Büro</a> · <a href="#/raum/' + esc(raum) + '">Projekte des Raums</a></p>') +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>' + esc(L.icon + ' Monitorwand: ' + raum) + '</h1><p class="sub">Die letzten 12 Ergebnisse aus den Agentenläufen dieses Raums, neueste zuerst. <b>Ungeprüft</b> heißt: Der Run ist noch nicht fachlich abgenommen. Vorschauen sind reine Anzeige: Bilder direkt, HTML in einer Sandbox ohne Skripte, alles andere als Karte mit Link.</p></div>' +
    '<div class="meta">' + chip(A.length + ' Ergebnis' + (A.length === 1 ? '' : 'se')) + (ungeprueft ? chip(ungeprueft + ' ungeprüft', 'fs-offen') : (A.length ? chip('alle geprüft', 'fs-erteilt') : '')) + '</div></div>' +
    (A.length ? '<div class="kacheln">' + A.map(a => kachel(D, a)).join('') + '</div>' : '<div class="card"><p class="empty">Noch kein Ergebnis in diesem Raum.<br><span class="small">Sobald ein Agent ein Ergebnis ablegt, erscheint es hier und auf dem Monitor im Büro.</span></p></div>') +
    '<div class="card" style="margin-top:14px"><h2>So liest du die Monitorwand</h2><ul class="small" style="margin:0;padding-left:18px"><li><b>geprüft</b> heißt: Ein Mensch hat den Run fachlich abgenommen (steht am Run). <b>ungeprüft</b>: noch nicht; <b>zurückgewiesen</b>: fachlich abgelehnt.</li><li>Der Hash ist der Fingerabdruck des Inhalts, wie ihn der Agent gemeldet hat; er ändert sich, wenn sich der Inhalt ändert.</li><li>Es erscheinen nur Ergebnisse, die die Office-API für dich liefert (gleiche Rechte wie überall im KI Office).</li><li>Links „Öffnen ↗“ führen zum Ablageort; dort gelten zusätzlich die Rechte des Zielsystems.</li></ul></div>';
}
