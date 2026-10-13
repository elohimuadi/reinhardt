# Agent harness reference

[Installation and quickstart](../README.md#agent-harness)

### Confirm the harness is active

Check the host's plugin status and hook diagnostics in a fresh session: SessionStart should run `reinhardt-hook.mjs session-start` and supply `using-reinhardt` guidance. On a disposable copy of the bundled `leaky-security-web` fixture, have the agent edit `firestore.rules`; PostToolUse should report `firebase-open-rules`, and Stop should block once if it remains. Never introduce a test vulnerability into your real app.

A successful `scan_repo` call verifies the MCP tool connection only. Verify the hook events separately. Automated tests cover the CLI, MCP protocol, hook subprocesses, and plugin manifests. Follow the checks above to confirm activation in your host. Set `REINHARDT_STOP_GATE=off` in the host environment to disable the Stop gate while retaining post-edit notes.

### Optional: MCP tools only

Choose this lighter integration if you want an agent to call the scanner on request. It does not install skills or activate the harness hooks. After downloading the checkout, merge [codex/config.toml.snippet](../codex/config.toml.snippet) into `~/.codex/config.toml`, replacing the absolute path:

```toml
[mcp_servers.reinhardt]
command = "node"
args = ["/absolute/path/to/reinhardt/cli/reinhardt.js", "mcp"]
```

A trusted project's `.codex/config.toml` is also supported. Use an absolute Node executable path if needed. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp). Ask the agent to call `scan_repo` with your application's absolute path and verify the findings.

The optional [AGENTS snippet](../codex/AGENTS.snippet.md) requests dependency-change checks through agent instructions; it does not register hooks. When moving to the full plugin, remove a duplicate manual MCP entry if it exposes the same server twice.

## Eight agent workflows

- `privacy-audit`: verify each privacy finding in code; do not edit.
- `privacy-fix`: fix one verified privacy finding, then re-scan; disclosure must reflect behavior.
- `privacy-drift-watch`: check after dependency changes; ask about new unnamed recipients; never reset the baseline on its own.
- `security-audit`: investigate OWASP-mapped findings and report evidence and uncertainty.
- `security-fix`: remediate a verified security finding and validate the change.
- `secure-by-default`: apply security guidance while writing relevant code.
- `using-reinhardt`: bootstrap the workflow choices at session start.
- `launch-check`: scan and verify findings before a launch decision.

These skills guide the agent; they do not guarantee its behavior.

## How the harness works

The plugin registers SessionStart, PostToolUse and Stop in one `hooks/hooks.json` for both hosts. Node >=20 must be available. An MCP-only config.toml setup exposes tools but does not install the plugin hooks.

- **Bootstrap:** startup, clear and compact inject the body of `using-reinhardt`, without its frontmatter and within the host's 10,000-character limit.
- **Post-edit notes:** Edit, Write, MultiEdit and Codex `apply_patch` invoke the deterministic scanner. Notes list new high or medium security findings in files changed by that call, plus unnamed SDK recipients detected in edited manifests. Already reported items stay quiet for that session. Deleted paths remain in session history; absent files produce no findings.
- **Stop gate:** high security findings in files edited this session can block finishing once per finding. The agent must verify and fix them or explain false positives to the user. Later turns do not block again for the same rule/file/line. Active Stop hooks, sessions without edits, and `REINHARDT_STOP_GATE=off` bypass the gate. This is a prompt to investigate, not proof that a finding was resolved.

Run `/reinhardt:launch-check` for the full pre-launch workflow. Claude Code can use `@agent-reinhardt:finding-verifier`, a read-only verifier with Read, Grep and Glob tools. Codex has the same hook behavior for edits and stopping; it has no plugin verifier subagent here, so launch-check falls back to self-verification.

State stores sorted edited paths and reported/gated identifiers in `$CLAUDE_PLUGIN_DATA` or `$PLUGIN_DATA`, falling back to `os.tmpdir()/reinhardt-hooks`, under `sessions/<session_id>.json`. Invalid session IDs map to `unknown`. Hook failures return exit 0 with no output; malformed manifests during editing therefore produce no note. Findings contain rule metadata and relative file/line locations, never matched source or credentials. Post-edit and Stop hooks have 20-second host timeouts.

Automated subprocess tests and manual fixture smoke tests cover the bootstrap, post-edit notes, and once-per-finding Stop gate. Further testing will exercise installation and complete coding sessions inside Claude Code and Codex.

Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.
