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
const tokenPruefen = RPC('Verify-Token prüfen', 'kom_wa_verify_ok', expr('{{ JSON.stringify({ token: String($json.query["hub.verify_token"] || "") }) }}'));
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
const signaturPruefen = RPC('Signatur prüfen', 'kom_wa_signatur_ok', expr('{{ JSON.stringify({ roh: $json.roh, signatur: $json.signatur }) }}'));
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
  config: { name: 'Normalisieren', parameters: { mode: 'runOnceForAllItems', jsCode: '__CODE_NORMALISIEREN__' } }
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
const speichern = RPC('Nachricht speichern (kom_eingang)', 'kom_eingang', expr('{{ JSON.stringify({ p: $json }) }}'));
const statusSpeichern = RPC('Status speichern (kom_status)', 'kom_status', expr('{{ JSON.stringify({ p: $json }) }}'));
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
