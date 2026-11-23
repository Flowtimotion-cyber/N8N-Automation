// Leitet die PostgreSQL-Fassung der Portal-API aus der Supabase-Vorlage ab (aufgerufen von team/n8n/bauen.mjs).
// Absichtlich keine zweite Kopie des ganzen Workflows: Änderungen an der Supabase-Vorlage kommen so automatisch mit.
//
// Unterschiede zur Supabase-Fassung:
//   Webhook            team-api-v2  →  team-api-v2-pg
//   Team-Daten laden   HTTP rpc/team_laden_plus  →  Postgres „Team-Daten lesen (SQL)“ + Code „Team-Daten laden“
//                      (der Code-Knoten behält den Namen, weil andere Knoten $('Team-Daten laden') lesen)
//   Schreibaufträge    macht aus den Beschreibungen von C_dbPostgre jetzt { sql, params }
//   In Supabase …      HTTP-Knoten  →  Postgres-Knoten „In Datenbank schreiben“ (Execute Query)
//   Ergebnis prüfen    Fehler kommen als { error } statt als HTTP-Status
// Zugangsdaten: Postgres-Credential muss nach dem Import in beiden Postgres-Knoten gewählt werden.
import { createHash } from 'node:crypto';

export const NAME = 'TEAM: Portal-API v2 (PostgreSQL, Agenten)';
export const WEBHOOK = 'team-api-v2-pg';

// Feste, aber andere Kennungen als in der Supabase-Fassung (sonst stören sich beide Workflows in n8n)
const uuid = text => {
	const h = createHash('sha256').update('postgre:' + text).digest('hex');
	return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
};

const postgres = (name, query, position, extra) => Object.assign({
	parameters: { operation: 'executeQuery', query, options: extra && extra.options || {} },
	name, type: 'n8n-nodes-base.postgres', typeVersion: 2.7, position, id: uuid(name)
}, extra && extra.onError ? { onError: extra.onError } : {});

const code = (name, jsCode, position) => ({
	parameters: { jsCode }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, id: uuid(name)
});

function ersetzeKnoten(wf, alt, ...neu) {
	const i = wf.nodes.findIndex(n => n.name === alt);
	if (i < 0) throw new Error('Supabase-Vorlage: Knoten „' + alt + '“ fehlt');
	wf.nodes.splice(i, 1, ...neu);
}

function umbenennen(wf, alt, neu) {
	if (wf.connections[alt]) { wf.connections[neu] = wf.connections[alt]; delete wf.connections[alt]; }
	for (const quelle of Object.values(wf.connections)) for (const ausgang of quelle.main || []) for (const z of ausgang || []) if (z.node === alt) z.node = neu;
}

export function umbau(wf, { dbCode }) {
	wf.name = NAME;
	for (const n of wf.nodes) n.id = uuid(n.name);

	const hook = wf.nodes.find(n => n.name === 'Team-API');
	hook.parameters.path = WEBHOOK;
	hook.webhookId = uuid('webhook Team-API');
	const wa = wf.nodes.find(n => n.name === 'WhatsApp an zuständige Person');
	if (wa && wa.webhookId) wa.webhookId = uuid('webhook WhatsApp');

	// Lesen: SQL-Funktion direkt aufrufen, Ergebnis unter dem bisherigen Knotennamen weitergeben
	const laden = wf.nodes.find(n => n.name === 'Team-Daten laden');
	ersetzeKnoten(wf, 'Team-Daten laden',
		postgres('Team-Daten lesen (SQL)', 'SELECT team_laden_plus() AS daten', [laden.position[0] - 112, laden.position[1] - 160]),
		code('Team-Daten laden', '// Ergebnis von team_laden_plus() in derselben Form wie bei Supabase (ein Objekt mit mitglieder, aufgaben, …)\nreturn [{ json: $input.first().json.daten || {} }];\n', laden.position));
	wf.connections['Team-API'].main[0] = [{ node: 'Team-Daten lesen (SQL)', type: 'main', index: 0 }];
	wf.connections['Team-Daten lesen (SQL)'] = { main: [[{ node: 'Team-Daten laden', type: 'main', index: 0 }]] };

	// Schreiben
	const schreib = wf.nodes.find(n => n.name === 'Schreibaufträge');
	schreib.parameters.jsCode = '// GENERIERT von team/n8n/bauen.mjs (Variante „postgre“) – nicht von Hand ändern\n// Beschreibungen aus „Anfrage prüfen“ (ggf. von „Social-Felder ergänzen“ ergänzt) → { sql, params } für den Postgres-Knoten\n\n'
		+ dbCode + '\n\nreturn ($input.first().json.ops || []).map(o => ({ json: C_dbPostgre.sql(o) }));\n';
	const http = wf.nodes.find(n => n.name === 'In Supabase schreiben');
	ersetzeKnoten(wf, 'In Supabase schreiben',
		postgres('In Datenbank schreiben', '={{ $json.sql }}', http.position, { onError: 'continueRegularOutput', options: { queryReplacement: '={{ $json.params }}' } }));
	umbenennen(wf, 'In Supabase schreiben', 'In Datenbank schreiben');

	wf.nodes.find(n => n.name === 'Ergebnis prüfen').parameters.jsCode = `// Prüft, ob alle Schreibaufträge geklappt haben (Postgres-Knoten mit „continueRegularOutput“:
// Fehler kommen als { message, error }; message ist die Meldung von PostgreSQL, error.description oft nur die Zeile)
const res = $input.all().map(i => i.json);
const fehler = res.filter(r => r && r.error);
const p = $('Anfrage prüfen').first().json;
if (fehler.length) {
	const f = fehler[0], e = f.error;
	return [{ json: { ok: false, fehler: 'Speichern hat nicht geklappt: ' + String(f.message || (e && (e.message || e.description)) || e).slice(0, 300) } }];
}
return [{ json: { ok: true, id: p.id || '' } }];
`;
	return wf;
}
