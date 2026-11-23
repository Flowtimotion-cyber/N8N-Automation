// Supabase-Variante von C_DataBase: Schreibaufträge in PostgREST-Schreibweise.
// Ausgeführt werden sie im Workflow vom HTTP-Knoten „In Supabase schreiben“:
//   { methode, pfad, body }  →  methode  <Supabase-URL>/rest/v1/<pfad>  mit body als JSON
class C_dbSupabase extends C_DataBase {
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
		return { methode: 'PATCH', pfad: tab + '?' + pk + '=eq.' + C_dbSupabase.enc(id), body: row };
	}

	aendernViele(tab, pk, ids, row) {
		return { methode: 'PATCH', pfad: tab + '?' + pk + '=in.(' + ids.map(C_dbSupabase.enc).join(',') + ')', body: row };
	}

	loeschen(tab, pk, id) {
		return { methode: 'DELETE', pfad: tab + '?' + pk + '=eq.' + C_dbSupabase.enc(id), body: {} };
	}

	funktion(name, params) {
		return { methode: 'POST', pfad: 'rpc/' + name, body: params };
	}
}
