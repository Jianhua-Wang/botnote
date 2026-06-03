-- Add completed_at column to entities. Set automatically on a status
-- transition into 'done' (and cleared when leaving). Backfill existing done
-- rows from updated_at as the best available approximation — Plane-migrated
-- tasks lost their original timestamp, so this clusters them on the migration
-- day rather than guessing. New transitions are exact.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE entities
SET completed_at = updated_at
WHERE kind = 'task' AND status = 'done' AND completed_at IS NULL;

-- Partial index — only done rows have a non-null completed_at, so this stays
-- small and keeps range scans cheap when the calendar queries by completed
-- date.
CREATE INDEX IF NOT EXISTS entities_completed_at_idx
  ON entities (completed_at)
  WHERE completed_at IS NOT NULL;
