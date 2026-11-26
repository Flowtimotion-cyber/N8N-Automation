// SQL-Test für supabase/team_bearbeiten.sql (Nachrichten bearbeiten, Posteingang und Team-Chat) gegen ein echtes Postgres im Speicher (PGlite).
// Spielt vorher die echten Dateien team_nachrichten.sql und team_chat.sql ein, genau wie in Supabase.
// PGlite ist keine Abhängigkeit des Repos. Einmalig in einem eigenen Ordner installieren und den Pfad übergeben:
//   npm install @electric-sql/pglite
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test nachrichten/test/sql-bearbeiten.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const lies = n => readFileSync(join(SUPA, n), 'utf8');

test('team_bearbeiten.sql: nur Absender, 24 Stunden, alte Fassung, neu Markierte, Verlauf, rückwärtsverträglich', async t => {
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
	await db.exec(lies('team_nachrichten.sql'));
	await db.exec(lies('team_chat.sql'));
	// Bestand vor dem Einspielen: eine Nachricht und ein Chat mit Nachricht (Spalte bearbeitet gibt es noch nicht)
	const alt = (await j(`select team_msgs_senden('m_kurt', array['m_timo'], 'vor dem Update')`)).nachricht.msg_id;
	const g = (await j(`select team_chat_anlegen('m_timo','gruppe','Kursteam', array['m_kurt','m_lillien'])`)).chat.chat_id;
	const n0 = (await j(`select team_chat_senden('m_timo', $1, 'Hallo @Kurt', array['m_kurt'])`, [g])).nachricht.nachricht_id;
	const sql = lies('team_bearbeiten.sql');
	await db.exec(sql); await db.exec(sql);   // zweimal: wiederholbar

	// --- Posteingang ---
	let r = await j(`select team_msgs_laden('m_timo')`);
	assert.equal(r.nachrichten[0].bearbeitet, null, 'Bestand: neue Spalte leer');
	assert.deepEqual((await j(`select team_msgs_gesendet('m_kurt')`)).nachrichten.map(m => m.msg_id), [alt]);
	assert.deepEqual((await j(`select team_msgs_gesendet('m_lillien')`)).nachrichten, []);
	// Auch der automatische Hinweis zur Chat-Markierung läuft in Timos Namen und steht darum unter „Gesendet“
	assert.match((await j(`select team_msgs_gesendet('m_timo')`)).nachrichten[0].text, /hat dich \[im Chat/);
	await fehlt(`select team_msgs_bearbeiten('m_timo', $1, 'gefälscht')`, [alt], /nur, wer die Nachricht geschrieben hat/);
	await fehlt(`select team_msgs_bearbeiten('m_kurt', $1, '  ')`, [alt], /leer/);
	await j(`select team_msgs_oeffnen('m_timo', $1)`, [alt]);
	r = await j(`select team_msgs_bearbeiten('m_kurt', $1, 'nach dem Update')`, [alt]);
	assert.equal(r.nachricht.text, 'nach dem Update'); assert.ok(r.nachricht.bearbeitet);
	assert.equal((await j(`select team_msgs_bearbeiten('m_kurt', $1, 'nach dem Update')`, [alt])).unveraendert, true);
	r = await j(`select team_msgs_laden('m_timo')`);
	assert.equal(r.nachrichten[0].text, 'nach dem Update'); assert.equal(r.liste[0].gelesen, true, 'Lesestand bleibt');
	assert.deepEqual(await q(`select quelle, nachricht, autor, text from team_nachricht_fassungen`), [{ quelle: 'posteingang', nachricht: alt, autor: 'm_kurt', text: 'vor dem Update' }]);
	const sys = (await j(`select team_msgs_senden(null, array['m_timo'], 'Hinweis vom Portal')`)).nachricht.msg_id;
	await fehlt(`select team_msgs_bearbeiten('m_timo', $1, 'x')`, [sys], /nur, wer die Nachricht geschrieben hat/);
	await db.query(`update team_msgs set gesendet = now() - interval '25 hours' where msg_id = $1`, [alt]);
	await fehlt(`select team_msgs_bearbeiten('m_kurt', $1, 'zu spät')`, [alt], /24 Stunden/);

	// --- Chat ---
	const posteingang = async () => (await q(`select empfaenger, text from team_msgs where absender = 'm_timo' order by gesendet, msg_id`));
	const vorher = (await posteingang()).length;   // 1: Hinweis an Kurt vom Senden
	const kurtV = await j(`select team_chat_verlauf('m_kurt', $1)`, [g]);
	const kurtBis = kurtV.nachrichten[kurtV.nachrichten.length - 1].nachricht_id;
	assert.deepEqual(kurtV.bearbeitete, [], 'volles Laden: Feld da, aber leer');
	await fehlt(`select team_chat_bearbeiten('m_kurt', $1, $2, 'gefälscht')`, [g, n0], /nur, wer die Nachricht geschrieben hat/);
	await fehlt(`select team_chat_bearbeiten('m_timo', $1, $2, 'x')`, [g, 1], /nur, wer die Nachricht geschrieben hat/);   // Hinweis „angelegt“
	r = await j(`select team_chat_bearbeiten('m_timo', $1, $2, 'Hallo @Kurt und @Lillien', array['m_kurt','m_lillien','m_timo'])`, [g, n0]);
	assert.deepEqual(r.nachricht.erwaehnt, ['m_kurt', 'm_lillien']); assert.deepEqual(r.benachrichtigt, ['m_lillien']); assert.ok(r.nachricht.bearbeitet);
	let p = await posteingang();
	assert.equal(p.length, vorher + 1); assert.deepEqual(p[p.length - 1].empfaenger, ['m_lillien']);
	assert.match(p[p.length - 1].text, /^\*\*Timo\*\* hat dich \[im Chat „Kursteam“\]\(#\/chat\/chat_[a-f0-9]+\) erwähnt \(in einer bearbeiteten Nachricht\)/);
	// Kurt holt nur Neues und sieht die Änderung trotzdem
	r = await j(`select team_chat_verlauf('m_kurt', $1, $2)`, [g, kurtBis]);
	assert.deepEqual(r.nachrichten, []); assert.deepEqual(r.bearbeitete.map(x => x.text), ['Hallo @Kurt und @Lillien']);
	// Lillien raus und wieder rein: kein zweiter Hinweis; WhatsApp-Spalte bleibt unberührt
	await j(`select team_chat_bearbeiten('m_timo', $1, $2, 'Hallo @Kurt', array['m_kurt'])`, [g, n0]);
	r = await j(`select team_chat_bearbeiten('m_timo', $1, $2, 'Hallo @Kurt @Lillien!', array['m_kurt','m_lillien'])`, [g, n0]);
	assert.deepEqual(r.benachrichtigt, []); assert.equal((await posteingang()).length, vorher + 1);
	assert.deepEqual(r.nachricht.whatsapp, []);
	assert.equal((await j(`select team_chat_bearbeiten('m_timo', $1, $2, 'Hallo @Kurt @Lillien!', array['m_lillien','m_kurt'])`, [g, n0])).unveraendert, true);
	assert.equal(Number((await q(`select count(*) n from team_nachricht_fassungen where quelle = 'chat'`))[0].n), 3);
	// Wer den Chat verlassen hat, kann nicht mehr bearbeiten; nach 24 Stunden niemand
	const n1 = (await j(`select team_chat_senden('m_lillien', $1, 'Bin weg')`, [g])).nachricht.nachricht_id;
	await j(`select team_chat_aendern('m_lillien', $1, '{"weg": ["m_lillien"]}'::jsonb)`, [g]);
	await fehlt(`select team_chat_bearbeiten('m_lillien', $1, $2, 'doch nicht')`, [g, n1], /nicht \(mehr\) dabei/);
	await db.query(`update team_chat_nachrichten set erstellt = now() - interval '25 hours' where nachricht_id = $1`, [n0]);
	await fehlt(`select team_chat_bearbeiten('m_timo', $1, $2, 'zu spät')`, [g, n0], /24 Stunden/);
	// Alte Aufrufform von team_chat_verlauf (vier Werte, wie der laufende n8n-Workflow) geht weiter
	r = await j(`select team_chat_verlauf('m_timo', $1, 0, 200)`, [g]);
	assert.ok(r.nachrichten.length >= 3); assert.ok(r.chat.chat_id === g);
	assert.equal(Number((await q(`select count(*) n from pg_proc where proname = 'team_chat_verlauf'`))[0].n), 1, 'keine zweite Fassung der Funktion');
	await db.close();
});
