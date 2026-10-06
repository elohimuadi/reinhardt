try {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  JSON.parse(text || '{}');
} catch {
  // Hook failures must never interrupt the host or expose scanned content.
}
