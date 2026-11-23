// PostgreSQL-Variante von C_DataBase: Schreibaufträge für den Postgres-Knoten von n8n („Execute Query“).
//
// Zweistufig, weil Knoten zwischen „Anfrage prüfen“ und dem Schreiben (z. B. „Social-Felder ergänzen“) noch den body
// eines Auftrags ändern:
//   1. neu/aendern/… liefern eine Beschreibung   { art, tab, pk, id | ids, body }
//   2. C_dbPostgre.sql(auftrag) macht daraus    { sql, params }   (im Code-Knoten „Schreibaufträge“)
//
// Typumwandlung wie bei PostgREST: Die Zeile geht als JSON-Text in json_populate_record(null::<tabelle>, $1::json),
// so kommen Arrays, Datum und jsonb-Spalten genauso an wie bei Supabase. Nur die Spalten aus body werden geschrieben,
// alle anderen behalten ihren Default bzw. bisherigen Wert. Werte gehen nie in den SQL-Text, nur als Parameter.
class C_dbPostgre extends C_DataBase {
	constructor() {
		super('postgre');
	}

	neu(tab, row) {
		return { art: 'neu', tab, body: row };
	}

	aendern(tab, pk, id, row) {
		return { art: 'aendern', tab, pk, id: String(id), body: row };
	}

	aendernViele(tab, pk, ids, row) {
		return { art: 'aendernViele', tab, pk, ids: ids.map(String), body: row };
	}

	loeschen(tab, pk, id) {
		return { art: 'loeschen', tab, pk, id: String(id), body: {} };
	}

	funktion(name, params) {
		return { art: 'funktion', tab: name, body: params };
	}

	// Name von Tabelle, Spalte oder Funktion: nur einfache Bezeichner, in Anführungszeichen gesetzt
	static name(n) {
		if (!/^[a-z_][a-z0-9_]*$/.test(String(n))) throw new Error('C_dbPostgre: ungültiger Name „' + n + '“');
		return '"' + n + '"';
	}

	// Beschreibung → { sql, params } für den Postgres-Knoten
	static sql(op) {
		const N = C_dbPostgre.name;
		const body = op.body || {};
		const spalten = Object.keys(body).map(N);
		const zeile = 'json_populate_record(null::' + N(op.tab) + ', $1::json)';
		switch (op.art) {
			case 'neu':
				if (!spalten.length) throw new Error('C_dbPostgre: neue Zeile in ' + op.tab + ' ohne Spalten');
				return { sql: 'INSERT INTO ' + N(op.tab) + ' (' + spalten.join(', ') + ') SELECT ' + spalten.join(', ') + ' FROM ' + zeile, params: [JSON.stringify(body)] };
			case 'aendern':
			case 'aendernViele': {
				if (!spalten.length) throw new Error('C_dbPostgre: Änderung an ' + op.tab + ' ohne Spalten');
				const wo = op.art === 'aendern'
					? 'z.' + N(op.pk) + '::text = $2'
					: 'z.' + N(op.pk) + '::text IN (SELECT json_array_elements_text($2::json))';
				return {
					sql: 'UPDATE ' + N(op.tab) + ' AS z SET ' + spalten.map(s => s + ' = r.' + s).join(', ') + ' FROM ' + zeile + ' AS r WHERE ' + wo,
					params: [JSON.stringify(body), op.art === 'aendern' ? op.id : JSON.stringify(op.ids)]
				};
			}
			case 'loeschen':
				return { sql: 'DELETE FROM ' + N(op.tab) + ' WHERE ' + N(op.pk) + '::text = $1', params: [op.id] };
			case 'funktion': {
				// Benannte Parameter wie bei PostgREST-rpc; Werte als Text, PostgreSQL wandelt sie in die Parametertypen der Funktion
				const namen = Object.keys(body);
				const wert = v => v === null || v === undefined ? null : (typeof v === 'object' ? JSON.stringify(v) : String(v));
				return {
					sql: 'SELECT ' + N(op.tab) + '(' + namen.map((p, i) => N(p) + ' := $' + (i + 1)).join(', ') + ')',
					params: namen.map(p => wert(body[p]))
				};
			}
			default:
				throw new Error('C_dbPostgre: unbekannte Auftragsart „' + op.art + '“');
		}
	}
}
