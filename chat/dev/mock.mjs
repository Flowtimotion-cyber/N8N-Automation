// TESTADAPTER: Nachbildung der Supabase-Funktionen aus supabase/team_chat.sql im Speicher, für Testserver und Tests.
// Antwortet wie PostgREST ({ statusCode, body }), damit chatAntwort hier genauso läuft wie im n8n-Workflow.
// Die echten SQL-Funktionen prüft chat/test/sql.test.mjs gegen Postgres (PGlite).
import { chatAnfrage, chatAntwort } from '../lib/chat.js';

export class C_ChatDbNachbildung {
	constructor({ eingerichtet = true, mitglieder = () => [], projekte = () => [], jetzt = () => new Date().toISOString() } = {}) {
		this.eingerichtet = eingerichtet;
		this.mitglieder = mitglieder;
		this.projekte = projekte;
		this.jetzt = jetzt;
		this.chats = []; this.mit = []; this.nachrichten = []; this.posteingang = []; this.whatsapp = []; this.fassungen = [];
		this.nr = 0; this.cnr = 0;
	}

	rpc(fn, body) {
		const f = this.eingerichtet && { team_chat_liste: this.liste, team_chat_verlauf: this.verlauf, team_chat_anlegen: this.anlegen, team_chat_aendern: this.aendern, team_chat_senden: this.senden, team_chat_bearbeiten: this.bearbeiten, team_chat_reagieren: this.reagieren }[fn];
		if (!f) return { statusCode: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
		try { return { statusCode: 200, body: JSON.parse(JSON.stringify(f.call(this, body || {}))) }; }
		catch (e) { return { statusCode: 400, body: { code: 'P0001', message: e.message } }; }
	}

	name(id) { const m = this.mitglieder().find(x => x.mitglied_id === id); return m ? String(m.name).split(' ')[0] : 'Jemand'; }
	personen(ids) {
		const v = [...new Set((ids || []).map(x => String(x || '').trim()).filter(Boolean))];
		const bad = v.filter(e => !this.mitglieder().some(m => m.mitglied_id === e && m.status !== 'gesperrt' && (m.typ || 'mensch') !== 'agent'));
		if (bad.length) throw new Error('Diese Personen können nicht in einen Chat: ' + bad.join(', '));
		return v;
	}
	dabei(chat, wer) { return this.mit.find(m => m.chat_id === chat && m.mitglied_id === wer); }
	pruefen(chat, wer) {
		const c = this.chats.find(x => x.chat_id === chat);
		if (!c || !this.dabei(chat, wer)) throw new Error('Diesen Chat gibt es nicht oder du bist nicht (mehr) dabei.');
		return c;
	}
	hinweis(chat, t) { const n = { nachricht_id: ++this.nr, chat_id: chat, autor: null, text: t, erwaehnt: [], whatsapp: [], erstellt: this.jetzt(), bearbeitet: null, antwort_auf: null, reaktionen: {}, reaktion_am: null }; this.nachrichten.push(n); this.chats.find(c => c.chat_id === chat).letzte = n.erstellt; }
	json(chat, wer) {
		const c = this.chats.find(x => x.chat_id === chat), me = this.dabei(chat, wer), N = this.nachrichten.filter(n => n.chat_id === chat), l = N[N.length - 1];
		return { ...c, mitglieder: this.mit.filter(m => m.chat_id === chat).map(m => m.mitglied_id),
			ungelesen: N.filter(n => n.nachricht_id > (me ? me.gelesen_bis : 0) && (n.autor || '') !== wer).length,
			letzte_nachricht: l ? { autor: l.autor, text: l.text.slice(0, 160), erstellt: l.erstellt } : null };
	}

	liste({ p_mitglied }) {
		return { chats: this.chats.filter(c => this.dabei(c.chat_id, p_mitglied)).sort((a, b) => String(b.letzte).localeCompare(String(a.letzte)) || b.nr - a.nr).map(c => this.json(c.chat_id, p_mitglied)) };
	}
	verlauf({ p_mitglied, p_chat, p_nach, p_max }) {
		this.pruefen(p_chat, p_mitglied);
		const N = this.nachrichten.filter(n => n.chat_id === p_chat && n.nachricht_id > (Number(p_nach) || 0)).slice(-Math.max(1, Math.min(Number(p_max) || 200, 500)));
		if (N.length) { const me = this.dabei(p_chat, p_mitglied); me.gelesen_bis = Math.max(me.gelesen_bis, N[N.length - 1].nachricht_id); }
		// Wie team_bearbeiten.sql: beim Nachladen (p_nach > 0) auch ältere Nachrichten, die in den letzten zwei Tagen bearbeitet wurden
		const seit = Date.parse(this.jetzt()) - 2 * 86400000;
		const neu = t => t && Date.parse(t) > seit;
		const bearbeitete = (Number(p_nach) || 0) > 0 ? this.nachrichten.filter(n => n.chat_id === p_chat && n.nachricht_id <= Number(p_nach) && (neu(n.bearbeitet) || neu(n.reaktion_am))) : [];
		return { chat: this.json(p_chat, p_mitglied), nachrichten: N.map(n => this.mitZitat(n)), bearbeitete: bearbeitete.map(n => this.mitZitat(n)) };
	}
	anlegen({ p_mitglied, p_art, p_titel, p_mitglieder, p_projekt }) {
		const wer = this.personen([p_mitglied, ...(p_mitglieder || [])]);
		let titel = String(p_titel || '').trim(); const proj = String(p_projekt || '').trim() || null;
		if (p_art === 'direkt') {
			if (wer.length !== 2) throw new Error('Ein Direktchat ist genau zwischen dir und einer weiteren Person.');
			const s = [...wer].sort().join('|');
			const da = this.chats.find(c => c.art === 'direkt' && this.mit.filter(m => m.chat_id === c.chat_id).map(m => m.mitglied_id).sort().join('|') === s);
			if (da) return { chat: this.json(da.chat_id, p_mitglied), vorhanden: true };
			titel = '';
		} else {
			if (wer.length < 2) throw new Error('Bitte wähle mindestens eine weitere Person aus.');
			if (p_art === 'projekt') { if (!proj || !this.projekte().some(p => p.name === proj)) throw new Error('Bitte wähle ein Projekt aus.'); if (!titel) titel = proj; }
			if (titel.length < 2) throw new Error('Bitte gib dem Chat einen Namen.');
		}
		const id = 'chat_' + (++this.cnr).toString(16).padStart(32, '0');
		this.chats.push({ chat_id: id, nr: this.cnr, art: p_art, titel: titel.slice(0, 80), projekt: proj, ki_verlauf: false, erstellt_von: p_mitglied, erstellt: this.jetzt(), letzte: this.jetzt() });
		wer.forEach(x => this.mit.push({ chat_id: id, mitglied_id: x, gelesen_bis: 0 }));
		this.hinweis(id, this.name(p_mitglied) + ' hat den Chat angelegt.');
		return { chat: this.json(id, p_mitglied), vorhanden: false };
	}
	aendern({ p_mitglied, p_chat, p_aenderung }) {
		const c = this.pruefen(p_chat, p_mitglied), a = p_aenderung || {}, n = this.name(p_mitglied);
		if ('titel' in a && c.art !== 'direkt') {
			const t = String(a.titel || '').trim().slice(0, 80);
			if (t.length < 2) throw new Error('Bitte gib dem Chat einen Namen.');
			if (t !== c.titel) { c.titel = t; this.hinweis(p_chat, n + ' hat den Chat in „' + t + '“ umbenannt.'); }
		}
		if ('projekt' in a) {
			const p = String(a.projekt || '').trim() || null;
			if (p && !this.projekte().some(x => x.name === p)) throw new Error('Dieses Projekt gibt es nicht.');
			if (p !== c.projekt) { c.projekt = p; if (c.art !== 'direkt') c.art = p ? 'projekt' : 'gruppe'; this.hinweis(p_chat, n + (p ? ' hat das Projekt „' + p + '“ dazugeholt.' : ' hat das Projekt vom Chat gelöst.')); }
		}
		if (typeof a.ki_verlauf === 'boolean' && a.ki_verlauf !== c.ki_verlauf) {
			c.ki_verlauf = a.ki_verlauf;
			this.hinweis(p_chat, '🤖 ' + n + (a.ki_verlauf ? ' hat eingeschaltet: Die KI darf den ganzen Verlauf dieses Chats lesen.' : ' hat ausgeschaltet: Die KI liest diesen Chat nur noch, wenn jemand sie mit @ anspricht.'));
		}
		if (a.hinzu) {
			if (c.art === 'direkt') throw new Error('In einen Direktchat kann niemand dazukommen. Leg dafür einen Gruppenchat an.');
			for (const x of this.personen(a.hinzu)) if (!this.dabei(p_chat, x)) { this.mit.push({ chat_id: p_chat, mitglied_id: x, gelesen_bis: 0 }); this.hinweis(p_chat, n + ' hat ' + this.name(x) + ' hinzugefügt.'); }
		}
		if (a.weg) {
			if (c.art === 'direkt' && a.weg.some(x => x !== p_mitglied)) throw new Error('Aus einem Direktchat kannst nur du selbst gehen.');
			for (const x of a.weg) { const i = this.mit.findIndex(m => m.chat_id === p_chat && m.mitglied_id === x); if (i >= 0) { this.mit.splice(i, 1); this.hinweis(p_chat, x === p_mitglied ? n + ' hat den Chat verlassen.' : n + ' hat ' + this.name(x) + ' entfernt.'); } }
		}
		return this.dabei(p_chat, p_mitglied) ? { chat: this.json(p_chat, p_mitglied) } : { chat: null, verlassen: true };
	}
	senden({ p_mitglied, p_chat, p_text, p_erwaehnt, p_whatsapp, p_antwort_auf }) {
		const c = this.pruefen(p_chat, p_mitglied);
		const t = String(p_text || '');
		if (!t.trim()) throw new Error('Die Nachricht ist leer.');
		const erw = [...new Set(p_erwaehnt || [])].filter(e => e !== p_mitglied && this.dabei(p_chat, e));
		const wa = [...new Set(p_whatsapp || [])].filter(e => erw.includes(e));
		const nn = { nachricht_id: ++this.nr, chat_id: p_chat, autor: p_mitglied, text: t, erwaehnt: erw, whatsapp: wa, erstellt: this.jetzt(), bearbeitet: null, reaktionen: {}, reaktion_am: null,
			antwort_auf: this.nachrichten.some(x => x.chat_id === p_chat && x.nachricht_id === Number(p_antwort_auf)) ? Number(p_antwort_auf) : null };
		this.nachrichten.push(nn); c.letzte = nn.erstellt;
		this.dabei(p_chat, p_mitglied).gelesen_bis = nn.nachricht_id;
		if (erw.length) this.posteingang.push({ absender: p_mitglied, empfaenger: erw, chat_id: p_chat });
		wa.forEach(e => this.whatsapp.push({ art: 'chat_erwaehnung', mitglied_id: e, aufgabe_id: p_chat, von: p_mitglied }));
		return { nachricht: this.mitZitat(nn), chat: this.json(p_chat, p_mitglied) };
	}
	// Nachbildung von team_chat_nachricht_json und team_chat_reagieren (supabase/team_chat_reaktionen.sql)
	mitZitat(n) {
		const z = n.antwort_auf ? this.nachrichten.find(x => x.nachricht_id === n.antwort_auf && x.chat_id === n.chat_id) : null;
		return { ...n, zitat: z ? { nachricht_id: z.nachricht_id, autor: z.autor, text: z.text.slice(0, 160) } : null };
	}
	reagieren({ p_mitglied, p_chat, p_nachricht_id, p_emoji }) {
		this.pruefen(p_chat, p_mitglied);
		if (!['👍', '❤️', '😂', '😮', '🙏', '✅'].includes(p_emoji)) throw new Error('Diesen Smiley gibt es hier nicht.');
		const n = this.nachrichten.find(x => x.chat_id === p_chat && x.nachricht_id === Number(p_nachricht_id));
		if (!n || !n.autor) throw new Error('Auf diese Nachricht kann man nicht reagieren.');
		const r = { ...(n.reaktionen || {}) }, liste = (r[p_emoji] || []).slice();
		const i = liste.indexOf(p_mitglied); if (i >= 0) liste.splice(i, 1); else liste.push(p_mitglied);
		if (liste.length) r[p_emoji] = liste; else delete r[p_emoji];
		n.reaktionen = r; n.reaktion_am = this.jetzt();
		return { nachricht: this.mitZitat(n) };
	}
	// Nachbildung von team_chat_bearbeiten (supabase/team_bearbeiten.sql)
	bearbeiten({ p_mitglied, p_chat, p_nachricht_id, p_text, p_erwaehnt }) {
		const c = this.pruefen(p_chat, p_mitglied);
		const n = this.nachrichten.find(x => x.chat_id === p_chat && x.nachricht_id === Number(p_nachricht_id));
		if (!n) throw new Error('Diese Nachricht gibt es nicht (mehr).');
		if (n.autor !== p_mitglied) throw new Error('Bearbeiten kann nur, wer die Nachricht geschrieben hat.');
		if (Date.parse(n.erstellt) < Date.parse(this.jetzt()) - 86400000) throw new Error('Nachrichten kann man nur bis 24 Stunden nach dem Senden bearbeiten.');
		const t = String(p_text || '');
		if (!t.trim()) throw new Error('Die Nachricht ist leer.');
		const erw = [...new Set(p_erwaehnt || [])].filter(e => e !== p_mitglied && this.dabei(p_chat, e));
		const gleich = (a, b) => a.length === b.length && a.every(x => b.includes(x));
		if (t === n.text && gleich(erw, n.erwaehnt)) return { nachricht: n, unveraendert: true, chat: this.json(p_chat, p_mitglied) };
		const schon = new Set(n.erwaehnt.concat(...this.fassungen.filter(f => f.quelle === 'chat' && f.nachricht === String(n.nachricht_id)).map(f => f.erwaehnt)));
		const neu = erw.filter(e => !schon.has(e));
		this.fassungen.push({ quelle: 'chat', nachricht: String(n.nachricht_id), autor: p_mitglied, text: n.text, erwaehnt: n.erwaehnt, gueltig_bis: this.jetzt() });
		Object.assign(n, { text: t, erwaehnt: erw, bearbeitet: this.jetzt() });
		if (neu.length) this.posteingang.push({ absender: p_mitglied, empfaenger: neu, chat_id: p_chat, bearbeitet: true, art: c.art });
		return { nachricht: n, benachrichtigt: neu, chat: this.json(p_chat, p_mitglied) };
	}
}

/** Nachbildung des n8n-Workflows „TEAM: Chat (Portal)“: [code, antwort] */
export function chatAntwortMock(body, mitglieder, db) {
	const t = String((body && body.token) || '');
	const ich = /^[a-f0-9]{20,64}$/.test(t) ? ((mitglieder || []).find(m => m.token === t) || null) : null;
	const a = chatAnfrage(ich, String((body && body.aktion) || ''), (body && body.daten && typeof body.daten === 'object') ? body.daten : {});
	if (a.aktion !== 'rpc') return [a.code, Object.assign({}, a.antwort, { testadapter: true })];
	const r = chatAntwort(a, db.rpc(a.fn, a.body));
	return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
}
