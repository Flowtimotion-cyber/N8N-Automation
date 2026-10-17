// STUB: Adapter „Claude Code“ (und Codex). Noch nicht implementiert.
// Geplanter Ablauf: Ein Mensch oder ein Zeitplan startet Claude Code in einer isolierten Arbeitsumgebung (Container oder eigener Benutzer,
// frisches Repo-Checkout, keine produktiven Schlüssel außer TEAM_PORTAL_TOKEN des Agenten). Claude Code nutzt agenten/team.py bzw. die
// Office-API: lebenszeichen beim Start, ereignis je Schritt/Tool-Aufruf (nur Titel, Tool-Name, Quellen-Referenz), artefakt für Commits/Dateien,
// rueckfrage statt Raten, freigabe_anfordern vor jeder externen Aktion, run_beenden am Ende. Die Subagenten in .claude/agents/ beschreiben
// Rolle, Modell und enge Werkzeuge. Regeln: keine Shell-Ausführung aus Benutzereingaben oder Dokumentinhalten, keine Gedankengänge übermitteln,
// nichts löschen, „Erledigt“ setzt ein Mensch.
export function claudeCodeAdapter() {
  const nicht = () => { throw new Error('Claude-Code-Adapter ist ein Stub. Siehe docs/office/RESTPUNKTE.md.'); };
  return { startRun: nicht, cancelRun: nicht, rueckmeldung: nicht };
}
