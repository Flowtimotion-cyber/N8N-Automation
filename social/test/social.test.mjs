// Tests für social/lib/social.js. Start: node --test social/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialAnfrage, neueId, linkGueltig, sicherDateiname, endung, uploadPfad, kanalAusLink, titelAusLink, mimeFuer, signierteUrl, auftragsText, ladenAntwort } from '../lib/social.js';

const JETZT = Date.parse('2026-10-28T12:00:00Z');
const timo = { mitglied_id: 'm_timo', name: 'Timo', rolle: 'admin', status: 'aktiv', typ: 'mensch' };
const lilli = { mitglied_id: 'm_lillien', name: 'Lillien', rolle: 'team', status: 'aktiv', typ: 'mensch' };
const claude = { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', status: 'aktiv', typ: 'agent' };

test('Zugang', () => {
  assert.equal(socialAnfrage(null, 'laden').code, 401);
  assert.equal(socialAnfrage({ ...timo, status: 'gesperrt' }, 'laden').code, 401);
  assert.equal(socialAnfrage(timo, 'quatsch').code, 400);
  assert.equal(socialAnfrage(lilli, 'laden').aktion, 'laden');
  assert.equal(socialAnfrage(claude, 'laden').aktion, 'laden', 'Agent darf lesen');
  assert.equal(socialAnfrage(claude, 'idee_speichern', { link: 'https://www.linkedin.com/posts/x' }).code, 403, 'Agent legt keine Ideen an');
  assert.equal(socialAnfrage(claude, 'upload_status', { upload_id: 'up_abcdef12', status: 'geschnitten' }).status, 'geschnitten', 'Agent meldet Stand');
});

test('Ideen: Link, Kanal, Status, Titel', () => {
  assert.equal(socialAnfrage(lilli, 'idee_speichern', { link: 'http://unsicher.de/x' }).code, 400, 'nur https');
  assert.equal(socialAnfrage(lilli, 'idee_speichern', { link: 'javascript:alert(1)' }).code, 400);
  const r = socialAnfrage(lilli, 'idee_speichern', { link: 'https://www.linkedin.com/posts/max-mustermann_ki-activity-123', warum_stark: 'Starker Hook, Zahl in Zeile 1', status: 'unsinn' });
  assert.match(r.idee.idee_id, /^idee_[a-z0-9]{6,30}$/);
  assert.equal(r.idee.kanal, 'LinkedIn', 'Kanal aus dem Link');
  assert.equal(r.idee.status, 'neu', 'unbekannter Status → neu');
  assert.equal(r.idee.titel, 'linkedin.com/posts/max-mustermann_ki-activity-123', 'Ersatztitel aus Link');
  assert.equal(r.wer, 'm_lillien');
  const r2 = socialAnfrage(timo, 'idee_speichern', { idee_id: 'idee_abc123', link: 'https://www.instagram.com/reel/abc/', kanal: 'YouTube', status: 'umgesetzt', post_id: 'p_xyz987', titel: ' Reel  ' });
  assert.equal(r2.idee.idee_id, 'idee_abc123', 'bestehende ID bleibt');
  assert.equal(r2.idee.kanal, 'YouTube', 'gewählter Kanal gewinnt');
  assert.equal(r2.idee.post_id, 'p_xyz987'); assert.equal(r2.idee.titel, 'Reel');
  assert.equal(socialAnfrage(lilli, 'idee_loeschen', { idee_id: 'x' }).code, 400);
  assert.equal(socialAnfrage(lilli, 'idee_loeschen', { idee_id: 'idee_abc123' }).idee_id, 'idee_abc123', 'jedes Teammitglied darf Ideen in den Papierkorb legen');
});

test('Upload: Datei, Größe, Einwilligung, Pfad', () => {
  const ok = { dateiname: 'Dreh Büro 24.10.mov', groesse: 123456, einwilligung: true, thema: 'Werkstatt-Dreh', kanal: 'Instagram', kontext: 'ab Minute 2 wird es gut' };
  assert.equal(socialAnfrage(lilli, 'upload_url', { ...ok, dateiname: 'skript.pdf' }).code, 400, 'nur Video');
  assert.equal(socialAnfrage(lilli, 'upload_url', { ...ok, groesse: 0 }).code, 400);
  assert.equal(socialAnfrage(lilli, 'upload_url', { ...ok, groesse: 3 * 1024 * 1024 * 1024 }).code, 400, 'über 2 GB');
  assert.match(socialAnfrage(lilli, 'upload_url', { ...ok, einwilligung: 'ja' }).antwort.fehler, /einverstanden/, 'Einwilligung muss true sein');
  assert.equal(socialAnfrage(lilli, 'upload_url', { ...ok, thema: 'ab' }).code, 400, 'Thema nötig');
  const r = socialAnfrage(lilli, 'upload_url', ok, JETZT);
  assert.match(r.upload.upload_id, /^up_[a-z0-9]{6,30}$/);
  assert.equal(r.upload.pfad, '2026/10/' + r.upload.upload_id + '_Dreh-Buero-24.10.mov');
  assert.equal(r.upload.mime, 'video/quicktime'); assert.equal(r.upload.kanal, 'Instagram'); assert.equal(r.upload.einwilligung, true); assert.equal(r.upload.stil, 'momentum');
  assert.equal(socialAnfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'beauftragt', run_id: 'run_mv123abc' }).run_id, 'run_mv123abc');
  assert.equal(socialAnfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'beauftragt', run_id: '../x' }).run_id, null, 'kaputte run_id fällt weg');
  assert.equal(socialAnfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'fehler' }).fehler, 'Unbekannter Fehler');
  assert.equal(socialAnfrage(lilli, 'upload_status', { upload_id: r.upload.upload_id, status: 'geloescht' }).code, 400, 'löschen ist kein Status aus dem Portal');
  assert.equal(socialAnfrage(lilli, 'upload_loeschen', { upload_id: r.upload.upload_id }).code, 403, 'löschen nur Admin');
  assert.equal(socialAnfrage(timo, 'upload_loeschen', { upload_id: r.upload.upload_id }).upload_id, r.upload.upload_id);
});

test('Helfer', () => {
  assert.match(neueId('idee'), /^idee_[a-z0-9]{10,20}$/);
  assert.ok(linkGueltig('https://www.linkedin.com/feed/update/urn:li:activity:1')); assert.ok(!linkGueltig('ftp://x.de/a')); assert.ok(!linkGueltig('https://localhost/a'));
  assert.equal(sicherDateiname('Mein Video (final) äöü.MP4'), 'Mein-Video-final-aeoeue.MP4'); assert.equal(sicherDateiname('???'), 'video');
  assert.equal(endung('a.b.MOV'), 'mov'); assert.equal(endung('ohne'), '');
  assert.equal(uploadPfad('up_1', 'x.mp4', Date.parse('2027-01-05T01:00:00Z')), '2027/01/up_1_x.mp4');
  assert.equal(kanalAusLink('https://youtu.be/abc'), 'YouTube'); assert.equal(kanalAusLink('https://blog.example.org/x'), 'Sonstiges'); assert.equal(kanalAusLink('https://notlinkedin.com/x'), 'Sonstiges');
  assert.equal(titelAusLink('https://www.tiktok.com/@a/video/1/'), 'tiktok.com/@a/video/1');
  assert.equal(mimeFuer('mp4', 'video/mp4'), 'video/mp4'); assert.equal(mimeFuer('mkv', ''), 'video/x-matroska'); assert.equal(mimeFuer('mov', 'text/html'), 'video/quicktime');
  assert.equal(signierteUrl('https://p.supabase.co/storage/v1/', { url: '/object/upload/sign/medien-roh/a.mp4?token=t' }), 'https://p.supabase.co/storage/v1/object/upload/sign/medien-roh/a.mp4?token=t');
  assert.equal(signierteUrl('https://p.supabase.co/storage/v1', {}), null);
  const t = auftragsText({ thema: 'Werkstatt', kanal: 'Instagram', pfad: '2026/10/up_1_x.mov', kontext: 'ab Minute 2' });
  assert.match(t, /^Rohvideo im Momentum-Stil für Instagram schneiden: Werkstatt\n/); assert.match(t, /medien-roh\/2026\/10\/up_1_x\.mov/); assert.match(t, /Kontext: ab Minute 2/); assert.match(t, /zur Abnahme/);
});

test('laden: sortiert, ohne gelöschte, Pfad nur für Admin und Agent', () => {
  const ideen = [{ idee_id: 'idee_1', geaendert: '2026-10-01' }, { idee_id: 'idee_2', geaendert: '2026-10-27' }, null];
  const uploads = [{ upload_id: 'up_1', pfad: '2026/10/a', status: 'hochgeladen', erstellt: '2026-10-01', groesse: '5' }, { upload_id: 'up_2', pfad: '2026/10/b', status: 'geloescht', erstellt: '2026-10-02' }, { upload_id: 'up_3', pfad: '2026/10/c', status: 'beauftragt', run_id: 'run_1', erstellt: '2026-10-03' }];
  const a = ladenAntwort(ideen, uploads, lilli);
  assert.deepEqual(a.ideen.map(i => i.idee_id), ['idee_2', 'idee_1']);
  assert.deepEqual(a.uploads.map(u => u.upload_id), ['up_3', 'up_1']);
  assert.equal(a.uploads[1].pfad, undefined, 'Teammitglied sieht keinen Pfad'); assert.equal(a.uploads[1].groesse, 5);
  assert.equal(ladenAntwort([], uploads, timo).uploads[0].pfad, '2026/10/c'); assert.equal(ladenAntwort([], uploads, claude).uploads[0].pfad, '2026/10/c');
  assert.ok(a.kanaele.includes('LinkedIn')); assert.equal(a.max_bytes, 2147483648);
});
