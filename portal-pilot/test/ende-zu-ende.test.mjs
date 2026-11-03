// (e) ENDE-ZU-ENDE gegen einen echten lokalen PostgreSQL: Testserver in der Betriebsart Postgres (Datenbank wird neu angelegt,
// Migrationen supabase/001…003 + 900, dazu 100 und 120 für die Modul-Tests), ECHTER Code der Portal-API (n8n/portal-api.workflow.json),
// Schreibzugriffe landen als SQL in den echten Tabellen. Ohne erreichbaren Postgres werden diese Tests übersprungen.
//
// Ablauf laut Auftrag: Login mit Seed-Token, laden (Musterfirma: 5 Mitglieder, 4 Projekte), Aufgabe anlegen als Team-Mitglied, Kommentar,
// als Admin erledigen, Konflikt 409 mit altem stand, Notiz mit Version, Vorschlag + Stimme, Papierkorb + Wiederherstellen, Mitglied anlegen
// (Token 48 Hex) und einloggen, Rollenverstoß 403, Modul aus → 403 modul_nicht_aktiviert, Modul an per team_einstellung_setzen → Zeiten-Aktion erlaubt.
// Feedbackschleife: der Agent „Claude (KI)“ aus dem Seed liest Vorschläge, beantwortet sie (Zeilen in team_vorschlaege), darf nichts löschen und
// nichts auf „Erledigt“ setzen, kommentiert (team_aufgaben_verlauf, art bericht), hängt an „Was sich geändert hat“ an (Versionen per Trigger);
// agent/feedback.mjs läuft als Prozess gegen denselben Server; der Workflow „Feedback lesen“ läuft mit echtem SQL (dev/n8n-laufzeit.mjs).
// Jeder Fall mit zwei Datensätzen. Nach jedem Schritt wird in der Datenbank (psql) nachgesehen, nicht nur in der API-Antwort.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serverStarten, api, postgresDa, feedbackWerkzeug, PILOT } from './hilfe.mjs';
import { join } from 'node:path';

const DB = process.env.PILOT_E2E_DB || 'pilot_e2e';
let S, ADMIN, BEN, CLARA, DAN, CLAUDE, da = false, psql;
const sql = text => { const r = psql(DB, text); return r.out.trim(); };
const zeile = text => { const t = sql(text); return t ? JSON.parse(t) : null; };
before(async () => {
  da = await postgresDa();
  if (!da) return;
  ({ psql } = await import('../dev/postgrest.mjs'));
  S = await serverStarten({ postgres: DB });
  ADMIN = S.tokens['mf-anna']; BEN = S.tokens['mf-ben']; CLARA = S.tokens['mf-clara']; DAN = S.tokens['mf-dan']; CLAUDE = S.tokens['mf-claude'];
});
after(async () => { if (S) await S.stop(); });
const t = (name, fn) => test(name, async tt => { if (!da) return tt.skip('kein PostgreSQL erreichbar (psql -d postgres): Ende-zu-Ende-Test übersprungen'); await fn(); });

t('Betriebsart Postgres: Datenbank aus den Migrationen, Seed-Token (48 Hex) aus der Tabelle, laden zeigt die Musterfirma', async () => {
  assert.equal(S.betriebsart, 'postgres');
  assert.equal(sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'team\\_%'`), '15', '10 Pflichttabellen + 100 (2) + 120 (3)');
  assert.match(ADMIN, /^[a-f0-9]{48}$/); assert.match(BEN, /^[a-f0-9]{48}$/); assert.notEqual(ADMIN, BEN);
  assert.equal((await api(S, '', 'laden')).status, 401); assert.equal((await api(S, ADMIN.slice(0, 47) + 'x', 'laden')).status, 401);
  const L = await api(S, BEN, 'laden'); assert.equal(L.status, 200);
  assert.equal(L.j.mitglieder.length, 5); assert.equal(L.j.projekte.length, 4); assert.equal(L.j.aufgaben.length, 12); assert.equal(L.j.notizen.length, 4); assert.equal(L.j.vorschlaege.length, 2);
  assert.deepEqual(L.j.projekte.map(p => p.name), ['Onboarding Pilot', 'Kundenanfragen', 'Interne Verbesserungen', 'Pilot-Verbesserungen'], 'Reihenfolge aus team_laden()');
  assert.equal(sql(`select rolle || '|' || typ || '|' || status from team_mitglieder where mitglied_id = 'mf-claude'`), 'agent|agent|aktiv', 'Agent aus dem Seed'); assert.match(CLAUDE, /^[a-f0-9]{48}$/);
  assert.equal(L.j.einstellungen.firma, 'Musterfirma GmbH'); assert.deepEqual(L.j.einstellungen.module, { zeit: false, social: false, system: false, kurs: false });
  assert.ok(L.j.mitglieder.every(m => !('token' in m))); assert.ok((await api(S, ADMIN, 'laden')).j.mitglieder.every(m => /^[a-f0-9]{48}$/.test(m.token)));
  assert.deepEqual(L.j.zeiten, [], 'Modul aus: Zeiten aus 100 werden nicht geliefert'); assert.equal(sql('select count(*) from team_zeiten'), '2', 'Beispielzeilen sind aber in der Tabelle');
  assert.equal((await api(S, DAN, 'laden')).j.setup, true, 'Dan ist eingeladen');
});

t('Aufgaben: Team-Mitglied legt zwei an (Zeilen in team_aufgaben und team_aufgaben_verlauf), Kommentar, Admin erledigt, Konflikt 409', async () => {
  const a1 = await api(S, BEN, 'aufgabe_speichern', { titel: 'E2E Aufgabe eins', beschreibung: 'Aus dem Ende-zu-Ende-Test', verantwortlich: 'mf-clara', deadline: '2030-02-01', prio: 1, projekt: 'Kundenanfragen', kommentar: 'Bitte übernehmen' });
  const a2 = await api(S, BEN, 'aufgabe_speichern', { titel: 'E2E Aufgabe zwei', prio: 3, projekt: 'Interne Verbesserungen', status: 'Geplant' });
  assert.equal(a1.status, 200); assert.equal(a2.status, 200); assert.match(a1.j.id, /^a_/); assert.notEqual(a1.j.id, a2.j.id);
  const r1 = zeile(`select to_jsonb(a) from team_aufgaben a where aufgabe_id = '${a1.j.id}'`);
  assert.equal(r1.titel, 'E2E Aufgabe eins'); assert.equal(r1.erstellt_von, 'mf-ben'); assert.equal(r1.geaendert_von, 'mf-ben'); assert.equal(r1.verantwortlich, 'mf-clara'); assert.equal(r1.prio, 1); assert.equal(r1.status, 'Offen');
  assert.equal(sql(`select string_agg(art || ':' || text, ' | ' order by id) from team_aufgaben_verlauf where aufgabe_id = '${a1.j.id}'`), 'status:Angelegt, zugewiesen an Clara Probe | kommentar:Bitte übernehmen');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = '${a2.j.id}'`), '1');
  // Kommentare (zwei) als Clara
  assert.equal((await api(S, CLARA, 'kommentar', { aufgabe_id: a1.j.id, text: 'Übernommen.' })).status, 200);
  assert.equal((await api(S, CLARA, 'kommentar', { aufgabe_id: a1.j.id, text: 'Erster Entwurf steht.' })).status, 200);
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = '${a1.j.id}' and art = 'kommentar' and autor = 'mf-clara'`), '2');
  assert.equal(sql(`select geaendert_von from team_aufgaben where aufgabe_id = '${a1.j.id}'`), 'mf-clara');
  // Admin erledigt mit Stand-Prüfung
  const t1 = (await api(S, ADMIN, 'laden')).j.aufgaben.find(a => a.aufgabe_id === a1.j.id);
  const e = await api(S, ADMIN, 'aufgabe_speichern', Object.assign({}, t1, { status: 'Erledigt', kommentar: 'Passt.', stand: t1.geaendert })); assert.equal(e.status, 200);
  const r1b = zeile(`select to_jsonb(a) from team_aufgaben a where aufgabe_id = '${a1.j.id}'`);
  assert.equal(r1b.status, 'Erledigt'); assert.ok(r1b.erledigt_am); assert.equal(r1b.geaendert_von, 'mf-anna');
  assert.ok(sql(`select string_agg(text, '|') from team_aufgaben_verlauf where aufgabe_id = '${a1.j.id}' and art = 'status'`).includes('Offen → Erledigt'));
  // Konflikt: Ben hat noch den alten Stand
  const k = await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1, { titel: 'Umbenannt', stand: t1.geaendert }));
  assert.equal(k.status, 409); assert.equal(k.j.konflikt, true); assert.match(k.j.fehler, /Anna Muster/);
  assert.equal(sql(`select titel from team_aufgaben where aufgabe_id = '${a1.j.id}'`), 'E2E Aufgabe eins', 'nichts überschrieben');
  const t1b = (await api(S, BEN, 'laden')).j.aufgaben.find(a => a.aufgabe_id === a1.j.id);
  assert.equal((await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1b, { titel: 'Umbenannt', stand: t1b.geaendert }))).status, 200);
  assert.equal(sql(`select titel from team_aufgaben where aufgabe_id = '${a1.j.id}'`), 'Umbenannt');
});

t('Notizen: zwei Änderungen sichern Versionen über den Datenbank-Trigger, Konflikt 409, doppelter Titel 400', async () => {
  const n = (await api(S, CLARA, 'laden')).j.notizen.find(x => x.notiz_id === 'mf-n2'); const alt = n.geaendert;
  assert.equal((await api(S, CLARA, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Clara.', projekt: n.projekt, stand: alt })).status, 200);
  const k = await api(S, BEN, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Ben.', projekt: n.projekt, stand: alt }); assert.equal(k.status, 409); assert.match(k.j.fehler, /Clara Probe/);
  assert.equal((await api(S, BEN, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Ben.', projekt: n.projekt, stand: alt, trotzdem: true })).status, 200);
  assert.equal(sql(`select count(*) from team_notiz_versionen where notiz_id = 'mf-n2'`), '2', 'Trigger team_notiz_version hat zwei Fassungen gesichert');
  const v = await api(S, ADMIN, 'notiz_versionen', { notiz_id: 'mf-n2' }); assert.equal(v.j.versionen.length, 2);
  assert.equal(v.j.versionen[0].geaendert_von_name, 'Clara Probe'); assert.ok(/Neu von Clara/.test(v.j.versionen[0].inhalt)); assert.equal(v.j.versionen[1].geaendert_von_name, 'Ben Beispiel');
  assert.equal(sql(`select geaendert_von from team_notizen where notiz_id = 'mf-n2'`), 'mf-ben');
  assert.equal((await api(S, BEN, 'notiz_speichern', { titel: 'Willkommen im Portal', inhalt: 'x' })).status, 400, 'Titel doppelt');
  const n1 = await api(S, BEN, 'notiz_speichern', { titel: 'E2E Notiz eins', inhalt: 'Inhalt eins', projekt: 'Kundenanfragen' });
  const n2 = await api(S, BEN, 'notiz_speichern', { titel: 'E2E Notiz zwei', inhalt: 'Inhalt zwei' });
  assert.equal(n1.status, 200); assert.equal(n2.status, 200);
  assert.equal(sql(`select count(*) from team_notizen where titel like 'E2E Notiz%' and autor = 'mf-ben'`), '2');
});

t('Vorschläge: zwei anlegen (stimmen = Verfasser), Stimmen umschalten (text[] in der Datenbank), Admin antwortet', async () => {
  const v1 = await api(S, CLARA, 'vorschlag_speichern', { titel: 'E2E Vorschlag eins', text: 'Text', bereich: 'Aufgaben' });
  const v2 = await api(S, CLARA, 'vorschlag_speichern', { titel: 'E2E Vorschlag zwei', text: '', bereich: 'Erfunden' });
  assert.equal(v1.status, 200); assert.equal(v2.status, 200);
  assert.equal(sql(`select bereich || '|' || status || '|' || array_to_string(stimmen, ',') from team_vorschlaege where vorschlag_id = '${v1.j.id}'`), 'Aufgaben|neu|mf-clara');
  assert.equal(sql(`select bereich from team_vorschlaege where vorschlag_id = '${v2.j.id}'`), 'Sonstiges', 'unbekannter Bereich → Sonstiges (Liste aus team_einstellungen)');
  await api(S, BEN, 'vorschlag_stimme', { vorschlag_id: v1.j.id }); await api(S, ADMIN, 'vorschlag_stimme', { vorschlag_id: v1.j.id }); await api(S, BEN, 'vorschlag_stimme', { vorschlag_id: v1.j.id });
  assert.equal(sql(`select array_to_string(stimmen, ',') from team_vorschlaege where vorschlag_id = '${v1.j.id}'`), 'mf-clara,mf-anna');
  assert.equal((await api(S, ADMIN, 'vorschlag_speichern', { vorschlag_id: v1.j.id, titel: 'E2E Vorschlag eins', text: 'Text', bereich: 'Aufgaben', status: 'geplant', antwort: 'Kommt.' })).status, 200);
  assert.equal(sql(`select status || '|' || antwort || '|' || antwort_von from team_vorschlaege where vorschlag_id = '${v1.j.id}'`), 'geplant|Kommt.|mf-anna');
  assert.equal((await api(S, CLARA, 'vorschlag_speichern', { vorschlag_id: v1.j.id, titel: 'nochmal' })).status, 403);
});

t('Papierkorb: zwei Aufgaben löschen (team_loeschen), nur eigene sehen, wiederherstellen samt Verlauf (team_wiederherstellen), Seed-Eintrag', async () => {
  const x1 = (await api(S, BEN, 'aufgabe_speichern', { titel: 'E2E löschen eins', kommentar: 'Kommentar davor' })).j.id;
  const x2 = (await api(S, BEN, 'aufgabe_speichern', { titel: 'E2E löschen zwei' })).j.id;
  assert.equal((await api(S, CLARA, 'aufgabe_loeschen', { aufgabe_id: x1 })).status, 403, 'nicht die Verfasserin');
  const l1 = await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: x1 }); assert.equal(l1.status, 200); assert.equal(l1.j.id, x1);
  assert.equal((await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: x2 })).status, 200);
  assert.equal(sql(`select count(*) from team_aufgaben where aufgabe_id in ('${x1}', '${x2}')`), '0');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = '${x1}'`), '0', 'Verlauf mitgelöscht (Cascade)');
  assert.equal(sql(`select jsonb_array_length(daten -> '_verlauf') from team_papierkorb where objekt_id = '${x1}'`), '2', 'Verlauf liegt im Papierkorb');
  const pk = await api(S, BEN, 'papierkorb'); assert.equal(pk.j.eintraege.length, 2); assert.ok(pk.j.eintraege.every(e => e.geloescht_von === 'mf-ben'));
  const e1 = pk.j.eintraege.find(e => e.objekt_id === x1); assert.equal(e1.kommentare, 2); assert.equal(e1.geloescht_von_name, 'Ben Beispiel');
  assert.equal((await api(S, ADMIN, 'papierkorb')).j.eintraege.length, 3, 'Admin: Seed-Eintrag + zwei');
  assert.equal((await api(S, CLARA, 'papierkorb_wiederherstellen', { eintrag_id: e1.eintrag_id })).status, 403);
  const w = await api(S, BEN, 'papierkorb_wiederherstellen', { eintrag_id: e1.eintrag_id }); assert.equal(w.status, 200); assert.equal(w.j.id, x1);
  assert.equal(sql(`select titel from team_aufgaben where aufgabe_id = '${x1}'`), 'E2E löschen eins');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = '${x1}'`), '2', 'Verlauf wieder da');
  assert.equal((await api(S, BEN, 'papierkorb_wiederherstellen', { eintrag_id: e1.eintrag_id })).status, 404);
  const w2 = await api(S, ADMIN, 'papierkorb_wiederherstellen', { eintrag_id: 'mf-pk1' }); assert.equal(w2.status, 200); assert.equal(w2.j.id, 'mf-a13');
  assert.equal(sql(`select count(*) from team_aufgaben_verlauf where aufgabe_id = 'mf-a13'`), '1');
  assert.equal(sql(`select count(*) from team_papierkorb`), '1');
});

t('Team: Admin legt zwei Mitglieder an (Token 48 Hex in team_mitglieder), neues Mitglied loggt sich ein und richtet sich ein, Rollenverstoß 403', async () => {
  const m1 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Erik Neu', funktion: 'Einkauf', rolle: 'team' });
  const m2 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Frida Fach', rolle: 'dozent' });
  assert.equal(m1.status, 200); assert.equal(m2.status, 200); assert.match(m1.j.id, /^m_/);
  const r1 = zeile(`select to_jsonb(m) from team_mitglieder m where mitglied_id = '${m1.j.id}'`);
  assert.match(r1.token, /^[a-f0-9]{48}$/); assert.equal(r1.status, 'eingeladen'); assert.equal(r1.rolle, 'team'); assert.equal(r1.typ, 'mensch');
  assert.equal(sql(`select rolle from team_mitglieder where mitglied_id = '${m2.j.id}'`), 'dozent');
  assert.equal(sql(`select count(distinct token) from team_mitglieder`), '7', 'alle Codes verschieden');
  const l = await api(S, r1.token, 'laden'); assert.equal(l.status, 200); assert.equal(l.j.setup, true);
  assert.equal((await api(S, r1.token, 'aufgabe_speichern', { titel: 'zu früh' })).status, 403);
  assert.equal((await api(S, r1.token, 'profil', { email: 'erik@example.invalid', telefon: '' })).status, 200);
  assert.equal(sql(`select status || '|' || email from team_mitglieder where mitglied_id = '${m1.j.id}'`), 'aktiv|erik@example.invalid');
  const l2 = await api(S, r1.token, 'laden'); assert.equal(l2.j.setup, undefined); assert.equal(l2.j.mitglieder.length, 7);
  // Rollenverstöße: Team-Mitglied verwaltet kein Team, löscht keine fremden Aufgaben, ändert keine fremden Projekte
  assert.equal((await api(S, r1.token, 'mitglied_speichern', { name: 'Eindringling' })).status, 403);
  assert.equal((await api(S, r1.token, 'aufgabe_loeschen', { aufgabe_id: 'mf-a03' })).status, 403);
  assert.equal((await api(S, r1.token, 'projekt_speichern', { projekt_id: 'mf-p1', name: 'Onboarding Pilot', status: 'pausiert' })).status, 403);
  assert.equal((await api(S, r1.token, 'projekt_loeschen', { projekt_id: 'mf-p3' })).status, 403);
  assert.equal(sql(`select status from team_projekte where projekt_id = 'mf-p1'`), 'aktiv');
  // neuer Link: alter Token in der Datenbank ersetzt
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: m1.j.id, name: 'Erik Neu', neuer_link: true })).status, 200);
  assert.equal((await api(S, r1.token, 'laden')).status, 401);
  assert.equal((await api(S, sql(`select token from team_mitglieder where mitglied_id = '${m1.j.id}'`), 'laden')).status, 200);
});

t('Module: aus → 403 modul_nicht_aktiviert; an per team_einstellung_setzen(\'module\', \'{"zeit": true}\') → zwei Zeiten in team_zeiten', async () => {
  const z = await api(S, BEN, 'zeit_speichern', { datum: '2026-01-05', von: '09:00', bis: '11:00', taetigkeit: 'Probe' });
  assert.equal(z.status, 403); assert.equal(z.j.modul_nicht_aktiviert, true);
  assert.equal((await api(S, BEN, 'social_speichern', { thema: 'Beitrag' })).j.modul_nicht_aktiviert, true);
  sql(`select team_einstellung_setzen('module', '{"zeit": true}')`);
  assert.deepEqual((await api(S, BEN, 'laden')).j.einstellungen.module, { zeit: true, social: false, system: false, kurs: false });
  const m = new Date(); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() - 1); const monat = m.toISOString().slice(0, 7);
  const z1 = await api(S, BEN, 'zeit_speichern', { datum: monat + '-04', von: '09:00', bis: '11:00', taetigkeit: 'Probe eins', projekt: 'Kundenanfragen' });
  const z2 = await api(S, BEN, 'zeit_speichern', { datum: monat + '-05', von: '13:00', bis: '14:30', pause_min: 15, taetigkeit: 'Probe zwei' });
  assert.equal(z1.status, 200); assert.equal(z2.status, 200); assert.match(z1.j.id, /^z_/);
  assert.equal(sql(`select string_agg(minuten::text, ',' order by datum) from team_zeiten where zeit_id in ('${z1.j.id}', '${z2.j.id}')`), '120,75');
  assert.equal(sql(`select count(*) from team_zeiten where mitglied_id = 'mf-ben' and status = 'offen'`), '3', 'Beispielzeile aus den Testdaten + zwei neue');
  assert.equal((await api(S, BEN, 'laden')).j.zeiten.length, 3, 'Modul an: Zeiten werden geliefert');
  assert.equal((await api(S, BEN, 'social_speichern', { thema: 'Beitrag' })).status, 403, 'Social bleibt aus');
  assert.equal((await api(S, ADMIN, 'woche_einreichen', { kw: '2020-W01' })).status, 400, 'Modul an, fachliche Prüfung greift');
});

t('Feedbackschleife: Agent liest Vorschläge (keine Codes), beantwortet zwei (team_vorschlaege: status, antwort, antwort_von), 403 bei Löschen, „Erledigt“ wird „Wird getestet“, kein „umgesetzt“', async () => {
  const l = await api(S, CLAUDE, 'laden'); assert.equal(l.status, 200); assert.equal(l.j.ich.rolle, 'agent');
  assert.ok(l.j.vorschlaege.length >= 2); assert.ok(l.j.mitglieder.every(m => !('token' in m) && !('email' in m)), 'keine fremden Codes, keine Kontaktdaten');
  assert.ok(l.j.vorschlaege.every(v => typeof v.stimmen_anzahl === 'number' && !('stimmen' in v)));
  const v1 = (await api(S, BEN, 'vorschlag_speichern', { titel: 'E2E Feedback eins', text: 'Bitte größere Schrift', bereich: 'Übersicht' })).j.id;
  const v2 = (await api(S, CLARA, 'vorschlag_speichern', { titel: 'E2E Feedback zwei', text: 'Sortierung nach Deadline', bereich: 'Aufgaben' })).j.id;
  assert.equal((await api(S, CLAUDE, 'vorschlag_speichern', { vorschlag_id: v1, status: 'nachfrage', antwort: 'Überall oder nur in der Liste?' })).status, 200);
  assert.equal((await api(S, CLAUDE, 'vorschlag_speichern', { vorschlag_id: v2, status: 'geplant', antwort: 'Kommt nächste Woche.' })).status, 200);
  assert.equal(sql(`select status || '|' || antwort || '|' || antwort_von || '|' || titel || '|' || bereich from team_vorschlaege where vorschlag_id = '${v1}'`), 'nachfrage|Überall oder nur in der Liste?|mf-claude|E2E Feedback eins|Übersicht');
  assert.equal(sql(`select status || '|' || antwort_von from team_vorschlaege where vorschlag_id = '${v2}'`), 'geplant|mf-claude');
  const T = (await api(S, BEN, 'laden')).j.vorschlaege.find(v => v.vorschlag_id === v1); assert.equal(T.status, 'nachfrage'); assert.equal(T.antwort_von, 'mf-claude', 'Team-Mitglied sieht Status und Antwort');
  assert.equal((await api(S, CLAUDE, 'vorschlag_speichern', { vorschlag_id: v1, status: 'umgesetzt' })).status, 403);
  assert.equal(sql(`select status from team_vorschlaege where vorschlag_id = '${v1}'`), 'nachfrage');
  assert.equal((await api(S, CLAUDE, 'vorschlag_loeschen', { vorschlag_id: v1 })).status, 403);
  assert.equal((await api(S, CLAUDE, 'aufgabe_loeschen', { aufgabe_id: 'mf-a04' })).status, 403);
  assert.equal((await api(S, CLAUDE, 'notiz_loeschen', { notiz_id: 'mf-n4' })).status, 403);
  assert.equal((await api(S, CLAUDE, 'mitglied_speichern', { name: 'Neu' })).status, 403);
  assert.equal(sql(`select count(*) from team_papierkorb`), '1', 'nichts im Papierkorb dazugekommen');
  const a = (await api(S, CLAUDE, 'laden')).j.aufgaben.find(x => x.aufgabe_id === 'mf-a04');
  assert.equal((await api(S, CLAUDE, 'aufgabe_speichern', Object.assign({}, a, { status: 'Erledigt', kommentar: 'Geprüft.', stand: a.geaendert }))).status, 200);
  assert.equal(sql(`select status || '|' || coalesce(erledigt_am::text, '-') from team_aufgaben where aufgabe_id = 'mf-a04'`), 'Wird getestet|-');
  assert.equal(sql(`select art from team_aufgaben_verlauf where aufgabe_id = 'mf-a04' and autor = 'mf-claude' and text = 'Geprüft.'`), 'bericht');
});

t('Feedbackschleife: zwei Kommentare des Agenten (art bericht), zweimal an „Was sich geändert hat“ anhängen (Trigger sichert zwei Fassungen), feedback.mjs als Prozess', async () => {
  assert.equal((await api(S, CLAUDE, 'kommentar', { aufgabe_id: 'mf-a06', text: 'Gelesen.' })).status, 200);
  assert.equal((await api(S, CLAUDE, 'kommentar', { aufgabe_id: 'mf-a08', text: 'Wir prüfen das.' })).status, 200);
  assert.equal(sql(`select string_agg(aufgabe_id || ':' || art, ',' order by aufgabe_id) from team_aufgaben_verlauf where autor = 'mf-claude' and aufgabe_id in ('mf-a06', 'mf-a08')`), 'mf-a06:bericht,mf-a08:bericht');
  assert.equal(sql(`select geaendert_von from team_aufgaben where aufgabe_id = 'mf-a06'`), 'mf-claude');
  const n = zeile(`select to_jsonb(n) from team_notizen n where notiz_id = 'mf-n4'`); assert.equal(n.titel, 'Was sich geändert hat'); assert.equal(n.projekt, 'Pilot-Verbesserungen');
  const umg = { PILOT_PORTAL_API: S.api, PILOT_AGENT_TOKEN: CLAUDE };
  const c1 = await feedbackWerkzeug(['aenderungen', '--text', 'Erster Eintrag aus dem Ende-zu-Ende-Test.'], umg); assert.equal(c1.code, 0, c1.err);
  const c2 = await feedbackWerkzeug(['aenderungen', '--text', 'Zweiter Eintrag.'], umg); assert.equal(c2.code, 0, c2.err);
  const n2 = zeile(`select to_jsonb(n) from team_notizen n where notiz_id = 'mf-n4'`);
  assert.ok(/Erster Eintrag aus dem Ende-zu-Ende-Test\.[\s\S]*Zweiter Eintrag\./.test(n2.inhalt)); assert.equal(n2.geaendert_von, 'mf-claude');
  assert.ok(n2.inhalt.endsWith('— Claude (KI-Werkzeug von Herm' + 'etikmarketing)'), 'Unterschrift am Ende');
  assert.equal(sql(`select count(*) from team_notiz_versionen where notiz_id = 'mf-n4'`), '2', 'Trigger hat zwei Fassungen gesichert');
  const l = await feedbackWerkzeug(['lesen'], umg); assert.equal(l.code, 0, l.err);
  assert.match(l.out, /VORSCHLÄGE MIT RÜCKFRAGE, warten auf den Verfasser \(1\)/); assert.match(l.out, /Antwort \(agent\): Überall oder nur in der Liste\?/);
  for (const name of ['Anna Muster', 'Ben Beispiel', 'Clara Probe', 'Dan Test', 'Erik Neu', 'musterfirma.example']) assert.ok(!l.out.includes(name), 'kein Name: ' + name);
  assert.equal((await feedbackWerkzeug(['antworten', 'mf-v1', '--status', 'abgelehnt', '--text', 'Dunkler Modus kommt im Pilot nicht.'], umg)).code, 0);
  assert.equal(sql(`select status || '|' || antwort_von from team_vorschlaege where vorschlag_id = 'mf-v1'`), 'abgelehnt|mf-claude');
  const unterschrift = '— Claude (KI-Werkzeug von Herm' + 'etikmarketing)';
  assert.equal(sql(`select count(*) from team_vorschlaege where vorschlag_id = 'mf-v1' and antwort like '%${unterschrift}'`), '1');
});

t('Workflow „Feedback lesen“ (n8n/optional) mit echtem SQL: Vorschläge (neu oder 7 Tage), Kommentare (7 Tage), Störungsnotiz (14 Tage); Rollen statt Namen', async () => {
  const { ladeWorkflow, ausfuehren } = await import('../dev/n8n-laufzeit.mjs');
  const { PostgresRest } = await import('../dev/postgrest.mjs');
  const rest = new PostgresRest(DB);
  sql(`insert into team_notizen (notiz_id, titel, inhalt, projekt, autor, geaendert_von) values ('n_stoerung_e2e', 'Störung 01.01.2027', E'Automatische Störungsmeldungen des Portals. Neueste unten.\n\n### 08:15 Uhr – PORTAL: Portal-API (Pilot)\n- Knoten: Team-Daten laden\n- Meldung: timeout', 'Onboarding Pilot', 'mf-anna', 'mf-anna')`);
  sql(`insert into team_notizen (notiz_id, titel, inhalt, autor, geaendert_von, geaendert) values ('n_alt', 'Störung 01.01.2020', 'alt', 'mf-anna', 'mf-anna', now() - interval '20 days')`);
  const aufrufe = [];
  const r = await ausfuehren(ladeWorkflow(join(PILOT, 'n8n', 'optional', 'feedback-lesen.workflow.json')), {}, rest, { ohneAntwort: true, aufrufe });
  assert.deepEqual(r.protokoll, ['Von Hand starten', 'Zeitfenster', 'Vorschläge', 'Verlauf', 'Aufgaben', 'Störungsnotizen', 'Mitglieder', 'Liste bauen']);
  assert.ok(aufrufe.every(a => a.methode === 'GET' && a.status === 200), JSON.stringify(aufrufe));
  const out = r.antwort[0]; const E = out.eintraege;
  assert.ok(out.zusammenfassung.vorschlaege_gesamt >= 4, 'Seed-Vorschläge plus zwei aus dem Test');
  assert.equal(out.zusammenfassung.stoerungen, 1, 'nur die Störung der letzten 14 Tage'); assert.ok(E.some(e => e.art === 'stoerung' && e.id === 'n_stoerung_e2e' && /timeout/.test(e.text) && e.meldungen === 1));
  assert.ok(E.some(e => e.art === 'bericht' && e.rolle === 'agent' && /Gelesen/.test(e.text) && e.titel === 'Rückruf Probe KG vereinbaren'), 'Kommentar des Agenten mit Aufgabentitel');
  assert.ok(E.some(e => e.art === 'vorschlag' && e.status === 'nachfrage' && e.rolle === 'team' && e.antwort_von_rolle === 'agent'));
  assert.ok(E.every(e => ['admin', 'team', 'agent', 'dozent', 'vertrieb', 'unbekannt'].includes(e.rolle)));
  const text = JSON.stringify(out);
  for (const name of ['Anna Muster', 'Ben Beispiel', 'Clara Probe', 'Dan Test', 'Erik Neu', 'Frida Fach', 'Claude (KI)', '@musterfirma', 'token']) assert.ok(!text.includes(name), 'nicht in der Ausgabe: ' + name);
  assert.ok(!E.some(e => e.art === 'status'), 'Statuswechsel sind keine Rückmeldungen');
  sql(`delete from team_notizen where notiz_id in ('n_stoerung_e2e', 'n_alt')`);
});
