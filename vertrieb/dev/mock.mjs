// TESTADAPTER: Nachbildung der Vertriebs-API (team-vertrieb, Twenty CRM) und der Diktat-API (team-diktat) für den lokalen Testserver.
// Synthetische Daten, keine echten Personen, kein OpenAI-Aufruf: Die „Transkription“ ist ein fester Beispieltext.
import { diktatAnfrage, diktatAntwort } from '../lib/diktat.js';

const vor = (jetztMs, tage) => new Date(jetztMs - tage * 86400000).toISOString();
export function vertriebDaten(jetztMs) {
  const k = (id, name, email, telefon) => ({ id, name, email, telefon });
  return {
    mitglieder: [{ id: 'tw_timo', name: 'Timo (Test)' }, { id: 'tw_murat', name: 'Murat (Test)' }],
    chancen: [
      { id: 'c-1001', name: 'Müller GmbH (Test)', stage: 'SCREENING', betrag: 4500, ownerId: 'tw_murat', naechsterFollowup: vor(jetztMs, -2), kontakt: k('p-1', 'Hans Müller (Test)', 'hans@example.invalid', '+49 170 0000001'), firma: { name: 'Müller GmbH' }, ig: '', kiflow: true, notizen: 2, geaendert: vor(jetztMs, 1) },
      { id: 'c-1002', name: 'Bäckerei Sonne (Test)', stage: 'MEETING', betrag: 2500, ownerId: 'tw_murat', naechsterFollowup: vor(jetztMs, 1), kontakt: k('p-2', 'Sabine Sonne (Test)', 'sabine@example.invalid', ''), firma: null, ig: 'sonne.test', kiflow: false, notizen: 0, geaendert: vor(jetztMs, 3) },
      { id: 'c-1003', name: 'Physio Klein (Test)', stage: 'NEW', betrag: null, ownerId: '', naechsterFollowup: '', kontakt: k('p-3', 'Klara Klein (Test)', '', '+49 170 0000003'), firma: null, ig: '', kiflow: false, notizen: 0, geaendert: vor(jetztMs, 0) },
      { id: 'c-1004', name: 'Steuerbüro Nord (Test)', stage: 'PROPOSAL', betrag: 9800, ownerId: 'tw_timo', naechsterFollowup: '', kontakt: k('p-4', 'Nils Nord (Test)', 'nils@example.invalid', ''), firma: { name: 'Steuerbüro Nord' }, ig: '', kiflow: false, notizen: 5, geaendert: vor(jetztMs, 6) },
      { id: 'c-1005', name: 'Autohaus West (Test)', stage: 'NICHT_INTERESSIERT', betrag: 0, ownerId: 'tw_murat', naechsterFollowup: '', kontakt: null, firma: null, ig: '', kiflow: false, notizen: 1, geaendert: vor(jetztMs, 20) },
      { id: 'c-1006', name: 'Café Ecke (Test)', stage: 'CUSTOMER', betrag: 3200, ownerId: 'tw_timo', naechsterFollowup: '', kontakt: k('p-6', 'Emil Ecke (Test)', 'emil@example.invalid', ''), firma: null, ig: '', kiflow: false, notizen: 3, geaendert: vor(jetztMs, 12) }
    ],
    notizen: { 'c-1001': [{ titel: '📞 Anruf', text: 'Erstgespräch: drei Mitarbeitende, Interesse am KI-Führerschein, Förderung prüfen.', erstellt: vor(jetztMs, 5) }, { titel: '✉️ E-Mail', text: 'Infomaterial geschickt.', erstellt: vor(jetztMs, 4) }] }
  };
}

/** Vertriebs-API-Nachbildung: body = { token, aktion, daten }. mitglieder = team_mitglieder (Testdaten). */
export function vertriebAntwort(body, mitglieder, VD, jetztMs) {
  const ich = (mitglieder || []).find(m => m.token === String(body.token || ''));
  if (!ich || ich.status !== 'aktiv') return [401, { ok: false, fehler: 'Dein Zugang ist ungültig (Testadapter).' }];
  if (!['admin', 'dozent', 'vertrieb'].includes(ich.rolle)) return [403, { ok: false, fehler: 'Die Vertriebs-Pipeline sehen Timo, Kurt, Murat und das Vertriebsteam.' }];
  const d = body.daten || {};
  switch (body.aktion) {
    case 'liste': { const an = {}; for (const c of VD.chancen) an[c.stage] = (an[c.stage] || 0) + 1; return [200, { ok: true, chancen: VD.chancen, mitglieder: VD.mitglieder, anzahl: an, gesamt: VD.chancen.length, stand: new Date(jetztMs).toISOString(), testadapter: true }]; }
    case 'details': { if (!VD.chancen.some(c => c.id === d.id)) return [404, { ok: false, fehler: 'Verkaufschance nicht gefunden.' }]; return [200, { ok: true, notizen: (VD.notizen[d.id] || []).slice().reverse(), verlauf: d.id === 'c-1002' ? 'Setter-Bot: Hallo Sabine, …' : '' }]; }
    case 'notiz': {
      const c = VD.chancen.find(x => x.id === d.id); if (!c) return [404, { ok: false, fehler: 'Verkaufschance nicht gefunden.' }];
      const text = String(d.text || '').trim(); if (text.length < 2) return [400, { ok: false, fehler: 'Text fehlt.' }];
      const titel = { anruf: '📞 Anruf', notiz: '📝 Notiz', termin: '📆 Termin', mail: '✉️ E-Mail' }[d.art] || '📝 Notiz';
      (VD.notizen[c.id] = VD.notizen[c.id] || []).push({ titel, text: text.slice(0, 50000), erstellt: new Date(jetztMs).toISOString(), autor: ich.mitglied_id });
      c.notizen = (c.notizen || 0) + 1; c.geaendert = new Date(jetztMs).toISOString();
      return [200, { ok: true, id: 'n-' + (VD.notizen[c.id].length) }];
    }
    case 'kontakt_suchen': { const q = String(d.q || '').toLowerCase(); return [200, { ok: true, kontakte: VD.chancen.map(c => c.kontakt).filter(k => k && (k.name.toLowerCase().includes(q) || String(k.email).includes(q))).slice(0, 10) }]; }
    case 'speichern': { if (d.id) { const c = VD.chancen.find(x => x.id === d.id); if (!c) return [404, { ok: false, fehler: 'Nicht gefunden.' }]; Object.assign(c, { name: d.name || c.name, stage: d.stage || c.stage, ownerId: d.ownerId ?? c.ownerId, naechsterFollowup: d.naechsterFollowup ?? c.naechsterFollowup, betrag: d.betrag === '' ? null : Number(String(d.betrag).replace(',', '.')) || c.betrag }); return [200, { ok: true, id: c.id }]; } const id = 'c-' + (1000 + VD.chancen.length + 1); VD.chancen.unshift({ id, name: d.name || ((d.kontakt || {}).vorname || '') + ' ' + ((d.kontakt || {}).nachname || ''), stage: d.stage || 'NEW', betrag: Number(d.betrag) || null, ownerId: d.ownerId || '', naechsterFollowup: d.naechsterFollowup || '', kontakt: d.kontakt && d.kontakt.id ? VD.chancen.map(c => c.kontakt).find(k => k && k.id === d.kontakt.id) : (d.kontakt ? { id: 'p-' + id, name: (d.kontakt.vorname + ' ' + d.kontakt.nachname).trim(), email: d.kontakt.email || '', telefon: d.kontakt.telefon || '' } : null), firma: null, ig: '', kiflow: false, notizen: 0, geaendert: new Date(jetztMs).toISOString() }); return [200, { ok: true, id }]; }
    case 'stufe': { const c = VD.chancen.find(x => x.id === d.id); if (!c) return [404, { ok: false, fehler: 'Nicht gefunden.' }]; c.stage = d.stage; return [200, { ok: true }]; }
    default: return [400, { ok: false, fehler: 'Unbekannte Aktion (Testadapter): ' + String(body.aktion).slice(0, 40) }];
  }
}

/** Minimaler multipart/form-data-Leser: liefert { felder, datei: { mimeType, fileSize, fileName } | null }. Nur für Tests. */
export function multipartLesen(buf, contentType) {
  const m = /boundary=("?)([^";]+)\1/i.exec(String(contentType || ''));
  if (!m) return null;
  const grenze = Buffer.from('--' + m[2]);
  const felder = {}; let datei = null;
  let pos = buf.indexOf(grenze);
  while (pos >= 0) {
    const start = pos + grenze.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const kopfEnde = buf.indexOf('\r\n\r\n', start); if (kopfEnde < 0) break;
    const kopf = buf.slice(start, kopfEnde).toString('utf8');
    const next = buf.indexOf(grenze, kopfEnde + 4); if (next < 0) break;
    const inhalt = buf.slice(kopfEnde + 4, next - 2);
    const name = (/name="([^"]*)"/.exec(kopf) || [])[1], dateiname = (/filename="([^"]*)"/.exec(kopf) || [])[1], typ = (/Content-Type:\s*([^\r\n]+)/i.exec(kopf) || [])[1];
    if (dateiname !== undefined) { if (!datei) datei = { mimeType: (typ || '').trim(), fileSize: inhalt.length, fileName: dateiname }; }
    else if (name) felder[name] = inhalt.toString('utf8');
    pos = next;
  }
  return { felder, datei };
}

const BEISPIEL_TRANSKRIPT = 'also ich hab grad mit herrn müller telefoniert die haben drei leute im büro und wollen den ki führerschein machen wenn die förderung über den bildungsgutschein klappt ich soll bis freitag ein angebot schicken und er meldet sich dann nächste woche dienstag nochmal wegen dem erhebungsbogen';
const BEISPIEL_LLM = JSON.stringify({ text: 'Ich habe gerade mit Herrn Müller telefoniert. Die Firma hat drei Mitarbeitende im Büro und möchte den KI-Führerschein machen, wenn die Förderung über den Bildungsgutschein klappt. Ich soll bis Freitag ein Angebot schicken; er meldet sich nächste Woche Dienstag wegen des Erhebungsbogens.', zusammenfassung: 'Müller GmbH (3 Mitarbeitende) will den KI-Führerschein, abhängig von der Förderung per Bildungsgutschein. Angebot bis Freitag, Rückmeldung am Dienstag.', punkte: ['3 Mitarbeitende im Büro', 'Förderung über Bildungsgutschein entscheidend'], naechste_schritte: ['Angebot bis Freitag schicken (Vertrieb)', 'Erhebungsbogen vorbereiten'], termine: ['Freitag: Angebot', 'Dienstag nächste Woche: Rückmeldung Herr Müller'] });

/** Diktat-API-Nachbildung: wie der n8n-Workflow, aber mit festem Beispieltext statt OpenAI. */
export function diktatAntwortMock(mp, mitglieder, jetztMs) {
  if (!mp) return [400, { ok: false, fehler: 'Bitte als multipart/form-data senden.' }];
  const ich = (mitglieder || []).find(m => m.token === String(mp.felder.token || '')) || null;
  const r = diktatAnfrage(ich, mp.felder, mp.datei);
  if (r.aktion !== 'transkribieren') return [r.code, r.antwort];
  if (/leer|stumm/i.test(mp.datei.fileName || '')) return [422, { ok: false, fehler: 'In der Aufnahme wurde keine Sprache erkannt. Bitte näher ans Mikrofon oder lauter sprechen.' }];
  if (/kaputt/i.test(mp.datei.fileName || '')) return [502, { ok: false, fehler: 'Die Transkription hat nicht geklappt: HTTP 500. Bitte gleich noch einmal versuchen.' }];
  const roh = /ohne-ki/i.test(mp.datei.fileName || '') ? '' : BEISPIEL_LLM;
  const erg = diktatAntwort(BEISPIEL_TRANSKRIPT, roh, r.kontext, new Date(jetztMs).toISOString());
  if (!roh) erg.antwort.hinweis = 'Die KI-Bereinigung war nicht erreichbar; du siehst das Rohtranskript.';
  erg.antwort.testadapter = true;
  return [erg.code, erg.antwort];
}
