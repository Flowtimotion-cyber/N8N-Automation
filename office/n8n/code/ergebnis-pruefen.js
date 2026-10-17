// Prüft, ob alle Schreibaufträge geklappt haben. 409 = Eindeutigkeit verletzt (doppelter Auftrag, doppelte Nonce): als Konflikt melden, nichts wird doppelt ausgeführt.
const res = $input.all().map(i => i.json);
const p = $('Anfrage prüfen').first().json;
const fehler = res.filter(r => Number(r.statusCode) >= 300);
if (fehler.length) { const f = fehler[0]; const msg = String((f.body && (f.body.message || JSON.stringify(f.body))) || f.statusCode).slice(0, 300); return [{ json: { ok: false, code: Number(f.statusCode) === 409 ? 409 : 500, fehler: (Number(f.statusCode) === 409 ? 'Doppelter Aufruf oder Konflikt: ' : 'Speichern hat nicht geklappt: ') + msg } }]; }
return [{ json: { ok: true, code: p.code || 200, antwort: p.antwort, extern: p.extern, intern: p.intern === true } }];
