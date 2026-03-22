/**
 * Gaia Memory Storage
 *
 * SQLite + FTS5 memory system with 5-tier hierarchy and BM25 ranking.
 * Named after Gaia from Foundation — "We are all one, and one is all."
 *
 * Backward-compatible with existing ~/.foundation/gaia-memory.db
 *
 * Ported from Foundation v2 to Foundation v3 plugin.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

// ============================================================================
// Types & Constants
// ============================================================================

const TIER_SCORES = {
  session: 1.0,
  project: 0.8,
  global: 0.6,
  note: 0.4,
  observation: 0.2,
};

const RESCUE_CATEGORY_MAP = {
  fact: 'observation',
  decision: 'project',
  skill: 'global',
};

// ============================================================================
// ID Generation (nanoid-compatible without dependency)
// ============================================================================

function generateId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = randomBytes(21);
  let id = '';
  for (let i = 0; i < 21; i++) {
    id += alphabet[bytes[i] % 64];
  }
  return `mem_${id}`;
}

// ============================================================================
// GaiaStorage Class
// ============================================================================

class GaiaStorage {
  constructor(dbPath) {
    this.dbPath = dbPath;

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(dbPath);

    // Configure for performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    this._initSchema();
  }

  _initSchema() {
    // Main memories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        tier TEXT NOT NULL CHECK(tier IN ('session', 'project', 'global', 'note', 'observation')),
        content TEXT NOT NULL,
        tags TEXT NOT NULL,
        related_files TEXT NOT NULL,
        session_id TEXT,
        project_path TEXT,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tier ON memories(tier);
      CREATE INDEX IF NOT EXISTS idx_session ON memories(session_id) WHERE session_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_project ON memories(project_path) WHERE project_path IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_accessed ON memories(accessed_at DESC);
    `);

    // FTS5 virtual table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        tags,
        related_files,
        content='memories',
        content_rowid='rowid',
        tokenize='porter unicode61'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags, related_files)
        VALUES (new.rowid, new.content, new.tags, new.related_files);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        UPDATE memories_fts SET content = new.content, tags = new.tags, related_files = new.related_files
        WHERE rowid = old.rowid;
      END;
    `);

    // Memory links table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_links (
        from_memory_id TEXT NOT NULL,
        to_memory_id TEXT NOT NULL,
        link_type TEXT NOT NULL CHECK(link_type IN ('depends_on', 'extends', 'reverts', 'related', 'contradicts')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (from_memory_id, to_memory_id, link_type),
        FOREIGN KEY (from_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (to_memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_link_from ON memory_links(from_memory_id);
      CREATE INDEX IF NOT EXISTS idx_link_to ON memory_links(to_memory_id);
    `);

    // Metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1');
    `);
  }

  // --------------------------------------------------------------------------
  // Core Memory Operations
  // --------------------------------------------------------------------------

  /**
   * Save a new memory.
   *
   * @param {object} input
   * @param {string} input.tier - Memory tier: session, project, global, note, observation
   * @param {string} input.content - Memory content
   * @param {string[]} [input.tags=[]] - Tags for categorization
   * @param {string[]} [input.related_files=[]] - Related file paths
   * @param {string} [input.session_id] - Session ID for session-tier
   * @param {string} [input.project_path] - Project path for project-tier
   * @param {object} [input.metadata] - Additional structured data
   * @returns {{ id, tier, content, tags, related_files, session_id, project_path, created_at, accessed_at, access_count, metadata }}
   */
  save(input) {
    const now = Date.now();
    const memory = {
      id: generateId(),
      tier: input.tier,
      content: input.content,
      tags: input.tags || [],
      related_files: input.related_files || [],
      session_id: input.session_id || null,
      project_path: input.project_path || null,
      created_at: now,
      accessed_at: now,
      access_count: 0,
      metadata: input.metadata || null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (id, tier, content, tags, related_files, session_id, project_path, created_at, accessed_at, access_count, metadata)
      VALUES (@id, @tier, @content, @tags, @related_files, @session_id, @project_path, @created_at, @accessed_at, @access_count, @metadata)
    `);

    stmt.run({
      id: memory.id,
      tier: memory.tier,
      content: memory.content,
      tags: JSON.stringify(memory.tags),
      related_files: JSON.stringify(memory.related_files),
      session_id: memory.session_id,
      project_path: memory.project_path,
      created_at: memory.created_at,
      accessed_at: memory.accessed_at,
      access_count: memory.access_count,
      metadata: memory.metadata ? JSON.stringify(memory.metadata) : null,
    });

    return memory;
  }

  /**
   * Get a memory by ID. Updates access tracking.
   *
   * @param {string} id - Memory ID
   * @returns {object|null} Memory object or null
   */
  get(id) {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    // Update access tracking
    const now = Date.now();
    this.db.prepare('UPDATE memories SET accessed_at = @now, access_count = access_count + 1 WHERE id = @id')
      .run({ id, now });

    return this._rowToMemory(row, now, row.access_count + 1);
  }

  /**
   * Delete a memory by ID. Cascades to links.
   *
   * @param {string} id - Memory ID
   * @returns {{ success: boolean, deleted_links: number }}
   */
  delete(id) {
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM memory_links WHERE from_memory_id = ? OR to_memory_id = ?'
    );
    const { count } = countStmt.get(id, id);

    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);

    return {
      success: result.changes > 0,
      deleted_links: count,
    };
  }

  // --------------------------------------------------------------------------
  // Search with FTS5 + Composite Scoring
  // --------------------------------------------------------------------------

  /**
   * Search memories with FTS5 full-text search and composite scoring.
   *
   * @param {string} query - Search query
   * @param {object} [options]
   * @param {string[]} [options.tiers] - Filter by tiers
   * @param {number} [options.limit=20] - Max results
   * @param {object} [options.context] - Context for proximity scoring
   * @param {string} [options.context.current_file] - Current file path
   * @param {string} [options.context.project_path] - Current project path
   * @returns {Array<{ memory, score, relevance_score, recency_score, tier_score, proximity_score, frequency_score }>}
   */
  search(query, options = {}) {
    const { tiers, limit = 20, context } = options;

    let sql = `
      SELECT
        m.*,
        fts.rank as fts_rank
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
    `;

    const params = [query];

    if (tiers && tiers.length > 0) {
      sql += ` AND m.tier IN (${tiers.map(() => '?').join(',')})`;
      params.push(...tiers);
    }

    sql += ' ORDER BY fts.rank LIMIT ?';
    params.push(limit * 2);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    const now = Date.now();
    const results = rows.map(row => {
      const memory = this._rowToMemory(row);

      const relevance_score = Math.min(1.0, Math.abs(row.fts_rank) / 10);

      const ageMs = now - memory.created_at;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recency_score = Math.exp(-ageDays / 30);

      const tier_score = TIER_SCORES[memory.tier] || 0.2;

      let proximity_score = 0;
      if (context?.current_file && memory.related_files.length > 0) {
        proximity_score = memory.related_files.includes(context.current_file) ? 1.0 : 0;
      }

      const max_access = 100;
      const frequency_score = memory.access_count > 0
        ? Math.log(memory.access_count + 1) / Math.log(max_access + 1)
        : 0;

      const score =
        relevance_score * 0.40 +
        recency_score * 0.25 +
        tier_score * 0.15 +
        proximity_score * 0.10 +
        frequency_score * 0.10;

      return { memory, score, relevance_score, recency_score, tier_score, proximity_score, frequency_score };
    });

    // Merge rescue DB results
    const rescueResults = this._searchRescueDB(query, { tiers, limit, context });
    if (rescueResults.length > 0) {
      results.push(...rescueResults);
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Cross-Memory Links
  // --------------------------------------------------------------------------

  /**
   * Create a typed link between two memories.
   */
  link(fromId, toId, type) {
    const fullLink = {
      from_memory_id: fromId,
      to_memory_id: toId,
      link_type: type,
      created_at: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO memory_links (from_memory_id, to_memory_id, link_type, created_at)
      VALUES (@from_memory_id, @to_memory_id, @link_type, @created_at)
      ON CONFLICT DO NOTHING
    `).run(fullLink);

    return fullLink;
  }

  /**
   * Get all links for a memory, grouped by link type.
   */
  getLinks(memoryId) {
    const rows = this.db.prepare(`
      SELECT m.*, ml.link_type
      FROM memory_links ml
      JOIN memories m ON m.id = ml.to_memory_id
      WHERE ml.from_memory_id = ?
    `).all(memoryId);

    const links = { depends_on: [], extends: [], reverts: [], related: [], contradicts: [] };
    for (const row of rows) {
      links[row.link_type].push(this._rowToMemory(row));
    }
    return links;
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get memory database statistics.
   */
  stats() {
    const { count: total_memories } = this.db.prepare('SELECT COUNT(*) as count FROM memories').get();

    const tierRows = this.db.prepare('SELECT tier, COUNT(*) as count FROM memories GROUP BY tier').all();
    const by_tier = { session: 0, project: 0, global: 0, note: 0, observation: 0 };
    for (const row of tierRows) {
      by_tier[row.tier] = row.count;
    }

    const { count: total_links } = this.db.prepare('SELECT COUNT(*) as count FROM memory_links').get();

    const { size } = this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();
    const total_size_mb = size / (1024 * 1024);

    const { oldest, newest } = this.db.prepare('SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories').get();

    return { total_memories, by_tier, total_links, total_size_mb, oldest_memory: oldest ?? 0, newest_memory: newest ?? 0 };
  }

  getRescueStats() {
    try {
      const dbPath = this._rescueDbPath;
      if (!existsSync(dbPath)) return null;

      const rescueDb = new Database(dbPath, { readonly: true });
      try {
        const { count } = rescueDb.prepare('SELECT COUNT(*) as count FROM memories').get();
        const categoryRows = rescueDb.prepare('SELECT category, COUNT(*) as count FROM memories GROUP BY category').all();
        const by_category = {};
        for (const row of categoryRows) by_category[row.category] = row.count;
        return { total_memories: count, by_category };
      } finally {
        rescueDb.close();
      }
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // dev-infra Memory Rescue Integration
  // --------------------------------------------------------------------------

  get _rescueDbPath() {
    return join(homedir(), '.dev-infra', 'memory.db');
  }

  _mapRescueCategory(category) {
    return RESCUE_CATEGORY_MAP[category] || 'observation';
  }

  _searchRescueDB(query, options = {}) {
    try {
      const dbPath = this._rescueDbPath;
      if (!existsSync(dbPath)) return [];

      const rescueDb = new Database(dbPath, { readonly: true });
      const now = Date.now();

      try {
        let rows;

        const ftsCheck = rescueDb.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
        ).get();

        if (ftsCheck) {
          rows = rescueDb.prepare(`
            SELECT m.*, fts.rank as fts_rank
            FROM memories_fts fts
            JOIN memories m ON m.id = fts.id
            WHERE memories_fts MATCH ?
            ORDER BY fts.rank
            LIMIT ?
          `).all(query, (options.limit ?? 20) * 2);
        } else {
          const likeQuery = `%${query}%`;
          rows = rescueDb.prepare(`
            SELECT *, 0 as fts_rank FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?
          `).all(likeQuery, (options.limit ?? 20) * 2);
        }

        const results = [];

        for (const row of rows) {
          const mappedTier = this._mapRescueCategory(row.category);
          if (options.tiers?.length > 0 && !options.tiers.includes(mappedTier)) continue;

          const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : now;
          const accessedAtMs = row.accessed_at ? new Date(row.accessed_at).getTime() : now;

          const memory = {
            id: `rescue_${row.id}`,
            tier: mappedTier,
            content: row.content,
            tags: [row.category, row.subcategory, 'rescued'].filter(Boolean),
            related_files: [],
            session_id: row.session_id ?? undefined,
            project_path: row.project ?? undefined,
            created_at: createdAtMs,
            accessed_at: accessedAtMs,
            access_count: row.access_count ?? 0,
            metadata: { source: 'dev-infra', importance: row.importance, original_id: row.id },
          };

          const relevance_score = Math.min(1.0, Math.abs(row.fts_rank) / 10);
          const ageMs = now - createdAtMs;
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          const recency_score = Math.exp(-ageDays / 30);
          const tier_score = TIER_SCORES[mappedTier] || 0.2;
          const accessCount = row.access_count ?? 0;
          const frequency_score = accessCount > 0 ? Math.log(accessCount + 1) / Math.log(101) : 0;

          const score =
            relevance_score * 0.40 +
            recency_score * 0.25 +
            tier_score * 0.15 +
            0 * 0.10 + // proximity
            frequency_score * 0.10;

          results.push({ memory, score, relevance_score, recency_score, tier_score, proximity_score: 0, frequency_score });
        }

        return results;
      } finally {
        rescueDb.close();
      }
    } catch {
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  _rowToMemory(row, accessed_at, access_count) {
    return {
      id: row.id,
      tier: row.tier,
      content: row.content,
      tags: JSON.parse(row.tags),
      related_files: JSON.parse(row.related_files),
      session_id: row.session_id,
      project_path: row.project_path,
      created_at: row.created_at,
      accessed_at: accessed_at ?? row.accessed_at,
      access_count: access_count ?? row.access_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  close() {
    this.db.close();
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let _instance = null;

/**
 * Get the shared GaiaStorage instance.
 * Uses the default database path: ~/.foundation/gaia-memory.db
 *
 * @param {string} [dbPath] - Custom database path (default: ~/.foundation/gaia-memory.db)
 * @returns {GaiaStorage}
 */
export function getStorage(dbPath) {
  if (!_instance) {
    const path = dbPath || join(homedir(), '.foundation', 'gaia-memory.db');
    _instance = new GaiaStorage(path);
  }
  return _instance;
}

/**
 * Close the shared storage instance.
 */
export function closeStorage() {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}

// Re-export class for custom instances
export { GaiaStorage };

// Convenience exports that use the singleton
export function save(input) { return getStorage().save(input); }
export function search(query, options) { return getStorage().search(query, options); }
export function get(id) { return getStorage().get(id); }
export function del(id) { return getStorage().delete(id); }
export function link(fromId, toId, type) { return getStorage().link(fromId, toId, type); }
export function stats() { return getStorage().stats(); }

/**
 * Get recent memories without FTS5 (safe alternative to search('*')).
 *
 * @param {object} [options]
 * @param {string[]} [options.tiers] - Filter by tiers
 * @param {number} [options.limit=20] - Max results
 * @param {string} [options.project_path] - Filter by project path
 * @returns {Array<{ memory, score: number }>}
 */
export function getRecent(options = {}) {
  const { tiers, limit = 20, project_path } = options;
  const storage = getStorage();

  let sql = 'SELECT * FROM memories WHERE 1=1';
  const params = [];

  if (tiers && tiers.length > 0) {
    sql += ` AND tier IN (${tiers.map(() => '?').join(',')})`;
    params.push(...tiers);
  }

  if (project_path) {
    sql += ' AND project_path = ?';
    params.push(project_path);
  }

  sql += ' ORDER BY accessed_at DESC LIMIT ?';
  params.push(limit);

  const rows = storage.db.prepare(sql).all(...params);
  return rows.map(row => ({ memory: storage._rowToMemory(row), score: 1.0 }));
}
