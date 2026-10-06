# Repo Gating and Real-World Benchmark Implementation Plan

> **For agentic workers:** Execute task-by-task in order. Each task is red → green → commit. Steps use checkbox (`- [x]`) syntax; tick them as you go. Read `AGENTS.md` first — it is part of this plan.

**Goal:** Make the engine honor the new `repo_any` rule gate and measure reinhardt against pinned real-world repositories instead of only self-authored fixtures.

**Architecture:** `repo_any` is a pre-check in `matchRule` evaluated over the same candidate files the rule engine already receives. The benchmark is developer tooling (`evals/benchmark.js`), not engine code: it may use the network (git clone) and is never run by `npm test`.

**Tech Stack:** Node ≥ 20, ESM, `node:test`, `git` CLI for the benchmark only.

**Spec:** `data/rules.json` (`repo_any_format`, the `supabase-table-without-rls` rule and its vectors, the two new rules `nosql-injection` and `template-autoescape-disabled`, the widened `test_path_regex`), `evals/benchmarks/real-world.json` (`description`, `metrics`, per-repo `findings` and `known_misses`).

## Global Constraints

- Same ownership boundary as before: do not edit `data/**`, `skills/**`, `evals/fixtures/**`, or `evals/benchmarks/real-world.json`. Report rule or label problems instead.
- Engine stays offline and dependency-free. Only `evals/benchmark.js` may spawn `git`.
- Never hardcode the number of rules in tests; derive it from `ruleset.rules.length`.
- Benchmark output must not print matched source text; report `rule file:line` only.

## Review Focus

1. A repository whose candidate files include `package.json` with `@supabase/supabase-js` but whose `.sql` files live outside `supabase/` must still be checked for RLS (text gate), and a Drizzle-only repo must not be (vector `lib/db/migrations/0000_initial.sql`).
2. `repo_any` must be evaluated against *candidate* files (paths and text), including files the rule's own `files` classes would not select (e.g. `package.json` for an `sql`-class rule).
3. A benchmark clone that fails (network, missing commit) must report which repo failed and exit 2, not silently score 0 findings.
4. Unlabelled findings in a benchmark run are a failure (exit 1) with a list to triage; a labelled `tp` that disappears is also a failure. `fp` labels that disappear are reported as improvements, not failures.
5. Cached clones live under `os.tmpdir()/reinhardt-benchmark/<name>-<commit>`; reruns reuse them and never write inside the repository.

---

### Task 1: Honor `repo_any` in the rule engine

**Files:**
- Modify: `src/engine/rules.js`
- Test: `test/rules.test.js` (existing per-vector tests already cover it; they must go from red to green)

**Interfaces:**
- `matchRule(rule, files)` returns `[]` when `rule.repo_any` exists and neither any `repo_any.paths` regex matches any `files[i].path` nor any `repo_any.text` pattern matches any `files[i].text`. Evaluate before class filtering, for every `kind`.

- [x] **Step 1:** `npm test` → confirm the new vectors fail: `supabase-table-without-rls negative #2` (Drizzle repo) and `nosql-injection` / `template-autoescape-disabled` vectors only if they fail; record exactly which fail.
- [x] **Step 2:** Implement the gate (one guard at the top of `matchRule`).
- [x] **Step 3:** Replace any hardcoded rule counts in tests (e.g. 38) with `ruleset.rules.length`. Run `npm test` → 0 failures; `npm run eval` → Precision 1.000, Recall 1.000.
- [x] **Step 4:** `git commit -m "feat: gate rules on repository signals"`


Task 1 validation: baseline had exactly the four expected failures. Added gate coverage failed before implementation. After implementation only the README test remains pending Task 3; eval passes (TP=51).

### Task 2: Real-world benchmark runner

**Files:**
- Create: `evals/benchmark.js`, `.github/workflows/benchmark.yml`
- Modify: `package.json` (`"benchmark": "node evals/benchmark.js"`)
- Test: `test/benchmark.test.js`

**Interfaces:**
- `evals/benchmark.js` exports `compare(labels, findings) => { tp: [], fp: [], unresolved: [], missingTp: [], fixedFp: [], unlabelled: [] }` where `labels` is one repo entry from `real-world.json` and `findings` is `scanRepo(...).findings` filtered to `category === 'security'`, flattened to `{ rule, file, line }`. Match on `rule + file + line`.
- CLI: for each repo, clone with `git clone --filter=blob:none --no-checkout <url> <dir>` then `git -C <dir> checkout <commit>` (skip if cached dir already at that commit), run `scanRepo(dir)`, `compare`, print one block per repo and a summary line `Precision: <tp/(tp+fp)>; TP=… FP=… unresolved=… unlabelled=… missingTP=…` plus each repo's `known_misses` count. Exit 1 if any `unlabelled` or `missingTp`; exit 2 on clone/scan errors; else 0.
- Workflow: `workflow_dispatch` plus weekly `schedule`, `permissions: contents: read`, actions pinned to the same versions as `ci.yml`, runs `npm ci && npm run benchmark`.

- [x] **Step 1: Failing tests** for `compare` only (no network): a tp label present → `tp`; a tp label absent → `missingTp`; an fp label absent → `fixedFp`; an extra finding → `unlabelled`; `unresolved` labels counted separately.
- [x] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm test` PASS. Then run `npm run benchmark` once and paste the summary (expected at labelling time: `TP=61 FP=3 unresolved=3 unlabelled=0 missingTP=0`, precision 0.953).
- [x] **Step 5:** `git commit -m "feat: add pinned real-world benchmark"`


Task 2 validation: comparison tests failed before the module existed, then passed. Full suite has only the Task 3 README failure. Benchmark: Precision: 0.953; TP=61 FP=3 unresolved=3 unlabelled=0 missingTP=0. Initial sandboxed clone failed with exit 2 and named NodeGoat; network-enabled run passed.

### Task 3: Documentation

**Files:**
- Modify: `README.md`, `RELEASE-NOTES.md`, `package.json` + both plugin manifests + MCP `serverInfo` version → `0.3.0`

- [x] **Step 1:** `npm test` → the docs test fails because README lacks `nosql-injection` and `template-autoescape-disabled`.
- [x] **Step 2:** Add both rules to the README rules table; add a "Benchmark" section stating the measured precision with its denominator, that labels were made by one maintainer, that recall is described by `known_misses` rather than a number, and how to run `npm run benchmark`. Add a `0.3.0` release-notes entry (repo gating for Supabase RLS, two new rules, non-production path skipping for vendored/minified/build-tool files, benchmark). Bump versions.
- [x] **Step 3:** `npm test`, `npm run eval` → green.
- [x] **Step 4:** `git commit -m "docs: document benchmark and 0.3.0 rules"`


Task 3 validation: documentation and version expectations failed first; all 209 tests now pass. Eval: Precision: 1.000; Recall: 1.000; TP=51 FP=0 FN=0.

### Task 4: Final verification

- [ ] `npm ci && npm test && npm run eval && npm run benchmark`; paste the summary lines.
- [ ] `git status` clean; push `owasp-knowledge-layer`; list commits.
