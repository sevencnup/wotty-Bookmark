CREATE TABLE IF NOT EXISTS floccus_secrets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  nonce BLOB NOT NULL,
  encrypted_passphrase BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE bookmark_sync_state
  ADD COLUMN source_identity_ready INTEGER NOT NULL DEFAULT 0
  CHECK (source_identity_ready IN (0, 1));
