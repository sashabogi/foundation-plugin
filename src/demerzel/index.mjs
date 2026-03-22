/**
 * Demerzel — Codebase Intelligence
 *
 * "I have been watching for 20,000 years."
 *
 * Named after R. Daneel Olivaw/Demerzel from Asimov's Foundation series.
 * Provides deep codebase understanding without exceeding context limits.
 *
 * Ported from Foundation v2 to Foundation v3 plugin.
 */

// Snapshot generation
export { createSnapshot, getSnapshotStats, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDE_PATTERNS } from './snapshot.mjs';

// Search & navigation (zero AI cost)
export { regexSearch, findFiles, findSymbol, findImporters, getDeps, getContext } from './search.mjs';

// AI-powered analysis
export { analyzeArchitecture, createDefaultProvider } from './analyze.mjs';
