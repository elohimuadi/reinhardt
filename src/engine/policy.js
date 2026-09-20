import path from 'node:path';
import { compare, readText } from './files.js';
import { catalog } from './catalog.js';
const extensions = /\.(?:md|mdx|txt|html|tsx|jsx|astro|vue|svelte)$/i;
export const isPolicyCandidate = file => /privacy/i.test(file) && extensions.test(file);
export function stripMarkup(text) {
  return text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, entity => ({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[entity]).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => { const point = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1),16) : Number(value); return point <= 0x10ffff ? String.fromCodePoint(point) : ' '; }).replace(/[*_`#]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
}
export function disclosure(sdk, policy) {
  if (!policy) return 'no-policy';
  if (sdk.aliases.some(alias => containsTerm(policy.text, alias))) return 'named';
  return catalog.categories[sdk.category].generic_terms.some(term => containsTerm(policy.text, term)) ? 'generic' : 'undisclosed';
}
export async function findPolicy(root, files, override) {
  if (override) {
    const file = path.relative(root, path.resolve(root, override)).split(path.sep).join('/');
    const text = stripMarkup(await readText(root, file));
    if (!text) throw new Error('Explicit policy contains no text');
    return { file, text, explicit: true };
  }
  const candidates = [];
  for (const file of files.filter(isPolicyCandidate)) {
    const text = stripMarkup(await readText(root, file));
    if (text.length > 800) candidates.push({ file, text, explicit: false });
  }
  candidates.sort((a,b) => b.text.length - a.text.length || compare(a.file,b.file));
  return candidates[0] ?? null;
}
