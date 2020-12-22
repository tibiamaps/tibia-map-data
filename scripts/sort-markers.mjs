import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { sortMarkers } from 'tibia-maps/src/sort-markers.mjs';

// Example usage:
// node scripts/sort-markers.mjs path/to/markers.json
const arg = process.argv[2];

const readJSON = (filePath) => {
	const absolutePath = path.resolve(__dirname, '..', filePath);
	const string = fs.readFileSync(absolutePath, 'utf8').toString();
	const data = JSON.parse(string);
	return data;
};

const writeJSON = (filePath, data) => {
	const absolutePath = path.resolve(__dirname, '..', filePath);
	const json = JSON.stringify(data, null, '\t') + '\n';
	fs.writeFileSync(absolutePath, json);
};

const markers = readJSON(arg);
sortMarkers(markers);
writeJSON(arg, markers);
