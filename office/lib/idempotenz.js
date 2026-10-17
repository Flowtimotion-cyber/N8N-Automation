// KI Office: Idempotenzschlüssel. Ein Auftrag oder eine Ausführung mit demselben Schlüssel wird nicht doppelt ausgeführt,
// sondern liefert die gespeicherte Antwort zurück. Zusätzlich sichert die Datenbank das mit einem Unique-Index ab.

export const SCHLUESSEL_MUSTER = /^[A-Za-z0-9_.:-]{8,120}$/;

export function schluesselGueltig(s) { return SCHLUESSEL_MUSTER.test(String(s || '')); }

/** Sucht eine frühere Antwort zu diesem Schlüssel (gleiche Art). */
export function frueherGesehen(eintraege, art, schluessel) {
  return (eintraege || []).find(e => e && e.art === art && e.schluessel === schluessel) || null;
}

/** Baut den Datensatz, der die Antwort zum Schlüssel festhält. */
export function merken({ art, schluessel, run_id, antwort, jetzt }) {
  return { schluessel, art, run_id: run_id || null, antwort: antwort || {}, erstellt: jetzt };
}
