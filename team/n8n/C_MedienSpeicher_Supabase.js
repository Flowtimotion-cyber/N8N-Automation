// Supabase-Variante von C_MedienSpeicher: jeder Bereich ist ein Bucket gleichen Namens im Supabase-Storage.
// Aufträge gehen an <Supabase-URL>/storage/v1/<pfad> (HTTP-Knoten mit dem Credential „Supabase account“, service_role).
// Ob ein Bucket öffentlich ist, wird in Supabase selbst eingestellt; die Angabe in „bereiche“ muss dazu passen.
class C_MedienSpeicher_Supabase extends C_MedienSpeicher {
	// basis: https://<projekt>.supabase.co/storage/v1/
	constructor(basis, bereiche) {
		super('supabase', bereiche);
		this.basis = String(basis || '').replace(/\/+$/, '');
	}

	uploadAdresseHolen(bereich, pfad) {
		this.bereich(bereich);
		return { methode: 'POST', pfad: 'object/upload/sign/' + bereich + '/' + C_MedienSpeicher.pfadUrl(C_MedienSpeicher.pfad(pfad)), body: {} };
	}

	// Antwort von storage/v1/object/upload/sign/… : { url: '/object/upload/sign/…?token=…' }
	uploadAdresse(antwort) {
		const b = antwort && typeof antwort === 'object' ? antwort : {};
		const u = String(b.url || '');
		if (!u) return null;
		return /^https?:\/\//.test(u) ? u : this.basis + '/' + u.replace(/^\/+/, '');
	}

	// Ohne Pfad: null (Zeilen ohne Bild). Der Pfad wird hier nicht abgelehnt, sondern nur kodiert, damit eine
	// alte, ungewöhnliche Zeile das Laden der Liste nicht verhindert.
	oeffentlicheAdresse(bereich, pfad) {
		if (!this.bereich(bereich).oeffentlich) throw new Error('C_MedienSpeicher_Supabase: Bereich „' + bereich + '“ ist privat und hat keine öffentlichen Adressen');
		return pfad ? this.basis + '/object/public/' + bereich + '/' + C_MedienSpeicher.pfadUrl(pfad) : null;
	}

	loeschen(bereich, pfad) {
		this.bereich(bereich);
		return { methode: 'DELETE', pfad: 'object/' + bereich + '/' + C_MedienSpeicher.pfadUrl(C_MedienSpeicher.pfad(pfad)), body: {} };
	}
}
