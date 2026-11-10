// Computes the map diff between two commits: map PNGs, path PNGs, and markers.
import { loadImage, createCanvas } from 'canvas';
import { readBlob } from './git.mjs';

// Pixel values are little-endian RGBA `Uint32` values, masked to RGB.
const RGB = 0xffffff;
const UNEXPLORED_MAP = 0x000000;
// `#ff00ff` means “unexplored” in path PNGs.
const UNEXPLORED_PATH = 0xff00ff;
const DEFAULT_BOUNDS = { xMin: 31744, yMin: 30976, width: 2560, height: 2048 };

// Change types per pixel.
export const NONE = 0;
export const ADDED = 1;
export const REMOVED = 2;
export const CHANGED = 3;

const FLOOR_FILE = /^data\/floor-(\d\d)-(map|path)\.png$/;

const decode = async (buffer) => {
	const img = await loadImage(buffer);
	const canvas = createCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const data = new Uint32Array(ctx.getImageData(0, 0, img.width, img.height).data.buffer);
	return { width: img.width, height: img.height, data };
};

export const toPng = (pixels, width, height) => {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const img = ctx.createImageData(width, height);
	new Uint32Array(img.data.buffer).set(pixels);
	ctx.putImageData(img, 0, 0);
	return canvas.toBuffer('image/png');
};

const readJson = async (commit, path) => {
	const buffer = await readBlob(commit, path);
	return buffer === null ? null : JSON.parse(buffer.toString('utf8'));
};

// Loads a PNG from a commit into the shared coordinate space. Areas that the PNG
// does not cover are filled with the “unexplored” color.
const loadLayer = async (commit, path, bounds, space, unexplored) => {
	const out = new Uint32Array(space.width * space.height).fill((0xff000000 | unexplored) >>> 0);
	const buffer = await readBlob(commit, path);
	if (buffer === null) return out;
	const img = await decode(buffer);
	const offsetX = bounds.xMin - space.xMin;
	const offsetY = bounds.yMin - space.yMin;
	for (let y = 0; y < img.height; y++) {
		const row = y * img.width;
		out.set(img.data.subarray(row, row + img.width), (y + offsetY) * space.width + offsetX);
	}
	return out;
};

// In this repository, unexplored areas on the ground floor (07) are water.
const WATER = 0x996633;

const classify = (before, after, unexplored) => {
	const isUnexplored = (v) => unexplored.includes(v);
	const types = new Uint8Array(before.length);
	let count = 0;
	for (let i = 0; i < before.length; i++) {
		const b = before[i] & RGB;
		const a = after[i] & RGB;
		if (a === b) continue;
		types[i] = isUnexplored(b) ? ADDED : isUnexplored(a) ? REMOVED : CHANGED;
		count++;
	}
	return { types, count };
};

const markerKey = (m) => `${m.x},${m.y},${m.z}`;

const diffMarkers = (before, after) => {
	const beforeByKey = new Map(before.map((m) => [markerKey(m), m]));
	const afterByKey = new Map(after.map((m) => [markerKey(m), m]));
	const changes = [];
	for (const [key, a] of afterByKey) {
		const b = beforeByKey.get(key);
		if (!b) changes.push({ type: 'added', x: a.x, y: a.y, z: a.z, before: null, after: a });
		else if (b.icon !== a.icon || b.description !== a.description) {
			changes.push({ type: 'changed', x: a.x, y: a.y, z: a.z, before: b, after: a });
		}
	}
	for (const [key, b] of beforeByKey) {
		if (!afterByKey.has(key)) changes.push({ type: 'removed', x: b.x, y: b.y, z: b.z, before: b, after: null });
	}
	return changes;
};

// Groups the non-zero pixels of `mask` into regions. Pixels within `gap` tiles of
// each other go into the same region.
const cluster = (mask, width, height, gap) => {
	const label = new Int32Array(width * height).fill(-1);
	const list = [];
	const stack = [];
	for (let start = 0; start < mask.length; start++) {
		if (mask[start] === 0 || label[start] !== -1) continue;
		const r = { index: list.length, x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
		label[start] = r.index;
		stack.push(start);
		while (stack.length) {
			const i = stack.pop();
			const x = i % width;
			const y = (i - x) / width;
			if (x < r.x0) r.x0 = x;
			if (y < r.y0) r.y0 = y;
			if (x > r.x1) r.x1 = x;
			if (y > r.y1) r.y1 = y;
			const yEnd = Math.min(height - 1, y + gap);
			const xEnd = Math.min(width - 1, x + gap);
			for (let yy = Math.max(0, y - gap); yy <= yEnd; yy++) {
				const row = yy * width;
				for (let xx = Math.max(0, x - gap); xx <= xEnd; xx++) {
					const j = row + xx;
					if (mask[j] !== 0 && label[j] === -1) {
						label[j] = r.index;
						stack.push(j);
					}
				}
			}
		}
		list.push(r);
	}
	return { list, label };
};

const crop = (array, space, box) => {
	const w = box.x1 - box.x0 + 1;
	const h = box.y1 - box.y0 + 1;
	const out = new array.constructor(w * h);
	for (let y = 0; y < h; y++) {
		const start = (y + box.y0) * space.width + box.x0;
		out.set(array.subarray(start, start + w), y * w);
	}
	return out;
};

const emptyCounts = () => ({ added: 0, removed: 0, changed: 0 });
const TYPE_NAMES = { [ADDED]: 'added', [REMOVED]: 'removed', [CHANGED]: 'changed' };

export const computeDiff = async ({ base, head, files, padding = 16, gap = 8 }) => {
	const boundsBefore = (await readJson(base, 'data/bounds.json')) ?? DEFAULT_BOUNDS;
	const boundsAfter = (await readJson(head, 'data/bounds.json')) ?? boundsBefore;
	const xMin = Math.min(boundsBefore.xMin, boundsAfter.xMin);
	const yMin = Math.min(boundsBefore.yMin, boundsAfter.yMin);
	const space = {
		xMin,
		yMin,
		width: Math.max(boundsBefore.xMin + boundsBefore.width, boundsAfter.xMin + boundsAfter.width) - xMin,
		height: Math.max(boundsBefore.yMin + boundsBefore.height, boundsAfter.yMin + boundsAfter.height) - yMin,
	};

	const floors = new Map();
	const floorEntry = (floor) => {
		if (!floors.has(floor)) floors.set(floor, { map: false, path: false, markers: [] });
		return floors.get(floor);
	};
	for (const file of files) {
		const match = file.match(FLOOR_FILE);
		if (match) floorEntry(Number(match[1]))[match[2]] = true;
	}

	let markersBefore = [];
	let markersAfter = [];
	let markerChanges = [];
	if (files.includes('data/markers.json')) {
		markersBefore = (await readJson(base, 'data/markers.json')) ?? [];
		markersAfter = (await readJson(head, 'data/markers.json')) ?? [];
		markerChanges = diffMarkers(markersBefore, markersAfter);
		for (const change of markerChanges) floorEntry(change.z).markers.push(change);
	}
	const changeTypeByKey = new Map(markerChanges.map((c) => [markerKey(c), c.type]));

	const regions = [];
	const sortedFloors = [...floors.keys()].sort((a, b) => a - b);
	for (const floor of sortedFloors) {
		const entry = floors.get(floor);
		const id = String(floor).padStart(2, '0');
		const mapPath = `data/floor-${id}-map.png`;
		const pathPath = `data/floor-${id}-path.png`;
		const mask = new Uint8Array(space.width * space.height);

		// The map layer is always loaded, because it gives context for path and marker changes.
		const mapAfter = await loadLayer(head, mapPath, boundsAfter, space, UNEXPLORED_MAP);
		const mapBefore = entry.map ? await loadLayer(base, mapPath, boundsBefore, space, UNEXPLORED_MAP) : mapAfter;
		const mapTypes = entry.map ? classify(mapBefore, mapAfter, floor === 7 ? [UNEXPLORED_MAP, WATER] : [UNEXPLORED_MAP]).types : null;
		let pathBefore = null;
		let pathAfter = null;
		let pathTypes = null;
		if (entry.path) {
			pathBefore = await loadLayer(base, pathPath, boundsBefore, space, UNEXPLORED_PATH);
			pathAfter = await loadLayer(head, pathPath, boundsAfter, space, UNEXPLORED_PATH);
			pathTypes = classify(pathBefore, pathAfter, [UNEXPLORED_PATH]).types;
		}
		for (let i = 0; i < mask.length; i++) {
			if ((mapTypes && mapTypes[i]) || (pathTypes && pathTypes[i])) mask[i] = 1;
		}
		const markerPixel = (m) => {
			const x = m.x - space.xMin;
			const y = m.y - space.yMin;
			if (x < 0 || y < 0 || x >= space.width || y >= space.height) return -1;
			return y * space.width + x;
		};
		for (const change of entry.markers) {
			const i = markerPixel(change);
			if (i !== -1) mask[i] = 1;
		}

		const { list, label } = cluster(mask, space.width, space.height, gap);
		for (const r of list) {
			const box = {
				x0: Math.max(0, r.x0 - padding),
				y0: Math.max(0, r.y0 - padding),
				x1: Math.min(space.width - 1, r.x1 + padding),
				y1: Math.min(space.height - 1, r.y1 + padding),
			};
			const counts = { map: entry.map ? emptyCounts() : null, path: entry.path ? emptyCounts() : null };
			for (let y = r.y0; y <= r.y1; y++) {
				for (let x = r.x0; x <= r.x1; x++) {
					const i = y * space.width + x;
					if (label[i] !== r.index) continue;
					if (mapTypes && mapTypes[i]) counts.map[TYPE_NAMES[mapTypes[i]]]++;
					if (pathTypes && pathTypes[i]) counts.path[TYPE_NAMES[pathTypes[i]]]++;
				}
			}
			const regionChanges = entry.markers.filter((m) => {
				const i = markerPixel(m);
				return i !== -1 && label[i] === r.index;
			});
			const inBox = (m) => m.z === floor
				&& m.x - space.xMin >= box.x0 && m.x - space.xMin <= box.x1
				&& m.y - space.yMin >= box.y0 && m.y - space.yMin <= box.y1;
			const contextMarkers = (list) => list.filter(inBox).map((m) => ({
				x: m.x,
				y: m.y,
				icon: m.icon,
				description: m.description,
				status: changeTypeByKey.get(markerKey(m)) ?? 'same',
			}));
			const cleanCounts = (c) => (c && (c.added || c.removed || c.changed) ? c : null);
			// The map layer is always present, also for path-only and marker-only regions, as context.
			const layers = {
				map: {
					before: crop(mapBefore, space, box),
					after: crop(mapAfter, space, box),
					types: cleanCounts(counts.map) ? crop(mapTypes, space, box) : null,
				},
				path: cleanCounts(counts.path)
					? { before: crop(pathBefore, space, box), after: crop(pathAfter, space, box), types: crop(pathTypes, space, box) }
					: null,
			};
			regions.push({
				floor,
				x0: space.xMin + box.x0,
				y0: space.yMin + box.y0,
				width: box.x1 - box.x0 + 1,
				height: box.y1 - box.y0 + 1,
				changed: {
					x0: space.xMin + r.x0,
					y0: space.yMin + r.y0,
					x1: space.xMin + r.x1,
					y1: space.yMin + r.y1,
				},
				counts: { map: cleanCounts(counts.map), path: cleanCounts(counts.path) },
				markerChanges: regionChanges,
				markersBefore: contextMarkers(markersBefore),
				markersAfter: contextMarkers(markersAfter),
				layers,
			});
		}
	}

	// Sort by floor, then by the number of changed pixels and markers.
	const size = (r) => {
		let n = r.markerChanges.length;
		for (const c of [r.counts.map, r.counts.path]) if (c) n += c.added + c.removed + c.changed;
		return n;
	};
	regions.sort((a, b) => a.floor - b.floor || size(b) - size(a));
	regions.forEach((r, i) => { r.id = i; });

	const unplaced = markerChanges.filter((c) => !regions.some((r) => r.markerChanges.includes(c)));
	return { space, regions, markerChanges, unplacedMarkers: unplaced };
};

// Highlight colors (opaque, little-endian RGBA).
const HIGHLIGHT = {
	[ADDED]: 0xff5ec522, // #22c55e
	[REMOVED]: 0xff4444ef, // #ef4444
	[CHANGED]: 0xff0b9ef5, // #f59e0b
};

export const renderLayer = (region, layerName, side) => {
	const layer = region.layers[layerName];
	if (!layer) return null;
	if (side === 'before') return toPng(layer.before, region.width, region.height);
	if (side === 'after') return toPng(layer.after, region.width, region.height);
	// Highlight: the after image, dimmed, with changed pixels in color.
	const out = new Uint32Array(layer.after.length);
	for (let i = 0; i < out.length; i++) {
		const t = layer.types ? layer.types[i] : NONE;
		if (t !== NONE) {
			out[i] = HIGHLIGHT[t];
			continue;
		}
		const v = layer.after[i];
		const r = Math.round((v & 0xff) * 0.3);
		const g = Math.round(((v >> 8) & 0xff) * 0.3);
		const b = Math.round(((v >> 16) & 0xff) * 0.3);
		out[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
	}
	return toPng(out, region.width, region.height);
};

// Returns the region without the pixel data, for JSON output.
export const summarizeRegion = (r) => {
	const { layers, ...rest } = r;
	return { ...rest, layers: Object.keys(layers).filter((k) => layers[k] !== null) };
};
