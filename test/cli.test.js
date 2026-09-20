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
});
