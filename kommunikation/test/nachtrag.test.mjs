// Tests für „KOM: Nachtrag Pipeline (manuell)“ (kommunikation/lib/nachtrag.js + Code-Knoten aus bauen-nachtrag.mjs).
// Start: node --test "kommunikation/test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nachtragAuswahl, nachtragEinstellung, nachtragNamePasst } from '../lib/nachtrag.js';
import { crmNeueId, CRM_NOTIZ_TITEL } from '../lib/crm.js';
import { JS, sdk } from '../n8n/bauen-nachtrag.mjs';

const CHAT = 'Wir haben 12 Mitarbeitende und Ärger mit dem Steuerberater Huber';
const K1 = { konversation_id: 'wa:4915111111111', kontakt_extern: '4915111111111', kontakt_name: 'Erika Muster', marke: 'momentum', zusammenfassung: CHAT, letzte_kunde_am: '2026-11-10T08:30:00+00:00', twenty_person_id: null, twenty_chance_id: null };
const K2 = { konversation_id: 'wa:4917022222222', kontakt_extern: '4917022222222', kontakt_name: 'Max Beispiel', marke: 'offen', zusammenfassung: '', letzte_kunde_am: '2026-11-09T12:00:00+00:00', twenty_person_id: null, twenty_chance_id: null };
const TIMO = { konversation_id: 'wa:491737348515', kontakt_extern: '491737348515', kontakt_name: 'Timo', marke: 'offen', zusammenfassung: 'Test', letzte_kunde_am: '2026-11-11T10:00:00+00:00' };
const JETZT = '2026-11-13T12:00:00.000Z';

/** Code-Knoten wie in n8n: $('Name').item/.first()/.all(), $json, $input. Unbekannte Knoten werfen. */
function lauf(name, ctx, input, inputs) {
  const $ = n => {
    if (!(n in ctx)) throw new Error('Knoten nicht ausgeführt: ' + n);
    const v = ctx[n];
    const L = Array.isArray(v) ? v : [v];
    return { item: { json: L[0] }, first: () => ({ json: L[0] }), all: () => L.map(json => ({ json })) };
  };
  const $input = { first: () => ({ json: input }), all: () => inputs || [{ json: input }] };
  const r = new Function('$', '$json', '$input', JS[name])($, input, $input);
  return Array.isArray(r) ? r.map(x => x.json) : r.json;
}

function auswahl(konv, team, einstellung) {
  const ctx = { Einstellung: einstellung, 'Gespräche laden': konv };
  // Team prüfen läuft je Gespräch; Ergebnis in umgekehrter Reihenfolge geliefert, Zuordnung über pairedItem
  const inputs = team.map((t, i) => ({ json: t, pairedItem: { item: i } })).reverse();
  return lauf('Auswahl', ctx, inputs[0] && inputs[0].json, inputs);
}

function twentyImSpeicher() {
  const db = { people: [], opportunities: [], notes: [], noteTargets: [] };
  let n = 0;
  const id = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const fn = (methode, pfad, body) => {
    const [res, q] = pfad.split('?');
    const filter = q ? decodeURIComponent((q.match(/filter=([^&]*)/) || [])[1] || '') : '';
    if (methode === 'GET' && res === 'people') {
      const werte = [...filter.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      return { data: { people: db.people.filter(p => werte.includes(p.phones.primaryPhoneNumber)) } };
    }
    if (methode === 'GET' && res === 'opportunities') return { data: { opportunities: db.opportunities.filter(o => o.pointOfContactId === filter.split(':')[1]) } };
    if (methode === 'GET' && res === 'noteTargets') {
      const oid = filter.split(':')[1];
      return { data: { noteTargets: db.noteTargets.filter(t => t.targetOpportunityId === oid).map(t => ({ ...t, note: db.notes.find(x => x.id === t.noteId) })) } };
    }
    if (methode === 'POST') { const x = { id: id(), ...body }; db[res].push(x); return { data: { ['create' + res]: x } }; }
    throw new Error('unbekannt ' + methode + ' ' + pfad);
  };
  return { db, fn };
}

/** Ein Durchlauf der Schleife „Je Gespräch“ (Batchgröße 1). ctx bleibt über Durchläufe bestehen (wie n8n: letzter Lauf je Knoten). */
function durchlauf(ctx, G, tw, supabase, kaputt) {
  ctx['Je Gespräch'] = G;
  const aufrufe = [];
  const http = (name, m, pfad, body) => {
    aufrufe.push({ name, m, pfad, body });
    if (kaputt && kaputt(name, G)) throw new Error('Twenty 500 bei ' + name);
    const r = tw.fn(m, pfad, body); ctx[name] = r; return r;
  };
  const code = (name, input) => { const out = lauf(name, ctx, input); ctx[name] = out; return out; };
  try {
    let r = http('Twenty: Person suchen', 'GET', G.person_pfad);
    const pw = code('Person wählen', r);
    r = pw.person_neu ? http('Twenty: Person anlegen', 'POST', 'people', pw.body) : pw;
    const pu = code('Person übernehmen', r);
    r = http('Twenty: Chancen der Person', 'GET', pu.pfad);
    const cw = code('Chance wählen', r);
    if (cw.chance_neu) {
      r = http('Twenty: Chance anlegen', 'POST', 'opportunities', cw.body);
      const nb = code('Notiz bauen', r);
      r = http('Twenty: Notiz anlegen', 'POST', 'notes', nb.body);
      r = http('Twenty: Notiz verknüpfen', 'POST', 'noteTargets', { noteId: crmNeueId(r), targetOpportunityId: nb.chance_id });
    } else r = http('Twenty: Notizen der Chance', 'GET', cw.notizen_pfad);
    const eb = code('Ergebnis bauen', r);
    supabase[G.konversation_id] = { ...(supabase[G.konversation_id] || {}), ...eb.patch };
    return { zeile: code('Treffer fertig', {}), aufrufe };
  } catch (err) {
    const fv = code('Fehler vermerken', { error: { message: err.message } });
    supabase[G.konversation_id] = { ...(supabase[G.konversation_id] || {}), ...fv.patch };
    return { zeile: code('Treffer fehlgeschlagen', {}), aufrufe };
  }
}

const AUSFUEHREN = { name_enthaelt: '', max_anzahl: 10, nur_zaehlen: false };

test('Einstellung: Standard nur zählen, höchstens 1', () => {
  assert.deepEqual(nachtragEinstellung({}), { teile: [], max: 1, nur_zaehlen: true });
  assert.deepEqual(nachtragEinstellung({ name_enthaelt: 'Erika, MAX ,', max_anzahl: '3', nur_zaehlen: false }), { teile: ['erika', 'max'], max: 3, nur_zaehlen: false });
  assert.equal(nachtragEinstellung({ max_anzahl: 0 }).max, 1);
  assert.match(sdk, /name: 'max_anzahl', value: 1, type: 'number'/);
  assert.match(sdk, /name: 'nur_zaehlen', value: true, type: 'boolean'/);
  assert.match(sdk, /name: 'name_enthaelt', value: '', type: 'string'/);
});

test('Zählmodus: keine volle Nummer, kein Chattext', () => {
  const out = auswahl([K1, K2], [{}, {}], { name_enthaelt: '', max_anzahl: 5, nur_zaehlen: true });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { profilname: 'Erika Muster', nummer_endet_auf: '1111', marke: 'momentum', zusammenfassung: 'ja', zusammenfassung_laenge: CHAT.length, letzte_kundennachricht: '2026-11-10', treffer_gesamt: 2 });
  assert.equal(out[1].zusammenfassung, 'nein');
  const t = JSON.stringify(out);
  for (const k of [K1, K2]) { assert.ok(!t.includes(k.kontakt_extern), 'volle Nummer'); assert.ok(!t.includes(k.kontakt_extern.slice(2)), 'Nummer ohne Vorwahl'); }
  assert.ok(!t.includes('Steuerberater') && !t.includes('Huber'), 'kein Chattext');
  assert.ok(!t.includes('konversation_id') && !t.includes('wa:'), 'keine Kennung mit Nummer');
  // keine Treffer → Hinweis
  assert.deepEqual(auswahl([], [], { nur_zaehlen: true }), [{ treffer_gesamt: 0, hinweis: 'Keine offenen WhatsApp-Gespräche ohne Chance gefunden.' }]);
});

test('Namensfilter: ein Teil reicht, Groß/klein egal, leer = alle', () => {
  assert.equal(nachtragNamePasst('Erika Muster', ['muster']), true);
  assert.equal(nachtragNamePasst('Erika Muster', ['max', 'ERIKA'.toLowerCase()]), true);
  assert.equal(nachtragNamePasst('Erika Muster', ['max']), false);
  assert.equal(nachtragNamePasst('', []), true);
  const out = auswahl([K1, K2], [{}, {}], { name_enthaelt: 'BEISPIEL', max_anzahl: 5, nur_zaehlen: true });
  assert.deepEqual(out.map(z => z.profilname), ['Max Beispiel']);
});

test('max_anzahl begrenzt, Gesamtzahl vor der Begrenzung', () => {
  const out = auswahl([K1, K2], [{}, {}], { name_enthaelt: '', max_anzahl: 1, nur_zaehlen: true });
  assert.equal(out.length, 1); assert.equal(out[0].profilname, 'Erika Muster'); assert.equal(out[0].treffer_gesamt, 2);
  const g = auswahl([K1, K2], [{}, {}], { name_enthaelt: '', max_anzahl: 1, nur_zaehlen: false });
  assert.equal(g.length, 1); assert.equal(g[0].wa, '4915111111111');
});

test('Teammitglied ausgeschlossen (kom_team_kontakt wie in Workflow B)', () => {
  const A = nachtragAuswahl([TIMO, K1], [{ mitglied_id: 'timo', name: 'Timo', rolle: 'admin' }, {}], { nur_zaehlen: true, max_anzahl: 5 });
  assert.equal(A.gesamt, 1); assert.equal(A.treffer[0].konversation_id, K1.konversation_id);
  // Zuordnung über pairedItem, auch wenn „Team prüfen“ in anderer Reihenfolge liefert
  const out = auswahl([TIMO, K1], [{ mitglied_id: 'timo' }, {}], { nur_zaehlen: true, max_anzahl: 5 });
  assert.deepEqual(out.map(z => z.profilname), ['Erika Muster']);
  assert.match(sdk, /rpc\/kom_team_kontakt/);
});

test('Zwei Gespräche nacheinander ohne Vermischung', () => {
  const tw = twentyImSpeicher(); const sb = {}; const ctx = {};
  const G = auswahl([K1, K2], [{}, {}], AUSFUEHREN).map(g => ({ ...g, jetzt: JETZT }));
  assert.equal(G.length, 2);
  const z1 = durchlauf(ctx, G[0], tw, sb).zeile;
  const z2 = durchlauf(ctx, G[1], tw, sb).zeile;
  assert.equal(tw.db.people.length, 2); assert.equal(tw.db.opportunities.length, 2); assert.equal(tw.db.notes.length, 2);
  const [p1, p2] = tw.db.people, [o1, o2] = tw.db.opportunities;
  assert.equal(p1.phones.primaryPhoneNumber, '15111111111'); assert.equal(p1.phones.primaryPhoneCallingCode, '+49'); assert.equal(p1.phones.primaryPhoneCountryCode, 'DE');
  assert.equal(o1.name, 'WhatsApp: Erika Muster'); assert.equal(o1.pointOfContactId, p1.id); assert.equal(o1.stage, 'NEW');
  assert.equal(o2.name, 'WhatsApp: Max Beispiel'); assert.equal(o2.pointOfContactId, p2.id);
  // letzterKontakt/eingangAm = letzte Kundennachricht, nicht „jetzt“
  assert.equal(o1.letzterKontakt, '2026-11-10T08:30:00.000Z'); assert.equal(o1.eingangAm, '2026-11-10T08:30:00.000Z');
  assert.equal(o2.letzterKontakt, '2026-11-09T12:00:00.000Z');
  // Notizen: vorhandene Zusammenfassung bzw. Nachtrag-Hinweis, Marke immer
  assert.equal(tw.db.noteTargets.find(t => t.targetOpportunityId === o1.id).noteId, tw.db.notes[0].id);
  assert.equal(tw.db.noteTargets.find(t => t.targetOpportunityId === o2.id).noteId, tw.db.notes[1].id);
  assert.match(tw.db.notes[0].bodyV2.markdown, /Marke:\*\* Momentum KI Akademie/);
  assert.match(tw.db.notes[1].bodyV2.markdown, /Nachtrag vom 13\.11\.2026: Kontakt hat sich per WhatsApp gemeldet, bevor die automatische Übergabe aktiv war\./);
  assert.match(tw.db.notes[1].bodyV2.markdown, /Marke:\*\* noch offen/);
  assert.equal(tw.db.notes[0].title, CRM_NOTIZ_TITEL);
  // Supabase je Konversation
  assert.deepEqual(sb[K1.konversation_id], { twenty_person_id: p1.id, twenty_chance_id: o1.id, crm_notiz_id: tw.db.notes[0].id, crm_uebergeben_am: JETZT, crm_fehler: null });
  assert.equal(sb[K2.konversation_id].twenty_chance_id, o2.id);
  // Ergebniszeilen
  assert.deepEqual(z1, { profilname: 'Erika Muster', nummer_endet_auf: '1111', neu_angelegt: { person: true, chance: true, notiz: true }, twenty: { person_id: p1.id, chance_id: o1.id, notiz_id: tw.db.notes[0].id }, fehler: null });
  assert.equal(z2.twenty.chance_id, o2.id); assert.equal(z2.nummer_endet_auf, '2222');
});

test('Bestehende Person und Chance → nichts doppelt, vorhandene Notiz übernommen', () => {
  const tw = twentyImSpeicher(); const sb = {}; const ctx = {};
  tw.fn('POST', 'people', { name: { firstName: 'Erika', lastName: 'M.' }, phones: { primaryPhoneNumber: '15111111111', primaryPhoneCallingCode: '+49' } });
  const pid = tw.db.people[0].id;
  tw.fn('POST', 'opportunities', { name: 'WhatsApp: Erika', stage: 'ERSTKONTAKT', pointOfContactId: pid, letzterKontakt: '2026-11-12T00:00:00.000Z' });
  const oid = tw.db.opportunities[0].id;
  tw.fn('POST', 'notes', { title: CRM_NOTIZ_TITEL, bodyV2: { markdown: 'x' } });
  tw.fn('POST', 'noteTargets', { noteId: tw.db.notes[0].id, targetOpportunityId: oid });
  const [G] = auswahl([K1], [{}], AUSFUEHREN);
  const { zeile, aufrufe } = durchlauf(ctx, { ...G, jetzt: JETZT }, tw, sb);
  assert.equal(tw.db.people.length, 1); assert.equal(tw.db.opportunities.length, 1); assert.equal(tw.db.notes.length, 1); assert.equal(tw.db.noteTargets.length, 1);
  assert.ok(!aufrufe.some(a => a.m !== 'GET'), 'nur lesende Aufrufe');
  assert.equal(tw.db.opportunities[0].stage, 'ERSTKONTAKT', 'vorhandene Chance unverändert');
  assert.deepEqual(zeile.neu_angelegt, { person: false, chance: false, notiz: false });
  assert.deepEqual(zeile.twenty, { person_id: pid, chance_id: oid, notiz_id: tw.db.notes[0].id });
  assert.equal(sb[K1.konversation_id].twenty_chance_id, oid);
});

test('Fehler bei einem Treffer stoppt den zweiten nicht, keine Reste vom anderen Gespräch', () => {
  // a) erstes Gespräch scheitert beim Anlegen der Chance, zweites läuft durch
  let tw = twentyImSpeicher(); let sb = {}; let ctx = {};
  const G = auswahl([K1, K2], [{}, {}], AUSFUEHREN).map(g => ({ ...g, jetzt: JETZT }));
  const kaputt = (name, g) => name === 'Twenty: Chance anlegen' && g.konversation_id === K1.konversation_id;
  const z1 = durchlauf(ctx, G[0], tw, sb, kaputt).zeile;
  const z2 = durchlauf(ctx, G[1], tw, sb, kaputt).zeile;
  assert.match(z1.fehler, /nachtrag: Twenty 500 bei Twenty: Chance anlegen/);
  assert.deepEqual(z1.neu_angelegt, { person: true, chance: false, notiz: false });
  assert.equal(sb[K1.konversation_id].twenty_person_id, tw.db.people[0].id, 'angelegte Person wird gemerkt');
  assert.match(sb[K1.konversation_id].crm_fehler, /Chance anlegen/);
  assert.equal(sb[K1.konversation_id].twenty_chance_id, undefined);
  assert.equal(z2.fehler, null); assert.equal(tw.db.opportunities.length, 1); assert.equal(tw.db.opportunities[0].name, 'WhatsApp: Max Beispiel');
  assert.equal(sb[K2.konversation_id].crm_fehler, null);

  // b) erstes Gespräch läuft durch, zweites scheitert gleich bei der Personensuche: darf NICHT die Person/Chance des ersten übernehmen
  tw = twentyImSpeicher(); sb = {}; ctx = {};
  const kaputt2 = (name, g) => name === 'Twenty: Person suchen' && g.konversation_id === K2.konversation_id;
  durchlauf(ctx, G[0], tw, sb, kaputt2);
  const zb = durchlauf(ctx, G[1], tw, sb, kaputt2).zeile;
  assert.match(zb.fehler, /Person suchen/);
  assert.deepEqual(zb.twenty, { person_id: null, chance_id: null, notiz_id: null });
  assert.deepEqual(zb.neu_angelegt, { person: false, chance: false, notiz: false });
  assert.equal(sb[K2.konversation_id].twenty_person_id, undefined);
  assert.equal(zb.profilname, 'Max Beispiel');

  // c) neuer Versuch für K1 nach Fehler: Person aus twenty_person_id wiederverwendet, keine zweite Person
  tw = twentyImSpeicher(); sb = {}; ctx = {};
  durchlauf(ctx, G[0], tw, sb, kaputt);
  const K1neu = { ...K1, twenty_person_id: sb[K1.konversation_id].twenty_person_id };
  const [G1] = auswahl([K1neu], [{}], AUSFUEHREN);
  const z = durchlauf(ctx, { ...G1, jetzt: JETZT }, tw, sb).zeile;
  assert.equal(tw.db.people.length, 1); assert.equal(tw.db.opportunities.length, 1);
  assert.deepEqual(z.neu_angelegt, { person: false, chance: true, notiz: true });
});

test('Workflow-Datei: Credentials als Verweis, kein Telegram, Code-Knoten je Datensatz', () => {
  assert.ok(!sdk.includes('n8n-nodes-base.telegram'), 'kein Telegram-Knoten');
  assert.ok(!Object.values(JS).some(js => js.slice(js.lastIndexOf('return')).includes('crmTelegram')), 'kein Telegram-Text erzeugt');
  const twentyKnoten = sdk.match(/name: "Twenty: [^"]+"/g);
  assert.equal(twentyKnoten.length, 7);
  assert.equal((sdk.match(/httpBearerAuth: \{ id: 'rlJP4wWKYVbUon0O', name: 'Twentyapi' \}/g) || []).length, 7);
  assert.equal((sdk.match(/supabaseApi: \{ id: 'NpKrSLYxAsarf8ar', name: 'Supabase account' \}/g) || []).length, 4);
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(sdk), 'kein Token im Klartext');
  for (const n of ['Person wählen', 'Person übernehmen', 'Chance wählen', 'Notiz bauen', 'Ergebnis bauen']) {
    assert.match(sdk, new RegExp('name: "' + n + '", onError: \'continueErrorOutput\', parameters: \\{ mode: \'runOnceForEachItem\''), n);
    assert.ok(!JS[n].includes(".first()") || JS[n].includes('imLauf'), n + ': .item, .first() nur als Rückfall');
  }
  assert.match(sdk, /batchSize: 1/);
});
