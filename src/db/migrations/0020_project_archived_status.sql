-- botnote 0020 — make archive a project status.
-- Idempotent: safe to re-run.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('planned', 'active', 'watching', 'paused', 'archived'));

UPDATE projects
SET status = 'archived'
WHERE archived_at IS NOT NULL
  AND status <> 'archived';

UPDATE projects
SET archived_at = now()
WHERE status = 'archived'
  AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_status_key_idx
  ON projects(status, key);
