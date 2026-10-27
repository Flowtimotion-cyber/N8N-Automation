// Baut die n8n-SDK-Datei für Workflow A aus der Vorlage und kommunikation/lib/whatsapp.js.
// Start: node kommunikation/n8n/bauen.mjs  → schreibt kommunikation/n8n/wa-eingang.workflow.gen.js
// Die erzeugte Datei wird per n8n-MCP (validate_workflow, create/update) eingespielt. Nicht von Hand ändern.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const lib = readFileSync(join(hier, '..', 'lib', 'whatsapp.js'), 'utf8').replace(/^export /gm, '');
const vorlage = readFileSync(join(hier, 'wa-eingang.workflow.js'), 'utf8');

const code = `// GENERIERT von kommunikation/n8n/bauen.mjs aus kommunikation/lib/whatsapp.js – nicht von Hand ändern.
${lib}
// ===== Knoten: Webhook-Body normalisieren =====
const E = $('Einstellungen').first().json;
let body;
try { body = JSON.parse($('Rohdaten lesen').first().json.roh); } catch (e) { return []; }
const r = normalisiere(body, E.phone_number_id, Date.now());
return [...r.nachrichten, ...r.status].map(x => ({ json: x }));
`;

const RPC = /RPC\('([^']+)', '([a-z_]+)', (expr\('.*?'\))\);/g;
const ausgeschrieben = vorlage.replace(RPC, (_, name, fn, body) => `node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: '${name}',
    parameters: {
      method: 'POST', url: SUPABASE + 'rpc/${fn}',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body},
      options: { timeout: 15000 }
    },
    credentials: supabase,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000
  }
});`);
if (/\bRPC\(/.test(ausgeschrieben.replace(/\/\/.*$/gm, ''))) throw new Error('RPC-Aufruf nicht ausgeschrieben');
if (!vorlage.includes('__CODE_NORMALISIEREN__')) throw new Error('Platzhalter fehlt in der Vorlage');
writeFileSync(join(hier, 'wa-eingang.workflow.gen.js'), ausgeschrieben.replace("'__CODE_NORMALISIEREN__'", JSON.stringify(code)));
console.log('geschrieben: kommunikation/n8n/wa-eingang.workflow.gen.js');
