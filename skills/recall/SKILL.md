---
name: recall
description: |
  Search memory using both keyword (FTS5) and semantic (pgvector) search.
  Merges results from local Gaia and cloud Open Brain.
  Trigger: /foundation:recall
user-invocable: true
---

# Recall

Search unified memory across local and cloud stores.

## Instructions

1. Accept the search query from the user. If not provided, ask what they want to find.
2. Call `mcp__foundation__memory_search` with the query.
3. Present the merged and ranked results clearly:
   - Show the memory content, tier (session/project/global), source (gaia/open-brain), and relevance score.
   - Group by relevance, not by source.
4. If no results found, suggest broadening the query or using different keywords.
