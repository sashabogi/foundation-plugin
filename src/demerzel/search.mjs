/**
 * Demerzel Search & Navigation
 *
 * Provides zero-cost (no AI) search and navigation functions
 * for codebases using snapshot files.
 *
 * Functions:
 * - regexSearch: Regex pattern search across codebase snapshot
 * - findFiles: Glob pattern file matching
 * - findSymbol: Locate where a symbol is exported
 * - findImporters: Find all files importing a module
 * - getDeps: Get all imports of a file
 * - getContext: Get code around a specific location
 *
 * Ported from Foundation v2 to Foundation v3 plugin.
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SEARCH_RESULTS = 50;
const MAX_SEARCH_RESULTS = 200;
const DEFAULT_FIND_FILES_LIMIT = 100;
const MAX_FIND_FILES_LIMIT = 500;
const MAX_PATTERN_LENGTH = 500;
const MAX_WILDCARDS = 20;

// ============================================================================
// Snapshot Metadata Parser
// ============================================================================

/**
 * Parse metadata section from an enhanced snapshot file.
 * Returns null if the snapshot doesn't contain metadata.
 *
 * @param {string} content - Full snapshot file content
 * @returns {{ importGraph, exportGraph, symbolIndex, exports } | null}
 */
function parseSnapshotMetadata(content) {
  if (!content.includes('METADATA: IMPORT GRAPH')) {
    return null;
  }

  const importGraph = {};
  const exportGraph = {};
  const symbolIndex = {};
  const fileExports = [];

  // Parse import graph
  const importSection = content.match(/METADATA: IMPORT GRAPH\n=+\n([\s\S]*?)\n\n=+\nMETADATA:/)?.[1] || '';
  for (const block of importSection.split('\n\n')) {
    const lines = block.trim().split('\n');
    if (lines.length > 0 && lines[0].endsWith(':')) {
      const file = lines[0].slice(0, -1);
      importGraph[file] = lines.slice(1).map(l => l.replace(/^\s*->\s*/, '').trim()).filter(Boolean);
    }
  }

  // Parse export index (symbol -> files)
  const exportSection = content.match(/METADATA: EXPORT INDEX\n=+\n([\s\S]*?)\n\n=+\nMETADATA:/)?.[1] || '';
  for (const line of exportSection.split('\n')) {
    const match = line.match(/^([\w$]+):\s*(.+)$/);
    if (match) {
      symbolIndex[match[1]] = match[2].split(',').map(s => s.trim());
    }
  }

  // Parse who imports whom (reverse graph)
  const whoImportsSection = content.match(/METADATA: WHO IMPORTS WHOM\n=+\n([\s\S]*)$/)?.[1] || '';
  for (const block of whoImportsSection.split('\n\n')) {
    const lines = block.trim().split('\n');
    if (lines.length > 0 && lines[0].includes(' is imported by:')) {
      const file = lines[0].replace(' is imported by:', '').trim();
      exportGraph[file] = lines.slice(1).map(l => l.replace(/^\s*<-\s*/, '').trim()).filter(Boolean);
    }
  }

  // Parse file exports
  const fileExportsSection = content.match(/METADATA: FILE EXPORTS\n=+\n([\s\S]*?)\n\n=+\nMETADATA:/)?.[1] || '';
  for (const line of fileExportsSection.split('\n')) {
    const match = line.match(/^([^:]+):(\d+)\s*-\s*(\w+)\s+(.+)$/);
    if (match) {
      fileExports.push({
        file: match[1],
        line: parseInt(match[2]),
        type: match[3],
        symbol: match[4].split(' ')[0],
      });
    }
  }

  return { importGraph, exportGraph, symbolIndex, exports: fileExports };
}

// ============================================================================
// Core Search Functions
// ============================================================================

/**
 * Fast regex search across a codebase snapshot. Zero AI cost.
 *
 * @param {string} projectPath - Path to project directory (snapshot at .foundation/snapshot.txt)
 * @param {string} pattern - Regex pattern to search
 * @param {object} [options]
 * @param {boolean} [options.caseInsensitive=true] - Case insensitive search
 * @param {number} [options.maxResults=50] - Maximum results to return
 * @returns {{ count: number, matches: Array<{ lineNum: number, line: string, match: string }> }}
 */
export function regexSearch(projectPath, pattern, options = {}) {
  const { caseInsensitive = true, maxResults = DEFAULT_SEARCH_RESULTS } = options;

  if (!pattern || pattern.trim() === '') {
    throw new Error('Pattern cannot be empty');
  }

  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}. Run createSnapshot first.`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');
  const flags = caseInsensitive ? 'gi' : 'g';
  const lines = content.split('\n');
  const matches = [];
  const effectiveMax = Math.min(maxResults, MAX_SEARCH_RESULTS);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineRegex = new RegExp(pattern, flags);
    let match;
    while ((match = lineRegex.exec(line)) !== null) {
      matches.push({
        lineNum: lineNum + 1,
        line: line.trim(),
        match: match[0],
      });

      if (matches.length >= effectiveMax) {
        return { count: matches.length, matches };
      }
    }
  }

  return { count: matches.length, matches };
}

/**
 * Find files matching a glob pattern. Zero AI cost.
 *
 * @param {string} projectPath - Path to project directory
 * @param {string} pattern - Glob pattern (e.g., "*.ts", "src/**\/*.tsx")
 * @param {object} [options]
 * @param {number} [options.limit=100] - Maximum results
 * @returns {{ pattern: string, files: string[], count: number, totalMatching: number, hasMore: boolean }}
 */
export function findFiles(projectPath, pattern, options = {}) {
  const { limit = DEFAULT_FIND_FILES_LIMIT } = options;

  if (!pattern || pattern.trim() === '') {
    throw new Error('Pattern cannot be empty');
  }

  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`Pattern too long (max ${MAX_PATTERN_LENGTH} characters)`);
  }

  // ReDoS protection
  const starCount = (pattern.match(/\*/g) || []).length;
  if (starCount > MAX_WILDCARDS) {
    throw new Error(`Too many wildcards in pattern (max ${MAX_WILDCARDS})`);
  }

  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}. Run createSnapshot first.`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');

  // Extract all FILE: markers
  const fileRegex = /^FILE: \.\/(.+)$/gm;
  const files = [];
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    files.push(match[1]);
  }

  // Convert glob pattern to regex
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\-]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*?')
    .replace(/<<<GLOBSTAR>>>/g, '.*?')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  const matching = files.filter(f => regex.test(f));
  const effectiveLimit = Math.min(limit, MAX_FIND_FILES_LIMIT);
  const limited = matching.slice(0, effectiveLimit).sort();

  return {
    pattern,
    files: limited,
    count: limited.length,
    totalMatching: matching.length,
    hasMore: matching.length > effectiveLimit,
  };
}

/**
 * Locate where a function, class, or type is exported. Zero AI cost.
 * Requires enhanced snapshot with metadata.
 *
 * @param {string} projectPath - Path to project directory
 * @param {string} symbolName - Symbol name to find (e.g., "AuthProvider", "useAuth")
 * @returns {{ symbol: string, exportedFrom: string[], details: Array<{ file, line, type, symbol }>, count: number }}
 */
export function findSymbol(projectPath, symbolName) {
  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');
  const metadata = parseSnapshotMetadata(content);

  if (!metadata) {
    throw new Error('This snapshot does not have metadata. Create with enhanced=true.');
  }

  const files = metadata.symbolIndex[symbolName] || [];
  const exportDetails = metadata.exports.filter(e => e.symbol === symbolName);

  return {
    symbol: symbolName,
    exportedFrom: files,
    details: exportDetails,
    count: files.length,
  };
}

/**
 * Find all files that import a given module. Zero AI cost.
 * Requires enhanced snapshot with metadata.
 *
 * @param {string} projectPath - Path to project directory
 * @param {string} modulePath - File path to find importers of (e.g., "src/auth.ts")
 * @returns {{ target: string, importedBy: string[], count: number }}
 */
export function findImporters(projectPath, modulePath) {
  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');
  const metadata = parseSnapshotMetadata(content);

  if (!metadata) {
    throw new Error('This snapshot does not have metadata. Create with enhanced=true.');
  }

  // Normalize the target path
  const normalizedTarget = modulePath.startsWith('./') ? modulePath.slice(2) : modulePath;
  const targetVariants = [normalizedTarget, './' + normalizedTarget, normalizedTarget.replace(/\.(ts|tsx|js|jsx)$/, '')];

  // Find all files that import this target
  const importers = [];
  for (const [file, imports] of Object.entries(metadata.importGraph)) {
    for (const imp of imports) {
      if (targetVariants.some(v => imp === v || imp.endsWith('/' + v) || imp.includes(v))) {
        importers.push(file);
        break;
      }
    }
  }

  // Also check the exportGraph (direct mapping)
  for (const variant of targetVariants) {
    if (metadata.exportGraph[variant]) {
      importers.push(...metadata.exportGraph[variant]);
    }
  }

  const unique = [...new Set(importers)];

  return {
    target: modulePath,
    importedBy: unique,
    count: unique.length,
  };
}

/**
 * Get all dependencies (imports) of a specific file. Zero AI cost.
 * Requires enhanced snapshot with metadata.
 *
 * @param {string} projectPath - Path to project directory
 * @param {string} filePath - File path to get dependencies for
 * @returns {{ file: string, imports: string[], count: number }}
 */
export function getDeps(projectPath, filePath) {
  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');
  const metadata = parseSnapshotMetadata(content);

  if (!metadata) {
    throw new Error('This snapshot does not have metadata. Create with enhanced=true.');
  }

  // Normalize the file path
  const normalizedFile = filePath.startsWith('./') ? filePath.slice(2) : filePath;
  const fileVariants = [normalizedFile, './' + normalizedFile];

  // Find imports for this file
  let imports = [];
  for (const variant of fileVariants) {
    if (metadata.importGraph[variant]) {
      imports = metadata.importGraph[variant];
      break;
    }
  }

  return {
    file: filePath,
    imports,
    count: imports.length,
  };
}

/**
 * Get lines of code around a specific location. Zero AI cost.
 * Use after search to get more context.
 *
 * @param {string} projectPath - Path to project directory
 * @param {string} filePath - File path within the snapshot
 * @param {number} line - Center line number
 * @param {number} [range=10] - Lines before and after
 * @returns {{ file: string, targetLine: number, range: { start, end }, content: string, totalLines: number }}
 */
export function getContext(projectPath, filePath, line, range = 10) {
  const snapshotPath = resolveSnapshotPath(projectPath);

  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }

  const content = readFileSync(snapshotPath, 'utf-8');

  // Find the file section in the snapshot
  const normalizedTarget = filePath.replace(/^\.\//, '');
  const fileMarkerVariants = [
    `FILE: ./${normalizedTarget}`,
    `FILE: ${normalizedTarget}`,
  ];

  let fileStart = -1;
  for (const marker of fileMarkerVariants) {
    fileStart = content.indexOf(marker);
    if (fileStart !== -1) break;
  }

  if (fileStart === -1) {
    throw new Error(`File not found in snapshot: ${filePath}`);
  }

  // Find the end of this file section
  const nextFileStart = content.indexOf('\nFILE:', fileStart + 1);
  const metadataStart = content.indexOf('\nMETADATA:', fileStart);
  const fileEnd = Math.min(
    nextFileStart === -1 ? Infinity : nextFileStart,
    metadataStart === -1 ? Infinity : metadataStart
  );

  // Extract file content
  const fileContent = content.slice(fileStart, fileEnd === Infinity ? undefined : fileEnd);
  const fileLines = fileContent.split('\n').slice(2); // Skip FILE: header and separator

  // Calculate range
  const startLine = Math.max(0, line - range - 1);
  const endLine = Math.min(fileLines.length, line + range);

  // Extract context with line numbers
  const contextLines = fileLines.slice(startLine, endLine).map((lineContent, idx) => {
    const lineNum = startLine + idx + 1;
    const marker = lineNum === line ? '>>>' : '   ';
    return `${marker} ${lineNum.toString().padStart(4)}: ${lineContent}`;
  });

  return {
    file: filePath,
    targetLine: line,
    range: { start: startLine + 1, end: endLine },
    content: contextLines.join('\n'),
    totalLines: fileLines.length,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the snapshot path from a project path.
 * If the path already points to a .txt file, use it directly.
 * Otherwise, look for .foundation/snapshot.txt in the project.
 */
function resolveSnapshotPath(projectPath) {
  const resolved = resolve(projectPath);

  if (resolved.endsWith('.txt') && existsSync(resolved)) {
    return resolved;
  }

  return join(resolved, '.foundation', 'snapshot.txt');
}
