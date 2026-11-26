// Erzeugt chat/n8n/deploy/reaktionen-deploy.json: die update_workflow-Operationen für „Antworten und Reaktionen“ im laufenden
// Workflow „TEAM: Chat (Portal)“. Geändert wird NUR der Code (jsCode) der Knoten „Anfrage prüfen“ und „Antwort bauen“
// (eingebettete Logik aus chat/lib/chat.js).
//   node chat/n8n/bauen-deploy-reaktionen.mjs
// Einspielen nur nach Timos Ja (siehe „anleitung“ im erzeugten JSON).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { KNOTEN_CODE } from './bauen-chat.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// sha256 (UTF-8) des jsCode auf main vor dieser Änderung (= live seit 23.11.2026, Version d4d45bfe „Claude Code: Chat-Nachrichten bearbeiten“)
const VORHER = { 'Anfrage prüfen': 'f49588fb5ddf5ec2c404c124d176c75648fcec7530bee5ee2868ecb78e8ce1e7', 'Antwort bauen': '363e33b8d04c9899a858860e93af4b45efbc90fa9263427deb6d1108242aaee8' };

export function deployBauen() {
	return {
		zweck: 'Team-Chat: auf eine Nachricht antworten (Zitat) und mit Smileys reagieren (Timo 24.11.2026: sechs feste Smileys, keine Benachrichtigung bei Antwort oder Reaktion).',
		voraussetzung: 'Timo hat supabase/team_chat_reaktionen.sql im Supabase SQL Editor ausgeführt. Reihenfolge egal: Ohne SQL melden „Antworten“ und Smileys „noch nicht eingerichtet“, normales Senden läuft weiter.',
		anleitung: [
			'1. get_workflow_details: versionId und activeVersionId notieren (Rückweg). Erwartet live: d4d45bfe-f75c-4e0a-927e-536ecb151682.',
			'2. Abgleich: jsCode von „Anfrage prüfen“ und „Antwort bauen“ muss sha256_main_vorher haben. Weicht etwas ab, nicht einspielen.',
			'3. update_workflow mit workflowId, versionName, versionDescription und operations (Entwurf), Probelauf mit Testdaten (test_workflow), dann publish_workflow.',
			'4. Rückweg: auf die notierte activeVersionId zurücksetzen und veröffentlichen.'
		],
		workflowId: 'EjzNbDUU28ngwKQi',
		workflow: 'TEAM: Chat (Portal)',
		abgleich: { live_activeVersionId_erwartet: 'd4d45bfe-f75c-4e0a-927e-536ecb151682', knoten: Object.keys(KNOTEN_CODE).map(name => ({ name, sha256_main_vorher: VORHER[name], sha256_neu: sha(KNOTEN_CODE[name]), quelle: 'chat/lib/chat.js' })) },
		versionName: 'Claude Code: Antworten und Smiley-Reaktionen',
		versionDescription: 'Neue Aktion „reagieren“ (sechs feste Smileys, umschalten; team_chat_reagieren), „senden“ mit freiwilligem antwort_auf (nur mitgeschickt, wenn gesetzt). Fehlt supabase/team_chat_reaktionen.sql, kommt eine verständliche Meldung. Nur jsCode von „Anfrage prüfen“ und „Antwort bauen“ geändert. Quelle: Repo chat/lib/chat.js.',
		operations: Object.entries(KNOTEN_CODE).map(([nodeName, value]) => ({ type: 'setNodeParameter', nodeName, path: '/jsCode', value }))
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const d = deployBauen();
	mkdirSync(join(hier, 'deploy'), { recursive: true });
	writeFileSync(join(hier, 'deploy', 'reaktionen-deploy.json'), JSON.stringify(d, null, 1) + '\n');
	console.log('geschrieben: chat/n8n/deploy/reaktionen-deploy.json');
	for (const k of d.abgleich.knoten) console.log(k.name, k.sha256_main_vorher.slice(0, 12), '→', k.sha256_neu.slice(0, 12));
}
