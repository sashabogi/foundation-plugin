/**
 * Open Brain — Cloud Memory via Supabase Edge Function
 *
 * Wrapper for the Open Brain Supabase Edge Function that provides
 * semantic search (pgvector) and auto-metadata extraction.
 *
 * Uses native Node.js fetch() — no external HTTP dependencies needed.
 */

const DEFAULT_ENDPOINT = '';

// ============================================================================
// Configuration
// ============================================================================

function getConfig() {
  const url = process.env.OPEN_BRAIN_URL || DEFAULT_ENDPOINT;
  const key = process.env.OPEN_BRAIN_KEY;

  if (!url || !key) {
    return { url, key: null, configured: false };
  }

  return { url, key, configured: true };
}

// ============================================================================
// JSON-RPC Transport
// ============================================================================

/**
 * Send a JSON-RPC tools/call request to the Open Brain edge function.
 *
 * @param {string} toolName - MCP tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
async function callTool(toolName, args) {
  const config = getConfig();
  if (!config.configured) {
    return { success: false, error: 'OPEN_BRAIN_KEY not set. Set the OPEN_BRAIN_KEY environment variable.' };
  }

  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  try {
    const response = await fetch(`${config.url}?key=${config.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    if (response.status === 204) {
      return { success: true, text: 'OK' };
    }

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message || JSON.stringify(data.error) };
    }

    // Extract text content from MCP response
    const text = data.result?.content
      ?.filter(c => c.type === 'text')
      ?.map(c => c.text)
      ?.join('\n') || '';

    return { success: true, text };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Capture a thought to Open Brain.
 * Auto-generates embeddings and extracts metadata (type, topics, people, sentiment).
 *
 * @param {string} content - The thought content to capture
 * @param {string} [source='foundation-plugin'] - Where this thought came from
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function capture(content, source = 'foundation-plugin') {
  return callTool('capture_thought', { content, source });
}

/**
 * Search thoughts using semantic similarity (pgvector).
 * Finds thoughts by meaning, not just keywords.
 *
 * @param {string} query - Natural language search query
 * @param {object} [options]
 * @param {number} [options.limit=5] - Max results
 * @param {number} [options.threshold=0.7] - Similarity threshold 0-1
 * @param {object} [options.filter] - Filter by metadata fields (e.g., { type: 'decision' })
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function search(query, options = {}) {
  return callTool('search_thoughts', {
    query,
    limit: options.limit || 5,
    threshold: options.threshold || 0.7,
    filter: options.filter || {},
  });
}

/**
 * List recent thoughts, optionally filtered.
 *
 * @param {object} [options]
 * @param {number} [options.limit=10] - Max results
 * @param {string} [options.type] - Filter by type (idea, decision, observation, etc.)
 * @param {string} [options.topic] - Filter by topic
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function list(options = {}) {
  const args = {};
  if (options.limit) args.limit = options.limit;
  if (options.type) args.type = options.type;
  if (options.topic) args.topic = options.topic;
  return callTool('list_thoughts', args);
}

/**
 * Get statistics about the Open Brain — totals, type breakdown, top topics.
 *
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function stats() {
  return callTool('thought_stats', {});
}

/**
 * Check if Open Brain is configured and reachable.
 *
 * @returns {Promise<{ configured: boolean, reachable: boolean, error?: string }>}
 */
export async function healthCheck() {
  const config = getConfig();

  if (!config.configured) {
    return { configured: false, reachable: false, error: 'OPEN_BRAIN_KEY not set' };
  }

  try {
    const response = await fetch(`${config.url}?key=${config.key}`, {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json();
      return { configured: true, reachable: true, version: data.version };
    }

    return { configured: true, reachable: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { configured: true, reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}
