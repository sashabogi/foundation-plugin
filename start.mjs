#!/usr/bin/env node
/**
 * Foundation Claude Code plugin — MCP bootstrap
 *
 * This file is intentionally thin. ALL tool implementations live in
 * @sashabogi/foundation on npm. The plugin's only job is to import and
 * run that package's startServer() so Claude Code gets the full server.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Preserve the caller's cwd as CLAUDE_PROJECT_DIR (same pattern as before)
const originalCwd = process.cwd();
if (!process.env.CLAUDE_PROJECT_DIR) {
  process.env.CLAUDE_PROJECT_DIR = originalCwd;
}
process.chdir(__dirname);

// First-run bootstrap: install @sashabogi/foundation into the plugin cache dir
const foundationPkgDir = resolve(__dirname, "node_modules", "@sashabogi", "foundation");
if (!existsSync(foundationPkgDir)) {
  process.stderr.write("[foundation-plugin] First run — installing @sashabogi/foundation...\n");
  try {
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
      cwd: __dirname,
      stdio: "inherit",
      timeout: 300000, // 5 min — native deps (better-sqlite3, @mongodb-js/zstd) can be slow
    });
    process.stderr.write("[foundation-plugin] Install complete.\n");
  } catch (err) {
    process.stderr.write(`[foundation-plugin] Install failed: ${err.message}\n`);
    process.stderr.write("[foundation-plugin] Try running 'npm install' manually in " + __dirname + "\n");
    process.exit(1);
  }
}

// Version sanity check — log the pairing so drift is debuggable
try {
  const pluginPkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));
  const fdnPkg = JSON.parse(readFileSync(resolve(foundationPkgDir, "package.json"), "utf-8"));
  process.stderr.write(
    `[foundation-plugin] plugin=${pluginPkg.version} foundation=${fdnPkg.version}\n`
  );
} catch (err) {
  process.stderr.write(`[foundation-plugin] Version probe failed: ${err.message}\n`);
}

// Delegate to the real Foundation MCP server — one source of truth
const { startServer } = await import("@sashabogi/foundation");
await startServer();
