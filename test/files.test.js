import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walk, readText, MAX_BYTES } from '../src/engine/files.js';

test('walker and reader exclude secrets, dependencies, lockfiles, output, large files and links', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'reinhardt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['node_modules', 'dist', '.env.backup']) {
    await mkdir(path.join(root, dir));
    await writeFile(path.join(root, dir, 'hidden.js'), 'secret');
  }
  for (const name of ['.env', '.env.local', 'package-lock.json', 'yarn.lock', 'Podfile.lock', 'Package.resolved']) await writeFile(path.join(root, name), 'secret');
  await writeFile(path.join(root, 'big.js'), 'x'.repeat(MAX_BYTES + 1));
  await writeFile(path.join(root, 'app.js'), 'hello');
  await symlink(path.join(root, '.env'), path.join(root, 'linked.js'));
  assert.deepEqual(await walk(root), ['app.js']);
  assert.equal(await readText(root, 'app.js'), 'hello');
  for (const name of ['.env', 'node_modules/hidden.js', 'package-lock.json', 'big.js', 'linked.js', '../outside']) await assert.rejects(readText(root, name));
});
