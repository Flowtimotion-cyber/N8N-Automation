// Erzeugt team/n8n/deploy-portal-api.json: die update_workflow-Operationen für die n8n-Portal-API v2
// (Workflow kMuDaDmT9rCN5Vs2, Supabase-Variante). Geändert wird NUR der Code (jsCode) von Knoten, deren Code sich
// gegenüber dem Live-Stand unterscheidet. Der Code kommt aus team/n8n/bauen.mjs (C_DataBase + C_dbSupabase + Logik).
//   node team/n8n/bauen-deploy.mjs
// Einspielen macht die Mastersitzung nach Timos Ja (siehe „anleitung“ im erzeugten JSON). Nie selbst veröffentlichen.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CODE_KNOTEN } from './bauen.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// Live-Stand, gegen den abgeglichen wird (get_workflow_details vom 2026-11-23)
const LIVE = {
	version: '97ec9862-62f2-4ace-abd5-049084ad66f1',
	vom: '2026-11-23',
	sha256: {
		'Anfrage prüfen': 'a69e22cd2af5453c941ac2fb6dbfbbd3f04007eda1125244ac5cda2fd5079856',
		'Antwort bauen': 'e01556aff3c98d545018c0073b38b9b4c7e91a3620ed03d6d788eb686861a051'
	}
};

export function deployBauen() {
	const knoten = Object.entries(CODE_KNOTEN).map(([name, code]) => {
		const c = code('supabase');
		return { name, code: c, live_sha256: LIVE.sha256[name], neu_sha256: sha(c) };
	});
	const geaendert = knoten.filter(k => k.neu_sha256 !== k.live_sha256);
	return {
		workflowId: 'kMuDaDmT9rCN5Vs2',
		workflow: 'TEAM: Portal-API v2 (Supabase, Agenten)',
		abgleich: {
			live_version: LIVE.version,
			live_version_vom: LIVE.vom,
			hinweis: 'Vor dem Einspielen get_workflow_details lesen: versionId muss noch ' + LIVE.version.slice(0, 8) + '… sein und der jsCode der Knoten die live_sha256 haben (sha256 über den UTF-8-Text). Weicht etwas ab, wurde zwischendurch von Hand geändert: NICHT einspielen, erst abgleichen.',
			knoten: knoten.map(k => ({ name: k.name, live_sha256: k.live_sha256, neu_sha256: k.neu_sha256, geaendert: k.neu_sha256 !== k.live_sha256 }))
		},
		anleitung: [
			'1. Abgleich wie oben (versionId und sha256 der Live-Codes).',
			'2. update_workflow mit workflowId, versionName, versionDescription und operations aus dieser Datei (speichert einen Entwurf).',
			'3. Prüfen: get_workflow_details, die geänderten jsCode haben neu_sha256; dann publish_workflow.',
			'4. Kurztest: Portal laden, eine Aufgabe speichern, eine Notiz löschen und aus dem Papierkorb wiederherstellen; mit team.py „meine“ abrufen.'
		],
		versionName: 'Claude Code: Datenbank-Abstraktion C_DataBase (Supabase)',
		versionDescription: 'Schreibaufträge in „Anfrage prüfen“ laufen über dataBase = new C_dbSupabase(); erzeugt dieselben Aufträge wie bisher (PostgREST). Vorbereitung für eine PostgreSQL-Variante. Nur jsCode geändert. Quelle: Repo team/n8n (bauen.mjs).',
		operations: geaendert.map(k => ({ type: 'setNodeParameter', nodeName: k.name, path: '/jsCode', value: k.code }))
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const d = deployBauen();
	writeFileSync(join(hier, 'deploy-portal-api.json'), JSON.stringify(d, null, 1) + '\n');
	console.log('geschrieben: team/n8n/deploy-portal-api.json');
	for (const k of d.abgleich.knoten) console.log(k.name, k.geaendert ? 'geändert ' + k.neu_sha256 : 'unverändert');
}
