// KI Office: Zustandsmaschine für Agentenläufe (Runs).
// Diese Tabelle ist die einzige Quelle der Wahrheit. Sie steht wortgleich in docs/office/ARCHITEKTUR.md.
// „Technisch erfolgreich“ (status = abgeschlossen) ist strikt getrennt von „fachlich abgenommen“ (run.abgenommen = true, nur Menschen).

export const STATUS = {
  WARTESCHLANGE: 'warteschlange',
  IN_ARBEIT: 'in_arbeit',
  WARTET_RUECKMELDUNG: 'wartet_rueckmeldung',
  WARTET_FREIGABE: 'wartet_freigabe',
  ABGESCHLOSSEN: 'abgeschlossen',
  FEHLGESCHLAGEN: 'fehlgeschlagen',
  ABGEBROCHEN: 'abgebrochen',
  UNBEKANNT: 'unbekannt'
};
export const ALLE_STATUS = Object.values(STATUS);

export const STATUS_TEXT = {
  warteschlange: 'Warteschlange',
  in_arbeit: 'in Arbeit',
  wartet_rueckmeldung: 'wartet auf Rückmeldung',
  wartet_freigabe: 'wartet auf Freigabe',
  abgeschlossen: 'abgeschlossen (technisch)',
  fehlgeschlagen: 'fehlgeschlagen',
  abgebrochen: 'abgebrochen',
  unbekannt: 'unbekannt / veraltet'
};

export const ENDZUSTAENDE = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt'];
export const istEndzustand = s => ENDZUSTAENDE.includes(s);

// Zulässige Übergänge: von → nach, durch wen (agent = ausführender Agent/Executor, mensch = Teammitglied, system = Wartung/Timeout), Anlass.
export const UEBERGAENGE = [
  { von: 'warteschlange', nach: 'in_arbeit', wer: ['agent', 'system'], anlass: 'Executor meldet Start oder erstes Lebenszeichen' },
  { von: 'warteschlange', nach: 'fehlgeschlagen', wer: ['agent', 'system'], anlass: 'Start nicht möglich (Dispatch-Fehler)' },
  { von: 'warteschlange', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Auftrag zurückgezogen' },
  { von: 'warteschlange', nach: 'unbekannt', wer: ['system'], anlass: 'Wartezeit überschritten, kein Executor hat übernommen' },
  { von: 'in_arbeit', nach: 'wartet_rueckmeldung', wer: ['agent'], anlass: 'Agent stellt eine Rückfrage' },
  { von: 'in_arbeit', nach: 'wartet_freigabe', wer: ['agent'], anlass: 'Agent fordert Freigabe für eine externe Aktion an' },
  { von: 'in_arbeit', nach: 'abgeschlossen', wer: ['agent'], anlass: 'Ergebnis gemeldet (technisch erfolgreich, noch nicht abgenommen)' },
  { von: 'in_arbeit', nach: 'fehlgeschlagen', wer: ['agent', 'system'], anlass: 'Fehler gemeldet' },
  { von: 'in_arbeit', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch bricht ab (cancelRun)' },
  { von: 'in_arbeit', nach: 'unbekannt', wer: ['system'], anlass: 'Kein Lebenszeichen länger als timeout_sek (auch nach Neustart)' },
  { von: 'wartet_rueckmeldung', nach: 'in_arbeit', wer: ['mensch'], anlass: 'Mensch beantwortet die Rückfrage' },
  { von: 'wartet_rueckmeldung', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch bricht ab' },
  { von: 'wartet_rueckmeldung', nach: 'fehlgeschlagen', wer: ['agent', 'system'], anlass: 'Executor meldet Fehler' },
  { von: 'wartet_rueckmeldung', nach: 'unbekannt', wer: ['system'], anlass: 'Wartefrist für Menschen überschritten' },
  { von: 'wartet_freigabe', nach: 'in_arbeit', wer: ['mensch'], anlass: 'Freigabe erteilt oder abgelehnt (Agent entscheidet dann, wie es weitergeht)' },
  { von: 'wartet_freigabe', nach: 'warteschlange', wer: ['mensch'], anlass: 'Timo (Admin) gibt den Start eines Auftrags frei, den ein Teammitglied angelegt hat' },
  { von: 'wartet_freigabe', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch bricht ab, oder Timo lehnt den Start eines Auftrags ab' },
  { von: 'wartet_freigabe', nach: 'fehlgeschlagen', wer: ['agent', 'system'], anlass: 'Executor meldet Fehler' },
  { von: 'wartet_freigabe', nach: 'unbekannt', wer: ['system'], anlass: 'Wartefrist für Menschen überschritten' },
  { von: 'fehlgeschlagen', nach: 'warteschlange', wer: ['mensch', 'system'], anlass: 'Wiederholung, nur solange versuche < max_versuche' },
  { von: 'unbekannt', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch schließt den veralteten Run ab (Aufräumen); nie nachträglich „abgeschlossen“' }
];

export function darfWechseln(von, nach, wer) {
  return UEBERGAENGE.some(u => u.von === von && u.nach === nach && (!wer || u.wer.includes(wer)));
}

export function uebergangsTabelleMarkdown() {
  const z = ['| Von | Nach | Wer | Anlass |', '|---|---|---|---|'];
  for (const u of UEBERGAENGE) z.push('| ' + STATUS_TEXT[u.von] + ' | ' + STATUS_TEXT[u.nach] + ' | ' + u.wer.join(', ') + ' | ' + u.anlass + ' |');
  return z.join('\n');
}

// Standardfristen (Sekunden). Können je Run überschrieben werden (timeout_sek) und je Agent in der Registry.
export const FRISTEN = {
  wartezeit_warteschlange: 30 * 60,        // bis ein Executor übernehmen muss
  // Wartezeit je Ausführer: Wer selbst abholt (Claude-Code-Abholer stündlich 8–20 Uhr, Hermes per Zeitplan), darf nicht nach 30 Minuten als „unbekannt“ gelten,
  // sonst gehen Aufträge über Nacht verloren (der Abholer holt nur Runs in der Warteschlange). n8n antwortet sofort und behält die kurze Frist.
  wartezeit_je_ausfuehrer: { 'claude-code': 14 * 3600, hermes: 3 * 3600 },
  timeout_sek: 15 * 60,                    // ohne Lebenszeichen in „in Arbeit“
  wartefrist_mensch: 7 * 24 * 3600,        // Rückfragen und Freigaben warten auf Menschen
  freigabe_gueltig: 24 * 3600,             // erteilte Freigabe verfällt, wenn sie nicht genutzt wird
  max_versuche: 3
};

/**
 * Prüft einen Run gegen die Fristen. Liefert null (nichts zu tun) oder { nach: 'unbekannt', grund }.
 * jetztMs: Zeitpunkt der Prüfung. Läuft bei jeder Wartung (Zeitplan) und damit auch nach einem Neustart.
 */
export function fristPruefen(run, jetztMs) {
  const t = s => s ? new Date(s).getTime() : NaN;
  const alter = s => (jetztMs - t(s)) / 1000;
  const timeout = Number(run.timeout_sek) || FRISTEN.timeout_sek;
  if (run.status === 'warteschlange') {
    // Ab der letzten Zustandsänderung zählen (lebenszeichen), nicht ab dem Anlegen: ein Auftrag, der erst nach Timos Freigabe startet, hat sonst die Wartezeit schon verbraucht.
    const a = alter(run.lebenszeichen || run.erstellt);
    const frist = FRISTEN.wartezeit_je_ausfuehrer[run.ausfuehrer] || FRISTEN.wartezeit_warteschlange;
    if (a > frist) return { nach: 'unbekannt', grund: 'Kein Executor hat den Auftrag innerhalb von ' + (frist >= 7200 ? Math.round(frist / 3600) + ' Stunden' : Math.round(frist / 60) + ' Minuten') + ' übernommen.' };
  }
  if (run.status === 'in_arbeit') {
    const a = alter(run.lebenszeichen || run.gestartet || run.erstellt);
    if (a > timeout) return { nach: 'unbekannt', grund: 'Kein Lebenszeichen seit ' + Math.round(a / 60) + ' Minuten (Timeout ' + Math.round(timeout / 60) + ' Minuten). Der Run kann noch laufen, sein Ergebnis gilt aber als veraltet.' };
  }
  if (run.status === 'wartet_rueckmeldung' || run.status === 'wartet_freigabe') {
    const a = alter(run.lebenszeichen || run.gestartet || run.erstellt);
    if (a > FRISTEN.wartefrist_mensch) return { nach: 'unbekannt', grund: 'Seit ' + Math.round(a / 86400) + ' Tagen keine Antwort oder Entscheidung. Der Auftrag gilt als veraltet.' };
  }
  return null;
}
