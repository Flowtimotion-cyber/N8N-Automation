// Kleiner Simulator für n8n-SDK-Dateien (*.workflow.gen.js) in Tests: führt einen Workflow ohne n8n aus.
//   - lädt die SDK-Datei mit nachgebauten SDK-Funktionen (workflow, node, trigger, switchCase, expr, newCredential)
//   - Code-Knoten laufen in vm (wie im n8n-Code-Knoten: $, $input; kein require)
//   - HTTP-Knoten werden nicht ausgeführt: Methode, Adresse und Body werden ausgewertet und mitgeschrieben,
//     die Antwort liefert der Test (antworten[Knotenname](anfrage) → Liste von json-Objekten)
//   - Switch-Knoten: Regeln „$json.aktion equals …“; Respond-to-Webhook beendet den Lauf
// Abgebildet ist nur, was die Team-Workflows benutzen (executeOnce, alwaysOutputData, onError continueRegularOutput).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function workflowLaden(datei) {
	const quelle = readFileSync(datei, 'utf8').replace(/\r\n/g, '\n')
		.replace(/^import .*from '@n8n\/workflow-sdk';$/m, '')
		.replace(/^export default /m, 'return ');
	const knoten = new Map();
	const kopf = x => x.kopf || x;
	const ende = x => x.ende || x;
	const kette = (k, e) => ({ kopf: k, ende: e, to(x) { ende(e).weiter.push(kopf(x)); return kette(k, ende(x)); } });
	const neu = def => {
		const n = { name: def.config.name, type: def.type, config: def.config, weiter: [], faelle: [] };
		n.to = x => { n.weiter.push(kopf(x)); return kette(n, ende(x)); };
		n.onCase = (i, x) => { n.faelle[i] = kopf(x); return n; };
		knoten.set(n.name, n);
		return n;
	};
	const sdk = {
		workflow: (id, name) => ({ id, name, add: n => kette(n, n) }),
		node: neu,
		trigger: neu,
		switchCase: def => neu({ type: 'n8n-nodes-base.switch', ...def }),
		expr: s => ({ ausdruck: s }),
		newCredential: name => ({ neu: name })
	};
	const wf = new Function(...Object.keys(sdk), quelle)(...Object.values(sdk));
	return { name: wf.name, knoten };
}

// Läuft den Workflow ab dem Knoten nach dem Trigger. kontext: zusätzliche Globale für vm (z. B. festes Date, Math)
export function ausfuehren(wf, { body, antworten = {}, kontext = {} }) {
	const ausgaben = {};
	const anfragen = [];
	const trigger = [...wf.knoten.values()].find(n => /webhook$/.test(n.type));
	ausgaben[trigger.name] = [{ json: { body } }];
	const $ = name => {
		if (!ausgaben[name]) throw new Error('Knoten „' + name + '“ ist (noch) nicht gelaufen');
		return { first: () => ausgaben[name][0], all: () => ausgaben[name] };
	};
	// Wie im n8n-Code-Knoten: kein URL (Fehler 21.11.2026), kein require
	const globale = { encodeURIComponent, ...kontext };
	const auswerten = (wert, eingabe) => {
		const s = wert && wert.ausdruck !== undefined ? wert.ausdruck : wert;
		if (typeof s !== 'string' || !s.includes('{{')) return s;
		const ctx = vm.createContext({ ...globale, $, $json: (eingabe[0] || { json: {} }).json });
		const teile = s.split(/\{\{([\s\S]*?)\}\}/);
		if (teile.length === 3 && teile[0] === '' && teile[2] === '') return vm.runInContext(teile[1], ctx);
		return teile.map((t, i) => i % 2 ? String(vm.runInContext(t, ctx)) : t).join('');
	};

	let n = trigger.weiter[0], eingabe = ausgaben[trigger.name];
	for (let schritte = 0; n && schritte < 100; schritte++) {
		const p = n.config.parameters || {};
		let aus;
		if (n.type === 'n8n-nodes-base.code') {
			const ctx = vm.createContext({ ...globale, $, $input: { first: () => eingabe[0], all: () => eingabe } });
			aus = JSON.parse(JSON.stringify(vm.runInContext('(function(){\n' + p.jsCode + '\n})()', ctx)));
		} else if (n.type === 'n8n-nodes-base.httpRequest') {
			const anfrage = { knoten: n.name, methode: p.method, url: auswerten(p.url, eingabe) };
			if (p.sendBody) anfrage.body = auswerten(p.jsonBody, eingabe);
			anfragen.push(anfrage);
			const f = antworten[n.name];
			if (!f) throw new Error('Keine Testantwort für HTTP-Knoten „' + n.name + '“');
			aus = f(anfrage).map(json => ({ json }));
			if (!aus.length && n.config.alwaysOutputData) aus = [{ json: {} }];
		} else if (n.type === 'n8n-nodes-base.switch') {
			const wert = eingabe[0].json.aktion;
			const i = p.rules.values.findIndex(r => r.conditions.conditions[0].rightValue === wert);
			ausgaben[n.name] = eingabe;
			n = i >= 0 ? n.faelle[i] : null;
			continue;
		} else if (n.type === 'n8n-nodes-base.respondToWebhook') {
			return { anfragen, code: auswerten(p.options.responseCode, eingabe), antwort: JSON.parse(auswerten(p.responseBody, eingabe)), ausgaben };
		} else {
			throw new Error('Simulator kennt Knotentyp ' + n.type + ' nicht');
		}
		ausgaben[n.name] = aus;
		eingabe = aus;
		n = n.weiter[0];
	}
	throw new Error('Workflow endet ohne Antwort');
}
