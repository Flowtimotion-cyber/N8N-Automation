// (c) Testserver: Login, Laden, Rollen, Aufgaben, Papierkorb, Konflikte, Vorschläge, Team. Immer mindestens zwei Datensätze hintereinander.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serverStarten, api } from './hilfe.mjs';
import { TOKENS } from '../dev/testdaten.mjs';

let S;
const ADMIN = TOKENS.m_anna, BEN = TOKENS.m_ben, CLARA = TOKENS.m_clara, DAN = TOKENS.m_dan;
before(async () => { S = await serverStarten(); });
after(async () => { if (S) await S.stop(); });

test('Login: falscher oder fehlender Code → 401, unbekannte Aktion → 400, Webhook-Pfad anderer Register → 404', async () => {
  assert.equal((await api(S, '', 'laden')).status, 401);
  assert.equal((await api(S, 'ab12cd34ef56ab78cd90ef12ab34cdff', 'laden')).status, 401);
  assert.equal((await api(S, 'kein-hex', 'laden')).status, 401);
  const u = await api(S, BEN, 'gibt_es_nicht'); assert.equal(u.status, 400); assert.equal(u.j.ok, false); assert.match(u.j.fehler, /Unbekannte Aktion/);
  const r = await fetch(S.base + '/webhook/PILOTKUERZEL/team-assistent', { method: 'POST', body: '{}' }); assert.equal(r.status, 404);
  const z = await S.zustand(); assert.equal(z.treffer['PILOTKUERZEL/team-assistent'], 1, 'Testserver zählt fremde Webhook-Aufrufe');
});

test('laden: Team-Mitglied sieht keine Codes, Admin sieht sie; Antwortform wie die echte Portal-API', async () => {
  const b = await api(S, BEN, 'laden');
  assert.equal(b.status, 200); assert.equal(b.j.ok, true); assert.equal(b.j.ich.name, 'Ben Beispiel'); assert.equal(b.j.ich.rolle, 'team');
  for (const f of ['ich', 'mitglieder', 'projekte', 'aufgaben', 'verlauf', 'notizen', 'social', 'systeme', 'vorschlaege', 'stand', 'zeiten', 'abrechnung']) assert.ok(f in b.j, 'Feld ' + f);
  assert.equal(b.j.mitglieder.length, 4); assert.ok(b.j.mitglieder.every(m => !('token' in m)), 'keine Codes für Team-Mitglieder');
  assert.ok(!('token' in b.j.ich));
  assert.equal(b.j.projekte.length, 3); assert.ok(b.j.aufgaben.length >= 12, 'mindestens 12 Aufgaben'); assert.ok(b.j.notizen.length >= 3); assert.ok(b.j.vorschlaege.length >= 3);
  assert.deepEqual([...new Set(b.j.aufgaben.map(a => a.status))].sort(), ['Erledigt', 'Geplant', 'In Arbeit', 'Offen', 'Wartet', 'Wird getestet'], 'alle Status vertreten');
  assert.ok(b.j.zeiten.every(z => z.mitglied_id === 'm_ben'), 'Team sieht nur eigene Zeiten');
  const a = await api(S, ADMIN, 'laden');
  assert.ok(a.j.mitglieder.every(m => typeof m.token === 'string' && m.token.length === 32), 'Admin sieht Codes (für „Link kopieren“)');
  assert.equal(a.j.zeiten.length, 2, 'Admin sieht alle Zeiten');
});

test('Aufgaben: zwei Datensätze als Team-Mitglied anlegen, Admin erledigt mit Kommentar, Verlauf stimmt', async () => {
  const a1 = await api(S, BEN, 'aufgabe_speichern', { titel: 'Testaufgabe eins', beschreibung: 'Erste', verantwortlich: 'm_clara', deadline: '2030-01-15', prio: 1, status: 'Offen', projekt: 'Interne Werkzeuge', label: '', agent_geeignet: false, kommentar: 'Bitte übernehmen' });
  assert.equal(a1.status, 200); assert.ok(a1.j.id, 'id zurück'); assert.equal(a1.j.aufgabe_id, a1.j.id);
  const a2 = await api(S, BEN, 'aufgabe_speichern', { titel: 'Testaufgabe zwei', verantwortlich: 'm_ben', prio: 2, status: 'Geplant', projekt: 'Interne Werkzeuge' });
  assert.equal(a2.status, 200); assert.notEqual(a2.j.id, a1.j.id, 'zweiter Datensatz hat eigene ID');
  let L = (await api(S, CLARA, 'laden')).j;
  const t1 = L.aufgaben.find(a => a.aufgabe_id === a1.j.id), t2 = L.aufgaben.find(a => a.aufgabe_id === a2.j.id);
  assert.ok(t1 && t2, 'beide Aufgaben sichtbar'); assert.equal(t1.erstellt_von, 'm_ben'); assert.equal(t1.verantwortlich, 'm_clara'); assert.equal(t2.status, 'Geplant');
  assert.equal(L.verlauf.filter(v => v.aufgabe_id === a1.j.id && v.art === 'kommentar').length, 1, 'Kommentar beim Anlegen gespeichert');
  // Pflichtfeld und falsche Zuständigkeit
  assert.equal((await api(S, BEN, 'aufgabe_speichern', { titel: '   ' })).status, 400);
  assert.equal((await api(S, BEN, 'aufgabe_speichern', { titel: 'x', verantwortlich: 'm_niemand' })).status, 400);
  // Admin erledigt die erste (mit Stand-Prüfung)
  const e = await api(S, ADMIN, 'aufgabe_speichern', Object.assign({}, t1, { status: 'Erledigt', kommentar: 'Freigegeben: passt', stand: t1.geaendert }));
  assert.equal(e.status, 200);
  L = (await api(S, BEN, 'laden')).j;
  const t1b = L.aufgaben.find(a => a.aufgabe_id === a1.j.id);
  assert.equal(t1b.status, 'Erledigt'); assert.ok(t1b.erledigt_am, 'erledigt_am gesetzt'); assert.equal(t1b.geaendert_von, 'm_anna');
  const V = L.verlauf.filter(v => v.aufgabe_id === a1.j.id);
  assert.ok(V.some(v => v.art === 'status' && /Offen → Erledigt/.test(v.text)), 'Statuswechsel im Verlauf');
  assert.ok(V.some(v => v.art === 'kommentar' && v.autor === 'm_anna' && /passt/.test(v.text)), 'Kommentar des Admins im Verlauf');
  // Gleichzeitig bearbeitet: alter Stand → 409 mit konflikt, mit trotzdem → ok
  const k = await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1b, { titel: 'Umbenannt', stand: t1.geaendert }));
  assert.equal(k.status, 409); assert.equal(k.j.konflikt, true); assert.match(k.j.fehler, /Anna Muster/);
  assert.equal((await api(S, BEN, 'aufgabe_speichern', Object.assign({}, t1b, { titel: 'Umbenannt', stand: t1.geaendert, trotzdem: true }))).status, 200);
  // Kommentar einzeln
  const c = await api(S, DAN, 'kommentar', { aufgabe_id: a2.j.id, text: 'Ich helfe mit.' }); assert.equal(c.status, 200); assert.ok(c.j.id);
  assert.equal((await api(S, DAN, 'kommentar', { aufgabe_id: 'a_fehlt', text: 'x' })).status, 404);
});

test('Rollen: Team-Mitglied darf fremde Aufgaben nicht löschen, Team nicht verwalten, fremde Projekte nicht ändern → 403', async () => {
  const v = await api(S, BEN, 'aufgabe_loeschen', { aufgabe_id: 'a_03' });      // angelegt von Clara
  assert.equal(v.status, 403); assert.equal(v.j.ok, false); assert.match(v.j.fehler, /Admin/);
  assert.equal((await api(S, BEN, 'mitglied_speichern', { name: 'Eindringling' })).status, 403);
  assert.equal((await api(S, BEN, 'projekt_speichern', { projekt_id: 'p_alpha', name: 'Kundenprojekt Alpha', status: 'pausiert' })).status, 403);
  assert.equal((await api(S, BEN, 'projekt_loeschen', { projekt_id: 'p_support' })).status, 403);
  assert.equal((await api(S, BEN, 'zeiten_pruefen', { mitglied_id: 'm_dan', kw: '2026-W44', entscheidung: 'freigegeben' })).status, 403);
  assert.equal((await api(S, BEN, 'system_speichern', { name: 'Neu' })).status, 403);
  assert.equal((await api(S, BEN, 'vorschlag_speichern', { vorschlag_id: 'v_02', titel: 'Fremd geändert' })).status, 403, 'fremder Vorschlag, nicht mehr neu');
  const ok = await api(S, CLARA, 'projekt_speichern', { projekt_id: 'p_alpha', name: 'Kundenprojekt Alpha', status: 'pausiert', beschreibung: 'Pause', farbe: '#1f4e79', verantwortlich: 'm_clara' });
  assert.equal(ok.status, 200, 'Verantwortliche darf');
  const L = (await api(S, BEN, 'laden')).j; assert.equal(L.projekte.find(p => p.projekt_id === 'p_alpha').status, 'pausiert');
});

test('Projekte: zwei neue Projekte, doppelter Name abgelehnt, Admin-Löschung nur ohne Aufgaben', async () => {
  const p1 = await api(S, BEN, 'projekt_speichern', { name: 'Testprojekt A' }); assert.equal(p1.status, 200); assert.ok(p1.j.id);
  const p2 = await api(S, DAN, 'projekt_speichern', { name: 'Testprojekt B', links: [{ titel: 'Doku', url: 'https://example.invalid/doku' }, { titel: 'kaputt', url: 'javascript:alert(1)' }] });
  assert.equal(p2.status, 200); assert.notEqual(p2.j.id, p1.j.id);
  assert.equal((await api(S, BEN, 'projekt_speichern', { name: 'testprojekt a' })).status, 400, 'Name doppelt (Groß/Klein egal)');
  const L = (await api(S, BEN, 'laden')).j;
  assert.equal(L.projekte.filter(p => /^Testprojekt/.test(p.name)).length, 2);
  assert.deepEqual(L.projekte.find(p => p.projekt_id === p2.j.id).links, [{ titel: 'Doku', url: 'https://example.invalid/doku' }], 'nur https-Links bleiben');
  assert.equal((await api(S, ADMIN, 'projekt_loeschen', { projekt_id: 'p_alpha' })).status, 400, 'mit Aufgaben nicht löschbar');
  assert.equal((await api(S, ADMIN, 'projekt_loeschen', { projekt_id: p2.j.id })).status, 200);
});

test('Papierkorb: eigene Aufgabe löschen, nur eigene Einträge sehen, wiederherstellen samt Verlauf; Admin sieht alles', async () => {
  const neu = (await api(S, DAN, 'aufgabe_speichern', { titel: 'Wird gleich gelöscht', kommentar: 'Kommentar vor dem Löschen' })).j.id;
  const l = await api(S, DAN, 'aufgabe_loeschen', { aufgabe_id: neu }); assert.equal(l.status, 200); assert.match(l.j.id, /^pk_/);
  assert.ok(!(await api(S, DAN, 'laden')).j.aufgaben.some(a => a.aufgabe_id === neu), 'weg aus der Liste');
  const pk = await api(S, DAN, 'papierkorb'); assert.equal(pk.status, 200); assert.equal(pk.j.tage, 30);
  const e = pk.j.eintraege.find(x => x.objekt_id === neu);
  assert.ok(e, 'eigener Eintrag im Papierkorb'); assert.equal(e.art_name, 'Aufgabe'); assert.equal(e.geloescht_von_name, 'Dan Test'); assert.equal(e.kommentare, 1); assert.ok(e.endgueltig_ab > e.geloescht_am);
  assert.ok(pk.j.eintraege.every(x => x.geloescht_von === 'm_dan'), 'Dan sieht nur, was er gelöscht hat');
  const pkA = await api(S, ADMIN, 'papierkorb'); assert.ok(pkA.j.eintraege.length >= 3, 'Admin sieht alle (vorbelegt + neu)');
  assert.equal((await api(S, BEN, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id })).status, 403, 'fremden Eintrag nicht zurückholen');
  const w = await api(S, DAN, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id }); assert.equal(w.status, 200); assert.equal(w.j.id, neu);
  const L = (await api(S, DAN, 'laden')).j;
  assert.ok(L.aufgaben.some(a => a.aufgabe_id === neu), 'wieder da'); assert.equal(L.verlauf.filter(v => v.aufgabe_id === neu).length, 1, 'Verlauf kam mit zurück');
  assert.equal((await api(S, DAN, 'papierkorb_wiederherstellen', { eintrag_id: e.eintrag_id })).status, 404, 'zweimal geht nicht');
  // vorbelegter Notiz-Eintrag: Admin stellt wieder her
  const w2 = await api(S, ADMIN, 'papierkorb_wiederherstellen', { eintrag_id: 'pk_02' }); assert.equal(w2.status, 200);
  assert.ok((await api(S, ADMIN, 'laden')).j.notizen.some(n => n.notiz_id === 'n_90'));
});

test('Notizen: Konflikt bei altem Stand (409), Versionen werden gesichert, Löschen nur Autor oder Admin', async () => {
  const n = (await api(S, CLARA, 'laden')).j.notizen.find(x => x.notiz_id === 'n_02');
  const alt = n.geaendert;
  const s1 = await api(S, CLARA, 'notiz_speichern', { notiz_id: 'n_02', titel: n.titel, inhalt: n.inhalt + '\n3. Neu von Clara.', projekt: n.projekt, stand: alt });
  assert.equal(s1.status, 200); assert.ok(s1.j.geaendert && s1.j.geaendert !== alt);
  const k = await api(S, BEN, 'notiz_speichern', { notiz_id: 'n_02', titel: n.titel, inhalt: n.inhalt + '\n3. Neu von Ben.', projekt: n.projekt, stand: alt });
  assert.equal(k.status, 409); assert.equal(k.j.konflikt, true); assert.match(k.j.fehler, /Clara Probe/);
  assert.equal((await api(S, BEN, 'notiz_speichern', { notiz_id: 'n_02', titel: n.titel, inhalt: n.inhalt + '\n3. Neu von Ben.', projekt: n.projekt, stand: alt, trotzdem: true })).status, 200);
  const v = await api(S, BEN, 'notiz_versionen', { notiz_id: 'n_02' }); assert.equal(v.status, 200);
  assert.equal(v.j.versionen.length, 3, 'vorbelegte Version + zwei gesicherte Fassungen'); assert.equal(v.j.versionen[0].geaendert_von_name, 'Clara Probe'); assert.ok(/Neu von Clara/.test(v.j.versionen[0].inhalt));
  assert.equal((await api(S, BEN, 'notiz_speichern', { titel: 'Kickoff Kundenprojekt Alpha', inhalt: 'x' })).status, 400, 'Titel doppelt');
  const n1 = (await api(S, BEN, 'notiz_speichern', { titel: 'Notiz eins von Ben', inhalt: 'a', projekt: '' })).j.id;
  const n2 = (await api(S, BEN, 'notiz_speichern', { titel: 'Notiz zwei von Ben', inhalt: 'b', projekt: '' })).j.id;
  assert.ok(n1 && n2 && n1 !== n2);
  assert.equal((await api(S, DAN, 'notiz_loeschen', { notiz_id: n1 })).status, 403);
  assert.equal((await api(S, BEN, 'notiz_loeschen', { notiz_id: n1 })).status, 200);
  assert.equal((await api(S, ADMIN, 'notiz_loeschen', { notiz_id: n2 })).status, 200);
});

test('Vorschläge: anlegen (stimmt automatisch zu), Stimme umschalten, Admin antwortet und ändert Status', async () => {
  const v1 = (await api(S, DAN, 'vorschlag_speichern', { titel: 'Vorschlag eins', text: 'Text #Test', bereich: 'Aufgaben' })).j.id;
  const v2 = (await api(S, DAN, 'vorschlag_speichern', { titel: 'Vorschlag zwei', text: '', bereich: 'Sonstiges' })).j.id;
  assert.ok(v1 && v2 && v1 !== v2);
  let V = (await api(S, BEN, 'laden')).j.vorschlaege;
  assert.deepEqual(V.find(x => x.vorschlag_id === v1).stimmen, ['m_dan']); assert.equal(V.find(x => x.vorschlag_id === v1).status, 'neu');
  await api(S, BEN, 'vorschlag_stimme', { vorschlag_id: v1 }); await api(S, CLARA, 'vorschlag_stimme', { vorschlag_id: v1 }); await api(S, BEN, 'vorschlag_stimme', { vorschlag_id: v1 });
  V = (await api(S, BEN, 'laden')).j.vorschlaege;
  assert.deepEqual(V.find(x => x.vorschlag_id === v1).stimmen.sort(), ['m_clara', 'm_dan'], 'Ben hat seine Stimme wieder zurückgenommen');
  const st = await api(S, DAN, 'vorschlag_speichern', { vorschlag_id: v1, titel: 'Vorschlag eins (geändert)', text: 'Text', bereich: 'Aufgaben', status: 'umgesetzt', antwort: 'Ich selbst' });
  assert.equal(st.status, 200);
  V = (await api(S, BEN, 'laden')).j.vorschlaege; const x = V.find(y => y.vorschlag_id === v1);
  assert.equal(x.titel, 'Vorschlag eins (geändert)'); assert.equal(x.status, 'neu', 'Status setzt nur der Admin'); assert.equal(x.antwort, '', 'Antwort schreibt nur der Admin');
  assert.equal((await api(S, ADMIN, 'vorschlag_speichern', { vorschlag_id: v1, titel: x.titel, text: x.text, bereich: x.bereich, status: 'geplant', antwort: 'Kommt.' })).status, 200);
  V = (await api(S, BEN, 'laden')).j.vorschlaege; const y = V.find(z => z.vorschlag_id === v1);
  assert.equal(y.status, 'geplant'); assert.equal(y.antwort, 'Kommt.'); assert.equal(y.antwort_von, 'm_anna');
  assert.equal((await api(S, DAN, 'vorschlag_speichern', { vorschlag_id: v1, titel: 'nochmal' })).status, 403, 'nicht mehr neu → Verfasser darf nicht mehr');
  assert.equal((await api(S, DAN, 'vorschlag_loeschen', { vorschlag_id: v2 })).status, 200);
});

test('Team: Admin legt zwei Mitglieder an (Code kommt zurück, Status eingeladen), Einrichtung über profil, neuer Link macht den alten ungültig', async () => {
  const m1 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Eva Einladung', funktion: 'Marketing', rolle: 'team' });
  assert.equal(m1.status, 200); assert.match(m1.j.token, /^[a-f0-9]{32}$/); assert.equal(m1.j.id, 'm_eva_einladung');
  const m2 = await api(S, ADMIN, 'mitglied_speichern', { name: 'Felix Fachleitung', rolle: 'dozent' });
  assert.equal(m2.status, 200); assert.notEqual(m2.j.token, m1.j.token); assert.notEqual(m2.j.id, m1.j.id);
  // Eingeladene Person: laden liefert setup, andere Aktionen sind gesperrt, profil schaltet frei
  const l = await api(S, m1.j.token, 'laden'); assert.equal(l.status, 200); assert.equal(l.j.setup, true); assert.equal(l.j.ich.name, 'Eva Einladung');
  assert.equal((await api(S, m1.j.token, 'aufgabe_speichern', { titel: 'zu früh' })).status, 403);
  assert.equal((await api(S, m1.j.token, 'profil', { email: 'keine-adresse', telefon: '' })).status, 400);
  assert.equal((await api(S, m1.j.token, 'profil', { email: 'eva@example.invalid', telefon: '', whatsapp_ok: false })).status, 200);
  const l2 = await api(S, m1.j.token, 'laden'); assert.ok(!l2.j.setup); assert.equal(l2.j.ich.status, 'aktiv'); assert.equal(l2.j.mitglieder.length, 6);
  // Neuer Link: alter Code ist tot
  const neu = await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: m1.j.id, name: 'Eva Einladung', neuer_link: true });
  assert.equal(neu.status, 200); assert.ok(neu.j.token && neu.j.token !== m1.j.token);
  assert.equal((await api(S, m1.j.token, 'laden')).status, 401, 'alter Code ungültig');
  assert.equal((await api(S, neu.j.token, 'laden')).status, 200, 'neuer Code gültig');
  // Sperren
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: m2.j.id, name: 'Felix Fachleitung', status: 'gesperrt' })).status, 200);
  assert.equal((await api(S, m2.j.token, 'laden')).status, 401, 'gesperrt → 401');
  assert.equal((await api(S, ADMIN, 'mitglied_speichern', { mitglied_id: 'm_anna', name: 'Anna Muster', status: 'gesperrt' })).status, 400, 'sich selbst sperren geht nicht');
});

test('Arbeitszeit: eintragen, Woche einreichen, Admin gibt frei, Monat abschließen (zwei Einträge)', async () => {
  const z1 = await api(S, BEN, 'zeit_speichern', { datum: '2030-03-04', von: '09:00', bis: '12:30', pause_min: 30, taetigkeit: 'Test eins', projekt: 'Interne Werkzeuge', aufgabe_id: '' });
  const z2 = await api(S, BEN, 'zeit_speichern', { datum: '2030-03-05', von: '13:00', bis: '17:00', pause_min: 0, taetigkeit: 'Test zwei', projekt: 'Interne Werkzeuge', aufgabe_id: '' });
  assert.equal(z1.status, 200); assert.equal(z2.status, 200); assert.notEqual(z1.j.id, z2.j.id);
  assert.equal((await api(S, BEN, 'zeit_speichern', { datum: '2030-03-05', von: '13:00', bis: '12:00', taetigkeit: 'falsch' })).status, 400);
  let Z = (await api(S, BEN, 'laden')).j.zeiten.filter(z => z.datum.startsWith('2030-03'));
  assert.deepEqual(Z.map(z => z.minuten).sort(), [180, 240]); assert.ok(Z.every(z => z.kw === '2030-W10' && z.status === 'offen'));
  assert.equal((await api(S, BEN, 'woche_einreichen', { kw: '2030-W10' })).j.anzahl, 2);
  assert.equal((await api(S, ADMIN, 'zeiten_pruefen', { mitglied_id: 'm_ben', kw: '2030-W10', entscheidung: 'abgelehnt', kommentar: '' })).status, 400, 'Zurückgeben braucht einen Grund');
  assert.equal((await api(S, ADMIN, 'zeiten_pruefen', { mitglied_id: 'm_ben', kw: '2030-W10', entscheidung: 'freigegeben', kommentar: 'ok' })).j.anzahl, 2);
  assert.equal((await api(S, BEN, 'zeit_loeschen', { zeit_id: z1.j.id })).status, 403, 'freigegeben → nicht mehr löschbar');
  assert.equal((await api(S, ADMIN, 'vertrag_speichern', { mitglied_id: 'm_ben', vertrag_std: 10, startguthaben_std: 1, abrechnung_ab: '2030-01-01' })).status, 200);
  const ab = await api(S, ADMIN, 'monat_abschliessen', { mitglied_id: 'm_ben', monat: '2030-03' }); assert.equal(ab.status, 200);
  const R = (await api(S, ADMIN, 'laden')).j.abrechnung.find(r => r.monat === '2030-03');
  assert.equal(R.gearbeitet_min, 420); assert.equal(R.soll_min, 600); assert.equal(R.ausgezahlt_min, 480, '420 gearbeitet + 60 Guthaben, höchstens Soll'); assert.equal(R.konto_nachher_min, 0);
  assert.equal((await api(S, ADMIN, 'monat_abschliessen', { mitglied_id: 'm_ben', monat: '2030-03' })).status, 400, 'doppelt abschließen geht nicht');
  assert.equal((await api(S, ADMIN, 'monat_aufheben', { mitglied_id: 'm_ben', monat: '2030-03' })).status, 200);
});

test('Social und Systeme: Beiträge für alle, Systeme nur Fachleitung/Admin; Reset stellt die Musterdaten wieder her', async () => {
  const s1 = await api(S, BEN, 'social_speichern', { thema: 'Beitrag eins', kanal: 'LinkedIn', status: 'Idee', datum: '2030-04-01' });
  const s2 = await api(S, BEN, 'social_speichern', { thema: 'Beitrag zwei', kanal: 'Newsletter', status: 'Geplant', datum: '2030-04-08' });
  assert.equal(s1.status, 200); assert.equal(s2.status, 200); assert.notEqual(s1.j.id, s2.j.id);
  const So = (await api(S, BEN, 'laden')).j.social; assert.equal(So.find(p => p.post_id === s2.j.id).freigegeben_von, 'm_ben');
  assert.equal((await api(S, BEN, 'social_loeschen', { post_id: s1.j.id })).status, 200);
  const y = await api(S, ADMIN, 'system_speichern', { name: 'Zeiterfassung', status: 'geplant', bereich: 'Intern' }); assert.equal(y.status, 200);
  assert.equal((await api(S, ADMIN, 'system_loeschen', { system_id: y.j.id })).status, 200);
  await S.reset();
  const L = (await api(S, BEN, 'laden')).j;
  assert.equal(L.mitglieder.length, 4); assert.equal(L.projekte.length, 3); assert.equal(L.aufgaben.length, 13);
});
