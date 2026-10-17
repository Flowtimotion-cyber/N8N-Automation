// GENERIERT von office/n8n/bauen.mjs aus office/lib/*.js – nicht von Hand ändern.
// ===== office/lib/hash.js =====
// KI Office: SHA-256 und HMAC in reinem JavaScript.
// Warum nicht node:crypto? Derselbe Code läuft im n8n-Code-Knoten (dort ist require nicht überall erlaubt),
// im Browser (synchron, ohne Promise) und in Node. Die Tests vergleichen das Ergebnis mit node:crypto.

const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

function utf8Bytes(s) {
  const str = String(s), out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function sha256Bytes(bytes) {
  const l = bytes.length, bitLen = l * 8;
  const padded = bytes.slice(); padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  for (let i = 7; i >= 0; i--) padded.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = [];
  for (const x of h) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255);
  return out;
}

const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 eines Textes (UTF-8) als Hex. */
function sha256(text) { return hex(sha256Bytes(utf8Bytes(text))); }

/** HMAC-SHA256(schluessel, nachricht) als Hex. */
function hmacSha256(schluessel, nachricht) {
  let k = utf8Bytes(schluessel);
  if (k.length > 64) k = sha256Bytes(k);
  while (k.length < 64) k.push(0);
  const ipad = k.map(b => b ^ 0x36), opad = k.map(b => b ^ 0x5c);
  return hex(sha256Bytes(opad.concat(sha256Bytes(ipad.concat(utf8Bytes(nachricht))))));
}

/** Kanonisches JSON: Schlüssel sortiert, damit derselbe Inhalt immer denselben Hash ergibt. */
function kanonisch(wert) {
  if (wert === null || typeof wert !== 'object') return JSON.stringify(wert === undefined ? null : wert);
  if (Array.isArray(wert)) return '[' + wert.map(kanonisch).join(',') + ']';
  return '{' + Object.keys(wert).sort().map(k => JSON.stringify(k) + ':' + kanonisch(wert[k])).join(',') + '}';
}

/** Inhalts-Hash für Freigaben: bindet eine Freigabe an exakt diesen Inhalt. */
function inhaltsHash(aktion, inhalt) { return sha256(kanonisch({ aktion: String(aktion || ''), inhalt: inhalt === undefined ? null : inhalt })); }

/** Vergleich in konstanter Zeit (gegen Timing-Angriffe bei Signaturen). */
function gleich(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ===== office/lib/zustand.js =====
// KI Office: Zustandsmaschine für Agentenläufe (Runs).
// Diese Tabelle ist die einzige Quelle der Wahrheit. Sie steht wortgleich in docs/office/ARCHITEKTUR.md.
// „Technisch erfolgreich“ (status = abgeschlossen) ist strikt getrennt von „fachlich abgenommen“ (run.abgenommen = true, nur Menschen).

const STATUS = {
  WARTESCHLANGE: 'warteschlange',
  IN_ARBEIT: 'in_arbeit',
  WARTET_RUECKMELDUNG: 'wartet_rueckmeldung',
  WARTET_FREIGABE: 'wartet_freigabe',
  ABGESCHLOSSEN: 'abgeschlossen',
  FEHLGESCHLAGEN: 'fehlgeschlagen',
  ABGEBROCHEN: 'abgebrochen',
  UNBEKANNT: 'unbekannt'
};
const ALLE_STATUS = Object.values(STATUS);

const STATUS_TEXT = {
  warteschlange: 'Warteschlange',
  in_arbeit: 'in Arbeit',
  wartet_rueckmeldung: 'wartet auf Rückmeldung',
  wartet_freigabe: 'wartet auf Freigabe',
  abgeschlossen: 'abgeschlossen (technisch)',
  fehlgeschlagen: 'fehlgeschlagen',
  abgebrochen: 'abgebrochen',
  unbekannt: 'unbekannt / veraltet'
};

const ENDZUSTAENDE = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'unbekannt'];
const istEndzustand = s => ENDZUSTAENDE.includes(s);

// Zulässige Übergänge: von → nach, durch wen (agent = ausführender Agent/Executor, mensch = Teammitglied, system = Wartung/Timeout), Anlass.
const UEBERGAENGE = [
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
  { von: 'wartet_freigabe', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch bricht ab' },
  { von: 'wartet_freigabe', nach: 'fehlgeschlagen', wer: ['agent', 'system'], anlass: 'Executor meldet Fehler' },
  { von: 'wartet_freigabe', nach: 'unbekannt', wer: ['system'], anlass: 'Wartefrist für Menschen überschritten' },
  { von: 'fehlgeschlagen', nach: 'warteschlange', wer: ['mensch', 'system'], anlass: 'Wiederholung, nur solange versuche < max_versuche' },
  { von: 'unbekannt', nach: 'abgebrochen', wer: ['mensch'], anlass: 'Mensch schließt den veralteten Run ab (Aufräumen); nie nachträglich „abgeschlossen“' }
];

function darfWechseln(von, nach, wer) {
  return UEBERGAENGE.some(u => u.von === von && u.nach === nach && (!wer || u.wer.includes(wer)));
}

function uebergangsTabelleMarkdown() {
  const z = ['| Von | Nach | Wer | Anlass |', '|---|---|---|---|'];
  for (const u of UEBERGAENGE) z.push('| ' + STATUS_TEXT[u.von] + ' | ' + STATUS_TEXT[u.nach] + ' | ' + u.wer.join(', ') + ' | ' + u.anlass + ' |');
  return z.join('\n');
}

// Standardfristen (Sekunden). Können je Run überschrieben werden (timeout_sek) und je Agent in der Registry.
const FRISTEN = {
  wartezeit_warteschlange: 30 * 60,        // bis ein Executor übernehmen muss
  timeout_sek: 15 * 60,                    // ohne Lebenszeichen in „in Arbeit“
  wartefrist_mensch: 7 * 24 * 3600,        // Rückfragen und Freigaben warten auf Menschen
  freigabe_gueltig: 24 * 3600,             // erteilte Freigabe verfällt, wenn sie nicht genutzt wird
  max_versuche: 3
};

/**
 * Prüft einen Run gegen die Fristen. Liefert null (nichts zu tun) oder { nach: 'unbekannt', grund }.
 * jetztMs: Zeitpunkt der Prüfung. Läuft bei jeder Wartung (Zeitplan) und damit auch nach einem Neustart.
 */
function fristPruefen(run, jetztMs) {
  const t = s => s ? new Date(s).getTime() : NaN;
  const alter = s => (jetztMs - t(s)) / 1000;
  const timeout = Number(run.timeout_sek) || FRISTEN.timeout_sek;
  if (run.status === 'warteschlange') {
    const a = alter(run.erstellt);
    if (a > FRISTEN.wartezeit_warteschlange) return { nach: 'unbekannt', grund: 'Kein Executor hat den Auftrag innerhalb von ' + Math.round(FRISTEN.wartezeit_warteschlange / 60) + ' Minuten übernommen.' };
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

// ===== office/lib/freigabe.js =====
// KI Office: Freigaben für externe Aktionen.
// Eine Freigabe gilt nur für genau eine Aktion mit genau einem Inhalt (Hash). Ändert sich der Inhalt, braucht es eine neue Freigabe.

// Aktionen, die ohne erteilte Freigabe nie ausgeführt werden. Wer sie erteilen darf, steht in rechte.js.
const EXTERNE_AKTIONEN = {
  email_senden: { text: 'E-Mail senden', stufe: 'extern' },
  nachricht_senden: { text: 'Nachricht senden (WhatsApp, Chat)', stufe: 'extern' },
  post_veroeffentlichen: { text: 'Beitrag veröffentlichen', stufe: 'extern' },
  zahlung_ausloesen: { text: 'Zahlung auslösen', stufe: 'kritisch' },
  daten_loeschen: { text: 'Daten löschen', stufe: 'kritisch' },
  vertrag_senden: { text: 'Vertrag oder Angebot versenden', stufe: 'kritisch' },
  kalender_aendern: { text: 'Termin anlegen oder ändern', stufe: 'extern' }
};
const FREIGABE_STATUS = ['offen', 'erteilt', 'abgelehnt', 'verfallen', 'ungueltig', 'verwendet'];

const brauchtFreigabe = aktion => Object.prototype.hasOwnProperty.call(EXTERNE_AKTIONEN, String(aktion || ''));

/** Baut den Datensatz für eine neue Freigabe-Anfrage. */
function freigabeAnfordern({ freigabe_id, run_id, aktion, inhalt, vorschau, jetzt, angefordert_von }) {
  const hash = inhaltsHash(aktion, inhalt);
  return {
    freigabe_id, run_id, aktion: String(aktion), inhalt_hash: hash,
    inhalt_vorschau: String(vorschau || kurzVorschau(inhalt)).slice(0, 600),
    status: 'offen', angefordert_am: jetzt, angefordert_von: angefordert_von || null,
    entschieden_von: null, entschieden_am: null, begruendung: null,
    gueltig_bis: null, verwendet_am: null
  };
}

function kurzVorschau(inhalt) {
  if (inhalt == null) return '';
  if (typeof inhalt === 'string') return inhalt;
  try { return Object.entries(inhalt).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))).join(' · '); } catch (e) { return String(inhalt); }
}

/**
 * Prüft, ob eine Freigabe für genau diese Aktion und diesen Inhalt gültig ist.
 * Liefert { ok: true } oder { ok: false, grund, neu_noetig }.
 */
function freigabeGueltig(freigabe, aktion, inhalt, jetztMs) {
  if (!freigabe) return { ok: false, grund: 'Keine Freigabe vorhanden.', neu_noetig: true };
  if (freigabe.aktion !== String(aktion)) return { ok: false, grund: 'Die Freigabe gilt für eine andere Aktion (' + freigabe.aktion + ').', neu_noetig: true };
  const hash = inhaltsHash(aktion, inhalt);
  if (!gleich(freigabe.inhalt_hash, hash)) return { ok: false, grund: 'Der Inhalt wurde nach der Freigabe geändert. Es ist eine neue Freigabe nötig.', neu_noetig: true, inhalt_geaendert: true };
  if (freigabe.status === 'verwendet') return { ok: false, grund: 'Diese Freigabe wurde schon verwendet. Jede Freigabe gilt für genau eine Ausführung.', neu_noetig: true };
  if (freigabe.status !== 'erteilt') return { ok: false, grund: 'Die Freigabe ist ' + freigabe.status + ', nicht erteilt.', neu_noetig: freigabe.status !== 'offen' };
  if (freigabe.gueltig_bis && new Date(freigabe.gueltig_bis).getTime() < jetztMs) return { ok: false, grund: 'Die Freigabe ist abgelaufen.', neu_noetig: true };
  return { ok: true };
}

/** Felder für die Entscheidung eines Menschen. */
function freigabeEntscheiden(freigabe, entscheidung, von, begruendung, jetzt) {
  if (freigabe.status !== 'offen') return { fehler: 'Diese Freigabe ist nicht mehr offen (' + freigabe.status + ').' };
  if (!['erteilt', 'abgelehnt'].includes(entscheidung)) return { fehler: 'Entscheidung muss „erteilt“ oder „abgelehnt“ sein.' };
  const gueltig_bis = entscheidung === 'erteilt' ? new Date(new Date(jetzt).getTime() + FRISTEN.freigabe_gueltig * 1000).toISOString() : null;
  return { row: { status: entscheidung, entschieden_von: von, entschieden_am: jetzt, begruendung: String(begruendung || '').slice(0, 600), gueltig_bis } };
}

// ===== office/lib/rechte.js =====
// KI Office: Rechteprüfung. Läuft serverseitig im n8n-Code-Knoten (und im Testserver), nicht nur im Browser.
// Rollen aus team_mitglieder.rolle: admin | dozent | vertrieb | team | agent.

const ROLLEN_MENSCH = ['admin', 'dozent', 'vertrieb', 'team'];
const istAgent = ich => !!ich && (ich.rolle === 'agent' || ich.typ === 'agent');
const istAdmin = ich => !!ich && ich.rolle === 'admin';
const istDozent = ich => !!ich && (ich.rolle === 'admin' || ich.rolle === 'dozent');
const istMensch = ich => !!ich && !istAgent(ich);

// Was Agenten über die Office-API dürfen. Alles andere (Freigaben erteilen, Abnehmen, Abbrechen fremder Runs, Löschen, Registry) ist Menschen vorbehalten.
const AGENT_DARF = ['laden', 'auftrag_starten', 'lebenszeichen', 'ereignis', 'artefakt', 'rueckfrage', 'freigabe_anfordern', 'aktion_ausfuehren', 'run_beenden'];
// Was nur Admin darf.
const NUR_ADMIN = ['agent_speichern', 'loeschen', 'wartung'];
// Aktionen ohne Token (Signatur statt Token): nur die Rückmeldung des Executors.
const OHNE_TOKEN = ['rueckmeldung'];

/**
 * Projekte, die jemand sehen darf.
 * Menschen: alle Projekte (wie im Portal), außer das Mitglied hat eine Projektliste (Feld projekte, z. B. künftige Kundenzugänge).
 * Agenten: nur Projekte aus ihrer Registry-Zuordnung (office_agenten.projekte). Leer = keins.
 * Liefert null für „alle“.
 */
function sichtbareProjekte(ich, agenten) {
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

function darfProjekt(ich, projekt, agenten) {
  const s = sichtbareProjekte(ich, agenten);
  if (s === null) return true;
  return !!projekt && s.includes(projekt);
}

/** Führt dieses Teammitglied (Typ agent) den Registry-Agenten agent_id aus? */
function fuehrtAus(ich, agentId, agenten) {
  return !!ich && (agenten || []).some(a => a.agent_id === agentId && (a.mitglied_id === ich.mitglied_id || a.agent_id === ich.mitglied_id));
}

/** Darf diese Person den Run sehen? Auftraggeber und der ausführende Agent sehen ihren Run immer. */
function darfRunSehen(ich, run, agenten) {
  if (!ich || !run) return false;
  if (run.auftraggeber === ich.mitglied_id) return true;
  if (istAgent(ich) && fuehrtAus(ich, run.agent_id, agenten)) return true;
  return darfProjekt(ich, run.projekt, agenten);
}

/** Darf diese Person den Run verändern (abbrechen, wiederholen, antworten)? */
function darfRunSteuern(ich, run, agenten) {
  if (!istMensch(ich)) return false;
  if (istDozent(ich)) return darfRunSehen(ich, run, agenten);
  return run.auftraggeber === ich.mitglied_id && darfProjekt(ich, run.projekt, agenten);
}

/** Darf diese Person eine Freigabe erteilen? Agenten nie. Kritische Aktionen nur Admin. */
function darfFreigeben(ich, freigabe, run, stufe, agenten) {
  if (!istMensch(ich)) return { ok: false, grund: 'Freigaben erteilen nur Menschen.' };
  if (!darfProjekt(ich, run && run.projekt, agenten)) return { ok: false, grund: 'Dieses Projekt siehst du nicht.' };
  if (stufe === 'kritisch' && !istAdmin(ich)) return { ok: false, grund: 'Zahlungen, Löschungen und Verträge gibt nur Timo (Admin) frei.' };
  if (freigabe && freigabe.angefordert_von === ich.mitglied_id && !istAdmin(ich)) return { ok: false, grund: 'Wer die Freigabe anfordert, darf sie nicht selbst erteilen (Vier-Augen-Prinzip).' };
  return { ok: true };
}

/** Ist diese Aktion für diese Rolle überhaupt erlaubt? */
function darfAktion(ich, aktion) {
  if (!ich) return { ok: false, code: 401, grund: 'Dein Zugang ist ungültig.' };
  if (ich.status === 'gesperrt') return { ok: false, code: 401, grund: 'Dein Zugang ist gesperrt.' };
  if (istAgent(ich) && !AGENT_DARF.includes(aktion)) return { ok: false, code: 403, grund: 'Das dürfen Agenten nicht. Erlaubt: ' + AGENT_DARF.join(', ') + '.' };
  if (NUR_ADMIN.includes(aktion) && !istAdmin(ich)) return { ok: false, code: 403, grund: 'Das darf nur Timo (Admin).' };
  return { ok: true };
}

/** Darf dieser Agent (Registry-Eintrag) dieses Werkzeug benutzen? */
function darfTool(agentReg, tool) {
  if (!agentReg) return false;
  const erlaubt = Array.isArray(agentReg.erlaubte_tools) ? agentReg.erlaubte_tools : [];
  return erlaubt.includes(String(tool));
}

// ===== office/lib/signatur.js =====
// KI Office: Signatur für den Rückmelde-Webhook (Executor → Office-API).
// Schutz gegen manipulierte Webhooks und Replay: HMAC über Zeitstempel, Nonce und Inhalts-Hash, Zeitfenster 5 Minuten, Nonce nur einmal.

const ZEITFENSTER_SEK = 300;

function nachrichtFuerSignatur(zeit, nonce, ergebnis) {
  return String(zeit) + '.' + String(nonce) + '.' + sha256(kanonisch(ergebnis === undefined ? null : ergebnis));
}

/** Erzeugt die Signatur. Der Executor ruft das mit dem run-spezifischen Rückmelde-Schlüssel auf. */
function signiere(schluessel, zeit, nonce, ergebnis) {
  return hmacSha256(schluessel, nachrichtFuerSignatur(zeit, nonce, ergebnis));
}

/**
 * Prüft eine Rückmeldung. nonceGesehen(nonce) → true, wenn die Nonce schon verwendet wurde.
 * Liefert { ok: true } oder { ok: false, grund }.
 */
function pruefeSignatur({ schluessel, zeit, nonce, ergebnis, signatur }, jetztMs, nonceGesehen) {
  if (!schluessel) return { ok: false, grund: 'Für diesen Run gibt es keinen Rückmelde-Schlüssel.' };
  const z = new Date(zeit || '').getTime();
  if (!isFinite(z)) return { ok: false, grund: 'Zeitstempel fehlt oder ist ungültig.' };
  if (Math.abs(jetztMs - z) > ZEITFENSTER_SEK * 1000) return { ok: false, grund: 'Zeitstempel außerhalb des Zeitfensters von ' + ZEITFENSTER_SEK + ' Sekunden.' };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(nonce || ''))) return { ok: false, grund: 'Nonce fehlt oder hat ein falsches Format (16 bis 64 Zeichen).' };
  if (nonceGesehen && nonceGesehen(String(nonce))) return { ok: false, grund: 'Diese Nonce wurde schon verwendet (Replay).' };
  const soll = signiere(schluessel, zeit, nonce, ergebnis);
  if (!gleich(soll, String(signatur || '').toLowerCase())) return { ok: false, grund: 'Signatur stimmt nicht.' };
  return { ok: true };
}

// ===== office/lib/idempotenz.js =====
// KI Office: Idempotenzschlüssel. Ein Auftrag oder eine Ausführung mit demselben Schlüssel wird nicht doppelt ausgeführt,
// sondern liefert die gespeicherte Antwort zurück. Zusätzlich sichert die Datenbank das mit einem Unique-Index ab.

const SCHLUESSEL_MUSTER = /^[A-Za-z0-9_.:-]{8,120}$/;

function schluesselGueltig(s) { return SCHLUESSEL_MUSTER.test(String(s || '')); }

/** Sucht eine frühere Antwort zu diesem Schlüssel (gleiche Art). */
function frueherGesehen(eintraege, art, schluessel) {
  return (eintraege || []).find(e => e && e.art === art && e.schluessel === schluessel) || null;
}

/** Baut den Datensatz, der die Antwort zum Schlüssel festhält. */
function merken({ art, schluessel, run_id, antwort, jetzt }) {
  return { schluessel, art, run_id: run_id || null, antwort: antwort || {}, erstellt: jetzt };
}

// ===== office/lib/postgrest.js =====
// KI Office: Schreibaufträge im PostgREST-Format (wie in der Portal-API v2) und ein kleiner In-Memory-Anwender für den Testserver.
// Ein Auftrag: { methode: 'POST'|'PATCH'|'DELETE', pfad: 'tabelle?spalte=eq.wert', body }

const enc = v => encodeURIComponent(String(v));
const neu = (tab, row) => ({ methode: 'POST', pfad: tab, body: row });
const aend = (tab, pk, id, row) => ({ methode: 'PATCH', pfad: tab + '?' + pk + '=eq.' + enc(id), body: row });
const weg = (tab, pk, id) => ({ methode: 'DELETE', pfad: tab + '?' + pk + '=eq.' + enc(id), body: {} });
const wegViele = (tab, pk, ids) => ({ methode: 'DELETE', pfad: tab + '?' + pk + '=in.(' + ids.map(enc).join(',') + ')', body: {} });

// Eindeutigkeiten, die in Supabase als Unique-Index existieren (supabase/team_office.sql). Der Testserver erzwingt sie genauso.
const UNIQUE = {
  office_runs: [['run_id'], ['idempotenzschluessel'], ['n8n_execution_id']],
  office_ereignisse: [['id'], ['idempotenz']],
  office_artefakte: [['artefakt_id']],
  office_freigaben: [['freigabe_id'], ['run_id', 'aktion', 'inhalt_hash']],
  office_idempotenz: [['schluessel']],
  office_agenten: [['agent_id']],
  office_run_schluessel: [['run_id']]
};

function filterAus(pfad) {
  const [tab, q] = String(pfad).split('?');
  const bed = [];
  if (q) for (const teil of q.split('&')) {
    const i = teil.indexOf('='); const sp = teil.slice(0, i), ausdruck = decodeURIComponent(teil.slice(i + 1));
    if (ausdruck.startsWith('eq.')) bed.push(r => String(r[sp]) === ausdruck.slice(3));
    else if (ausdruck.startsWith('in.(')) { const werte = ausdruck.slice(4, -1).split(',').map(s => decodeURIComponent(s)); bed.push(r => werte.includes(String(r[sp]))); }
    else if (ausdruck.startsWith('lt.')) bed.push(r => String(r[sp]) < ausdruck.slice(3));
    else throw new Error('Filter nicht unterstützt: ' + teil);
  }
  return { tab, passt: r => bed.every(f => f(r)) };
}

/**
 * Wendet einen Schreibauftrag auf In-Memory-Tabellen an (TESTADAPTER). Liefert { statusCode, body }.
 * Simuliert 409 bei Verletzung einer Eindeutigkeit, wie PostgREST.
 */
function wendeAn(tabellen, op, naechsteId) {
  const { tab, passt } = filterAus(op.pfad);
  if (!tabellen[tab]) tabellen[tab] = [];
  const T = tabellen[tab];
  if (op.methode === 'POST') {
    const row = { ...op.body };
    if ((tab === 'office_ereignisse' || tab === 'team_aufgaben_verlauf') && row.id == null) row.id = naechsteId ? naechsteId() : T.length + 1;
    for (const spalten of UNIQUE[tab] || []) {
      if (spalten.some(s => row[s] == null)) continue;
      if (T.some(r => spalten.every(s => String(r[s]) === String(row[s])))) return { statusCode: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint (' + spalten.join(',') + ')' } };
    }
    T.push(row); return { statusCode: 201, body: {} };
  }
  if (op.methode === 'PATCH') { for (const r of T) if (passt(r)) Object.assign(r, op.body); return { statusCode: 204, body: {} }; }
  if (op.methode === 'DELETE') { tabellen[tab] = T.filter(r => !passt(r)); return { statusCode: 204, body: {} }; }
  return { statusCode: 405, body: { message: 'Methode ' + op.methode } };
}

// ===== office/lib/verarbeitung.js =====
// KI Office: Verarbeitung einer Anfrage an die Office-API.
// Läuft identisch im n8n-Code-Knoten „Anfrage prüfen“ (TEAM: Office-API), im lokalen Testserver und in den Tests.
// Eingabe: { body, D, jetzt, zufall, quelle }  Ausgabe: { weiter: 0|1|2, code, antwort, ops, extern, ich }
//   weiter 0 = Fehler sofort melden, 1 = nur antworten (nichts schreiben), 2 = Schreibaufträge (ops) ausführen, dann antworten.
// Keine Gedankengänge, keine Prompts, keine Zugangsdaten werden gespeichert: Freitext wird gekürzt und von Schlüsselmustern bereinigt.

const RAEUME = ['Akademie', 'Marketing', 'Vertrieb', 'Kundenprojekte', 'Verwaltung'];
const MODELLE = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5-mini'];
const AUSFUEHRER = ['n8n', 'claude-code', 'codex', 'hermes'];
const EREIGNIS_ARTEN = ['schritt', 'tool', 'quelle', 'fehler', 'wiederholung', 'hinweis', 'status', 'rueckfrage', 'antwort', 'freigabe', 'artefakt', 'abnahme', 'entscheidung'];
const ARTEFAKT_ARTEN = ['text', 'datei', 'link', 'commit', 'notiz', 'bericht'];
const RUN_MARKER = id => '[run:' + id + ']';

const GEHEIMNIS_MUSTER = [/sk-[A-Za-z0-9_-]{16,}/g, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]{10,})?/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /\b[a-f0-9]{32,64}\b/g, /(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, /(passwor[dt]|kennwort|api[_-]?key|secret)\s*[:=]\s*\S+/gi];
/** Entfernt Zugangsdaten-Muster aus Freitext (Datensparsamkeit, Log-Hygiene). */
function bereinige(text) {
  let s = String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '');
  for (const m of GEHEIMNIS_MUSTER) s = s.replace(m, (ganz, p1) => (p1 && /bearer/i.test(ganz) ? p1 : '') + '[entfernt]');
  return s;
}
const txt = (v, n) => bereinige(v).trim().slice(0, n);
const klein = (obj, maxZeichen) => {
  // Objekt datensparsam: nur einfache Werte, Strings bereinigt, insgesamt begrenzt
  const o = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (v == null) continue;
    o[String(k).slice(0, 60)] = typeof v === 'string' ? txt(v, 1000) : (typeof v === 'number' || typeof v === 'boolean') ? v : txt(JSON.stringify(v), 1000);
  }
  let s = JSON.stringify(o);
  if (s.length > maxZeichen) return { gekuerzt: true, text: s.slice(0, maxZeichen) };
  return o;
};
const istUrl = s => /^https?:\/\/[^\s]+$/i.test(String(s || ''));

function verarbeiten(ctx) {
  const b = ctx.body || {};
  const D = ctx.D || {};
  const jetzt = ctx.jetzt || new Date().toISOString();
  const jetztMs = new Date(jetzt).getTime();
  const zufall = ctx.zufall || (n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; });
  const neueId = p => p + '_' + jetztMs.toString(36) + zufall(6);
  const quelle = ctx.quelle || 'n8n';

  const mitglieder = (D.mitglieder || []).filter(m => m && m.mitglied_id);
  const projekte = (D.projekte || []).filter(p => p && p.projekt_id);
  const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id);
  const agenten = (D.office_agenten || []).filter(a => a && a.agent_id);
  const runs = (D.office_runs || []).filter(r => r && r.run_id);
  const ereignisse = (D.office_ereignisse || []).filter(e => e && e.run_id);
  const artefakte = (D.office_artefakte || []).filter(a => a && a.artefakt_id);
  const freigaben = (D.office_freigaben || []).filter(f => f && f.freigabe_id);
  const idem = (D.office_idempotenz || []).filter(i => i && i.schluessel);
  const schluesselListe = (D.office_run_schluessel || []).filter(s => s && s.run_id);

  const raus = (code, fehler, extra) => ({ weiter: 0, code, antwort: Object.assign({ ok: false, fehler }, extra || {}) });
  const aktion = String(b.aktion || '');
  const d = (b.daten && typeof b.daten === 'object') ? b.daten : {};

  // ---- Wer fragt? ----
  let ich = null;
  const tok = String(b.token || '');
  if (b.intern === true && aktion === 'wartung' && !b.token) ich = { mitglied_id: 'system', name: 'Wartung', rolle: 'admin', typ: 'system', status: 'aktiv' };
  else if (OHNE_TOKEN.includes(aktion)) ich = null;
  else {
    if (tok.length < 20 || tok.length > 64) return raus(401, 'Dein Zugang ist ungültig. Bitte öffne das Portal über deinen persönlichen Link.');
    ich = mitglieder.find(m => m.token === tok) || null;
    if (!ich || ich.status === 'gesperrt') return raus(401, 'Dein Zugang ist ungültig. Bitte frag Timo nach einem neuen Link.');
    if (ich.status !== 'aktiv') return raus(403, 'Bitte richte zuerst dein Profil im Team-Portal ein.');
  }
  const ichKurz = ich ? { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, typ: ich.typ || (ich.rolle === 'agent' ? 'agent' : 'mensch'), funktion: ich.funktion || '' } : null;
  if (ich) { const r = darfAktion(ich, aktion); if (!r.ok) return raus(r.code, r.grund); }

  const agentVon = run => agenten.find(a => a.agent_id === run.agent_id) || null;
  const runVon = id => runs.find(r => r.run_id === String(id || '')) || null;
  const ereignis = (run_id, art, titel, details, extra) => neu('office_ereignisse', Object.assign({ run_id, zeit: jetzt, art, titel: txt(titel, 200), details: details == null ? null : klein(details, 2000), autor: ich ? ich.mitglied_id : 'system', sequenz: ereignisse.filter(e => e.run_id === run_id).length + 1 }, extra || {}));
  const verlaufEintrag = (run, art, text) => run.aufgabe_id && aufgaben.some(a => a.aufgabe_id === run.aufgabe_id) ? [neu('team_aufgaben_verlauf', { aufgabe_id: run.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art, text: txt(text, 4000) + ' ' + RUN_MARKER(run.run_id), erstellt: jetzt })] : [];
  const wechsel = (run, nach, wer, grund) => {
    if (!darfWechseln(run.status, nach, wer)) return { fehler: 'Übergang von „' + STATUS_TEXT[run.status] + '“ nach „' + STATUS_TEXT[nach] + '“ ist nicht zulässig.' };
    const row = { status: nach, lebenszeichen: jetzt };
    if (nach === STATUS.IN_ARBEIT && !run.gestartet) row.gestartet = jetzt;
    if (istEndzustand(nach)) row.beendet = jetzt;
    return { ops: [aend('office_runs', 'run_id', run.run_id, row), ereignis(run.run_id, 'status', STATUS_TEXT[run.status] + ' → ' + STATUS_TEXT[nach] + (grund ? ': ' + grund : ''))], row };
  };
  const schreiben = (ops, antwort, extern, code) => ({ weiter: 2, code: code || 200, ich: ichKurz, ops, antwort: Object.assign({ ok: true }, antwort || {}), extern: extern || null });
  const nurAntwort = antwort => ({ weiter: 1, code: 200, ich: ichKurz, antwort: Object.assign({ ok: true }, antwort || {}) });

  // ---- Lesen ----
  if (aktion === 'laden') return nurAntwort(antwortBauen(ich, D, { jetzt, quelle }));

  // ---- Rückmeldung des Executors (signiert, ohne Token) ----
  if (aktion === 'rueckmeldung') {
    const run = runVon(d.run_id);
    if (!run) return raus(404, 'Diesen Run gibt es nicht.');
    const s = schluesselListe.find(x => x.run_id === run.run_id);
    const pr = pruefeSignatur({ schluessel: s && s.schluessel, zeit: d.zeit, nonce: d.nonce, ergebnis: d.ergebnis, signatur: d.signatur }, jetztMs, n => idem.some(i => i.art === 'nonce' && i.schluessel === n));
    if (!pr.ok) return raus(401, 'Rückmeldung abgelehnt: ' + pr.grund);
    const reg = agentVon(run);
    ich = { mitglied_id: reg ? reg.mitglied_id : run.agent_id, name: reg ? reg.name : run.agent_id, rolle: 'agent', typ: 'agent', status: 'aktiv' };
    const erg = beenden(run, d.ergebnis || {}, 'agent');
    if (erg.weiter === 0) return erg;
    erg.ops.push(neu('office_idempotenz', merken({ art: 'nonce', schluessel: String(d.nonce), run_id: run.run_id, antwort: { ok: true }, jetzt })));
    return erg;
  }

  switch (aktion) {
    case 'auftrag_starten': {
      const key = String(d.idempotenzschluessel || '');
      if (!schluesselGueltig(key)) return raus(400, 'Bitte gib einen Idempotenzschlüssel an (8 bis 120 Zeichen, Buchstaben, Ziffern, _ . : -).');
      const frueher = frueherGesehen(idem, 'auftrag', key) || (runs.find(r => r.idempotenzschluessel === key) ? { antwort: { run_id: runs.find(r => r.idempotenzschluessel === key).run_id } } : null);
      if (frueher) return nurAntwort(Object.assign({}, frueher.antwort, { wiederholt: true, hinweis: 'Dieser Auftrag wurde schon angelegt. Es wurde nichts doppelt gestartet.' }));
      const reg = agenten.find(a => a.agent_id === String(d.agent_id || ''));
      if (!reg) return raus(404, 'Diesen Agenten gibt es nicht in der Registry.');
      if (reg.aktiv === false) return raus(409, 'Dieser Agent ist deaktiviert.');
      if (istAgent(ich) && reg.mitglied_id !== ich.mitglied_id) return raus(403, 'Agenten dürfen nur Aufträge für sich selbst anlegen.');
      const projekt = txt(d.projekt, 120);
      if (!projekte.some(p => p.name === projekt)) return raus(404, 'Dieses Projekt gibt es nicht.');
      if (!darfProjekt(ich, projekt, agenten)) return raus(403, 'Dieses Projekt siehst du nicht.');
      if (!(Array.isArray(reg.projekte) && reg.projekte.includes(projekt))) return raus(403, 'Der Agent „' + reg.name + '“ ist dem Projekt „' + projekt + '“ nicht zugeordnet. Timo kann das in der Registry ändern.');
      let aufgabe_id = d.aufgabe_id ? String(d.aufgabe_id) : null;
      if (aufgabe_id) { const a = aufgaben.find(x => x.aufgabe_id === aufgabe_id); if (!a) return raus(404, 'Diese Aufgabe gibt es nicht.'); if (a.projekt !== projekt) return raus(400, 'Die Aufgabe gehört zu einem anderen Projekt.'); }
      const auftrag = txt(d.auftrag, 2000);
      if (auftrag.length < 3) return raus(400, 'Bitte beschreib den Auftrag (mindestens 3 Zeichen).');
      const run_id = neueId('run');
      const schluessel = zufall(48);
      const timeout_sek = Math.min(86400, Math.max(60, Number(d.timeout_sek) || Number(reg.timeout_sek) || FRISTEN.timeout_sek));
      const max_versuche = Math.min(5, Math.max(1, Number(d.max_versuche) || Number(reg.max_versuche) || FRISTEN.max_versuche));
      const run = { run_id, projekt, aufgabe_id, auftraggeber: ich.mitglied_id, agent_id: reg.agent_id, ausfuehrer: reg.ausfuehrer || 'n8n', workflow_version: String(reg.workflow_version || ''), konfig_version: String(reg.konfig_version || ''),
        status: STATUS.WARTESCHLANGE, auftrag, eingabe: d.eingabe == null ? null : klein(d.eingabe, 4000), idempotenzschluessel: key, n8n_execution_id: null, externe_id: null,
        erstellt: jetzt, gestartet: null, lebenszeichen: null, beendet: null, timeout_sek, versuche: 1, max_versuche, fehler: null,
        zusammenfassung: null, zusammenfassung_zeit: null, zusammenfassung_quelle: null, verbrauch: null, abgenommen: null, abgenommen_von: null, abgenommen_am: null, abnahme_kommentar: null, grund: null };
      const antwort = { run_id, status: run.status, wiederholt: false };
      const ops = [neu('office_runs', run), neu('office_run_schluessel', { run_id, schluessel, erstellt: jetzt }),
        ereignis(run_id, 'status', 'Auftrag angelegt für ' + reg.name + ' (Versuch 1 von ' + max_versuche + ')', { projekt, aufgabe_id, auftraggeber: ich.mitglied_id }),
        neu('office_idempotenz', merken({ art: 'auftrag', schluessel: key, run_id, antwort, jetzt }))];
      ops.push(...verlaufEintrag(run, 'kommentar', 'Auftrag an ' + reg.name + ' gestartet: ' + auftrag.slice(0, 300)));
      return schreiben(ops, Object.assign({ rueckmelde_schluessel: schluessel }, antwort), { art: 'start', run_id, agent_id: reg.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: reg.ausfuehrer_url || null, schluessel });
    }
    case 'lebenszeichen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      if (istEndzustand(run.status)) return raus(409, 'Dieser Run ist beendet (' + STATUS_TEXT[run.status] + '). Verspätete Lebenszeichen ändern nichts daran.', { status: run.status });
      const row = { lebenszeichen: jetzt };
      const ops = [];
      if (d.n8n_execution_id) { const e = String(d.n8n_execution_id).slice(0, 80); if (run.n8n_execution_id && run.n8n_execution_id !== e) return raus(409, 'Dieser Run gehört zu einer anderen n8n-Ausführung.'); if (!run.n8n_execution_id) { if (runs.some(r => r.n8n_execution_id === e)) return raus(409, 'Diese n8n-Ausführung ist schon einem anderen Run zugeordnet.'); row.n8n_execution_id = e; } }
      let status = run.status;
      if (run.status === STATUS.WARTESCHLANGE) { const w = wechsel(run, STATUS.IN_ARBEIT, 'agent', 'Executor hat übernommen'); if (w.fehler) return raus(409, w.fehler); ops.push(...w.ops); status = STATUS.IN_ARBEIT; }
      ops.push(aend('office_runs', 'run_id', run.run_id, row));
      return schreiben(ops, { run_id: run.run_id, status });
    }
    case 'ereignis': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const art = EREIGNIS_ARTEN.includes(d.art) ? d.art : 'schritt';
      if (['status', 'abnahme', 'freigabe'].includes(art)) return raus(400, 'Ereignisse der Art „' + art + '“ erzeugt nur der Server.');
      const titel = txt(d.titel, 200); if (titel.length < 2) return raus(400, 'Bitte gib dem Ereignis einen Titel.');
      const key = d.idempotenz ? String(d.idempotenz).slice(0, 120) : null;
      if (key && ereignisse.some(e => e.idempotenz === key)) return nurAntwort({ wiederholt: true });
      const reg = agentVon(run);
      if (d.tool && !darfTool(reg, d.tool)) return raus(403, 'Das Werkzeug „' + txt(d.tool, 60) + '“ ist für ' + (reg ? reg.name : run.agent_id) + ' nicht erlaubt. Erlaubt: ' + ((reg && reg.erlaubte_tools) || []).join(', ') + '.');
      const quelle_ref = d.quelle_ref ? txt(d.quelle_ref, 300) : null;
      const extra = { tool: d.tool ? txt(d.tool, 60) : null, quelle_ref, idempotenz: key };
      if (istEndzustand(run.status)) {
        return schreiben([ereignis(run.run_id, 'hinweis', 'Verspätetes Ereignis nach Ende (' + STATUS_TEXT[run.status] + '): ' + titel, d.details, extra)], { run_id: run.run_id, status: run.status, hinweis: 'verspaetet' });
      }
      return schreiben([ereignis(run.run_id, art, titel, d.details, extra), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })], { run_id: run.run_id, status: run.status });
    }
    case 'artefakt': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      if ([STATUS.ABGEBROCHEN, STATUS.UNBEKANNT].includes(run.status)) return raus(409, 'Dieser Run ist ' + STATUS_TEXT[run.status] + '. Ergebnisse werden nicht mehr angenommen.');
      const a = artefaktRow(run, d); if (a.fehler) return raus(400, a.fehler);
      return schreiben([neu('office_artefakte', a.row), ereignis(run.run_id, 'artefakt', 'Ergebnis: ' + a.row.titel, { artefakt_id: a.row.artefakt_id, art: a.row.art, ablageort: a.row.ablageort }), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })], { artefakt_id: a.row.artefakt_id });
    }
    case 'rueckfrage': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const frage = txt(d.frage, 2000); if (frage.length < 3) return raus(400, 'Bitte formulier die Rückfrage.');
      const w = wechsel(run, STATUS.WARTET_RUECKMELDUNG, 'agent'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, ereignis(run.run_id, 'rueckfrage', frage.slice(0, 200), { frage }), ...verlaufEintrag(run, 'kommentar', 'Rückfrage: ' + frage)], { run_id: run.run_id, status: STATUS.WARTET_RUECKMELDUNG });
    }
    case 'antwort': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Antworten kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const text = txt(d.text, 2000); if (text.length < 1) return raus(400, 'Bitte schreib eine Antwort.');
      const w = wechsel(run, STATUS.IN_ARBEIT, 'mensch'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, ereignis(run.run_id, 'antwort', text.slice(0, 200), { text }), ...verlaufEintrag(run, 'kommentar', 'Antwort an ' + run.agent_id + ': ' + text)], { run_id: run.run_id, status: STATUS.IN_ARBEIT });
    }
    case 'freigabe_anfordern': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const akt = String(d.aktion || '');
      if (!brauchtFreigabe(akt)) return raus(400, 'Unbekannte Aktion „' + txt(akt, 40) + '“. Freigabefähig: ' + Object.keys(EXTERNE_AKTIONEN).join(', ') + '.');
      if (d.inhalt == null) return raus(400, 'Bitte gib den Inhalt an, der freigegeben werden soll.');
      const hash = inhaltsHash(akt, d.inhalt);
      const ops = [];
      const vorhandene = freigaben.filter(f => f.run_id === run.run_id && f.aktion === akt && ['offen', 'erteilt'].includes(f.status));
      const gleiche = vorhandene.find(f => f.inhalt_hash === hash);
      if (gleiche) return nurAntwort({ freigabe_id: gleiche.freigabe_id, status: gleiche.status, wiederholt: true });
      for (const f of vorhandene) ops.push(aend('office_freigaben', 'freigabe_id', f.freigabe_id, { status: 'ungueltig', begruendung: 'Inhalt wurde geändert, neue Freigabe angefordert.' }), ereignis(run.run_id, 'freigabe', 'Frühere Freigabe ungültig (Inhalt geändert)', { freigabe_id: f.freigabe_id }));
      const fr = freigabeAnfordern({ freigabe_id: neueId('frg'), run_id: run.run_id, aktion: akt, inhalt: d.inhalt, vorschau: d.vorschau, jetzt, angefordert_von: ich.mitglied_id });
      ops.push(neu('office_freigaben', fr), ereignis(run.run_id, 'freigabe', 'Freigabe angefordert: ' + EXTERNE_AKTIONEN[akt].text, { freigabe_id: fr.freigabe_id, inhalt_hash: hash, vorschau: fr.inhalt_vorschau }));
      if (run.status === STATUS.IN_ARBEIT) { const w = wechsel(run, STATUS.WARTET_FREIGABE, 'agent'); if (w.fehler) return raus(409, w.fehler); ops.push(...w.ops); }
      else if (run.status !== STATUS.WARTET_FREIGABE) return raus(409, 'Freigaben können nur aus „in Arbeit“ angefordert werden (aktuell: ' + STATUS_TEXT[run.status] + ').');
      ops.push(...verlaufEintrag(run, 'kommentar', 'Freigabe angefordert (' + EXTERNE_AKTIONEN[akt].text + '): ' + fr.inhalt_vorschau.slice(0, 300) + ' – Entscheidung im KI Office.'));
      return schreiben(ops, { freigabe_id: fr.freigabe_id, status: 'offen', inhalt_hash: hash });
    }
    case 'freigabe_entscheiden': {
      const fr = freigaben.find(f => f.freigabe_id === String(d.freigabe_id || '')); if (!fr) return raus(404, 'Diese Freigabe gibt es nicht.');
      const run = runVon(fr.run_id); if (!run) return raus(404, 'Der zugehörige Run existiert nicht mehr.');
      const stufe = (EXTERNE_AKTIONEN[fr.aktion] || {}).stufe || 'extern';
      const r = darfFreigeben(ich, fr, run, stufe, agenten); if (!r.ok) return raus(403, r.grund);
      const e = freigabeEntscheiden(fr, String(d.entscheidung || ''), ich.mitglied_id, d.begruendung, jetzt); if (e.fehler) return raus(409, e.fehler);
      const ops = [aend('office_freigaben', 'freigabe_id', fr.freigabe_id, e.row), ereignis(run.run_id, 'freigabe', 'Freigabe ' + e.row.status + ' von ' + ich.name + ' (' + (EXTERNE_AKTIONEN[fr.aktion] || {}).text + ')', { freigabe_id: fr.freigabe_id, begruendung: e.row.begruendung })];
      if (run.status === STATUS.WARTET_FREIGABE && !freigaben.some(f => f.run_id === run.run_id && f.status === 'offen' && f.freigabe_id !== fr.freigabe_id)) { const w = wechsel(run, STATUS.IN_ARBEIT, 'mensch', 'Freigabe ' + e.row.status); if (!w.fehler) ops.push(...w.ops); }
      ops.push(...verlaufEintrag(run, 'kommentar', 'Freigabe ' + e.row.status + (e.row.begruendung ? ': ' + e.row.begruendung : '')));
      return schreiben(ops, { freigabe_id: fr.freigabe_id, status: e.row.status });
    }
    case 'aktion_ausfuehren': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      const akt = String(d.aktion || '');
      if (!brauchtFreigabe(akt)) return raus(400, 'Unbekannte externe Aktion „' + txt(akt, 40) + '“.');
      const key = String(d.idempotenzschluessel || '');
      if (!schluesselGueltig(key)) return raus(400, 'Für externe Aktionen ist ein Idempotenzschlüssel Pflicht.');
      const frueher = frueherGesehen(idem, 'aktion', key);
      if (frueher) return nurAntwort(Object.assign({}, frueher.antwort, { wiederholt: true, hinweis: 'Diese Aktion wurde schon ausgeführt. Es wurde nichts doppelt ausgelöst.' }));
      if (run.status !== STATUS.IN_ARBEIT) return raus(409, 'Externe Aktionen laufen nur aus „in Arbeit“ (aktuell: ' + STATUS_TEXT[run.status] + ').');
      const fr = freigaben.find(f => f.freigabe_id === String(d.freigabe_id || '') && f.run_id === run.run_id);
      const g = freigabeGueltig(fr, akt, d.inhalt, jetztMs);
      if (!g.ok) {
        const ops = [ereignis(run.run_id, 'fehler', 'Externe Aktion abgelehnt: ' + g.grund, { aktion: akt, freigabe_id: fr ? fr.freigabe_id : null })];
        if (fr && g.inhalt_geaendert && ['offen', 'erteilt'].includes(fr.status)) ops.push(aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'ungueltig', begruendung: 'Inhalt nach der Freigabe geändert.' }));
        return { weiter: 2, code: 409, ich: ichKurz, ops, antwort: { ok: false, fehler: g.grund, neue_freigabe_noetig: !!g.neu_noetig }, extern: null };
      }
      const antwort = { run_id: run.run_id, aktion: akt, freigabe_id: fr.freigabe_id, ausgefuehrt: true };
      const ops = [aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'verwendet', verwendet_am: jetzt }),
        ereignis(run.run_id, 'tool', 'Externe Aktion ausgeführt: ' + EXTERNE_AKTIONEN[akt].text, { aktion: akt, freigabe_id: fr.freigabe_id, inhalt_hash: fr.inhalt_hash }, { tool: akt }),
        neu('office_idempotenz', merken({ art: 'aktion', schluessel: key, run_id: run.run_id, antwort, jetzt })), aend('office_runs', 'run_id', run.run_id, { lebenszeichen: jetzt })];
      return schreiben(ops, antwort, { art: 'aktion', aktion: akt, run_id: run.run_id, inhalt: klein(typeof d.inhalt === 'object' ? d.inhalt : { text: d.inhalt }, 8000), freigabe_id: fr.freigabe_id });
    }
    case 'run_beenden': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      const z = zugriffAufRun(run); if (z) return z;
      return beenden(run, d, 'agent');
    }
    case 'run_abbrechen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Abbrechen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const grund = txt(d.grund, 600);
      const w = wechsel(run, STATUS.ABGEBROCHEN, 'mensch', grund || 'ohne Angabe'); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, aend('office_runs', 'run_id', run.run_id, { grund: grund || 'abgebrochen von ' + ich.name, abgebrochen_von: ich.mitglied_id }), ...verlaufEintrag(run, 'status', 'Run abgebrochen' + (grund ? ': ' + grund : ''))], { run_id: run.run_id, status: STATUS.ABGEBROCHEN }, { art: 'abbruch', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer_url: (agentVon(run) || {}).ausfuehrer_url || null });
    }
    case 'run_wiederholen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Wiederholen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      const versuche = Number(run.versuche) || 1, max = Number(run.max_versuche) || FRISTEN.max_versuche;
      if (versuche >= max) return raus(409, 'Die Höchstzahl von ' + max + ' Versuchen ist erreicht. Lege bei Bedarf einen neuen Auftrag an.');
      const w = wechsel(run, STATUS.WARTESCHLANGE, 'mensch', 'Wiederholung durch ' + ich.name); if (w.fehler) return raus(409, w.fehler);
      return schreiben([...w.ops, aend('office_runs', 'run_id', run.run_id, { versuche: versuche + 1, beendet: null, fehler: null, gestartet: null }), ereignis(run.run_id, 'wiederholung', 'Versuch ' + (versuche + 1) + ' von ' + max)], { run_id: run.run_id, status: STATUS.WARTESCHLANGE, versuche: versuche + 1 }, { art: 'start', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: (agentVon(run) || {}).ausfuehrer_url || null, schluessel: (schluesselListe.find(s => s.run_id === run.run_id) || {}).schluessel || null });
    }
    case 'run_abnehmen': {
      const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.');
      if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Abnehmen kann die auftraggebende Person, Timo, Kurt oder Murat.');
      if (run.status !== STATUS.ABGESCHLOSSEN) return raus(409, 'Fachlich abnehmen geht nur, wenn der Run technisch abgeschlossen ist (aktuell: ' + STATUS_TEXT[run.status] + ').');
      const ok = d.abgenommen === true;
      const kommentar = txt(d.kommentar, 1000);
      return schreiben([aend('office_runs', 'run_id', run.run_id, { abgenommen: ok, abgenommen_von: ich.mitglied_id, abgenommen_am: jetzt, abnahme_kommentar: kommentar }), ereignis(run.run_id, 'abnahme', ok ? 'Fachlich abgenommen von ' + ich.name : 'Fachlich zurückgewiesen von ' + ich.name, { kommentar }),
        ...verlaufEintrag(run, 'kommentar', (ok ? 'Ergebnis fachlich abgenommen' : 'Ergebnis zurückgewiesen') + (kommentar ? ': ' + kommentar : ''))], { run_id: run.run_id, abgenommen: ok });
    }
    case 'wartung': {
      const ops = [], veraltet = [], verfallen = [];
      for (const run of runs) {
        const f = fristPruefen(run, jetztMs);
        if (f) { const w = wechsel(run, f.nach, 'system', f.grund); if (!w.fehler) { ops.push(...w.ops, aend('office_runs', 'run_id', run.run_id, { grund: f.grund }), ereignis(run.run_id, 'hinweis', 'Automatisch als veraltet markiert: ' + f.grund)); veraltet.push(run.run_id); } }
      }
      for (const fr of freigaben) {
        const run = runVon(fr.run_id);
        const alt = (jetztMs - new Date(fr.angefordert_am || 0).getTime()) / 1000;
        if ((fr.status === 'offen' && alt > FRISTEN.wartefrist_mensch) || (fr.status === 'erteilt' && fr.gueltig_bis && new Date(fr.gueltig_bis).getTime() < jetztMs) || (['offen', 'erteilt'].includes(fr.status) && run && istEndzustand(run.status))) {
          ops.push(aend('office_freigaben', 'freigabe_id', fr.freigabe_id, { status: 'verfallen' })); verfallen.push(fr.freigabe_id);
        }
      }
      const grenze = new Date(jetztMs - 30 * 86400 * 1000).toISOString();
      const alteIdem = idem.filter(i => i.erstellt && i.erstellt < grenze);
      if (alteIdem.length) ops.push({ methode: 'DELETE', pfad: 'office_idempotenz?erstellt=lt.' + encodeURIComponent(grenze), body: {} });
      if (!ops.length) return nurAntwort({ geprueft: runs.length, veraltet, verfallen, geloeschte_schluessel: 0 });
      return schreiben(ops, { geprueft: runs.length, veraltet, verfallen, geloeschte_schluessel: alteIdem.length });
    }
    case 'agent_speichern': {
      const id = String(d.agent_id || '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) return raus(400, 'agent_id: nur Kleinbuchstaben, Ziffern und Bindestriche (3 bis 41 Zeichen).');
      const alt = agenten.find(a => a.agent_id === id);
      const name = txt(d.name, 60); if (name.length < 2) return raus(400, 'Bitte gib dem Agenten einen Namen.');
      const raum = RAEUME.includes(d.raum) ? d.raum : (alt ? alt.raum : 'Verwaltung');
      const modell = MODELLE.includes(d.modell) ? d.modell : (alt ? alt.modell : 'claude-sonnet-5-5');
      const ausf = AUSFUEHRER.includes(d.ausfuehrer) ? d.ausfuehrer : (alt ? alt.ausfuehrer : 'n8n');
      const liste = (v, n, max) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => txt(s, n)).filter(Boolean).slice(0, max);
      const proj = liste(d.projekte, 120, 50).filter(p => projekte.some(x => x.name === p));
      const mitglied_id = d.mitglied_id ? String(d.mitglied_id) : (alt ? alt.mitglied_id : null);
      if (mitglied_id && !mitglieder.some(m => m.mitglied_id === mitglied_id && (m.typ === 'agent' || m.rolle === 'agent'))) return raus(400, 'mitglied_id muss ein Teammitglied vom Typ „agent“ sein.');
      const url = d.ausfuehrer_url ? String(d.ausfuehrer_url).trim() : (alt ? alt.ausfuehrer_url : null);
      if (url && !/^https:\/\/[^\s]+$/i.test(url)) return raus(400, 'ausfuehrer_url muss mit https:// beginnen.');
      const row = { agent_id: id, name, rolle: txt(d.rolle || (alt && alt.rolle), 120), raum, beschreibung: txt(d.beschreibung || (alt && alt.beschreibung), 1000), faehigkeiten: liste(d.faehigkeiten || (alt && alt.faehigkeiten), 80, 30), erlaubte_tools: liste(d.erlaubte_tools || (alt && alt.erlaubte_tools), 60, 40),
        modell, modell_grund: txt(d.modell_grund || (alt && alt.modell_grund), 300), ausfuehrer: ausf, ausfuehrer_url: url || null, mitglied_id, projekte: proj, aktiv: d.aktiv !== false,
        timeout_sek: Math.min(86400, Math.max(60, Number(d.timeout_sek) || (alt && alt.timeout_sek) || FRISTEN.timeout_sek)), max_versuche: Math.min(5, Math.max(1, Number(d.max_versuche) || (alt && alt.max_versuche) || FRISTEN.max_versuche)),
        auto_wiederholen: d.auto_wiederholen === true, workflow_version: txt(d.workflow_version || (alt && alt.workflow_version), 40), konfig_version: String((Number(alt && alt.konfig_version) || 0) + 1), geaendert: jetzt, geaendert_von: ich.mitglied_id };
      return schreiben([alt ? aend('office_agenten', 'agent_id', id, row) : neu('office_agenten', row)], { agent_id: id, konfig_version: row.konfig_version });
    }
    case 'loeschen': {
      // Löschkonzept (docs/office/LOESCHKONZEPT.md): Run mit allen abgeleiteten Daten. Ablageorte der Artefakte werden zurückgemeldet, damit ein Mensch sie extern löscht.
      let ziel = [];
      if (d.run_id) { const run = runVon(d.run_id); if (!run) return raus(404, 'Diesen Run gibt es nicht.'); if (!istEndzustand(run.status)) return raus(409, 'Nur beendete Runs können gelöscht werden. Brich den Run zuerst ab.'); ziel = [run]; }
      else if (d.aelter_als_tage) { const t = Number(d.aelter_als_tage); if (!(t >= 30)) return raus(400, 'aelter_als_tage muss mindestens 30 sein.'); const grenze = new Date(jetztMs - t * 86400 * 1000).toISOString(); ziel = runs.filter(r => istEndzustand(r.status) && (r.beendet || r.erstellt) < grenze); }
      else return raus(400, 'Gib run_id oder aelter_als_tage an.');
      if (!ziel.length) return nurAntwort({ geloescht: 0, ablageorte: [] });
      const ops = [], ablageorte = [];
      for (const run of ziel) {
        for (const a of artefakte.filter(x => x.run_id === run.run_id)) if (a.ablageort) ablageorte.push({ artefakt_id: a.artefakt_id, ablageort: a.ablageort });
        ops.push(weg('office_ereignisse', 'run_id', run.run_id), weg('office_artefakte', 'run_id', run.run_id), weg('office_freigaben', 'run_id', run.run_id), weg('office_idempotenz', 'run_id', run.run_id), weg('office_run_schluessel', 'run_id', run.run_id));
        for (const v of (D.verlauf || []).filter(v => v && v.id != null && String(v.text || '').includes(RUN_MARKER(run.run_id)))) ops.push(weg('team_aufgaben_verlauf', 'id', v.id));
        ops.push(weg('office_runs', 'run_id', run.run_id));
      }
      return schreiben(ops, { geloescht: ziel.length, run_ids: ziel.map(r => r.run_id), ablageorte, hinweis: ablageorte.length ? 'Diese Ablageorte musst du außerhalb des Office selbst löschen.' : '' });
    }
    default:
      return raus(400, 'Unbekannte Aktion „' + txt(aktion, 40) + '“.');
  }

  // ---- Hilfsfunktionen mit Zugriff auf den Kontext ----
  function zugriffAufRun(run) {
    if (istAgent(ich)) { if (!fuehrtAus(ich, run.agent_id, agenten)) return raus(403, 'Dieser Run gehört einem anderen Agenten.'); return null; }
    if (!darfRunSteuern(ich, run, agenten)) return raus(403, 'Diesen Run darfst du nicht steuern.');
    return null;
  }
  function artefaktRow(run, d) {
    const art = ARTEFAKT_ARTEN.includes(d.art) ? d.art : 'text';
    const titel = txt(d.titel, 200); if (titel.length < 2) return { fehler: 'Bitte gib dem Ergebnis einen Titel.' };
    const ablageort = txt(d.ablageort, 500);
    if (ablageort && /^https?:/i.test(ablageort) && !istUrl(ablageort)) return { fehler: 'Der Ablageort sieht nicht wie eine gültige Adresse aus.' };
    const inhalt_hash = /^[a-f0-9]{64}$/i.test(String(d.inhalt_hash || '')) ? String(d.inhalt_hash).toLowerCase() : null;
    return { row: { artefakt_id: neueId('art'), run_id: run.run_id, aufgabe_id: run.aufgabe_id || null, projekt: run.projekt, art, titel, ablageort: ablageort || null, inhalt_hash, groesse: Number(d.groesse) > 0 ? Math.round(Number(d.groesse)) : null, zusammenfassung: txt(d.zusammenfassung, 1000) || null, erstellt: jetzt, erstellt_von: ich ? ich.mitglied_id : run.agent_id } };
  }
  function beenden(run, e, wer) {
    const ziel = e.status === STATUS.ABGESCHLOSSEN ? STATUS.ABGESCHLOSSEN : e.status === STATUS.FEHLGESCHLAGEN ? STATUS.FEHLGESCHLAGEN : null;
    if (!ziel) return raus(400, 'status muss „abgeschlossen“ oder „fehlgeschlagen“ sein.');
    const zusammenfassung = txt(e.zusammenfassung, 4000) || null;
    const fehler = txt(e.fehler, 2000) || null;
    const verbrauch = verbrauchAus(e.verbrauch);
    const ops = [];
    // Verspätete Rückmeldung: Run ist schon beendet oder veraltet. Festhalten, aber nie nachträglich als Erfolg werten.
    if (istEndzustand(run.status)) {
      ops.push(ereignis(run.run_id, 'hinweis', 'Verspätete Rückmeldung (' + STATUS_TEXT[ziel] + ') nach Ende (' + STATUS_TEXT[run.status] + '). Status bleibt unverändert.', { gemeldet: ziel, zusammenfassung: zusammenfassung ? zusammenfassung.slice(0, 500) : null, fehler }));
      return schreiben(ops, { run_id: run.run_id, status: run.status, hinweis: 'verspaetet', angenommen: false }, null, 200);
    }
    if (e.n8n_execution_id) { const x = String(e.n8n_execution_id).slice(0, 80); if (run.n8n_execution_id && run.n8n_execution_id !== x) return raus(409, 'Dieser Run gehört zu einer anderen n8n-Ausführung.'); if (!run.n8n_execution_id && runs.some(r => r.n8n_execution_id === x)) return raus(409, 'Diese n8n-Ausführung ist schon einem anderen Run zugeordnet.'); }
    const w = wechsel(run, ziel, wer, ziel === STATUS.FEHLGESCHLAGEN && fehler ? fehler.slice(0, 200) : undefined);
    if (w.fehler) return raus(409, w.fehler);
    ops.push(...w.ops);
    const ereignisIds = ereignisse.filter(x => x.run_id === run.run_id).map(x => x.id).filter(x => x != null);
    const row = { zusammenfassung, zusammenfassung_zeit: zusammenfassung ? jetzt : null, zusammenfassung_quelle: zusammenfassung ? { ereignisse: ereignisIds.slice(-50), stand: jetzt, von: ich ? ich.mitglied_id : run.agent_id } : null, fehler, verbrauch };
    if (e.n8n_execution_id && !run.n8n_execution_id) row.n8n_execution_id = String(e.n8n_execution_id).slice(0, 80);
    ops.push(aend('office_runs', 'run_id', run.run_id, row));
    if (ziel === STATUS.FEHLGESCHLAGEN) ops.push(ereignis(run.run_id, 'fehler', fehler || 'Fehler ohne Beschreibung', { versuch: run.versuche, max_versuche: run.max_versuche }));
    const artefaktIds = [];
    for (const a of (Array.isArray(e.artefakte) ? e.artefakte.slice(0, 20) : [])) { const r = artefaktRow(run, a || {}); if (!r.fehler) { ops.push(neu('office_artefakte', r.row)); artefaktIds.push(r.row.artefakt_id); } }
    const reg = agentVon(run);
    let status = ziel;
    if (ziel === STATUS.FEHLGESCHLAGEN && reg && reg.auto_wiederholen === true && (Number(run.versuche) || 1) < (Number(run.max_versuche) || FRISTEN.max_versuche)) {
      const r2 = { ...run, status: ziel };
      const w2 = wechsel(r2, STATUS.WARTESCHLANGE, 'system', 'automatische Wiederholung');
      if (!w2.fehler) { ops.push(...w2.ops, aend('office_runs', 'run_id', run.run_id, { versuche: (Number(run.versuche) || 1) + 1, beendet: null, gestartet: null }), ereignis(run.run_id, 'wiederholung', 'Automatischer Versuch ' + ((Number(run.versuche) || 1) + 1) + ' von ' + run.max_versuche)); status = STATUS.WARTESCHLANGE; }
    }
    if (ziel === STATUS.ABGESCHLOSSEN) {
      ops.push(...verlaufEintrag(run, 'bericht', (zusammenfassung || 'Run abgeschlossen (ohne Zusammenfassung)') + (artefaktIds.length ? ' – ' + artefaktIds.length + ' Ergebnis(se) im KI Office.' : '')));
      const a = run.aufgabe_id ? aufgaben.find(x => x.aufgabe_id === run.aufgabe_id) : null;
      if (a && a.status === 'In Arbeit') ops.push(aend('team_aufgaben', 'aufgabe_id', a.aufgabe_id, { status: 'Wird getestet', geaendert: jetzt }), neu('team_aufgaben_verlauf', { aufgabe_id: a.aufgabe_id, autor: ich ? ich.mitglied_id : run.agent_id, art: 'status', text: 'In Arbeit → Wird getestet (Run beendet) ' + RUN_MARKER(run.run_id), erstellt: jetzt }));
    } else ops.push(...verlaufEintrag(run, 'kommentar', 'Run fehlgeschlagen' + (fehler ? ': ' + fehler.slice(0, 300) : '') + (status === STATUS.WARTESCHLANGE ? ' – wird automatisch wiederholt.' : '')));
    return schreiben(ops, { run_id: run.run_id, status, angenommen: true, artefakte: artefaktIds }, status === STATUS.WARTESCHLANGE ? { art: 'start', run_id: run.run_id, agent_id: run.agent_id, ausfuehrer: run.ausfuehrer, ausfuehrer_url: (reg || {}).ausfuehrer_url || null, schluessel: (schluesselListe.find(s => s.run_id === run.run_id) || {}).schluessel || null } : null);
  }
}

/** Verbrauch nur, wenn messbar gemeldet. Sonst „unbekannt“. Kosten nur mit Quelle, sonst höchstens „geschätzt“. */
function verbrauchAus(v) {
  if (!v || typeof v !== 'object') return { messbar: false, hinweis: 'unbekannt' };
  const n = x => (Number.isFinite(Number(x)) && Number(x) >= 0) ? Number(x) : null;
  const ein = n(v.tokens_ein), aus = n(v.tokens_aus);
  if (ein === null && aus === null) return { messbar: false, hinweis: 'unbekannt' };
  const o = { messbar: true, tokens_ein: ein || 0, tokens_aus: aus || 0, modell: v.modell ? String(v.modell).slice(0, 60) : null };
  if (n(v.kosten_eur) !== null) { o.kosten_eur = n(v.kosten_eur); o.kosten_art = v.kosten_quelle ? 'gemessen' : 'geschätzt'; o.kosten_quelle = v.kosten_quelle ? String(v.kosten_quelle).slice(0, 120) : null; }
  return o;
}

/** Antwort auf „laden“: nur, was die Rolle sehen darf. Nie: Tokens, Rückmelde-Schlüssel, Kontaktdaten, Zeiten, Kursdaten. */
function antwortBauen(ich, D, opts) {
  const o = opts || {};
  const agenten = (D.office_agenten || []).filter(a => a && a.agent_id);
  const sicht = sichtbareProjekte(ich, agenten);
  const projektOk = name => sicht === null || sicht.includes(name);
  const admin = istAdmin(ich);
  const projekte = (D.projekte || []).filter(p => p && p.projekt_id && projektOk(p.name)).map(p => ({ projekt_id: p.projekt_id, name: p.name, beschreibung: p.beschreibung || '', status: p.status || 'aktiv', farbe: p.farbe || '', verantwortlich: p.verantwortlich || '', reihenfolge: Number(p.reihenfolge) || 0, links: Array.isArray(p.links) ? p.links.filter(l => l && istUrl(l.url)).map(l => ({ titel: String(l.titel || '').slice(0, 80), url: String(l.url).slice(0, 500) })) : [], geaendert: p.geaendert || '' }));
  const aufgaben = (D.aufgaben || []).filter(a => a && a.aufgabe_id && projektOk(a.projekt)).map(a => ({ aufgabe_id: a.aufgabe_id, titel: a.titel, beschreibung: istAgent(ich) ? String(a.beschreibung || '').slice(0, 4000) : (a.beschreibung || ''), status: a.status, prio: Number(a.prio) || 2, label: a.label || '', projekt: a.projekt || '', verantwortlich: a.verantwortlich || '', erstellt_von: a.erstellt_von || '', deadline: a.deadline || '', agent_geeignet: a.agent_geeignet === true, erstellt: a.erstellt || '', geaendert: a.geaendert || '', erledigt_am: a.erledigt_am || '' }));
  const aufgabenIds = new Set(aufgaben.map(a => a.aufgabe_id));
  const verlauf = (D.verlauf || []).filter(v => v && aufgabenIds.has(v.aufgabe_id)).map(v => ({ id: v.id, aufgabe_id: v.aufgabe_id, autor: v.autor, art: v.art, text: v.text, erstellt: v.erstellt }));
  const notizen = (D.notizen || []).filter(n => n && n.notiz_id && n.projekt && projektOk(n.projekt)).map(n => ({ notiz_id: n.notiz_id, titel: n.titel, projekt: n.projekt, autor: n.autor || '', geaendert: n.geaendert || '', laenge: String(n.inhalt || '').length }));
  const runs = (D.office_runs || []).filter(r => r && r.run_id && darfRunSehen(ich, r, agenten)).map(r => { const x = { ...r }; delete x.rueckmelde_schluessel; return x; });
  const runIds = new Set(runs.map(r => r.run_id));
  const ereignisse = (D.office_ereignisse || []).filter(e => e && runIds.has(e.run_id)).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)) || (Number(a.sequenz) || 0) - (Number(b.sequenz) || 0));
  const artefakte = (D.office_artefakte || []).filter(a => a && runIds.has(a.run_id));
  const freigaben = (D.office_freigaben || []).filter(f => f && runIds.has(f.run_id));
  const regs = agenten.map(a => { const x = { ...a }; if (!admin) delete x.ausfuehrer_url; delete x.geaendert_von; return x; });
  const mitglieder = (D.mitglieder || []).filter(m => m && m.mitglied_id).map(m => ({ mitglied_id: m.mitglied_id, name: m.name, rolle: m.rolle, typ: m.typ || 'mensch', funktion: m.funktion || '', status: m.status }));
  return {
    ich: { mitglied_id: ich.mitglied_id, name: ich.name, rolle: ich.rolle, typ: ich.typ || 'mensch', funktion: ich.funktion || '' },
    mitglieder, projekte, aufgaben, verlauf, notizen, agenten: regs, runs, ereignisse, artefakte, freigaben,
    sichtbare_projekte: sicht, raeume: RAEUME, status_text: STATUS_TEXT, uebergaenge: UEBERGAENGE, fristen: FRISTEN, externe_aktionen: EXTERNE_AKTIONEN,
    quelle: o.quelle || 'n8n', stand: o.jetzt || new Date().toISOString()
  };
}

// ===== n8n-Anbindung (TEAM: Office-API, Knoten „Anfrage prüfen“) =====
// Eingang: Webhook „Office-API“ (Body { token, aktion, daten }) oder Zeitplan (Wartung). Daten: HTTP-Knoten „Team-Daten laden“ (rpc/team_laden).
let b;
try { b = $('Office-API').first().json.body || {}; } catch (e) { b = { aktion: 'wartung', intern: true }; }
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const D = $('Team-Daten laden').first().json || {};
const r = verarbeiten({ body: b, D, jetzt: new Date().toISOString(), quelle: 'n8n' });
return [{ json: { weiter: r.weiter, code: r.code || 200, antwort: r.antwort || { ok: false, fehler: 'Keine Antwort' }, ops: r.ops || [], extern: r.extern || null, ich: r.ich || null, intern: b.intern === true } }];
