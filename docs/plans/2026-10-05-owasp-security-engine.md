# OWASP Security Engine and Dual Plugin Implementation Plan

> **For agentic workers:** Execute task-by-task in order. Each task is red → green → commit. Steps use checkbox (`- [ ]`) syntax; tick them as you go. Read `AGENTS.md` first — it is part of this plan.

**Goal:** Turn reinhardt from a privacy-drift detector into a privacy + OWASP-mapped security scanner that installs as both a Claude Code plugin and a Codex plugin with zero runtime dependencies.

**Architecture:** Security rules are **data** (`data/rules.json`, owned by the knowledge maintainer) executed by a small generic interpreter (`src/engine/rules.js`) plus two named repository-level checks (`src/engine/rule-kinds.js`). OWASP explanations come from `data/owasp/*.json` via `src/engine/owasp.js`. `scanRepo` merges privacy and security findings into one report. The MCP server is rewritten on Node built-ins so the plugin runs straight from a git checkout.

**Tech Stack:** Node ≥ 20, ESM, plain JavaScript, `node:test`. Runtime deps after Task 6: none. Dev deps: `@modelcontextprotocol/sdk` (MCP e2e client only).

**Spec:** `data/rules.json` (top-level `description`, `ref_format`, `vector_format`, `test_path_regex`, `file_classes`, and each rule's `files`, `skip_test_paths`, `patterns`, `require_file_all`, `suppress_if_file`, `context_any`, `path_any`, `kind`, `algorithm`, `tests`), `data/owasp/README.md`, `AGENTS.md`, and the labelled fixtures in `evals/fixtures/`.

## Global Constraints

- Do not edit `data/rules.json`, `data/owasp/**`, `data/sdks.json`, `skills/**`, or any `evals/fixtures/**` file. If a vector or fixture cannot pass without changing them, stop and report: rule id, vector/fixture, observed vs expected.
- Engine: no network, no LLM calls, no new runtime dependencies.
- Reports never contain matched text, secrets or source lines. Evidence is `{ file, line, kind }` only; `kind` for security evidence is the pattern `label` (or the kind's fixed label).
- All file reads go through `readText` in `src/engine/files.js`; walker exclusions are unchanged.
- Deterministic output: identical input ⇒ `deepEqual` reports.
- Regex flags: always add `g` for scanning on top of the rule's own `flags`; dedupe flag letters.
- `--fail-on` semantics, exit codes 0/1/2, and the drift baseline format (`schema_version: 1`) are unchanged.
- Scan report `schema_version` becomes `2`.
- Version becomes `0.2.0` in `package.json`, both plugin manifests, and the MCP `serverInfo`.
- Disclaimer string is unchanged and appears in every report, CLI output and MCP response.
- Never output the words "safe", "secure", or "compliant" as a verdict.

## Review Focus

1. A repo containing a **binary plist or other binary file in a security file class** must not abort the scan; security candidates that `readText` rejects as binary or oversized are skipped silently (privacy manifest parsing keeps its current strictness).
2. A **1,000,000-byte single-line minified JS file** must be scanned by all rules in under 2 seconds total (rules were tuned against ReDoS; line numbers must not be computed with an O(n) scan per match — use a precomputed newline-offset table and binary search).
3. **No secret leakage:** `JSON.stringify(report)` for `evals/fixtures/leaky-security-web` must not contain `AKIAIOSFODNN7EXAMPLE`, and the same holds for CLI text output and MCP responses.
4. **Test-path skipping** uses the rule's `skip_test_paths` with the top-level `test_path_regex` on the repo-relative POSIX path; a secret under `test/` must not be reported, the same secret under `src/` must.
5. **Existing behavior** — every current test and the three existing fixtures (`clean-web`, `leaky-web`, `leaky-ios`) keep passing unchanged except for the additive report fields.

---

### Task 1: OWASP knowledge loader and lookup

**Files:**
- Create: `src/engine/owasp.js`
- Test: `test/owasp.test.js`

**Interfaces:**
- Produces:
  - `standards: Map<string, Standard>` — every `data/owasp/*.json` (filter to `.json`; `README.md` lives there too), keyed by `id`.
  - `resolveRef(ref: string): { standard: Standard, item: Item } | null` — split on the FIRST `:` only.
  - `lookup(query?: string): LookupReport`.
    - No query → `{ disclaimer, standards: [{ id, name, edition, status, maturity, url, item_count }] }` sorted by id.
    - Otherwise `{ disclaimer, query, results: [{ ref, standard: { id, name, edition, status, url }, item }] }`, matched in this precedence, first non-empty wins: (1) exact ref; (2) exact standard id → all its items in file order; (3) item id equal case-insensitively across all standards (e.g. `a01:2025`, `M5` returns every standard's `M5`); (4) `CWE-<n>` → items whose `cwe` includes it; (5) case-insensitive substring of item `name` or `summary`, capped at 25. Results sorted by standard id, then item order in its file. No match → `results: []` (not an error).

- [ ] **Step 1: Write failing tests** in `test/owasp.test.js`:
  - `every standard file parses, ids match file stems, item ids are unique per standard`
  - `every related ref in every item resolves` (strip a leading `(inferred) ` before resolving)
  - `resolveRef handles colons in item ids`: `resolveRef('top10-2025:A01:2025').item.name === 'Broken Access Control'`; `resolveRef('nope:X') === null`
  - `lookup precedence`: `lookup('llm-top10-2026:LLM01:2026').results.length === 1`; `lookup('api-top10-2023').results.length === 10`; `lookup('a05:2025').results[0].item.name === 'Injection'`; `lookup('CWE-918').results.some(r => r.ref === 'top10-2025:A01:2025')`; `lookup('row level security')` returns ≤ 25 results; `lookup('zzzz-no-match').results` deep-equals `[]`
  - `lookup without query lists 22 standards sorted by id, each with disclaimer at top level`
- [ ] **Step 2:** `node --test test/owasp.test.js` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/engine/owasp.js` with `readFileSync` + `new URL('../../data/owasp/', import.meta.url)`.
- [ ] **Step 4:** `node --test test/owasp.test.js` → PASS.
- [ ] **Step 5:** `git commit -m "feat: load OWASP knowledge base and add lookup"`

### Task 2: Rule interpreter that passes every rule vector

**Files:**
- Create: `src/engine/rules.js`, `src/engine/rule-kinds.js`
- Modify: `src/engine/common.js` (add a line index helper)
- Test: `test/rules.test.js`

**Interfaces:**
- Consumes: `resolveRef` (Task 1).
- Produces:
  - `ruleset` — parsed `data/rules.json`.
  - `fileClasses(path: string): string[]` — classes whose `extensions` (lower-cased extension), `basenames`, or `path_regex` match the POSIX relative path.
  - `vectorText(text: string | string[]): string` — arrays join with `''`.
  - `isTestPath(path: string): boolean` — `test_path_regex`.
  - `matchRule(rule, files: Array<{ path: string, text: string }>): Array<{ file: string, line: number, kind: string }>` — sorted by file, line, kind; deduplicated.
  - `lineIndex(text): (offset) => line` in `common.js` (newline offsets + binary search, 1-based).
- Pattern rule semantics (per file): file class intersects `rule.files`; if `skip_test_paths` and `isTestPath` → skip; every `require_file_all` regex must match the file; any `suppress_if_file` match → skip; if `context_any` or `path_any` is present, at least one `context_any` regex must match the text OR one `path_any` regex must match the path; then every match of every `patterns[i]` yields evidence `{ file, line, kind: patterns[i].label }`.
- `kind: "ios-privacy-manifest"`: run the pattern logic; return the evidence only if no file in `files` has basename `PrivacyInfo.xcprivacy`; cap at 20 entries (after sorting).
- `kind: "supabase-rls"`: implement the rule's `algorithm` text exactly. Use bounded regexes (no unbounded `[\s\S]*`). Evidence kind `table-without-rls`.

- [ ] **Step 1: Write failing tests** in `test/rules.test.js`:
  - `rules data integrity`: unique ids; every `files` entry exists in `file_classes`; every regex compiles; every `owasp` and `guidance` ref resolves via `resolveRef`; every `asvs` id `v5.0.0-X.Y.Z` exists among `asvs-5.0` chapters' `l1_requirements`; every `privacy_rules` ref resolves; severities ∈ {high, medium, low}; confidence ∈ {high, medium, low}.
  - One generated test per vector: `for each rule, for each positive vector: matchRule(rule, [vector, ...with]).length > 0`; `for each negative vector: === 0` (apply `vectorText` to every file). Name tests `` `${rule.id} positive #${i}` ``.
  - `fileClasses`: `'.github/workflows/ci.yml'` includes `workflow` and `config`; `'docker/Dockerfile.prod'` includes `dockerfile`; `'App/Info.plist'` includes `plist`; `'database.rules.json'` includes `firebase-rules` and `config`.
  - `evidence lines are 1-based and correct` for a match on line 3.
  - `performance`: a 1,000,000-character single-line string of `'a=1;'` repeated plus one positive snippet, run through every rule whose files include `js` → total < 2000 ms.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `node --test test/rules.test.js` → PASS, 0 failures.
- [ ] **Step 5:** `git commit -m "feat: interpret data-driven security rules"`

### Task 3: Security findings in scan reports and evals

**Files:**
- Modify: `src/engine/scan.js`, `evals/run.js` (only if needed — it keys on `id:sdk_id` already)
- Test: `test/security-scan.test.js`

**Interfaces:**
- Consumes: `ruleset`, `fileClasses`, `matchRule` (Task 2).
- Produces: `scanRepo` report `schema_version: 2`. Every finding gains `category` (`"privacy"` | `"security"`), `owasp: string[]`, `cwe: string[]`, `asvs: string[]`, `guidance: string[]`, `confidence`. Privacy findings: `owasp` from `ruleset.privacy_rules[id]`, `cwe/asvs/guidance: []`, `confidence: "medium"`. Security findings: one per rule that matched, `sdk_id: null`, `suggested_disclosure: null`, `title/detail/suggested_fix/severity/confidence/owasp/cwe/asvs/guidance` copied from the rule, evidence capped at 50 after sorting. Sorting of findings unchanged (severity, id, sdk_id).
- Candidate files: walked files whose `fileClasses` intersect any rule's `files`. Read each once with `readText`; skip (do not throw) on binary / oversized errors for files that are not privacy manifests.

- [ ] **Step 1: Write failing tests** in `test/security-scan.test.js` using temp repos like `test/scan.test.js`:
  - `security finding shape`: a repo with `src/a.js` containing `new OpenAI({ dangerouslyAllowBrowser: true })` → finding `llm-sdk-in-browser` with `category === 'security'`, `owasp` including `'llm-top10-2026:LLM02:2026'`, evidence `[{ file: 'src/a.js', line: 1, kind: 'dangerously-allow-browser' }]`.
  - `privacy findings carry OWASP refs`: the existing no-policy scenario yields `no-policy` with `owasp` including `'privacy-top10-2021:P5'` and `category === 'privacy'`.
  - `no secret text in report`: scan `evals/fixtures/leaky-security-web`; `JSON.stringify(report)` does not include `AKIAIOSFODNN7EXAMPLE`.
  - `test paths skipped`: `test/k.js` with an AWS-format key (build it with string concatenation in the test source) → no `hardcoded-secret`; same text in `src/k.js` → finding.
  - `binary security candidate is skipped`: `App/Binary.plist` containing `\0` bytes does not throw.
  - `deterministic`: two scans of `leaky-security-web` deep-equal.
  - `report schema_version is 2`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in `scan.js` (keep the privacy logic intact; add a `securityFindings(root, files)` helper in a new `src/engine/security.js` if `scan.js` grows past ~120 lines).
- [ ] **Step 4:** `npm test` → 0 failures. `npm run eval` → every fixture PASS, `Precision: 1.000; Recall: 1.000`.
- [ ] **Step 5:** `git commit -m "feat: report OWASP-mapped security findings"`

### Task 4: CLI commands and text output

**Files:**
- Modify: `bin/reinhardt.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `lookup` (Task 1), `ruleset` (Task 2).
- Produces:
  - `reinhardt owasp [query]` → `lookup(query)`; JSON with `--json`, else text: one line per standard (`id — name (edition, status)`) or per result (`ref — name`), followed by its summary and prevention bullets.
  - `reinhardt rules [id]` → `{ disclaimer, rules: [{ id, title, severity, confidence, category, owasp, cwe }] }` sorted by id, or the full rule object minus `tests` for one id; unknown id → exit 2 with `Unknown rule: <id>`.
  - Finding text output adds a line `OWASP: <refs joined by ", ">` when `owasp` is non-empty.
  - Usage string lists `owasp [query]` and `rules [id]`.
- [ ] **Step 1: Failing tests**: `owasp A01:2025 --json` exits 0 and `results[0].item.name === 'Broken Access Control'`; `rules --json` lists 38 rules; `rules nope` exits 2; `scan evals/fixtures/leaky-security-web` text contains `OWASP: ` and exit code 0; with `--fail-on high` exit code 1.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** `git commit -m "feat: add owasp and rules CLI commands"`

### Task 5: Zero-dependency MCP server with OWASP tools

**Files:**
- Modify: `src/mcp.js`, `package.json` (move `@modelcontextprotocol/sdk` to `devDependencies`, remove `zod`)
- Test: `test/mcp.test.js`

**Interfaces:**
- Produces: newline-delimited JSON-RPC 2.0 over stdio using only `node:readline`/`process.stdin`. Methods: `initialize` → `{ protocolVersion: <client's requested version>, capabilities: { tools: {} }, serverInfo: { name: 'reinhardt', version: '0.2.0' } }`; `notifications/initialized` and other notifications → no response; `ping` → `{}`; `tools/list` → tools with `name`, `description` (ending with the disclaimer), JSON Schema `inputSchema`, and `annotations`; `tools/call` → `{ content: [{ type: 'text', text: JSON }], structuredContent }` or `{ isError: true, content: [...] }` on tool failure. Unknown method → error `-32601`; invalid JSON → `-32700`; invalid params → `-32602`. Only JSON-RPC on stdout.
- Tools: existing `scan_repo`, `drift_check`, `save_baseline`, `explain_sdk` (same args/annotations), plus `owasp_lookup { query?: string }` and `list_rules { id?: string }` (both read-only, idempotent, closed-world).
- [ ] **Step 1: Failing tests** (keep the existing SDK-client e2e and extend it): client lists 6 tools; `owasp_lookup { query: 'LLM10:2026' }` returns `Improper Output Handling`; `list_rules {}` returns 38 rules; a malformed line on raw stdin gets a `-32700` error and the server keeps serving; `scan_repo` on `leaky-security-web` response text does not contain the AWS example key.
- [ ] **Step 2:** FAIL → **Step 3:** implement; delete `zod`; `npm ci` must leave `dependencies` empty → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** `git commit -m "feat: zero-dependency MCP server with OWASP tools"`

### Task 6: Claude Code + Codex plugin packaging (superpowers layout)

**Files:**
- Move: `plugin/skills/privacy-audit|privacy-fix|privacy-drift-watch` → `skills/` (git mv). Do not edit their text except the frontmatter `description`, which must start with `Use when` (rephrase minimally, keep meaning).
- Delete: `plugin/`
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.mcp.json`, `codex/mcp.json`, `hooks/hooks.json`, `hooks/session-start`
- Modify: `codex/AGENTS.snippet.md`, `package.json` (`files` adds `skills`, `hooks`, `.claude-plugin`, `.codex-plugin`, `.mcp.json`; version `0.2.0`)
- Test: `test/plugin.test.js`

**Interfaces / values:**
- `.claude-plugin/plugin.json`: `name: "reinhardt"`, `version: "0.2.0"`, `description: "Privacy-drift and OWASP-mapped security checks for AI-generated apps"`, `author: { name: "reinhardt contributors" }`, `repository: "https://github.com/elohimuadi/reinhardt"`, `license: "MIT"`, keywords.
- `.claude-plugin/marketplace.json`: one plugin entry `reinhardt` with `source: "./"`.
- `.mcp.json` (Claude): `{ "mcpServers": { "reinhardt": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/reinhardt.js", "mcp"] } } }`.
- `.codex-plugin/plugin.json`: same name/version/description, `"skills": "./skills/"`, `"mcpServers": "./codex/mcp.json"`, `"hooks": {}`, `interface` block carried over from the old manifest with `category: "Developer Tools"`, `shortDescription: "Find privacy drift and OWASP security issues in AI-built apps."`, `defaultPrompt: ["Audit this repository for security and privacy issues using reinhardt."]`.
- `codex/mcp.json`: `{ "mcpServers": { "reinhardt": { "command": "reinhardt", "args": ["mcp"] } } }` (Codex resolves via PATH; document `npm link`).
- `hooks/hooks.json`: `SessionStart` with matcher `startup|clear|compact`, command `"${CLAUDE_PLUGIN_ROOT}/hooks/session-start"`.
- `hooks/session-start` (bash, executable, no deps) prints exactly one JSON object: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"reinhardt is installed. When writing code that touches auth, data access, secrets, LLM calls, uploads, CI or dependencies, follow the secure-by-default skill. Before saying work is done, run reinhardt scan_repo; use security-audit for reviews and privacy-drift-watch after dependency changes."}}`.
- [ ] **Step 1: Failing tests** in `test/plugin.test.js`: both manifests parse and `version === package.json.version`; every `skills/*/SKILL.md` has frontmatter `name` equal to its directory and `description` starting with `Use when`; there are exactly 6 skills; `plugin/` does not exist; `.mcp.json` args reference `${CLAUDE_PLUGIN_ROOT}/bin/reinhardt.js`; running `hooks/session-start` exits 0 and its stdout parses to an object with `hookSpecificOutput.additionalContext` containing `secure-by-default`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** `git commit -m "feat: package as Claude Code and Codex plugin"`

### Task 7: Documentation

**Files:**
- Modify: `README.md`
- Create: `RELEASE-NOTES.md`
- Test: `test/docs.test.js`

- [ ] **Step 1: Failing test**: README mentions every rule id in `data/rules.json`, the strings `owasp_lookup`, `list_rules`, `/plugin install`, and `CC BY-SA 4.0`; it does not contain the words "is secure" or "compliant app".
- [ ] **Step 2:** FAIL → **Step 3:** Update README: one-line pitch (privacy drift + OWASP security), install for Claude Code (`/plugin marketplace add elohimuadi/reinhardt` then `/plugin install reinhardt@reinhardt`) and Codex (config.toml route first, plugin second), CLI (`owasp`, `rules`), MCP tools table (6 tools), a security rules table generated by hand from `rules.json` (id, severity, primary OWASP refs), skills list, limits (static/heuristic; ReDoS-bounded patterns; test paths skipped), data licensing note pointing to `data/owasp/README.md`. Keep existing privacy sections accurate. Add `RELEASE-NOTES.md` with a `0.2.0` entry. → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** `git commit -m "docs: document security rules, OWASP lookup and plugin install"`

### Task 8: Final verification

- [ ] Run `npm ci && npm test && npm run eval` from a clean checkout state. Paste the final summary lines (tests passed/failed counts; eval Precision/Recall and TP/FP/FN).
- [ ] Run `node bin/reinhardt.js scan evals/fixtures/leaky-security-web --json | grep -c AKIAIOSFODNN7EXAMPLE` → `0`.
- [ ] Run `node bin/reinhardt.js owasp LLM01:2026` and `node bin/reinhardt.js rules` and confirm output.
- [ ] `git status` clean; list commits created. Report any rule/data issues found (per Global Constraints) instead of changing data.
