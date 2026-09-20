import { catalog } from './catalog.js';
import { evidenceAt } from './common.js';
export const isSource = file => /\.(?:[cm]?[jt]sx?|html|astro|vue|svelte|py|swift|m|mm|h|rb|php|go|rs|java|kt|dart)$/i.test(file);
export function findEndpoints(file, text) {
  const results = [];
  for (const match of text.matchAll(/(?:https?:)?\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?=[:/\s"'`<>\\?#)]|$)/gi)) {
    const host = match[1].toLowerCase();
    for (const sdk of catalog.sdks) if (sdk.domains.some(domain => host === domain || host.endsWith('.' + domain))) results.push({ sdk, evidence: evidenceAt(file, text, match.index, 'endpoint') });
  }
  return results;
}
