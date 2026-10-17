// KI Office: Adaptergrenze zwischen Office-API und Ausführern (n8n, Claude Code, Codex, Hermes).
// Jede Implementierung bietet dieselben drei Operationen. Die Office-API kennt nur diese Schnittstelle.
//
//   startRun(auftrag)        auftrag = { run_id, agent_id, ausfuehrer, ausfuehrer_url, schluessel }
//                            Übergibt den Auftrag an den Ausführer. Der Rückmelde-Schlüssel wird genau einmal übergeben.
//   cancelRun(auftrag)       auftrag = { run_id, agent_id, ausfuehrer_url }
//                            Bittet den Ausführer, den Lauf zu beenden. Der Run ist serverseitig schon „abgebrochen“.
//   rueckmeldung(nachricht)  Der Ausführer meldet das Ergebnis an den Rückmelde-Webhook:
//                            POST …/office-api  { aktion: 'rueckmeldung', daten: { run_id, zeit, nonce, signatur, ergebnis } }
//                            signatur = HMAC-SHA256(schluessel, zeit + '.' + nonce + '.' + sha256(kanonisch(ergebnis)))  (office/lib/signatur.js)
//                            ergebnis = { status: 'abgeschlossen'|'fehlgeschlagen', zusammenfassung, fehler, verbrauch, n8n_execution_id, artefakte }
//
// Regeln für alle Ausführer:
//  - Isolierte Arbeitsumgebung, begrenzte Rechte, nur die Werkzeuge aus der Registry (erlaubte_tools).
//  - Keine Shell-Ausführung aus Benutzereingaben oder Dokumentinhalten (Prompt Injection).
//  - Externe Aktionen (E-Mail, Posts, Zahlungen, Löschungen) nur über aktion_ausfuehren mit erteilter Freigabe.
//  - Zwischenstände als Ereignisse melden (ereignis), regelmäßig Lebenszeichen senden, keine Gedankengänge übermitteln.

export const SCHNITTSTELLE = ['startRun', 'cancelRun', 'rueckmeldung'];

/** Prüft, ob ein Objekt die Schnittstelle erfüllt. */
export function istAdapter(obj) { return !!obj && SCHNITTSTELLE.every(m => typeof obj[m] === 'function'); }
