// TESTADAPTER: Nachbildung des n8n-Workflows „TEAM: Chat-Helfer (Portal)“ für Testserver und Tests. Ruft NIE OpenAI auf.
// Die Logik (Zugang, Prüfungen, Auswertung der OpenAI-Antwort) ist die echte aus chat/lib/helfer.js; nur die zwei OpenAI-Aufrufe sind gespielt:
//   Transkription → fester Satz, Korrektur → einfache, vorhersehbare Regeln (erster Buchstabe groß, „dass“, Punkt am Ende).
import { helferAnfrage, transkriptAntwort, korrekturAntwort } from '../lib/helfer.js';

export const MOCK_TRANSKRIPT = 'Ich bin morgen ab zehn im Büro, wir können dann das Modul durchgehen.';

/** Gespielte Korrektur durch die KI */
export function mockKorrektur(t) {
	let s = String(t || '').trim();
	s = s.replace(/\bdas ich\b/g, 'dass ich').replace(/\bteh\b/g, 'the').replace(/\s+,/g, ',');
	if (s) s = s[0].toUpperCase() + s.slice(1);
	if (s && !/[.!?…:)]$/.test(s)) s += '.';
	return s;
}

/** Sehr einfacher multipart-Leser: Textfelder und ob eine Datei dabei ist (Größe, Typ). */
export function multipartLesen(buf, contentType) {
	const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
	if (!m) { try { return { felder: JSON.parse(buf.toString('utf8') || '{}'), datei: null }; } catch (e) { return { felder: {}, datei: null }; } }
	const grenze = '--' + (m[1] || m[2]);
	const felder = {}; let datei = null;
	for (const teil of buf.toString('latin1').split(grenze)) {
		const kopfEnde = teil.indexOf('\r\n\r\n'); if (kopfEnde < 0) continue;
		const kopf = teil.slice(0, kopfEnde), inhalt = teil.slice(kopfEnde + 4).replace(/\r\n$/, '');
		const name = (/name="([^"]+)"/.exec(kopf) || [])[1]; if (!name) continue;
		if (/filename="/.test(kopf)) datei = { mimeType: ((/Content-Type:\s*([^\r\n]+)/i.exec(kopf) || [])[1] || '').trim(), fileSize: Buffer.byteLength(inhalt, 'latin1') };
		else felder[name] = Buffer.from(inhalt, 'latin1').toString('utf8');
	}
	return { felder, datei };
}

/** Nachbildung des Workflows: [code, antwort]. mitglieder = team_mitglieder (mit token). */
export function helferAntwortMock({ felder, datei }, mitglieder, opts = {}) {
	const f = felder || {};
	const t = String(f.token || '');
	const ich = /^[a-f0-9]{20,64}$/.test(t) ? ((mitglieder || []).find(m => m.token === t) || null) : null;
	if (opts.eingerichtet === false) return [404, { code: 404, message: 'The requested webhook "POST team-chat-helfer" is not registered.' }];
	const a = helferAnfrage(ich, f, datei);
	if (a.aktion === 'fehler') return [a.code, Object.assign({}, a.antwort, { testadapter: true })];
	if (a.aktion === 'transkribieren') {
		const r = transkriptAntwort({ statusCode: 200, body: { text: MOCK_TRANSKRIPT } }, a.dauer_sek);
		return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
	}
	const r = korrekturAntwort(a.original, { statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ text: mockKorrektur(a.original) }) } }] } });
	return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
}
