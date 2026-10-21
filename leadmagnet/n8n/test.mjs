import fs from 'fs';
const s = fs.readFileSync('lm-unternehmer.sdk.js','utf8');
const codes = [...s.matchAll(/"jsCode":("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]));
const run = (code, items, ctx={}) => new Function('$input','$','$json', code)({ all: () => items }, n => ({ item: { json: ctx[n] } }), ctx.$json);
const body = { aktion:'check', vorname:'Max', nachname:'Muster', email:'Max@Firma.de', telefon:'0170 1234567', firma:'Muster GmbH', einwilligung:true,
  antworten:{ angestellt:'ja', abschluss:'ja', sperrfrist:'nein', arbeitszeit:'teils', begonnen:'nein', groesse:'unter_50', personen:'2-5' }, quelle:{utm_source:'qr', utm_campaign:'sonntag'} };
const r = run(codes[0], [{ json: { body } }]); const d = r[0].json;
console.log(d.ergebnis, d.titel, d.quote_kurs, d.quelle, d.email); console.log(d.nachricht);
console.log(run(codes[0], [{ json: { body: {aktion:'lernstand', teilnehmer_id:'t_0123456789abcdef01234567', fortschritt_prozent: 40, steckbrief:['a','b']} } }])[0].json.kurs);
console.log(run(codes[0], [{ json: { body: {aktion:'check', email:'x'} } }])[0].json.aktion);
const p = run(codes[1], [], { 'Prüfen und aufbereiten': d, $json: { data: { people: [] } } }); console.log(JSON.stringify(p[0].json));
const c = run(codes[2], [], { 'Prüfen und aufbereiten': d, 'Person vorbereiten': p[0].json, $json: { data: { createPerson: { id: 'pid1' } } } }); console.log(JSON.stringify(c[0].json));
const n = run(codes[3], [], { 'Prüfen und aufbereiten': d, $json: { data: { createOpportunity: { id: 'oid1' } } } }); console.log(JSON.stringify(n[0].json).slice(0,300));
