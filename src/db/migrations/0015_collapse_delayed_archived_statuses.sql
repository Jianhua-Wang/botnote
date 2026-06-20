-- Collapse retired task statuses into done.
--
-- delayed and archived were both ambiguous terminal-ish states. The product
-- now has four task states: open, in_progress, done, rejected. Preserve the
-- best available terminal timestamp by using the previous updated_at value as
-- completed_at before the touch trigger advances updated_at.
UPDATE entities
SET
  status = 'done',
  completed_at = COALESCE(completed_at, updated_at, now())
WHERE kind = 'task'
  AND status IN ('delayed', 'archived');

DROP INDEX IF EXISTS entities_task_no_due_idx;

CREATE INDEX IF NOT EXISTS entities_task_no_due_idx
  ON entities(created_at DESC)
  WHERE kind = 'task' AND due_at IS NULL AND status <> 'done';
