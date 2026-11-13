// TESTADAPTER: Nachbildung des n8n-Workflows „TEAM: ChatGPT-Werbung (Portal)“ (Webhook team-ads) für den lokalen Testserver.
// Musterdaten in genau der Form, die die Quelle (GET /webhook/ads-kpis) liefert. Keine echten Zahlen, kein Netz, kein Schlüssel.
// Szenarien: standard (mit Leads), ohne-leads (kosten_pro_lead ist null), leer (noch keine Situation hat Impressionen), kaputt (Quelle antwortet 500), abgelehnt (Quelle antwortet 401).
import { adsAnfrage, adsAntwort, tageBegrenzen } from '../lib/kennzahlen.js';

export const SZENARIEN = ['standard', 'ohne-leads', 'leer', 'kaputt', 'abgelehnt'];

// je Situation für 7 Tage: [Name, Impressionen, Klicks, Kosten, Besuche, Video gestartet, Video 50 %, Check gestartet, Leads, Ergebnis angezeigt, Termin geöffnet]
const BASIS = [
  ['foerderung-weiterbildung-mitarbeiter', 4210, 61, 48.8, 44, 21, 12, 9, 3, 3, 2],
  ['ki-schulung-fuer-mein-team', 3580, 47, 37.6, 35, 18, 9, 7, 2, 2, 1],
  ['qualifizierungschancengesetz-antrag', 1920, 33, 26.4, 27, 15, 10, 8, 2, 2, 1],
  ['chatgpt-im-betrieb-einfuehren', 2740, 29, 23.2, 20, 8, 4, 3, 0, 0, 0],
  ['weiterbildung-statt-kurzarbeit', 860, 9, 7.2, 6, 2, 1, 1, 0, 0, 0],
  ['ki-fuehrerschein-kosten', 390, 2, 1.6, 0, 0, 0, 0, 0, 0, 0]
];
const r2 = n => +n.toFixed(2);

/** Antwort der Quelle als Muster. tage skaliert die Zahlen, damit die Zeitraum-Auswahl sichtbar etwas ändert. */
export function werbungMuster(szenario, tage, jetztMs) {
  const t = tageBegrenzen(tage), f = t / 7, n = v => Math.round(v * f);
  const ohneLeads = szenario === 'ohne-leads';
  const situationen = szenario === 'leer' ? [] : BASIS.map(([situation, imp, kl, ko, be, vs, v50, cs, le, ea, tg]) => {
    const impressionen = n(imp), klicks = n(kl), kosten = r2(ko * f), leads = ohneLeads ? 0 : n(le);
    return { situation, impressionen, klicks, ctr: impressionen ? r2(klicks / impressionen * 100) : 0, kosten, besuche: n(be), video_start: n(vs), video_50: n(v50), check_start: n(cs), leads,
      ergebnis_angezeigt: ohneLeads ? 0 : n(ea), termin_geoeffnet: ohneLeads ? 0 : n(tg), kosten_pro_lead: leads ? r2(kosten / leads) : null };
  });
  situationen.sort((a, b) => b.leads - a.leads || b.kosten - a.kosten || b.impressionen - a.impressionen);
  const sum = k => r2(situationen.reduce((s, x) => s + (x[k] || 0), 0));
  const gesamt = { impressionen: sum('impressionen'), klicks: sum('klicks'), kosten: sum('kosten'), besuche: sum('besuche'), video_start: sum('video_start'), check_start: sum('check_start'), leads: sum('leads'), termin_geoeffnet: sum('termin_geoeffnet') };
  gesamt.ctr = gesamt.impressionen ? r2(gesamt.klicks / gesamt.impressionen * 100) : 0;
  gesamt.cpc = gesamt.klicks ? r2(gesamt.kosten / gesamt.klicks) : null;
  gesamt.kosten_pro_lead = gesamt.leads ? r2(gesamt.kosten / gesamt.leads) : null;
  gesamt.situationen_mit_impressionen = situationen.filter(x => x.impressionen > 0).length;
  return {
    kampagne: 'Momentum | ChatGPT Intent Core | DE | mittel (Muster)', zeitraum_tage: t, seit: new Date(jetztMs - t * 86400000).toISOString(), stand: new Date(jetztMs).toISOString(), waehrung: 'EUR',
    hinweis: 'Situationen ohne Impressionen erscheinen nicht in der Liste. Besuche/Video/Check/Termin: anonyme Seitenereignisse nur bei Statistik-Einwilligung; Leads mit Namen im CRM.',
    gesamt, situationen
  };
}

export const werbungZustand = () => ({ szenario: 'standard', cache: {}, abrufe: 0, tage: [] });

/** Nachbildung der Quelle: zählt die Abrufe (für den Test des Zwischenspeichers). */
function quelle(Z, tage, jetztMs) {
  Z.abrufe++; Z.tage.push(tage);
  if (Z.szenario === 'kaputt') return { statusCode: 500, body: { message: 'Error in workflow' } };
  if (Z.szenario === 'abgelehnt') return { statusCode: 401, body: { fehler: 'nicht berechtigt' } };
  return { statusCode: 200, body: werbungMuster(Z.szenario, tage, jetztMs) };
}

/** Wie der n8n-Workflow: body = { token, daten: { tage } }, mitglieder = team_mitglieder (Testdaten), Z = werbungZustand(). */
export function werbungAntwortMock(body, mitglieder, Z, jetztMs) {
  const t = String((body && body.token) || '');
  const ich = /^[a-f0-9]{20,64}$/.test(t) ? ((mitglieder || []).find(m => m.token === t) || null) : null;
  const a = adsAnfrage(ich, (body && body.daten && typeof body.daten === 'object') ? body.daten : {}, Z.cache, jetztMs);
  if (a.aktion !== 'abrufen') return [a.code, Object.assign({}, a.antwort, { testadapter: true })];
  const r = adsAntwort(quelle(Z, a.tage, jetztMs), a.tage, Z.cache, jetztMs);
  Z.cache = r.cache;
  return [r.code, Object.assign({}, r.antwort, { testadapter: true })];
}
