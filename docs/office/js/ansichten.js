// KI Office: Ansichten. HTML per String, jeder Datenwert durch esc().
import { $, $$, esc, toast, fmtD, fmtDT, relativ, ueberfaellig, farbe, chip, kpi, kurz, opt, md } from './util.js';
import { api, neuerSchluessel, PORTAL, ls } from './api.js';
import { RAEUME, AKTIVE_RUN_STATUS, PROBLEM_RUN_STATUS, mitglied, agentReg, projektVon, projektById, runVon, ereignisseVon, artefakteVon, freigabenVon, letzteAktivitaetRun, raumVon, projektStand, agentZustand, ZUSTAND_TEXT, ZUSTAND_FARBE, verbrauchText, istOrchestrierer, kinderVon, elternVon, delegierteVon, istStartFreigabe, wartendeStarts, darfEntscheiden, startHinweis, KOSTENSTUFE_ANZEIGE } from './modell.js';

export const F = Object.assign({ q: '', raum: '', zust: '', status: 'aktiv', zeitraum: 'alle', ansicht: 'liste', runStatus: '' }, JSON.parse(ls.get('ko-filter') || '{}'));
const saveF = () => ls.set('ko-filter', JSON.stringify(F));

// ---------- Bausteine ----------
const istMensch = D => D.ich && D.ich.typ !== 'agent';
export const av = (D, id) => { const p = mitglied(D, id); return p.typ === 'agent' ? '<span class="av ki" title="' + esc(p.name) + ' (KI-Agent)">🤖</span>' : '<span class="av ' + farbe(id) + '" title="' + esc(p.name) + '">' + esc((p.name || '?').slice(0, 1).toUpperCase()) + '</span>'; };
const name = (D, id) => esc(mitglied(D, id).name);
const stChip = (D, s) => chip((D.status_text || {})[s] || s, 'rs-' + s);
const fChip = s => chip(s, 'fs-' + s);
const aufgabeLink = a => '<a href="' + PORTAL + '#/aufgabe/' + esc(a.aufgabe_id) + '" title="Im Team-Portal öffnen">' + esc(a.titel) + '</a>';
const taskRow = (D, a) => '<div class="task' + (a.status === 'Erledigt' ? ' done' : '') + '">' + av(D, a.verantwortlich) + '<div><div class="t">' + aufgabeLink(a) + '</div><div class="meta">' + chip(a.status, 'st-' + String(a.status).replace(/\s/g, '-')) + chip('P' + (a.prio || 2), 'p' + (a.prio || 2)) + (a.label ? chip(a.label) : '') + (a.deadline ? '<span class="' + (ueberfaellig(a) ? 'late' : '') + '">bis ' + fmtD(a.deadline) + '</span>' : '') + (a.agent_geeignet ? chip('Agent geeignet', 'ki') : '') + '</div></div><div class="right small muted">' + name(D, a.verantwortlich) + '</div></div>';
const runRow = (D, r) => { const reg = agentReg(D, r.agent_id); const K = kinderVon(D, r.run_id); return '<a class="run' + (r.eltern_run_id ? ' teil' : '') + '" href="#/run/' + esc(r.run_id) + '"><div><div class="t">' + (r.eltern_run_id ? '<span class="muted" aria-hidden="true">└ </span>' : '') + esc(kurz(r.auftrag, 90)) + '</div><div class="meta">' + stChip(D, r.status) + chip(reg ? reg.name : r.agent_id, 'ki') + '<span>' + esc(r.projekt) + '</span>' + (r.abgenommen === true ? chip('fachlich abgenommen', 'fs-erteilt') : r.abgenommen === false ? chip('zurückgewiesen', 'fs-abgelehnt') : '') + (Number(r.versuche) > 1 ? chip('Versuch ' + r.versuche + '/' + r.max_versuche) : '') + (K.length ? chip('Team: ' + K.length + ' Teilaufträge', 'team') : '') + (r.eltern_run_id ? chip('Teilauftrag', 'team') : '') + '</div></div><div class="small muted">' + esc(relativ(letzteAktivitaetRun(D, r))) + '<br>von ' + name(D, r.auftraggeber) + '</div></a>'; };
/** Run-Liste mit Teilaufträgen als eingerückte Zweige unter ihrem Eltern-Run (jeder Run genau einmal). Kinder fremder Eltern-Runs stehen oben. */
function runBaum(D, R) {
  const ids = new Set(R.map(r => r.run_id)); let out = '';
  const zweig = (r, tiefe) => { out += tiefe ? '<div class="zweig">' + runRow(D, r) + '</div>' : runRow(D, r); for (const k of kinderVon(D, r.run_id)) if (ids.has(k.run_id)) zweig(k, tiefe + 1); };
  for (const r of R) if (!r.eltern_run_id || !ids.has(r.eltern_run_id)) zweig(r, 0);
  return out;
}
const leer = t => '<p class="empty">' + esc(t) + '</p>';
const fortschritt = st => st.gesamt ? '<div><div class="small"><b>' + st.erledigt + ' von ' + st.gesamt + '</b> Aufgaben erledigt <span class="quelle">(Quelle: Aufgaben im Team-Portal)</span></div><div class="fortschritt" role="img" aria-label="' + st.erledigt + ' von ' + st.gesamt + ' Aufgaben erledigt"><i style="width:' + Math.round(100 * st.erledigt / st.gesamt) + '%"></i></div></div>' : '<div class="small muted">Noch keine Aufgaben im Projekt.</div>';

function bindFilter(ctx, felder) {
  for (const f of felder) { const el = $('#' + f); if (!el) continue; el.oninput = el.onchange = () => { F[f] = el.value; saveF(); ctx.render(); }; }
  $$('[data-ansicht]').forEach(b => b.onclick = () => { F.ansicht = b.dataset.ansicht; saveF(); ctx.render(); });
}

// ---------- Projekte ----------
export function vProjekte(ctx, raumAusRoute) {
  const D = ctx.D;
  if (raumAusRoute !== undefined) F.raum = raumAusRoute || '';
  const alle = (D.projekte || []).slice().sort((a, b) => (a.reihenfolge || 50) - (b.reihenfolge || 50) || a.name.localeCompare(b.name));
  const staende = new Map(alle.map(p => [p.projekt_id, projektStand(D, p)]));
  const tage = { '7': 7, '30': 30, '90': 90 }[F.zeitraum];
  const q = F.q.trim().toLowerCase();
  const L = alle.filter(p => {
    const st = staende.get(p.projekt_id);
    if (F.status === 'aktiv' && p.status === 'abgeschlossen') return false;
    if (['aktiv', 'geplant', 'pausiert', 'abgeschlossen'].includes(F.status) && F.status !== 'aktiv' && p.status !== F.status) return false;
    if (F.status === 'freigaben' && !st.freigabenOffen.length) return false;
    if (F.status === 'fehler' && !st.fehler.length) return false;
    if (F.status === 'ausstehend' && !st.ausstehend.length) return false;
    if (F.raum && raumVon(D, p) !== F.raum) return false;
    if (F.zust && !(p.verantwortlich === F.zust || st.aufgaben.some(a => a.verantwortlich === F.zust) || st.agenten.some(a => a.agent_id === F.zust || a.mitglied_id === F.zust))) return false;
    if (tage && !(st.letzte && (Date.now() - new Date(st.letzte.zeit).getTime()) <= tage * 86400000)) return false;
    if (q && !(p.name.toLowerCase().includes(q) || String(p.beschreibung || '').toLowerCase().includes(q) || st.aufgaben.some(a => a.titel.toLowerCase().includes(q)))) return false;
    return true;
  });
  const sum = f => alle.reduce((s, p) => s + f(staende.get(p.projekt_id)), 0);
  const personen = (D.mitglieder || []).filter(m => m.status !== 'gesperrt');
  $('#main').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>Projekte</h1><p class="sub">Alle Projekte des Team-Portals mit Aufgaben, Agentenläufen, Freigaben und letzter belegter Aktivität. Zahlen sind gezählt, nicht geschätzt.</p></div>' + (istMensch(D) ? '<button class="btn" id="neuAuftrag">+ Auftrag an Agent</button>' : '') + '</div>' +
    '<div class="kpis">' + kpi(sum(s => s.aktiveRuns.length), 'laufende Agentenaufträge', false, '#/tab/agenten') + kpi(sum(s => s.freigabenOffen.length), 'offene Freigaben', sum(s => s.freigabenOffen.length) > 0, '#/tab/freigaben') + kpi(sum(s => s.fehler.length), 'fehlgeschlagen oder veraltet', sum(s => s.fehler.length) > 0) + kpi(sum(s => s.ausstehend.length), 'Ergebnisse ohne Abnahme') + kpi(sum(s => s.ueberfaellig.length), 'überfällige Aufgaben', sum(s => s.ueberfaellig.length) > 0) + '</div>' +
    '<div class="card"><div class="tools"><input id="q" class="grow" type="search" placeholder="Suchen in Projekten und Aufgaben" aria-label="Suche" value="' + esc(F.q) + '">' +
    '<select id="raum" aria-label="Raum"><option value="">Alle Räume</option>' + opt(RAEUME, F.raum) + '</select>' +
    '<select id="zust" aria-label="Zuständigkeit"><option value="">Alle Zuständigen</option>' + personen.map(m => '<option value="' + esc(m.mitglied_id) + '"' + (F.zust === m.mitglied_id ? ' selected' : '') + '>' + esc(m.name) + (m.typ === 'agent' ? ' 🤖' : '') + '</option>').join('') + (D.agenten || []).map(a => '<option value="' + esc(a.agent_id) + '"' + (F.zust === a.agent_id ? ' selected' : '') + '>Agent: ' + esc(a.name) + '</option>').join('') + '</select>' +
    '<select id="status" aria-label="Status"><option value="aktiv"' + (F.status === 'aktiv' ? ' selected' : '') + '>Nicht abgeschlossen</option>' + opt(['alle', 'geplant', 'pausiert', 'abgeschlossen', 'freigaben', 'fehler', 'ausstehend'], F.status, v => ({ alle: 'Alle', geplant: 'Geplant', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen', freigaben: 'Mit offenen Freigaben', fehler: 'Mit Fehlern / veraltet', ausstehend: 'Mit Ergebnissen ohne Abnahme' }[v])) + '</select>' +
    '<select id="zeitraum" aria-label="Zeitraum"><option value="alle">Jede Aktivität</option>' + opt(['7', '30', '90'], F.zeitraum, v => 'Aktiv in den letzten ' + v + ' Tagen') + '</select>' +
    '<div class="seg" role="group" aria-label="Ansicht"><button data-ansicht="liste" class="' + (F.ansicht === 'liste' ? 'on' : '') + '">Liste</button><button data-ansicht="kanban" class="' + (F.ansicht === 'kanban' ? 'on' : '') + '">Kanban</button></div></div>' +
    (F.raum ? '<p class="small">Raum <b>' + esc(F.raum) + '</b> · <a href="#/tab/projekte" id="raumWeg">Filter aufheben</a></p>' : '') +
    (L.length ? (F.ansicht === 'kanban' ? kanban(D, L, staende) : '<div class="grid">' + L.map(p => projektKarte(D, p, staende.get(p.projekt_id))).join('') + '</div>') : leer(alle.length ? 'Kein Projekt passt zu diesen Filtern.' : 'Noch keine Projekte. Projekte werden im Team-Portal angelegt.')) + '</div>';
  bindFilter(ctx, ['q', 'raum', 'zust', 'status', 'zeitraum']);
  const w = $('#raumWeg'); if (w) w.onclick = () => { F.raum = ''; saveF(); };
  const n = $('#neuAuftrag'); if (n) n.onclick = () => auftragDialog(ctx, {});
}
function kanban(D, L, staende) {
  const cols = [['geplant', 'Geplant'], ['aktiv', 'Aktiv'], ['pausiert', 'Pausiert'], ['abgeschlossen', 'Abgeschlossen']];
  return '<div class="board">' + cols.map(([k, l]) => { const P = L.filter(p => (p.status || 'aktiv') === k); return '<div class="col"><h3>' + l + '<span>' + P.length + '</span></h3>' + (P.map(p => { const st = staende.get(p.projekt_id); return '<a class="bcard" href="#/projekt/' + esc(p.projekt_id) + '"><div class="t">' + esc(p.name) + '</div><div class="meta">' + (st.prio ? chip('P' + st.prio, 'p' + st.prio) : '') + '<span>' + st.offen.length + ' offen</span>' + (st.aktiveRuns.length ? chip(st.aktiveRuns.length + ' Agent', 'ki') : '') + (st.freigabenOffen.length ? chip(st.freigabenOffen.length + ' Freigabe', 'fs-offen') : '') + (st.fehler.length ? chip(st.fehler.length + ' Fehler', 'rs-fehlgeschlagen') : '') + '</div></a>'; }).join('') || '<p class="empty small">–</p>') + '</div>'; }).join('') + '</div>';
}
function projektKarte(D, p, st) {
  const raum = raumVon(D, p);
  return '<div class="card proj" style="border-top-color:' + esc(p.farbe || '#8E8BAA') + '" tabindex="0" data-projekt="' + esc(p.projekt_id) + '">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h2 style="margin:0"><a href="#/projekt/' + esc(p.projekt_id) + '" style="color:inherit;text-decoration:none">' + esc(p.name) + '</a></h2>' + av(D, p.verantwortlich) + '</div>' +
    '<div class="meta">' + chip(p.status || 'aktiv') + (raum ? '<a href="#/raum/' + esc(raum) + '" class="chip" style="text-decoration:none">' + esc(raum) + '</a>' : chip('ohne Raum')) + (st.prio ? chip('höchste Prio P' + st.prio, 'p' + st.prio) : '') + (st.meilensteine[0] ? '<span class="' + (ueberfaellig(st.meilensteine[0]) ? 'late' : '') + '">nächste Frist ' + fmtD(st.meilensteine[0].deadline) + '</span>' : '') + '</div>' +
    (st.naechster ? '<div class="small"><b>Nächster Schritt:</b> ' + aufgabeLink(st.naechster) + '</div>' : '') +
    fortschritt(st) +
    '<div class="pstats"><div><b>' + st.offen.length + '</b><span>offen</span></div><div><b>' + st.meilensteine.length + '</b><span>mit Frist</span></div><div><b>' + st.blockaden.length + '</b><span>Blockaden</span></div><div><b>' + st.aktiveRuns.length + '</b><span>Agent läuft</span></div><div><b>' + st.freigabenOffen.length + '</b><span>Freigaben</span></div><div><b>' + st.fehler.length + '</b><span>Fehler</span></div><div><b>' + st.ausstehend.length + '</b><span>ohne Abnahme</span></div></div>' +
    '<div class="meta">' + st.menschen.map(id => '<span class="chip">' + esc(mitglied(D, id).name) + '</span>').join('') + st.agenten.map(a => '<a href="#/agent/' + esc(a.agent_id) + '" class="chip ki" style="text-decoration:none">🤖 ' + esc(a.name) + '</a>').join('') + st.workflows.map(w => chip('n8n: ' + w.name + (w.version ? ' ' + w.version : ''))).join('') + '</div>' +
    '<div class="small muted">Letzte Aktivität: ' + (st.letzte ? esc(relativ(st.letzte.zeit)) + ' · ' + esc(st.letzte.quelle) + ': ' + esc(kurz(st.letzte.text, 70)) : 'keine belegt') + '</div></div>';
}

// ---------- Projekt-Detail ----------
export function vProjekt(ctx, id) {
  const D = ctx.D; const p = projektById(D, id);
  if (!p) { $('#main').innerHTML = '<p class="small"><a href="#/tab/projekte">← Projekte</a></p><div class="card">' + leer('Dieses Projekt gibt es nicht oder du siehst es nicht.') + '</div>'; return; }
  const st = projektStand(D, p);
  const gruppen = ['In Arbeit', 'Wartet', 'Wird getestet', 'Geplant', 'Offen', 'Erledigt'];
  const runIds = new Set(st.runs.map(r => r.run_id));
  const artefakte = (D.artefakte || []).filter(a => runIds.has(a.run_id)).sort((a, b) => String(b.erstellt).localeCompare(String(a.erstellt)));
  const notizen = (D.notizen || []).filter(n => n.projekt === p.name);
  const entscheidungen = [
    ...notizen.filter(n => /^entscheidung/i.test(n.titel)).map(n => ({ zeit: n.geaendert, text: n.titel, quelle: 'Notiz', link: PORTAL + '#/notiz/' + n.notiz_id })),
    ...(D.freigaben || []).filter(f => runIds.has(f.run_id) && ['erteilt', 'abgelehnt', 'verwendet'].includes(f.status)).map(f => ({ zeit: f.entschieden_am, text: 'Freigabe ' + (f.status === 'verwendet' ? 'erteilt und verwendet' : f.status) + ': ' + ((D.externe_aktionen || {})[f.aktion] || {}).text + (f.begruendung ? ' – ' + f.begruendung : ''), quelle: 'Freigabe von ' + mitglied(D, f.entschieden_von).name, link: '#/run/' + f.run_id })),
    ...(D.ereignisse || []).filter(e => runIds.has(e.run_id) && ['abnahme', 'entscheidung'].includes(e.art)).map(e => ({ zeit: e.zeit, text: e.titel, quelle: 'Run-Ereignis', link: '#/run/' + e.run_id }))
  ].sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
  const zusammenfassungen = st.runs.filter(r => r.zusammenfassung).sort((a, b) => String(b.zusammenfassung_zeit).localeCompare(String(a.zusammenfassung_zeit)));
  $('#main').innerHTML = '<p class="small"><a href="#/tab/projekte">← Projekte</a></p>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>' + esc(p.name) + '</h1><p class="sub">' + esc(p.beschreibung || '') + '</p><div class="meta">' + chip(p.status || 'aktiv') + (raumVon(D, p) ? chip(raumVon(D, p)) : '') + '<span>Verantwortlich: ' + name(D, p.verantwortlich) + '</span><a href="' + PORTAL + '#/projekt/' + esc(p.projekt_id) + '">Im Team-Portal bearbeiten ↗</a></div></div>' + (istMensch(D) ? '<button class="btn" id="neuAuftrag">+ Auftrag an Agent</button>' : '') + '</div>' +
    '<div class="kpis" style="margin-top:12px">' + kpi(st.offen.length, 'offene Aufgaben') + kpi(st.ueberfaellig.length, 'überfällig', st.ueberfaellig.length > 0) + kpi(st.aktiveRuns.length, 'Agentenläufe aktiv') + kpi(st.freigabenOffen.length, 'offene Freigaben', st.freigabenOffen.length > 0, '#/tab/freigaben') + kpi(st.fehler.length, 'fehlgeschlagen / veraltet', st.fehler.length > 0) + kpi(st.ausstehend.length, 'Ergebnisse ohne Abnahme') + '</div>' +
    '<div class="card">' + fortschritt(st) + '</div>' +
    '<div class="grid"><div>' +
    '<div class="card"><h2>Aufgaben</h2>' + (st.aufgaben.length ? gruppen.map(g => { const A = st.aufgaben.filter(a => a.status === g); return A.length ? '<h3 style="margin-top:10px">' + esc(g) + ' (' + A.length + ')</h3>' + A.map(a => taskRow(D, a)).join('') : ''; }).join('') : leer('Keine Aufgaben. Aufgaben werden im Team-Portal angelegt.')) + '</div>' +
    '<div class="card"><h2>Agentenläufe</h2><p class="small muted" style="margin:-6px 0 8px">Teilaufträge eines Teams stehen eingerückt unter ihrem Eltern-Run und werden nur einmal gezählt.</p>' + (st.runs.length ? runBaum(D, st.runs.slice().sort((a, b) => String(letzteAktivitaetRun(D, b)).localeCompare(String(letzteAktivitaetRun(D, a))))) : leer('Noch kein Agent hat in diesem Projekt gearbeitet.')) + '</div>' +
    '<div class="card"><h2>KI-Zusammenfassungen</h2><p class="small muted">Jede Zusammenfassung stammt von einem Run und verweist auf die Ereignisse, aus denen sie entstand.</p>' + (zusammenfassungen.length ? zusammenfassungen.map(r => '<div style="border-top:1px solid var(--line);padding:10px 0"><div class="md small">' + md(r.zusammenfassung) + '</div><div class="quelle">Stand ' + esc(fmtDT(r.zusammenfassung_zeit)) + ' · von ' + name(D, (r.zusammenfassung_quelle || {}).von || r.agent_id) + ' · <a href="#/run/' + esc(r.run_id) + '">Run und ' + esc(((r.zusammenfassung_quelle || {}).ereignisse || []).length) + ' zugrunde liegende Ereignisse</a> · technisch ' + esc((D.status_text || {})[r.status] || r.status) + (r.abgenommen === true ? ', fachlich abgenommen' : r.abgenommen === false ? ', zurückgewiesen' : ', <b>fachlich noch nicht geprüft</b>') + '</div></div>').join('') : leer('Keine Zusammenfassungen vorhanden.')) + '</div></div>' +
    '<div><div class="card"><h2>Aktivitäten</h2>' + (st.aktivitaeten.length ? '<ul class="zl">' + st.aktivitaeten.slice(0, 30).map(x => '<li><div class="zt">' + esc(fmtDT(x.zeit)) + ' · ' + esc(x.quelle) + (x.autor ? ' · ' + name(D, x.autor) : '') + '</div>' + (x.run_id ? '<a href="#/run/' + esc(x.run_id) + '">' + esc(kurz(x.text, 160)) + '</a>' : x.aufgabe_id ? '<a href="' + PORTAL + '#/aufgabe/' + esc(x.aufgabe_id) + '">' + esc(kurz(x.text, 160)) + '</a>' : esc(kurz(x.text, 160))) + '</li>').join('') + '</ul>' : leer('Keine belegte Aktivität.')) + '</div>' +
    '<div class="card"><h2>Ergebnisse</h2>' + (artefakte.length ? artefakte.map(a => artefaktZeile(D, a)).join('') : leer('Noch keine Ergebnisse von Agenten.')) + '</div>' +
    '<div class="card"><h2>Dokumente</h2>' + (notizen.length || (p.links || []).length ? (p.links || []).map(l => '<div class="small">↗ <a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.titel || l.url) + '</a></div>').join('') + notizen.map(n => '<div class="small">📝 <a href="' + PORTAL + '#/notiz/' + esc(n.notiz_id) + '">' + esc(n.titel) + '</a> <span class="muted">· ' + esc(fmtD(String(n.geaendert || '').slice(0, 10))) + '</span></div>').join('') : leer('Keine Notizen oder Links zu diesem Projekt.')) + '</div>' +
    '<div class="card"><h2>Entscheidungen</h2>' + (entscheidungen.length ? entscheidungen.map(e => '<div class="small" style="border-top:1px solid var(--line);padding:6px 0"><a href="' + esc(e.link) + '">' + esc(kurz(e.text, 140)) + '</a><div class="quelle">' + esc(fmtDT(e.zeit)) + ' · ' + esc(e.quelle) + '</div></div>').join('') : leer('Keine dokumentierten Entscheidungen. Notizen mit dem Titel „Entscheidung: …“ erscheinen hier.')) + '</div></div></div>';
  const n = $('#neuAuftrag'); if (n) n.onclick = () => auftragDialog(ctx, { projekt: p.name });
}
const artefaktZeile = (D, a) => '<div class="small" style="border-top:1px solid var(--line);padding:8px 0"><b>' + esc(a.titel) + '</b> ' + chip(a.art) + (a.zusammenfassung ? '<div>' + esc(a.zusammenfassung) + '</div>' : '') + '<div class="quelle">' + esc(fmtDT(a.erstellt)) + ' · <a href="#/run/' + esc(a.run_id) + '">Run</a>' + (a.aufgabe_id ? ' · <a href="' + PORTAL + '#/aufgabe/' + esc(a.aufgabe_id) + '">Aufgabe</a>' : '') + (a.ablageort ? ' · Ablage: ' + (/^https?:\/\//i.test(a.ablageort) ? '<a href="' + esc(a.ablageort) + '" target="_blank" rel="noopener">' + esc(kurz(a.ablageort, 60)) + '</a>' : esc(a.ablageort)) : '') + (a.inhalt_hash ? ' · Hash <span class="hash">' + esc(a.inhalt_hash.slice(0, 12)) + '…</span>' : '') + '</div></div>';

// ---------- Agenten ----------
export function vAgenten(ctx) {
  const D = ctx.D; const A = (D.agenten || []).slice();
  const zust = new Map(A.map(a => [a.agent_id, agentZustand(D, a)]));
  const alleRuns = D.runs || [];
  $('#main').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1>KI Office: Agenten</h1><p class="sub">Wer welche Rolle hat, mit welchem Modell und welchen Werkzeugen, und was tatsächlich ausgeführt wurde. <a href="#/tab/buero">Ins virtuelle Büro →</a></p></div>' + (istMensch(D) ? '<button class="btn" id="neuAuftrag">+ Auftrag an Agent</button>' : '') + '</div>' +
    '<div class="kpis">' + kpi(A.filter(a => a.aktiv !== false).length, 'aktive Agenten') + kpi(alleRuns.filter(r => AKTIVE_RUN_STATUS.includes(r.status)).length, 'laufende Aufträge') + kpi(alleRuns.filter(r => r.status === 'abgeschlossen').length, 'technisch abgeschlossen') + kpi(alleRuns.filter(r => r.abgenommen === true).length, 'fachlich abgenommen') + kpi(alleRuns.filter(r => PROBLEM_RUN_STATUS.includes(r.status)).length, 'fehlgeschlagen / veraltet', alleRuns.some(r => PROBLEM_RUN_STATUS.includes(r.status))) + '</div>' +
    (A.length ? RAEUME.map(raum => { const R = A.filter(a => a.raum === raum); return R.length ? '<h2 style="margin-top:18px"><a href="#/raum/' + esc(raum) + '" style="color:inherit;text-decoration:none">' + esc(raum) + '</a></h2><div class="grid">' + R.map(a => agentKarte(D, a, zust.get(a.agent_id))).join('') + '</div>' : ''; }).join('') : '<div class="card">' + leer('Noch keine Agenten in der Registry. Timo legt sie über die Office-API (agent_speichern) oder supabase/team_office.sql an.') + '</div>') +
    '<div class="card" style="margin-top:18px"><h2>Nur dokumentiert: Chat-Assistent im Kurs</h2><p class="small muted">Der Setup-Assistent der Kursseite läuft mit <b>gpt-5-mini</b> im n8n-Workflow TJ5E1KT5MvzxvoD9 und ist kein Teil des KI Office. Er wird nicht geändert, nur hier aufgeführt, damit alle KI-Anwendungen an einer Stelle stehen.</p></div>' +
    '<p class="small muted">Gespeichert werden nur Schritte, Werkzeugaufrufe, Quellen-Referenzen, Ergebnisse und Statuswechsel. Prompts, Zwischenüberlegungen oder Gedankengänge werden weder gespeichert noch angezeigt.</p>';
  const n = $('#neuAuftrag'); if (n) n.onclick = () => auftragDialog(ctx, {});
}
function agentKarte(D, a, z) {
  const reg = a;
  return '<div class="member" style="flex-direction:column"><div style="display:flex;gap:12px;align-items:flex-start;width:100%"><span class="av ki" style="width:40px;height:40px;font-size:20px">🤖</span><div style="min-width:0;flex:1"><b><a href="#/agent/' + esc(a.agent_id) + '" style="color:inherit;text-decoration:none">' + esc(a.name) + '</a></b> ' + (a.aktiv === false ? chip('deaktiviert') : '<span class="chip" style="background:' + esc(ZUSTAND_FARBE[z.zustand]) + '22;color:' + esc(ZUSTAND_FARBE[z.zustand]) + '">● ' + esc(ZUSTAND_TEXT[z.zustand]) + '</span>') + '<div class="small muted">' + esc(reg.rolle || reg.beschreibung || '') + '</div></div></div>' +
    '<dl class="kv" style="width:100%"><dt>Modell</dt><dd><b>' + esc(a.modell) + '</b>' + (a.modell_grund ? ' <span class="muted">· ' + esc(a.modell_grund) + '</span>' : '') + '</dd><dt>Ausführung</dt><dd>' + esc(a.ausfuehrer) + (a.workflow_version ? ' (Workflow ' + esc(a.workflow_version) + ')' : '') + ' · Konfig v' + esc(a.konfig_version || '1') + ' · über ' + name(D, a.mitglied_id) + '</dd>' +
    '<dt>Fähigkeiten</dt><dd>' + ((a.faehigkeiten || []).map(f => chip(f)).join(' ') || '–') + '</dd><dt>Werkzeuge</dt><dd>' + ((a.erlaubte_tools || []).map(t => chip(t)).join(' ') || chip('keine')) + '</dd>' +
    '<dt>Projekte</dt><dd>' + ((a.projekte || []).map(p => { const pr = projektVon(D, p); return pr ? '<a href="#/projekt/' + esc(pr.projekt_id) + '" class="chip" style="text-decoration:none">' + esc(p) + '</a>' : chip(p, '', 'Projekt für dich nicht sichtbar'); }).join(' ') || '–') + '</dd>' +
    '<dt>Ausführungen</dt><dd>' + z.runs.length + ' gesamt · ' + (z.zaehler.abgeschlossen || 0) + ' abgeschlossen · ' + ((z.zaehler.fehlgeschlagen || 0) + (z.zaehler.unbekannt || 0)) + ' fehlgeschlagen/veraltet · zuletzt ' + esc(z.letzter ? relativ(letzteAktivitaetRun(D, z.letzter)) : 'nie') + '</dd>' +
    (istOrchestrierer(a) ? '<dt>Delegiert</dt><dd>' + chip('delegiert: ' + delegierteVon(D, a.agent_id).length + ' Teilaufträge', 'team') + ' <span class="quelle">Kind-Runs, die aus seinen Runs heraus an andere Agenten gingen; sitzt im Büro in der Zentrale</span></dd>' : '') + '</dl>' +
    '<div class="act"><a class="btn sec" style="padding:6px 10px" href="#/agent/' + esc(a.agent_id) + '">Ausführungen ansehen</a></div></div>';
}
export function vAgent(ctx, id) {
  const D = ctx.D; const a = agentReg(D, id);
  if (!a) { $('#main').innerHTML = '<p class="small"><a href="#/tab/agenten">← Agenten</a></p><div class="card">' + leer('Diesen Agenten gibt es nicht.') + '</div>'; return; }
  const z = agentZustand(D, a);
  const R = z.runs.filter(r => !F.runStatus || r.status === F.runStatus).sort((x, y) => String(letzteAktivitaetRun(D, y)).localeCompare(String(letzteAktivitaetRun(D, x))));
  $('#main').innerHTML = '<p class="small"><a href="#/tab/agenten">← Agenten</a> · <a href="#/tab/buero">Büro</a></p>' +
    '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="av ki" style="width:56px;height:56px;font-size:28px">🤖</span><div style="flex:1;min-width:200px"><h1 style="margin:0">' + esc(a.name) + ' <span class="chip ki" style="vertical-align:middle">KI-Agent</span></h1><p class="sub" style="margin:2px 0 0">' + esc(a.rolle || '') + ' · Raum ' + esc(a.raum) + ' · Zustand: ' + esc(ZUSTAND_TEXT[z.zustand]) + '</p></div><div style="display:flex;gap:6px;flex-wrap:wrap">' + (a.mitglied_id ? '<a class="btn sec" href="' + PORTAL + '#/agent/' + esc(a.mitglied_id) + '">Akte im Portal ↗</a>' : '') + (istMensch(D) && a.aktiv !== false ? '<button class="btn" id="neuAuftrag">+ Auftrag für ' + esc(a.name) + '</button>' : '') + '</div></div>' +
    '<div class="grid">' + agentKarte(D, a, z) + '<div class="card" style="margin:0"><h2>Zusammenfassung der Arbeit</h2>' + (z.runs.length ? '<dl class="kv"><dt>Ausführungen</dt><dd>' + z.runs.length + '</dd><dt>Technisch abgeschlossen</dt><dd>' + (z.zaehler.abgeschlossen || 0) + '</dd><dt>Fachlich abgenommen</dt><dd>' + z.runs.filter(r => r.abgenommen === true).length + ' <span class="quelle">(Entscheidung von Menschen)</span></dd><dt>Fehlgeschlagen</dt><dd>' + (z.zaehler.fehlgeschlagen || 0) + '</dd><dt>Unbekannt / veraltet</dt><dd>' + (z.zaehler.unbekannt || 0) + '</dd><dt>Abgebrochen</dt><dd>' + (z.zaehler.abgebrochen || 0) + '</dd><dt>Verbrauch</dt><dd>' + esc(verbrauchSumme(z.runs)) + '</dd></dl>' : leer('Noch keine Ausführungen.')) + '</div></div>' +
    '<div class="card" style="margin-top:14px"><div class="tools"><h2 style="margin:0;flex:1">Ausführungen</h2><select id="runStatus" aria-label="Status filtern"><option value="">Alle Zustände</option>' + opt(Object.keys(D.status_text || {}), F.runStatus, v => D.status_text[v]) + '</select></div>' + (R.length ? runBaum(D, R.concat(istOrchestrierer(a) ? delegierteVon(D, a.agent_id).filter(k => !F.runStatus || k.status === F.runStatus) : [])) : leer(z.runs.length ? 'Keine Ausführung in diesem Zustand.' : 'Noch keine Ausführungen für ' + a.name + '.')) + '</div>';
  bindFilter(ctx, ['runStatus']);
  const n = $('#neuAuftrag'); if (n) n.onclick = () => auftragDialog(ctx, { agent_id: a.agent_id });
}
function verbrauchSumme(runs) {
  const mess = runs.filter(r => r.verbrauch && r.verbrauch.messbar === true);
  if (!mess.length) return 'unbekannt (kein Run hat Verbrauch gemeldet)';
  const ein = mess.reduce((s, r) => s + (Number(r.verbrauch.tokens_ein) || 0), 0), aus = mess.reduce((s, r) => s + (Number(r.verbrauch.tokens_aus) || 0), 0);
  const kosten = mess.filter(r => r.verbrauch.kosten_eur != null);
  return ein.toLocaleString('de-DE') + ' Token ein, ' + aus.toLocaleString('de-DE') + ' Token aus bei ' + mess.length + ' von ' + runs.length + ' Runs' + (kosten.length ? ' · ' + kosten.reduce((s, r) => s + Number(r.verbrauch.kosten_eur), 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 }) + (kosten.every(r => r.verbrauch.kosten_art === 'gemessen') ? ' gemessen' : ' teilweise geschätzt') : ' · Kosten unbekannt') + (mess.length < runs.length ? ' · Rest unbekannt' : '');
}

// ---------- Run ----------
const EREIGNIS_ICON = { schritt: '•', tool: '🔧', quelle: '📎', fehler: '⚠️', wiederholung: '↻', hinweis: 'ℹ️', status: '→', rueckfrage: '❓', antwort: '💬', freigabe: '✅', artefakt: '📄', abnahme: '🏁', entscheidung: '⚖️' };
export function vRun(ctx, id) {
  const D = ctx.D; const r = runVon(D, id);
  if (!r) { $('#main').innerHTML = '<p class="small"><a href="#/tab/agenten">← Agenten</a></p><div class="card">' + leer('Diesen Run gibt es nicht oder du siehst ihn nicht.') + '</div>'; return; }
  const reg = agentReg(D, r.agent_id); const E = ereignisseVon(D, r.run_id); const Art = artefakteVon(D, r.run_id); const Fr = freigabenVon(D, r.run_id);
  const p = projektVon(D, r.projekt); const a = (D.aufgaben || []).find(x => x.aufgabe_id === r.aufgabe_id);
  const mensch = istMensch(D), admin = D.ich.rolle === 'admin', dozent = admin || D.ich.rolle === 'dozent';
  const darfSteuern = mensch && (dozent || r.auftraggeber === D.ich.mitglied_id);
  const wartetAufStartFreigabe = r.status === 'wartet_freigabe' && Fr.some(f => istStartFreigabe(f) && f.status === 'offen');
  const quelleIds = new Set(((r.zusammenfassung_quelle || {}).ereignisse || []).map(String));
  // Orchestrierung: Eltern-Run als Breadcrumb, Kind-Runs als eingerückte Zweige (jeweils mit Status und Link)
  const eltern = elternVon(D, r); const K = kinderVon(D, r.run_id);
  const brotkrume = r.eltern_run_id ? ' · <span class="muted">Teil von</span> ' + (eltern ? '<a href="#/run/' + esc(eltern.run_id) + '" title="Zum Eltern-Run">↑ ' + esc(kurz(eltern.auftrag, 60)) + '</a>' : '<span class="hash">' + esc(r.eltern_run_id) + '</span> <span class="muted">(für dich nicht sichtbar)</span>') : '';
  const zweige = (run, tiefe) => { const kinder = kinderVon(D, run.run_id); return kinder.length ? '<ul class="zweige">' + kinder.map(k => { const kr = agentReg(D, k.agent_id); return '<li><a href="#/run/' + esc(k.run_id) + '">' + esc(kurz(k.auftrag, 80)) + '</a> ' + stChip(D, k.status) + chip(kr ? kr.name : k.agent_id, 'ki') + '<span class="quelle"> · ' + esc(k.projekt) + ' · ' + esc(relativ(letzteAktivitaetRun(D, k))) + (k.abgenommen === true ? ' · fachlich abgenommen' : '') + '</span>' + (tiefe < 3 ? zweige(k, tiefe + 1) : '') + '</li>'; }).join('') + '</ul>' : ''; };
  const offeneKinder = K.filter(k => AKTIVE_RUN_STATUS.includes(k.status)).length;
  $('#main').innerHTML = '<p class="small"><a href="#/agent/' + esc(r.agent_id) + '">← ' + esc(reg ? reg.name : r.agent_id) + '</a>' + (p ? ' · <a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>' : '') + brotkrume + '</p>' +
    '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px"><h1 style="font-size:22px">' + esc(r.auftrag) + '</h1><div class="meta">' + stChip(D, r.status) + (r.abgenommen === true ? chip('fachlich abgenommen', 'fs-erteilt') : r.abgenommen === false ? chip('fachlich zurückgewiesen', 'fs-abgelehnt') : r.status === 'abgeschlossen' ? chip('fachliche Abnahme offen', 'fs-offen') : '') + chip('Versuch ' + (r.versuche || 1) + ' von ' + (r.max_versuche || '?')) + (K.length ? chip('Team: ' + K.length + ' Teilaufträge' + (offeneKinder ? ', ' + offeneKinder + ' offen' : ''), 'team') : '') + (r.eltern_run_id ? chip('Teilauftrag', 'team') : '') + (r.team_id ? chip('Team ' + kurz(r.team_id, 24), 'team', 'team_id: ' + r.team_id) : '') + '<span class="hash">' + esc(r.run_id) + '</span></div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap" id="runAktionen"></div></div>' +
    (r.status === 'unbekannt' ? '<div class="note warn" style="margin:10px 0">Dieser Run gilt als <b>unbekannt / veraltet</b>: ' + esc(r.grund || 'Timeout.') + ' Eine später eintreffende Rückmeldung wird protokolliert, macht den Run aber nicht nachträglich erfolgreich.</div>' : '') +
    (wartetAufStartFreigabe ? (admin ? '<div class="note warn" id="startHinweis" style="margin:10px 0"><b>Wartet auf deine Freigabe.</b> ' + name(D, r.auftraggeber) + ' hat diesen Auftrag angelegt. Er startet erst, wenn du ihn freigibst. Die Entscheidung triffst du unten bei „Freigaben“.</div>' : '<div class="note warn" id="startHinweis" style="margin:10px 0"><b>Wartet auf Timo.</b> Dein Auftrag ist angelegt, der Agent startet aber erst, wenn Timo ihn freigibt. Du musst nichts tun.</div>') : '') +
    (r.status === 'fehlgeschlagen' ? '<div class="note warn" style="margin:10px 0"><b>Fehler:</b> ' + esc(r.fehler || 'ohne Beschreibung') + '</div>' : '') +
    '<div class="grid" style="margin-top:12px"><div class="card" style="margin:0"><h2>Auftrag</h2><dl class="kv"><dt>Projekt</dt><dd>' + (p ? '<a href="#/projekt/' + esc(p.projekt_id) + '">' + esc(p.name) + '</a>' : esc(r.projekt)) + '</dd><dt>Aufgabe</dt><dd>' + (a ? aufgabeLink(a) + ' ' + chip(a.status, 'st-' + String(a.status).replace(/\s/g, '-')) : r.aufgabe_id ? esc(r.aufgabe_id) : '–') + '</dd><dt>Auftraggeber</dt><dd>' + name(D, r.auftraggeber) + '</dd><dt>Agent</dt><dd><a href="#/agent/' + esc(r.agent_id) + '">' + esc(reg ? reg.name : r.agent_id) + '</a>' + (reg ? ' · ' + esc(reg.modell) : '') + '</dd><dt>Ausführer</dt><dd>' + esc(r.ausfuehrer || '–') + (r.workflow_version ? ' · Workflow ' + esc(r.workflow_version) : '') + (r.konfig_version ? ' · Konfig v' + esc(r.konfig_version) : '') + (r.n8n_execution_id ? ' · n8n-Ausführung ' + esc(r.n8n_execution_id) : '') + '</dd><dt>Angelegt</dt><dd>' + esc(fmtDT(r.erstellt)) + '</dd><dt>Gestartet</dt><dd>' + esc(fmtDT(r.gestartet)) + '</dd><dt>Letztes Lebenszeichen</dt><dd>' + esc(fmtDT(r.lebenszeichen)) + ' <span class="quelle">(Timeout ' + Math.round((Number(r.timeout_sek) || 0) / 60) + ' Min.)</span></dd><dt>Beendet</dt><dd>' + esc(fmtDT(r.beendet)) + '</dd><dt>Verbrauch</dt><dd>' + esc(verbrauchText(r.verbrauch)) + '</dd>' + (r.eingabe ? '<dt>Eingabe</dt><dd><details><summary class="small">anzeigen</summary><pre class="small" style="white-space:pre-wrap">' + esc(JSON.stringify(r.eingabe, null, 1)) + '</pre></details></dd>' : '') + '</dl></div>' +
    '<div class="card" style="margin:0"><h2>Zusammenfassung der Arbeit</h2>' + (r.zusammenfassung ? '<div class="md">' + md(r.zusammenfassung) + '</div><p class="quelle">Stand ' + esc(fmtDT(r.zusammenfassung_zeit)) + ' · von ' + name(D, (r.zusammenfassung_quelle || {}).von || r.agent_id) + ' · beruht auf ' + quelleIds.size + ' Ereignissen (in der Zeitleiste markiert).</p>' : leer('Noch keine Zusammenfassung. Sie entsteht erst, wenn der Agent den Run beendet.')) +
    (r.abgenommen != null ? '<div class="note" style="margin-top:8px"><b>Fachliche Prüfung:</b> ' + (r.abgenommen ? 'abgenommen' : 'zurückgewiesen') + ' von ' + name(D, r.abgenommen_von) + ' am ' + esc(fmtDT(r.abgenommen_am)) + (r.abnahme_kommentar ? ' – ' + esc(r.abnahme_kommentar) : '') + '</div>' : '') + '</div></div>' +
    '<div class="grid" style="margin-top:14px"><div class="card" style="margin:0"><h2>Zeitleiste</h2>' + (E.length ? '<ul class="zl">' + E.map(e => '<li class="e-' + esc(e.art) + '"' + (quelleIds.has(String(e.id)) ? ' title="Grundlage der Zusammenfassung"' : '') + '><div class="zt">' + esc(fmtDT(e.zeit)) + ' · ' + esc(e.art) + (e.autor ? ' · ' + name(D, e.autor) : '') + (quelleIds.has(String(e.id)) ? ' · ★' : '') + '</div>' + esc(EREIGNIS_ICON[e.art] || '•') + ' ' + esc(e.titel) + (e.tool ? ' ' + chip(e.tool) : '') + (e.quelle_ref ? ' <span class="small">· Quelle: ' + (/^https?:\/\//i.test(e.quelle_ref) ? '<a href="' + esc(e.quelle_ref) + '" target="_blank" rel="noopener">' + esc(kurz(e.quelle_ref, 60)) + '</a>' : esc(e.quelle_ref)) + '</span>' : '') + (e.details && Object.keys(e.details).length ? '<details><summary class="small muted">Details</summary><pre>' + esc(JSON.stringify(e.details, null, 1)) + '</pre></details>' : '') + '</li>').join('') + '</ul>' : leer('Noch keine Ereignisse.')) + '</div>' +
    '<div><div class="card" style="margin:0 0 14px"><h2>Freigaben</h2>' + (Fr.length ? Fr.map(f => freigabeKarte(D, f, r, mensch, true)).join('') : leer('Keine Freigaben angefordert.')) + '</div>' +
    '<div class="card" style="margin:0"><h2>Ergebnisse</h2>' + (Art.length ? Art.map(x => artefaktZeile(D, x)).join('') : leer('Keine Ergebnisse abgelegt.')) + '</div></div></div>' +
    (K.length || r.team_id ? '<div class="card teilauftraege" style="margin-top:14px"><h2>Teilaufträge (' + K.length + ')</h2><p class="small muted" style="margin:-6px 0 8px">' + (K.length ? 'Delegiert aus diesem Run an andere Agenten. Dieser Run gilt erst als technisch abgeschlossen, wenn alle Teilaufträge beendet sind' + (offeneKinder ? ' – ' + offeneKinder + ' laufen noch' : ' – alle beendet') + '. Jeder Teilauftrag zählt in seinem Projekt, nicht doppelt.' : 'Team ' + esc(r.team_id) + ': noch keine Teilaufträge delegiert.') + '</p>' + (zweige(r, 0) || "") + '</div>' : '') +
    '<p class="small muted" style="margin-top:14px">Rückverfolgbar: Ergebnis → Run ' + esc(r.run_id) + ' → ' + (a ? 'Aufgabe „' + esc(a.titel) + '“' : 'ohne Aufgabe') + ' → Projekt „' + esc(r.projekt) + '“' + (eltern ? ' → Teil von Run ' + esc(eltern.run_id) : '') + '. Gespeichert sind nur Schritte, Werkzeugaufrufe, Quellen und Ergebnisse, keine Gedankengänge.</p>';
  const akt = $('#runAktionen'); const btn = (t, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t; b.onclick = fn; akt.appendChild(b); };
  btn('🔗 Link kopieren', 'ghost', async () => { const url = location.origin + location.pathname + '#/run/' + r.run_id; try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch (e) { window.prompt('Link kopieren:', url); } });
  if (darfSteuern) {
    if (r.status === 'wartet_rueckmeldung') btn('Rückfrage beantworten', '', () => antwortDialog(ctx, r));
    if (['warteschlange', 'in_arbeit', 'wartet_rueckmeldung', 'wartet_freigabe', 'unbekannt'].includes(r.status)) btn(r.status === 'unbekannt' ? 'Veralteten Run schließen' : 'Abbrechen', 'danger', () => abbruchDialog(ctx, r));
    if (r.status === 'fehlgeschlagen' && (Number(r.versuche) || 1) < (Number(r.max_versuche) || 3)) btn('Erneut versuchen', 'sec', () => aktion(ctx, 'run_wiederholen', { run_id: r.run_id }, 'Wiederholung gestartet'));
    if (r.status === 'abgeschlossen' && r.abgenommen == null) { btn('Fachlich abnehmen', 'ok', () => abnahmeDialog(ctx, r, true)); btn('Zurückweisen', 'danger', () => abnahmeDialog(ctx, r, false)); }
  }
  $$('[data-freigabe]').forEach(b => b.onclick = () => freigabeDialog(ctx, b.dataset.freigabe, b.dataset.entscheidung));
}
/** Kurzblock zu einer Startfreigabe: Agent, Kostenstufe, Auftraggeber (und der Auftragstext, wenn gewünscht). */
function startDetails(D, f, r, mitText) {
  const reg = r ? agentReg(D, r.agent_id) : null;
  return '<dl class="kv" style="margin:6px 0"><dt>Agent</dt><dd>' + esc(reg ? reg.name : (r ? r.agent_id : '–')) + (reg ? ' · ' + esc(reg.modell) : '') + '</dd>' +
    '<dt>Kostenstufe</dt><dd>' + (reg ? chip(KOSTENSTUFE_ANZEIGE[reg.kostenstufe] || reg.kostenstufe, 'ks-' + esc(reg.kostenstufe)) + (reg.freigabe_noetig === true ? ' <span class="small muted">(in der Registry: immer Freigabe)</span>' : '') : '–') + '</dd>' +
    '<dt>Auftraggeber</dt><dd>' + name(D, f.angefordert_von) + '</dd><dt>Projekt</dt><dd>' + esc(r ? r.projekt : '–') + '</dd>' +
    (r && r.budget_eur != null ? '<dt>Kostenlimit</dt><dd>' + esc(Number(r.budget_eur).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })) + '</dd>' : '') + '</dl>' +
    (mitText ? '<div class="small" style="margin:4px 0;white-space:pre-wrap">' + esc((r && r.auftrag) || f.inhalt_vorschau || '') + '</div>' : '');
}
function freigabeKarte(D, f, r, mensch, imRun) {
  const start = istStartFreigabe(f);
  const ext = (D.externe_aktionen || {})[f.aktion] || { text: f.aktion, stufe: 'extern' };
  const darf = mensch && darfEntscheiden(D, f);
  const wartetAufTimo = mensch && start && f.status === 'offen' && !darf;
  return '<div style="border-top:1px solid var(--line);padding:10px 0"' + (start ? ' data-startfreigabe="' + esc(f.freigabe_id) + '"' : '') + '><div><b>' + esc(start ? 'Auftrag starten' : ext.text) + '</b> ' + fChip(f.status) + (ext.stufe === 'kritisch' ? chip('kritisch: nur Admin', 'p1') : '') + '</div>' +
    (start ? startDetails(D, f, r, true) : '<div class="small" style="margin:4px 0;white-space:pre-wrap">' + esc(f.inhalt_vorschau || '') + '</div>') +
    '<div class="quelle">Inhalts-Hash <span class="hash">' + esc(String(f.inhalt_hash || '').slice(0, 16)) + '…</span> · angefordert ' + esc(fmtDT(f.angefordert_am)) + ' von ' + name(D, f.angefordert_von) + (f.entschieden_am ? ' · entschieden ' + esc(fmtDT(f.entschieden_am)) + ' von ' + name(D, f.entschieden_von) + (f.begruendung ? ': ' + esc(f.begruendung) : '') : '') + (f.gueltig_bis && f.status === 'erteilt' ? ' · gültig bis ' + esc(fmtDT(f.gueltig_bis)) : '') + (f.verwendet_am ? ' · verwendet ' + esc(fmtDT(f.verwendet_am)) : '') + (!imRun ? ' · <a href="#/run/' + esc(f.run_id) + '">Run: ' + esc(kurz(r ? r.auftrag : f.run_id, 60)) + '</a>' : '') + '</div>' +
    '<p class="small muted" style="margin:4px 0">' + (start ? 'Die Freigabe gilt nur für genau diesen Agenten, dieses Projekt und diesen Auftragstext. Wird der Text danach geändert, startet nichts und es braucht eine neue Freigabe.' : 'Die Freigabe gilt nur für genau diesen Inhalt. Ändert der Agent den Inhalt, wird sie ungültig und muss neu angefordert werden.') + '</p>' +
    (darf ? '<div class="act" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ok" style="padding:6px 10px" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="erteilt">' + (start ? 'Start freigeben' : 'Freigeben') + '</button><button class="btn danger" style="padding:6px 10px" data-freigabe="' + esc(f.freigabe_id) + '" data-entscheidung="abgelehnt">Ablehnen</button></div>'
      : wartetAufTimo ? '<div class="small muted"><b>Wartet auf Timo.</b> Der Agent startet, sobald Timo den Auftrag freigibt.</div>'
      : (mensch && f.status === 'offen' ? '<div class="small muted">' + (f.angefordert_von === D.ich.mitglied_id ? 'Du hast diese Freigabe angefordert; entscheiden muss jemand anderes (Vier-Augen-Prinzip).' : 'Diese Freigabe darf nur Timo (Admin) erteilen.') + '</div>' : '')) + '</div>';
}

// ---------- Freigaben ----------
export function vFreigaben(ctx) {
  const D = ctx.D; const mensch = istMensch(D); const admin = D.ich.rolle === 'admin';
  const alle = (D.freigaben || []).slice().sort((a, b) => String(b.angefordert_am).localeCompare(String(a.angefordert_am)));
  const offen = alle.filter(f => f.status === 'offen'), rest = alle.filter(f => f.status !== 'offen');
  const starts = offen.filter(istStartFreigabe), extern = offen.filter(f => !istStartFreigabe(f));
  $('#main').innerHTML = '<h1>Freigaben</h1><p class="sub">Aufträge von Teammitgliedern an teure oder große Agenten starten erst nach Timos Freigabe. Externe Aktionen (E-Mail, Veröffentlichung, Zahlung, Löschung, Vertrag, Termine) laufen nur mit einer Freigabe, die an den exakten Inhalt gebunden ist. Agenten können keine Freigaben erteilen.</p>' +
    '<div class="card" id="startFreigaben"><h2>' + (admin ? 'Wartet auf deine Freigabe' : 'Aufträge, die auf Timo warten') + ' (' + starts.length + ')</h2>' + (starts.length ? starts.map(f => freigabeKarte(D, f, runVon(D, f.run_id), mensch, false)).join('') : leer(admin ? 'Kein Auftrag wartet auf deinen Start.' : 'Keiner deiner Aufträge wartet auf Timo.')) + '</div>' +
    '<div class="card"><h2>Externe Aktionen offen (' + extern.length + ')</h2>' + (extern.length ? extern.map(f => freigabeKarte(D, f, runVon(D, f.run_id), mensch, false)).join('') : leer('Keine offenen Freigaben. Gut so.')) + '</div>' +
    '<div class="card"><details' + (offen.length ? '' : ' open') + '><summary><b>Entschieden, verfallen oder ungültig (' + rest.length + ')</b></summary>' + (rest.length ? rest.slice(0, 50).map(f => freigabeKarte(D, f, runVon(D, f.run_id), mensch, false)).join('') : leer('Noch nichts.')) + '</details></div>';
  $$('[data-freigabe]').forEach(b => b.onclick = () => freigabeDialog(ctx, b.dataset.freigabe, b.dataset.entscheidung));
}

// ---------- Dialoge ----------
async function aktion(ctx, name, daten, ok) {
  try { await api(name, daten); toast(ok || 'Gespeichert'); await ctx.laden(true); }
  catch (e) { toast(e.message); throw e; }
}
function dialog(ctx, titel, html, onSubmit) {
  const box = $('#dlgInner'); box.innerHTML = '<h2 id="dlgTitel">' + esc(titel) + '</h2><form id="dlgForm">' + html + '<div class="dlgbtns"><button type="button" class="btn sec" id="dlgAbbr">Abbrechen</button><button class="btn" type="submit" id="dlgOk">Speichern</button></div></form>';
  const dlg = $('#dlg'); if (!dlg.open) dlg.showModal();
  $('#dlgAbbr').onclick = () => dlg.close();
  $('#dlgForm').onsubmit = async ev => { ev.preventDefault(); const b = $('#dlgOk'); b.disabled = true; try { await onSubmit(); dlg.close(); } catch (e) { b.disabled = false; } };
  return dlg;
}
export function auftragDialog(ctx, vor) {
  const D = ctx.D; const A = (D.agenten || []).filter(a => a.aktiv !== false);
  const key = neuerSchluessel('auftrag');
  const projekteFuer = agentId => { const a = A.find(x => x.agent_id === agentId); return (D.projekte || []).filter(p => p.status !== 'abgeschlossen' && (!a || (a.projekte || []).includes(p.name))); };
  let agentId = vor.agent_id || (vor.projekt ? (A.find(a => (a.projekte || []).includes(vor.projekt)) || A[0] || {}).agent_id : (A[0] || {}).agent_id);
  const render = () => {
    const P = projekteFuer(agentId); const projekt = $('#f_p') && P.some(p => p.name === $('#f_p').value) ? $('#f_p').value : (vor.projekt && P.some(p => p.name === vor.projekt) ? vor.projekt : (P[0] || {}).name);
    const T = (D.aufgaben || []).filter(a => a.projekt === projekt && a.status !== 'Erledigt');
    return '<div class="f"><label for="f_a">Agent</label><select id="f_a">' + A.map(a => '<option value="' + esc(a.agent_id) + '"' + (a.agent_id === agentId ? ' selected' : '') + '>' + esc(a.name) + ' (' + esc(a.raum) + ', ' + esc(a.modell) + ')</option>').join('') + '</select></div>' +
      '<div class="f"><label for="f_p">Projekt</label><select id="f_p">' + (P.length ? P.map(p => '<option value="' + esc(p.name) + '"' + (p.name === projekt ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') : '<option value="">Dieser Agent ist keinem Projekt zugeordnet</option>') + '</select></div>' +
      '<div class="f"><label for="f_t">Aufgabe (optional)</label><select id="f_t"><option value="">– ohne Aufgabe –</option>' + T.map(a => '<option value="' + esc(a.aufgabe_id) + '"' + (a.aufgabe_id === vor.aufgabe_id ? ' selected' : '') + '>' + esc(a.titel) + ' (' + esc(a.status) + ')</option>').join('') + '</select></div>' +
      '<div class="f"><label for="f_x">Auftrag</label><textarea id="f_x" required minlength="3" maxlength="2000" placeholder="Was soll der Agent tun? Keine Zugangsdaten, keine Kundendaten, die nicht nötig sind.">' + esc($('#f_x') ? $('#f_x').value : '') + '</textarea></div>' +
      '<div id="f_hint" class="note" aria-live="polite"></div>' +
      '<p class="small muted">Externe Aktionen (E-Mail, Veröffentlichung, Zahlung) braucht der Agent später eine Freigabe. Doppelte Klicks starten nichts doppelt (Idempotenzschlüssel <span class="hash">' + esc(key.slice(0, 18)) + '…</span>).</p>';
  };
  const dlg = dialog(ctx, 'Auftrag an einen Agenten', render(), async () => {
    const daten = { agent_id: $('#f_a').value, projekt: $('#f_p').value, aufgabe_id: $('#f_t').value || null, auftrag: $('#f_x').value, idempotenzschluessel: key };
    const r = await api('auftrag_starten', daten).catch(e => { toast(e.message); throw e; });
    toast(r.wiederholt ? 'Dieser Auftrag war schon angelegt.' : r.status === 'wartet_freigabe' ? 'Auftrag angelegt – er wartet auf Timos Freigabe' : 'Auftrag angelegt'); await ctx.laden(true); location.hash = '#/run/' + r.run_id;
  });
  const neu = () => { agentId = $('#f_a').value; $('#dlgForm').querySelectorAll('.f, p, #f_hint').forEach(e => e.remove()); $('#dlgForm').insertAdjacentHTML('afterbegin', render()); bind(); };
  // Vorab-Hinweis: startet der Auftrag sofort oder wartet er auf Timo? (Der Server entscheidet endgültig.)
  const hinweis = () => {
    const reg = A.find(x => x.agent_id === $('#f_a').value); const h = startHinweis(D, reg, $('#f_x') ? $('#f_x').value : '');
    $('#f_hint').className = 'note' + (h.sofort ? '' : ' warn');
    $('#f_hint').innerHTML = h.sofort ? '<b>Startet sofort</b> ' + (reg ? '(' + esc(reg.name) + ', Kostenstufe ' + esc(KOSTENSTUFE_ANZEIGE[reg.kostenstufe] || reg.kostenstufe || '–') + ').' : '') : '<b>Wartet auf Timo.</b> Dein Auftrag wird angelegt, der Agent startet erst nach Timos Freigabe. Grund: ' + h.gruende.map(esc).join(' ');
    $('#dlgOk').textContent = h.sofort ? 'Auftrag starten' : 'Zur Freigabe vorlegen';
  };
  const bind = () => { $('#f_a').onchange = neu; $('#f_p').onchange = neu; $('#f_x').oninput = hinweis; hinweis(); };
  bind();
  return dlg;
}
function antwortDialog(ctx, r) {
  const E = ereignisseVon(ctx.D, r.run_id).filter(e => e.art === 'rueckfrage'); const frage = E.length ? (E[E.length - 1].details || {}).frage || E[E.length - 1].titel : '';
  dialog(ctx, 'Rückfrage beantworten', '<div class="note" style="margin-bottom:10px"><b>Frage des Agenten:</b> ' + esc(frage) + '</div><div class="f"><label for="f_t">Deine Antwort</label><textarea id="f_t" required maxlength="2000"></textarea></div>', () => aktion(ctx, 'antwort', { run_id: r.run_id, text: $('#f_t').value }, 'Antwort übermittelt'));
}
function abbruchDialog(ctx, r) {
  dialog(ctx, r.status === 'unbekannt' ? 'Veralteten Run schließen' : 'Run abbrechen', '<p class="small">Der Run wird als „abgebrochen“ markiert. Ein laufender Ausführer wird informiert, soweit er erreichbar ist.</p><div class="f"><label for="f_g">Grund (optional)</label><input id="f_g" maxlength="600"></div>', () => aktion(ctx, 'run_abbrechen', { run_id: r.run_id, grund: $('#f_g').value }, 'Run abgebrochen'));
  $('#dlgOk').textContent = 'Abbrechen bestätigen';
}
function abnahmeDialog(ctx, r, ok) {
  dialog(ctx, ok ? 'Fachlich abnehmen' : 'Ergebnis zurückweisen', '<p class="small">' + (ok ? 'Du bestätigst, dass das Ergebnis fachlich passt. Das ist unabhängig vom technischen Status.' : 'Das Ergebnis passt fachlich nicht. Der Agent erfährt das über den Aufgabenverlauf.') + '</p><div class="f"><label for="f_k">Kommentar' + (ok ? ' (optional)' : '') + '</label><textarea id="f_k" ' + (ok ? '' : 'required ') + 'maxlength="1000"></textarea></div>', () => aktion(ctx, 'run_abnehmen', { run_id: r.run_id, abgenommen: ok, kommentar: $('#f_k').value }, ok ? 'Abgenommen' : 'Zurückgewiesen'));
  $('#dlgOk').textContent = ok ? 'Abnehmen' : 'Zurückweisen';
}
export function freigabeDialog(ctx, freigabe_id, entscheidung) {
  const D = ctx.D; const f = (D.freigaben || []).find(x => x.freigabe_id === freigabe_id); if (!f) return;
  const ext = (D.externe_aktionen || {})[f.aktion] || { text: f.aktion };
  const start = istStartFreigabe(f), erteilen = entscheidung === 'erteilt';
  const inhalt = start ? '<div class="note" style="margin-bottom:10px"><b>Auftrag starten</b>' + startDetails(D, f, runVon(D, f.run_id), true) + '<div class="quelle">Hash ' + esc(f.inhalt_hash) + '</div></div>'
    : '<div class="note" style="margin-bottom:10px"><b>' + esc(ext.text) + '</b><div style="white-space:pre-wrap;margin-top:4px">' + esc(f.inhalt_vorschau || '') + '</div><div class="quelle">Hash ' + esc(f.inhalt_hash) + '</div></div>';
  const hinweis = start ? (erteilen ? '<p class="small">Der Agent startet sofort. Die Freigabe gilt genau einmal und nur für diesen Auftragstext.</p>' : '<p class="small">Der Auftrag wird abgebrochen. ' + name(D, f.angefordert_von) + ' sieht deine Begründung.</p>') : (erteilen ? '<p class="small">Die Freigabe gilt 24 Stunden und genau einmal, nur für diesen Inhalt.</p>' : '');
  dialog(ctx, start ? (erteilen ? 'Start freigeben' : 'Start ablehnen') : (erteilen ? 'Freigabe erteilen' : 'Freigabe ablehnen'), inhalt + hinweis + '<div class="f"><label for="f_b">Begründung' + (erteilen ? ' (optional)' : '') + '</label><input id="f_b" maxlength="600" ' + (erteilen ? '' : 'required') + '></div>',
    () => aktion(ctx, 'freigabe_entscheiden', { freigabe_id, entscheidung, begruendung: $('#f_b').value }, start ? (erteilen ? 'Start freigegeben' : 'Start abgelehnt') : (erteilen ? 'Freigabe erteilt' : 'Freigabe abgelehnt')));
  $('#dlgOk').textContent = erteilen ? (start ? 'Start freigeben' : 'Freigeben') : 'Ablehnen';
}
