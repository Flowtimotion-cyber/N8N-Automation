// SQL-Test für supabase/team_chat_anhaenge.sql (Dateien im Team-Chat) gegen ein echtes Postgres im Speicher (PGlite).
// Spielt vorher die echten Dateien team_nachrichten.sql, team_chat.sql, team_bearbeiten.sql und team_chat_reaktionen.sql ein, wie in Supabase.
// Das Schema „storage“ (Buckets, Objekte) wird hier nachgebildet, so wie Supabase es bereitstellt.
//   PGLITE_PFAD=<ordner>/node_modules/@electric-sql/pglite/dist/index.js node --test chat/test/sql-anhaenge.test.mjs
// Ohne PGLITE_PFAD wird der Test übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const lies = n => readFileSync(join(SUPA, n), 'utf8');

test('team_chat_anhaenge.sql: vorbereiten, senden, Links, entfernen, wiederherstellen, aufräumen', async t => {
	if (!process.env.PGLITE_PFAD) return t.skip('PGLITE_PFAD nicht gesetzt');
	const { PGlite } = await import(pathToFileURL(process.env.PGLITE_PFAD).href);
	const db = new PGlite();
	const q = async (s, p) => (await db.query(s, p)).rows;
	const j = async (s, p) => Object.values((await q(s, p))[0])[0];
	const fehlt = async (s, p, muster) => { await assert.rejects(() => db.query(s, p), e => muster.test(e.message), 'erwartet Fehler ' + muster); };

	await db.exec(`create role anon; create role authenticated; create role service_role;
		create schema storage;
		create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
		create table storage.objects (bucket_id text, name text, metadata jsonb, primary key (bucket_id, name));
		create table team_mitglieder (mitglied_id text primary key, name text, status text, typ text);
		create table team_projekte (projekt_id text primary key, name text);
		insert into team_mitglieder values ('m_timo','Timo Test','aktiv','mensch'),('m_kurt','Kurt Test','aktiv','mensch'),('m_lillien','Lillien Test','aktiv','mensch');`);
	for (const f of ['team_nachrichten.sql', 'team_chat.sql', 'team_bearbeiten.sql', 'team_chat_reaktionen.sql']) await db.exec(lies(f));
	const g = (await j(`select team_chat_anlegen('m_timo','gruppe','Kursteam', array['m_kurt'])`)).chat.chat_id;
	const vorher = (await j(`select team_chat_senden('m_kurt', $1, 'Vor dem Einspielen')`, [g])).nachricht.nachricht_id;

	const sql = lies('team_chat_anhaenge.sql');
	await db.exec(sql); await db.exec(sql);   // zweimal: wiederholbar
	const b = (await q(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-anhaenge'`))[0];
	assert.equal(b.public, false, 'Bucket ist privat'); assert.equal(Number(b.file_size_limit), 26214400);
	assert.ok(b.allowed_mime_types.includes('application/pdf') && !b.allowed_mime_types.includes('text/html') && !b.allowed_mime_types.includes('image/svg+xml'));
	// Bestehende Nachrichten haben eine leere Liste, der Verlauf liefert sie mit
	assert.deepEqual((await j(`select team_chat_verlauf('m_timo', $1)`, [g])).nachrichten.find(n => n.nachricht_id === vorher).anhaenge, []);

	// Vorbereiten
	const v1 = await j(`select team_anhang_vorbereiten('m_timo', $1, 'Plan März 2026.pdf', 'application/pdf', 120000)`, [g]);
	assert.match(v1.anhang_id, /^an_[a-f0-9]{32}$/);
	assert.equal(v1.pfad, 'chat/' + g + '/' + v1.anhang_id + '/Plan_M_rz_2026.pdf', 'Pfad nur aus sicheren Zeichen');
	const v2 = await j(`select team_anhang_vorbereiten('m_timo', $1, 'foto.jpg', 'image/jpeg', 800000, 2560, 1920)`, [g]);
	await fehlt(`select team_anhang_vorbereiten('m_timo', $1, 'x.html', 'text/html', 10)`, [g], /Dateiart/);
	await fehlt(`select team_anhang_vorbereiten('m_timo', $1, 'gross.pdf', 'application/pdf', 26214401)`, [g], /zu groß/);
	await fehlt(`select team_anhang_vorbereiten('m_timo', $1, 'leer.pdf', 'application/pdf', 0)`, [g], /leer/);
	await fehlt(`select team_anhang_vorbereiten('m_lillien', $1, 'a.pdf', 'application/pdf', 10)`, [g], /nicht \(mehr\) dabei/);

	// Senden geht erst, wenn die Datei im Speicher liegt
	await fehlt(`select team_anhang_senden('m_timo', $1, '', array[$2, $3])`, [g, v1.anhang_id, v2.anhang_id], /noch nicht fertig hochgeladen/);
	await q(`insert into storage.objects values ('team-anhaenge', $1, '{"size": 118000}'), ('team-anhaenge', $2, '{"size": 640000}')`, [v1.pfad, v2.pfad]);
	await fehlt(`select team_anhang_senden('m_kurt', $1, '', array[$2])`, [g, v1.anhang_id], /fehlt oder wurde schon gesendet/);   // fremde Datei
	let r = await j(`select team_anhang_senden('m_timo', $1, '', array[$2, $3], array['m_kurt'])`, [g, v1.anhang_id, v2.anhang_id]);
	const nr = r.nachricht.nachricht_id;
	assert.equal(r.nachricht.text, '📎 Plan März 2026.pdf, foto.jpg', 'ohne Text steht der Dateiname da');
	assert.deepEqual(r.nachricht.anhaenge.map(a => [a.name, a.mime, a.groesse, a.entfernt]), [['Plan März 2026.pdf', 'application/pdf', 118000, false], ['foto.jpg', 'image/jpeg', 640000, false]], 'echte Größe aus dem Speicher');
	assert.equal(r.nachricht.anhaenge[1].breite, 2560);
	assert.ok(!JSON.stringify(r.nachricht).includes('chat/' + g), 'der Pfad geht nicht ans Portal');
	assert.equal(Number((await q(`select count(*) n from team_msgs`))[0].n), 1, '@-Markierung landet wie gewohnt im Posteingang');
	await fehlt(`select team_anhang_senden('m_timo', $1, 'nochmal', array[$2])`, [g, v1.anhang_id], /schon gesendet/);
	// Mit Text und als Antwort
	const v3 = await j(`select team_anhang_vorbereiten('m_kurt', $1, 'notiz.txt', 'text/plain', 12)`, [g]);
	await q(`insert into storage.objects values ('team-anhaenge', $1, '{"size": 12}')`, [v3.pfad]);
	r = await j(`select team_anhang_senden('m_kurt', $1, 'Hier die Notiz', array[$2], '{}', '{}', $3)`, [g, v3.anhang_id, nr]);
	assert.equal(r.nachricht.text, 'Hier die Notiz'); assert.equal(r.nachricht.zitat.nachricht_id, nr);

	// Links: nur Chat-Mitglieder, nur gesendete
	const v4 = await j(`select team_anhang_vorbereiten('m_timo', $1, 'offen.png', 'image/png', 50)`, [g]);
	let l = await j(`select team_anhang_links('m_kurt', $1, array[$2, $3, $4])`, [g, v1.anhang_id, v2.anhang_id, v4.anhang_id]);
	assert.deepEqual(l.anhaenge.map(a => a.anhang_id), [v1.anhang_id, v2.anhang_id], 'nicht gesendete Datei ohne Link');
	assert.equal(l.anhaenge[0].pfad, v1.pfad);
	await fehlt(`select team_anhang_links('m_lillien', $1, array[$2])`, [g, v1.anhang_id], /nicht \(mehr\) dabei/);
	const g2 = (await j(`select team_chat_anlegen('m_lillien','direkt','', array['m_timo'])`)).chat.chat_id;
	assert.deepEqual((await j(`select team_anhang_links('m_timo', $1, array[$2])`, [g2, v1.anhang_id])).anhaenge, [], 'Datei aus anderem Chat bleibt verborgen');

	// Entfernen: nur wer sie geschickt hat; danach kein Link, Verlauf zeigt „entfernt“
	const kurtV = await j(`select team_chat_verlauf('m_kurt', $1)`, [g]);
	const bis = kurtV.nachrichten[kurtV.nachrichten.length - 1].nachricht_id;
	await fehlt(`select team_anhang_entfernen('m_kurt', $1, $2)`, [g, v1.anhang_id], /Nur wer die Datei geschickt hat/);
	r = await j(`select team_anhang_entfernen('m_timo', $1, $2)`, [g, v1.anhang_id]);
	assert.deepEqual(r.nachricht.anhaenge.map(a => a.entfernt), [true, false]);
	await fehlt(`select team_anhang_entfernen('m_timo', $1, $2)`, [g, v1.anhang_id], /schon entfernt/);
	l = await j(`select team_anhang_links('m_kurt', $1, array[$2, $3])`, [g, v1.anhang_id, v2.anhang_id]);
	assert.deepEqual(l.anhaenge.map(a => a.anhang_id), [v2.anhang_id]);
	r = await j(`select team_chat_verlauf('m_kurt', $1, $2)`, [g, bis]);
	assert.deepEqual(r.bearbeitete.map(n => [n.nachricht_id, n.anhaenge[0].entfernt]), [[nr, true]], 'andere sehen das Entfernen beim Nachladen');
	// Wiederherstellen
	r = await j(`select team_anhang_entfernen('m_timo', $1, $2, true)`, [g, v1.anhang_id]);
	assert.equal(r.nachricht.anhaenge[0].entfernt, false);

	// Aufräumen: entfernt seit über 30 Tagen und abgebrochene Uploads älter als ein Tag
	await j(`select team_anhang_entfernen('m_timo', $1, $2)`, [g, v2.anhang_id]);
	await q(`update team_anhaenge set entfernt_am = now() - interval '31 days' where anhang_id = $1`, [v2.anhang_id]);
	await q(`update team_anhaenge set erstellt = now() - interval '2 days' where anhang_id = $1`, [v4.anhang_id]);
	await fehlt(`select team_anhang_entfernen('m_timo', $1, $2, true)`, [g, v2.anhang_id], /nicht mehr wiederherstellen/);
	l = await j(`select team_anhang_aufraeumen_liste()`);
	assert.deepEqual(l.anhaenge.map(a => a.anhang_id).sort(), [v2.anhang_id, v4.anhang_id].sort());
	assert.equal((await j(`select team_anhang_aufraeumen_fertig($1)`, [l.anhaenge.map(a => a.anhang_id)])).geloescht, 2);
	assert.deepEqual((await j(`select team_anhang_aufraeumen_liste()`)).anhaenge, []);
	const msg = (await j(`select team_chat_verlauf('m_timo', $1)`, [g])).nachrichten.find(n => n.nachricht_id === nr);
	assert.deepEqual(msg.anhaenge.map(a => [a.entfernt, a.endgueltig]), [[false, false], [true, true]]);

	// Normales Senden (laufender Workflow „TEAM: Chat (Portal)“) geht unverändert
	assert.deepEqual((await j(`select team_chat_senden(p_mitglied => 'm_timo', p_chat => $1, p_text => 'ohne Datei', p_erwaehnt => '{}', p_whatsapp => '{}')`, [g])).nachricht.anhaenge, []);
	await db.close();
});
