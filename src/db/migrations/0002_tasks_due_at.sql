-- botnote 0002 — tasks need due dates for the Calendar view.
-- Idempotent: safe to re-run.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE INDEX IF NOT EXISTS entities_due_at_idx
  ON entities(due_at) WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS entities_kind_due_at_idx
  ON entities(kind, due_at) WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS entities_task_due_idx
  ON entities(due_at) WHERE kind = 'task' AND due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS entities_task_no_due_idx
  ON entities(created_at DESC) WHERE kind = 'task' AND due_at IS NULL AND status NOT IN ('done', 'archived');
