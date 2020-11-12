import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { sortMarkers } from 'tibia-maps/src/sort-markers.mjs';

// Example usage:
// node scripts/enable-marker-pack.mjs 'percht'
// node scripts/enable-marker-pack.mjs 'orcsoberfest'
// node scripts/enable-marker-pack.mjs 'lightbearer' # non-special case
// node scripts/enable-marker-pack.mjs 'some-other-category' # non-special case
const arg = process.argv[2];

const map = new Map([
	['percht', { old: 'orcsoberfest-island', new: 'percht-island' }],
	['orcsoberfest', { old: 'percht-island', new: 'orcsoberfest-island' }],
]);
const config = map.get(arg);
const isSpecialCase = Boolean(config);
const OLD_SPECIAL_ID = config && config.old;
const NEW_SPECIAL_ID = config && config.new;

const readJSON = (filePath) => {
	const absolutePath = path.resolve(__dirname, filePath);
	const string = fs.readFileSync(absolutePath, 'utf8').toString();
	const data = JSON.parse(string);
	return data;
};

const writeJSON = (filePath, data) => {
	const absolutePath = path.resolve(__dirname, filePath);
	const json = JSON.stringify(data, null, '\t') + '\n';
	fs.writeFileSync(absolutePath, json);
};

const hash = (marker) => `${marker.x},${marker.y},${marker.z}`;

const hashes = new Set();
if (isSpecialCase) {
	const oldSpecialMarkers = readJSON(`../extra/${OLD_SPECIAL_ID}/markers.json`);
	for (const marker of oldSpecialMarkers) {
		const id = hash(marker);
		hashes.add(id);
	}
}
let currentMarkers = readJSON('../data/markers.json');
const newSpecialMarkers = readJSON(`../extra/${NEW_SPECIAL_ID || arg}/markers.json`);

if (isSpecialCase) {
	currentMarkers = currentMarkers.filter(marker => {
		const id = hash(marker);
		return !hashes.has(id);
	});
}

const result = sortMarkers([...currentMarkers, ...newSpecialMarkers]);

writeJSON('../data/markers.json', result);
