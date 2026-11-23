// Chat-Helfer im Team-Portal: Sprachnachricht → Text (OpenAI-Transkription) und „KI korrigieren“ (Rechtschreibung, Zeichensetzung).
// Läuft in den Code-Knoten des n8n-Workflows „TEAM: Chat-Helfer (Portal)“ (Webhook team-chat-helfer) und im lokalen Testadapter.
// Keine Abhängigkeiten, kein Netz, kein Schlüssel, kein new URL(), kein require: OpenAI und Supabase fragen die HTTP-Knoten mit n8n-Zugangsdaten.
// Gespeichert wird nichts. Gesendet wird die Nachricht wie bisher über den Chat (team-chat), erst wenn die Person auf Senden drückt.
// Getestet: node --test chat/test/helfer.test.mjs
//
// Timos Entscheidungen (23.11.2026): Sprachnachricht dürfen alle im Team (keine Agenten). Haken „KI korrigieren“: Die KI korrigiert
// nur Rechtschreibung, Grammatik und Zeichensetzung, der Inhalt bleibt; die korrigierte Fassung steht erst im Eingabefeld, gesendet wird
// mit dem zweiten Senden.
//
// Ablauf je Anfrage (multipart oder JSON): { token, aktion: 'transkribieren' | 'korrigieren', text?, dauer_sek?, datei? }
//   1. helferAnfrage(ich, felder, datei) → { aktion: 'transkribieren', ... } | { aktion: 'korrigieren', system, user, ... } | { aktion: 'fehler', code, antwort }
//   2. HTTP-Knoten: OpenAI (Transkription bzw. Chat), volle Antwort, wirft nie
//   3. transkriptAntwort(...) bzw. korrekturAntwort(...) → { code, antwort }

const HELFER_AKTIONEN = ['transkribieren', 'korrigieren'];
const HELFER_TEXT_MAX = 8000;                              // wie CHAT_TEXT_MAX
const HELFER_AUDIO_BYTES = 25 * 1024 * 1024;              // Grenze der OpenAI-Transkription
const HELFER_AUDIO_SEK = 5 * 60;                          // Sprachnachricht im Chat: bis 5 Minuten
const HELFER_TRANSKRIPTION_MODELL = 'gpt-4o-mini-transcribe';  // wie „TEAM: Diktat“, ca. 0,003 USD je Sprechminute
const HELFER_KORREKTUR_MODELL = 'gpt-5-mini';                  // wie Diktat-Bereinigung und Kurs-Assistent
const HELFER_KOSTEN_JE_MIN_USD = 0.003;
// Fachwörter und Namen, damit die Transkription sie richtig schreibt
const HELFER_WOERTERBUCH = ['Momentum KI Akademie', 'Team-Portal', 'KI Office', 'KI-Führerschein', 'Bildungsgutschein', 'QCG', 'Agentur für Arbeit', 'Twenty', 'n8n', 'Supabase', 'Hermes', 'Claude', 'Codex', 'Hermetikmarketing', 'Weiterbildung', 'WhatsApp', 'Instagram', 'Reel'];

const helferText = (v, n) => String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const helferFehler = (code, fehler) => ({ aktion: 'fehler', code, antwort: { ok: false, fehler } });

/** Prompt für die Spracherkennung: Deutsch, Teamchat, Fachwörter. */
function helferTranskriptionsPrompt() { return 'Kurze Nachricht im Team-Chat der Momentum KI Akademie, Deutsch. Begriffe: ' + HELFER_WOERTERBUCH.join(', ') + '.'; }

/** Prompt für die Korrektur: nur Form, nie Inhalt. @-Markierungen, Links, Emojis und Markdown bleiben. */
function korrekturPrompt(text) {
	const system = 'Du korrigierst Nachrichten aus dem internen Team-Chat der Momentum KI Akademie. ' +
		'Korrigiere ausschließlich Rechtschreibung, Grammatik, Zeichensetzung, Groß- und Kleinschreibung und offensichtliche Tippfehler. ' +
		'Inhalt, Ton, Wortwahl, Anrede (du oder Sie), Satzbau und Länge bleiben, so weit es geht, gleich. Nichts hinzufügen, nichts weglassen, nicht umformulieren, nicht übersetzen. ' +
		'Unverändert lassen: @-Markierungen (z. B. @kurt, @Anna_Müller), Links, E-Mail-Adressen, Zahlen, Datumsangaben, Emojis, Zeilenumbrüche und Markdown (**fett**, Listen, Zitate). ' +
		'Ist nichts zu korrigieren, gib den Text unverändert zurück. Antworte NUR mit JSON: {"text": "..."}';
	return { system, user: String(text || '') };
}

/**
 * Erster Schritt: Zugang und Eingaben prüfen.
 * ich = Zeile aus team_mitglieder (oder null), felder = Formular- oder JSON-Felder, datei = { mimeType, fileSize } oder null.
 */
function helferAnfrage(ich, felder, datei) {
	if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return helferFehler(401, 'Dein Zugang ist ungültig. Bitte lade das Portal neu.');
	if (ich.typ === 'agent' || ich.rolle === 'agent') return helferFehler(403, 'Sprachnachricht und Korrektur sind für Menschen im Team gedacht, nicht für Agenten.');
	const f = felder && typeof felder === 'object' && !Array.isArray(felder) ? felder : {};
	const aktion = String(f.aktion || '');
	if (!HELFER_AKTIONEN.includes(aktion)) return helferFehler(400, 'Unbekannte Aktion.');
	if (aktion === 'korrigieren') {
		const t = helferText(f.text, HELFER_TEXT_MAX + 1);
		if (!t.trim()) return helferFehler(400, 'Die Nachricht ist leer.');
		if (t.length > HELFER_TEXT_MAX) return helferFehler(400, 'Die Nachricht ist zu lang (höchstens ' + HELFER_TEXT_MAX + ' Zeichen).');
		const p = korrekturPrompt(t);
		return { aktion: 'korrigieren', original: t, system: p.system, user: p.user, modell: HELFER_KORREKTUR_MODELL };
	}
	if (!datei) return helferFehler(400, 'Es ist keine Aufnahme angekommen. Bitte noch einmal aufnehmen.');
	const groesse = Number(datei.fileSize) || 0;
	if (groesse > HELFER_AUDIO_BYTES) return helferFehler(413, 'Die Aufnahme ist zu groß. Bitte kürzer sprechen.');
	const mime = String(datei.mimeType || '').toLowerCase();
	if (mime && !/^(audio\/|video\/(webm|mp4|ogg)|application\/octet-stream)/.test(mime)) return helferFehler(415, 'Das ist keine Sprachaufnahme.');
	if (Number(f.dauer_sek) > HELFER_AUDIO_SEK) return helferFehler(413, 'Sprachnachrichten bis 5 Minuten. Bitte in Abschnitten aufnehmen.');
	const dauer = Math.max(0, Math.min(HELFER_AUDIO_SEK, Number(f.dauer_sek) || 0));
	return { aktion: 'transkribieren', dauer_sek: dauer, prompt: helferTranskriptionsPrompt(), modell: HELFER_TRANSKRIPTION_MODELL };
}

/** Antwort der OpenAI-Transkription auswerten. http = { statusCode, body }. */
function transkriptAntwort(http, dauer_sek) {
	const status = Number(http && http.statusCode) || 0;
	let b = http ? http.body : null;
	if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
	if (status >= 300 || !b || typeof b.text !== 'string') {
		const grund = b && b.error && b.error.message ? String(b.error.message).slice(0, 200) : 'HTTP ' + (status || 'ohne Antwort');
		return { code: 502, antwort: { ok: false, fehler: 'Die Spracherkennung hat nicht geklappt (' + grund + '). Bitte gleich noch einmal versuchen.' } };
	}
	const text = helferText(b.text, HELFER_TEXT_MAX).trim();
	if (!text) return { code: 422, antwort: { ok: false, fehler: 'In der Aufnahme wurde keine Sprache erkannt. Bitte näher ans Mikrofon oder lauter sprechen.' } };
	const min = Math.max(0, Number(dauer_sek) || 0) / 60;
	return { code: 200, antwort: { ok: true, text, kosten: { usd: Math.round(min * HELFER_KOSTEN_JE_MIN_USD * 10000) / 10000, hinweis: 'geschätzt: ' + HELFER_KOSTEN_JE_MIN_USD + ' USD je Sprechminute (' + HELFER_TRANSKRIPTION_MODELL + ')' } } };
}

/** @-Markierungen eines Textes (klein geschrieben), um zu prüfen, dass die Korrektur keine verliert oder erfindet. */
function markierungenIn(text) {
	const m = String(text || '').match(/(^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.-]+/gu) || [];
	return m.map(x => x.slice(x.indexOf('@')).replace(/[.]+$/, '').toLowerCase()).sort();
}

/**
 * Antwort der Korrektur auswerten. original = Text vor der Korrektur, http = { statusCode, body } der Chat-API.
 * Sicherheitsnetz: Fehlt die Antwort, ist sie leer, weicht sie in der Länge stark ab oder ändert sie @-Markierungen, bleibt der Originaltext.
 */
function korrekturAntwort(original, http) {
	const orig = String(original || '');
	const bleibt = hinweis => ({ code: 200, antwort: { ok: true, text: orig, geaendert: false, hinweis } });
	const status = Number(http && http.statusCode) || 0;
	let b = http ? http.body : null;
	if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
	let inhalt = '';
	try { inhalt = status < 300 && b && b.choices && b.choices[0] && b.choices[0].message ? String(b.choices[0].message.content || '') : ''; } catch (e) { inhalt = ''; }
	if (!inhalt) return bleibt('Die KI-Korrektur ist gerade nicht erreichbar. Dein Text ist unverändert.');
	let s = inhalt.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	const a = s.indexOf('{'), z = s.lastIndexOf('}');
	let j = null;
	if (a >= 0 && z > a) { try { j = JSON.parse(s.slice(a, z + 1)); } catch (e) { j = null; } }
	const neu = j && typeof j.text === 'string' ? helferText(j.text, HELFER_TEXT_MAX) : '';
	if (!neu.trim()) return bleibt('Die KI-Korrektur hat nichts Brauchbares geliefert. Dein Text ist unverändert.');
	const laenge = neu.trim().length / Math.max(1, orig.trim().length);
	if (orig.trim().length > 20 && (laenge < 0.6 || laenge > 1.5)) return bleibt('Die KI hätte zu viel verändert. Dein Text ist unverändert.');
	if (markierungenIn(neu).join(' ') !== markierungenIn(orig).join(' ')) return bleibt('Die KI hätte @-Markierungen verändert. Dein Text ist unverändert.');
	// Leerzeichen am Ende wie im Original, sonst zählt eine reine Leerzeichen-Änderung als Korrektur
	const ergebnis = neu.trim() === orig.trim() ? orig : neu.trim();
	return { code: 200, antwort: { ok: true, text: ergebnis, geaendert: ergebnis !== orig } };
}

export { HELFER_AKTIONEN, HELFER_TEXT_MAX, HELFER_AUDIO_SEK, HELFER_TRANSKRIPTION_MODELL, HELFER_KORREKTUR_MODELL, helferTranskriptionsPrompt, korrekturPrompt, helferAnfrage, transkriptAntwort, markierungenIn, korrekturAntwort };
