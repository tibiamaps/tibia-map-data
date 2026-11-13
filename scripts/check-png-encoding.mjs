#!/usr/bin/env node
// Checks that the floor PNGs in `data/` use the canonical PNG encoding: the bytes that
// `tibia-maps` (and the Apply step of `npm run diff`) write for the same pixels.
// Usage:
//   npm run check-encoding                 Check all `data/floor-*-{map,path}.png` files.
//   npm run check-encoding -- --fix        Rewrite the files that are not canonical. The pixels stay the same.
//   npm run check-encoding -- data/floor-07-map.png …
// It exits with code 1 if a file is not canonical (without `--fix`).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, toPng } from './map-diff/diff.mjs';

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		fix: { type: 'boolean', default: false },
	},
});

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const FLOOR_PNG = /^floor-\d\d-(map|path)\.png$/;

const listFiles = async () => {
	if (positionals.length) return positionals.map((f) => path.relative(ROOT, path.resolve(f)));
	const names = (await readdir(path.join(ROOT, 'data'))).filter((name) => FLOOR_PNG.test(name)).sort();
	return names.map((name) => `data/${name}`);
};

const samePixels = (a, b) => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);

// Returns `{ file, canonical, size, canonicalSize, png }`.
const check = async (file) => {
	const original = await readFile(path.join(ROOT, file));
	const image = await decode(original);
	const png = toPng(image.data, image.width, image.height);
	const canonical = png.equals(original);
	if (!canonical) {
		// The encoding must not change the pixels. This is true for opaque images.
		const again = await decode(png);
		if (!samePixels(image, again)) throw new Error(`${file}: the canonical encoding changes the pixels. Does the image have transparent pixels?`);
	}
	return { file, canonical, size: original.length, canonicalSize: png.length, png };
};

const main = async () => {
	const files = await listFiles();
	const results = [];
	// Check a small number of files at the same time, to limit the memory use.
	const queue = [...files];
	const worker = async () => {
		while (queue.length) results.push(await check(queue.shift()));
	};
	await Promise.all(Array.from({ length: 4 }, worker));
	const bad = results.filter((r) => !r.canonical).sort((a, b) => a.file.localeCompare(b.file));
	for (const r of bad) {
		console.log(`${r.file}: not canonical (${r.size} bytes, canonical: ${r.canonicalSize} bytes).`);
		if (options.fix) await writeFile(path.join(ROOT, r.file), r.png);
	}
	if (bad.length === 0) {
		console.log(`All ${results.length} files use the canonical PNG encoding.`);
		return;
	}
	if (options.fix) {
		console.log(`Fixed ${bad.length} of ${results.length} files.`);
		return;
	}
	console.log(`${bad.length} of ${results.length} files do not use the canonical PNG encoding. To fix them, run: npm run check-encoding -- --fix`);
	process.exitCode = 1;
};

try {
	await main();
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exitCode = 2;
}
