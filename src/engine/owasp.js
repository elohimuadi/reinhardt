import { readFileSync, readdirSync } from 'node:fs';
import { DISCLAIMER } from './common.js';
const directory = new URL('../../data/owasp/', import.meta.url);
export const standards = new Map(readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => {
  const standard = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
  return [standard.id, standard];
}));
export function resolveRef(ref) {
  const colon = ref.indexOf(':');
  if (colon < 0) return null;
  const standard = standards.get(ref.slice(0, colon));
  const item = standard?.items.find(item => item.id === ref.slice(colon + 1));
  return item ? { standard, item } : null;
}
const metadata = ({ id, name, edition, status, url }) => ({ id, name, edition, status, url });
const result = (standard, item) => ({ ref: `${standard.id}:${item.id}`, standard: metadata(standard), item });
export function lookup(query) {
  if (!query) return { disclaimer: DISCLAIMER, standards: [...standards.values()].map(standard => ({ ...metadata(standard), maturity: standard.maturity, item_count: standard.items.length })) };
  const exact = resolveRef(query);
  let results;
  if (exact) results = [result(exact.standard, exact.item)];
  else if (standards.has(query)) results = standards.get(query).items.map(item => result(standards.get(query), item));
  else {
    const all = [...standards.values()].flatMap(standard => standard.items.map(item => result(standard, item)));
    const normalized = query.toLowerCase();
    results = all.filter(({ item }) => item.id.toLowerCase() === normalized);
    if (!results.length && /^CWE-\d+$/i.test(query)) results = all.filter(({ item }) => item.cwe?.some(cwe => cwe.toLowerCase() === normalized));
    if (!results.length) results = all.filter(({ item }) => [item.name, item.summary].some(text => text?.toLowerCase().includes(normalized))).slice(0, 25);
  }
  return { disclaimer: DISCLAIMER, query, results };
}
