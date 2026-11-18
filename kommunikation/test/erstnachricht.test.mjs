// Tests für die kürzere erste Antwort des WhatsApp-Kunden-Bots (Fälle A/B/C, freigegeben 13.11.2026).
// Start: node --test "kommunikation/test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BEGRUESSUNG, BEGRUESSUNG_WEBSEITE, KNOEPFE, DATENSCHUTZ_ZEILE, istKurzgruss, istNeutraleVorbelegung, erstkontaktFall, mitDatenschutz, antwortPruefen, waNachricht } from '../lib/antwort.js';
import { JS_KUNDE, JS_PRUEFEN, ERSTNACHRICHT_DEPLOY, LIB_KNOTEN, sdk } from '../n8n/bauen-antwort.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const PROMPT_DATEI = readFileSync(join(hier, '..', 'agent', 'systemprompt.md'), 'utf8');
const PROMPT = PROMPT_DATEI.slice(PROMPT_DATEI.indexOf('\n---\n') + 5).trim();   // so wie „KOM: Bot-Wissen laden“ schneidet
const WA = '491511234567';
const N = (text, typ = 'text') => ({ konversation_id: 'wa:' + WA, kontakt_extern: WA, nachricht_id: 'w1', text, typ, zeit: '2026-11-13T10:00:00Z', kontakt_name: 'Erika' });
const zaehle = (s, t) => s.split(t).length - 1;

function lauf(js, ctx, input) {
  const $ = n => {
    if (!(n in ctx)) throw new Error('nicht ausgeführt: ' + n);
    const L = Array.isArray(ctx[n]) ? ctx[n] : [ctx[n]];
    return { first: () => ({ json: L[0] }), all: () => L.map(json => ({ json })) };
  };
  return new Function('$', '$input', js)($, { first: () => ({ json: input }) })[0].json;
}
const W = (nachricht, erstkontakt) => ({ weg: 'kunde', wa: WA, nachricht, eingang: { erstkontakt }, konv: { modus: 'ki', marke: 'offen' }, verlauf: [{ richtung: 'ein', nachricht_id: nachricht.nachricht_id, text: nachricht.text, typ: nachricht.typ }] });
const kunde = w => lauf(JS_KUNDE, { 'Bot-Wissen laden': [{ schluessel: 'wa_prompt', wert: PROMPT }, { schluessel: 'wa_wissen', wert: 'WISSEN' }], 'Weg bestimmen': w }, {});
const pruefen = (w, antwort) => lauf(JS_PRUEFEN, { 'Weg bestimmen': w }, { statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ antwort, marke: 'momentum', zusammenfassung: 'z' }) } }] } });

test('Fall A nur bei reinem Gruß (deterministisch, großzügig, nichts mit Inhalt)', () => {
  for (const t of ['Hallo', 'hallo!!', 'Hi', 'hey 👋', '👋', '😊👋', 'Guten Tag', 'guten morgen.', 'Moin', 'moin moin', 'Servus', 'Grüß Gott', 'Hallo zusammen', 'Hallo Timo', 'hallo, guten tag', 'Hallöchen 🙂', 'Huhu', 'Grüezi', ''])
    assert.equal(istKurzgruss(t), true, t);
  for (const t of ['Hallo, ich will mein Team schulen', 'Was kostet das?', 'Hi, habt ihr Förderung?', 'Hallo, wir sind ein Handwerksbetrieb', 'Umsetzung', 'Mitarbeiterschulung', 'KI-System im Betrieb', 'Termin', 'Hallo, ich komme von der Website'])
    assert.equal(istKurzgruss(t), false, t);
  assert.equal(erstkontaktFall({ erstkontakt: true }, N('Hallo 👋')), 'A');
  assert.equal(erstkontaktFall({ erstkontakt: true }, N('', 'audio')), 'B', 'Sprachnachricht ist ein Anliegen');
  assert.equal(erstkontaktFall({ erstkontakt: true }, N('Wir verlieren zu viel Zeit mit Angeboten.')), 'B');
  assert.equal(erstkontaktFall({ erstkontakt: false }, N('Hallo')), '', 'kein Erstkontakt');
});

test('Fall A: feste Begrüßung, zwei Knöpfe, kurz', () => {
  const r = kunde(W(N('Hallo'), true));
  assert.equal(r.nur_begruessung, true); assert.equal(r.fall, 'A');
  assert.equal(r.payload.text, BEGRUESSUNG);
  assert.equal(BEGRUESSUNG, 'Hi 👋 Ich bin der KI-Assistent der Momentum KI Akademie und von Hermetik Marketing. Ich beantworte dir gern Fragen zu KI im Betrieb und zur Mitarbeiterförderung. Worum geht\'s?\n\nDatenschutz: momentum-ki-akademie.de/datenschutz');
  assert.ok(BEGRUESSUNG.length < 300, 'Länge ' + BEGRUESSUNG.length);
  assert.deepEqual(r.payload.buttons, ['KI-System im Betrieb', 'Geförderte Schulung']);
  for (const k of KNOEPFE) assert.ok(k.length <= 20, k);
  assert.equal(zaehle(r.payload.text, DATENSCHUTZ_ZEILE), 1);
  const wa = waNachricht(r.payload);
  assert.equal(wa.type, 'interactive'); assert.deepEqual(wa.interactive.action.buttons.map(b => b.reply.title), KNOEPFE);
});

test('Fall B: keine feste Begrüßung, KI mit Erstkontakt-Signal, Datenschutz-Zeile genau einmal', () => {
  const w = W(N('Ich möchte mein Team in KI schulen lassen, wie läuft das?'), true);
  const r = kunde(w);
  assert.equal(r.nur_begruessung, false);
  const system = r.body.messages[0].content;
  assert.match(system, /## Erste Antwort/);
  assert.match(system, /Erstkontakt: ja – das ist die erste Nachricht des Leads, es gab noch keine Begrüßung\. Befolge die Regel „Erste Antwort“/);
  assert.ok(!JSON.stringify(r.body).includes('Worum geht\'s?'), 'keine feste Begrüßung');
  assert.equal(r.body.messages.at(-1).content, 'Ich möchte mein Team in KI schulen lassen, wie läuft das?');
  // Modell vergisst die Zeile → Code hängt sie an
  const a = pruefen(w, 'Gern, ich bin der KI-Assistent der Momentum KI Akademie. Wie viele Leute sind bei euch im Team?');
  assert.ok(a.text.endsWith('\n\n' + DATENSCHUTZ_ZEILE)); assert.equal(zaehle(a.text, 'momentum-ki-akademie.de/datenschutz'), 1);
  // Modell setzt die Zeile selbst → nicht doppelt
  const b = pruefen(w, 'Gern, ich bin der KI-Assistent. Wie viele Leute sind im Team?\n\nDatenschutz: momentum-ki-akademie.de/datenschutz');
  assert.equal(zaehle(b.text, 'momentum-ki-akademie.de/datenschutz'), 1);
  assert.equal(mitDatenschutz(mitDatenschutz('x')), 'x\n\n' + DATENSCHUTZ_ZEILE);
  // Website-Knöpfe mit Thema (Stand momentum-ki-akademie.de, 13.11.2026) → Fall B
  for (const t of ['Hallo, ich komme von der Website und interessiere mich für die KI-Weiterbildung', 'Hallo, ich komme von der Website und möchte direkt mit Timo Kontakt aufnehmen'])
    assert.equal(erstkontaktFall({ erstkontakt: true }, N(t)), 'B', t);
});

test('Fall C: neutraler Webseiten-Text → fester Text mit Datenschutz-Zeile', () => {
  for (const t of ['Hallo, ich komme von der Website', 'Hallo ich komme von der Webseite!', 'Ich komme von der Website.']) {
    assert.equal(istNeutraleVorbelegung(t), true, t);
    assert.equal(erstkontaktFall({ erstkontakt: true }, N(t)), 'C', t);
  }
  const r = kunde(W(N('Hallo, ich komme von der Website'), true));
  assert.equal(r.nur_begruessung, true); assert.equal(r.fall, 'C');
  assert.equal(r.payload.text, 'Hi, ich bin der KI-Assistent der Momentum KI Akademie und von Hermetik Marketing. Geht es dir um geförderte Schulung fürs Team oder um ein KI-System für deinen Betrieb?\n\nDatenschutz: momentum-ki-akademie.de/datenschutz');
  assert.equal(r.payload.text, BEGRUESSUNG_WEBSEITE);
  assert.ok(BEGRUESSUNG_WEBSEITE.length < 300);
  assert.equal(zaehle(r.payload.text, DATENSCHUTZ_ZEILE), 1);
});

test('Zweite Nachricht: keine Begrüßung, keine Datenschutz-Zeile', () => {
  const w = W(N('Hallo'), false);
  const r = kunde(w);
  assert.equal(r.nur_begruessung, false, 'auch ein „Hallo“ später geht an die KI');
  assert.match(r.body.messages[0].content, /Erstkontakt: nein/);
  const a = pruefen(w, 'Wie viele Leute sind bei euch im Team?');
  assert.equal(a.text, 'Wie viele Leute sind bei euch im Team?');
  assert.ok(!a.text.includes('datenschutz'));
  assert.equal(antwortPruefen({ choices: [{ message: { content: JSON.stringify({ antwort: 'x' }) } }] }, WA).text, 'x');
});

test('Alte Knopf-Antworten („Umsetzung“, „Mitarbeiterschulung“) laufen weiter an die KI', () => {
  for (const t of ['Umsetzung', 'Mitarbeiterschulung', 'KI-System im Betrieb', 'Geförderte Schulung']) {
    const r = kunde(W(N(t, 'interactive'), false));
    assert.equal(r.nur_begruessung, false, t);
    assert.equal(r.body.messages.at(-1).content, t);
    assert.equal(erstkontaktFall({ erstkontakt: true }, N(t, 'interactive')), 'B', t + ' ist kein Gruß');
  }
  assert.match(PROMPT, /„KI-System im Betrieb“ \(in älteren Gesprächen „Umsetzung“\) heißt Weg Umsetzung/);
  assert.match(PROMPT, /„Geförderte Schulung“ \(in älteren Gesprächen „Mitarbeiterschulung“\) heißt Weg Mitarbeiterschulung/);
});

test('Prompt: Regel „Erste Antwort“, drei Sätze, Link- und Förderregel, ladbar', () => {
  assert.match(PROMPT, /Sag in einem kurzen Satz, dass du der KI-Assistent bist, und geh sofort auf das ein, was der Lead geschrieben hat\. Stell genau eine Rückfrage\./);
  assert.match(PROMPT, /höchstens drei kurze Sätze je Nachricht, höchstens eine Frage/);
  assert.match(PROMPT, /Links\*\* nur, wenn der Lead danach fragt oder du einen Termin anbietest, nie mehr als einer pro Nachricht/);
  assert.match(PROMPT, /ohne Zahlen und ohne Versprechen/);
  assert.match(PROMPT, /Wie viele Leute sind bei euch im Team\?/);
  assert.match(PROMPT, /Wie viele schreibt ihr ungefähr pro Woche\?/);
  assert.match(PROMPT, /Was passt eher\?/);
  assert.match(PROMPT, /\{\{erstkontakt\}\}/);
  assert.ok(!/1–4 Sätze/.test(PROMPT), 'alte Längenregel entfernt');
  assert.ok(PROMPT.length >= 2000, 'Prüfung im Lade-Workflow (mindestens 2000 Zeichen)');
  assert.match(PROMPT_DATEI, /^Stand 13\.11\.2026/m);
});

test('begruesst_am wird in allen drei Fällen gesetzt (jede Bot-Antwort als absender ki)', () => {
  const sql = readFileSync(join(hier, '..', '..', 'supabase', 'kommunikation.sql'), 'utf8');
  assert.match(sql, /if v_neu and \(p->>'absender'\) = 'ki' then\s+update kom_konversationen set begruesst_am = coalesce\(begruesst_am, now\(\)\)/);
  assert.match(sdk, /rpc\/kom_ausgang'.*absender: 'ki'/);
  // A/C laufen über „Begrüßung bauen“, B über „Antwort prüfen“ – beide münden in „Modus nochmal prüfen“ → Senden → „Ausgang speichern“
  assert.match(sdk, /nurGruss\.onTrue\(begruessung\.to\(modusPruefen\)\)\.onFalse\(kiFragen\.to\(pruefen\)\.to\(modusPruefen\)\)/);
});

test('Deploy-Datei: nur die sechs Code-Knoten mit eingebettetem antwort.js, Einstellungen unberührt', () => {
  const ops = ERSTNACHRICHT_DEPLOY.operations;
  assert.equal(ERSTNACHRICHT_DEPLOY.workflowId, 'DVGX3cltu2qbqLJE');
  assert.equal(ops.length, 6);
  assert.ok(ops.every(o => o.type === 'setNodeParameter' && o.path === '/jsCode'));
  assert.deepEqual(ops.map(o => o.nodeName).sort(), ['Antwort prüfen', 'Kunde vorbereiten', 'Senden vorbereiten', 'Team-Frage', 'Versand auswerten', 'Weg bestimmen'].sort());
  assert.ok(!ops.some(o => o.nodeName === 'Einstellungen' || o.nodeName === 'Nachbereitung'));
  for (const o of ops) assert.equal(o.value, LIB_KNOTEN[o.nodeName]);
  assert.ok(ops.find(o => o.nodeName === 'Kunde vorbereiten').value.includes("erstkontaktFall(W.eingang, W.nachricht)"));
  assert.ok(ops.find(o => o.nodeName === 'Antwort prüfen').value.includes('!!(W.eingang && W.eingang.erstkontakt)'));
});
