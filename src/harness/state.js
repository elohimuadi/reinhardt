import { readFile, mkdir, mkdtemp, rename, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function location(sessionId) {
  const id = typeof sessionId === 'string' && /^[A-Za-z0-9_-]+$/.test(sessionId) ? sessionId : 'unknown';
  const root = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || path.join(tmpdir(), 'reinhardt-hooks');
  return path.join(root, 'sessions', `${id}.json`);
}
const normalize = state => Object.fromEntries(['edited', 'reported', 'gated'].map(key => {
  if (!Array.isArray(state[key]) || state[key].some(value => typeof value !== 'string')) throw new Error('Invalid hook state');
  return [key, [...new Set(state[key])].sort()];
}));
export async function loadState(sessionId) {
  try { return normalize(JSON.parse(await readFile(location(sessionId), 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return { edited: [], reported: [], gated: [] };
    throw error;
  }
}
export async function saveState(sessionId, state) {
  const content = JSON.stringify(normalize(state)) + '\n';
  const file = location(sessionId);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = await mkdtemp(path.join(path.dirname(file), '.write-'));
  try {
    const pending = path.join(temporary, 'state.json');
    await writeFile(pending, content, { mode: 0o600 });
    await rename(pending, file);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
