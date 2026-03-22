#!/usr/bin/env node
/**
 * Foundation v3 — SessionEnd hook
 *
 * On session end: auto-checkpoints session state to Gaia.
 *
 * Reads JSON from stdin (Claude Code passes context this way).
 * Debug logging goes to stderr (never stdout).
 */

import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { save as gaiaSave, closeStorage } from "../src/memory/gaia.mjs";

/**
 * Read all of stdin as a string.
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 100);
  });
}

try {
  const raw = await readStdin();
  const input = raw ? JSON.parse(raw) : {};

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  process.stderr.write(`[foundation] SessionEnd project=${projectDir}\n`);

  // Read session log written by PostToolUse
  const sessionLogPath = `/tmp/foundation-session-${process.ppid}.jsonl`;
  let toolEvents = [];
  if (existsSync(sessionLogPath)) {
    try {
      const lines = readFileSync(sessionLogPath, 'utf-8').split('\n').filter(Boolean);
      toolEvents = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { /* skip */ }
  }

  // Summarize the session
  const filesChanged = [...new Set(toolEvents.filter(e => e.file).map(e => e.file))];
  const toolsUsed = [...new Set(toolEvents.map(e => e.tool))];
  const duration = toolEvents.length > 1
    ? ((toolEvents[toolEvents.length - 1].ts - toolEvents[0].ts) / 1000 / 60).toFixed(1)
    : '0';

  // Save checkpoint to Gaia
  if (toolEvents.length > 0) {
    try {
      const content = [
        `Session checkpoint — ${new Date().toISOString()}`,
        `Project: ${projectDir}`,
        `Duration: ~${duration} min`,
        `Tools used: ${toolsUsed.join(', ')}`,
        filesChanged.length > 0 ? `Files changed: ${filesChanged.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      gaiaSave({
        tier: 'session',
        content,
        tags: ['checkpoint', 'auto'],
        session_id: `session-${process.ppid}`,
        project_path: projectDir,
      });
      process.stderr.write(`[foundation] Session checkpoint saved (${toolEvents.length} events, ${filesChanged.length} files)\n`);
    } catch (err) {
      process.stderr.write(`[foundation] Checkpoint save failed: ${err?.message}\n`);
    }
  }

  // Clean up temp file
  try { if (existsSync(sessionLogPath)) unlinkSync(sessionLogPath); } catch { /* skip */ }

} catch (err) {
  process.stderr.write(`[foundation] SessionEnd error: ${err?.message || err}\n`);
}

// Output hook response
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionEnd",
  },
}));

// Close Gaia storage and exit cleanly
closeStorage();
process.exit(0);
