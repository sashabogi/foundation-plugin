#!/usr/bin/env node
/**
 * Foundation v3 — MCP Server
 *
 * Minimal MCP server providing 7 core tools:
 *   1. demerzel_search    — regex search across codebase snapshot
 *   2. demerzel_find_symbol — find where a symbol is exported
 *   3. demerzel_find_importers — find what files import a given module
 *   4. memory_save        — save to unified memory (Gaia + Open Brain)
 *   5. memory_search      — search unified memory
 *   6. demerzel_execute   — run code/commands in a subprocess sandbox
 *   7. demerzel_fetch     — fetch a URL and return clean text content
 *
 * Uses @modelcontextprotocol/sdk with StdioServerTransport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "node:child_process";

// Demerzel — codebase intelligence (zero AI cost)
import { regexSearch, findFiles, findSymbol, findImporters, getDeps, getContext } from './demerzel/search.mjs';

// Memory — unified Gaia (local SQLite FTS5) + Open Brain (cloud pgvector)
import { remember, recall, stats as memoryStats } from './memory/unified.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Create the MCP server
const server = new McpServer({
  name: "foundation",
  version: "3.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: demerzel_search — regex pattern search across snapshot
// ---------------------------------------------------------------------------
server.tool(
  "demerzel_search",
  "Regex pattern search across the codebase snapshot. FREE — no tokens consumed beyond results.",
  {
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().optional().describe("Restrict search to files matching this glob pattern"),
    max_results: z.number().optional().default(20).describe("Maximum number of results to return"),
  },
  async ({ pattern, path, max_results }) => {
    try {
      const result = regexSearch(projectDir, pattern, {
        caseInsensitive: true,
        maxResults: max_results,
      });

      return {
        content: [{
          type: "text",
          text: result.count > 0
            ? JSON.stringify(result, null, 2)
            : `No matches found for pattern: ${pattern}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: demerzel_find_symbol — find where a symbol is exported
// ---------------------------------------------------------------------------
server.tool(
  "demerzel_find_symbol",
  "Find where a symbol (function, class, type, variable) is exported. FREE — no tokens consumed.",
  {
    symbol: z.string().describe("Symbol name to search for (function, class, type, or variable name)"),
  },
  async ({ symbol }) => {
    try {
      const result = findSymbol(projectDir, symbol);

      return {
        content: [{
          type: "text",
          text: result.count > 0
            ? JSON.stringify(result, null, 2)
            : `Symbol "${symbol}" not found in exports. Try demerzel_search for a broader search.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: demerzel_find_importers — find what files import a given module
// ---------------------------------------------------------------------------
server.tool(
  "demerzel_find_importers",
  "Find all files that import a given module or file. FREE — no tokens consumed.",
  {
    module: z.string().describe("Module name or file path to find importers of"),
  },
  async ({ module }) => {
    try {
      const result = findImporters(projectDir, module);

      return {
        content: [{
          type: "text",
          text: result.count > 0
            ? JSON.stringify(result, null, 2)
            : `No files found importing "${module}".`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 4: memory_save — save to unified memory
// ---------------------------------------------------------------------------
server.tool(
  "memory_save",
  "Save content to unified memory. Stores in local Gaia (FTS5) and optionally syncs to Open Brain (pgvector).",
  {
    content: z.string().describe("The content to remember"),
    tier: z.enum(["session", "project", "global", "note", "observation"]).default("project").describe("Memory tier: session (ephemeral), project (cross-session), global (cross-project), note, observation"),
    tags: z.array(z.string()).optional().describe("Tags for categorization and retrieval"),
    type: z.enum(["decision", "observation", "fact", "pattern", "note"]).default("note").describe("Type of memory"),
  },
  async ({ content, tier, tags, type }) => {
    try {
      const result = await remember(content, {
        tier,
        tags: tags || [],
        project_path: projectDir,
        metadata: { type },
        source: 'foundation-plugin',
        cloudSync: true,
      });

      process.stderr.write(`[foundation] memory_save: id=${result.gaia.id} tier=${tier} type=${type}\n`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            saved: true,
            id: result.gaia.id,
            tier,
            type,
            tags: tags || [],
            stores: {
              gaia: { status: "saved", id: result.gaia.id },
              open_brain: result.openbrain
                ? { status: result.openbrain.success ? "synced" : "failed", error: result.openbrain.error }
                : { status: "skipped" },
            },
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error saving memory: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 5: memory_search — search unified memory
// ---------------------------------------------------------------------------
server.tool(
  "memory_search",
  "Search unified memory using keyword (FTS5) and semantic (pgvector) search. Merges and ranks results.",
  {
    query: z.string().describe("Search query — supports natural language and keywords"),
    tier: z.enum(["session", "project", "global", "all"]).default("all").describe("Restrict search to a specific tier, or search all"),
    limit: z.number().optional().default(10).describe("Maximum number of results"),
  },
  async ({ query, tier, limit }) => {
    try {
      const tiers = tier === "all" ? undefined : [tier];

      const result = await recall(query, {
        tiers,
        limit,
        context: { project_path: projectDir },
        cloudSearch: true,
      });

      process.stderr.write(`[foundation] memory_search: query="${query}" tier=${tier} gaia=${result.gaiaCount} openbrain=${result.openbrainCount}\n`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            tier,
            total: result.results.length,
            sources: {
              gaia_fts5: { count: result.gaiaCount },
              open_brain_pgvector: { count: result.openbrainCount },
            },
            results: result.results.map(r => ({
              id: r.memory.id,
              tier: r.memory.tier,
              content: r.memory.content,
              tags: r.memory.tags,
              score: Math.round(r.score * 1000) / 1000,
              source: r.source || 'gaia',
              created_at: r.memory.created_at,
            })),
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error searching memory: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Helper: smart truncate large output
// ---------------------------------------------------------------------------
function smartTruncate(text, maxBytes, headBytes, tailBytes) {
  if (!text || text.length <= maxBytes) return { text, truncated: false, originalSize: text?.length || 0 };
  const head = text.slice(0, headBytes);
  const tail = text.slice(-tailBytes);
  const skipped = text.length - headBytes - tailBytes;
  return {
    text: `${head}\n\n... [truncated ${skipped} bytes] ...\n\n${tail}`,
    truncated: true,
    originalSize: text.length,
  };
}

// ---------------------------------------------------------------------------
// Tool 6: demerzel_execute — run code/commands in a subprocess sandbox
// ---------------------------------------------------------------------------
server.tool(
  "demerzel_execute",
  "Run code or shell commands in a subprocess sandbox. Captures stdout/stderr. Supports shell, javascript, and python.",
  {
    language: z.enum(["shell", "javascript", "python"]).describe("Language to execute: shell, javascript, or python"),
    code: z.string().describe("The code or command to run"),
    timeout: z.number().optional().default(30000).describe("Max execution time in milliseconds (default 30000)"),
  },
  async ({ language, code, timeout }) => {
    try {
      const cmds = {
        shell: ["bash", ["-c", code]],
        javascript: ["node", ["-e", code]],
        python: ["python3", ["-c", code]],
      };

      const [cmd, args] = cmds[language];

      const result = await new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let killed = false;

        const proc = spawn(cmd, args, {
          cwd: projectDir,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        const timer = setTimeout(() => {
          killed = true;
          proc.kill("SIGKILL");
        }, timeout);

        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        proc.on("close", (exitCode) => {
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: killed ? null : exitCode,
            timedOut: killed,
          });
        });

        proc.on("error", (err) => {
          clearTimeout(timer);
          resolve({
            stdout,
            stderr: stderr + `\nSpawn error: ${err.message}`,
            exitCode: 1,
            timedOut: false,
          });
        });
      });

      const MAX_BYTES = 10240; // 10KB
      const HEAD = 2048;
      const TAIL = 2048;
      const outTrunc = smartTruncate(result.stdout, MAX_BYTES, HEAD, TAIL);
      const errTrunc = smartTruncate(result.stderr, MAX_BYTES, HEAD, TAIL);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: outTrunc.text,
            stderr: errTrunc.text,
            truncated: outTrunc.truncated || errTrunc.truncated,
            originalSize: { stdout: outTrunc.originalSize, stderr: errTrunc.originalSize },
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error executing ${language}: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 7: demerzel_fetch — fetch a URL and return clean text content
// ---------------------------------------------------------------------------
server.tool(
  "demerzel_fetch",
  "Fetch a URL and return clean text content. Strips HTML to readable text, pretty-prints JSON, passes through plain text.",
  {
    url: z.string().describe("URL to fetch"),
    source: z.string().optional().describe("Label for the content source"),
  },
  async ({ url, source }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Foundation/3.0 (MCP Tool)" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              status: response.status,
              statusText: response.statusText,
              url,
            }, null, 2),
          }],
          isError: true,
        };
      }

      const contentType = response.headers.get("content-type") || "text/plain";
      const raw = await response.text();
      let content;

      if (contentType.includes("json")) {
        // Pretty-print JSON
        try {
          content = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          content = raw;
        }
      } else if (contentType.includes("html")) {
        // Strip HTML to clean text
        content = raw
          // Remove script, style, nav, header, footer blocks entirely
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[\s\S]*?<\/nav>/gi, "")
          .replace(/<header[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[\s\S]*?<\/footer>/gi, "")
          // Remove all remaining HTML tags
          .replace(/<[^>]+>/g, " ")
          // Decode common HTML entities
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
          // Collapse whitespace
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n/g, "\n\n")
          .trim();
      } else {
        content = raw;
      }

      const MAX_BYTES = 20480; // 20KB
      const HEAD = 5120;
      const TAIL = 5120;
      const trunc = smartTruncate(content, MAX_BYTES, HEAD, TAIL);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            url,
            source: source || undefined,
            contentType,
            bytesFetched: raw.length,
            truncated: trunc.truncated,
            content: trunc.text,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error fetching ${url}: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`[foundation] MCP server started with 7 tools: demerzel_search, demerzel_find_symbol, demerzel_find_importers, memory_save, memory_search, demerzel_execute, demerzel_fetch\n`);
