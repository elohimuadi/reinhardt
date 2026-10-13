# Scanner reference

[Installation and quickstart](../README.md)

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

## MCP tools

| MCP tool | Arguments | Behavior |
| --- | --- | --- |
| `scan_repo` | `path`, optional `policy_path` | Scan privacy disclosures and OWASP-mapped security patterns |
| `drift_check` | `path`, optional `policy_path` | Compare with baseline; never saves one |
| `save_baseline` | `path`, optional `policy_path` | Write baseline **only after the user accepted the current state** |
| `explain_sdk` | optional `id` | Explain one SDK or list the catalog |
| `owasp_lookup` | optional `query` | List standards or look up references, item IDs, CWE IDs, or terms |
| `list_rules` | optional `id` | List security rules or explain one without its test vectors |

Tool failures return `isError`; a failed call does not terminate the server. Only JSON-RPC goes to stdout in MCP mode. The MCP client receives structured reports and JSON text; no source file contents are returned. Tool paths are local filesystem access with the permissions of the process; this is not a sandbox for untrusted remote clients.

## Track recipient changes

After reviewing and accepting the current recipients, explicitly save a baseline:

```sh
node "$HOME/reinhardt/cli/reinhardt.js" baseline /absolute/path/to/your/app
# After dependency changes:
node "$HOME/reinhardt/cli/reinhardt.js" drift /absolute/path/to/your/app
```

`baseline` writes or overwrites `.reinhardt/baseline.json` in the application. It records sorted recipient IDs and names without timestamps or machine-specific paths. Commit it if you want to share the accepted recipients with CI or teammates. Without a baseline, `drift` reports that no comparison is available and includes the current scan.

## How detection works

1. Walk allowed repository files in sorted order. Never read `.env*`, `node_modules`, lockfiles, known build/cache outputs, or files over 1,000,000 bytes. Skip symlinks, binary content, `.git`, `Pods`, `DerivedData`, `vendor`, virtual environments, and `.reinhardt` (except explicit baseline operations). Explicit policy overrides obey the same restrictions and must stay inside the repository.
2. Parse `package.json` production/optional/peer dependencies (ignore `devDependencies`), `requirements.txt`, `Podfile`, `Package.swift`, and Xcode `project.pbxproj` package `repositoryURL` references. Match case-insensitive names and trailing-`*` prefixes from [data/sdks.json](../data/sdks.json). PyPI separators are normalized.
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

Code remains [MIT licensed](../LICENSE). Content in `data/owasp/` is adapted from OWASP Foundation projects and licensed **CC BY-SA 4.0**, attributed to OWASP Foundation and the respective project teams, with adaptations by reinhardt contributors. See [data/owasp/README.md](../data/owasp/README.md) for attribution, source notes, and caveats, and [docs/owasp.md](owasp.md) for the distillation approach. Some mappings are inferred and some standards are draft, partial, or archived; inclusion is not OWASP endorsement.

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

Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.
