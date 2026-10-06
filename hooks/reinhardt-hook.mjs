try {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const input = JSON.parse(text || '{}');
  if (process.argv[2] === 'stop') {
    const { stop } = await import('../src/harness/stop.js');
    const output = await stop(input);
    if (output) console.log(JSON.stringify(output));
  }
  if (process.argv[2] === 'post-edit') {
    const { postEdit } = await import('../src/harness/post-edit.js');
    const output = await postEdit(input);
    if (output) console.log(JSON.stringify(output));
  }
  if (process.argv[2] === 'session-start') {
    const { readFile } = await import('node:fs/promises');
    const skill = await readFile(new URL('../skills/using-reinhardt/SKILL.md', import.meta.url), 'utf8');
    const body = skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    const additionalContext = 'reinhardt is installed. The using-reinhardt skill follows; obey it.\n\n' + body;
    if (additionalContext.length > 10_000) throw new Error('Bootstrap exceeds host limit');
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
  }
} catch {
  // Hook failures must never interrupt the host or expose scanned content.
}
