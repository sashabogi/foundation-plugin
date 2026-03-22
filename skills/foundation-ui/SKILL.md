---
name: foundation-ui
description: |
  Launch the Foundation dashboard UI in the browser.
  Starts the local server on port 3333 showing Demerzel snapshots, Gaia memories, and session history.
  Trigger: /foundation:foundation-ui
user-invocable: true
---

# Foundation UI

Launch the Foundation dashboard.

## Instructions

1. Start the Foundation UI server via Bash:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/ui/server.mjs &
   ```
   This runs the server in the background on port 3333.
2. The dashboard will be available at http://localhost:3333.
3. Report the status — whether the server started successfully.
4. The UI provides tabs for:
   - **Analysis/Graph/Files/Search** — Demerzel codebase snapshots
   - **Brain** — Unified memory explorer (Gaia FTS5 + Open Brain semantic search)
   - **Sessions** — Session checkpoint history with timeline view
