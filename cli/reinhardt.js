#!/usr/bin/env node
import { lookup } from '../src/engine/owasp.js';
import { listRules } from '../src/engine/rules.js';
import { parseArgs } from 'node:util';
import { scanRepo, severityRank } from '../src/engine/scan.js';
import { saveBaseline, driftCheck } from '../src/engine/drift.js';
import { explainSdk } from '../src/engine/catalog.js';
import { DISCLAIMER } from '../src/engine/common.js';
const usage = `reinhardt scan|baseline|drift|sdk|owasp|rules|mcp [path]
  --policy <file>          Explicit policy (relative to repository)
  --json                   Machine-readable output
  --fail-on high|medium|low Exit 1 for findings at or above threshold
  sdk [id]                 List catalog or explain one SDK
  owasp [query]            Look up OWASP standards or items
  rules [id]               List rules or explain one rule
  baseline                 Save only after accepting the current recipients
  --help                   Show this help`;
export function formatReport(report) {
  const lines = [report.disclaimer];
  for (const standard of report.standards ?? []) lines.push(`${standard.id} — ${standard.name} (${standard.edition}, ${standard.status})`);
  for (const result of report.results ?? []) {
    lines.push(`${result.ref} — ${result.item.name}`, result.item.summary);
    for (const prevention of result.item.prevention ?? []) lines.push(`  - ${prevention}`);
  }
  for (const rule of report.rules ?? []) {
    lines.push(`${rule.id} — ${rule.title} (${rule.severity}, confidence: ${rule.confidence})`);
    if (rule.owasp.length) lines.push(`OWASP: ${rule.owasp.join(', ')}`);
    if (rule.detail) lines.push(rule.detail, `Suggested fix: ${rule.suggested_fix}`);
  }
  if (report.message) lines.push(report.message);
  if ('policy' in report) lines.push(`Policy: ${report.policy?.file ?? 'not found'}`);
  for (const sdk of report.sdks ?? []) lines.push(`SDK ${sdk.id}: ${sdk.name}${sdk.disclosure ? ` [${sdk.disclosure}]` : ` — ${sdk.purpose}`}`);
  for (const sdk of report.sdks ?? []) if (!sdk.disclosure) {
    lines.push(`  Category: ${sdk.category}`, `  Potential collection: ${sdk.collects.join(', ')}`, `  Domains: ${sdk.domains.join(', ')}`, `  Aliases: ${sdk.aliases.join(', ')}`, `  ${sdk.note}`);
  }
  for (const recipient of report.recipients ?? []) lines.push(`Baseline recipient: ${recipient.id}`);
  for (const sdk of report.added ?? []) lines.push(`ADDED ${sdk.id}: ${sdk.disclosure} (named in policy: ${sdk.named_in_policy})`);
  for (const sdk of report.removed ?? []) lines.push(`REMOVED ${sdk.id}`);
  if (report.baseline_exists && !report.added.length && !report.removed.length) lines.push('No recipient changes detected.');
  if (report.findings) lines.push(`${report.findings.length} finding(s)`);
  for (const finding of report.findings ?? []) {
    lines.push(`\n[${finding.severity.toUpperCase()}] ${finding.id}${finding.sdk_id ? `:${finding.sdk_id}` : ''}: ${finding.title}`,finding.detail);
    if (finding.owasp?.length) lines.push(`OWASP: ${finding.owasp.join(', ')}`);
    for (const evidence of finding.evidence) lines.push(`  ${evidence.file}:${evidence.line} (${evidence.kind})`);
    lines.push(`Suggested fix: ${finding.suggested_fix}`);
    if (finding.suggested_disclosure) lines.push(finding.suggested_disclosure);
  }
  return lines.join('\n');
}
let json = process.argv.includes('--json');
try {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{policy:{type:'string'},json:{type:'boolean'},'fail-on':{type:'string'},help:{type:'boolean',short:'h'}}});
  json = !!values.json;
  if (values.help) { console.log(`${usage}\n\n${DISCLAIMER}`); }
  else {
    const [command,target]=positionals;
    if (!['scan','baseline','drift','sdk','owasp','rules','mcp'].includes(command) || positionals.length>2) throw new Error(usage);
    if (values['fail-on'] && !Object.hasOwn(severityRank, values['fail-on'])) throw new Error('--fail-on must be high, medium, or low');
    if (command==='mcp') {
      if (values.policy || values.json || values['fail-on']) throw new Error('mcp accepts only an optional default repository path');
      const { startServer } = await import('../src/mcp.js');
      await startServer(target ?? process.cwd());
    } else {
      const options={policyPath:values.policy};
      const report=command==='scan' ? await scanRepo(target ?? '.',options) : command==='drift' ? await driftCheck(target ?? '.',options) : command==='baseline' ? await saveBaseline(target ?? '.',options) : command==='owasp' ? lookup(target) : command==='rules' ? listRules(target) : explainSdk(target);
      console.log(json ? JSON.stringify(report,null,2) : formatReport(report));
      if (values['fail-on'] && report.findings?.some(f=>severityRank[f.severity]<=severityRank[values['fail-on']])) process.exitCode=1;
    }
  }
} catch (error) {
  const report={disclaimer:DISCLAIMER,error:error.message};
  (json ? console.log : console.error)(json ? JSON.stringify(report,null,2) : `${DISCLAIMER}\nError: ${error.message}`);
  process.exitCode=2;
}
