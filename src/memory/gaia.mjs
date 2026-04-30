/**
 * Foundation v3 — Gaia memory adapter for hooks.
 *
 * Bridges the plugin hooks (SessionStart/SessionEnd) to the published
 * @sashabogi/foundation package's MemoriaStorage class.
 *
 * Without this adapter the hooks crash with ERR_MODULE_NOT_FOUND because
 * the 3.0.1 publish stripped src/ but the hooks still import from it.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { MemoriaStorage } from "@sashabogi/foundation/dist/tools/gaia/storage.js";

const DB_PATH = join(homedir(), ".foundation", "gaia-memory.db");

let _storage = null;

function getStorage() {
  if (!_storage) {
    _storage = new MemoriaStorage(DB_PATH);
  }
  return _storage;
}

export function save(input) {
  return getStorage().saveMemory({
    tier: input.tier,
    content: input.content,
    tags: input.tags ?? [],
    related_files: input.related_files ?? [],
    session_id: input.session_id,
    project_path: input.project_path,
    metadata: input.metadata,
  });
}

export function search(options) {
  return getStorage().search(options);
}

export function getRecent(options = {}) {
  return getStorage().getRecent({
    tiers: options.tiers,
    limit: options.limit,
  });
}

export function closeStorage() {
  if (_storage) {
    try {
      _storage.close();
    } catch {
      // best-effort cleanup
    }
    _storage = null;
  }
}
