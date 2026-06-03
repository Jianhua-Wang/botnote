-- 0011's WHERE clause assumed completed_at = updated_at after 0010, but the
-- BEFORE-UPDATE trigger bumps updated_at on every UPDATE, so 0010 set
-- completed_at to OLD.updated_at and the trigger then advanced updated_at past
-- it. As a result 0011 matched nothing.
--
-- This pass forces COALESCE(due_at, updated_at) onto every done task whose
-- completed_at still falls before the 0010 backfill window — i.e. data the
-- service layer has not freshly written. Anything completed by the running
-- daemon after 0010 ran will have a strictly later completed_at and is left
-- alone.
UPDATE entities
SET completed_at = COALESCE(due_at, updated_at)
WHERE kind = 'task'
  AND status = 'done'
  AND completed_at IS NOT NULL
  AND completed_at < '2026-06-03 23:56:00+00';
