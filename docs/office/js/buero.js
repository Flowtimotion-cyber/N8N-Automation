// KI Office: virtuelles Büro als leichtgewichtige 2D-Ansicht (eigenes SVG, keine fremden Assets).
// Räume und Agenten sind Links: Klick auf einen Raum filtert Projekte, Klick auf einen Agenten öffnet seine echte Arbeitsübersicht.
// Büro und Dashboard nutzen dieselben Daten (ctx.D). Darunter steht dieselbe Information als Liste für Tastatur und Screenreader.
import { $, esc, relativ, chip } from './util.js';
import { RAEUME, agentZustand, projektStand, raumVon, ZUSTAND_TEXT, ZUSTAND_FARBE, letzteAktivitaetRun } from './modell.js';

const RAUM_LAYOUT = {
  Akademie: { x: 40, y: 50, farbe: '#EDE4FB', akzent: '#7B3FE4', icon: '📘' },
  Marketing: { x: 370, y: 50, farbe: '#FDEBD3', akzent: '#E98A15', icon: '📣' },
  Vertrieb: { x: 700, y: 50, farbe: '#D9F2F3', akzent: '#1FA9B0', icon: '🤝' },
  Kundenprojekte: { x: 205, y: 330, farbe: '#DFF3E8', akzent: '#1F9D6B', icon: '🧩' },
  Verwaltung: { x: 535, y: 330, farbe: '#E7E6F2', akzent: '#62607E', icon: '🗂️' }
};
const W = 260, H = 200, SCHRAEG = 36;

export function vBuero(ctx) {
  const D = ctx.D;
  const agenten = D.agenten || [];
  const projekte = D.projekte || [];
  const infos = RAEUME.map(raum => {
    const A = agenten.filter(a => a.raum === raum && a.aktiv !== false);
    const P = projekte.filter(p => p.status !== 'abgeschlossen' && raumVon(D, p) === raum);
    const st = P.map(p => projektStand(D, p));
    return { raum, agenten: A.map(a => ({ a, z: agentZustand(D, a) })), projekte: P, laufend: st.reduce((s, x) => s + x.aktiveRuns.length, 0), freigaben: st.reduce((s, x) => s + x.freigabenOffen.length, 0), fehler: st.reduce((s, x) => s + x.fehler.length, 0), offen: st.reduce((s, x) => s + x.offen.length, 0) };
  });
  const ohneRaum = projekte.filter(p => p.status !== 'abgeschlossen' && !raumVon(D, p));
  const svg = ['<svg class="buero" viewBox="0 0 1000 580" role="img" aria-labelledby="bueroTitel bueroDesc" xmlns="http://www.w3.org/2000/svg"><title id="bueroTitel">Virtuelles Büro der Momentum KI Akademie</title><desc id="bueroDesc">Fünf Räume mit ihren Agenten. Farbpunkte zeigen den Zustand: grün arbeitet, orange wartet auf Freigabe, violett wartet auf Antwort, blau Auftrag wartet, grau frei.</desc>',
    '<defs><pattern id="boden" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#E4E2EF" stroke-width="1"/></pattern></defs>',
    '<rect x="0" y="0" width="1000" height="580" fill="url(#boden)"/>',
    // Flur
    '<path d="M20 290 H980" stroke="#D5D2E6" stroke-width="2" stroke-dasharray="6 6"/><text x="500" y="282" text-anchor="middle" font-size="12" fill="#9A98B5">Flur · Empfang</text>'];
  for (const info of infos) {
    const L = RAUM_LAYOUT[info.raum];
    const pts = [[L.x + SCHRAEG, L.y], [L.x + W, L.y], [L.x + W - SCHRAEG, L.y + H], [L.x, L.y + H]].map(p => p.join(',')).join(' ');
    const wand = [[L.x + SCHRAEG, L.y], [L.x + W, L.y], [L.x + W, L.y - 14], [L.x + SCHRAEG, L.y - 14]].map(p => p.join(',')).join(' ');
    svg.push('<a href="#/raum/' + esc(info.raum) + '" aria-label="Raum ' + esc(info.raum) + ': ' + info.projekte.length + ' Projekte, ' + info.laufend + ' laufende Aufträge, ' + info.freigaben + ' offene Freigaben. Klick filtert die Projekte."><title>' + esc(info.raum) + ' · ' + info.projekte.length + ' Projekte · ' + info.laufend + ' laufend · ' + info.freigaben + ' Freigaben · ' + info.fehler + ' Fehler</title>',
      '<polygon points="' + wand + '" fill="' + L.akzent + '" opacity=".85"/>',
      '<polygon class="raumboden" points="' + pts + '" fill="' + L.farbe + '" stroke="' + L.akzent + '" stroke-width="1.5"/>',
      '<text x="' + (L.x + SCHRAEG + 10) + '" y="' + (L.y + 24) + '" font-size="16" font-weight="700" fill="#14123A">' + esc(L.icon + ' ' + info.raum) + '</text>',
      '<text x="' + (L.x + SCHRAEG + 10) + '" y="' + (L.y + 42) + '" font-size="11.5" fill="#62607E">' + esc(info.projekte.length + ' Projekte · ' + info.offen + ' Aufgaben offen') + '</text>',
      '<text x="' + (L.x + SCHRAEG + 10) + '" y="' + (L.y + 57) + '" font-size="11.5" fill="' + (info.fehler || info.freigaben ? '#B0321F' : '#62607E') + '">' + esc(info.laufend + ' laufend · ' + info.freigaben + ' Freigaben · ' + info.fehler + ' Fehler') + '</text>',
      '</a>');
    // Schreibtische mit Agenten (bis zu 4 je Raum)
    const plaetze = [[70, 95], [170, 95], [55, 150], [155, 150]];
    info.agenten.slice(0, 4).forEach(({ a, z }, i) => {
      const [dx, dy] = plaetze[i]; const cx = L.x + dx, cy = L.y + dy;
      const f = ZUSTAND_FARBE[z.zustand]; const aktiv = z.zustand === 'arbeitet';
      svg.push('<a href="#/agent/' + esc(a.agent_id) + '" aria-label="Agent ' + esc(a.name) + ', ' + esc(ZUSTAND_TEXT[z.zustand]) + ', ' + z.runs.length + ' Ausführungen. Öffnet die Arbeitsübersicht."><title>' + esc(a.name + ' · ' + ZUSTAND_TEXT[z.zustand] + ' · ' + a.modell + ' · zuletzt ' + (z.letzter ? relativ(letzteAktivitaetRun(D, z.letzter)) : 'nie')) + '</title>',
        '<rect x="' + (cx - 34) + '" y="' + (cy + 10) + '" width="68" height="22" rx="5" fill="#fff" stroke="#CFCDE0"/>',           // Schreibtisch
        '<rect x="' + (cx - 10) + '" y="' + (cy + 13) + '" width="20" height="12" rx="2" fill="' + (aktiv ? '#5B6EE6' : '#DDDBEA') + '"' + (aktiv ? ' class="puls"' : '') + '/>',   // Bildschirm
        '<circle class="agentkreis" cx="' + cx + '" cy="' + (cy - 6) + '" r="15" fill="#1F2937" stroke="#fff" stroke-width="2"/>',
        '<text x="' + cx + '" y="' + (cy - 1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">' + esc(initialen(a.name)) + '</text>',
        '<circle cx="' + (cx + 12) + '" cy="' + (cy - 16) + '" r="5.5" fill="' + f + '" stroke="#fff" stroke-width="1.5"' + (z.zustand !== 'frei' && z.zustand !== 'arbeitet' ? ' class="puls"' : '') + '/>',
        (z.probleme.length ? '<text x="' + (cx - 16) + '" y="' + (cy - 14) + '" font-size="12">⚠️</text>' : ''),
        '<text x="' + cx + '" y="' + (cy + 46) + '" text-anchor="middle" font-size="10.5" fill="#14123A">' + esc(kurzName(a.name)) + '</text>',
        '</a>');
    });
    if (info.agenten.length > 4) svg.push('<text x="' + (L.x + W - 60) + '" y="' + (L.y + H - 12) + '" font-size="11" fill="#62607E">+' + (info.agenten.length - 4) + ' weitere</text>');
    if (!info.agenten.length) svg.push('<text x="' + (L.x + SCHRAEG + 10) + '" y="' + (L.y + 110) + '" font-size="12" fill="#9A98B5">Kein Agent zugeordnet</text>');
  }
  svg.push('</svg>');
  $('#main').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>Virtuelles Büro</h1><p class="sub">Klick auf einen Raum filtert Projekte und Aufgaben, Klick auf einen Agenten zeigt seine tatsächliche Arbeit. Gleiche Daten wie die Übersicht, Stand ' + esc(relativ(D.stand)) + '.</p></div><a class="btn sec" href="#/tab/agenten">Agenten-Register</a></div>' +
    '<div class="card">' + svg.join('') +
    '<div class="legende" style="margin-top:10px">' + Object.entries(ZUSTAND_TEXT).map(([k, t]) => '<span><i style="background:' + esc(ZUSTAND_FARBE[k]) + '"></i>' + esc(t) + '</span>').join('') + '<span>⚠️ Fehler oder veraltet in den letzten 7 Tagen</span><span class="muted">3D ist bewusst nicht Teil dieser Version (optional später, siehe RESTPUNKTE.md).</span></div></div>' +
    '<div class="card"><h2>Räume und Agenten als Liste</h2><p class="small muted">Für Tastatur und Screenreader: dieselben Inhalte wie im Bild.</p>' +
    infos.map(info => '<h3 style="margin-top:12px"><a href="#/raum/' + esc(info.raum) + '">' + esc(info.raum) + '</a> <span class="small muted">' + info.projekte.length + ' Projekte · ' + info.laufend + ' laufend · ' + info.freigaben + ' Freigaben · ' + info.fehler + ' Fehler</span></h3>' +
      (info.agenten.length ? '<ul style="margin:0;padding-left:18px">' + info.agenten.map(({ a, z }) => '<li><a href="#/agent/' + esc(a.agent_id) + '">' + esc(a.name) + '</a> · ' + chip(ZUSTAND_TEXT[z.zustand]) + ' · ' + esc(a.modell) + ' · ' + z.runs.length + ' Ausführungen' + (z.probleme.length ? ' · ' + chip(z.probleme.length + ' Problem(e)', 'rs-fehlgeschlagen') : '') + '</li>').join('') + '</ul>' : '<p class="small muted">Kein Agent zugeordnet.</p>') +
      (info.projekte.length ? '<p class="small">Projekte: ' + info.projekte.map(p => '<a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>').join(', ') + '</p>' : '')).join('') +
    (ohneRaum.length ? '<h3 style="margin-top:12px">Ohne Raum</h3><p class="small">' + ohneRaum.map(p => '<a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>').join(', ') + ' · Raum setzt Timo in Supabase (team_projekte.raum) oder über die Office-API.</p>' : '') + '</div>';
}
const initialen = n => String(n || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const kurzName = n => { n = String(n || ''); return n.length > 14 ? n.slice(0, 13) + '…' : n; };
