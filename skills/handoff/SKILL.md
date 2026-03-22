---
name: handoff
description: |
  Create cross-session handoff document for context transfer.
  Gathers decisions, changes, tasks, and blockers from the current session.
  Trigger: /foundation:handoff
user-invocable: true
---

# Handoff

Create a structured handoff document for the next session.

## Instructions

1. Gather current session state:
   - **Decisions made** — architectural choices, design decisions, trade-offs resolved
   - **Files changed** — what was created, modified, or deleted
   - **Tasks in progress** — what's being worked on, what's blocked
   - **Blockers** — anything preventing progress
   - **Next steps** — what should be done next
2. Call `mcp__foundation__gaia_handoff` with the gathered information.
3. Confirm the handoff document was saved and provide its ID.
4. Remind the user that the next session will automatically load this context via the SessionStart hook.
