// Kommunikation: Logik der WhatsApp-Inbox im Team-Portal (n8n „TEAM: WhatsApp-Inbox (Portal)“).
// Läuft im n8n-Code-Knoten (eingebettet von bauen-inbox.mjs) und in Node (Tests). Kein Netzwerk, kein require.

const INBOX_ROLLEN = ['admin', 'dozent', 'vertrieb'];
const INBOX_AKTIONEN = ['liste', 'verlauf', 'senden', 'modus', 'status'];
const FENSTER_MS = 24 * 60 * 60 * 1000;

/** Anfrage aus dem Portal prüfen. ich = Zeile aus team_mitglieder (oder null). */
export function inboxAnfrage(ich, aktion, daten) {
  const d = daten && typeof daten === 'object' ? daten : {};
  if (!ich || !ich.mitglied_id || ich.status === 'gesperrt' || ich.typ === 'agent') return { aktion: 'fehler', code: 401, antwort: { ok: false, fehler: 'Dein Zugang ist ungültig. Bitte lade das Portal neu.' } };
  // Automatische WhatsApp zu einer Aufgabe abwählen: darf jedes aktive Teammitglied (wer zuweist, entscheidet).
  if (aktion === 'benachrichtigung_aus') {
    const aid = String(d.aufgabe_id || '');
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(aid)) return { aktion: 'fehler', code: 400, antwort: { ok: false, fehler: 'Aufgabe nicht gefunden.' } };
    return { aktion, aufgabe_id: aid, wer: 'mitglied:' + ich.mitglied_id, mitglied_id: ich.mitglied_id };
  }
  if (!INBOX_ROLLEN.includes(ich.rolle)) return { aktion: 'fehler', code: 403, antwort: { ok: false, fehler: 'Die WhatsApp-Inbox sehen Timo, die Dozenten und das Vertriebsteam.' } };
  if (!INBOX_AKTIONEN.includes(aktion)) return { aktion: 'fehler', code: 400, antwort: { ok: false, fehler: 'Unbekannte Aktion.' } };
  const konv = String(d.konversation_id || '');
  if (aktion !== 'liste' && !/^(wa|ig|web):[A-Za-z0-9_.-]{3,80}$/.test(konv)) return { aktion: 'fehler', code: 400, antwort: { ok: false, fehler: 'Gespräch nicht gefunden.' } };
  const r = { aktion, konversation_id: konv, wer: 'mitglied:' + ich.mitglied_id, mitglied_id: ich.mitglied_id, name: ich.name || '' };
  if (aktion === 'senden') r.text = String(d.text || '').replace(/\r\n/g, '\n').trim();
  if (aktion === 'modus') r.modus = d.modus === 'ki' ? 'ki' : 'mensch';
  if (aktion === 'status') r.status = d.status === 'erledigt' ? 'erledigt' : 'offen';
  return r;
}

/** Kurztext einer Nachricht für Liste und Verlauf. */
export function nachrichtKurz(n) {
  const t = String((n && n.text) || '').trim();
  const typ = (n && n.typ) || 'text';
  if (typ === 'text' || typ === 'interactive' || typ === 'button') return t;
  const art = { image: '📷 Bild', audio: '🎤 Sprachnachricht', video: '🎬 Video', document: '📄 Dokument', sticker: 'Sticker', location: '📍 Standort', contacts: 'Kontakt', reaction: 'Reaktion' }[typ] || 'Nachricht';
  return art + (t ? ': ' + t : '');
}

/** Ist das 24-Stunden-Fenster offen (freie Antworten erlaubt)? */
export function fensterOffen(letzteKundeAm, jetzt) {
  const t = Date.parse(letzteKundeAm || '');
  if (!t) return false;
  return (Number(jetzt) || Date.now()) - t < FENSTER_MS;
}

/** Gesprächsliste: Konversationen + letzte Nachrichten (neueste zuerst) → sortierte Liste. */
export function inboxListe(konvs, nachrichten, jetzt) {
  const letzte = {}, ungelesen = {}, gesehenAus = {};
  for (const n of nachrichten || []) {
    if (!n || !n.konversation_id) continue;
    const k = n.konversation_id;
    if (!letzte[k]) letzte[k] = n;
    if (n.richtung === 'aus') gesehenAus[k] = true;
    else if (!gesehenAus[k]) ungelesen[k] = (ungelesen[k] || 0) + 1;   // Kundennachrichten seit unserer letzten Antwort
  }
  return (konvs || []).filter(c => c && c.konversation_id).map(c => {
    const l = letzte[c.konversation_id];
    return {
      id: c.konversation_id, kanal: c.kanal, name: c.kontakt_name || '', telefon: c.telefon_e164 || (c.kanal === 'whatsapp' ? '+' + c.kontakt_extern : ''),
      marke: c.marke, modus: c.modus, status: c.status, zugewiesen: c.zugewiesen || null, zusammenfassung: c.zusammenfassung || '',
      fenster: fensterOffen(c.letzte_kunde_am, jetzt), letzte_kunde_am: c.letzte_kunde_am || null,
      letzte: l ? { text: nachrichtKurz(l).slice(0, 140), richtung: l.richtung, absender: l.absender, zeit: l.zeit } : null,
      zeit: (l && l.zeit) || c.letzte_kunde_am || c.erstellt || '',
      offen: c.modus === 'mensch' && c.status !== 'erledigt' ? (ungelesen[c.konversation_id] || 0) : 0,
      wartet: (ungelesen[c.konversation_id] || 0)
    };
  }).sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
}

/** Verlauf einer Konversation (aufsteigend) für das Chatfenster. */
export function inboxVerlauf(konv, nachrichten, jetzt) {
  const c = konv || {};
  return {
    gespraech: { id: c.konversation_id, kanal: c.kanal, name: c.kontakt_name || '', telefon: c.telefon_e164 || (c.kanal === 'whatsapp' && c.kontakt_extern ? '+' + c.kontakt_extern : ''), marke: c.marke, modus: c.modus, status: c.status, zusammenfassung: c.zusammenfassung || '', fenster: fensterOffen(c.letzte_kunde_am, jetzt), letzte_kunde_am: c.letzte_kunde_am || null },
    nachrichten: (nachrichten || []).filter(n => n && n.nachricht_id).map(n => ({ id: n.nachricht_id, richtung: n.richtung, absender: n.absender, typ: n.typ, text: nachrichtKurz(n), status: n.status, zeit: n.zeit }))
  };
}

/** Darf diese Antwort aus dem Portal raus? Liefert den Cloud-API-Body. */
export function sendenPruefen(konv, text, jetzt) {
  if (!konv || !konv.konversation_id) return { ok: false, fehler: 'Gespräch nicht gefunden.' };
  if (konv.kanal !== 'whatsapp') return { ok: false, fehler: 'Antworten aus dem Portal gehen bisher nur bei WhatsApp. Instagram bitte in der Instagram-App beantworten.' };
  if (!text) return { ok: false, fehler: 'Die Nachricht ist leer.' };
  if (text.length > 4000) return { ok: false, fehler: 'Die Nachricht ist zu lang (höchstens 4000 Zeichen).' };
  if (!fensterOffen(konv.letzte_kunde_am, jetzt)) return { ok: false, fehler: 'Die letzte Nachricht des Kontakts ist älter als 24 Stunden. WhatsApp erlaubt dann nur genehmigte Vorlagen, freie Antworten sind gesperrt.' };
  return { ok: true, wa_body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(konv.kontakt_extern), type: 'text', text: { preview_url: true, body: text } } };
}
