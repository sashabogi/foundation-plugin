#!/usr/bin/env node
/**
 * Foundation v3 — SessionStart hook
 *
 * On session start: loads project context from Gaia, checks for
 * .foundation/snapshot.txt, outputs system-reminder with project status.
 *
 * Reads JSON from stdin (Claude Code passes context this way).
 * Outputs JSON to stdout with hookSpecificOutput.
 * Debug logging goes to stderr (never stdout).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { search as gaiaSearch, getRecent as gaiaGetRecent, closeStorage } from "../src/memory/gaia.mjs";

/**
 * Read all of stdin as a string.
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    // If stdin is already closed or empty, resolve after a short timeout
    setTimeout(() => resolve(data), 100);
  });
}

let additionalContext = "";

try {
  const raw = await readStdin();
  const input = raw ? JSON.parse(raw) : {};
  const source = input.source ?? "startup";
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  process.stderr.write(`[foundation] SessionStart source=${source} project=${projectDir}\n`);

  // Check for .foundation/snapshot.txt in project directory
  const snapshotPath = join(projectDir, ".foundation", "snapshot.txt");
  if (existsSync(snapshotPath)) {
    try {
      const snapshot = readFileSync(snapshotPath, "utf-8");
      const lines = snapshot.split("\n").length;
      additionalContext += `<foundation-context>\n`;
      additionalContext += `<snapshot-available path="${snapshotPath}" lines="${lines}" />\n`;
      additionalContext += `Demerzel codebase snapshot is available. Use Foundation MCP tools (demerzel_search, demerzel_find_symbol, etc.) for codebase queries before reading files directly.\n`;
      additionalContext += `</foundation-context>\n`;
    } catch {
      // Snapshot exists but unreadable — skip
    }
  }

  // Load recent project memories from Gaia
  try {
    const results = gaiaGetRecent({
      tiers: ['project', 'global'],
      limit: 5,
      project_path: projectDir,
    });
    if (results.length > 0) {
      additionalContext += `<foundation-memories count="${results.length}">\n`;
      additionalContext += `Recent project memories loaded from Gaia.\n`;
      for (const r of results) {
        const tags = r.memory.tags.join(', ');
        const snippet = r.memory.content.substring(0, 200);
        additionalContext += `- [${r.memory.tier}] ${snippet}${r.memory.content.length > 200 ? '...' : ''} (tags: ${tags})\n`;
      }
      additionalContext += `</foundation-memories>\n`;
    }
  } catch (err) {
    process.stderr.write(`[foundation] Gaia search failed: ${err?.message}\n`);
  }

  // Check for handoff documents
  const handoffDir = join(projectDir, '.foundation', 'handoffs');
  if (existsSync(handoffDir)) {
    try {
      const files = readdirSync(handoffDir).filter(f => f.endsWith('.md')).sort().reverse();
      if (files.length > 0) {
        const latest = readFileSync(join(handoffDir, files[0]), 'utf-8');
        const preview = latest.substring(0, 500);
        additionalContext += `<foundation-handoff file="${files[0]}">\n${preview}\n</foundation-handoff>\n`;
      }
    } catch { /* skip */ }
  }

} catch (err) {
  process.stderr.write(`[foundation] SessionStart error: ${err?.message || err}\n`);
}

// Output hook response
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
}));

closeStorage();
process.exit(0);
