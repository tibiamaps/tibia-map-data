// Reverts the rejected pixels of a review in the working tree to the index version.
import { mkdir, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INDEX, WORKTREE, readBlob, restoreFromIndex, gitPath, getRepoRoot } from './git.mjs';
import { decode, toPng, classifyPixel, unexploredColors, defaultKeep, readJson, NONE, TYPE_NAMES } from './diff.mjs';

const RGB = 0xffffff;

// Returns the size and modification time of each file, to find changes on disk later.
export const snapshotFiles = async (files) => {
	const root = await getRepoRoot();
	const out = {};
	for (const file of files) {
		try {
			const s = await stat(path.join(root, file));
			out[file] = `${s.size}:${s.mtimeMs}`;
		} catch {
			out[file] = null;
		}
	}
	return out;
};

const backup = async (files) => {
	const root = await getRepoRoot();
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const dir = path.join(await gitPath('map-diff-backups'), stamp);
	for (const file of files) {
		const target = path.join(dir, file);
		await mkdir(path.dirname(target), { recursive: true });
		await copyFile(path.join(root, file), target);
	}
	return dir;
};

// Arguments:
// - `diff`: the result of `computeDiff` with `base = INDEX` and `head = WORKTREE`.
// - `decisions`: `{ [region key]: { added, changed, removed } }`. Regions without a decision use `defaultKeep`.
// - `snapshot`: the result of `snapshotFiles` when the diff was computed.
// - `restoreUnchanged`: if true, also restore the files that have no pixel changes.
// Returns a report with the number of reverted pixels per file.
export const applyDecisions = async ({ diff, decisions, snapshot, restoreUnchanged }) => {
	const now = await snapshotFiles(Object.keys(snapshot));
	const stale = Object.keys(snapshot).filter((file) => now[file] !== snapshot[file]);
	if (stale.length) {
		throw new Error(`These files changed on disk after the diff was loaded. Reload the page, and try again: ${stale.join(', ')}`);
	}
	const boundsIndex = await readJson(INDEX, 'data/bounds.json');
	const boundsWorktree = await readJson(WORKTREE, 'data/bounds.json');
	if (!boundsIndex || !boundsWorktree || boundsIndex.xMin !== boundsWorktree.xMin || boundsIndex.yMin !== boundsWorktree.yMin
		|| boundsIndex.width !== boundsWorktree.width || boundsIndex.height !== boundsWorktree.height) {
		throw new Error('The map bounds in the working tree are different from the index. Apply supports only equal bounds.');
	}
	const bounds = boundsIndex;

	// Find the regions that revert at least one type, by floor.
	const keepFor = (r) => ({ ...defaultKeep(r), ...decisions[r.key] });
	const byFloor = new Map();
	for (const r of diff.regions) {
		const keep = keepFor(r);
		const reverts = Object.keys(TYPE_NAMES).some((t) => !keep[TYPE_NAMES[t]]);
		if (!reverts) continue;
		if (!byFloor.has(r.floor)) byFloor.set(r.floor, []);
		byFloor.get(r.floor).push({ region: r, keep });
	}

	// Compute the new contents of each file before anything is written.
	const writes = [];
	const restores = [];
	const report = [];
	for (const [floor, list] of byFloor) {
		const id = String(floor).padStart(2, '0');
		for (const layer of ['map', 'path']) {
			const file = `data/floor-${id}-${layer}.png`;
			if (!(file in snapshot) || diff.unchangedFiles.includes(file)) continue;
			if (!list.some(({ region }) => region.layers[layer]?.types)) continue;
			const indexBuffer = await readBlob(INDEX, file);
			const worktreeBuffer = await readBlob(WORKTREE, file);
			if (indexBuffer === null || worktreeBuffer === null) {
				report.push({ file, skipped: 'The file is new or deleted.' });
				continue;
			}
			const before = await decode(indexBuffer);
			const after = await decode(worktreeBuffer);
			if (before.width !== after.width || before.height !== after.height
				|| before.width !== bounds.width || before.height !== bounds.height) {
				throw new Error(`The image size of ${file} is different in the index and the working tree.`);
			}
			const unexplored = unexploredColors(layer, floor);
			const out = new Uint32Array(after.data);
			const reverted = { added: 0, changed: 0, removed: 0 };
			for (const { region, keep } of list) {
				const offsetX = region.x0 - bounds.xMin;
				const offsetY = region.y0 - bounds.yMin;
				for (let y = 0; y < region.height; y++) {
					for (let x = 0; x < region.width; x++) {
						if (region.mask[y * region.width + x] !== 1) continue;
						const ix = x + offsetX;
						const iy = y + offsetY;
						if (ix < 0 || iy < 0 || ix >= bounds.width || iy >= bounds.height) continue;
						const i = iy * bounds.width + ix;
						const t = classifyPixel(before.data[i], after.data[i], unexplored);
						if (t === NONE || keep[TYPE_NAMES[t]]) continue;
						out[i] = before.data[i];
						reverted[TYPE_NAMES[t]]++;
					}
				}
			}
			const total = reverted.added + reverted.changed + reverted.removed;
			if (total === 0) continue;
			let remaining = 0;
			for (let i = 0; i < out.length; i++) {
				if ((out[i] & RGB) !== (before.data[i] & RGB)) remaining++;
			}
			if (remaining === 0) restores.push(file);
			// Use the default PNG options, like `tibia-maps` (`canvas.pngStream()`), so that the bytes
			// are identical to `tibia-maps --from-minimap` output for the same pixels.
			else writes.push({ file, png: toPng(out, after.width, after.height) });
			report.push({ file, reverted, remaining, restored: remaining === 0 });
		}
	}
	if (restoreUnchanged) {
		for (const file of diff.unchangedFiles) {
			restores.push(file);
			report.push({ file, reverted: null, remaining: 0, restored: true, unchanged: true });
		}
	}

	const touched = [...writes.map((w) => w.file), ...restores];
	if (touched.length === 0) return { backupDir: null, report, touched };
	const backupDir = await backup(touched);
	const root = await getRepoRoot();
	for (const { file, png } of writes) await writeFile(path.join(root, file), png);
	await restoreFromIndex(restores);
	return { backupDir, report, touched };
};
