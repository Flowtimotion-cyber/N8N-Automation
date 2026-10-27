// Ergänzt „social_speichern“ um die Veröffentlichungs-Felder (Uhrzeit, Format, Medien, Hook, Hashtags, Quelle)
// und setzt die Freigabe: nur ein Mensch, der „Geplant“ wählt, gibt frei. Alle anderen Aktionen laufen unverändert durch.
const ein = $input.all();
let b = $('Team-API').first().json.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const j = (ein[0] || {}).json || {};
if (String(b.aktion || '') !== 'social_speichern' || j.weiter !== 2 || !Array.isArray(j.ops) || !j.ops.length) return ein;
const D = $('Team-Daten laden').first().json || {};
const d = b.daten || {};
const op = j.ops[0];
const row = Object.assign({}, op.body || {});
const vorher = (D.social || []).find(x => x.post_id === row.post_id) || {};
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, n);
const istAgent = (j.ich || {}).rolle === 'agent';
const jetzt = row.geaendert || new Date().toISOString();
row.uhrzeit = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.uhrzeit || '')) ? d.uhrzeit : '';
row.format = ['Bild', 'Karussell', 'Reel', 'Text'].includes(d.format) ? d.format : '';
row.medien = String(d.medien || '').split(/[\s,]+/).filter(u => /^https:\/\/\S+$/.test(u)).slice(0, 10).join('\n');
row.hook = txt(d.hook, 300);
row.hashtags = txt(d.hashtags, 500);
row.quelle = txt(d.quelle, 400);
const gleich = (vorher.text || '') === (row.text || '') && String(vorher.medien || '') === row.medien && (vorher.datum || '') === (row.datum || '')
  && String(vorher.uhrzeit || '') === row.uhrzeit && String(vorher.hashtags || '') === row.hashtags && vorher.kanal === row.kanal;
if (row.status === 'Geplant' && !istAgent) {
  if (!(vorher.freigegeben_von && vorher.status === 'Geplant' && gleich)) { row.freigegeben_von = j.ich.mitglied_id; row.freigegeben_am = jetzt; }
  row.versuche = 0; row.fehler = null; row.in_arbeit_seit = null;
} else if (row.status !== 'Veröffentlicht') { row.freigegeben_von = null; row.freigegeben_am = null; }
return [{ json: Object.assign({}, j, { ops: [Object.assign({}, op, { body: row })].concat(j.ops.slice(1)) }) }];
