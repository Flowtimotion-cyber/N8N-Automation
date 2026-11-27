// Browsertest: Nachrichten im Team-Portal gegen den Testserver (Testadapter, kein n8n, keine Produktivdaten).
// Braucht Playwright („playwright“ oder „playwright-core“ mit installiertem Chrome); ohne wird übersprungen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serverStarten, post, REPO } from '../../office/test/hilfe.mjs';
import { TOKENS } from '../../office/dev/testdaten.mjs';

const SHOTS = join(REPO, 'nachrichten', 'screenshots');
const DESKTOP = { width: 1280, height: 900 }, MOBIL = { width: 390, height: 844 };
let S, B, fehler = [];

function playwright() {
	const orte = [process.cwd() + '/'];
	try { orte.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch (e) {}
	for (const name of ['playwright', 'playwright-core']) {
		for (const o of orte) {
			try { return { pw: createRequire(o)(name), name }; } catch (e) {}
		}
	}
	return null;
}
before(async () => {
	mkdirSync(SHOTS, { recursive: true });
	S = await serverStarten({ tempo: 0 });
	const p = playwright();
	if (p) {
		try { B = await p.pw.chromium.launch(p.name === 'playwright-core' ? { channel: 'chrome' } : {}); } catch (e) { B = null; }
	}
});
// Mit dem installierten Chrome (playwright-core) kehrt close() unter Windows teils nicht zurück: höchstens 5 Sekunden warten
// und hält danach den Prozess am Leben; dann nach dem Melden aller Ergebnisse beenden.
after(async () => {
	if (S) await S.stop();
	if (B) {
		const zu = await Promise.race([B.close().then(() => true), new Promise(r => setTimeout(() => r(false), 5000))]);
		if (!zu) setTimeout(() => process.exit(process.exitCode || 0), 2000).unref();
	}
});

async function seite(vp, name) {
	const ctx = await B.newContext({ viewport: vp, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
	const p = await ctx.newPage();
	p.on('pageerror', e => fehler.push(name + ' pageerror: ' + e.message));
	p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Blocked script execution/.test(m.text())) fehler.push(name + ' console: ' + m.text()); });
	await p.route(u => !u.href.startsWith(S.base), r => r.abort());
	const um = (muster, ziel) => p.route(muster, async r => {
		const req = r.request();
		const res = await fetch(S.base + ziel, { method: 'POST', headers: { 'content-type': req.headers()['content-type'] || 'text/plain' }, body: req.postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	await um(/webhook\/team-api-v2/, '/api/team');
	await um(/webhook\/team-msgs/, '/api/nachrichten');
	await p.route(/webhook\/(?!team-api-v2|team-msgs)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"fehler":"Im Test nicht nachgebildet."}' }));
	return p;
}
const oeffnen = async (p, wer, hash) => {
	await p.goto(S.base + '/team/?z=' + TOKENS[wer] + (hash || '#/tab/start'), { waitUntil: 'networkidle' });
	await p.waitForTimeout(300);
};
const zustand = async () => (await fetch(S.base + '/api/test/zustand').then(r => r.json())).nachrichten;
const shot = (p, name, vp) => p.screenshot({ path: join(SHOTS, (vp.width > 600 ? 'desktop' : 'mobil') + '-' + name + '.png') });

test('Browser verfügbar', t => { if (!B) t.skip('Playwright fehlt'); });

test('Ohne Datenbank: Portal läuft, kein Nachrichten-Symbol', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: false });
	const p = await seite(DESKTOP, 'ohne DB');
	await oeffnen(p, 'm_kurt');
	assert.equal(await p.locator('#msgsSlot').count(), 1);
	assert.equal(await p.locator('#msgsIco').count(), 0);
	assert.equal(await p.evaluate(() => document.querySelector('#msgsSlot').innerHTML), '');
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Nicht eingerichtet (Datenbank fehlt bzw. n8n-Workflow fehlt): Senden zeigt den Verweis auf nachrichten/README.md', async t => {
	if (!B) return t.skip();
	const senden = async p => {
		await oeffnen(p, 'm_kurt', '#/tab/team');
		await p.locator('#msgneu').click();
		await p.locator('#ms_e input[value="m_kurt"]').check();
		await p.locator('#ms_t').fill('Test');
		await p.locator('#ms_f [type=submit]').click();
		await p.waitForFunction(() => /eingerichtet/.test(document.querySelector('#toast').textContent));
		return p.locator('#toast').textContent();
	};
	const erwartet = /Der Nachrichtendienst ist noch nicht eingerichtet\. Wie das geht, steht im Repo N8N-Automation in der Datei nachrichten\/README\.md, Abschnitt „Einrichten“/;
	// 1. Datenbank fehlt: Antwort kommt vom Workflow (Nachbildung)
	await post(S.base, '/api/test/nachrichten', { eingerichtet: false });
	let p = await seite(DESKTOP, 'ohne DB senden');
	assert.match(await senden(p), erwartet);
	assert.equal(await p.locator('#dlg').evaluate(d => d.open), true, 'Dialog bleibt offen, der Text geht nicht verloren');
	await p.close();
	// 2. n8n-Workflow fehlt oder ist nicht veröffentlicht: n8n antwortet 404 „webhook not registered“
	p = await seite(DESKTOP, 'ohne Workflow');
	await p.route(/webhook\/team-msgs/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":404,"message":"The requested webhook \\"POST team-msgs\\" is not registered."}' }));
	assert.match(await senden(p), erwartet);
	assert.equal(await p.locator('#msgsIco').count(), 0, 'ohne Workflow auch kein Symbol');
	await p.close();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	fehler = fehler.filter(f => !/404/.test(f));
	assert.deepEqual(fehler, []);
});

test('Senden, Symbol rot/grau, lesen, als ungelesen schließen, Empfangszeit', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	// Timo schreibt an Kurt und an sich selbst
	const p = await seite(DESKTOP, 'Timo');
	await oeffnen(p, 'm_timo', '#/tab/team');
	assert.equal(await p.locator('#msgsIco').count(), 0, 'leere Liste: kein Symbol');
	await p.locator('#msgneu').click();
	await p.locator('#ms_e input[value="m_kurt"]').check();
	await p.locator('#ms_e input[value="m_timo"]').check();
	await p.locator('#ms_t').fill('Bitte morgen **Angebot** prüfen.\n\n- Punkt eins\n- Punkt zwei');
	await shot(p, 'nachricht-senden', DESKTOP);
	await p.locator('#ms_f [type=submit]').click();
	await p.waitForSelector('#msgsIco.rot');
	assert.equal(await p.locator('#dlg').evaluate(d => d.open), false);
	assert.equal((await p.locator('#msgsIco .msgs-n').textContent()).trim(), '1');
	let z = await zustand();
	assert.equal(z.msgs.length, 1); assert.equal(z.msgs[0].absender, 'm_timo'); assert.deepEqual(z.msgs[0].empfaenger.slice().sort(), ['m_kurt', 'm_timo']);
	// Ohne Empfänger wird nicht gesendet
	await p.locator('#msgneu').click();
	await p.locator('#ms_t').fill('Ohne Empfänger');
	await p.locator('#ms_f [type=submit]').click();
	assert.match(await p.locator('#m_am').textContent(), /mindestens einen Empfänger/, 'Hinweis direkt an der Empfängerliste');
	p.once('dialog', d => d.accept());
	await p.locator('#ms_c').click();
	assert.equal(await p.locator('#dlg').evaluate(d => d.open), false, 'Abbrechen nach Rückfrage');
	await p.close();

	// Kurt: rotes Symbol, Posteingang, lesen
	const k = await seite(DESKTOP, 'Kurt');
	await oeffnen(k, 'm_kurt');
	await k.waitForSelector('#msgsIco.rot');
	await shot(k, 'symbol-rot', DESKTOP);
	await k.locator('#msgsIco').click();
	assert.equal(await k.locator('#msgs_box .msgs-z.neu').count(), 1);
	assert.match(await k.locator('#msgs_box .msgs-z').first().textContent(), /Timo \(Test\).*Bitte morgen Angebot prüfen\. Punkt eins Punkt zwei/);
	await shot(k, 'posteingang', DESKTOP);
	await k.locator('#msgs_box .msgs-z').first().click();
	await k.waitForSelector('#msg_ung:not([disabled])');
	assert.equal(await k.locator('.msgs-text strong').textContent(), 'Angebot');
	assert.equal(await k.locator('.msgs-text li').count(), 2);
	assert.match(await k.locator('.msgs-kopf').textContent(), /Von: Timo \(Test\)/);
	assert.match(await k.locator('.msgs-kopf').textContent(), /An: .*dich/);
	assert.doesNotMatch(await k.locator('.msgs-kopf').textContent(), /Empfangen: –/, 'Empfangszeit steht nach dem Öffnen');
	await shot(k, 'nachricht-lesen', DESKTOP);
	assert.ok(await k.locator('#msgsIco.grau').count(), 'nach dem Öffnen grau');
	z = await zustand();
	const kurtE = z.user.find(u => u.mitglied_id === 'm_kurt'), timoE = z.user.find(u => u.mitglied_id === 'm_timo');
	assert.equal(kurtE.gelesen, true); assert.equal(timoE.gelesen, false, 'Timos Lesestand bleibt');
	const empfangen = z.msgs[0].empfangen.m_kurt; assert.ok(empfangen); assert.equal(z.msgs[0].empfangen.m_timo, undefined);
	// Als ungelesen schließen: Dialog zu, Symbol wieder rot, Empfangszeit bleibt
	await k.locator('#msg_ung').click();
	await k.waitForSelector('#msgsIco.rot');
	assert.equal(await k.locator('#dlg').evaluate(d => d.open), false);
	z = await zustand();
	assert.equal(z.user.find(u => u.mitglied_id === 'm_kurt').gelesen, false);
	assert.equal(z.msgs[0].empfangen.m_kurt, empfangen);
	// Nach dem Neuladen immer noch rot; erneut öffnen und normal schließen → grau, Empfangszeit unverändert
	await k.reload({ waitUntil: 'networkidle' });
	await k.waitForSelector('#msgsIco.rot');
	await k.locator('#msgsIco').click(); await k.locator('#msgs_box .msgs-z').first().click();
	await k.waitForSelector('#msg_ung:not([disabled])');
	await k.locator('#msg_zu').click();
	await k.waitForSelector('#msgsIco.grau');
	assert.equal(await k.locator('#msgsIco .msgs-n').count(), 0);
	await shot(k, 'symbol-grau', DESKTOP);
	assert.equal((await zustand()).msgs[0].empfangen.m_kurt, empfangen);
	// Antworten: Dialog mit Absender vorausgewählt
	await k.locator('#msgsIco').click(); await k.locator('#msgs_box .msgs-z').first().click();
	await k.waitForSelector('#msg_ung:not([disabled])');
	await k.locator('#msg_antw').click();
	assert.deepEqual(await k.locator('#ms_e input:checked').evaluateAll(l => l.map(x => x.value)), ['m_timo']);
	assert.match(await k.locator('#ms_t').inputValue(), /> Bitte morgen \*\*Angebot\*\* prüfen\./);
	await k.close();
	assert.deepEqual(fehler, []);
});

test('Markierung @Vorname: neu markierte Personen (auch man selbst) bekommen eine Nachricht mit Link „hier“', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	const p = await seite(DESKTOP, 'Markierung');
	// Der Testserver kann nur „laden“; Speichern einer Notiz beantwortet der Test selbst
	const gespeichert = [];
	await p.route(/webhook\/team-api-v2/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (b.aktion === 'notiz_speichern') { gespeichert.push(b.daten); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"n_mark"}' }); }
		const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	await oeffnen(p, 'm_timo', '#/tab/notizen');
	await p.locator('#neun').click();
	await p.locator('#n_t').fill('Planung Workshop');
	// @kurt, @Lillien und man selbst (@timo, Wiedervorlage) sind markiert; @alle zählt nicht, mail@kurt.de ist keine Markierung
	await p.locator('#n_i').fill('Hallo @kurt, bitte mit @Lillien abstimmen. @timo @alle\nKontakt: mail@kurt.de');
	await p.locator('#nf [type=submit]').click();
	await p.waitForFunction(() => /benachrichtigt/.test(document.querySelector('#toast').textContent));
	assert.match(await p.locator('#toast').textContent(), /Kurt \(Test\), Lillien \(Test\), Du benachrichtigt/);
	let z = await zustand();
	assert.equal(z.msgs.length, 1, 'eine Nachricht an alle drei');
	assert.equal(z.msgs[0].absender, 'm_timo');
	assert.deepEqual(z.msgs[0].empfaenger.slice().sort(), ['m_kurt', 'm_lillien', 'm_timo']);
	await p.waitForSelector('#msgsIco.rot');
	assert.equal(z.msgs[0].text, '**Timo (Test)** hat Dich [hier](https://flowtimotion-cyber.github.io/N8N-Automation/team/#/notiz/n_mark) markiert.\n\nNotiz: „Planung Workshop“');
	assert.equal(gespeichert.length, 1);
	await p.close();

	// Kurt: Nachricht lesen, „hier“ ist ein Link, der die Notiz im Portal öffnet
	const k = await seite(DESKTOP, 'Markierung Kurt');
	await oeffnen(k, 'm_kurt');
	await k.waitForSelector('#msgsIco.rot');
	await k.locator('#msgsIco').click(); await k.locator('#msgs_box .msgs-z').first().click();
	await k.waitForSelector('#msg_ung:not([disabled])');
	assert.match(await k.locator('.msgs-text').textContent(), /Timo \(Test\) hat Dich hier markiert\.\s*Notiz: „Planung Workshop“/);
	const link = k.locator('.msgs-text a', { hasText: 'hier' });
	assert.equal(await link.getAttribute('href'), '#/notiz/n_mark', 'Portal-Link bleibt im Portal');
	await shot(k, 'markierung', DESKTOP);
	await k.close();
	assert.deepEqual(fehler, []);
});

test('Markierung: erneutes Speichern mit denselben Markierungen schickt nichts, eine neue Markierung schon', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	const p = await seite(DESKTOP, 'Markierung 2');
	await p.route(/webhook\/team-api-v2/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (b.aktion === 'notiz_speichern') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"n_3"}' });
		const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	// Notiz n_3 aus den Testdaten bearbeiten: erst ohne neue Markierung, dann mit @murat
	await oeffnen(p, 'm_timo', '#/notiz/n_3');
	await p.locator('#nedit').click();
	await p.locator('#n_i').fill('Synthetisches Beispiel ohne Markierung.');
	await p.locator('#nf [type=submit]').click();
	await p.waitForTimeout(800);
	assert.equal((await zustand()).msgs.length, 0, 'keine Markierung, keine Nachricht');
	await p.locator('#nedit').click();
	await p.locator('#n_i').fill('Bitte @Murat ansehen.');
	await p.locator('#nf [type=submit]').click();
	await p.waitForFunction(() => /benachrichtigt/.test(document.querySelector('#toast').textContent));
	const z = await zustand();
	assert.equal(z.msgs.length, 1); assert.deepEqual(z.msgs[0].empfaenger, ['m_murat']);
	assert.match(z.msgs[0].text, /\(https:\/\/flowtimotion-cyber\.github\.io\/N8N-Automation\/team\/#\/notiz\/n_3\)/);
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Markierung: „hier“ öffnet die Notiz, auch wenn sie gerade schon die aktuelle Adresse ist', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	const p = await seite(DESKTOP, 'Link hier');
	await p.route(/webhook\/team-api-v2/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (b.aktion === 'notiz_speichern') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"n_3"}' });
		const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	// Wie im echten Ablauf: Notiz offen, sich selbst markieren, speichern – die Adresse ist danach #/notiz/n_3
	await oeffnen(p, 'm_timo', '#/notiz/n_3');
	await p.locator('#nedit').click();
	await p.locator('#n_i').fill('Wiedervorlage für @timo');
	await p.locator('#nf [type=submit]').click();
	await p.waitForSelector('#msgsIco.rot');
	assert.equal(await p.evaluate(() => location.hash), '#/notiz/n_3');
	const hier = async () => {
		await p.locator('#msgsIco').click(); await p.locator('#msgs_box .msgs-z').first().click();
		await p.waitForSelector('#msg_ung:not([disabled])');
		await p.locator('.msgs-text a', { hasText: 'hier' }).click();
		await p.waitForTimeout(400);
	};
	await hier();
	assert.equal(await p.locator('#dlg').evaluate(d => d.open), false, 'Nachricht geschlossen');
	assert.equal(await p.evaluate(() => document.body.dataset.tab), 'notizen');
	assert.match(await p.locator('#main').textContent(), /Kundenprofil Müller GmbH/);
	// von woanders aus (Übersicht) führt „hier“ ebenfalls zur Notiz
	await p.locator('nav.tabs button[data-tab="start"]').click();
	await hier();
	assert.equal(await p.locator('#dlg').evaluate(d => d.open), false);
	assert.equal(await p.evaluate(() => location.hash), '#/notiz/n_3');
	assert.equal(await p.evaluate(() => document.body.dataset.tab), 'notizen');
	assert.match(await p.locator('#main').textContent(), /Kundenprofil Müller GmbH/);
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Unbekannte Markierung: Warnung in Notiz und Aufgabe (nicht von „Gespeichert“ verdeckt), keine bei Social-Beiträgen', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	const p = await seite(DESKTOP, 'Unbekannt');
	await p.route(/webhook\/team-api-v2/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (/_speichern$/.test(b.aktion)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"x_1"}' });
		const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postDataBuffer() });
		r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
	});
	const warnung = async () => { await p.waitForTimeout(900); return (await p.locator('#toast.warnung.show').count()) ? await p.locator('#toast').textContent() : ''; };
	// Notiz: Tippfehler und Name mit Leerzeichen-Ersatz, den es nicht gibt; Satzzeichen danach gehören nicht dazu
	await oeffnen(p, 'm_timo', '#/tab/notizen');
	await p.locator('#neun').click();
	await p.locator('#n_t').fill('Unbekannt');
	await p.locator('#n_i').fill('Bitte @Timmo und @Kurt_Mueller fragen. Danke @alle!');
	await p.locator('#nf [type=submit]').click();
	assert.match(await warnung(), /⚠ @Timmo, @Kurt_Mueller sind kein Mitglied, dafür wurde keine Nachricht verschickt/);
	// Aufgabe: hier kam bisher direkt danach „Gespeichert“ und verdeckte die Warnung
	await p.locator('nav.tabs button[data-tab="aufgaben"]').click();
	await p.locator('#neu').click();
	await p.locator('#a_t').fill('Aufgabe mit Tippfehler');
	await p.locator('#a_b').fill('Rückfrage an @Lilien');
	await p.locator('#af [type=submit]').click();
	assert.match(await warnung(), /⚠ @Lilien ist kein Mitglied/);
	assert.equal((await zustand()).msgs.length, 0, 'nichts verschickt');
	// Social-Beitrag: @-Namen sind dort meist Instagram-Konten, keine Warnung
	await p.locator('nav.tabs button[data-tab="social"]').click();
	await p.locator('#neup').click();
	await p.locator('#p_t').fill('Post');
	await p.locator('#p_x').fill('Folgt @momentumkiakademie');
	await p.locator('#pf [type=submit]').click();
	assert.equal(await warnung(), '', 'keine Warnung bei Social-Beiträgen');
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Markierung bei gleichem Vornamen: @Vorname ist nicht eindeutig, @Vorname_Nachname schon', async t => {
	if (!B) return t.skip();
	const p = await seite(DESKTOP, 'Gleiche Vornamen');
	// Zwei Mitglieder „Anna“ mit Nachnamen kommen nur im Browser dazu; was an den Nachrichtendienst ginge, hält der Test fest
	const gesendet = [];
	await p.route(/webhook\/team-api-v2/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (b.aktion === 'notiz_speichern') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"n_anna"}' });
		const res = await fetch(S.base + '/api/team', { method: 'POST', body: r.request().postDataBuffer() });
		const j = await res.json();
		if (j.mitglieder) j.mitglieder.push(
			{ mitglied_id: 'm_anna_b', name: 'Anna Berg', rolle: 'team', typ: 'mensch', status: 'aktiv' },
			{ mitglied_id: 'm_anna_v', name: 'Anna von Kurz', rolle: 'team', typ: 'mensch', status: 'aktiv' });
		r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(j) });
	});
	await p.route(/webhook\/team-msgs/, async r => {
		const b = JSON.parse(r.request().postData() || '{}');
		if (b.aktion === 'senden') { gesendet.push(b.daten); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, nachricht: { msg_id: 'msg_x' + gesendet.length, absender: 'm_timo', empfaenger: b.daten.empfaenger, text: b.daten.text, gesendet: new Date().toISOString(), empfangen: {} } }) }); }
		r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"vorhanden":true,"liste":[],"nachrichten":[]}' });
	});
	const notiz = async text => {
		await p.locator('#neun').click();
		await p.locator('#n_t').fill('Anna-Test');
		await p.locator('#n_i').fill(text);
		await p.locator('#nf [type=submit]').click();
		await p.waitForTimeout(700);
		return (await p.locator('#toast').textContent()) || '';
	};
	await oeffnen(p, 'm_timo', '#/tab/notizen');
	// nur @Anna: geht an niemanden, auffällige Warnung mit den gültigen Kennungen
	let toastText = await notiz('Bitte @anna fragen.');
	assert.equal(gesendet.length, 0, 'mehrdeutig: keine Nachricht');
	assert.match(toastText, /⚠ @anna ist nicht eindeutig, dafür wurde keine Nachricht verschickt\. Bitte so markieren: @Anna_Berg oder @Anna_von_Kurz/);
	assert.ok(await p.locator('#toast.warnung.show').count(), 'Warnung hervorgehoben');
	await shot(p, 'markierung-warnung', DESKTOP);
	// Leerzeichen und Punkt gehören nicht zur Kennung: „@Anna Berg“ und „@anna.von.kurz“ sind nur „@Anna“, also nicht eindeutig
	toastText = await notiz('@Anna Berg und @anna.von.kurz');
	assert.equal(gesendet.length, 0, 'Leerzeichen/Punkt: keine Nachricht');
	assert.match(toastText, /nicht eindeutig/);
	// gültig: ganzer Name mit „_“, auch mehrteilig; Groß-/Kleinschreibung egal; am Satzende mit Punkt
	toastText = await notiz('@Anna_Berg und @anna_von_kurz.');
	assert.equal(gesendet.length, 1);
	assert.deepEqual(gesendet[0].empfaenger, ['m_anna_b', 'm_anna_v']);
	assert.match(toastText, /Anna Berg, Anna von Kurz benachrichtigt/);
	// gemischt: gültige Markierung geht raus, die mehrdeutige nicht, dazu die Warnung
	toastText = await notiz('@Anna_Berg und @Anna');
	assert.deepEqual(gesendet[1].empfaenger, ['m_anna_b']);
	assert.match(toastText, /Anna Berg benachrichtigt\. ⚠ @Anna ist nicht eindeutig/);
	// eindeutiger Vorname reicht weiter, ebenso der ganze Name „Kurt (Test)“ als @Kurt_(Test)
	await notiz('@kurt');
	assert.deepEqual(gesendet[2].empfaenger, ['m_kurt']);
	await notiz('@Kurt_(Test)');
	assert.deepEqual(gesendet[3].empfaenger, ['m_kurt']);
	await p.close();
	assert.deepEqual(fehler, []);
});

test('Mobil: Symbol im Kopf, Lesedialog passt auf den Bildschirm', async t => {
	if (!B) return t.skip();
	await post(S.base, '/api/test/nachrichten', { eingerichtet: true });
	await post(S.base, '/api/nachrichten', { token: TOKENS.m_timo, aktion: 'senden', daten: { empfaenger: ['m_kurt'], text: 'Bitte morgen **Angebot** prüfen.\n\n- Punkt eins\n- Punkt zwei' } });
	const p = await seite(MOBIL, 'Mobil');
	await oeffnen(p, 'm_kurt');
	await p.waitForSelector('#msgsIco');
	const box = await p.locator('#msgsIco').boundingBox();
	assert.ok(box && box.x + box.width <= MOBIL.width, 'Symbol sichtbar');
	await p.locator('#msgsIco').click(); await p.locator('#msgs_box .msgs-z').first().click();
	await p.waitForSelector('#msg_ung:not([disabled])');
	assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'kein waagerechtes Rollen');
	await shot(p, 'nachricht-lesen', MOBIL);
	await p.close();
	assert.deepEqual(fehler, []);
});
