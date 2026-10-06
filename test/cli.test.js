import { ruleset } from '../src/engine/rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const cli=(...args)=>spawnSync(process.execPath,['bin/reinhardt.js',...args],{encoding:'utf8'});
test('CLI human output, JSON and CI thresholds',()=>{
  const human=cli('scan','evals/fixtures/leaky-web');
  assert.equal(human.status,0);
  assert.match(human.stdout,/\[HIGH\].*undisclosed-sdk/);
  assert.match(human.stdout,/src\/app.js:4/);
  assert.equal(cli('scan','evals/fixtures/leaky-web','--fail-on','high').status,1);
  const clean=cli('scan','evals/fixtures/clean-web','--json','--fail-on','low');
  assert.equal(clean.status,0);
  assert.deepEqual(JSON.parse(clean.stdout).findings,[]);
  assert.equal(cli('scan','--fail-on','oops').status,2);
  assert.equal(cli('scan','--fail-on','constructor').status,2);
});
test('OWASP CLI lookup and readable prevention guidance', () => {
  const result = cli('owasp','A01:2025','--json');
  assert.equal(result.status,0);
  assert.equal(JSON.parse(result.stdout).results[0].item.name,'Broken Access Control');
  assert.match(cli('owasp').stdout,/top10-2025.*2025.*released/);
  assert.match(cli('owasp','A01:2025').stdout,/top10-2025:A01:2025 — Broken Access Control/);
});
test('rules CLI lists all rules, explains without vectors, and rejects unknown ids', () => {
  const result = cli('rules','--json');
  assert.equal(result.status,0);
  const {rules} = JSON.parse(result.stdout);
  assert.equal(rules.length,ruleset.rules.length);
  assert.deepEqual(rules.map(rule=>rule.id),rules.map(rule=>rule.id).sort());
  const detail = JSON.parse(cli('rules','hardcoded-secret','--json').stdout).rules[0];
  assert.equal(detail.id,'hardcoded-secret');
  assert.equal('tests' in detail,false);
  assert.equal(cli('rules','nope').status,2);
  assert.match(cli('rules','nope').stderr,/Unknown rule: nope/);
});
test('security CLI prints mappings without secret text and applies CI threshold', () => {
  const result = cli('scan','evals/fixtures/leaky-security-web');
  assert.equal(result.status,0);
  assert.match(result.stdout,/OWASP: /);
  assert.equal(result.stdout.includes('AKIA'+'IOSFODNN7EXAMPLE'),false);
  assert.equal(cli('scan','evals/fixtures/leaky-security-web','--fail-on','high').status,1);
});
