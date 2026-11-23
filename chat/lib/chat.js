// Gemeinsame Logik für den Team-Chat im Team-Portal (Stufe 1: Gruppen-, Direkt- und Projekt-Chats, @-Markierung, WhatsApp auf Wunsch).
// Läuft in den Code-Knoten des n8n-Workflows „TEAM: Chat (Portal)“ (Webhook team-chat) und im lokalen Testadapter.
// Keine Abhängigkeiten, kein Netz, kein Schlüssel, kein new URL(): Die Datenbank (supabase/team_chat.sql) fragt der HTTP-Knoten mit n8n-Zugangsdaten.
// Getestet: node --test chat/test/chat.test.mjs
//
// Ablauf je Anfrage { token, aktion, daten }:
//   1. chatAnfrage(ich, aktion, daten)  → { aktion: 'rpc', fn, body } oder { aktion: 'antwort', code, antwort }
//   2. HTTP-Knoten: POST <Supabase>/rest/v1/rpc/<fn> mit body (volle Antwort, wirft nie)
//   3. chatAntwort(anfrage, { statusCode, body }) → { code, antwort }
//
// Wer der Absender ist, steht immer im Token, nie in den Daten des Browsers. Agenten haben in Stufe 1 keinen Zugriff
// (die KI liest Chats nur auf Zuruf, das kommt in Stufe 2 mit eigenem Weg).

const CHAT_AKTIONEN = ['liste', 'verlauf', 'senden', 'anlegen', 'aendern'];
const CHAT_ARTEN = ['gruppe', 'direkt', 'projekt'];
const CHAT_TEXT_MAX = 8000;
const CHAT_PERSONEN_MAX = 50;
const CHAT_ID = /^chat_[a-f0-9]{8,40}$/;
const PERSON_ID = /^[\w:.-]{1,80}$/;
/** Meldung, wenn der Chat noch nicht eingerichtet ist. Derselbe Text steht in docs/team/index.html (CHAT_NICHT_EINGERICHTET). */
const CHAT_NICHT_EINGERICHTET = 'Der Team-Chat ist noch nicht eingerichtet. Wie das geht, steht im Repo N8N-Automation in der Datei chat/README.md, Abschnitt „Einrichten“. Bitte gib Timo Bescheid.';

const chatFehler = (code, fehler) => ({ aktion: 'antwort', code, antwort: { ok: false, fehler } });

/** Personenliste: nur gültige IDs, ohne Doppelte, Reihenfolge bleibt. */
function personenLesen(v) {
	const liste = Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);
	const aus = [];
	for (const e of liste) {
		const id = String(e === null || e === undefined ? '' : e).trim();
		if (PERSON_ID.test(id) && !aus.includes(id)) aus.push(id);
	}
	return aus;
}

const text = (v, n) => String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);

/**
 * Erster Schritt: Zugang und Eingaben prüfen, den Aufruf der Datenbank vorbereiten.
 * ich = Zeile aus team_mitglieder (oder null).
 */
function chatAnfrage(ich, aktion, daten) {
	if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return chatFehler(401, 'Dein Zugang ist ungültig. Bitte lade das Portal neu.');
	if (ich.typ === 'agent' || ich.rolle === 'agent') return chatFehler(403, 'Agenten lesen Chats nur, wenn sie dort mit @ angesprochen werden.');
	const d = daten && typeof daten === 'object' && !Array.isArray(daten) ? daten : {};
	const wer = String(ich.mitglied_id);
	if (!CHAT_AKTIONEN.includes(aktion)) return chatFehler(400, 'Unbekannte Aktion.');
	if (aktion === 'liste') return { aktion: 'rpc', was: aktion, fn: 'team_chat_liste', body: { p_mitglied: wer } };
	if (aktion === 'anlegen') {
		const art = CHAT_ARTEN.includes(d.art) ? d.art : '';
		if (!art) return chatFehler(400, 'Bitte wähle Gruppe, Direktchat oder Projekt-Chat.');
		const personen = personenLesen(d.mitglieder).filter(x => x !== wer);
		if (!personen.length) return chatFehler(400, 'Bitte wähle mindestens eine weitere Person aus.');
		if (art === 'direkt' && personen.length !== 1) return chatFehler(400, 'Ein Direktchat ist genau zwischen dir und einer weiteren Person.');
		if (personen.length > CHAT_PERSONEN_MAX) return chatFehler(400, 'Höchstens ' + CHAT_PERSONEN_MAX + ' Personen je Chat.');
		const titel = text(d.titel, 80).trim();
		const projekt = text(d.projekt, 120).trim();
		if (art === 'gruppe' && titel.length < 2) return chatFehler(400, 'Bitte gib dem Chat einen Namen.');
		if (art === 'projekt' && !projekt) return chatFehler(400, 'Bitte wähle ein Projekt aus.');
		return { aktion: 'rpc', was: aktion, fn: 'team_chat_anlegen', body: { p_mitglied: wer, p_art: art, p_titel: titel, p_mitglieder: personen, p_projekt: projekt || null } };
	}
	const chat = String(d.chat_id === null || d.chat_id === undefined ? '' : d.chat_id);
	if (!CHAT_ID.test(chat)) return chatFehler(400, 'Diesen Chat gibt es nicht.');
	if (aktion === 'verlauf') {
		const nach = Math.max(0, Math.floor(Number(d.nach) || 0));
		return { aktion: 'rpc', was: aktion, fn: 'team_chat_verlauf', body: { p_mitglied: wer, p_chat: chat, p_nach: nach, p_max: 200 } };
	}
	if (aktion === 'senden') {
		const t = text(d.text, CHAT_TEXT_MAX + 1);
		if (!t.trim()) return chatFehler(400, 'Die Nachricht ist leer.');
		if (t.length > CHAT_TEXT_MAX) return chatFehler(400, 'Die Nachricht ist zu lang (höchstens ' + CHAT_TEXT_MAX + ' Zeichen).');
		const erwaehnt = personenLesen(d.erwaehnt).slice(0, CHAT_PERSONEN_MAX);
		const whatsapp = personenLesen(d.whatsapp).filter(x => erwaehnt.includes(x));
		return { aktion: 'rpc', was: aktion, fn: 'team_chat_senden', body: { p_mitglied: wer, p_chat: chat, p_text: t, p_erwaehnt: erwaehnt, p_whatsapp: whatsapp } };
	}
	// aendern: nur bekannte Felder, jedes für sich optional
	const a = {};
	if (typeof d.titel === 'string') a.titel = text(d.titel, 80).trim();
	if (d.projekt !== undefined) a.projekt = text(d.projekt, 120).trim();
	if (typeof d.ki_verlauf === 'boolean') a.ki_verlauf = d.ki_verlauf;
	if (d.hinzu !== undefined) a.hinzu = personenLesen(d.hinzu).slice(0, CHAT_PERSONEN_MAX);
	if (d.weg !== undefined) a.weg = personenLesen(d.weg).slice(0, CHAT_PERSONEN_MAX);
	if (!Object.keys(a).length) return chatFehler(400, 'Es gibt nichts zu ändern.');
	return { aktion: 'rpc', was: aktion, fn: 'team_chat_aendern', body: { p_mitglied: wer, p_chat: chat, p_aenderung: a } };
}

/** Datenbank noch nicht eingerichtet: Funktion (PGRST202) oder Tabelle (42P01) fehlt. */
function chatFehltDb(status, b) {
	const code = String((b && b.code) || '');
	return code === 'PGRST202' || code === '42P01' || code === '42883' || (status === 404 && !code);
}

/**
 * Zweiter Schritt: Antwort der Datenbank auswerten.
 * Ohne eingerichtete Datenbank liefert „liste“ eine leere Liste (vorhanden: false), alles andere eine verständliche Meldung.
 */
function chatAntwort(anfrage, http) {
	const status = Number(http && http.statusCode) || 0;
	let b = http ? http.body : null;
	if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
	const was = anfrage && anfrage.was;
	if (status >= 200 && status < 300 && b && typeof b === 'object' && !Array.isArray(b)) {
		if (was === 'liste') {
			const chats = (Array.isArray(b.chats) ? b.chats : []).filter(c => c && CHAT_ID.test(String(c.chat_id || '')));
			return { code: 200, antwort: { ok: true, vorhanden: true, chats } };
		}
		return { code: 200, antwort: Object.assign({ ok: true }, b) };
	}
	if (chatFehltDb(status, b)) {
		if (was === 'liste') return { code: 200, antwort: { ok: true, vorhanden: false, chats: [] } };
		return { code: 503, antwort: { ok: false, fehler: CHAT_NICHT_EINGERICHTET } };
	}
	// Fehler aus den SQL-Funktionen (raise exception, Code P0001) sind für Menschen geschrieben und gehen unverändert durch
	if (b && b.code === 'P0001' && b.message) return { code: 400, antwort: { ok: false, fehler: String(b.message).slice(0, 300) } };
	return { code: 502, antwort: { ok: false, fehler: 'Der Chat ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.' } };
}

export { CHAT_NICHT_EINGERICHTET, CHAT_AKTIONEN, CHAT_ARTEN, CHAT_TEXT_MAX, CHAT_ID, personenLesen, chatAnfrage, chatAntwort };
