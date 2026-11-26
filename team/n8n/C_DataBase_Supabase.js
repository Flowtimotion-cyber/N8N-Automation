// Supabase-Variante von C_DataBase: Schreibaufträge in PostgREST-Schreibweise.
// Ausgeführt werden sie im Workflow vom HTTP-Knoten „In Supabase schreiben“:
//   { methode, pfad, body }  →  methode  <Supabase-URL>/rest/v1/<pfad>  mit body als JSON
class C_DataBase_Supabase extends C_DataBase {
	constructor() {
		super('supabase');
	}

	static enc(v) {
		return encodeURIComponent(String(v));
	}

	neu(tab, row) {
		return { methode: 'POST', pfad: tab, body: row };
	}

	aendern(tab, pk, id, row) {
		return { methode: 'PATCH', pfad: tab + '?' + pk + '=eq.' + C_DataBase_Supabase.enc(id), body: row };
	}

	aendernViele(tab, pk, ids, row) {
		return { methode: 'PATCH', pfad: tab + '?' + pk + '=in.(' + ids.map(C_DataBase_Supabase.enc).join(',') + ')', body: row };
	}

	loeschen(tab, pk, id) {
		return { methode: 'DELETE', pfad: tab + '?' + pk + '=eq.' + C_DataBase_Supabase.enc(id), body: {} };
	}

	funktion(name, params) {
		return { methode: 'POST', pfad: 'rpc/' + name, body: params };
	}

	// Leseauftrag { methode: 'GET', pfad } in PostgREST-Schreibweise:  tab?select=…&spalte=eq.wert&order=…&limit=…
	lesen(tab, abfrage) {
		const a = C_DataBase.abfrage(tab, abfrage);
		const enc = C_DataBase_Supabase.enc;
		const teile = ['select=' + (a.spalten.length ? a.spalten.join(',') : '*')];
		for (const [spalte, vergleich, wert] of a.wo) {
			teile.push(spalte + '=' + (vergleich === 'in' ? 'in.(' + wert.map(enc).join(',') + ')' : C_DataBase_Supabase.VERGLEICH[vergleich] + '.' + enc(wert)));
		}
		if (a.sortierung.length) teile.push('order=' + a.sortierung.map(([spalte, richtung]) => spalte + '.' + richtung).join(','));
		if (a.limit) teile.push('limit=' + a.limit);
		return { methode: 'GET', pfad: a.tab + '?' + teile.join('&') };
	}

	static VERGLEICH = { '=': 'eq', '<>': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };
}
