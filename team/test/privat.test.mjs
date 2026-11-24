// Test: private Aufgaben in der Portal-API v2 (Knoten „Anfrage prüfen“ und „Antwort bauen“, team/n8n/*.js).
// Entscheidung Timo 23.11.2026: Eine private Aufgabe sehen nur Ersteller und Bearbeiter, auch Timo (Admin) und andere Agenten nicht.
// Läuft wie n8n ($('Knoten') nachgebildet), ohne Netz und ohne echte Daten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const N8N = join(dirname(fileURLToPath(import.meta.url)), '..', 'n8n');
const ANFRAGE = readFileSync(join(N8N, 'portal-api-anfrage-pruefen.js'), 'utf8');
const ANTWORT = readFileSync(join(N8N, 'portal-api-antwort-bauen.js'), 'utf8');
const TOK = { m_timo: 'tok-timo-0000000000000001', m_kurt: 'tok-kurt-0000000000000002', m_lillien: 'tok-lillien-00000000000003', m_murat: 'tok-murat-000000000000005', 'agent-claude': 'tok-agent-0000000000000004', 'agent-codex': 'tok-codex-0000000000000006' };
const heute = new Date().toISOString().slice(0, 10);

function daten() {
  return {
    mitglieder: [
      { mitglied_id: 'm_timo', name: 'Timo (Test)', rolle: 'admin', typ: 'mensch', status: 'aktiv', token: TOK.m_timo },
      { mitglied_id: 'm_kurt', name: 'Kurt (Test)', rolle: 'dozent', typ: 'mensch', status: 'aktiv', token: TOK.m_kurt },
      { mitglied_id: 'm_lillien', name: 'Lillien (Test)', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOK.m_lillien },
      { mitglied_id: 'm_murat', name: 'Murat (Test)', rolle: 'vertrieb', typ: 'mensch', status: 'aktiv', token: TOK.m_murat },
      { mitglied_id: 'agent-claude', name: 'Claude', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOK['agent-claude'] },
      { mitglied_id: 'agent-codex', name: 'Codex', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOK['agent-codex'] }
    ],
    projekte: [{ projekt_id: 'p1', name: 'Webseite' }, { projekt_id: 'p2', name: 'Sonstiges' }, { projekt_id: 'p3', name: 'Nur privat benutzt' }],
    aufgaben: [
      { aufgabe_id: 'a_offen', titel: 'Für alle', status: 'Offen', prio: 5, projekt: 'Webseite', verantwortlich: 'm_kurt', bearbeiter: ['m_kurt'], erstellt_von: 'm_timo' },
      // Lillien hat sie angelegt, Kurt ist Bearbeiter. Timo, Murat und Codex dürfen sie nicht sehen.
      { aufgabe_id: 'a_priv', titel: 'Geheimes Geburtstagsgeschenk', status: 'Offen', prio: 2, projekt: 'Nur privat benutzt', verantwortlich: 'm_kurt', bearbeiter: ['m_kurt'], erstellt_von: 'm_lillien', privat: true, beschreibung: 'Nicht verraten' },
      // Timos eigene private Aufgabe mit Claude als Bearbeiter
      { aufgabe_id: 'a_timo', titel: 'Timo privat', status: 'In Arbeit', prio: 1, projekt: 'Webseite', verantwortlich: 'agent-claude', bearbeiter: ['agent-claude'], erstellt_von: 'm_timo', privat: true, agent_geeignet: true },
      // Alte private Aufgabe ohne Liste (nur Feld verantwortlich)
      { aufgabe_id: 'a_alt', titel: 'Alt privat', status: 'Offen', prio: 5, projekt: 'Webseite', verantwortlich: 'm_murat', erstellt_von: 'm_murat', privat: true }
    ],
    verlauf: [
      { aufgabe_id: 'a_offen', autor: 'm_kurt', art: 'kommentar', text: 'sichtbar', erstellt: '2026-11-20T10:00:00Z' },
      { aufgabe_id: 'a_priv', autor: 'm_lillien', art: 'kommentar', text: 'geheimer Kommentar', erstellt: '2026-11-20T11:00:00Z' },
      { aufgabe_id: 'a_timo', autor: 'agent-claude', art: 'bericht', text: 'Bericht an Timo', erstellt: '2026-11-20T12:00:00Z' }
    ],
    zeiten: [{ zeit_id: 'z1', mitglied_id: 'm_lillien', datum: heute, von: '08:00', bis: '09:00', minuten: 60, taetigkeit: 'Geschenk besorgt', aufgabe_id: 'a_priv', aufgaben_ids: ['a_priv'], projekt: 'Nur privat benutzt', status: 'offen' }],
    notizen: [], vorschlaege: [], social: [], systeme: [], abrechnung: [],
    papierkorb: [
      { eintrag_id: 'pk1', art: 'aufgabe', objekt_id: 'a_weg', titel: 'Gelöscht privat', geloescht_von: 'm_lillien', geloescht_am: new Date().toISOString(), daten: { aufgabe_id: 'a_weg', titel: 'Gelöscht privat', privat: true, erstellt_von: 'm_lillien', bearbeiter: ['m_lillien'] } },
      { eintrag_id: 'pk2', art: 'aufgabe', objekt_id: 'a_weg2', titel: 'Gelöscht offen', geloescht_von: 'm_lillien', geloescht_am: new Date().toISOString(), daten: { aufgabe_id: 'a_weg2', titel: 'Gelöscht offen', erstellt_von: 'm_lillien' } }
    ]
  };
}
function lauf(code, knoten) {
  const $ = n => {
    if (!(n in knoten)) throw new Error('Knoten nicht nachgebildet: ' + n);
    const v = knoten[n];
    return { first: () => ({ json: Array.isArray(v) ? v[0] : v }), all: () => (Array.isArray(v) ? v : [v]).map(json => ({ json })) };
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext('(function(){\n' + code + '\n})()', { $ })));
}
const anfrage = (wer, aktion, d, D) => lauf(ANFRAGE, { 'Team-API': { body: { token: TOK[wer], aktion, daten: d } }, 'Team-Daten laden': D || daten() })[0].json;
const ICH = { m_timo: ['Timo (Test)', 'admin'], m_kurt: ['Kurt (Test)', 'dozent'], m_lillien: ['Lillien (Test)', 'team'], m_murat: ['Murat (Test)', 'vertrieb'], 'agent-claude': ['Claude', 'agent'], 'agent-codex': ['Codex', 'agent'] };
const antwort = wer => lauf(ANTWORT, { 'Anfrage prüfen': { weiter: 1, ich: { mitglied_id: wer, name: ICH[wer][0], rolle: ICH[wer][1], status: 'aktiv' } }, 'Team-Daten laden': daten(),
  'Lernstand lesen': [], 'Chatfragen lesen': [], 'Anfragen lesen': [] })[0].json.antwort;
const zeile = (j, tab) => (j.ops || []).find(o => o.pfad.startsWith(tab));
const verlaufe = j => (j.ops || []).filter(o => o.pfad === 'team_aufgaben_verlauf').map(o => o.body.text);

test('Laden: Menschen sehen private Aufgaben nur als Ersteller oder Bearbeiter, Timo (Admin) nicht', () => {
  const ids = wer => antwort(wer).aufgaben.map(a => a.aufgabe_id).sort();
  assert.deepEqual(ids('m_timo'), ['a_offen', 'a_timo']);
  assert.deepEqual(ids('m_lillien'), ['a_offen', 'a_priv'], 'Ersteller');
  assert.deepEqual(ids('m_kurt'), ['a_offen', 'a_priv'], 'Bearbeiter');
  assert.deepEqual(ids('m_murat'), ['a_alt', 'a_offen'], 'alte Aufgabe ohne Liste: Feld verantwortlich zählt');
});

test('Laden: Verlauf privater Aufgaben nur für Berechtigte', () => {
  const texte = wer => antwort(wer).verlauf.map(v => v.text);
  assert.deepEqual(texte('m_timo'), ['sichtbar', 'Bericht an Timo']);
  assert.deepEqual(texte('m_murat'), ['sichtbar']);
  assert.deepEqual(texte('m_kurt'), ['sichtbar', 'geheimer Kommentar']);
  const alles = JSON.stringify(antwort('m_timo'));
  assert.equal(alles.includes('Geburtstagsgeschenk') || alles.includes('Nicht verraten') || alles.includes('geheimer Kommentar'), false, 'nichts von a_priv in Timos Antwort');
});

test('Laden für Agenten: eigene private Aufgabe ja (meine_aufgaben, agent_geeignet), fremde nein', () => {
  const c = antwort('agent-claude'), x = antwort('agent-codex');
  assert.deepEqual(c.aufgaben.map(a => a.aufgabe_id).sort(), ['a_offen', 'a_timo']);
  assert.deepEqual(c.meine_aufgaben, ['a_timo']); assert.deepEqual(c.agent_geeignet, ['a_timo']);
  assert.match(c.regeln, /privat: true/);
  assert.deepEqual(x.aufgaben.map(a => a.aufgabe_id), ['a_offen']);
  assert.deepEqual(x.agent_geeignet, []);
  assert.equal(JSON.stringify(x).includes('Bericht an Timo'), false);
});

test('Schreiben: fremde private Aufgabe gibt es nicht (404) – speichern, kommentieren, löschen, auch für Timo', () => {
  for (const [wer, aktion, d] of [['m_timo', 'aufgabe_speichern', { aufgabe_id: 'a_priv', titel: 'Übernommen' }], ['m_timo', 'kommentar', { aufgabe_id: 'a_priv', text: 'Hallo' }],
    ['m_timo', 'aufgabe_loeschen', { aufgabe_id: 'a_priv' }], ['m_murat', 'kommentar', { aufgabe_id: 'a_priv', text: 'Hallo' }], ['agent-codex', 'aufgabe_speichern', { aufgabe_id: 'a_timo', titel: 'Fremd' }]]) {
    const j = anfrage(wer, aktion, d);
    assert.equal(j.code, 404, wer + ' ' + aktion); assert.equal(j.weiter, 0);
  }
  assert.equal(anfrage('m_kurt', 'kommentar', { aufgabe_id: 'a_priv', text: 'Als Bearbeiter darf ich' }).weiter, 2);
  assert.equal(anfrage('agent-claude', 'kommentar', { aufgabe_id: 'a_timo', text: 'Bericht' }).weiter, 2);
});

test('Schreiben: Haken privat setzen und wieder lösen, mit Verlaufseintrag; alte Programme lassen ihn unverändert', () => {
  const neu = anfrage('m_timo', 'aufgabe_speichern', { titel: 'Nur für mich', bearbeiter: ['m_timo'], privat: true, skala: 10, prio: 3 });
  assert.equal(zeile(neu, 'team_aufgaben').body.privat, true);
  assert.deepEqual(verlaufe(neu), ['Angelegt (privat)']);
  const auf = anfrage('m_lillien', 'aufgabe_speichern', { aufgabe_id: 'a_priv', titel: 'Geheimes Geburtstagsgeschenk', privat: false, skala: 10, prio: 2 });
  assert.equal(zeile(auf, 'team_aufgaben').body.privat, false);
  assert.deepEqual(verlaufe(auf), ['Für das ganze Team sichtbar gemacht']);
  const zu = anfrage('m_timo', 'aufgabe_speichern', { aufgabe_id: 'a_offen', titel: 'Für alle', privat: true, skala: 10, prio: 5 });
  assert.deepEqual(verlaufe(zu), ['🔒 Privat: nur Ersteller und Bearbeiter sehen die Aufgabe']);
  const altesProgramm = anfrage('m_kurt', 'aufgabe_speichern', { aufgabe_id: 'a_priv', titel: 'Geheimes Geburtstagsgeschenk', prio: 1 });
  assert.equal('privat' in zeile(altesProgramm, 'team_aufgaben').body, false, 'ohne Feld bleibt der Wert in Supabase');
  assert.deepEqual(verlaufe(altesProgramm), []);
});

test('Label „⚖️ Entscheidung“ ist erlaubt', () => {
  assert.equal(zeile(anfrage('m_lillien', 'aufgabe_speichern', { titel: 'Stundennachweis November', label: '⚖️ Entscheidung', bearbeiter: ['m_timo'] }), 'team_aufgaben').body.label, '⚖️ Entscheidung');
});

test('Zeiten: Timo bearbeitet Lilliens Eintrag – die verknüpfte private Aufgabe bleibt; neu verknüpfen kann er sie nicht', () => {
  const basis = { zeit_id: 'z1', datum: heute, von: '08:00', bis: '09:30', pause_min: 0, taetigkeit: 'Geschenk besorgt und eingepackt' };
  const r = zeile(anfrage('m_timo', 'zeit_speichern', Object.assign({ aufgaben_ids: ['a_priv', 'a_offen'] }, basis)), 'team_zeiten').body;
  assert.deepEqual(r.aufgaben_ids, ['a_priv', 'a_offen']); assert.equal(r.aufgabe_id, 'a_priv');
  const neu = zeile(anfrage('m_timo', 'zeit_speichern', { datum: heute, von: '10:00', bis: '11:00', taetigkeit: 'Versuch', aufgaben_ids: ['a_priv'] }), 'team_zeiten').body;
  assert.deepEqual(neu.aufgaben_ids, []);
});

test('Projekt umbenennen/löschen: Nutzung durch private Aufgaben zählt mit (sonst würden sie verwaisen)', () => {
  const D = daten();
  const j = anfrage('m_timo', 'projekt_loeschen', { projekt_id: 'p3' }, D);
  assert.equal(j.code, 400);
});

test('Papierkorb: gelöschte private Aufgabe nur für Berechtigte, auch nicht für Timo', () => {
  const timo = anfrage('m_timo', 'papierkorb', {}).antwort.eintraege.map(e => e.eintrag_id);
  assert.deepEqual(timo, ['pk2']);
  assert.deepEqual(anfrage('m_lillien', 'papierkorb', {}).antwort.eintraege.map(e => e.eintrag_id), ['pk1', 'pk2']);
  assert.equal(anfrage('m_timo', 'papierkorb_wiederherstellen', { eintrag_id: 'pk1' }).code, 404);
  assert.equal(anfrage('m_lillien', 'papierkorb_wiederherstellen', { eintrag_id: 'pk1' }).weiter, 2);
});
