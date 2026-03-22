#!/usr/bin/env node
/**
 * Foundation v3 — PostToolUse hook
 *
 * After tool use: reads stdin for tool result, appends lightweight
 * event to session JSONL log for SessionEnd to checkpoint.
 *
 * Reads JSON from stdin with: tool_name, tool_input, tool_response
 * Must be fast (<20ms). No database imports, no network.
 * Debug logging goes to stderr (never stdout).
 */

import { appendFileSync } from "node:fs";

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
  const toolName = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};

  process.stderr.write(`[foundation] PostToolUse tool=${toolName}\n`);

  // Append to session JSONL log for SessionEnd to read
  const sessionLogPath = `/tmp/foundation-session-${process.ppid}.jsonl`;

  // Extract file path from tool input (for Edit, Write, Read)
  let file = null;
  if (toolInput.file_path) file = toolInput.file_path;
  else if (toolInput.path) file = toolInput.path;

  // Only log significant tools
  const trackTools = ['Edit', 'Write', 'Bash', 'Agent', 'Read', 'Grep', 'Glob'];
  if (trackTools.includes(toolName)) {
    try {
      const entry = JSON.stringify({
        tool: toolName,
        ts: Date.now(),
        ...(file && (toolName === 'Edit' || toolName === 'Write') ? { file } : {}),
      });
      appendFileSync(sessionLogPath, entry + '\n');
    } catch {
      // Non-critical — skip silently
    }
  }

} catch (err) {
  process.stderr.write(`[foundation] PostToolUse error: ${err?.message || err}\n`);
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
  },
}));

process.exit(0);
