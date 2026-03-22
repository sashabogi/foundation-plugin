---
name: snapshot
description: |
  Generate a Demerzel codebase snapshot with import/export graphs and symbol index.
  Creates .foundation/snapshot.txt in the project directory.
  Trigger: /foundation:snapshot
user-invocable: true
---

# Codebase Snapshot

Generate a Demerzel codebase snapshot for the current project.

## Instructions

1. Call the `mcp__foundation__demerzel_snapshot` MCP tool with the current project directory.
2. Report the summary: number of files indexed, imports mapped, exports found, and symbols cataloged.
3. Confirm the snapshot was saved to `.foundation/snapshot.txt`.
4. Remind the user they can now use `demerzel_search`, `demerzel_find_symbol`, and `demerzel_find_importers` for fast codebase queries.
