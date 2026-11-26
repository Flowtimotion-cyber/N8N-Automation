// Kommunikation: manueller Nachtrag bestehender WhatsApp-Gespräche in die Vertriebs-Pipeline (Twenty).
// Für Gespräche von vor der automatischen Übergabe (Workflow B, PR #71). Nutzt die Funktionen aus crm.js.
// Läuft im n8n-Code-Knoten (eingebettet von kommunikation/n8n/bauen-nachtrag.mjs, dort hinter crm.js) und in Node (Tests).
// Kein Netzwerk, keine KI. Der Zählmodus gibt nie die volle Telefonnummer und nie Chattext aus.
import { crmPersonSuchPfad, crmNotizBody, crmChanceSchritt, crmNotizFinden, crmNeueId, crmFehlerPatch } from './crm.js';

const nachtragZiffern = v => String(v || '').replace(/\D/g, '');

/** Einstellungen lesen: name_enthaelt (Teile mit Komma, leer = alle), max_anzahl (Standard 1), nur_zaehlen (Standard true). */
export function nachtragEinstellung(E) {
  const e = E || {};
  const teile = String(e.name_enthaelt || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const n = Math.floor(Number(e.max_anzahl));
  return { teile, max: Number.isFinite(n) && n >= 1 ? n : 1, nur_zaehlen: e.nur_zaehlen !== false };
}

/** Passt der Profilname? Ein Teil reicht, Groß/klein egal. Ohne Teile passt alles. */
export function nachtragNamePasst(name, teile) {
  if (!teile || !teile.length) return true;
  const n = String(name || '').toLowerCase();
  return teile.some(t => n.includes(t));
}

/**
 * Auswahl der nachzutragenden Gespräche.
 * konv: Zeilen aus kom_konversationen (kanal=whatsapp, twenty_chance_id is null, neueste zuerst)
 * team: Ergebnis von kom_team_kontakt je Zeile, gleiche Reihenfolge ({} = kein Teammitglied)
 */
export function nachtragAuswahl(konv, team, E) {
  const ein = nachtragEinstellung(E);
  const kandidaten = (konv || []).map((k, i) => ({ k, t: (team || [])[i] || {} }))
    .filter(({ k }) => k && k.konversation_id && nachtragZiffern(k.kontakt_extern).length >= 8 && !k.twenty_chance_id)
    .filter(({ t }) => !(t && t.mitglied_id))
    .filter(({ k }) => nachtragNamePasst(k.kontakt_name, ein.teile))
    .map(({ k }) => k);
  const gesamt = kandidaten.length;
  const treffer = kandidaten.slice(0, ein.max);
  return { gesamt, nur_zaehlen: ein.nur_zaehlen, treffer, zaehlung: treffer.map(k => nachtragZaehlZeile(k, gesamt)) };
}

/** Zählmodus: nur Profilname, letzte vier Ziffern, Marke, ob Zusammenfassung da ist, Datum. Keine volle Nummer, kein Chattext. */
export function nachtragZaehlZeile(k, gesamt) {
  const z = String(k.zusammenfassung || '').trim();
  return {
    profilname: String(k.kontakt_name || '(ohne Namen)'),
    nummer_endet_auf: nachtragZiffern(k.kontakt_extern).slice(-4),
    marke: k.marke || 'offen',
    zusammenfassung: z ? 'ja' : 'nein',
    zusammenfassung_laenge: z.length,
    letzte_kundennachricht: k.letzte_kunde_am ? String(k.letzte_kunde_am).slice(0, 10) : null,
    treffer_gesamt: gesamt
  };
}

/** Arbeitsdaten für einen Treffer (nur im Ausführmodus). */
export function nachtragGespraech(k, jetzt) {
  const wa = nachtragZiffern(k.kontakt_extern);
  const zeitpunkt = k.letzte_kunde_am ? new Date(k.letzte_kunde_am).toISOString() : (jetzt || new Date().toISOString());
  return {
    konversation_id: k.konversation_id, wa, name: String(k.kontakt_name || ''), marke: k.marke || 'offen',
    zusammenfassung: String(k.zusammenfassung || ''), zeitpunkt, jetzt: jetzt || new Date().toISOString(),
    twenty_person_id: k.twenty_person_id || '', person_pfad: crmPersonSuchPfad(wa)
  };
}

/** Notiz: vorhandene Zusammenfassung, sonst Nachtrags-Hinweis. Marke immer. */
export function nachtragNotizBody(g) {
  const datum = new Date(g.jetzt || Date.now()).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
  const z = String(g.zusammenfassung || '').trim() ||
    'Nachtrag vom ' + datum + ': Kontakt hat sich per WhatsApp gemeldet, bevor die automatische Übergabe aktiv war.';
  return crmNotizBody({ zusammenfassung: z, marke: g.marke, jetzt: g.jetzt });
}

/** Chance: wie Workflow B, aber letzterKontakt/eingangAm = letzte Kundennachricht. Vorhandene Chance wird nicht verändert. */
export function nachtragChanceSchritt(antwort, g, personId) {
  return crmChanceSchritt(antwort, { name: g.name, test: false, person_id: personId, jetzt: g.zeitpunkt });
}

/** Erfolg: Patch für kom_konversationen und Ergebniszeile. */
export function nachtragErgebnis(g, s) {
  const notiz_id = s.chance_neu ? crmNeueId(s.notiz_antwort) : crmNotizFinden(s.notizen_antwort);
  const patch = { twenty_person_id: s.person_id, twenty_chance_id: s.chance_id, crm_notiz_id: notiz_id || null, crm_uebergeben_am: g.jetzt, crm_fehler: null };
  return { patch, ergebnis: nachtragZeile(g, { person: !!s.person_neu, chance: !!s.chance_neu, notiz: !!s.chance_neu }, { person_id: s.person_id, chance_id: s.chance_id, notiz_id: notiz_id || null }, null) };
}

/** Fehler: crm_fehler speichern (plus schon bekannte Person), Ergebniszeile mit Fehlertext. */
export function nachtragFehler(g, fehler, stand) {
  const st = stand || {};
  const f = crmFehlerPatch({ aktion: 'nachtrag', fehler, person_id: st.person_id || '', jetzt: g.jetzt });
  return { patch: f.patch, ergebnis: nachtragZeile(g, { person: !!st.person_neu, chance: !!st.chance_neu, notiz: false }, { person_id: st.person_id || null, chance_id: st.chance_id || null, notiz_id: null }, f.patch.crm_fehler) };
}

export function nachtragZeile(g, neu, ids, fehler) {
  return { profilname: g.name || '(ohne Namen)', nummer_endet_auf: String(g.wa || '').slice(-4), neu_angelegt: neu, twenty: ids, fehler: fehler || null };
}
