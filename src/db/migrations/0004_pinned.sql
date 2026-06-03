-- botnote 0004 — pinned flag for project-level context surfacing.
-- Idempotent.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entities_pinned_idx
  ON entities(project_id, pinned)
  WHERE pinned = true;
