// Computes the map diff between two sources: map PNGs, path PNGs, and markers.
// A source is a commit, the index (`INDEX`), or the working tree (`WORKTREE`).
import { loadImage, createCanvas } from 'canvas';
import { readBlob } from './git.mjs';

// Pixel values are little-endian RGBA `Uint32` values, masked to RGB.
const RGB = 0xffffff;
const UNEXPLORED_MAP = 0x000000;
// `#ff00ff` means “unexplored” in path PNGs.
const UNEXPLORED_PATH = 0xff00ff;
// In this repository, unexplored areas on the ground floor (07) are water.
const WATER = 0x996633;
// `#ffff00` means “not walkable” in path PNGs.
const NON_WALKABLE_PATH = 0x00ffff;
const DEFAULT_BOUNDS = { xMin: 31744, yMin: 30976, width: 2560, height: 2048 };

// Change types per pixel.
export const NONE = 0;
export const ADDED = 1;
export const REMOVED = 2;
export const CHANGED = 3;
export const TYPE_NAMES = { [ADDED]: 'added', [REMOVED]: 'removed', [CHANGED]: 'changed' };

export const FLOOR_FILE = /^data\/floor-(\d\d)-(map|path)\.png$/;

export const decode = async (buffer) => {
	const img = await loadImage(buffer);
	const canvas = createCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const data = new Uint32Array(ctx.getImageData(0, 0, img.width, img.height).data.buffer);
	return { width: img.width, height: img.height, data };
};

export const toPng = (pixels, width, height, options = {}) => {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const img = ctx.createImageData(width, height);
	new Uint32Array(img.data.buffer).set(pixels);
	ctx.putImageData(img, 0, 0);
	return canvas.toBuffer('image/png', options);
};

export const readJson = async (source, file) => {
	const buffer = await readBlob(source, file);
	return buffer === null ? null : JSON.parse(buffer.toString('utf8'));
};

// Returns the colors that mean “unexplored” for a layer of a floor.
export const unexploredColors = (layer, floor) => {
	// On the ground floor (07), `tibia-maps` stores unexplored path tiles as non-walkable
	// (yellow), in the same way as unexplored map tiles are water.
	if (layer === 'path') return floor === 7 ? [UNEXPLORED_PATH, NON_WALKABLE_PATH] : [UNEXPLORED_PATH];
	return floor === 7 ? [UNEXPLORED_MAP, WATER] : [UNEXPLORED_MAP];
};

// Returns the change type of one pixel.
export const classifyPixel = (before, after, unexplored) => {
	const b = before & RGB;
	const a = after & RGB;
	if (a === b) return NONE;
	return unexplored.includes(b) ? ADDED : unexplored.includes(a) ? REMOVED : CHANGED;
};

// Loads a PNG from a source into the shared coordinate space. Areas that the PNG
// does not cover are filled with the “unexplored” color.
const loadLayer = async (source, file, bounds, space, unexplored) => {
	const out = new Uint32Array(space.width * space.height).fill((0xff000000 | unexplored) >>> 0);
	const buffer = await readBlob(source, file);
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

const classify = (before, after, unexplored) => {
	const types = new Uint8Array(before.length);
	let count = 0;
	for (let i = 0; i < before.length; i++) {
		const t = classifyPixel(before[i], after[i], unexplored);
		if (t === NONE) continue;
		types[i] = t;
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

const crop = (array, width, box) => {
	const w = box.x1 - box.x0 + 1;
	const h = box.y1 - box.y0 + 1;
	const out = new array.constructor(w * h);
	for (let y = 0; y < h; y++) {
		const start = (y + box.y0) * width + box.x0;
		out.set(array.subarray(start, start + w), y * w);
	}
	return out;
};

const emptyCounts = () => ({ added: 0, removed: 0, changed: 0 });
const cleanCounts = (c) => (c && (c.added || c.removed || c.changed) ? c : null);

const intersects = (area, floor, box) => area.floors.includes(floor)
	&& area.x0 <= box.x1 && area.x1 >= box.x0 && area.y0 <= box.y1 && area.y1 >= box.y0;

// Returns the names of the protected areas that overlap a box on a floor.
export const protectedNames = (areas, floor, box) => [...new Set(areas.filter((a) => intersects(a, floor, box)).map((a) => a.name))];

// Builds a region from the pixels with `label === index` in a source. A source is
// a full floor or the crop of a parent region (for splits). The coordinates of the
// source are relative to `space`, starting at `originX` and `originY`.
const buildRegion = ({ diff, floor, source, label, index, bbox }) => {
	const { space, padding } = diff;
	const { width, height, originX, originY, layers } = source;
	const box = {
		x0: Math.max(0, bbox.x0 - padding),
		y0: Math.max(0, bbox.y0 - padding),
		x1: Math.min(width - 1, bbox.x1 + padding),
		y1: Math.min(height - 1, bbox.y1 + padding),
	};
	const counts = { map: layers.map.types ? emptyCounts() : null, path: layers.path ? emptyCounts() : null };
	for (let y = bbox.y0; y <= bbox.y1; y++) {
		for (let x = bbox.x0; x <= bbox.x1; x++) {
			const i = y * width + x;
			if (label[i] !== index) continue;
			if (layers.map.types && layers.map.types[i]) counts.map[TYPE_NAMES[layers.map.types[i]]]++;
			if (layers.path && layers.path.types[i]) counts.path[TYPE_NAMES[layers.path.types[i]]]++;
		}
	}
	// Absolute coordinates.
	const ax = (x) => space.xMin + originX + x;
	const ay = (y) => space.yMin + originY + y;
	const changed = { x0: ax(bbox.x0), y0: ay(bbox.y0), x1: ax(bbox.x1), y1: ay(bbox.y1) };
	const outer = { x0: ax(box.x0), y0: ay(box.y0), x1: ax(box.x1), y1: ay(box.y1) };
	// The context marker lists contain only markers of this floor.
	const inBox = (m) => m.x >= outer.x0 && m.x <= outer.x1 && m.y >= outer.y0 && m.y <= outer.y1;
	const ownPixel = (m) => {
		const x = m.x - space.xMin - originX;
		const y = m.y - space.yMin - originY;
		return x >= 0 && y >= 0 && x < width && y < height && label[y * width + x] === index;
	};
	const mapCounts = cleanCounts(counts.map);
	const pathCounts = cleanCounts(counts.path);
	const mask = Uint8Array.from(crop(label, width, box), (v) => (v === index ? 1 : 0));
	return {
		key: `${floor}:${changed.x0},${changed.y0},${changed.x1},${changed.y1}`,
		floor,
		x0: outer.x0,
		y0: outer.y0,
		width: box.x1 - box.x0 + 1,
		height: box.y1 - box.y0 + 1,
		changed,
		counts: { map: mapCounts, path: pathCounts },
		protectedBy: protectedNames(diff.protectedAreas, floor, changed),
		markerChanges: source.markerChanges.filter((m) => m.z === floor && ownPixel(m)),
		markersBefore: source.markersBefore.filter(inBox),
		markersAfter: source.markersAfter.filter(inBox),
		// The map layer is always present, also for path-only and marker-only regions, as context.
		layers: {
			map: {
				before: crop(layers.map.before, width, box),
				after: crop(layers.map.after, width, box),
				types: mapCounts ? crop(layers.map.types, width, box) : null,
			},
			path: pathCounts
				? { before: crop(layers.path.before, width, box), after: crop(layers.path.after, width, box), types: crop(layers.path.types, width, box) }
				: null,
		},
		// 1 for the pixels (and marker positions) that belong to this region, in the crop box.
		mask,
	};
};

// Sort by floor, then by the number of changed pixels and markers.
const regionSize = (r) => {
	let n = r.markerChanges.length;
	for (const c of [r.counts.map, r.counts.path]) if (c) n += c.added + c.removed + c.changed;
	return n;
};
const sortRegions = (regions) => regions.sort((a, b) => a.floor - b.floor || regionSize(b) - regionSize(a));

export const computeDiff = async ({ base, head, files, padding = 16, gap = 8, protectedAreas = [] }) => {
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
	const diff = { space, padding, protectedAreas, regions: [], markerChanges: [], unplacedMarkers: [], unchangedFiles: [] };

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
	const contextMarkers = (list) => list.map((m) => ({
		x: m.x,
		y: m.y,
		icon: m.icon,
		description: m.description,
		status: changeTypeByKey.get(markerKey(m)) ?? 'same',
	}));

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
		let mapTypes = null;
		if (entry.map) {
			const result = classify(mapBefore, mapAfter, unexploredColors('map', floor));
			mapTypes = result.types;
			if (result.count === 0) diff.unchangedFiles.push(mapPath);
		}
		let path = null;
		if (entry.path) {
			const before = await loadLayer(base, pathPath, boundsBefore, space, UNEXPLORED_PATH);
			const after = await loadLayer(head, pathPath, boundsAfter, space, UNEXPLORED_PATH);
			const result = classify(before, after, unexploredColors('path', floor));
			path = { before, after, types: result.types };
			if (result.count === 0) diff.unchangedFiles.push(pathPath);
		}
		for (let i = 0; i < mask.length; i++) {
			if ((mapTypes && mapTypes[i]) || (path && path.types[i])) mask[i] = 1;
		}
		for (const change of entry.markers) {
			const x = change.x - space.xMin;
			const y = change.y - space.yMin;
			if (x >= 0 && y >= 0 && x < space.width && y < space.height) mask[y * space.width + x] = 1;
		}

		const { list, label } = cluster(mask, space.width, space.height, gap);
		const source = {
			width: space.width,
			height: space.height,
			originX: 0,
			originY: 0,
			layers: { map: { before: mapBefore, after: mapAfter, types: mapTypes }, path },
			markerChanges: entry.markers,
			markersBefore: contextMarkers(markersBefore.filter((m) => m.z === floor)),
			markersAfter: contextMarkers(markersAfter.filter((m) => m.z === floor)),
		};
		for (const r of list) regions.push(buildRegion({ diff, floor, source, label, index: r.index, bbox: r }));
	}

	diff.regions = sortRegions(regions);
	diff.regions.forEach((r, i) => { r.id = i; });
	diff.markerChanges = markerChanges;
	diff.unplacedMarkers = markerChanges.filter((c) => !regions.some((r) => r.markerChanges.includes(c)));
	return diff;
};

// Splits a region into the groups of pixels that touch each other (`gap` 1).
// Returns the new regions, or `null` if the region cannot be split.
export const splitRegion = (diff, region, gap = 1) => {
	const { width, height, layers, mask } = region;
	const { list, label } = cluster(mask, width, height, gap);
	if (list.length < 2) return null;
	const source = {
		width,
		height,
		originX: region.x0 - diff.space.xMin,
		originY: region.y0 - diff.space.yMin,
		layers: { map: layers.map, path: layers.path },
		markerChanges: region.markerChanges,
		markersBefore: region.markersBefore,
		markersAfter: region.markersAfter,
	};
	// A parent without map changes has no map types. The map layer is still needed as context.
	return sortRegions(list.map((r) => buildRegion({ diff, floor: region.floor, source, label, index: r.index, bbox: r })));
};

// Highlight colors (opaque, little-endian RGBA).
const HIGHLIGHT = {
	[ADDED]: 0xff5ec522, // #22c55e
	[REMOVED]: 0xff4444ef, // #ef4444
	[CHANGED]: 0xff0b9ef5, // #f59e0b
};
// Pixels that will be reverted.
const REVERTED = 0xffb8a394; // #94a3b8

const dim = (v, factor) => {
	const r = Math.round((v & 0xff) * factor);
	const g = Math.round(((v >> 8) & 0xff) * factor);
	const b = Math.round(((v >> 16) & 0xff) * factor);
	return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
};

// Renders one side of a layer of a region:
// - `before` and `after`: the two versions.
// - `highlight`: the after image, dimmed, with changed pixels in color.
// - `result`: the after image, with the pixels that are not kept reverted to the before image.
// `keep` is a set of type names. Pixels of this region whose type is not in `keep` are
// shown as reverted. Without `keep`, all types are kept.
export const renderLayer = (region, layerName, side, keep = null) => {
	const layer = region.layers[layerName];
	if (!layer) return null;
	if (side === 'before') return toPng(layer.before, region.width, region.height);
	if (side === 'after') return toPng(layer.after, region.width, region.height);
	const kept = (t) => keep === null || keep.has(TYPE_NAMES[t]);
	const out = new Uint32Array(layer.after.length);
	for (let i = 0; i < out.length; i++) {
		const t = layer.types ? layer.types[i] : NONE;
		const own = region.mask[i] === 1;
		if (side === 'result') {
			out[i] = t !== NONE && own && !kept(t) ? layer.before[i] : layer.after[i];
			continue;
		}
		if (t === NONE) out[i] = dim(layer.after[i], 0.3);
		else if (!own) out[i] = dim(HIGHLIGHT[t], 0.45);
		else out[i] = kept(t) ? HIGHLIGHT[t] : REVERTED;
	}
	return toPng(out, region.width, region.height);
};

// Returns the default decision for a region: keep additions, revert changes and
// removals, and keep nothing in protected areas.
export const defaultKeep = (r) => ({ added: r.protectedBy.length === 0, changed: false, removed: false });

// Returns the region without the pixel data, for JSON output.
// `size` is the number of changed tiles (map, path, or marker) in the region.
export const summarizeRegion = (r) => {
	const { layers, mask, ...rest } = r;
	let size = 0;
	for (const v of mask) size += v;
	return { ...rest, size, layers: Object.keys(layers).filter((k) => layers[k] !== null), defaultKeep: defaultKeep(r) };
};
