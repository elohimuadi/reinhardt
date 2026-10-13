import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('README links the reference documenting rules, tools and data license', () => {
  const readme=readFileSync('README.md','utf8');
  assert.ok(readme.includes('docs/reference.md'));
  const reference = readFileSync('docs/reference.md', 'utf8');
  const {rules}=JSON.parse(readFileSync('data/rules.json','utf8'));
  for(const rule of rules) assert.ok(reference.includes(rule.id),`Missing rule: ${rule.id}`);
  for(const value of ['owasp_lookup','list_rules','/plugin install','CC BY-SA 4.0']) assert.ok((readme + reference).includes(value),`Missing documentation: ${value}`);
  assert.equal(/is secure|compliant app/i.test(readme),false);
  assert.ok(readFileSync('RELEASE-NOTES.md','utf8').includes('0.3.0'));
});

test('development documentation explains benchmark denominator, provenance and recall limits', () => {
  const readme = readFileSync('docs/development.md', 'utf8');
  for (const value of ['npm run benchmark', '0.953', '61 / (61 + 3)', 'one maintainer', 'known_misses']) assert.ok(readme.includes(value), `Missing benchmark documentation: ${value}`);
});

test('harness documentation explains triggers, opt-out and host differences', () => {
  const readme = readFileSync('docs/harness.md', 'utf8');
  for (const value of ['How the harness works', 'REINHARDT_STOP_GATE=off', '/reinhardt:launch-check', '@agent-reinhardt:finding-verifier', 'self-verification']) assert.ok(readme.includes(value), `Missing harness documentation: ${value}`);
});
