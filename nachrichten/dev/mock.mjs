// TESTADAPTER: Nachbildung der Supabase-Funktionen aus supabase/team_nachrichten.sql im Speicher, für Testserver und Tests.
// Antwortet wie PostgREST ({ statusCode, body }), damit msgsAntwort hier genauso läuft wie im n8n-Workflow.
import { msgsAnfrage, msgsAntwort } from '../lib/nachrichten.js';

export class C_MsgsDbNachbildung {
	constructor({ eingerichtet = true, mitglieder = () => [], jetzt = () => new Date().toISOString() } = {}) {
		this.eingerichtet = eingerichtet;   // false: Tabellen und Funktionen gibt es noch nicht (wie vor dem SQL-Skript)
		this.mitglieder = mitglieder;
		this.jetzt = jetzt;
		this.msgs = [];                     // team_msgs
		this.user = [];                     // team_msgs_user
		this.nr = 0;
	}

	rpc(fn, body) {
		if (!this.eingerichtet) return { statusCode: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
		const f = { team_msgs_senden: this.senden, team_msgs_laden: this.laden, team_msgs_oeffnen: this.oeffnen, team_msgs_ungelesen: this.ungelesen }[fn];
		if (!f) return { statusCode: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
		try {
			return { statusCode: 200, body: JSON.parse(JSON.stringify(f.call(this, body || {}))) };
		} catch (e) {
			return { statusCode: 400, body: { code: 'P0001', message: e.message } };
		}
	}

	senden({ p_absender, p_empfaenger, p_text }) {
		const empf = [...new Set((p_empfaenger || []).map(e => String(e || '').trim()).filter(Boolean))];
		if (!empf.length) throw new Error('Bitte wähle mindestens einen Empfänger aus.');
		if (!String(p_text || '').trim()) throw new Error('Die Nachricht ist leer.');
		const ok = new Set(this.mitglieder().filter(m => m.status !== 'gesperrt').map(m => m.mitglied_id));
		const unbekannt = empf.filter(e => !ok.has(e));
		if (unbekannt.length) throw new Error('Unbekannte oder gesperrte Empfänger: ' + unbekannt.join(', '));
		const msg = { msg_id: 'msg_test' + String(++this.nr).padStart(4, '0'), absender: String(p_absender || '').trim() || null, empfaenger: empf, text: p_text, gesendet: this.jetzt(), empfangen: {} };
		this.msgs.push(msg);
		empf.forEach(e => this.user.push({ mitglied_id: e, msg_id: msg.msg_id, gelesen: false, geaendert: msg.gesendet }));
		return { nachricht: msg };
	}

	laden({ p_mitglied, p_max }) {
		const L = this.user.filter(u => u.mitglied_id === p_mitglied)
			.map(u => ({ u, m: this.msgs.find(x => x.msg_id === u.msg_id) }))
			.filter(x => x.m)
			.sort((a, b) => String(b.m.gesendet).localeCompare(String(a.m.gesendet)) || b.m.msg_id.localeCompare(a.m.msg_id))
			.slice(0, Math.max(1, Math.min(Number(p_max) || 300, 1000)));
		return { liste: L.map(x => ({ msg_id: x.u.msg_id, gelesen: x.u.gelesen })), nachrichten: L.map(x => x.m) };
	}

	eintrag(p_mitglied, p_msg_id) {
		const u = this.user.find(x => x.mitglied_id === p_mitglied && x.msg_id === p_msg_id);
		if (!u) throw new Error('Diese Nachricht gibt es nicht (mehr).');
		return u;
	}

	oeffnen({ p_mitglied, p_msg_id }) {
		const u = this.eintrag(p_mitglied, p_msg_id);
		u.gelesen = true; u.geaendert = this.jetzt();
		const m = this.msgs.find(x => x.msg_id === p_msg_id);
		if (!(p_mitglied in m.empfangen)) m.empfangen[p_mitglied] = this.jetzt();
		return { nachricht: m, eintrag: { msg_id: p_msg_id, gelesen: true } };
	}

	ungelesen({ p_mitglied, p_msg_id }) {
		const u = this.eintrag(p_mitglied, p_msg_id);
		u.gelesen = false; u.geaendert = this.jetzt();
		return { eintrag: { msg_id: p_msg_id, gelesen: false } };
	}
}

/** Nachbildung des n8n-Workflows „TEAM: Nachrichten (Portal)“: [code, antwort] */
export function msgsAntwortMock(body, mitglieder, db) {
	const t = String((body && body.token) || '');
	const ich = /^[a-f0-9]{20,64}$/.test(t) ? ((mitglieder || []).find(m => m.token === t) || null) : null;
	const a = msgsAnfrage(ich, String((body && body.aktion) || ''), (body && body.daten && typeof body.daten === 'object') ? body.daten : {});
	if (a.aktion !== 'rpc') return [a.code, Object.assign({}, a.antwort, { testadapter: true })];
	const r = msgsAntwort(a, db.rpc(a.fn, a.body));
	return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
}
