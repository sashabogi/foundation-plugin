#!/usr/bin/env node
/**
 * Foundation v3 — PreToolUse hook
 *
 * Before tool use: reads stdin for tool info, can inject context
 * or suggest using Foundation tools instead of raw file reads.
 *
 * Reads JSON from stdin with: tool_name, tool_input
 * Outputs JSON to stdout with hookSpecificOutput (additionalContext).
 * Debug logging goes to stderr (never stdout).
 *
 * PERF: Must be <100ms. NO database imports, NO network.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

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

let additionalContext = "";

try {
  const raw = await readStdin();
  const input = raw ? JSON.parse(raw) : {};
  const toolName = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};

  process.stderr.write(`[foundation] PreToolUse tool=${toolName}\n`);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const hasSnapshot = existsSync(join(projectDir, '.foundation', 'snapshot.txt'));

  // Nudge toward Demerzel for broad exploration when snapshot is available
  const explorationTools = ['Read', 'Grep', 'Glob'];
  if (hasSnapshot && explorationTools.includes(toolName)) {
    const isExploration = toolName === 'Glob' ||
      (toolName === 'Grep' && !toolInput.path) ||
      (toolName === 'Read' && toolInput.file_path?.includes('*'));

    if (isExploration) {
      additionalContext += `<foundation-tip>Foundation snapshot available. Consider using demerzel_search or demerzel_find_symbol for faster codebase exploration.</foundation-tip>\n`;
    }
  }

  // Inject snapshot path hint for sub-agent dispatch
  if (toolName === 'Agent' || toolName === 'Task') {
    if (hasSnapshot) {
      additionalContext += `<foundation-tip>Codebase snapshot available at ${join(projectDir, '.foundation', 'snapshot.txt')} — instruct subagents to read it for context.</foundation-tip>\n`;
    }
  }

} catch (err) {
  process.stderr.write(`[foundation] PreToolUse error: ${err?.message || err}\n`);
}

// Output hook response
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext,
  },
}));

process.exit(0);
