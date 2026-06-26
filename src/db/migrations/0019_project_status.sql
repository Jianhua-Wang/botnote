-- botnote 0019 — project lifecycle status.
-- Idempotent: safe to re-run.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE projects
SET status = 'active'
WHERE status IS NULL;

DO $$
BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_status_check
    CHECK (status IN ('planned', 'active', 'watching', 'paused', 'archived'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS projects_active_status_idx
  ON projects(status, key)
  WHERE status <> 'archived';
