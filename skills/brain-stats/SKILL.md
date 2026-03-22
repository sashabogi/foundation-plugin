---
name: brain-stats
description: |
  Show unified memory statistics from Gaia and Open Brain.
  Displays total memories, tier breakdown, top topics, and more.
  Trigger: /foundation:brain-stats
user-invocable: true
---

# Brain Stats

Show unified memory statistics.

## Instructions

### 1. Gaia Local Stats

Use the Bash tool to query `~/.foundation/gaia-memory.db` with sqlite3:

```bash
sqlite3 ~/.foundation/gaia-memory.db <<'SQL'
.mode column
.headers on
-- Total memories
SELECT COUNT(*) AS total_memories FROM memories;
-- By tier
SELECT tier, COUNT(*) AS count FROM memories GROUP BY tier;
-- Top 10 tags
SELECT value AS tag, COUNT(*) AS cnt FROM memories, json_each(memories.tags) GROUP BY value ORDER BY cnt DESC LIMIT 10;
-- Total links
SELECT COUNT(*) AS total_links FROM memory_links;
-- DB file size
SELECT page_count * page_size AS db_size_bytes FROM pragma_page_count(), pragma_page_size();
-- Date range
SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest FROM memories;
SQL
```

### 2. dev-infra Rescued Memories

Check if `~/.dev-infra/memory.db` exists, and if so query it:

```bash
if [ -f ~/.dev-infra/memory.db ]; then
  sqlite3 ~/.dev-infra/memory.db <<'SQL'
.mode column
.headers on
SELECT COUNT(*) AS rescued_total FROM memories;
SELECT category, COUNT(*) AS count FROM memories GROUP BY category;
SQL
else
  echo "No dev-infra memory DB found — skipping."
fi
```

### 3. Open Brain Cloud Stats

Use the Bash tool with curl to fetch cloud stats:

```bash
curl -s -X POST "$OPEN_BRAIN_URL" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"stats\",\"key\":\"$OPEN_BRAIN_KEY\"}"
```

### 4. Connectivity Test

Call `mcp__plugin_foundation_foundation__memory_search` with query "test" to verify both local and cloud stores respond.

### 5. Present Combined Results

Display a formatted table showing:

| Store | Metric | Value |
|-------|--------|-------|
| **Gaia** | Total memories | (from step 1) |
| **Gaia** | By tier | session / project / global counts |
| **Gaia** | Top tags | top 10 tag names + counts |
| **Gaia** | Links | total link count |
| **Gaia** | DB size | human-readable file size |
| **Gaia** | Date range | earliest to latest |
| **dev-infra** | Rescued memories | total + by category (if exists) |
| **Open Brain** | Thoughts | count from cloud |
| **Open Brain** | Sync status | healthy / unreachable |
| **Combined** | Total across all stores | sum of all |
