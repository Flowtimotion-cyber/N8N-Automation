#!/usr/bin/env node
// Lokaler Proxy für Tests gegen die ECHTEN Daten: liefert docs/ aus und reicht /webhook/* an den produktiven n8n weiter.
// Umgeht die CORS-Sperre (n8n erlaubt nur flowtimotion-cyber.github.io), ohne Dateien im Repo zu ändern:
// die n8n-Adressen werden beim Ausliefern in HTML/JS auf /webhook/ umgeschrieben.
//
//   node proxy.mjs <Pfad zu docs> [--port 8788]
//   http://127.0.0.1:8788/team/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const DOCS = resolve(process.argv[2] || '.');
const i = process.argv.indexOf('--port');
const PORT = Number(i > 0 ? process.argv[i + 1] : 8788);
const ZIEL = 'https://n8n.hm-storage.de';
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
	'.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	try {
		if (url.pathname.startsWith('/webhook/')) {
			const chunks = [];
			for await (const c of req) chunks.push(c);
			const r = await fetch(ZIEL + url.pathname + url.search, {
				method: req.method,
				headers: { 'Content-Type': req.headers['content-type'] || 'text/plain;charset=UTF-8' },
				body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
			});
			const body = Buffer.from(await r.arrayBuffer());
			console.log(new Date().toLocaleTimeString(), req.method, url.pathname, '→', r.status);
			res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
			return res.end(body);
		}
		let pfad = normalize(join(DOCS, decodeURIComponent(url.pathname)));
		if (!pfad.startsWith(DOCS)) { res.writeHead(403); return res.end(); }
		if ((await stat(pfad).catch(() => null))?.isDirectory()) pfad = join(pfad, 'index.html');
		let daten = await readFile(pfad);
		const ext = extname(pfad).toLowerCase();
		if (ext === '.html' || ext === '.js' || ext === '.mjs') {
			daten = daten.toString('utf8')
				.replaceAll(ZIEL + '/webhook/', '/webhook/')
				.replaceAll("'/api/office'", "'/webhook/office-api'");
		}
		res.writeHead(200, { 'Content-Type': TYPEN[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(daten);
	} catch (e) {
		res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end(String(e.message));
	}
}).listen(PORT, '127.0.0.1', () => {
	console.log('PROXY auf ECHTE Daten · docs: ' + DOCS);
	console.log('  Team-Portal: http://127.0.0.1:' + PORT + '/team/');
	console.log('  KI Office:   http://127.0.0.1:' + PORT + '/office/');
});
