import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, splitInBatches, nextBatch, expr } from '@n8n/workflow-sdk';

const supabaseCred = { supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } };
const telegramCred = { telegramApi: { id: 'hZktbgIoaHaiDLB7', name: 'Telegram Dialyse' } };
const instaCred = { httpBearerAuth: newCredential('Instagram Momentum') };

const alle15 = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Alle 15 Minuten', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, position: [0, 0] },
  output: [{}]
});

const manuell = trigger({
  type: 'n8n-nodes-base.manualTrigger', version: 1,
  config: { name: 'Manuell testen', position: [0, 200] },
  output: [{}]
});

const faellige = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Fällige Beiträge holen (sperrt sie)',
    parameters: {
      method: 'POST', url: 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/rpc/social_faellig',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: '{ "p_kanaele": ["Instagram"] }',
      options: { timeout: 20000 }
    },
    credentials: supabaseCred, position: [240, 100]
  },
  output: [{ post_id: 'p_test', thema: 'Test', text: 'Caption', hashtags: '#ki', format: 'Bild', medien: 'https://example.com/a.jpg', kanal: 'Instagram', datum: '2026-10-27', uhrzeit: '09:00', freigegeben_von: 'm_timo' }]
});

const einzeln = splitInBatches({ version: 3, config: { name: 'Beiträge einzeln', parameters: { batchSize: 1, options: {} }, position: [480, 100] } });

const planen = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Container planen',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: 
        "const p = $input.first().json;\n" +
        "const caption = [String(p.text || '').trim(), String(p.hashtags || '').trim()].filter(Boolean).join('\\n\\n').slice(0, 2200);\n" +
        "const medien = String(p.medien || '').split(/[\\s,]+/).filter(u => /^https:\\/\\//.test(u));\n" +
        "const istVideo = u => /\\.(mp4|mov)(\\?|$)/i.test(u);\n" +
        "const format = p.format || (medien.length > 1 ? 'Karussell' : (medien[0] && istVideo(medien[0]) ? 'Reel' : 'Bild'));\n" +
        "const basis = { post_id: p.post_id, thema: p.thema, format, caption };\n" +
        "const fehler = t => [{ json: { ...basis, fehler: t } }];\n" +
        "if (!p.freigegeben_von) return fehler('Keine Freigabe durch einen Menschen.');\n" +
        "if (!medien.length) return fehler('Instagram braucht mindestens ein Bild oder Video (Feld Medien, öffentliche https-URL).');\n" +
        "if (format === 'Reel') return [{ json: { ...basis, body: { media_type: 'REELS', video_url: medien[0], caption, share_to_feed: true } } }];\n" +
        "if (format === 'Karussell') {\n" +
        "  if (medien.length < 2 || medien.length > 10) return fehler('Ein Karussell braucht 2 bis 10 Medien, gefunden: ' + medien.length + '.');\n" +
        "  return medien.map(u => ({ json: { ...basis, body: istVideo(u) ? { media_type: 'VIDEO', video_url: u, is_carousel_item: true } : { image_url: u, is_carousel_item: true } } }));\n" +
        "}\n" +
        "if (format === 'Bild') return [{ json: { ...basis, body: { image_url: medien[0], caption } } }];\n" +
        "return fehler('Format ' + format + ' kann auf Instagram nicht gepostet werden.');"
    },
    position: [720, 100]
  },
  output: [{ post_id: 'p_test', thema: 'Test', format: 'Bild', caption: 'Caption', body: { image_url: 'https://example.com/a.jpg', caption: 'Caption' } }]
});

const planOk = ifElse({
  version: 2.2,
  config: {
    name: 'Plan in Ordnung?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.fehler || "" }}'), operator: { type: 'string', operation: 'empty', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    },
    position: [940, 100]
  }
});

const containerAnlegen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Instagram-Container anlegen',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST', url: 'https://graph.instagram.com/v25.0/me/media',
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 60000 }
    },
    credentials: instaCred, position: [1180, 0]
  },
  output: [{ id: '17900000000000001' }]
});

const hauptBestimmen = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Hauptcontainer bestimmen',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: 
        "const plan = $('Container planen').first().json;\n" +
        "const ids = $input.all().map(i => i.json.id).filter(Boolean);\n" +
        "if (plan.format === 'Karussell') return [{ json: { karussell: true, seit: Date.now(), body: { media_type: 'CAROUSEL', children: ids.join(','), caption: plan.caption } } }];\n" +
        "return [{ json: { karussell: false, seit: Date.now(), id: ids[0] } }];"
    },
    position: [1420, 0]
  },
  output: [{ karussell: false, seit: 1793000000000, id: '17900000000000001' }]
});

const istKarussell = ifElse({
  version: 2.2,
  config: {
    name: 'Karussell?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.karussell }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    },
    position: [1640, 0]
  }
});

const karussellAnlegen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Karussell-Container anlegen',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST', url: 'https://graph.instagram.com/v25.0/me/media',
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.body) }}'),
      options: { timeout: 60000 }
    },
    credentials: instaCred, position: [1860, -100]
  },
  output: [{ id: '17900000000000002' }]
});

const warten = node({
  type: 'n8n-nodes-base.wait', version: 1.1,
  config: { name: '15 Sekunden warten', parameters: { resume: 'timeInterval', amount: 15, unit: 'seconds' }, position: [2080, 0] },
  output: [{ id: '17900000000000001' }]
});

const statusPruefen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Verarbeitung prüfen',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET', url: expr('https://graph.instagram.com/v25.0/{{ $json.id }}?fields=id,status_code,status'),
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      options: { timeout: 30000 }
    },
    credentials: instaCred, position: [2300, 0]
  },
  output: [{ id: '17900000000000001', status_code: 'FINISHED' }]
});

const statusAuswerten = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Status auswerten',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: 
        "const s = $input.first().json;\n" +
        "const seit = $('Hauptcontainer bestimmen').first().json.seit || Date.now();\n" +
        "const code = String(s.status_code || '');\n" +
        "let aktion = 'warten';\n" +
        "if (code === 'FINISHED' || code === 'PUBLISHED') aktion = 'veroeffentlichen';\n" +
        "else if (code === 'ERROR' || code === 'EXPIRED') aktion = 'fehler';\n" +
        "else if (Date.now() - seit > 12 * 60 * 1000) aktion = 'fehler';\n" +
        "return [{ json: { id: s.id, status_code: code, aktion, fehler: aktion === 'fehler' ? ('Instagram-Verarbeitung: ' + (code || 'Zeitüberschreitung') + ' ' + (s.status || '')).trim() : '' } }];"
    },
    position: [2520, 0]
  },
  output: [{ id: '17900000000000001', status_code: 'FINISHED', aktion: 'veroeffentlichen', fehler: '' }]
});


const weiche = switchCase({
  version: 3.2,
  config: {
    name: 'Fertig, warten oder Fehler?',
    parameters: { rules: { values: [{
  outputKey: 'fertig',
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'veroeffentlichen' }],
    combinator: 'and'
  }
}, {
  outputKey: 'warten',
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'warten' }],
    combinator: 'and'
  }
}, {
  outputKey: 'fehler',
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr('{{ $json.aktion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fehler' }],
    combinator: 'and'
  }
}] }, options: {} },
    position: [2740, 0]
  }
});

const veroeffentlichen = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Auf Instagram veröffentlichen',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST', url: 'https://graph.instagram.com/v25.0/me/media_publish',
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ creation_id: $json.id }) }}'),
      options: { timeout: 60000 }
    },
    credentials: instaCred, position: [2980, -100]
  },
  output: [{ id: '18000000000000001' }]
});

const permalink = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Permalink holen',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET', url: expr('https://graph.instagram.com/v25.0/{{ $json.id }}?fields=id,permalink'),
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      options: { timeout: 30000 }
    },
    credentials: instaCred, position: [3200, -100]
  },
  output: [{ id: '18000000000000001', permalink: 'https://www.instagram.com/p/abc/' }]
});

const erledigtSpeichern = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Im Portal als veröffentlicht speichern',
    parameters: {
      method: 'POST', url: 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/rpc/social_erledigt',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_id: $("Container planen").first().json.post_id, p_plattform_id: $("Auf Instagram veröffentlichen").first().json.id, p_permalink: $json.permalink || "" }) }}'),
      options: { timeout: 20000 }
    },
    credentials: supabaseCred, position: [3420, -100]
  },
  output: [{}]
});

const meldungOk = node({
  type: 'n8n-nodes-base.telegram', version: 1.2,
  config: {
    name: 'Telegram: veröffentlicht',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message', operation: 'sendMessage', chatId: '1535402553',
      text: expr('✅ Instagram (Momentum) veröffentlicht: {{ $("Container planen").first().json.thema }}\n{{ $("Permalink holen").first().json.permalink || "" }}'),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true }
    },
    credentials: telegramCred, position: [3640, -100]
  },
  output: [{ ok: true }]
});

const fehlerAufbereiten = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Fehler aufbereiten',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: 
        "const j = $input.first().json || {};\n" +
        "const plan = $('Container planen').first().json;\n" +
        "let t = j.fehler || '';\n" +
        "if (!t && j.error) t = typeof j.error === 'string' ? j.error : (j.error.message || '') + ' ' + (j.error.description || '');\n" +
        "if (!t) t = JSON.stringify(j).slice(0, 500);\n" +
        "return [{ json: { post_id: plan.post_id, thema: plan.thema, fehler: String(t).trim().slice(0, 1500) } }];"
    },
    position: [2980, 300]
  },
  output: [{ post_id: 'p_test', thema: 'Test', fehler: 'Beispielfehler' }]
});

const fehlerSpeichern = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Fehler im Portal speichern',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST', url: 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/rpc/social_fehler',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_id: $json.post_id, p_fehler: $json.fehler }) }}'),
      options: { timeout: 20000 }
    },
    credentials: supabaseCred, position: [3200, 300]
  },
  output: [{ post_id: 'p_test', versuche: 1, zurueck_zur_freigabe: false }]
});

const meldungFehler = node({
  type: 'n8n-nodes-base.telegram', version: 1.2,
  config: {
    name: 'Telegram: Fehler',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message', operation: 'sendMessage', chatId: '1535402553',
      text: expr('⚠️ Instagram (Momentum) nicht veröffentlicht: {{ $("Fehler aufbereiten").first().json.thema }}\n{{ $("Fehler aufbereiten").first().json.fehler }}\n{{ $json.zurueck_zur_freigabe ? "3 Fehlversuche – zurück auf Zur Freigabe." : "Nächster Versuch in 15 Minuten." }}'),
      additionalFields: { appendAttribution: false, disable_web_page_preview: true }
    },
    credentials: telegramCred, position: [3420, 300]
  },
  output: [{ ok: true }]
});

const hinweis = sticky(
  '## Momentum Instagram-Veröffentlicher\nPostet nur Beiträge aus dem Team-Portal (Social Media) mit Status **Geplant**, Kanal **Instagram**, Freigabe durch einen Menschen und fälligem Datum/Uhrzeit.\n\n**Vor dem Aktivieren:** Zugang „Instagram Momentum“ (Bearer, Instagram-Login-Token des Accounts @momentumkiakademie) an allen Instagram-Knoten auswählen. Supabase-Funktionen aus supabase/team_social_veroeffentlichen.sql müssen angelegt sein.\n\nFormate: Bild, Karussell (2–10), Reel. Medien müssen öffentliche https-URLs sein.',
  [alle15, manuell, faellige], { color: 4 }
);

export default workflow('social-veroeffentlicher-instagram', 'SOCIAL: Veröffentlicher Instagram (Momentum)')
  .add(alle15)
  .to(faellige)
  .add(manuell)
  .to(faellige)
  .add(faellige)
  .to(einzeln.onEachBatch(
    planen.to(planOk
      .onTrue(containerAnlegen
        .to(hauptBestimmen.to(istKarussell
          .onTrue(karussellAnlegen.to(warten))
          .onFalse(warten))))
      .onFalse(fehlerAufbereiten))
  ))
  .add(warten)
  .to(statusPruefen)
  .to(statusAuswerten)
  .to(weiche
    .onCase(0, veroeffentlichen.to(permalink.to(erledigtSpeichern.to(meldungOk.to(nextBatch(einzeln))))))
    .onCase(1, warten)
    .onCase(2, fehlerAufbereiten))
  .add(containerAnlegen.onError(fehlerAufbereiten))
  .add(karussellAnlegen.onError(fehlerAufbereiten))
  .add(statusPruefen.onError(fehlerAufbereiten))
  .add(veroeffentlichen.onError(fehlerAufbereiten))
  .add(fehlerAufbereiten)
  .to(fehlerSpeichern.to(meldungFehler.to(nextBatch(einzeln))))
  .add(hinweis);
