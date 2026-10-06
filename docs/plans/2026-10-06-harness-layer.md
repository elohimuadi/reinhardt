# Harness Layer Implementation Plan

> **For agentic workers:** Execute task-by-task in order. Each task is red → green → commit. Steps use checkbox (`- [x]`) syntax; tick them as you go. Read `AGENTS.md` first — it is part of this plan.

**Goal:** Make reinhardt a plugin harness in the superpowers sense: a bootstrap skill injected at session start, hooks that run the deterministic engine on the agent's own edits and gate finishing on unaddressed high findings, a verifier subagent, and a `/reinhardt:launch-check` entry point. It must work in Claude Code and Codex from one `hooks/hooks.json`.

**Architecture:** One dependency-free Node hook runner, `hooks/reinhardt-hook.mjs <event>`, imports the engine from `${CLAUDE_PLUGIN_ROOT}/src`. Its input is the hook JSON on stdin. Its output is hook JSON on stdout, rendered from `hooks/messages.json`. Per-session state lives in the plugin data directory. Claude Code and Codex both read the plugin's `hooks/hooks.json`. Codex exports `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` for compatibility, and its file-edit tool is `apply_patch` with the patch in `tool_input.command`.

**Tech Stack:** Node ≥ 20, ESM, `node:test`, no new dependencies.

**Spec (knowledge-owned, read-only):**
- `skills/using-reinhardt/SKILL.md`: the bootstrap content.
- `skills/launch-check/SKILL.md`.
- `agents/finding-verifier.md`.
- `hooks/messages.json`: every string the hooks emit, with `{placeholders}`.

**Hook facts verified on 2026-10-06:**
- Claude Code PostToolUse input carries `tool_name`, `tool_input.file_path`, `cwd` and `session_id`. Output is `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}`.
- Stop input carries `stop_hook_active`. Output `{"decision":"block","reason":"…"}` makes the agent continue.
- SessionStart output is `hookSpecificOutput.additionalContext`, with a limit of 10,000 characters per field.
- Codex uses the same event names and the same `decision`/`additionalContext` fields. Its edit tool name is `apply_patch` (matcher aliases `Edit`/`Write`). `tool_input.command` holds the patch text.
- Codex sets `PLUGIN_ROOT`/`PLUGIN_DATA` plus the `CLAUDE_*` aliases.
- Claude Code puts a plugin's top-level `bin/` on the Bash PATH, and claude.ai/Cowork refuse to install plugins that contain a top-level `bin/`.

## Global Constraints

- Do not edit `data/**`, `skills/**`, `agents/**`, `hooks/messages.json`, `evals/fixtures/**` or `evals/benchmarks/real-world.json`. Report wording or behavior problems instead.
- Hooks must never break the agent. On any internal error, exit 0 with no stdout. Only the Stop gate ever blocks, and only through `{"decision":"block"}`.
- Hook output follows the existing leak rules: only rule id, severity, title, OWASP ref, repo-relative `file:line`, SDK id/name/category/disclosure. No matched text, no absolute paths.
- Session ids are used in file names only after sanitizing to `[A-Za-z0-9_-]`; anything else maps to `unknown`.
- State dir: `$CLAUDE_PLUGIN_DATA` or `$PLUGIN_DATA`, else `os.tmpdir()/reinhardt-hooks`, then `sessions/<session_id>.json`. State is `{ "edited": string[], "reported": string[], "gated": string[] }`, with arrays sorted and deduplicated.
- Versions bump to `0.4.0` (package.json, both manifests, MCP serverInfo).

## Review Focus

1. A Codex `apply_patch` touching `*** Update File:`, `*** Add File:` and `*** Move to:` lines must yield all destination paths. `*** Delete File:` paths are recorded as edited but not scanned.
2. The Stop gate fires at most once per finding per session. It never fires when `stop_hook_active` is true, when `REINHARDT_STOP_GATE=off`, or when nothing was edited. A finding the user was already told about (in `gated`) must not block again on a later turn.
3. Post-edit notes report only findings with evidence in files changed *this session* that were not already reported. Pre-existing problems elsewhere in the repo stay quiet, so the harness doesn't nag about legacy code.
4. A repository where `scanRepo` throws (malformed package.json mid-edit) produces no hook output and exit 0.
5. The post-edit hook on `evals/fixtures/leaky-security-web` completes in under 3 seconds, and the hooks.json `timeout` is set to 20.

---

### Task 1: Move the CLI out of `bin/`

**Files:** move `bin/reinhardt.js` → `cli/reinhardt.js`. Update `package.json` (`bin`, `files`), `.claude-plugin/mcp.json` args, `codex/*`, README, and every test that spawns the CLI.

- [x] **Step 1: Failing test** in `test/plugin.test.js`: `plugin has no top-level bin/ directory` and `.claude-plugin/mcp.json args reference ${CLAUDE_PLUGIN_ROOT}/cli/reinhardt.js`.
- [x] **Step 2:** FAIL → `git mv bin cli` and fix references → `npm test` PASS, `npm run eval` 1.000/1.000.
- [x] **Step 3:** `git commit -m "refactor: move CLI out of plugin bin directory"`


Task 1: packaging tests failed before the move and passed afterward. Full suite: 209 pass, only the known skills-count failure remains for Task 6. Eval: Precision 1.000, Recall 1.000, TP=51.

### Task 2: Hook runner core: input parsing, state, messages

**Files:** create `hooks/reinhardt-hook.mjs`, `src/harness/edits.js`, `src/harness/state.js`, `src/harness/messages.js`. Test: `test/harness.test.js`.

**Interfaces:**
- `editedPaths(input: object): string[]`. For `Edit|Write|MultiEdit`, use `tool_input.file_path`. For `apply_patch`, use `tool_input.command` (also accept `tool_input.input` and `tool_input.patch` when those are the string), and return the paths from `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:`. Return paths relative to `input.cwd`, POSIX, sorted and unique. Paths outside `cwd` are dropped.
- `loadState(sessionId) / saveState(sessionId, state)`, following the Global Constraints. The write is atomic (temp file + rename).
- `render(templateKey, part, values): string`. It fills `{name}` placeholders from `hooks/messages.json`; an unknown placeholder throws.
- [x] **Step 1: Failing tests:**
  - a Claude Edit input yields `['src/a.js']`
  - a Codex patch with Update+Add+Move yields three paths
  - an absolute path outside `cwd` is dropped
  - a session id `../x` maps to `unknown`
  - state round-trips sorted and unique
  - `render` fills every placeholder in each template
- [x] **Step 2:** FAIL → implement → PASS.
- [x] **Step 3:** `git commit -m "feat: hook input parsing, session state and messages"`


Task 2: new harness tests failed with missing modules, then all 5 passed after implementation.

### Task 3: SessionStart bootstrap

**Interfaces:** `node hooks/reinhardt-hook.mjs session-start` prints `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext": "<text>"}}`. `<text>` is `"reinhardt is installed. The using-reinhardt skill follows; obey it.\n\n"` plus the body of `skills/using-reinhardt/SKILL.md` with the frontmatter removed. Total length must be ≤ 10,000 characters. Delete the old `hooks/session-start` bash script.

- [x] **Step 1: Failing test:** the output parses, contains `reinhardt:secure-by-default`, contains no `---` frontmatter line, and is ≤ 10,000 characters.
- [x] **Step 2:** FAIL → implement → PASS.
- [x] **Step 3:** `git commit -m "feat: inject using-reinhardt at session start"`


Task 3: bootstrap test failed on empty output, then all 6 harness tests passed. The legacy script is removed; hook registration is updated in Task 6.

### Task 4: PostToolUse: findings and recipients in changed files

**Interfaces:** `post-edit` reads stdin and performs these steps:
1. Compute `editedPaths`.
2. Add them to `state.edited`.
3. Run `scanRepo(input.cwd)`.
4. Collect **security** findings with severity `high|medium` whose evidence file is in the paths edited by *this tool call*. Key each one as `rule:file:line` and drop keys already in `state.reported`.
5. If any edited path is a manifest (`isManifest`), collect SDKs whose evidence includes that manifest and whose `disclosure !== 'named'`. Key each one as `sdk:<id>` and drop keys already reported.
6. Render `post_edit_findings` and/or `post_edit_recipients` (header, one line per item, footer). OWASP is the first ref's item id; for example, `top10-2025:A04:2025` becomes `A04:2025`.
7. Print `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext": text}}` and save the new keys to `state.reported`.

If nothing is new, print nothing.

- [x] **Step 1: Failing tests** (temp repos, `CLAUDE_PLUGIN_DATA` pointed at a temp dir, hook run as a child process):
  - Edit of `src/chat.js` adding `dangerouslyAllowBrowser: true` → context lists `llm-sdk-in-browser` with `src/chat.js:1`
  - the same edit again → no output
  - a finding in an unedited file → not mentioned
  - Codex `apply_patch` adding `firestore.rules` with `allow read, write: if true;` → `firebase-open-rules`
  - editing `package.json` to add `posthog-js` with no policy → recipients note names PostHog
  - malformed `package.json` → no output, exit 0
  - output never contains the AWS example key when it's added to `config/aws.json`
  - `leaky-security-web` run finishes in under 3 s
- [x] **Step 2:** FAIL → implement → PASS.
- [x] **Step 3:** `git commit -m "feat: report new findings and recipients after edits"`


Task 4: four post-edit reporting tests failed before implementation; all 13 harness tests now pass, including deduplication, credential non-disclosure, malformed manifests/state, and the under-3-second fixture check. Output includes the shared analysis disclaimer.

### Task 5: Stop gate

**Interfaces:** `stop` reads stdin. It exits 0 silently if `stop_hook_active` is true, if `REINHARDT_STOP_GATE` is `off`, or if `state.edited` is empty. Otherwise it runs `scanRepo(cwd)` and collects **high** security findings with evidence in `state.edited`. Each is keyed `rule:file:line`, minus keys already in `state.gated`. If any remain, it prints `{"decision":"block","reason": render(stop_gate…)}` and adds those keys to `state.gated`. Otherwise it prints nothing.

- [x] **Step 1: Failing tests:**
  - after a post-edit that introduced `sql-string-building`, `stop` blocks and its reason contains the rule id and file:line
  - a second `stop` with `stop_hook_active: true` → silent
  - a third `stop` with `stop_hook_active: false` on a later turn → silent (already gated)
  - `REINHARDT_STOP_GATE=off` → silent
  - no edits → silent
  - a medium-only finding → silent
- [x] **Step 2:** FAIL → implement → PASS.
- [x] **Step 3:** `git commit -m "feat: gate finishing on unaddressed high findings"`


Task 5: all three Stop tests failed before implementation; all 16 harness tests pass afterward, including later-turn deduplication, bypasses, session-wide filtering, and silent scan-error recovery.

### Task 6: Wire hooks, agent and manifests for both hosts

**Files:** `hooks/hooks.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package.json` (`files` adds `agents`, `cli`; version), `test/plugin.test.js`, README.

**Values:**
- `hooks/hooks.json`:
  - `SessionStart` (matcher `startup|clear|compact`) → `node "${CLAUDE_PLUGIN_ROOT}/hooks/reinhardt-hook.mjs" session-start`
  - `PostToolUse` (matcher `Edit|Write|MultiEdit|apply_patch`, `timeout: 20`) → `… post-edit`
  - `Stop` (`timeout: 20`) → `… stop`
- `.codex-plugin/plugin.json`: `"hooks": "./hooks/hooks.json"`.
- Claude: `agents/` is loaded by default, so no manifest key is needed.
- [ ] **Step 1: Failing tests:**
  - hooks.json has exactly those three events and matchers, and every command references `${CLAUDE_PLUGIN_ROOT}/hooks/reinhardt-hook.mjs`
  - the Codex manifest `hooks` is `./hooks/hooks.json`
  - `agents/finding-verifier.md` frontmatter has `name: finding-verifier` and `tools: Read, Grep, Glob`
  - 8 skills exist, each with a `Use when` description
  - versions are `0.4.0`
- [ ] **Step 2:** FAIL → implement. README gets a "How the harness works" section: bootstrap, post-edit notes, stop gate with `REINHARDT_STOP_GATE=off`, `/reinhardt:launch-check`, `@agent-reinhardt:finding-verifier`, and Codex parity (no subagent; launch-check falls back to self-verification). → PASS.
- [ ] **Step 3:** If the `claude` CLI is available, run `claude plugin validate .` and paste the result; otherwise say it was not run.
- [ ] **Step 4:** `git commit -m "feat: wire harness hooks and verifier agent for Claude Code and Codex"`

### Task 7: Final verification

- [ ] `npm ci && npm test && npm run eval && npm run benchmark`; paste the summary lines.
- [ ] Manual smoke test in a temp copy of `evals/fixtures/leaky-security-web`: run each hook with a hand-written stdin JSON and paste its stdout.
- [ ] `git status` clean; push `owasp-knowledge-layer`; list commits.
