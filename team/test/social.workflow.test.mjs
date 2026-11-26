// Tests für den Medienspeicher (C_MedienSpeicher, C_MedienSpeicher_Supabase) und den Workflow „TEAM: Social-Upload“.
// Start: npm run test:team:social
// Der Workflow läuft im Simulator (n8n-simulator.mjs): geprüft werden die HTTP-Anfragen an Supabase und die Antworten
// ans Portal. Die erwarteten Adressen sind genau die, die der Workflow vor der Umstellung auf C_DataBase/C_MedienSpeicher
// von Hand gebaut hat (Vergleich alt/neu am 26.11.2026: 48 von 48 Abläufen gleich).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LIB, SDK, AUSFUEHRUNG } from '../n8n/bauen-social.mjs';
import { workflowLaden, ausfuehren } from './n8n-simulator.mjs';

const GEN = fileURLToPath(new URL('../n8n/social.workflow.gen.js', import.meta.url));
const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const STORAGE = 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1/';

// Alle Klassen wie im Code-Knoten; ausdruck wird danach ausgewertet
const lib = ausdruck => vm.runInNewContext(LIB + '\n' + ausdruck, { URL, encodeURIComponent });

// ===== Medienspeicher =====

test('C_MedienSpeicher ist nur die Schnittstelle; Bereiche und Pfade werden geprüft', () => {
	assert.throws(() => lib('new C_MedienSpeicher("x", {})'), /nur die Schnittstelle/);
	assert.throws(() => lib('class C_MedienSpeicher_Halb extends C_MedienSpeicher { constructor() { super("halb", {}); } }; new C_MedienSpeicher_Halb().loeschen("a", "b")'), /C_MedienSpeicher_Halb implementiert loeschen\(\) nicht/);
	assert.throws(() => lib('new C_MedienSpeicher_Supabase("https://s", { "../x": { oeffentlich: true } })'), /ungültiger Bereichsname/);
	assert.throws(() => lib('medienSpeicher.loeschen("gibts-nicht", "a.mp4")'), /unbekannter Bereich/);
	assert.throws(() => lib('medienSpeicher.loeschen("constructor", "a.mp4")'), /unbekannter Bereich/, 'keine geerbten Objekt-Eigenschaften als Bereich');
	for (const p of ['', '/a.mp4', 'a//b.mp4', '../a.mp4', '2026/../../x', 'a/./b', null]) {
		assert.throws(() => lib('medienSpeicher.loeschen("medien-roh", ' + JSON.stringify(p) + ')'), /ungültiger Pfad/, 'Pfad ' + p);
		assert.throws(() => lib('medienSpeicher.uploadAdresseHolen("medien-roh", ' + JSON.stringify(p) + ')'), /ungültiger Pfad/, 'Pfad ' + p);
	}
});

test('C_MedienSpeicher_Supabase: Aufträge und Adressen wie bisher im Workflow', () => {
	const r = JSON.parse(JSON.stringify(lib(`[
		medienSpeicher.kennung,
		medienSpeicher.bereiche,
		medienSpeicher.uploadAdresseHolen('medien-roh', '2026/10/up_a_Dreh ä.mov'),
		medienSpeicher.loeschen('medien-roh', '2026/10/up_a_x.mov'),
		medienSpeicher.uploadAdresse({ url: '/object/upload/sign/medien-roh/a.mov?token=t' }),
		medienSpeicher.uploadAdresse({ url: 'https://anders.example/x' }),
		medienSpeicher.uploadAdresse({ message: 'Fehler' }),
		medienSpeicher.oeffentlicheAdresse('social-ideen', 'ideen/2026/10/bild_a_b c.png'),
		medienSpeicher.oeffentlicheAdresse('social-ideen', '')
	]`)));
	assert.deepEqual(r, [
		'supabase',
		{ 'medien-roh': { oeffentlich: false }, 'social-ideen': { oeffentlich: true } },
		{ methode: 'POST', pfad: 'object/upload/sign/medien-roh/2026/10/up_a_Dreh%20%C3%A4.mov', body: {} },
		{ methode: 'DELETE', pfad: 'object/medien-roh/2026/10/up_a_x.mov', body: {} },
		STORAGE + 'object/upload/sign/medien-roh/a.mov?token=t',
		'https://anders.example/x',
		null,
		STORAGE + 'object/public/social-ideen/ideen/2026/10/bild_a_b%20c.png',
		null
	]);
	assert.throws(() => lib('medienSpeicher.oeffentlicheAdresse("medien-roh", "a.mov")'), /privat/, 'privater Bereich hat keine öffentliche Adresse');
});

// ===== Aufträge aus C_Social =====

test('C_Social.auftraege: Methode jedes Auftrags passt zur festen Methode des ausführenden Knotens', () => {
	const ich = '{ mitglied_id: "m_timo", rolle: "admin", status: "aktiv" }';
	const r = JSON.parse(JSON.stringify(lib(`const A = (aktion, daten) => C_Social.auftraege(C_Social.anfrage(${ich}, aktion, daten, 1790000000000), dataBase, medienSpeicher);
		const L = A('upload_loeschen', { upload_id: 'up_abcdef' });
		({
			'Mitglied prüfen': C_Social.mitgliedLesen(dataBase, 'abc'),
			'Ideen laden': A('laden').db.ideen,
			'Uploads laden': A('laden').db.uploads,
			'Idee speichern': A('idee_speichern', { warum_stark: 'x' }).db,
			'Idee in Papierkorb': A('idee_loeschen', { idee_id: 'idee_abcdef' }).db,
			'Upload anlegen': A('upload_url', { dateiname: 'a.mov', groesse: 1, einwilligung: true, thema: 'Test' }).db,
			'Upload-Adresse signieren': A('upload_url', { dateiname: 'a.mov', groesse: 1, einwilligung: true, thema: 'Test' }).speicher,
			'Bild-Adresse signieren': A('idee_bild_url', { dateiname: 'a.png', groesse: 1 }).speicher,
			'Upload-Status setzen': A('upload_status', { upload_id: 'up_abcdef', status: 'geschnitten' }).db,
			'Upload suchen': L.db,
			'Datei löschen': C_Social.loeschenAuftraege(L, { upload_id: 'up_abcdef', bucket: 'medien-roh', pfad: '2026/10/a.mov' }, dataBase, medienSpeicher).speicher,
			'Als gelöscht markieren': C_Social.loeschenAuftraege(L, { upload_id: 'up_abcdef', bucket: 'medien-roh', pfad: '2026/10/a.mov' }, dataBase, medienSpeicher).db
		})`)));
	assert.deepEqual(Object.keys(r).sort(), Object.keys(AUSFUEHRUNG).sort(), 'jeder ausführende Knoten hat einen Auftrag');
	for (const [knoten, auftrag] of Object.entries(r)) assert.equal(auftrag.methode, AUSFUEHRUNG[knoten].methode, knoten);
});

// ===== Workflow im Simulator =====

const TOK = { timo: 'a'.repeat(32), lilli: 'b'.repeat(32), agent: 'c'.repeat(32) };
const MITGLIED = {
	[TOK.timo]:  { mitglied_id: 'm_timo', name: 'Timo', rolle: 'admin', status: 'aktiv', typ: 'mensch' },
	[TOK.lilli]: { mitglied_id: 'm_lillien', name: 'Lillien', rolle: 'team', status: 'aktiv', typ: 'mensch' },
	[TOK.agent]: { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', status: 'aktiv', typ: 'agent' }
};
const ZEIT = 1790000000000;   // 2026-09-21
const kontext = () => {
	let n = 0;
	const M = Object.create(Math); M.random = () => ((n++ * 0.137) % 1) + 0.001;
	class D extends Date { constructor(...a) { super(...(a.length ? a : [ZEIT])); } static now() { return ZEIT; } }
	return { Math: M, Date: D };
};
const antworten = (extra = {}) => Object.assign({
	'Mitglied prüfen': r => { const t = /token=eq\.([^&]*)/.exec(r.url)[1]; return MITGLIED[t] ? [MITGLIED[t]] : []; },
	'Ideen laden': () => [{ idee_id: 'idee_1', geaendert: '2026-09-01', bild_pfad: 'ideen/2026/09/bild_abcdef_a b.png' }],
	'Uploads laden': () => [{ upload_id: 'up_1', pfad: '2026/09/up_1_x.mov', status: 'hochgeladen', erstellt: '2026-09-02', bucket: 'medien-roh' }],
	'Idee speichern': () => [{}], 'Idee in Papierkorb': () => [{}], 'Upload anlegen': () => [{}], 'Upload-Status setzen': () => [{}],
	'Upload-Adresse signieren': () => [{ url: '/object/upload/sign/medien-roh/x?token=t' }],
	'Bild-Adresse signieren': () => [{ url: '/object/upload/sign/social-ideen/y?token=u' }],
	'Upload suchen': () => [{ upload_id: 'up_abcdef', bucket: 'medien-roh', pfad: '2026/09/up_abcdef_D ä.mov' }],
	'Datei löschen': () => [{}], 'Als gelöscht markieren': () => [{}]
}, extra);
const WF = workflowLaden(GEN);
const lauf = (wer, aktion, daten, extra) => ausfuehren(WF, { body: { token: TOK[wer] || 'kaputt', aktion, daten }, antworten: antworten(extra), kontext: kontext() });
const ohneMitglied = r => r.anfragen.slice(1).map(a => [a.knoten, a.methode, a.url, a.body]);

test('SDK-Datei ist aktuell (sonst: npm run team:bauen-social)', () => {
	assert.equal(readFileSync(GEN, 'utf8').replace(/\r\n/g, '\n'), SDK);
});

test('Workflow: Zugang über Token, unbekannte Aktion, Agent', () => {
	const r = lauf('kaputt', 'laden');
	assert.deepEqual(r.anfragen.map(a => a.url), [SUPA + 'team_mitglieder?select=mitglied_id,name,rolle,status,typ&token=eq.ungueltig']);
	assert.equal(r.code, 401);
	assert.equal(lauf('lilli', 'unsinn').code, 400);
	assert.equal(lauf('agent', 'idee_speichern', { warum_stark: 'x' }).code, 403);
	assert.equal(lauf('timo', 'laden').anfragen[0].url, SUPA + 'team_mitglieder?select=mitglied_id,name,rolle,status,typ&token=eq.' + TOK.timo);
});

test('Workflow: laden', () => {
	const r = lauf('lilli', 'laden');
	assert.deepEqual(ohneMitglied(r), [
		['Ideen laden', 'GET', SUPA + 'team_social_ideen?select=*&order=geaendert.desc&limit=200', undefined],
		['Uploads laden', 'GET', SUPA + 'team_social_uploads?select=*&status=neq.geloescht&order=erstellt.desc&limit=50', undefined]
	]);
	assert.equal(r.code, 200);
	assert.equal(r.antwort.ideen[0].bild_url, STORAGE + 'object/public/social-ideen/ideen/2026/09/bild_abcdef_a%20b.png');
	assert.equal(r.antwort.uploads[0].pfad, undefined, 'Teammitglied sieht keinen Pfad');
});

test('Workflow: Ideen speichern und in den Papierkorb', () => {
	const r = lauf('lilli', 'idee_speichern', { link: 'https://www.instagram.com/reel/abc/', idee_id: 'idee_abcdef' });
	const [[knoten, methode, url, body]] = ohneMitglied(r);
	assert.deepEqual([knoten, methode, url], ['Idee speichern', 'POST', SUPA + 'rpc/team_idee_speichern']);
	assert.deepEqual(Object.keys(JSON.parse(body)), ['p', 'p_von']);
	assert.equal(JSON.parse(body).p.kanal, 'Instagram');
	assert.equal(r.antwort.id, 'idee_abcdef');
	assert.deepEqual(ohneMitglied(lauf('lilli', 'idee_loeschen', { idee_id: 'idee_abcdef' })), [
		['Idee in Papierkorb', 'POST', SUPA + 'rpc/team_loeschen', '{"p_art":"idee","p_id":"idee_abcdef","p_von":"m_lillien"}']
	]);
});

test('Workflow: Video hochladen (Eintrag + signierte Adresse im privaten Bereich)', () => {
	const r = lauf('lilli', 'upload_url', { dateiname: 'Dreh ä.mov', groesse: 5, einwilligung: true, thema: 'Werkstatt' });
	const a = ohneMitglied(r);
	const id = JSON.parse(a[0][3]).p.upload_id;
	assert.deepEqual(a.map(x => x.slice(0, 2)), [['Upload anlegen', 'POST'], ['Upload-Adresse signieren', 'POST']]);
	assert.equal(a[0][2], SUPA + 'rpc/team_upload_anlegen');
	assert.equal(a[1][2], STORAGE + 'object/upload/sign/medien-roh/2026/09/' + id + '_Dreh-ae.mov');
	assert.equal(a[1][3], '{}');
	assert.equal(r.antwort.url, STORAGE + 'object/upload/sign/medien-roh/x?token=t');
	assert.equal(r.antwort.bucket, 'medien-roh');
	const f = lauf('lilli', 'upload_url', { dateiname: 'a.mov', groesse: 5, einwilligung: true, thema: 'Werkstatt' }, { 'Upload-Adresse signieren': () => [{ message: 'Bucket fehlt' }] });
	assert.equal(f.code, 502); assert.match(f.antwort.fehler, /Bucket fehlt/);
});

test('Workflow: Bild zu einer Idee (signierte Adresse + öffentliche Adresse)', () => {
	const r = lauf('lilli', 'idee_bild_url', { dateiname: 'Shot 1.PNG', groesse: 10, mime: 'image/png' });
	const [[knoten, methode, url]] = ohneMitglied(r);
	assert.deepEqual([knoten, methode], ['Bild-Adresse signieren', 'POST']);
	assert.match(url, /^https:\/\/llhwmzhvhluamxwemaqx\.supabase\.co\/storage\/v1\/object\/upload\/sign\/social-ideen\/ideen\/2026\/09\/bild_[a-z0-9]+_Shot-1\.PNG$/);
	assert.equal(r.antwort.bild_url, url.replace('/object/upload/sign/', '/object/public/'));
});

test('Workflow: Status melden', () => {
	assert.deepEqual(ohneMitglied(lauf('agent', 'upload_status', { upload_id: 'up_abcdef', status: 'beauftragt', run_id: 'run_abcd1' })), [
		['Upload-Status setzen', 'POST', SUPA + 'rpc/team_upload_status', '{"p_id":"up_abcdef","p_status":"beauftragt","p_von":"agent-claude","p_run":"run_abcd1","p_fehler":null}']
	]);
});

test('Workflow: Rohvideo löschen (nur Admin; nicht gefunden; kaputter Pfad)', () => {
	const r = lauf('timo', 'upload_loeschen', { upload_id: 'up_abcdef' });
	assert.deepEqual(ohneMitglied(r), [
		['Upload suchen', 'GET', SUPA + 'team_social_uploads?select=upload_id,bucket,pfad&upload_id=eq.up_abcdef', undefined],
		['Datei löschen', 'DELETE', STORAGE + 'object/medien-roh/2026/09/up_abcdef_D%20%C3%A4.mov', undefined],
		['Als gelöscht markieren', 'POST', SUPA + 'rpc/team_upload_status', '{"p_id":"up_abcdef","p_status":"geloescht","p_von":"m_timo"}']
	]);
	assert.equal(r.code, 200);
	assert.equal(lauf('lilli', 'upload_loeschen', { upload_id: 'up_abcdef' }).code, 403);
	const weg = lauf('timo', 'upload_loeschen', { upload_id: 'up_abcdef' }, { 'Upload suchen': () => [] });
	assert.equal(weg.code, 404); assert.equal(weg.anfragen.length, 2, 'nichts gelöscht');
	const kaputt = lauf('timo', 'upload_loeschen', { upload_id: 'up_abcdef' }, { 'Upload suchen': () => [{ upload_id: 'up_abcdef', bucket: 'medien-roh', pfad: '../x' }] });
	assert.equal(kaputt.code, 409); assert.equal(kaputt.anfragen.length, 2, 'nichts gelöscht');
});
