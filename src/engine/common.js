export const DISCLAIMER = 'Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.';
export const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
export const evidenceAt = (file, text, offset, kind) => ({ file, line: lineAt(text, offset), kind });
