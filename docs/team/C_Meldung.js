// C_Meldung: alle Meldungen des Team-Portals an einer Stelle (Namespace-Klasse, nur static).
//
//	C_Meldung.hinweis(text)            kurz unten (2,6 s), z. B. „Gespeichert“; ein Klick schließt
//	C_Meldung.mitte(text)              mittig (5 s), z. B. „Pfad kopiert“
//	C_Meldung.warnung(text)            mittig, orange, 10 s, Knöpfe „Kopieren“ und „Schließen“
//	C_Meldung.fehler(fehler, vorsatz)  mittig, rot, 10 s, Knöpfe „Kopieren“ und „Schließen“;
//	                                   fehler ist ein Error (dessen message) oder ein Text, vorsatz wird mit „: “ vorangestellt
//	C_Meldung.amElement(el, text)      Eingabehinweis direkt am Element (schwebend, verschiebt nichts), z. B. „Die Nachricht ist leer.“
//	C_Meldung.schliessen()
//
// Warnungen und Fehler bleiben stehen, solange die Maus darauf liegt; danach laufen die restlichen Sekunden weiter (mindestens 2 s).
// „Kopieren“ legt die Meldung mit Zeitpunkt und Bereich (#/tab/…) in die Zwischenablage, z. B. für eine Nachricht an den Admin.
// Das Element ist ein Popover (popover="manual"): so liegt es in der obersten Ebene über einem offenen Dialog (showModal).
// Es wird bei jeder Meldung neu geöffnet, damit es auch über einem später geöffneten Dialog liegt.
// Das Element heißt weiter #toast (Browsertests lesen es aus); das Aussehen steht im CSS von index.html.
class C_Meldung {
	static DAUER = { hinweis: 2600, mitte: 5000, warnung: 10000, fehler: 10000, amElement: 10000 };
	static #timer = 0;
	static #ende = 0;		// Zeitpunkt, zu dem die Meldung verschwindet
	static #rest = 0;		// verbleibende Zeit, solange angehalten
	static #text = '';

	static hinweis(text) {
		C_Meldung.#zeigen('hinweis', text);
	}

	static mitte(text) {
		C_Meldung.#zeigen('mitte', text);
	}

	static warnung(text) {
		C_Meldung.#zeigen('warnung', text);
	}

	static fehler(fehler, vorsatz = '') {
		const text = C_Meldung.textVon(fehler);
		C_Meldung.#zeigen('fehler', vorsatz ? vorsatz + ': ' + text : text);
	}

	// Text einer Fehlerursache: Error → message, sonst als Text
	static textVon(fehler) {
		if (fehler && typeof fehler === 'object' && 'message' in fehler) return String(fehler.message || 'Unbekannter Fehler');
		return String(fehler ?? 'Unbekannter Fehler');
	}

	// Eingabehinweis direkt am betroffenen Element (Eingabefeld, Auswahlliste, Personen-Chips …): schwebt unter dem Element
	// (oder darüber, wenn unten kein Platz ist), verschiebt nichts im Dialog. Das Element bekommt einen Rahmen und den Fokus.
	// Der Hinweis verschwindet, sobald man das Element ändert oder anklickt, beim Klick auf den Hinweis, beim Schließen des Dialogs
	// oder nach 10 s; der Rahmen bleibt bis zur nächsten Änderung. Ohne sichtbares Element: normaler Hinweis unten.
	static amElement(ziel, text) {
		const el = typeof ziel === 'string' ? document.querySelector(ziel) : ziel;
		C_Meldung.#amWeg();
		if (!el || !el.isConnected || !el.getClientRects().length) return C_Meldung.hinweis(text);
		const h = document.createElement('div');
		h.id = 'm_am';
		h.className = 'm-am';
		h.setAttribute('popover', 'manual');
		h.setAttribute('role', 'alert');
		h.textContent = text;
		// in den Dialog des Elements (sonst inert, siehe #einhaengen)
		(el.closest('dialog[open]') || document.body).appendChild(h);
		if (h.showPopover) h.showPopover();
		el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
		el.classList.add('m-markiert');
		el.setAttribute('aria-describedby', 'm_am');
		const feld = el.matches('input, textarea, select') ? el : null;
		if (feld) feld.focus({ preventScroll: true });
		const setzen = () => C_Meldung.#amSetzen(h, el);
		setzen();
		const weg = () => C_Meldung.#amWeg();
		const geaendert = () => {
			el.classList.remove('m-markiert');
			weg();
		};
		const ereignisse = feld ? ['input', 'change'] : ['input', 'change', 'click'];
		for (const t of ereignisse) el.addEventListener(t, geaendert);
		addEventListener('scroll', setzen, true);
		addEventListener('resize', setzen);
		h.onclick = weg;
		// close kommt verzögert: Ist der Dialog inzwischen wieder offen (gleich neu geöffnet), gilt es nicht
		const dlg = el.closest('dialog');
		const dlgZu = () => {
			if (!dlg.open) geaendert();
		};
		if (dlg) dlg.addEventListener('close', dlgZu);
		const timer = setTimeout(weg, C_Meldung.DAUER.amElement);
		C_Meldung.#am = { h, el, aufraeumen: () => {
			clearTimeout(timer);
			for (const t of ereignisse) el.removeEventListener(t, geaendert);
			removeEventListener('scroll', setzen, true);
			removeEventListener('resize', setzen);
			if (dlg) dlg.removeEventListener('close', dlgZu);
			el.removeAttribute('aria-describedby');
		} };
	}

	static #am = null;

	static #amWeg() {
		const a = C_Meldung.#am;
		if (!a) return;
		C_Meldung.#am = null;
		a.aufraeumen();
		a.h.remove();
	}

	// Lage des Hinweises: unter dem Element, linksbündig, Pfeil zeigt auf den Anfang des Elements
	static #amSetzen(h, el) {
		const r = el.getBoundingClientRect(), b = h.offsetWidth, hoehe = h.offsetHeight, abstand = 10;
		const unten = r.bottom + abstand + hoehe <= innerHeight - 8 || r.top - abstand - hoehe < 8;
		const links = Math.min(Math.max(r.left, 8), innerWidth - b - 8);
		h.classList.toggle('oben', !unten);
		h.style.left = links + 'px';
		h.style.top = (unten ? r.bottom + abstand : r.top - abstand - hoehe) + 'px';
		h.style.setProperty('--pfeil', Math.min(Math.max(r.left + Math.min(24, r.width / 2) - links, 14), b - 14) + 'px');
	}

	static schliessen() {
		clearTimeout(C_Meldung.#timer);
		const e = C_Meldung.#element();
		e.classList.remove('show');
		e.onmouseenter = e.onmouseleave = null;
	}

	static #element() {
		let e = document.getElementById('toast');
		if (!e) {
			e = document.createElement('div');
			e.id = 'toast';
			e.setAttribute('popover', 'manual');
			document.body.appendChild(e);
		}
		return e;
	}

	// Ein modaler Dialog macht alles außerhalb von ihm inaktiv (inert): Die Meldung läge zwar sichtbar obenauf,
	// ihre Knöpfe ließen sich aber nicht anklicken. Deshalb hängt sie, solange ein Dialog offen ist, in diesem Dialog;
	// schließt er, wandert eine noch sichtbare Meldung zurück in die Seite.
	static #einhaengen(e) {
		const offen = [...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal'));
		const ziel = offen.length ? offen[offen.length - 1] : document.body;
		if (e.parentNode !== ziel) {
			ziel.appendChild(e);
			if (ziel !== document.body) {
				// close kommt verzögert: Ist der Dialog inzwischen wieder offen, bleibt die Meldung darin
				const zu = () => {
					if (ziel.open) return;
					ziel.removeEventListener('close', zu);
					if (e.parentNode !== ziel) return;
					document.body.appendChild(e);
					if (e.classList.contains('show') && e.showPopover) e.showPopover();
				};
				ziel.addEventListener('close', zu);
			}
		}
	}

	static #zeigen(art, text) {
		const e = C_Meldung.#element();
		C_Meldung.#einhaengen(e);
		if (e.showPopover) {
			if (e.matches(':popover-open')) e.hidePopover();
			e.showPopover();
		}
		C_Meldung.#text = String(text ?? '');
		const mitKnoepfen = art === 'warnung' || art === 'fehler';
		for (const k of ['mitte', 'warnung', 'fehler']) e.classList.toggle(k, k === art);
		e.setAttribute('role', mitKnoepfen ? 'alert' : 'status');
		if (mitKnoepfen) {
			e.innerHTML = '<div class="m-text"></div><div class="m-knoepfe"><button type="button" class="m-kopieren">Kopieren</button><button type="button" class="m-schliessen">Schließen</button></div>';
			e.querySelector('.m-text').textContent = (art === 'fehler' ? '⚠ ' : '') + C_Meldung.#text;
			e.querySelector('.m-kopieren').onclick = ev => C_Meldung.#kopieren(ev.currentTarget);
			e.querySelector('.m-schliessen').onclick = () => C_Meldung.schliessen();
			e.onclick = null;
			// anhalten, solange die Maus darauf liegt
			e.onmouseenter = () => C_Meldung.#anhalten();
			e.onmouseleave = () => C_Meldung.#weiter();
		} else {
			e.textContent = C_Meldung.#text;
			e.onclick = () => C_Meldung.schliessen();
			e.onmouseenter = e.onmouseleave = null;
		}
		e.classList.add('show');
		C_Meldung.#starten(C_Meldung.DAUER[art]);
	}

	static #starten(ms) {
		clearTimeout(C_Meldung.#timer);
		C_Meldung.#rest = 0;
		C_Meldung.#ende = Date.now() + ms;
		C_Meldung.#timer = setTimeout(() => C_Meldung.schliessen(), ms);
	}

	static #anhalten() {
		if (C_Meldung.#rest) return;
		clearTimeout(C_Meldung.#timer);
		C_Meldung.#rest = Math.max(C_Meldung.#ende - Date.now(), 2000);
	}

	static #weiter() {
		if (!C_Meldung.#rest) return;
		C_Meldung.#starten(C_Meldung.#rest);
	}

	static async #kopieren(knopf) {
		const text = C_Meldung.#text + '\n\n(Team-Portal, ' + new Date().toLocaleString('de-DE') + (location.hash ? ', ' + location.hash : '') + ')';
		try {
			await navigator.clipboard.writeText(text);
			knopf.textContent = 'Kopiert ✓';
		} catch (x) {
			// ohne Zugriff auf die Zwischenablage: Text markieren, dann Strg+C
			const r = document.createRange();
			r.selectNodeContents(knopf.closest('#toast').querySelector('.m-text'));
			const s = getSelection();
			s.removeAllRanges();
			s.addRange(r);
			knopf.textContent = 'Markiert – Strg+C';
		}
	}
}
