// Baut die n8n-SDK-Datei für „KOM: Nachtrag Pipeline (manuell)“.
// Start: node kommunikation/n8n/bauen-nachtrag.mjs → kommunikation/n8n/nachtrag-pipeline.workflow.gen.js
// Eingebettet werden kommunikation/lib/crm.js und kommunikation/lib/nachtrag.js (beide getestet).
// Zweck: WhatsApp-Gespräche von vor der automatischen Übergabe (Workflow B) einmalig in die Vertriebs-Pipeline (Twenty) tragen.
// Nur manuell starten. Standard: nur zählen, höchstens 1 Treffer.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = p => readFileSync(join(hier, '..', p), 'utf8');
// Kommentarzeilen werden weggelassen (kleinerer Code-Knoten), der Code selbst bleibt unverändert.
const ohneKommentare = s => s.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\/\*\*.*\*\/\s*$/gm, '').replace(/\/\*\*[\s\S]*?\*\/\n/g, '').replace(/\n{2,}/g, '\n');
const LIB = ohneKommentare(lies('lib/crm.js').replace(/^export /gm, '') + '\n' +
  lies('lib/nachtrag.js').replace(/^import .*$/gm, '').replace(/^export /gm, ''));

const SUPA = 'https://llhwmzhvhluamxwemaqx.supabase.co/rest/v1/';
const TWENTY = 'https://twenty.hm-storage.de/rest/';
// Zugangsdaten nur als Verweis auf die n8n-Credentials (Werte liegen in n8n, nie im Repo)
const CRED_SUPA = "{ supabaseApi: { id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' } }";
const CRED_TWENTY = "{ httpBearerAuth: { id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' } }";

// Im Lauf: Schleife mit Batchgröße 1, also genau ein Gespräch je Durchlauf. .item folgt der Item-Zuordnung;
// wo die Zuordnung (z. B. nach einem Fehlerausgang) fehlt, ist .first() wegen Batchgröße 1 gleichwertig.
const IM_LAUF = "const imLauf = n => { try { return $(n).item.json; } catch (e) { return $(n).first().json; } };\nconst G = imLauf('Je Gespräch');\n";

const JS = {
  'Auswahl': `${LIB}
// ===== Auswahl: Name filtern, Teammitglieder raus, begrenzen. Zählmodus ohne volle Nummer und ohne Chattext. =====
const E = $('Einstellung').first().json;
const konv = $('Gespräche laden').all().map(i => i.json);
// „Team prüfen“ läuft je Gespräch; Zuordnung über pairedItem (Fallback: gleiche Reihenfolge)
const team = [];
$input.all().forEach((it, i) => { const p = Array.isArray(it.pairedItem) ? it.pairedItem[0] : it.pairedItem; team[p && typeof p.item === 'number' ? p.item : i] = it.json || {}; });
const A = nachtragAuswahl(konv, team, E);
if (A.nur_zaehlen) return A.zaehlung.length ? A.zaehlung.map(z => ({ json: z })) : [{ json: { treffer_gesamt: A.gesamt, hinweis: 'Keine offenen WhatsApp-Gespräche ohne Chance gefunden.' } }];
const jetzt = new Date().toISOString();
return A.treffer.map(k => ({ json: nachtragGespraech(k, jetzt) }));`,
  'Person wählen': `${LIB}
${IM_LAUF}return { json: { konversation_id: G.konversation_id, ...crmPersonSchritt($json, G.wa, G.name, G.twenty_person_id) } };`,
  'Person übernehmen': `${LIB}
${IM_LAUF}const S = imLauf('Person wählen');
return { json: { konversation_id: G.konversation_id, person_neu: S.person_neu, ...crmPersonUebernehmen(S.person_neu ? $json : null, S.person_neu ? '' : S.person_id) } };`,
  'Chance wählen': `${LIB}
${IM_LAUF}const P = imLauf('Person übernehmen');
const c = nachtragChanceSchritt($json, G, P.person_id);
return { json: { konversation_id: G.konversation_id, person_id: P.person_id, person_neu: P.person_neu, ...c, notizen_pfad: c.chance_neu ? '' : crmNotizenPfad(c.chance_id) } };`,
  'Notiz bauen': `${LIB}
${IM_LAUF}const chance_id = crmNeueId($json);
if (!chance_id) throw new Error('Twenty hat keine Chancen-ID geliefert.');
return { json: { konversation_id: G.konversation_id, chance_id, body: nachtragNotizBody(G) } };`,
  'Ergebnis bauen': `${LIB}
${IM_LAUF}const C = imLauf('Chance wählen');
const r = C.chance_neu
  ? nachtragErgebnis(G, { person_id: C.person_id, person_neu: C.person_neu, chance_neu: true, chance_id: imLauf('Notiz bauen').chance_id, notiz_antwort: imLauf('Twenty: Notiz anlegen') })
  : nachtragErgebnis(G, { person_id: C.person_id, person_neu: C.person_neu, chance_neu: false, chance_id: C.chance_id, notizen_antwort: $json });
return { json: r };`,
  'Treffer fertig': `${IM_LAUF}return { json: imLauf('Ergebnis bauen').ergebnis };`,
  'Fehler vermerken': `${LIB}
// Nach einem Fehlerausgang gibt es keine Item-Zuordnung: Batchgröße 1, also .first() = aktuelles Gespräch.
const G = $('Je Gespräch').first().json;
const i = $json || {};
// Nur Stände aus DIESEM Durchlauf verwenden (gleiche konversation_id), nie Reste vom vorigen Gespräch
const aktuell = n => { try { const x = $(n).first().json; return x && x.konversation_id === G.konversation_id ? x : null; } catch (e) { return null; } };
const P = aktuell('Person übernehmen'), C = aktuell('Chance wählen'), N = aktuell('Notiz bauen');
return { json: nachtragFehler(G, i.error || i.message || i, { person_id: P ? P.person_id : '', person_neu: P ? P.person_neu : false, chance_neu: !!N, chance_id: N ? N.chance_id : (C && !C.chance_neu ? C.chance_id : null) }) };`,
  'Treffer fehlgeschlagen': `return { json: $('Fehler vermerken').first().json.ergebnis };`,
  'Ergebnis': `// Ergebnis je Treffer: Profilname, letzte vier Ziffern, neu_angelegt, Twenty-IDs, Fehlertext
return $input.all().map(i => ({ json: i.json }));`
};
const ALLE = ['Auswahl', 'Ergebnis'];

const jsQuelle = js => js.startsWith(LIB) ? 'LIB + ' + JSON.stringify(js.slice(LIB.length)) : JSON.stringify(js);
const code = (v, name, onError) => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${JSON.stringify(name)},${onError ? ` onError: '${onError}',` : ''} parameters: { mode: '${ALLE.includes(name) ? 'runOnceForAllItems' : 'runOnceForEachItem'}', jsCode: ${jsQuelle(JS[name])} } } });`;
const twenty = (v, name, method, url, body) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)}, onError: 'continueErrorOutput', parameters: { method: '${method}', url: ${url}, authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 15000 } }, credentials: ${CRED_TWENTY}, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 } });`;
const supa = (v, name, method, url, body, extra) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${JSON.stringify(name)},${extra || ''} parameters: { method: '${method}', url: ${url}, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi'${body ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: ${body}` : ''}, options: { timeout: 15000 } }, credentials: ${CRED_SUPA}, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 } });`;
const e = s => `expr(${JSON.stringify(s)})`;
const wenn = (v, name, links) => `const ${v} = ifElse({ version: 2.2, config: { name: ${JSON.stringify(name)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: ${e(links)}, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } } });`;
const KONV_PATCH_URL = e(`${SUPA}kom_konversationen?konversation_id=eq.{{ encodeURIComponent($('Je Gespräch').item.json.konversation_id) }}`);

const sdk = `// GENERIERT von kommunikation/n8n/bauen-nachtrag.mjs – nicht von Hand ändern.
// KOM: Nachtrag Pipeline (manuell). Trägt WhatsApp-Gespräche ohne Chance (von vor der automatischen Übergabe) in Twenty nach.
// Nur manuell starten. Standard: nur_zaehlen = true, max_anzahl = 1. Kein Telegram. Teammitglieder: RPC kom_team_kontakt wie in Workflow B.
import { workflow, node, trigger, ifElse, splitInBatches, nextBatch, expr } from '@n8n/workflow-sdk';

// Gemeinsame Logik aus kommunikation/lib/crm.js + kommunikation/lib/nachtrag.js (getestet)
const LIB = ${JSON.stringify(LIB)};

const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manuell starten', parameters: {} } });
const einstellung = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Einstellung', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'ne', name: 'name_enthaelt', value: '', type: 'string' },
  { id: 'ma', name: 'max_anzahl', value: 1, type: 'number' },
  { id: 'nz', name: 'nur_zaehlen', value: true, type: 'boolean' }
] } } } });
${supa('laden', 'Gespräche laden', 'GET', `'${SUPA}kom_konversationen?select=konversation_id,kontakt_extern,kontakt_name,marke,zusammenfassung,letzte_kunde_am,twenty_person_id,twenty_chance_id&kanal=eq.whatsapp&twenty_chance_id=is.null&order=letzte_kunde_am.desc.nullslast&limit=500'`, null, ' executeOnce: true, alwaysOutputData: true,')}
${supa('teamPruefen', 'Team prüfen', 'POST', `'${SUPA}rpc/kom_team_kontakt'`, e("{{ JSON.stringify({ p_wa: String($json.kontakt_extern || '') }) }}"))}
${code('auswahl', 'Auswahl')}
${wenn('nurZaehlen', 'Nur zählen?', "{{ $('Einstellung').first().json.nur_zaehlen }}")}
const gezaehlt = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Nur gezählt', parameters: {} } });
const schleife = splitInBatches({ version: 3, config: { name: 'Je Gespräch', parameters: { batchSize: 1, options: {} } } });
${twenty('personSuchen', 'Twenty: Person suchen', 'GET', e(`${TWENTY}{{ $json.person_pfad }}`))}
${code('personWaehlen', 'Person wählen', 'continueErrorOutput')}
${wenn('personNeu', 'Person neu?', '{{ $json.person_neu }}')}
${twenty('personAnlegen', 'Twenty: Person anlegen', 'POST', `'${TWENTY}people'`, e('{{ JSON.stringify($json.body) }}'))}
${code('personUebernehmen', 'Person übernehmen', 'continueErrorOutput')}
${twenty('chancenLaden', 'Twenty: Chancen der Person', 'GET', e(`${TWENTY}{{ $json.pfad }}`))}
${code('chanceWaehlen', 'Chance wählen', 'continueErrorOutput')}
${wenn('chanceNeu', 'Chance neu?', '{{ $json.chance_neu }}')}
${twenty('chanceAnlegen', 'Twenty: Chance anlegen', 'POST', `'${TWENTY}opportunities'`, e('{{ JSON.stringify($json.body) }}'))}
${code('notizBauen', 'Notiz bauen', 'continueErrorOutput')}
${twenty('notizAnlegen', 'Twenty: Notiz anlegen', 'POST', `'${TWENTY}notes'`, e('{{ JSON.stringify($json.body) }}'))}
${twenty('notizVerknuepfen', 'Twenty: Notiz verknüpfen', 'POST', `'${TWENTY}noteTargets'`, e("{{ JSON.stringify({ noteId: (Object.values($json.data || {})[0] || {}).id, targetOpportunityId: $('Notiz bauen').item.json.chance_id }) }}"))}
${twenty('notizenLaden', 'Twenty: Notizen der Chance', 'GET', e(`${TWENTY}{{ $json.notizen_pfad }}`))}
${code('ergebnisBauen', 'Ergebnis bauen', 'continueErrorOutput')}
${supa('standSpeichern', 'Stand speichern', 'PATCH', KONV_PATCH_URL, e('{{ JSON.stringify($json.patch) }}'), " onError: 'continueErrorOutput',")}
${code('trefferFertig', 'Treffer fertig')}
${code('fehlerVermerken', 'Fehler vermerken', 'continueRegularOutput')}
${supa('fehlerSpeichern', 'Fehler speichern', 'PATCH', e(`${SUPA}kom_konversationen?konversation_id=eq.{{ encodeURIComponent($('Je Gespräch').first().json.konversation_id) }}`), e('{{ JSON.stringify($json.patch) }}'), " onError: 'continueRegularOutput',")}
${code('trefferFehler', 'Treffer fehlgeschlagen')}
${code('ergebnis', 'Ergebnis')}

export default workflow('kom-nachtrag-pipeline', 'KOM: Nachtrag Pipeline (manuell)')
  .add(start).to(einstellung).to(laden).to(teamPruefen).to(auswahl)
  .to(nurZaehlen.onTrue(gezaehlt).onFalse(schleife))
  .add(schleife.onDone(ergebnis).onEachBatch(personSuchen))
  .add(personSuchen.output(0).to(personWaehlen))
  .add(personWaehlen.output(0).to(personNeu))
  .add(personNeu.onTrue(personAnlegen).onFalse(personUebernehmen))
  .add(personAnlegen.output(0).to(personUebernehmen))
  .add(personUebernehmen.output(0).to(chancenLaden))
  .add(chancenLaden.output(0).to(chanceWaehlen))
  .add(chanceWaehlen.output(0).to(chanceNeu))
  .add(chanceNeu.onTrue(chanceAnlegen).onFalse(notizenLaden))
  .add(chanceAnlegen.output(0).to(notizBauen))
  .add(notizBauen.output(0).to(notizAnlegen))
  .add(notizAnlegen.output(0).to(notizVerknuepfen))
  .add(notizVerknuepfen.output(0).to(ergebnisBauen))
  .add(notizenLaden.output(0).to(ergebnisBauen))
  .add(ergebnisBauen.output(0).to(standSpeichern))
  .add(standSpeichern.output(0).to(trefferFertig))
  .add(trefferFertig.to(nextBatch(schleife)))
${['personSuchen', 'personWaehlen', 'personAnlegen', 'personUebernehmen', 'chancenLaden', 'chanceWaehlen', 'chanceAnlegen', 'notizBauen', 'notizAnlegen', 'notizVerknuepfen', 'notizenLaden', 'ergebnisBauen', 'standSpeichern']
  .map(v => `  .add(${v}.output(1).to(fehlerVermerken))`).join('\n')}
  .add(fehlerVermerken.to(fehlerSpeichern).to(trefferFehler).to(nextBatch(schleife)));
`;

export { LIB, JS, sdk };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeFileSync(join(hier, 'nachtrag-pipeline.workflow.gen.js'), sdk);
  console.log('geschrieben: kommunikation/n8n/nachtrag-pipeline.workflow.gen.js', sdk.length, 'Zeichen');
}
