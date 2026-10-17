// TESTADAPTER: In-Memory-Speicher, der Supabase und den n8n-Workflow „TEAM: Office-API“ lokal nachstellt.
// Er führt exakt denselben Verarbeitungscode aus wie der n8n-Code-Knoten (office/lib/verarbeitung.js)
// und wendet die erzeugten PostgREST-Schreibaufträge auf Tabellen im Arbeitsspeicher an.
// Nichts hiervon läuft produktiv. Synthetische Daten, keine echten Personen.
import { verarbeiten } from '../lib/verarbeitung.js';
import { wendeAn } from '../lib/postgrest.js';

/** Virtuelle Uhr: lässt sich für Timeout- und Neustart-Tests vorstellen. */
export class Uhr {
  constructor(startIso) { this.ms = startIso ? new Date(startIso).getTime() : Date.now(); }
  iso() { return new Date(this.ms).toISOString(); }
  vor(sek) { this.ms += Math.round(sek * 1000); return this.iso(); }
}

/** Deterministischer Zufall (nur für reproduzierbare Testdaten). */
export function zufallsQuelle(seed) {
  let s = (seed >>> 0) || 1;
  return n => { let out = ''; while (out.length < n) { s = (s * 1664525 + 1013904223) >>> 0; out += s.toString(16).padStart(8, '0'); } return out.slice(0, n); };
}

export class Speicher {
  constructor({ tabellen, uhr, zufall, quelle }) {
    this.T = tabellen; this.uhr = uhr || new Uhr(); this.zufall = zufall || zufallsQuelle(42); this.quelle = quelle || 'testadapter';
    this.externe = [];           // alle „externen“ Wirkungen (Start, Abbruch, ausgeführte Aktionen), für Tests zählbar
    this.protokoll = [];         // Aufruf-Protokoll ohne Tokens
    this.hoerer = [];            // Adapter, die auf extern reagieren
    this.naechsteId = Math.max(0, ...(this.T.office_ereignisse || []).map(e => Number(e.id) || 0), ...(this.T.team_aufgaben_verlauf || []).map(e => Number(e.id) || 0)) + 1;
  }
  /** Momentaufnahme wie team_laden() sie liefern würde (tiefe Kopie, damit die Verarbeitung nichts direkt verändert). */
  schnappschuss() {
    const T = JSON.parse(JSON.stringify(this.T));
    const D = { mitglieder: T.team_mitglieder || [], projekte: T.team_projekte || [], aufgaben: T.team_aufgaben || [], verlauf: T.team_aufgaben_verlauf || [], notizen: T.team_notizen || [], social: T.team_social || [], systeme: T.team_systeme || [] };
    for (const k of Object.keys(T)) if (k.startsWith('office_')) D[k] = T[k];
    return D;
  }
  /** Lesezugriff auf die Office- und Team-Tabellen unter den team_laden-Namen (für Tests und den Testadapter). */
  get T_() { return this.schnappschuss(); }
  /** Ein Aufruf wie POST /webhook/office-api. Liefert { code, antwort, extern }. */
  aufruf(body) {
    const D = this.schnappschuss();
    const r = verarbeiten({ body, D, jetzt: this.uhr.iso(), zufall: this.zufall, quelle: this.quelle });
    this.protokoll.push({ zeit: this.uhr.iso(), aktion: body && body.aktion, code: r.code, ok: r.antwort && r.antwort.ok !== false });
    if (r.weiter === 2) {
      for (const op of r.ops || []) {
        const res = wendeAn(this.T, op, () => this.naechsteId++);
        if (res.statusCode >= 300) return { code: res.statusCode === 409 ? 409 : 500, antwort: { ok: false, fehler: 'Speichern hat nicht geklappt: ' + (res.body && res.body.message || res.statusCode) } };
      }
      if (r.extern) { this.externe.push({ zeit: this.uhr.iso(), ...r.extern }); for (const h of this.hoerer) { try { h(r.extern); } catch (e) { /* Adapterfehler dürfen die API nicht stören */ } } }
    }
    return { code: r.code || 200, antwort: r.antwort, extern: r.extern || null };
  }
}
