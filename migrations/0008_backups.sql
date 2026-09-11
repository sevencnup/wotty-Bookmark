CREATE TABLE IF NOT EXISTS backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  daily_time TEXT NOT NULL DEFAULT '03:00',
  retention_count INTEGER NOT NULL DEFAULT 7,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_status TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO backup_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  backup_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS backup_runs_created_at_idx
  ON backup_runs(created_at DESC);
