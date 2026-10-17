// TEAM: Office-Ausführer Text (KI) – ein generischer Ausführer für alle Textagenten des KI Office (@n8n/workflow-sdk).
// Angelegt per MCP (create_workflow_from_code) am 17.10.2026; Credentials danach per update_workflow/setNodeCredential gesetzt.
//
// Für welche Agenten: alle, die nur Text liefern (Entwurf, Recherche-Gliederung, Prüfbericht, Review, Vorschlag) und deren Ergebnis
// als Notiz im Projekt landen darf – marketing-texter, social-planer, akademie-redakteur, vertrieb-recherche, angebots-pruefer,
// architektur-review, rekruiter. Agent-ID und Registry-Zeile kommen aus dem Aufruf bzw. aus office_agenten; nichts ist hier fest verdrahtet.
//
// Ablauf: Office-API ruft bei auftrag_starten die ausfuehrer_url des Agenten auf (POST { art, run_id, agent_id, rueckmelde_schluessel }).
//  1) Webhook antwortet sofort, Einstellungen (Modell, Preise, Adressen) werden gesetzt.
//  2) Registry-Zeile des Agenten laden (office_agenten), Token seiner Mitglieds-Identität aus team_mitglieder (Supabase-Credential, nie im Workflow),
//     Rückmelde-Schlüssel muss zum Run passen (office_run_schluessel) – sonst wird der Aufruf verworfen.
//  3) lebenszeichen → laden (nur die Projekte des Agenten) → Auftrag und Projektkontext zu einem Prompt bauen (Projektgrenze wird erneut geprüft).
//  4) Ein Modellaufruf (OpenAI-Credential; Modell in „Einstellungen“). Das Modell hat keine Werkzeuge: kein Internet, keine E-Mail, keine Dateien.
//  5) Antwort prüfen (Zugangsdaten-Zeilen raus, Titel und Kurzfassung ziehen), als Notiz ins Projekt des Runs (wenn notiz_speichern oder
//     social_entwurf erlaubt ist), Ereignisse, Artefakt, run_beenden abgeschlossen mit Verbrauch (Tokens, geschätzte Kosten).
//  6) Jeder Fehler nach dem Lebenszeichen → run_beenden fehlgeschlagen mit Fehlertext.
// Regeln: keine Zugangsdaten im Code, keine externen Aktionen, Werkzeuge nur aus der Registry-Allowlist des Agenten.
// Hinweis Modell: In der Registry steht je Agent das vorgesehene Claude-Modell. Dieser n8n-Ausführer nutzt das OpenAI-Credential
// (gpt-5-mini), weil in n8n kein Anthropic-Credential hinterlegt ist. Das tatsächlich genutzte Modell wird im Run (verbrauch.modell) gemeldet.
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const OFFICE_API = 'https://n8n.hm-storage.de/webhook/office-api';
const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const supabaseAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi' };
const officeOptionen = { timeout: 30000 };

const CODE_ZUGANG = `// Registry-Zeile, Identität und Auftrag prüfen. Token kommt aus Supabase (team_mitglieder), nicht aus dem Workflow.
const E = $('Einstellungen').first().json;
const a = $('Agent laden').all().map(i => i.json).find(x => x && x.agent_id === E.agent_id);
if (!a) throw new Error('Agent ' + E.agent_id + ' steht nicht in der Registry (office_agenten).');
if (a.aktiv === false) throw new Error('Agent ' + E.agent_id + ' ist in der Registry inaktiv.');
if (a.ausfuehrer && a.ausfuehrer !== 'n8n') throw new Error('Agent ' + E.agent_id + ' hat den Ausführer „' + a.ausfuehrer + '“, nicht n8n.');
if (!a.mitglied_id) throw new Error('Agent ' + E.agent_id + ' hat keine Token-Identität (mitglied_id) in der Registry.');
const m = $('Zugang laden').all().map(i => i.json).find(x => x && x.mitglied_id === a.mitglied_id);
if (!m || !m.token) throw new Error('Kein Token für ' + a.mitglied_id + ' in team_mitglieder.');
if (m.status !== 'aktiv') throw new Error('Mitglied ' + a.mitglied_id + ' ist nicht aktiv.');
const s = $('Schlüssel prüfen').all().map(i => i.json).find(x => x && x.run_id === E.run_id);
if (!s || !s.schluessel || String(s.schluessel) !== String(E.schluessel)) throw new Error('Rückmelde-Schlüssel passt nicht zum Run ' + E.run_id + '. Aufruf verworfen.');
const tools = Array.isArray(a.erlaubte_tools) ? a.erlaubte_tools.map(String) : [];
const notizTool = tools.includes('notiz_speichern') ? 'notiz_speichern' : (tools.includes('social_entwurf') ? 'social_entwurf' : null);
const agent = { name: String(a.name || E.agent_id), rolle: String(a.rolle || ''), beschreibung: String(a.beschreibung || ''), faehigkeiten: Array.isArray(a.faehigkeiten) ? a.faehigkeiten.map(String) : [], erlaubte_tools: tools, projekte: Array.isArray(a.projekte) ? a.projekte.map(String) : [], modell_registry: String(a.modell || '') };
return [{ json: { token: m.token, run_id: E.run_id, agent_id: E.agent_id, mitglied_id: a.mitglied_id, agent, notiz_tool: notizTool, notiz_erlaubt: !!notizTool } }];
`;

const CODE_AUFTRAG = `// Auftrag und Projektkontext zu einem Prompt bauen. Projektgrenze wird hier ein zweites Mal geprüft (die Office-API prüft sie schon).
const Z = $('Zugang prüfen').first().json;
const D = $('Daten laden').first().json || {};
if (D.ok === false) throw new Error('Office-API laden: ' + (D.fehler || 'fehlgeschlagen'));
const run = (D.runs || []).find(r => r && r.run_id === Z.run_id);
if (!run) throw new Error('Run ' + Z.run_id + ' ist für ' + Z.mitglied_id + ' nicht sichtbar.');
if (run.agent_id !== Z.agent_id) throw new Error('Run ' + Z.run_id + ' gehört zu Agent ' + run.agent_id + ', nicht zu ' + Z.agent_id + '.');
if (!Z.agent.projekte.includes(run.projekt)) throw new Error('Projekt „' + run.projekt + '“ liegt außerhalb der Projektgrenze von ' + Z.agent.name + '.');
const GEHEIM = /(passw\\w*|kennw\\w*|password|pwd|token|api[\\s_-]?key|secret|zugangsdaten)\\s*[:=]\\s*\\S|bearer\\s+[A-Za-z0-9._-]{16,}|\\bsk-[A-Za-z0-9]{16,}/i;
const sauber = (t, n) => String(t || '').split('\\n').filter(z => !GEHEIM.test(z)).join('\\n').trim().slice(0, n || 2000);
const fmt = s => s ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) + '.' + String(s).slice(0, 4) : '';
const name = id => ((D.mitglieder || []).find(m => m.mitglied_id === id) || {}).name || id || '';
const P = (D.projekte || []).find(p => p && p.name === run.projekt) || { name: run.projekt };
const A = (D.aufgaben || []).filter(a => a && a.projekt === run.projekt);
const offen = A.filter(a => a.status !== 'Erledigt').sort((a, b) => (Number(a.prio) || 2) - (Number(b.prio) || 2)).slice(0, 40);
const aufgabe = run.aufgabe_id ? A.find(a => a.aufgabe_id === run.aufgabe_id) : null;
const notizen = (D.notizen || []).filter(n => n && n.projekt === run.projekt).sort((a, b) => String(b.geaendert || '').localeCompare(String(a.geaendert || ''))).slice(0, 15);
const fruehere = (D.runs || []).filter(r => r && r.run_id !== run.run_id && r.agent_id === Z.agent_id && r.projekt === run.projekt && r.status === 'abgeschlossen' && r.zusammenfassung).sort((a, b) => String(b.erstellt || '').localeCompare(String(a.erstellt || ''))).slice(0, 3);
const zeileA = a => '- [' + (a.status || 'Offen') + ', P' + (Number(a.prio) || 2) + (a.deadline ? ', bis ' + fmt(a.deadline) : '') + (a.verantwortlich ? ', ' + name(a.verantwortlich) : '') + '] ' + (sauber(a.titel, 140).replace(/\\s+/g, ' ') || '(Titel ausgeblendet)');
const teile = [];
teile.push('## Projekt: ' + P.name);
if (P.beschreibung) teile.push(sauber(P.beschreibung, 1500));
if (Array.isArray(P.links) && P.links.length) teile.push('Links: ' + P.links.map(l => (l.titel ? l.titel + ' ' : '') + l.url).join(' | '));
if (aufgabe) teile.push('', '## Verknüpfte Aufgabe', '**' + sauber(aufgabe.titel, 200).replace(/\\s+/g, ' ') + '** (' + (aufgabe.status || 'Offen') + (aufgabe.deadline ? ', bis ' + fmt(aufgabe.deadline) : '') + ')', sauber(aufgabe.beschreibung, 4000) || '(keine Beschreibung)');
teile.push('', '## Offene Aufgaben im Projekt (' + offen.length + (A.length > offen.length ? ' von ' + A.length : '') + ')', offen.length ? offen.map(zeileA).join('\\n') : '- keine');
if (notizen.length) teile.push('', '## Vorhandene Notizen im Projekt (nur Titel)', notizen.map(n => '- ' + sauber(n.titel, 120).replace(/\\s+/g, ' ') + (n.geaendert ? ' (' + fmt(n.geaendert) + ')' : '')).join('\\n'));
if (fruehere.length) teile.push('', '## Deine früheren Ergebnisse in diesem Projekt (Kurzfassungen)', fruehere.map(r => '- ' + fmt(r.erstellt) + ': ' + sauber(r.zusammenfassung, 500).replace(/\\s+/g, ' ')).join('\\n'));
const system = [
  'Du bist „' + Z.agent.name + '“, ein Agent im KI Office des Teams Momentum.' + (Z.agent.rolle ? ' Rolle: ' + Z.agent.rolle : ''),
  Z.agent.beschreibung,
  Z.agent.faehigkeiten.length ? 'Fähigkeiten: ' + Z.agent.faehigkeiten.join(', ') + '.' : '',
  'Laut Registry erlaubte Werkzeuge: ' + (Z.agent.erlaubte_tools.join(', ') || 'keine') + '. In diesem Lauf hast du trotzdem keinen Zugriff auf Internet, E-Mail, Social-Media-Konten, Kalender, Repositories oder Dateien – du bekommst nur den Auftrag und den Projektkontext unten. Sag offen, wenn dir dadurch Informationen fehlen.',
  '',
  'Regeln:',
  '- Antworte auf Deutsch, klar und konkret, ohne Floskeln. Sprich das Team mit „du“ an.',
  '- Führe keine externen Aktionen aus und behaupte keine. Verlangt der Auftrag eine (E-Mail senden, veröffentlichen, buchen, bezahlen, löschen, Vertrag), liefere den fertigen Entwurf und schreibe am Ende die Zeile „Freigabe nötig: …“ mit der Aktion.',
  '- Erfinde keine Fakten, Zahlen, Namen, Preise oder Quellen. Was du nicht weißt, kennzeichne als Annahme oder stelle es unter „## Offene Fragen“.',
  '- Keine Bewertung von Personen. Keine personenbezogenen Daten über das Nötige hinaus. Keine Zugangsdaten.',
  '- Format: Markdown. Erste Zeile „# Titel“ (höchstens 80 Zeichen). Letzter Abschnitt „## Kurzfassung“ mit ein bis drei Sätzen: was du geliefert hast und was das Team als Nächstes tun muss.'
].filter(z => z !== null && z !== undefined).join('\\n');
const auftragText = sauber(run.auftrag, 6000) || '(leerer Auftrag)';
const user = '## Auftrag\\n' + auftragText + '\\n\\n' + teile.join('\\n');
const kennzahlen = { aufgaben_im_projekt: A.length, offen: offen.length, notizen: notizen.length, fruehere_runs: fruehere.length, verknuepfte_aufgabe: !!aufgabe, zeichen_prompt: system.length + user.length };
return [{ json: { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], run: { run_id: run.run_id, projekt: run.projekt, aufgabe_id: run.aufgabe_id || null, auftrag_kurz: auftragText.replace(/\\s+/g, ' ').slice(0, 120) }, kennzahlen, n8n_execution_id: $execution.id } }];
`;

const CODE_ANTWORT = `// Antwort des Modells prüfen: leer? Zugangsdaten-Zeilen raus, Titel und Kurzfassung ziehen, Notiz vorbereiten, Verbrauch berechnen.
const V = $('Auftrag vorbereiten').first().json;
const Z = $('Zugang prüfen').first().json;
const E = $('Einstellungen').first().json;
const r = $input.first().json || {};
if (r.error) throw new Error('Modell: ' + String(r.error.message || JSON.stringify(r.error)).slice(0, 300));
const roh = r.choices && r.choices[0] && r.choices[0].message ? String(r.choices[0].message.content || '').trim() : '';
const grund = r.choices && r.choices[0] ? r.choices[0].finish_reason : '';
if (!roh) throw new Error('Modell hat keine Antwort geliefert' + (grund ? ' (' + grund + ')' : '') + '.');
const GEHEIM = /(passw\\w*|kennw\\w*|password|pwd|token|api[\\s_-]?key|secret|zugangsdaten)\\s*[:=]\\s*\\S|bearer\\s+[A-Za-z0-9._-]{16,}|\\bsk-[A-Za-z0-9]{16,}/i;
const zeilen = roh.split('\\n');
const behalten = zeilen.filter(z => !GEHEIM.test(z));
const text = behalten.join('\\n').trim();
if (!text) throw new Error('Antwort bestand nur aus Zeilen, die wie Zugangsdaten aussehen – verworfen.');
let titel = ((text.match(/^#\\s+(.+)$/m) || [])[1] || '').trim().slice(0, 80);
if (!titel) titel = (Z.agent.name + ': ' + V.run.auftrag_kurz).slice(0, 80);
const km = text.match(/##\\s*Kurzfassung\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)/);
const kurz = (km ? km[1] : text).replace(/\\s+/g, ' ').trim().slice(0, 900) || titel;
const freigabe = /Freigabe nötig/i.test(text);
const u = r.usage || {};
const ein = Number(u.prompt_tokens) || 0, aus = Number(u.completion_tokens) || 0;
const kosten = Math.round((ein * Number(E.preis_ein_usd_mio) + aus * Number(E.preis_aus_usd_mio)) / 1e6 * Number(E.usd_in_eur) * 10000) / 10000;
const modell = String(r.model || E.modell);
let hash = null; try { hash = require('crypto').createHash('sha256').update(text, 'utf8').digest('hex'); } catch (e) {}
const jetzt = new Date().toISOString();
const notizTitel = (titel + ' – KI Office (' + Z.agent.name + ')').slice(0, 160);
const notizId = 'n_office_' + String(Z.run_id).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
const fuss = '\\n\\n---\\nErstellt vom KI Office: Agent „' + Z.agent.name + '“, Run ' + Z.run_id + ', Modell ' + modell + '. Entwurf – fachlich noch nicht abgenommen.';
return [{ json: { text, titel, kurz, freigabe_noetig: freigabe, zeilen_entfernt: zeilen.length - behalten.length, abgeschnitten: grund === 'length', modell, tokens_ein: ein, tokens_aus: aus, kosten_eur: kosten, inhalt_hash: hash, groesse: text.length,
  notiz_erlaubt: Z.notiz_erlaubt === true, notiz_tool: Z.notiz_tool, notiz_titel: notizTitel,
  notiz: { notiz_id: notizId, titel: notizTitel, projekt: V.run.projekt, inhalt: text + fuss, autor: Z.mitglied_id, geaendert_von: Z.mitglied_id, erstellt: jetzt, geaendert: jetzt } } }];
`;

const CODE_ABLAGE = `// Prüfen, ob die Notiz gespeichert wurde, und die drei Rückmeldungen an die Office-API vorbereiten.
const Z = $('Zugang prüfen').first().json;
const V = $('Auftrag vorbereiten').first().json;
const B = $('Antwort prüfen').first().json;
let notizOk = false, code = 0, versucht = false;
try { const r = $('Notiz speichern').first().json; versucht = true; code = Number(r.statusCode) || 0; notizOk = code >= 200 && code < 300; } catch (e) {}
const ablageort = notizOk ? 'Notiz „' + B.notiz_titel + '“ im Projekt „' + V.run.projekt + '“ (Team-Portal)' : '';
const verbrauch = { tokens_ein: B.tokens_ein, tokens_aus: B.tokens_aus, modell: B.modell, kosten_eur: B.kosten_eur };
const ablageHinweis = notizOk ? 'Vollständiger Text: ' + ablageort + '.' : (versucht ? 'Notiz konnte nicht gespeichert werden (HTTP ' + code + ') – nur die Kurzfassung liegt im Office.' : 'Kein Ablage-Werkzeug (notiz_speichern/social_entwurf) in der Registry – nur die Kurzfassung liegt im Office.');
const zusammenfassung = (B.kurz + ' ' + ablageHinweis + (B.freigabe_noetig ? ' Enthält „Freigabe nötig“ – es wurde keine externe Aktion ausgeführt.' : '') + (B.abgeschnitten ? ' Achtung: Antwort wurde vom Modell abgeschnitten (Längenlimit).' : '') + ' Modell ' + B.modell + ', ' + B.tokens_ein + '/' + B.tokens_aus + ' Tokens, ca. ' + B.kosten_eur + ' € (geschätzt). Entwurf, fachlich noch nicht abgenommen.').slice(0, 3900);
const details = { modell: B.modell, tokens_ein: B.tokens_ein, tokens_aus: B.tokens_aus, kosten_eur_geschaetzt: B.kosten_eur, zeichen: B.groesse, zeilen_entfernt: B.zeilen_entfernt, abgeschnitten: B.abgeschnitten, freigabe_noetig: B.freigabe_noetig, notiz_gespeichert: notizOk, notiz_http: code, notiz_id: notizOk ? B.notiz.notiz_id : null, n8n_execution_id: V.n8n_execution_id, workflow: $workflow.name };
return [{ json: { token: Z.token, run_id: Z.run_id, notiz_ok: notizOk,
  ereignis: { run_id: Z.run_id, art: notizOk ? 'tool' : 'schritt', tool: notizOk ? B.notiz_tool : null, titel: notizOk ? 'Entwurf erstellt und als Notiz gespeichert: ' + B.titel : 'Entwurf erstellt: ' + B.titel + (versucht ? ' (Notiz nicht gespeichert, HTTP ' + code + ')' : ''), quelle_ref: notizOk ? 'team_notizen/' + B.notiz.notiz_id : null, details, idempotenz: 'txt-ergebnis-' + Z.run_id },
  artefakt: { run_id: Z.run_id, art: notizOk ? 'notiz' : 'text', titel: B.titel, zusammenfassung: B.kurz.slice(0, 1000), ablageort, inhalt_hash: B.inhalt_hash, groesse: B.groesse },
  beenden: { run_id: Z.run_id, status: 'abgeschlossen', zusammenfassung, verbrauch, n8n_execution_id: V.n8n_execution_id } } }];
`;

const CODE_FEHLER = `// Fehler aus einem der Schritte in einen Text fassen, den das Office anzeigen kann.
let Z = null; try { Z = $('Zugang prüfen').first().json; } catch (e) {}
if (!Z || !Z.token) throw new Error('Kein Zugang – Fehler kann nicht an die Office-API gemeldet werden.');
const j = $input.first().json || {};
const e = j.error || j;
const msg = typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e).slice(0, 500));
return [{ json: { token: Z.token, run_id: Z.run_id, fehler: ('Ausführer Text n8n (Execution ' + $execution.id + '): ' + msg).slice(0, 1900) } }];
`;

const eingang = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Auftrag vom Office', parameters: { httpMethod: 'POST', path: 'office-ausfuehrer-text', responseMode: 'onReceived', options: {} }, position: [0, 300] },
  output: [{ body: { art: 'start', run_id: 'run_test', agent_id: 'marketing-texter', rueckmelde_schluessel: 'nur-im-test' } }] });

const einstellungen = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellungen', parameters: { mode: 'manual', assignments: { assignments: [
  { id: 'e1', name: 'run_id', type: 'string', value: expr('{{ $json.body?.run_id ?? "" }}') },
  { id: 'e2', name: 'agent_id', type: 'string', value: expr('{{ $json.body?.agent_id ?? "" }}') },
  { id: 'e3', name: 'art', type: 'string', value: expr('{{ $json.body?.art ?? "" }}') },
  { id: 'e4', name: 'schluessel', type: 'string', value: expr('{{ $json.body?.rueckmelde_schluessel ?? "" }}') },
  { id: 'e5', name: 'office_api', type: 'string', value: OFFICE_API },
  { id: 'e6', name: 'supabase', type: 'string', value: SUPABASE },
  { id: 'e7', name: 'modell', type: 'string', value: 'gpt-5-mini' },
  { id: 'e8', name: 'max_tokens', type: 'number', value: 6000 },
  { id: 'e9', name: 'preis_ein_usd_mio', type: 'number', value: 0.25 },
  { id: 'e10', name: 'preis_aus_usd_mio', type: 'number', value: 2 },
  { id: 'e11', name: 'usd_in_eur', type: 'number', value: 0.92 }
] }, options: {} }, position: [220, 300] },
  output: [{ run_id: 'run_test', agent_id: 'marketing-texter', art: 'start', schluessel: 'nur-im-test', office_api: OFFICE_API, supabase: SUPABASE, modell: 'gpt-5-mini', max_tokens: 6000, preis_ein_usd_mio: 0.25, preis_aus_usd_mio: 2, usd_in_eur: 0.92 }] });

const startPruefen = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Start?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [
  { leftValue: expr('{{ $json.art }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'start' },
  { leftValue: expr('{{ $json.run_id }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[A-Za-z0-9_.:-]{6,80}$' },
  { leftValue: expr('{{ $json.agent_id }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[a-z0-9-]{3,60}$' },
  { leftValue: expr('{{ $json.schluessel }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^[A-Za-z0-9_-]{16,128}$' }
], combinator: 'and' } }, position: [440, 300] } });

const abbruch = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Abbruch zur Kenntnis', parameters: {}, position: [660, 520] }, output: [{}] });

const agentLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Agent laden', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $json.supabase }}office_agenten?agent_id=eq.{{ $json.agent_id }}&select=agent_id,name,rolle,beschreibung,faehigkeiten,erlaubte_tools,modell,ausfuehrer,mitglied_id,projekte,aktiv'), ...supabaseAuth, options: {} }, position: [660, 200] },
  output: [{ agent_id: 'marketing-texter', name: 'Marketing-Texter', rolle: '…', beschreibung: '…', faehigkeiten: [], erlaubte_tools: ['notiz_speichern'], modell: 'claude-sonnet-5-5', ausfuehrer: 'n8n', mitglied_id: 'agent-claude', projekte: ['Social Media'], aktiv: true }] });

const zugangLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Zugang laden', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $("Einstellungen").first().json.supabase }}team_mitglieder?mitglied_id=eq.{{ $json.mitglied_id ?? "-" }}&select=mitglied_id,status,token'), ...supabaseAuth, options: {} }, position: [880, 200] },
  output: [{ mitglied_id: 'agent-claude', status: 'aktiv', token: 'nur-im-test' }] });

const schluesselPruefen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Schlüssel prüfen', alwaysOutputData: true, parameters: { method: 'GET', url: expr('{{ $("Einstellungen").first().json.supabase }}office_run_schluessel?run_id=eq.{{ $("Einstellungen").first().json.run_id }}&select=run_id,schluessel'), ...supabaseAuth, options: {} }, position: [1100, 200] },
  output: [{ run_id: 'run_test', schluessel: 'nur-im-test' }] });

const zugangPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Zugang prüfen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ZUGANG }, position: [1320, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', agent_id: 'marketing-texter', mitglied_id: 'agent-claude', agent: { name: 'Marketing-Texter', rolle: '', beschreibung: '', faehigkeiten: [], erlaubte_tools: ['notiz_speichern'], projekte: ['Social Media'], modell_registry: 'claude-sonnet-5-5' }, notiz_tool: 'notiz_speichern', notiz_erlaubt: true }] });

const lebenszeichen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Lebenszeichen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "lebenszeichen", daten: { run_id: $("Zugang prüfen").first().json.run_id, n8n_execution_id: String($execution.id) } }) }}'), options: officeOptionen }, position: [1540, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const datenLaden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Daten laden', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "laden", daten: {} }) }}'), options: officeOptionen }, position: [1760, 200] },
  output: [{ ok: true, projekte: [], aufgaben: [], mitglieder: [], notizen: [], runs: [] }] });

const auftragVorbereiten = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Auftrag vorbereiten', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_AUFTRAG }, position: [1980, 200] },
  output: [{ messages: [], run: { run_id: 'run_test', projekt: 'Social Media', aufgabe_id: null, auftrag_kurz: '…' }, kennzahlen: { aufgaben_im_projekt: 0, offen: 0, notizen: 0, fruehere_runs: 0 }, n8n_execution_id: '1' }] });

const ereignisKontext = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Kontext geladen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ token: $("Zugang prüfen").first().json.token, aktion: "ereignis", daten: { run_id: $("Zugang prüfen").first().json.run_id, art: "schritt", titel: "Auftrag und Projektkontext über die Office-API geladen (" + $json.kennzahlen.offen + " offene Aufgaben, " + $json.kennzahlen.notizen + " Notizen, " + $json.kennzahlen.fruehere_runs + " frühere Läufe)", quelle_ref: "https://n8n.hm-storage.de/webhook/office-api#laden", details: { kennzahlen: $json.kennzahlen, modell: $("Einstellungen").first().json.modell, n8n_execution_id: $json.n8n_execution_id, workflow: $workflow.name }, idempotenz: "txt-kontext-" + $json.n8n_execution_id } }) }}'), options: officeOptionen }, position: [2200, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const modell = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Modell (OpenAI)', onError: 'continueErrorOutput', parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ model: $("Einstellungen").first().json.modell, max_completion_tokens: $("Einstellungen").first().json.max_tokens, messages: $("Auftrag vorbereiten").first().json.messages }) }}'), options: { timeout: 240000 } }, position: [2420, 200] },
  output: [{ choices: [{ message: { content: '# …\n\n## Kurzfassung\n…' }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 }, model: 'gpt-5-mini' }] });

const antwortPruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Antwort prüfen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ANTWORT }, position: [2640, 200] },
  output: [{ text: '# …', titel: '…', kurz: '…', freigabe_noetig: false, modell: 'gpt-5-mini', tokens_ein: 0, tokens_aus: 0, kosten_eur: 0, inhalt_hash: null, groesse: 1, notiz_erlaubt: true, notiz_tool: 'notiz_speichern', notiz_titel: '…', notiz: {} }] });

const notizErlaubt = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Notiz erlaubt?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $json.notiz_erlaubt }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [2860, 200] } });

const notizSpeichern = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Notiz speichern', onError: 'continueRegularOutput', parameters: { method: 'POST', url: SUPABASE + 'team_notizen?on_conflict=notiz_id', ...supabaseAuth, sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.notiz) }}'), options: { response: { response: { fullResponse: true, neverError: true } } } }, position: [3080, 80] },
  output: [{ statusCode: 201, headers: {}, body: '' }] });

const ablagePruefen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ablage prüfen', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_ABLAGE }, position: [3300, 200] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', notiz_ok: true, ereignis: {}, artefakt: {}, beenden: {} }] });

const ereignisErgebnis = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ereignis: Entwurf erstellt', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "ereignis", daten: $("Ablage prüfen").first().json.ereignis }) }}'), options: officeOptionen }, position: [3520, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'in_arbeit' }] });

const artefaktMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Artefakt melden', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "artefakt", daten: $("Ablage prüfen").first().json.artefakt }) }}'), options: officeOptionen }, position: [3740, 200] },
  output: [{ ok: true, artefakt_id: 'art_test' }] });

const runAbschliessen = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run abschließen', onError: 'continueErrorOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $("Ablage prüfen").first().json.token, aktion: "run_beenden", daten: $("Ablage prüfen").first().json.beenden }) }}'), options: officeOptionen }, position: [3960, 200] },
  output: [{ ok: true, run_id: 'run_test', status: 'abgeschlossen', angenommen: true }] });

const fertig = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Fertig', parameters: {}, position: [4180, 200] }, output: [{}] });

const fehlertext = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fehlertext bauen', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CODE_FEHLER }, position: [3080, 520] },
  output: [{ token: 'nur-im-test', run_id: 'run_test', fehler: 'Ausführer Text n8n: …' }] });

const fehlerMelden = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Run fehlgeschlagen melden', onError: 'continueRegularOutput', parameters: { method: 'POST', url: OFFICE_API, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: $json.token, aktion: "run_beenden", daten: { run_id: $json.run_id, status: "fehlgeschlagen", fehler: $json.fehler } }) }}'), options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } } }, position: [3300, 520] },
  output: [{ statusCode: 200, body: { ok: true } }] });

const hinweise = sticky('## TEAM: Office-Ausführer Text (KI)\nGenerischer Ausführer für Textagenten des KI Office (docs/office/ARCHITEKTUR.md Abschnitt 10). Quelle: office/n8n/ausfuehrer-text.workflow.js.\n\n**Zugang:** Registry-Zeile des Agenten aus office_agenten, Token seiner Mitglieds-Identität zur Laufzeit aus team_mitglieder (Supabase-Credential). Der Rückmelde-Schlüssel aus dem Aufruf muss zu office_run_schluessel passen, sonst wird der Aufruf verworfen.\n\n**Ein Modellaufruf** (OpenAI-Credential, Modell und Preise in „Einstellungen“). Kein Internet, keine E-Mail, keine Dateien. Ergebnis wird als Notiz ins Projekt gelegt, wenn notiz_speichern oder social_entwurf erlaubt ist.\n\n**Keine externen Aktionen.** Verlangt der Auftrag eine, liefert der Agent nur den Entwurf mit „Freigabe nötig“.', [], { color: 4, width: 480, height: 330, position: [0, -60] });

export default workflow('team-office-ausfuehrer-text', 'TEAM: Office-Ausführer Text (KI)')
  .add(hinweise)
  .add(eingang.to(einstellungen))
  .add(einstellungen.to(startPruefen))
  .add(startPruefen.output(0).to(agentLaden))
  .add(startPruefen.output(1).to(abbruch))
  .add(agentLaden.to(zugangLaden))
  .add(zugangLaden.to(schluesselPruefen))
  .add(schluesselPruefen.to(zugangPruefen))
  .add(zugangPruefen.to(lebenszeichen))
  .add(lebenszeichen.output(0).to(datenLaden))
  .add(datenLaden.output(0).to(auftragVorbereiten))
  .add(auftragVorbereiten.output(0).to(ereignisKontext))
  .add(ereignisKontext.output(0).to(modell))
  .add(modell.output(0).to(antwortPruefen))
  .add(antwortPruefen.output(0).to(notizErlaubt))
  .add(notizErlaubt.output(0).to(notizSpeichern))
  .add(notizErlaubt.output(1).to(ablagePruefen))
  .add(notizSpeichern.to(ablagePruefen))
  .add(ablagePruefen.output(0).to(ereignisErgebnis))
  .add(ereignisErgebnis.output(0).to(artefaktMelden))
  .add(artefaktMelden.output(0).to(runAbschliessen))
  .add(runAbschliessen.output(0).to(fertig))
  .add(lebenszeichen.output(1).to(fehlertext))
  .add(datenLaden.output(1).to(fehlertext))
  .add(auftragVorbereiten.output(1).to(fehlertext))
  .add(ereignisKontext.output(1).to(fehlertext))
  .add(modell.output(1).to(fehlertext))
  .add(antwortPruefen.output(1).to(fehlertext))
  .add(ablagePruefen.output(1).to(fehlertext))
  .add(ereignisErgebnis.output(1).to(fehlertext))
  .add(artefaktMelden.output(1).to(fehlertext))
  .add(runAbschliessen.output(1).to(fehlertext))
  .add(fehlertext.to(fehlerMelden));
