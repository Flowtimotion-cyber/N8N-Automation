// KI Office: Register „Guthaben“ (#/tab/guthaben). Euro-Guthaben je Agent und Monat, dazu die Vorschlagskarten
// „auffüllen“, „pausieren“, „skalieren“, „einrichten“ (KI Office 2.0, Paket 3).
// Durchgesetzt wird das Guthaben auf dem Server (office/lib/guthaben.js): Diese Seite zeigt nur an und schickt Timos Entscheidungen.
// Vorschläge und Knöpfe sieht nur der Admin; alle anderen sehen den Stand. Nichts hier geschieht automatisch.
// HTML per String, jeder Datenwert durch esc().
import { $, $$, esc, fmtDT } from './util.js';
import { istOrchestrierer, mitglied } from './modell.js';
import { euro, guthabenVon, RAUM_ICON } from './kontrollraum.daten.js';
import { dialog, aktion } from './ansichten.js';

const ART_KLASSE = { auffuellen: 'v-auffuellen', pausieren: 'v-pausieren', skalieren: 'v-skalieren', einrichten: 'v-einrichten' };
const ART_ICON = { auffuellen: '⛽', pausieren: '⏸', skalieren: '📈', einrichten: '🧾' };
const OPTION_KNOPF = { auffuellen: 'Auffüllen …', pausieren: 'Pausieren …', guthaben: 'Guthaben erhöhen …', instanz: 'Zweite Instanz …', einrichten: 'Vorschlag ansehen …' };
const PROTOKOLL_TEXT = { auffuellen: 'Guthaben aufgefüllt', pausieren: 'Agent pausiert', guthaben: 'Monatsguthaben erhöht', instanz: 'Zweite Instanz angelegt', einrichten: 'Guthaben eingerichtet', monat: 'Monatsguthaben gesetzt', einschalten: 'Agent eingeschaltet' };
const zahlFeld = (id, label, wert, hinweis) => '<div class="f"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" max="500" step="0.01" value="' + esc(wert == null ? '' : wert) + '" required>' + (hinweis ? '<div class="small muted">' + esc(hinweis) + '</div>' : '') + '</div>';
const grundFeld = pflicht => '<div class="f"><label for="g_b">Begründung' + (pflicht ? '' : ' (optional)') + '</label><input id="g_b" maxlength="600"' + (pflicht ? ' required' : '') + '></div>';
const zahl = id => { const v = String($(id).value || '').replace(',', '.'); return v === '' ? null : Number(v); };

/** Balken und Zahlen eines Guthabens für die Tabelle. */
function standZelle(g) {
  if (!g) return '<span class="muted">nicht eingerichtet</span><br><span class="small muted">nicht begrenzt</span>';
  return '<div class="guthaben ' + g.stufe + '"><div class="gb-zeile"><b>' + esc(euro(g.rest)) + ' <span class="gb-von">von ' + esc(euro(g.monat)) + ' übrig</span></b></div><div class="gb-balken"><i style="width:' + Math.round(g.anteil * 100) + '%"></i></div></div>';
}

function vorschlagKarte(v) {
  return '<article class="vkarte ' + (ART_KLASSE[v.art] || '') + '" data-vorschlag="' + esc(v.art) + '" data-agent="' + esc(v.agent_id || '') + '"><h3><span aria-hidden="true">' + (ART_ICON[v.art] || '') + '</span> ' + esc(v.titel) + '</h3><p>' + esc(v.grund) + '</p>' +
    '<div class="vk-knoepfe">' + v.optionen.map((o, i) => '<button type="button" class="btn klein' + (i ? ' sec' : '') + '" data-v-art="' + esc(v.art) + '" data-v-agent="' + esc(v.agent_id || '') + '" data-v-option="' + esc(o.option) + '">' + esc(OPTION_KNOPF[o.option] || o.text) + '</button>').join('') +
    '<button type="button" class="btn klein ghost" data-v-art="' + esc(v.art) + '" data-v-agent="' + esc(v.agent_id || '') + '" data-v-option="">Nicht jetzt</button></div></article>';
}

export function vGuthaben(ctx) {
  const D = ctx.D; const admin = (D.ich || {}).rolle === 'admin';
  const R = D.guthaben_regeln || {}; const eingerichtet = R.tabelle === true;
  const V = admin ? (D.vorschlaege || []) : [];
  const A = (D.agenten || []).slice().sort((a, b) => String(a.raum).localeCompare(String(b.raum)) || String(a.name).localeCompare(String(b.name)));
  const G = A.map(a => ({ a, g: guthabenVon(a) }));
  const mit = G.filter(x => x.g && x.a.aktiv !== false);
  const summe = f => mit.reduce((s, x) => s + f(x.g), 0);
  const leer = mit.filter(x => x.g.stufe === 'leer').length;
  const kpi = (n, l, cls) => '<div class="kpi ' + (cls || '') + '"><b>' + esc(n) + '</b><span>' + esc(l) + '</span></div>';
  const zeile = ({ a, g }) => {
    const raum = istOrchestrierer(a) ? 'Zentrale' : a.raum; const pausiert = a.aktiv === false; const roh = a.guthaben || {};
    const status = pausiert ? '<span class="urteil st-wenig">pausiert</span>' + (a.pausiert_grund ? '<br><span class="small muted">' + esc(a.pausiert_grund) + '</span>' : '')
      : !g ? '<span class="urteil st-wenig">ohne Guthaben</span>' : g.stufe === 'leer' ? '<span class="urteil st-nicht">leer: kein Start</span>' : g.stufe === 'knapp' ? '<span class="urteil st-beobachten">wird knapp</span>' : '<span class="urteil st-liefert">reicht</span>';
    const knoepfe = !admin ? '' : '<td class="g-knoepfe">' + (eingerichtet ? '<button type="button" class="btn klein sec" data-g-setzen="' + esc(a.agent_id) + '">Guthaben …</button>' + (g ? '<button type="button" class="btn klein sec" data-g-auffuellen="' + esc(a.agent_id) + '">Auffüllen …</button>' : '') : '') +
      '<button type="button" class="btn klein ' + (pausiert ? '' : 'ghost') + '" data-g-aktiv="' + esc(a.agent_id) + '" data-ziel="' + (pausiert ? '1' : '0') + '">' + (pausiert ? 'Einschalten …' : 'Pausieren …') + '</button></td>';
    return '<tr data-agent="' + esc(a.agent_id) + '"' + (pausiert ? ' class="pausiert"' : '') + '><td><a href="#/agent/' + esc(a.agent_id) + '"><b>' + esc(a.name) + '</b></a>' + (a.instanz_von ? ' <span class="chip" title="Zweite Instanz von ' + esc(a.instanz_von) + '">Instanz</span>' : '') + '<br><span class="small muted">' + esc((RAUM_ICON[raum] || '') + ' ' + raum + ' · ' + a.modell) + '</span></td>' +
      '<td class="zahl">' + (g ? esc(euro(roh.monat_eur)) + (g.zusatz ? '<br><span class="small muted">+ ' + esc(euro(g.zusatz)) + ' aufgefüllt</span>' : '') : '–') + '</td>' +
      '<td class="zahl">' + (g ? esc(euro(g.verbraucht)) + (g.geschaetzt ? '<br><span class="small muted">teils geschätzt</span>' : '') + (roh.ohne_angabe ? '<br><span class="small muted">' + roh.ohne_angabe + (roh.ohne_angabe === 1 ? ' Lauf' : ' Läufe') + ' ohne Angabe</span>' : '') : '–') + '</td>' +
      '<td class="zahl">' + (g ? esc(euro(g.reserviert)) + (roh.laufend ? '<br><span class="small muted">' + roh.laufend + (roh.laufend === 1 ? ' Auftrag läuft' : ' Aufträge laufen') + '</span>' : '') : '–') + '</td>' +
      '<td class="g-stand">' + standZelle(g) + '</td><td>' + status + '</td>' + knoepfe + '</tr>';
  };
  const E = admin ? (D.entscheidungen || []) : [];
  const agentName = id => { const a = A.find(x => x.agent_id === id); return a ? a.name : (id || 'mehrere Agenten'); };
  const protokoll = e => '<li><b>' + esc(e.entscheidung === 'abgelehnt' ? 'Vorschlag abgelehnt (' + ((R.arten || {})[e.art] || e.art) + ')' : (PROTOKOLL_TEXT[e.option] || e.art)) + '</b> · ' + esc(agentName(e.agent_id)) +
    (e.wert != null && e.entscheidung !== 'abgelehnt' ? ' · ' + esc(euro(e.wert)) : '') + (e.segment ? ' · Segment „' + esc(e.segment) + '“' : '') + '<br><span class="small muted">' + esc(fmtDT(e.entschieden_am)) + ' von ' + esc(mitglied(D, e.entschieden_von).name) + (e.begruendung ? ': ' + esc(e.begruendung) : '') + '</span></li>';
  const VR = R.vorschlag || {}, GR = R.regeln || {};
  const proz = x => Math.round((x || 0) * 100) + ' %';

  $('#main').innerHTML = '<h1>Guthaben</h1><p class="sub">Jeder Agent hat ein Euro-Guthaben je Monat. Ist es leer, startet er keinen neuen Auftrag, bis ' + (admin ? 'du auffüllst' : 'Timo auffüllt') + ' oder der nächste Monat beginnt. ' + (admin ? 'Die Karten sind Vorschläge aus den Zahlen. Es passiert nichts, bevor du entscheidest.' : 'Über Auffüllen, Pausieren und Skalieren entscheidet Timo.') + '</p>' +
    (eingerichtet ? '' : '<div class="note warn" id="ghHinweis" style="margin-bottom:14px"><b>Noch nicht eingerichtet.</b> Guthaben und Vorschläge brauchen die Datei <code>supabase/team_office_guthaben.sql</code> und danach den aktualisierten Workflow „TEAM: Office-API“ (docs/office/SETUP.md, Abschnitt 17). Bis dahin ist kein Agent begrenzt.</div>') +
    (eingerichtet ? '<div class="kpis">' + kpi(mit.length ? euro(summe(g => g.monat)) : '–', 'Guthaben aller Agenten in diesem Monat') + kpi(mit.length ? euro(summe(g => g.verbraucht)) : '–', 'verbraucht') + kpi(mit.length ? euro(summe(g => g.rest)) : '–', 'übrig') + kpi(leer, leer === 1 ? 'Agent mit leerem Guthaben' : 'Agenten mit leerem Guthaben', leer ? 'warn' : '') + (admin ? kpi(V.length, V.length === 1 ? 'Vorschlag wartet auf dich' : 'Vorschläge warten auf dich', V.length ? 'achtung' : '') : '') + '</div>' : '') +
    (admin && eingerichtet ? '<div class="card" id="ghVorschlaege"><h2>Vorschläge</h2>' + (V.length ? '<div class="vkarten">' + V.map(vorschlagKarte).join('') + '</div>' : '<p class="empty">Gerade kein Vorschlag. Die Zahlen geben nichts her, was du entscheiden müsstest.</p>') + '</div>' : '') +
    '<div class="card"><h2>Je Agent</h2><div class="tabelle-scroll"><table class="auswertung guthaben-tabelle"><thead><tr><th>Agent</th><th>Monatsguthaben</th><th>verbraucht</th><th>reserviert</th><th>Stand</th><th>Status</th>' + (admin ? '<th>Entscheiden</th>' : '') + '</tr></thead><tbody>' +
      (G.length ? G.map(zeile).join('') : '<tr><td colspan="7" class="empty">Noch keine Agenten.</td></tr>') + '</tbody></table></div></div>' +
    (admin && eingerichtet ? '<div class="card" id="ghProtokoll"><h2>Deine Entscheidungen</h2>' + (E.length ? '<ul class="protokoll">' + E.map(protokoll).join('') + '</ul>' : '<p class="empty">Noch keine Entscheidung.</p>') + '</div>' : '') +
    '<div class="card"><h2>So wird gerechnet</h2><ul class="small" style="margin:0;padding-left:18px">' +
      '<li><b>Monatsguthaben</b> gilt je Kalendermonat und verfällt am Monatsende. <b>Auffüllen</b> gilt nur für den laufenden Monat.</li>' +
      '<li><b>Verbraucht</b> = gemessene und geschätzte Kosten aller Läufe, die in diesem Monat geendet haben. Läufe ohne Kostenangabe zählen nicht mit und stehen als „ohne Angabe“ dabei.</li>' +
      '<li><b>Reserviert</b> = das Kostenlimit der Aufträge, die gerade laufen oder in der Warteschlange stehen.</li>' +
      '<li><b>Leer</b>: Neue Aufträge werden angelegt, starten aber nicht. Sie warten unter „Freigaben“, bis aufgefüllt ist und der Start freigegeben wird. Ein laufender Auftrag wird nicht abgebrochen.</li>' +
      '<li><b>Vorschlag „skalieren“</b>: in ' + (VR.tage || 14) + ' Tagen höchstens ' + esc(euro(VR.kosten_je_ergebnis_max_eur == null ? 0.5 : VR.kosten_je_ergebnis_max_eur)) + ' je abgenommenem Ergebnis und höchstens ' + proz(VR.zurueck_quote_max == null ? 0.2 : VR.zurueck_quote_max) + ' zurückgewiesen, bei mindestens ' + (VR.mindest_bewertet || 3) + ' bewerteten Ergebnissen. <b>„Pausieren“</b>: mehr Zurückweisungen als das oder keine einzige Abnahme. <b>„Auffüllen“</b>: ab ' + proz(GR.auffuellen_ab == null ? 0.9 : GR.auffuellen_ab) + ' verbraucht.</li>' +
      '<li>Nach einer Entscheidung kommt derselbe Vorschlag ' + (VR.ruhe_tage || 14) + ' Tage lang nicht wieder. Ein leeres Guthaben wird immer gemeldet.</li>' +
      '<li>Kein Agent kann sein Guthaben ändern, sich selbst kopieren oder sich wieder einschalten. Das kann nur der Admin, und jede Entscheidung steht im Protokoll.</li></ul></div>';

  if (!admin) return;
  const reg = id => A.find(a => a.agent_id === id);
  $$('[data-v-art]').forEach(b => b.onclick = () => vorschlagDialog(ctx, V.find(v => v.art === b.dataset.vArt && (v.agent_id || '') === b.dataset.vAgent), b.dataset.vOption));
  $$('[data-g-setzen]').forEach(b => b.onclick = () => { const a = reg(b.dataset.gSetzen); const m = (a.guthaben || {}).monat_eur;
    dialog(ctx, 'Monatsguthaben: ' + a.name, '<p class="small">Gilt ab sofort und für jeden weiteren Monat. 0 € heißt: Der Agent startet nichts.</p>' + zahlFeld('g_w', 'Monatsguthaben in Euro', m == null ? '' : m) + grundFeld(false),
      () => aktion(ctx, 'guthaben_setzen', { agent_id: a.agent_id, monat_eur: zahl('#g_w'), begruendung: $('#g_b').value }, 'Monatsguthaben gespeichert')); });
  $$('[data-g-auffuellen]').forEach(b => b.onclick = () => { const a = reg(b.dataset.gAuffuellen);
    dialog(ctx, 'Auffüllen: ' + a.name, '<p class="small">Der Betrag kommt nur für den laufenden Monat dazu. Wartende Aufträge gibst du danach unter „Freigaben“ frei.</p>' + zahlFeld('g_w', 'Betrag in Euro', '') + grundFeld(false),
      () => aktion(ctx, 'guthaben_setzen', { agent_id: a.agent_id, zusatz_eur: zahl('#g_w'), begruendung: $('#g_b').value }, 'Guthaben aufgefüllt')); $('#dlgOk').textContent = 'Auffüllen'; });
  $$('[data-g-aktiv]').forEach(b => b.onclick = () => { const a = reg(b.dataset.gAktiv); const an = b.dataset.ziel === '1';
    dialog(ctx, (an ? 'Einschalten: ' : 'Pausieren: ') + a.name, '<p class="small">' + (an ? 'Der Agent nimmt wieder Aufträge an.' : 'Der Agent nimmt keine neuen Aufträge an, bis du ihn wieder einschaltest. Laufende Aufträge werden nicht abgebrochen.') + '</p><div class="f"><label for="g_b">Grund' + (an ? ' (optional)' : '') + '</label><input id="g_b" maxlength="300"' + (an ? '' : ' required') + '></div>',
      () => aktion(ctx, 'agent_aktiv', { agent_id: a.agent_id, aktiv: an, grund: $('#g_b').value }, an ? 'Agent eingeschaltet' : 'Agent pausiert')); $('#dlgOk').textContent = an ? 'Einschalten' : 'Pausieren'; });
}

/** Dialog zu einer Vorschlagskarte: option = gewählte Möglichkeit, leer = ablehnen. */
function vorschlagDialog(ctx, v, option) {
  if (!v) return;
  const basis = { art: v.art, agent_id: v.agent_id || null };
  const kopf = '<div class="note" style="margin-bottom:10px"><b>' + esc(v.titel) + '</b><div class="small" style="margin-top:4px">' + esc(v.grund) + '</div></div>';
  if (!option) {
    dialog(ctx, 'Vorschlag ablehnen', kopf + '<p class="small">Der Vorschlag kommt 14 Tage lang nicht wieder.</p>' + grundFeld(false), () => aktion(ctx, 'vorschlag_entscheiden', Object.assign({ entscheidung: 'abgelehnt', begruendung: $('#g_b').value }, basis), 'Vorschlag abgelehnt'));
    $('#dlgOk').textContent = 'Ablehnen'; return;
  }
  const o = v.optionen.find(x => x.option === option); if (!o) return;
  const senden = (extra, ok) => () => aktion(ctx, 'vorschlag_entscheiden', Object.assign({ entscheidung: 'angenommen', option, begruendung: $('#g_b').value }, basis, extra()), ok);
  if (option === 'auffuellen') { dialog(ctx, 'Guthaben auffüllen', kopf + zahlFeld('g_w', 'Betrag für diesen Monat in Euro', o.wert, 'Wartende Aufträge gibst du danach unter „Freigaben“ frei.') + grundFeld(false), senden(() => ({ wert: zahl('#g_w') }), 'Guthaben aufgefüllt')); $('#dlgOk').textContent = 'Auffüllen'; }
  else if (option === 'pausieren') { dialog(ctx, 'Agent pausieren', kopf + '<p class="small">Der Agent nimmt keine neuen Aufträge an, bis du ihn im Register „Guthaben“ wieder einschaltest. Laufende Aufträge werden nicht abgebrochen.</p>' + grundFeld(false), senden(() => ({}), 'Agent pausiert')); $('#dlgOk').textContent = 'Pausieren'; }
  else if (option === 'guthaben') { dialog(ctx, 'Monatsguthaben erhöhen', kopf + zahlFeld('g_w', 'Neues Monatsguthaben in Euro', o.wert, 'Gilt ab sofort und für jeden weiteren Monat.') + grundFeld(false), senden(() => ({ wert: zahl('#g_w') }), 'Monatsguthaben erhöht')); $('#dlgOk').textContent = 'Erhöhen'; }
  else if (option === 'instanz') {
    dialog(ctx, 'Zweite Instanz anlegen', kopf + '<p class="small">Es entsteht ein zweiter Eintrag in der Registry mit denselben Einstellungen, eigenem Guthaben und eigenen Kennzahlen. So siehst du, ob das Segment trägt. Projekte und Auftrag für das Segment gibst du danach selbst vor.</p>' +
      '<div class="f"><label for="g_s">Segment</label><input id="g_s" maxlength="40" minlength="2" required placeholder="z. B. Handwerk Nord"></div>' + zahlFeld('g_w', 'Monatsguthaben der neuen Instanz in Euro', o.wert) + grundFeld(false), senden(() => ({ wert: zahl('#g_w'), segment: $('#g_s').value }), 'Zweite Instanz angelegt'));
    $('#dlgOk').textContent = 'Instanz anlegen';
  } else if (option === 'einrichten') {
    const W = (v.zahlen || {}).werte || {}; const namen = id => ((ctx.D.agenten || []).find(a => a.agent_id === id) || { name: id }).name;
    dialog(ctx, 'Guthaben einrichten', kopf + '<dl class="kv" style="margin:6px 0">' + Object.keys(W).map(id => '<dt>' + esc(namen(id)) + '</dt><dd>' + esc(euro(W[id])) + ' im Monat</dd>').join('') + '</dl><p class="small">Einzelne Werte änderst du danach in der Tabelle.</p>' + grundFeld(false), senden(() => ({}), 'Guthaben eingerichtet'));
    $('#dlgOk').textContent = 'Übernehmen';
  }
}
