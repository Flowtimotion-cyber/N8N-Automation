// SQL-Test für supabase/team_chat.sql gegen ein echtes Postgres im Speicher (PGlite).
// PGlite ist keine Abhängigkeit des Repos. Einmalig in einem eigenen Ordner installieren und den Pfad übergeben:
//   npm install @electric-sql/pglite
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test chat/test/sql.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SQL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'team_chat.sql');

test('team_chat.sql: Rechte, Direktchat, Änderungen als Hinweis, Markierung und WhatsApp', async t => {
	if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
	const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
	const db = new PGlite();
	const q = async (s, p) => (await db.query(s, p)).rows;
	const j = async (s, p) => Object.values((await q(s, p))[0])[0];
	const fehlt = async (s, p, muster) => { await assert.rejects(() => db.query(s, p), e => muster.test(e.message), 'erwartet Fehler ' + muster); };

	await db.exec(`create role anon; create role authenticated; create role service_role;
		create table team_mitglieder (mitglied_id text primary key, name text, status text, typ text);
		create table team_projekte (projekt_id text primary key, name text);
		create table kom_benachrichtigungen (id bigint generated always as identity primary key, art text, mitglied_id text, aufgabe_id text, titel text, von text, status text default 'offen');
		create table team_msgs_log (absender text, empfaenger text[], text text);
		create function team_msgs_senden(p_absender text, p_empfaenger text[], p_text text) returns jsonb language sql as $$ insert into team_msgs_log values (p_absender, p_empfaenger, p_text); select '{}'::jsonb; $$;
		insert into team_mitglieder values ('m_timo','Timo Test','aktiv','mensch'),('m_kurt','Kurt Test','aktiv','mensch'),('m_lillien','Lillien Test','aktiv','mensch'),
			('m_weg','Gesperrt','gesperrt','mensch'),('agent-claude','Claude','aktiv','agent');
		insert into team_projekte values ('p1','Webseite');`);
	const sql = readFileSync(SQL, 'utf8');
	await db.exec(sql); await db.exec(sql);   // zweimal: wiederholbar

	// Gruppe anlegen
	let r = await j(`select team_chat_anlegen('m_timo','gruppe','Kursteam', array['m_kurt'])`);
	const g = r.chat.chat_id;
	assert.deepEqual([...r.chat.mitglieder].sort(), ['m_kurt', 'm_timo']);
	await fehlt(`select team_chat_anlegen('m_timo','gruppe','x', array['m_kurt'])`, [], /Namen/);
	await fehlt(`select team_chat_anlegen('m_timo','gruppe','Mit Agent', array['agent-claude'])`, [], /können nicht in einen Chat/);
	await fehlt(`select team_chat_anlegen('m_timo','gruppe','Mit Gesperrtem', array['m_weg'])`, [], /können nicht in einen Chat/);

	// Nur Mitglieder sehen den Chat – auch Lillien nicht
	assert.equal((await j(`select team_chat_liste('m_lillien')`)).chats.length, 0);
	await fehlt(`select team_chat_verlauf('m_lillien', $1)`, [g], /nicht \(mehr\) dabei/);
	await fehlt(`select team_chat_senden('m_lillien', $1, 'Hallo')`, [g], /nicht \(mehr\) dabei/);

	// Senden mit Markierung (Kurt) und WhatsApp-Haken; Markierung einer Nicht-Mitgliedin (Lillien) wird ignoriert
	r = await j(`select team_chat_senden('m_timo', $1, 'Hallo @Kurt', array['m_kurt','m_lillien','m_timo'], array['m_kurt','m_lillien'])`, [g]);
	assert.deepEqual(r.nachricht.erwaehnt, ['m_kurt']); assert.deepEqual(r.nachricht.whatsapp, ['m_kurt']);
	const log = await q(`select * from team_msgs_log`);
	assert.equal(log.length, 1); assert.deepEqual(log[0].empfaenger, ['m_kurt']); assert.match(log[0].text, /\*\*Timo\*\* hat dich \[im Chat „Kursteam“\]\(#\/chat\/chat_/);
	const wa = await q(`select art, mitglied_id, aufgabe_id, titel, von from kom_benachrichtigungen`);
	assert.deepEqual(wa, [{ art: 'chat_erwaehnung', mitglied_id: 'm_kurt', aufgabe_id: g, titel: 'Kursteam', von: 'm_timo' }]);

	// Ungelesen: Kurt hat 2 (Hinweis „angelegt“ + Nachricht), Timo 0 (eigene Nachricht, gelesen_bis gesetzt)
	let lk = (await j(`select team_chat_liste('m_kurt')`)).chats[0];
	assert.equal(Number(lk.ungelesen), 2);
	const vk = await j(`select team_chat_verlauf('m_kurt', $1)`, [g]);
	assert.equal(vk.nachrichten.length, 2); assert.equal(vk.nachrichten[0].autor, null);
	lk = (await j(`select team_chat_liste('m_kurt')`)).chats[0];
	assert.equal(Number(lk.ungelesen), 0, 'nach dem Öffnen gelesen');
	const nachId = vk.nachrichten[1].nachricht_id;
	assert.equal((await j(`select team_chat_verlauf('m_kurt', $1, $2)`, [g, nachId])).nachrichten.length, 0, 'nur Neues seit nachId');

	// Ändern: KI-Zugriff, Person hinzu, Projekt dazu – jeweils als Hinweis sichtbar
	r = await j(`select team_chat_aendern('m_kurt', $1, '{"ki_verlauf": true, "hinzu": ["m_lillien"], "projekt": "Webseite"}'::jsonb)`, [g]);
	assert.equal(r.chat.ki_verlauf, true); assert.equal(r.chat.art, 'projekt'); assert.deepEqual([...r.chat.mitglieder].sort(), ['m_kurt', 'm_lillien', 'm_timo']);
	const hinweise = (await q(`select text from team_chat_nachrichten where chat_id = $1 and autor is null order by nachricht_id`, [g])).map(x => x.text);
	assert.ok(hinweise.some(h => /^🤖 Kurt hat eingeschaltet: Die KI darf den ganzen Verlauf/.test(h)), JSON.stringify(hinweise));
	assert.ok(hinweise.includes('Kurt hat Lillien hinzugefügt.')); assert.ok(hinweise.includes('Kurt hat das Projekt „Webseite“ dazugeholt.'));
	await fehlt(`select team_chat_aendern('m_kurt', $1, '{"projekt": "Gibtsnicht"}'::jsonb)`, [g], /Projekt gibt es nicht/);

	// Verlassen
	r = await j(`select team_chat_aendern('m_lillien', $1, '{"weg": ["m_lillien"]}'::jsonb)`, [g]);
	assert.equal(r.verlassen, true);
	assert.equal((await j(`select team_chat_liste('m_lillien')`)).chats.length, 0);

	// Direktchat: genau zwei, wird wiederverwendet, niemand kommt dazu
	const d1 = await j(`select team_chat_anlegen('m_timo','direkt','', array['m_lillien'])`);
	const d2 = await j(`select team_chat_anlegen('m_lillien','direkt','egal', array['m_timo'])`);
	assert.equal(d2.vorhanden, true); assert.equal(d2.chat.chat_id, d1.chat.chat_id);
	await fehlt(`select team_chat_anlegen('m_timo','direkt','', array['m_lillien','m_kurt'])`, [], /genau zwischen dir und einer weiteren Person/);
	await fehlt(`select team_chat_aendern('m_timo', $1, '{"hinzu": ["m_kurt"]}'::jsonb)`, [d1.chat.chat_id], /Direktchat kann niemand dazukommen/);

	// Projekt-Chat: Titel = Projektname, wenn leer
	const p = await j(`select team_chat_anlegen('m_kurt','projekt','', array['m_timo'], 'Webseite')`);
	assert.equal(p.chat.titel, 'Webseite'); assert.equal(p.chat.art, 'projekt');

	// Liste nach letzter Nachricht sortiert
	await j(`select team_chat_senden('m_timo', $1, 'neu')`, [g]);
	assert.equal((await j(`select team_chat_liste('m_timo')`)).chats[0].chat_id, g);
	await db.close();
});
