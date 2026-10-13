# reinhardt

Privacy-drift and OWASP-mapped security checks for your application. Use reinhardt as a standalone scanner or install it as an agent harness that checks code as you work.

| Choose | Use it for |
| --- | --- |
| [Standalone scanner](#standalone-scanner) | Manual scans, JSON reports, and CI checks |
| [Agent harness](#agent-harness) | Skills, session-start guidance, automatic checks after edits, and a Stop gate |

Both use the same deterministic engine. Requires **Node >=20**. The scanner makes no LLM calls or network requests.

## Standalone scanner

Download from GitHub and scan your application:

```sh
git clone https://github.com/elohimuadi/reinhardt.git "$HOME/reinhardt"
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app
```

No npm installation is required. Cloning reinhardt or running a scan does not activate agent hooks.

```sh
# Save a JSON report outside your application's directory.
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app --json > /tmp/reinhardt-report.json

# Exit 1 when high-severity findings are present; useful in CI.
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app --fail-on high

# Specify a privacy policy relative to your application's directory.
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app --policy docs/privacy.md
```

Optionally run `npm link` from the reinhardt checkout to use `reinhardt scan <path>` directly. See the [scanner reference](docs/reference.md) for commands, exit codes, recipient baselines, and rules.

## Agent harness

Install the plugin in the host where you run your coding sessions. The harness adds workflow skills, checks supported edits, and asks the agent to address high security findings before finishing, once per finding per session.

### Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add elohimuadi/reinhardt
/plugin install reinhardt@reinhardt
```

Start a new session in your application's folder with the plugin enabled, then run:

```text
/reinhardt:launch-check
```

This route includes the scanner; no separate clone or npm installation is required. Node must be available to the host.

### Codex

Download the checkout using the [standalone steps](#standalone-scanner), then run:

```sh
cd "$HOME/reinhardt"
npm link
reinhardt --help
codex plugin marketplace add "$HOME/reinhardt"
```

Restart the ChatGPT desktop app, open the Plugins Directory, select the reinhardt marketplace, and install and enable the plugin. Start a new Codex chat in your application's folder and ask the agent to use the `launch-check` skill. This follows the [official local plugin installation flow](https://developers.openai.com/plugins/build/plugins).

The Codex host must have `reinhardt` on its PATH for the bundled MCP configuration. Adding the marketplace alone does not activate the plugin.

See the [harness reference](docs/harness.md) for activation checks, workflows, host differences, and `REINHARDT_STOP_GATE=off` to disable the Stop gate. For a disposable-fixture check, start a fresh host session with that fixture as its working directory.

### MCP tools only

To let an agent call the scanner on request without installing the harness, configure the MCP server using [codex/config.toml.snippet](codex/config.toml.snippet), replacing the absolute path. This provides tools but does not activate skills or automatic hooks. [Setup details](docs/harness.md#optional-mcp-tools-only).

## Updating

For a Git checkout:

```sh
git -C "$HOME/reinhardt" switch main
git -C "$HOME/reinhardt" pull --ff-only
```

For a plugin installation, refresh or update it through the host and start a new session.

## Documentation

- [Scanner reference](docs/reference.md): CLI, MCP tools, rules, privacy detection, and limitations.
- [Harness reference](docs/harness.md): workflows, hooks, and host setup checks.
- [Development and validation](docs/development.md): tests, benchmarks, and contribution guidance.
- [OWASP knowledge](docs/owasp.md): sources, mappings, and interpretation.
- [Release notes](RELEASE-NOTES.md).

Code is [MIT licensed](LICENSE). OWASP-derived data is licensed [CC BY-SA 4.0](data/owasp/README.md).

Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.
