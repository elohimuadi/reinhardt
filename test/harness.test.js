import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { editedPaths } from '../src/harness/edits.js';
import { loadState, saveState } from '../src/harness/state.js';
import { render } from '../src/harness/messages.js';

async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'reinhardt-harness-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const cwd = path.resolve('/project');
test('Claude edits are relative, bounded by cwd and POSIX', () => {
  for (const tool_name of ['Edit', 'Write', 'MultiEdit']) {
    assert.deepEqual(editedPaths({ cwd, tool_name, tool_input: { file_path: path.join(cwd, 'src/a.js') } }), ['src/a.js']);
  }
  for (const file_path of ['/elsewhere/a.js', '../a.js', '../project-other/a.js', '.']) assert.deepEqual(editedPaths({ cwd, tool_name: 'Edit', tool_input: { file_path } }), []);
  assert.deepEqual(editedPaths({ cwd, tool_name: 'Bash', tool_input: { file_path: 'a.js' } }), []);
  assert.deepEqual(editedPaths({ cwd, tool_name: 'Edit' }), []);
});
test('Codex patch records update, add, move and delete paths, sorted and unique', () => {
  const command = '*** Begin Patch\n*** Update File: src/a.js\n*** Move to: src/b.js\n*** Add File: src/c.js\n*** Update File: src/a.js\n*** End Patch';
  for (const field of ['command', 'input', 'patch']) assert.deepEqual(editedPaths({ cwd, tool_name: 'apply_patch', tool_input: { [field]: command } }), ['src/a.js', 'src/b.js', 'src/c.js']);
  assert.deepEqual(editedPaths({ cwd, tool_name: 'apply_patch', tool_input: { command: '*** Delete File: src/old.js\n*** Add File: ../outside.js' } }), ['src/old.js']);
});
test('state sanitizes session ids, persists sorted unique arrays and uses host data directories', async t => {
  const root = await temporary(t);
  const oldClaude = process.env.CLAUDE_PLUGIN_DATA, oldPlugin = process.env.PLUGIN_DATA;
  t.after(() => {
    for (const [key, value] of [['CLAUDE_PLUGIN_DATA', oldClaude], ['PLUGIN_DATA', oldPlugin]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.CLAUDE_PLUGIN_DATA = root;
  process.env.PLUGIN_DATA = path.join(root, 'fallback');
  assert.deepEqual(await loadState('new'), { edited: [], reported: [], gated: [] });
  await saveState('../x', { edited: ['z', 'a', 'z'], reported: ['r', 'r'], gated: ['b', 'a'] });
  const expected = { edited: ['a', 'z'], reported: ['r'], gated: ['a', 'b'] };
  assert.deepEqual(await loadState('../x'), expected);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'sessions/unknown.json'), 'utf8')), expected);
  delete process.env.CLAUDE_PLUGIN_DATA;
  await saveState('valid-ID_1', expected);
  assert.deepEqual(await loadState('valid-ID_1'), expected);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'fallback/sessions/valid-ID_1.json'), 'utf8')), expected);
});
test('messages fill every placeholder and preserve literal JSON', async () => {
  const templates = JSON.parse(await readFile('hooks/messages.json', 'utf8'));
  for (const [key, parts] of Object.entries(templates)) {
    if (typeof parts !== 'object') continue;
    for (const [part, template] of Object.entries(parts)) {
      const names = [...template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
      const values = Object.fromEntries(names.map(name => [name, `value-${name}`]));
      assert.equal(render(key, part, values), template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => values[name]));
      if (names.length) assert.throws(() => render(key, part, {}));
    }
  }
  assert.match(render('post_edit_findings', 'footer', {}), /\{"id": "<rule_id>"\}/);
  assert.throws(() => render('missing', 'line', {}));
});
test('hook runner swallows malformed input and unknown events', () => {
  for (const input of ['{broken', '{}', 'null']) {
    const result = spawnSync(process.execPath, ['hooks/reinhardt-hook.mjs', 'unknown'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
test('SessionStart injects the bootstrap body without frontmatter within the host limit', async () => {
  const result = spawnSync(process.execPath, ['hooks/reinhardt-hook.mjs', 'session-start'], { input: '{}', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'SessionStart');
  assert.match(output.additionalContext, /reinhardt:secure-by-default/);
  assert.doesNotMatch(output.additionalContext, /^---$/m);
  const skill = await readFile('skills/using-reinhardt/SKILL.md', 'utf8');
  assert.equal(output.additionalContext, 'reinhardt is installed. The using-reinhardt skill follows; obey it.\n\n' + skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim());
  assert.ok(output.additionalContext.length <= 10_000);
});
async function repo(t, files = {}) {
  const root = await temporary(t);
  const cwd = path.join(root, 'repo');
  await mkdir(cwd);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), text);
  }
  const data = path.join(root, 'data');
  const input = { cwd, session_id: 'test-session', tool_name: 'Edit', tool_input: { file_path: 'src/chat.js' } };
  const run = (event, override = {}, env = {}) => spawnSync(process.execPath, ['hooks/reinhardt-hook.mjs', event], {
    input: JSON.stringify({ ...input, ...override }), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: data, REINHARDT_STOP_GATE: '', ...env }, timeout: 10_000
  });
  return { cwd, data, run };
}
function context(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'PostToolUse');
  return output.additionalContext;
}
function silent(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}
test('post-edit reports changed-file findings once, without unrelated evidence', async t => {
  const { run, data, cwd } = await repo(t, {
    'src/chat.js': 'dangerouslyAllowBrowser: true',
    'src/legacy.js': 'dangerouslyAllowBrowser: true'
  });
  const output = context(run('post-edit'));
  assert.match(output, /llm-sdk-in-browser at src\/chat.js:1/);
  assert.doesNotMatch(output, /legacy\.js/);
  assert.ok(!output.includes(cwd));
  silent(run('post-edit'));
  const state = JSON.parse(await readFile(path.join(data, 'sessions/test-session.json'), 'utf8'));
  assert.deepEqual(state.edited, ['src/chat.js']);
  assert.deepEqual(state.reported, ['llm-sdk-in-browser:src/chat.js:1']);
});
test('post-edit supports Codex rules files and records deleted paths without findings', async t => {
  const { run, data } = await repo(t, { 'firestore.rules': 'allow read, write: if true;' });
  const output = context(run('post-edit', { tool_name: 'apply_patch', tool_input: { command: '*** Add File: firestore.rules\n*** Delete File: old.js' } }));
  assert.match(output, /firebase-open-rules at firestore.rules:1/);
  assert.deepEqual(JSON.parse(await readFile(path.join(data, 'sessions/test-session.json'), 'utf8')).edited, ['firestore.rules', 'old.js']);
});
test('manifest edit reports unnamed recipients once, without reporting unrelated manifests', async t => {
  const { run } = await repo(t, {
    'package.json': '{"dependencies":{"posthog-js":"1"}}',
    'nested/package.json': '{"dependencies":{"@sentry/browser":"1"}}'
  });
  const input = { tool_input: { file_path: 'package.json' } };
  const output = context(run('post-edit', input));
  assert.match(output, /PostHog/);
  assert.doesNotMatch(output, /Sentry/);
  silent(run('post-edit', input));
});
test('malformed manifests and state produce no output or errors', async t => {
  const { run, data, cwd } = await repo(t, { 'package.json': '{broken', 'src/chat.js': 'dangerouslyAllowBrowser: true' });
  silent(run('post-edit'));
  await writeFile(path.join(cwd, 'package.json'), '{}');
  await mkdir(path.join(data, 'sessions'), { recursive: true });
  await writeFile(path.join(data, 'sessions/test-session.json'), '{broken');
  silent(run('post-edit'));
});
test('post-edit never emits matched credentials', async t => {
  const credential = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const { run } = await repo(t, { 'config/aws.json': JSON.stringify({ accessKey: credential }) });
  const output = context(run('post-edit', { tool_input: { file_path: 'config/aws.json' } }));
  assert.match(output, /hardcoded-secret at config\/aws.json:1/);
  assert.equal(output.includes(credential), false);
});
test('post-edit ignores findings outside this call even if edited earlier', async t => {
  const { run, cwd } = await repo(t, { 'src/chat.js': '', 'src/other.js': '' });
  silent(run('post-edit'));
  await writeFile(path.join(cwd, 'src/chat.js'), 'dangerouslyAllowBrowser: true');
  silent(run('post-edit', { tool_input: { file_path: 'src/other.js' } }));
});
test('post-edit fixture scan completes within three seconds', async t => {
  const { run } = await repo(t);
  const start = performance.now();
  const result = run('post-edit', { cwd: path.resolve('evals/fixtures/leaky-security-web'), tool_input: { file_path: 'package.json' } });
  assert.equal(result.status, 0);
  assert.ok(performance.now() - start < 3000);
});
