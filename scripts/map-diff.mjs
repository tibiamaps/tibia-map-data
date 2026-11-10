#!/usr/bin/env node
// Shows the map diff of a commit or a commit range in a local web app.
// Usage:
//   npm run diff -- <commit>
//   npm run diff -- <from>..<to>
//   npm run diff -- <from>...<to>
// Options:
//   --port=8766     The port of the local web server.
//   --padding=16    The number of surrounding tiles to show around each change.
//   --no-open       Do not open the browser.
//   --json          Print a JSON summary and exit, without a web server.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveRange, listChangedFiles, listCommits, shortHash, getRepoUrl } from './map-diff/git.mjs';
import { computeDiff, renderLayer, summarizeRegion } from './map-diff/diff.mjs';

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	allowNegative: true,
	options: {
		port: { type: 'string', default: '8766' },
		padding: { type: 'string', default: '16' },
		open: { type: 'boolean', default: true },
		json: { type: 'boolean', default: false },
	},
});

if (positionals.length !== 1) {
	console.error('Usage: npm run diff -- <commit | from..to | from...to> [--port=8766] [--padding=16] [--no-open] [--json]');
	process.exit(1);
}

const rev = positionals[0];
const INDEX = fileURLToPath(new URL('map-diff/index.html', import.meta.url));

const main = async () => {
	const { base, head, isRange } = await resolveRange(rev);
	const files = await listChangedFiles(base, head);
	const [commits, baseShort, headShort, repoUrl] = await Promise.all([
		listCommits(base, head),
		shortHash(base),
		shortHash(head),
		getRepoUrl(),
	]);
	const relevant = files.filter((f) => /^data\/(floor-\d\d-(map|path)\.png|markers\.json)$/.test(f));
	if (!options.json) console.log(`Comparing ${baseShort ?? '(empty)'} → ${headShort}: ${relevant.length} relevant changed files.`);
	const diff = await computeDiff({ base, head, files: relevant, padding: Number(options.padding) });
	const summary = {
		rev,
		isRange,
		base: base && { hash: base, short: baseShort },
		head: { hash: head, short: headShort },
		repoUrl,
		commits,
		files,
		regions: diff.regions.map(summarizeRegion),
		unplacedMarkers: diff.unplacedMarkers,
	};

	if (options.json) {
		console.log(JSON.stringify(summary, null, '\t'));
		return;
	}

	const cache = new Map();
	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			if (url.pathname === '/') {
				res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
				res.end(await readFile(INDEX));
			} else if (url.pathname === '/api/summary') {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify(summary));
			} else if (url.pathname === '/api/crop') {
				const region = diff.regions[Number(url.searchParams.get('region'))];
				const layer = url.searchParams.get('layer');
				const side = url.searchParams.get('side');
				const key = `${url.searchParams.get('region')}/${layer}/${side}`;
				if (!region || !['map', 'path'].includes(layer) || !['before', 'after', 'highlight'].includes(side)) {
					res.writeHead(400);
					res.end('Bad request');
					return;
				}
				if (!cache.has(key)) cache.set(key, renderLayer(region, layer, side));
				const png = cache.get(key);
				if (!png) {
					res.writeHead(404);
					res.end('Not found');
					return;
				}
				res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' });
				res.end(png);
			} else {
				res.writeHead(404);
				res.end('Not found');
			}
		} catch (error) {
			console.error(error);
			res.writeHead(500);
			res.end(String(error));
		}
	});
	server.listen(Number(options.port), '127.0.0.1', () => {
		const address = `http://localhost:${server.address().port}/`;
		console.log(`Found ${diff.regions.length} changed regions. Map diff viewer: ${address}`);
		console.log('Press Ctrl+C to stop.');
		if (options.open) {
			const opener = process.platform === 'darwin' ? ['open', [address]]
				: process.platform === 'win32' ? ['cmd', ['/c', 'start', '', address]]
				: ['xdg-open', [address]];
			spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
		}
	});
};

try {
	await main();
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
