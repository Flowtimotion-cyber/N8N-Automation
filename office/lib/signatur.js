// KI Office: Signatur für den Rückmelde-Webhook (Executor → Office-API).
// Schutz gegen manipulierte Webhooks und Replay: HMAC über Zeitstempel, Nonce und Inhalts-Hash, Zeitfenster 5 Minuten, Nonce nur einmal.
import { hmacSha256, sha256, kanonisch, gleich } from './hash.js';

export const ZEITFENSTER_SEK = 300;

export function nachrichtFuerSignatur(zeit, nonce, ergebnis) {
  return String(zeit) + '.' + String(nonce) + '.' + sha256(kanonisch(ergebnis === undefined ? null : ergebnis));
}

/** Erzeugt die Signatur. Der Executor ruft das mit dem run-spezifischen Rückmelde-Schlüssel auf. */
export function signiere(schluessel, zeit, nonce, ergebnis) {
  return hmacSha256(schluessel, nachrichtFuerSignatur(zeit, nonce, ergebnis));
}

/**
 * Prüft eine Rückmeldung. nonceGesehen(nonce) → true, wenn die Nonce schon verwendet wurde.
 * Liefert { ok: true } oder { ok: false, grund }.
 */
export function pruefeSignatur({ schluessel, zeit, nonce, ergebnis, signatur }, jetztMs, nonceGesehen) {
  if (!schluessel) return { ok: false, grund: 'Für diesen Run gibt es keinen Rückmelde-Schlüssel.' };
  const z = new Date(zeit || '').getTime();
  if (!isFinite(z)) return { ok: false, grund: 'Zeitstempel fehlt oder ist ungültig.' };
  if (Math.abs(jetztMs - z) > ZEITFENSTER_SEK * 1000) return { ok: false, grund: 'Zeitstempel außerhalb des Zeitfensters von ' + ZEITFENSTER_SEK + ' Sekunden.' };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(nonce || ''))) return { ok: false, grund: 'Nonce fehlt oder hat ein falsches Format (16 bis 64 Zeichen).' };
  if (nonceGesehen && nonceGesehen(String(nonce))) return { ok: false, grund: 'Diese Nonce wurde schon verwendet (Replay).' };
  const soll = signiere(schluessel, zeit, nonce, ergebnis);
  if (!gleich(soll, String(signatur || '').toLowerCase())) return { ok: false, grund: 'Signatur stimmt nicht.' };
  return { ok: true };
}
