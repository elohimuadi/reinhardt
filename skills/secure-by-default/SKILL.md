---
name: secure-by-default
description: Use when writing or changing code that touches authentication, database access, secrets or environment variables, LLM/model calls, file uploads, outbound fetches, redirects, iOS storage or networking, CI workflows, or adding a dependency - the defaults vibe-coded apps most often get wrong, distilled from OWASP
---

# Secure by Default

## Overview

AI-generated apps rarely fail on exotic bugs. They fail on a handful of defaults: secrets on the client, data with no access control, and model or user input flowing into something that executes. Apply these rules while you write the code, then run reinhardt's `scan_repo` before you say you are done.

## The Rules

**1. The server decides; the client asks.** (`A01:2025`, `API1:2023`, Proactive Control `C1`)
Every read or write of a user's data checks ownership on the server: in the route handler, server action, Edge Function, RLS policy or Firebase rule. Middleware alone is not authorization. Supabase: every new table gets `enable row level security` plus owner-scoped policies in the same migration. Firebase: rules compare `request.auth.uid` with the document owner.

**2. Secrets never ship.** (`NHI2:2025`, `A04:2025`, `LLM02:2026`)
Nothing secret goes in `NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_`, `REACT_APP_` variables, Swift source, or committed files. Model-provider calls happen on the server; never set `dangerouslyAllowBrowser`. Supabase `service_role`/`sb_secret_` keys live only in server code.

**3. Input is data, never code.** (`A05:2025`, `C3`)
Parameterized SQL; `execFile` with argument arrays; no `eval`/`new Function`; text via `textContent` or framework bindings, and sanitize with DOMPurify before any raw-HTML sink. Allow-list URLs you fetch (`C10`) and redirect targets.

**4. Model output is untrusted input.** (`LLM10:2026`, `LLM03:2026`, `ASI05`)
Treat completions exactly like user input under rule 3. Agent tools get the least privilege that works, and side-effecting tools need user approval. Cap output tokens, steps and spend (`LLM06:2026`). Keep secrets and other users' data out of prompts (`LLM08:2026`).

**5. Accept only the fields you expect.** (`API3:2023`)
Validate request bodies with a schema and copy allow-listed fields; never `create(req.body)`. Return only the fields the client needs.

**6. Sessions and crypto use the boring, correct tool.** (`A07:2025`, `A04:2025`)
Use the auth provider's session handling. Cookies are `HttpOnly; Secure; SameSite`. Tokens are not stored in `localStorage` or `AsyncStorage` (use `expo-secure-store` / Keychain). Random values for security come from `crypto.randomBytes`/`randomUUID`. Passwords use Argon2id or bcrypt cost ≥ 10, or better, the auth provider. Verify JWTs with a pinned algorithm.

**7. Fail closed.** (`A10:2025`)
An exception in an auth or permission check denies the request. Don't return stack traces to clients.

**8. iOS specifics.** (`M5`, `M9`, `MASVS-STORAGE-1`, `MASVS-NETWORK-1`)
Keychain for tokens, not `UserDefaults`/`@AppStorage`. No `NSAllowsArbitraryLoads`. Never answer a trust challenge without `SecTrustEvaluateWithError`. Ship a `PrivacyInfo.xcprivacy` declaring required-reason APIs and collected data.

**9. Dependencies and pipelines are code you run.** (`A03:2025`, `CICD-SEC-3`, `CICD-SEC-4`)
Before adding a package, confirm it exists, is the intended one, and is maintained (AI-suggested names can be fake). Commit the lockfile. Pin third-party GitHub Actions to a commit SHA, set `permissions: contents: read`, pass event text through `env:`, and never check out PR code in `pull_request_target`. Pin MCP server versions.

**10. Privacy is part of the change.** (`P5`, `P4`, `MASVS-PRIVACY-3`)
A new analytics, ads, replay or AI SDK is a new data recipient: run reinhardt `drift_check` and tell the user before it ships (see `privacy-drift-watch`).

## Before You Say Done

Run `scan_repo` on the app root. Fix or explain every new high finding. When you need the detail behind any ID above, call `owasp_lookup` instead of relying on memory.
