import { scanRepo } from '../engine/scan.js';
import { isManifest } from '../engine/manifests.js';
import { DISCLAIMER } from '../engine/common.js';
import { editedPaths } from './edits.js';
import { loadState, saveState } from './state.js';
import { render } from './messages.js';
import { changedFindings } from './findings.js';

function note(template, items) {
  return [render(template, 'header', { count: items.length }), ...items.map(item => render(template, 'line', item)), render(template, 'footer', {})].join('\n');
}
export async function postEdit(input) {
  const paths = editedPaths(input);
  if (!paths.length) return;
  const state = await loadState(input.session_id);
  state.edited.push(...paths);
  await saveState(input.session_id, state);
  const report = await scanRepo(input.cwd);
  const findings = changedFindings(report, paths, ['high', 'medium']).filter(item => !state.reported.includes(item.key));
  const manifests = new Set(paths.filter(isManifest));
  const recipients = report.sdks.filter(sdk => sdk.disclosure !== 'named' && sdk.evidence.some(item => manifests.has(item.file)) && !state.reported.includes(`sdk:${sdk.id}`))
    .map(sdk => ({ key: `sdk:${sdk.id}`, sdk_id: sdk.id, sdk_name: sdk.name, category: sdk.category, disclosure: sdk.disclosure }));
  const notes = [];
  if (findings.length) notes.push(note('post_edit_findings', findings));
  if (recipients.length) notes.push(note('post_edit_recipients', recipients));
  if (!notes.length) return;
  state.reported.push(...findings.map(item => item.key), ...recipients.map(item => item.key));
  await saveState(input.session_id, state);
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: [...notes, DISCLAIMER].join('\n\n') } };
}
