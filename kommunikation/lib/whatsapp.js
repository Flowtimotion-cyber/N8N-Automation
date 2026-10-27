// Kommunikation: WhatsApp-Cloud-API-Webhook in ein einheitliches Format bringen.
// Läuft unverändert im n8n-Code-Knoten (wird von kommunikation/n8n/bauen.mjs eingebettet) und in Node (Tests).
// Keine Netzwerkzugriffe, kein require. Signaturprüfung macht Supabase (kom_wa_signatur_ok), nicht dieser Code.

const TYPEN_MIT_MEDIEN = ['image', 'audio', 'video', 'document', 'sticker'];
const STATUS = { sent: 'gesendet', delivered: 'zugestellt', read: 'gelesen', failed: 'fehlgeschlagen' };

/** wa_id (nur Ziffern, mit Ländervorwahl) → E.164 mit „+“. Ungültiges → null. */
export function e164(waId) {
  const z = String(waId || '').replace(/\D/g, '');
  return z.length >= 8 && z.length <= 15 ? '+' + z : null;
}

/** Unix-Sekunden von Meta → ISO-Zeit. Fehlt der Wert, gilt die Empfangszeit. */
export function zeit(sekunden, jetzt) {
  const n = Number(sekunden);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date(jetzt || Date.now()).toISOString();
}

/** Text und Medien einer eingehenden Nachricht lesen, je nach Typ. */
export function inhalt(m) {
  const typ = String(m.type || 'unsupported');
  if (typ === 'text') return { typ, text: String((m.text && m.text.body) || ''), medien: null };
  if (typ === 'interactive') {
    const i = m.interactive || {};
    const r = i.button_reply || i.list_reply || i.nfm_reply || {};
    return { typ, text: String(r.title || r.body || ''), medien: { auswahl_id: r.id || null, art: i.type || null } };
  }
  if (typ === 'button') return { typ, text: String((m.button && m.button.text) || ''), medien: { payload: (m.button && m.button.payload) || null } };
  if (TYPEN_MIT_MEDIEN.includes(typ)) {
    const d = m[typ] || {};
    return { typ, text: String(d.caption || ''), medien: { id: d.id || null, mime_type: d.mime_type || null, dateiname: d.filename || null, sha256: d.sha256 || null } };
  }
  if (typ === 'location') {
    const l = m.location || {};
    return { typ, text: [l.name, l.address].filter(Boolean).join(', '), medien: { lat: l.latitude, lon: l.longitude } };
  }
  if (typ === 'reaction') return { typ, text: String((m.reaction && m.reaction.emoji) || ''), medien: { auf: (m.reaction && m.reaction.message_id) || null } };
  if (typ === 'contacts') return { typ, text: '[Kontakt geteilt]', medien: { anzahl: Array.isArray(m.contacts) ? m.contacts.length : 0 } };
  return { typ: 'unsupported', text: '', medien: { original_typ: typ } };
}

/** Click-to-WhatsApp-Referral nur übernehmen, wenn Meta es wirklich mitschickt (keine erfundene Attribution). */
export function quelle(m) {
  const r = m && m.referral;
  if (!r || typeof r !== 'object') return null;
  const q = {};
  for (const k of ['source_type', 'source_id', 'source_url', 'headline', 'ctwa_clid']) if (r[k]) q[k] = String(r[k]);
  return Object.keys(q).length ? q : null;
}

/**
 * Webhook-Body → { nachrichten, status, ignoriert }.
 * Nur Änderungen für die eigene Nummer (phoneNumberId) werden übernommen; alles andere zählt als ignoriert.
 */
export function normalisiere(body, phoneNumberId, jetzt) {
  const out = { nachrichten: [], status: [], ignoriert: 0 };
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) { out.ignoriert++; return out; }
  for (const e of body.entry) {
    for (const c of (e && Array.isArray(e.changes) ? e.changes : [])) {
      const v = (c && c.value) || {};
      const nummer = v.metadata && String(v.metadata.phone_number_id || '');
      if (!c || c.field !== 'messages' || !nummer || (phoneNumberId && nummer !== String(phoneNumberId))) { out.ignoriert++; continue; }
      const namen = {};
      for (const k of (Array.isArray(v.contacts) ? v.contacts : [])) if (k && k.wa_id) namen[String(k.wa_id)] = (k.profile && k.profile.name) || null;
      for (const m of (Array.isArray(v.messages) ? v.messages : [])) {
        if (!m || !m.id || !m.from) { out.ignoriert++; continue; }
        const von = String(m.from);
        const i = inhalt(m);
        out.nachrichten.push({
          art: 'nachricht',
          kanal: 'whatsapp',
          konversation_id: 'wa:' + von.replace(/\D/g, ''),
          kontakt_extern: von,
          kontakt_name: namen[von] || null,
          telefon_e164: e164(von),
          nachricht_id: String(m.id),
          antwort_auf: (m.context && m.context.id) || null,
          typ: i.typ,
          text: i.text.slice(0, 4096),
          medien: i.medien,
          quelle: quelle(m),
          zeit: zeit(m.timestamp, jetzt)
        });
      }
      for (const s of (Array.isArray(v.statuses) ? v.statuses : [])) {
        const st = s && STATUS[s.status];
        if (!s || !s.id || !st) { out.ignoriert++; continue; }
        const fehler = Array.isArray(s.errors) && s.errors.length
          ? s.errors.map(f => ({ code: f.code, titel: f.title || null, details: (f.error_data && f.error_data.details) || f.message || null }))
          : null;
        out.status.push({ art: 'status', nachricht_id: String(s.id), status: st, fehler, zeit: zeit(s.timestamp, jetzt) });
      }
    }
  }
  return out;
}
