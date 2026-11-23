// Erzeugt team/n8n/deploy-portal-api-vorschlaege.json: die update_workflow-Operationen für die n8n-Portal-API v2
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
  { name: 'Anfrage prüfen', datei: 'portal-api-anfrage-pruefen.js', live_sha256: '09839bad81e384545b2dbce6205c91c2b7d29e056c17916945e060afd9da05d4' },
  { name: 'Antwort bauen', datei: 'portal-api-antwort-bauen.js', live_sha256: '4f441103a600954877ce4dba8f3d45460243730b6d12e46f505ec5d22812be1e' }
];

export function deployBauen() {
  const knoten = KNOTEN.map(k => { const code = readFileSync(join(hier, k.datei), 'utf8'); return { ...k, code, neu_sha256: sha(code) }; });
  return {
    workflowId: 'kMuDaDmT9rCN5Vs2',
    workflow: 'TEAM: Portal-API v2 (Supabase, Agenten)',
    abgleich: {
      live_version: '636dc74f-7666-4667-b3f6-6d3955d2a664',
      live_version_vom: '2026-10-31',
      hinweis: 'Vor dem Einspielen get_workflow_details lesen: versionId muss noch 636dc74f… sein und der jsCode beider Knoten die live_sha256 haben (sha256 über den UTF-8-Text). Weicht etwas ab, wurde zwischendurch von Hand geändert: NICHT einspielen, erst abgleichen.',
      knoten: knoten.map(k => ({ name: k.name, live_sha256: k.live_sha256, neu_sha256: k.neu_sha256, quelle: 'team/n8n/' + k.datei }))
    },
    anleitung: [
      '1. Timo hat supabase/team_vorschlaege_kurt_1.sql im SQL Editor ausgeführt (sonst kennt Supabase die Spalten bearbeiter/aufgaben_ids nicht und das Speichern schlägt fehl).',
      '2. Abgleich wie oben (versionId und sha256 der Live-Codes).',
      '3. update_workflow mit workflowId, versionName, versionDescription und operations aus dieser Datei (speichert einen Entwurf).',
      '4. Prüfen: get_workflow_details, beide jsCode haben neu_sha256; dann publish_workflow.',
      '5. Kurztest: Portal laden (alte Fassung) und eine Aufgabe speichern; mit team.py „meine“ abrufen.',
      '6. Danach Timo: supabase/team_vorschlaege_kurt_2_prio.sql ausführen, dann PR mergen.'
    ],
    versionName: 'Claude Code: Bearbeiter-Liste, Prio 1–10, mehrere Aufgaben je Zeit',
    versionDescription: 'Vorschläge Kurt/Lillien (Entscheidung Timo 21.11.2026: 1A, 3A, 4B). aufgabe_speichern: Liste bearbeiter (gleichberechtigt, verantwortlich = Kompatibilitätsfeld), Prio 1–10 mit skala:10, alte Clients 1→1, 2→5, 3→8. zeit_speichern: aufgaben_ids. Antwort bauen: meine_aufgaben über bearbeiter. Nur jsCode dieser zwei Knoten geändert. Quelle: Repo team/n8n.',
    operations: knoten.map(k => ({ type: 'setNodeParameter', nodeName: k.name, path: '/jsCode', value: k.code }))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const d = deployBauen();
  writeFileSync(join(hier, 'deploy-portal-api-vorschlaege.json'), JSON.stringify(d, null, 1) + '\n');
  console.log('geschrieben: team/n8n/deploy-portal-api-vorschlaege.json');
  for (const k of d.abgleich.knoten) console.log(k.name, k.neu_sha256);
}
