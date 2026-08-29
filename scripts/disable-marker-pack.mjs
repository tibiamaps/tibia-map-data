import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { serializeMarkers } from 'tibia-maps/src/serialize-markers.mjs';

// Example usage:
// node scripts/disable-marker-pack.mjs 'lightbearer'
// node scripts/disable-marker-pack.mjs 'some-other-category'
const SPECIAL_ID = process.argv[2];

const readJSON = async (filePath) => {
	const absolutePath = path.resolve(__dirname, filePath);
	const string = await fs.readFile(absolutePath, 'utf8');
	const data = JSON.parse(string);
	return data;
};

const writeJSON = async (filePath, data) => {
	const absolutePath = path.resolve(__dirname, filePath);
	const json = serializeMarkers(data);
	await fs.writeFile(absolutePath, json);
};

const hash = (marker) => `${marker.x},${marker.y},${marker.z}`;

const hashes = new Set();
const markersToRemove = await readJSON(`../extra/${SPECIAL_ID}/markers.json`);
for (const marker of markersToRemove) {
	const id = hash(marker);
	hashes.add(id);
}

const currentMarkers = await readJSON('../data/markers.json');

const result = currentMarkers.filter((marker) => {
	const isPrivateMarker = marker.description.startsWith('//');
	const id = hash(marker);
	const needsRemoval = hashes.has(id) || isPrivateMarker;
	return !needsRemoval;
});

await writeJSON('../data/markers.json', result);

