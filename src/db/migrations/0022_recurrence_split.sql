-- botnote 0022 — allow splitting a recurrence series.
-- A split keeps the old rule as frozen history (enabled = false, bounded by
-- UNTIL) and creates a new enabled rule that shares the SAME series_id so the
-- UI still groups history + future as one continuous series. That requires more
-- than one rule per series, so the unique constraint is relaxed to a PARTIAL
-- unique index: at most one ENABLED rule per series, unlimited disabled history.
-- Idempotent: safe to re-run.

DROP INDEX IF EXISTS recurrence_rules_series_idx;

CREATE UNIQUE INDEX IF NOT EXISTS recurrence_rules_series_idx
  ON recurrence_rules(series_id)
  WHERE enabled = true;
