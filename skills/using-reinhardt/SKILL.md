---
name: using-reinhardt
description: Use when starting any session in a repository where reinhardt is installed - establishes when reinhardt's security and privacy skills must run while building, before shipping, and after dependency changes
---

<SUBAGENT-STOP>
If you were dispatched as a subagent for a narrow task (for example `reinhardt:finding-verifier`), ignore this skill and follow your own instructions.
</SUBAGENT-STOP>

# Using reinhardt

reinhardt watches the two things AI-built apps most often get wrong: **who receives user data** (privacy drift) and **the handful of security defaults that get apps breached** (secrets on the client, data without access control, untrusted input reaching something that executes). It pairs a deterministic scanner with the skills below. The scanner finds leads; you verify them.

## The Rule

**When your work touches any of these, invoke the matching skill before writing the code:**

| You are about to... | Invoke |
|---|---|
| write or change auth, database access, Supabase/Firebase rules, env vars, LLM calls, uploads, fetches, redirects, iOS storage/networking, CI workflows | `reinhardt:secure-by-default` |
| add, remove or upgrade a dependency (package.json, requirements.txt, Podfile, Package.swift) | `reinhardt:privacy-drift-watch` (after the change) |
| answer "is this safe to ship?", review security, or prepare a launch | `reinhardt:launch-check` |
| fix a reinhardt finding | `reinhardt:security-fix` or `reinhardt:privacy-fix` |

Announce "Using reinhardt:<skill> to <purpose>" and follow it.

## What the hooks will do

- After you edit files, reinhardt may add a short note listing **new findings in the files you just changed**, or **new data recipients** after a dependency change. Treat that note as a lead: open the file:line, verify, then fix or explain. Never ignore it silently.
- When you try to finish a turn with **unaddressed high-severity findings in files you edited**, reinhardt will ask you once to address them. Fix them, or tell the user plainly why each one is a false positive. Do not rename, move or suppress code to make a rule stop matching.

## Red Flags

| Thought | Reality |
|---|---|
| "It's just a prototype" | Prototypes get deployed with the anon key and no RLS. Apply secure-by-default anyway. |
| "The scanner found nothing, so it's fine" | Zero findings is not evidence of safety. Say what was and wasn't checked. |
| "I'll put the key in NEXT_PUBLIC_ for now" | That ships it to every visitor. Server route, now. |
| "The user didn't ask about privacy" | A new analytics or AI SDK is a new data recipient. Tell them. |
| "I'll fix the finding by moving the code" | That's gaming the scanner. Fix the behavior. |

Never describe an app as secure, safe or compliant.
