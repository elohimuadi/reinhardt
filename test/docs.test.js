import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('README documents all rules, tools, installation and data license', () => {
  const readme=readFileSync('README.md','utf8');
  const {rules}=JSON.parse(readFileSync('data/rules.json','utf8'));
  for(const rule of rules) assert.ok(readme.includes(rule.id),`Missing rule: ${rule.id}`);
  for(const value of ['owasp_lookup','list_rules','/plugin install','CC BY-SA 4.0']) assert.ok(readme.includes(value),`Missing documentation: ${value}`);
  assert.equal(/is secure|compliant app/i.test(readme),false);
  assert.ok(readFileSync('RELEASE-NOTES.md','utf8').includes('0.3.0'));
});

test('README explains benchmark denominator, label provenance and recall limits', () => {
  const readme = readFileSync('README.md', 'utf8');
  for (const value of ['npm run benchmark', '0.953', '61 / (61 + 3)', 'one maintainer', 'known_misses']) assert.ok(readme.includes(value), `Missing benchmark documentation: ${value}`);
});

test('README explains harness triggers, opt-out and host differences', () => {
  const readme = readFileSync('README.md', 'utf8');
  for (const value of ['How the harness works', 'REINHARDT_STOP_GATE=off', '/reinhardt:launch-check', '@agent-reinhardt:finding-verifier', 'self-verification']) assert.ok(readme.includes(value), `Missing harness documentation: ${value}`);
});
