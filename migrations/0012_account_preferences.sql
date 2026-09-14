CREATE TABLE IF NOT EXISTS account_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'zh-CN'
    CHECK (language IN ('zh-CN', 'en')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
