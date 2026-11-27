// Tests für C_Social (team/n8n/C_Social.js). Start: npm run test:team:social
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { C_Social } from '../n8n/C_Social.js';

// Medienspeicher wie im Workflow (Klassen ohne export, deshalb per vm geladen)
const N8N = new URL('../n8n/', import.meta.url);
const MS = vm.runInNewContext(['C_MedienSpeicher.js', 'C_MedienSpeicher_Supabase.js'].map(d => readFileSync(new URL(d, N8N), 'utf8')).join('\n') + '\nC_MedienSpeicher_Supabase', { encodeURIComponent });
const speicher = basis => new MS(basis, C_Social.BEREICHE);

const JETZT = Date.parse('2026-10-28T12:00:00Z');
const timo = { mitglied_id: 'm_timo', name: 'Timo', rolle: 'admin', status: 'aktiv', typ: 'mensch' };
const lilli = { mitglied_id: 'm_lillien', name: 'Lillien', rolle: 'team', status: 'aktiv', typ: 'mensch' };
const claude = { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', status: 'aktiv', typ: 'agent' };

test('Zugang', () => {
	assert.equal(C_Social.anfrage(null, 'laden').code, 401);
	assert.equal(C_Social.anfrage({ ...timo, status: 'gesperrt' }, 'laden').code, 401);
	assert.equal(C_Social.anfrage(timo, 'quatsch').code, 400);
	assert.equal(C_Social.anfrage(lilli, 'laden').aktion, 'laden');
	assert.equal(C_Social.anfrage(claude, 'laden').aktion, 'laden', 'Agent darf lesen');
	assert.equal(C_Social.anfrage(claude, 'idee_speichern', { link: 'https://www.linkedin.com/posts/x' }).code, 403, 'Agent legt keine Ideen an');
	assert.equal(C_Social.anfrage(claude, 'upload_status', { upload_id: 'up_abcdef12', status: 'geschnitten' }).status, 'geschnitten', 'Agent meldet Stand');
});

test('Ideen: Link, Kanal, Status, Titel', () => {
	assert.equal(C_Social.anfrage(lilli, 'idee_speichern', { link: 'http://unsicher.de/x' }).code, 400, 'nur https');
	assert.equal(C_Social.anfrage(lilli, 'idee_speichern', { link: 'javascript:alert(1)' }).code, 400);
	assert.equal(C_Social.anfrage(lilli, 'idee_speichern', {}).code, 400, 'ganz leer geht nicht');
	const r = C_Social.anfrage(lilli, 'idee_speichern', { link: 'https://www.linkedin.com/posts/max-mustermann_ki-activity-123', warum_stark: 'Starker Hook, Zahl in Zeile 1', status: 'unsinn' });
	assert.match(r.idee.idee_id, /^idee_[a-z0-9]{6,30}$/);
	assert.equal(r.idee.art, 'link');
	assert.equal(r.idee.kanal, 'LinkedIn', 'Kanal aus dem Link');
	assert.equal(r.idee.status, 'neu', 'unbekannter Status → neu');
	assert.equal(r.idee.titel, 'linkedin.com/posts/max-mustermann_ki-activity-123', 'Ersatztitel aus Link');
	assert.equal(r.wer, 'm_lillien');
	// Freitext-Idee ohne Link (aus PR #49 übernommen)
	const f = C_Social.anfrage(lilli, 'idee_speichern', { warum_stark: 'Reel: Vorher/Nachher im Büro, Schnitt auf den Beat' });
	assert.equal(f.idee.art, 'idee'); assert.equal(f.idee.link, ''); assert.equal(f.idee.kanal, 'Sonstiges'); assert.equal(f.idee.titel, 'Reel: Vorher/Nachher im Büro, Schnitt auf den Beat');
	// Bild (Screenshot) ohne Link
	const b = C_Social.anfrage(lilli, 'idee_speichern', { bild_pfad: 'ideen/2026/10/bild_abc123def_screenshot.png', kanal: 'Instagram' });
	assert.equal(b.idee.art, 'bild'); assert.equal(b.idee.titel, 'Bild'); assert.equal(b.idee.kanal, 'Instagram');
	assert.equal(C_Social.anfrage(lilli, 'idee_speichern', { bild_pfad: '../../etc/passwd' }).code, 400, 'kaputter Bildpfad zählt nicht als Inhalt');
	assert.equal(C_Social.anfrage(lilli, 'idee_speichern', { bild_pfad: 'ideen/2026/10/bild_x_y.png', link: 'https://www.linkedin.com/posts/a' }).idee.art, 'link', 'ungültiger Pfad fällt weg, Link bleibt');
	const r2 = C_Social.anfrage(timo, 'idee_speichern', { idee_id: 'idee_abc123', link: 'https://www.instagram.com/reel/abc/', kanal: 'YouTube', status: 'umgesetzt', post_id: 'p_xyz987', titel: ' Reel  ' });
	assert.equal(r2.idee.idee_id, 'idee_abc123', 'bestehende ID bleibt');
	assert.equal(r2.idee.kanal, 'YouTube', 'gewählter Kanal gewinnt');
	assert.equal(r2.idee.post_id, 'p_xyz987'); assert.equal(r2.idee.titel, 'Reel');
	assert.equal(C_Social.anfrage(lilli, 'idee_loeschen', { idee_id: 'x' }).code, 400);
	assert.equal(C_Social.anfrage(lilli, 'idee_loeschen', { idee_id: 'idee_abc123' }).idee_id, 'idee_abc123', 'jedes Teammitglied darf Ideen in den Papierkorb legen');
});

test('Upload: Datei, Größe, Einwilligung, Pfad', () => {
	const ok = { dateiname: 'Dreh Büro 24.10.mov', groesse: 123456, einwilligung: true, thema: 'Werkstatt-Dreh', kanal: 'Instagram', kontext: 'ab Minute 2 wird es gut' };
	assert.equal(C_Social.anfrage(lilli, 'upload_url', { ...ok, dateiname: 'skript.pdf' }).code, 400, 'nur Video');
	assert.equal(C_Social.anfrage(lilli, 'upload_url', { ...ok, groesse: 0 }).code, 400);
	assert.equal(C_Social.anfrage(lilli, 'upload_url', { ...ok, groesse: 3 * 1024 * 1024 * 1024 }).code, 400, 'über 2 GB');
	assert.match(C_Social.anfrage(lilli, 'upload_url', { ...ok, einwilligung: 'ja' }).antwort.fehler, /einverstanden/, 'Einwilligung muss true sein');
	assert.equal(C_Social.anfrage(lilli, 'upload_url', { ...ok, thema: 'ab' }).code, 400, 'Thema nötig');
	const r = C_Social.anfrage(lilli, 'upload_url', ok, JETZT);
	assert.match(r.upload.upload_id, /^up_[a-z0-9]{6,30}$/);
	assert.equal(r.upload.pfad, '2026/10/' + r.upload.upload_id + '_Dreh-Buero-24.10.mov');
	assert.equal(r.upload.mime, 'video/quicktime'); assert.equal(r.upload.kanal, 'Instagram'); assert.equal(r.upload.einwilligung, true); assert.equal(r.upload.stil, 'momentum');
	assert.equal(C_Social.anfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'beauftragt', run_id: 'run_mv123abc' }).run_id, 'run_mv123abc');
	assert.equal(C_Social.anfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'beauftragt', run_id: '../x' }).run_id, null, 'kaputte run_id fällt weg');
	assert.equal(C_Social.anfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'fehler' }).fehler, 'Unbekannter Fehler');
	assert.equal(C_Social.anfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'geloescht' }).code, 400, 'löschen ist kein Status aus dem Portal');
	// Aktionen an einem bestehenden Upload: die Rechte prüft erst uploadAuftraege (nach dem Lesen der Zeile)
	assert.equal(C_Social.anfrage(lilli, 'upload_loeschen', { upload_id: r.upload.upload_id }).upload_id, r.upload.upload_id);
	assert.equal(C_Social.anfrage(lilli, 'upload_ansehen', { upload_id: '../x' }).code, 400);
	assert.equal(C_Social.anfrage(lilli, 'upload_teilen', { upload_id: r.upload.upload_id }).code, 400, 'im_team fehlt');
	assert.equal(C_Social.anfrage(lilli, 'upload_teilen', { upload_id: r.upload.upload_id, im_team: 'ja' }).code, 400, 'im_team muss true/false sein');
	assert.equal(C_Social.anfrage(lilli, 'upload_teilen', { upload_id: r.upload.upload_id, im_team: false }).im_team, false);
	assert.equal(C_Social.anfrage(claude, 'upload_ansehen', { upload_id: r.upload.upload_id }).code, 403, 'Agenten sehen hier keine Videos an');
});

test('Upload ansehen, im Team freigeben, löschen: Rechte nach Eigentümer, Admin, Freigabe', () => {
	const ms = speicher('https://p.supabase.co/storage/v1/');
	const db = { lesen: () => ({}), funktion: (name, p) => ({ methode: 'POST', pfad: 'rpc/' + name, body: p }) };
	const zeile = (extra) => ({ upload_id: 'up_abcdef', bucket: 'medien-roh', pfad: '2026/10/up_abcdef_a.mp4', status: 'hochgeladen', erstellt_von: 'm_lillien', im_team: false, ...extra });
	// JSON: Aufträge des Speichers stammen aus dem vm-Kontext (anderer Object-Prototyp)
	const U = (wer, aktion, z, daten = {}) => JSON.parse(JSON.stringify(C_Social.uploadAuftraege(C_Social.anfrage(wer, aktion, { upload_id: 'up_abcdef', ...daten }), z, db, ms)));
	const murat = { mitglied_id: 'm_murat', name: 'Murat', rolle: 'team', status: 'aktiv', typ: 'mensch' };
	// ansehen
	const eigen = U(lilli, 'upload_ansehen', zeile());
	assert.equal(eigen.aktion, 'ansehen'); assert.equal(eigen.gueltig_sek, 3600);
	assert.deepEqual(eigen.speicher, { methode: 'POST', pfad: 'object/sign/medien-roh/2026/10/up_abcdef_a.mp4', body: { expiresIn: 3600 } });
	assert.equal(U(timo, 'upload_ansehen', zeile()).aktion, 'ansehen', 'Admin sieht alles');
	assert.equal(U(murat, 'upload_ansehen', zeile()).code, 403, 'andere nur bei Freigabe');
	assert.equal(U(murat, 'upload_ansehen', zeile({ im_team: true })).aktion, 'ansehen');
	assert.equal(U(murat, 'upload_ansehen', zeile({ im_team: 'true' })).code, 403, 'nur echtes true zählt');
	assert.equal(U(lilli, 'upload_ansehen', zeile({ pfad: '../x' })).code, 409);
	// teilen
	const t = U(lilli, 'upload_teilen', zeile(), { im_team: true });
	assert.equal(t.aktion, 'teilen'); assert.equal(t.im_team, true);
	assert.deepEqual(t.db, { methode: 'POST', pfad: 'rpc/team_upload_teilen', body: { p_id: 'up_abcdef', p_im_team: true, p_von: 'm_lillien' } });
	assert.equal(U(lilli, 'upload_teilen', zeile({ im_team: true }), { im_team: false }).im_team, false, 'Freigabe zurücknehmen');
	assert.equal(U(timo, 'upload_teilen', zeile(), { im_team: true }).code, 403, 'freigeben nur, wer hochgeladen hat (auch nicht Admin)');
	assert.equal(U(murat, 'upload_teilen', zeile({ im_team: true }), { im_team: false }).code, 403);
	// löschen
	const l = U(lilli, 'upload_loeschen', zeile());
	assert.equal(l.aktion, 'loeschen'); assert.deepEqual(l.speicher, { methode: 'DELETE', pfad: 'object/medien-roh/2026/10/up_abcdef_a.mp4', body: {} });
	assert.deepEqual(l.db.body, { p_id: 'up_abcdef', p_status: 'geloescht', p_von: 'm_lillien' });
	assert.equal(U(timo, 'upload_loeschen', zeile()).aktion, 'loeschen', 'Admin darf löschen');
	assert.equal(U(murat, 'upload_loeschen', zeile({ im_team: true })).code, 403, 'Freigabe erlaubt kein Löschen');
	// nicht gefunden, schon gelöscht, Zeile ohne Eigentümer
	assert.equal(U(lilli, 'upload_ansehen', undefined).code, 404);
	assert.equal(U(timo, 'upload_ansehen', zeile({ status: 'geloescht' })).code, 404);
	assert.equal(U(lilli, 'upload_ansehen', zeile({ erstellt_von: '' })).code, 403, 'leerer Eigentümer gehört niemandem');
});

test('Bild zu einer Idee: Endung, Größe, Pfad, öffentliche Adresse', () => {
	assert.equal(C_Social.anfrage(lilli, 'idee_bild_url', { dateiname: 'clip.mp4', groesse: 100 }).code, 400, 'nur Bilder');
	assert.equal(C_Social.anfrage(lilli, 'idee_bild_url', { dateiname: 'shot.png', groesse: 30 * 1024 * 1024 }).code, 400, 'über 20 MB');
	assert.equal(C_Social.anfrage(claude, 'idee_bild_url', { dateiname: 'shot.png', groesse: 100 }).code, 403, 'Agenten laden keine Bilder hoch');
	const r = C_Social.anfrage(lilli, 'idee_bild_url', { dateiname: 'Screenshot 2026-10-28 (1).PNG', groesse: 123, mime: 'image/png' }, JETZT);
	assert.equal(r.bild.bucket, 'social-ideen'); assert.match(r.bild.pfad, /^ideen\/2026\/10\/bild_[a-z0-9]+_Screenshot-2026-10-28-1-\.PNG$/); assert.equal(r.bild.mime, 'image/png');
	assert.equal(C_Social.bildMime('jpg', 'text/html'), 'image/jpeg'); assert.equal(C_Social.bildMime('webp', 'image/webp'), 'image/webp');
	assert.equal(speicher('https://p.supabase.co/storage/v1/').oeffentlicheAdresse('social-ideen', 'ideen/2026/10/bild_a_b c.png'), 'https://p.supabase.co/storage/v1/object/public/social-ideen/ideen/2026/10/bild_a_b%20c.png');
	assert.equal(speicher('https://p.supabase.co/storage/v1').oeffentlicheAdresse('social-ideen', ''), null);
});

test('Helfer', () => {
	assert.match(C_Social.neueId('idee'), /^idee_[a-z0-9]{10,20}$/);
	assert.ok(C_Social.linkGueltig('https://www.linkedin.com/feed/update/urn:li:activity:1')); assert.ok(!C_Social.linkGueltig('ftp://x.de/a')); assert.ok(!C_Social.linkGueltig('https://localhost/a'));
	assert.equal(C_Social.sicherDateiname('Mein Video (final) äöü.MP4'), 'Mein-Video-final-aeoeue.MP4'); assert.equal(C_Social.sicherDateiname('???'), 'video');
	assert.equal(C_Social.endung('a.b.MOV'), 'mov'); assert.equal(C_Social.endung('ohne'), '');
	assert.equal(C_Social.uploadPfad('up_1', 'x.mp4', Date.parse('2027-01-05T01:00:00Z')), '2027/01/up_1_x.mp4');
	assert.equal(C_Social.kanalAusLink('https://youtu.be/abc'), 'YouTube'); assert.equal(C_Social.kanalAusLink('https://blog.example.org/x'), 'Sonstiges'); assert.equal(C_Social.kanalAusLink('https://notlinkedin.com/x'), 'Sonstiges');
	assert.equal(C_Social.titelAusLink('https://www.tiktok.com/@a/video/1/'), 'tiktok.com/@a/video/1');
	assert.equal(C_Social.mimeFuer('mp4', 'video/mp4'), 'video/mp4'); assert.equal(C_Social.mimeFuer('mkv', ''), 'video/x-matroska'); assert.equal(C_Social.mimeFuer('mov', 'text/html'), 'video/quicktime');
	assert.equal(speicher('https://p.supabase.co/storage/v1/').uploadAdresse({ url: '/object/upload/sign/medien-roh/a.mp4?token=t' }), 'https://p.supabase.co/storage/v1/object/upload/sign/medien-roh/a.mp4?token=t');
	assert.equal(speicher('https://p.supabase.co/storage/v1').uploadAdresse({}), null);
	assert.equal(speicher('https://p.supabase.co/storage/v1/').leseAdresse({ signedURL: '/object/sign/medien-roh/a.mp4?token=t' }), 'https://p.supabase.co/storage/v1/object/sign/medien-roh/a.mp4?token=t');
	assert.equal(speicher('https://p.supabase.co/storage/v1/').leseAdresse({ message: 'Object not found' }), null);
	assert.throws(() => speicher('https://p').leseAdresseHolen('medien-roh', 'a.mp4', 10), /Gültigkeit/);
	assert.throws(() => speicher('https://p').leseAdresseHolen('medien-roh', '../a.mp4', 3600), /ungültiger Pfad/);
	const t = C_Social.auftragsText({ thema: 'Werkstatt', kanal: 'Instagram', pfad: '2026/10/up_1_x.mov', kontext: 'ab Minute 2' });
	assert.match(t, /^Rohvideo im Momentum-Stil für Instagram schneiden: Werkstatt\n/); assert.match(t, /medien-roh\/2026\/10\/up_1_x\.mov/); assert.match(t, /Kontext: ab Minute 2/); assert.match(t, /zur Abnahme/);
});

test('laden: sortiert, ohne gelöschte, Pfad nur für Admin und Agent', () => {
	const ideen = [{ idee_id: 'idee_1', geaendert: '2026-10-01', link: 'https://x.de/a' }, { idee_id: 'idee_2', geaendert: '2026-10-27', bild_pfad: 'ideen/2026/10/bild_q_r.png' }, null];
	const uploads = [{ upload_id: 'up_1', pfad: '2026/10/a', status: 'hochgeladen', erstellt: '2026-10-01', groesse: '5' }, { upload_id: 'up_2', pfad: '2026/10/b', status: 'geloescht', erstellt: '2026-10-02' }, { upload_id: 'up_3', pfad: '2026/10/c', status: 'beauftragt', run_id: 'run_1', erstellt: '2026-10-03' }];
	const a = C_Social.ladenAntwort(ideen, uploads, lilli, speicher('https://p.supabase.co/storage/v1/'));
	assert.deepEqual(a.ideen.map(i => i.idee_id), ['idee_2', 'idee_1']);
	assert.equal(a.ideen[0].art, 'bild'); assert.equal(a.ideen[0].bild_url, 'https://p.supabase.co/storage/v1/object/public/social-ideen/ideen/2026/10/bild_q_r.png');
	assert.equal(a.ideen[1].art, 'link'); assert.equal(a.ideen[1].bild_url, null); assert.equal(a.max_bild_bytes, 20971520);
	assert.deepEqual(a.uploads.map(u => u.upload_id), ['up_3', 'up_1']);
	assert.equal(a.uploads[0].im_team, false); assert.equal(C_Social.ladenAntwort([], [{ ...uploads[0], im_team: true }], lilli, speicher('')).uploads[0].im_team, true);
	assert.equal(a.uploads[1].pfad, undefined, 'Teammitglied sieht keinen Pfad'); assert.equal(a.uploads[1].groesse, 5);
	assert.equal(C_Social.ladenAntwort([], uploads, timo, speicher('')).uploads[0].pfad, '2026/10/c'); assert.equal(C_Social.ladenAntwort([], uploads, claude, speicher('')).uploads[0].pfad, '2026/10/c');
	assert.ok(a.kanaele.includes('LinkedIn')); assert.equal(a.max_bytes, 2147483648);
});
