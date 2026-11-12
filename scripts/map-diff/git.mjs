// Git helpers for the map diff viewer.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// The hash of the empty tree, used as the base of a root commit.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// Special sources for `readBlob`: the index (staging area) and the working tree.
export const INDEX = '';
export const WORKTREE = Symbol('worktree');

const git = async (args, { encoding = 'utf8' } = {}) => {
	const { stdout } = await execFileAsync('git', args, {
		encoding,
		maxBuffer: 256 * 1024 * 1024,
	});
	return stdout;
};

let repoRoot = null;
export const getRepoRoot = async () => {
	repoRoot ??= (await git(['rev-parse', '--show-toplevel'])).trim();
	return repoRoot;
};

const verifyCommit = async (rev) => {
	try {
		return (await git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`])).trim();
	} catch {
		throw new Error(`Unknown revision: ${rev}`);
	}
};

const hasParent = async (hash) => {
	try {
		await git(['rev-parse', '--verify', '--quiet', `${hash}^`]);
		return true;
	} catch {
		return false;
	}
};

// Resolves a revision or a range (`A..B`, `A...B`) to base and head commits.
// The base is `null` for the parent of a root commit.
export const resolveRange = async (rev) => {
	const symmetric = rev.match(/^(.*?)\.\.\.(.*)$/);
	if (symmetric) {
		const head = await verifyCommit(symmetric[2] || 'HEAD');
		const other = await verifyCommit(symmetric[1] || 'HEAD');
		const base = (await git(['merge-base', other, head])).trim();
		return { base, head, isRange: true };
	}
	const range = rev.match(/^(.*?)\.\.(.*)$/);
	if (range) {
		const base = await verifyCommit(range[1] || 'HEAD');
		const head = await verifyCommit(range[2] || 'HEAD');
		return { base, head, isRange: true };
	}
	const head = await verifyCommit(rev);
	const base = (await hasParent(head)) ? await verifyCommit(`${head}^`) : null;
	return { base, head, isRange: false };
};

export const listChangedFiles = async (base, head) => {
	const out = await git(['diff', '--name-only', '-z', base ?? EMPTY_TREE, head, '--', 'data/']);
	return out.split('\0').filter(Boolean);
};

// Returns the file contents as a buffer, or `null` if the file does not exist in that source.
// The source is a commit, `INDEX`, `WORKTREE`, or `null` (the parent of a root commit).
export const readBlob = async (source, file) => {
	if (source === null) return null;
	try {
		if (source === WORKTREE) return await readFile(path.join(await getRepoRoot(), file));
		return await git(['cat-file', 'blob', `${source}:${file}`], { encoding: 'buffer' });
	} catch {
		return null;
	}
};

// Lists the files in `data/` that are different in the working tree than in the index.
export const listWorktreeChanges = async () => {
	const out = await git(['diff', '--name-only', '-z', '--', 'data/']);
	return out.split('\0').filter(Boolean);
};

// Restores files in the working tree from the index, with the original bytes.
export const restoreFromIndex = async (files) => {
	if (files.length) await git(['checkout', '--', ...files]);
};

// Returns the absolute path of a file or directory in the Git directory (this also works in linked worktrees).
// Git prints the path relative to the current directory.
export const gitPath = async (name) => path.resolve((await git(['rev-parse', '--git-path', name])).trim());

export const listCommits = async (base, head) => {
	const SEP = '\x1f';
	const range = base === null ? head : `${base}..${head}`;
	const out = await git(['log', `--format=%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI`, range, '--']);
	return out.split('\n').filter(Boolean).map((line) => {
		const [hash, short, subject, author, date] = line.split(SEP);
		return { hash, short, subject, author, date };
	});
};

export const shortHash = async (hash) => {
	if (hash === null) return null;
	return (await git(['rev-parse', '--short', hash])).trim();
};

// Returns the GitHub web URL of the `origin` remote, if there is one.
export const getRepoUrl = async () => {
	try {
		const url = (await git(['remote', 'get-url', 'origin'])).trim();
		const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
		return match ? `https://github.com/${match[1]}` : null;
	} catch {
		return null;
	}
};
