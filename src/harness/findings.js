export function changedFindings(report, paths, severities) {
  const edited = new Set(paths);
  const items = new Map();
  for (const finding of report.findings) {
    if (finding.category !== 'security' || !severities.includes(finding.severity)) continue;
    for (const evidence of finding.evidence) {
      if (!edited.has(evidence.file)) continue;
      const key = `${finding.id}:${evidence.file}:${evidence.line}`;
      items.set(key, {
        key, rule_id: finding.id, severity: finding.severity, title: finding.title,
        file: evidence.file, line: evidence.line,
        owasp: (finding.owasp[0] ?? '').split(':').slice(1).join(':')
      });
    }
  }
  return [...items.keys()].sort().map(key => items.get(key));
}
