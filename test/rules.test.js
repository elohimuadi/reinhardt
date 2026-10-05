import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fileClasses, vectorText, isTestPath, matchRule } from '../src/engine/rules.js';
import { resolveRef, standards } from '../src/engine/owasp.js';
import { lineIndex } from '../src/engine/common.js';

test('rules data integrity', () => {
  assert.equal(new Set(ruleset.rules.map(rule => rule.id)).size, ruleset.rules.length);
  const asvs = new Set(standards.get('asvs-5.0').items.flatMap(item => item.l1_requirements ?? []).map(item => `v5.0.0-${item.id}`));
  for (const rule of ruleset.rules) {
    for (const name of rule.files) assert.ok(ruleset.file_classes[name], `${rule.id}: class ${name}`);
    for (const key of ['patterns', 'require_file_all', 'suppress_if_file', 'context_any']) for (const pattern of rule[key] ?? []) assert.doesNotThrow(() => new RegExp(pattern.regex, pattern.flags));
    for (const pattern of rule.path_any ?? []) assert.doesNotThrow(() => new RegExp(pattern));
    for (const ref of [...rule.owasp, ...rule.guidance]) assert.ok(resolveRef(ref), `${rule.id}: ${ref}`);
    for (const ref of rule.asvs) assert.ok(asvs.has(ref), `${rule.id}: ${ref}`);
    for (const field of ['severity', 'confidence']) assert.ok(['high', 'medium', 'low'].includes(rule[field]));
  }
  for (const refs of Object.values(ruleset.privacy_rules)) for (const ref of refs) assert.ok(resolveRef(ref), ref);
  assert.doesNotThrow(() => new RegExp(ruleset.test_path_regex));
  for (const spec of Object.values(ruleset.file_classes)) if (spec.path_regex) assert.doesNotThrow(() => new RegExp(spec.path_regex));
});
for (const rule of ruleset.rules) for (const type of ['positive', 'negative']) for (const [i, vector] of rule.tests[type].entries()) {
  test(`${rule.id} ${type} #${i}`, () => {
    const files = [vector, ...(vector.with ?? [])].map(({ path, text }) => ({ path, text: vectorText(text) }));
    const actual = matchRule(rule, files);
    // Do not print vector contents: several contain credential-shaped samples.
    assert.equal(actual.length > 0, type === 'positive', `${rule.id} ${type} #${i}: expected ${type === 'positive' ? '>0' : '0'} evidence, actual ${actual.length}`);
  });
}
test('fileClasses and test paths', () => {
  assert.deepEqual(fileClasses('.github/workflows/ci.yml').sort(), ['config','workflow']);
  assert.ok(fileClasses('docker/Dockerfile.prod').includes('dockerfile'));
  assert.ok(fileClasses('App/Info.plist').includes('plist'));
  assert.deepEqual(fileClasses('database.rules.json').sort(), ['config','firebase-rules']);
  assert.ok(fileClasses('src/A.TS').includes('js'));
  assert.equal(isTestPath('src/a.test.ts'), true);
  assert.equal(isTestPath('src/testing.ts'), false);
  assert.equal(vectorText(['one','two']), 'onetwo');
});
test('evidence lines are 1-based and correct', () => {
  const rule = ruleset.rules.find(rule => rule.id === 'llm-sdk-in-browser');
  assert.deepEqual(matchRule(rule, [{path:'src/a.js',text:'// a\n// b\ndangerouslyAllowBrowser: true'}]), [{file:'src/a.js',line:3,kind:'dangerously-allow-browser'}]);
  const index = lineIndex('a\nb\n');
  assert.deepEqual([0,1,2,3,4].map(index), [1,1,2,2,3]);
});
test('repository checks handle cross-file RLS and cap privacy manifest evidence', () => {
  const rls = ruleset.rules.find(rule => rule.kind === 'supabase-rls');
  assert.deepEqual(matchRule(rls,[{path:'db/a.sql',text:'create table "public"."Notes" (id int); create table private.hidden (id int);'},{path:'db/b.sql',text:'alter table only if exists public.notes enable row level security;'}]), []);
  const rule = ruleset.rules.find(rule => rule.kind === 'ios-privacy-manifest');
  const files = [{path:'App/Z.swift',text:'UserDefaults\n'.repeat(30)}, {path:'App/A.swift',text:'UserDefaults'}];
  const evidence = matchRule(rule, files);
  assert.equal(evidence.length,20);
  assert.equal(evidence[0].file,'App/A.swift');
  assert.deepEqual(evidence,matchRule(rule,[...files].reverse()));
});
test('performance: all JS rules scan a 1MB single line in under 2 seconds', () => {
  const snippet = 'new OpenAI({ dangerouslyAllowBrowser: true });';
  const text = 'a=1;'.repeat(Math.floor((1_000_000-snippet.length)/4)).padEnd(1_000_000-snippet.length,' ') + snippet;
  assert.equal(text.length,1_000_000);
  const start = performance.now();
  for (const rule of ruleset.rules.filter(rule => rule.files.includes('js'))) matchRule(rule,[{path:'src/app.js',text}]);
  const elapsed = performance.now()-start;
  assert.ok(elapsed < 2000, `Took ${elapsed.toFixed(1)}ms`);
});
