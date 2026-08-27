CREATE TABLE IF NOT EXISTS bookmark_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES bookmark_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'bookmark')),
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((node_type = 'folder' AND url IS NULL) OR (node_type = 'bookmark' AND url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS bookmark_nodes_user_parent_position_idx
  ON bookmark_nodes(user_id, parent_id, position, id);

CREATE INDEX IF NOT EXISTS bookmark_nodes_user_type_idx
  ON bookmark_nodes(user_id, node_type);
