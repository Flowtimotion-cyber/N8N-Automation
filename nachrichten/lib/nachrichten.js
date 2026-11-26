// Gemeinsame Logik für die Nachrichten im Team-Portal (Messaging).
// Läuft in den Code-Knoten des n8n-Workflows „TEAM: Nachrichten (Portal)“ (Webhook team-msgs) und im lokalen Testadapter.
// Keine Abhängigkeiten, kein Netz, kein Schlüssel: Die Datenbank (Supabase, supabase/team_nachrichten.sql) fragt der HTTP-Knoten mit n8n-Zugangsdaten.
// Getestet: node --test nachrichten/test/nachrichten.test.mjs
//
// Ablauf je Anfrage { token, aktion, daten }:
//   1. msgsAnfrage(ich, aktion, daten)  → { aktion: 'rpc', fn, body } oder { aktion: 'antwort', code, antwort }
//   2. HTTP-Knoten: POST <Supabase>/rest/v1/rpc/<fn> mit body (volle Antwort, wirft nie)
//   3. msgsAntwort(anfrage, { statusCode, body }) → { code, antwort }

const MSGS_AKTIONEN = ['laden', 'senden', 'oeffnen', 'ungelesen', 'gesendet', 'bearbeiten'];
const MSGS_TEXT_MAX = 20000;
const MSGS_EMPFAENGER_MAX = 50;
const MSGS_LADEN_MAX = 300;
const MSGS_GESENDET_MAX = 100;
const MSGS_ID = /^[\w:.-]{1,80}$/;
/** Meldung, wenn der Dienst noch nicht eingerichtet ist. Derselbe Text steht in docs/team/index.html (MSGS_NICHT_EINGERICHTET); ein Test hält beide gleich. */
const MSGS_NICHT_EINGERICHTET = 'Der Nachrichtendienst ist noch nicht eingerichtet. Wie das geht, steht im Repo N8N-Automation in der Datei nachrichten/README.md, Abschnitt „Einrichten“. Bitte gib Timo Bescheid.';

/** Meldung, wenn supabase/team_bearbeiten.sql noch fehlt (Nachrichtendienst läuft, Bearbeiten noch nicht). */
const MSGS_BEARBEITEN_FEHLT = 'Bearbeiten ist noch nicht eingerichtet: Die Datei supabase/team_bearbeiten.sql muss noch in Supabase ausgeführt werden. Bitte gib Timo Bescheid.';

const gueltigeId = v => typeof v === 'string' && MSGS_ID.test(v);
const msgsFehler = (code, fehler) => ({ aktion: 'antwort', code, antwort: { ok: false, fehler } });

/** Empfängerliste: nur gültige IDs, ohne Doppelte, Reihenfolge bleibt. */
function empfaengerLesen(v) {
	const liste = Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);
	const aus = [];
	for (const e of liste) {
		const id = String(e === null || e === undefined ? '' : e).trim();
		if (MSGS_ID.test(id) && !aus.includes(id)) aus.push(id);
	}
	return aus;
}

/**
 * Erster Schritt: Zugang und Eingaben prüfen, den Aufruf der Datenbank vorbereiten.
 * ich = Zeile aus team_mitglieder (oder null). Der Absender ist immer das angemeldete Mitglied, nie eine Angabe aus dem Browser.
 */
function msgsAnfrage(ich, aktion, daten) {
	if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return msgsFehler(401, 'Dein Zugang ist ungültig. Bitte lade das Portal neu.');
	const d = daten && typeof daten === 'object' && !Array.isArray(daten) ? daten : {};
	const wer = String(ich.mitglied_id);
	if (aktion === 'laden') return { aktion: 'rpc', was: aktion, fn: 'team_msgs_laden', body: { p_mitglied: wer, p_max: MSGS_LADEN_MAX } };
	if (aktion === 'senden') {
		const empfaenger = empfaengerLesen(d.empfaenger);
		const text = typeof d.text === 'string' ? d.text.replace(/\r\n/g, '\n') : '';
		if (!empfaenger.length) return msgsFehler(400, 'Bitte wähle mindestens einen Empfänger aus.');
		if (empfaenger.length > MSGS_EMPFAENGER_MAX) return msgsFehler(400, 'Höchstens ' + MSGS_EMPFAENGER_MAX + ' Empfänger je Nachricht.');
		if (!text.trim()) return msgsFehler(400, 'Die Nachricht ist leer.');
		if (text.length > MSGS_TEXT_MAX) return msgsFehler(400, 'Die Nachricht ist zu lang (höchstens ' + MSGS_TEXT_MAX + ' Zeichen).');
		return { aktion: 'rpc', was: aktion, fn: 'team_msgs_senden', body: { p_absender: wer, p_empfaenger: empfaenger, p_text: text } };
	}
	if (aktion === 'gesendet') return { aktion: 'rpc', was: aktion, fn: 'team_msgs_gesendet', body: { p_mitglied: wer, p_max: MSGS_GESENDET_MAX } };
	if (aktion === 'bearbeiten') {
		// Nur der Absender darf bearbeiten und nur 24 Stunden lang: Das prüft die Datenbank (team_msgs_bearbeiten), hier nur die Form
		const id = String(d.msg_id === null || d.msg_id === undefined ? '' : d.msg_id);
		const text = typeof d.text === 'string' ? d.text.replace(/\r\n/g, '\n') : '';
		if (!MSGS_ID.test(id)) return msgsFehler(400, 'Ungültige Nachricht.');
		if (!text.trim()) return msgsFehler(400, 'Die Nachricht ist leer.');
		if (text.length > MSGS_TEXT_MAX) return msgsFehler(400, 'Die Nachricht ist zu lang (höchstens ' + MSGS_TEXT_MAX + ' Zeichen).');
		return { aktion: 'rpc', was: aktion, fn: 'team_msgs_bearbeiten', body: { p_mitglied: wer, p_msg_id: id, p_text: text } };
	}
	if (aktion === 'oeffnen' || aktion === 'ungelesen') {
		const id = String(d.msg_id === null || d.msg_id === undefined ? '' : d.msg_id);
		if (!MSGS_ID.test(id)) return msgsFehler(400, 'Ungültige Nachricht.');
		return { aktion: 'rpc', was: aktion, fn: aktion === 'oeffnen' ? 'team_msgs_oeffnen' : 'team_msgs_ungelesen', body: { p_mitglied: wer, p_msg_id: id } };
	}
	return msgsFehler(400, 'Unbekannte Aktion.');
}

/** Datenbank noch nicht eingerichtet: Funktion (PGRST202) oder Tabelle (42P01) fehlt. */
function msgsFehltDb(status, b) {
	const code = String((b && b.code) || '');
	return code === 'PGRST202' || code === '42P01' || code === '42883' || (status === 404 && !code);
}

/**
 * Zweiter Schritt: Antwort der Datenbank auswerten.
 * Ohne eingerichtete Datenbank liefert „laden“ eine leere Liste (vorhanden: false), alles andere eine verständliche Meldung.
 */
function msgsAntwort(anfrage, http) {
	const status = Number(http && http.statusCode) || 0;
	let b = http ? http.body : null;
	if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
	const was = anfrage && anfrage.was;
	if (status >= 200 && status < 300 && b && typeof b === 'object' && !Array.isArray(b)) {
		if (was === 'laden') {
			const liste = (Array.isArray(b.liste) ? b.liste : []).filter(e => e && gueltigeId(e.msg_id)).map(e => ({ msg_id: String(e.msg_id), gelesen: e.gelesen === true }));
			const nachrichten = (Array.isArray(b.nachrichten) ? b.nachrichten : []).filter(m => m && gueltigeId(m.msg_id));
			return { code: 200, antwort: { ok: true, vorhanden: true, liste, nachrichten } };
		}
		if (was === 'gesendet') {
			const nachrichten = (Array.isArray(b.nachrichten) ? b.nachrichten : []).filter(m => m && gueltigeId(m.msg_id));
			return { code: 200, antwort: { ok: true, vorhanden: true, nachrichten } };
		}
		return { code: 200, antwort: Object.assign({ ok: true }, b) };
	}
	if (msgsFehltDb(status, b)) {
		if (was === 'laden') return { code: 200, antwort: { ok: true, vorhanden: false, liste: [], nachrichten: [] } };
		if (was === 'gesendet') return { code: 200, antwort: { ok: true, vorhanden: false, nachrichten: [] } };
		if (was === 'bearbeiten') return { code: 503, antwort: { ok: false, fehler: MSGS_BEARBEITEN_FEHLT } };
		return { code: 503, antwort: { ok: false, fehler: MSGS_NICHT_EINGERICHTET } };
	}
	// Fehler aus den SQL-Funktionen (raise exception, Code P0001) sind für Menschen geschrieben und gehen unverändert durch
	if (b && b.code === 'P0001' && b.message) return { code: 400, antwort: { ok: false, fehler: String(b.message).slice(0, 300) } };
	return { code: 502, antwort: { ok: false, fehler: 'Die Nachrichten sind gerade nicht erreichbar. Bitte versuch es gleich noch einmal.' } };
}

export { MSGS_NICHT_EINGERICHTET, MSGS_BEARBEITEN_FEHLT, MSGS_AKTIONEN, MSGS_GESENDET_MAX, MSGS_TEXT_MAX, MSGS_EMPFAENGER_MAX, MSGS_LADEN_MAX, empfaengerLesen, msgsAnfrage, msgsAntwort };
