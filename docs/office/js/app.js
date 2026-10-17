// KI Office: Einstieg, Routing (Hash), Laden, Gerüst. Gleiche Navigation und derselbe Token wie das Team-Portal.
import { $, $$, esc, toast } from './util.js';
import { api, tokenLesen, tokenSetzen, TOKEN, PORTAL, ls } from './api.js';
import { vProjekte, vProjekt, vAgenten, vAgent, vRun, vFreigaben, av } from './ansichten.js';
import { vBuero, vMonitorwand } from './buero.js';

const TABS = [['projekte', 'Projekte'], ['agenten', 'KI Office'], ['buero', 'Virtuelles Büro'], ['freigaben', 'Freigaben']];
// Eingebettet im Team-Portal (iframe, gleiche Herkunft): ?einbetten=1 blendet Kopf/Fuß aus, ?nur=buero zeigt nur die Szene.
const PARAMS = new URLSearchParams(location.search);
const EINGEBETTET = PARAMS.get('einbetten') === '1';
const NUR = EINGEBETTET ? (PARAMS.get('nur') || '') : '';
if (EINGEBETTET) document.body.classList.add('eingebettet');
if (NUR === 'buero') document.body.classList.add('nur-buero');
let D = null;
let route = { tab: NUR === 'buero' ? 'buero' : (ls.get('ko-tab') || 'projekte') };
let letzterHash = null;

function leseHash() {
  const h = location.hash || '';
  let m;
  if ((m = /^#\/tab\/(\w+)$/.exec(h))) route = { tab: TABS.some(t => t[0] === m[1]) ? m[1] : 'projekte' };
  else if ((m = /^#\/projekt\/([\w-]+)$/.exec(h))) route = { tab: 'projekte', art: 'projekt', id: m[1] };
  else if ((m = /^#\/agent\/([\w-]+)$/.exec(h))) route = { tab: 'agenten', art: 'agent', id: m[1] };
  else if ((m = /^#\/run\/([\w-]+)$/.exec(h))) route = { tab: 'agenten', art: 'run', id: m[1] };
  else if ((m = /^#\/raum\/([^/]+)$/.exec(h))) route = { tab: 'projekte', art: 'raum', id: decodeURIComponent(m[1]) };
  else if ((m = /^#\/monitor\/([^/]+)$/.exec(h))) route = { tab: 'buero', art: 'monitor', id: decodeURIComponent(m[1]) };
  else if (h && h !== '#/' ) return; // unbekannt: letzte Route behalten
  if (!route.art && !EINGEBETTET) ls.set('ko-tab', route.tab);
}

const ctx = { get D() { return D; }, render, laden, get route() { return route; }, nur: NUR, eingebettet: EINGEBETTET };

function render() {
  if (!D) return;
  const i = D.ich;
  $('#app').innerHTML = '<header><div class="wrap"><div class="hrow"><a href="' + PORTAL + '" title="Zum Team-Portal"><img class="logo" src="../logo_h96.png" srcset="../logo_h48.png 1x, ../logo_h96.png 2x, ../logo_h144.png 3x" alt="Momentum KI Akademie"></a><span class="htitle">KI Office</span>' +
    '<div class="who">' + av(D, i.mitglied_id) + '<span><b>' + esc(i.name) + '</b> <span class="r">· ' + esc({ admin: 'Admin', dozent: 'Dozent / Technik', vertrieb: 'Vertrieb', team: 'Team', agent: 'KI-Agent' }[i.rolle] || i.rolle) + '</span></span><a href="' + PORTAL + '" class="btn sec" style="padding:6px 10px">Team-Portal ↗</a></div></div>' +
    '<nav class="tabs" role="tablist">' + TABS.map(([k, l]) => '<a role="tab" href="#/tab/' + k + '" aria-selected="' + (k === route.tab) + '" class="' + (k === route.tab ? 'on' : '') + '">' + l + ((k === 'freigaben' && (D.freigaben || []).some(f => f.status === 'offen')) ? ' <span class="chip fs-offen" style="padding:0 6px">' + (D.freigaben || []).filter(f => f.status === 'offen').length + '</span>' : '') + '</a>').join('') + '</nav></div><div class="bar"></div></header>' +
    (D.quelle === 'testadapter' ? '<div class="wrap" style="margin-top:12px"><div class="note test"><b>TESTADAPTER:</b> Diese Daten sind synthetisch (lokaler Testserver). Nichts hiervon ist echt oder produktiv getestet.</div></div>' : '') +
    '<main class="wrap" id="main"></main>' +
    '<footer class="wrap small muted" style="padding-bottom:30px">KI Office · Stand der Daten: ' + esc(new Date(D.stand).toLocaleString('de-DE')) + ' · Daten alle 60 Sekunden aktualisiert · <a href="#" id="logout">Auf diesem Gerät abmelden</a> (gilt auch fürs Team-Portal) · <a href="' + PORTAL + '">Team-Portal</a></footer>';
  $('#logout').onclick = ev => { ev.preventDefault(); tokenSetzen(null); D = null; ohneZugang('Du bist abgemeldet.'); };
  if (EINGEBETTET) requestAnimationFrame(hoeheMelden);
  try {
    // Nur-Büro-Einbettung (Portal-Übersicht): ohne Reiter, dafür ein Rücksprung, wenn man einen Raum oder Agenten geöffnet hat
    if (NUR === 'buero' && (route.tab !== 'buero' || route.art)) $('#main').insertAdjacentHTML('afterbegin', '<p style="margin:0 0 10px"><a href="#/tab/buero">← Zurück zum Büro</a></p>');
    if (route.art === 'projekt') vProjekt(ctx, route.id);
    else if (route.art === 'agent') vAgent(ctx, route.id);
    else if (route.art === 'run') vRun(ctx, route.id);
    else if (route.art === 'raum') vProjekte(ctx, route.id);
    else if (route.art === 'monitor') vMonitorwand(ctx, route.id);
    else if (route.tab === 'agenten') vAgenten(ctx);
    else if (route.tab === 'buero') vBuero(ctx);
    else if (route.tab === 'freigaben') vFreigaben(ctx);
    else vProjekte(ctx, route.art === 'raum' ? route.id : undefined);
  } catch (e) {
    $('#main').innerHTML = '<div class="card"><h2>Diese Ansicht konnte nicht aufgebaut werden</h2><p class="muted">' + esc(e.message) + '</p><a class="btn" href="#/tab/projekte">Zur Übersicht</a></div>';
    console.error(e);
  }
}

async function laden(still) {
  if (!TOKEN) return ohneZugang();
  try {
    const y = window.scrollY;
    D = await api('laden');
    render();
    if (still) window.scrollTo(0, y);
  } catch (e) {
    if (e.status === 401) { tokenSetzen(null); return ohneZugang(e.message); }
    if (e.status === 403) return ohneZugang(e.message);
    if (!D && EINGEBETTET) { $('#app').innerHTML = '<div class="note warn" style="margin:4px 0"><b>KI Office ist noch nicht angebunden.</b> Der n8n-Workflow „TEAM: Office-API“ muss importiert und aktiviert sein (docs/office/SETUP.md). Bis dahin läuft das Team-Portal wie gewohnt weiter. <span class="muted">(' + esc(e.message) + ')</span></div>'; requestAnimationFrame(hoeheMelden); return; }
    if (!D) $('#app').innerHTML = '<div class="center card"><h2>Keine Verbindung zur Office-API</h2><p class="muted">' + esc(e.message) + '</p><p class="small muted">Produktiv antwortet der n8n-Workflow „TEAM: Office-API“. Ist er noch nicht importiert, siehe docs/office/SETUP.md.</p><button class="btn" id="retry">Erneut versuchen</button></div>'; 
    else toast(e.message);
    const r = $('#retry'); if (r) r.onclick = () => { $('#app').innerHTML = '<div class="loading">Lade KI Office …</div>'; laden(); };
  }
}

function ohneZugang(msg) {
  $('#app').innerHTML = '<div class="center"><img class="logo" src="../logo_h96.png" srcset="../logo_h48.png 1x, ../logo_h96.png 2x, ../logo_h144.png 3x" alt="Momentum KI Akademie" style="height:48px;margin-bottom:18px"><div class="card"><h2>KI Office</h2>' +
    '<p>' + esc(msg || 'Diese Seite ist nur für das Momentum-Team.') + '</p><p class="muted">Öffne das Team-Portal über deinen persönlichen Link; danach bist du auch hier angemeldet. Oder füge den Zugangscode ein.</p>' +
    '<form id="codef" style="margin-top:14px"><div class="f"><label for="code">Zugangscode</label><input id="code" autocomplete="off" placeholder="Code aus deinem Link"></div><button class="btn" type="submit">Anmelden</button> <a class="btn sec" href="' + PORTAL + '">Zum Team-Portal</a></form></div></div>';
  $('#codef').onsubmit = ev => { ev.preventDefault(); const c = /([a-f0-9]{20,64})/i.exec($('#code').value || ''); if (!c) return toast('Das sieht nicht nach einem gültigen Code aus.'); tokenSetzen(c[1]); laden(); };
}

/** Eingebettet: Höhe an das Portal melden (gleiche Herkunft, Portal prüft e.origin) und Portal-Links im Elternfenster öffnen. */
function hoeheMelden() { if (!EINGEBETTET || !window.parent || window.parent === window) return; try { window.parent.postMessage({ typ: 'ko-hoehe', hoehe: document.documentElement.scrollHeight }, location.origin); } catch (e) {} }
if (EINGEBETTET) {
  try { new ResizeObserver(hoeheMelden).observe(document.body); } catch (e) { window.addEventListener('load', hoeheMelden); }
  document.addEventListener('click', ev => { const a = ev.target.closest('a[href]'); if (!a) return; const u = new URL(a.getAttribute('href'), location.href); if (u.pathname !== location.pathname) a.target = '_parent'; });
}
window.addEventListener('hashchange', () => { if (location.hash === letzterHash) return; letzterHash = location.hash; leseHash(); if ($('#dlg').open) $('#dlg').close(); render(); if (!EINGEBETTET) window.scrollTo(0, 0); });
setInterval(() => { const a = document.activeElement, tippt = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); if (D && !$('#dlg').open && !tippt && document.visibilityState === 'visible') laden(true); }, 60000);
tokenLesen();
leseHash();
if (!location.hash) history.replaceState(null, '', location.pathname + '#/tab/' + route.tab);
letzterHash = location.hash;
laden();
