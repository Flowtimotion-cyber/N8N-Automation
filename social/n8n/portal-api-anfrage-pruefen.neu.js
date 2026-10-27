// Prüft Zugang und Rechte und bereitet die Schreibaufträge für Supabase vor
let b = $('Team-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const D = $('Team-Daten laden').first().json || {};
const alle = (D.mitglieder || []).filter(m => m && m.mitglied_id);
const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id);
const zeiten = (D.zeiten || []).filter(z => z && z.zeit_id);
const projekte = (D.projekte || []).filter(p => p && p.projekt_id);
const notizen = (D.notizen || []).filter(n => n && n.notiz_id);
const vorschlaege = (D.vorschlaege || []).filter(v => v && v.vorschlag_id);
const raus = (code, fehler) => [{ json: { weiter: 0, code, antwort: { ok: false, fehler } } }];
// Schreibaufträge an Supabase (PostgREST)
const enc = v => encodeURIComponent(String(v));
const neu = (tab, row) => ({ methode: 'POST', pfad: tab, body: row });
const aend = (tab, pk, id, row) => ({ methode: 'PATCH', pfad: tab + '?' + pk + '=eq.' + enc(id), body: row });
const aendViele = (tab, pk, ids, row) => ({ methode: 'PATCH', pfad: tab + '?' + pk + '=in.(' + ids.map(enc).join(',') + ')', body: row });
const weg = (tab, pk, id) => ({ methode: 'DELETE', pfad: tab + '?' + pk + '=eq.' + enc(id), body: {} });
const tok = String(b.token || '');
const ich = tok.length >= 20 ? alle.find(m => m.token === tok) : null;
if (!ich || ich.status === 'gesperrt') return raus(401, 'Dein Zugang ist ungültig. Bitte frag Timo nach einem neuen Link.');
const aktion = String(b.aktion || '');
const jetzt = new Date().toISOString();
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, n);
const istAdmin = ich.rolle === 'admin';
const istDozent = istAdmin || ich.rolle === 'dozent';
const rnd = n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; };
const neueId = p => p + '_' + Date.now().toString(36) + rnd(6);
const istAgent = ich.rolle === 'agent';
const ichKurz = { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, status: ich.status };
const laden = () => [{ json: { weiter: 1, ich: ichKurz } }];
const schreiben = (ops, extra) => [{ json: { weiter: 2, ich: ichKurz, ops, ...extra } }];
const verlauf = (aufgabe_id, art, text) => neu('team_aufgaben_verlauf', { aufgabe_id, autor: ich.mitglied_id, art, text: String(text).slice(0, 8000) });
const AGENT_DARF = ['aufgabe_speichern', 'kommentar', 'notiz_speichern', 'projekt_speichern', 'social_speichern', 'vorschlag_speichern'];
const telefonNorm = t => { let s = String(t || '').replace(/[^\d+]/g, ''); if (s.startsWith('00')) s = '+' + s.slice(2); else if (s.startsWith('0')) s = '+49' + s.slice(1); return s.slice(0, 20); };
const d = b.daten || {};
const nameVon = id => (alle.find(m => m.mitglied_id === id) || {}).name || id || '';
// Löschen geht in den Papierkorb: Supabase-Funktion team_loeschen kopiert die Zeile (bei Aufgaben samt Verlauf) und löscht sie in einem Schritt
const inPapierkorb = (art, id) => ({ methode: 'POST', pfad: 'rpc/team_loeschen', body: { p_art: art, p_id: id, p_von: ich.mitglied_id } });
// Lesende Antworten ohne den großen Ladevorgang, über denselben Antwortknoten wie Fehler (Code 200)
const lesen = antwort => [{ json: { weiter: 0, code: 200, antwort: { ok: true, ...antwort } } }];
// Gleichzeitiges Bearbeiten: Das Portal schickt mit, welchen Stand es geöffnet hatte. Weicht er ab, wird nicht still überschrieben.
const konflikt = (was, alt) => [{ json: { weiter: 0, code: 409, antwort: { ok: false, konflikt: true, geaendert: alt.geaendert || '', geaendert_von: nameVon(alt.geaendert_von),
  fehler: was + ' wurde inzwischen ' + (alt.geaendert_von && alt.geaendert_von !== ich.mitglied_id ? 'von ' + nameVon(alt.geaendert_von) + ' ' : '') + 'geändert, während du sie offen hattest.' } } }];
const veraltet = alt => alt && d.stand && d.trotzdem !== true && String(d.stand) !== String(alt.geaendert || '');
const PK_TAGE = 30;
const papierkorb = (D.papierkorb || []).filter(e => e && e.eintrag_id);
// Teilnehmer-Register
const tnListe = (D.teilnehmer || []).filter(t => t && t.tn_id);
const tnSpalten = (D.tn_spalten || []).filter(s => s && s.spalte_id).sort((a, b) => (Number(a.reihenfolge) || 50) - (Number(b.reihenfolge) || 50) || String(a.titel).localeCompare(String(b.titel)));
const TN_STATUS = ['interessent', 'aktiv', 'abgeschlossen', 'abgebrochen'];
const tnDatum = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
const tnHaken = (tn, spalte, wert, datum) => ({ methode: 'POST', pfad: 'rpc/team_tn_haken', body: { p_tn: tn, p_spalte: spalte, p_wert: wert, p_datum: tnDatum(datum), p_von: ich.mitglied_id } });

if (aktion === 'laden') return laden();
if (istAgent && !AGENT_DARF.includes(aktion)) return raus(403, 'Das dürfen Agenten nicht. Erlaubt: ' + AGENT_DARF.join(', ') + ', laden.');
if (aktion === 'profil') {
  const email = txt(d.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return raus(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
  const telefon = telefonNorm(d.telefon);
  if (telefon && !/^\+\d{8,15}$/.test(telefon)) return raus(400, 'Bitte gib die Telefonnummer mit Vorwahl ein, z. B. +49 170 1234567.');
  const row = { mitglied_id: ich.mitglied_id, email, telefon, whatsapp_ok: d.whatsapp_ok === true && !!telefon, status: 'aktiv', zuletzt_aktiv: jetzt };
  if (ich.status !== 'aktiv') row.registriert = jetzt;
  return schreiben([aend('team_mitglieder', 'mitglied_id', ich.mitglied_id, row)], { id: ich.mitglied_id });
}
if (ich.status !== 'aktiv') return raus(403, 'Bitte trag zuerst deine E-Mail-Adresse ein.');

const PROJEKTE = projekte.length ? projekte.map(p => p.name) : ['Sonstiges'];
const STATUS_A = ['Offen', 'Geplant', 'In Arbeit', 'Wartet', 'Wird getestet', 'Erledigt'];
const LABELS = ['', '🔥 Hohe Prio', '🐸 Eat the Frog', '💬 Zu besprechen', '🛑 Blockiert', 'wartet auf..', '🗂️ Zu klären', 'Übergabe an Kunden'];
const isoWoche = ds => { const t = new Date(ds + 'T12:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd + 3); const j = t.getUTCFullYear(); const e = new Date(Date.UTC(j, 0, 4)); const w = 1 + Math.round(((t - e) / 864e5 - 3 + ((e.getUTCDay() + 6) % 7)) / 7); return j + '-W' + String(w).padStart(2, '0'); };
const mitgliedDa = id => alle.some(m => m.mitglied_id === id);
const VBEREICHE = ['Übersicht', 'Aufgaben', 'Projekte', 'Arbeitszeit', 'Notizen', 'Social Media', 'Kurs & Teilnehmer', 'Systeme', 'Webseite', 'Team', 'Assistent', 'Sonstiges'];
const VSTATUS = ['neu', 'geplant', 'in Arbeit', 'umgesetzt', 'abgelehnt'];

// Überstundenkonto: gemeinsame Logik (Portal und Monatsende-Workflow)
// m: Mitglied {mitglied_id, vertrag_std, startguthaben_min, abrechnung_ab}
// Z: alle Zeiteinträge, R: Abrechnungen, bisYm: letzter Monat 'YYYY-MM'
function zeitkontoRechnen(m, Z, R, bisYm) {
  const ymNext = ym => { let [y, mm] = ym.split('-').map(Number); mm++; if (mm > 12) { mm = 1; y++; } return y + '-' + String(mm).padStart(2, '0'); };
  const sum = arr => arr.reduce((s, z) => s + (Number(z.minuten) || 0), 0);
  const soll = Math.round((Number(m.vertrag_std) || 0) * 60);
  const ab = /^\d{4}-\d{2}-\d{2}$/.test(String(m.abrechnung_ab || '')) ? m.abrechnung_ab : '2026-10-05';
  const meine = (Z || []).filter(z => z.mitglied_id === m.mitglied_id && /^\d{4}-\d{2}-\d{2}$/.test(String(z.datum || '')));
  const vorher = sum(meine.filter(z => z.datum < ab));
  const start = (Number(m.startguthaben_min) || 0) + vorher;
  let konto = start;
  const monate = [];
  for (let ym = ab.slice(0, 7); ym <= bisYm; ym = ymNext(ym)) {
    const E = meine.filter(z => z.datum >= ab && z.datum.slice(0, 7) === ym);
    const W = sum(E);
    const r = (R || []).find(x => x.mitglied_id === m.mitglied_id && x.monat === ym);
    const vor = konto;
    let aus, nach;
    if (r) { aus = Number(r.ausgezahlt_min) || 0; nach = Number(r.konto_nachher_min) || 0; }
    else { aus = soll ? Math.min(soll, W + vor) : W; nach = vor + W - aus; }
    monate.push({ monat: ym, soll: r ? Number(r.soll_min) || soll : soll, gearbeitet: W, ausgezahlt: aus, konto_vorher: vor, konto_nachher: nach,
      abgeschlossen: !!r, eintraege: E.length, offen: E.filter(z => z.status !== 'freigegeben').length });
    konto = nach;
  }
  return { soll, ab, start, vorher, monate };
}

switch (aktion) {
  case 'aufgabe_speichern': {
    const titel = txt(d.titel, 160);
    if (titel.length < 3) return raus(400, 'Bitte gib der Aufgabe einen Titel.');
    const alt = d.aufgabe_id ? aufgaben.find(a => a.aufgabe_id === d.aufgabe_id) : null;
    if (d.aufgabe_id && !alt) return raus(404, 'Diese Aufgabe gibt es nicht mehr.');
    if (veraltet(alt)) return konflikt('Diese Aufgabe', alt);
    const verantwortlich = mitgliedDa(d.verantwortlich) ? d.verantwortlich : (alt ? alt.verantwortlich : ich.mitglied_id);
    let status = STATUS_A.includes(d.status) ? d.status : (alt ? alt.status : 'Offen');
    if (istAgent && status === 'Erledigt') status = 'Wird getestet';
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(d.deadline || '')) ? d.deadline : (alt && d.deadline === undefined ? (alt.deadline || '') : '');
    const prio = [1, 2, 3].includes(Number(d.prio)) ? Number(d.prio) : (alt ? (Number(alt.prio) || 2) : 2);
    const row = {
      aufgabe_id: alt ? alt.aufgabe_id : neueId('a'), titel, beschreibung: d.beschreibung === undefined && alt ? (alt.beschreibung || '') : txt(d.beschreibung, 20000), status, prio,
      label: LABELS.includes(d.label) ? d.label : (alt && d.label === undefined ? (alt.label || '') : ''),
      projekt: PROJEKTE.includes(d.projekt) ? d.projekt : (alt ? (alt.projekt || 'Sonstiges') : 'Sonstiges'),
      verantwortlich, deadline, geaendert: jetzt
    };
    if (typeof d.agent_geeignet === 'boolean') row.agent_geeignet = d.agent_geeignet;
    if (!alt) { row.erstellt = jetzt; row.erstellt_von = ich.mitglied_id; }
    if (status === 'Erledigt' && (!alt || alt.status !== 'Erledigt')) row.erledigt_am = jetzt;
    const neuZugewiesen = (!alt || alt.verantwortlich !== verantwortlich) && verantwortlich !== ich.mitglied_id;
    const empf = alle.find(m => m.mitglied_id === verantwortlich) || {};
    const benachrichtigen = neuZugewiesen && empf.typ !== 'agent' && empf.whatsapp_ok === true && /^\+\d{8,15}$/.test(empf.telefon || '');
    const dl = deadline ? deadline.split('-').reverse().join('.') : 'keine';
    const name = id => (alle.find(m => m.mitglied_id === id) || {}).name || id;
    const ops = [alt ? aend('team_aufgaben', 'aufgabe_id', alt.aufgabe_id, row) : neu('team_aufgaben', row)];
    if (!alt) ops.push(verlauf(row.aufgabe_id, 'status', 'Angelegt' + (verantwortlich !== ich.mitglied_id ? ', zugewiesen an ' + name(verantwortlich) : '')));
    else {
      if (alt.status !== status) ops.push(verlauf(row.aufgabe_id, 'status', 'Status: ' + (alt.status || '–') + ' → ' + status));
      if (alt.verantwortlich !== verantwortlich) ops.push(verlauf(row.aufgabe_id, 'status', 'Zugewiesen an ' + name(verantwortlich)));
    }
    const notiz = txt(d.kommentar, 8000);
    if (notiz) ops.push(verlauf(row.aufgabe_id, istAgent ? 'bericht' : 'kommentar', notiz));
    return schreiben(ops, { id: row.aufgabe_id, benachrichtigen,
      nachricht: { an: String(empf.telefon || '').replace('+', ''), name: empf.name || '', titel, prio: String(prio), deadline: dl, von: ich.name } });
  }
  case 'aufgabe_loeschen': {
    const alt = aufgaben.find(a => a.aufgabe_id === d.aufgabe_id);
    if (!alt) return raus(404, 'Diese Aufgabe gibt es nicht mehr.');
    if (!istAdmin && alt.erstellt_von !== ich.mitglied_id) return raus(403, 'Löschen kann nur, wer die Aufgabe angelegt hat, oder Timo. Setz sie sonst auf „Erledigt“.');
    return schreiben([inPapierkorb('aufgabe', alt.aufgabe_id)], { id: alt.aufgabe_id });
  }
  case 'kommentar': {
    const alt = aufgaben.find(a => a.aufgabe_id === d.aufgabe_id);
    if (!alt) return raus(404, 'Diese Aufgabe gibt es nicht mehr.');
    const text = txt(d.text, 8000);
    if (text.length < 2) return raus(400, 'Bitte schreib einen Kommentar.');
    const art = istAgent ? 'bericht' : 'kommentar';
    return schreiben([verlauf(alt.aufgabe_id, art, text), aend('team_aufgaben', 'aufgabe_id', alt.aufgabe_id, { geaendert: jetzt })], { id: alt.aufgabe_id });
  }
  case 'community_antwort': {
    if (!istDozent) return raus(403, 'Community-Fragen beantworten Timo, Kurt und Murat.');
    const f = (D.community || []).find(c => c.eintrag_id === d.eintrag_id && (c.art === 'frage' || c.art === 'nachricht'));
    if (!f) return raus(404, 'Diesen Beitrag gibt es nicht mehr.');
    const text = txt(d.text, 4000);
    if (text.length < 2) return raus(400, 'Bitte schreib eine Antwort.');
    const row = { eintrag_id: 'c_' + Date.now().toString(36) + rnd(6), art: 'antwort', frage_id: f.eintrag_id, modul: f.modul, autor_typ: 'dozent', autor_id: ich.mitglied_id,
      name: ich.name + ' (Dozent)', text, status: f.art === 'nachricht' ? 'privat' : 'sichtbar' };
    return schreiben([neu('kurs_community', row), aend('kurs_community', 'eintrag_id', f.eintrag_id, { erledigt: true })], { id: row.eintrag_id });
  }
  case 'community_status': {
    if (!istDozent) return raus(403, 'Die Community verwalten Timo, Kurt und Murat.');
    const c = (D.community || []).find(x => x.eintrag_id === d.eintrag_id);
    if (!c) return raus(404, 'Diesen Beitrag gibt es nicht mehr.');
    const row = {};
    if (typeof d.erledigt === 'boolean') row.erledigt = d.erledigt;
    if (['sichtbar', 'versteckt'].includes(d.status) && c.status !== 'privat') row.status = d.status;
    if (!Object.keys(row).length) return raus(400, 'Nichts zu ändern.');
    return schreiben([aend('kurs_community', 'eintrag_id', c.eintrag_id, row)], { id: c.eintrag_id });
  }
  case 'social_speichern': {
    const thema = txt(d.thema, 160);
    if (thema.length < 3) return raus(400, 'Bitte gib dem Beitrag ein Thema.');
    const KAN = ['LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Newsletter', 'Webseite / Blog', 'Sonstiges'];
    const ST = ['Idee', 'In Arbeit', 'Zur Freigabe', 'Geplant', 'Veröffentlicht'];
    const FMT = ['Bild', 'Karussell', 'Reel', 'Text'];
    const altP = /^p_[\w]+$/.test(d.post_id || '') ? d.post_id : '';
    const vorher = altP ? ((D.social || []).find(x => x.post_id === altP) || {}) : {};
    const medien = String(d.medien || '').split(/[\s,]+/).filter(u => /^https:\/\/\S+$/.test(u)).slice(0, 10).join('\n');
    const row = { post_id: altP || neueId('p'), thema, text: txt(d.text, 4000),
      datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || '')) ? d.datum : '', kanal: KAN.includes(d.kanal) ? d.kanal : 'Sonstiges',
      status: ST.includes(d.status) ? d.status : 'Idee', verantwortlich: mitgliedDa(d.verantwortlich) ? d.verantwortlich : ich.mitglied_id,
      link: /^https?:\/\//.test(String(d.link || '')) ? txt(d.link, 400) : '', geaendert: jetzt,
      uhrzeit: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.uhrzeit || '')) ? d.uhrzeit : '',
      format: FMT.includes(d.format) ? d.format : '', medien, hook: txt(d.hook, 300), hashtags: txt(d.hashtags, 500), quelle: txt(d.quelle, 400) };
    if (istAgent && ['Geplant', 'Veröffentlicht'].includes(row.status)) row.status = 'Zur Freigabe';
    // Freigabe: nur ein Mensch setzt „Geplant“. Ändert sich danach Inhalt, Medien oder Termin, muss neu freigegeben werden.
    const inhaltGleich = vorher.text === row.text && String(vorher.medien || '') === row.medien && vorher.datum === row.datum && String(vorher.uhrzeit || '') === row.uhrzeit && String(vorher.hashtags || '') === row.hashtags && vorher.kanal === row.kanal;
    if (row.status === 'Geplant' && !istAgent) {
      if (!(vorher.freigegeben_von && vorher.status === 'Geplant' && inhaltGleich)) { row.freigegeben_von = ich.mitglied_id; row.freigegeben_am = jetzt; }
      row.versuche = 0; row.fehler = null; row.in_arbeit_seit = null;
    } else if (row.status !== 'Veröffentlicht') { row.freigegeben_von = null; row.freigegeben_am = null; }
    return schreiben([altP ? aend('team_social', 'post_id', altP, row) : neu('team_social', row)], { id: row.post_id });
  }
  case 'social_loeschen':
    if (!/^p_[\w]+$/.test(d.post_id || '')) return raus(400, 'Unbekannter Beitrag.');
    return schreiben([inPapierkorb('social', d.post_id)], { id: d.post_id });
  case 'system_speichern': {
    if (!istDozent) return raus(403, 'Systeme pflegen Timo, Kurt und Murat.');
    const name = txt(d.name, 120);
    if (name.length < 3) return raus(400, 'Bitte gib dem System einen Namen.');
    const altS = /^s_[\w]+$/.test(d.system_id || '') ? d.system_id : '';
    const row = { system_id: altS || neueId('s'), name, beschreibung: txt(d.beschreibung, 1500),
      bereich: txt(d.bereich, 40) || 'Intern', status: ['läuft', 'im Bau', 'geplant', 'pausiert'].includes(d.status) ? d.status : 'geplant',
      werkzeug: txt(d.werkzeug, 120), link: /^https?:\/\//.test(String(d.link || '')) ? txt(d.link, 400) : '',
      verantwortlich: mitgliedDa(d.verantwortlich) ? d.verantwortlich : ich.mitglied_id, geaendert: jetzt };
    return schreiben([altS ? aend('team_systeme', 'system_id', altS, row) : neu('team_systeme', row)], { id: row.system_id });
  }
  case 'system_loeschen':
    if (!istDozent) return raus(403, 'Systeme pflegen Timo, Kurt und Murat.');
    if (!/^s_[\w]+$/.test(d.system_id || '')) return raus(400, 'Unbekanntes System.');
    return schreiben([inPapierkorb('system', d.system_id)], { id: d.system_id });
  case 'zeit_speichern': {
    const datum = String(d.datum || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return raus(400, 'Bitte wähle ein Datum.');
    const zuMin = t => /^\d{2}:\d{2}$/.test(String(t || '')) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;
    const v = zuMin(d.von), bi = zuMin(d.bis);
    if (v === null || bi === null) return raus(400, 'Bitte gib Beginn und Ende als Uhrzeit ein.');
    const pause = Math.max(0, Math.min(480, Math.round(Number(d.pause_min) || 0)));
    const minuten = bi - v - pause;
    if (minuten <= 0) return raus(400, 'Das Ende muss nach dem Beginn liegen (abzüglich Pause).');
    if (minuten > 720) return raus(400, 'Mehr als 12 Stunden an einem Tag? Bitte prüf die Uhrzeiten.');
    const alt = d.zeit_id ? zeiten.find(z => z.zeit_id === d.zeit_id) : null;
    if (d.zeit_id && !alt) return raus(404, 'Diesen Eintrag gibt es nicht mehr.');
    if (alt && alt.mitglied_id !== ich.mitglied_id && !istAdmin) return raus(403, 'Das ist nicht dein Eintrag.');
    if (alt && alt.status === 'freigegeben' && !istAdmin) return raus(403, 'Dieser Eintrag ist schon freigegeben und kann nicht mehr geändert werden.');
    const tagX = new Date(datum + 'T12:00:00Z');
    if (tagX - Date.now() > 2 * 864e5) return raus(400, 'Zeiten für die Zukunft kannst du noch nicht eintragen.');
    const taetigkeit = txt(d.taetigkeit, 500);
    if (taetigkeit.length < 3) return raus(400, 'Schreib kurz dazu, was du gemacht hast.');
    const aufgabe = aufgaben.find(a => a.aufgabe_id === d.aufgabe_id);
    const row = { zeit_id: alt ? alt.zeit_id : neueId('z'), mitglied_id: alt ? alt.mitglied_id : ich.mitglied_id, datum, von: d.von, bis: d.bis,
      pause_min: pause, minuten, taetigkeit, aufgabe_id: aufgabe ? aufgabe.aufgabe_id : '', projekt: PROJEKTE.includes(d.projekt) ? d.projekt : (aufgabe ? aufgabe.projekt : 'Sonstiges'),
      kw: isoWoche(datum), status: alt && alt.status === 'eingereicht' ? 'eingereicht' : 'offen', geaendert: jetzt };
    return schreiben([alt ? aend('team_zeiten', 'zeit_id', alt.zeit_id, row) : neu('team_zeiten', row)], { id: row.zeit_id });
  }
  case 'zeit_loeschen': {
    const alt = zeiten.find(z => z.zeit_id === d.zeit_id);
    if (!alt) return raus(404, 'Diesen Eintrag gibt es nicht mehr.');
    if (alt.mitglied_id !== ich.mitglied_id && !istAdmin) return raus(403, 'Das ist nicht dein Eintrag.');
    if (alt.status === 'freigegeben' && !istAdmin) return raus(403, 'Freigegebene Einträge können nicht gelöscht werden.');
    return schreiben([inPapierkorb('zeit', alt.zeit_id)], { id: alt.zeit_id });
  }
  case 'woche_einreichen': {
    const kw = String(d.kw || '');
    const ids = zeiten.filter(z => z.mitglied_id === ich.mitglied_id && z.kw === kw && (z.status === 'offen' || z.status === 'abgelehnt')).map(z => z.zeit_id);
    if (!ids.length) return raus(400, 'In dieser Woche gibt es nichts mehr einzureichen.');
    return schreiben([aendViele('team_zeiten', 'zeit_id', ids, { status: 'eingereicht', eingereicht_am: jetzt, geaendert: jetzt })], { id: kw });
  }
  case 'zeiten_pruefen': {
    if (!istAdmin) return raus(403, 'Arbeitszeiten gibt Timo frei.');
    const ent = d.entscheidung === 'freigegeben' ? 'freigegeben' : d.entscheidung === 'abgelehnt' ? 'abgelehnt' : '';
    if (!ent) return raus(400, 'Bitte wähle Freigeben oder Zurückgeben.');
    const ids = zeiten.filter(z => z.mitglied_id === d.mitglied_id && z.kw === d.kw && z.status !== 'freigegeben').map(z => z.zeit_id);
    if (!ids.length) return raus(400, 'Für diese Woche ist nichts offen.');
    return schreiben([aendViele('team_zeiten', 'zeit_id', ids, { status: ent, freigegeben_von: ich.mitglied_id, freigegeben_am: jetzt, kommentar: txt(d.kommentar, 500), geaendert: jetzt })], { id: d.kw });
  }
  case 'projekt_speichern': {
    const name = txt(d.name, 60);
    if (name.length < 2) return raus(400, 'Bitte gib dem Projekt einen Namen.');
    const alt = d.projekt_id ? projekte.find(p => p.projekt_id === d.projekt_id) : null;
    if (d.projekt_id && !alt) return raus(404, 'Dieses Projekt gibt es nicht mehr.');
    if (alt && !istDozent && alt.verantwortlich !== ich.mitglied_id) return raus(403, 'Bearbeiten können die zuständige Person, Timo, Kurt und Murat.');
    const doppelt = projekte.find(p => p.name.toLowerCase() === name.toLowerCase() && (!alt || p.projekt_id !== alt.projekt_id));
    if (doppelt) return raus(400, 'Ein Projekt mit diesem Namen gibt es schon.');
    if (alt && alt.name !== name) {
      const benutzt = aufgaben.some(a => a.projekt === alt.name) || zeiten.some(z => z.projekt === alt.name) || notizen.some(n => n.projekt === alt.name);
      if (benutzt) return raus(400, 'Der Name wird schon in Aufgaben, Zeiten oder Notizen verwendet und kann deshalb nicht mehr geändert werden. Beschreibung, Status und Farbe kannst du ändern.');
    }
    // Links: nur http(s), keine Zugangsdaten in der Adresse
    let links = null;
    if (Array.isArray(d.links)) {
      links = d.links.slice(0, 40).map(l => ({ titel: txt(l && l.titel, 80), url: txt(l && l.url, 500) })).filter(l => l.url);
      const schlecht = links.find(l => !/^https?:\/\/\S+$/i.test(l.url));
      if (schlecht) return raus(400, 'Dieser Link ist keine gültige Adresse (muss mit https:// beginnen): ' + schlecht.url.slice(0, 60));
      if (links.some(l => /[?&#](token|key|apikey|api_key|access_token|password|passwort|pass|pwd|secret|sig|signature|auth)=/i.test(l.url) || /\/\/[^\/@\s]+:[^\/@\s]*@/.test(l.url)))
        return raus(400, 'Ein Link enthält Zugangsdaten (Passwort, Token oder Schlüssel). Bitte nur die reine Adresse eintragen, Zugangsdaten gehören in den Passwort-Manager.');
      links = links.map(l => ({ titel: l.titel || l.url.replace(/^https?:\/\//i, '').split('/')[0], url: l.url }));
    }
    const row = { projekt_id: alt ? alt.projekt_id : neueId('j'), name, beschreibung: txt(d.beschreibung, 2000),
      status: ['aktiv', 'geplant', 'pausiert', 'abgeschlossen'].includes(d.status) ? d.status : 'aktiv',
      farbe: /^#[0-9a-fA-F]{6}$/.test(String(d.farbe || '')) ? d.farbe : '#7B3FE4',
      verantwortlich: mitgliedDa(d.verantwortlich) ? d.verantwortlich : ich.mitglied_id,
      reihenfolge: alt ? (Number(alt.reihenfolge) || 50) : 50, geaendert: jetzt };
    if (links) row.links = links;
    return schreiben([alt ? aend('team_projekte', 'projekt_id', alt.projekt_id, row) : neu('team_projekte', row)], { id: row.projekt_id });
  }
  case 'projekt_loeschen': {
    if (!istAdmin) return raus(403, 'Projekte löscht Timo. Setz es sonst auf „abgeschlossen“.');
    const alt = projekte.find(p => p.projekt_id === d.projekt_id);
    if (!alt) return raus(404, 'Dieses Projekt gibt es nicht mehr.');
    const benutzt = aufgaben.some(a => a.projekt === alt.name) || zeiten.some(z => z.projekt === alt.name) || notizen.some(n => n.projekt === alt.name);
    if (benutzt) return raus(400, 'Das Projekt wird noch in Aufgaben, Zeiten oder Notizen verwendet. Setz es auf „abgeschlossen“.');
    return schreiben([weg('team_projekte', 'projekt_id', alt.projekt_id)], { id: alt.projekt_id });
  }
  case 'notiz_speichern': {
    const titel = txt(d.titel, 160);
    if (titel.length < 2) return raus(400, 'Bitte gib der Notiz einen Titel.');
    const alt = d.notiz_id ? notizen.find(n => n.notiz_id === d.notiz_id) : null;
    if (d.notiz_id && !alt) return raus(404, 'Diese Notiz gibt es nicht mehr.');
    if (veraltet(alt)) return konflikt('Diese Notiz', alt);
    const doppelt = notizen.find(n => n.titel.toLowerCase() === titel.toLowerCase() && (!alt || n.notiz_id !== alt.notiz_id));
    if (doppelt) return raus(400, 'Eine Notiz mit diesem Titel gibt es schon. Titel müssen eindeutig sein, damit Links [[Titel]] funktionieren.');
    const row = { notiz_id: alt ? alt.notiz_id : neueId('n'), titel, inhalt: txt(d.inhalt, 50000),
      projekt: PROJEKTE.includes(d.projekt) ? d.projekt : '', geaendert_von: ich.mitglied_id, geaendert: jetzt };
    if (!alt) { row.autor = ich.mitglied_id; row.erstellt = jetzt; }
    return schreiben([alt ? aend('team_notizen', 'notiz_id', alt.notiz_id, row) : neu('team_notizen', row)], { id: row.notiz_id });
  }
  case 'notiz_loeschen': {
    const alt = notizen.find(n => n.notiz_id === d.notiz_id);
    if (!alt) return raus(404, 'Diese Notiz gibt es nicht mehr.');
    if (!istAdmin && alt.autor !== ich.mitglied_id) return raus(403, 'Löschen kann nur, wer die Notiz angelegt hat, oder Timo.');
    return schreiben([inPapierkorb('notiz', alt.notiz_id)], { id: alt.notiz_id });
  }
  case 'vertrag_speichern': {
    const mid = d.mitglied_id || ich.mitglied_id;
    const p = alle.find(m => m.mitglied_id === mid);
    if (!p || p.typ === 'agent') return raus(404, 'Diese Person gibt es nicht.');
    if (mid !== ich.mitglied_id && !istAdmin) return raus(403, 'Den Vertrag kann nur die Person selbst oder Timo ändern.');
    const std = Number(d.vertrag_std);
    if (!(std >= 0 && std <= 250)) return raus(400, 'Bitte gib die Stunden pro Monat als Zahl zwischen 0 und 250 ein.');
    const sg = Number(d.startguthaben_std) || 0;
    if (sg < 0 || sg > 2000) return raus(400, 'Das Guthaben muss zwischen 0 und 2000 Stunden liegen.');
    const ab = /^\d{4}-\d{2}-\d{2}$/.test(String(d.abrechnung_ab || '')) ? d.abrechnung_ab : '2026-10-05';
    return schreiben([aend('team_mitglieder', 'mitglied_id', mid, { vertrag_std: Math.round(std * 100) / 100, startguthaben_min: Math.round(sg * 60), abrechnung_ab: ab })], { id: mid });
  }
  case 'monat_abschliessen': {
    if (!istAdmin) return raus(403, 'Monate schließt Timo ab.');
    const p = alle.find(m => m.mitglied_id === d.mitglied_id);
    if (!p || !(Number(p.vertrag_std) > 0)) return raus(400, 'Für diese Person ist noch kein Vertrag eingetragen.');
    const monat = String(d.monat || '');
    const dieser = new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monat) || monat >= dieser) return raus(400, 'Abschließen geht erst, wenn der Monat vorbei ist.');
    const R = (D.abrechnung || []);
    if (R.some(r => r.mitglied_id === p.mitglied_id && r.monat === monat)) return raus(400, 'Dieser Monat ist schon abgeschlossen.');
    const offen = zeiten.filter(z => z.mitglied_id === p.mitglied_id && String(z.datum).slice(0, 7) === monat && z.status !== 'freigegeben');
    if (offen.length) return raus(400, 'Es sind noch ' + offen.length + ' Einträge in diesem Monat nicht freigegeben.');
    const rr = zeitkontoRechnen(p, zeiten, R, monat);
    const mo = rr.monate.find(x => x.monat === monat);
    if (!mo) return raus(400, 'Dieser Monat liegt vor dem Abrechnungsbeginn.');
    const row = { abrechnung_id: p.mitglied_id + '_' + monat, mitglied_id: p.mitglied_id, monat, soll_min: mo.soll, gearbeitet_min: mo.gearbeitet, ausgezahlt_min: mo.ausgezahlt,
      konto_vorher_min: mo.konto_vorher, konto_nachher_min: mo.konto_nachher, eintraege: mo.eintraege, erstellt: jetzt, erstellt_von: ich.mitglied_id };
    return schreiben([neu('team_abrechnung', row)], { id: row.abrechnung_id });
  }
  case 'monat_aufheben': {
    if (!istAdmin) return raus(403, 'Monatsabschlüsse verwaltet Timo.');
    const id = String(d.mitglied_id || '') + '_' + String(d.monat || '');
    if (!(D.abrechnung || []).some(r => r.abrechnung_id === id)) return raus(404, 'Diesen Abschluss gibt es nicht.');
    return schreiben([weg('team_abrechnung', 'abrechnung_id', id)], { id });
  }
  case 'vorschlag_speichern': {
    const titel = txt(d.titel, 160);
    if (titel.length < 3) return raus(400, 'Bitte gib dem Vorschlag einen kurzen Titel.');
    const alt = d.vorschlag_id ? vorschlaege.find(v => v.vorschlag_id === d.vorschlag_id) : null;
    if (d.vorschlag_id && !alt) return raus(404, 'Diesen Vorschlag gibt es nicht mehr.');
    if (alt && !istAdmin && !(alt.autor === ich.mitglied_id && alt.status === 'neu')) return raus(403, 'Ändern kann nur, wer den Vorschlag geschrieben hat (solange er neu ist), oder Timo.');
    const row = { titel, text: txt(d.text, 8000), bereich: VBEREICHE.includes(d.bereich) ? d.bereich : 'Sonstiges', geaendert: jetzt };
    if (istAdmin) {
      if (VSTATUS.includes(d.status)) row.status = d.status;
      if (d.antwort !== undefined) row.antwort = txt(d.antwort, 4000);
      if (alt && ((row.antwort !== undefined && row.antwort !== (alt.antwort || '')) || (row.status && row.status !== alt.status))) row.antwort_von = ich.mitglied_id;
      if (d.aufgabe_id !== undefined) row.aufgabe_id = txt(d.aufgabe_id, 80);
    }
    if (!alt) { row.vorschlag_id = neueId('v'); row.autor = ich.mitglied_id; row.erstellt = jetzt; row.stimmen = [ich.mitglied_id]; if (!row.status) row.status = 'neu'; }
    return schreiben([alt ? aend('team_vorschlaege', 'vorschlag_id', alt.vorschlag_id, row) : neu('team_vorschlaege', row)], { id: alt ? alt.vorschlag_id : row.vorschlag_id });
  }
  case 'vorschlag_stimme': {
    const alt = vorschlaege.find(v => v.vorschlag_id === d.vorschlag_id);
    if (!alt) return raus(404, 'Diesen Vorschlag gibt es nicht mehr.');
    const st = Array.isArray(alt.stimmen) ? alt.stimmen.filter(x => typeof x === 'string') : [];
    const i = st.indexOf(ich.mitglied_id);
    if (i >= 0) st.splice(i, 1); else st.push(ich.mitglied_id);
    return schreiben([aend('team_vorschlaege', 'vorschlag_id', alt.vorschlag_id, { stimmen: st })], { id: alt.vorschlag_id });
  }
  case 'vorschlag_loeschen': {
    const alt = vorschlaege.find(v => v.vorschlag_id === d.vorschlag_id);
    if (!alt) return raus(404, 'Diesen Vorschlag gibt es nicht mehr.');
    if (!istAdmin && !(alt.autor === ich.mitglied_id && alt.status === 'neu')) return raus(403, 'Löschen kann nur, wer den Vorschlag geschrieben hat (solange er neu ist), oder Timo.');
    return schreiben([inPapierkorb('vorschlag', alt.vorschlag_id)], { id: alt.vorschlag_id });
  }
  case 'papierkorb': {
    // Timo sieht alles, alle anderen nur, was sie selbst gelöscht haben
    const ART = { aufgabe: 'Aufgabe', notiz: 'Notiz', vorschlag: 'Vorschlag', social: 'Social-Beitrag', system: 'System', zeit: 'Zeiteintrag', teilnehmer: 'Teilnehmer' };
    const sicht = papierkorb.filter(e => istAdmin || e.geloescht_von === ich.mitglied_id);
    return lesen({ tage: PK_TAGE, eintraege: sicht.map(e => {
      const z = e.daten || {};
      const text = String(z.inhalt || z.beschreibung || z.text || z.notiz || '');
      const bis = e.geloescht_am ? new Date(new Date(e.geloescht_am).getTime() + PK_TAGE * 864e5).toISOString() : '';
      return { eintrag_id: e.eintrag_id, art: e.art, art_name: ART[e.art] || e.art, objekt_id: e.objekt_id, titel: e.titel || '', projekt: z.projekt || '',
        vorschau: text.slice(0, 400), zeichen: text.length, kommentare: Array.isArray(z._verlauf) ? z._verlauf.length : 0,
        geloescht_von: e.geloescht_von, geloescht_von_name: nameVon(e.geloescht_von), geloescht_am: e.geloescht_am, endgueltig_ab: bis };
    }) });
  }
  case 'papierkorb_wiederherstellen': {
    const e = papierkorb.find(x => x.eintrag_id === d.eintrag_id);
    if (!e) return raus(404, 'Dieser Eintrag ist nicht mehr im Papierkorb.');
    if (!istAdmin && e.geloescht_von !== ich.mitglied_id) return raus(403, 'Wiederherstellen kann, wer gelöscht hat, oder Timo.');
    return schreiben([{ methode: 'POST', pfad: 'rpc/team_wiederherstellen', body: { p_eintrag: e.eintrag_id } }], { id: e.objekt_id });
  }
  case 'notiz_versionen': {
    const n = notizen.find(x => x.notiz_id === d.notiz_id);
    if (!n) return raus(404, 'Diese Notiz gibt es nicht mehr.');
    const V = (D.notiz_versionen || []).filter(v => v && v.notiz_id === n.notiz_id).sort((a, b) => String(b.gesichert_am).localeCompare(String(a.gesichert_am)));
    return lesen({ notiz_id: n.notiz_id, versionen: V.map(v => ({ version_id: v.version_id, titel: v.titel || '', inhalt: v.inhalt || '', projekt: v.projekt || '',
      geaendert_von: v.geaendert_von || '', geaendert_von_name: nameVon(v.geaendert_von), fassung_vom: v.fassung_vom || '', gesichert_am: v.gesichert_am || '' })) });
  }
  // ---------- Teilnehmer-Register (Timo und Dozenten) ----------
  case 'teilnehmer': {
    if (!istDozent) return raus(403, 'Das Teilnehmer-Register sehen Timo und die Dozenten.');
    return lesen({ spalten: tnSpalten.map(s => ({ spalte_id: s.spalte_id, titel: s.titel, reihenfolge: Number(s.reihenfolge) || 50, aktiv: s.aktiv !== false })),
      teilnehmer: tnListe.map(t => ({ tn_id: t.tn_id, name: t.name || '', email: t.email || '', telefon: t.telefon || '', massnahme: t.massnahme || '', start: t.start || '', ende: t.ende || '',
        status: t.status || 'aktiv', notiz: t.notiz || '', haken: t.haken && typeof t.haken === 'object' ? t.haken : {}, geaendert: t.geaendert || '', geaendert_von_name: nameVon(t.geaendert_von) })) });
  }
  case 'tn_speichern': {
    if (!istDozent) return raus(403, 'Das Teilnehmer-Register pflegen Timo und die Dozenten.');
    const name = txt(d.name, 120);
    if (name.length < 2) return raus(400, 'Bitte gib einen Namen ein.');
    const alt = d.tn_id ? tnListe.find(t => t.tn_id === d.tn_id) : null;
    if (d.tn_id && !alt) return raus(404, 'Diesen Teilnehmer gibt es nicht mehr.');
    if (veraltet(alt)) return konflikt('Dieser Eintrag', alt);
    const email = txt(d.email, 160).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return raus(400, 'Die E-Mail-Adresse sieht nicht richtig aus.');
    const row = { tn_id: alt ? alt.tn_id : neueId('tn'), name, email, telefon: txt(d.telefon, 40), massnahme: txt(d.massnahme, 80), start: tnDatum(d.start), ende: tnDatum(d.ende),
      status: TN_STATUS.includes(d.status) ? d.status : (alt ? alt.status || 'aktiv' : 'aktiv'), notiz: txt(d.notiz, 4000), geaendert: jetzt, geaendert_von: ich.mitglied_id };
    if (!alt) { row.erstellt = jetzt; row.erstellt_von = ich.mitglied_id; row.haken = {}; }
    const ops = [alt ? aend('team_teilnehmer', 'tn_id', alt.tn_id, row) : neu('team_teilnehmer', row)];
    for (const h of (Array.isArray(d.haken_aenderungen) ? d.haken_aenderungen : []).slice(0, 50)) {
      if (h && tnSpalten.some(s => s.spalte_id === h.spalte_id) && ['ja', 'entfaellt', ''].includes(h.wert)) ops.push(tnHaken(row.tn_id, h.spalte_id, h.wert, h.datum));
    }
    return schreiben(ops, { id: row.tn_id });
  }
  case 'tn_haken': {
    if (!istDozent) return raus(403, 'Das Teilnehmer-Register pflegen Timo und die Dozenten.');
    const t = tnListe.find(x => x.tn_id === d.tn_id);
    if (!t) return raus(404, 'Diesen Teilnehmer gibt es nicht mehr.');
    if (!tnSpalten.some(s => s.spalte_id === d.spalte_id)) return raus(400, 'Diese Spalte gibt es nicht.');
    if (!['ja', 'entfaellt', ''].includes(d.wert)) return raus(400, 'Unbekannter Wert.');
    return schreiben([tnHaken(t.tn_id, d.spalte_id, d.wert, d.datum)], { id: t.tn_id });
  }
  case 'tn_loeschen': {
    if (!istAdmin) return raus(403, 'Teilnehmer löscht Timo.');
    const t = tnListe.find(x => x.tn_id === d.tn_id);
    if (!t) return raus(404, 'Diesen Teilnehmer gibt es nicht mehr.');
    return schreiben([inPapierkorb('teilnehmer', t.tn_id)], { id: t.tn_id });
  }
  case 'tn_spalte_speichern': {
    if (!istAdmin) return raus(403, 'Spalten des Registers verwaltet Timo.');
    const titel = txt(d.titel, 60);
    if (titel.length < 2) return raus(400, 'Bitte gib der Spalte einen Namen.');
    const alt = d.spalte_id ? tnSpalten.find(s => s.spalte_id === d.spalte_id) : null;
    if (d.spalte_id && !alt) return raus(404, 'Diese Spalte gibt es nicht mehr.');
    if (tnSpalten.some(s => s.titel.toLowerCase() === titel.toLowerCase() && (!alt || s.spalte_id !== alt.spalte_id))) return raus(400, 'Eine Spalte mit diesem Namen gibt es schon.');
    const row = { spalte_id: alt ? alt.spalte_id : neueId('sp'), titel, reihenfolge: Math.max(0, Math.min(999, Math.round(Number(d.reihenfolge)))) || (alt ? Number(alt.reihenfolge) || 50 : (Math.max(0, ...tnSpalten.map(s => Number(s.reihenfolge) || 0)) + 10)),
      aktiv: typeof d.aktiv === 'boolean' ? d.aktiv : (alt ? alt.aktiv !== false : true) };
    return schreiben([alt ? aend('team_tn_spalten', 'spalte_id', alt.spalte_id, row) : neu('team_tn_spalten', row)], { id: row.spalte_id });
  }
  case 'mitglied_speichern': {
    if (!istAdmin) return raus(403, 'Teammitglieder verwaltet Timo.');
    const name = txt(d.name, 60);
    if (name.length < 2) return raus(400, 'Bitte gib einen Namen ein.');
    const alt = alle.find(m => m.mitglied_id === d.mitglied_id);
    if (alt && alt.mitglied_id === ich.mitglied_id && d.rolle !== 'admin') return raus(400, 'Du kannst dir selbst die Admin-Rolle nicht nehmen.');
    // Neuer KI-Agent (nur Timo): ID „agent-<name>“, Rolle „agent“ (darf nur, was AGENT_DARF erlaubt), sofort aktiv, Agenten-Code statt Link
    const agentNeu = !alt && d.typ === 'agent';
    const agentId = () => {
      const s = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'agent';
      const id = 'agent-' + s;
      return alle.some(m => m.mitglied_id === id) ? id + '-' + rnd(4) : id;
    };
    const row = { mitglied_id: alt ? alt.mitglied_id : (agentNeu ? agentId() : neueId('m')), name, funktion: txt(d.funktion, 60),
      rolle: (alt && alt.rolle === 'agent') || agentNeu ? 'agent' : (['admin', 'dozent', 'vertrieb', 'team'].includes(d.rolle) ? d.rolle : 'team') };
    if (!alt) { row.status = agentNeu ? 'aktiv' : 'eingeladen'; row.token = rnd(32); row.email = ''; row.telefon = ''; row.whatsapp_ok = false; row.typ = agentNeu ? 'agent' : 'mensch'; }
    else if (['aktiv', 'gesperrt', 'eingeladen'].includes(d.status) && alt.mitglied_id !== ich.mitglied_id) row.status = d.status;
    if (alt && d.neuer_link === true) { row.token = rnd(32); if (alt.status === 'eingeladen') row.status = 'eingeladen'; }
    if (alt && alt.typ === 'agent' && row.status === 'eingeladen') row.status = 'aktiv';
    return schreiben([alt ? aend('team_mitglieder', 'mitglied_id', alt.mitglied_id, row) : neu('team_mitglieder', row)], { id: row.mitglied_id });
  }
}
return raus(400, 'Unbekannte Aktion.');
