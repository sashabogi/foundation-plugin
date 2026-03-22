/**
 * Unified Memory Interface
 *
 * Writes to BOTH Gaia (local SQLite + FTS5) and Open Brain (cloud Supabase + pgvector).
 * Reads from both and merges results with deduplication and combined scoring.
 *
 * - Gaia: immediate local save with tier/tags, FTS5 keyword search
 * - Open Brain: async cloud save with embedding + metadata, pgvector semantic search
 */

import * as gaia from './gaia.mjs';
import * as openbrain from './openbrain.mjs';

// ============================================================================
// Public API
// ============================================================================

/**
 * Remember something — saves to both Gaia (local) and Open Brain (cloud).
 *
 * Gaia save is synchronous and always succeeds (local SQLite).
 * Open Brain save is async and best-effort (cloud, may fail silently).
 *
 * @param {string} content - What to remember
 * @param {object} [options]
 * @param {string} [options.tier='observation'] - Gaia tier: session, project, global, note, observation
 * @param {string[]} [options.tags=[]] - Tags for Gaia categorization
 * @param {string[]} [options.related_files=[]] - Related file paths
 * @param {string} [options.session_id] - Session ID for session-tier
 * @param {string} [options.project_path] - Project path for project-tier
 * @param {object} [options.metadata] - Additional structured data
 * @param {string} [options.source='foundation-plugin'] - Source for Open Brain
 * @param {boolean} [options.cloudSync=true] - Whether to also save to Open Brain
 * @returns {Promise<{ gaia: object, openbrain: { success: boolean, text?: string, error?: string } | null }>}
 */
export async function remember(content, options = {}) {
  const {
    tier = 'observation',
    tags = [],
    related_files = [],
    session_id,
    project_path,
    metadata,
    source = 'foundation-plugin',
    cloudSync = true,
  } = options;

  // 1. Gaia: immediate local save (synchronous)
  const gaiaResult = gaia.save({
    tier,
    content,
    tags,
    related_files,
    session_id,
    project_path,
    metadata,
  });

  // 2. Open Brain: async cloud save (best-effort, non-blocking)
  let openbrainResult = null;
  if (cloudSync) {
    try {
      openbrainResult = await openbrain.capture(content, source);
    } catch (error) {
      openbrainResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    gaia: gaiaResult,
    openbrain: openbrainResult,
  };
}

/**
 * Recall memories — searches both Gaia and Open Brain, merges and deduplicates.
 *
 * - Gaia: FTS5 keyword search with BM25 + composite scoring
 * - Open Brain: pgvector semantic search with similarity scoring
 *
 * Results are merged, deduplicated by content similarity, and ranked by combined score.
 *
 * @param {string} query - Search query (natural language works for both systems)
 * @param {object} [options]
 * @param {string[]} [options.tiers] - Filter Gaia results by tiers
 * @param {number} [options.limit=20] - Max total results
 * @param {object} [options.context] - Context for Gaia proximity scoring
 * @param {string} [options.context.current_file] - Current file path
 * @param {string} [options.context.project_path] - Current project path
 * @param {number} [options.threshold=0.7] - Open Brain similarity threshold
 * @param {object} [options.filter] - Open Brain metadata filter
 * @param {boolean} [options.cloudSearch=true] - Whether to also search Open Brain
 * @returns {Promise<{ results: Array, gaiaCount: number, openbrainCount: number }>}
 */
export async function recall(query, options = {}) {
  const {
    tiers,
    limit = 20,
    context,
    threshold = 0.7,
    filter,
    cloudSearch = true,
  } = options;

  // 1. Gaia: local FTS5 search (synchronous)
  let gaiaResults = [];
  try {
    gaiaResults = gaia.search(query, { tiers, limit, context });
  } catch (error) {
    // FTS5 query syntax errors are common, fall back gracefully
    console.warn('[Unified] Gaia search failed:', error instanceof Error ? error.message : String(error));
  }

  // 2. Open Brain: cloud semantic search (async)
  let openbrainResults = [];
  if (cloudSearch) {
    try {
      const obResult = await openbrain.search(query, {
        limit: Math.min(limit, 10),
        threshold,
        filter,
      });

      if (obResult.success && obResult.text) {
        // Parse Open Brain text results into structured format
        openbrainResults = parseOpenBrainResults(obResult.text);
      }
    } catch (error) {
      console.warn('[Unified] Open Brain search failed:', error instanceof Error ? error.message : String(error));
    }
  }

  // 3. Merge and deduplicate
  const merged = mergeResults(gaiaResults, openbrainResults, limit);

  return {
    results: merged,
    gaiaCount: gaiaResults.length,
    openbrainCount: openbrainResults.length,
  };
}

/**
 * Get combined statistics from both memory systems.
 *
 * @returns {Promise<{ gaia: object, openbrain: { success: boolean, text?: string } | null, combined: { total_local: number, cloud_configured: boolean } }>}
 */
export async function stats() {
  // Gaia stats (synchronous)
  const gaiaStats = gaia.stats();

  // Open Brain stats (async, best-effort)
  let openbrainStats = null;
  try {
    openbrainStats = await openbrain.stats();
  } catch {
    openbrainStats = { success: false, error: 'Open Brain unreachable' };
  }

  return {
    gaia: gaiaStats,
    openbrain: openbrainStats,
    combined: {
      total_local: gaiaStats.total_memories,
      cloud_configured: openbrainStats?.success === true,
    },
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Parse Open Brain text response into structured results.
 * Open Brain returns text like:
 *   "Found 3 thoughts:\n\n[1] (87.2% match)\nContent here\n  Type: decision | Topics: api, auth"
 */
function parseOpenBrainResults(text) {
  if (!text || text.includes('No matching thoughts found')) {
    return [];
  }

  const results = [];
  const blocks = text.split(/\[\d+\]\s*/).filter(Boolean);

  for (const block of blocks) {
    const matchPercent = block.match(/\((\d+\.?\d*)% match\)/);
    const similarity = matchPercent ? parseFloat(matchPercent[1]) / 100 : 0.5;

    // Extract content (everything before the "  Type:" line)
    const lines = block.split('\n').filter(l => l.trim());
    let content = '';
    let type = 'unknown';
    let topics = [];

    for (const line of lines) {
      if (line.trim().startsWith('Type:') || line.includes('| Topics:')) {
        const typeMatch = line.match(/Type:\s*(\w+)/);
        if (typeMatch) type = typeMatch[1];
        const topicsMatch = line.match(/Topics:\s*(.+)/);
        if (topicsMatch) topics = topicsMatch[1].split(',').map(t => t.trim());
      } else if (!matchPercent || !line.includes('% match')) {
        content += line.trim() + ' ';
      }
    }

    content = content.trim();
    if (!content) continue;

    results.push({
      memory: {
        id: `openbrain_${Date.now()}_${results.length}`,
        tier: 'global',
        content,
        tags: topics,
        related_files: [],
        created_at: Date.now(),
        accessed_at: Date.now(),
        access_count: 0,
        metadata: { source: 'openbrain', type },
      },
      score: similarity,
      relevance_score: similarity,
      recency_score: 0.5,
      tier_score: 0.6,
      proximity_score: 0,
      frequency_score: 0,
      source: 'openbrain',
    });
  }

  return results;
}

/**
 * Merge Gaia and Open Brain results with deduplication.
 * Deduplicates by checking content similarity (Jaccard on word sets).
 */
function mergeResults(gaiaResults, openbrainResults, limit) {
  // Tag sources
  const tagged = [
    ...gaiaResults.map(r => ({ ...r, source: r.source || 'gaia' })),
    ...openbrainResults.map(r => ({ ...r, source: r.source || 'openbrain' })),
  ];

  // Deduplicate: if an Open Brain result is very similar to a Gaia result, skip it
  const deduped = [];
  const gaiaContents = new Set(gaiaResults.map(r => normalizeForComparison(r.memory.content)));

  for (const result of tagged) {
    if (result.source === 'openbrain') {
      const normalized = normalizeForComparison(result.memory.content);
      // Check if any Gaia result has similar content
      let isDuplicate = false;
      for (const gaiaContent of gaiaContents) {
        if (jaccardSimilarity(normalized, gaiaContent) > 0.6) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;
    }
    deduped.push(result);
  }

  // Sort by score and limit
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}

/**
 * Normalize text for comparison: lowercase, remove punctuation, split into word set.
 */
function normalizeForComparison(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

/**
 * Jaccard similarity between two word arrays.
 */
function jaccardSimilarity(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
