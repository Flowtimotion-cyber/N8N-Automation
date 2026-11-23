// Schnittstelle zwischen der Geschäftslogik der Portal-API und der Datenbank.
// Die Logik beschreibt nur, WAS geschrieben werden soll; die abgeleitete Klasse (C_dbSupabase, C_dbPostgre)
// macht daraus Schreibaufträge in der Form, die die Ausführungsknoten ihres Workflows verstehen.
// Im Betrieb gibt es genau ein Objekt „dataBase“; team/n8n/bauen.mjs setzt die passende Klasse in den Code-Knoten ein.
class C_DataBase {
	constructor(kennung) {
		if (new.target === C_DataBase) throw new Error('C_DataBase ist nur die Schnittstelle. Bitte C_dbSupabase oder C_dbPostgre verwenden.');
		this.kennung = kennung;
	}

	// Neue Zeile in Tabelle „tab“ anlegen
	neu(tab, row) { this.fehlt('neu'); }

	// Eine Zeile ändern, gefunden über Primärschlüssel „pk“ = id
	aendern(tab, pk, id, row) { this.fehlt('aendern'); }

	// Mehrere Zeilen gleich ändern, gefunden über „pk“ in ids
	aendernViele(tab, pk, ids, row) { this.fehlt('aendernViele'); }

	// Eine Zeile löschen, gefunden über „pk“ = id
	loeschen(tab, pk, id) { this.fehlt('loeschen'); }

	// SQL-Funktion in der Datenbank aufrufen, params = { p_name: wert, … }
	funktion(name, params) { this.fehlt('funktion'); }

	fehlt(methode) {
		throw new Error(this.constructor.name + ' implementiert ' + methode + '() nicht.');
	}
}
