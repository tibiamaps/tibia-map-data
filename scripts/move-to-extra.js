const fs = require('fs');
const path = require('path');

const sortMarkers = require('tibia-maps/src/sort-markers.js');

// TODO: Make these command-line parameters, in case that’s useful (?).
const DESCRIPTION = 'Ice flower';
const SPECIAL_ID = 'achievements';

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
	if (oldMarker.description === DESCRIPTION) {
		specials.push(oldMarker);
	} else {
		rest.push(oldMarker);
	}
}

writeJSON('../data/markers.json', rest);
writeOrUpdateJSON(`../extra/${SPECIAL_ID}/markers.json`, specials);
