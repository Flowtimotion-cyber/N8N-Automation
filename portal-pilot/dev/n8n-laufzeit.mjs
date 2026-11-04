// Kleine n8n-Laufzeit für den Testserver: führt den Workflow portal-pilot/n8n/portal-api.workflow.json so aus, wie n8n es täte,
// mit dem ECHTEN Code der Code-Knoten („Anfrage prüfen“, „Social-Felder ergänzen“, „Antwort bauen“, „Schreibaufträge“,
// „Ergebnis prüfen“) und den Ausdrücken der übrigen Knoten (Weiche, Wenn, Antworten, Schleife, HTTP-Aufrufe).
// Nachgebildet werden nur die Teile von n8n, die dieser Workflow benutzt:
//   $('Knoten').first() / .all() / .item     Ausgabe eines früheren Knotens
//   $input.all() / .first()                   Eingabe des laufenden Knotens
//   $json                                     das aktuelle Element (in Ausdrücken „={{ … }}“)
//   Knoten-Typen: webhook, manualTrigger, httpRequest, code (runOnceForAllItems), switch (expression), if (boolean true), respondToWebhook,
//                 splitInBatches (Schleife, Ausgang 0 = fertig, Ausgang 1 = Schleife); alwaysOutputData, executeOnce
// Workflows ohne Webhook (manueller Trigger, z. B. „Feedback lesen“) laufen mit ausfuehren(..., { ohneAntwort: true }) und liefern die
// Ausgabe des zuletzt gelaufenen Knotens zurück.
// HTTP-Aufrufe an Supabase gehen nicht ins Netz, sondern an eine PostgREST-Nachbildung (dev/postgrest.mjs), die das Objekt
// „rest“ mit anfrage(methode, pfad, body, headers) → { statusCode, headers, text, json } bereitstellt.
import { readFileSync } from 'node:fs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const REST_BASIS = /^https:\/\/[A-Za-z0-9_-]+\.supabase\.co\/rest\/v1\//;

export function ladeWorkflow(pfad) {
  const w = JSON.parse(readFileSync(pfad, 'utf8'));
  const knoten = {};
  for (const n of w.nodes) {
    knoten[n.name] = n;
    if (n.parameters && n.parameters.jsCode) {
      if (n.parameters.mode !== 'runOnceForAllItems') throw new Error(n.name + ': nur „runOnceForAllItems“ wird nachgebildet');
      n._code = new AsyncFunction('$', '$input', '$json', '$now', n.parameters.jsCode);   // dieselbe Übersetzung, die n8n verwendet
    }
  }
  const start = w.nodes.find(n => n.type === 'n8n-nodes-base.webhook') || w.nodes.find(n => n.type === 'n8n-nodes-base.manualTrigger');
  if (!start) throw new Error('Kein Webhook- oder Trigger-Knoten');
  // Nur zur Kontrolle: Verbindungen dürfen nur auf vorhandene Knoten zeigen
  for (const [von, c] of Object.entries(w.connections)) { if (!knoten[von]) throw new Error('Verbindung von unbekanntem Knoten ' + von); for (const ausg of c.main || []) for (const z of ausg || []) if (!knoten[z.node]) throw new Error('Verbindung zu unbekanntem Knoten ' + z.node); }
  const sp = start.parameters || {};
  return { w, knoten, start, name: w.name, pfad: sp.path || '', origin: (sp.options || {}).allowedOrigins || '' };
}

/** Wertet einen n8n-Ausdruck „={{ … }}“ aus; ohne Präfix ist es ein fester Wert. */
function ausdruck(wert, umgebung) {
  if (typeof wert !== 'string' || !wert.startsWith('=')) return wert;
  const s = wert.slice(1);
  const teile = s.split(/(\{\{[\s\S]*?\}\})/g).filter(x => x !== '');
  const rechne = e => new Function('$', '$input', '$json', '$now', 'return (' + e + ');')(umgebung.$, umgebung.$input, umgebung.$json, umgebung.$now);
  if (teile.length === 1 && /^\{\{[\s\S]*\}\}$/.test(teile[0])) return rechne(teile[0].slice(2, -2));
  return teile.map(x => /^\{\{[\s\S]*\}\}$/.test(x) ? String(rechne(x.slice(2, -2))) : x).join('');
}

/**
 * Führt den Workflow für eine Webhook-Anfrage aus.
 * anfrage: { body (Text oder Objekt), headers, query }. rest: PostgREST-Nachbildung. Rückgabe: { code, antwort, headers }.
 * opts.ohneAntwort: Workflow ohne Antwortknoten (manueller Trigger); Rückgabe ist dann { code: 200, antwort: <Ausgabe des letzten Knotens>, protokoll }.
 */
export async function ausfuehren(wf, anfrage, rest, opts = {}) {
  const ausgaben = {};                 // Knotenname → Liste der Ausgabe-Elemente (für $('Knoten'))
  const schleifen = {};                // Zustand der splitInBatches-Knoten
  const protokoll = [];                // Reihenfolge der Knoten (für Tests und Fehlersuche)
  let antwort = null;
  let letzte = [];                     // Ausgabe des zuletzt gelaufenen Knotens (für Workflows ohne Antwortknoten)
  const $ = name => {
    const L = ausgaben[name];
    if (!L) throw new Error('Knoten „' + name + '“ ist noch nicht gelaufen (n8n: „Referenced node is unexecuted“)');
    return { first: () => L[0], all: () => L, last: () => L[L.length - 1], get item() { return L[0]; } };
  };
  const umgebung = (items, item) => ({ $, $input: { all: () => items, first: () => items[0], last: () => items[items.length - 1], item }, $json: item ? item.json : undefined, $now: new Date() });

  async function lauf(n, items) {
    if (antwort) return;                                              // nach der Antwort an den Browser läuft im Test nichts mehr
    protokoll.push(n.name);
    const p = n.parameters || {};
    if (n.executeOnce && items.length > 1) items = items.slice(0, 1);
    let aus = [];                                                     // je Ausgang eine Liste
    const typ = n.type.replace('n8n-nodes-base.', '');
    if (typ === 'webhook' || typ === 'manualTrigger') aus = [items];
    else if (typ === 'code') {
      const r = await n._code($, umgebung(items).$input, items[0] ? items[0].json : undefined, new Date());
      aus = [Array.isArray(r) ? r.map(x => (x && x.json ? x : { json: x })) : [{ json: r }]];
    } else if (typ === 'httpRequest') {
      const L = [];
      for (const item of items) {
        const u = umgebung(items, item);
        const url = String(ausdruck(p.url, u));
        if (!REST_BASIS.test(url)) throw new Error(n.name + ': Adresse ist kein Supabase-REST-Pfad: ' + url);
        const methode = String(ausdruck(p.method || 'GET', u)).toUpperCase();
        const kopf = {};
        for (const h of ((p.headerParameters || {}).parameters || [])) kopf[String(ausdruck(h.name, u)).toLowerCase()] = String(ausdruck(h.value, u));
        let body;
        if (p.sendBody) { const roh = ausdruck(p.jsonBody, u); body = typeof roh === 'string' ? JSON.parse(roh) : roh; }
        const r = await rest.anfrage(methode, url.replace(REST_BASIS, ''), body, kopf);
        opts.aufrufe && opts.aufrufe.push({ knoten: n.name, methode, pfad: url.replace(REST_BASIS, ''), status: r.statusCode });
        const ro = ((p.options || {}).response || {}).response || {};
        if (ro.fullResponse) L.push({ json: { body: ro.responseFormat === 'text' ? r.text : r.json, headers: r.headers, statusCode: r.statusCode } });
        else if (r.statusCode >= 400 && !ro.neverError) throw new Error(n.name + ': HTTP ' + r.statusCode + ' ' + r.text);
        else if (Array.isArray(r.json)) L.push(...r.json.map(j => ({ json: j })));
        else L.push({ json: r.json == null ? {} : r.json });
      }
      aus = [L];
    } else if (typ === 'switch') {
      aus = Array.from({ length: Number(p.numberOutputs) || 1 }, () => []);
      for (const item of items) { const i = Number(ausdruck(p.output, umbegungFuer(items, item))); if (!(i >= 0 && i < aus.length)) throw new Error(n.name + ': Ausgang ' + i + ' gibt es nicht'); aus[i].push(item); }
    } else if (typ === 'if') {
      aus = [[], []];
      for (const item of items) {
        const u = umgebung(items, item);
        const ok = (p.conditions.conditions || []).every(c => { const l = ausdruck(c.leftValue, u); if (c.operator.type === 'boolean' && c.operator.operation === 'true') return l === true || l === 'true'; if (c.operator.type === 'boolean' && c.operator.operation === 'false') return l === false || l === 'false'; throw new Error(n.name + ': Bedingung ' + JSON.stringify(c.operator) + ' nicht nachgebildet'); });
        aus[ok ? 0 : 1].push(item);
      }
    } else if (typ === 'respondToWebhook') {
      const u = umgebung(items, items[0]);
      const text = String(ausdruck(p.responseBody, u));
      const code = (p.options || {}).responseCode;
      antwort = { code: code === undefined ? 200 : Number(ausdruck(code, u)), antwort: JSON.parse(text), headers: { 'content-type': 'application/json; charset=utf-8' } };
      aus = [items];
    } else if (typ === 'splitInBatches') {
      const z = schleifen[n.name] || (schleifen[n.name] = { rest: items.slice(), fertig: [], begonnen: false });
      if (z.begonnen) z.fertig.push(...items); else z.begonnen = true;
      const groesse = Number(p.batchSize) || 1;
      if (z.rest.length) aus = [[], z.rest.splice(0, groesse)];
      else { aus = [z.fertig, []]; delete schleifen[n.name]; }
    } else throw new Error('Knoten-Typ nicht nachgebildet: ' + n.type);
    if (n.alwaysOutputData && aus.every(l => !l.length)) aus[0] = [{ json: {} }];
    ausgaben[n.name] = aus.flat();
    letzte = ausgaben[n.name];
    const verb = (wf.w.connections[n.name] || {}).main || [];
    for (let i = 0; i < verb.length; i++) {
      if (!aus[i] || !aus[i].length) continue;
      for (const ziel of verb[i] || []) await lauf(wf.knoten[ziel.node], aus[i]);
    }
  }
  function umbegungFuer(items, item) { return umgebung(items, item); }

  const start = wf.start.type === 'n8n-nodes-base.manualTrigger' ? { json: {} } : { json: { headers: anfrage.headers || {}, params: {}, query: anfrage.query || {}, body: anfrage.body } };
  await lauf(wf.start, [start]);
  if (!antwort && opts.ohneAntwort) return { code: 200, antwort: letzte.map(i => i.json), headers: {}, protokoll };
  if (!antwort) throw new Error('Der Workflow hat keine Antwort an den Browser geschickt (Knoten: ' + protokoll.join(' → ') + ')');
  return Object.assign(antwort, { protokoll });
}
