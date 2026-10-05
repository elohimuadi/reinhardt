import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { standards, resolveRef, lookup } from '../src/engine/owasp.js';
import { DISCLAIMER } from '../src/engine/common.js';

test('every standard file parses, ids match file stems, item ids are unique per standard', () => {
  const files = readdirSync(new URL('../data/owasp/', import.meta.url)).filter(file => file.endsWith('.json'));
  assert.equal(standards.size, files.length);
  for (const file of files) {
    const id = file.slice(0, -5), standard = standards.get(id);
    assert.equal(standard.id, id);
    assert.equal(new Set(standard.items.map(item => item.id)).size, standard.items.length);
  }
});
test('every related ref in every item resolves', () => {
  for (const standard of standards.values()) for (const item of standard.items) for (const ref of item.related ?? []) {
    assert.ok(resolveRef(ref.replace(/^\(inferred\) /, '')), `${standard.id}:${item.id} -> ${ref}`);
  }
});
test('resolveRef handles colons in item ids', () => {
  assert.equal(resolveRef('top10-2025:A01:2025').item.name, 'Broken Access Control');
  assert.equal(resolveRef('nope:X'), null);
});
test('lookup precedence', () => {
  assert.equal(lookup('llm-top10-2026:LLM01:2026').results.length, 1);
  assert.equal(lookup('api-top10-2023').results.length, 10);
  assert.equal(lookup('a05:2025').results[0].item.name, 'Injection');
  assert.ok(lookup('CWE-918').results.some(result => result.ref === 'top10-2025:A01:2025'));
  assert.ok(lookup('row level security').results.length <= 25);
  assert.deepEqual(lookup('zzzz-no-match').results, []);
  assert.equal(lookup('M5').results.length, [...standards.values()].flatMap(standard => standard.items).filter(item => item.id.toLowerCase() === 'm5').length);
  assert.equal(lookup('M5').disclaimer, DISCLAIMER);
});
test('lookup without query lists 22 standards sorted by id, with disclaimer', () => {
  const report = lookup();
  assert.equal(report.disclaimer, DISCLAIMER);
  assert.equal(report.standards.length, 22);
  const ids = report.standards.map(standard => standard.id);
  assert.deepEqual(ids, [...ids].sort());
  for (const standard of report.standards) assert.equal(standard.item_count, standards.get(standard.id).items.length);
});
