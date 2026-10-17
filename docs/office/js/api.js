// KI Office: Zugang und API. Gleicher Token-Mechanismus wie das Team-Portal (localStorage 'mt-token', ?z=…).
// Produktiv spricht die Seite mit dem n8n-Workflow „TEAM: Office-API“. Auf localhost mit dem Testserver (TESTADAPTER).
export const PORTAL = '../team/';
const LOKAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const API = LOKAL ? '/api/office' : 'https://n8n.hm-storage.de/webhook/office-api';

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

export let TOKEN = null;
export function tokenLesen() {
  const m = /[#&?]z=([a-f0-9]{20,64})/i.exec(location.hash + '&' + location.search);
  if (m) { TOKEN = m[1].toLowerCase(); ls.set('mt-token', TOKEN); history.replaceState(null, '', location.pathname + (/^#\//.test(location.hash) ? location.hash : '')); }
  else TOKEN = ls.get('mt-token');
  return TOKEN;
}
export function tokenSetzen(t) { TOKEN = t ? String(t).toLowerCase() : null; if (TOKEN) ls.set('mt-token', TOKEN); else ls.del('mt-token'); }

/** Ein Aufruf der Office-API. Wirft einen Error mit .status bei Fehlern. */
export async function api(aktion, daten) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ token: TOKEN, aktion, daten: daten || {} }) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || j.ok === false) { const err = new Error((j && j.fehler) || 'Das hat nicht geklappt. Bitte versuch es gleich noch einmal.'); err.status = r.status; err.daten = j; throw err; }
  return j;
}

/** Idempotenzschlüssel für Aufträge und Aktionen (bleibt für einen Dialog gleich, damit Doppelklick nichts doppelt startet). */
export function neuerSchluessel(prefix) {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  return (prefix || 'ui') + '-' + r;
}
