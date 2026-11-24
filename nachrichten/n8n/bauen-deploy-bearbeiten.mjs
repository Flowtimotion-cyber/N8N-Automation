// Erzeugt nachrichten/n8n/deploy/bearbeiten-deploy.json: die update_workflow-Operationen für „Nachrichten bearbeiten“ in zwei
// laufenden Workflows: „TEAM: Nachrichten (Portal)“ und „TEAM: Chat (Portal)“. Geändert wird NUR der Code (jsCode) der Knoten
// „Anfrage prüfen“ und „Antwort bauen“ (eingebettete Logik aus nachrichten/lib/nachrichten.js bzw. chat/lib/chat.js).
//   node nachrichten/n8n/bauen-deploy-bearbeiten.mjs
// Einspielen nur nach Timos Ja (siehe „anleitung“ im erzeugten JSON). Nie ohne Abgleich veröffentlichen.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { KNOTEN_CODE as NACHRICHTEN } from './bauen-nachrichten.mjs';
import { KNOTEN_CODE as CHAT } from '../../chat/n8n/bauen-chat.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// sha256 (UTF-8) des jsCode, den main vor dieser Änderung baut (Stand 23.11.2026, Merge von PR #85).
// Der Live-Code muss genau so aussehen; sonst wurde in n8n von Hand geändert → NICHT einspielen, erst abgleichen.
const VORHER = {
	nachrichten: { 'Anfrage prüfen': 'f94562ad5d043e255d9c1cfa413b4cadef9fccab4da76a0e638d2dbafd14ac65', 'Antwort bauen': '24dddd083c4785e183a119f04e4dbf6b651488c580296c904acde003edb20b67' },
	chat: { 'Anfrage prüfen': '8286c1ba10395826c88eecbee8ecc79fa85a8f4c0991d0c106f045666e2731fb', 'Antwort bauen': '075dbd1f2864c6a6d7d6a4d6a23022e729825006816e6b096cb7203caa0ac951' }
};

const teil = (schluessel, code, quelle) => Object.keys(code).map(name => ({ name, sha256_main_vorher: VORHER[schluessel][name], sha256_neu: sha(code[name]), zeichen_neu: code[name].length, quelle }));

export function deployBauen() {
	return {
		zweck: 'Nachrichten nachträglich bearbeiten (Timo 23.11.2026: nur Absender, 24 Stunden, „bearbeitet“ mit Zeit, alte Fassung gespeichert, im Chat nur neu Markierte bekommen einen Hinweis, nie WhatsApp beim Bearbeiten).',
		voraussetzung: 'Timo hat supabase/team_bearbeiten.sql im Supabase SQL Editor ausgeführt. Reihenfolge egal: Ohne SQL melden die neuen Aktionen „Bearbeiten ist noch nicht eingerichtet“, alles andere läuft wie bisher.',
		anleitung: [
			'1. Je Workflow get_workflow_details lesen. Notieren: versionId (Entwurf) und activeVersionId (veröffentlicht) als Rückweg.',
			'2. Abgleich: jsCode von „Anfrage prüfen“ und „Antwort bauen“ im ENTWURF muss sha256_main_vorher haben (sha256 über den UTF-8-Text). Weicht etwas ab, nicht einspielen, erst klären.',
			'3. Achtung „TEAM: Nachrichten (Portal)“: Laut Lesung vom 23.11.2026 liegt dort ein unveröffentlichter Entwurf (10b0a806…) über der Live-Version (48736490…); die Live-Fassung von „Antwort bauen“ ist älter (ohne MSGS_NICHT_EINGERICHTET). Mit dem Veröffentlichen geht auch dieser ältere Entwurf live. Vor dem Einspielen prüfen, dass der Entwurf dem Repo-Stand main entspricht (Schritt 2), dann ist das gewollt.',
			'4. update_workflow mit workflowId, versionName, versionDescription und operations (speichert einen Entwurf).',
			'5. get_workflow_details: beide jsCode haben sha256_neu. Dann publish_workflow.',
			'6. Kurzprobe ohne Zugang: POST an den Webhook mit aktion „bearbeiten“ und erfundenem Token → 401. Danach Timo im Portal: eine eigene Nachricht im Chat und eine im Posteingang („Gesendet“) bearbeiten.',
			'7. Rückweg: restore_workflow_version auf die notierte activeVersionId, veröffentlichen.'
		],
		workflows: [
			{
				workflowId: '0tUWBdqqBPtnlfAj',
				workflow: 'TEAM: Nachrichten (Portal)',
				abgleich_23_11_2026: { entwurf_versionId: '10b0a806-63b7-4083-b470-224e722a712e', live_activeVersionId: '48736490-cc54-4b86-8cfc-df9d7a596de4', knoten: teil('nachrichten', NACHRICHTEN, 'nachrichten/lib/nachrichten.js') },
				versionName: 'Claude Code: Nachrichten bearbeiten und Gesendet',
				versionDescription: 'Neue Aktionen „gesendet“ (eigene gesendete Nachrichten) und „bearbeiten“ (nur Absender, 24 Stunden; prüft die Datenbank, team_msgs_bearbeiten). Fehlt supabase/team_bearbeiten.sql, kommt eine verständliche Meldung. Nur jsCode von „Anfrage prüfen“ und „Antwort bauen“ geändert. Quelle: Repo nachrichten/lib/nachrichten.js.',
				operations: Object.entries(NACHRICHTEN).map(([nodeName, value]) => ({ type: 'setNodeParameter', nodeName, path: '/jsCode', value }))
			},
			{
				workflowId: 'EjzNbDUU28ngwKQi',
				workflow: 'TEAM: Chat (Portal)',
				abgleich_23_11_2026: { entwurf_versionId: '69956580-28a5-4591-8f33-5b75b10846f0', live_activeVersionId: '69956580-28a5-4591-8f33-5b75b10846f0', knoten: teil('chat', CHAT, 'chat/lib/chat.js') },
				versionName: 'Claude Code: Chat-Nachrichten bearbeiten',
				versionDescription: 'Neue Aktion „bearbeiten“ (nur Autor, 24 Stunden, neu Markierte bekommen einen Hinweis, nie WhatsApp; prüft die Datenbank, team_chat_bearbeiten). Der Verlauf liefert zusätzlich „bearbeitete“ (kommt aus SQL, hier nur durchgereicht). Nur jsCode von „Anfrage prüfen“ und „Antwort bauen“ geändert. Quelle: Repo chat/lib/chat.js.',
				operations: Object.entries(CHAT).map(([nodeName, value]) => ({ type: 'setNodeParameter', nodeName, path: '/jsCode', value }))
			}
		]
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const d = deployBauen();
	mkdirSync(join(hier, 'deploy'), { recursive: true });
	writeFileSync(join(hier, 'deploy', 'bearbeiten-deploy.json'), JSON.stringify(d, null, 1) + '\n');
	console.log('geschrieben: nachrichten/n8n/deploy/bearbeiten-deploy.json');
	for (const w of d.workflows) for (const k of w.abgleich_23_11_2026.knoten) console.log(w.workflow, '·', k.name, k.sha256_main_vorher.slice(0, 12), '→', k.sha256_neu.slice(0, 12));
}
