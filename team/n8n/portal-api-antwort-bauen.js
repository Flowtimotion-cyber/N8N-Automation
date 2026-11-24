// Baut die Antwort für das Portal. Was jemand sieht, hängt von der Rolle ab.
const p = $('Anfrage prüfen').first().json;
const ich = p.ich;
const istAdmin = ich.rolle === 'admin';
const istDozent = istAdmin || ich.rolle === 'dozent';
// Wer die Stunden-Übersicht des ganzen Teams sehen darf (nur lesen, keine Freigaben): Admin und diese Personen
const STUNDEN_SICHT = ['m_murat'];
const stundenSicht = istAdmin || STUNDEN_SICHT.includes(ich.mitglied_id);
const D = $('Team-Daten laden').first().json || {};
const rows = n => { try { return $(n).all().map(i => i.json).filter(r => r && Object.keys(r).length > 3); } catch (e) { return []; } };
const ohne = r => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = v == null ? '' : v; return o; };
const alle = D.mitglieder || [];
const voll = alle.find(m => m.mitglied_id === ich.mitglied_id) || {};
const meins = { mitglied_id: voll.mitglied_id, name: voll.name, rolle: voll.rolle, typ: voll.typ || 'mensch', funktion: voll.funktion, status: voll.status, email: voll.email || '', telefon: voll.telefon || '', whatsapp_ok: voll.whatsapp_ok === true, stunden_sicht: stundenSicht };
if (voll.status !== 'aktiv') return [{ json: { antwort: { ok: true, setup: true, ich: meins } } }];
const istAgent = ich.rolle === 'agent';
// Private Aufgaben (Entscheidung 23.11.2026): nur für Ersteller und Bearbeiter, auch nicht für Timo oder andere Agenten. Verlauf ebenso.
const bearbeiterListe = a => Array.isArray(a.bearbeiter) && a.bearbeiter.length ? a.bearbeiter : (a.verantwortlich ? [a.verantwortlich] : []);
const sichtbar = a => a.privat !== true || a.erstellt_von === ich.mitglied_id || bearbeiterListe(a).includes(ich.mitglied_id);
const aufgabenSicht = (D.aufgaben || []).filter(a => a && a.aufgabe_id && sichtbar(a));
const versteckt = new Set((D.aufgaben || []).filter(a => a && a.aufgabe_id && !sichtbar(a)).map(a => a.aufgabe_id));
const verlauf = (D.verlauf || []).filter(v => !versteckt.has(v.aufgabe_id)).map(v => ({ aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt }));
if (istAgent) {
  // Agenten bekommen nur, was sie für die Arbeit brauchen: keine Kontaktdaten, keine Zeiten, keine Kursdaten
  const aufg = aufgabenSicht.map(ohne);
  return [{ json: { antwort: { ok: true, ich: meins,
    mitglieder: alle.map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ, funktion: m.funktion || '' })),
    projekte: (D.projekte || []).map(ohne), aufgaben: aufg, verlauf,
    // Mehrere Bearbeiter (21.11.2026): „meine“ = ich stehe in der Bearbeiter-Liste (ältere Einträge ohne Liste: Feld verantwortlich)
    meine_aufgaben: aufg.filter(a => (Array.isArray(a.bearbeiter) && a.bearbeiter.length ? a.bearbeiter : [a.verantwortlich]).includes(ich.mitglied_id) && a.status !== 'Erledigt').map(a => a.aufgabe_id),
    agent_geeignet: aufg.filter(a => a.agent_geeignet === true && a.status !== 'Erledigt').map(a => a.aufgabe_id),
    notizen: (D.notizen || []).map(ohne), systeme: (D.systeme || []).map(ohne), social: (D.social || []).map(ohne),
    regeln: 'Status „Erledigt“ setzt nur ein Mensch; du setzt „Wird getestet“ und schreibst einen Bericht (Feld kommentar). Nichts löschen. Keine Zugangsdaten in Texte schreiben. Aufgaben mit privat: true sind nur für Ersteller und Bearbeiter: ihren Inhalt nie in Notizen, Berichte an andere oder öffentliche Texte übernehmen.',
    stand: new Date().toISOString() } } }];
}

const mitglieder = alle.map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ || 'mensch', funktion: m.funktion || '', status: m.status,
  email: m.email || '', telefon: m.telefon || '', whatsapp_ok: m.whatsapp_ok === true, zuletzt_aktiv: m.zuletzt_aktiv || '',
  ...(istAdmin || m.mitglied_id === ich.mitglied_id ? { vertrag_std: m.vertrag_std == null ? '' : m.vertrag_std, startguthaben_min: Number(m.startguthaben_min) || 0, abrechnung_ab: m.abrechnung_ab || '2026-10-05' } : {}),
  ...(istAdmin ? { token: m.token } : {}) }));

const tage = d => d ? (Date.now() - new Date(d).getTime()) / 864e5 : 9999;
const lern = rows('Lernstand lesen').filter(r => r.teilnehmer_id);
const chat = rows('Chatfragen lesen');
const anfr = rows('Anfragen lesen');
const zaehl = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const personen = new Set(lern.map(r => r.teilnehmer_id));
const kursName = k => ({ 'm11': 'Teil 1', 'm12': 'Teil 2', 'modul-1-1': 'Teil 1', 'modul-1-2': 'Teil 2' }[k] || k || '–');
const fehlerListe = [];
for (const r of lern) for (const f of String(r.check_fehler || '').split('|').map(s => s.trim()).filter(Boolean)) fehlerListe.push(f);
const kurs = {
  teilnehmende: personen.size,
  aktiv_7_tage: new Set(lern.filter(r => tage(r.zuletzt_aktiv) <= 7).map(r => r.teilnehmer_id)).size,
  check_bestanden: lern.filter(r => r.check_bestanden === true).length,
  fortschritt_schnitt: lern.length ? Math.round(lern.reduce((s, r) => s + (Number(r.fortschritt_prozent) || 0), 0) / lern.length) : 0,
  je_teil: zaehl(lern, r => kursName(r.kurs)),
  schritte: zaehl(lern, r => r.aktueller_schritt).slice(0, 12),
  check_fehler: zaehl(fehlerListe.map(f => ({ f })), x => x.f).slice(0, 8),
  fragen_gesamt: chat.length,
  fragen_7_tage: chat.filter(c => tage(c.zeitpunkt) <= 7).length,
  fragen_je_schritt: zaehl(chat, c => c.schritt).slice(0, 10),
  namen_sichtbar: istDozent,
  liste: istDozent ? lern.map(r => ({ name: r.name, email: r.email, kurs: kursName(r.kurs), code_falsch: !!r.kurscode && !['MOMENTUM26', 'OFFEN'].includes(r.kurscode), kurscode: r.kurscode || '', fortschritt: r.fortschritt_prozent || 0, schritt: r.aktueller_schritt || '',
    check: r.check_bestanden === true ? 'bestanden' : (r.check_versuche ? 'nicht bestanden' : 'offen'), zuletzt: r.zuletzt_aktiv || '' }))
    .sort((a, b) => String(b.zuletzt).localeCompare(String(a.zuletzt))) : [],
  fragen: istDozent ? chat.sort((a, b) => String(b.zeitpunkt).localeCompare(String(a.zeitpunkt))).slice(0, 25)
    .map(c => ({ zeit: c.zeitpunkt, name: c.name, kurs: c.kurs || '', schritt: c.schritt, frage: String(c.frage || '').slice(0, 400) })) : []
};
// Je Modul getrennt (z. B. Modul 1.1, Modul 1.2, Unternehmer Modul 1)
kurs.module = [...new Set(lern.map(r => r.kurs).concat(chat.map(c => c.kurs)).filter(Boolean))].sort().map(name => {
  const L = lern.filter(r => r.kurs === name), C = chat.filter(c => c.kurs === name);
  const fe = []; for (const r of L) for (const f of String(r.check_fehler || '').split('|').map(s => s.trim()).filter(Boolean)) fe.push(f);
  return { name, teilnehmende: new Set(L.map(r => r.teilnehmer_id)).size,
    aktiv_7_tage: new Set(L.filter(r => tage(r.zuletzt_aktiv) <= 7).map(r => r.teilnehmer_id)).size,
    fortschritt_schnitt: L.length ? Math.round(L.reduce((s, r) => s + (Number(r.fortschritt_prozent) || 0), 0) / L.length) : 0,
    abgeschlossen: L.filter(r => Number(r.fortschritt_prozent) >= 100).length,
    check_bestanden: L.filter(r => r.check_bestanden === true).length,
    schritte: zaehl(L, r => r.aktueller_schritt).slice(0, 12),
    check_fehler: zaehl(fe.map(f => ({ f })), x => x.f).slice(0, 8),
    fragen_gesamt: C.length, fragen_7_tage: C.filter(c => tage(c.zeitpunkt) <= 7).length,
    fragen_je_schritt: zaehl(C, c => c.schritt).slice(0, 10) };
});
const anfragen = anfr.filter(a => istDozent || a.typ !== 'zugang').sort((a, b) => String(b.eingegangen).localeCompare(String(a.eingegangen)))
  .map(a => ({ typ: a.typ, name: a.name, firma: a.firma, email: a.email, telefon: a.telefon, mitarbeitende: a.mitarbeitende, server: a.server,
    zeitrahmen: a.zeitrahmen, nachricht: String(a.nachricht || '').slice(0, 1500), status: a.status, eingegangen: a.eingegangen, kurs: a.kurs }));
return [{ json: { antwort: { ok: true, ich: meins, mitglieder,
  aufgaben: aufgabenSicht.map(ohne), verlauf, social: (D.social || []).map(ohne), systeme: (D.systeme || []).map(ohne),
  zeiten: (D.zeiten || []).filter(z => istAdmin || z.mitglied_id === ich.mitglied_id).map(ohne),
  abrechnung: (D.abrechnung || []).filter(r => istAdmin || r.mitglied_id === ich.mitglied_id).map(ohne),
  projekte: (D.projekte || []).map(ohne).sort((x, y) => (Number(x.reihenfolge) || 50) - (Number(y.reihenfolge) || 50) || String(x.name).localeCompare(String(y.name))),
  notizen: (D.notizen || []).map(ohne),
  vorschlaege: (D.vorschlaege || []).map(v => ({ ...ohne(v), stimmen: Array.isArray(v.stimmen) ? v.stimmen : [] })),
  community: istDozent ? (D.community || []).map(c => ({ eintrag_id: c.eintrag_id, art: c.art, frage_id: c.frage_id || '', modul: c.modul || '', name: c.name || '', autor_typ: c.autor_typ,
    text: c.text, status: c.status, erledigt: c.erledigt === true, erstellt: c.erstellt })) : [],
  // Team-Stunden nur als Summen-Rohdaten (Datum, Minuten, Status) – keine Tätigkeiten, keine Kommentare
  ...(stundenSicht && !istAdmin ? { team_stunden: {
    mitglieder: alle.filter(m => m.typ !== 'agent').map(m => ({ mitglied_id: m.mitglied_id, name: m.name, status: m.status, vertrag_std: m.vertrag_std == null ? '' : m.vertrag_std, startguthaben_min: Number(m.startguthaben_min) || 0, abrechnung_ab: m.abrechnung_ab || '2026-10-05' })),
    zeiten: (D.zeiten || []).map(z => ({ mitglied_id: z.mitglied_id, datum: z.datum, minuten: Number(z.minuten) || 0, status: z.status })),
    abrechnung: (D.abrechnung || []).map(r => ({ mitglied_id: r.mitglied_id, monat: r.monat, soll_min: r.soll_min, gearbeitet_min: r.gearbeitet_min, ausgezahlt_min: r.ausgezahlt_min, konto_vorher_min: r.konto_vorher_min, konto_nachher_min: r.konto_nachher_min }))
  } } : {}),
  kurs, anfragen, stand: new Date().toISOString() } } }];
