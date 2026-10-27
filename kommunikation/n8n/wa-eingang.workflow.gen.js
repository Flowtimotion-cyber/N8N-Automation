// KOM: WhatsApp Eingang (Workflow A) – Vorlage für @n8n/workflow-sdk. Erzeugen mit: node kommunikation/n8n/bauen.mjs
// Auftrag „WhatsApp, n8n, Hermes, Website-Chat und Teamportal“ Abschnitt 5/6, Stand 26.10.2026.
//
// GET  /webhook/wa-eingang  Meta-Verifizierung: hub.mode=subscribe und hub.verify_token gegen Supabase (kom_wa_verify_ok) → hub.challenge, sonst 403.
// POST /webhook/wa-eingang  1) roher Body + X-Hub-Signature-256 → Supabase prüft HMAC mit dem App-Secret (kom_wa_signatur_ok). Ungültig → 401.
//                           2) Gültig → sofort 200 an Meta (sonst wiederholt Meta die Zustellung).
//                           3) Normalisieren (nur eigene phone_number_id), je Nachricht kom_eingang (idempotent über wamid), je Status kom_status.
//                           4) Nur neue Nachrichten gehen weiter zu Workflow B (KI-Antwort) bzw. E (Übergabe) – Anschluss folgt.
// Geheimnisse (App-Secret, Verify-Token) liegen nur in Supabase (kom_einstellungen) und erscheinen nie in einer n8n-Ausführung.
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const SUPABASE = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const supabase = { supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } };
// Supabase-RPC-Knoten werden von bauen.mjs aus RPC('Name', 'funktion', expr(...)) ausgeschrieben (SDK erlaubt keine eigenen Funktionen).

// ---------- GET: Verifizierung ----------
const verifizierung = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'WA Verifizierung (GET)', parameters: { httpMethod: 'GET', path: 'wa-eingang', responseMode: 'responseNode', options: {} } }
});
const tokenPruefen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Verify-Token prüfen',
    parameters: {
      method: 'POST', url: SUPABASE + 'rpc/kom_wa_verify_ok',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ token: String($json.query["hub.verify_token"] || "") }) }}'),
      options: { timeout: 15000 }
    },
    credentials: supabase,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000
  }
});
const tokenOk = ifElse({
  version: 2.2,
  config: {
    name: 'Token und Modus ok?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } },
          { leftValue: expr('{{ $("WA Verifizierung (GET)").first().json.query["hub.mode"] }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'subscribe' }
        ],
        combinator: 'and'
      }
    }
  }
});
const challenge = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Challenge zurück', parameters: { respondWith: 'text', responseBody: expr('{{ String($("WA Verifizierung (GET)").first().json.query["hub.challenge"] || "") }}'), options: { responseCode: 200 } } }
});
const verboten = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: '403 Verifizierung', parameters: { respondWith: 'text', responseBody: 'forbidden', options: { responseCode: 403 } } }
});

// ---------- POST: Nachrichten und Status ----------
const eingang = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'WA Eingang (POST)', parameters: { httpMethod: 'POST', path: 'wa-eingang', responseMode: 'responseNode', options: { rawBody: true } } }
});
const einstellungen = node({
  type: 'n8n-nodes-base.set', version: 3.4,
  config: {
    name: 'Einstellungen',
    parameters: {
      mode: 'manual', includeOtherFields: false,
      assignments: { assignments: [
        { id: 'pnid', name: 'phone_number_id', value: '1412160901975864', type: 'string' },
        { id: 'waba', name: 'waba_id', value: '1681755303343172', type: 'string' }
      ] }
    }
  }
});
const rohdaten = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Rohdaten lesen',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `// Roher Body (für die HMAC-Prüfung byte-genau) und Signatur-Header. Ohne Rohdaten bleibt roh leer → Prüfung schlägt fehl.
// Die Binärdaten hängen am Webhook-Eintrag (nicht am Eingang dieses Knotens), deshalb direkt von dort dekodieren.
const it = $('WA Eingang (POST)').first();
const h = it.json.headers || {};
const b = it.binary && it.binary.data;
let roh = '';
if (b) {
  if (b.id) throw new Error('Rohdaten liegen im n8n-Dateispeicher (binaryDataMode filesystem/s3). Knoten "Rohdaten lesen" muss dann per Helper lesen.');
  roh = Buffer.from(String(b.data || ''), 'base64').toString('utf8');
}
return [{ json: { roh, signatur: String(h['x-hub-signature-256'] || '') } }];`
    }
  }
});
const signaturPruefen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Signatur prüfen',
    parameters: {
      method: 'POST', url: SUPABASE + 'rpc/kom_wa_signatur_ok',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ roh: $json.roh, signatur: $json.signatur }) }}'),
      options: { timeout: 15000 }
    },
    credentials: supabase,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000
  }
});
const signaturOk = ifElse({
  version: 2.2,
  config: {
    name: 'Signatur gültig?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});
const ok200 = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: '200 an Meta', parameters: { respondWith: 'text', responseBody: 'EVENT_RECEIVED', options: { responseCode: 200 } } }
});
const abgelehnt = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: '401 Signatur', parameters: { respondWith: 'text', responseBody: 'invalid signature', options: { responseCode: 401 } } }
});
const normalisieren = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Normalisieren', parameters: { mode: 'runOnceForAllItems', jsCode: "// GENERIERT von kommunikation/n8n/bauen.mjs aus kommunikation/lib/whatsapp.js – nicht von Hand ändern.\n// Kommunikation: WhatsApp-Cloud-API-Webhook in ein einheitliches Format bringen.\n// Läuft unverändert im n8n-Code-Knoten (wird von kommunikation/n8n/bauen.mjs eingebettet) und in Node (Tests).\n// Keine Netzwerkzugriffe, kein require. Signaturprüfung macht Supabase (kom_wa_signatur_ok), nicht dieser Code.\n\nconst TYPEN_MIT_MEDIEN = ['image', 'audio', 'video', 'document', 'sticker'];\nconst STATUS = { sent: 'gesendet', delivered: 'zugestellt', read: 'gelesen', failed: 'fehlgeschlagen' };\n\n/** wa_id (nur Ziffern, mit Ländervorwahl) → E.164 mit „+“. Ungültiges → null. */\nfunction e164(waId) {\n  const z = String(waId || '').replace(/\\D/g, '');\n  return z.length >= 8 && z.length <= 15 ? '+' + z : null;\n}\n\n/** Unix-Sekunden von Meta → ISO-Zeit. Fehlt der Wert, gilt die Empfangszeit. */\nfunction zeit(sekunden, jetzt) {\n  const n = Number(sekunden);\n  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date(jetzt || Date.now()).toISOString();\n}\n\n/** Text und Medien einer eingehenden Nachricht lesen, je nach Typ. */\nfunction inhalt(m) {\n  const typ = String(m.type || 'unsupported');\n  if (typ === 'text') return { typ, text: String((m.text && m.text.body) || ''), medien: null };\n  if (typ === 'interactive') {\n    const i = m.interactive || {};\n    const r = i.button_reply || i.list_reply || i.nfm_reply || {};\n    return { typ, text: String(r.title || r.body || ''), medien: { auswahl_id: r.id || null, art: i.type || null } };\n  }\n  if (typ === 'button') return { typ, text: String((m.button && m.button.text) || ''), medien: { payload: (m.button && m.button.payload) || null } };\n  if (TYPEN_MIT_MEDIEN.includes(typ)) {\n    const d = m[typ] || {};\n    return { typ, text: String(d.caption || ''), medien: { id: d.id || null, mime_type: d.mime_type || null, dateiname: d.filename || null, sha256: d.sha256 || null } };\n  }\n  if (typ === 'location') {\n    const l = m.location || {};\n    return { typ, text: [l.name, l.address].filter(Boolean).join(', '), medien: { lat: l.latitude, lon: l.longitude } };\n  }\n  if (typ === 'reaction') return { typ, text: String((m.reaction && m.reaction.emoji) || ''), medien: { auf: (m.reaction && m.reaction.message_id) || null } };\n  if (typ === 'contacts') return { typ, text: '[Kontakt geteilt]', medien: { anzahl: Array.isArray(m.contacts) ? m.contacts.length : 0 } };\n  return { typ: 'unsupported', text: '', medien: { original_typ: typ } };\n}\n\n/** Click-to-WhatsApp-Referral nur übernehmen, wenn Meta es wirklich mitschickt (keine erfundene Attribution). */\nfunction quelle(m) {\n  const r = m && m.referral;\n  if (!r || typeof r !== 'object') return null;\n  const q = {};\n  for (const k of ['source_type', 'source_id', 'source_url', 'headline', 'ctwa_clid']) if (r[k]) q[k] = String(r[k]);\n  return Object.keys(q).length ? q : null;\n}\n\n/**\n * Webhook-Body → { nachrichten, status, ignoriert }.\n * Nur Änderungen für die eigene Nummer (phoneNumberId) werden übernommen; alles andere zählt als ignoriert.\n */\nfunction normalisiere(body, phoneNumberId, jetzt) {\n  const out = { nachrichten: [], status: [], ignoriert: 0 };\n  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) { out.ignoriert++; return out; }\n  for (const e of body.entry) {\n    for (const c of (e && Array.isArray(e.changes) ? e.changes : [])) {\n      const v = (c && c.value) || {};\n      const nummer = v.metadata && String(v.metadata.phone_number_id || '');\n      if (!c || c.field !== 'messages' || !nummer || (phoneNumberId && nummer !== String(phoneNumberId))) { out.ignoriert++; continue; }\n      const namen = {};\n      for (const k of (Array.isArray(v.contacts) ? v.contacts : [])) if (k && k.wa_id) namen[String(k.wa_id)] = (k.profile && k.profile.name) || null;\n      for (const m of (Array.isArray(v.messages) ? v.messages : [])) {\n        if (!m || !m.id || !m.from) { out.ignoriert++; continue; }\n        const von = String(m.from);\n        const i = inhalt(m);\n        out.nachrichten.push({\n          art: 'nachricht',\n          kanal: 'whatsapp',\n          konversation_id: 'wa:' + von.replace(/\\D/g, ''),\n          kontakt_extern: von,\n          kontakt_name: namen[von] || null,\n          telefon_e164: e164(von),\n          nachricht_id: String(m.id),\n          antwort_auf: (m.context && m.context.id) || null,\n          typ: i.typ,\n          text: i.text.slice(0, 4096),\n          medien: i.medien,\n          quelle: quelle(m),\n          zeit: zeit(m.timestamp, jetzt)\n        });\n      }\n      for (const s of (Array.isArray(v.statuses) ? v.statuses : [])) {\n        const st = s && STATUS[s.status];\n        if (!s || !s.id || !st) { out.ignoriert++; continue; }\n        const fehler = Array.isArray(s.errors) && s.errors.length\n          ? s.errors.map(f => ({ code: f.code, titel: f.title || null, details: (f.error_data && f.error_data.details) || f.message || null }))\n          : null;\n        out.status.push({ art: 'status', nachricht_id: String(s.id), status: st, fehler, zeit: zeit(s.timestamp, jetzt) });\n      }\n    }\n  }\n  return out;\n}\n\n// ===== Knoten: Webhook-Body normalisieren =====\nconst E = $('Einstellungen').first().json;\nlet body;\ntry { body = JSON.parse($('Rohdaten lesen').first().json.roh); } catch (e) { return []; }\nconst r = normalisiere(body, E.phone_number_id, Date.now());\nreturn [...r.nachrichten, ...r.status].map(x => ({ json: x }));\n" } }
});
const art = switchCase({
  version: 3.2,
  config: {
    name: 'Nachricht oder Status?',
    parameters: {
      rules: { values: [
        { outputKey: 'nachricht', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.art }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'nachricht' }], combinator: 'and' } },
        { outputKey: 'status', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.art }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'status' }], combinator: 'and' } }
      ] },
      options: {}
    }
  }
});
const speichern = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Nachricht speichern (kom_eingang)',
    parameters: {
      method: 'POST', url: SUPABASE + 'rpc/kom_eingang',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ p: $json }) }}'),
      options: { timeout: 15000 }
    },
    credentials: supabase,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000
  }
});
const statusSpeichern = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Status speichern (kom_status)',
    parameters: {
      method: 'POST', url: SUPABASE + 'rpc/kom_status',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ p: $json }) }}'),
      options: { timeout: 15000 }
    },
    credentials: supabase,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000
  }
});
const neu = ifElse({
  version: 2.2,
  config: {
    name: 'Neue Nachricht?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.neu }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});
const weiter = node({
  type: 'n8n-nodes-base.noOp', version: 1,
  config: { name: 'Weiter an Workflow B (folgt)' }
});
const duplikat = node({
  type: 'n8n-nodes-base.noOp', version: 1,
  config: { name: 'Duplikat – nichts tun' }
});

export default workflow('kom-wa-eingang', 'KOM: WhatsApp Eingang (Workflow A)')
  .add(verifizierung).to(tokenPruefen).to(tokenOk.onTrue(challenge).onFalse(verboten))
  .add(eingang).to(einstellungen).to(rohdaten).to(signaturPruefen)
  .to(signaturOk
    .onTrue(ok200.to(normalisieren).to(art
      .onCase(0, speichern.to(neu.onTrue(weiter).onFalse(duplikat)))
      .onCase(1, statusSpeichern)))
    .onFalse(abgelehnt));
