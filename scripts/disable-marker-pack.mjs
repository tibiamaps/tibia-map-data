import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Example usage:
// node scripts/disable-marker-pack.mjs 'lightbearer'
// node scripts/disable-marker-pack.mjs 'some-other-category'
const SPECIAL_ID = process.argv[2];

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
const markersToRemove = readJSON(`../extra/${SPECIAL_ID}/markers.json`);
for (const marker of markersToRemove) {
	const id = hash(marker);
	hashes.add(id);
}

const currentMarkers = readJSON('../data/markers.json');

const result = currentMarkers.filter(marker => {
	const id = hash(marker);
	const needsRemoval = hashes.has(id);
	return !needsRemoval;
});

writeJSON('../data/markers.json', result);
