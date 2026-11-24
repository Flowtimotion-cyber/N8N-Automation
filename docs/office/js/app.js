// KI Office: Einstieg, Routing (Hash), Laden, Gerüst. Gleiche Navigation und derselbe Token wie das Team-Portal.
import { $, $$, esc, toast, relativ } from './util.js';
import { api, tokenLesen, tokenSetzen, TOKEN, PORTAL, ls } from './api.js';
import { vProjekte, vProjekt, vAgenten, vAgent, vRun, vFreigaben, av } from './ansichten.js';
import { vBuero, vMonitorwand } from './buero.js';
import { vKontrollraum } from './kontrollraum.js';
import { vAuswertung } from './auswertung.js';
import { vGuthaben } from './guthaben.js';
import { wartendeStarts } from './modell.js';
import { istLive, TAKT } from './kontrollraum.daten.js';

// „buero“ ist seit KI Office 2.0 der Kontrollraum (die Adresse bleibt, damit die Einbettung im Team-Portal weiter passt);
// die isometrische Büro-Szene mit Räumen und Monitoren liegt unter „szene“.
const TABS = [['buero', 'Kontrollraum'], ['projekte', 'Projekte'], ['agenten', 'Agenten'], ['auswertung', 'Auswertung'], ['guthaben', 'Guthaben'], ['szene', 'Büro-Szene'], ['freigaben', 'Freigaben']];
// Eingebettet im Team-Portal (iframe, gleiche Herkunft): ?einbetten=1 blendet Kopf/Fuß aus, ?nur=buero zeigt nur den Kontrollraum.
const PARAMS = new URLSearchParams(location.search);
const EINGEBETTET = PARAMS.get('einbetten') === '1';
const NUR = EINGEBETTET ? (PARAMS.get('nur') || '') : '';
if (EINGEBETTET) document.body.classList.add('eingebettet');
if (NUR === 'buero') document.body.classList.add('nur-buero');
// Thema: dunkel (Kontrollraum, Standard) oder hell (wie das Team-Portal). ?thema=hell|dunkel setzt es, der Knopf im Kopf merkt es sich je Gerät.
const THEMEN = ['dunkel', 'hell'];
function themaSetzen(t, merken) { const th = THEMEN.includes(t) ? t : 'dunkel'; document.documentElement.dataset.thema = th; if (merken) ls.set('ko-thema', th); return th; }
// Ein Thema aus der Adresse gilt nur für diesen Aufruf (z. B. die Einbettung im Portal) und überschreibt die gemerkte Wahl nicht.
themaSetzen(PARAMS.get('thema') || ls.get('ko-thema') || 'dunkel', false);
let D = null;
let signatur = '';          // Fingerabdruck der zuletzt gezeigten Daten: unveränderte Antworten bauen die Ansicht nicht neu auf
let letzterAbruf = 0;       // Zeitpunkt des letzten erfolgreichen Abrufs (ms)
let letzterVersuch = 0;     // Zeitpunkt des letzten Abrufversuchs, auch des gescheiterten: der Takt richtet sich danach, sonst feuert er bei einer Störung alle 5 Sekunden
let letzterAufbau = 0;      // Zeitpunkt des letzten Neuaufbaus der Ansicht
let laedt = null;           // laufender Abruf (Promise) oder null
let route = { tab: NUR === 'buero' ? 'buero' : (TABS.some(t => t[0] === ls.get('ko-tab')) ? ls.get('ko-tab') : 'buero') };
let letzterHash = null;

function leseHash() {
  const h = location.hash || '';
  let m;
  if ((m = /^#\/tab\/(\w+)$/.exec(h))) route = { tab: TABS.some(t => t[0] === m[1]) ? m[1] : 'buero' };
  else if ((m = /^#\/projekt\/([\w-]+)$/.exec(h))) route = { tab: 'projekte', art: 'projekt', id: m[1] };
  else if ((m = /^#\/agent\/([\w-]+)$/.exec(h))) route = { tab: 'agenten', art: 'agent', id: m[1] };
  else if ((m = /^#\/run\/([\w-]+)$/.exec(h))) route = { tab: 'agenten', art: 'run', id: m[1] };
  else if ((m = /^#\/raum\/([^/]+)$/.exec(h))) route = { tab: 'projekte', art: 'raum', id: decodeURIComponent(m[1]) };
  else if ((m = /^#\/monitor\/([^/]+)$/.exec(h))) route = { tab: 'szene', art: 'monitor', id: decodeURIComponent(m[1]) };
  else if (h && h !== '#/' ) return; // unbekannt: letzte Route behalten
  if (!route.art && !EINGEBETTET) ls.set('ko-tab', route.tab);
}

const ctx = { get D() { return D; }, render, laden, get route() { return route; }, nur: NUR, eingebettet: EINGEBETTET };

/** Zähler für Startfreigaben: Admin sieht „wartet auf deine Freigabe“, Teammitglieder sehen „wartet auf Timo“ für ihre eigenen Aufträge. */
function startZaehler() {
  const offen = wartendeStarts(D); if (!offen.length) return '';
  const admin = D.ich.rolle === 'admin';
  const eigene = offen.filter(f => f.angefordert_von === D.ich.mitglied_id);
  const n = admin ? offen.length : eigene.length; if (!n) return '';
  const text = admin ? (n === 1 ? '1 Auftrag wartet auf deine Freigabe' : n + ' Aufträge warten auf deine Freigabe') : (n === 1 ? '1 deiner Aufträge wartet auf Timo' : n + ' deiner Aufträge warten auf Timo');
  return '<div class="wrap" style="margin-top:12px"><a class="note warn" id="startZaehler" href="#/tab/freigaben" style="display:block;text-decoration:none;color:inherit"><b>' + esc(text) + '</b>' + (admin ? ' – jetzt prüfen →' : ' – du musst nichts tun.') + '</a></div>';
}
const taktText = () => istLive(D) ? 'Aktualisierung alle 30 Sekunden, solange ein Agent arbeitet' : 'Aktualisierung alle 5 Minuten (alle 30 Sekunden, sobald ein Agent arbeitet)';

function render() {
  if (!D) return;
  letzterAufbau = Date.now();
  const i = D.ich;
  const hell = document.documentElement.dataset.thema === 'hell';
  $('#app').innerHTML = '<header><div class="wrap"><div class="hrow"><a href="' + PORTAL + '" title="Zum Team-Portal"><img class="logo" src="../logo_h96.png" srcset="../logo_h48.png 1x, ../logo_h96.png 2x, ../logo_h144.png 3x" alt="Momentum KI Akademie"></a><span class="htitle">KI Office</span>' +
    '<div class="who">' + av(D, i.mitglied_id) + '<span><b>' + esc(i.name) + '</b> <span class="r">· ' + esc({ admin: 'Admin', dozent: 'Dozent / Technik', vertrieb: 'Vertrieb', team: 'Team', agent: 'KI-Agent' }[i.rolle] || i.rolle) + '</span></span><button class="btn sec" id="themaKnopf" type="button" style="padding:6px 10px" aria-pressed="' + hell + '" title="Zwischen dunklem Kontrollraum und hellem Portal-Design wechseln">' + (hell ? '🌙 Dunkel' : '☀️ Hell') + '</button><a href="' + PORTAL + '" class="btn sec" style="padding:6px 10px">Team-Portal ↗</a></div></div>' +
    '<nav class="tabs" role="tablist">' + TABS.map(([k, l]) => '<a role="tab" href="#/tab/' + k + '" aria-selected="' + (k === route.tab) + '" class="' + (k === route.tab ? 'on' : '') + '">' + l + ((k === 'freigaben' && (D.freigaben || []).some(f => f.status === 'offen')) ? ' <span class="chip fs-offen" style="padding:0 6px">' + (D.freigaben || []).filter(f => f.status === 'offen').length + '</span>' : '') + ((k === 'guthaben' && (D.vorschlaege || []).length) ? ' <span class="chip fs-offen" style="padding:0 6px" title="Vorschläge warten auf deine Entscheidung">' + D.vorschlaege.length + '</span>' : '') + '</a>').join('') + '</nav></div><div class="bar"></div></header>' +
    (D.quelle === 'testadapter' ? '<div class="wrap" style="margin-top:12px"><div class="note test"><b>TESTADAPTER:</b> Diese Daten sind synthetisch (lokaler Testserver). Nichts hiervon ist echt oder produktiv getestet.</div></div>' : '') +
    startZaehler() +
    '<main class="wrap" id="main"></main>' +
    '<footer class="wrap small muted" style="padding-bottom:30px">KI Office · Stand der Daten: <span id="fussStand">' + esc(new Date(D.stand).toLocaleString('de-DE')) + '</span> · ' + esc(taktText()) + ', nur bei sichtbarem Tab · <a href="#" id="logout">Auf diesem Gerät abmelden</a> (gilt auch fürs Team-Portal) · <a href="' + PORTAL + '">Team-Portal</a></footer>';
  $('#logout').onclick = ev => { ev.preventDefault(); tokenSetzen(null); D = null; ohneZugang('Du bist abgemeldet.'); };
  $('#themaKnopf').onclick = () => { themaSetzen(document.documentElement.dataset.thema === 'hell' ? 'dunkel' : 'hell', true); render(); };
  if (EINGEBETTET) requestAnimationFrame(hoeheMelden);
  try {
    if (route.art === 'projekt') vProjekt(ctx, route.id);
    else if (route.art === 'agent') vAgent(ctx, route.id);
    else if (route.art === 'run') vRun(ctx, route.id);
    else if (route.art === 'raum') vProjekte(ctx, route.id);
    else if (route.art === 'monitor') vMonitorwand(ctx, route.id);
    else if (route.tab === 'agenten') vAgenten(ctx);
    else if (route.tab === 'szene') vBuero(ctx);
    else if (route.tab === 'freigaben') vFreigaben(ctx);
    else if (route.tab === 'auswertung') vAuswertung(ctx);
    else if (route.tab === 'guthaben') vGuthaben(ctx);
    else if (route.tab === 'projekte') vProjekte(ctx, undefined);
    else vKontrollraum(ctx);
    // Nur-Kontrollraum-Einbettung (Portal-Übersicht): Rücksprung erst NACH dem Aufbau der Ansicht einfügen, sonst überschreibt ihn die Ansicht (innerHTML)
    if (NUR === 'buero' && (route.tab !== 'buero' || route.art)) $('#main').insertAdjacentHTML('afterbegin', '<p style="margin:0 0 10px"><a href="#/tab/buero">← Zurück zum Kontrollraum</a></p>');
  } catch (e) {
    $('#main').innerHTML = '<div class="card"><h2>Diese Ansicht konnte nicht aufgebaut werden</h2><p class="muted">' + esc(e.message) + '</p><a class="btn" href="#/tab/projekte">Zur Übersicht</a></div>';
    console.error(e);
  }
}

/** Fokus über einen Neuaufbau retten: das fokussierte Element wird über id oder href wiedergefunden. */
function fokusMerken() { const a = document.activeElement; if (!a || a === document.body) return null; if (a.id) return '#' + CSS.escape(a.id); const h = a.getAttribute && a.getAttribute('href'); return h && h.startsWith('#/') ? '#main a[href="' + h.replace(/"/g, '\\"') + '"]' : null; }

/** Lädt den Stand. Läuft schon ein Abruf (Hintergrund-Takt), wartet der neue darauf und lädt danach noch einmal: nach einer Aktion ist die Ansicht so immer frisch. */
function laden(still) {
  if (!TOKEN) return ohneZugang();
  if (laedt) return laedt.then(() => laden(still));
  laedt = abrufen(still).finally(() => { laedt = null; });
  return laedt;
}
async function abrufen(still) {
  letzterVersuch = Date.now();
  try {
    const y = window.scrollY;
    const neu = await api('laden');
    letzterAbruf = Date.now();
    // Unveränderte Daten (bis auf den Zeitstempel) bauen die Ansicht nicht neu auf: kein Flackern, Fokus und geöffnete Details bleiben.
    const sig = JSON.stringify(Object.assign({}, neu, { stand: '' }));
    const gleich = !!D && sig === signatur;
    D = neu; signatur = sig;
    // Spätestens nach zwei Minuten wird trotzdem neu aufgebaut, damit „vor 3 Min.“ nicht stehen bleibt.
    if (still && gleich && Date.now() - letzterAufbau < 120000 && !(route.tab === 'buero' && !route.art && istLive(D))) { standZeigen(); return; }
    const fokus = still ? fokusMerken() : null;
    render();
    if (still) { window.scrollTo(0, y); if (fokus) { const el = document.querySelector(fokus); if (el) el.focus({ preventScroll: true }); } }
  } catch (e) {
    if (e.status === 401) { tokenSetzen(null); return ohneZugang(e.message); }
    if (e.status === 403) return ohneZugang(e.message);
    if (!D && EINGEBETTET) { $('#app').innerHTML = '<div class="note warn" style="margin:4px 0"><b>KI Office ist noch nicht angebunden.</b> Der n8n-Workflow „TEAM: Office-API“ muss importiert und aktiviert sein (docs/office/SETUP.md). Bis dahin läuft das Team-Portal wie gewohnt weiter. <span class="muted">(' + esc(e.message) + ')</span></div>'; requestAnimationFrame(hoeheMelden); return; }
    if (!D) $('#app').innerHTML = '<div class="center card"><h2>Keine Verbindung zur Office-API</h2><p class="muted">' + esc(e.message) + '</p><p class="small muted">Produktiv antwortet der n8n-Workflow „TEAM: Office-API“. Ist er noch nicht importiert, siehe docs/office/SETUP.md.</p><button class="btn" id="retry">Erneut versuchen</button></div>';
    else toast(e.message);
    const r = $('#retry'); if (r) r.onclick = () => { $('#app').innerHTML = '<div class="loading">Lade KI Office …</div>'; laden(); };
  }
}
/** Nur die Stand-Anzeigen auffrischen (ohne Neuaufbau). */
function standZeigen() {
  if (!D) return;
  const a = $('#krStand'); if (a) a.textContent = 'Stand ' + relativ(D.stand);
  const f = $('#fussStand'); if (f) f.textContent = new Date(D.stand).toLocaleString('de-DE');
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
// Aktualisierung (ARCHITEKTUR.md Abschnitt 14): alle 30 Sekunden, solange ein Run in der Warteschlange oder in Arbeit ist, sonst alle 5 Minuten.
// Nur bei sichtbarem Tab, nie während ein Dialog offen ist oder jemand tippt. Jeder Abruf holt den ganzen Stand aus Supabase (Datenverkehr, BETRIEB.md).
const darfNachladen = () => { const a = document.activeElement, tippt = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); return !!D && !$('#dlg').open && !tippt && document.visibilityState === 'visible'; };
setInterval(() => { if (!D) return; if (darfNachladen() && Date.now() - letzterVersuch >= (istLive(D) ? TAKT.live_ms : TAKT.ruhig_ms)) laden(true); else if (document.visibilityState === 'visible') { const a = $('#krStand'); if (a) a.textContent = 'Stand ' + relativ(D.stand); } }, 5000);
document.addEventListener('visibilitychange', () => { if (darfNachladen() && Date.now() - letzterVersuch >= TAKT.live_ms) laden(true); });
tokenLesen();
leseHash();
if (!location.hash) history.replaceState(null, '', location.pathname + '#/tab/' + route.tab);
letzterHash = location.hash;
laden();
