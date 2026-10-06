import { scanRepo } from '../engine/scan.js';
import { DISCLAIMER } from '../engine/common.js';
import { loadState, saveState } from './state.js';
import { changedFindings } from './findings.js';
import { render } from './messages.js';

export async function stop(input) {
  if (input.stop_hook_active || process.env.REINHARDT_STOP_GATE === 'off') return;
  const state = await loadState(input.session_id);
  if (!state.edited.length) return;
  const report = await scanRepo(input.cwd);
  const findings = changedFindings(report, state.edited, ['high']).filter(item => !state.gated.includes(item.key));
  if (!findings.length) return;
  const lines = findings.map(item => render('stop_gate', 'line', item)).join('\n');
  const reason = render('stop_gate', 'reason', { count: findings.length, lines }) + '\n\n' + DISCLAIMER;
  state.gated.push(...findings.map(item => item.key));
  await saveState(input.session_id, state);
  return { decision: 'block', reason };
}
