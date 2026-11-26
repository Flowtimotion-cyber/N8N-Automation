// SOCIAL: Video hochladen (intern)
// Stellt der Video-Pipeline (.claude/skills/momentum-video-pipeline) eine einmalige Upload-Adresse für den
// öffentlichen Bucket „social-medien“ aus. Die Datei selbst geht NICHT durch n8n: Das Skript lädt sie mit der
// signierten Adresse direkt in den Speicher (gleiches Muster wie „TEAM: Social-Upload“). Der Aufrufer bekommt
// nie einen Supabase-Schlüssel.
//
// Schutz: Header-Auth am Webhook (n8n-Credential „SOCIAL Video-Upload“, legt Timo an; der Wert steht nirgends im Repo).
// Erlaubt: nur .mp4 und .jpg, höchstens 200 MB (angegebene Größe). Dateiname: <prefix>-<JJJJMMTT-HHMMSS>.<endung> (UTC).
// Nach dem Import in n8n: Fehler-Überwacher (errorWorkflow) in den Workflow-Einstellungen setzen, inaktiv lassen bis Timos OK.
//
// Anfrage:  POST /webhook/social-video-upload   { "prefix": "team-l3", "endung": "mp4", "groesse": 28593045 }
// Antwort:  { ok, upload_url, public_url, pfad, mime, gueltig_sek }   bzw.   { ok: false, fehler }
import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

const STORAGE = 'https://llhwmzhvhluamxwemaqx.supabase.co/storage/v1';
const BUCKET = 'social-medien';

const JS_PRUEFEN = `let b = $('Upload anfragen').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const MAX = 200 * 1024 * 1024;
const TYPEN = { mp4: 'video/mp4', jpg: 'image/jpeg' };
const prefix = String(b.prefix || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const endung = String(b.endung || '').toLowerCase().replace(/^\\./, '');
const groesse = Number(b.groesse);
const fehler = t => [{ json: { ok: false, code: 400, antwort: { ok: false, fehler: t } } }];
if (!prefix) return fehler('prefix fehlt (Kleinbuchstaben, Ziffern, Bindestrich).');
if (!TYPEN[endung]) return fehler('Nur .mp4 und .jpg sind erlaubt.');
if (!Number.isFinite(groesse) || groesse <= 0) return fehler('groesse fehlt (Bytes).');
if (groesse > MAX) return fehler('Datei ist größer als 200 MB.');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
return [{ json: { ok: true, pfad: prefix + '-' + stamp + '.' + endung, mime: TYPEN[endung], groesse } }];`;

const JS_ANTWORT = `const a = $('Anfrage prüfen').first().json;
const r = $input.first().json || {};
const STORAGE = ${JSON.stringify(STORAGE)};
const u = String(r.url || '');
if (!u) {
  const grund = r.message || (typeof r.error === 'string' ? r.error : (r.error && r.error.message) || '');
  return [{ json: { code: 502, antwort: { ok: false, fehler: 'Der Speicher hat keine Upload-Adresse ausgestellt' + (grund ? ': ' + grund : '.') } } }];
}
const upload_url = /^https?:\\/\\//.test(u) ? u : STORAGE + '/' + u.replace(/^\\/+/, '');
return [{ json: { code: 200, antwort: { ok: true, upload_url, public_url: STORAGE + '/object/public/${BUCKET}/' + encodeURIComponent(a.pfad), pfad: '${BUCKET}/' + a.pfad, mime: a.mime, gueltig_sek: 7200 } } }];`;

const eingang = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Upload anfragen',
    parameters: { httpMethod: 'POST', path: 'social-video-upload', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
    credentials: { httpHeaderAuth: newCredential('SOCIAL Video-Upload') },
  },
});

const pruefen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Anfrage prüfen', parameters: { mode: 'runOnceForAllItems', jsCode: JS_PRUEFEN } },
});

const inOrdnung = ifElse({
  version: 2.2,
  config: {
    name: 'Anfrage in Ordnung?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});

const signieren = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Upload-Adresse signieren',
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      method: 'POST',
      url: expr(`${STORAGE}/object/upload/sign/${BUCKET}/{{ encodeURIComponent($json.pfad) }}`),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{}',
      options: { timeout: 20000 },
    },
    credentials: { supabaseApi: newCredential('Supabase account') },
  },
});

const antwortBauen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Antwort bauen', parameters: { mode: 'runOnceForAllItems', jsCode: JS_ANTWORT } },
});

const antwort = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Antwort senden',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.antwort) }}'), options: { responseCode: expr('{{ $json.code }}') } },
  },
});

export default workflow('social-video-hochladen', 'SOCIAL: Video hochladen (intern)')
  .add(eingang)
  .to(pruefen)
  .to(inOrdnung
    .onTrue(signieren.to(antwortBauen).to(antwort))
    .onFalse(antwort));
