import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const MAX_BYTES = 1_000_000;
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'pods', 'deriveddata', 'vendor', 'venv', '.venv', 'env', '__pycache__', '.reinhardt', 'coverage', '.nuxt', '.output', '.turbo', '.cache', 'out', 'target', 'bower_components', '.build', '.swiftpm']);
export function forbidden(name) {
  const lower = name.toLowerCase();
  return ignored.has(lower) || lower.startsWith('.env') || /(?:^|[.-])lock(?:\.|$)/i.test(name) || ['package-lock.json', 'npm-shrinkwrap.json', 'package.resolved', 'pipfile.lock', 'bun.lockb'].includes(lower) || /\.(?:min\.(?:js|css)|map)$/.test(lower);
}
export function allowedPath(relative) {
  return relative.split(/[\\/]/).every(part => part !== '..' && !forbidden(part));
}
export async function repoRoot(input) {
  const root = await realpath(path.resolve(input));
  if (!(await lstat(root)).isDirectory()) throw new Error('Repository path must be a directory');
  return root;
}
// All repository content, including explicit policy and baseline reads, goes here.
// Refuse symlinks in every component and bound the read itself, not just stat().
export async function readText(root, relative, { baseline = false } = {}) {
  const rel = path.relative(root, path.resolve(root, relative));
  if (!rel || path.isAbsolute(rel) || (!baseline && !allowedPath(rel)) || (baseline && rel !== path.join('.reinhardt', 'baseline.json'))) throw new Error('Excluded or outside-repository file');
  let current = root;
  for (const component of rel.split(path.sep)) {
    current = path.join(current, component);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are excluded');
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Not a regular file or exceeds 1MB');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_BYTES) throw new Error('File exceeds 1MB');
    const text = buffer.subarray(0, total).toString('utf8');
    if (text.includes('\0')) throw new Error('Binary files are excluded');
    return text;
  } finally { await handle.close(); }
}
export async function walk(root) {
  const files = [];
  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      if (forbidden(entry.name) || entry.isSymbolicLink()) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile() && (await lstat(path.join(root, relative))).size <= MAX_BYTES) files.push(relative);
    }
  }
  await visit(root);
  return files.sort(compare);
}
