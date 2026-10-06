# reinhardt — Contributor Guidelines

## If You Are an AI Agent

Read this before changing anything. reinhardt is a security tool: a confident wrong answer from it is worse than no answer. Quality bar: every behavior has a test, every claim has evidence, nothing ships that you did not run.

### Ownership boundary

| Path | Owner | Agents may |
|------|-------|-----------|
| `data/owasp/*.json` | Knowledge maintainer | Read only. Report suspected errors; do not edit. |
| `data/rules.json` | Knowledge maintainer | Read only. If a test vector fails, fix the **engine**. If you believe the rule itself is wrong, stop and report the rule id, the vector, and why. |
| `data/sdks.json` | Knowledge maintainer | Read only unless the task says otherwise. |
| `skills/*/SKILL.md`, `agents/*.md`, `hooks/messages.json` | Knowledge maintainer | Read only. Behavior-shaping text is tuned deliberately. |
| `evals/fixtures/**`, `evals/benchmarks/*.json` | Knowledge maintainer | Read only. Labels are ground truth; report disagreements instead of relabelling. |
| `src/`, `bin/`, `test/`, `evals/`, plugin manifests, hooks, CI | Engine | Change per the active plan in `docs/plans/`. |

### Non-negotiables

1. **TDD.** Write the failing test, watch it fail, write the minimum code, watch it pass. No production code without a test that failed first.
2. **Zero new runtime dependencies.** The engine uses Node built-ins only; `@modelcontextprotocol/sdk` and `zod` are the only allowed runtime deps (MCP only).
3. **Determinism.** Same input → byte-identical JSON output. Sort everything (files, findings, evidence). No timestamps, absolute paths, randomness or machine-specific data in reports.
4. **Never leak what you scan.** Findings carry `file`, `line`, `kind` only. Never put matched text, secrets, or source lines into reports, logs, errors or MCP responses.
5. **Respect the walker.** Never read `.env*`, `node_modules`, lockfiles, build output, symlinks, binaries, or files over 1,000,000 bytes. New file types go through `readText` in `src/engine/files.js`.
6. **No LLM or network calls in the engine.**
7. **Honest output.** Never write "safe", "secure" or "compliant" in output, docs, or skills. Every report includes the disclaimer.
8. **YAGNI / DRY.** Small focused files with one responsibility. No speculative options, flags or abstractions.
9. **Verification before completion.** Before saying a task is done, run `npm test` and `npm run eval` and read the output. Paste the summary lines in your report. "Should pass" is not evidence.
10. **Small commits.** One task, one commit, conventional message (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

### Commands

```sh
npm ci            # install
npm test          # node:test suite, must be 0 failures
npm run eval      # labelled fixtures, must print Precision 1.000 and Recall 1.000
node bin/reinhardt.js scan evals/fixtures/leaky-web
```

## For humans

reinhardt detects privacy drift and OWASP-mapped security problems in AI-generated apps. See `README.md` for usage and `docs/owasp.md` for how OWASP material is distilled. The OWASP-derived data in `data/owasp/` is adapted from OWASP projects licensed CC BY-SA 4.0 (see `data/owasp/README.md`); the code is MIT.
