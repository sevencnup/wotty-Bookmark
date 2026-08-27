CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  dav_file_id TEXT NOT NULL REFERENCES dav_files(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  etag TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS file_versions_dav_file_created_at_idx
  ON file_versions(dav_file_id, created_at DESC);
