import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { sortMarkers } from 'tibia-maps/src/sort-markers.mjs';

const SPECIAL_ID = 'rapid-respawn';

const isSpecial = (marker) => {
	return (
		marker.description === 'Muglex clan assassin (fire bomb spot)' ||
		marker.description === 'Muglex clan footman (fire bomb spot)' ||
		marker.description === 'Corrupted ghost (fire bomb spot)' ||
		marker.description === 'Corrupted skeleton (fire bomb spot)'
	);
	// https://tibiamaps.io/map#33686,30971,9:1
	const TOP_LEFT_COORDINATE = { x: 33686, y: 30971 };
	// https://tibiamaps.io/map#33862,31136,9:1
	const BOTTOM_RIGHT_COORDINATE = { x: 33862, y: 31136 };
	const HIGHEST_FLOOR = 1;
	const LOWEST_FLOOR = 9;
	const isWithinX =
		marker.x >= TOP_LEFT_COORDINATE.x && marker.x <= BOTTOM_RIGHT_COORDINATE.x;
	const isWithinY =
		marker.y >= TOP_LEFT_COORDINATE.y && marker.y <= BOTTOM_RIGHT_COORDINATE.y;
	const isWithinZ = marker.z >= HIGHEST_FLOOR && marker.z <= LOWEST_FLOOR;
	return isWithinX && isWithinY && isWithinZ;
};

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

const writeOrUpdateJSON = (filePath, data) => {
	const absolutePath = path.resolve(__dirname, filePath);
	if (fs.existsSync(absolutePath)) {
		const oldData = readJSON(filePath);
		data = [...oldData, ...data];
		sortMarkers(data);
	} else {
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
	}
	writeJSON(absolutePath, data);
};

const specials = [];
const rest = [];
const oldMarkers = readJSON('../data/markers.json');
for (const oldMarker of oldMarkers) {
	if (isSpecial(oldMarker)) {
		specials.push(oldMarker);
	} else {
		rest.push(oldMarker);
	}
}

writeJSON('../data/markers.json', rest);
writeOrUpdateJSON(`../extra/${SPECIAL_ID}/markers.json`, specials);
