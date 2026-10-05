import path from 'node:path';
import { lineIndex } from './common.js';

export const hasPrivacyManifest = files => files.some(file => path.posix.basename(file.path) === 'PrivacyInfo.xcprivacy');

export function tablesWithoutRls(files) {
  // Capture the full qualified name so a non-public schema cannot be mistaken
  // for an unqualified table. Matching never crosses an SQL statement boundary.
  const identifier = '(?:"[^"\\r\\n]{1,256}"|[a-z_][a-z0-9_$]{0,255})';
  const qualified = `(${identifier})(?:\\s*\\.\\s*(${identifier}))?`;
  const create = new RegExp(`\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${qualified}\\s*\\(`, 'gi');
  const enable = new RegExp(`\\balter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?${qualified}\\s+enable\\s+row\\s+level\\s+security\\b`, 'gi');
  const normalize = name => name.replaceAll('"', '').toLowerCase();
  const tableName = match => match[2] ? (normalize(match[1]) === 'public' ? normalize(match[2]) : null) : normalize(match[1]);
  const enabled = new Set(), created = [];
  for (const file of files) {
    if (path.posix.extname(file.path).toLowerCase() !== '.sql') continue;
    for (const match of file.text.matchAll(enable)) {
      const name = tableName(match);
      if (name) enabled.add(name);
    }
    const line = lineIndex(file.text);
    for (const match of file.text.matchAll(create)) {
      const name = tableName(match);
      if (name) created.push({ name, evidence: { file: file.path, line: line(match.index), kind: 'table-without-rls' } });
    }
  }
  return created.filter(table => !enabled.has(table.name)).map(table => table.evidence);
}
