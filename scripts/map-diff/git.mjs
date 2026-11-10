// Git helpers for the map diff viewer.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// The hash of the empty tree, used as the base of a root commit.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const git = async (args, { encoding = 'utf8' } = {}) => {
	const { stdout } = await execFileAsync('git', args, {
		encoding,
		maxBuffer: 256 * 1024 * 1024,
	});
	return stdout;
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

// Returns the file contents as a buffer, or `null` if the file does not exist in that commit.
export const readBlob = async (commit, path) => {
	if (commit === null) return null;
	try {
		return await git(['cat-file', 'blob', `${commit}:${path}`], { encoding: 'buffer' });
	} catch {
		return null;
	}
};

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
