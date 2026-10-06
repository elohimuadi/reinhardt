import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../evals/benchmark.js';
const finding = (rule, line = 1) => ({ rule, file: 'src/app.js', line });
const empty = () => ({ tp: [], fp: [], unresolved: [], missingTp: [], fixedFp: [], unlabelled: [] });
for (const [verdict, present, bucket] of [['tp', true, 'tp'], ['tp', false, 'missingTp'], ['fp', true, 'fp'], ['fp', false, 'fixedFp'], ['unresolved', true, 'unresolved'], ['unresolved', false, null]]) {
  test(`compare ${verdict} ${present ? 'present' : 'absent'}`, () => {
    const item = finding('rule');
    const expected = empty();
    if (bucket) expected[bucket] = [item];
    assert.deepEqual(compare({ findings: [{ ...item, verdict, note: 'not output' }] }, present ? [item] : []), expected);
  });
}
test('compare matches full identity, deduplicates and sorts without source text', () => {
  const labels = { findings: [{ ...finding('a'), verdict: 'tp' }] };
  const findings = [finding('z'), finding('a', 2), { ...finding('a', 2), text: 'not output' }];
  const expected = { ...empty(), missingTp: [finding('a')], unlabelled: [finding('a', 2), finding('z')] };
  assert.deepEqual(compare(labels, findings), expected);
  assert.deepEqual(compare(labels, [...findings].reverse()), expected);
  assert.equal(compare(labels, [{ ...finding('a'), file: 'other.js' }]).unlabelled.length, 1);
});
