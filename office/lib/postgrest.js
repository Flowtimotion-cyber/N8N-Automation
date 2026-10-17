// KI Office: Schreibaufträge im PostgREST-Format (wie in der Portal-API v2) und ein kleiner In-Memory-Anwender für den Testserver.
// Ein Auftrag: { methode: 'POST'|'PATCH'|'DELETE', pfad: 'tabelle?spalte=eq.wert', body }

const enc = v => encodeURIComponent(String(v));
export const neu = (tab, row) => ({ methode: 'POST', pfad: tab, body: row });
export const aend = (tab, pk, id, row) => ({ methode: 'PATCH', pfad: tab + '?' + pk + '=eq.' + enc(id), body: row });
export const weg = (tab, pk, id) => ({ methode: 'DELETE', pfad: tab + '?' + pk + '=eq.' + enc(id), body: {} });
export const wegViele = (tab, pk, ids) => ({ methode: 'DELETE', pfad: tab + '?' + pk + '=in.(' + ids.map(enc).join(',') + ')', body: {} });

// Eindeutigkeiten, die in Supabase als Unique-Index existieren (supabase/team_office.sql). Der Testserver erzwingt sie genauso.
export const UNIQUE = {
  office_runs: [['run_id'], ['idempotenzschluessel'], ['n8n_execution_id']],
  office_ereignisse: [['id'], ['idempotenz']],
  office_artefakte: [['artefakt_id']],
  office_freigaben: [['freigabe_id'], ['run_id', 'aktion', 'inhalt_hash']],
  office_idempotenz: [['schluessel']],
  office_agenten: [['agent_id']],
  office_run_schluessel: [['run_id']]
};

function filterAus(pfad) {
  const [tab, q] = String(pfad).split('?');
  const bed = [];
  if (q) for (const teil of q.split('&')) {
    const i = teil.indexOf('='); const sp = teil.slice(0, i), ausdruck = decodeURIComponent(teil.slice(i + 1));
    if (ausdruck.startsWith('eq.')) bed.push(r => String(r[sp]) === ausdruck.slice(3));
    else if (ausdruck.startsWith('in.(')) { const werte = ausdruck.slice(4, -1).split(',').map(s => decodeURIComponent(s)); bed.push(r => werte.includes(String(r[sp]))); }
    else if (ausdruck.startsWith('lt.')) bed.push(r => String(r[sp]) < ausdruck.slice(3));
    else throw new Error('Filter nicht unterstützt: ' + teil);
  }
  return { tab, passt: r => bed.every(f => f(r)) };
}

/**
 * Wendet einen Schreibauftrag auf In-Memory-Tabellen an (TESTADAPTER). Liefert { statusCode, body }.
 * Simuliert 409 bei Verletzung einer Eindeutigkeit, wie PostgREST.
 */
export function wendeAn(tabellen, op, naechsteId) {
  const { tab, passt } = filterAus(op.pfad);
  if (!tabellen[tab]) tabellen[tab] = [];
  const T = tabellen[tab];
  if (op.methode === 'POST') {
    const row = { ...op.body };
    if ((tab === 'office_ereignisse' || tab === 'team_aufgaben_verlauf') && row.id == null) row.id = naechsteId ? naechsteId() : T.length + 1;
    for (const spalten of UNIQUE[tab] || []) {
      if (spalten.some(s => row[s] == null)) continue;
      if (T.some(r => spalten.every(s => String(r[s]) === String(row[s])))) return { statusCode: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint (' + spalten.join(',') + ')' } };
    }
    T.push(row); return { statusCode: 201, body: {} };
  }
  if (op.methode === 'PATCH') { for (const r of T) if (passt(r)) Object.assign(r, op.body); return { statusCode: 204, body: {} }; }
  if (op.methode === 'DELETE') { tabellen[tab] = T.filter(r => !passt(r)); return { statusCode: 204, body: {} }; }
  return { statusCode: 405, body: { message: 'Methode ' + op.methode } };
}
