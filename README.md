# reinhardt

An open-source privacy-drift detector for AI-generated (vibe-coded) apps. AI coding tools can add SDKs that introduce third-party data recipients while the privacy policy stays unchanged. reinhardt finds those potential recipients, compares them with the policy, and tracks additions and removals against an explicitly accepted baseline.

**Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.** Zero findings are not an assurance about an application's privacy practices.

The deterministic engine makes no LLM calls or network requests. An agent uses its evidence to verify initialization, explain uncertainty, and make truthful fixes. Node >=20, ESM, plain JavaScript, MIT. The engine uses only Node built-ins; the two direct runtime dependencies, `@modelcontextprotocol/sdk` and `zod`, power MCP (the SDK has its own transitive dependencies).

## Quickstart

From a checkout of this repository:

```sh
npm ci
node bin/reinhardt.js scan evals/fixtures/leaky-web
node bin/reinhardt.js scan /path/to/your/app --json
node bin/reinhardt.js scan /path/to/your/app --policy docs/privacy.md --fail-on high
```

After reviewing and accepting the current recipients:

```sh
node bin/reinhardt.js baseline /path/to/your/app
# Make dependency changes, then compare:
node bin/reinhardt.js drift /path/to/your/app
```

A baseline records sorted recipient IDs and names in `.reinhardt/baseline.json`, without timestamps or machine-specific paths. Saving overwrites the previous baseline. It is a record of accepted recipients, not an endorsement. Commit that file in the scanned application if you want to share it with CI or teammates. Without a baseline, `drift` clearly reports that no comparison is available and includes the current scan.

Optionally run `npm link` from this checkout to make `reinhardt` available on your PATH. These instructions use the local checkout; npm publication and availability of the package name have not been verified.

## CLI

```text
reinhardt scan|baseline|drift|sdk|mcp [path]
  --policy <file>           Explicit policy, relative to the scanned repository
  --json                    JSON output
  --fail-on high|medium|low  Exit 1 for findings at or above the threshold
```

The repository defaults to the current directory. `sdk` takes an SDK ID instead of a path; omit it to list all 30 catalog entries. `mcp [path]` starts the stdio server and optionally sets the base for relative tool paths; it does not accept report flags. `--help` prints usage.

```sh
reinhardt sdk posthog
reinhardt drift . --json --fail-on medium
reinhardt mcp
```

Exit codes: `0` for a completed operation below the chosen threshold (or without one), `1` for findings meeting the threshold, and `2` for invalid arguments or operational errors. `--fail-on` evaluates the current findings for scan, drift, and baseline; saving a baseline still writes it before applying the exit threshold. A named new recipient appears in drift but does not itself trigger a finding. Malformed manifests and unreadable candidate files fail the operation rather than silently returning an incomplete scan.

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

## Codex setup: config.toml first

After `npm ci`, merge [codex/config.toml.snippet](codex/config.toml.snippet) into `~/.codex/config.toml`, replacing the absolute path:

```toml
[mcp_servers.reinhardt]
command = "node"
args = ["/absolute/path/to/reinhardt/bin/reinhardt.js", "mcp"]
```

A trusted project's `.codex/config.toml` is also supported. This follows the [official Codex MCP documentation](https://developers.openai.com/codex/mcp). Use an absolute Node executable path if your host does not inherit the right PATH. Ask Codex to call `scan_repo` with your application's absolute path, verify each finding, and report evidence without editing files.

Append [codex/AGENTS.snippet.md](codex/AGENTS.snippet.md) to an application's AGENTS.md to request drift checks after dependency changes. This is agent guidance, not an installed automatic hook.

| MCP tool | Arguments | Behavior |
| --- | --- | --- |
| `scan_repo` | `path`, optional `policy_path` | Scan and classify potential recipients |
| `drift_check` | `path`, optional `policy_path` | Compare with baseline; never saves one |
| `save_baseline` | `path`, optional `policy_path` | Write baseline **only after the user accepted the current state** |
| `explain_sdk` | optional `id` | Explain one SDK or list the catalog |

Tool failures return `isError`; a failed call does not terminate the server. Only JSON-RPC goes to stdout in MCP mode. The MCP client receives structured reports and JSON text; no source file contents are returned. Tool paths are local filesystem access with the permissions of the process; this is not a sandbox for untrusted remote clients.

## Codex plugin: secondary, host installation untested

[plugin/](plugin/) contains `.codex-plugin/plugin.json`, `.mcp.json`, and three skills:

- `privacy-audit`: verify each finding in code; report uncertainty; do not edit.
- `privacy-fix`: fix one verified finding, then re-scan; disclosure must reflect behavior.
- `privacy-drift-watch`: check after dependency changes; ask about new unnamed recipients; never reset the baseline on its own.

The manifest fields and compatibility layout were checked against the [official plugin documentation](https://developers.openai.com/plugins/build/plugins) on 2026-09-20. That documentation now recommends a portable root manifest for new packages and still supports the requested `.codex-plugin` layout. The bundled plugin and skill validators pass.

For a local plugin experiment, first make `reinhardt` available on the Codex host's PATH using `npm link`. The plugin's `.mcp.json` invokes `reinhardt mcp`; it does not download a package or reference a parent directory that would disappear when cached. Copy the contents of `plugin/` into a directory named `reinhardt` in your local plugin source and follow the official marketplace installation instructions. This project does not edit your personal marketplace or Codex settings.

**Unverified:** actual Codex plugin installation, cached-plugin PATH inheritance, UI discovery, and agent behavior in Codex, Claude Code, or Cursor. Direct MCP protocol integration is tested with the official SDK client; that is not a full host integration test. Use config.toml as the primary setup route.

## Limits

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

`node:test` covers matching, disclosure, excluded files, drift, ATT, CLI exit codes, and a child-process MCP stdio round trip (including error recovery). Labelled `evals/fixtures/{leaky-web,clean-web,leaky-ios}/expected.json` files define rule IDs with SDK IDs so a missed recipient cannot be hidden by another finding with the same rule. The eval runner prints precision/recall and fails on any unexpected or missing finding. `clean-web` must produce zero findings. Fixture apps are static examples; do not install or execute them.

Verified locally on Node 20.20.2 and 22.16.0: tests, MCP e2e, all three evals, and the leaky-web CLI example. The fixtures yield precision 1.000 and recall 1.000 (7 true positives, no false positives/negatives); those figures measure this small labelled suite, not general detection quality. GitHub Actions is configured for Node 20 and 22; hosted execution has not been observed.

## Contributing

Add an SDK entry to `data/sdks.json` and a labelled fixture covering it. Each entry has `id`, `name`, `category`, `aliases`, `match` (`npm`, `pod`, `swiftpm`, `pypi` arrays), `domains`, and `collects`. Names are exact case-insensitive matches unless they end in `*`; domains are hostnames without schemes or wildcards. Prefer specific policy aliases and add negative cases for ambiguous names. Include evidence from the vendor's documentation in your contribution.

Each category defines `severity`, `generic_terms`, and a plain-English `purpose`. Keep data and output ordering stable, add focused regression tests, and run both commands above. Never add legal assurances or treat catalog data types as verified collection. The project is [MIT licensed](LICENSE).

## Roadmap

- Android/Gradle dependency detection.
- An opt-in runtime mode that records real third-party requests.
- Agent/editor hooks for dependency changes.
- Consent-gating verification, including initialization order and denied-consent paths.
- More fixtures, provider-specific configuration checks, and host integration tests.
