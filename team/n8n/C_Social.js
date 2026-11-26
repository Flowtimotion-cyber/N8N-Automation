// Social: Logik für „Eigenes Video hochladen“ und „Ideen & starke Mitbewerber-Posts“ im Team-Portal
// (n8n-Workflow „TEAM: Social-Upload“, Webhook team-social). Läuft im n8n-Code-Knoten (eingebettet von
// team/n8n/bauen-social.mjs) und in Node (Tests). Kein Netzwerk, kein require.
//
// C_Social dient als Namespace: nur statische Konstanten und Funktionen, es wird kein Objekt angelegt.
// Innerhalb der Klasse steht bewusst „C_Social.“ statt „this.“, damit die Funktionen auch als Callback richtig arbeiten.
export class C_Social {
	constructor() {
		throw new Error('C_Social ist ein Namespace (nur statische Elemente) und wird nicht angelegt.');
	}

	static AKTIONEN       = ['laden', 'idee_speichern', 'idee_loeschen', 'idee_bild_url', 'upload_url', 'upload_status', 'upload_loeschen'];
	static AGENT_AKTIONEN = ['laden', 'upload_status'];            // Agenten (Medien-Cutter) lesen und melden den Stand
	static KANAELE        = ['LinkedIn', 'Instagram', 'YouTube', 'TikTok', 'Facebook', 'Sonstiges'];
	static IDEE_STATUS    = ['neu', 'geprüft', 'umgesetzt', 'verworfen'];
	static UPLOAD_STATUS  = ['hochgeladen', 'beauftragt', 'geschnitten', 'fehler'];
	static VIDEO_ENDUNGEN = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];
	static BILD_ENDUNGEN  = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
	static MAX_BYTES      = 2 * 1024 * 1024 * 1024;                // 2 GB, wie der Bucket „medien-roh“
	static MAX_BILD_BYTES = 20 * 1024 * 1024;                      // 20 MB je Bild im Bucket „social-ideen“
	static BUCKET         = 'medien-roh';                          // privat: Rohvideos
	static BILD_BUCKET    = 'social-ideen';                        // öffentlich: Bilder zu Ideen (Screenshots fremder Beiträge, eigene Motive)
	static BILD_PFAD_RE   = /^ideen\/\d{4}\/\d{2}\/bild_[a-z0-9]{6,30}_[A-Za-z0-9._-]{1,80}$/;

	/** Text bereinigen: Zeilenenden vereinheitlichen, trimmen, auf n Zeichen kürzen. */
	static txt(v, n) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n); }

	/** n zufällige Zeichen aus [a-z0-9]. */
	static rnd(n) { let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); }

	/** Fehlerergebnis für den Workflow (Zweig „fehler“). */
	static fehler(code, text) { return { aktion: 'fehler', code, antwort: { ok: false, fehler: text } }; }

	/** Neue ID im Portal-Format: Präfix_Zeit36Zufall6 (wie neueId in der Portal-API). */
	static neueId(praefix) { return praefix + '_' + Date.now().toString(36) + C_Social.rnd(6); }

	/** Nur https-Links zu Beiträgen, Profilen, Artikeln. Kein javascript:, keine Mailadressen. */
	static linkGueltig(u) {
		const s = String(u || '').trim();
		if (s.length < 12 || s.length > 1000) return false;
		try { const x = new URL(s); return x.protocol === 'https:' && !!x.hostname.includes('.'); } catch (e) { return false; }
	}

	/** Dateiname für den Bucket: nur Buchstaben, Ziffern, Punkt, Minus, Unterstrich. Umlaute werden ersetzt. */
	static sicherDateiname(name) {
		const s = String(name || '').trim().replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
			.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
		return s || 'video';
	}

	/** Endung einer Datei (klein, ohne Punkt). */
	static endung(name) { const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }

	/** Pfad im Bucket: JJJJ/MM/<upload_id>_<dateiname>. */
	static uploadPfad(uploadId, dateiname, jetzt) {
		const d = new Date(Number(jetzt) || Date.now());
		return d.getUTCFullYear() + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + uploadId + '_' + C_Social.sicherDateiname(dateiname);
	}

	/** Anfrage aus dem Portal prüfen. ich = Zeile aus team_mitglieder (oder null). Liefert die Daten für die Knoten. */
	static anfrage(ich, aktion, daten, jetzt) {
		const S = C_Social;
		const d = daten && typeof daten === 'object' ? daten : {};
		if (!ich || !ich.mitglied_id || ich.status === 'gesperrt') return S.fehler(401, 'Dein Zugang ist ungültig. Bitte lade das Portal neu.');
		if (!S.AKTIONEN.includes(aktion)) return S.fehler(400, 'Unbekannte Aktion.');
		const agent = ich.typ === 'agent' || ich.rolle === 'agent';
		if (agent && !S.AGENT_AKTIONEN.includes(aktion)) return S.fehler(403, 'Agenten lesen hier nur und melden den Stand ihrer Aufträge.');
		const wer = ich.mitglied_id;
		const r = { aktion, wer, mitglied_id: wer, admin: ich.rolle === 'admin' };

		if (aktion === 'laden') return r;

		if (aktion === 'idee_speichern') {
			// Drei Arten: Link zu einem starken Beitrag, Freitext-Idee ohne Link, Bild (Screenshot oder eigenes Motiv). Mindestens eins davon.
			const link = S.txt(d.link, 1000);
			if (link && !S.linkGueltig(link)) return S.fehler(400, 'Der Link muss vollständig sein und mit https beginnen (Beitrag, Reel, Artikel oder Profil).');
			const bild_pfad = S.BILD_PFAD_RE.test(String(d.bild_pfad || '')) ? String(d.bild_pfad) : '';
			const titel = S.txt(d.titel, 200), warum_stark = S.txt(d.warum_stark, 2000), thema_fuer_uns = S.txt(d.thema_fuer_uns, 500);
			if (!link && !bild_pfad && !titel && !warum_stark) return S.fehler(400, 'Bitte einen Link einfügen, ein Bild hochladen oder die Idee kurz beschreiben.');
			const art = bild_pfad ? 'bild' : (link ? 'link' : 'idee');
			const status = S.IDEE_STATUS.includes(d.status) ? d.status : 'neu';
			const kanal = S.KANAELE.includes(d.kanal) ? d.kanal : (link ? S.kanalAusLink(link) : 'Sonstiges');
			const id = /^idee_[a-z0-9]{6,30}$/.test(String(d.idee_id || '')) ? String(d.idee_id) : S.neueId('idee');
			r.idee = { idee_id: id, art, link, bild_pfad, titel, quelle: S.txt(d.quelle, 200), kanal, warum_stark, thema_fuer_uns, status,
				post_id: /^p_[a-z0-9]{6,30}$/.test(String(d.post_id || '')) ? String(d.post_id) : '' };
			if (!r.idee.titel) r.idee.titel = link ? S.titelAusLink(link) : (warum_stark.slice(0, 80) || (bild_pfad ? 'Bild' : 'Idee'));
			return r;
		}
		if (aktion === 'idee_loeschen') {
			if (!/^idee_[a-z0-9]{6,30}$/.test(String(d.idee_id || ''))) return S.fehler(400, 'Idee nicht gefunden.');
			r.idee_id = String(d.idee_id);
			return r;
		}
		if (aktion === 'idee_bild_url') {
			const dateiname = S.txt(d.dateiname, 200);
			const groesse = Number(d.groesse) || 0;
			const e = S.endung(dateiname);
			if (!S.BILD_ENDUNGEN.includes(e)) return S.fehler(400, 'Bitte eine Bilddatei wählen (' + S.BILD_ENDUNGEN.map(x => '.' + x).join(', ') + ').');
			if (groesse <= 0) return S.fehler(400, 'Die Datei ist leer.');
			if (groesse > S.MAX_BILD_BYTES) return S.fehler(400, 'Das Bild ist größer als 20 MB.');
			const id = S.neueId('bild');
			r.bild = { bucket: S.BILD_BUCKET, pfad: 'ideen/' + S.uploadPfad(id, dateiname, jetzt), dateiname, groesse, mime: S.bildMime(e, d.mime) };
			return r;
		}
		if (aktion === 'upload_url') {
			const dateiname = S.txt(d.dateiname, 200);
			const groesse = Number(d.groesse) || 0;
			const e = S.endung(dateiname);
			if (!S.VIDEO_ENDUNGEN.includes(e)) return S.fehler(400, 'Bitte eine Videodatei wählen (' + S.VIDEO_ENDUNGEN.map(x => '.' + x).join(', ') + ').');
			if (groesse <= 0) return S.fehler(400, 'Die Datei ist leer.');
			if (groesse > S.MAX_BYTES) return S.fehler(400, 'Die Datei ist größer als 2 GB. Bitte vorher kürzen oder komprimieren.');
			if (d.einwilligung !== true) return S.fehler(400, 'Ohne das Häkchen „Die gezeigten Personen sind einverstanden“ wird nichts hochgeladen.');
			const thema = S.txt(d.thema, 160);
			if (thema.length < 3) return S.fehler(400, 'Bitte ein Thema angeben (mindestens 3 Zeichen).');
			const id = S.neueId('up');
			r.upload = { upload_id: id, bucket: S.BUCKET, pfad: S.uploadPfad(id, dateiname, jetzt), dateiname, groesse, mime: S.mimeFuer(e, d.mime),
				thema, kanal: S.KANAELE.includes(d.kanal) ? d.kanal : 'LinkedIn', kontext: S.txt(d.kontext, 2000), stil: 'momentum', einwilligung: true };
			return r;
		}
		if (aktion === 'upload_status') {
			if (!/^up_[a-z0-9]{6,30}$/.test(String(d.upload_id || ''))) return S.fehler(400, 'Upload nicht gefunden.');
			if (!S.UPLOAD_STATUS.includes(d.status)) return S.fehler(400, 'Unbekannter Status.');
			r.upload_id = String(d.upload_id); r.status = d.status;
			r.run_id = /^run_[A-Za-z0-9_-]{4,60}$/.test(String(d.run_id || '')) ? String(d.run_id) : null;
			r.fehler = d.status === 'fehler' ? S.txt(d.fehler, 500) || 'Unbekannter Fehler' : null;
			return r;
		}
		if (aktion === 'upload_loeschen') {
			if (!r.admin) return S.fehler(403, 'Rohvideos löscht nur Timo (Admin).');
			if (!/^up_[a-z0-9]{6,30}$/.test(String(d.upload_id || ''))) return S.fehler(400, 'Upload nicht gefunden.');
			r.upload_id = String(d.upload_id);
			return r;
		}
		return S.fehler(400, 'Unbekannte Aktion.');
	}

	/** Kanal am Link erkennen, sonst „Sonstiges“. */
	static kanalAusLink(link) {
		let h = ''; try { h = new URL(link).hostname.toLowerCase(); } catch (e) { return 'Sonstiges'; }
		if (/(^|\.)linkedin\.com$/.test(h)) return 'LinkedIn';
		if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
		if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'YouTube';
		if (/(^|\.)tiktok\.com$/.test(h)) return 'TikTok';
		if (/(^|\.)(facebook\.com|fb\.com)$/.test(h)) return 'Facebook';
		return 'Sonstiges';
	}

	/** Lesbarer Ersatztitel aus dem Link (Host + Anfang des Pfads). */
	static titelAusLink(link) {
		try { const u = new URL(link); return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).slice(0, 80); } catch (e) { return 'Link'; }
	}

	/** MIME-Typ aus der Endung; was der Browser meldet, zählt nur, wenn es ein Video-Typ ist. */
	static mimeFuer(e, gemeldet) {
		const g = String(gemeldet || '');
		if (/^video\/[a-z0-9.+-]+$/i.test(g)) return g.toLowerCase();
		return { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' }[e] || 'application/octet-stream';
	}

	/** MIME-Typ eines Bildes aus der Endung; was der Browser meldet, zählt nur, wenn es ein Bild-Typ ist. */
	static bildMime(e, gemeldet) {
		const g = String(gemeldet || '');
		if (/^image\/[a-z0-9.+-]+$/i.test(g)) return g.toLowerCase();
		return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[e] || 'application/octet-stream';
	}

	/** Öffentliche Adresse eines Bildes im Bucket social-ideen. */
	static bildUrl(storageBasis, pfad) {
		return pfad ? String(storageBasis).replace(/\/+$/, '') + '/object/public/' + C_Social.BILD_BUCKET + '/' + String(pfad).split('/').map(encodeURIComponent).join('/') : null;
	}

	/** Antwort von storage/v1/object/upload/sign/... in eine vollständige PUT-Adresse verwandeln. */
	static signierteUrl(storageBasis, antwort) {
		const b = antwort && typeof antwort === 'object' ? antwort : {};
		const u = String(b.url || '');
		if (!u) return null;
		return /^https?:\/\//.test(u) ? u : String(storageBasis).replace(/\/+$/, '') + '/' + u.replace(/^\/+/, '');
	}

	/** Auftragstext für den Medien-Cutter aus einem Upload (kommt aus dem Portal in auftrag_starten). */
	static auftragsText(u) {
		const x = u || {};
		return ['Rohvideo im Momentum-Stil für ' + (x.kanal || 'LinkedIn') + ' schneiden: ' + (x.thema || ''),
			'Datei: ' + (x.bucket || C_Social.BUCKET) + '/' + (x.pfad || ''), x.kontext ? 'Kontext: ' + x.kontext : '',
			'Erwartet: 3–5 Clip-Vorschläge mit Zeitmarken als Notiz, dann Rohschnitt mit Untertiteln, Bauchbinden und Logo nach Momentum-Marke in 9:16 und 16:9. Nichts veröffentlichen, alles zur Abnahme.']
			.filter(Boolean).join('\n').slice(0, 2000);
	}

	/** Antwort für „laden“: Listen aufbereiten, nichts Sensibles (Tokens gibt es hier nicht, Pfade sind intern). */
	static ladenAntwort(ideen, uploads, ich, storageBasis) {
		const S = C_Social;
		const admin = !!(ich && ich.rolle === 'admin');
		const I = (ideen || []).filter(x => x && x.idee_id).sort((a, b) => String(b.geaendert || '').localeCompare(String(a.geaendert || '')))
			.map(i => ({ ...i, art: i.art || (i.bild_pfad ? 'bild' : (i.link ? 'link' : 'idee')), bild_url: i.bild_pfad ? S.bildUrl(storageBasis || '', i.bild_pfad) : null }));
		const U = (uploads || []).filter(x => x && x.upload_id && x.status !== 'geloescht').sort((a, b) => String(b.erstellt || '').localeCompare(String(a.erstellt || '')))
			.map(u => ({ upload_id: u.upload_id, dateiname: u.dateiname, groesse: Number(u.groesse) || 0, thema: u.thema, kanal: u.kanal, kontext: u.kontext, status: u.status,
				run_id: u.run_id || null, post_id: u.post_id || null, fehler: u.fehler || null, erstellt: u.erstellt, erstellt_von: u.erstellt_von, aufbewahren_bis: u.aufbewahren_bis,
				pfad: admin || (ich && ich.typ === 'agent') ? u.pfad : undefined, bucket: u.bucket }));
		return { ok: true, ideen: I, uploads: U, kanaele: S.KANAELE, idee_status: S.IDEE_STATUS, max_bytes: S.MAX_BYTES, max_bild_bytes: S.MAX_BILD_BYTES, stand: new Date().toISOString() };
	}
}
