// KI Office: Kontrollraum (Register „Kontrollraum“, #/tab/buero). Eine Karte je Agent mit Zustand, aktueller Aufgabe, letztem Ergebnis,
// Guthaben und Kosten je abgenommenem Ergebnis; rechts „Für dich“ (Freigaben, Rückfragen, Abnahmen) und der Live-Ticker in Ich-Form.
// HTML per String, jeder Datenwert durch esc(). Rechte, Freigaben und Zustände entscheidet weiter der Server; hier wird nur angezeigt.
import { $, $$, esc, relativ, chip, kurz } from './util.js';
import { RAEUME, ZUSTAND_TEXT, ZUSTAND_FARBE, PRUEFSTAND_TEXT, istOrchestrierer } from './modell.js';
import { RAUM_AKZENT, RAUM_ICON, STILL_NACH_MIN, euro, agentKarteDaten, kontrollraumZahlen, fuerDichListe, tickerEintraege, istLive } from './kontrollraum.daten.js';
import { freigabeDialog, auftragDialog } from './ansichten.js';

const ZUSTAND_TEXT_KR = Object.assign({}, ZUSTAND_TEXT, { inaktiv: 'deaktiviert' });
const ZUSTAND_FARBE_KR = Object.assign({}, ZUSTAND_FARBE, { inaktiv: '#D9452F' });
const PRUEF_CHIP = { abgenommen: 'fs-erteilt', zurueckgewiesen: 'fs-abgelehnt', ungeprueft: 'fs-offen' };
const PRUEF_KURZ = { abgenommen: 'geprüft', zurueckgewiesen: 'zurückgewiesen', ungeprueft: 'ungeprüft' };
const EREIGNIS_ICON = { schritt: '•', tool: '🔧', quelle: '📎', fehler: '⚠️', wiederholung: '↻', hinweis: 'ℹ️', status: '→', rueckfrage: '❓', antwort: '💬', freigabe: '✅', artefakt: '📄', abnahme: '🏁', entscheidung: '⚖️' };
const uhr = s => { const d = new Date(s); return isNaN(d) ? '–' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };

/** Mini-Verlauf der Kosten je abgenommenem Ergebnis über vier Wochen (SVG). Ohne zwei Werte: nichts. */
export function sparkline(trend, w = 64, h = 20) {
  const max = Math.max(0.01, ...trend.filter(x => x != null)); const pts = [];
  trend.forEach((x, i) => { if (x == null) return; pts.push([(i / (trend.length - 1)) * (w - 4) + 2, h - 2 - (x / max) * (h - 4)]); });
  if (pts.length < 2) return '';
  return '<svg class="spark" width="' + w + '" height="' + h + '" role="img" aria-label="Verlauf über vier Wochen"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ') + '"/><circle cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2" fill="currentColor"/></svg>';
}
const zustandChip = (zustand) => '<span class="zustand"><i style="background:' + esc(ZUSTAND_FARBE_KR[zustand] || '#9A98B5') + '"></i>' + esc(ZUSTAND_TEXT_KR[zustand] || zustand) + '</span>';

/** Guthaben-Balken (ab Paket 3 mit Monatsguthaben vom Server); bis dahin die gemeldeten Kosten der letzten vier Wochen. */
export function guthabenHtml(k) {
  const g = k.guthaben, kz = k.kz;
  if (g) return '<div class="guthaben ' + g.stufe + '" role="img" aria-label="Guthaben: ' + esc(euro(g.rest)) + ' von ' + esc(euro(g.monat)) + ' übrig"><div class="gb-zeile"><span>Guthaben diesen Monat</span><b>' + esc(euro(g.rest)) + ' <span class="gb-von">von ' + esc(euro(g.monat)) + '</span></b></div><div class="gb-balken"><i style="width:' + Math.round(g.anteil * 100) + '%"></i></div></div>';
  const text = kz.kosten_eur == null ? (kz.gelaufen ? 'unbekannt' : 'noch keine Läufe') : euro(kz.kosten_eur) + (kz.kosten_geschaetzt ? ' teils geschätzt' : ' gemessen');
  const hinweis = kz.kosten_eur == null ? (kz.gelaufen ? 'Der Ausführer hat für ' + kz.gelaufen + (kz.gelaufen === 1 ? ' Lauf' : ' Läufe') + ' keinen Verbrauch gemeldet.' : '') : (kz.kosten_unbekannt ? kz.kosten_unbekannt + (kz.kosten_unbekannt === 1 ? ' Lauf' : ' Läufe') + ' ohne Angabe' : '');
  return '<div class="guthaben ohne"' + (hinweis ? ' title="' + esc(hinweis) + '"' : '') + '><div class="gb-zeile"><span>Kosten (4 Wochen)</span><b>' + esc(text) + '</b></div>' + (kz.kosten_eur != null && kz.kosten_unbekannt ? '<div class="gb-von">' + esc(hinweis) + '</div>' : '') + '</div>';
}
function kostenJeErgebnis(k) {
  const je = k.kz.kosten_je_abgenommen; const p = { runter: ['↓', 'gut', 'wird günstiger'], hoch: ['↑', 'schlecht', 'wird teurer'], gleich: ['→', '', 'gleichbleibend'] }[k.trend];
  return '<span class="kje" title="Gemeldete Kosten der letzten 4 Wochen geteilt durch fachlich abgenommene Ergebnisse (' + k.kz.abgenommen + ' von ' + k.kz.ergebnisse + ' abgenommen)"><b>' + esc(je == null ? '–' : euro(je)) + '</b> je abgenommenem Ergebnis' + (p ? ' <span class="trend ' + p[1] + '" title="' + p[2] + '">' + p[0] + '</span>' : '') + '</span>';
}

function agentenKarte(D, k) {
  const a = k.agent; const raum = istOrchestrierer(a) ? 'Zentrale' : a.raum;
  const r = k.aktuell;
  const label = { in_arbeit: 'Aktuelle Aufgabe', wartet_freigabe: 'Wartet auf Freigabe', wartet_rueckmeldung: 'Wartet auf deine Antwort', warteschlange: 'Auftrag in der Warteschlange' };
  return '<article class="akarte z-' + esc(k.zustand) + (k.still_min !== null ? ' still' : '') + '" data-agent="' + esc(a.agent_id) + '" style="--zf:' + esc(ZUSTAND_FARBE_KR[k.zustand] || '#9A98B5') + ';--ak:' + esc(RAUM_AKZENT[raum] || '#9B7BFF') + '">' +
    '<div class="ak-kopf"><div><h3><a href="#/agent/' + esc(a.agent_id) + '" aria-label="' + esc(a.name + ', ' + (ZUSTAND_TEXT_KR[k.zustand] || k.zustand) + '. Öffnet die Arbeitsübersicht.') + '">' + esc(a.name) + '</a></h3><div class="small">' + esc(a.modell) + ' · ' + esc(a.ausfuehrer) + '</div></div>' + zustandChip(k.zustand) + '</div>' +
    (k.still_min !== null ? '<div class="ak-warn"><span>Seit ' + k.still_min + ' Min. kein Lebenszeichen.</span><a class="btn klein sec" href="#/run/' + esc(r.run_id) + '">Ansehen</a></div>' : '') +
    '<div class="ak-aufgabe"><span class="label">' + esc(r ? (label[r.status] || 'Auftrag') : 'Nichts in Arbeit') + '</span>' + (r ? '<a href="#/run/' + esc(r.run_id) + '">' + esc(kurz(r.auftrag, 120)) + '</a>' : '<span class="muted">Wartet auf den nächsten Auftrag.</span>') + '</div>' +
    '<div class="ak-letztes"><span>Zuletzt:</span>' + (k.letztes ? '<a href="#/run/' + esc(k.letztes.run_id) + '">' + esc(kurz(k.letztes.titel, 60)) + '</a>' + chip(PRUEF_KURZ[k.letztes.pruefstand], PRUEF_CHIP[k.letztes.pruefstand], PRUEFSTAND_TEXT[k.letztes.pruefstand]) + '<span>' + esc(relativ(k.letztes.zeit)) + '</span>' : '<span>noch kein Ergebnis</span>') + '</div>' +
    guthabenHtml(k) + '<div class="ak-fuss">' + kostenJeErgebnis(k) + sparkline(k.kz.trend) + '</div></article>';
}

function fuerDichHtml(L) {
  if (!L.length) return '<p class="empty small" style="padding:6px 0">Nichts wartet auf dich.</p>';
  const dring = L.filter(f => f.typ !== 'abnahme'), abnahmen = L.filter(f => f.typ === 'abnahme');
  const eintrag = f => '<div class="fd ' + (f.typ === 'frage' ? 'frage' : f.typ === 'problem' ? 'problem' : f.typ === 'abnahme' ? 'abnahme' : '') + '" data-fd="' + esc(f.typ) + '"><b>' + esc(f.titel) + '</b><span class="muted">' + esc(f.text) + '</span><div class="btns">' +
    (f.typ === 'freigabe' ? '<button class="btn ok klein" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="erteilt">' + (f.start ? 'Start freigeben' : 'Freigeben') + '</button><button class="btn danger klein" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="abgelehnt">Ablehnen</button>' : '') +
    '<a class="btn sec klein" href="#/run/' + esc(f.run_id) + '">' + (f.typ === 'frage' ? 'Antworten' : f.typ === 'abnahme' ? 'Prüfen' : 'Ansehen') + '</a></div></div>';
  return dring.map(eintrag).join('') + abnahmen.slice(0, 3).map(eintrag).join('') + (abnahmen.length > 3 ? '<p class="small muted" style="margin:6px 0 0">und ' + (abnahmen.length - 3) + ' weitere Ergebnisse ohne Abnahme im Register „Agenten“.</p>' : '');
}

function tickerHtml(D, n) {
  const T = tickerEintraege(D, n);
  if (!T.length) return '<p class="empty small">Noch keine Ereignisse.</p>';
  return '<ol class="ticker" aria-label="Live-Ticker: die letzten Ereignisse der Agenten">' + T.map(e => '<li class="t-' + esc(e.art) + '"><span class="t-zeit" title="' + esc(relativ(e.zeit)) + '">' + esc(uhr(e.zeit)) + '</span><span class="t-agent"><i style="background:' + esc(RAUM_AKZENT[e.raum] || '#9B7BFF') + '"></i>' + esc(e.agent) + '</span><span class="t-text">' + esc(EREIGNIS_ICON[e.art] || '•') + ' <a href="#/run/' + esc(e.run_id) + '">' + esc(e.text) + '</a></span></li>').join('') + '</ol>';
}

/** Kompakte Fassung für die Portal-Übersicht (?nur=buero): Karten nur für Agenten, bei denen etwas läuft oder wartet; alle anderen als Zeile. */
function kompakt(D, karten) {
  const aktiv = karten.filter(k => k.zustand !== 'frei'), frei = karten.filter(k => k.zustand === 'frei');
  return (aktiv.length ? '<div class="kr-agenten">' + aktiv.map(k => agentenKarte(D, k)).join('') + '</div>' : '<div class="panel"><p class="empty small" style="padding:6px 0">Gerade arbeitet kein Agent und nichts wartet.</p></div>') +
    (frei.length ? '<p class="small muted" style="margin:12px 0 0" id="krFrei">Frei: ' + frei.map(k => '<a class="chip" style="text-decoration:none" href="#/agent/' + esc(k.agent.agent_id) + '">' + esc(k.agent.name) + '</a>').join(' ') + '</p>' : '');
}

export function vKontrollraum(ctx) {
  const D = ctx.D; const ich = D.ich || {}; const mensch = ich.typ !== 'agent';
  const agenten = (D.agenten || []).filter(a => a.aktiv !== false);
  const karten = agenten.map(a => agentKarteDaten(D, a));
  const fd = fuerDichListe(D, karten);
  const Z = kontrollraumZahlen(D, karten, fd);
  const live = istLive(D);
  const raeume = ['Zentrale'].concat(RAEUME);
  const raumVon = k => istOrchestrierer(k.agent) ? 'Zentrale' : (RAEUME.includes(k.agent.raum) ? k.agent.raum : 'Verwaltung');
  const kostenText = Z.kosten_eur == null ? 'unbekannt' : euro(Z.kosten_eur);
  const kostenHinweis = Z.kosten_eur == null ? 'Kosten 4 Wochen: kein Ausführer hat Verbrauch gemeldet' : 'gemeldete Kosten in 4 Wochen' + (Z.kosten_geschaetzt ? ', teils geschätzt' : '') + (Z.kosten_unbekannt ? ' · ' + Z.kosten_unbekannt + ' Läufe ohne Angabe' : '');
  const kpi = (n, l, cls, href) => (href ? '<a href="' + esc(href) + '" style="text-decoration:none;color:inherit" class="kpi click ' : '<div class="kpi ') + (cls || '') + '"><b>' + esc(n) + '</b><span>' + esc(l) + '</span>' + (href ? '</a>' : '</div>');
  const nur = ctx.nur === 'buero';

  $('#main').innerHTML = (nur ? '' : '<div class="kr-kopf"><div><h1>Kontrollraum</h1><p class="sub">Jeder Agent mit Aufgabe, letztem Ergebnis und Kosten. Rechts steht, wo du gebraucht wirst, und was die Agenten gerade melden.</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + (mensch ? '<button class="btn" id="neuAuftrag">+ Auftrag an Agent</button>' : '') + '</div></div>') +
    '<div class="kr-stand" style="margin-bottom:12px"><span class="live ' + (live ? 'aktiv' : 'ruhig') + '" id="krLive"><i></i>' + (live ? 'Live' : 'Ruhig') + '</span><span id="krStand">Stand ' + esc(relativ(D.stand)) + '</span><span>·</span><span>' + (live ? 'Aktualisierung alle 30 Sekunden, solange ein Agent arbeitet' : 'Aktualisierung alle 5 Minuten; alle 30 Sekunden, sobald ein Agent arbeitet') + '</span><button class="btn ghost klein" id="krNeu" type="button">↻ Jetzt aktualisieren</button></div>' +
    '<div class="kpis">' + kpi(Z.arbeiten, Z.arbeiten === 1 ? 'Agent arbeitet gerade' : 'Agenten arbeiten gerade') + kpi(Z.warten_auf_dich, 'warten auf dich', Z.warten_auf_dich ? 'achtung' : '', '#/tab/freigaben') + kpi(Z.probleme, 'Fehler, veraltet oder still (7 Tage)', Z.probleme ? 'warn' : '') + kpi(Z.abgenommen + ' von ' + Z.ergebnisse, 'Ergebnisse abgenommen (4 Wochen)') + kpi(kostenText, kostenHinweis) + '</div>' +
    '<div class="legende" style="margin:0 0 16px">' + Object.keys(ZUSTAND_TEXT).map(z => '<span><i style="background:' + esc(ZUSTAND_FARBE[z]) + '"></i>' + esc(ZUSTAND_TEXT[z]) + '</span>').join('') + '<span><i style="background:none;border:2px solid var(--red)"></i>seit ' + STILL_NACH_MIN + ' Min. still</span></div>' +
    '<div class="kontrollraum"><div id="krRaeume">' + (nur ? kompakt(D, karten) : karten.length ? raeume.map(raum => { const K = karten.filter(k => raumVon(k) === raum); if (!K.length) return ''; const laufend = K.filter(k => k.zustand === 'arbeitet').length; const kosten = K.reduce((s, k) => s + (k.kz.kosten_eur || 0), 0);
        return '<section class="kr-raum" data-raum="' + esc(raum) + '"><div class="kr-raumkopf"><span aria-hidden="true">' + (RAUM_ICON[raum] || '') + '</span><a href="' + (raum === 'Zentrale' ? '#/tab/projekte' : '#/raum/' + esc(raum)) + '">' + esc(raum) + '</a><span>' + K.length + ' Agent' + (K.length === 1 ? '' : 'en') + ' · ' + laufend + ' arbeite' + (laufend === 1 ? 't' : 'n') + (K.some(k => k.kz.kosten_eur != null) ? ' · ' + esc(euro(kosten)) + ' in 4 Wochen' : '') + '</span><span class="linie"></span></div><div class="kr-agenten">' + K.map(k => agentenKarte(D, k)).join('') + '</div></section>'; }).join('')
      : '<div class="card"><p class="empty">Noch keine Agenten in der Registry.</p></div>') + '</div>' +
    '<aside class="kr-seite">' + (nur || !mensch ? '' : '<div class="panel" id="krFuerDich"><h2>Für dich <span class="chip ' + (fd.filter(f => f.typ !== 'abnahme').length ? 'fs-offen' : '') + '">' + fd.filter(f => f.typ !== 'abnahme').length + '</span></h2>' + fuerDichHtml(fd) + '</div>') +
    '<div class="panel" id="krTicker"><h2>Live-Ticker <span class="small" style="text-transform:none;letter-spacing:0">Agenten in Ich-Form</span></h2>' + tickerHtml(D, nur ? 8 : 12) + '</div></aside></div>' +
    (nur ? '' : '<p class="small muted" style="margin-top:6px">Die Zahlen stammen aus gemeldeten Läufen der letzten 4 Wochen. Kosten ohne Meldung des Ausführers heißen „unbekannt“ und zählen nicht als null. Die frühere Büro-Ansicht mit Räumen und Monitoren findest du unter <a href="#/tab/szene">Büro-Szene</a>.</p>');

  $$('[data-freigabe]').forEach(b => b.onclick = () => freigabeDialog(ctx, b.dataset.freigabe, b.dataset.entscheidung));
  const n = $('#neuAuftrag'); if (n) n.onclick = () => auftragDialog(ctx, {});
  const neu = $('#krNeu'); if (neu) neu.onclick = async () => { neu.disabled = true; try { await ctx.laden(true); } finally { const b = $('#krNeu'); if (b) b.disabled = false; } };
}
