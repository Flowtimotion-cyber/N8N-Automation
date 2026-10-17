// KI Office: Freigaben für externe Aktionen.
// Eine Freigabe gilt nur für genau eine Aktion mit genau einem Inhalt (Hash). Ändert sich der Inhalt, braucht es eine neue Freigabe.
import { inhaltsHash, gleich } from './hash.js';
import { FRISTEN } from './zustand.js';

// Aktionen, die ohne erteilte Freigabe nie ausgeführt werden. Wer sie erteilen darf, steht in rechte.js.
export const EXTERNE_AKTIONEN = {
  email_senden: { text: 'E-Mail senden', stufe: 'extern' },
  nachricht_senden: { text: 'Nachricht senden (WhatsApp, Chat)', stufe: 'extern' },
  post_veroeffentlichen: { text: 'Beitrag veröffentlichen', stufe: 'extern' },
  zahlung_ausloesen: { text: 'Zahlung auslösen', stufe: 'kritisch' },
  daten_loeschen: { text: 'Daten löschen', stufe: 'kritisch' },
  vertrag_senden: { text: 'Vertrag oder Angebot versenden', stufe: 'kritisch' },
  kalender_aendern: { text: 'Termin anlegen oder ändern', stufe: 'extern' }
};
export const FREIGABE_STATUS = ['offen', 'erteilt', 'abgelehnt', 'verfallen', 'ungueltig', 'verwendet'];

export const brauchtFreigabe = aktion => Object.prototype.hasOwnProperty.call(EXTERNE_AKTIONEN, String(aktion || ''));

/** Baut den Datensatz für eine neue Freigabe-Anfrage. */
export function freigabeAnfordern({ freigabe_id, run_id, aktion, inhalt, vorschau, jetzt, angefordert_von }) {
  const hash = inhaltsHash(aktion, inhalt);
  return {
    freigabe_id, run_id, aktion: String(aktion), inhalt_hash: hash,
    inhalt_vorschau: String(vorschau || kurzVorschau(inhalt)).slice(0, 600),
    status: 'offen', angefordert_am: jetzt, angefordert_von: angefordert_von || null,
    entschieden_von: null, entschieden_am: null, begruendung: null,
    gueltig_bis: null, verwendet_am: null
  };
}

function kurzVorschau(inhalt) {
  if (inhalt == null) return '';
  if (typeof inhalt === 'string') return inhalt;
  try { return Object.entries(inhalt).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))).join(' · '); } catch (e) { return String(inhalt); }
}

/**
 * Prüft, ob eine Freigabe für genau diese Aktion und diesen Inhalt gültig ist.
 * Liefert { ok: true } oder { ok: false, grund, neu_noetig }.
 */
export function freigabeGueltig(freigabe, aktion, inhalt, jetztMs) {
  if (!freigabe) return { ok: false, grund: 'Keine Freigabe vorhanden.', neu_noetig: true };
  if (freigabe.aktion !== String(aktion)) return { ok: false, grund: 'Die Freigabe gilt für eine andere Aktion (' + freigabe.aktion + ').', neu_noetig: true };
  const hash = inhaltsHash(aktion, inhalt);
  if (!gleich(freigabe.inhalt_hash, hash)) return { ok: false, grund: 'Der Inhalt wurde nach der Freigabe geändert. Es ist eine neue Freigabe nötig.', neu_noetig: true, inhalt_geaendert: true };
  if (freigabe.status === 'verwendet') return { ok: false, grund: 'Diese Freigabe wurde schon verwendet. Jede Freigabe gilt für genau eine Ausführung.', neu_noetig: true };
  if (freigabe.status !== 'erteilt') return { ok: false, grund: 'Die Freigabe ist ' + freigabe.status + ', nicht erteilt.', neu_noetig: freigabe.status !== 'offen' };
  if (freigabe.gueltig_bis && new Date(freigabe.gueltig_bis).getTime() < jetztMs) return { ok: false, grund: 'Die Freigabe ist abgelaufen.', neu_noetig: true };
  return { ok: true };
}

/** Felder für die Entscheidung eines Menschen. */
export function freigabeEntscheiden(freigabe, entscheidung, von, begruendung, jetzt) {
  if (freigabe.status !== 'offen') return { fehler: 'Diese Freigabe ist nicht mehr offen (' + freigabe.status + ').' };
  if (!['erteilt', 'abgelehnt'].includes(entscheidung)) return { fehler: 'Entscheidung muss „erteilt“ oder „abgelehnt“ sein.' };
  const gueltig_bis = entscheidung === 'erteilt' ? new Date(new Date(jetzt).getTime() + FRISTEN.freigabe_gueltig * 1000).toISOString() : null;
  return { row: { status: entscheidung, entschieden_von: von, entschieden_am: jetzt, begruendung: String(begruendung || '').slice(0, 600), gueltig_bis } };
}
