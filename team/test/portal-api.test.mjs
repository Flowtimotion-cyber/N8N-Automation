// Test für die Code-Knoten „Anfrage prüfen“ und „Antwort bauen“ der n8n-Portal-API v2 (team/n8n/*.js) und die Datenbank-Klassen (team/n8n).
// Führt den Code wie n8n aus: $('Knoten').first().json bzw. .all() werden nachgebildet, kein Netz, keine echten Daten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { anfragePruefenCode, fehltFuer, workflowBauen, VARIANTEN } from '../n8n/bauen.mjs';

const N8N = join(dirname(fileURLToPath(import.meta.url)), '..', 'n8n');
const ANFRAGE = anfragePruefenCode('supabase');   // so, wie er in den Knoten „Anfrage prüfen“ kommt (C_DataBase + C_DataBase_Supabase + Logik)
const ANTWORT = readFileSync(join(N8N, 'portal-api-antwort-bauen.js'), 'utf8');
const TOK = { m_timo: 'tok-timo-0000000000000001', m_kurt: 'tok-kurt-0000000000000002', m_lillien: 'tok-lillien-00000000000003', 'agent-claude': 'tok-agent-0000000000000004' };
const heute = new Date().toISOString().slice(0, 10);

function daten() {
  return {
    mitglieder: [
      { mitglied_id: 'm_timo', name: 'Timo (Test)', rolle: 'admin', typ: 'mensch', status: 'aktiv', token: TOK.m_timo },
      { mitglied_id: 'm_kurt', name: 'Kurt (Test)', rolle: 'dozent', typ: 'mensch', status: 'aktiv', token: TOK.m_kurt, whatsapp_ok: true, telefon: '+490000000002' },
      { mitglied_id: 'm_lillien', name: 'Lillien (Test)', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOK.m_lillien, whatsapp_ok: true, telefon: '+490000000003' },
      { mitglied_id: 'm_murat', name: 'Murat (Test)', rolle: 'vertrieb', typ: 'mensch', status: 'aktiv', token: 'tok-murat-000000000000005' },
      { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOK['agent-claude'] }
    ],
    projekte: [{ projekt_id: 'p1', name: 'Akademie-Kurs' }, { projekt_id: 'p2', name: 'Webseite' }, { projekt_id: 'p3', name: 'Sonstiges' }],
    aufgaben: [
      { aufgabe_id: 'a1', titel: 'Alte Aufgabe ohne Liste', status: 'Offen', prio: 2, projekt: 'Akademie-Kurs', verantwortlich: 'm_kurt', erstellt_von: 'm_timo', geaendert: '2026-11-01T10:00:00Z' },
      { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', status: 'In Arbeit', prio: 7, projekt: 'Webseite', verantwortlich: 'm_kurt', bearbeiter: ['m_kurt', 'm_lillien'], erstellt_von: 'm_timo', geaendert: '2026-11-02T10:00:00Z' },
      { aufgabe_id: 'a3', titel: 'Agent hilft mit', status: 'Offen', prio: 5, projekt: 'Webseite', verantwortlich: 'm_kurt', bearbeiter: ['m_kurt', 'agent-claude'], erstellt_von: 'm_kurt', agent_geeignet: true, geaendert: '2026-11-03T10:00:00Z' }
    ],
    verlauf: [], zeiten: [], notizen: [], vorschlaege: [{ vorschlag_id: 'v1', titel: 'geheim', text: 'nur für Menschen' }], social: [], systeme: [], abrechnung: [], papierkorb: []
  };
}

function lauf(code, knoten) {
  const $ = n => {
    if (!(n in knoten)) throw new Error('Knoten nicht nachgebildet: ' + n);
    const v = knoten[n];
    return { first: () => ({ json: Array.isArray(v) ? v[0] : v }), all: () => (Array.isArray(v) ? v : [v]).map(json => ({ json })) };
  };
  const erg = vm.runInNewContext('(function(){\n' + code + '\n})()', { $ });
  return JSON.parse(JSON.stringify(erg));
}
const anfrage = (wer, aktion, d, D) => lauf(ANFRAGE, { 'Team-API': { body: { token: TOK[wer], aktion, daten: d } }, 'Team-Daten laden': D || daten() })[0].json;
const zeile = (j, tab) => (j.ops || []).find(o => o.pfad.startsWith(tab));
const verlaufe = j => (j.ops || []).filter(o => o.pfad === 'team_aufgaben_verlauf').map(o => o.body.text);

test('Neues Portal: neue Aufgabe mit zwei Bearbeitern und Prio 7 (Skala 1–10)', () => {
  const j = anfrage('m_timo', 'aufgabe_speichern', { titel: 'Neu', bearbeiter: ['m_kurt', 'm_lillien', 'm_kurt', 'unbekannt'], prio: 7, skala: 10, projekt: 'Webseite' });
  assert.equal(j.weiter, 2);
  const r = zeile(j, 'team_aufgaben').body;
  assert.deepEqual(r.bearbeiter, ['m_kurt', 'm_lillien']);
  assert.equal(r.verantwortlich, 'm_kurt');
  assert.equal(r.prio, 7);
  assert.deepEqual(verlaufe(j), ['Angelegt, Bearbeiter: Kurt (Test), Lillien (Test)']);
  assert.equal(j.benachrichtigen, true);
  assert.equal(j.nachricht.name, 'Kurt (Test)');
});

test('Neues Portal: Bearbeiter ändern schreibt Verlauf + / −, Einzelfeld bleibt, solange die Person dabei ist', () => {
  const j = anfrage('m_kurt', 'aufgabe_speichern', { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', bearbeiter: ['m_lillien', 'm_kurt', 'm_murat'], skala: 10, prio: 7 });
  const r = zeile(j, 'team_aufgaben').body;
  assert.deepEqual(r.bearbeiter, ['m_lillien', 'm_kurt', 'm_murat']);
  assert.equal(r.verantwortlich, 'm_kurt');
  assert.deepEqual(verlaufe(j), ['Bearbeiter: + Murat (Test)']);
  assert.equal(j.benachrichtigen, false, 'Murat hat keine WhatsApp-Einwilligung');
  const j2 = anfrage('m_timo', 'aufgabe_speichern', { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', bearbeiter: ['m_lillien'], skala: 10, prio: 7 });
  assert.equal(zeile(j2, 'team_aufgaben').body.verantwortlich, 'm_lillien');
  assert.deepEqual(verlaufe(j2), ['Bearbeiter: − Kurt (Test)']);
});

test('Leere Liste: bisherige Bearbeiter bleiben, bei neuer Aufgabe die Person selbst', () => {
  assert.deepEqual(zeile(anfrage('m_kurt', 'aufgabe_speichern', { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', bearbeiter: [] }), 'team_aufgaben').body.bearbeiter, ['m_kurt', 'm_lillien']);
  assert.deepEqual(zeile(anfrage('m_lillien', 'aufgabe_speichern', { titel: 'Für mich', bearbeiter: [] }), 'team_aufgaben').body.bearbeiter, ['m_lillien']);
});

test('Altes Portal (nur „verantwortlich“): bisherige Person in der Liste ersetzt, andere bleiben', () => {
  const j = anfrage('m_timo', 'aufgabe_speichern', { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', verantwortlich: 'm_murat', prio: 3 });
  const r = zeile(j, 'team_aufgaben').body;
  assert.deepEqual(r.bearbeiter, ['m_murat', 'm_lillien']);
  assert.equal(r.verantwortlich, 'm_murat');
  assert.equal(r.prio, 7, 'Wert der neuen Skala (7) bleibt, das alte Portal kann ihn nicht anzeigen');
  const j2 = anfrage('m_timo', 'aufgabe_speichern', { aufgabe_id: 'a1', titel: 'Alte Aufgabe ohne Liste', verantwortlich: 'm_kurt', prio: 2 });
  assert.deepEqual(zeile(j2, 'team_aufgaben').body.bearbeiter, ['m_kurt']);
  assert.deepEqual(verlaufe(j2), [], 'nichts geändert, kein Verlaufseintrag');
});

test('Prio: alte Skala wird umgerechnet (1→1, 2→5, 3→8), ohne Angabe 5, ungültig = bisheriger Wert', () => {
  const p = d => zeile(anfrage('m_timo', 'aufgabe_speichern', Object.assign({ titel: 'Prio-Test' }, d)), 'team_aufgaben').body.prio;
  assert.equal(p({ prio: 1 }), 1); assert.equal(p({ prio: 2 }), 5); assert.equal(p({ prio: 3 }), 8);
  assert.equal(p({}), 5);
  assert.equal(p({ prio: 10, skala: 10 }), 10); assert.equal(p({ prio: 2, skala: 10 }), 2);
  assert.equal(p({ aufgabe_id: 'a1', prio: 3 }), 8, 'gespeicherter Altwert 2: altes Portal setzt 3 → 8');
  assert.equal(p({ aufgabe_id: 'a2', prio: 11, skala: 10 }), 7);
  assert.equal(p({ aufgabe_id: 'a2', prio: 0, skala: 10 }), 7);
});

test('Agent (team.py ohne skala): Prio 1–3 wird umgerechnet, Bearbeiter wie bisher über --fuer', () => {
  const j = anfrage('agent-claude', 'aufgabe_speichern', { titel: 'Vom Agenten', prio: 2, verantwortlich: 'm_lillien', status: 'Offen' });
  const r = zeile(j, 'team_aufgaben').body;
  assert.equal(r.prio, 5); assert.deepEqual(r.bearbeiter, ['m_lillien']);
});

test('Zeit: mehrere Aufgaben, erste = aufgabe_id, Projekt aus erster Aufgabe; altes Portal ohne Liste', () => {
  const basis = { datum: heute, von: '00:00', bis: '00:30', pause_min: 0, taetigkeit: 'Testarbeit' };
  const j = anfrage('m_lillien', 'zeit_speichern', Object.assign({ aufgaben_ids: ['a2', 'a1', 'a2', 'gibtsnicht'], aufgabe_id: 'a2' }, basis));
  const r = zeile(j, 'team_zeiten').body;
  assert.deepEqual(r.aufgaben_ids, ['a2', 'a1']);
  assert.equal(r.aufgabe_id, 'a2'); assert.equal(r.projekt, 'Webseite'); assert.equal(r.minuten, 30);
  const alt = zeile(anfrage('m_lillien', 'zeit_speichern', Object.assign({ aufgabe_id: 'a1' }, basis)), 'team_zeiten').body;
  assert.equal(alt.aufgabe_id, 'a1'); assert.equal('aufgaben_ids' in alt, false, 'altes Portal: Liste macht der Supabase-Trigger');
  const leer = zeile(anfrage('m_lillien', 'zeit_speichern', Object.assign({ aufgaben_ids: [], projekt: 'Akademie-Kurs' }, basis)), 'team_zeiten').body;
  assert.deepEqual(leer.aufgaben_ids, []); assert.equal(leer.aufgabe_id, ''); assert.equal(leer.projekt, 'Akademie-Kurs');
});

test('Antwort für Agenten: meine_aufgaben über die Bearbeiter-Liste, weiter ohne Vorschläge, Zeiten, Kontakte', () => {
  const D = daten();
  const out = lauf(ANTWORT, { 'Anfrage prüfen': { weiter: 1, ich: { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', status: 'aktiv' } }, 'Team-Daten laden': D,
    'Lernstand lesen': [], 'Chatfragen lesen': [], 'Anfragen lesen': [] })[0].json.antwort;
  assert.deepEqual(out.meine_aufgaben, ['a3']);
  for (const k of ['vorschlaege', 'zeiten', 'abrechnung', 'anfragen', 'kurs']) assert.equal(k in out, false, k + ' darf nicht in der Agenten-Antwort stehen');
  assert.equal(out.mitglieder.some(m => 'telefon' in m || 'email' in m || 'token' in m), false);
  assert.deepEqual(out.aufgaben.find(a => a.aufgabe_id === 'a3').bearbeiter, ['m_kurt', 'agent-claude']);
});

test('Code-Knoten nutzen kein require (in n8n gesperrt)', () => {
  for (const c of [ANFRAGE, ANTWORT]) assert.equal(/\brequire\s*\(/.test(c), false);
});

test('Deploy-Datei passt zu den Quelldateien (sonst: node team/n8n/bauen-deploy.mjs)', async () => {
  const { deployBauen } = await import('../n8n/bauen-deploy.mjs');
  const datei = JSON.parse(readFileSync(join(N8N, 'deploy-portal-api.json'), 'utf8'));
  assert.deepEqual(datei, JSON.parse(JSON.stringify(deployBauen())));
  assert.ok(datei.versionName.startsWith('Claude Code: '));
  assert.deepEqual(datei.operations.map(o => o.nodeName), ['Anfrage prüfen']);
  assert.equal(datei.operations[0].value, ANFRAGE);
});

// ===== Datenbank-Klassen (team/n8n) =====
const dbLauf = (klasse, ausdruck) => JSON.parse(JSON.stringify(vm.runInNewContext(
	readFileSync(join(N8N, 'C_DataBase.js'), 'utf8') + '\n' + readFileSync(join(N8N, klasse + '.js'), 'utf8') + '\n' + 'const dataBase = new ' + klasse + '();\n' + ausdruck, {})));

test('C_DataBase_Supabase erzeugt Aufträge in PostgREST-Schreibweise (wie der HTTP-Knoten sie erwartet)', () => {
	const r = dbLauf('C_DataBase_Supabase', `[
		dataBase.kennung,
		dataBase.neu('team_aufgaben', { titel: 'x' }),
		dataBase.aendern('team_projekte', 'projekt_id', 'p 2/ä', { name: 'y' }),
		dataBase.aendernViele('team_zeiten', 'zeit_id', ['z1', 'z,2'], { status: 'eingereicht' }),
		dataBase.loeschen('team_abrechnung', 'abrechnung_id', 'ab1'),
		dataBase.funktion('team_tn_haken', { p_tn: 't1', p_wert: true })
	]`);
	assert.deepEqual(r, [
		'supabase',
		{ methode: 'POST', pfad: 'team_aufgaben', body: { titel: 'x' } },
		{ methode: 'PATCH', pfad: 'team_projekte?projekt_id=eq.p%202%2F%C3%A4', body: { name: 'y' } },
		{ methode: 'PATCH', pfad: 'team_zeiten?zeit_id=in.(z1,z%2C2)', body: { status: 'eingereicht' } },
		{ methode: 'DELETE', pfad: 'team_abrechnung?abrechnung_id=eq.ab1', body: {} },
		{ methode: 'POST', pfad: 'rpc/team_tn_haken', body: { p_tn: 't1', p_wert: true } }
	]);
});

test('C_DataBase ist nur die Schnittstelle: direkt nicht anlegbar, fehlende Methoden melden sich klar', () => {
	assert.throws(() => dbLauf('C_DataBase_Supabase', 'new C_DataBase("x")'), /nur die Schnittstelle/);
	assert.throws(() => dbLauf('C_DataBase_Supabase', 'class C_DataBase_Halb extends C_DataBase { constructor() { super("halb"); } }; new C_DataBase_Halb().neu("t", {})'), /C_DataBase_Halb implementiert neu\(\) nicht/);
});

test('Geschäftslogik schreibt nur über dataBase (keine PostgREST-Schreibweise mehr)', () => {
	const logik = readFileSync(join(N8N, 'portal-api-anfrage-pruefen.js'), 'utf8');
	assert.equal(/methode\s*:|pfad\s*:|=eq\.|=in\.\(|rpc\//.test(logik), false);
});

test('Generator: Supabase-Workflow = Vorlage mit eingesetztem Code; unbekannte Variante wird gemeldet', async () => {
	assert.equal(fehltFuer('supabase'), null);
	const wf = await workflowBauen('supabase');
	const code = n => wf.nodes.find(k => k.name === n).parameters.jsCode;
	assert.equal(code('Anfrage prüfen'), ANFRAGE);
	assert.equal(code('Antwort bauen'), ANTWORT.replace(/\r\n/g, '\n'));
	assert.match(code('Anfrage prüfen'), /const dataBase = new C_DataBase_Supabase\(\);/);
	assert.ok(VARIANTEN.some(v => v.kennung === 'postgre'));
	assert.throws(() => anfragePruefenCode('oracle'), /Unbekannte Datenbank-Variante/);
});

test('C_DataBase_Postgre: Beschreibung → parametrisiertes SQL, Werte nie im SQL-Text', () => {
	const [ops, sql] = dbLauf('C_DataBase_Postgre', `const ops = [
		dataBase.neu('team_aufgaben', { titel: "x'); drop table t; --", bearbeiter: ['a', 'b'] }),
		dataBase.aendern('team_projekte', 'projekt_id', 'p 2/ä', { name: 'y' }),
		dataBase.aendernViele('team_zeiten', 'zeit_id', ['z1', 'z,2'], { status: 'eingereicht' }),
		dataBase.loeschen('team_abrechnung', 'abrechnung_id', 'ab1'),
		dataBase.funktion('team_tn_haken', { p_tn: 't1', p_wert: true, p_datum: null })
	]; [ops, ops.map(o => C_DataBase_Postgre.sql(o))]`);
	assert.equal(ops[0].art, 'neu');
	assert.deepEqual(ops[1], { art: 'aendern', tab: 'team_projekte', pk: 'projekt_id', id: 'p 2/ä', body: { name: 'y' } });
	assert.deepEqual(sql, [
		{ sql: 'INSERT INTO "team_aufgaben" ("titel", "bearbeiter") SELECT "titel", "bearbeiter" FROM json_populate_record(null::"team_aufgaben", $1::json)', params: [JSON.stringify({ titel: "x'); drop table t; --", bearbeiter: ['a', 'b'] })] },
		{ sql: 'UPDATE "team_projekte" AS z SET "name" = r."name" FROM json_populate_record(null::"team_projekte", $1::json) AS r WHERE z."projekt_id"::text = $2', params: ['{"name":"y"}', 'p 2/ä'] },
		{ sql: 'UPDATE "team_zeiten" AS z SET "status" = r."status" FROM json_populate_record(null::"team_zeiten", $1::json) AS r WHERE z."zeit_id"::text IN (SELECT json_array_elements_text($2::json))', params: ['{"status":"eingereicht"}', '["z1","z,2"]'] },
		{ sql: 'DELETE FROM "team_abrechnung" WHERE "abrechnung_id"::text = $1', params: ['ab1'] },
		{ sql: 'SELECT "team_tn_haken"("p_tn" := $1, "p_wert" := $2, "p_datum" := $3)', params: ['t1', 'true', null] }
	]);
	assert.throws(() => dbLauf('C_DataBase_Postgre', 'C_DataBase_Postgre.sql(dataBase.neu("x; drop", { a: 1 }))'), /ungültiger Name/);
	assert.throws(() => dbLauf('C_DataBase_Postgre', 'C_DataBase_Postgre.sql(dataBase.aendern("t", "id", 1, { "a\\" --": 1 }))'), /ungültiger Name/);
	assert.throws(() => dbLauf('C_DataBase_Postgre', 'C_DataBase_Postgre.sql(dataBase.neu("t", {}))'), /ohne Spalten/);
});

test('PostgreSQL-Logik erzeugt dieselben Inhalte wie Supabase, nur in anderer Form', () => {
	const PG = anfragePruefenCode('postgre');
	const j = lauf(PG, { 'Team-API': { body: { token: TOK.m_timo, aktion: 'aufgabe_speichern', daten: { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', status: 'Erledigt', bearbeiter: ['m_kurt'], skala: 10, prio: 7 } } }, 'Team-Daten laden': daten() })[0].json;
	const s = anfrage('m_timo', 'aufgabe_speichern', { aufgabe_id: 'a2', titel: 'Aufgabe mit Liste', status: 'Erledigt', bearbeiter: ['m_kurt'], skala: 10, prio: 7 });
	assert.deepEqual(j.ops.map(o => o.art + ' ' + o.tab), ['aendern team_aufgaben', 'neu team_aufgaben_verlauf', 'neu team_aufgaben_verlauf']);
	assert.equal(j.ops.length, s.ops.length);
	const ohneZeit = o => JSON.stringify(o.body, (k, v) => ['geaendert', 'erstellt', 'erledigt_am'].includes(k) ? undefined : v);
	j.ops.forEach((o, i) => assert.equal(ohneZeit(o), ohneZeit(s.ops[i])));
});

test('Generator: PostgreSQL-Workflow aus der Supabase-Vorlage abgeleitet', async () => {
	assert.equal(fehltFuer('postgre'), null);
	const wf = await workflowBauen('postgre');
	const k = n => wf.nodes.find(x => x.name === n);
	assert.equal(wf.name, 'TEAM: Portal-API v2 (PostgreSQL, Agenten)');
	assert.equal(k('Team-API').parameters.path, 'team-api-v2-pg');
	assert.equal(k('In Supabase schreiben'), undefined);
	assert.equal(k('In Datenbank schreiben').type, 'n8n-nodes-base.postgres');
	assert.equal(k('Team-Daten lesen (SQL)').parameters.query, 'SELECT team_laden_plus() AS daten');
	assert.equal(k('Team-Daten laden').type, 'n8n-nodes-base.code', 'Name bleibt, andere Knoten lesen $(„Team-Daten laden“)');
	assert.match(k('Schreibaufträge').parameters.jsCode, /C_DataBase_Postgre\.sql\(o\)/);
	assert.match(k('Anfrage prüfen').parameters.jsCode, /const dataBase = new C_DataBase_Postgre\(\);/);
	const ziele = Object.values(wf.connections).flatMap(q => q.main.flat().map(z => z.node));
	for (const z of ziele) assert.ok(k(z), 'Verbindung zu fehlendem Knoten ' + z);
	assert.equal(new Set(wf.nodes.map(n => n.id)).size, wf.nodes.length);
	const sb = await workflowBauen('supabase');
	const sbIds = new Set(sb.nodes.map(n => n.id).concat(sb.nodes.map(n => n.webhookId).filter(Boolean)));
	assert.equal(wf.nodes.some(n => sbIds.has(n.id) || sbIds.has(n.webhookId)), false, 'Kennungen dürfen nicht mit der Supabase-Fassung kollidieren');
});
