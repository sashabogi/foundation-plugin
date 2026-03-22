#!/usr/bin/env node

/**
 * Foundation UI HTTP Server
 *
 * Pure Node.js server that serves the Foundation UI and provides API endpoints
 * for snapshots, memories, and Open Brain search.
 *
 * Usage:
 *   node ui/server.mjs [--port 3333]
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { search, getRecent, stats, closeStorage, getStorage } from '../src/memory/gaia.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const portArg = process.argv.indexOf('--port');
const port = (portArg !== -1 && process.argv[portArg + 1])
  ? parseInt(process.argv[portArg + 1], 10)
  : parseInt(process.env.PORT || '3333', 10);

const uiDistPath = join(__dirname, 'dist');
const CONFIG_DIR = join(homedir(), '.foundation');
const PROJECTS_FILE = join(CONFIG_DIR, 'projects.json');

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  '.html':  'text/html',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.json':  'application/json',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

function loadProjects() {
  try {
    if (existsSync(PROJECTS_FILE)) {
      return JSON.parse(readFileSync(PROJECTS_FILE, 'utf-8'));
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveProjects(projects) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

function registerProject(projectPath) {
  const projects = loadProjects();
  const name = projectPath.split('/').pop() || 'unknown';
  const existing = projects.findIndex(p => p.path === projectPath);
  if (existing >= 0) {
    projects[existing].lastUsed = Date.now();
  } else {
    projects.push({ path: projectPath, name, lastUsed: Date.now() });
  }
  projects.sort((a, b) => b.lastUsed - a.lastUsed);
  saveProjects(projects.slice(0, 20));
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify(data));
}

function errorResponse(res, status, message) {
  jsonResponse(res, status, { error: message });
}

// ---------------------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------------------

function handleProjects(_req, res) {
  const projects = loadProjects();
  jsonResponse(res, 200, projects);
}

function handleSnapshot(req, res) {
  const urlObj = new URL(req.url, `http://localhost:${port}`);
  const projectParam = urlObj.searchParams.get('project');

  const targetPath = projectParam
    ? join(projectParam, '.foundation', 'snapshot.txt')
    : join(process.cwd(), '.foundation', 'snapshot.txt');

  if (projectParam) {
    registerProject(projectParam);
  }

  if (existsSync(targetPath)) {
    res.writeHead(200, { 'Content-Type': 'text/plain', ...corsHeaders });
    createReadStream(targetPath).pipe(res);
  } else {
    jsonResponse(res, 404, {
      error: 'Snapshot not found',
      hint: projectParam
        ? `Run \`foundation snapshot\` in ${projectParam}`
        : 'Run `foundation snapshot` to create one',
    });
  }
}

function handleMemoriesStats(_req, res) {
  try {
    const gaiaStats = stats();
    let rescue = null;
    try {
      rescue = getStorage().getRescueStats();
    } catch {
      // rescue stats unavailable
    }
    jsonResponse(res, 200, { gaia: gaiaStats, rescue });
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
}

function handleMemoriesRecent(req, res) {
  try {
    const urlObj = new URL(req.url, `http://localhost:${port}`);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const tierParam = urlObj.searchParams.get('tier');
    const tiers = tierParam ? tierParam.split(',') : undefined;

    const results = getRecent({ limit, tiers });
    jsonResponse(res, 200, results);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
}

function handleMemoriesSearch(req, res) {
  try {
    const urlObj = new URL(req.url, `http://localhost:${port}`);
    const query = urlObj.searchParams.get('q') || '';
    const tierParam = urlObj.searchParams.get('tier');
    const tiers = tierParam ? tierParam.split(',') : undefined;
    const limit = parseInt(urlObj.searchParams.get('limit') || '25', 10);
    const sourceFilter = urlObj.searchParams.get('source') || 'all';

    let results;
    if (!query) {
      results = getRecent({ limit, tiers });
    } else {
      results = search(query, { tiers, limit });
    }

    // Apply source filter client-side
    if (sourceFilter === 'gaia') {
      results = results.filter(r => !r.memory.id.startsWith('rescue_'));
    } else if (sourceFilter === 'rescued') {
      results = results.filter(r => r.memory.id.startsWith('rescue_'));
    }

    jsonResponse(res, 200, results);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
}

function handleSessions(req, res) {
  try {
    const urlObj = new URL(req.url, `http://localhost:${port}`);
    const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);

    const results = getRecent({ tiers: ['session'], limit });

    // Filter for checkpoint/auto-tagged memories
    const sessions = results.filter(r => {
      const tags = r.memory.tags || [];
      return tags.some(t => t.includes('checkpoint') || t.includes('auto'));
    });

    jsonResponse(res, 200, sessions);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
}

async function handleOpenBrainSearch(req, res) {
  try {
    const urlObj = new URL(req.url, `http://localhost:${port}`);
    const query = urlObj.searchParams.get('q') || '';
    const limit = parseInt(urlObj.searchParams.get('limit') || '10', 10);

    if (!query) {
      jsonResponse(res, 200, []);
      return;
    }

    const obUrl = process.env.OPEN_BRAIN_URL || '';
    const obKey = process.env.OPEN_BRAIN_KEY || '';

    if (!obUrl || !obKey) {
      jsonResponse(res, 503, { error: 'Open Brain not configured. Set OPEN_BRAIN_URL and OPEN_BRAIN_KEY environment variables.' });
      return;
    }

    const response = await fetch(`${obUrl}?key=${obKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'search_thoughts', arguments: { query, limit } },
      }),
    });

    const data = await response.json();
    jsonResponse(res, 200, data);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

const routes = [
  { path: '/api/projects',         handler: handleProjects },
  { path: '/api/snapshot',         handler: handleSnapshot },
  { path: '/api/memories/stats',   handler: handleMemoriesStats },
  { path: '/api/memories/recent',  handler: handleMemoriesRecent },
  { path: '/api/memories/search',  handler: handleMemoriesSearch },
  { path: '/api/sessions',         handler: handleSessions },
  { path: '/api/openbrain/search', handler: handleOpenBrainSearch },
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = req.url || '/';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Match API routes (startsWith for query-string support)
  for (const route of routes) {
    if (url === route.path || url.startsWith(route.path + '?') || url.startsWith(route.path + '/')) {
      try {
        await route.handler(req, res);
      } catch (err) {
        errorResponse(res, 500, err.message);
      }
      return;
    }
  }

  // Serve static files from dist/
  let filePath = join(uiDistPath, url === '/' ? 'index.html' : url);

  // SPA fallback: serve index.html for non-file paths
  if (!existsSync(filePath) && !url.includes('.')) {
    filePath = join(uiDistPath, 'index.html');
  }

  if (existsSync(filePath)) {
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function shutdown() {
  console.log('\n[foundation-ui] Shutting down...');
  try {
    closeStorage();
  } catch {
    // ignore
  }
  server.close(() => process.exit(0));
  // Force exit after 3s if graceful close hangs
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, () => {
  console.log(`[foundation-ui] Server running at http://localhost:${port}`);
});
