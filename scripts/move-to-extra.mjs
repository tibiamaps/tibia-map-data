import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { serializeMarkers } from 'tibia-maps/src/serialize-markers.mjs';
import { sortMarkers } from 'tibia-maps/src/sort-markers.mjs';

const SPECIAL_ID = 'rapid-respawn';

const isSpecial = (marker) => {
	return (
		marker.description === 'Pirate quartermaster (exact spawn tile)' ||
		marker.description === 'Jaracal (exact spawn tile)' ||
		marker.description === 'Lizard executioner (exact spawn tile)' ||
		marker.description === 'Infernoid spiritual (exact spawn tile)'
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

const writeOrUpdateJSON = async (filePath, data) => {
	const absolutePath = path.resolve(__dirname, filePath);
	try {
		const oldData = await readJSON(filePath);
		data = [...oldData, ...data];
		sortMarkers(data);
	} catch {
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	}
	await writeJSON(absolutePath, data);
};

const specials = [];
const rest = [];
const oldMarkers = await readJSON('../data/markers.json');
for (const oldMarker of oldMarkers) {
	if (isSpecial(oldMarker)) {
		specials.push(oldMarker);
	} else {
		rest.push(oldMarker);
	}
}

await writeJSON('../data/markers.json', rest);
await writeOrUpdateJSON(`../extra/${SPECIAL_ID}/markers.json`, specials);

