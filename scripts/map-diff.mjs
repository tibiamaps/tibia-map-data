#!/usr/bin/env node
// Shows map diffs in a local web app.
// Usage:
//   npm run diff                    Review the uncommitted changes (index → working tree), and
//                                   revert the regions that you reject, like `git checkout -p`.
//   npm run diff -- <commit>        Show the diff of a commit.
//   npm run diff -- <from>..<to>    Show the diff of a commit range.
//   npm run diff -- <from>...<to>   Show the diff since the merge base.
// Options:
//   --port=8766     The port of the local web server.
//   --padding=16    The number of surrounding tiles to show around each change.
//   --no-open       Do not open the browser.
//   --json          Print a JSON summary and exit, without a web server.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
	INDEX, WORKTREE, resolveRange, listChangedFiles, listWorktreeChanges, listCommits, shortHash, getRepoUrl,
} from './map-diff/git.mjs';
import { computeDiff, renderLayer, summarizeRegion, splitRegion, protectedNames, FLOOR_FILE } from './map-diff/diff.mjs';
import { applyDecisions, snapshotFiles } from './map-diff/apply.mjs';

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

if (positionals.length > 1) {
	console.error('Usage: npm run diff -- [commit | from..to | from...to] [--port=8766] [--padding=16] [--no-open] [--json]');
	process.exit(1);
}

const rev = positionals[0] ?? null;
const isReview = rev === null;
const INDEX_HTML = fileURLToPath(new URL('map-diff/index.html', import.meta.url));
const PROTECTED_AREAS = fileURLToPath(new URL('map-diff/protected-areas.json', import.meta.url));
const RELEVANT = /^data\/(floor-\d\d-(map|path)\.png|markers\.json)$/;

const loadProtectedAreas = async () => JSON.parse(await readFile(PROTECTED_AREAS, 'utf8'));

// The current state: the diff, the JSON summary, and (in review mode) a snapshot of the files.
const state = { diff: null, summary: null, snapshot: null, byKey: new Map(), cache: new Map() };

const indexRegions = () => {
	state.diff.regions.forEach((r, i) => { r.id = i; });
	state.byKey = new Map(state.diff.regions.map((r) => [r.key, r]));
	state.summary.regions = state.diff.regions.map(summarizeRegion);
	state.cache.clear();
};

const load = async () => {
	const protectedAreas = await loadProtectedAreas();
	const padding = Number(options.padding);
	const repoUrl = await getRepoUrl();
	if (isReview) {
		const files = await listWorktreeChanges();
		const relevant = files.filter((f) => RELEVANT.test(f));
		state.snapshot = await snapshotFiles(relevant.filter((f) => FLOOR_FILE.test(f)));
		state.diff = await computeDiff({ base: INDEX, head: WORKTREE, files: relevant, padding, protectedAreas });
		state.summary = {
			mode: 'review',
			// The browser saves decisions per snapshot, so that old decisions do not apply to other changes.
			snapshotId: createHash('sha1').update(JSON.stringify(state.snapshot)).digest('hex').slice(0, 12),
			rev: 'working tree',
			isRange: false,
			base: { hash: null, short: 'index' },
			head: { hash: null, short: 'working tree' },
			repoUrl,
			commits: [],
			files,
			unchangedFiles: state.diff.unchangedFiles,
			unplacedMarkers: state.diff.unplacedMarkers,
		};
	} else {
		const { base, head, isRange } = await resolveRange(rev);
		const files = await listChangedFiles(base, head);
		const [commits, baseShort, headShort] = await Promise.all([listCommits(base, head), shortHash(base), shortHash(head)]);
		const relevant = files.filter((f) => RELEVANT.test(f));
		state.diff = await computeDiff({ base, head, files: relevant, padding, protectedAreas });
		state.summary = {
			mode: 'commit',
			rev,
			isRange,
			base: base && { hash: base, short: baseShort },
			head: { hash: head, short: headShort },
			repoUrl,
			commits,
			files,
			unchangedFiles: state.diff.unchangedFiles,
			unplacedMarkers: state.diff.unplacedMarkers,
		};
	}
	indexRegions();
};

const readBody = async (req) => {
	let body = '';
	for await (const chunk of req) body += chunk;
	return JSON.parse(body || '{}');
};

const sendJson = (res, data, status = 200) => {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(data));
};

const handleSplit = async (req, res) => {
	const { key } = await readBody(req);
	const region = state.byKey.get(key);
	if (!region) return sendJson(res, { error: `Unknown region: ${key}` }, 404);
	const parts = splitRegion(state.diff, region);
	if (!parts) return sendJson(res, { error: 'This region has only one group of connected pixels.' }, 400);
	const at = state.diff.regions.indexOf(region);
	state.diff.regions.splice(at, 1, ...parts);
	indexRegions();
	return sendJson(res, { parts: parts.map(summarizeRegion), regions: state.summary.regions });
};

const handleProtect = async (req, res) => {
	const { key, name } = await readBody(req);
	const region = state.byKey.get(key);
	if (!region) return sendJson(res, { error: `Unknown region: ${key}` }, 404);
	if (typeof name !== 'string' || !name.trim()) return sendJson(res, { error: 'A name is necessary.' }, 400);
	const areas = await loadProtectedAreas();
	const { x0, y0, x1, y1 } = region.changed;
	areas.push({ name: name.trim(), kind: 'manual', floors: [region.floor], x0, y0, x1, y1, source: 'npm run diff' });
	await writeFile(PROTECTED_AREAS, `${JSON.stringify(areas, null, '\t')}\n`);
	state.diff.protectedAreas = areas;
	for (const r of state.diff.regions) r.protectedBy = protectedNames(areas, r.floor, r.changed);
	indexRegions();
	return sendJson(res, { regions: state.summary.regions });
};

const handleApply = async (req, res) => {
	const { decisions = {}, restoreUnchanged = true } = await readBody(req);
	const result = await applyDecisions({ diff: state.diff, decisions, snapshot: state.snapshot, restoreUnchanged });
	for (const entry of result.report) console.log(`Apply: ${entry.file}: ${JSON.stringify(entry)}`);
	if (result.backupDir) console.log(`Backup: ${result.backupDir}. To undo: cp -R '${result.backupDir}/data/.' data/`);
	await load();
	console.log(`Found ${state.diff.regions.length} changed regions after apply.`);
	return sendJson(res, result);
};

const handleCrop = (url, res) => {
	const region = state.byKey.get(url.searchParams.get('key'));
	const layer = url.searchParams.get('layer');
	const side = url.searchParams.get('side');
	const keepParam = url.searchParams.get('keep');
	if (!region || !['map', 'path'].includes(layer) || !['before', 'after', 'highlight', 'result'].includes(side)) {
		res.writeHead(400);
		res.end('Bad request');
		return;
	}
	const keep = keepParam === null ? null : new Set(keepParam.split(',').filter(Boolean));
	const cacheKey = `${region.key}/${layer}/${side}/${keepParam}`;
	if (!state.cache.has(cacheKey)) state.cache.set(cacheKey, renderLayer(region, layer, side, keep));
	const png = state.cache.get(cacheKey);
	if (!png) {
		res.writeHead(404);
		res.end('Not found');
		return;
	}
	res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' });
	res.end(png);
};

const main = async () => {
	if (!options.json) console.log(isReview ? 'Comparing the index → the working tree…' : `Comparing ${rev}…`);
	await load();
	if (options.json) {
		console.log(JSON.stringify(state.summary, null, '\t'));
		return;
	}

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			if (url.pathname === '/') {
				res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
				res.end(await readFile(INDEX_HTML));
			} else if (url.pathname === '/api/summary') {
				sendJson(res, state.summary);
			} else if (url.pathname === '/api/crop') {
				handleCrop(url, res);
			} else if (isReview && req.method === 'POST' && url.pathname === '/api/split') {
				await handleSplit(req, res);
			} else if (isReview && req.method === 'POST' && url.pathname === '/api/protect') {
				await handleProtect(req, res);
			} else if (isReview && req.method === 'POST' && url.pathname === '/api/apply') {
				await handleApply(req, res);
			} else {
				res.writeHead(404);
				res.end('Not found');
			}
		} catch (error) {
			console.error(error);
			sendJson(res, { error: error.message }, 500);
		}
	});
	server.listen(Number(options.port), '127.0.0.1', () => {
		const address = `http://localhost:${server.address().port}/`;
		console.log(`Found ${state.diff.regions.length} changed regions. Map diff viewer: ${address}`);
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
