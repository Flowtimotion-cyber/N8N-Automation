// TEAM: Vorschlag-Hinweis (Telegram). Alle 10 Minuten: neue Vorschläge im Portal-Register „Vorschläge“ (Status „neu“)
// seit dem letzten Hinweis einsammeln und Timo per Telegram melden (gleicher Chat wie „Arbeitszeiten – Freitag Bitte um Freigabe“).
// Gedächtnis: $getWorkflowStaticData('global').seit = Zeitstempel des zuletzt gemeldeten Vorschlags. Keine Datenbankänderung nötig.
// Entscheiden tut Timo im Portal, Übersicht → „Für dich“ → Vorschlag → Annehmen oder Ablehnen (PR feature/vorschlaege-fuer-dich).
// Angelegt 29.10.2026 (KI-erstellt: Claude Code). Import per n8n-MCP; Credentials danach prüfen (der Import hängt sie nicht immer an).
import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const PORTAL = 'https://flowtimotion-cyber.github.io/N8N-Automation/team/';
const CHAT_TIMO = '1535402553';

const JS_FENSTER = `// Seit wann suchen? Beim ersten Lauf: die letzten 24 Stunden.
const sd = $getWorkflowStaticData('global');
const seit = sd.seit || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
return [{ json: { seit } }];`;

const JS_NACHRICHT = `// Baut eine Nachricht aus allen neuen Vorschlägen und merkt sich den jüngsten Zeitstempel.
const neu = $('Neue Vorschläge').all().map(i => i.json).filter(v => v && v.vorschlag_id);
if (!neu.length) return [];
const M = $('Mitglieder').all().map(i => i.json).filter(m => m && m.mitglied_id);
const name = id => (M.find(m => m.mitglied_id === id) || {}).name || id || 'jemand';
const kurz = (t, n) => { const s = String(t || '').replace(/\\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const zeile = v => '• ' + kurz(v.titel, 90) + ' (' + name(v.autor) + (v.bereich ? ', ' + v.bereich : '') + ')' + (v.text ? '\\n  ' + kurz(v.text, 160) : '');
const text = (neu.length === 1 ? 'Neuer Vorschlag im Team-Portal' : neu.length + ' neue Vorschläge im Team-Portal') + '\\n\\n' + neu.map(zeile).join('\\n') +
  '\\n\\nAnnehmen oder ablehnen: Übersicht → „Für dich“\\n' + ${JSON.stringify(PORTAL)} + '#/tab/start';
const sd = $getWorkflowStaticData('global');
sd.seit = neu.map(v => v.erstellt).sort().pop();
return [{ json: { text, anzahl: neu.length, seit: sd.seit } }];`;

const zeitplan = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Alle 10 Minuten', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } } });
const fenster = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Zeitfenster', parameters: { mode: 'runOnceForAllItems', jsCode: JS_FENSTER } } });
const vorschlaege = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Neue Vorschläge', executeOnce: true, parameters: { method: 'GET', url: expr(SUPA + 'team_vorschlaege?select=vorschlag_id,titel,text,bereich,autor,erstellt&status=eq.neu&erstellt=gt.{{ encodeURIComponent($json.seit) }}&order=erstellt.asc&limit=20'), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: { supabaseApi: newCredential('Supabase account') }, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 } });
const mitglieder = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Mitglieder', executeOnce: true, parameters: { method: 'GET', url: SUPA + 'team_mitglieder?select=mitglied_id,name', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', options: { timeout: 20000 } }, credentials: { supabaseApi: newCredential('Supabase account') }, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 } });
const nachricht = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Nachricht bauen', parameters: { mode: 'runOnceForAllItems', jsCode: JS_NACHRICHT } } });
const telegram = node({ type: 'n8n-nodes-base.telegram', version: 1.2, config: { name: 'Telegram an Timo', parameters: { resource: 'message', operation: 'sendMessage', chatId: CHAT_TIMO, text: expr('{{ $json.text }}'), additionalFields: { appendAttribution: false } }, credentials: { telegramApi: newCredential('Telegram Dialyse') } } });

export default workflow('team-vorschlag-hinweis', 'TEAM: Vorschlag-Hinweis (Telegram)')
  .add(zeitplan).to(fenster).to(vorschlaege).to(mitglieder).to(nachricht).to(telegram);
