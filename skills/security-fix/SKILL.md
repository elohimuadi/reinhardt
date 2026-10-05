---
name: security-fix
description: Use when the user asks to fix a reinhardt security finding - fixes one verified finding at a time at its root cause, proves it with a test or re-scan, and never weakens detection to make a warning disappear
---

# Security Fix

## Overview

A fix is done when the vulnerable behavior is gone, not when the scanner goes quiet.

**Core principle:** Change the behavior, then prove it. Renaming a variable, moving code to a test folder, or adding a suppression comment so a rule stops matching is gaming the scanner, not fixing.

## Process

1. **Verify first.** Read the evidence and its callers (see `security-audit`). Do not fix an unverified finding; if it is a false positive, say why and stop.
2. **Pick the root-cause fix** from the rule's `suggested_fix` and `owasp_lookup` prevention guidance. Preferred patterns:
   - **Secrets:** tell the user to revoke and rotate *before* anything else; then move the value to a server-only env var or secret store. Never print the secret in chat.
   - **Client-exposed keys:** move the call behind a server route that authenticates the user; drop the public prefix.
   - **Supabase/Firebase access:** enable RLS / tighten rules with owner-scoped conditions; ask the user who should be able to read and write each table before writing policies.
   - **Injection:** parameterize (SQL), use argument arrays (processes), sanitize at the sink (HTML), allow-list (URLs, redirects).
   - **Mass assignment:** schema-validate and copy allow-listed fields.
   - **iOS storage/network:** Keychain instead of UserDefaults; remove ATS exceptions; evaluate server trust.
   - **CI:** pin SHAs, pass event text through `env:`, least-privilege `permissions:`.
3. **One finding per change.** Ask for a product decision when the fix changes behavior the user may rely on (who can read data, which origins are allowed).
4. **Prove it.** Add or run a test that exercises the fixed behavior where the app has tests (e.g. another user's id is rejected). Then re-run `scan_repo` with the same path and show the target finding is gone and nothing new appeared.
5. **Report** what changed, the evidence it works, and anything still unresolved (e.g. "key rotated? — needs you").

## Red Flags - STOP

- The fix touches `data/rules.json`, adds an ignore, or renames something only so the pattern stops matching.
- "The scan is clean" is your only evidence.
- You are fixing several findings in one edit.
- You are writing an RLS policy without knowing who should have access.

Never call the app secure or compliant. Include: "Static, heuristic analysis; not legal advice and not a certification."
