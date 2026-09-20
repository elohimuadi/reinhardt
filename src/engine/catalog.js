import { readFileSync } from 'node:fs';
import { compare } from './files.js';
import { DISCLAIMER } from './common.js';
export const catalog = JSON.parse(readFileSync(new URL('../../data/sdks.json', import.meta.url), 'utf8'));
export function matchName(name, pattern, ecosystem = 'npm') {
  const normalize = value => ecosystem === 'pypi' ? value.toLowerCase().replace(/[-_.]+/g, '-') : value.toLowerCase();
  const candidate = normalize(name);
  const target = normalize(pattern);
  return target.endsWith('*') ? candidate.startsWith(target.slice(0, -1)) : candidate === target;
}
export function matchingSdks(ecosystem, name) {
  return catalog.sdks.filter(sdk => sdk.match[ecosystem]?.some(pattern => matchName(name, pattern, ecosystem)));
}
export function explainSdk(id) {
  const sdks = id ? catalog.sdks.filter(sdk => sdk.id === id) : catalog.sdks;
  if (!sdks.length) throw new Error(`Unknown SDK: ${id}`);
  return { disclaimer: DISCLAIMER, sdks: sdks.toSorted((a,b) => compare(a.id,b.id)).map(sdk => ({ ...sdk, purpose: catalog.categories[sdk.category].purpose, note: 'Potential data types; actual collection depends on initialization, configuration, and use.' + (sdk.id === 'vercel-ai' ? ' Vercel AI SDK may route requests to another provider and is not itself proof of a Vercel recipient.' : '') })) };
}
