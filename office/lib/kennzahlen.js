// KI Office: Kennzahlen je Run und je Agent. Reine Funktionen ohne Abhängigkeiten, damit derselbe Code
// in der Oberfläche (Kopie docs/office/js/kennzahlen.js, erzeugt von office/n8n/bauen.mjs) und im Server-Bündel läuft.
// Grundsätze:
//  - Gemessen ist nur, was der Ausführer mit Quelle gemeldet hat. Alles andere ist „geschätzt“ (mit Basis) oder „unbekannt“, nie stillschweigend 0 €.
//  - Keine Personendaten: Eine Kennzahlzeile enthält Agent, Raum, Modell, Zahlen und feste Kategorien. Kein Auftraggeber, kein Freitext, kein Projektname.
//  - Fachlich bewertet wird nur von Menschen (abgenommen / zurückgewiesen); die Auswertung zählt das, sie urteilt nicht selbst über Inhalte.

export const KENNZAHLEN_TAGE = 28;       // Auswertungsfenster: vier Wochen
export const KENNZAHLEN_WOCHEN = 4;      // Trend: vier Wochenscheiben, älteste zuerst
const KZ_TAG_MS = 86400000;
const kzZeit = s => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : null; };
const kzRund = (x, stellen) => { const f = Math.pow(10, stellen); return Math.round(x * f) / f; };
const kzZahl = x => (x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0) ? Number(x) : null;

// ---- Stellschrauben der Schätzung (Timo kann sie ändern; danach `node office/n8n/bauen.mjs` und das Bündel einspielen) ----
// Listenpreise in US-Dollar je 1 Mio. Token [Eingabe, Ausgabe], Stand 03.11.2026. Modelle ohne Eintrag werden nicht geschätzt.
export const KZ_PREISE_USD_MIO = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20], 'gpt-5-mini': [0.25, 2] };
export const KZ_USD_IN_EUR = 0.92;
export const KZ_ZEICHEN_JE_TOKEN = 3.5;   // deutsche Texte: grob 3,5 Zeichen je Token
export const KZ_EINGABE_FAKTOR = 4;       // grobe Annahme: Ein Agent liest etwa viermal so viel, wie er schreibt (Auftrag, Kontext, Quellen)
// Ausführer, die ein Modell benutzen, den Verbrauch aber nicht selbst melden können: nur für sie wird aus der Textlänge geschätzt.
// n8n-Ausführer melden entweder selbst oder arbeiten ohne Modell (Verwaltungs-Status, Orchestrierer): dort bleibt es bei „unbekannt“.
export const KZ_SCHAETZ_AUSFUEHRER = ['claude-code', 'codex', 'hermes'];

export const ERGEBNIS_TYPEN = ['text', 'dossier', 'bericht', 'code', 'workflow', 'medien', 'plan', 'pruefung', 'sonstiges'];
export const ERGEBNIS_TYP_TEXT = { text: 'Text', dossier: 'Dossier', bericht: 'Bericht', code: 'Code', workflow: 'Workflow', medien: 'Medien', plan: 'Plan', pruefung: 'Prüfung', sonstiges: 'Sonstiges', ohne: 'ohne Ergebnis' };
const KZ_TYP_AUS_ARTEFAKT = { notiz: 'text', text: 'text', bericht: 'bericht', commit: 'code', datei: 'sonstiges', link: 'sonstiges' };

// Wirkungsfelder je Raum (= Rolle des Agenten): was am Ende zählt. Nur ganze Zahlen, eingetragen vom Ausführer oder von dem Menschen, der abnimmt.
export const WIRKUNG_FELDER = {
  Vertrieb: [{ feld: 'dossiers', text: 'Dossiers' }, { feld: 'firmen', text: 'qualifizierte Firmen' }, { feld: 'termine', text: 'Termine' }],
  Marketing: [{ feld: 'texte_freigegeben', text: 'Texte freigegeben' }, { feld: 'veroeffentlicht', text: 'veröffentlicht' }],
  Akademie: [{ feld: 'lektionen', text: 'Lektionen fertig' }, { feld: 'kurspruefungen', text: 'Kursprüfungen' }],
  Kundenprojekte: [{ feld: 'workflows', text: 'Workflows geliefert' }, { feld: 'reviews', text: 'Reviews' }],
  Verwaltung: [{ feld: 'berichte', text: 'Berichte' }, { feld: 'pruefungen', text: 'Prüfungen' }]
};
export const WIRKUNG_MAX = 100000;

/**
 * Modellname für die Kennzahlzeile. Der Ausführer meldet ihn als freien Text; in die Zeile kommt er nur, wenn er in der Preistabelle steht
 * oder dem Modell der Registry entspricht. Alles andere wird zu „sonstiges“: So kann über dieses Feld kein Name und kein Fremdtext in die Kennzahlen gelangen.
 */
export function kennzahlModell(gemeldet, registry) {
  const g = String(gemeldet || ''), r = String(registry || '');
  const bekannt = m => !!m && (Object.prototype.hasOwnProperty.call(KZ_PREISE_USD_MIO, m) || m === 'deepseek-v4-flash');
  if (bekannt(g)) return g;
  if (bekannt(r)) return r;
  return g || r ? 'sonstiges' : null;
}

/** Prüft eine Wirkungsmeldung gegen die Felder des Raums. Liefert { wirkung } (nur bekannte Felder, ganze Zahlen) oder { fehler }. */
export function wirkungPruefen(raum, eingabe) {
  const felder = WIRKUNG_FELDER[raum] || [];
  if (eingabe === null || eingabe === undefined) return { wirkung: {} };
  if (typeof eingabe !== 'object' || Array.isArray(eingabe)) return { fehler: 'wirkung muss ein Objekt aus Feld und Zahl sein.' };
  const wirkung = {};
  for (const [k, v] of Object.entries(eingabe)) {
    if (!felder.some(f => f.feld === k)) return { fehler: 'Unbekanntes Wirkungsfeld „' + String(k).slice(0, 40) + '“ für den Raum ' + (raum || '?') + '. Erlaubt: ' + (felder.map(f => f.feld).join(', ') || 'keins') + '.' };
    if (v === null || v === '' || v === undefined) continue;
    const n = typeof v === 'number' ? v : (typeof v === 'string' && /^[0-9]{1,6}$/.test(v.trim()) ? Number(v.trim()) : NaN);   // keine Wahrheitswerte, keine Listen
    if (!Number.isInteger(n) || n < 0 || n > WIRKUNG_MAX) return { fehler: 'Wirkung „' + k + '“ muss eine ganze Zahl zwischen 0 und ' + WIRKUNG_MAX + ' sein.' };
    wirkung[k] = n;
  }
  return { wirkung };
}

/** Kosten in Euro aus Tokenzahlen und Preistabelle, oder null, wenn das Modell keinen Preis hat. */
export function kostenAusToken(modell, tokens_ein, tokens_aus) {
  const p = KZ_PREISE_USD_MIO[String(modell || '')];
  if (!p) return null;
  return kzRund(((Number(tokens_ein) || 0) * p[0] + (Number(tokens_aus) || 0) * p[1]) / 1e6 * KZ_USD_IN_EUR, 4);
}

/** Grobe Schätzung aus der Textlänge: Ausgabe = Zeichen der Ergebnisse, Eingabe = Auftrag plus KZ_EINGABE_FAKTOR × Ausgabe. Null, wenn kein Preis bekannt ist. */
export function kostenSchaetzen(modell, auftrag_zeichen, ergebnis_zeichen) {
  if (!KZ_PREISE_USD_MIO[String(modell || '')]) return null;
  const aus = Math.ceil((Number(ergebnis_zeichen) || 0) / KZ_ZEICHEN_JE_TOKEN);
  const ein = Math.ceil((Number(auftrag_zeichen) || 0) / KZ_ZEICHEN_JE_TOKEN) + KZ_EINGABE_FAKTOR * aus;
  if (!(ein + aus > 0)) return null;
  return { tokens_ein: ein, tokens_aus: aus, kosten_eur: kostenAusToken(modell, ein, aus) };
}

/** Gemeldete Kosten eines Runs: { eur, art: 'gemessen' | 'geschätzt' } oder null, wenn der Ausführer nichts gemeldet hat. */
export function runKostenGemeldet(run) {
  const v = run && run.verbrauch;
  if (!v || v.messbar !== true || v.kosten_eur == null) return null;
  const eur = Number(v.kosten_eur);
  if (!Number.isFinite(eur) || eur < 0) return null;
  return { eur, art: v.kosten_art === 'gemessen' ? 'gemessen' : 'geschätzt' };
}

/** Zeitpunkt, zu dem ein Run für die Auswertung zählt: Ende, sonst Start, sonst Anlage. */
export function runStichzeit(run) { return kzZeit(run.beendet) || kzZeit(run.gestartet) || kzZeit(run.erstellt); }

/** Dauer eines beendeten Runs in Minuten (Start bis Ende) oder null. */
export function runDauerMin(run) {
  const a = kzZeit(run.gestartet), b = kzZeit(run.beendet);
  return a !== null && b !== null && b >= a ? kzRund((b - a) / 60000, 1) : null;
}

const KZ_ENDE = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt'];
/** Ist dieser Run für die Kennzahlen ein gelaufener, beendeter Lauf? Nie gestartete (abgelehnte, zurückgezogene) Aufträge zählen nicht. */
export function kennzahlFaehig(run) { return !!run && KZ_ENDE.includes(run.status) && (!!run.gestartet || run.status === 'abgeschlossen' || run.status === 'fehlgeschlagen'); }

/**
 * Die Kennzahlzeile eines beendeten Runs (Form der Tabelle office_kennzahlen). agent = Registry-Eintrag, artefakte = Artefakte dieses Runs.
 * Kosten in dieser Reihenfolge: 1) vom Ausführer gemeldet (gemessen mit Quelle, sonst geschätzt), 2) Token gemeldet → Preistabelle (geschätzt),
 * 3) Ausführer ohne eigene Meldung → Schätzung aus der Textlänge (geschätzt), 4) sonst unbekannt.
 */
export function kennzahlZeile(run, agent, artefakte, jetztIso) {
  const A = (artefakte || []).filter(a => a && a.run_id === run.run_id);
  const v = (run.verbrauch && run.verbrauch.messbar === true) ? run.verbrauch : null;
  const modell = kennzahlModell(v && v.modell, agent && agent.modell);
  const ausfuehrer = run.ausfuehrer || (agent && agent.ausfuehrer) || null;
  let tokens_ein = v ? kzZahl(v.tokens_ein) : null, tokens_aus = v ? kzZahl(v.tokens_aus) : null;
  let kosten_eur = null, kosten_art = 'unbekannt', kosten_basis = null;
  const gemeldet = runKostenGemeldet(run);
  if (gemeldet) { kosten_eur = kzRund(gemeldet.eur, 4); kosten_art = gemeldet.art === 'gemessen' ? 'gemessen' : 'geschaetzt'; kosten_basis = 'ausfuehrer'; }
  else if (v && (tokens_ein || tokens_aus)) { const k = kostenAusToken(modell, tokens_ein, tokens_aus); if (k !== null) { kosten_eur = k; kosten_art = 'geschaetzt'; kosten_basis = 'preistabelle'; } }
  else if (KZ_SCHAETZ_AUSFUEHRER.includes(ausfuehrer) && (run.status === 'abgeschlossen' || run.status === 'fehlgeschlagen')) {
    const zeichen = String(run.zusammenfassung || '').length + A.reduce((s, a) => s + (Number(a.groesse) > 0 ? Number(a.groesse) : String(a.zusammenfassung || '').length), 0);
    const s = kostenSchaetzen((agent && agent.modell) || modell, String(run.auftrag || '').length, zeichen);
    if (s && s.kosten_eur !== null) { tokens_ein = s.tokens_ein; tokens_aus = s.tokens_aus; kosten_eur = s.kosten_eur; kosten_art = 'geschaetzt'; kosten_basis = 'textlaenge'; }
  }
  const d = runDauerMin(run);
  const typ = ERGEBNIS_TYPEN.includes(run.ergebnis_typ) ? run.ergebnis_typ : (A.length ? (KZ_TYP_AUS_ARTEFAKT[A[A.length - 1].art] || 'sonstiges') : (run.status === 'abgeschlossen' ? 'sonstiges' : 'ohne'));
  const raum = (agent && agent.raum) || null;
  const w = wirkungPruefen(raum, run.wirkung);
  return {
    run_id: run.run_id, agent_id: run.agent_id, raum, ausfuehrer, modell, status: run.status,
    beendet: run.beendet || run.lebenszeichen || run.erstellt || jetztIso || null, dauer_sek: d === null ? null : Math.round(d * 60),
    tokens_ein: tokens_ein === null ? null : Math.round(tokens_ein), tokens_aus: tokens_aus === null ? null : Math.round(tokens_aus),
    kosten_eur, kosten_art, kosten_basis, ergebnis_typ: typ, ergebnisse: A.length,
    abnahme: run.abgenommen === true ? 'abgenommen' : run.abgenommen === false ? 'zurueckgewiesen' : 'offen',
    wirkung: w.wirkung || {}, versuche: Number(run.versuche) || 1, geaendert: jetztIso || null
  };
}

/**
 * Kennzahlen eines Agenten aus Kennzahlzeilen über das Fenster (Standard 28 Tage bis jetztMs).
 * ergebnisse = technisch abgeschlossene Läufe; abgenommen / zurueck = fachliche Entscheidung eines Menschen; offen = noch nicht entschieden.
 * kosten_eur = gemessene plus geschätzte Kosten aller Läufe im Fenster (auch der fehlgeschlagenen, sie haben auch gekostet); kosten_unbekannt = Läufe ohne Wert.
 * kosten_je_abgenommen = kosten_eur / abgenommen, nur wenn es abgenommene Ergebnisse und mindestens einen Kostenwert gibt.
 * trend = Kosten je abgenommenem Ergebnis je Wochenscheibe (älteste zuerst), null wo nichts abgenommen wurde.
 */
export function kennzahlenAusZeilen(zeilen, agent_id, jetztMs, tage) {
  const fenster = (Number(tage) > 0 ? Number(tage) : KENNZAHLEN_TAGE) * KZ_TAG_MS;
  const von = jetztMs - fenster, bis = jetztMs + 60000;   // eine Minute Toleranz für abweichende Uhren
  const Z = (zeilen || []).filter(z => z && z.agent_id === agent_id).filter(z => { const t = kzZeit(z.beendet); return t !== null && t > von && t <= bis; });
  const fertig = Z.filter(z => z.status === 'abgeschlossen');
  const abgenommen = fertig.filter(z => z.abnahme === 'abgenommen').length, zurueck = fertig.filter(z => z.abnahme === 'zurueckgewiesen').length;
  let gemessen = 0, geschaetzt = 0, nGemessen = 0, nGeschaetzt = 0;
  for (const z of Z) { const k = kzZahl(z.kosten_eur); if (k === null || z.kosten_art === 'unbekannt') continue; if (z.kosten_art === 'gemessen') { gemessen += k; nGemessen++; } else { geschaetzt += k; nGeschaetzt++; } }
  const mitWert = nGemessen + nGeschaetzt, kosten = gemessen + geschaetzt;
  const dauern = fertig.map(z => kzZahl(z.dauer_sek)).filter(x => x !== null).sort((a, b) => a - b);
  const bewertet = abgenommen + zurueck;
  const scheibe = fenster / KENNZAHLEN_WOCHEN, trend = [];
  for (let i = 0; i < KENNZAHLEN_WOCHEN; i++) {
    const a = von + i * scheibe, b = i === KENNZAHLEN_WOCHEN - 1 ? bis : a + scheibe;
    const S = Z.filter(z => { const t = kzZeit(z.beendet); return t > a && t <= b; });
    const ok = S.filter(z => z.status === 'abgeschlossen' && z.abnahme === 'abgenommen').length;
    let k = 0, n = 0; for (const z of S) { const x = kzZahl(z.kosten_eur); if (x !== null && z.kosten_art !== 'unbekannt') { k += x; n++; } }
    trend.push(ok > 0 && n > 0 ? kzRund(k / ok, 4) : null);
  }
  const wirkung = {};
  for (const z of Z) if (z.wirkung && typeof z.wirkung === 'object') for (const [f, n] of Object.entries(z.wirkung)) if (Number.isFinite(Number(n))) wirkung[f] = (wirkung[f] || 0) + Number(n);
  const typen = {};
  for (const z of fertig) { const t = z.ergebnis_typ || 'sonstiges'; typen[t] = (typen[t] || 0) + 1; }
  return {
    agent_id, tage: fenster / KZ_TAG_MS, runs: Z.length, gelaufen: Z.length,
    ergebnisse: fertig.length, abgenommen, zurueck, offen: fertig.length - bewertet,
    fehlgeschlagen: Z.filter(z => z.status === 'fehlgeschlagen' || z.status === 'unbekannt').length,
    kosten_eur: mitWert ? kzRund(kosten, 4) : null, kosten_gemessen_eur: kzRund(gemessen, 4), kosten_geschaetzt_eur: kzRund(geschaetzt, 4),
    kosten_gemeldet: mitWert, kosten_geschaetzt: nGeschaetzt, kosten_unbekannt: Z.length - mitWert,
    kosten_je_abgenommen: abgenommen > 0 && mitWert > 0 ? kzRund(kosten / abgenommen, 4) : null,
    zurueck_quote: bewertet > 0 ? kzRund(zurueck / bewertet, 4) : null,
    dauer_min: dauern.length ? kzRund(dauern[Math.floor((dauern.length - 1) / 2)] / 60, 1) : null,
    trend, wirkung, typen
  };
}

/**
 * Kennzahlen eines Agenten. Quelle sind die Zeilen der Tabelle office_kennzahlen (opts.zeilen, vom Server); für Runs ohne Zeile
 * (Tabelle noch nicht angelegt, oder Run älter als die Tabelle) wird die Zeile aus dem Run selbst gebildet (opts.agent, opts.artefakte).
 */
export function agentKennzahlen(runs, agent_id, jetztMs, tage, opts) {
  const o = opts || {};
  const tabelle = (o.zeilen || []).filter(z => z && z.agent_id === agent_id);
  const bekannt = new Set(tabelle.map(z => z.run_id));
  const ausRuns = (runs || []).filter(r => r && r.agent_id === agent_id && !bekannt.has(r.run_id) && kennzahlFaehig(r)).map(r => kennzahlZeile(r, o.agent || null, o.artefakte || [], null));
  return kennzahlenAusZeilen(tabelle.concat(ausRuns), agent_id, jetztMs, tage);
}

/** Richtung des Trends aus den letzten beiden Wochenscheiben mit Wert: 'runter' (günstiger), 'hoch' (teurer), 'gleich' oder null. */
export function trendRichtung(trend) {
  const t = (trend || []).filter(x => x !== null && x !== undefined);
  if (t.length < 2) return null;
  const a = t[t.length - 2], b = t[t.length - 1];
  if (b < a - 0.005) return 'runter';
  if (b > a + 0.005) return 'hoch';
  return 'gleich';
}

// ---- Rangliste „liefert / liefert nicht“ ----
// Schwellen als Vorschlag; Timo entscheidet. Die Bewertung ist ein Hinweis aus Zahlen, nie eine automatische Handlung.
export const AUSWERTUNG_SCHWELLEN = {
  kosten_je_ergebnis_max_eur: 0.5,   // höchstens so viel je fachlich abgenommenem Ergebnis
  zurueck_quote_max: 0.2,            // höchstens dieser Anteil zurückgewiesen (von den bewerteten Ergebnissen)
  mindest_bewertet: 3                // darunter: „zu wenig Daten“, kein Urteil
};
export const BEWERTUNG_TEXT = { liefert: 'liefert', beobachten: 'beobachten', liefert_nicht: 'liefert nicht', zu_wenig: 'zu wenig Daten' };

/** Bewertung eines Agenten aus seinen Kennzahlen: { stufe, text, gruende: [..] }. */
export function bewertung(kz, schwellen) {
  const S = Object.assign({}, AUSWERTUNG_SCHWELLEN, schwellen || {});
  const bewertet = (kz.abgenommen || 0) + (kz.zurueck || 0);
  const gruende = [];
  const eur = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  const proz = x => Math.round(x * 100) + ' %';
  if (bewertet < S.mindest_bewertet) return { stufe: 'zu_wenig', text: BEWERTUNG_TEXT.zu_wenig, gruende: [bewertet + ' von mindestens ' + S.mindest_bewertet + ' Ergebnissen fachlich bewertet.'] };
  if (kz.zurueck_quote !== null && kz.zurueck_quote > S.zurueck_quote_max) return { stufe: 'liefert_nicht', text: BEWERTUNG_TEXT.liefert_nicht, gruende: [proz(kz.zurueck_quote) + ' zurückgewiesen (Schwelle ' + proz(S.zurueck_quote_max) + ').'] };
  if (kz.abgenommen === 0) return { stufe: 'liefert_nicht', text: BEWERTUNG_TEXT.liefert_nicht, gruende: ['Kein Ergebnis wurde abgenommen.'] };
  if (kz.kosten_je_abgenommen === null) { gruende.push('Kosten unbekannt: der Ausführer meldet keinen Verbrauch.'); return { stufe: 'beobachten', text: BEWERTUNG_TEXT.beobachten, gruende }; }
  if (kz.kosten_je_abgenommen > S.kosten_je_ergebnis_max_eur) return { stufe: 'beobachten', text: BEWERTUNG_TEXT.beobachten, gruende: [eur(kz.kosten_je_abgenommen) + ' je abgenommenem Ergebnis (Schwelle ' + eur(S.kosten_je_ergebnis_max_eur) + ').'] };
  gruende.push(eur(kz.kosten_je_abgenommen) + ' je abgenommenem Ergebnis, ' + proz(kz.zurueck_quote || 0) + ' zurückgewiesen.');
  return { stufe: 'liefert', text: BEWERTUNG_TEXT.liefert, gruende };
}
