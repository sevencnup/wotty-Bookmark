ALTER TABLE account_preferences
  ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'server'
  CHECK (source_mode IN ('browser', 'server'));
