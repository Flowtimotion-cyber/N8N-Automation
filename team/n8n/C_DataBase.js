// Schnittstelle zwischen der Geschäftslogik der Portal-API und der Datenbank.
// Die Logik beschreibt nur, WAS geschrieben werden soll; die abgeleitete Klasse (C_DataBase_Supabase, C_DataBase_Postgre)
// macht daraus Schreibaufträge in der Form, die die Ausführungsknoten ihres Workflows verstehen.
// Im Betrieb gibt es genau ein Objekt „dataBase“; team/n8n/bauen.mjs setzt die passende Klasse in den Code-Knoten ein.
class C_DataBase {
	constructor(kennung) {
		if (new.target === C_DataBase) throw new Error('C_DataBase ist nur die Schnittstelle. Bitte C_DataBase_Supabase oder C_DataBase_Postgre verwenden.');
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

	// Zeilen aus Tabelle „tab“ lesen. Alle Angaben in „abfrage“ sind freiwillig:
	//   spalten:    ['a', 'b']                      (fehlt: alle Spalten)
	//   wo:         [['status', '<>', 'geloescht'], ['id', 'in', ['a', 'b']]]   (alle Bedingungen müssen gelten)
	//               Vergleiche: = <> < <= > >= in
	//   sortierung: ['erstellt desc', 'name']       (asc, wenn nichts angegeben)
	//   limit:      50
	// Ergebnis ist ein Leseauftrag; ausgeführt liefert er eine Zeile je Item.
	lesen(tab, abfrage) { this.fehlt('lesen'); }

	// Prüft eine Abfrage für lesen() und bringt sie in eine feste Form. Wirft bei allem, was nicht passt.
	// Namen von Tabellen und Spalten kommen aus dem Code, nie aus dem Browser; geprüft wird trotzdem.
	static abfrage(tab, abfrage) {
		const a = abfrage || {};
		const name = n => {
			if (!/^[a-z_][a-z0-9_]*$/.test(String(n))) throw new Error('C_DataBase.lesen: ungültiger Name „' + n + '“');
			return String(n);
		};
		const wo = (a.wo || []).map(([spalte, vergleich, wert]) => {
			if (!C_DataBase.VERGLEICHE.includes(vergleich)) throw new Error('C_DataBase.lesen: unbekannter Vergleich „' + vergleich + '“');
			if (vergleich === 'in' ? !Array.isArray(wert) : (wert === null || wert === undefined || typeof wert === 'object')) {
				throw new Error('C_DataBase.lesen: ungültiger Wert für ' + spalte + ' ' + vergleich);
			}
			return [name(spalte), vergleich, vergleich === 'in' ? wert.map(String) : String(wert)];
		});
		const sortierung = (a.sortierung || []).map(s => {
			const [spalte, richtung = 'asc', rest] = String(s).trim().split(/\s+/);
			if (rest !== undefined || !['asc', 'desc'].includes(richtung)) throw new Error('C_DataBase.lesen: ungültige Sortierung „' + s + '“');
			return [name(spalte), richtung];
		});
		if (a.limit !== undefined && a.limit !== null && !(Number.isInteger(a.limit) && a.limit > 0)) throw new Error('C_DataBase.lesen: ungültiges Limit „' + a.limit + '“');
		return { tab: name(tab), spalten: (a.spalten || []).map(name), wo, sortierung, limit: a.limit || null };
	}

	static VERGLEICHE = ['=', '<>', '<', '<=', '>', '>=', 'in'];

	fehlt(methode) {
		throw new Error(this.constructor.name + ' implementiert ' + methode + '() nicht.');
	}
}
