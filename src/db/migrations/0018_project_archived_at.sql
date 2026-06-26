-- botnote 0018 — project archival state.
-- Idempotent: safe to re-run.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_active_key_idx
  ON projects(key)
  WHERE archived_at IS NULL;
