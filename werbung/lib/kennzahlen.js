// Gemeinsame Logik für den Portal-Bereich „ChatGPT-Werbung“ (Kennzahlen der Anzeigenkampagne in ChatGPT).
// Läuft in den Code-Knoten des n8n-Workflows „TEAM: ChatGPT-Werbung (Portal)“ (Webhook team-ads) und im lokalen Testadapter.
// Keine Abhängigkeiten, kein Netz, kein Schlüssel: Der Abruf der Quelle passiert im HTTP-Knoten mit n8n-Zugangsdaten.
// Getestet: node --test werbung/test/kennzahlen.test.mjs

/** Rollen, die den Bereich sehen dürfen. Dieselbe Liste steht in docs/team/index.html (ADS_ROLLEN); ein Test hält beide gleich. */
const ADS_ROLLEN = ['admin'];
const ADS_TAGE_STANDARD = 7, ADS_TAGE_MIN = 1, ADS_TAGE_MAX = 90;
/** So lange gilt eine Antwort der Quelle als frisch (Zwischenspeicher je Zeitraum). */
const ADS_CACHE_MS = 5 * 60 * 1000;
/** Ist die Quelle nicht erreichbar, darf ein alter Stand höchstens so alt sein, um noch gezeigt zu werden. */
const ADS_VERALTET_MAX_MS = 24 * 60 * 60 * 1000;
const ADS_CACHE_EINTRAEGE = 6;
const ADS_QUELLE = 'https://n8n.hm-storage.de/webhook/ads-kpis';

/** Zeitraum in Tagen: 1 bis 90, ohne brauchbare Angabe 7 (wie die Quelle selbst). */
function tageBegrenzen(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n === 0) return ADS_TAGE_STANDARD;
  return Math.min(ADS_TAGE_MAX, Math.max(ADS_TAGE_MIN, n));
}

const adsZahl = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const adsZahlOderNull = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const adsText = (v, max) => String(v === null || v === undefined ? '' : v).slice(0, max);

/**
 * Antwort der Quelle prüfen und auf die bekannten Felder zuschneiden.
 * Liefert null, wenn die Antwort nicht die erwartete Form hat (kein Objekt, gesamt fehlt, situationen ist keine Liste).
 * kosten_pro_lead und cpc bleiben null, solange es keine Leads bzw. Klicks gibt.
 */
function kennzahlenLesen(body) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return null; } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const g = b.gesamt;
  if (!g || typeof g !== 'object' || Array.isArray(g) || !Array.isArray(b.situationen)) return null;
  const situationen = b.situationen.filter(s => s && typeof s === 'object').slice(0, 500).map(s => ({
    situation: adsText(s.situation, 200),
    impressionen: adsZahl(s.impressionen), klicks: adsZahl(s.klicks), ctr: adsZahl(s.ctr), kosten: adsZahl(s.kosten),
    besuche: adsZahl(s.besuche), video_start: adsZahl(s.video_start), video_50: adsZahl(s.video_50), check_start: adsZahl(s.check_start),
    leads: adsZahl(s.leads), ergebnis_angezeigt: adsZahl(s.ergebnis_angezeigt), termin_geoeffnet: adsZahl(s.termin_geoeffnet),
    kosten_pro_lead: adsZahlOderNull(s.kosten_pro_lead)
  }));
  const waehrung = /^[A-Z]{3}$/.test(String(b.waehrung || '')) ? String(b.waehrung) : 'EUR';
  return {
    kampagne: adsText(b.kampagne, 200), zeitraum_tage: tageBegrenzen(b.zeitraum_tage), seit: adsText(b.seit, 40), stand: adsText(b.stand, 40), waehrung, hinweis: adsText(b.hinweis, 1000),
    gesamt: {
      impressionen: adsZahl(g.impressionen), klicks: adsZahl(g.klicks), ctr: adsZahl(g.ctr), kosten: adsZahl(g.kosten), cpc: adsZahlOderNull(g.cpc),
      besuche: adsZahl(g.besuche), video_start: adsZahl(g.video_start), check_start: adsZahl(g.check_start), leads: adsZahl(g.leads), termin_geoeffnet: adsZahl(g.termin_geoeffnet),
      kosten_pro_lead: adsZahlOderNull(g.kosten_pro_lead), situationen_mit_impressionen: adsZahl(g.situationen_mit_impressionen)
    },
    situationen
  };
}

/**
 * Erster Schritt: Zugang und Zeitraum prüfen, Zwischenspeicher befragen.
 * ich = Zeile aus team_mitglieder (oder null), daten = { tage }, cache = { [tage]: { zeit, daten } }.
 * Ergebnis: { aktion: 'fehler' | 'antwort', code, antwort } oder { aktion: 'abrufen', tage }.
 */
function adsAnfrage(ich, daten, cache, jetztMs) {
  if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return { aktion: 'fehler', code: 401, antwort: { ok: false, fehler: 'Dein Zugang ist ungültig. Bitte lade das Portal neu.' } };
  if (ich.status !== 'aktiv' || !ADS_ROLLEN.includes(ich.rolle)) return { aktion: 'fehler', code: 403, antwort: { ok: false, fehler: 'Die Kennzahlen der ChatGPT-Werbung sieht nur die Leitung.' } };
  const tage = tageBegrenzen(daten && daten.tage);
  const c = cache && cache[tage];
  if (c && c.daten && jetztMs - c.zeit >= 0 && jetztMs - c.zeit < ADS_CACHE_MS) return { aktion: 'antwort', code: 200, antwort: Object.assign({ ok: true }, c.daten, { aus_cache: true }) };
  return { aktion: 'abrufen', tage };
}

/**
 * Zweiter Schritt: Antwort der Quelle auswerten und zwischenspeichern.
 * http = { statusCode, body } (HTTP-Knoten mit „volle Antwort“, wirft nie). Liefert { code, antwort, cache } mit dem neuen Zwischenspeicher.
 * Ist die Quelle nicht erreichbar, wird der letzte bekannte Stand (höchstens 24 Stunden alt) mit veraltet: true gezeigt.
 */
function adsAntwort(http, tage, cache, jetztMs) {
  const alt = Object.assign({}, cache || {});
  const status = Number(http && http.statusCode) || 0;
  const daten = status >= 200 && status < 300 ? kennzahlenLesen(http.body) : null;
  if (daten) {
    alt[tage] = { zeit: jetztMs, daten };
    const neu = {};
    Object.keys(alt).sort((a, b) => alt[b].zeit - alt[a].zeit).slice(0, ADS_CACHE_EINTRAEGE).forEach(k => { neu[k] = alt[k]; });
    return { code: 200, antwort: Object.assign({ ok: true }, daten, { aus_cache: false }), cache: neu };
  }
  const c = alt[tage];
  if (c && c.daten && jetztMs - c.zeit < ADS_VERALTET_MAX_MS) return { code: 200, antwort: Object.assign({ ok: true }, c.daten, { aus_cache: true, veraltet: true }), cache: alt };
  const fehler = status === 401 || status === 403
    ? 'Die Datenquelle der ChatGPT-Werbung hat den Zugang abgelehnt. Bitte gib Timo Bescheid.'
    : 'Die Kennzahlen der ChatGPT-Werbung sind gerade nicht erreichbar. Bitte versuch es in ein paar Minuten noch einmal.';
  return { code: 502, antwort: { ok: false, fehler }, cache: alt };
}

export { ADS_ROLLEN, ADS_TAGE_STANDARD, ADS_TAGE_MIN, ADS_TAGE_MAX, ADS_CACHE_MS, ADS_VERALTET_MAX_MS, ADS_QUELLE, tageBegrenzen, kennzahlenLesen, adsAnfrage, adsAntwort };
