-- Fix the 0010 backfill. The first pass used updated_at, which for tasks
-- migrated from Plane is the migration day — so every legacy done task piled
-- onto the same calendar cell. Re-backfill with COALESCE(due_at, updated_at)
-- so legacy done items render on their original due date (the pre-change
-- behavior), while freshly-completed tasks still get an exact stamp from the
-- service layer at status-transition time.
UPDATE entities
SET completed_at = COALESCE(due_at, updated_at)
WHERE kind = 'task'
  AND status = 'done'
  -- Only rows whose completed_at matches the 0010 backfill exactly (i.e.
  -- never updated since). Real recent completions have completed_at != updated_at
  -- once anything else touches the row, so this avoids stomping on real data.
  AND completed_at = updated_at;
