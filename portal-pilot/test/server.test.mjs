// (c) Testserver (Betriebsart Speicher) mit dem ECHTEN Code der Portal-API: Login, Laden, Rollen, Aufgaben, Konflikte, Papierkorb,
// Notizen, Vorschläge, Team, Module (403 „Modul nicht aktiviert“ und Einschalten), Arbeitszeit, Social, Systeme, KI-Agent, Reset.
// Immer mindestens zwei Datensätze hintereinander. Antwortform der API: Schreiben liefert nur { ok, id }.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serverStarten, api } from './hilfe.mjs';

let S, ADMIN, BEN, CLARA, DAN;
before(async () => { S = await serverStarten(); ADMIN = S.tokens['mf-anna']; BEN = S.tokens['mf-ben']; CLARA = S.tokens['mf-clara']; DAN = S.tokens['mf-dan']; });
after(async () => { if (S) await S.stop(); });

test('Login: falscher oder fehlender Code → 401, unbekannte Aktion → 400, Webhook-Pfad anderer Register → 404', async () => {
  assert.equal(S.betriebsart, 'speicher');
  assert.equal((await api(S, '', 'laden')).status, 401);
  assert.equal((await api(S, 'ab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef3f', 'laden')).status, 401);
  assert.equal((await api(S, 'kein-hex', 'laden')).status, 401);
  assert.equal((await api(S, ADMIN.slice(0, 19), 'laden')).status, 401, 'zu kurz');
  const u = await api(S, BEN, 'gibt_es_nicht'); assert.equal(u.status, 400); assert.equal(u.j.ok, false); assert.match(u.j.fehler, /Unbekannte Aktion/);
  const r = await fetch(S.base + '/webhook/PILOTKUERZEL/team-assistent', { method: 'POST', body: '{}' }); assert.equal(r.status, 404);
  const z = await S.zustand(); assert.equal(z.treffer['PILOTKUERZEL/team-assistent'], 1, 'Testserver zählt fremde Webhook-Aufrufe');
  // Body als application/json (wie curl) geht genauso wie text/plain (wie der Browser)
  const j = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: BEN, aktion: 'laden' }) }); assert.equal(j.status, 200);
});

test('laden: Team-Mitglied sieht keine Codes, Admin sieht 48-stellige Codes; Felder und Einstellungen wie die echte Portal-API', async () => {
  const b = await api(S, BEN, 'laden');
  assert.equal(b.status, 200); assert.equal(b.j.ok, true); assert.equal(b.j.ich.name, 'Ben Beispiel'); assert.equal(b.j.ich.rolle, 'team');
  for (const f of ['ich', 'mitglieder', 'projekte', 'aufgaben', 'verlauf', 'notizen', 'social', 'systeme', 'vorschlaege', 'stand', 'zeiten', 'abrechnung', 'community', 'kurs', 'anfragen', 'einstellungen']) assert.ok(f in b.j, 'Feld ' + f);
  assert.equal(b.j.mitglieder.length, 4); assert.ok(b.j.mitglieder.every(m => !('token' in m)), 'keine Codes für Team-Mitglieder');
  assert.equal(b.j.projekte.length, 3); assert.equal(b.j.aufgaben.length, 12); assert.equal(b.j.notizen.length, 3); assert.equal(b.j.vorschlaege.length, 2);
  assert.deepEqual([...new Set(b.j.aufgaben.map(a => a.status))].sort(), ['Erledigt', 'Geplant', 'In Arbeit', 'Offen', 'Wartet', 'Wird getestet'], 'alle Status vertreten');
  assert.deepEqual(b.j.zeiten, [], 'Modul Arbeitszeit aus: keine Zeiten'); assert.deepEqual(b.j.social, []); assert.deepEqual(b.j.systeme, []);
  assert.equal(b.j.einstellungen.firma, 'Musterfirma GmbH'); assert.equal(b.j.einstellungen.kurzname, 'Musterfirma');
  assert.deepEqual(b.j.einstellungen.module, { zeit: false, social: false, system: false, kurs: false });
  assert.deepEqual(b.j.einstellungen.rollen.map(r => r.rolle), ['admin', 'team', 'dozent', 'vertrieb', 'agent']);
  assert.deepEqual(b.j.einstellungen.vorschlag_bereiche, ['Übersicht', 'Aufgaben', 'Projekte', 'Notizen', 'Vorschläge', 'Team', 'Sonstiges']);
  assert.ok(b.j.aufgaben.every(a => ['', '🔥 Hohe Prio', '🐸 Eat the Frog', '💬 Zu besprechen', '🛑 Blockiert', 'wartet auf..', '🗂️ Zu klären', 'Übergabe an Kunden'].includes(a.label)), 'Labels aus der Liste der API');
  const a = await api(S, ADMIN, 'laden');
  assert.ok(a.j.mitglieder.every(m => /^[a-f0-9]{48}$/.test(m.token)), 'Admin sieht 48-stellige Codes (für „Link kopieren“)');
  const d = await api(S, DAN, 'laden'); assert.equal(d.status, 200); assert.equal(d.j.setup, true, 'eingeladene Person: nur Einrichtung');
});

test('Aufgaben: zwei Datensätze als Team-Mitglied anlegen, Admin erledigt mit Kommentar, Verlauf und geaendert_von stimmen', async () => {
  const a1 = await api(S, BEN, 'aufgabe_speichern', { titel: 'Testaufgabe eins', beschreibung: 'Erste', verantwortlich: 'mf-clara', deadline: '2030-01-15', prio: 1, status: 'Offen', projekt: 'Interne Verbesserungen', label: '', agent_geeignet: false, kommentar: 'Bitte übernehmen' });
  assert.equal(a1.status, 200); assert.deepEqual(Object.keys(a1.j).sort(), ['id', 'ok'], 'Schreiben liefert nur ok und id'); assert.match(a1.j.id, /^a_[a-z0-9]+$/);
  const a2 = await api(S, BEN, 'aufgabe_speichern', { titel: 'Testaufgabe zwei', verantwortlich: 'mf-ben', prio: 2, status: 'Geplant', projekt: 'Interne Verbesserungen' });
  assert.equal(a2.status, 200); assert.notEqual(a2.j.id, a1.j.id, 'zweiter Datensatz hat eigene ID');
  let L = (await api(S, CLARA, 'laden')).j;
  const t1 = L.aufgaben.find(a => a.aufgabe_id === a1.j.id), t2 = L.aufgaben.find(a => a.aufgabe_id === a2.j.id);
  assert.ok(t1 && t2, 'beide Aufgaben sichtbar'); assert.equal(t1.erstellt_von, 'mf-ben'); assert.equal(t1.verantwortlich, 'mf-clara'); assert.equal(t1.geaendert_von, 'mf-ben'); assert.equal(t2.status, 'Geplant');
  assert.equal(L.verlauf.filter(v => v.aufgabe_id === a1.j.id && v.art === 'kommentar').length, 1, 'Kommentar beim Anlegen gespeichert');
  assert.ok(L.verlauf.some(v => v.aufgabe_id === a1.j.id && v.art === 'status' && /zugewiesen an Clara Probe/.test(v.text)));
  // Mindestlänge 3, unbekanntes Projekt → Sonstiges, unbekannte Person → ich selbst
  assert.equal((await api(S, BEN, 'aufgabe_speichern', { titel: '   ' })).status, 400);
  assert.equal((await api(S, BEN, 'aufgabe_speichern', { titel: 'xy' })).status, 400, 'Titel braucht 3 Zeichen');
  const a3 = await api(S, BEN, 'aufgabe_speichern', { titel: 'Drei', verantwortlich: 'm_niemand', projekt: 'Gibt es nicht' }); assert.equal(a3.status, 200);
  L = (await api(S, BEN, 'laden')).j; const t3 = L.aufgaben.find(a => a.aufgabe_id === a3.j.id); assert.equal(t3.verantwortlich, 'mf-ben'); assert.equal(t3.projekt, 'Sonstiges');
  // Admin erledigt die erste (mit Stand-Prüfung)
  const e = await api(S, ADMIN, 'aufgabe_speichern', Object.assign({}, t1, { status: 'Erledigt', kommentar: 'Freigegeben: passt', stand: t1.geaendert }));
  assert.equal(e.status, 200);
  L = (await api(S, BEN, 'laden')).j;
  const t1b = L.aufgaben.find(a => a.aufgabe_id === a1.j.id);
  assert.equal(t1b.status, 'Erledigt'); assert.ok(t1b.erledigt_am, 'erledigt_am gesetzt'); assert.equal(t1b.geaendert_von, 'mf-anna');
  const V = L.verlauf.filter(v => v.aufgabe_id === a1.j.id);
  assert.ok(V.some(v => v.art === 'status' && /Offen → Erledigt/.test(v.text)), 'Statuswechsel im Verlauf');
  assert.ok(V.some(v => v.art === 'kommentar' && v.autor === 'mf-anna' && /passt/.test(v.text)), 'Kommentar des Admins im Verlauf');
  // Gleichzeitig bearbeitet: alter Stand → 409 mit konflikt, mit trotzdem → ok
  const k = await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1b, { titel: 'Umbenannt', stand: t1.geaendert }));
  assert.equal(k.status, 409); assert.equal(k.j.konflikt, true); assert.match(k.j.fehler, /Anna Muster/); assert.equal(k.j.geaendert, t1b.geaendert);
  assert.equal((await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1b, { titel: 'Umbenannt', stand: t1.geaendert, trotzdem: true }))).status, 200);
  // Kommentar einzeln (zwei), Mindestlänge, unbekannte Aufgabe
  const c = await api(S, CLARA, 'kommentar', { aufgabe_id: a2.j.id, text: 'Ich helfe mit.' }); assert.equal(c.status, 200); assert.equal(c.j.id, a2.j.id);
  assert.equal((await api(S, CLARA, 'kommentar', { aufgabe_id: a2.j.id, text: 'Zweiter Kommentar.' })).status, 200);
  assert.equal((await api(S, CLARA, 'kommentar', { aufgabe_id: a2.j.id, text: 'x' })).status, 400);
  assert.equal((await api(S, CLARA, 'kommentar', { aufgabe_id: 'a_fehlt', text: 'xx' })).status, 404);
  L = (await api(S, BEN, 'laden')).j; assert.equal(L.verlauf.filter(v => v.aufgabe_id === a2.j.id && v.art === 'kommentar').length, 2); assert.equal(L.aufgaben.find(a => a.aufgabe_id === a2.j.id).geaendert_von, 'mf-clara');
});

test('Rollen: Team-Mitglied darf fremde Aufgaben nicht löschen, Team nicht verwalten, fremde Projekte nicht ändern → 403; Module aus → 403 modul_nicht_aktiviert', async () => {
  const v = await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: 'mf-a03' });      // angelegt von Anna
  assert.equal(v.status, 403); assert.equal(v.j.ok, false); assert.match(v.j.fehler, /Leitung/);
  assert.equal((await api(S, BEN, 'mitglied_speichern', { name: 'Eindringling' })).status, 403);
  assert.equal((await api(S, BEN, 'projekt_speichern', { projekt_id: 'mf-p1', name: 'Onboarding Pilot', status: 'pausiert' })).status, 403);
  assert.equal((await api(S, BEN, 'projekt_loeschen', { projekt_id: 'mf-p3' })).status, 403);
  for (const [aktion, daten] of [['zeiten_pruefen', { mitglied_id: 'mf-clara', kw: '2026-W44', entscheidung: 'freigegeben' }], ['zeit_speichern', { datum: '2026-01-05' }], ['system_speichern', { name: 'Neu' }], ['social_speichern', { thema: 'Beitrag' }], ['tn_speichern', { name: 'Person' }]]) {
    const m = await api(S, ADMIN, aktion, daten); assert.equal(m.status, 403, aktion); assert.equal(m.j.modul_nicht_aktiviert, true, aktion); assert.match(m.j.fehler, /Modul nicht aktiviert/);
  }
  assert.equal((await api(S, BEN, 'vorschlag_speichern', { vorschlag_id: 'mf-v2', titel: 'Fremd geändert' })).status, 403, 'fremder Vorschlag, nicht mehr neu');
  assert.equal((await api(S, DAN, 'aufgabe_speichern', { titel: 'zu früh' })).status, 403, 'eingeladene Person darf nur profil');
  const ok = await api(S, CLARA, 'projekt_speichern', { projekt_id: 'mf-p2', name: 'Kundenanfragen', status: 'pausiert', beschreibung: 'Pause', farbe: '#2a9d8f', verantwortlich: 'mf-clara' });
  assert.equal(ok.status, 200, 'Verantwortliche darf');
  const L = (await api(S, BEN, 'laden')).j; assert.equal(L.projekte.find(p => p.projekt_id === 'mf-p2').status, 'pausiert');
});

test('Projekte: zwei neue Projekte, doppelter Name abgelehnt, Link ohne https → 400, Admin-Löschung nur ohne Aufgaben', async () => {
  const p1 = await api(S, BEN, 'projekt_speichern', { name: 'Testprojekt A' }); assert.equal(p1.status, 200); assert.match(p1.j.id, /^j_/);
  const p2 = await api(S, CLARA, 'projekt_speichern', { name: 'Testprojekt B', links: [{ titel: 'Doku', url: 'https://www.example.com/doku' }] });
  assert.equal(p2.status, 200); assert.notEqual(p2.j.id, p1.j.id);
  assert.equal((await api(S, BEN, 'projekt_speichern', { name: 'testprojekt a' })).status, 400, 'Name doppelt (Groß/Klein egal)');
  assert.equal((await api(S, BEN, 'projekt_speichern', { name: 'x' })).status, 400, 'Name braucht 2 Zeichen');
  const schlecht = await api(S, BEN, 'projekt_speichern', { name: 'Testprojekt C', links: [{ titel: 'kaputt', url: 'javascript:alert(1)' }] });
  assert.equal(schlecht.status, 400); assert.match(schlecht.j.fehler, /https/);
  assert.equal((await api(S, BEN, 'projekt_speichern', { name: 'Testprojekt D', links: [{ url: 'https://www.example.com/?token=geheim' }] })).status, 400, 'Zugangsdaten im Link');
  const L = (await api(S, BEN, 'laden')).j;
  assert.equal(L.projekte.filter(p => /^Testprojekt/.test(p.name)).length, 2);
  assert.deepEqual(L.projekte.find(p => p.projekt_id === p2.j.id).links, [{ titel: 'Doku', url: 'https://www.example.com/doku' }]);
  assert.equal((await api(S, ADMIN, 'projekt_loeschen', { projekt_id: 'mf-p1' })).status, 400, 'mit Aufgaben nicht löschbar');
  assert.equal((await api(S, ADMIN, 'projekt_loeschen', { projekt_id: p2.j.id })).status, 200);
  assert.equal((await api(S, ADMIN, 'projekt_loeschen', { projekt_id: p2.j.id })).status, 404, 'zweimal löschen geht nicht');
});

test('Papierkorb: eigene Aufgabe löschen, nur eigene Einträge sehen, wiederherstellen samt Verlauf; Admin sieht alles', async () => {
  const neu = (await api(S, BEN, 'aufgabe_speichern', { titel: 'Wird gleich gelöscht', kommentar: 'Kommentar vor dem Löschen' })).j.id;
  const neu2 = (await api(S, BEN, 'aufgabe_speichern', { titel: 'Wird auch gelöscht' })).j.id;
  const l = await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: neu }); assert.equal(l.status, 200); assert.equal(l.j.id, neu);
  assert.equal((await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: neu2 })).status, 200);
  assert.ok(!(await api(S, BEN, 'laden')).j.aufgaben.some(a => a.aufgabe_id === neu), 'weg aus der Liste');
  const pk = await api(S, BEN, 'papierkorb'); assert.equal(pk.status, 200); assert.equal(pk.j.tage, 30);
  assert.equal(pk.j.eintraege.length, 2, 'Ben sieht genau seine zwei Einträge'); assert.ok(pk.j.eintraege.every(x => x.geloescht_von === 'mf-ben'));
  const e = pk.j.eintraege.find(x => x.objekt_id === neu);
  assert.ok(e, 'eigener Eintrag im Papierkorb'); assert.equal(e.art_name, 'Aufgabe'); assert.equal(e.geloescht_von_name, 'Ben Beispiel'); assert.equal(e.kommentare, 2, 'Angelegt-Eintrag und Kommentar'); assert.ok(e.endgueltig_ab > e.geloescht_am);
  const pkA = await api(S, ADMIN, 'papierkorb'); assert.equal(pkA.j.eintraege.length, 3, 'Admin sieht alle (vorbelegt + zwei neue)');
  assert.equal((await api(S, CLARA, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id })).status, 403, 'fremden Eintrag nicht zurückholen');
  const w = await api(S, BEN, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id }); assert.equal(w.status, 200); assert.equal(w.j.id, neu);
  const L = (await api(S, BEN, 'laden')).j;
  assert.ok(L.aufgaben.some(a => a.aufgabe_id === neu), 'wieder da'); assert.equal(L.verlauf.filter(v => v.aufgabe_id === neu).length, 2, 'Verlauf kam mit zurück');
  assert.equal((await api(S, BEN, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id })).status, 404, 'zweimal geht nicht');
  // vorbelegter Eintrag aus dem Seed: Admin stellt wieder her
  const w2 = await api(S, ADMIN, 'papierkorb_wiederherstellen', { eintrag_id: 'mf-pk1' }); assert.equal(w2.status, 200); assert.equal(w2.j.id, 'mf-a13');
  const L2 = (await api(S, ADMIN, 'laden')).j; assert.ok(L2.aufgaben.some(a => a.aufgabe_id === 'mf-a13')); assert.equal(L2.verlauf.filter(v => v.aufgabe_id === 'mf-a13').length, 1);
  assert.equal((await api(S, ADMIN, 'papierkorb')).j.eintraege.length, 1);
});

test('Notizen: Konflikt bei altem Stand (409), Versionen werden gesichert, Titel eindeutig, Löschen nur Autor oder Admin', async () => {
  const n = (await api(S, CLARA, 'laden')).j.notizen.find(x => x.notiz_id === 'mf-n2');
  const alt = n.geaendert;
  const s1 = await api(S, CLARA, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Clara.', projekt: n.projekt, stand: alt });
  assert.equal(s1.status, 200); assert.equal(s1.j.id, 'mf-n2');
  const k = await api(S, BEN, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Ben.', projekt: n.projekt, stand: alt });
  assert.equal(k.status, 409); assert.equal(k.j.konflikt, true); assert.match(k.j.fehler, /Clara Probe/);
  assert.equal((await api(S, BEN, 'notiz_speichern', { notiz_id: 'mf-n2', titel: n.titel, inhalt: n.inhalt + '\n5. Neu von Ben.', projekt: n.projekt, stand: alt, trotzdem: true })).status, 200);
  const v = await api(S, BEN, 'notiz_versionen', { notiz_id: 'mf-n2' }); assert.equal(v.status, 200);
  assert.equal(v.j.versionen.length, 2, 'zwei gesicherte Fassungen'); assert.equal(v.j.versionen[0].geaendert_von_name, 'Clara Probe'); assert.ok(/Neu von Clara/.test(v.j.versionen[0].inhalt)); assert.equal(v.j.versionen[1].geaendert_von_name, 'Ben Beispiel');
  assert.equal((await api(S, BEN, 'notiz_speichern', { titel: 'willkommen im portal', inhalt: 'x' })).status, 400, 'Titel doppelt');
  assert.equal((await api(S, BEN, 'notiz_speichern', { titel: 'x', inhalt: 'x' })).status, 400, 'Titel braucht 2 Zeichen');
  const n1 = (await api(S, BEN, 'notiz_speichern', { titel: 'Notiz eins von Ben', inhalt: 'a', projekt: '' })).j.id;
  const n2 = (await api(S, BEN, 'notiz_speichern', { titel: 'Notiz zwei von Ben', inhalt: 'b', projekt: 'Kundenanfragen' })).j.id;
  assert.ok(/^n_/.test(n1) && /^n_/.test(n2) && n1 !== n2);
  const L = (await api(S, BEN, 'laden')).j; assert.equal(L.notizen.find(x => x.notiz_id === n2).projekt, 'Kundenanfragen'); assert.equal(L.notizen.find(x => x.notiz_id === n1).autor, 'mf-ben');
  assert.equal((await api(S, CLARA, 'notiz_loeschen', { notiz_id: n1 })).status, 403);
  assert.equal((await api(S, BEN, 'notiz_loeschen', { notiz_id: n1 })).status, 200);
  assert.equal((await api(S, ADMIN, 'notiz_loeschen', { notiz_id: n2 })).status, 200);
  assert.equal((await api(S, ADMIN, 'papierkorb')).j.eintraege.filter(e => e.art === 'notiz').length, 2);
});

test('Vorschläge: anlegen (stimmt automatisch zu), Bereich aus der Liste, Stimme umschalten, Admin antwortet und ändert Status', async () => {
  const v1 = (await api(S, BEN, 'vorschlag_speichern', { titel: 'Vorschlag eins', text: 'Text #Test', bereich: 'Aufgaben' })).j.id;
  const v2 = (await api(S, BEN, 'vorschlag_speichern', { titel: 'Vorschlag zwei', text: '', bereich: 'Irgendwas' })).j.id;
  assert.ok(/^v_/.test(v1) && /^v_/.test(v2) && v1 !== v2);
  assert.equal((await api(S, BEN, 'vorschlag_speichern', { titel: 'ab' })).status, 400, 'Titel braucht 3 Zeichen');
  let V = (await api(S, CLARA, 'laden')).j.vorschlaege;
  assert.deepEqual(V.find(x => x.vorschlag_id === v1).stimmen, ['mf-ben']); assert.equal(V.find(x => x.vorschlag_id === v1).status, 'neu'); assert.equal(V.find(x => x.vorschlag_id === v1).bereich, 'Aufgaben');
  assert.equal(V.find(x => x.vorschlag_id === v2).bereich, 'Sonstiges', 'unbekannter Bereich wird Sonstiges (Liste aus der Einstellung)');
  await api(S, CLARA, 'vorschlag_stimme', { vorschlag_id: v1 }); await api(S, ADMIN, 'vorschlag_stimme', { vorschlag_id: v1 }); await api(S, CLARA, 'vorschlag_stimme', { vorschlag_id: v1 });
  V = (await api(S, BEN, 'laden')).j.vorschlaege;
  assert.deepEqual(V.find(x => x.vorschlag_id === v1).stimmen.sort(), ['mf-anna', 'mf-ben'], 'Clara hat ihre Stimme wieder zurückgenommen');
  const st = await api(S, BEN, 'vorschlag_speichern', { vorschlag_id: v1, titel: 'Vorschlag eins (geändert)', text: 'Text', bereich: 'Aufgaben', status: 'umgesetzt', antwort: 'Ich selbst' });
  assert.equal(st.status, 200);
  V = (await api(S, BEN, 'laden')).j.vorschlaege; const x = V.find(y => y.vorschlag_id === v1);
  assert.equal(x.titel, 'Vorschlag eins (geändert)'); assert.equal(x.status, 'neu', 'Status setzt nur der Admin'); assert.equal(x.antwort, '', 'Antwort schreibt nur der Admin');
  assert.equal((await api(S, ADMIN, 'vorschlag_speichern', { vorschlag_id: v1, titel: x.titel, text: x.text, bereich: x.bereich, status: 'geplant', antwort: 'Kommt.' })).status, 200);
  V = (await api(S, BEN, 'laden')).j.vorschlaege; const y = V.find(z => z.vorschlag_id === v1);
  assert.equal(y.status, 'geplant'); assert.equal(y.antwort, 'Kommt.'); assert.equal(y.antwort_von, 'mf-anna');
  assert.equal((await api(S, BEN, 'vorschlag_speichern', { vorschlag_id: v1, titel: 'nochmal' })).status, 403, 'nicht mehr neu → Verfasser darf nicht mehr');
  assert.equal((await api(S, BEN, 'vorschlag_loeschen', { vorschlag_id: v1 })).status, 403);
  assert.equal((await api(S, BEN, 'vorschlag_loeschen', { vorschlag_id: v2 })).status, 200);
  // Leere Liste in der Einstellung: freier Text bis 40 Zeichen
  await S.einstellung('vorschlag_bereiche', []);
  const v3 = (await api(S, CLARA, 'vorschlag_speichern', { titel: 'Vorschlag drei', bereich: 'Mein eigener Bereich' })).j.id;
  assert.equal((await api(S, BEN, 'laden')).j.vorschlaege.find(z => z.vorschlag_id === v3).bereich, 'Mein eigener Bereich');
  await S.einstellung('vorschlag_bereiche', ['Übersicht', 'Aufgaben', 'Projekte', 'Notizen', 'Vorschläge', 'Team', 'Sonstiges']);
});

test('Team: Admin legt zwei Mitglieder an (48-stelliger Code, Status eingeladen), Rollen aus der Einstellung, Einrichtung über profil, neuer Link macht den alten ungültig', async () => {
  const m1 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Eva Einladung', funktion: 'Marketing', rolle: 'team' });
  assert.equal(m1.status, 200); assert.match(m1.j.id, /^m_[a-z0-9]+$/);
  const m2 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Felix Fachleitung', rolle: 'dozent' });
  const m3 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Gerda Chefin', rolle: 'chef' });
  assert.equal(m2.status, 200); assert.notEqual(m2.j.id, m1.j.id);
  const M = (await api(S, ADMIN, 'laden')).j.mitglieder; const e1 = M.find(m => m.mitglied_id === m1.j.id), e2 = M.find(m => m.mitglied_id === m2.j.id), e3 = M.find(m => m.mitglied_id === m3.j.id);
  assert.match(e1.token, /^[a-f0-9]{48}$/); assert.notEqual(e1.token, e2.token); assert.equal(e1.status, 'eingeladen'); assert.equal(e1.email, '');
  assert.equal(e2.rolle, 'dozent', 'Rolle aus der Einstellung „rollen“ erlaubt'); assert.equal(e3.rolle, 'team', 'unbekannte Rolle wird team');
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { name: 'x' })).status, 400, 'Name braucht 2 Zeichen');
  // Eingeladene Person: laden liefert setup, andere Aktionen sind gesperrt, profil schaltet frei
  const l = await api(S, e1.token, 'laden'); assert.equal(l.status, 200); assert.equal(l.j.setup, true); assert.equal(l.j.ich.name, 'Eva Einladung');
  assert.equal((await api(S, e1.token, 'aufgabe_speichern', { titel: 'zu früh' })).status, 403);
  assert.equal((await api(S, e1.token, 'profil', { email: 'keine-adresse', telefon: '' })).status, 400);
  assert.equal((await api(S, e1.token, 'profil', { email: 'eva@example.invalid', telefon: '0170 1234567', whatsapp_ok: false })).status, 200);
  const l2 = await api(S, e1.token, 'laden'); assert.ok(!l2.j.setup); assert.equal(l2.j.ich.status, 'aktiv'); assert.equal(l2.j.mitglieder.length, 7); assert.match(l2.j.ich.telefon, /^\+\d{12}$/, 'Nummer mit Ländervorwahl normalisiert (0 → +Vorwahl)'); assert.ok(l2.j.ich.telefon.startsWith('+' + '49'));
  // Neuer Link: alter Code ist tot
  const neu = await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: m1.j.id, name: 'Eva Einladung', neuer_link: true });
  assert.equal(neu.status, 200);
  const t2 = (await api(S, ADMIN, 'laden')).j.mitglieder.find(m => m.mitglied_id === m1.j.id).token; assert.match(t2, /^[a-f0-9]{48}$/); assert.notEqual(t2, e1.token);
  assert.equal((await api(S, e1.token, 'laden')).status, 401, 'alter Code ungültig');
  assert.equal((await api(S, t2, 'laden')).status, 200, 'neuer Code gültig');
  // Sperren; sich selbst sperren oder die Admin-Rolle nehmen geht nicht
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: m2.j.id, name: 'Felix Fachleitung', status: 'gesperrt' })).status, 200);
  assert.equal((await api(S, e2.token, 'laden')).status, 401, 'gesperrt → 401');
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: 'mf-anna', name: 'Anna Muster', rolle: 'team' })).status, 400, 'sich selbst die Admin-Rolle nehmen geht nicht');
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: 'mf-anna', name: 'Anna Muster', rolle: 'admin', status: 'gesperrt' })).status, 200);
  assert.equal((await api(S, ADMIN, 'laden')).status, 200, 'Status-Änderung an sich selbst wird ignoriert');
});

test('KI-Agent: Admin legt Agenten an, Agent darf nur lesen, kommentieren und anlegen, „Erledigt“ wird „Wird getestet“', async () => {
  const g = await api(S, ADMIN, 'mitglied_speichern', { name: 'Recherche Agent', typ: 'agent' }); assert.equal(g.status, 200); assert.equal(g.j.id, 'agent-recherche-agent');
  const g2 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Recherche Agent', typ: 'agent' }); assert.match(g2.j.id, /^agent-recherche-agent-[a-f0-9]{4}$/, 'zweiter mit gleichem Namen bekommt Anhang');
  const tok = (await api(S, ADMIN, 'laden')).j.mitglieder.find(m => m.mitglied_id === g.j.id).token;
  const l = await api(S, tok, 'laden'); assert.equal(l.status, 200); assert.ok(l.j.regeln, 'Agent bekommt Regeln'); assert.ok(l.j.mitglieder.every(m => !('email' in m)), 'keine Kontaktdaten für Agenten');
  const a = await api(S, tok, 'aufgabe_speichern', { titel: 'Vom Agenten', status: 'Erledigt', kommentar: 'Bericht' }); assert.equal(a.status, 200);
  const A = (await api(S, ADMIN, 'laden')).j; assert.equal(A.aufgaben.find(x => x.aufgabe_id === a.j.id).status, 'Wird getestet'); assert.ok(A.verlauf.some(v => v.aufgabe_id === a.j.id && v.art === 'bericht'));
  assert.equal((await api(S, tok, 'aufgabe_loeschen', { aufgabe_id: a.j.id })).status, 403);
  assert.equal((await api(S, tok, 'mitglied_speichern', { name: 'x' })).status, 403);
});

test('Module einschalten (Einstellung „module“): Arbeitszeit bis Monatsabschluss, Social und Systeme mit je zwei Datensätzen', async () => {
  assert.equal((await api(S, BEN, 'zeit_speichern', { datum: '2026-01-05', von: '09:00', bis: '12:00', taetigkeit: 'Test' })).status, 403);
  assert.equal((await S.einstellung('module', { zeit: true, social: true, system: true })).ok, undefined);
  assert.deepEqual((await api(S, BEN, 'laden')).j.einstellungen.module, { zeit: true, social: true, system: true, kurs: false });
  // ein abgeschlossener Monat in der Vergangenheit (Zeiten dürfen höchstens 2 Tage in der Zukunft liegen)
  const m = new Date(); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() - 2); const monat = m.toISOString().slice(0, 7);
  const z1 = await api(S, BEN, 'zeit_speichern', { datum: monat + '-04', von: '09:00', bis: '12:30', pause_min: 30, taetigkeit: 'Test eins', projekt: 'Interne Verbesserungen', aufgabe_id: '' });
  const z2 = await api(S, BEN, 'zeit_speichern', { datum: monat + '-05', von: '13:00', bis: '17:00', pause_min: 0, taetigkeit: 'Test zwei', projekt: 'Interne Verbesserungen', aufgabe_id: '' });
  assert.equal(z1.status, 200); assert.equal(z2.status, 200); assert.match(z1.j.id, /^z_/); assert.notEqual(z1.j.id, z2.j.id);
  assert.equal((await api(S, BEN, 'zeit_speichern', { datum: monat + '-05', von: '13:00', bis: '12:00', taetigkeit: 'falsch' })).status, 400);
  assert.equal((await api(S, BEN, 'zeit_speichern', { datum: '2099-01-01', von: '09:00', bis: '10:00', taetigkeit: 'Zukunft' })).status, 400);
  let Z = (await api(S, BEN, 'laden')).j.zeiten.filter(z => z.datum.startsWith(monat));
  assert.deepEqual(Z.map(z => z.minuten).sort(), [180, 240]); const kw = Z[0].kw; assert.ok(Z.every(z => z.kw === kw && z.status === 'offen'));
  assert.ok((await api(S, CLARA, 'laden')).j.zeiten.every(z => z.mitglied_id === 'mf-clara'), 'Team sieht nur eigene Zeiten');
  assert.equal((await api(S, BEN, 'woche_einreichen', { kw })).j.id, kw);
  assert.equal((await api(S, BEN, 'woche_einreichen', { kw })).status, 400, 'nichts mehr einzureichen');
  assert.equal((await api(S, ADMIN, 'zeiten_pruefen', { mitglied_id: 'mf-ben', kw, entscheidung: 'abgelehnt', kommentar: 'Bitte Pause prüfen' })).status, 200);
  assert.equal((await api(S, BEN, 'laden')).j.zeiten.find(z => z.zeit_id === z1.j.id).status, 'abgelehnt');
  assert.equal((await api(S, BEN, 'woche_einreichen', { kw })).status, 200);
  assert.equal((await api(S, ADMIN, 'zeiten_pruefen', { mitglied_id: 'mf-ben', kw, entscheidung: 'freigegeben', kommentar: 'ok' })).status, 200);
  assert.equal((await api(S, BEN, 'zeit_loeschen', { zeit_id: z1.j.id })).status, 403, 'freigegeben → nicht mehr löschbar');
  assert.equal((await api(S, ADMIN, 'vertrag_speichern', { mitglied_id: 'mf-ben', vertrag_std: 10, startguthaben_std: 1, abrechnung_ab: monat + '-01' })).status, 200);
  const ab = await api(S, ADMIN, 'monat_abschliessen', { mitglied_id: 'mf-ben', monat }); assert.equal(ab.status, 200); assert.equal(ab.j.id, 'mf-ben_' + monat);
  const R = (await api(S, ADMIN, 'laden')).j.abrechnung.find(r => r.monat === monat);
  assert.equal(R.gearbeitet_min, 420); assert.equal(R.soll_min, 600); assert.equal(R.ausgezahlt_min, 480, '420 gearbeitet + 60 Guthaben, höchstens Soll'); assert.equal(R.konto_nachher_min, 0);
  assert.equal((await api(S, ADMIN, 'monat_abschliessen', { mitglied_id: 'mf-ben', monat })).status, 400, 'doppelt abschließen geht nicht');
  assert.equal((await api(S, ADMIN, 'monat_aufheben', { mitglied_id: 'mf-ben', monat })).status, 200);
  // Social: Kanal frei (Einstellung social_kanaele leer), „Geplant“ durch einen Menschen = Freigabe
  const s1 = await api(S, BEN, 'social_speichern', { thema: 'Beitrag eins', kanal: 'LinkedIn', status: 'Idee', datum: '2030-04-01' });
  const s2 = await api(S, BEN, 'social_speichern', { thema: 'Beitrag zwei', kanal: 'Mein Kanal', status: 'Geplant', datum: '2030-04-08', uhrzeit: '09:30' });
  assert.equal(s1.status, 200); assert.equal(s2.status, 200); assert.match(s1.j.id, /^p_/); assert.notEqual(s1.j.id, s2.j.id);
  const So = (await api(S, BEN, 'laden')).j.social; assert.equal(So.find(p => p.post_id === s2.j.id).freigegeben_von, 'mf-ben'); assert.equal(So.find(p => p.post_id === s2.j.id).kanal, 'Mein Kanal'); assert.equal(So.find(p => p.post_id === s2.j.id).uhrzeit, '09:30');
  await S.einstellung('social_kanaele', ['LinkedIn', 'Newsletter']);
  const s3 = await api(S, BEN, 'social_speichern', { thema: 'Beitrag drei', kanal: 'Mein Kanal' }); assert.equal((await api(S, BEN, 'laden')).j.social.find(p => p.post_id === s3.j.id).kanal, 'Sonstiges', 'mit Liste: unbekannter Kanal wird Sonstiges');
  assert.equal((await api(S, BEN, 'social_loeschen', { post_id: s1.j.id })).status, 200);
  assert.equal((await api(S, BEN, 'system_speichern', { name: 'Zeiterfassung' })).status, 403, 'Systeme nur Leitung und Fachleitung');
  const y1 = await api(S, ADMIN, 'system_speichern', { name: 'Zeiterfassung', status: 'geplant', bereich: 'Intern' }); assert.equal(y1.status, 200); assert.match(y1.j.id, /^s_/);
  const y2 = await api(S, ADMIN, 'system_speichern', { name: 'Ticketsystem', status: 'läuft', link: 'https://www.example.com/tickets' }); assert.equal(y2.status, 200);
  assert.equal((await api(S, ADMIN, 'laden')).j.systeme.length, 4);
  assert.equal((await api(S, ADMIN, 'system_loeschen', { system_id: y1.j.id })).status, 200);
  assert.equal((await api(S, ADMIN, 'papierkorb')).j.eintraege.filter(e => ['social', 'system'].includes(e.art)).length, 2);
});

test('Reset stellt die Musterdaten wieder her (4 Mitglieder, 3 Projekte, 12 Aufgaben, Module aus)', async () => {
  await S.reset();
  const L = (await api(S, BEN, 'laden')).j;
  assert.equal(L.mitglieder.length, 4); assert.equal(L.projekte.length, 3); assert.equal(L.aufgaben.length, 12); assert.equal(L.einstellungen.module.zeit, false);
  assert.equal((await api(S, BEN, 'zeit_speichern', { datum: '2026-01-05' })).status, 403);
});
