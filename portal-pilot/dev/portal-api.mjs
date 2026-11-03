// TESTADAPTER der Portal-API: führt den ECHTEN Code des n8n-Workflows portal-pilot/n8n/portal-api.workflow.json aus
// (Code-Knoten „Anfrage prüfen“, „Social-Felder ergänzen“, „Antwort bauen“, „Schreibaufträge“, „Ergebnis prüfen“ und die Logik
// der Knoten „Gespeichert?“ / „Gespeichert“ / „Speicherfehler melden“), siehe dev/n8n-laufzeit.mjs. Die Supabase-Aufrufe landen
// in einer PostgREST-Nachbildung (dev/postgrest.mjs): entweder Tabellen im Speicher oder ein echter lokaler PostgreSQL.
// Es gibt hier KEINE zweite Fassung der Rechte- oder Prüf-Logik: Was der Testserver antwortet, antwortet der Workflow-Code.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeWorkflow, ausfuehren } from './n8n-laufzeit.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
export const WORKFLOW_PFAD = join(hier, '..', 'n8n', 'portal-api.workflow.json');
let wf = null;
export function workflow() { return wf || (wf = ladeWorkflow(WORKFLOW_PFAD)); }

/**
 * Eine Anfrage beantworten, wie n8n es täte. rest: PostgREST-Nachbildung (SpeicherRest oder PostgresRest).
 * body: Text (wie vom Browser mit text/plain) oder Objekt. Gibt { code, antwort, protokoll, aufrufe } zurück und wirft nie.
 */
export async function portalApi(rest, body, headers) {
  const aufrufe = [];
  try {
    const r = await ausfuehren(workflow(), { body, headers: headers || {} }, rest, { aufrufe });
    return Object.assign(r, { aufrufe });
  } catch (e) {
    return { code: 500, antwort: { ok: false, fehler: 'Testadapter: ' + e.message }, protokoll: [], aufrufe };
  }
}
