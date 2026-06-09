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
import { join, dirname, extname } from "node:path";
import { save as gaiaSave, closeStorage } from "../src/memory/gaia.mjs";

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs", ".swift", ".sql", ".rb", ".java", ".kt"]);

/**
 * Seldon — closeout doc-currency check (non-blocking). For each changed CODE file,
 * find the nearest AGENTS.md walking up to the repo root; if it exists but was NOT
 * among the changed files, that area's local docs may be stale. Returns the paths.
 */
function docCurrencyWarnings(filesChanged, projectDir) {
  const changed = new Set(filesChanged.map(f => (f.startsWith("/") ? f : join(projectDir, f))));
  const stale = new Map();
  for (const f of changed) {
    if (!CODE_EXT.has(extname(f))) continue;
    let dir = dirname(f);
    for (let i = 0; i < 6; i++) {
      const a = join(dir, "AGENTS.md");
      if (existsSync(a)) { if (!changed.has(a)) stale.set(a, true); break; }
      if (existsSync(join(dir, ".git"))) break;
      const parent = dirname(dir);
      if (parent === dir || dir === projectDir) break;
      dir = parent;
    }
  }
  return [...stale.keys()];
}

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

  // Seldon — closeout doc-currency check (non-blocking)
  let docWarnings = [];
  try {
    docWarnings = docCurrencyWarnings(filesChanged, projectDir);
    if (docWarnings.length > 0) {
      process.stderr.write(`[foundation] Closeout: code changed under ${docWarnings.length} AGENTS.md area(s) not updated — consider refreshing: ${docWarnings.join(', ')}\n`);
    }
  } catch { /* skip */ }

  // Save checkpoint to Gaia
  if (toolEvents.length > 0) {
    try {
      const content = [
        `Session checkpoint — ${new Date().toISOString()}`,
        `Project: ${projectDir}`,
        `Duration: ~${duration} min`,
        `Tools used: ${toolsUsed.join(', ')}`,
        filesChanged.length > 0 ? `Files changed: ${filesChanged.join(', ')}` : '',
        docWarnings.length > 0 ? `⚠️ Doc-currency: code changed under these AGENTS.md areas without updating them — ${docWarnings.join(', ')}` : '',
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

// SessionEnd has no valid hookSpecificOutput variant — exit cleanly
closeStorage();
process.exit(0);
