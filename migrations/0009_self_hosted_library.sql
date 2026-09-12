-- The self-hosted library is intentionally separate from bookmark_nodes.
-- bookmark_nodes is the Floccus/XBEL synchronization index and must never be
-- rewritten by a browser sidebar operating in server-library mode.
CREATE TABLE IF NOT EXISTS library_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES library_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'bookmark')),
  title TEXT NOT NULL,
  url TEXT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  deleted_at TEXT,
  deleted_root_id TEXT,
  original_parent_id TEXT,
  original_position INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((node_type = 'folder' AND url IS NULL) OR (node_type = 'bookmark' AND url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS library_nodes_user_parent_position_idx
  ON library_nodes(user_id, parent_id, position, id);

CREATE INDEX IF NOT EXISTS library_nodes_user_deleted_idx
  ON library_nodes(user_id, deleted_at, deleted_root_id);
