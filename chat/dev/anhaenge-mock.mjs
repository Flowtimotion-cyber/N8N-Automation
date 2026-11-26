// TESTADAPTER: Nachbildung von supabase/team_chat_anhaenge.sql und Supabase Storage im Speicher, für Testserver und Browsertests.
// Arbeitet auf derselben Chat-Nachbildung wie /api/chat (C_ChatDbNachbildung), damit Nachrichten mit Dateien im Verlauf auftauchen.
// Die echten SQL-Funktionen prüft chat/test/sql-anhaenge.test.mjs gegen Postgres (PGlite).
// Speicher: Upload per PUT an <basis>/object/upload/sign/team-anhaenge/<pfad>?token=…, Lesen per GET <basis>/object/sign/team-anhaenge/<pfad>?token=…
import { anhangAnfrage, anhangNachDb, anhangNachSpeicher, ANHANG_BUCKET } from '../lib/anhaenge.js';

export class C_AnhangNachbildung {
	constructor({ chat, eingerichtet = true, jetzt = () => new Date().toISOString() } = {}) {
		this.chat = chat; this.eingerichtet = eingerichtet; this.jetzt = jetzt;
		this.anhaenge = []; this.dateien = new Map(); this.nr = 0;
	}
	rpc(fn, body) {
		const f = this.eingerichtet && { team_anhang_vorbereiten: this.vorbereiten, team_anhang_senden: this.senden, team_anhang_links: this.links, team_anhang_entfernen: this.entfernen }[fn];
		if (!f) return { statusCode: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
		try { return { statusCode: 200, body: JSON.parse(JSON.stringify(f.call(this, body || {}))) }; }
		catch (e) { return { statusCode: 400, body: { code: 'P0001', message: e.message } }; }
	}
	kurz(a) { return { anhang_id: a.anhang_id, name: a.name, mime: a.mime, groesse: a.groesse, breite: a.breite, hoehe: a.hoehe, von: a.von, entfernt: a.status !== 'bereit', entfernt_am: a.entfernt_am || null, endgueltig: a.status === 'geloescht' }; }
	anNachricht(nr) { const n = this.chat.nachrichten.find(x => x.nachricht_id === nr); if (n) n.anhaenge = this.anhaenge.filter(a => a.nachricht_id === nr).map(a => this.kurz(a)); return n; }

	vorbereiten({ p_mitglied, p_chat, p_name, p_mime, p_groesse, p_breite, p_hoehe }) {
		this.chat.pruefen(p_chat, p_mitglied);
		if (Number(p_groesse) > 26214400) throw new Error('Die Datei ist zu groß (höchstens 25 MB).');
		const id = 'an_' + (++this.nr).toString(16).padStart(32, '0');
		const sicher = String(p_name).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 100) || 'datei';
		const pfad = 'chat/' + p_chat + '/' + id + '/' + sicher;
		this.anhaenge.push({ anhang_id: id, chat_id: p_chat, nachricht_id: null, pfad, name: p_name, mime: p_mime, groesse: Number(p_groesse), breite: p_breite || null, hoehe: p_hoehe || null, von: p_mitglied, status: 'hochladen', erstellt: this.jetzt() });
		return { anhang_id: id, pfad, mime: p_mime };
	}
	senden({ p_mitglied, p_chat, p_text, p_anhaenge, p_erwaehnt, p_whatsapp, p_antwort_auf }) {
		this.chat.pruefen(p_chat, p_mitglied);
		const ids = [...new Set(p_anhaenge || [])];
		const A = this.anhaenge.filter(a => ids.includes(a.anhang_id) && a.chat_id === p_chat && a.von === p_mitglied && a.status === 'hochladen' && !a.nachricht_id);
		if (!ids.length) throw new Error('Es ist keine Datei angehängt.');
		if (A.length !== ids.length) throw new Error('Eine Datei fehlt oder wurde schon gesendet. Bitte noch einmal anhängen.');
		if (A.some(a => !this.dateien.has(a.pfad))) throw new Error('Eine Datei ist noch nicht fertig hochgeladen. Bitte warte kurz und sende noch einmal.');
		A.forEach(a => { a.groesse = this.dateien.get(a.pfad).daten.length; });
		const text = String(p_text || '').trim() ? p_text : '📎 ' + A.map(a => a.name).join(', ');
		const r = this.chat.senden({ p_mitglied, p_chat, p_text: text, p_erwaehnt, p_whatsapp, p_antwort_auf });
		A.forEach(a => { a.nachricht_id = r.nachricht.nachricht_id; a.status = 'bereit'; });
		const n = this.anNachricht(r.nachricht.nachricht_id);
		return { nachricht: this.chat.mitZitat(n), chat: r.chat };
	}
	links({ p_mitglied, p_chat, p_ids }) {
		this.chat.pruefen(p_chat, p_mitglied);
		return { anhaenge: this.anhaenge.filter(a => a.chat_id === p_chat && a.status === 'bereit' && a.nachricht_id && (p_ids || []).includes(a.anhang_id)).slice(0, 60).map(a => ({ anhang_id: a.anhang_id, pfad: a.pfad, name: a.name, mime: a.mime })) };
	}
	entfernen({ p_mitglied, p_chat, p_anhang_id, p_zurueck }) {
		this.chat.pruefen(p_chat, p_mitglied);
		const a = this.anhaenge.find(x => x.anhang_id === p_anhang_id && x.chat_id === p_chat && x.nachricht_id);
		if (!a) throw new Error('Diese Datei gibt es nicht.');
		if (a.von !== p_mitglied) throw new Error('Nur wer die Datei geschickt hat, kann sie entfernen.');
		if (p_zurueck) { if (a.status !== 'entfernt') throw new Error('Diese Datei lässt sich nicht mehr wiederherstellen.'); a.status = 'bereit'; a.entfernt_am = null; }
		else { if (a.status !== 'bereit') throw new Error('Diese Datei ist schon entfernt.'); a.status = 'entfernt'; a.entfernt_am = this.jetzt(); }
		const n = this.anNachricht(a.nachricht_id); n.reaktion_am = this.jetzt();
		return { nachricht: this.chat.mitZitat(n) };
	}

	// Nachbildung von Supabase Storage: Signieren (wie der HTTP-Knoten „Speicher signieren“) und die Adressen selbst
	signieren(anfrage, url, body) {
		if (/\/object\/upload\/sign\//.test(url)) return { statusCode: 200, body: { url: url.replace(/^.*?\/object\//, '/object/') + '?token=test-upload' } };
		return { statusCode: 200, body: (body.paths || []).map(p => ({ path: p, signedURL: '/object/sign/' + ANHANG_BUCKET + '/' + p.split('/').map(encodeURIComponent).join('/') + '?token=test-lesen', error: null })) };
	}
	hochladen(pfad, mime, daten) {
		const a = this.anhaenge.find(x => x.pfad === pfad && x.status === 'hochladen');
		if (!a) return 400;
		if (this.dateien.has(pfad)) return 409;
		this.dateien.set(pfad, { mime: mime || a.mime, daten }); return 200;
	}
	lesen(pfad) {
		const a = this.anhaenge.find(x => x.pfad === pfad);
		return a && a.status === 'bereit' ? this.dateien.get(pfad) || null : null;
	}
}

/** Nachbildung des n8n-Workflows „TEAM: Anhänge (Portal)“: [code, antwort]. storageBasis = Adresse des Testservers + /api/test/speicher */
export function anhangAntwortMock(body, mitglieder, db, storageBasis) {
	const t = String((body && body.token) || '');
	const ich = /^[a-f0-9]{20,64}$/.test(t) ? ((mitglieder || []).find(m => m.token === t) || null) : null;
	const a = anhangAnfrage(ich, String((body && body.aktion) || ''), (body && body.daten && typeof body.daten === 'object') ? body.daten : {});
	if (a.aktion !== 'rpc') return [a.code, Object.assign({}, a.antwort, { testadapter: true })];
	const dbAntwort = db.rpc(a.fn, a.body);
	const n = anhangNachDb(a, dbAntwort, storageBasis);
	if (n.aktion !== 'storage') return [n.code, Object.assign({}, n.antwort, { testadapter: true })];
	const r = anhangNachSpeicher(a, dbAntwort.body, db.signieren(a, n.url, n.body), storageBasis);
	return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
}
