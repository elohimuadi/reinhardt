import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const json = file => JSON.parse(readFileSync(file,'utf8'));
test('dual plugin manifests and package agree on version and transports', () => {
  const pkg=json('package.json');
  assert.equal(pkg.version,'0.4.0');
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']) {
    assert.equal(json(file).version,pkg.version);
    assert.equal(json(file).name,'reinhardt');
  }
  assert.deepEqual(json('.claude-plugin/mcp.json').mcpServers.reinhardt.args,['${CLAUDE_PLUGIN_ROOT}/cli/reinhardt.js','mcp']);
  assert.equal(json('codex/mcp.json').mcpServers.reinhardt.command,'reinhardt');
  assert.equal(json('.codex-plugin/plugin.json').hooks,'./hooks/hooks.json');
  assert.equal(json('.claude-plugin/marketplace.json').plugins[0].source,'./');
  assert.equal(existsSync('plugin'),false);
  for(const file of ['skills','hooks','agents','cli','.claude-plugin','.codex-plugin']) assert.ok(pkg.files.includes(file));
});
test('eight skills have matching names and Use when descriptions', () => {
  const names=readdirSync('skills').sort();
  assert.equal(names.length,8);
  for(const name of names) {
    const text=readFileSync(`skills/${name}/SKILL.md`,'utf8');
    const front=text.split('---')[1];
    assert.equal(front.match(/^name: (.+)$/m)?.[1],name);
    assert.ok(/^description: Use when /m.test(front),name);
  }
});
test('session-start runner emits one context object', () => {
  const result=spawnSync(process.execPath,['hooks/reinhardt-hook.mjs','session-start'],{encoding:'utf8'});
  assert.equal(result.status,0);
  assert.equal(result.stdout.trim().split('\n').length,1);
  const output=JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName,'SessionStart');
  assert.ok(output.additionalContext.includes('secure-by-default'));
  const hook=json('hooks/hooks.json').hooks.SessionStart[0];
  assert.equal(hook.matcher,'startup|clear|compact');
  assert.equal(hook.hooks[0].command,'node "${CLAUDE_PLUGIN_ROOT}/hooks/reinhardt-hook.mjs" session-start');
});

test('Claude MCP config is plugin-scoped and absent from project root', () => {
  assert.equal(existsSync('.mcp.json'),false);
  assert.equal(json('.claude-plugin/plugin.json').mcpServers,'./.claude-plugin/mcp.json');
  assert.equal(json('package.json').files.includes('.mcp.json'),false);
});

test('plugin has no top-level bin directory', () => {
  assert.equal(existsSync('bin'), false);
  assert.equal(json('package.json').bin.reinhardt, 'cli/reinhardt.js');
  assert.ok(json('package.json').files.includes('cli'));
});

test('both hosts use the three harness events with bounded edit and Stop timeouts', () => {
  const hooks = json('hooks/hooks.json').hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'SessionStart', 'Stop']);
  for (const [event, argument, matcher] of [['SessionStart', 'session-start', 'startup|clear|compact'], ['PostToolUse', 'post-edit', 'Edit|Write|MultiEdit|apply_patch'], ['Stop', 'stop', undefined]]) {
    assert.equal(hooks[event].length, 1);
    assert.equal(hooks[event][0].matcher, matcher);
    assert.equal(hooks[event][0].hooks.length, 1);
    const hook = hooks[event][0].hooks[0];
    assert.equal(hook.type, 'command');
    assert.equal(hook.command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/reinhardt-hook.mjs" ' + argument);
    if (event !== 'SessionStart') assert.equal(hook.timeout, 20);
  }
});
test('verifier agent is read-only and packaged', () => {
  const front = readFileSync('agents/finding-verifier.md', 'utf8').split('---')[1];
  assert.match(front, /^name: finding-verifier$/m);
  assert.match(front, /^tools: Read, Grep, Glob$/m);
});
