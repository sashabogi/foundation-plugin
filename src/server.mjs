#!/usr/bin/env node
/**
 * Foundation v3 — MCP Server
 *
 * Minimal MCP server providing 5 core tools:
 *   1. demerzel_search    — regex search across codebase snapshot
 *   2. demerzel_find_symbol — find where a symbol is exported
 *   3. demerzel_find_importers — find what files import a given module
 *   4. memory_save        — save to unified memory (Gaia + Open Brain)
 *   5. memory_search      — search unified memory
 *
 * Uses @modelcontextprotocol/sdk with StdioServerTransport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
// Start the server
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`[foundation] MCP server started with 5 tools: demerzel_search, demerzel_find_symbol, demerzel_find_importers, memory_save, memory_search\n`);
