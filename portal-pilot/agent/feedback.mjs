#!/usr/bin/env node
// Feedback-Werkzeug des Pilot-Portals: liest die Rückmeldungen der Tester und antwortet im Portal als Mitglied vom Typ „agent“.
// Nur Node (ab Version 18), keine Abhängigkeiten. Vorbild: agenten/team.py im Repo.
//
// Zugang (beides nur als Umgebungsvariable, nie in Dateien, wird nie ausgegeben):
//   PILOT_PORTAL_API    Adresse der Portal-API, also n8n_basis_url aus config/mandant.js plus „/portal-api“,
//                       z. B. https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api
//   PILOT_AGENT_TOKEN   Zugangscode des Agent-Mitglieds „Claude (KI)“ (Rolle agent) aus team_mitglieder
//
// Befehle:
//   feedback.mjs lesen [--tage 7] [--json]               neue Vorschläge, Rückfragen in Kommentaren, Störungsnotizen (Rollen statt Namen)
//   feedback.mjs antworten <vorschlag_id> --status geplant|abgelehnt|nachfrage --text "…"
//                                                       Vorschlag beantworten (Status und Antwort; „umgesetzt“ setzt nur die Leitung)
//   feedback.mjs kommentar <aufgabe_id> --text "…"       Kommentar an eine Aufgabe (im Portal als Bericht des Agenten sichtbar)
//   feedback.mjs aenderungen --text "…"                  Eintrag an die Notiz „Was sich geändert hat“ anhängen (Projekt aus der
//                                                       Einstellung firmenwissen_projekt, sonst „Pilot-Verbesserungen“; Notiz wird angelegt, falls sie fehlt)
//   Ohne --text liest das Werkzeug den Text von der Standardeingabe (z. B. aus einer Datei: < antwort.txt).
//
// Jede Antwort endet mit der Unterschrift „— Claude (KI-Werkzeug von Hermetikmarketing)“, damit die Tester wissen, wer schreibt.
// Was der Agent darf, prüft die Portal-API (Code-Knoten „Anfrage prüfen“): lesen, Vorschläge beantworten, kommentieren, Notizen
// schreiben; nichts löschen, nie „Erledigt“ oder „umgesetzt“ setzen, keine Mitglieder verwalten.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SIGNATUR = '— Claude (KI-Werkzeug von Hermetikmarketing)';
const STATUS_ERLAUBT = ['geplant', 'abgelehnt', 'nachfrage'];
const NOTIZ_TITEL = 'Was sich geändert hat';
const PROJEKT_STANDARD = 'Pilot-Verbesserungen';
const NOTIZ_KOPF = 'Hier steht, was aus den Rückmeldungen des Teams am Portal geändert wurde. Neueste Einträge unten, immer mit Datum.\n\n' +
  'Rückmeldungen (Vorschläge, Kommentare) werden vom KI-Werkzeug Claude gelesen und beantwortet; Änderungen am Portal rollt die Leitung nach Freigabe aus.';

const hilfeText = () => readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(z => z.startsWith('//')).map(z => z.replace(/^\/\/ ?/, '')).join('\n');

// --- Aufruf der Portal-API ------------------------------------------------------------------------------------------
function zugang() {
  const api = String(process.env.PILOT_PORTAL_API || '').trim();
  const token = String(process.env.PILOT_AGENT_TOKEN || '').trim();
  if (!/^https?:\/\/\S+\/portal-api$/.test(api)) throw new Error('PILOT_PORTAL_API fehlt oder endet nicht auf /portal-api (z. B. https://DEINE-INSTANZ.app.n8n.cloud/webhook/ifa/portal-api).');
  if (token.length < 20) throw new Error('PILOT_AGENT_TOKEN fehlt. Der Zugangscode des Agent-Mitglieds steht in team_mitglieder (Rolle agent) und gehört nur in die Umgebungsvariable.');
  return { api, token };
}

export async function api(aktion, daten) {
  const z = zugang();
  let r;
  try {
    r = await fetch(z.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': 'pilot-feedback/1' },
      body: JSON.stringify({ token: z.token, aktion, daten: daten || {} }), signal: AbortSignal.timeout(60000) });
  } catch (e) { throw new Error('Keine Verbindung zur Portal-API: ' + e.message); }
  let j = null; try { j = JSON.parse(await r.text() || '{}'); } catch (e) { j = null; }
  if (!j || j.ok !== true) {
    const e = new Error((j && j.fehler) ? String(j.fehler) : 'HTTP ' + r.status); e.status = r.status; e.antwort = j; throw e;
  }
  return j;
}

// --- Hilfen -------------------------------------------------------------------------------------------------------------
const mitSignatur = t => { const s = String(t || '').replace(/\r/g, '').trim(); return s.endsWith(SIGNATUR) ? s : s + '\n\n' + SIGNATUR; };
const datumDe = t => new Date(t || Date.now()).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const kurz = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const einzug = (t, n = 6) => String(t || '').replace(/\r/g, '').trim().split('\n').map(z => ' '.repeat(n) + z).join('\n');

function argumente(roh) {
  const a = { _: [], opt: {} };
  for (let i = 0; i < roh.length; i++) {
    const x = roh[i];
    if (x.startsWith('--')) {
      const k = x.slice(2);
      if (['json', 'help', 'hilfe'].includes(k)) { a.opt[k] = true; continue; }
      const v = roh[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error('Zu --' + k + ' fehlt ein Wert.');
      a.opt[k] = v; i++;
    } else a._.push(x);
  }
  return a;
}

async function textLesen(opt) {
  if (opt.text !== undefined && opt.text !== '-') return String(opt.text);
  if (process.stdin.isTTY) throw new Error('Bitte den Text mit --text "…" angeben oder über die Standardeingabe geben.');
  let s = ''; for await (const c of process.stdin) s += c;
  return s;
}

/** Rolle eines Mitglieds (admin, team, dozent, vertrieb, agent); nie der Name. */
const rolleVon = D => id => { const m = (D.mitglieder || []).find(x => x.mitglied_id === id); return m ? (m.typ === 'agent' ? 'agent' : (m.rolle || 'team')) : 'unbekannt'; };

/** Baut aus der Antwort von „laden“ die Sicht für „lesen“: neue Vorschläge, Vorschläge mit Rückfrage, Kommentare der letzten Tage, Störungsnotizen (14 Tage). */
export function rueckmeldungen(D, tage = 7, jetzt = Date.now()) {
  const rolle = rolleVon(D);
  const seit = new Date(jetzt - tage * 864e5).toISOString();
  const seit14 = new Date(jetzt - 14 * 864e5).toISOString();
  const V = (D.vorschlaege || []);
  const vorschlag = v => ({ id: v.vorschlag_id, titel: v.titel, text: v.text || '', bereich: v.bereich || 'Sonstiges', status: v.status, rolle: rolle(v.autor), stimmen: Number(v.stimmen_anzahl) || 0,
    antwort: v.antwort || '', antwort_von_rolle: v.antwort_von ? rolle(v.antwort_von) : '', erstellt: v.erstellt || '', geaendert: v.geaendert || '', aufgabe_id: v.aufgabe_id || '' });
  const aufgabe = id => (D.aufgaben || []).find(a => a.aufgabe_id === id) || {};
  const K = (D.verlauf || []).filter(k => k.art !== 'status' && String(k.erstellt || '') > seit && rolle(k.autor) !== 'agent')
    .map(k => { const a = aufgabe(k.aufgabe_id); return { aufgabe_id: k.aufgabe_id, titel: a.titel || k.aufgabe_id, projekt: a.projekt || '', aufgabe_status: a.status || '', rolle: rolle(k.autor), art: k.art, text: k.text || '', zeit: k.erstellt || '', rueckfrage: /\?/.test(String(k.text || '')) }; })
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
  const N = (D.notizen || []).filter(n => /^Störung\b/i.test(String(n.titel || '')) && String(n.geaendert || '') > seit14)
    .map(n => { const bl = String(n.inhalt || '').split(/\n(?=### )/); return { id: n.notiz_id, titel: n.titel, projekt: n.projekt || '', zeit: n.geaendert || '', meldungen: Math.max(0, bl.length - 1), letzte: bl[bl.length - 1] || '' }; })
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
  return {
    stand: new Date(jetzt).toISOString(), tage,
    neu: V.filter(v => v.status === 'neu').map(vorschlag).sort((a, b) => b.stimmen - a.stimmen || String(b.erstellt).localeCompare(String(a.erstellt))),
    nachfrage: V.filter(v => v.status === 'nachfrage').map(vorschlag),
    beantwortet: V.filter(v => !['neu', 'nachfrage'].includes(v.status) && String(v.geaendert || '') > seit).map(vorschlag),
    kommentare: K, rueckfragen: K.filter(k => k.rueckfrage).length, stoerungen: N
  };
}

export function lesenText(R) {
  const Z = [];
  Z.push('Rückmeldungen im Pilot-Portal, Stand ' + datumDe(R.stand) + ' (Vorschläge und Kommentare der letzten ' + R.tage + ' Tage, Störungen der letzten 14 Tage). Rollen statt Namen.');
  const vz = v => '  ' + v.id + '  [' + v.bereich + '] von ' + v.rolle + ' · ' + v.stimmen + ' Stimme' + (v.stimmen === 1 ? '' : 'n') + ' · ' + datumDe(v.erstellt || v.geaendert) + (v.status !== 'neu' ? ' · Status ' + v.status : '') + '\n' +
    '      ' + v.titel + (v.text ? '\n' + einzug(kurz(v.text, 600)) : '') + (v.antwort ? '\n      Antwort (' + (v.antwort_von_rolle || '–') + '): ' + kurz(v.antwort, 300) : '');
  Z.push('', 'NEUE VORSCHLÄGE (' + R.neu.length + ')', ...(R.neu.length ? R.neu.map(vz) : ['  keine']));
  Z.push('', 'VORSCHLÄGE MIT RÜCKFRAGE, warten auf den Verfasser (' + R.nachfrage.length + ')', ...(R.nachfrage.length ? R.nachfrage.map(vz) : ['  keine']));
  Z.push('', 'IN DEN LETZTEN ' + R.tage + ' TAGEN BEANTWORTET ODER GEÄNDERT (' + R.beantwortet.length + ')', ...(R.beantwortet.length ? R.beantwortet.map(vz) : ['  keine']));
  Z.push('', 'KOMMENTARE DER LETZTEN ' + R.tage + ' TAGE (' + R.kommentare.length + '), davon mit Fragezeichen: ' + R.rueckfragen);
  Z.push(...(R.kommentare.length ? R.kommentare.map(k => '  ' + (k.rueckfrage ? '? ' : '  ') + k.aufgabe_id + '  „' + kurz(k.titel, 80) + '“ (' + (k.projekt || '–') + ', ' + (k.aufgabe_status || '–') + ') · ' + k.rolle + ' · ' + datumDe(k.zeit) + '\n' + einzug(kurz(k.text, 500))) : ['  keine']));
  Z.push('', 'STÖRUNGSNOTIZEN (' + R.stoerungen.length + ')');
  Z.push(...(R.stoerungen.length ? R.stoerungen.map(n => '  ' + n.id + '  ' + n.titel + ' (' + (n.projekt || '–') + ') · ' + n.meldungen + ' Meldung' + (n.meldungen === 1 ? '' : 'en') + ' · ' + datumDe(n.zeit) + '\n' + einzug(kurz(n.letzte, 800))) : ['  keine']));
  Z.push('', 'Antworten: feedback.mjs antworten <vorschlag_id> --status geplant|abgelehnt|nachfrage --text "…"  ·  kommentar <aufgabe_id> --text "…"  ·  aenderungen --text "…"');
  return Z.join('\n');
}

// --- Befehle ----------------------------------------------------------------------------------------------------------------
export async function befehlLesen(opt) {
  const tage = opt.tage === undefined ? 7 : Number(opt.tage);
  if (!(tage >= 1 && tage <= 90)) throw new Error('--tage muss zwischen 1 und 90 liegen.');
  const D = await api('laden');
  if (D.ich && D.ich.rolle !== 'agent') throw new Error('Dieser Zugangscode gehört keinem Agent-Mitglied (Rolle ' + D.ich.rolle + '). Das Werkzeug schreibt nur als Agent.');
  const R = rueckmeldungen(D, tage);
  return opt.json ? JSON.stringify(R, null, 2) : lesenText(R);
}

export async function befehlAntworten(id, opt) {
  if (!/^[\w-]{2,80}$/.test(String(id || ''))) throw new Error('Bitte die ID des Vorschlags angeben (aus „lesen“).');
  const status = String(opt.status || '');
  if (!STATUS_ERLAUBT.includes(status)) throw new Error('--status muss ' + STATUS_ERLAUBT.join(', ') + ' sein („umgesetzt“ setzt die Leitung im Portal).');
  const text = (await textLesen(opt)).trim();
  if (text.length < 2) throw new Error('Bitte eine Antwort schreiben (bei „abgelehnt“ mit Grund, bei „geplant“ mit Termin, bei „nachfrage“ mit der Frage).');
  const r = await api('vorschlag_speichern', { vorschlag_id: id, status, antwort: mitSignatur(text) });
  return 'OK: Vorschlag ' + r.id + ' → Status „' + status + '“, Antwort gespeichert (mit Unterschrift).';
}

export async function befehlKommentar(id, opt) {
  if (!/^[\w-]{2,80}$/.test(String(id || ''))) throw new Error('Bitte die ID der Aufgabe angeben (aus „lesen“).');
  const text = (await textLesen(opt)).trim();
  if (text.length < 2) throw new Error('Bitte einen Kommentar schreiben.');
  const r = await api('kommentar', { aufgabe_id: id, text: mitSignatur(text) });
  return 'OK: Kommentar an Aufgabe ' + r.id + ' gespeichert (im Portal als Bericht des Agenten, mit Unterschrift).';
}

export async function befehlAenderungen(opt) {
  const text = (await textLesen(opt)).trim();
  if (text.length < 2) throw new Error('Bitte schreiben, was sich geändert hat.');
  const D = await api('laden');
  const projName = (D.einstellungen && typeof D.einstellungen.firmenwissen_projekt === 'string' && D.einstellungen.firmenwissen_projekt.trim()) ? D.einstellungen.firmenwissen_projekt.trim() : PROJEKT_STANDARD;
  const gleich = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const meldungen = [];
  if (!(D.projekte || []).some(p => gleich(p.name, projName))) {
    await api('projekt_speichern', { name: projName, beschreibung: 'Rückmeldungen der Tester und was daraus am Portal geändert wurde (Notiz „' + NOTIZ_TITEL + '“).', status: 'aktiv', farbe: '#1FA9B0' });
    meldungen.push('Projekt „' + projName + '“ angelegt.');
  }
  const block = '## ' + datumDe() + '\n' + mitSignatur(text);
  const alt = (D.notizen || []).find(n => gleich(n.titel, NOTIZ_TITEL));
  let r;
  if (alt) {
    r = await api('notiz_speichern', { notiz_id: alt.notiz_id, titel: alt.titel, inhalt: String(alt.inhalt || '').replace(/\s+$/, '') + '\n\n' + block, projekt: alt.projekt || projName, stand: alt.geaendert });
    meldungen.push('Eintrag an die Notiz „' + alt.titel + '“ angehängt (' + r.id + ').');
  } else {
    r = await api('notiz_speichern', { titel: NOTIZ_TITEL, inhalt: NOTIZ_KOPF + '\n\n' + block, projekt: projName });
    meldungen.push('Notiz „' + NOTIZ_TITEL + '“ im Projekt „' + projName + '“ angelegt (' + r.id + ').');
  }
  return 'OK: ' + meldungen.join(' ');
}

export async function main(roh) {
  const a = argumente(roh);
  const b = a._[0];
  if (!b || a.opt.help || a.opt.hilfe) { console.log(hilfeText()); return b ? 0 : 1; }
  let aus;
  if (b === 'lesen') aus = await befehlLesen(a.opt);
  else if (b === 'antworten') aus = await befehlAntworten(a._[1], a.opt);
  else if (b === 'kommentar') aus = await befehlKommentar(a._[1], a.opt);
  else if (b === 'aenderungen') aus = await befehlAenderungen(a.opt);
  else throw new Error('Unbekannter Befehl: ' + b + '. Befehle: lesen, antworten, kommentar, aenderungen.');
  console.log(aus);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => {
    // Konflikt beim Anhängen (409): die Notiz wurde inzwischen geändert; einfach noch einmal ausführen (neu laden, neu anhängen)
    console.error('Fehler: ' + e.message + (e.status === 409 ? ' Bitte den Befehl noch einmal ausführen.' : ''));
    process.exit(1);
  });
}
