// Kommunikation: Logik des WhatsApp-Assistenten (Workflow B). Läuft im n8n-Code-Knoten (eingebettet von bauen.mjs) und in Node (Tests).
// Kein Netzwerk, kein require. Die Knoten rufen nur diese Funktionen auf.

const BUCHUNG_KARSTEN = 'https://api.leadconnectorhq.com/widget/bookings/beratung-momentum-ki-akademie';
const DATENSCHUTZ = 'momentum-ki-akademie.de/datenschutz';

export const BEGRUESSUNG =
  'Hallo und willkommen bei HermetikFlow! 👋 Ich bin der digitale KI-Assistent der *Momentum KI Akademie* und von *Hermetik Marketing*.\n\n' +
  'Worum geht es dir?\n' +
  '• *Umsetzung:* KI-Agenten und Automatisierung für dein Unternehmen\n' +
  '• *Mitarbeiterschulung:* geförderte KI-Weiterbildung für dein Team\n\n' +
  'Oder schreib einfach deine Frage. Ein Termin oder ein Mensch aus dem Team ist jederzeit möglich.\n\n' +
  'Datenschutz: ' + DATENSCHUTZ;

/** Nur ein Gruß ohne Anliegen? Dann reicht die Begrüßung mit den zwei Wegen. */
export function istKurzgruss(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[!.?,😊👋🙂]+/gu, '').trim();
  if (t.length === 0) return true;
  if (t.length > 30) return false;
  return /^(hi|hallo+|hey|moin( moin)?|servus|grüß gott|gruess gott|guten (tag|morgen|abend)|hello|test( \d+)?|info|infos)$/.test(t);
}

/** Text, den die KI für eine Nachricht sieht (auch bei Medien ohne Text). */
export function textFuerKi(n) {
  const t = String((n && n.text) || '').trim();
  const typ = (n && n.typ) || 'text';
  if (typ === 'text' || typ === 'interactive' || typ === 'button') return t;
  const art = { image: 'Bild', audio: 'Sprachnachricht', video: 'Video', document: 'Dokument', sticker: 'Sticker', location: 'Standort', contacts: 'Kontakt', reaction: 'Reaktion' }[typ] || 'Nachricht';
  return '[' + art + (t ? ': ' + t : ' ohne Text') + ']';
}

/**
 * Weg bestimmen: still | befehl | team | kunde
 * e = { nachricht, eingang, konv, team, testmodus, testNummern, verlauf }
 */
export function wegBestimmen(e) {
  const n = e.nachricht || {};
  const konv = e.konv || {};
  const team = e.team && e.team.mitglied_id ? e.team : null;
  const wa = String(n.kontakt_extern || '').replace(/\D/g, '');
  const text = String(n.text || '').trim();
  const basis = { konversation_id: n.konversation_id, wa, nachricht_id: n.nachricht_id, team };
  if (!wa || !n.konversation_id) return { ...basis, weg: 'still', grund: 'unvollständig' };
  // Neuere Kundennachricht vorhanden? Dann antwortet der spätere Lauf auf alles zusammen.
  const neuer = (e.verlauf || []).some(v => v.richtung === 'ein' && v.nachricht_id !== n.nachricht_id && String(v.zeit) > String(n.zeit));
  if (neuer) return { ...basis, weg: 'still', grund: 'neuere Nachricht folgt' };
  if (team && /^\/(kunde|team)$/i.test(text)) return { ...basis, weg: 'befehl', ansicht: text.toLowerCase() === '/kunde' ? 'kunde' : null };
  if (konv.modus === 'mensch') return { ...basis, weg: 'still', grund: 'Mensch hat übernommen' };
  if (team && konv.ansicht !== 'kunde') return { ...basis, weg: 'team' };
  if (e.testmodus && !(e.testNummern || []).includes(wa)) return { ...basis, weg: 'still', grund: 'Testmodus' };
  return { ...basis, weg: 'kunde' };
}

/** Verlauf aus kom_nachrichten (neueste zuerst) → Chat-Nachrichten in zeitlicher Reihenfolge. */
export function verlaufAlsChat(verlauf, ohneId, max) {
  return (verlauf || []).filter(v => v && v.nachricht_id !== ohneId).slice(0, max || 20).reverse()
    .map(v => ({ role: v.richtung === 'ein' ? 'user' : 'assistant', content: v.richtung === 'ein' ? textFuerKi(v) : String(v.text || '') }))
    .filter(m => m.content);
}

/** Anfrage an das Sprachmodell für den Kunden-Bot. */
export function kundenAnfrage(promptVorlage, wissen, e) {
  const n = e.nachricht || {};
  const erst = !!(e.eingang && e.eingang.erstkontakt);
  const ersetzen = {
    kanal: 'WhatsApp',
    kontakt_name: n.kontakt_name || 'unbekannt',
    erstkontakt: erst
      ? 'ja – das ist die erste Nachricht. Stell dich am Anfang in einem kurzen Satz als KI-Assistent von HermetikFlow (Momentum KI Akademie & Hermetik Marketing) vor und nenne am Ende den Datenschutzhinweis ' + DATENSCHUTZ + '.'
      : 'nein',
    marke: (e.konv && e.konv.marke) || 'offen',
    verlauf: '(siehe Chatverlauf)'
  };
  const system = String(promptVorlage).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in ersetzen ? ersetzen[k] : m)) + '\n\n---\n\n# WISSENSBASIS\n\n' + wissen;
  const messages = [{ role: 'system', content: system }].concat(verlaufAlsChat(e.verlauf, null, 20));
  if (!messages.some(m => m.role === 'user')) messages.push({ role: 'user', content: textFuerKi(n) || 'Hallo' });
  return { model: 'gpt-5-mini', reasoning_effort: 'low', max_completion_tokens: 2500, response_format: { type: 'json_object' }, messages };
}

const PREIS = /(\d[\d.,]*\s?(€|eur\b|euro))|((€|eur)\s?\d)/i;

/** Antwort des Modells prüfen und in eine sendefertige Nachricht verwandeln. */
export function antwortPruefen(roh, wa) {
  let a = {};
  try {
    const c = roh && roh.choices && roh.choices[0] && roh.choices[0].message ? roh.choices[0].message.content : '';
    const m = String(c || '').match(/\{[\s\S]*\}/);
    a = m ? JSON.parse(m[0]) : {};
  } catch (err) { a = {}; }
  let text = String(a.antwort || '').trim().replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '');
  const meta = {
    marke: ['momentum', 'hermetik', 'offen'].includes(a.marke) ? a.marke : 'offen',
    absicht: String(a.absicht || ''), phase: String(a.phase || ''),
    termin_link: String(a.termin_link || 'keiner'),
    uebergabe: a.uebergabe === true, uebergabe_grund: String(a.uebergabe_grund || '').slice(0, 200),
    zusammenfassung: String(a.zusammenfassung || '').slice(0, 500),
    qualifizierung: a.qualifizierung && typeof a.qualifizierung === 'object' ? a.qualifizierung : {},
    pruefung: 'ok'
  };
  if (!text) {
    text = 'Danke für deine Nachricht! Ich gebe sie an unser Team weiter, es meldet sich innerhalb eines Werktags bei dir. Schneller geht es über einen Termin: ' + BUCHUNG_KARSTEN;
    meta.uebergabe = true; meta.uebergabe_grund = 'KI-Antwort leer oder ungültig'; meta.pruefung = 'ersatz';
  } else if (PREIS.test(text)) {
    text = 'Konkrete Kosten und den Eigenanteil kann ich hier nicht nennen, die hängen von deinem Betrieb und der Förderung ab. Karsten prüft das im Fördervorgespräch genau: ' + BUCHUNG_KARSTEN;
    meta.pruefung = 'preis_entfernt';
  }
  if (text.length > 1500) text = text.slice(0, 1500).replace(/\s+\S*$/, '') + ' …';
  let buttons = Array.isArray(a.buttons) ? a.buttons.map(b => String(b || '').trim()).filter(b => b && b.length <= 20).slice(0, 3) : [];
  if (text.length > 1024) buttons = [];
  return { art: 'kunde', to: wa, text, buttons, meta };
}

/** Begrüßung mit den zwei Wegen als Antwort-Buttons. */
export function begruessung(wa) {
  return { art: 'kunde', to: wa, text: BEGRUESSUNG, buttons: ['Umsetzung', 'Mitarbeiterschulung'], meta: { marke: 'offen', phase: 'einstieg', zusammenfassung: '', uebergabe: false, pruefung: 'begruessung' } };
}

/** Cloud-API-Nachricht bauen (Text oder Antwort-Buttons). */
export function waNachricht(p) {
  const basis = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(p.to) };
  if (p.buttons && p.buttons.length) {
    return { ...basis, type: 'interactive', interactive: { type: 'button', body: { text: String(p.text).slice(0, 1024) },
      action: { buttons: p.buttons.map((t, i) => ({ type: 'reply', reply: { id: 'b' + (i + 1) + '_' + t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_').slice(0, 40), title: t } })) } } };
  }
  return { ...basis, type: 'text', text: { preview_url: true, body: String(p.text).slice(0, 4096) } };
}

/** Ergebnis der Cloud API auswerten. */
export function versandAuswerten(r) {
  const code = Number(r && r.statusCode || 0);
  const b = (r && r.body) || {};
  const id = b.messages && b.messages[0] && b.messages[0].id;
  if (code >= 200 && code < 300 && id) return { ok: true, nachricht_id: String(id), fehler: null };
  const f = b.error || {};
  return { ok: false, nachricht_id: 'fehler-' + Date.now(), fehler: { code: f.code || code, titel: f.message || 'Versand fehlgeschlagen', details: (f.error_data && f.error_data.details) || null } };
}
