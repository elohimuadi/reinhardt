import { readFileSync } from 'node:fs';
import path from 'node:path';
import { compare } from './files.js';
import { DISCLAIMER, lineIndex } from './common.js';
import { hasPrivacyManifest, tablesWithoutRls } from './rule-kinds.js';

export const ruleset = JSON.parse(readFileSync(new URL('../../data/rules.json', import.meta.url), 'utf8'));
export const vectorText = text => Array.isArray(text) ? text.join('') : text;
export const isTestPath = file => new RegExp(ruleset.test_path_regex).test(file);
export function fileClasses(file) {
  const extension = path.posix.extname(file).slice(1).toLowerCase();
  const basename = path.posix.basename(file);
  return Object.entries(ruleset.file_classes).filter(([, spec]) => spec.extensions?.includes(extension) || spec.basenames?.includes(basename) || (spec.path_regex && new RegExp(spec.path_regex).test(file))).map(([name]) => name).sort(compare);
}
const regex = (pattern, scan = false) => new RegExp(pattern.regex, [...new Set((pattern.flags ?? '') + (scan ? 'g' : ''))].join(''));
const matches = (pattern, text) => regex(pattern).test(text);
export function matchRule(rule, files) {
  if (rule.repo_any && !files.some(file => (rule.repo_any.paths ?? []).some(pattern => new RegExp(pattern).test(file.path)) || (rule.repo_any.text ?? []).some(pattern => matches(pattern, file.text)))) return [];
  const eligible = files.filter(file => fileClasses(file.path).some(name => rule.files.includes(name)) && !(rule.skip_test_paths && isTestPath(file.path)));
  let evidence = [];
  if (rule.kind === 'supabase-rls') evidence = tablesWithoutRls(eligible);
  else {
    if (rule.kind === 'ios-privacy-manifest' && hasPrivacyManifest(files)) return [];
    for (const file of eligible) {
      if (!(rule.require_file_all ?? []).every(pattern => matches(pattern, file.text))) continue;
      if ((rule.suppress_if_file ?? []).some(pattern => matches(pattern, file.text))) continue;
      if ((rule.context_any || rule.path_any) && !(rule.context_any ?? []).some(pattern => matches(pattern, file.text)) && !(rule.path_any ?? []).some(pattern => new RegExp(pattern).test(file.path))) continue;
      const line = lineIndex(file.text);
      for (const pattern of rule.patterns) for (const match of file.text.matchAll(regex(pattern, true))) evidence.push({ file: file.path, line: line(match.index), kind: pattern.label });
    }
  }
  evidence = [...new Map(evidence.map(item => [JSON.stringify(item), item])).values()].sort((a, b) => compare(a.file, b.file) || a.line - b.line || compare(a.kind, b.kind));
  return rule.kind === 'ios-privacy-manifest' ? evidence.slice(0, 20) : evidence;
}

export function listRules(id) {
  let rules;
  if (id !== undefined) {
    const rule = ruleset.rules.find(rule => rule.id === id);
    if (!rule) throw new Error(`Unknown rule: ${id}`);
    const { tests, ...detail } = rule;
    rules = [detail];
  } else rules = ruleset.rules.map(({ id, title, severity, confidence, category, owasp, cwe }) => ({ id, title, severity, confidence, category, owasp, cwe })).sort((a,b) => compare(a.id,b.id));
  return { disclaimer: DISCLAIMER, rules };
}
