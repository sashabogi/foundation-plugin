#!/usr/bin/env node
/**
 * Foundation v3 — Bootstrap script
 *
 * Entry point for the Claude Code plugin MCP server.
 * Ensures dependencies are available and starts the server.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const originalCwd = process.cwd();
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

if (!process.env.CLAUDE_PROJECT_DIR) {
  process.env.CLAUDE_PROJECT_DIR = originalCwd;
}

process.stderr.write(`[foundation] Starting Foundation v3 MCP server...\n`);
process.stderr.write(`[foundation] Project dir: ${process.env.CLAUDE_PROJECT_DIR}\n`);

// Ensure dependencies are installed
if (!existsSync(resolve(__dirname, "node_modules"))) {
  try {
    process.stderr.write(`[foundation] Installing dependencies...\n`);
    execFileSync("npm", ["install", "--silent"], {
      cwd: __dirname,
      stdio: "pipe",
      timeout: 120000,
    });
    process.stderr.write(`[foundation] Dependencies installed.\n`);
  } catch (err) {
    process.stderr.write(`[foundation] Failed to install dependencies: ${err.message}\n`);
  }
}

// Graceful shutdown handlers — close Gaia DB on exit
async function shutdown(signal) {
  process.stderr.write(`[foundation] Received ${signal}, shutting down...\n`);
  try {
    const { closeStorage } = await import("./src/memory/gaia.mjs");
    closeStorage();
  } catch {
    // Best effort — gaia may not have been loaded yet
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start the MCP server
try {
  await import("./src/server.mjs");
} catch (err) {
  process.stderr.write(`[foundation] Failed to start server: ${err.message}\n${err.stack}\n`);
  process.exit(1);
}
