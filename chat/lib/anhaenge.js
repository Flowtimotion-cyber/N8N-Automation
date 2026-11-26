// Gemeinsame Logik für Dateien im Team-Chat (Bilder, PDFs, Office, Text, Audio). Stufe 1: nur Team-Chat.
// Läuft in den Code-Knoten des n8n-Workflows „TEAM: Anhänge (Portal)“ (Webhook team-anhang) und im lokalen Testadapter.
// Keine Abhängigkeiten, kein Netz, kein Schlüssel, kein new URL(). Datenbank: supabase/team_chat_anhaenge.sql.
// Getestet: node --test chat/test/anhaenge.test.mjs
//
// Ablauf je Anfrage { token, aktion, daten }:
//   1. anhangAnfrage(ich, aktion, daten)             → { aktion: 'rpc', was, fn, body } oder { aktion: 'antwort', code, antwort }
//   2. HTTP-Knoten: POST <Supabase>/rest/v1/rpc/<fn>  (volle Antwort, wirft nie)
//   3. anhangNachDb(anfrage, http, STORAGE)           → { aktion: 'storage', url, body } (Adresse signieren) oder { aktion: 'antwort', … }
//   4. HTTP-Knoten: POST <url> an Supabase Storage    (volle Antwort, wirft nie)
//   5. anhangNachSpeicher(anfrage, db, http, STORAGE) → { code, antwort }
//
// Der Browser lädt mit der signierten Upload-Adresse direkt in den privaten Bucket „team-anhaenge“ und liest mit
// signierten Links (60 Minuten). Er bekommt nie einen Supabase-Schlüssel und nie den Pfad im Bucket als Dauer-Link.

const ANHANG_BUCKET = 'team-anhaenge';
const ANHANG_MAX_BYTES = 25 * 1024 * 1024;
const ANHANG_JE_NACHRICHT = 10;
const ANHANG_LINK_SEK = 3600;
const ANHANG_AKTIONEN = ['vorbereiten', 'senden', 'links', 'entfernen', 'wiederherstellen'];
/** Erlaubte Endungen und ihr Typ. Dieselbe Liste (Typen) steht in supabase/team_chat_anhaenge.sql und docs/team/index.html. */
const ANHANG_TYPEN = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
	pdf: 'application/pdf',
	doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
	txt: 'text/plain', csv: 'text/csv',
	mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm', flac: 'audio/flac'
};
const ANHANG_ERLAUBT_TEXT = 'Erlaubt sind Bilder (jpg, png, webp, gif, heic), PDF, Word, Excel, PowerPoint, txt, csv und Audio.';
/** Meldung, wenn Datenbank oder Workflow fehlen. Derselbe Text steht in docs/team/index.html (ANHANG_NICHT_EINGERICHTET). */
const ANHANG_NICHT_EINGERICHTET = 'Dateien im Chat sind noch nicht eingerichtet. Wie das geht, steht im Repo N8N-Automation in der Datei chat/README.md, Abschnitt „Dateien im Chat“. Bitte gib Timo Bescheid.';

const A_CHAT_ID = /^chat_[a-f0-9]{8,40}$/;
const A_ANHANG_ID = /^an_[a-f0-9]{16,40}$/;
const A_PERSON_ID = /^[\w:.-]{1,80}$/;
const A_TEXT_MAX = 8000;

const aFehler = (code, fehler) => ({ aktion: 'antwort', code, antwort: { ok: false, fehler } });
const aText = (v, n) => String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
function aListe(v, muster, max) {
	const aus = [];
	for (const e of (Array.isArray(v) ? v : [])) { const s = String(e === null || e === undefined ? '' : e).trim(); if (muster.test(s) && !aus.includes(s)) aus.push(s); }
	return aus.slice(0, max);
}

/** Typ einer Datei aus der Endung (der Browser meldet ihn oft gar nicht oder falsch, z. B. bei HEIC oder CSV). null = nicht erlaubt. */
function anhangTyp(name) {
	const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || '').trim());
	return m ? (ANHANG_TYPEN[m[1].toLowerCase()] || null) : null;
}

/** Erster Schritt: Zugang und Eingaben prüfen, Aufruf der Datenbank vorbereiten. ich = Zeile aus team_mitglieder (oder null). */
function anhangAnfrage(ich, aktion, daten) {
	if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return aFehler(401, 'Dein Zugang ist ungültig. Bitte lade das Portal neu.');
	if (ich.typ === 'agent' || ich.rolle === 'agent') return aFehler(403, 'Agenten bekommen keine Dateien aus Chats.');
	const d = daten && typeof daten === 'object' && !Array.isArray(daten) ? daten : {};
	const wer = String(ich.mitglied_id);
	if (!ANHANG_AKTIONEN.includes(aktion)) return aFehler(400, 'Unbekannte Aktion.');
	const chat = String(d.chat_id === null || d.chat_id === undefined ? '' : d.chat_id);
	if (!A_CHAT_ID.test(chat)) return aFehler(400, 'Diesen Chat gibt es nicht.');
	if (aktion === 'vorbereiten') {
		const name = aText(d.name, 400).replace(/[\\/]/g, '_').trim().slice(0, 180);
		if (!name) return aFehler(400, 'Die Datei hat keinen Namen.');
		const mime = anhangTyp(name);
		if (!mime) return aFehler(400, 'Diese Dateiart geht hier nicht. ' + ANHANG_ERLAUBT_TEXT);
		const groesse = Math.floor(Number(d.groesse) || 0);
		if (groesse < 1) return aFehler(400, 'Die Datei ist leer.');
		if (groesse > ANHANG_MAX_BYTES) return aFehler(400, 'Die Datei ist zu groß (höchstens 25 MB).');
		const mass = v => { const n = Math.floor(Number(v) || 0); return n >= 1 && n <= 20000 ? n : null; };
		return { aktion: 'rpc', was: aktion, fn: 'team_anhang_vorbereiten', body: { p_mitglied: wer, p_chat: chat, p_name: name, p_mime: mime, p_groesse: groesse, p_breite: mass(d.breite), p_hoehe: mass(d.hoehe) } };
	}
	if (aktion === 'senden') {
		const ids = aListe(d.anhaenge, A_ANHANG_ID, ANHANG_JE_NACHRICHT + 1);
		if (!ids.length) return aFehler(400, 'Es ist keine Datei angehängt.');
		if (ids.length > ANHANG_JE_NACHRICHT) return aFehler(400, 'Höchstens ' + ANHANG_JE_NACHRICHT + ' Dateien je Nachricht.');
		const t = aText(d.text, A_TEXT_MAX + 1);
		if (t.length > A_TEXT_MAX) return aFehler(400, 'Die Nachricht ist zu lang (höchstens ' + A_TEXT_MAX + ' Zeichen).');
		const erwaehnt = aListe(d.erwaehnt, A_PERSON_ID, 50);
		const whatsapp = aListe(d.whatsapp, A_PERSON_ID, 50).filter(x => erwaehnt.includes(x));
		const antw = Number(d.antwort_auf);
		return { aktion: 'rpc', was: aktion, fn: 'team_anhang_senden', body: { p_mitglied: wer, p_chat: chat, p_text: t, p_anhaenge: ids, p_erwaehnt: erwaehnt, p_whatsapp: whatsapp, p_antwort_auf: Number.isSafeInteger(antw) && antw > 0 ? antw : null } };
	}
	if (aktion === 'links') {
		const ids = aListe(d.anhaenge, A_ANHANG_ID, 60);
		if (!ids.length) return { aktion: 'antwort', code: 200, antwort: { ok: true, links: [], gueltig_sek: ANHANG_LINK_SEK } };
		return { aktion: 'rpc', was: aktion, fn: 'team_anhang_links', body: { p_mitglied: wer, p_chat: chat, p_ids: ids } };
	}
	// entfernen | wiederherstellen
	const id = String(d.anhang_id || '');
	if (!A_ANHANG_ID.test(id)) return aFehler(400, 'Diese Datei gibt es nicht.');
	return { aktion: 'rpc', was: aktion, fn: 'team_anhang_entfernen', body: { p_mitglied: wer, p_chat: chat, p_anhang_id: id, p_zurueck: aktion === 'wiederherstellen' } };
}

const aJson = b => { if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return null; } } return b; };
const aPfadUrl = p => String(p).split('/').map(encodeURIComponent).join('/');
const aBasis = s => String(s).replace(/\/+$/, '');

/** Zweiter Schritt: Antwort der Datenbank auswerten; bei vorbereiten und links die Signatur im Speicher vorbereiten. */
function anhangNachDb(anfrage, http, storageBasis) {
	const status = Number(http && http.statusCode) || 0;
	const b = aJson(http ? http.body : null);
	const was = anfrage && anfrage.was;
	if (status >= 200 && status < 300 && b && typeof b === 'object' && !Array.isArray(b)) {
		if (was === 'vorbereiten') {
			if (!b.pfad || !b.anhang_id) return aFehler(502, 'Die Datenbank hat keinen Speicherplatz vergeben. Bitte noch einmal versuchen.');
			return { aktion: 'storage', url: aBasis(storageBasis) + '/object/upload/sign/' + ANHANG_BUCKET + '/' + aPfadUrl(b.pfad), body: {} };
		}
		if (was === 'links') {
			const liste = (Array.isArray(b.anhaenge) ? b.anhaenge : []).filter(a => a && a.pfad && A_ANHANG_ID.test(String(a.anhang_id || '')));
			if (!liste.length) return { aktion: 'antwort', code: 200, antwort: { ok: true, links: [], gueltig_sek: ANHANG_LINK_SEK } };
			return { aktion: 'storage', url: aBasis(storageBasis) + '/object/sign/' + ANHANG_BUCKET, body: { expiresIn: ANHANG_LINK_SEK, paths: liste.map(a => a.pfad) } };
		}
		return { aktion: 'antwort', code: 200, antwort: Object.assign({ ok: true }, b) };
	}
	const code = String((b && b.code) || '');
	if (code === 'PGRST202' || code === '42P01' || code === '42883' || (status === 404 && !code)) return aFehler(503, ANHANG_NICHT_EINGERICHTET);
	// Fehler aus den SQL-Funktionen (raise exception, Code P0001) sind für Menschen geschrieben und gehen unverändert durch
	if (b && b.code === 'P0001' && b.message) return aFehler(400, String(b.message).slice(0, 300));
	return aFehler(502, 'Dateien sind gerade nicht erreichbar. Bitte versuch es gleich noch einmal.');
}

/** Relative Adresse aus Supabase Storage („/object/…“) vollständig machen. */
function aVoll(storageBasis, u) {
	const s = String(u || '');
	if (!s) return null;
	return /^https:\/\//.test(s) ? s : aBasis(storageBasis) + '/' + s.replace(/^\/+/, '');
}

/** Dritter Schritt: Antwort des Speichers in die Antwort ans Portal verwandeln. db = Antwort der Datenbank (body). */
function anhangNachSpeicher(anfrage, db, http, storageBasis) {
	const status = Number(http && http.statusCode) || 0;
	const b = aJson(http ? http.body : null);
	const d = aJson(db) || {};
	const was = anfrage && anfrage.was;
	if (!(status >= 200 && status < 300)) return { code: 502, antwort: { ok: false, fehler: 'Der Dateispeicher hat nicht geantwortet' + (b && (b.message || b.error) ? ': ' + String(b.message || b.error).slice(0, 160) : '.') + ' Bitte noch einmal versuchen.' } };
	if (was === 'vorbereiten') {
		const url = aVoll(storageBasis, b && b.url);
		if (!url) return { code: 502, antwort: { ok: false, fehler: 'Der Dateispeicher hat keine Upload-Adresse ausgestellt. Bitte noch einmal versuchen.' } };
		return { code: 200, antwort: { ok: true, anhang_id: d.anhang_id, mime: d.mime, url, gueltig_sek: 7200 } };
	}
	// links: Antwort ist eine Liste [{ path, signedURL, error }] in der Reihenfolge der Pfade
	const signiert = Array.isArray(b) ? b : [];
	const links = [];
	for (const a of (Array.isArray(d.anhaenge) ? d.anhaenge : [])) {
		const s = signiert.find(x => x && x.path === a.pfad);
		const url = s && !s.error ? aVoll(storageBasis, s.signedURL || s.signedUrl) : null;
		if (!url) continue;
		links.push({ anhang_id: a.anhang_id, name: a.name, mime: a.mime, url, download: url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(a.name || 'datei') });
	}
	return { code: 200, antwort: { ok: true, links, gueltig_sek: ANHANG_LINK_SEK } };
}

/** Aufräumlauf: aus der Liste der Datenbank den Auftrag an den Speicher (DELETE /object/team-anhaenge { prefixes }). */
function anhangAufraeumen(liste) {
	const L = (Array.isArray(liste) ? liste : []).filter(a => a && a.pfad && A_ANHANG_ID.test(String(a.anhang_id || '')));
	return { anzahl: L.length, ids: L.map(a => a.anhang_id), prefixes: L.map(a => a.pfad) };
}

export { ANHANG_BUCKET, ANHANG_MAX_BYTES, ANHANG_JE_NACHRICHT, ANHANG_LINK_SEK, ANHANG_TYPEN, ANHANG_AKTIONEN, ANHANG_NICHT_EINGERICHTET, ANHANG_ERLAUBT_TEXT,
	anhangTyp, anhangAnfrage, anhangNachDb, anhangNachSpeicher, anhangAufraeumen };
