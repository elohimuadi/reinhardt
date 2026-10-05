export const DISCLAIMER = 'Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.';
export const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
export const evidenceAt = (file, text, offset, kind) => ({ file, line: lineAt(text, offset), kind });

// Build once per file; each lookup is O(log(number of lines)).
export function lineIndex(text) {
  const newlines = [];
  for (let offset = text.indexOf('\n'); offset !== -1; offset = text.indexOf('\n', offset + 1)) newlines.push(offset);
  return offset => {
    let low = 0, high = newlines.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (newlines[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low + 1;
  };
}
