// SQL-Test für supabase/team_chat_reaktionen.sql (Antworten mit Zitat, Smiley-Reaktionen) gegen ein echtes Postgres im Speicher (PGlite).
// Spielt vorher die echten Dateien team_nachrichten.sql, team_chat.sql und team_bearbeiten.sql ein, genau wie in Supabase.
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test chat/test/sql-reaktionen.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const lies = n => readFileSync(join(SUPA, n), 'utf8');

test('team_chat_reaktionen.sql: Antwort mit Zitat, Reaktionen umschalten, Verlauf, alte Aufrufe gehen weiter', async t => {
	if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
	const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
	const db = new PGlite();
	const q = async (s, p) => (await db.query(s, p)).rows;
	const j = async (s, p) => Object.values((await q(s, p))[0])[0];
	const fehlt = async (s, p, muster) => { await assert.rejects(() => db.query(s, p), e => muster.test(e.message), 'erwartet Fehler ' + muster); };

	await db.exec(`create role anon; create role authenticated; create role service_role;
		create table team_mitglieder (mitglied_id text primary key, name text, status text, typ text);
		create table team_projekte (projekt_id text primary key, name text);
		insert into team_mitglieder values ('m_timo','Timo Test','aktiv','mensch'),('m_kurt','Kurt Test','aktiv','mensch'),('m_lillien','Lillien Test','aktiv','mensch');`);
	for (const f of ['team_nachrichten.sql', 'team_chat.sql', 'team_bearbeiten.sql']) await db.exec(lies(f));
	// Bestand vor dem Einspielen
	const g = (await j(`select team_chat_anlegen('m_timo','gruppe','Kursteam', array['m_kurt'])`)).chat.chat_id;
	const frage = (await j(`select team_chat_senden('m_kurt', $1, 'Treffen um 10?')`, [g])).nachricht.nachricht_id;
	const sql = lies('team_chat_reaktionen.sql');
	await db.exec(sql); await db.exec(sql);   // zweimal: wiederholbar
	assert.equal(Number((await q(`select count(*) n from pg_proc where proname = 'team_chat_senden'`))[0].n), 1, 'nur eine Fassung von team_chat_senden');

	// Alte Aufrufform (wie der laufende n8n-Workflow, ohne p_antwort_auf) geht weiter
	let r = await j(`select team_chat_senden(p_mitglied => 'm_timo', p_chat => $1, p_text => 'ohne Antwort', p_erwaehnt => '{}', p_whatsapp => '{}')`, [g]);
	assert.equal(r.nachricht.antwort_auf, null); assert.equal(r.nachricht.zitat, null); assert.deepEqual(r.nachricht.reaktionen, {});
	// Antwort mit Zitat
	r = await j(`select team_chat_senden(p_mitglied => 'm_timo', p_chat => $1, p_text => 'Ja, passt.', p_antwort_auf => $2)`, [g, frage]);
	assert.equal(r.nachricht.antwort_auf, frage); assert.deepEqual(r.nachricht.zitat, { nachricht_id: frage, autor: 'm_kurt', text: 'Treffen um 10?' });
	const antw = r.nachricht.nachricht_id;
	// Verweis in einen anderen Chat wird verworfen
	const g2 = (await j(`select team_chat_anlegen('m_timo','gruppe','Anderer', array['m_lillien'])`)).chat.chat_id;
	assert.equal((await j(`select team_chat_senden(p_mitglied => 'm_timo', p_chat => $1, p_text => 'x', p_antwort_auf => $2)`, [g2, frage])).nachricht.antwort_auf, null);

	// Reaktionen
	const kurtV = await j(`select team_chat_verlauf('m_kurt', $1)`, [g]);
	const kurtBis = kurtV.nachrichten[kurtV.nachrichten.length - 1].nachricht_id;
	assert.equal(kurtV.nachrichten.find(n => n.nachricht_id === antw).zitat.text, 'Treffen um 10?', 'Verlauf liefert das Zitat');
	assert.deepEqual((await j(`select team_chat_reagieren('m_timo', $1, $2, '👍')`, [g, frage])).nachricht.reaktionen, { '👍': ['m_timo'] });
	assert.deepEqual((await j(`select team_chat_reagieren('m_kurt', $1, $2, '👍')`, [g, frage])).nachricht.reaktionen, { '👍': ['m_timo', 'm_kurt'] });
	assert.deepEqual((await j(`select team_chat_reagieren('m_kurt', $1, $2, '❤️')`, [g, frage])).nachricht.reaktionen, { '👍': ['m_timo', 'm_kurt'], '❤️': ['m_kurt'] });
	assert.deepEqual((await j(`select team_chat_reagieren('m_timo', $1, $2, '👍')`, [g, frage])).nachricht.reaktionen, { '👍': ['m_kurt'], '❤️': ['m_kurt'] });
	assert.deepEqual((await j(`select team_chat_reagieren('m_kurt', $1, $2, '❤️')`, [g, frage])).nachricht.reaktionen, { '👍': ['m_kurt'] }, 'leerer Smiley verschwindet');
	await fehlt(`select team_chat_reagieren('m_kurt', $1, $2, '💩')`, [g, frage], /Smiley/);
	await fehlt(`select team_chat_reagieren('m_lillien', $1, $2, '👍')`, [g, frage], /nicht \(mehr\) dabei/);
	await fehlt(`select team_chat_reagieren('m_timo', $1, 1, '👍')`, [g], /nicht reagieren/);   // Hinweis „angelegt“
	// Wer nur Neues holt, bekommt die Nachricht mit geänderten Reaktionen über „bearbeitete“
	r = await j(`select team_chat_verlauf('m_kurt', $1, $2)`, [g, kurtBis]);
	assert.deepEqual(r.nachrichten, []); assert.deepEqual(r.bearbeitete.map(n => [n.nachricht_id, n.reaktionen]), [[frage, { '👍': ['m_kurt'] }]]);
	// Bearbeiten (team_bearbeiten.sql) läuft weiter
	assert.equal((await j(`select team_chat_bearbeiten('m_timo', $1, $2, 'Ja, passt gut.')`, [g, antw])).nachricht.text, 'Ja, passt gut.');
	await db.close();
});
