# Agent harness reference

[Installation and quickstart](../README.md#agent-harness)

### Confirm the harness is active

**Start the host session in the disposable fixture directory.** The hook resolves edits relative to the session's `cwd` and ignores paths outside it. A session started in your application that edits a copy under `/tmp` does not exercise post-edit reporting for that copy. Changing directory inside a shell tool does not establish a new host session root.

From your reinhardt checkout, prepare the copy before opening the test session:

```sh
reinhardt_fixture_source="$PWD/evals/fixtures/leaky-security-web"
reinhardt_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/reinhardt-host-test.XXXXXX")
cp -R "$reinhardt_fixture_source" "$reinhardt_test_dir/leaky-security-web"
cd -P "$reinhardt_test_dir/leaky-security-web"
pwd
codex -C "$PWD"
```

For Claude Code, run `claude` in that same directory instead. Open a fresh session, with the plugin enabled. In Codex, review and trust reinhardt's hooks through `/hooks` if prompted, then start another fresh session in the fixture directory. Plugin installation and hook trust are separate steps; see [Codex hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks). Leave `REINHARDT_STOP_GATE` unset for this test.

Give the fresh session this prompt:

```text
Test the installed reinhardt harness in this disposable fixture only.
Do not modify Sidequest or any other application.

First confirm whether SessionStart injected the full using-reinhardt
bootstrap, beyond its available-skills entry. Confirm your session working
directory is this leaky-security-web copy. Stop if it is not.

Use apply_patch to append a harmless comment to src/components/Chat.tsx.
Keep existing fixture behavior and line locations intact: this test checks
the host hooks, not remediation. Do not run the fixture app.

Observe whether PostToolUse automatically supplies finding context for
that file, including llm-sdk-in-browser. Report only rule IDs and relative
file:line locations, never source text or credentials.

Attempt a normal final response so the host can evaluate Stop. If Stop
blocks, acknowledge that the findings belong to this intentionally
vulnerable disposable fixture and attempt to finish again without edits.
Do not claim that Stop passed before observing its response.

Do not invoke hook scripts manually, bypass trust, disable hooks, or use
a separate scan as proof of hook execution. Report observed events and
mark anything not observed as unconfirmed.
```

After the first turn finishes, send a second message in the **same session** asking for a brief summary without tools or edits. This checks that unchanged, already-gated findings do not block a later turn again. Moving evidence lines or starting a different session changes the deduplication conditions.

| Event | Evidence needed |
| --- | --- |
| SessionStart | Full bootstrap guidance injected into context; a skill listing alone is insufficient |
| PostToolUse | Automatic finding context for the file edited by `apply_patch` |
| Stop | An observed block naming high findings in that file, followed by completion without another block for those same findings |
| Later turn | No repeat block for unchanged findings in the same session |

A successful MCP `scan_repo` call proves detection and tool connectivity, not automatic hook execution. A subprocess test that runs the hook script directly proves its handler behavior, not host integration. If a notification is missing, record the session root, tool name, relative edited path, and any available host hook diagnostics. Missing logs or a silent final response are not evidence of a passing event.

Set `REINHARDT_STOP_GATE=off` in the host environment when you want to disable the Stop gate during ordinary use while retaining post-edit notes.

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
