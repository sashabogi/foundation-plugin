---
name: remember
description: |
  Save information to unified memory (local Gaia FTS5 + cloud Open Brain pgvector).
  Supports tiered storage: session, project, or global scope.
  Trigger: /foundation:remember
user-invocable: true
---

# Remember

Save information to unified memory.

## Instructions

1. Accept the content the user wants to remember. If not provided, ask what they want to save.
2. Determine the appropriate tier:
   - **session** — ephemeral, only relevant to this coding session
   - **project** — relevant to the current project across sessions
   - **global** — relevant across all projects (personal preferences, patterns, credentials references)
3. Call `mcp__foundation__memory_save` with the content, tier, and any relevant tags.
4. Confirm what was saved, the tier it was stored in, and any tags applied.
5. If Open Brain cloud sync is configured, note that the memory will also be available via semantic search.
