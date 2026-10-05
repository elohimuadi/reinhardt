# Release notes

## 0.2.0

Adds 38 deterministic OWASP-mapped security rules alongside privacy-drift detection, backed by 22 bundled knowledge standards. Scan reports use schema version 2 and include confidence and OWASP/CWE/ASVS/guidance references; recipient baselines remain schema version 1.

New `owasp` and `rules` CLI commands and `owasp_lookup` and `list_rules` MCP tools expose the knowledge layer. The stdio MCP server now uses Node built-ins only. The SDK remains a development dependency for client interoperability tests; runtime dependency installation is unnecessary.

Root Claude Code and Codex plugin manifests package six skills. Claude Code receives a SessionStart guidance hook; Codex uses its config.toml route or the PATH-based plugin transport. The old `plugin/` layout is removed. Real host installation and workflow behavior remain untested.

The test suite executes every supplied rule vector, checks deterministic reports and credential non-disclosure, and exercises raw protocol recovery. Evals cover six labelled fixtures. Pattern matches require verification and do not establish runtime behavior.

Code remains MIT. OWASP-derived files under `data/owasp/` are CC BY-SA 4.0; see their README for attribution and caveats.

Static, heuristic analysis; not legal advice and not a certification. Findings require human verification.
