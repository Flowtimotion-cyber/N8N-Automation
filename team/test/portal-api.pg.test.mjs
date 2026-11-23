// Test der PostgreSQL-Variante gegen ein echtes PostgreSQL (PGlite: PostgreSQL als WebAssembly, läuft im Testprozess,
// Datenbank nur im Arbeitsspeicher, kein Server, keine Zugangsdaten).
//   npm run test:team:pg        (einmalig vorher: npm install)
//
// Geprüft wird die Kette  Geschäftslogik („Anfrage prüfen“, Variante postgre) → C_dbPostgre.sql() → SQL → Tabellen/Funktionen.
// Nicht geprüft: der Postgres-Knoten von n8n selbst (dafür ist ein Probelauf in n8n nötig).
// Schema: Pilot-SQL-Dateien + Team-Ergänzungen + Musterdaten (ein vollständiges Team-Schema in einer Datei gibt es nicht).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { anfragePruefenCode, dbCode } from '../n8n/bauen.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = [
	'portal-pilot/supabase/001_basis.sql',
	'portal-pilot/supabase/002_einstellungen.sql',
	'portal-pilot/supabase/003_team_laden.sql',
	'portal-pilot/supabase/100_option_arbeitszeit.sql',
	'portal-pilot/supabase/110_option_teilnehmer.sql',
	'portal-pilot/supabase/120_option_social.sql',
	'supabase/team_vorschlaege_kurt_1.sql',
	'supabase/team_vorschlaege_kurt_2_prio.sql',
	'portal-pilot/supabase/900_seed_musterfirma.sql'
];

let PGlite, pgcrypto, fehltPglite = false;
try {
	({ PGlite } = await import('@electric-sql/pglite'));
	({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch (e) {
	fehltPglite = 'PGlite fehlt: im Ordner N8N-Automation einmal „npm install“ ausführen';
}

const C = vm.runInNewContext(dbCode('postgre') + '\nC_dbPostgre', {});
const CODE = anfragePruefenCode('postgre');
let db;

async function datenbank() {
	if (db) return db;
	db = new PGlite({ extensions: { pgcrypto } });
	// Rollen, die die Supabase-Skripte in grant/revoke erwarten
	await db.exec('create role service_role; create role anon; create role authenticated;');
	for (const f of SCHEMA) {
		try { await db.exec(readFileSync(join(REPO, f), 'utf8')); }
		catch (e) { throw new Error('Schema ' + f + ': ' + e.message); }
	}
	return db;
}

const laden = async () => (await db.query('SELECT team_laden_plus() AS daten')).rows[0].daten;
const token = async id => (await db.query('select token from team_mitglieder where mitglied_id = $1', [id])).rows[0].token;
const zeile = async (tab, pk, id) => (await db.query(`select to_jsonb(t) as z from ${tab} t where ${pk}::text = $1`, [String(id)])).rows[0]?.z;

// Anfrage wie im Workflow: Logik ausführen, Schreibaufträge in SQL wandeln und nacheinander ausführen
async function anfrage(wer, aktion, daten) {
	const k = { 'Team-API': { body: { token: await token(wer), aktion, daten } }, 'Team-Daten laden': await laden() };
	const $ = n => ({ first: () => ({ json: k[n] }), all: () => [{ json: k[n] }] });
	const j = JSON.parse(JSON.stringify(vm.runInNewContext('(function(){\n' + CODE + '\n})()', { $ })))[0].json;
	assert.equal(j.weiter, 2, aktion + ' erzeugt keine Schreibaufträge: ' + JSON.stringify(j.antwort));
	for (const op of j.ops) {
		const q = C.sql(op);
		try { await db.query(q.sql, q.params); }
		catch (e) { throw new Error(aktion + ' (' + op.art + ' ' + op.tab + '): ' + e.message + '\n' + q.sql); }
	}
	return j;
}

const opt = { skip: fehltPglite };
const heute = new Date().toISOString().slice(0, 10);

test('Schema und Musterdaten lassen sich einspielen, team_laden_plus liefert Daten', opt, async () => {
	await datenbank();
	const D = await laden();
	assert.ok(D.mitglieder.length >= 4);
	assert.ok(D.aufgaben.length >= 1);
});

test('Aufgabe anlegen: Text mit Sonderzeichen, Array, Zahl, Datum', opt, async () => {
	await datenbank();
	const titel = 'PG-Test „ä“ \'quote\' ; drop table x; --';
	const j = await anfrage('mf-anna', 'aufgabe_speichern', { titel, bearbeiter: ['mf-ben', 'mf-clara'], prio: 7, skala: 10, deadline: '2026-12-01' });
	const r = await zeile('team_aufgaben', 'aufgabe_id', j.id);
	assert.equal(r.titel, titel);
	assert.deepEqual(r.bearbeiter, ['mf-ben', 'mf-clara']);
	assert.equal(r.prio, 7);
	assert.match(String(r.deadline), /^2026-12-01/);
	assert.ok((await db.query('select 1 from team_aufgaben_verlauf where aufgabe_id = $1', [j.id])).rows.length >= 1, 'Verlauf angelegt');
});

test('Aufgabe ändern und kommentieren', opt, async () => {
	await datenbank();
	const a = (await laden()).aufgaben[0];
	await anfrage('mf-anna', 'aufgabe_speichern', { aufgabe_id: a.aufgabe_id, titel: a.titel, status: 'Erledigt', bearbeiter: a.bearbeiter || [a.verantwortlich], prio: a.prio, skala: 10 });
	assert.equal((await zeile('team_aufgaben', 'aufgabe_id', a.aufgabe_id)).status, 'Erledigt');
	await anfrage('mf-ben', 'kommentar', { aufgabe_id: a.aufgabe_id, text: 'Kommentar über PostgreSQL' });
	assert.ok((await db.query("select 1 from team_aufgaben_verlauf where aufgabe_id = $1 and text = 'Kommentar über PostgreSQL'", [a.aufgabe_id])).rows.length);
});

test('Notiz ändern, löschen (team_loeschen) und wiederherstellen (team_wiederherstellen)', opt, async () => {
	await datenbank();
	const n = (await laden()).notizen[0];
	await anfrage('mf-anna', 'notiz_speichern', { notiz_id: n.notiz_id, titel: 'Neu betitelt', text: 'Text' });
	assert.equal((await zeile('team_notizen', 'notiz_id', n.notiz_id)).titel, 'Neu betitelt');
	await anfrage('mf-anna', 'notiz_loeschen', { notiz_id: n.notiz_id });
	assert.equal(await zeile('team_notizen', 'notiz_id', n.notiz_id), undefined);
	const e = (await laden()).papierkorb.find(x => x.objekt_id === n.notiz_id);
	assert.ok(e, 'Eintrag im Papierkorb');
	await anfrage('mf-anna', 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id });
	assert.equal((await zeile('team_notizen', 'notiz_id', n.notiz_id)).titel, 'Neu betitelt');
});

test('Projekt anlegen und löschen', opt, async () => {
	await datenbank();
	const j = await anfrage('mf-anna', 'projekt_speichern', { name: 'PG-Projekt', farbe: '#336699' });
	assert.equal((await zeile('team_projekte', 'projekt_id', j.id)).name, 'PG-Projekt');
	await anfrage('mf-anna', 'projekt_loeschen', { projekt_id: j.id });
	assert.equal(await zeile('team_projekte', 'projekt_id', j.id), undefined);
});

test('Vorschlag anlegen und abstimmen (Stimmen-Liste)', opt, async () => {
	await datenbank();
	const j = await anfrage('mf-ben', 'vorschlag_speichern', { titel: 'PG-Vorschlag', text: 'bitte' });
	await anfrage('mf-clara', 'vorschlag_stimme', { vorschlag_id: j.id, stimme: 1 });
	assert.ok((await zeile('team_vorschlaege', 'vorschlag_id', j.id)).stimmen.includes('mf-clara'));
});

test('Zeiterfassung: Eintrag mit mehreren Aufgaben, Woche einreichen (mehrere Zeilen auf einmal)', opt, async () => {
	await datenbank();
	const ids = (await laden()).aufgaben.slice(0, 2).map(a => a.aufgabe_id);
	const basis = { datum: heute, pause_min: 0, taetigkeit: 'Test über PostgreSQL', aufgaben_ids: ids };
	const z1 = await anfrage('mf-ben', 'zeit_speichern', { ...basis, von: '08:00', bis: '09:30' });
	const z2 = await anfrage('mf-ben', 'zeit_speichern', { ...basis, von: '10:00', bis: '10:45' });
	const r = await zeile('team_zeiten', 'zeit_id', z1.id);
	assert.equal(r.minuten, 90);
	assert.deepEqual(r.aufgaben_ids, ids);
	const kw = r.kw;
	await anfrage('mf-ben', 'woche_einreichen', { kw });
	for (const id of [z1.id, z2.id]) assert.equal((await zeile('team_zeiten', 'zeit_id', id)).status, 'eingereicht');
});

test('Teilnehmer-Register: Spalte, Teilnehmer, Haken (team_tn_haken mit Text und Datum)', opt, async () => {
	await datenbank();
	const sp = await anfrage('mf-anna', 'tn_spalte_speichern', { titel: 'Vertrag' });
	const tn = await anfrage('mf-anna', 'tn_speichern', { name: 'Test Teilnehmer', status: 'aktiv', start: '2026-11-01' });
	await anfrage('mf-anna', 'tn_haken', { tn_id: tn.id, spalte_id: sp.id, wert: 'ja', datum: '2026-11-20' });
	const t = await zeile('team_teilnehmer', 'tn_id', tn.id);
	assert.match(JSON.stringify(t.haken), new RegExp(sp.id));
	assert.match(JSON.stringify(t.haken), /2026-11-20/);
});

test('Ungültige Namen werden vor der Datenbank abgefangen', () => {
	assert.throws(() => C.sql({ art: 'neu', tab: 'x; drop table team_aufgaben', body: { a: 1 } }), /ungültiger Name/);
	assert.throws(() => C.sql({ art: 'neu', tab: 'team_aufgaben', body: { 'titel"; --': 1 } }), /ungültiger Name/);
});
