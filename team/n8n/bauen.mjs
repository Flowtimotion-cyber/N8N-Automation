#!/usr/bin/env node
// Baut die n8n-Workflows der Team-Portal-API, einen je Datenbank-Variante:
//   node team/n8n/bauen.mjs   →   team/n8n/out/portal-api.<variante>.workflow.json
//
// Die Geschäftslogik (portal-api-anfrage-pruefen.js) gibt es nur einmal. Sie schreibt ausschließlich über das Objekt
// „dataBase“. Für jede Variante wird in den Code-Knoten „Anfrage prüfen“ eingesetzt:
//   C_DataBase.js  +  <Klasse>.js  +  const dataBase = new <Klasse>();  +  Geschäftslogik
// (n8n-Code-Knoten können keine Dateien nachladen, deshalb wird zusammengefügt.)
// Die übrigen Knoten (Lesen, Ausführen der Schreibaufträge) stammen aus der Vorlage der Variante. Eine Variante kann
// statt einer eigenen Vorlage die Supabase-Vorlage per Umbau-Modul abwandeln (PostgreSQL: portal-api.postgre.umbau.mjs).
//
// Fehlt die Klassendatei, die Vorlage oder das Umbau-Modul einer Variante, wird nur diese Variante nicht gebaut (mit Hinweis).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = datei => readFileSync(join(hier, datei), 'utf8').replace(/\r\n/g, '\n'); // CRLF-Checkouts ergäben sonst anderen Code

export const VARIANTEN = [
	{ kennung: 'supabase', klasse: 'C_DataBase_Supabase', datei: 'C_DataBase_Supabase.js', vorlage: 'portal-api.supabase.vorlage.json' },
	{ kennung: 'postgre',  klasse: 'C_DataBase_Postgre',  datei: 'C_DataBase_Postgre.js',  vorlage: 'portal-api.supabase.vorlage.json', umbau: 'portal-api.postgre.umbau.mjs' }
];

export const variante = kennung => {
	const v = VARIANTEN.find(x => x.kennung === kennung);
	if (!v) throw new Error('Unbekannte Datenbank-Variante „' + kennung + '“. Bekannt: ' + VARIANTEN.map(x => x.kennung).join(', '));
	return v;
};

// Warum eine Variante (noch) nicht gebaut werden kann, oder null
export function fehltFuer(kennung) {
	const v = variante(kennung);
	const fehlt = [v.datei, v.vorlage, v.umbau].filter(d => d).filter(d => !existsSync(join(hier, d)));
	return fehlt.length ? 'es fehlt ' + fehlt.map(d => 'team/n8n/' + d).join(' und ') : null;
}

// Die Datenbank-Klassen einer Variante (Schnittstelle + abgeleitete Klasse) als Code-Text
export function dbCode(kennung) {
	const v = variante(kennung);
	return [
		'// ===== C_DataBase.js =====',
		lies('C_DataBase.js').trim(),
		'// ===== ' + v.datei + ' =====',
		lies(v.datei).trim()
	].join('\n\n');
}

// Code des Knotens „Anfrage prüfen“ für eine Variante
export function anfragePruefenCode(kennung) {
	const v = variante(kennung);
	return [
		'// GENERIERT von team/n8n/bauen.mjs (Variante „' + v.kennung + '“) – nicht von Hand ändern, Quelle: team/n8n/',
		dbCode(kennung),
		'const dataBase = new ' + v.klasse + '();',
		'// ===== portal-api-anfrage-pruefen.js =====',
		lies('portal-api-anfrage-pruefen.js').trim()
	].join('\n\n') + '\n';
}

export const CODE_KNOTEN = {
	'Anfrage prüfen': anfragePruefenCode,
	'Antwort bauen': () => lies('portal-api-antwort-bauen.js')
};

export async function workflowBauen(kennung) {
	const v = variante(kennung);
	let wf = JSON.parse(lies(v.vorlage));
	if (v.umbau) wf = (await import(pathToFileURL(join(hier, v.umbau)).href)).umbau(wf, { dbCode: dbCode(kennung) });
	for (const [name, code] of Object.entries(CODE_KNOTEN)) {
		const k = wf.nodes.find(n => n.name === name);
		if (!k) throw new Error('Vorlage ' + variante(kennung).vorlage + ': Knoten „' + name + '“ fehlt');
		k.parameters.jsCode = code(kennung);
	}
	return wf;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const out = join(hier, 'out');
	let gebaut = 0;
	for (const v of VARIANTEN) {
		const grund = fehltFuer(v.kennung);
		if (grund) {
			console.log('Variante „' + v.kennung + '“ nicht gebaut: ' + grund + '.');
			continue;
		}
		mkdirSync(out, { recursive: true });
		const ziel = join(out, 'portal-api.' + v.kennung + '.workflow.json');
		writeFileSync(ziel, JSON.stringify(await workflowBauen(v.kennung), null, '\t') + '\n');
		console.log('Variante „' + v.kennung + '“ gebaut: team/n8n/out/portal-api.' + v.kennung + '.workflow.json');
		gebaut++;
	}
	if (!gebaut) {
		console.error('Keine Variante gebaut.');
		process.exit(1);
	}
}
