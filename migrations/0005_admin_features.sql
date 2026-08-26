CREATE TABLE IF NOT EXISTS bookmark_trash (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  folder_path TEXT NOT NULL DEFAULT '',
  original_position INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bookmark_trash_user_deleted_at_idx
  ON bookmark_trash(user_id, deleted_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'browser',
  user_agent_summary TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  UNIQUE(user_id, client_id)
);

CREATE INDEX IF NOT EXISTS devices_user_last_seen_idx
  ON devices(user_id, last_seen_at DESC);

ALTER TABLE sessions ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions(device_id);
