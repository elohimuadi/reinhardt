import { readFileSync } from 'node:fs';
const templates = JSON.parse(readFileSync(new URL('../../hooks/messages.json', import.meta.url), 'utf8'));
export function render(templateKey, part, values) {
  const template = templates[templateKey]?.[part];
  if (typeof template !== 'string') throw new Error('Unknown hook message');
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error('Unknown hook placeholder');
    return String(values[name]);
  });
}
