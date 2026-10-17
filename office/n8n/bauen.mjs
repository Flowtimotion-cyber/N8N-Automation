#!/usr/bin/env node
// Baut aus office/lib/*.js den Quelltext für den n8n-Code-Knoten „Anfrage prüfen“ und daraus die importierbare Workflow-Datei.
//   node office/n8n/bauen.mjs        → office/n8n/code/anfrage-pruefen.js, office/n8n/office-api.workflow.json
// Warum ein Bündel? n8n-Code-Knoten können keine lokalen Module importieren. Damit Zustandsmaschine, Rechte und Freigaben
// in n8n, Testserver und Tests wortgleich sind, wird derselbe Code nur zusammengefügt (import/export entfernt), nicht kopiert.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const LIB = join(hier, '..', 'lib');
export const MODULE = ['hash.js', 'zustand.js', 'freigabe.js', 'rechte.js', 'signatur.js', 'idempotenz.js', 'postgrest.js', 'verarbeitung.js'];

export function buendel() {
  const teile = [], namen = new Map();
  for (const f of MODULE) {
    let src = readFileSync(join(LIB, f), 'utf8').replace(/\r\n/g, '\n'); // Windows-Checkouts mit CRLF ergeben sonst ein anderes Bündel
    src = src.split('\n').filter(z => !/^import\s/.test(z)).map(z => z.replace(/^export\s+(const|function|let|class)\s/, '$1 ')).join('\n');
    for (const m of src.matchAll(/^(?:const|function|let|class)\s+([A-Za-z_$][\w$]*)/gm)) { if (namen.has(m[1])) throw new Error('Doppelter Name im Bündel: ' + m[1] + ' in ' + f + ' und ' + namen.get(m[1])); namen.set(m[1], f); }
    teile.push('// ===== office/lib/' + f + ' =====\n' + src.trim());
  }
  const glue = `// ===== n8n-Anbindung (TEAM: Office-API, Knoten „Anfrage prüfen“) =====
// Eingang: Webhook „Office-API“ (Body { token, aktion, daten }) oder Zeitplan (Wartung). Daten: HTTP-Knoten „Team-Daten laden“ (rpc/team_laden).
let b, ueberWebhook = true;
try { b = $('Office-API').first().json.body || {}; } catch (e) { b = { aktion: 'wartung', intern: true }; ueberWebhook = false; }
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
if (ueberWebhook && b && typeof b === 'object') delete b.intern;   // „intern“ gilt nur für den Zeitplan-Pfad, nie von außen
const D = $('Team-Daten laden').first().json || {};
const r = verarbeiten({ body: b, D, jetzt: new Date().toISOString(), quelle: 'n8n' });
return [{ json: { weiter: r.weiter, code: r.code || 200, antwort: r.antwort || { ok: false, fehler: 'Keine Antwort' }, ops: r.ops || [], extern: r.extern || null, ich: r.ich || null, intern: b.intern === true } }];
`;
  return '// GENERIERT von office/n8n/bauen.mjs aus office/lib/*.js – nicht von Hand ändern.\n' + teile.join('\n\n') + '\n\n' + glue;
}

const ORIGIN = 'https://flowtimotion-cyber.github.io';
const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';

export function workflowJson(code) {
  const n = (name, type, typeVersion, parameters, position, extra) => Object.assign({ parameters, name, type, typeVersion, position }, extra || {});
  const nodes = [
    n('Office-API', 'n8n-nodes-base.webhook', 2.1, { httpMethod: 'POST', path: 'office-api', responseMode: 'responseNode', options: { allowedOrigins: ORIGIN } }, [0, 300]),
    n('Wartung alle 5 Minuten', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, [0, 560]),
    n('Wartungsauftrag', 'n8n-nodes-base.set', 3.4, { assignments: { assignments: [{ id: 'a1', name: 'body', type: 'object', value: '={{ { "aktion": "wartung", "intern": true } }}' }] }, options: {} }, [200, 560]),
    n('Team-Daten laden', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: SUPABASE + 'rpc/team_laden', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} }, [420, 300]),
    n('Anfrage prüfen', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: code }, [640, 300]),
    n('Was ist zu tun?', 'n8n-nodes-base.switch', 3.2, { mode: 'expression', numberOutputs: 3, output: '={{ $json.weiter }}' }, [860, 300]),
    n('Fehler melden', 'n8n-nodes-base.respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.antwort) }}', options: { responseCode: '={{ $json.code }}' } }, [1080, 120]),
    n('Antwort senden', 'n8n-nodes-base.respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.antwort) }}', options: {} }, [1080, 300]),
    n('Schreibaufträge', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: 'return ($input.first().json.ops || []).map(o => ({ json: o }));' }, [1080, 480]),
    n('In Supabase schreiben', 'n8n-nodes-base.httpRequest', 4.2, { method: '={{ $json.methode }}', url: "={{ '" + SUPABASE + "' + $json.pfad }}", authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body || {}) }}', options: { response: { response: { fullResponse: true, neverError: true } } } }, [1300, 480]),
    n('Nacheinander schreiben', 'n8n-nodes-base.splitInBatches', 3, { batchSize: 1, options: {} }, [1190, 640]),
    n('Ergebnis prüfen', 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: readFileSync(join(hier, 'code', 'ergebnis-pruefen.js'), 'utf8') }, [1520, 480]),
    n('Gespeichert?', 'n8n-nodes-base.if', 2.2, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, [1740, 480]),
    n('Externe Wirkung?', 'n8n-nodes-base.switch', 3.2, { mode: 'expression', numberOutputs: 3, output: "={{ !$json.extern ? 0 : ($json.extern.art === 'aktion' ? 2 : ($json.extern.ausfuehrer_url ? 1 : 0)) }}" }, [1960, 380]),
    n('Ausführer anstoßen', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: '={{ $json.extern.ausfuehrer_url }}', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ art: $json.extern.art, run_id: $json.extern.run_id, agent_id: $json.extern.agent_id, rueckmelde_schluessel: $json.extern.schluessel || null }) }}', options: { timeout: 10000 } }, [2180, 260], { onError: 'continueRegularOutput' }),
    n('Externe Aktion ausführen (Platzhalter)', 'n8n-nodes-base.noOp', 1, {}, [2180, 500], { notes: 'Hier die echten Knoten anschließen (E-Mail, Social-Post …). $json.extern enthält aktion, inhalt, run_id, freigabe_id. Die Freigabe wurde serverseitig geprüft und ist jetzt „verwendet“. Ohne angeschlossenen Knoten passiert nichts nach außen.', notesInFlow: true }),
    n('Antwort nötig?', 'n8n-nodes-base.if', 2.2, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: "={{ $('Ergebnis prüfen').first().json.intern !== true }}", operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, [2400, 380]),
    n('Gespeichert', 'n8n-nodes-base.respondToWebhook', 1.5, { respondWith: 'json', responseBody: "={{ JSON.stringify($('Ergebnis prüfen').first().json.antwort) }}", options: { responseCode: "={{ $('Ergebnis prüfen').first().json.code }}" } }, [2620, 300]),
    n('Wartung fertig', 'n8n-nodes-base.noOp', 1, {}, [2620, 480]),
    n('Speicherfehler melden', 'n8n-nodes-base.respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, fehler: $json.fehler }) }}', options: { responseCode: '={{ $json.code || 500 }}' } }, [1960, 640]),
    n('Hinweise', 'n8n-nodes-base.stickyNote', 1, { content: '## TEAM: Office-API\nBackend des KI Office (docs/office/). Code im Knoten „Anfrage prüfen“ wird aus office/lib/*.js generiert (node office/n8n/bauen.mjs).\n\n**Vor dem Aktivieren:** 1) supabase/team_office.sql ausführen. 2) In „Team-Daten laden“ und „In Supabase schreiben“ das bestehende Supabase-Credential (service_role) wählen. 3) Webhook-URL muss …/webhook/office-api sein.\n\nKeine Zugangsdaten im Code. Rechte, Zustandsmaschine, Freigaben und Idempotenz werden serverseitig im Code-Knoten erzwungen. Siehe docs/office/SETUP.md.', height: 320, width: 420 }, [0, -60])
  ];
  const c = (von, nach, ausgang) => { connections[von] = connections[von] || { main: [] }; while (connections[von].main.length <= (ausgang || 0)) connections[von].main.push([]); connections[von].main[ausgang || 0].push({ node: nach, type: 'main', index: 0 }); };
  const connections = {};
  c('Office-API', 'Team-Daten laden'); c('Wartung alle 5 Minuten', 'Wartungsauftrag'); c('Wartungsauftrag', 'Team-Daten laden');
  c('Team-Daten laden', 'Anfrage prüfen'); c('Anfrage prüfen', 'Was ist zu tun?');
  c('Was ist zu tun?', 'Fehler melden', 0); c('Was ist zu tun?', 'Antwort senden', 1); c('Was ist zu tun?', 'Schreibaufträge', 2);
  c('Schreibaufträge', 'Nacheinander schreiben'); c('Nacheinander schreiben', 'Ergebnis prüfen', 0); c('Nacheinander schreiben', 'In Supabase schreiben', 1); c('In Supabase schreiben', 'Nacheinander schreiben'); c('Ergebnis prüfen', 'Gespeichert?');
  c('Gespeichert?', 'Externe Wirkung?', 0); c('Gespeichert?', 'Speicherfehler melden', 1);
  c('Externe Wirkung?', 'Antwort nötig?', 0); c('Externe Wirkung?', 'Ausführer anstoßen', 1); c('Externe Wirkung?', 'Externe Aktion ausführen (Platzhalter)', 2);
  c('Ausführer anstoßen', 'Antwort nötig?'); c('Externe Aktion ausführen (Platzhalter)', 'Antwort nötig?');
  c('Antwort nötig?', 'Gespeichert', 0); c('Antwort nötig?', 'Wartung fertig', 1);
  return { name: 'TEAM: Office-API', nodes, connections, settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none', timezone: 'Europe/Berlin' }, meta: { generiert: 'office/n8n/bauen.mjs', hinweis: 'Importieren über n8n → Workflows → Import from File. Credentials setzt Timo selbst.' } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = buendel();
  writeFileSync(join(hier, 'code', 'anfrage-pruefen.js'), code);
  writeFileSync(join(hier, 'office-api.workflow.json'), JSON.stringify(workflowJson(code), null, 2) + '\n');
  console.log('Geschrieben: office/n8n/code/anfrage-pruefen.js (' + code.length + ' Zeichen), office/n8n/office-api.workflow.json');
}
