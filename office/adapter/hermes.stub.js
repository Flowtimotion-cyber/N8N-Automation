// STUB: Adapter „Hermes“ (dauerhaft laufender Agent auf dem Hetzner-Server). Noch nicht implementiert.
// Geplanter Ablauf: Hermes pollt die Office-API mit seinem Agenten-Token (aktion laden → runs mit status warteschlange und agent_id aus seiner Registry),
// übernimmt per lebenszeichen, meldet Schritte per ereignis, Ergebnisse per run_beenden (Token-Authentifizierung, keine Signatur nötig).
// Pflichten: isolierte Arbeitsumgebung (eigener Benutzer, kein Root), begrenzte Rechte (nur erlaubte_tools der Registry),
// keine Shell-Ausführung aus Benutzereingaben oder Dokumentinhalten, externe Aktionen nur über aktion_ausfuehren mit Freigabe,
// keine Gedankengänge oder Prompts in Ereignisse schreiben, Zugangsdaten nur aus der Umgebung (TEAM_PORTAL_TOKEN), nie aus Aufgaben.
export function hermesAdapter() {
  const nicht = () => { throw new Error('Hermes-Adapter ist ein Stub. Siehe docs/office/RESTPUNKTE.md.'); };
  return { startRun: nicht, cancelRun: nicht, rueckmeldung: nicht };
}
