// KI Office: Register „Auswertung“ (#/tab/auswertung). Wer liefert, wer nicht: je Agent Ergebnisse, Abnahmen, Kosten je abgenommenem Ergebnis,
// Quote zurückgewiesen, Trend über vier Wochen, Wirkung. Die Zahlen kommen vom Server (Tabelle office_kennzahlen, office/lib/kennzahlen.js);
// solange die Tabelle fehlt, rechnet die Seite mit derselben Bibliothek aus den Läufen. Bewertet wird nur, was Menschen abgenommen oder zurückgewiesen haben.
// HTML per String, jeder Datenwert durch esc().
import { $, esc } from './util.js';
import { istOrchestrierer } from './modell.js';
import { euro, auswertungZeilen, wirkungText, RAUM_ICON } from './kontrollraum.daten.js';
import { sparkline } from './kontrollraum.js';
import { AUSWERTUNG_SCHWELLEN, BEWERTUNG_TEXT, KENNZAHLEN_TAGE, trendRichtung } from './kennzahlen.js';

const STUFEN = ['liefert', 'beobachten', 'liefert_nicht', 'zu_wenig'];
const STUFE_KLASSE = { liefert: 'st-liefert', beobachten: 'st-beobachten', liefert_nicht: 'st-nicht', zu_wenig: 'st-wenig' };
const prozent = x => x == null ? '–' : Math.round(x * 100) + ' %';
const TREND = { runter: ['↓', 'gut', 'wird günstiger'], hoch: ['↑', 'schlecht', 'wird teurer'], gleich: ['→', '', 'gleichbleibend'] };

export function urteilChip(bw) { return '<span class="urteil ' + STUFE_KLASSE[bw.stufe] + '" title="' + esc((bw.gruende || []).join(' ')) + '">' + esc(BEWERTUNG_TEXT[bw.stufe] || bw.text) + '</span>'; }
/** Kostenzelle: Summe mit Aufteilung gemessen / geschätzt und Hinweis auf Läufe ohne Wert. */
export function kostenZelle(kz) {
  if (kz.kosten_eur == null) return '<span class="muted">unbekannt</span>' + (kz.gelaufen ? '<br><span class="small muted">' + kz.gelaufen + (kz.gelaufen === 1 ? ' Lauf' : ' Läufe') + ' ohne Angabe</span>' : '');
  const teile = [];
  if (kz.kosten_gemeldet - kz.kosten_geschaetzt > 0) teile.push(euro(kz.kosten_gemessen_eur) + ' gemessen');
  if (kz.kosten_geschaetzt > 0) teile.push(euro(kz.kosten_geschaetzt_eur) + ' geschätzt');
  if (kz.kosten_unbekannt > 0) teile.push(kz.kosten_unbekannt + ' ohne Angabe');
  return '<b>' + esc(euro(kz.kosten_eur)) + '</b><br><span class="small muted">' + esc(teile.join(' · ')) + '</span>';
}

export function vAuswertung(ctx) {
  const D = ctx.D;
  const Z = auswertungZeilen(D);
  const S = Object.assign({}, AUSWERTUNG_SCHWELLEN, (D.auswertung || {}).schwellen || {});
  const tage = (D.auswertung || {}).tage || KENNZAHLEN_TAGE;
  const mitTabelle = !!(D.auswertung && D.auswertung.tabelle);
  const summe = f => Z.reduce((s, z) => s + (f(z.kz) || 0), 0);
  const abgen = summe(k => k.abgenommen), zur = summe(k => k.zurueck), erg = summe(k => k.ergebnisse);
  const mitKosten = Z.some(z => z.kz.kosten_eur != null);
  const kosten = summe(k => k.kosten_eur), gesch = summe(k => k.kosten_geschaetzt_eur), ohne = summe(k => k.kosten_unbekannt);
  const kpi = (n, l, cls) => '<div class="kpi ' + (cls || '') + '"><b>' + esc(n) + '</b><span>' + esc(l) + '</span></div>';
  const rang = STUFEN.map(st => { const L = Z.filter(z => z.bw.stufe === st); return '<div class="rang ' + STUFE_KLASSE[st] + '" data-stufe="' + st + '"><h3>' + esc(BEWERTUNG_TEXT[st]) + ' <span>' + L.length + '</span></h3>' + (L.length ? '<ul>' + L.map(z => '<li><a href="#/agent/' + esc(z.agent.agent_id) + '"><b>' + esc(z.agent.name) + '</b></a><span>' + esc((z.bw.gruende || []).join(' ')) + '</span></li>').join('') + '</ul>' : '<p class="small muted" style="margin:4px 0 0">niemand</p>') + '</div>'; }).join('');
  const zeile = z => { const k = z.kz, t = TREND[trendRichtung(k.trend)]; const raum = istOrchestrierer(z.agent) ? 'Zentrale' : z.agent.raum; const w = wirkungText(D, z.agent, k.wirkung);
    return '<tr data-agent="' + esc(z.agent.agent_id) + '"><td><a href="#/agent/' + esc(z.agent.agent_id) + '"><b>' + esc(z.agent.name) + '</b></a><br><span class="small muted">' + esc((RAUM_ICON[raum] || '') + ' ' + raum + ' · ' + z.agent.modell) + '</span></td>' +
      '<td class="zahl">' + k.gelaufen + (k.fehlgeschlagen ? '<br><span class="small muted">' + k.fehlgeschlagen + ' fehlgeschlagen</span>' : '') + '</td><td class="zahl">' + k.ergebnisse + (k.offen ? '<br><span class="small muted">' + k.offen + ' ungeprüft</span>' : '') + '</td>' +
      '<td class="zahl">' + k.abgenommen + '</td><td class="zahl">' + k.zurueck + (k.zurueck_quote != null ? ' <span class="small muted">(' + prozent(k.zurueck_quote) + ')</span>' : '') + '</td>' +
      '<td>' + kostenZelle(k) + '</td><td class="zahl"><b>' + esc(k.kosten_je_abgenommen == null ? '–' : euro(k.kosten_je_abgenommen)) + '</b></td>' +
      '<td>' + (sparkline(k.trend) || '<span class="small muted">zu wenig Daten</span>') + (t ? ' <span class="trend ' + t[1] + '" title="' + t[2] + '">' + t[0] + '</span>' : '') + '</td>' +
      '<td class="zahl">' + (k.dauer_min == null ? '–' : (k.dauer_min < 1 ? '< 1' : Math.round(k.dauer_min)) + ' Min') + '</td><td>' + (w ? esc(w) : '<span class="muted">–</span>') + '</td><td>' + urteilChip(z.bw) + '</td></tr>'; };
  $('#main').innerHTML = '<h1>Auswertung</h1><p class="sub">Wer liefert, wer nicht: die letzten ' + tage + ' Tage je Agent. Bewertet wird nur, was ein Mensch abgenommen oder zurückgewiesen hat. Die Zahlen schlagen vor, du entscheidest.</p>' +
    (mitTabelle ? '' : '<div class="note warn" id="auswHinweis" style="margin-bottom:14px"><b>Vorläufige Zahlen.</b> Die Kennzahlen-Tabelle ist im Server noch nicht eingerichtet. Gerechnet wird aus den Läufen der letzten 90 Tage; Wirkung und der vom Ausführer gemeldete Ergebnis-Typ fehlen noch. Einrichtung: <code>supabase/team_office_kennzahlen.sql</code>, dann den Workflow „TEAM: Office-API“ aktualisieren (docs/office/SETUP.md Abschnitt 16).</div>') +
    '<div class="kpis">' + kpi(erg, 'Ergebnisse (technisch abgeschlossen)') + kpi(abgen, 'fachlich abgenommen') + kpi(prozent(abgen + zur ? zur / (abgen + zur) : null), 'zurückgewiesen (von den bewerteten)', abgen + zur && zur / (abgen + zur) > S.zurueck_quote_max ? 'warn' : '') +
      kpi(mitKosten ? euro(kosten) : 'unbekannt', mitKosten ? 'Kosten gesamt' + (gesch ? ', davon ' + euro(gesch) + ' geschätzt' : '') + (ohne ? ' · ' + ohne + ' Läufe ohne Angabe' : '') : 'Kosten: kein Ausführer hat Verbrauch gemeldet') +
      kpi(mitKosten && abgen ? euro(kosten / abgen) : '–', 'je abgenommenem Ergebnis') + '</div>' +
    '<div class="card"><h2>Rangliste</h2><p class="small muted" style="margin:-6px 0 10px">Schwelle (Vorschlag): höchstens ' + esc(euro(S.kosten_je_ergebnis_max_eur)) + ' je abgenommenem Ergebnis und höchstens ' + prozent(S.zurueck_quote_max) + ' zurückgewiesen, bei mindestens ' + S.mindest_bewertet + ' bewerteten Ergebnissen.</p><div class="rangliste">' + rang + '</div></div>' +
    '<div class="card"><h2>Je Agent</h2><div class="tabelle-scroll"><table class="auswertung"><thead><tr><th>Agent</th><th>Läufe</th><th>Ergebnisse</th><th>abgenommen</th><th>zurückgewiesen</th><th>Kosten</th><th>je abgenommenem Ergebnis</th><th>Trend 4 Wochen</th><th>Dauer (Mitte)</th><th>Wirkung</th><th>Urteil</th></tr></thead><tbody>' +
      (Z.length ? Z.map(zeile).join('') : '<tr><td colspan="11" class="empty">Noch keine Agenten.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><h2>So wird gerechnet</h2><ul class="small" style="margin:0;padding-left:18px">' +
      '<li><b>Ergebnis</b> = ein Lauf, den der Agent technisch abgeschlossen hat. <b>Abgenommen</b> oder <b>zurückgewiesen</b> entscheidet ein Mensch auf der Run-Seite.</li>' +
      '<li><b>Kosten</b>: „gemessen“ hat der Ausführer mit Quelle gemeldet. „Geschätzt“ heißt: vom Ausführer ohne Quelle gemeldet, aus gemeldeten Token und der Preistabelle gerechnet, oder bei Agenten ohne eigene Meldung grob aus der Textlänge von Auftrag und Ergebnis geschätzt. „Ohne Angabe“ zählt nicht als null.</li>' +
      '<li><b>Je abgenommenem Ergebnis</b> = alle Kosten des Agenten im Zeitraum (auch die der fehlgeschlagenen Läufe) geteilt durch die abgenommenen Ergebnisse.</li>' +
      '<li><b>Trend</b>: Kosten je abgenommenem Ergebnis in vier Wochenscheiben, älteste links.</li>' +
      '<li><b>Wirkung</b> trägt der Ausführer oder der Mensch ein, der abnimmt, als Zahl je Feld der Rolle (Vertrieb: Dossiers, qualifizierte Firmen, Termine; Marketing: Texte freigegeben, veröffentlicht; Akademie: Lektionen fertig).</li>' +
      '<li><b>Urteil</b>: „liefert nicht“ bei über ' + prozent(S.zurueck_quote_max) + ' Zurückweisungen oder ohne eine einzige Abnahme; „beobachten“ bei unbekannten Kosten oder über ' + esc(euro(S.kosten_je_ergebnis_max_eur)) + ' je Ergebnis; sonst „liefert“. Unter ' + S.mindest_bewertet + ' bewerteten Ergebnissen gibt es kein Urteil.</li>' +
      '<li>Gespeichert sind je Lauf nur Agent, Raum, Modell, Zahlen und feste Kategorien. Keine Namen, kein Auftragstext.</li></ul></div>';
}
