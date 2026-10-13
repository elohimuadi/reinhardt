# reinhardt

Privacy drift and OWASP-mapped security checks for AI-generated (vibe-coded) apps. AI coding tools can add SDKs that introduce third-party data recipients while the privacy policy stays unchanged. reinhardt finds those potential recipients, compares them with the policy, and tracks additions and removals against an explicitly accepted baseline.

**Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.** Zero findings are not an assurance about an application's privacy practices.

The deterministic engine makes no LLM calls or network requests. An agent uses its evidence to verify initialization, explain uncertainty, and make truthful fixes. Node >=20, ESM, plain JavaScript, MIT. Both the engine and stdio MCP server use only Node built-ins: zero runtime dependencies. `@modelcontextprotocol/sdk` is a development dependency for interoperability tests; zod is not a direct dependency. OWASP-derived data has a separate license described below.

## Choose how to use reinhardt

reinhardt is both a standalone scanner and an agent harness built around that scanner. Choose the setup that matches your workflow; both use the same engine and rules.

| You want | Install | What runs |
| --- | --- | --- |
| Scan a repository yourself, save a report, or check it in CI | [Standalone scanner](#standalone-scanner) | The CLI runs when you invoke it; no agent host is required |
| Have an agent check its edits as it works | [Agent harness](#agent-harness) | The installed plugin supplies skills, session-start guidance, post-edit checks, and a Stop gate |

An agent can also run the CLI for you. That is a manual scan. Automatic hooks require the plugin to be installed and enabled in the host running your coding session. Cloning reinhardt beside your application does not activate the harness.

## Standalone scanner

Requires Git and Node >=20. Download the default `main` branch into a separate folder, then point the scanner at your application:

```sh
git clone https://github.com/elohimuadi/reinhardt.git "$HOME/reinhardt"
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app
```

If you already have that checkout, update it instead of cloning again:

```sh
git -C "$HOME/reinhardt" switch main
git -C "$HOME/reinhardt" pull --ff-only
```

No dependency installation is needed for scanning. The scanner reads local files without executing your application, making LLM calls, or sending source over the network. These examples scan without changing application files:

```sh
# Try the bundled fixture first.
node "$HOME/reinhardt/cli/reinhardt.js" scan "$HOME/reinhardt/evals/fixtures/leaky-security-web"

# Save a report outside the scanned repository.
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app --json > /tmp/reinhardt-report.json

# Select a policy relative to your application and fail on high findings.
node "$HOME/reinhardt/cli/reinhardt.js" scan /absolute/path/to/your/app --policy docs/privacy.md --fail-on high
```

For CI, use the same `scan <app-path> --fail-on high` command from a downloaded checkout. Exit 1 means the threshold was reached; exit 2 means the scan failed. Review findings before treating them as defects.

Optionally run `npm link` from the reinhardt checkout to expose `reinhardt` on your PATH. The installation steps above use the GitHub checkout. Run `npm ci` only when developing or testing reinhardt.

### Optional: track recipient changes

After reviewing and accepting the current recipients, explicitly save a baseline:

```sh
node "$HOME/reinhardt/cli/reinhardt.js" baseline /absolute/path/to/your/app
# After dependency changes:
node "$HOME/reinhardt/cli/reinhardt.js" drift /absolute/path/to/your/app
```

`baseline` writes or overwrites `.reinhardt/baseline.json` in the application. It records sorted recipient IDs and names without timestamps or machine-specific paths. Commit it if you want to share the accepted recipients with CI or teammates. Without a baseline, `drift` reports that no comparison is available and includes the current scan.

## Agent harness

Choose this mode for checks during an agent's coding session. It includes the scanner and MCP tools plus the [eight workflows](#eight-agent-workflows) and [automatic hooks](#how-the-harness-works). Node >=20 must be available to the host.

### Claude Code

In Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add elohimuadi/reinhardt
/plugin install reinhardt@reinhardt
```

Start a new Claude Code session in your application's folder with the plugin enabled. Run `/reinhardt:launch-check` for an initial review. Subsequent supported edits trigger checks, and high security findings in files edited that session can trigger the Stop gate.

The plugin launches its bundled CLI through `${CLAUDE_PLUGIN_ROOT}/cli/reinhardt.js`; no separate clone or npm installation is required for this route. Its read-only verifier is available as `@agent-reinhardt:finding-verifier`.

### Codex

Use the [standalone download steps](#standalone-scanner) to obtain a checkout, then register its marketplace:

```sh
cd "$HOME/reinhardt"
npm link
reinhardt --help
codex plugin marketplace add "$HOME/reinhardt"
```

`npm link` provides the `reinhardt mcp` command required by this plugin's Codex MCP configuration. The Codex host must inherit that PATH.

Restart the ChatGPT desktop app, open the Plugins Directory, choose the reinhardt marketplace, and install and enable reinhardt. Start a new Codex chat in your application's folder. Local plugin discovery, installation and caching follow the [official OpenAI documentation](https://developers.openai.com/plugins/build/plugins). Adding a marketplace alone does not establish that the plugin is active.

Ask the agent to use the `launch-check` skill for an initial review. Codex uses self-verification where the plugin verifier subagent is unavailable. The manifest references the same `hooks/hooks.json` as Claude Code.

### Confirm the harness is active

Check the host's plugin status and hook diagnostics in a fresh session: SessionStart should run `reinhardt-hook.mjs session-start` and supply `using-reinhardt` guidance. On a disposable copy of the bundled `leaky-security-web` fixture, have the agent edit `firestore.rules`; PostToolUse should report `firebase-open-rules`, and Stop should block once if it remains. Never introduce a test vulnerability into your real app.

A successful `scan_repo` call verifies the MCP tool connection only. Verify the hook events separately. Automated tests cover the CLI, MCP protocol, hook subprocesses, and plugin manifests. Follow the checks above to confirm activation in your host. Set `REINHARDT_STOP_GATE=off` in the host environment to disable the Stop gate while retaining post-edit notes.

### Optional: MCP tools only

Choose this lighter integration if you want an agent to call the scanner on request. It does not install skills or activate the harness hooks. After downloading the checkout, merge [codex/config.toml.snippet](codex/config.toml.snippet) into `~/.codex/config.toml`, replacing the absolute path:

```toml
[mcp_servers.reinhardt]
command = "node"
args = ["/absolute/path/to/reinhardt/cli/reinhardt.js", "mcp"]
```

A trusted project's `.codex/config.toml` is also supported. Use an absolute Node executable path if needed. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp). Ask the agent to call `scan_repo` with your application's absolute path and verify the findings.

The optional [AGENTS snippet](codex/AGENTS.snippet.md) requests dependency-change checks through agent instructions; it does not register hooks. When moving to the full plugin, remove a duplicate manual MCP entry if it exposes the same server twice.

| MCP tool | Arguments | Behavior |
| --- | --- | --- |
| `scan_repo` | `path`, optional `policy_path` | Scan privacy disclosures and OWASP-mapped security patterns |
| `drift_check` | `path`, optional `policy_path` | Compare with baseline; never saves one |
| `save_baseline` | `path`, optional `policy_path` | Write baseline **only after the user accepted the current state** |
| `explain_sdk` | optional `id` | Explain one SDK or list the catalog |
| `owasp_lookup` | optional `query` | List standards or look up references, item IDs, CWE IDs, or terms |
| `list_rules` | optional `id` | List security rules or explain one without its test vectors |

Tool failures return `isError`; a failed call does not terminate the server. Only JSON-RPC goes to stdout in MCP mode. The MCP client receives structured reports and JSON text; no source file contents are returned. Tool paths are local filesystem access with the permissions of the process; this is not a sandbox for untrusted remote clients.

## CLI

```text
reinhardt scan|baseline|drift|sdk|owasp|rules|mcp [path]
  --policy <file>           Explicit policy, relative to the scanned repository
  --json                    JSON output
  --fail-on high|medium|low  Exit 1 for findings at or above the threshold
```

The repository defaults to the current directory. `sdk` takes an SDK ID instead of a path; omit it to list all 30 catalog entries. `mcp [path]` starts the stdio server and optionally sets the base for relative tool paths; it does not accept report flags. `--help` prints usage.

```sh
reinhardt sdk posthog
reinhardt owasp LLM01:2026
reinhardt owasp CWE-918 --json
reinhardt rules
reinhardt rules hardcoded-secret --json
reinhardt drift . --json --fail-on medium
reinhardt mcp
```

Exit codes: `0` for a completed operation below the chosen threshold (or without one), `1` for findings meeting the threshold, and `2` for invalid arguments or operational errors. `--fail-on` evaluates the current findings for scan, drift, and baseline; saving a baseline still writes it before applying the exit threshold. A named new recipient appears in drift but does not itself trigger a finding. Malformed privacy dependency manifests and unreadable files fail the operation. Non-manifest binary or oversized security candidates are skipped. Security matches are included in the same CI threshold calculation.

The example leaky web fixture produces four findings: missing consent handling, undisclosed Anthropic and Meta, and a generic-only PostHog disclosure. Evidence includes `package.json` and source `file:line` locations.

## How detection works

1. Walk allowed repository files in sorted order. Never read `.env*`, `node_modules`, lockfiles, known build/cache outputs, or files over 1,000,000 bytes. Skip symlinks, binary content, `.git`, `Pods`, `DerivedData`, `vendor`, virtual environments, and `.reinhardt` (except explicit baseline operations). Explicit policy overrides obey the same restrictions and must stay inside the repository.
2. Parse `package.json` production/optional/peer dependencies (ignore `devDependencies`), `requirements.txt`, `Podfile`, `Package.swift`, and Xcode `project.pbxproj` package `repositoryURL` references. Match case-insensitive names and trailing-`*` prefixes from [data/sdks.json](data/sdks.json). PyPI separators are normalized.
3. Match literal HTTP(S) or protocol-relative endpoint hosts in common source files. Domain matches require an exact host or a subdomain boundary. Policies and documentation are not endpoint evidence.
4. Select the longest markup-stripped privacy-path file with more than 800 characters; break ties by path. Supported policy extensions: md, mdx, txt, html, tsx, jsx, astro, vue, svelte. `--policy` explicitly selects a file and permits shorter nonempty text.
5. Classify each potential recipient as `named`, `generic`, `undisclosed`, or `no-policy`. Aliases use Unicode word boundaries: `meta` does not match `metadata`. Named matches take precedence over category terms.

| Finding ID | Severity |
| --- | --- |
| `undisclosed-sdk` | Category-defined: high for advertising, session replay, AI; medium for other seeded categories |
| `generic-disclosure-only` | Medium for advertising, session replay, AI; low otherwise |
| `no-policy` | High, once per scan when SDKs exist and no policy is found |
| `no-consent-mechanism` | Web tracking: high for advertising/replay; medium for analytics |
| `missing-att` | High for iOS advertising without both ATT usage and a nonempty usage description |

Finding IDs identify rules; `sdk_id` distinguishes per-SDK findings. Findings include severity, title, detail, evidence, suggested fix, and a disclosure draft (or `null` for findings requiring controls/a whole policy). Drafts require verification and human/legal review. Reports sort findings by severity, rule, and SDK, and sort SDKs and evidence deterministically. No-policy produces one aggregate finding rather than a duplicate undisclosed finding for every SDK.

The catalog spans analytics, advertising, session replay, crash reporting, backend, auth, payments, messaging, and AI. The seed catalog is heuristic and has not been exhaustively checked against every vendor's current package names and collection behavior. Collection lists describe possibilities, not observed transmission. Firebase is grouped under backend even though specific products have other purposes. Vercel AI SDK may send content to a configured model provider without making Vercel a recipient; verify that route before changing disclosure.

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

## OWASP knowledge and security rules

`owasp` and `owasp_lookup` read the 22 bundled standards. Lookup tries an exact reference, then a standard ID, then case-insensitive item ID, then CWE ID, then a name/summary substring search capped at 25 results. References split on the first colon: `top10-2025:A01:2025` identifies item `A01:2025`. No query lists standards; no match returns an empty results array.

Scan reports now use `schema_version: 2`. All findings carry `category` (`privacy` or `security`), `confidence`, and arrays for `owasp`, `cwe`, `asvs`, and `guidance`. Privacy findings gain OWASP mappings without changing baseline schema version 1. Security findings are grouped once per matching rule, with `sdk_id` and `suggested_disclosure` set to null. Evidence contains only `{ file, line, kind }`, sorted and capped at 50 per security finding (20 for the missing iOS privacy manifest check). Matched source text and credential values are never included.

The data-driven interpreter applies file classes, required context, suppression patterns, repository signals (`repo_any`), and per-rule test-path exclusions. Supabase RLS checks run only when candidate paths or text indicate Supabase, including package dependencies when SQL lives outside `supabase/`. Two repository checks look for SQL tables without an RLS enable statement and required-reason APIs without a walked `PrivacyInfo.xcprivacy`. These existence checks do not establish that a policy is correct or a manifest belongs to the app target. `rules [id]` returns the rule definition without test vectors; the list below shows its first OWASP mapping. Full mappings are available through the CLI/MCP tools.

| Rule ID | Severity | Primary OWASP reference |
| --- | --- | --- |
| `hardcoded-secret` | high | `nhi-top10-2025:NHI2:2025` |
| `client-exposed-secret-env` | high | `top10-2025:A04:2025` |
| `llm-sdk-in-browser` | high | `llm-top10-2026:LLM02:2026` |
| `supabase-privileged-key-in-client` | high | `top10-2025:A01:2025` |
| `supabase-table-without-rls` | high | `top10-2025:A01:2025` |
| `supabase-permissive-write-policy` | high | `top10-2025:A01:2025` |
| `firebase-open-rules` | high | `top10-2025:A01:2025` |
| `mass-assignment` | medium | `api-top10-2023:API3:2023` |
| `cors-credentials-any-origin` | high | `top10-2025:A01:2025` |
| `open-redirect` | medium | `top10-2025:A01:2025` |
| `ssrf-request-url` | high | `top10-2025:A01:2025` |
| `sql-string-building` | high | `top10-2025:A05:2025` |
| `nosql-injection` | high | `top10-2025:A05:2025` |
| `template-autoescape-disabled` | high | `top10-2025:A05:2025` |
| `command-injection` | high | `top10-2025:A05:2025` |
| `dynamic-code-execution` | medium | `top10-2025:A05:2025` |
| `unsanitized-html-sink` | medium | `top10-2025:A05:2025` |
| `jwt-none-algorithm` | high | `top10-2025:A07:2025` |
| `jwt-decoded-without-verification` | medium | `top10-2025:A07:2025` |
| `weak-password-hashing` | high | `top10-2025:A04:2025` |
| `weak-hash-algorithm` | low | `top10-2025:A04:2025` |
| `insecure-randomness` | medium | `top10-2025:A04:2025` |
| `insecure-cookie-flags` | medium | `top10-2025:A07:2025` |
| `token-in-web-storage` | medium | `client-side-top10:CS7` |
| `tls-verification-disabled` | high | `top10-2025:A04:2025` |
| `ios-ats-disabled` | medium | `mobile-top10-2024:M5` |
| `ios-cleartext-url` | low | `mobile-top10-2024:M5` |
| `ios-sensitive-data-in-userdefaults` | medium | `mobile-top10-2024:M9` |
| `sensitive-data-logged` | low | `top10-2025:A09:2025` |
| `ios-privacy-manifest-missing` | medium | `mobile-top10-2024:M6` |
| `gha-pull-request-target-checkout` | high | `cicd-top10:CICD-SEC-4` |
| `gha-script-injection` | high | `cicd-top10:CICD-SEC-4` |
| `gha-excessive-permissions` | medium | `cicd-top10:CICD-SEC-5` |
| `gha-unpinned-action` | low | `cicd-top10:CICD-SEC-3` |
| `docker-secret-in-image` | medium | `nhi-top10-2025:NHI2:2025` |
| `mcp-server-unpinned` | low | `llm-top10-2026:LLM04:2026` |
| `postmessage-wildcard-origin` | low | `client-side-top10:CS9` |
| `third-party-script-without-sri` | low | `client-side-top10:CS5` |
| `nextjs-browser-source-maps` | low | `client-side-top10:CS10` |
| `upload-without-size-limit` | low | `api-top10-2023:API4:2023` |

## Data licensing and provenance

Code remains [MIT licensed](LICENSE). Content in `data/owasp/` is adapted from OWASP Foundation projects and licensed **CC BY-SA 4.0**, attributed to OWASP Foundation and the respective project teams, with adaptations by reinhardt contributors. See [data/owasp/README.md](data/owasp/README.md) for attribution, source notes, and caveats, and [docs/owasp.md](docs/owasp.md) for the distillation approach. Some mappings are inferred and some standards are draft, partial, or archived; inclusion is not OWASP endorsement.

## Limits

- Security regexes use bounded matching where context spans are needed to reduce ReDoS risk. The suite times every JS rule against a 1 MB single-line input; that test is not a proof against every adversarial input.
- Rules with `skip_test_paths` skip test/example/fixture, vendored, minified, and build-tool paths according to the data file. This is per rule; not all rules skip tests. Scanning a fixture root still tests its relative application paths.
- Static and heuristic: no runtime traffic, effective SDK configuration, reachable-code analysis, server-side forwarding, consent correctness, or legal conclusions. There are no LLM calls in the engine.
- Cannot see scripts loaded dynamically by tag managers, dynamically constructed endpoints, custom proxies, or transitive SDK dependencies. No lockfiles are read, and requirements includes are not recursively followed.
- Manifest parsers recognize common literal forms; they do not execute Ruby, Swift, Python, or JavaScript. Conditional, commented, and unused code may cause false positives. Raw source endpoint matching can also see examples or tests.
- Policy stripping is not a framework renderer. Translation, JavaScript-generated text, negation (“we do not use X”), comments outside HTML, and ambiguous aliases can mislead matching. Named disclosure does not establish completeness or accuracy.
- Consent detection checks only **existence**, not correct blocking. Recognized consent dependencies and identifiers can suppress a warning even if unused. ATT similarly requires a recognized usage and description; it does not prove correct timing or permission handling.
- Platform detection is approximate. Web extensions/frameworks/browser globals and Apple manifests/source mark platforms. React Native TSX or macOS Swift packages may be misclassified. Monorepo controls or policies can be attributed across applications; scan individual app roots when possible.
- Supported dependency ecosystems: npm, pip requirements, CocoaPods, SwiftPM, and Xcode Swift package references. Android/Gradle is not supported. Missing a catalog entry means a recipient can be missed.
- Inputs should remain unchanged during a scan. Symlinks are refused, but this is not an OS security boundary against concurrent hostile filesystem mutation. Unknown build-output directory names may require scanning a narrower source root.

## Tests and evals

```sh
npm test
npm run eval
```

`node:test` covers matching, disclosure, excluded files, drift, ATT, CLI exit codes, and a child-process MCP stdio round trip (including error recovery). Labelled `expected.json` files in all six directories under `evals/fixtures/` define rule IDs with SDK IDs so a missed recipient cannot be hidden by another finding with the same rule. The eval runner prints precision/recall and fails on any unexpected or missing finding. `clean-web` and `clean-ios` must produce zero findings. Fixture apps are static examples; do not install or execute them.

The v0.4.0 suite tests every supplied rule vector, knowledge references, scan determinism, binary skipping, credential non-disclosure, protocol recovery, packaging, and documentation. On the six labelled fixtures, expected precision and recall are 1.000 with 51 true positives and no false positives/negatives. Those figures measure this suite, not general detection quality. GitHub Actions targets Node 20 and 22. The scanner has also been exercised on a local application repository, with its finding checked against the project files. Further validation will expand host integration coverage.

## Benchmark

Run `npm run benchmark` to scan seven public repositories pinned to exact commits in `evals/benchmarks/real-world.json`. The measured precision is **0.953**, calculated as **61 / (61 + 3)**: 61 true positives and 3 false positives. Three unresolved findings are excluded from that denominator. Labels were assigned by one maintainer; this sample is not a general detection-quality estimate.

Recall is described by `known_misses`, not a numeric recall score. The runner prints each repository's known-miss count; these entries describe coverage gaps and are not an exhaustive vulnerability inventory.

The runner requires git and network access for initial clones, caches them under `os.tmpdir()/reinhardt-benchmark/<name>-<commit>`, and reuses checkouts at the pinned commit. It only scans source; it does not install or execute the benchmark apps. It runs separately from `npm test`, manually or in the weekly GitHub Actions benchmark workflow. New unlabelled findings or missing labelled true positives exit 1; clone, checkout, or scan errors exit 2 and identify the repository. Disappearing false positives are reported as improvements. Output lists rule IDs and file/line locations without source text.

## Contributing

Add an SDK entry to `data/sdks.json` and a labelled fixture covering it. Each entry has `id`, `name`, `category`, `aliases`, `match` (`npm`, `pod`, `swiftpm`, `pypi` arrays), `domains`, and `collects`. Names are exact case-insensitive matches unless they end in `*`; domains are hostnames without schemes or wildcards. Prefer specific policy aliases and add negative cases for ambiguous names. Include evidence from the vendor's documentation in your contribution.

Each category defines `severity`, `generic_terms`, and a plain-English `purpose`. Keep data and output ordering stable, add focused regression tests, and run both commands above. Never add legal assurances or treat catalog data types as verified collection. Code is MIT; OWASP-derived data is CC BY-SA 4.0 as described above. Agents must follow the read-only knowledge ownership boundaries in [AGENTS.md](AGENTS.md).

## Roadmap

- Android/Gradle dependency detection.
- An opt-in runtime mode that records real third-party requests.
- Consent-gating verification, including initialization order and denied-consent paths.
- More fixtures, provider-specific configuration checks, and host integration tests.
