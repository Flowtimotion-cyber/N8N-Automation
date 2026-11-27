#!/usr/bin/env node
// Baut Testkopien der Team-Workflows als n8n-JSON zum Import über die Oberfläche („Import from File“):
//   node team/n8n/bauen-testkopien.mjs   →   team/n8n/out/<name>.TEST.workflow.json
//
// Eine Testkopie ist der Workflow aus dem Repo mit
//   - Namen „TEST: …“, eigenem Webhook-Pfad „<pfad>-test“ und neuer webhookId (der Live-Workflow bleibt unberührt),
//   - Zugangsdaten „Supabase account“ in allen Supabase-Knoten (n8n ordnet sie beim Import über die ID zu),
//   - ohne Fehler-Workflow (Fehler beim Testen sollen keine Meldung an Timo auslösen), inaktiv.
// Achtung: Die Testkopien arbeiten mit den ECHTEN Daten (gleiche Supabase-Datenbank, gleicher Storage).
// Zum Ausprobieren: TesterProxy mit  --umleiten team-api-v2=team-api-v2-test,team-social=team-social-test
//
// Der Social-Workflow liegt nur als SDK-Datei vor (social.workflow.gen.js); sie wird hier in n8n-JSON umgewandelt.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { workflowBauen } from './bauen.mjs';
import { workflowLaden } from '../test/n8n-simulator.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const SUPABASE = { supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } };

// SDK-Wert → n8n-Parameter: expr('…') wird zum Ausdruck „=…“, newCredential('X') zu den bekannten Zugangsdaten
const wert = v => {
	if (v && typeof v === 'object' && 'ausdruck' in v) return '=' + v.ausdruck;
	if (Array.isArray(v)) return v.map(wert);
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wert(x)]));
	return v;
};

// SDK-Datei → n8n-Workflow-JSON (Knoten, Verbindungen, Einstellungen)
export function sdkNachJson(datei, einstellungen) {
	const wf = workflowLaden(datei);
	const liste = [...wf.knoten.values()];
	const nodes = liste.map((n, i) => {
		const { name, parameters = {}, credentials, ...rest } = n.config;
		const k = { id: randomUUID(), name, type: n.type, typeVersion: n.version, position: [250 * (i % 8), 200 * Math.floor(i / 8)], parameters: wert(parameters) };
		for (const f of ['executeOnce', 'alwaysOutputData', 'onError', 'retryOnFail', 'maxTries', 'waitBetweenTries']) if (rest[f] !== undefined) k[f] = rest[f];
		if (credentials) k.credentials = SUPABASE;
		return k;
	});
	const connections = {};
	for (const n of liste) {
		const ausgaenge = n.type === 'n8n-nodes-base.switch'
			? (n.config.parameters.rules.values).map((_, i) => n.faelle[i] ? [{ node: n.faelle[i].name, type: 'main', index: 0 }] : [])
			: [n.weiter.map(z => ({ node: z.name, type: 'main', index: 0 }))];
		if (ausgaenge.some(a => a.length)) connections[n.name] = { main: ausgaenge };
	}
	return { name: wf.name, nodes, connections, settings: einstellungen };
}

// Workflow-JSON → Testkopie
export function testkopie(wf) {
	const k = JSON.parse(JSON.stringify(wf));
	k.name = 'TEST: ' + k.name.replace(/^TEAM: /, '') + ' (Repo)';
	delete k.id; delete k.versionId; delete k.active;
	k.settings = Object.assign({}, k.settings);
	delete k.settings.errorWorkflow;
	for (const n of k.nodes) {
		if (n.type === 'n8n-nodes-base.webhook') {
			n.parameters.path = n.parameters.path + '-test';
			n.webhookId = randomUUID();
		}
		if (n.parameters && n.parameters.nodeCredentialType === 'supabaseApi') n.credentials = SUPABASE;
	}
	return k;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const out = join(hier, 'out');
	mkdirSync(out, { recursive: true });
	const kopien = {
		'portal-api.supabase': await workflowBauen('supabase'),
		'social': sdkNachJson(join(hier, 'social.workflow.gen.js'), { executionOrder: 'v1', availableInMCP: true })
	};
	for (const [name, wf] of Object.entries(kopien)) {
		const k = testkopie(wf);
		const ziel = join(out, name + '.TEST.workflow.json');
		writeFileSync(ziel, JSON.stringify(k, null, '\t') + '\n');
		const pfad = k.nodes.find(n => n.type === 'n8n-nodes-base.webhook').parameters.path;
		console.log('Testkopie: team/n8n/out/' + name + '.TEST.workflow.json  („' + k.name + '“, Webhook ' + pfad + ', ' + k.nodes.length + ' Knoten)');
	}
}
