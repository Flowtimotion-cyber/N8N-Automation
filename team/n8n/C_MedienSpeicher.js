// Schnittstelle zwischen der Geschäftslogik und dem Ablageort für Mediendateien (Videos, Bilder).
// Die Logik nennt nur Bereich und Pfad; die abgeleitete Klasse (C_MedienSpeicher_Supabase, später C_MedienSpeicher_Rclone)
// macht daraus Aufträge für die Ausführungsknoten ihres Workflows bzw. fertige Adressen.
//
// Bereiche: { '<name>': { oeffentlich: true | false } }
//   öffentlich: jede Datei hat eine feste http-Adresse (oeffentlicheAdresse)
//   privat:     keine feste Adresse; Zugriff nur über Aufträge des Workflows (z. B. befristete Upload-Adresse)
// Der Name eines Bereichs steht auch in den Datenbank-Zeilen (Feld „bucket“) und ist in allen Varianten gleich.
//
// Ein Auftrag hat die Form { methode, pfad, body } (pfad relativ zur Basisadresse des Speichers), wie bei C_DataBase.
class C_MedienSpeicher {
	constructor(kennung, bereiche) {
		if (new.target === C_MedienSpeicher) throw new Error('C_MedienSpeicher ist nur die Schnittstelle. Bitte C_MedienSpeicher_Supabase verwenden.');
		this.kennung = kennung;
		this.bereiche = {};
		for (const [name, b] of Object.entries(bereiche || {})) {
			if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(name)) throw new Error('C_MedienSpeicher: ungültiger Bereichsname „' + name + '“');
			this.bereiche[name] = { oeffentlich: !!(b && b.oeffentlich) };
		}
	}

	// Auftrag: befristete Adresse holen, unter der der Browser eine Datei direkt in den Bereich lädt (PUT)
	uploadAdresseHolen(bereich, pfad) { this.fehlt('uploadAdresseHolen'); }

	// Aus der Antwort auf uploadAdresseHolen die vollständige Upload-Adresse machen (oder null)
	uploadAdresse(antwort) { this.fehlt('uploadAdresse'); }

	// Feste http-Adresse einer Datei in einem öffentlichen Bereich
	oeffentlicheAdresse(bereich, pfad) { this.fehlt('oeffentlicheAdresse'); }

	// Auftrag: Datei löschen
	loeschen(bereich, pfad) { this.fehlt('loeschen'); }

	// Bereich nachschlagen; unbekannt → Fehler
	bereich(name) {
		const b = Object.prototype.hasOwnProperty.call(this.bereiche, name) ? this.bereiche[name] : null;
		if (!b) throw new Error(this.constructor.name + ': unbekannter Bereich „' + name + '“');
		return b;
	}

	// Pfad prüfen: relativ, keine leeren Teile, kein „.“ oder „..“; Ergebnis als Text
	static pfad(pfad) {
		const p = String(pfad == null ? '' : pfad);
		if (!p || p.split('/').some(t => t === '' || t === '.' || t === '..')) throw new Error('C_MedienSpeicher: ungültiger Pfad „' + p + '“');
		return p;
	}

	// Pfad für eine URL: jeder Teil einzeln kodiert, die Schrägstriche bleiben
	static pfadUrl(pfad) {
		return String(pfad).split('/').map(encodeURIComponent).join('/');
	}

	fehlt(methode) {
		throw new Error(this.constructor.name + ' implementiert ' + methode + '() nicht.');
	}
}
