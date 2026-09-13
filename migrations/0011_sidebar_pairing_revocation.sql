ALTER TABLE sidebar_pairings ADD COLUMN revoked_at TEXT;
ALTER TABLE sidebar_pairings ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sidebar_pairings_user_created_at_idx
  ON sidebar_pairings(user_id, created_at DESC);
