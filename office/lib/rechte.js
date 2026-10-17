// KI Office: Rechteprüfung. Läuft serverseitig im n8n-Code-Knoten (und im Testserver), nicht nur im Browser.
// Rollen aus team_mitglieder.rolle: admin | dozent | vertrieb | team | agent.

export const ROLLEN_MENSCH = ['admin', 'dozent', 'vertrieb', 'team'];
export const istAgent = ich => !!ich && (ich.rolle === 'agent' || ich.typ === 'agent');
export const istAdmin = ich => !!ich && ich.rolle === 'admin';
export const istDozent = ich => !!ich && (ich.rolle === 'admin' || ich.rolle === 'dozent');
export const istMensch = ich => !!ich && !istAgent(ich);

// Was Agenten über die Office-API dürfen. Alles andere (Freigaben erteilen, Abnehmen, Abbrechen fremder Runs, Löschen, Registry) ist Menschen vorbehalten.
export const AGENT_DARF = ['laden', 'auftrag_starten', 'auftrag_delegieren', 'lebenszeichen', 'ereignis', 'artefakt', 'rueckfrage', 'freigabe_anfordern', 'aktion_ausfuehren', 'run_beenden'];
// Was nur Admin darf.
export const NUR_ADMIN = ['agent_speichern', 'loeschen', 'wartung'];
// Aktionen ohne Token (Signatur statt Token): nur die Rückmeldung des Executors.
export const OHNE_TOKEN = ['rueckmeldung'];

/**
 * Projekte, die jemand sehen darf.
 * Menschen: alle Projekte (wie im Portal), außer das Mitglied hat eine Projektliste (Feld projekte, z. B. künftige Kundenzugänge).
 * Agenten: nur Projekte aus ihrer Registry-Zuordnung (office_agenten.projekte). Leer = keins.
 * Liefert null für „alle“.
 */
export function sichtbareProjekte(ich, agenten) {
  if (!ich) return [];
  if (istAgent(ich)) {
    // Ein Teammitglied vom Typ agent kann mehrere Registry-Einträge ausführen (z. B. agent-claude für mehrere Rollen): Vereinigung der Projekte.
    const s = new Set();
    for (const a of (agenten || [])) if (a.mitglied_id === ich.mitglied_id || a.agent_id === ich.mitglied_id) for (const p of (Array.isArray(a.projekte) ? a.projekte : [])) s.add(p);
    return [...s];
  }
  if (Array.isArray(ich.projekte) && ich.projekte.length && !istAdmin(ich)) return ich.projekte.slice();
  return null;
}

export function darfProjekt(ich, projekt, agenten) {
  const s = sichtbareProjekte(ich, agenten);
  if (s === null) return true;
  return !!projekt && s.includes(projekt);
}

/** Führt dieses Teammitglied (Typ agent) den Registry-Agenten agent_id aus? */
export function fuehrtAus(ich, agentId, agenten) {
  return !!ich && (agenten || []).some(a => a.agent_id === agentId && (a.mitglied_id === ich.mitglied_id || a.agent_id === ich.mitglied_id));
}

/** Darf diese Person den Run sehen? Auftraggeber und der ausführende Agent sehen ihren Run immer. */
export function darfRunSehen(ich, run, agenten) {
  if (!ich || !run) return false;
  if (run.auftraggeber === ich.mitglied_id) return true;
  if (istAgent(ich) && fuehrtAus(ich, run.agent_id, agenten)) return true;
  return darfProjekt(ich, run.projekt, agenten);
}

/** Darf diese Person den Run verändern (abbrechen, wiederholen, antworten)? */
export function darfRunSteuern(ich, run, agenten) {
  if (!istMensch(ich)) return false;
  if (istDozent(ich)) return darfRunSehen(ich, run, agenten);
  return run.auftraggeber === ich.mitglied_id && darfProjekt(ich, run.projekt, agenten);
}

/** Darf diese Person eine Freigabe erteilen? Agenten nie. Kritische Aktionen nur Admin. */
export function darfFreigeben(ich, freigabe, run, stufe, agenten) {
  if (!istMensch(ich)) return { ok: false, grund: 'Freigaben erteilen nur Menschen.' };
  if (!darfProjekt(ich, run && run.projekt, agenten)) return { ok: false, grund: 'Dieses Projekt siehst du nicht.' };
  if (stufe === 'kritisch' && !istAdmin(ich)) return { ok: false, grund: 'Zahlungen, Löschungen und Verträge gibt nur Timo (Admin) frei.' };
  if (freigabe && freigabe.angefordert_von === ich.mitglied_id && !istAdmin(ich)) return { ok: false, grund: 'Wer die Freigabe anfordert, darf sie nicht selbst erteilen (Vier-Augen-Prinzip).' };
  return { ok: true };
}

/** Ist diese Aktion für diese Rolle überhaupt erlaubt? */
export function darfAktion(ich, aktion) {
  if (!ich) return { ok: false, code: 401, grund: 'Dein Zugang ist ungültig.' };
  if (ich.status === 'gesperrt') return { ok: false, code: 401, grund: 'Dein Zugang ist gesperrt.' };
  if (istAgent(ich) && !AGENT_DARF.includes(aktion)) return { ok: false, code: 403, grund: 'Das dürfen Agenten nicht. Erlaubt: ' + AGENT_DARF.join(', ') + '.' };
  if (NUR_ADMIN.includes(aktion) && !istAdmin(ich)) return { ok: false, code: 403, grund: 'Das darf nur Timo (Admin).' };
  return { ok: true };
}

/** Darf dieser Agent (Registry-Eintrag) dieses Werkzeug benutzen? */
export function darfTool(agentReg, tool) {
  if (!agentReg) return false;
  const erlaubt = Array.isArray(agentReg.erlaubte_tools) ? agentReg.erlaubte_tools : [];
  return erlaubt.includes(String(tool));
}
