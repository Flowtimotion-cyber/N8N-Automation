// Vertrieb: Diktat und Gesprächsnotiz per Spracherkennung (n8n-Workflow „TEAM: Diktat“, Webhook team-diktat).
// Läuft im n8n-Code-Knoten (eingebettet von vertrieb/n8n/bauen-diktat.mjs) und in Node (Tests). Kein Netzwerk, kein require.
// Ablauf: Browser schickt Audio (Aufnahme oder Datei) + Token → Rechte prüfen → OpenAI-Transkription → KI-Bereinigung und
// Zusammenfassung → Antwort an den Browser. Gespeichert wird in Twenty erst, wenn die Person im Portal auf „Speichern“ klickt.
// Vorbild: WhisperM (Flowtimotion-cyber/WhisperM, MIT): OpenAI gpt-4o-mini-transcribe + KI-Bereinigung ins Deutsche.

const DIKTAT_ROLLEN = ['admin', 'dozent', 'vertrieb'];
const DIKTAT_ARTEN = ['anruf', 'notiz', 'termin', 'mail'];
const DIKTAT_MODI = ['diktat', 'gespraech'];            // diktat = eigene Notiz nach dem Gespräch; gespraech = Mitschnitt (nur mit Einwilligung aller)
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;              // Grenze der OpenAI-Transkription
const MAX_AUDIO_SEK = 30 * 60;
// Lange Aufnahmen (Meetings, Workshops) schickt das Portal in Stücken von etwa 5 Minuten (Feld teil=1): Die Transkriptionsmodelle
// liefern höchstens rund 2.000 Token Text, sonst bricht der Text nach ca. 8–10 Minuten still ab. Danach kommt ein Aufruf
// aktion=zusammenfassen mit dem zusammengesetzten Text (ohne Audio), der nur noch Zusammenfassung, Punkte, Schritte und Termine liefert.
const MAX_GESAMT_SEK = 4 * 60 * 60;
const MAX_GESAMT_ZEICHEN = 400000;
const TRANSKRIPTION_MODELL = 'gpt-4o-mini-transcribe';  // ~0,003 USD je Sprechminute (Preisliste OpenAI, Stand 10/2026, geschätzt)
const BEREINIGUNG_MODELL = 'gpt-5-mini';                // wie der Kurs-Chat-Assistent; über dasselbe OpenAI-Credential in n8n
const KOSTEN_JE_MIN_USD = 0.003;
// Fachwörter und Namen, damit die Transkription sie richtig schreibt (wie das Wörterbuch in WhisperM)
const WOERTERBUCH = ['Momentum KI Akademie', 'KI Flow', 'KI-Führerschein', 'Bildungsgutschein', 'QCG', 'Qualifizierungschancengesetz', 'Agentur für Arbeit', 'Erhebungsbogen', 'Twenty', 'n8n', 'Hermes', 'Claude', 'Hermetikmarketing', 'Timo Merz', 'Weiterbildung', 'Fördercheck'];

const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, n);

/** Prompt für die Spracherkennung: Deutsch, Fachwörter. */
function transkriptionsPrompt() { return 'Deutsches Vertriebsgespräch der Momentum KI Akademie. Begriffe: ' + WOERTERBUCH.join(', ') + '.'; }

/**
 * Prüft Zugang und Eingabe. ich = Zeile aus team_mitglieder (oder null), felder = Formularfelder, datei = { mimeType, fileSize } oder null.
 * Liefert { aktion: 'transkribieren', kontext } oder { aktion: 'fehler', code, antwort }.
 */
function diktatAnfrage(ich, felder, datei) {
  const raus = (code, fehler) => ({ aktion: 'fehler', code, antwort: { ok: false, fehler } });
  if (!ich || ich.status === 'gesperrt') return raus(401, 'Dein Zugang ist ungültig. Bitte öffne das Portal über deinen persönlichen Link.');
  if (ich.status !== 'aktiv') return raus(403, 'Bitte richte zuerst dein Profil im Team-Portal ein.');
  if (ich.typ === 'agent' || ich.rolle === 'agent') return raus(403, 'Das Diktat ist für Menschen im Vertrieb gedacht, nicht für Agenten.');
  if (!DIKTAT_ROLLEN.includes(ich.rolle)) return raus(403, 'Das Diktat nutzen Timo, Kurt, Murat und das Vertriebsteam.');
  const f = felder || {};
  if (f.aktion === 'zusammenfassen') {
    const transkript = String(f.transkript ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim();
    if (transkript.length < 2) return raus(400, 'Es ist kein Text zum Zusammenfassen angekommen.');
    if (transkript.length > MAX_GESAMT_ZEICHEN) return raus(413, 'Der Text ist zu lang zum Zusammenfassen (über 4 Stunden Gespräch).');
    const chance_id = /^[A-Za-z0-9-]{1,80}$/.test(String(f.chance_id || '')) ? String(f.chance_id) : '';
    return { aktion: 'zusammenfassen', transkript, kontext: { mitglied_id: ich.mitglied_id, name: ich.name, chance_id, chance_name: txt(f.chance_name, 120), kontakt_name: txt(f.kontakt_name, 120), art: DIKTAT_ARTEN.includes(f.art) ? f.art : 'anruf', modus: DIKTAT_MODI.includes(f.modus) ? f.modus : 'diktat', dauer_sek: Math.max(0, Math.min(MAX_GESAMT_SEK, Number(f.dauer_sek) || 0)), gesamt: true, pc_ton: String(f.pc_ton) === '1' } };
  }
  if (!datei) return raus(400, 'Es ist keine Aufnahme angekommen. Bitte noch einmal aufnehmen oder eine Audiodatei wählen.');
  const groesse = Number(datei.fileSize) || 0;
  if (groesse > MAX_AUDIO_BYTES) return raus(413, 'Die Aufnahme ist größer als 25 MB. Bitte kürzer aufnehmen oder die Datei verkleinern.');
  const mime = String(datei.mimeType || '').toLowerCase();
  if (mime && !/^(audio\/|video\/(webm|mp4|ogg)|application\/octet-stream)/.test(mime)) return raus(415, 'Bitte eine Audiodatei schicken (webm, mp4, m4a, mp3, wav, ogg).');
  const dauer = Math.max(0, Math.min(MAX_AUDIO_SEK, Number(f.dauer_sek) || 0));
  if (Number(f.dauer_sek) > MAX_AUDIO_SEK) return raus(413, 'Aufnahmen bis 30 Minuten. Bitte in Abschnitten aufnehmen.');
  const chance_id = /^[A-Za-z0-9-]{1,80}$/.test(String(f.chance_id || '')) ? String(f.chance_id) : '';
  return { aktion: 'transkribieren', kontext: { mitglied_id: ich.mitglied_id, name: ich.name, chance_id, chance_name: txt(f.chance_name, 120), kontakt_name: txt(f.kontakt_name, 120), art: DIKTAT_ARTEN.includes(f.art) ? f.art : 'anruf', modus: DIKTAT_MODI.includes(f.modus) ? f.modus : 'diktat', dauer_sek: dauer, mime: mime || 'audio/webm', groesse, teil: String(f.teil) === '1', pc_ton: String(f.pc_ton) === '1' } };
}

/** Prompt für Bereinigung und Zusammenfassung. Ausgabe als JSON mit festen Feldern. */
function bereinigungsPrompt(kontext, transkript) {
  const k = kontext || {};
  if (k.teil) {
    // Stück einer langen Aufnahme: nur sauber aufschreiben, zusammengefasst wird am Ende über den ganzen Text
    const system = 'Du bist Assistent für Gesprächsnotizen der Momentum KI Akademie (Weiterbildung „KI-Führerschein“, Förderung über Bildungsgutschein/QCG). ' +
      'Du bekommst die rohe Transkription eines etwa fünfminütigen Abschnitts aus einer längeren Aufnahme (Meeting, Workshop, Video). Gib den Text in sauberem Deutsch wieder: Erkennungsfehler korrigieren, falsch erkannte Sprache ins Deutsche übersetzen, Fachbegriffe und Eigennamen beibehalten, Inhalt nicht verändern, nichts dazuerfinden, nichts kürzen, Füllwörter weglassen. Der Abschnitt kann mitten im Satz beginnen oder enden; lass das so. ' +
      'Antworte NUR mit JSON: {"text": "..."}. Keine Erklärungen, kein Markdown außerhalb des JSON.';
    return { system, user: 'Abschnitt:\n' + String(transkript || '') };
  }
  const system = 'Du bist Assistent für Gesprächsnotizen im Vertrieb der Momentum KI Akademie (Weiterbildung „KI-Führerschein“, Förderung über Bildungsgutschein/QCG). ' +
    'Du bekommst die rohe Transkription eines Diktats oder Gesprächs. Aufgaben: 1) Gib den Text in sauberem Deutsch wieder: Erkennungsfehler korrigieren, falsch erkannte Sprache ins Deutsche übersetzen, Fachbegriffe und Eigennamen beibehalten, Inhalt nicht verändern, nichts dazuerfinden, Füllwörter weglassen. ' +
    '2) Fasse in 2 bis 3 Sätzen zusammen. 3) Nenne die wichtigsten Punkte. 4) Nenne konkrete nächste Schritte mit Zuständigkeit, falls genannt. 5) Nenne Termine und Fristen, falls genannt (Datum im Format TT.MM.JJJJ, sonst wörtlich). ' +
    'Antworte NUR mit JSON: {"text": "...", "zusammenfassung": "...", "punkte": ["..."], "naechste_schritte": ["..."], "termine": ["..."]}. Keine Erklärungen, kein Markdown außerhalb des JSON. Du-Form ist nicht nötig; schreibe neutral.';
  const user = 'Kontext: ' + (k.modus === 'gespraech' ? 'Gesprächsmitschnitt' : 'Diktat nach dem Gespräch') + ' (' + (k.art || 'anruf') + ')' + (k.chance_name ? ', Verkaufschance „' + k.chance_name + '“' : '') + (k.kontakt_name ? ', Kontakt ' + k.kontakt_name : '') + '.\n\nTranskription:\n' + String(transkript || '');
  return { system, user };
}

/** Prompt für die Zusammenfassung einer langen Aufnahme. Der Text ist schon bereinigt und wird nicht zurückgegeben. */
function zusammenfassungsPrompt(kontext, text) {
  const k = kontext || {};
  const system = 'Du bist Assistent für Gesprächsnotizen der Momentum KI Akademie (Weiterbildung „KI-Führerschein“, Förderung über Bildungsgutschein/QCG). ' +
    'Du bekommst den bereinigten Wortlaut einer längeren Aufnahme (Meeting, Workshop, Video). Gib den Wortlaut NICHT zurück. Aufgaben: 1) Fasse in 3 bis 6 Sätzen zusammen. 2) Nenne die wichtigsten Punkte. 3) Nenne konkrete nächste Schritte mit Zuständigkeit, falls genannt. 4) Nenne Termine und Fristen, falls genannt (Datum im Format TT.MM.JJJJ, sonst wörtlich). Nichts dazuerfinden. ' +
    'Antworte NUR mit JSON: {"zusammenfassung": "...", "punkte": ["..."], "naechste_schritte": ["..."], "termine": ["..."]}. Keine Erklärungen, kein Markdown außerhalb des JSON. Schreibe neutral.';
  const user = 'Kontext: ' + (k.modus === 'gespraech' ? 'Mitschnitt' : 'Diktat') + (k.pc_ton ? ' mit Computerton (Meeting, Workshop oder Video)' : '') + ' (' + (k.art || 'anruf') + ')' + (k.chance_name ? ', Verkaufschance „' + k.chance_name + '“' : '') + (k.kontakt_name ? ', Kontakt ' + k.kontakt_name : '') + (k.dauer_sek ? ', Dauer ' + Math.round(k.dauer_sek / 60) + ' Min.' : '') + '.\n\nWortlaut:\n' + String(text || '');
  return { system, user };
}

/** Holt das JSON-Objekt aus einer Modellantwort (Codezäune, Text davor/danach). null, wenn keins lesbar ist. */
function jsonAusLlm(roh) {
  let s = String(roh ?? '').trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(s.slice(a, b + 1)); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
}
const llmListe = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(x => txt(x, 400)).filter(Boolean).slice(0, 20);

/** Liest die JSON-Antwort des Modells robust (Codezäune, Text davor/danach). */
function llmAntwortLesen(roh, transkript) {
  const fallback = { text: String(transkript || '').trim(), zusammenfassung: '', punkte: [], naechste_schritte: [], termine: [], bereinigt: false };
  const j = jsonAusLlm(roh);
  if (!j) return fallback;
  const liste = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(x => txt(x, 400)).filter(Boolean).slice(0, 20);
  const text = txt(j.text, 20000) || fallback.text;
  return { text, zusammenfassung: txt(j.zusammenfassung, 1500), punkte: liste(j.punkte), naechste_schritte: liste(j.naechste_schritte), termine: liste(j.termine), bereinigt: !!txt(j.text, 20000) };
}

/** Antwort für ein Stück einer langen Aufnahme: nur der (bereinigte) Text, keine Zusammenfassung. */
function teilAntwort(transkript, llmRoh, kontext) {
  const t = String(transkript || '').trim();
  const k = kontext || {};
  const j = jsonAusLlm(llmRoh);
  const sauber = j ? txt(j.text, 20000) : '';
  return { code: 200, antwort: { ok: true, teil: true, text: sauber || t, roh: t, bereinigt: !!sauber, dauer_sek: k.dauer_sek || 0, kosten: kostenSchaetzung(k.dauer_sek), modelle: { transkription: TRANSKRIPTION_MODELL, bereinigung: BEREINIGUNG_MODELL } } };
}

/** Antwort auf aktion=zusammenfassen: Der Text kommt vom Portal, vom Modell nur Zusammenfassung, Punkte, Schritte, Termine. */
function gesamtAntwort(text, llmRoh, kontext, jetztIso) {
  const k = kontext || {};
  const j = jsonAusLlm(llmRoh) || {};
  const erg = { text: txt(text, MAX_GESAMT_ZEICHEN), zusammenfassung: txt(j.zusammenfassung, 3000), punkte: llmListe(j.punkte), naechste_schritte: llmListe(j.naechste_schritte), termine: llmListe(j.termine), bereinigt: true };
  return { code: 200, antwort: { ok: true, gesamt: true, text: erg.text, roh: '', zusammenfassung: erg.zusammenfassung, punkte: erg.punkte, naechste_schritte: erg.naechste_schritte, termine: erg.termine, bereinigt: true, zusammengefasst: !!erg.zusammenfassung,
    aktivitaet: aktivitaetBauen(erg, k, jetztIso), art: k.art || 'anruf', modus: k.modus || 'diktat', chance_id: k.chance_id || '', dauer_sek: k.dauer_sek || 0, kosten: kostenSchaetzung(k.dauer_sek),
    modelle: { transkription: TRANSKRIPTION_MODELL, bereinigung: BEREINIGUNG_MODELL }, stand: jetztIso || new Date().toISOString() } };
}

/** Kosten nur als Schätzung aus der Aufnahmedauer (vom Browser gemeldet). */
function kostenSchaetzung(dauer_sek) {
  const min = Math.max(0, Number(dauer_sek) || 0) / 60;
  return { usd: Math.round(min * KOSTEN_JE_MIN_USD * 10000) / 10000, hinweis: 'geschätzt: ' + KOSTEN_JE_MIN_USD + ' USD je Sprechminute (' + TRANSKRIPTION_MODELL + ', Preisliste 10/2026), Bereinigung mit ' + BEREINIGUNG_MODELL + ' nicht enthalten' };
}

/** Text für die Aktivität in Twenty (Markdown, wie das Portal es anzeigt). */
function aktivitaetBauen(erg, kontext, jetztIso) {
  const k = kontext || {};
  const d = new Date(jetztIso || Date.now());
  const datum = isNaN(d) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const kopf = (k.pc_ton ? '🖥️ Mitschnitt mit Computerton' : k.modus === 'gespraech' ? '🎙️ Gesprächsmitschnitt' : '🎙️ Diktat') + (k.name ? ' von ' + k.name : '') + (datum ? ' am ' + datum : '') + (k.dauer_sek ? ' (' + Math.round(k.dauer_sek / 60) + ' Min.)' : '') + ', KI-bereinigt';
  const teile = [kopf];
  if (erg.zusammenfassung) teile.push('**Zusammenfassung:** ' + erg.zusammenfassung);
  if (erg.punkte && erg.punkte.length) teile.push('**Wichtige Punkte:**\n' + erg.punkte.map(p => '- ' + p).join('\n'));
  if (erg.naechste_schritte && erg.naechste_schritte.length) teile.push('**Nächste Schritte:**\n' + erg.naechste_schritte.map(p => '- ' + p).join('\n'));
  if (erg.termine && erg.termine.length) teile.push('**Termine:** ' + erg.termine.join('; '));
  if (erg.text) teile.push('**Wortlaut' + (erg.bereinigt ? ' (bereinigt)' : ' (Rohtranskript)') + ':**\n' + erg.text);
  return teile.join('\n\n');
}

/** Antwort an den Browser. */
function diktatAntwort(transkript, llmRoh, kontext, jetztIso) {
  const t = String(transkript || '').trim();
  if (!t) return { code: 422, antwort: { ok: false, fehler: 'In der Aufnahme wurde keine Sprache erkannt. Bitte näher ans Mikrofon oder lauter sprechen.' } };
  const erg = llmAntwortLesen(llmRoh, t);
  const k = kontext || {};
  return { code: 200, antwort: { ok: true, text: erg.text, roh: t, zusammenfassung: erg.zusammenfassung, punkte: erg.punkte, naechste_schritte: erg.naechste_schritte, termine: erg.termine, bereinigt: erg.bereinigt,
    aktivitaet: aktivitaetBauen(erg, k, jetztIso), art: k.art || 'anruf', modus: k.modus || 'diktat', chance_id: k.chance_id || '', dauer_sek: k.dauer_sek || 0, kosten: kostenSchaetzung(k.dauer_sek),
    modelle: { transkription: TRANSKRIPTION_MODELL, bereinigung: BEREINIGUNG_MODELL }, stand: jetztIso || new Date().toISOString() } };
}

export { DIKTAT_ROLLEN, DIKTAT_ARTEN, DIKTAT_MODI, MAX_AUDIO_BYTES, MAX_AUDIO_SEK, MAX_GESAMT_SEK, MAX_GESAMT_ZEICHEN, TRANSKRIPTION_MODELL, BEREINIGUNG_MODELL, WOERTERBUCH, transkriptionsPrompt, diktatAnfrage, bereinigungsPrompt, zusammenfassungsPrompt, jsonAusLlm, llmAntwortLesen, teilAntwort, gesamtAntwort, kostenSchaetzung, aktivitaetBauen, diktatAntwort };
