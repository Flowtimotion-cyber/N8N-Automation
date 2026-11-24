// Gemeinsame Bausteine der drei Design-Vorschauen: Reiter, Live-Ticker, Run-Zeitleiste, Auswertung, Skalierungskarten, Projektliste.
// Jede Richtung (A, B, C) bringt eigenes CSS und eine eigene Büro-Ansicht mit; diese Bausteine liefern nur semantisches HTML.
// Alles Anzeige mit Musterdaten; Knöpfe lösen nichts aus, sondern zeigen nur einen Hinweis.
(function () {
  const M = window.MUSTER;
  const { esc, eur, prozent, relativ, uhr, agent } = M;
  const EREIGNIS_ICON = { schritt: '•', tool: '🔧', quelle: '📎', fehler: '⚠️', wiederholung: '↻', hinweis: 'ℹ️', status: '→', rueckfrage: '❓', antwort: '💬', freigabe: '✅', artefakt: '📄', abnahme: '🏁', entscheidung: '⚖️' };
  const PRUEF = { abgenommen: ['geprüft', 'pr-ok'], ungeprueft: ['ungeprüft', 'pr-offen'], zurueckgewiesen: ['zurückgewiesen', 'pr-nein'] };
  const STUFE_KLASSE = { liefert: 'st-liefert', beobachten: 'st-beobachten', liefert_nicht: 'st-nicht', guthaben_leer: 'st-leer', zu_wenig: 'st-wenig' };

  /** Guthaben-Balken: Rest in Prozent, Farbe nach Füllstand. */
  function guthaben(a) {
    const b = a.budget; const rest = Math.max(0, b.monat - b.verbraucht); const p = b.monat ? Math.min(100, Math.round(100 * b.verbraucht / b.monat)) : 0;
    const cls = p >= 100 ? 'leer' : p >= 75 ? 'knapp' : 'ok';
    return '<div class="guthaben ' + cls + '" role="img" aria-label="Guthaben: ' + eur(rest) + ' von ' + eur(b.monat) + ' übrig"><div class="gb-zeile"><span>Guthaben</span><b>' + eur(rest) + ' <span class="gb-von">von ' + eur(b.monat) + '</span></b></div><div class="gb-balken"><i style="width:' + p + '%"></i></div></div>';
  }
  /** Kosten je abgenommenem Ergebnis mit Trendpfeil. */
  function kostenJeErgebnis(a) {
    const bw = M.bewertung(a); const t = a.kz.trend.filter(x => x != null);
    const pfeil = t.length >= 2 ? (t[t.length - 1] < t[t.length - 2] - 0.005 ? '↓' : t[t.length - 1] > t[t.length - 2] + 0.005 ? '↑' : '→') : '';
    const richtung = pfeil === '↓' ? 'gut' : pfeil === '↑' ? 'schlecht' : '';
    return '<span class="kje" title="Kosten der letzten 4 Wochen geteilt durch fachlich abgenommene Ergebnisse"><b>' + (bw.je == null ? '–' : eur(bw.je)) + '</b> je Ergebnis <span class="trend ' + richtung + '">' + pfeil + '</span></span>';
  }
  /** Mini-Sparkline (SVG) der letzten 4 Wochen. */
  function sparkline(trend, w = 64, h = 20) {
    const v = trend.map(x => x == null ? null : x); const max = Math.max(0.01, ...v.filter(x => x != null)); const pts = [];
    v.forEach((x, i) => { if (x == null) return; pts.push([(i / (v.length - 1)) * (w - 4) + 2, h - 2 - (x / max) * (h - 4)]); });
    if (pts.length < 2) return '<svg class="spark" width="' + w + '" height="' + h + '" aria-hidden="true"><text x="2" y="14" font-size="10" fill="currentColor" opacity=".6">zu wenig Daten</text></svg>';
    return '<svg class="spark" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ') + '"/><circle cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2" fill="currentColor"/></svg>';
  }
  const pruefChip = p => p ? '<span class="chip ' + PRUEF[p][1] + '">' + PRUEF[p][0] + '</span>' : '';
  const zustandChip = a => '<span class="zustand z-' + a.zustand + '"><i style="background:' + M.ZUSTAND_FARBE[a.zustand] + '"></i>' + esc(M.ZUSTAND_TEXT[a.zustand]) + '</span>';

  /** Ticker-Liste (Ich-Form). n Einträge. */
  function ticker(n = 12, klasse = '') {
    return '<ol class="ticker ' + klasse + '" aria-label="Live-Ticker der letzten Ereignisse">' + M.ticker.slice(0, n).map(e => { const a = agent(e.agent); return '<li class="t-' + esc(e.art) + '"><span class="t-zeit">' + esc(uhr(e.zeit)) + '</span><span class="t-agent"><i style="background:' + (M.RAUM_AKZENT[a.raum] || '#9B7BFF') + '"></i>' + esc(a.name) + '</span><span class="t-text">' + esc(EREIGNIS_ICON[e.art] || '•') + ' ' + esc(e.text) + '</span></li>'; }).join('') + '</ol>';
  }
  /** Lauftext-Variante (eine Zeile, CSS-Animation, steht bei reduced motion still). */
  function laufband() {
    const items = M.ticker.slice(0, 8).map(e => '<span class="lb-item"><b>' + esc(agent(e.agent).name) + ':</b> ' + esc(e.text) + '</span>').join('<span class="lb-trenner">·</span>');
    return '<div class="laufband" aria-label="Lauftext: letzte Ereignisse"><div class="lb-spur">' + items + '<span class="lb-trenner">·</span>' + items + '</div></div>';
  }

  /** Run-Zeitleiste mit Kosten je Schritt und Summenzeile. */
  function runZeitleiste() {
    const r = M.run; const a = agent(r.agent);
    return '<div class="run-kopf"><div><span class="chip pr-ok">abgeschlossen · fachlich abgenommen</span> <span class="chip">' + esc(a.name) + '</span> <span class="chip">' + esc(r.projekt) + '</span> <span class="chip mono">' + esc(r.id) + '</span></div><h2>' + esc(r.auftrag) + '</h2></div>' +
      '<div class="run-kz"><div><b>' + eur(r.kosten) + '</b><span>Kosten, ' + esc(r.kosten_art) + '<br>Limit ' + eur(r.budget) + '</span></div><div><b>' + r.dauer_min + ' Min</b><span>Dauer bis Ergebnis</span></div><div><b>' + (r.tokens_ein / 1000).toFixed(1) + 'k / ' + (r.tokens_aus / 1000).toFixed(1) + 'k</b><span>Token ein / aus</span></div><div><b>' + esc(r.ergebnis_typ) + '</b><span>Ergebnis-Typ</span></div><div><b>' + esc(r.wirkung) + '</b><span>Wirkung (Rolle Vertrieb)</span></div></div>' +
      '<ol class="zeitleiste">' + r.ereignisse.map(e => '<li class="e-' + esc(e.art) + '"><span class="zl-zeit">' + esc(uhr(e.zeit)) + '</span><span class="zl-punkt" aria-hidden="true"></span><span class="zl-text">' + esc(EREIGNIS_ICON[e.art] || '•') + ' ' + esc(e.titel) + (e.tool ? ' <span class="chip klein">' + esc(e.tool) + '</span>' : '') + '</span><span class="zl-kosten">' + (e.kosten ? eur(e.kosten) : '') + '</span></li>').join('') + '</ol>' +
      '<p class="hinweis">Gespeichert sind nur Schritte, Werkzeugaufrufe, Quellen und Ergebnisse. Keine Prompts, keine Gedankengänge. Kosten je Schritt kommen vom Ausführer (gemessen) oder werden geschätzt und so gekennzeichnet.</p>';
  }

  /** Auswertung: Rangliste, Tabelle je Agent, Skalierungskarten. */
  function auswertung() {
    const A = M.agenten.filter(a => a.id !== 'pa-assistent');
    const bew = A.map(a => ({ a, b: M.bewertung(a) }));
    const reihen = { liefert: 'liefert', beobachten: 'beobachten', liefert_nicht: 'liefert nicht', guthaben_leer: 'Guthaben leer', zu_wenig: 'zu wenig Daten' };
    const rang = Object.keys(reihen).map(k => { const L = bew.filter(x => x.b.stufe === k); return L.length ? '<div class="rang ' + STUFE_KLASSE[k] + '"><h3>' + reihen[k] + ' <span>' + L.length + '</span></h3><ul>' + L.map(x => '<li><b>' + esc(x.a.name) + '</b><span>' + (x.b.je == null ? 'keine abgenommenen Ergebnisse' : eur(x.b.je) + ' je Ergebnis') + ' · ' + (x.b.quote == null ? 'noch nicht bewertet' : prozent(x.b.quote) + ' zurückgewiesen') + '</span></li>').join('') + '</ul></div>' : ''; }).join('');
    const tabelle = '<table class="auswertung"><thead><tr><th>Agent</th><th>Ergebnisse (4 Wo.)</th><th>abgenommen</th><th>zurückgewiesen</th><th>Kosten</th><th>je abgenommenem Ergebnis</th><th>Trend 4 Wochen</th><th>Wirkung</th><th>Urteil</th></tr></thead><tbody>' +
      bew.sort((x, y) => (y.a.kz.abgenommen) - (x.a.kz.abgenommen)).map(({ a, b }) => '<tr><td><b>' + esc(a.name) + '</b><br><span class="klein">' + esc(a.raum) + ' · ' + esc(a.modell) + '</span></td><td>' + a.kz.ergebnisse + '</td><td>' + a.kz.abgenommen + '</td><td>' + a.kz.zurueck + (b.quote != null ? ' <span class="klein">(' + prozent(b.quote) + ')</span>' : '') + '</td><td>' + eur(a.kz.kosten) + '</td><td>' + (b.je == null ? '–' : eur(b.je)) + '</td><td>' + sparkline(a.kz.trend) + '</td><td>' + (a.wirkung.wert == null ? '<span class="klein">' + esc(a.wirkung.text) + '</span>' : '<b>' + a.wirkung.wert + '</b> ' + esc(a.wirkung.text) + (a.wirkung.detail ? '<br><span class="klein">' + esc(a.wirkung.detail) + '</span>' : '')) + '</td><td><span class="urteil ' + STUFE_KLASSE[b.stufe] + '">' + esc(b.text) + '</span></td></tr>').join('') + '</tbody></table>';
    return '<div class="ausw-kopf"><h2>Wer liefert, wer nicht</h2><p>Schwelle (Vorschlag): höchstens ' + eur(M.SCHWELLEN.kosten_je_ergebnis_max) + ' je abgenommenem Ergebnis und höchstens ' + prozent(M.SCHWELLEN.zurueck_quote_max) + ' zurückgewiesen, über ' + M.SCHWELLEN.wochen + ' Wochen, mindestens ' + M.SCHWELLEN.mindest_ergebnisse + ' Ergebnisse. Du entscheidest, die Zahlen schlagen nur vor.</p></div>' +
      '<div class="rangliste">' + rang + '</div><div class="tabelle-scroll">' + tabelle + '</div>';
  }
  /** Skalierungskarten (Vorschläge, jede Karte eine Freigabe). */
  function skalierungskarten() {
    const ICON = { skalieren: '📈', pausieren: '⏸️', auffuellen: '🪙' };
    return '<div class="karten">' + M.karten.map(k => '<div class="skarte k-' + esc(k.art) + '"><div class="sk-kopf"><span class="sk-icon">' + ICON[k.art] + '</span><h3>' + esc(k.titel) + '</h3></div><p>' + esc(k.grund) + '</p><div class="sk-optionen">' + k.optionen.map(o => '<button type="button" class="btn ' + (k.art === 'pausieren' ? 'sec' : '') + '" data-demo>' + esc(o) + '</button>').join('') + '<button type="button" class="btn ghost" data-demo>Ablehnen</button></div><p class="klein">Vorschlag aus den Kennzahlen. Nichts passiert ohne deine Freigabe.</p></div>').join('') + '</div>';
  }
  /** Projektkarten. */
  function projekte() {
    return '<div class="projekte">' + M.projekte.map(p => '<div class="pkarte" style="--pf:' + p.farbe + '"><div class="pk-kopf"><span class="pk-raum">' + M.RAUM_ICON[p.raum] + ' ' + esc(p.raum) + '</span><h3>' + esc(p.name) + '</h3><span class="klein">Verantwortlich: ' + esc(p.verantwortlich) + '</span></div>' +
      '<div class="pk-fortschritt" role="img" aria-label="' + p.erledigt + ' von ' + (p.erledigt + p.offen) + ' Aufgaben erledigt"><i style="width:' + Math.round(100 * p.erledigt / (p.erledigt + p.offen)) + '%"></i></div><div class="klein">' + p.erledigt + ' von ' + (p.erledigt + p.offen) + ' Aufgaben erledigt · Quelle: Team-Portal</div>' +
      '<div class="pk-stats"><div><b>' + p.laufend + '</b><span>Agent läuft</span></div><div class="' + (p.freigaben ? 'warn' : '') + '"><b>' + p.freigaben + '</b><span>Freigaben</span></div><div class="' + (p.fehler ? 'warn' : '') + '"><b>' + p.fehler + '</b><span>Fehler</span></div><div><b>' + eur(p.kosten) + '</b><span>Kosten 4 Wo.</span></div></div>' +
      '<div class="pk-agenten">' + p.agenten.map(id => { const a = agent(id); return '<span class="chip ki"><i style="background:' + M.ZUSTAND_FARBE[a.zustand] + '"></i>' + esc(a.name) + '</span>'; }).join('') + '</div>' +
      '<div class="klein"><b>Nächster Schritt:</b> ' + esc(p.naechster) + '</div><div class="klein muted">Zuletzt: ' + esc(p.letzte) + '</div></div>').join('') + '</div>';
  }

  /** Reiter-Logik: data-tab Knöpfe schalten .tab-panel um, Hash merkt sich den Reiter. */
  function reiter(standard) {
    const knoepfe = Array.from(document.querySelectorAll('[data-tab]')), panels = Array.from(document.querySelectorAll('.tab-panel'));
    const zeige = id => { knoepfe.forEach(k => k.classList.toggle('on', k.dataset.tab === id)); knoepfe.forEach(k => k.setAttribute('aria-selected', k.dataset.tab === id)); panels.forEach(p => p.hidden = p.id !== 'tab-' + id); };
    knoepfe.forEach(k => k.onclick = () => { location.hash = k.dataset.tab; zeige(k.dataset.tab); });
    const h = location.hash.replace('#', ''); zeige(panels.some(p => p.id === 'tab-' + h) ? h : standard);
    window.addEventListener('hashchange', () => { const x = location.hash.replace('#', ''); if (panels.some(p => p.id === 'tab-' + x)) zeige(x); });
  }
  /** Demo-Knöpfe: nur Hinweis, nichts passiert. */
  function demo() {
    document.addEventListener('click', ev => { const b = ev.target.closest('[data-demo]'); if (!b) return; ev.preventDefault(); let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = 'Vorschau: „' + b.textContent.trim() + '“ würde im echten Office eine Freigabe anlegen.'; t.classList.add('show'); clearTimeout(demo.t); demo.t = setTimeout(() => t.classList.remove('show'), 2600); });
  }
  const kopfZahlen = () => { const A = M.agenten; const laufend = A.filter(a => a.zustand === 'arbeitet').length, warten = A.filter(a => a.zustand === 'wartet_freigabe' || a.zustand === 'wartet_rueckmeldung').length, kosten = A.reduce((s, a) => s + a.budget.verbraucht, 0), budget = A.reduce((s, a) => s + a.budget.monat, 0), abgen = A.reduce((s, a) => s + a.kz.abgenommen, 0); return { laufend, warten, kosten, budget, abgen, pausiert: A.filter(a => a.zustand === 'pausiert').length }; };

  window.VORSCHAU = { guthaben, kostenJeErgebnis, sparkline, pruefChip, zustandChip, ticker, laufband, runZeitleiste, auswertung, skalierungskarten, projekte, reiter, demo, kopfZahlen, EREIGNIS_ICON };
})();
