// Erzeugt team/n8n/deploy-portal-api-privat.json (vorher: deploy-portal-api-vorschlaege.json, eingespielt 23.11.2026): die update_workflow-Operationen für die n8n-Portal-API v2
// (Workflow kMuDaDmT9rCN5Vs2). Geändert wird NUR der Code (jsCode) der Knoten „Anfrage prüfen“ und „Antwort bauen“.
//   node team/n8n/bauen-deploy.mjs
// Einspielen macht die Mastersitzung nach Timos Ja (siehe Datei „anleitung“ im erzeugten JSON). Nie selbst veröffentlichen.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const hier = dirname(fileURLToPath(import.meta.url));
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const KNOTEN = [
  { name: 'Anfrage prüfen', datei: 'portal-api-anfrage-pruefen.js', live_sha256: 'a69e22cd2af5453c941ac2fb6dbfbbd3f04007eda1125244ac5cda2fd5079856' },
  { name: 'Antwort bauen', datei: 'portal-api-antwort-bauen.js', live_sha256: 'e01556aff3c98d545018c0073b38b9b4c7e91a3620ed03d6d788eb686861a051' }
];

export function deployBauen() {
  const knoten = KNOTEN.map(k => { const code = readFileSync(join(hier, k.datei), 'utf8'); return { ...k, code, neu_sha256: sha(code) }; });
  return {
    workflowId: 'kMuDaDmT9rCN5Vs2',
    workflow: 'TEAM: Portal-API v2 (Supabase, Agenten)',
    abgleich: {
      live_version: '97ec9862-62f2-4ace-abd5-049084ad66f1',
      live_version_vom: '2026-11-23',
      hinweis: 'Vor dem Einspielen get_workflow_details lesen: versionId muss noch 97ec9862… sein und der jsCode beider Knoten die live_sha256 haben (sha256 über den UTF-8-Text). Weicht etwas ab, wurde zwischendurch von Hand geändert: NICHT einspielen, erst abgleichen.',
      knoten: knoten.map(k => ({ name: k.name, live_sha256: k.live_sha256, neu_sha256: k.neu_sha256, quelle: 'team/n8n/' + k.datei }))
    },
    anleitung: [
      '1. Timo hat supabase/team_aufgaben_privat.sql im SQL Editor ausgeführt und die Probe am Ende der Datei zeigt dreimal true (sonst kennt Supabase die Spalte privat nicht und das Speichern mit Haken schlägt fehl).',
      '2. Abgleich wie oben (versionId und sha256 der Live-Codes).',
      '3. update_workflow mit workflowId, versionName, versionDescription und operations aus dieser Datei (speichert einen Entwurf).',
      '4. Prüfen: get_workflow_details, beide jsCode haben neu_sha256; dann publish_workflow.',
      '5. Kurztest: Portal laden (alte Fassung läuft weiter, sie kennt den Haken nur nicht) und eine Aufgabe speichern; mit team.py „meine“ abrufen.',
      '6. Danach PR mergen (Portal mit Haken „Privat“, Pipeline-Board und „Zu entscheiden“ geht über GitHub Pages live).'
    ],
    versionName: 'Claude Code: private Aufgaben, Label Entscheidung',
    versionDescription: 'Pipeline/Entscheidungen (Entscheidung Timo 23.11.2026): Feld privat an Aufgaben. Sichtbar nur für Ersteller und Bearbeiter, auch nicht für Admin und andere Agenten: Anfrage prüfen arbeitet nur mit sichtbaren Aufgaben (fremde private = 404), Papierkorb gefiltert, Zeiteinträge behalten bereits verknüpfte private Aufgaben; Antwort bauen filtert Aufgaben und Verlauf für Menschen und Agenten. Neues Label ⚖️ Entscheidung. Nur jsCode dieser zwei Knoten geändert. Quelle: Repo team/n8n.',
    operations: knoten.map(k => ({ type: 'setNodeParameter', nodeName: k.name, path: '/jsCode', value: k.code }))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const d = deployBauen();
  writeFileSync(join(hier, 'deploy-portal-api-privat.json'), JSON.stringify(d, null, 1) + '\n');
  console.log('geschrieben: team/n8n/deploy-portal-api-privat.json');
  for (const k of d.abgleich.knoten) console.log(k.name, k.neu_sha256);
}
