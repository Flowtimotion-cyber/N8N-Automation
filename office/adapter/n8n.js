// KI Office: Adapter „n8n“ (echt, nur konfiguriert, NICHT getestet – in dieser Sitzung gab es keinen n8n-Zugang).
// Wird vom n8n-Workflow „TEAM: Office-API“ selbst abgebildet (Knoten „Ausführer anstoßen“ und „Abbruch melden“):
// Nach dem Schreiben eines Runs ruft der Workflow die ausfuehrer_url des Agenten per HTTP POST auf und übergibt
// run_id und Rückmelde-Schlüssel. Diese Datei beschreibt dasselbe Verhalten für den Einsatz außerhalb von n8n
// (z. B. ein Node-Dienst, der Aufträge an einen Executor weiterreicht) und dient als Referenz für die Nutzlast.
import { signiere } from '../lib/signatur.js';

export function n8nAdapter({ fetchFn, officeApiUrl } = {}) {
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  const post = async (url, body) => {
    if (!f) throw new Error('fetch nicht verfügbar');
    const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  return {
    /** Übergibt den Auftrag an den Executor-Webhook des Agenten. Nutzlast ist absichtlich klein. */
    async startRun(a) {
      if (!a.ausfuehrer_url) return { ok: false, grund: 'Kein Executor konfiguriert (ausfuehrer_url leer). Der Run bleibt in der Warteschlange, bis ein Executor ihn per lebenszeichen übernimmt.' };
      return post(a.ausfuehrer_url, { art: 'start', run_id: a.run_id, agent_id: a.agent_id, rueckmelde_schluessel: a.schluessel, office_api: officeApiUrl || null });
    },
    async cancelRun(a) {
      if (!a.ausfuehrer_url) return { ok: false, grund: 'Kein Executor konfiguriert.' };
      return post(a.ausfuehrer_url, { art: 'abbruch', run_id: a.run_id, agent_id: a.agent_id });
    },
    /** Hilfsfunktion für Executoren: baut eine signierte Rückmeldung. */
    rueckmeldung({ run_id, schluessel, ergebnis, nonce, zeit }) {
      const z = zeit || new Date().toISOString();
      const n = nonce || Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
      return { aktion: 'rueckmeldung', daten: { run_id, zeit: z, nonce: n, signatur: signiere(schluessel, z, n, ergebnis), ergebnis } };
    }
  };
}
