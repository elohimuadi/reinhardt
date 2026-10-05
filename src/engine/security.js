import { readText } from './files.js';
import { isManifest } from './manifests.js';
import { ruleset, fileClasses, matchRule } from './rules.js';

export const securityCandidate = file => fileClasses(file).some(name => ruleset.rules.some(rule => rule.files.includes(name)));
export async function readScanFile(root, file) {
  try { return await readText(root, file); }
  catch (error) {
    if (!isManifest(file) && /^(?:Binary files are excluded|File exceeds 1MB|Not a regular file or exceeds 1MB)$/.test(error.message)) return null;
    throw error;
  }
}
export async function securityFindings(root, files, read = file => readScanFile(root, file)) {
  const candidates = [];
  for (const file of files) {
    if (securityCandidate(file)) {
      const text = await read(file);
      if (text !== null) candidates.push({path:file,text});
    } else if (file.split('/').at(-1) === 'PrivacyInfo.xcprivacy') {
      // This check needs only the walked filename, never the manifest contents.
      candidates.push({path:file,text:''});
    }
  }
  const findings = [];
  for (const rule of ruleset.rules) {
    const evidence = matchRule(rule, candidates).slice(0,50);
    if (!evidence.length) continue;
    const { id, title, detail, suggested_fix, severity, confidence, owasp, cwe, asvs, guidance } = rule;
    findings.push({ id, sdk_id:null, category:'security', title, detail, suggested_fix, severity, confidence, owasp, cwe, asvs, guidance, evidence, suggested_disclosure:null });
  }
  return findings;
}
