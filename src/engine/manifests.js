import path from 'node:path';
import { evidenceAt } from './common.js';
export const isManifest = file => ['package.json','requirements.txt','Podfile','Package.swift','project.pbxproj'].includes(path.basename(file));
function swiftName(url) { return url.replace(/\/$/, '').replace(/\.git$/i, '').split('/').at(-1); }
export function parseManifest(file, text) {
  const dependencies = [];
  const add = (ecosystem, name, offset) => dependencies.push({ ecosystem, name, evidence: evidenceAt(file, text, offset, 'dependency') });
  switch (path.basename(file)) {
    case 'package.json': {
      const manifest = JSON.parse(text);
      // Locate keys with their owning top-level section, including duplicate names
      // that also occur in devDependencies, without evaluating any code.
      for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        if (!manifest[section] || typeof manifest[section] !== 'object' || Array.isArray(manifest[section])) continue;
        const sectionStart = text.search(new RegExp(`"${section}"\\s*:`));
        for (const name of Object.keys(manifest[section])) {
          const offset = text.indexOf(JSON.stringify(name), sectionStart);
          add('npm', name, Math.max(0, offset));
          const version = manifest[section][name];
          if (typeof version === 'string' && version.startsWith('npm:')) {
            const alias = version.slice(4).match(/^(@[^/]+\/[^@]+|[^@]+)(?:@|$)/)?.[1];
            if (alias) add('npm', alias, Math.max(0, offset));
          }
        }
      }
      break;
    }
    case 'requirements.txt': {
      let offset = 0;
      for (const line of text.split('\n')) {
        const name = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\s|\[|[<>=!~;@]|$)/)?.[1];
        if (name) add('pypi', name, offset);
        offset += line.length + 1;
      }
      break;
    }
    case 'Podfile':
      for (const match of text.matchAll(/^\s*pod\s+['"]([^'"]+)['"]/gm)) add('pod', match[1], match.index);
      break;
    case 'Package.swift':
      for (const match of text.matchAll(/\.package\s*\(\s*(?:name\s*:\s*"[^"]+"\s*,\s*)?url\s*:\s*"([^"]+)"/g)) add('swiftpm', swiftName(match[1]), match.index);
      break;
    case 'project.pbxproj':
      for (const match of text.matchAll(/\brepositoryURL\s*=\s*"?([^";\s]+)"?\s*;/g)) add('swiftpm', swiftName(match[1]), match.index);
      break;
  }
  return dependencies;
}
