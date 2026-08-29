ALTER TABLE bookmark_nodes ADD COLUMN floccus_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS bookmark_nodes_user_floccus_id_idx
  ON bookmark_nodes(user_id, floccus_id)
  WHERE floccus_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookmark_sync_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  highest_id INTEGER NOT NULL DEFAULT 0 CHECK (highest_id >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
