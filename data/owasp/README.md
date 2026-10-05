# OWASP knowledge base

Machine-readable distillation of OWASP standards used by reinhardt to explain findings (`owasp_lookup`) and to map rules (`data/rules.json`) to official IDs.

## Files

One JSON file per standard; the file stem is the standard id.

| Id | Standard | Status |
|----|----------|--------|
| `top10-2025` | OWASP Top 10:2025 | released |
| `asvs-5.0` | Application Security Verification Standard 5.0.0 (chapters + all 70 L1 requirements) | released |
| `proactive-controls-2024` | Top 10 Proactive Controls 2024 | released |
| `api-top10-2023` | API Security Top 10 2023 | released |
| `llm-top10-2026` | Top 10 for LLM Applications 2026 (current) | released |
| `llm-top10-2025` | Top 10 for LLM Applications 2025 (superseded) | released |
| `agentic-top10-2026` | Top 10 for Agentic Applications (ASI) | released |
| `agentic-threats-2025` | Agentic AI Threats and Mitigations T1–T15 | released |
| `ml-top10-2023` | Machine Learning Security Top 10 | draft |
| `mobile-top10-2024` | Mobile Top 10 2024 | released |
| `masvs-2.1` | MASVS v2.1.0 (24 controls) | released |
| `maswe` | Mobile Application Security Weakness Enumeration (partial) | released |
| `nhi-top10-2025` | Non-Human Identities Top 10 2025 | released |
| `cicd-top10` | Top 10 CI/CD Security Risks | released |
| `k8s-top10-2025` | Kubernetes Top 10 2025 | draft |
| `privacy-top10-2021` | Top 10 Privacy Risks v2.0 | archived |
| `client-side-top10` | Client-Side Security Top 10 (local `CSn` labels) | candidate |
| `citizen-dev-top10` | Citizen Development Top 10 (formerly Low-Code/No-Code) | released |
| `desktop-top10-2021` | Desktop App Security Top 10 | released |
| `business-logic-abuse-top10-2025` | Business Logic Abuse Top 10 | released |
| `cheatsheets` | Cheat Sheet Series (37 sheets relevant to vibe-coded stacks) | released |
| `projects` | OWASP project catalog (flagship, production, selected lab) | — |

## Schema

```json
{
  "schema_version": 1, "id": "top10-2025", "name": "…", "edition": "2025",
  "status": "released|draft|candidate|archived|outdated",
  "maturity": "flagship|production|lab|incubator|inactive|unknown",
  "released": "YYYY[-MM[-DD]] or null", "url": "…", "source_notes": "…", "caveats": ["…"],
  "items": [{ "id": "A01:2025", "name": "…", "summary": "…", "prevention": ["…"], "cwe": ["CWE-284"],
              "detection": { "static": ["…"], "review": ["…"] }, "related": ["api-top10-2023:API1:2023"] }]
}
```

References use `<standard-id>:<item-id>`; split on the **first** colon only, because item ids may contain colons (`top10-2025:A01:2025`). Some files add fields (`previous_id`, `legacy_id`, `group`, `mastg_tests`, `l1_requirements`, …).

## Provenance and honesty rules

- Built on 2026-10-05 from OWASP's own sources (GitHub repos behind owasp.org: OWASP/Top10, OWASP/ASVS, OWASP/www-project-*, OWASP/masvs, OWASP/maswe, OWASP/mastg, OWASP/CheatSheetSeries, GenAI-Security-Project/GenAI-LLM-Top10). Exceptions are recorded per file in `caveats`.
- `detection.static` entries are reinhardt's rule ideas, not OWASP text. Cross-standard links marked `(inferred) ` are reinhardt's mappings; unmarked links are official.
- Known errata in OWASP's own text are corrected and noted (e.g. Top 10:2025 A03 lists CWE-447; the intended CWE is 477).
- Empty arrays mean the source was not available, not that nothing applies.

## License

Content in this directory is adapted from OWASP Foundation projects, which are licensed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Accordingly, **the files in `data/owasp/` are licensed CC BY-SA 4.0**, attributed to the OWASP Foundation and the respective project teams, with modifications (paraphrase, condensation, mapping) by reinhardt contributors. The rest of the repository remains MIT. OWASP® is a registered trademark of the OWASP Foundation; reinhardt is not affiliated with or endorsed by OWASP.
