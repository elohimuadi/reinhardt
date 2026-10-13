# Development and validation

[Installation and quickstart](../README.md)

Install development dependencies with `npm ci` before running the commands below.

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

Each category defines `severity`, `generic_terms`, and a plain-English `purpose`. Keep data and output ordering stable, add focused regression tests, and run both commands above. Never add legal assurances or treat catalog data types as verified collection. Code is MIT; OWASP-derived data is CC BY-SA 4.0 as described above. Agents must follow the read-only knowledge ownership boundaries in [AGENTS.md](../AGENTS.md).

## Roadmap

- Android/Gradle dependency detection.
- An opt-in runtime mode that records real third-party requests.
- Consent-gating verification, including initialization order and denied-consent paths.
- More fixtures, provider-specific configuration checks, and host integration tests.

Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.
