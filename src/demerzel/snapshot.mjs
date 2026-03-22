/**
 * Demerzel Snapshot Generator
 *
 * Creates optimized text snapshots of codebases for analysis.
 * Handles file filtering, exclusion patterns, and formatting.
 *
 * Ported from Foundation v2 to Foundation v3 plugin.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative, extname, dirname, basename } from 'path';
import { execFileSync } from 'child_process';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'rb', 'php',
  'swift', 'kt', 'scala', 'c', 'cpp', 'h', 'hpp', 'cs', 'md', 'json',
];

export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'target',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'vendor',
  '.DS_Store',
  '*.lock',
  'package-lock.json',
  '*.min.js',
  '*.min.css',
];

const DEFAULT_OPTIONS = {
  extensions: DEFAULT_EXTENSIONS,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  maxFileSize: 1024 * 1024,
  includeHidden: false,
};

// ============================================================================
// File Collection
// ============================================================================

function shouldExclude(filePath, patterns) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (normalizedPath.endsWith(suffix)) return true;
    } else if (
      normalizedPath.includes(`/${pattern}/`) ||
      normalizedPath.endsWith(`/${pattern}`) ||
      normalizedPath === pattern
    ) {
      return true;
    }
  }
  return false;
}

function hasValidExtension(filePath, extensions) {
  const ext = extname(filePath).slice(1).toLowerCase();
  return extensions.includes(ext);
}

function collectFiles(dir, options, baseDir = dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(baseDir, fullPath);
      if (!options.includeHidden && entry.name.startsWith('.')) continue;
      if (shouldExclude(relativePath, options.excludePatterns)) continue;
      if (entry.isDirectory()) {
        files.push(...collectFiles(fullPath, options, baseDir));
      } else if (entry.isFile()) {
        if (!hasValidExtension(entry.name, options.extensions)) continue;
        try {
          const stats = statSync(fullPath);
          if (stats.size > options.maxFileSize) continue;
        } catch { continue; }
        files.push(fullPath);
      }
    }
  } catch { /* Directory not readable */ }
  return files.sort();
}

// ============================================================================
// Import/Export Parsing
// ============================================================================

function parseImports(content, filePath) {
  const imports = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import') && !trimmed.includes('require(')) continue;
    let match = /import\s+(type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/.exec(trimmed);
    if (match) {
      const symbols = match[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      imports.push({ source: filePath, target: match[3], symbols, isDefault: false, isType: !!match[1] });
      continue;
    }
    match = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(trimmed);
    if (match) {
      imports.push({ source: filePath, target: match[2], symbols: ['*'], isDefault: false, isType: false });
      continue;
    }
    match = /import\s+(type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(trimmed);
    if (match && !trimmed.includes('{')) {
      imports.push({ source: filePath, target: match[3], symbols: [match[2]], isDefault: true, isType: !!match[1] });
      continue;
    }
    match = /^import\s+['"]([^'"]+)['"]/.exec(trimmed);
    if (match) {
      imports.push({ source: filePath, target: match[1], symbols: [], isDefault: false, isType: false });
    }
  }
  return imports;
}

function parseExports(content, filePath) {
  const fileExports = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    let match = /export\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/.exec(trimmed);
    if (match) { fileExports.push({ file: filePath, symbol: match[1], type: 'function', signature: `function ${match[1]}${match[2]}`, line: i + 1 }); continue; }
    match = /export\s+class\s+(\w+)/.exec(trimmed);
    if (match) { fileExports.push({ file: filePath, symbol: match[1], type: 'class', line: i + 1 }); continue; }
    match = /export\s+(const|let|var)\s+(\w+)/.exec(trimmed);
    if (match) { fileExports.push({ file: filePath, symbol: match[2], type: match[1], line: i + 1 }); continue; }
    match = /export\s+(type|interface)\s+(\w+)/.exec(trimmed);
    if (match) { fileExports.push({ file: filePath, symbol: match[2], type: match[1], line: i + 1 }); continue; }
    match = /export\s+enum\s+(\w+)/.exec(trimmed);
    if (match) { fileExports.push({ file: filePath, symbol: match[1], type: 'enum', line: i + 1 }); continue; }
    if (/export\s+default/.test(trimmed)) {
      match = /export\s+default\s+(?:function\s+)?(\w+)?/.exec(trimmed);
      fileExports.push({ file: filePath, symbol: match?.[1] || 'default', type: 'default', line: i + 1 });
    }
  }
  return fileExports;
}

// ============================================================================
// Complexity & Test Mapping
// ============================================================================

function calculateComplexity(content) {
  const patterns = [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bwhile\s*\(/g, /\bfor\s*\(/g, /\bcase\s+/g, /\?\s*.*\s*:/g, /&&/g, /\|\|/g, /\bcatch\s*\(/g];
  let complexity = 1;
  for (const p of patterns) { const m = content.match(p); if (m) complexity += m.length; }
  return complexity;
}

function getComplexityLevel(score) {
  if (score <= 10) return 'low';
  if (score <= 20) return 'medium';
  return 'high';
}

function mapTestFiles(files) {
  const testMap = {};
  const testPatterns = [
    (s) => s.replace(/\.tsx?$/, '.test.ts'), (s) => s.replace(/\.tsx?$/, '.test.tsx'),
    (s) => s.replace(/\.tsx?$/, '.spec.ts'), (s) => s.replace(/\.tsx?$/, '.spec.tsx'),
    (s) => s.replace(/\.jsx?$/, '.test.js'), (s) => s.replace(/\.jsx?$/, '.test.jsx'),
    (s) => s.replace(/\.jsx?$/, '.spec.js'), (s) => s.replace(/\.jsx?$/, '.spec.jsx'),
    (s) => { const d = dirname(s); const b = basename(s).replace(/\.(tsx?|jsx?)$/, ''); return join(d, '__tests__', `${b}.test.ts`); },
    (s) => { const d = dirname(s); const b = basename(s).replace(/\.(tsx?|jsx?)$/, ''); return join(d, '__tests__', `${b}.test.tsx`); },
    (s) => s.replace(/^src\//, 'test/').replace(/\.(tsx?|jsx?)$/, '.test.ts'),
    (s) => s.replace(/^src\//, 'tests/').replace(/\.(tsx?|jsx?)$/, '.test.ts'),
  ];
  const fileSet = new Set(files);
  for (const file of files) {
    if (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')) continue;
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const tests = [];
    for (const pattern of testPatterns) {
      const tp = pattern(file);
      if (tp !== file && fileSet.has(tp)) tests.push(tp);
    }
    if (tests.length > 0) testMap[file] = [...new Set(tests)];
  }
  return testMap;
}

// ============================================================================
// Git Integration (uses execFileSync -- no shell, safe from injection)
// ============================================================================

function getRecentChanges(projectPath) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' });
    const output = execFileSync(
      'git', ['log', '--since=7 days ago', '--name-only', '--format=COMMIT_AUTHOR:%an', '--diff-filter=ACMR'],
      { cwd: projectPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' }
    );
    if (!output.trim()) return [];
    const fileStats = {};
    let currentAuthor = '';
    let currentCommitId = 0;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { currentCommitId++; continue; }
      if (trimmed.startsWith('COMMIT_AUTHOR:')) { currentAuthor = trimmed.replace('COMMIT_AUTHOR:', ''); continue; }
      if (!fileStats[trimmed]) fileStats[trimmed] = { commits: new Set(), authors: new Set() };
      fileStats[trimmed].commits.add(`${currentCommitId}`);
      if (currentAuthor) fileStats[trimmed].authors.add(currentAuthor);
    }
    return Object.entries(fileStats)
      .map(([file, s]) => ({ file, commits: s.commits.size, authors: s.authors.size }))
      .sort((a, b) => b.commits - a.commits);
  } catch { return null; }
}

// ============================================================================
// Import Resolution
// ============================================================================

function resolveImportPath(importPath, fromFile, projectFiles) {
  if (!importPath.startsWith('.')) return undefined;
  const fromDir = dirname(fromFile);
  const basePath = join(fromDir, importPath).replace(/\.(js|jsx|mjs|cjs)$/, '');
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (projectFiles.includes(candidate) || projectFiles.includes('./' + candidate)) {
      return candidate.startsWith('./') ? candidate.slice(2) : candidate;
    }
  }
  return undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a codebase snapshot with optional enhanced metadata.
 *
 * @param {string} projectPath - Path to the project directory
 * @param {object} [options] - Snapshot options
 * @param {boolean} [options.enhanced=true] - Create enhanced snapshot with import graph
 * @param {string[]} [options.ignore] - Additional patterns to ignore
 * @returns {{ outputPath, fileCount, totalLines, totalSize, files, metadata? }}
 */
export function createSnapshot(projectPath, options = {}) {
  const enhanced = options.enhanced !== false;
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  if (options.ignore && Array.isArray(options.ignore)) {
    mergedOptions.excludePatterns = [...mergedOptions.excludePatterns, ...options.ignore];
  }
  if (!existsSync(projectPath)) throw new Error(`Project path does not exist: ${projectPath}`);
  const stats = statSync(projectPath);
  if (!stats.isDirectory()) throw new Error(`Project path is not a directory: ${projectPath}`);

  const outputPath = join(projectPath, '.foundation', 'snapshot.txt');
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const files = collectFiles(projectPath, mergedOptions);
  const lines = [];
  lines.push('================================================================================');
  lines.push('CODEBASE SNAPSHOT');
  lines.push(`Project: ${projectPath}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Extensions: ${mergedOptions.extensions.join(', ')}`);
  lines.push(`Files: ${files.length}`);
  lines.push('================================================================================');
  lines.push('');

  for (const filePath of files) {
    const relativePath = relative(projectPath, filePath);
    lines.push('');
    lines.push('================================================================================');
    lines.push(`FILE: ./${relativePath}`);
    lines.push('================================================================================');
    try { lines.push(readFileSync(filePath, 'utf-8')); }
    catch { lines.push('[Unable to read file]'); }
  }

  const relativeFiles = files.map(f => relative(projectPath, f));
  let snapshotContent = lines.join('\n');
  writeFileSync(outputPath, snapshotContent);

  const result = {
    outputPath,
    fileCount: files.length,
    totalLines: snapshotContent.split('\n').length,
    totalSize: Buffer.byteLength(snapshotContent, 'utf-8'),
    files: relativeFiles,
  };

  if (enhanced) {
    const metadata = buildEnhancedMetadata(projectPath, relativeFiles);
    const metadataSection = formatMetadataSection(metadata);
    snapshotContent += metadataSection;
    writeFileSync(outputPath, snapshotContent);
    result.totalLines = snapshotContent.split('\n').length;
    result.totalSize = Buffer.byteLength(snapshotContent, 'utf-8');
    result.metadata = metadata;
  }

  return result;
}

function buildEnhancedMetadata(projectPath, relativeFiles) {
  const allImports = [];
  const allExports = [];
  const fileIndex = {};
  const projectFiles = relativeFiles.map(f => './' + f);

  for (const relPath of relativeFiles) {
    const fullPath = join(projectPath, relPath);
    const ext = extname(relPath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) continue;
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const imports = parseImports(content, relPath);
      const fileExports = parseExports(content, relPath);
      for (const imp of imports) imp.resolved = resolveImportPath(imp.target, relPath, projectFiles);
      allImports.push(...imports);
      allExports.push(...fileExports);
      fileIndex[relPath] = { path: relPath, imports, exports: fileExports, size: content.length, lines: content.split('\n').length };
    } catch { /* skip */ }
  }

  const importGraph = {};
  for (const imp of allImports) {
    if (imp.resolved) {
      if (!importGraph[imp.source]) importGraph[imp.source] = [];
      if (!importGraph[imp.source].includes(imp.resolved)) importGraph[imp.source].push(imp.resolved);
    }
  }

  const exportGraph = {};
  for (const imp of allImports) {
    if (imp.resolved) {
      if (!exportGraph[imp.resolved]) exportGraph[imp.resolved] = [];
      if (!exportGraph[imp.resolved].includes(imp.source)) exportGraph[imp.resolved].push(imp.source);
    }
  }

  const symbolIndex = {};
  for (const exp of allExports) {
    if (!symbolIndex[exp.symbol]) symbolIndex[exp.symbol] = [];
    if (!symbolIndex[exp.symbol].includes(exp.file)) symbolIndex[exp.symbol].push(exp.file);
  }

  const complexityScores = [];
  for (const relPath of Object.keys(fileIndex)) {
    try {
      const content = readFileSync(join(projectPath, relPath), 'utf-8');
      const score = calculateComplexity(content);
      complexityScores.push({ file: relPath, score, level: getComplexityLevel(score) });
    } catch { /* skip */ }
  }
  complexityScores.sort((a, b) => b.score - a.score);

  return {
    imports: allImports, exports: allExports, fileIndex, importGraph, exportGraph,
    symbolIndex, complexityScores, testFileMap: mapTestFiles(relativeFiles),
    recentChanges: getRecentChanges(projectPath),
  };
}

function formatMetadataSection(metadata) {
  const { importGraph, symbolIndex, exports: allExports, exportGraph, complexityScores, testFileMap, recentChanges } = metadata;
  let section = `

================================================================================
METADATA: IMPORT GRAPH
================================================================================
${Object.entries(importGraph).map(([f, i]) => `${f}:\n${i.map(x => `  -> ${x}`).join('\n')}`).join('\n\n')}

================================================================================
METADATA: EXPORT INDEX
================================================================================
${Object.entries(symbolIndex).map(([s, f]) => `${s}: ${f.join(', ')}`).join('\n')}

================================================================================
METADATA: FILE EXPORTS
================================================================================
${allExports.map(e => `${e.file}:${e.line} - ${e.type} ${e.symbol}${e.signature ? ` ${e.signature}` : ''}`).join('\n')}

================================================================================
METADATA: WHO IMPORTS WHOM
================================================================================
${Object.entries(exportGraph).map(([f, i]) => `${f} is imported by:\n${i.map(x => `  <- ${x}`).join('\n')}`).join('\n\n')}

================================================================================
METADATA: COMPLEXITY SCORES
================================================================================
${complexityScores.map(c => `${c.file}: ${c.score} (${c.level})`).join('\n')}

================================================================================
METADATA: TEST COVERAGE MAP
================================================================================
${Object.entries(testFileMap).length > 0
    ? Object.entries(testFileMap).map(([src, tests]) => `${src} -> ${tests.join(', ')}`).join('\n')
    : '(no test file mappings found)'}`;

  if (recentChanges !== null) {
    section += `

================================================================================
METADATA: RECENT CHANGES (last 7 days)
================================================================================
${recentChanges.length > 0
    ? recentChanges.map(c => `${c.file}: ${c.commits} commit${c.commits !== 1 ? 's' : ''}, ${c.authors} author${c.authors !== 1 ? 's' : ''}`).join('\n')
    : '(no changes in the last 7 days)'}`;
  }
  return section;
}

/**
 * Get stats for an existing snapshot file.
 */
export function getSnapshotStats(snapshotPath) {
  if (!existsSync(snapshotPath)) throw new Error(`Snapshot file does not exist: ${snapshotPath}`);
  const content = readFileSync(snapshotPath, 'utf-8');
  const totalLines = content.split('\n').length;
  const totalSize = Buffer.byteLength(content, 'utf-8');
  const fileMatches = content.match(/^FILE: /gm);
  return { fileCount: fileMatches ? fileMatches.length : 0, totalLines, totalSize };
}
