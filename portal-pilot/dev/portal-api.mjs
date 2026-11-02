// TESTADAPTER: Nachbildung der Portal-API im Speicher. Gleiche Anfrage- und Antwortform wie der n8n-Workflow „Portal-API“:
//   Anfrage  POST …/portal-api  { token, aktion, daten }
//   Antwort  { ok: true, … }  oder  { ok: false, fehler: 'Text für Menschen' }  mit HTTP 400 / 401 / 403 / 404 / 409
// Rollen: admin | dozent (Fachleitung / Technik) | vertrieb | team | agent. Die Prüfung läuft Token → Mitglied → Rolle.
// Kein Produktivsystem, keine Datenbank: Alles lebt im Speicher und ist nach einem Neustart wieder wie am Anfang.
import { isoWoche } from './testdaten.mjs';

const PAPIERKORB_TAGE = 30;
const STATUS = ['Offen', 'Geplant', 'In Arbeit', 'Wartet', 'Wird getestet', 'Erledigt'];
const ART_NAME = { aufgabe: 'Aufgabe', notiz: 'Notiz', vorschlag: 'Vorschlag', social: 'Beitrag', system: 'System', zeit: 'Zeiteintrag' };
const ZIEL = { aufgabe: ['team_aufgaben', 'aufgabe_id', 'titel'], notiz: ['team_notizen', 'notiz_id', 'titel'], vorschlag: ['team_vorschlaege', 'vorschlag_id', 'titel'], social: ['team_social', 'post_id', 'thema'], system: ['team_systeme', 'system_id', 'name'], zeit: ['team_zeiten', 'zeit_id', 'taetigkeit'] };

class ApiFehler extends Error { constructor(code, text, extra) { super(text); this.code = code; this.extra = extra || {}; } }
const fehler = (code, text, extra) => { throw new ApiFehler(code, text, extra); };
const s = v => String(v == null ? '' : v);
const kopie = o => JSON.parse(JSON.stringify(o));

let laufnr = 0;
export function neueId(praefix) { laufnr++; return praefix + '_' + Date.now().toString(36) + laufnr.toString(36) + Math.random().toString(36).slice(2, 6); }
export function neuerToken() {
  let t = '';
  while (t.length < 32) t += Math.floor(Math.random() * 16).toString(16);
  // Zufall kann lange Ziffernfolgen erzeugen; im Test sollen Codes nie wie Telefonnummern aussehen
  return /\d{9,}/.test(t) ? neuerToken() : t;
}

/**
 * Eine Anfrage beantworten. welt = { T: Tabellen (aus testDaten), jetzt: () => ISO-Zeit }.
 * Gibt { code, antwort } zurück und wirft nie.
 */
export function portalApi(welt, body) {
  try {
    const b = body && typeof body === 'object' ? body : {};
    const aktion = s(b.aktion), daten = b.daten && typeof b.daten === 'object' ? b.daten : {};
    const token = s(b.token).toLowerCase();
    if (!/^[a-f0-9]{20,64}$/.test(token)) fehler(401, 'Dein Zugang ist ungültig oder abgelaufen. Bitte den persönlichen Link neu öffnen.');
    const ich = welt.T.team_mitglieder.find(m => s(m.token).toLowerCase() === token);
    if (!ich || ich.status === 'gesperrt') fehler(401, 'Dein Zugang ist ungültig oder abgelaufen. Bitte den persönlichen Link neu öffnen.');
    const h = AKTIONEN[aktion];
    if (!h) fehler(400, 'Unbekannte Aktion: ' + aktion);
    const k = new Kontext(welt, ich, daten);
    if (ich.status === 'eingeladen' && !['laden', 'profil'].includes(aktion)) fehler(403, 'Bitte zuerst dein Profil ausfüllen.');
    const antwort = h(k);
    ich.zuletzt_aktiv = welt.jetzt();
    return { code: 200, antwort: Object.assign({ ok: true }, antwort || {}) };
  } catch (e) {
    if (e instanceof ApiFehler) return { code: e.code, antwort: Object.assign({ ok: false, fehler: e.message }, e.extra) };
    return { code: 500, antwort: { ok: false, fehler: 'Testadapter-Fehler: ' + e.message } };
  }
}

class Kontext {
  constructor(welt, ich, daten) { this.welt = welt; this.T = welt.T; this.ich = ich; this.d = daten; this.jetzt = welt.jetzt(); }
  get admin() { return this.ich.rolle === 'admin'; }
  get dozent() { return this.ich.rolle === 'admin' || this.ich.rolle === 'dozent'; }
  get agent() { return this.ich.typ === 'agent'; }
  get mensch() { return !this.agent; }
  name(id) { const m = this.T.team_mitglieder.find(x => x.mitglied_id === id); return m ? m.name : (id || '–'); }
  nurMensch() { if (this.agent) fehler(403, 'Das dürfen nur Menschen im Team.'); }
  nurAdmin() { if (!this.admin) fehler(403, 'Das darf nur ein Admin.'); }
  pflicht(wert, text) { const v = s(wert).trim(); if (!v) fehler(400, text); return v; }
  verlaufEintrag(aufgabe_id, art, text) {
    const V = this.T.team_aufgaben_verlauf; const id = V.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0) + 1;
    V.push({ id, aufgabe_id, autor: this.ich.mitglied_id, art, text, erstellt: this.jetzt }); return id;
  }
  // Löschen heißt: in den Papierkorb (30 Tage), wie team_loeschen() in der Datenbank
  inPapierkorb(art, id) {
    const [tab, pk, titelFeld] = ZIEL[art]; const L = this.T[tab]; const i = L.findIndex(x => x[pk] === id);
    if (i < 0) fehler(404, ART_NAME[art] + ' nicht gefunden.');
    const zeile = kopie(L[i]);
    if (art === 'aufgabe') { zeile._verlauf = this.T.team_aufgaben_verlauf.filter(v => v.aufgabe_id === id); this.T.team_aufgaben_verlauf = this.T.team_aufgaben_verlauf.filter(v => v.aufgabe_id !== id); }
    L.splice(i, 1);
    const eintrag_id = neueId('pk');
    this.T.team_papierkorb.push({ eintrag_id, art, objekt_id: id, titel: s(zeile[titelFeld]).slice(0, 200), daten: zeile, geloescht_von: this.ich.mitglied_id, geloescht_am: this.jetzt });
    const grenze = new Date(this.jetzt).getTime() - PAPIERKORB_TAGE * 86400000;
    this.T.team_papierkorb = this.T.team_papierkorb.filter(p => new Date(p.geloescht_am).getTime() >= grenze);
    return eintrag_id;
  }
}

const ohneGeheimes = (m, admin) => { const o = Object.assign({}, m); if (!admin) delete o.token; return o; };
const fuerAgent = m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ, funktion: m.funktion || '', status: m.status });

const AKTIONEN = {
  laden(k) {
    const T = k.T, ich = k.ich;
    if (ich.status === 'eingeladen') return { setup: true, ich: { mitglied_id: ich.mitglied_id, name: ich.name, email: ich.email || '', telefon: ich.telefon || '', whatsapp_ok: !!ich.whatsapp_ok, rolle: ich.rolle } };
    const basis = { projekte: T.team_projekte, aufgaben: T.team_aufgaben, verlauf: T.team_aufgaben_verlauf, notizen: T.team_notizen, vorschlaege: T.team_vorschlaege, stand: k.jetzt, testadapter: true };
    if (k.agent) {
      const meine = T.team_aufgaben.filter(a => a.verantwortlich === ich.mitglied_id && a.status !== 'Erledigt');
      return Object.assign(basis, { ich: fuerAgent(ich), mitglieder: T.team_mitglieder.map(fuerAgent), social: [], systeme: [], meine_aufgaben: meine, agent_geeignet: T.team_aufgaben.filter(a => a.agent_geeignet === true && a.status !== 'Erledigt'),
        regeln: ['Nichts löschen.', '„Erledigt“ setzt nur ein Mensch; höchstens „Wird getestet“.', 'Jede Arbeit als Bericht im Aufgabenverlauf festhalten.'] });
    }
    return Object.assign(basis, { ich: Object.assign(ohneGeheimes(ich, false), { stunden_sicht: false }), mitglieder: T.team_mitglieder.map(m => ohneGeheimes(m, k.admin)), social: T.team_social, systeme: T.team_systeme,
      zeiten: k.admin ? T.team_zeiten : T.team_zeiten.filter(z => z.mitglied_id === ich.mitglied_id), abrechnung: k.admin ? T.team_abrechnung : T.team_abrechnung.filter(r => r.mitglied_id === ich.mitglied_id) });
  },
  profil(k) {
    k.nurMensch();
    const email = k.pflicht(k.d.email, 'Bitte eine E-Mail-Adresse angeben.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fehler(400, 'Das sieht nicht nach einer E-Mail-Adresse aus.');
    Object.assign(k.ich, { email, telefon: s(k.d.telefon).trim(), whatsapp_ok: k.d.whatsapp_ok === true });
    if (k.ich.status === 'eingeladen') { k.ich.status = 'aktiv'; k.ich.registriert = k.jetzt; }
    return { id: k.ich.mitglied_id };
  },

  // ---------- Aufgaben ----------
  aufgabe_speichern(k) {
    const d = k.d, T = k.T; const titel = k.pflicht(d.titel, 'Bitte einen Titel angeben.');
    const status = STATUS.includes(d.status) ? d.status : 'Offen';
    if (k.agent && status === 'Erledigt') fehler(403, '„Erledigt“ setzt nur ein Mensch. Agenten melden höchstens „Wird getestet“.');
    const prio = [1, 2, 3].includes(Number(d.prio)) ? Number(d.prio) : 2;
    const verantwortlich = s(d.verantwortlich) || k.ich.mitglied_id;
    if (!T.team_mitglieder.some(m => m.mitglied_id === verantwortlich)) fehler(400, 'Die zuständige Person gibt es nicht.');
    if (d.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(s(d.deadline))) fehler(400, 'Die Deadline muss ein Datum sein (JJJJ-MM-TT).');
    let a = d.aufgabe_id ? T.team_aufgaben.find(x => x.aufgabe_id === d.aufgabe_id) : null;
    if (d.aufgabe_id && !a) fehler(404, 'Diese Aufgabe gibt es nicht mehr.');
    if (a && d.stand !== undefined && s(d.stand) && s(d.stand) !== s(a.geaendert) && d.trotzdem !== true)
      fehler(409, 'Diese Aufgabe wurde inzwischen von ' + k.name(a.geaendert_von || a.erstellt_von) + ' geändert, während du sie offen hattest.', { konflikt: true });
    const alt = a ? a.status : null;
    const felder = { titel, beschreibung: s(d.beschreibung), status, prio, label: s(d.label), projekt: s(d.projekt), verantwortlich, deadline: s(d.deadline), agent_geeignet: d.agent_geeignet === true, geaendert: k.jetzt, geaendert_von: k.ich.mitglied_id };
    if (!a) { a = Object.assign({ aufgabe_id: neueId('a'), erstellt_von: k.ich.mitglied_id, erstellt: k.jetzt, erledigt_am: null }, felder); T.team_aufgaben.push(a); }
    else Object.assign(a, felder);
    a.erledigt_am = status === 'Erledigt' ? (a.erledigt_am || k.jetzt) : null;
    if (alt && alt !== status) k.verlaufEintrag(a.aufgabe_id, 'status', 'Status: ' + alt + ' → ' + status);
    if (s(d.kommentar).trim()) k.verlaufEintrag(a.aufgabe_id, k.agent ? 'bericht' : 'kommentar', s(d.kommentar).trim());
    return { id: a.aufgabe_id, aufgabe_id: a.aufgabe_id, geaendert: a.geaendert };
  },
  kommentar(k) {
    const a = k.T.team_aufgaben.find(x => x.aufgabe_id === k.d.aufgabe_id); if (!a) fehler(404, 'Diese Aufgabe gibt es nicht mehr.');
    const text = k.pflicht(k.d.text, 'Der Kommentar ist leer.');
    const id = k.verlaufEintrag(a.aufgabe_id, k.agent ? 'bericht' : 'kommentar', text); a.geaendert = k.jetzt;
    return { id };
  },
  aufgabe_loeschen(k) {
    k.nurMensch();
    const a = k.T.team_aufgaben.find(x => x.aufgabe_id === k.d.aufgabe_id); if (!a) fehler(404, 'Diese Aufgabe gibt es nicht mehr.');
    if (!k.admin && a.erstellt_von !== k.ich.mitglied_id) fehler(403, 'Löschen darf nur, wer die Aufgabe angelegt hat, oder ein Admin.');
    return { id: k.inPapierkorb('aufgabe', a.aufgabe_id) };
  },

  // ---------- Projekte ----------
  projekt_speichern(k) {
    const d = k.d, T = k.T; const name = k.pflicht(d.name, 'Bitte einen Projektnamen angeben.');
    let p = d.projekt_id ? T.team_projekte.find(x => x.projekt_id === d.projekt_id) : null;
    if (d.projekt_id && !p) fehler(404, 'Dieses Projekt gibt es nicht mehr.');
    if (p && !(k.dozent || p.verantwortlich === k.ich.mitglied_id)) fehler(403, 'Ein Projekt ändern dürfen die verantwortliche Person, die Fachleitung und Admins.');
    if (T.team_projekte.some(x => x !== p && x.name.toLowerCase() === name.toLowerCase())) fehler(400, 'Ein Projekt mit diesem Namen gibt es schon.');
    if (p && p.name !== name && (T.team_aufgaben.some(a => a.projekt === p.name) || T.team_notizen.some(n => n.projekt === p.name) || T.team_zeiten.some(z => z.projekt === p.name)))
      fehler(400, 'Der Name lässt sich nur ändern, solange keine Aufgaben, Zeiten oder Notizen am Projekt hängen.');
    const links = Array.isArray(d.links) ? d.links.filter(l => l && /^https?:\/\//i.test(s(l.url))).map(l => ({ titel: s(l.titel).slice(0, 80), url: s(l.url).slice(0, 500) })) : (p ? p.links : []);
    if (!p) { p = { projekt_id: neueId('p'), name, beschreibung: '', status: 'aktiv', farbe: '#1f4e79', verantwortlich: k.ich.mitglied_id, reihenfolge: 50, links: [] }; T.team_projekte.push(p); }
    Object.assign(p, { name, beschreibung: d.beschreibung !== undefined ? s(d.beschreibung) : p.beschreibung, status: ['aktiv', 'geplant', 'pausiert', 'abgeschlossen'].includes(d.status) ? d.status : p.status,
      farbe: /^#[0-9a-fA-F]{6}$/.test(s(d.farbe)) ? d.farbe : p.farbe, verantwortlich: s(d.verantwortlich) || p.verantwortlich, links, geaendert: k.jetzt });
    return { id: p.projekt_id };
  },
  projekt_loeschen(k) {
    k.nurAdmin();
    const i = k.T.team_projekte.findIndex(x => x.projekt_id === k.d.projekt_id); if (i < 0) fehler(404, 'Dieses Projekt gibt es nicht mehr.');
    const p = k.T.team_projekte[i];
    if (k.T.team_aufgaben.some(a => a.projekt === p.name)) fehler(400, 'Am Projekt hängen noch Aufgaben. Erst verschieben oder löschen.');
    k.T.team_projekte.splice(i, 1); return { id: p.projekt_id };
  },

  // ---------- Notizen ----------
  notiz_speichern(k) {
    const d = k.d, T = k.T; const titel = k.pflicht(d.titel, 'Bitte einen Titel angeben.');
    let n = d.notiz_id ? T.team_notizen.find(x => x.notiz_id === d.notiz_id) : null;
    if (d.notiz_id && !n) fehler(404, 'Diese Notiz gibt es nicht mehr.');
    if (T.team_notizen.some(x => x !== n && x.titel.toLowerCase() === titel.toLowerCase())) fehler(400, 'Eine Notiz mit diesem Titel gibt es schon.');
    if (n && d.stand !== undefined && s(d.stand) && s(d.stand) !== s(n.geaendert) && d.trotzdem !== true)
      fehler(409, 'Diese Notiz wurde inzwischen von ' + k.name(n.geaendert_von || n.autor) + ' geändert, während du sie offen hattest.', { konflikt: true });
    if (n && (n.inhalt !== s(d.inhalt) || n.titel !== titel)) {
      // Vor jeder Änderung die alte Fassung sichern (wie der Trigger team_notiz_version in der Datenbank)
      T.team_notiz_versionen.unshift({ version_id: neueId('nv'), notiz_id: n.notiz_id, titel: n.titel, inhalt: n.inhalt, projekt: n.projekt, geaendert_von: n.geaendert_von || n.autor, fassung_vom: n.geaendert, gesichert_am: k.jetzt });
      T.team_notiz_versionen = T.team_notiz_versionen.filter((v, i, L) => L.filter(x => x.notiz_id === v.notiz_id).indexOf(v) < 30);
    }
    if (!n) { n = { notiz_id: neueId('n'), autor: k.ich.mitglied_id, erstellt: k.jetzt }; T.team_notizen.push(n); }
    Object.assign(n, { titel, inhalt: s(d.inhalt), projekt: s(d.projekt), geaendert_von: k.ich.mitglied_id, geaendert: k.jetzt });
    return { id: n.notiz_id, geaendert: n.geaendert };
  },
  notiz_loeschen(k) {
    k.nurMensch();
    const n = k.T.team_notizen.find(x => x.notiz_id === k.d.notiz_id); if (!n) fehler(404, 'Diese Notiz gibt es nicht mehr.');
    if (!k.admin && n.autor !== k.ich.mitglied_id) fehler(403, 'Löschen darf nur, wer die Notiz angelegt hat, oder ein Admin.');
    return { id: k.inPapierkorb('notiz', n.notiz_id) };
  },
  notiz_versionen(k) {
    const n = k.T.team_notizen.find(x => x.notiz_id === k.d.notiz_id); if (!n) fehler(404, 'Diese Notiz gibt es nicht mehr.');
    return { notiz_id: n.notiz_id, versionen: k.T.team_notiz_versionen.filter(v => v.notiz_id === n.notiz_id).map(v => Object.assign({}, v, { geaendert_von_name: k.name(v.geaendert_von) })) };
  },

  // ---------- Vorschläge ----------
  vorschlag_speichern(k) {
    const d = k.d, T = k.T; const titel = k.pflicht(d.titel, 'Bitte einen kurzen Titel angeben.');
    let v = d.vorschlag_id ? T.team_vorschlaege.find(x => x.vorschlag_id === d.vorschlag_id) : null;
    if (d.vorschlag_id && !v) fehler(404, 'Diesen Vorschlag gibt es nicht mehr.');
    if (v && !k.admin && !(v.autor === k.ich.mitglied_id && v.status === 'neu')) fehler(403, 'Ändern kann der Verfasser, solange der Vorschlag neu ist, oder ein Admin.');
    if (!v) { v = { vorschlag_id: neueId('v'), status: 'neu', autor: k.ich.mitglied_id, stimmen: [k.ich.mitglied_id], antwort: '', antwort_von: null, aufgabe_id: null, erstellt: k.jetzt }; T.team_vorschlaege.unshift(v); }
    Object.assign(v, { titel, text: s(d.text), bereich: s(d.bereich) || 'Sonstiges', geaendert: k.jetzt });
    if (k.admin) {
      if (['neu', 'geplant', 'in Arbeit', 'umgesetzt', 'abgelehnt'].includes(d.status)) v.status = d.status;
      if (d.antwort !== undefined) { v.antwort = s(d.antwort); v.antwort_von = v.antwort ? k.ich.mitglied_id : null; }
      if (d.aufgabe_id !== undefined) v.aufgabe_id = s(d.aufgabe_id) || null;
    }
    return { id: v.vorschlag_id };
  },
  vorschlag_stimme(k) {
    k.nurMensch();
    const v = k.T.team_vorschlaege.find(x => x.vorschlag_id === k.d.vorschlag_id); if (!v) fehler(404, 'Diesen Vorschlag gibt es nicht mehr.');
    v.stimmen = Array.isArray(v.stimmen) ? v.stimmen : [];
    const i = v.stimmen.indexOf(k.ich.mitglied_id); if (i >= 0) v.stimmen.splice(i, 1); else v.stimmen.push(k.ich.mitglied_id);
    return { id: v.vorschlag_id, stimmen: v.stimmen };
  },
  vorschlag_loeschen(k) {
    k.nurMensch();
    const v = k.T.team_vorschlaege.find(x => x.vorschlag_id === k.d.vorschlag_id); if (!v) fehler(404, 'Diesen Vorschlag gibt es nicht mehr.');
    if (!k.admin && !(v.autor === k.ich.mitglied_id && v.status === 'neu')) fehler(403, 'Löschen kann der Verfasser, solange der Vorschlag neu ist, oder ein Admin.');
    return { id: k.inPapierkorb('vorschlag', v.vorschlag_id) };
  },

  // ---------- Team ----------
  mitglied_speichern(k) {
    k.nurAdmin();
    const d = k.d, T = k.T; const name = k.pflicht(d.name, 'Bitte einen Namen angeben.');
    let m = d.mitglied_id ? T.team_mitglieder.find(x => x.mitglied_id === d.mitglied_id) : null;
    if (d.mitglied_id && !m) fehler(404, 'Dieses Mitglied gibt es nicht.');
    const agent = m ? m.typ === 'agent' : d.typ === 'agent';
    const rollen = agent ? ['agent'] : ['admin', 'dozent', 'vertrieb', 'team'];
    let token;
    if (!m) {
      const basisId = (agent ? 'agent-' : 'm_') + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
      let id = basisId, n = 2; while (T.team_mitglieder.some(x => x.mitglied_id === id)) id = basisId + '_' + n++;
      token = neuerToken();
      m = { mitglied_id: id, name, email: '', telefon: '', funktion: '', rolle: agent ? 'agent' : 'team', typ: agent ? 'agent' : 'mensch', status: agent ? 'aktiv' : 'eingeladen', token, whatsapp_ok: false, registriert: null, zuletzt_aktiv: null, vertrag_std: 0, startguthaben_min: 0, abrechnung_ab: null };
      T.team_mitglieder.push(m);
    }
    if (m.mitglied_id === k.ich.mitglied_id && d.status && d.status !== 'aktiv') fehler(400, 'Du kannst dich nicht selbst sperren.');
    Object.assign(m, { name, funktion: d.funktion !== undefined ? s(d.funktion).slice(0, 60) : m.funktion });
    if (rollen.includes(d.rolle) && m.mitglied_id !== k.ich.mitglied_id) m.rolle = d.rolle;
    if (['aktiv', 'eingeladen', 'gesperrt'].includes(d.status) && m.mitglied_id !== k.ich.mitglied_id) m.status = d.status;
    if (d.neuer_link === true) { token = neuerToken(); m.token = token; }
    return token ? { id: m.mitglied_id, token } : { id: m.mitglied_id };
  },

  // ---------- Papierkorb ----------
  papierkorb(k) {
    k.nurMensch();
    const grenze = new Date(k.jetzt).getTime() - PAPIERKORB_TAGE * 86400000;
    const L = k.T.team_papierkorb.filter(p => new Date(p.geloescht_am).getTime() >= grenze && (k.admin || p.geloescht_von === k.ich.mitglied_id))
      .sort((a, b) => s(b.geloescht_am).localeCompare(s(a.geloescht_am)));
    const eintraege = L.map(p => {
      const z = p.daten || {}; const text = s(z.beschreibung || z.inhalt || z.text || '');
      return { eintrag_id: p.eintrag_id, art: p.art, art_name: ART_NAME[p.art] || p.art, objekt_id: p.objekt_id, titel: p.titel, projekt: s(z.projekt), vorschau: text.slice(0, 400), zeichen: text.length,
        kommentare: Array.isArray(z._verlauf) ? z._verlauf.filter(v => v.art !== 'status').length : 0, geloescht_von: p.geloescht_von, geloescht_von_name: k.name(p.geloescht_von), geloescht_am: p.geloescht_am,
        endgueltig_ab: new Date(new Date(p.geloescht_am).getTime() + PAPIERKORB_TAGE * 86400000).toISOString() };
    });
    return { tage: PAPIERKORB_TAGE, eintraege };
  },
  papierkorb_wiederherstellen(k) {
    k.nurMensch();
    const i = k.T.team_papierkorb.findIndex(p => p.eintrag_id === k.d.eintrag_id); if (i < 0) fehler(404, 'Dieser Eintrag ist nicht mehr im Papierkorb.');
    const e = k.T.team_papierkorb[i];
    if (!k.admin && e.geloescht_von !== k.ich.mitglied_id) fehler(403, 'Zurückholen darf nur, wer gelöscht hat, oder ein Admin.');
    const [tab, pk] = ZIEL[e.art]; const zeile = kopie(e.daten); const verlauf = zeile._verlauf; delete zeile._verlauf;
    if (k.T[tab].some(x => x[pk] === e.objekt_id)) fehler(400, 'Das gibt es schon wieder (gleiche ID). Nichts geändert.');
    if (e.art === 'notiz' && k.T.team_notizen.some(n => n.titel.toLowerCase() === s(zeile.titel).toLowerCase())) zeile.titel = zeile.titel + ' (wiederhergestellt)';
    k.T[tab].push(zeile);
    if (Array.isArray(verlauf)) k.T.team_aufgaben_verlauf.push(...verlauf);
    k.T.team_papierkorb.splice(i, 1);
    return { id: e.objekt_id };
  },

  // ---------- Arbeitszeit (Register „arbeitszeit“) ----------
  zeit_speichern(k) {
    k.nurMensch();
    const d = k.d, T = k.T;
    const datum = s(d.datum); if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) fehler(400, 'Bitte ein Datum angeben.');
    const min = t => /^\d{2}:\d{2}$/.test(s(t)) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;
    const von = min(d.von), bis = min(d.bis), pause = Math.max(0, Number(d.pause_min) || 0);
    if (von === null || bis === null || bis - von - pause <= 0) fehler(400, 'Ende muss nach Beginn liegen (abzüglich Pause).');
    let z = d.zeit_id ? T.team_zeiten.find(x => x.zeit_id === d.zeit_id) : null;
    if (d.zeit_id && !z) fehler(404, 'Diesen Eintrag gibt es nicht mehr.');
    if (z && !k.admin && (z.mitglied_id !== k.ich.mitglied_id || z.status === 'freigegeben')) fehler(403, 'Freigegebene oder fremde Einträge ändert nur ein Admin.');
    if (!z) { z = { zeit_id: neueId('z'), mitglied_id: k.ich.mitglied_id, status: 'offen', kommentar: '' }; T.team_zeiten.push(z); }
    Object.assign(z, { datum, von: d.von, bis: d.bis, pause_min: pause, minuten: bis - von - pause, taetigkeit: k.pflicht(d.taetigkeit, 'Was hast du gemacht?'), projekt: s(d.projekt), aufgabe_id: s(d.aufgabe_id), kw: isoWoche(datum), geaendert: k.jetzt });
    if (z.status === 'abgelehnt') z.status = 'offen';
    return { id: z.zeit_id };
  },
  zeit_loeschen(k) {
    k.nurMensch();
    const z = k.T.team_zeiten.find(x => x.zeit_id === k.d.zeit_id); if (!z) fehler(404, 'Diesen Eintrag gibt es nicht mehr.');
    if (!k.admin && (z.mitglied_id !== k.ich.mitglied_id || z.status === 'freigegeben')) fehler(403, 'Freigegebene oder fremde Einträge löscht nur ein Admin.');
    return { id: k.inPapierkorb('zeit', z.zeit_id) };
  },
  woche_einreichen(k) {
    k.nurMensch(); const kw = k.pflicht(k.d.kw, 'Welche Woche?'); let n = 0;
    k.T.team_zeiten.forEach(z => { if (z.mitglied_id === k.ich.mitglied_id && z.kw === kw && (z.status === 'offen' || z.status === 'abgelehnt')) { z.status = 'eingereicht'; z.eingereicht_am = k.jetzt; n++; } });
    return { anzahl: n };
  },
  zeiten_pruefen(k) {
    k.nurAdmin(); const ent = k.d.entscheidung; if (!['freigegeben', 'abgelehnt'].includes(ent)) fehler(400, 'Entscheidung muss „freigegeben“ oder „abgelehnt“ sein.');
    if (ent === 'abgelehnt' && !s(k.d.kommentar).trim()) fehler(400, 'Bitte schreib dazu, was korrigiert werden soll.');
    let n = 0;
    k.T.team_zeiten.forEach(z => { if (z.mitglied_id === k.d.mitglied_id && z.kw === k.d.kw && z.status !== 'freigegeben') { Object.assign(z, { status: ent, freigegeben_von: k.ich.mitglied_id, freigegeben_am: k.jetzt, kommentar: s(k.d.kommentar) }); n++; } });
    return { anzahl: n };
  },
  vertrag_speichern(k) {
    k.nurMensch(); const m = k.T.team_mitglieder.find(x => x.mitglied_id === k.d.mitglied_id); if (!m) fehler(404, 'Dieses Mitglied gibt es nicht.');
    if (!k.admin && m.mitglied_id !== k.ich.mitglied_id) fehler(403, 'Fremde Verträge ändert nur ein Admin.');
    Object.assign(m, { vertrag_std: Math.max(0, Number(k.d.vertrag_std) || 0), startguthaben_min: Math.round(Math.max(0, Number(k.d.startguthaben_std) || 0) * 60), abrechnung_ab: /^\d{4}-\d{2}-\d{2}$/.test(s(k.d.abrechnung_ab)) ? k.d.abrechnung_ab : m.abrechnung_ab });
    return { id: m.mitglied_id };
  },
  monat_abschliessen(k) {
    k.nurAdmin(); const monat = s(k.d.monat); if (!/^\d{4}-\d{2}$/.test(monat)) fehler(400, 'Monat im Format JJJJ-MM.');
    const m = k.T.team_mitglieder.find(x => x.mitglied_id === k.d.mitglied_id); if (!m) fehler(404, 'Dieses Mitglied gibt es nicht.');
    if (k.T.team_abrechnung.some(r => r.mitglied_id === m.mitglied_id && r.monat === monat)) fehler(400, 'Dieser Monat ist schon abgeschlossen.');
    const E = k.T.team_zeiten.filter(z => z.mitglied_id === m.mitglied_id && s(z.datum).slice(0, 7) === monat);
    if (E.some(z => z.status !== 'freigegeben')) fehler(400, 'Erst alle Einträge des Monats freigeben.');
    const W = E.reduce((x, z) => x + (Number(z.minuten) || 0), 0), soll = Math.round((Number(m.vertrag_std) || 0) * 60);
    const vorher = k.T.team_abrechnung.filter(r => r.mitglied_id === m.mitglied_id).sort((a, b) => b.monat.localeCompare(a.monat))[0];
    const kontoVor = vorher ? Number(vorher.konto_nachher_min) || 0 : Number(m.startguthaben_min) || 0;
    const aus = soll ? Math.min(soll, W + kontoVor) : W;
    k.T.team_abrechnung.push({ abrechnung_id: neueId('r'), mitglied_id: m.mitglied_id, monat, soll_min: soll, gearbeitet_min: W, ausgezahlt_min: aus, konto_vorher_min: kontoVor, konto_nachher_min: kontoVor + W - aus, erstellt: k.jetzt, erstellt_von: k.ich.mitglied_id });
    return { monat };
  },
  monat_aufheben(k) {
    k.nurAdmin(); const i = k.T.team_abrechnung.findIndex(r => r.mitglied_id === k.d.mitglied_id && r.monat === k.d.monat); if (i < 0) fehler(404, 'Dieser Monat ist nicht abgeschlossen.');
    k.T.team_abrechnung.splice(i, 1); return { monat: k.d.monat };
  },

  // ---------- Social Media (Register „social“) ----------
  social_speichern(k) {
    const d = k.d, T = k.T; const thema = k.pflicht(d.thema, 'Bitte ein Thema angeben.');
    let p = d.post_id ? T.team_social.find(x => x.post_id === d.post_id) : null;
    if (d.post_id && !p) fehler(404, 'Diesen Beitrag gibt es nicht mehr.');
    const status = ['Idee', 'In Arbeit', 'Zur Freigabe', 'Geplant', 'Veröffentlicht'].includes(d.status) ? d.status : 'Idee';
    if (k.agent && ['Geplant', 'Veröffentlicht'].includes(status)) fehler(403, 'Agenten setzen höchstens „Zur Freigabe“.');
    if (!p) { p = { post_id: neueId('s'), erstellt_von: k.ich.mitglied_id }; T.team_social.push(p); }
    if (status === 'Geplant' && (!p.freigegeben_von || p.status !== 'Geplant')) { p.freigegeben_von = k.ich.mitglied_id; p.freigegeben_am = k.jetzt; }
    Object.assign(p, { thema, text: s(d.text), datum: s(d.datum), uhrzeit: s(d.uhrzeit), kanal: s(d.kanal), format: s(d.format), status, verantwortlich: s(d.verantwortlich) || k.ich.mitglied_id, link: s(d.link), medien: s(d.medien), hook: s(d.hook), hashtags: s(d.hashtags), quelle: s(d.quelle), geaendert: k.jetzt });
    return { id: p.post_id };
  },
  social_loeschen(k) {
    k.nurMensch(); const p = k.T.team_social.find(x => x.post_id === k.d.post_id); if (!p) fehler(404, 'Diesen Beitrag gibt es nicht mehr.');
    return { id: k.inPapierkorb('social', p.post_id) };
  },

  // ---------- Systeme (Register „systeme“) ----------
  system_speichern(k) {
    if (!k.dozent) fehler(403, 'Systeme pflegen die Fachleitung und Admins.');
    const d = k.d, T = k.T; const name = k.pflicht(d.name, 'Bitte einen Namen angeben.');
    let y = d.system_id ? T.team_systeme.find(x => x.system_id === d.system_id) : null;
    if (d.system_id && !y) fehler(404, 'Dieses System gibt es nicht mehr.');
    if (!y) { y = { system_id: neueId('y') }; T.team_systeme.push(y); }
    Object.assign(y, { name, beschreibung: s(d.beschreibung), bereich: s(d.bereich) || 'Intern', status: ['läuft', 'im Bau', 'geplant', 'pausiert'].includes(d.status) ? d.status : 'geplant', werkzeug: s(d.werkzeug), link: s(d.link), verantwortlich: s(d.verantwortlich) || k.ich.mitglied_id, geaendert: k.jetzt });
    return { id: y.system_id };
  },
  system_loeschen(k) {
    if (!k.dozent) fehler(403, 'Systeme löschen die Fachleitung und Admins.');
    const y = k.T.team_systeme.find(x => x.system_id === k.d.system_id); if (!y) fehler(404, 'Dieses System gibt es nicht mehr.');
    return { id: k.inPapierkorb('system', y.system_id) };
  }
};

export const AKTIONEN_LISTE = Object.keys(AKTIONEN);
