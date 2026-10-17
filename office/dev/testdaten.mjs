// TESTADAPTER: synthetische Testdaten für das KI Office. Keine echten Personen, keine echten Zugangsdaten.
// Die Runs werden nicht „hingeschrieben“, sondern mit demselben Verarbeitungscode wie in n8n erzeugt (Speicher + TestAdapter),
// damit Zustände, Ereignisse und Verlaufseinträge immer konsistent zur Zustandsmaschine sind.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Speicher, Uhr, zufallsQuelle } from './speicher.mjs';
import { TestAdapter } from '../adapter/test.js';

const hier = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(hier, '..', 'agenten.json'), 'utf8'));

// Synthetische Zugangscodes (Hex, 32 Zeichen). Nur für den Testserver. Im echten Portal vergibt Timo andere.
export const TOKENS = {
  m_timo: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a01', m_kurt: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a02', m_lillien: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a03', m_murat: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a04',
  m_neu: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a05', m_gesperrt: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a06',
  'agent-claude': '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b01', 'agent-codex': '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b02', 'agent-hermes': '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b03'
};
export const tokenVonAgent = agentId => { const reg = REG.agenten.find(a => a.agent_id === agentId); return reg ? TOKENS[reg.mitglied_id] : null; };

export function basisTabellen(jetztIso) {
  const t = jetztIso;
  const vor = tage => new Date(new Date(t).getTime() - tage * 86400000).toISOString();
  const datum = tage => new Date(new Date(t).getTime() + tage * 86400000).toISOString().slice(0, 10);
  const mitglieder = [
    { mitglied_id: 'm_timo', name: 'Timo (Test)', funktion: 'Geschäftsführung', rolle: 'admin', typ: 'mensch', status: 'aktiv', token: TOKENS.m_timo },
    { mitglied_id: 'm_kurt', name: 'Kurt (Test)', funktion: 'Technik & Kurs', rolle: 'dozent', typ: 'mensch', status: 'aktiv', token: TOKENS.m_kurt },
    { mitglied_id: 'm_lillien', name: 'Lillien (Test)', funktion: 'Marketing', rolle: 'team', typ: 'mensch', status: 'aktiv', token: TOKENS.m_lillien },
    { mitglied_id: 'm_murat', name: 'Murat (Test)', funktion: 'Vertrieb', rolle: 'vertrieb', typ: 'mensch', status: 'aktiv', token: TOKENS.m_murat },
    { mitglied_id: 'm_neu', name: 'Neu (Test)', funktion: '', rolle: 'team', typ: 'mensch', status: 'eingeladen', token: TOKENS.m_neu },
    { mitglied_id: 'm_gesperrt', name: 'Gesperrt (Test)', funktion: '', rolle: 'team', typ: 'mensch', status: 'gesperrt', token: TOKENS.m_gesperrt },
    { mitglied_id: 'agent-claude', name: 'Claude', funktion: 'KI-Agent (Claude Code)', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOKENS['agent-claude'] },
    { mitglied_id: 'agent-codex', name: 'Codex', funktion: 'KI-Agent (Codex CLI)', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOKENS['agent-codex'] },
    { mitglied_id: 'agent-hermes', name: 'Hermes', funktion: 'KI-Agent (Hermes, Hetzner)', rolle: 'agent', typ: 'agent', status: 'aktiv', token: TOKENS['agent-hermes'] }
  ];
  const projekte = [
    { projekt_id: 'p_kurs', name: 'Akademie-Kurs', beschreibung: 'Modul 1.2 fertigstellen, Teilnehmende betreuen.', status: 'aktiv', farbe: '#7B3FE4', verantwortlich: 'm_kurt', reihenfolge: 1, raum: 'Akademie', links: [{ titel: 'Kursseite', url: 'https://flowtimotion-cyber.github.io/N8N-Automation/' }] },
    { projekt_id: 'p_web', name: 'Webseite', beschreibung: 'momentum-ki-akademie.de pflegen.', status: 'aktiv', farbe: '#5B6EE6', verantwortlich: 'm_lillien', reihenfolge: 2, raum: 'Marketing', links: [] },
    { projekt_id: 'p_social', name: 'Social Media', beschreibung: 'LinkedIn und Instagram, zwei Beiträge pro Woche.', status: 'aktiv', farbe: '#E98A15', verantwortlich: 'm_lillien', reihenfolge: 3, raum: 'Marketing', links: [] },
    { projekt_id: 'p_vertrieb', name: 'Vertrieb Herbst', beschreibung: 'Förderberatung und Angebote für Q4.', status: 'aktiv', farbe: '#1FA9B0', verantwortlich: 'm_murat', reihenfolge: 4, raum: 'Vertrieb', links: [] },
    { projekt_id: 'p_mueller', name: 'Kundenprojekt Müller GmbH', beschreibung: 'Angebots-Workflow in n8n für den Kunden (synthetisch).', status: 'aktiv', farbe: '#1F9D6B', verantwortlich: 'm_timo', reihenfolge: 5, raum: 'Kundenprojekte', links: [] },
    { projekt_id: 'p_verw', name: 'Verwaltung & Finanzen', beschreibung: 'Rechnungen, Server, Backups.', status: 'aktiv', farbe: '#62607E', verantwortlich: 'm_timo', reihenfolge: 6, raum: 'Verwaltung', links: [] },
    { projekt_id: 'p_geheim', name: 'Vertrauliches Projekt', beschreibung: 'Keinem Agenten zugeordnet (für die Rechteprüfung).', status: 'aktiv', farbe: '#D9452F', verantwortlich: 'm_timo', reihenfolge: 7, raum: null, links: [] },
    { projekt_id: 'p_alt', name: 'Altes Projekt', beschreibung: 'Abgeschlossen.', status: 'abgeschlossen', farbe: '#8E8BAA', verantwortlich: 'm_timo', reihenfolge: 9, raum: 'Verwaltung', links: [] }
  ];
  const A = (id, titel, projekt, status, prio, verantwortlich, extra) => Object.assign({ aufgabe_id: id, titel, beschreibung: '', status, prio, label: '', projekt, verantwortlich, erstellt_von: 'm_timo', deadline: '', agent_geeignet: false, erstellt: vor(10), geaendert: vor(2), erledigt_am: null }, extra || {});
  const aufgaben = [
    A('a_k1', 'Merkblatt Modul 1.2 schreiben', 'Akademie-Kurs', 'In Arbeit', 1, 'agent-claude', { agent_geeignet: true, deadline: datum(3), beschreibung: 'Merkblatt in du-Form, max. 2 Seiten.' }),
    A('a_k2', 'Quizfragen Modul 1.2', 'Akademie-Kurs', 'Offen', 2, 'agent-claude', { agent_geeignet: true }),
    A('a_k3', 'Teilnehmerliste prüfen', 'Akademie-Kurs', 'Erledigt', 2, 'm_kurt', { erledigt_am: vor(1) }),
    A('a_k4', 'Störung Kurs-Chat vom 12.10. nachvollziehen', 'Akademie-Kurs', 'Wartet', 1, 'm_kurt', { label: '🛑 Blockiert', deadline: datum(-2) }),
    A('a_w1', 'Impressum auf neue GmbH umstellen', 'Webseite', 'Geplant', 1, 'm_lillien', { deadline: datum(14) }),
    A('a_w2', 'Landingpage-Text Fördercheck überarbeiten', 'Webseite', 'In Arbeit', 2, 'agent-claude', { agent_geeignet: true }),
    A('a_s1', 'LinkedIn-Beitrag KW 43', 'Social Media', 'In Arbeit', 2, 'agent-claude', { agent_geeignet: true, deadline: datum(2) }),
    A('a_s2', 'Instagram-Reel Imagefilm', 'Social Media', 'Offen', 3, 'm_lillien'),
    A('a_s3', 'Newsletter Oktober', 'Social Media', 'Wird getestet', 2, 'agent-claude', { agent_geeignet: true }),
    A('a_v1', 'Firmenliste Förderberatung Region Süd', 'Vertrieb Herbst', 'In Arbeit', 1, 'agent-claude', { agent_geeignet: true, deadline: datum(5) }),
    A('a_v2', 'Angebot Müller GmbH prüfen', 'Vertrieb Herbst', 'Offen', 1, 'agent-claude', { agent_geeignet: true, deadline: datum(1) }),
    A('a_m1', 'n8n-Workflow Angebotsannahme bauen', 'Kundenprojekt Müller GmbH', 'In Arbeit', 1, 'agent-codex', { agent_geeignet: true, deadline: datum(7) }),
    A('a_m2', 'Architektur-Review Datenfluss Kunde', 'Kundenprojekt Müller GmbH', 'Offen', 2, 'agent-claude', { agent_geeignet: true }),
    A('a_m3', 'Kickoff-Termin', 'Kundenprojekt Müller GmbH', 'Erledigt', 2, 'm_timo', { erledigt_am: vor(12) }),
    A('a_f1', 'Wochenstand KW 42', 'Verwaltung & Finanzen', 'Erledigt', 3, 'agent-claude', { agent_geeignet: true, erledigt_am: vor(3) }),
    A('a_f2', 'Backup-Prüfung Oktober', 'Verwaltung & Finanzen', 'In Arbeit', 2, 'agent-hermes', { agent_geeignet: true }),
    A('a_f3', 'Rechnung Lohnbüro freigeben', 'Verwaltung & Finanzen', 'Offen', 2, 'm_timo', { deadline: datum(-1) }),
    A('a_g1', 'Vertrauliche Vorbereitung', 'Vertrauliches Projekt', 'Offen', 1, 'm_timo')
  ];
  const verlauf = [
    { id: 1, aufgabe_id: 'a_k1', autor: 'm_kurt', art: 'kommentar', text: 'Bitte die Beispiele aus Modul 1.1 aufgreifen.', erstellt: vor(5) },
    { id: 2, aufgabe_id: 'a_k4', autor: 'm_kurt', art: 'kommentar', text: 'Warte auf Rückmeldung vom Hoster.', erstellt: vor(2) },
    { id: 3, aufgabe_id: 'a_f1', autor: 'agent-claude', art: 'bericht', text: 'Wochenstand erstellt und als Notiz abgelegt.', erstellt: vor(3) }
  ];
  const notizen = [
    { notiz_id: 'n_1', titel: 'Agenten-Akte: Claude', inhalt: 'Rolle, Stärken, Regeln.', projekt: '', autor: 'm_timo', erstellt: vor(30), geaendert: vor(30) },
    { notiz_id: 'n_2', titel: 'Entscheidung: Tonalität Kurs', inhalt: 'Du-Form, kurze Sätze, keine Anglizismen ohne Erklärung. Entschieden am Kickoff.', projekt: 'Akademie-Kurs', autor: 'm_kurt', erstellt: vor(20), geaendert: vor(20) },
    { notiz_id: 'n_3', titel: 'Kundenprofil Müller GmbH', inhalt: 'Synthetisches Beispiel. 40 Mitarbeitende, Handwerk.', projekt: 'Kundenprojekt Müller GmbH', autor: 'm_timo', erstellt: vor(15), geaendert: vor(4) }
  ];
  const office_agenten = REG.agenten.map(a => ({ ...a, beschreibung: a.rolle, workflow_version: a.ausfuehrer === 'n8n' ? 'v1' : '', konfig_version: '1', aktiv: true, ausfuehrer_url: a.ausfuehrer === 'n8n' ? 'https://n8n.example.invalid/webhook/agent-' + a.agent_id : null, geaendert: vor(7), geaendert_von: 'm_timo' }));
  return { team_mitglieder: mitglieder, team_projekte: projekte, team_aufgaben: aufgaben, team_aufgaben_verlauf: verlauf, team_notizen: notizen, team_social: [], team_systeme: [], office_agenten, office_runs: [], office_ereignisse: [], office_artefakte: [], office_freigaben: [], office_idempotenz: [], office_run_schluessel: [] };
}

/**
 * Baut einen Speicher mit Testdaten. szenario: 'standard' (Runs in allen Zuständen) oder 'leer' (keine Runs, keine Freigaben).
 * Die virtuelle Uhr startet 3 Stunden vor „jetzt“ und wird beim Aufbau vorgestellt, damit alle Zustände inkl. Timeouts entstehen.
 */
export function testSpeicher({ szenario = 'standard', jetzt } = {}) {
  const start = new Date((jetzt ? new Date(jetzt).getTime() : Date.now()) - 56 * 60 * 1000).toISOString();
  const uhr = new Uhr(start);
  const sp = new Speicher({ tabellen: basisTabellen(uhr.iso()), uhr, zufall: zufallsQuelle(7), quelle: 'testadapter' });
  const ad = new TestAdapter({ speicher: sp, uhr, tokenVon: tokenVonAgent });
  if (szenario === 'leer') { uhr.vor(56 * 60); return { speicher: sp, adapter: ad, uhr }; }
  const mensch = (wer, aktion, daten) => sp.aufruf({ token: TOKENS[wer], aktion, daten });
  const start1 = (wer, agent, projekt, aufgabe_id, auftrag, key) => mensch(wer, 'auftrag_starten', { agent_id: agent, projekt, aufgabe_id, auftrag, idempotenzschluessel: 'testdaten-' + key }).antwort.run_id;
  const tick = sek => { uhr.vor(sek); ad.laufen(); };
  // 1) Abgeschlossen + fachlich abgenommen (Akademie)
  const r1 = start1('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'a_k1', 'Merkblatt Modul 1.2 als Entwurf schreiben', 'td-r1');
  for (let i = 0; i < 6; i++) tick(30);
  mensch('m_kurt', 'run_abnehmen', { run_id: r1, abgenommen: true, kommentar: 'Passt, zwei Tippfehler selbst korrigiert.' });
  // 2) Abgeschlossen, noch nicht abgenommen (Vertrieb)
  const r2 = start1('m_murat', 'vertrieb-recherche', 'Vertrieb Herbst', 'a_v1', 'Firmenliste Region Süd aus öffentlichen Quellen erstellen', 'td-r2');
  for (let i = 0; i < 6; i++) tick(30);
  // 3) Fehlgeschlagen (Kundenprojekt)
  const r3 = start1('m_timo', 'kunden-entwickler', 'Kundenprojekt Müller GmbH', 'a_m1', 'Workflow Angebotsannahme bauen, Zielsystem liefert Fehler', 'td-r3');
  for (let i = 0; i < 4; i++) tick(20);
  // 4) Wartet auf Rückmeldung (Marketing)
  const r4 = start1('m_lillien', 'marketing-texter', 'Webseite', 'a_w2', 'Landingpage-Text Fördercheck überarbeiten, Rückfrage zur Anrede klären', 'td-r4');
  for (let i = 0; i < 3; i++) tick(10);
  // 5) Wartet auf Freigabe (E-Mail an Kunden, Vertrieb)
  const r5 = start1('m_murat', 'angebots-pruefer', 'Vertrieb Herbst', 'a_v2', 'Angebot prüfen und Nachfragen per E-Mail an den Kunden schicken', 'td-r5');
  for (let i = 0; i < 2; i++) tick(10);
  // 6) Freigabe erteilt und Aktion ausgeführt (Social, Veröffentlichung)
  const r6 = start1('m_lillien', 'marketing-texter', 'Social Media', 'a_s1', 'LinkedIn-Beitrag KW 43 entwerfen und nach Freigabe veröffentlichen', 'td-r6');
  tick(10);
  const fr6 = sp.T.office_freigaben.find(f => f.run_id === r6);
  if (fr6) mensch('m_timo', 'freigabe_entscheiden', { freigabe_id: fr6.freigabe_id, entscheidung: 'erteilt', begruendung: 'Text geprüft.' });
  for (let i = 0; i < 3; i++) tick(10);
  // 7) In Arbeit (Hermes, Backup-Prüfung): langsamer Lauf, noch innerhalb des Timeouts
  const r7 = start1('m_timo', 'server-waechter', 'Verwaltung & Finanzen', 'a_f2', 'Backup-Prüfung Oktober, läuft langsam', 'td-r7');
  tick(10);
  // 8) Unbekannt/veraltet: nie übernommen → Wartung
  const r8 = start1('m_timo', 'verwaltung-status', 'Verwaltung & Finanzen', null, 'Wochenstand erstellen, Executor wird nie übernehmen', 'td-r8');
  // 9) Unbekannt + verspätete Rückmeldung
  const r9 = start1('m_kurt', 'kurs-waechter', 'Akademie-Kurs', null, 'Kursstatus prüfen, Ergebnis kommt verspätet', 'td-r9');
  tick(10);
  uhr.vor(40 * 60); mensch('m_timo', 'wartung', {}); ad.laufen();    // 40 Minuten später: r8 und r9 veraltet, r7 läuft noch? (timeout 600 s → auch veraltet)
  // 10) Abgebrochen
  const r10 = start1('m_lillien', 'social-planer', 'Social Media', 'a_s2', 'Redaktionsplan November vorbereiten', 'td-r10');
  tick(5);
  mensch('m_lillien', 'run_abbrechen', { run_id: r10, grund: 'Thema wird nächste Woche neu besprochen.' });
  // 11) Warteschlange (frisch)
  const r11 = start1('m_timo', 'architektur-review', 'Kundenprojekt Müller GmbH', 'a_m2', 'Datenfluss des Angebots-Workflows begutachten', 'td-r11');
  // 12) Frischer Lauf in Arbeit mit Ereignissen (für die Zeitleiste)
  const r12 = start1('m_kurt', 'akademie-redakteur', 'Akademie-Kurs', 'a_k2', 'Zehn Quizfragen für Modul 1.2 formulieren', 'td-r12');
  tick(10); tick(25);
  // Uhr auf „jetzt“ bringen (restliche Zeit), ohne weitere Wartung, damit r7/r12 je nach Dauer sichtbar bleiben
  const rest = Math.max(0, (jetzt ? new Date(jetzt).getTime() : Date.now()) - uhr.ms);
  uhr.vor(rest / 1000);
  return { speicher: sp, adapter: ad, uhr, runs: { r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12 } };
}
