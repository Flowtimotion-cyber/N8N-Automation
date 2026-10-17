// TESTADAPTER: simuliert Ausführer (Agenten) lokal mit synthetischen Daten.
// Reagiert auf Starts der Office-API, sendet Lebenszeichen, Schritte, Rückfragen, Freigabe-Anfragen, Ergebnisse,
// und stellt Fehlerfälle nach: Timeouts, verspätete Rückmeldungen, Abstürze. Nichts hiervon ist produktiv.
import { signiere } from '../lib/signatur.js';

const enthaelt = (s, ...w) => w.some(x => String(s || '').toLowerCase().includes(x));

export class TestAdapter {
  constructor({ speicher, uhr, tokenVon }) {
    this.sp = speicher; this.uhr = uhr; this.tokenVon = tokenVon;   // tokenVon(agent_id) → Token des Teammitglieds hinter dem Agenten
    this.laeufe = new Map();                                         // run_id → Skript
    speicher.hoerer.push(ext => { if (ext.art === 'start') this.startRun(ext); if (ext.art === 'abbruch') this.cancelRun(ext); if (ext.art === 'aktion') this.externeAktion(ext); });
    this.ausgefuehrt = [];                                           // simulierte externe Wirkungen (E-Mails usw.), für Tests zählbar
  }
  run(id) { return (this.sp.T.office_runs || []).find(r => r.run_id === id); }
  agent(id) { return (this.sp.T.office_agenten || []).find(a => a.agent_id === id) || {}; }
  api(agentId, aktion, daten) { return this.sp.aufruf({ token: this.tokenVon(agentId), aktion, daten }); }

  startRun(ext) {
    const run = this.run(ext.run_id); if (!run) return;
    const a = run.auftrag;
    // Agenten mit dem Werkzeug auftrag_delegieren (Orchestrierer) arbeiten nicht selbst, sondern zerlegen und delegieren (Skript „team“).
    const orchestriert = (this.agent(run.agent_id).erlaubte_tools || []).includes('auftrag_delegieren') && !run.eltern_run_id;
    const art = orchestriert ? 'team' : enthaelt(a, 'nie übernehmen', 'nie uebernehmen') ? 'nie' : enthaelt(a, 'verspätet', 'verspaetet', 'spät') ? 'spaet' : enthaelt(a, 'langsam', 'hängt', 'haengt') ? 'langsam'
      : enthaelt(a, 'fehler', 'kaputt') ? 'fehler' : enthaelt(a, 'rückfrage', 'rueckfrage') ? 'frage' : enthaelt(a, 'e-mail', 'email', 'mail', 'veröffentlich', 'post', 'zahlung') ? 'freigabe' : 'normal';
    this.laeufe.set(run.run_id, { art, schritt: 0, faellig: this.uhr.ms + 5000, schluessel: ext.schluessel, agent_id: run.agent_id, gestartet: this.uhr.ms });
  }
  cancelRun(ext) { const s = this.laeufe.get(ext.run_id); if (s) s.abgebrochen = true; }
  externeAktion(ext) { this.ausgefuehrt.push({ zeit: this.uhr.iso(), run_id: ext.run_id, aktion: ext.aktion, freigabe_id: ext.freigabe_id }); }

  /** Signierte Rückmeldung wie ein echter Executor sie schicken würde. */
  rueckmeldung(run_id, schluessel, ergebnis, opts) {
    const zeit = (opts && opts.zeit) || this.uhr.iso();
    const nonce = (opts && opts.nonce) || 'n' + this.sp.zufall(20);
    return this.sp.aufruf({ aktion: 'rueckmeldung', daten: { run_id, zeit, nonce, signatur: signiere(schluessel, zeit, nonce, ergebnis), ergebnis } });
  }

  /** Alle fälligen Skriptschritte ausführen. Wird vom Server regelmäßig und nach Zeitsprüngen aufgerufen. */
  laufen() {
    for (const [run_id, s] of this.laeufe) {
      if (s.abgebrochen) { this.laeufe.delete(run_id); continue; }
      const run = this.run(run_id); if (!run) { this.laeufe.delete(run_id); continue; }
      if (this.uhr.ms < s.faellig) continue;
      const weiter = sek => { s.faellig = this.uhr.ms + sek * 1000; };
      const A = s.agent_id, reg = this.agent(A);
      const tool = (reg.erlaubte_tools || [])[0] || null;
      const verbrauch = (reg.ausfuehrer === 'n8n' || reg.ausfuehrer === 'hermes') ? { tokens_ein: 1200 + s.schritt * 300, tokens_aus: 400 + s.schritt * 50, modell: reg.modell, kosten_eur: 0.004, kosten_quelle: 'Preisliste Anthropic 10/2026 (Testdaten)' } : null;
      switch (s.art) {
        case 'nie': this.laeufe.delete(run_id); continue;                                   // kein Executor übernimmt → Wartung setzt „unbekannt“
        case 'team': {
          // Orchestrierer: Aufgaben und Registry lesen, zwei Teilaufträge an Agenten desselben Projekts delegieren (Team), auf die Kinder warten, zusammenführen.
          // Steht im Auftrag „langsam“, bekommt der zweite Teilauftrag dieses Stichwort und bleibt „in Arbeit“ (für Testdaten und Browsertests).
          if (s.schritt === 0) {
            this.api(A, 'lebenszeichen', { run_id });
            this.api(A, 'ereignis', { run_id, art: 'tool', titel: 'Aufgaben des Projekts gelesen', tool: 'aufgaben_lesen' });
            const ziele = (this.sp.T.office_agenten || []).filter(x => x.aktiv !== false && x.agent_id !== A && (x.projekte || []).includes(run.projekt) && !(x.erlaubte_tools || []).includes('auftrag_delegieren')).slice(0, 2);
            this.api(A, 'ereignis', { run_id, art: 'tool', titel: 'Registry gelesen, ' + ziele.length + ' Agenten für das Team gewählt: ' + ziele.map(x => x.name).join(', '), tool: 'registry_lesen' });
            s.kinder = [];
            ziele.forEach((z, i) => {
              const teil = 'Teil ' + (i + 1) + ' von ' + ziele.length + ': ' + run.auftrag.replace(/,?\s*(zweiter|2\.)\s*teilauftrag läuft langsam/i, '').slice(0, 1500) + (i === 1 && enthaelt(run.auftrag, 'langsam') ? ' (läuft langsam)' : '');
              const r = this.api(A, 'auftrag_delegieren', { eltern_run_id: run_id, agent_id: z.agent_id, projekt: run.projekt, auftrag: teil, team_id: 'team-' + run_id, idempotenzschluessel: 'deleg-' + run_id + '-' + (i + 1) });
              if (r.antwort && r.antwort.run_id) s.kinder.push(r.antwort.run_id);
            });
            if (!s.kinder.length) { this.rueckmeldung(run_id, s.schluessel, { status: 'fehlgeschlagen', fehler: 'Kein Agent für dieses Projekt in der Registry; nichts delegiert.' }); this.laeufe.delete(run_id); continue; }
            s.schritt = 1; weiter(10); continue;
          }
          const kinder = s.kinder.map(id => this.run(id)).filter(Boolean);
          const offen = kinder.filter(k => !['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt'].includes(k.status));
          if (offen.length) { this.api(A, 'lebenszeichen', { run_id }); weiter(30); continue; }
          const gut = kinder.filter(k => k.status === 'abgeschlossen').length;
          this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Teilergebnisse zusammengeführt: ' + gut + ' von ' + kinder.length + ' Teilaufträgen abgeschlossen' });
          this.api(A, 'artefakt', { run_id, art: 'notiz', titel: 'Teamergebnis: ' + run.auftrag.slice(0, 50), ablageort: 'notiz:Teamergebnis ' + run_id, zusammenfassung: 'Zusammenführung der Teilergebnisse (synthetisch).' });
          this.rueckmeldung(run_id, s.schluessel, { status: gut === kinder.length ? 'abgeschlossen' : 'fehlgeschlagen', zusammenfassung: 'Team mit ' + kinder.length + ' Teilaufträgen: ' + gut + ' abgeschlossen. Ergebnis liegt als Notiz vor.', fehler: gut === kinder.length ? undefined : (kinder.length - gut) + ' Teilauftrag/Teilaufträge nicht abgeschlossen.' });
          this.laeufe.delete(run_id); continue;
        }
        case 'langsam': if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id }); this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Beginne mit der Analyse' }); s.schritt = 1; } this.laeufe.delete(run_id); continue; // danach Stille → Timeout
        case 'spaet': {
          if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id }); s.schritt = 1; weiter((Number(run.timeout_sek) || 900) + 600); continue; }   // meldet sich erst nach dem Timeout
          this.rueckmeldung(run_id, s.schluessel, { status: 'abgeschlossen', zusammenfassung: 'Verspätetes Ergebnis nach Timeout (Testadapter).' }); this.laeufe.delete(run_id); continue;
        }
        case 'fehler': {
          if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id }); this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Lese Aufgabenbeschreibung' }); s.schritt = 1; weiter(20); continue; }
          if (s.schritt === 1) { this.api(A, 'ereignis', { run_id, art: 'tool', titel: 'Werkzeugaufruf fehlgeschlagen', tool, details: { fehler: 'HTTP 503 vom Zielsystem' } }); s.schritt = 2; weiter(10); continue; }
          this.rueckmeldung(run_id, s.schluessel, { status: 'fehlgeschlagen', fehler: 'Zielsystem nicht erreichbar (HTTP 503), nach 2 Versuchen aufgegeben.', verbrauch }); this.laeufe.delete(run_id); continue;
        }
        case 'frage': {
          if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id }); this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Prüfe Auftrag auf fehlende Angaben' }); s.schritt = 1; weiter(15); continue; }
          if (s.schritt === 1) { this.api(A, 'rueckfrage', { run_id, frage: 'Soll der Text in der Du-Form oder in der Sie-Form geschrieben werden?' }); s.schritt = 2; weiter(5); continue; }
          if (s.schritt === 2) { if (run.status === 'in_arbeit') { this.api(A, 'ereignis', { run_id, art: 'antwort', titel: 'Antwort erhalten, arbeite weiter' }); s.schritt = 3; weiter(30); } else weiter(5); continue; }
          this.api(A, 'artefakt', { run_id, art: 'text', titel: 'Entwurf nach Rückfrage', ablageort: 'notiz:Entwurf ' + run_id, zusammenfassung: 'Textentwurf in der gewünschten Anrede.' });
          this.rueckmeldung(run_id, s.schluessel, { status: 'abgeschlossen', zusammenfassung: 'Entwurf erstellt und als Notiz abgelegt.', verbrauch }); this.laeufe.delete(run_id); continue;
        }
        case 'freigabe': {
          const aktion = enthaelt(run.auftrag, 'zahlung') ? 'zahlung_ausloesen' : enthaelt(run.auftrag, 'veröffentlich', 'post') ? 'post_veroeffentlichen' : 'email_senden';
          if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id }); this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Entwurf vorbereitet' }); s.inhalt = { an: 'kontakt@beispiel.example', betreff: 'Entwurf: ' + run.auftrag.slice(0, 40), text: 'Guten Tag, anbei der besprochene Entwurf. (Testadapter, synthetisch)' }; const r = this.api(A, 'freigabe_anfordern', { run_id, aktion, inhalt: s.inhalt }); s.freigabe_id = r.antwort && r.antwort.freigabe_id; s.schritt = 1; weiter(5); continue; }
          if (s.schritt === 1) {
            const fr = (this.sp.T.office_freigaben || []).find(f => f.freigabe_id === s.freigabe_id);
            if (!fr) { this.laeufe.delete(run_id); continue; }
            if (fr.status === 'offen') { weiter(5); continue; }
            if (fr.status === 'erteilt') { const r = this.api(A, 'aktion_ausfuehren', { run_id, aktion, inhalt: s.inhalt, freigabe_id: fr.freigabe_id, idempotenzschluessel: 'akt-' + run_id }); s.schritt = 2; s.ergebnis = r.antwort; weiter(10); continue; }
            this.rueckmeldung(run_id, s.schluessel, { status: 'abgeschlossen', zusammenfassung: 'Freigabe wurde abgelehnt (' + fr.status + '). Nichts versendet; Entwurf bleibt als Notiz.', verbrauch }); this.laeufe.delete(run_id); continue;
          }
          this.rueckmeldung(run_id, s.schluessel, { status: 'abgeschlossen', zusammenfassung: 'Externe Aktion nach Freigabe ausgeführt: ' + aktion + '.', verbrauch, artefakte: [{ art: 'text', titel: 'Versandprotokoll', ablageort: 'notiz:Versand ' + run_id }] }); this.laeufe.delete(run_id); continue;
        }
        default: {
          if (s.schritt === 0) { this.api(A, 'lebenszeichen', { run_id, n8n_execution_id: reg.ausfuehrer === 'n8n' ? 'exec-' + run_id.slice(-6) : undefined }); this.api(A, 'ereignis', { run_id, art: 'schritt', titel: 'Auftrag gelesen, Plan in 3 Schritten' }); s.schritt = 1; weiter(20); continue; }
          if (s.schritt === 1) { this.api(A, 'ereignis', { run_id, art: 'tool', titel: 'Werkzeug genutzt: ' + (tool || 'keins'), tool, details: { dauer_ms: 840 } }); this.api(A, 'ereignis', { run_id, art: 'quelle', titel: 'Quelle gelesen', quelle_ref: 'https://docs.n8n.io/' }); s.schritt = 2; weiter(20); continue; }
          if (s.schritt === 2) { this.api(A, 'artefakt', { run_id, art: 'notiz', titel: 'Ergebnis: ' + run.auftrag.slice(0, 50), ablageort: 'notiz:Ergebnis ' + run_id, zusammenfassung: 'Zusammenfassung des Ergebnisses (synthetisch).' }); s.schritt = 3; weiter(30); continue; }
          this.rueckmeldung(run_id, s.schluessel, { status: 'abgeschlossen', zusammenfassung: 'Auftrag erledigt: ' + run.auftrag.slice(0, 80) + ' Ergebnis liegt als Notiz vor.', verbrauch }); this.laeufe.delete(run_id); continue;
        }
      }
    }
  }
}
