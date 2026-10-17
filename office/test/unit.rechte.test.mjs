import { test } from 'node:test';
import assert from 'node:assert/strict';
import { darfAktion, sichtbareProjekte, darfProjekt, darfRunSehen, darfRunSteuern, darfFreigeben, darfTool, fuehrtAus, AGENT_DARF } from '../lib/rechte.js';

const admin = { mitglied_id: 'm_timo', rolle: 'admin', typ: 'mensch', status: 'aktiv' };
const team = { mitglied_id: 'm_lillien', rolle: 'team', typ: 'mensch', status: 'aktiv' };
const kunde = { mitglied_id: 'm_kunde', rolle: 'team', typ: 'mensch', status: 'aktiv', projekte: ['Kundenprojekt'] };
const agent = { mitglied_id: 'agent-claude', rolle: 'agent', typ: 'agent', status: 'aktiv' };
const agenten = [{ agent_id: 'texter', mitglied_id: 'agent-claude', projekte: ['Social Media'], erlaubte_tools: ['social_entwurf'] }, { agent_id: 'review', mitglied_id: 'agent-claude', projekte: ['Kundenprojekt'], erlaubte_tools: [] }, { agent_id: 'waechter', mitglied_id: 'agent-hermes', projekte: ['Verwaltung'] }];

test('Agenten dürfen nur die Agenten-Aktionen, nie Freigaben, Abnahme, Löschen, Registry', () => {
  for (const a of AGENT_DARF) assert.ok(darfAktion(agent, a).ok, a);
  for (const a of ['freigabe_entscheiden', 'run_abnehmen', 'run_abbrechen', 'run_wiederholen', 'antwort', 'loeschen', 'agent_speichern', 'wartung']) assert.equal(darfAktion(agent, a).code, 403, a);
  assert.equal(darfAktion(team, 'loeschen').code, 403);
  assert.ok(darfAktion(admin, 'loeschen').ok);
  assert.equal(darfAktion({ ...team, status: 'gesperrt' }, 'laden').code, 401);
  assert.equal(darfAktion(null, 'laden').code, 401);
});
test('Projektgrenzen: Agenten sehen nur Registry-Projekte (Vereinigung), Menschen alle, Kundenrolle nur eigene', () => {
  assert.deepEqual(sichtbareProjekte(agent, agenten).sort(), ['Kundenprojekt', 'Social Media']);
  assert.equal(sichtbareProjekte(admin, agenten), null);
  assert.equal(sichtbareProjekte(team, agenten), null);
  assert.deepEqual(sichtbareProjekte(kunde, agenten), ['Kundenprojekt']);
  assert.ok(!darfProjekt(agent, 'Verwaltung', agenten)); assert.ok(darfProjekt(agent, 'Social Media', agenten));
  assert.ok(!darfProjekt(kunde, 'Social Media', agenten)); assert.ok(darfProjekt(admin, 'Geheim', agenten));
  assert.deepEqual(sichtbareProjekte({ ...agent, mitglied_id: 'agent-unbekannt' }, agenten), []);
});
test('Runs: sehen und steuern', () => {
  const run = { run_id: 'r', projekt: 'Social Media', agent_id: 'texter', auftraggeber: 'm_murat' };
  assert.ok(darfRunSehen(agent, run, agenten)); assert.ok(!darfRunSehen({ ...agent, mitglied_id: 'agent-hermes' }, run, agenten));
  assert.ok(darfRunSehen(team, run, agenten)); assert.ok(!darfRunSehen(kunde, run, agenten));
  assert.ok(!darfRunSteuern(agent, run, agenten), 'Agenten steuern nie');
  assert.ok(!darfRunSteuern(team, run, agenten), 'fremder Auftraggeber ohne Dozentenrolle');
  assert.ok(darfRunSteuern({ ...team, mitglied_id: 'm_murat' }, run, agenten));
  assert.ok(darfRunSteuern(admin, run, agenten));
  assert.ok(fuehrtAus(agent, 'review', agenten)); assert.ok(!fuehrtAus(agent, 'waechter', agenten));
});
test('Freigaben: nie Agenten, kritisch nur Admin, Vier-Augen-Prinzip', () => {
  const run = { projekt: 'Social Media' }; const fr = { angefordert_von: 'agent-claude' };
  assert.equal(darfFreigeben(agent, fr, run, 'extern', agenten).ok, false);
  assert.equal(darfFreigeben(team, fr, run, 'extern', agenten).ok, true);
  assert.equal(darfFreigeben(team, fr, run, 'kritisch', agenten).ok, false);
  assert.equal(darfFreigeben(admin, fr, run, 'kritisch', agenten).ok, true);
  assert.equal(darfFreigeben(team, { angefordert_von: 'm_lillien' }, run, 'extern', agenten).ok, false, 'Anfordernder darf nicht selbst erteilen');
  assert.equal(darfFreigeben(kunde, fr, run, 'extern', agenten).ok, false, 'fremdes Projekt');
});
test('Werkzeug-Allowlist', () => { assert.ok(darfTool(agenten[0], 'social_entwurf')); assert.ok(!darfTool(agenten[0], 'shell')); assert.ok(!darfTool(agenten[1], 'social_entwurf')); assert.ok(!darfTool(null, 'x')); });
