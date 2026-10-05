import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const json = file => JSON.parse(readFileSync(file,'utf8'));
test('dual plugin manifests and package agree on version and transports', () => {
  const pkg=json('package.json');
  assert.equal(pkg.version,'0.2.0');
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']) {
    assert.equal(json(file).version,pkg.version);
    assert.equal(json(file).name,'reinhardt');
  }
  assert.deepEqual(json('.mcp.json').mcpServers.reinhardt.args,['${CLAUDE_PLUGIN_ROOT}/bin/reinhardt.js','mcp']);
  assert.equal(json('codex/mcp.json').mcpServers.reinhardt.command,'reinhardt');
  assert.deepEqual(json('.codex-plugin/plugin.json').hooks,{});
  assert.equal(json('.claude-plugin/marketplace.json').plugins[0].source,'./');
  assert.equal(existsSync('plugin'),false);
  for(const file of ['skills','hooks','.claude-plugin','.codex-plugin','.mcp.json']) assert.ok(pkg.files.includes(file));
});
test('six skills have matching names and Use when descriptions', () => {
  const names=readdirSync('skills').sort();
  assert.equal(names.length,6);
  for(const name of names) {
    const text=readFileSync(`skills/${name}/SKILL.md`,'utf8');
    const front=text.split('---')[1];
    assert.equal(front.match(/^name: (.+)$/m)?.[1],name);
    assert.ok(/^description: Use when /m.test(front),name);
  }
});
test('session-start is executable and emits one context object', () => {
  const result=spawnSync('./hooks/session-start',[],{encoding:'utf8'});
  assert.equal(result.status,0);
  assert.equal(result.stdout.trim().split('\n').length,1);
  const output=JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName,'SessionStart');
  assert.ok(output.additionalContext.includes('secure-by-default'));
  const hook=json('hooks/hooks.json').hooks.SessionStart[0];
  assert.equal(hook.matcher,'startup|clear|compact');
  assert.equal(hook.hooks[0].command,'"${CLAUDE_PLUGIN_ROOT}/hooks/session-start"');
});
