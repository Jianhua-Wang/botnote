-- Date-only due dates may be imported as `YYYY-MM-DD T00:00:00Z`,
-- which lands the previous calendar day in any UTC-negative timezone
-- (e.g. UTC midnight = 5pm Pacific the day before). Bump every midnight-UTC
-- due_at to noon-UTC so it stays on the intended calendar day in every
-- timezone (UTC-12 .. UTC+11). The service layer applies the same
-- normalization to new writes so this stays clean going forward.
UPDATE entities
SET due_at = date_trunc('day', due_at AT TIME ZONE 'UTC') + INTERVAL '12 hours'
WHERE kind = 'task'
  AND due_at IS NOT NULL
  AND EXTRACT(HOUR FROM due_at AT TIME ZONE 'UTC') = 0
  AND EXTRACT(MINUTE FROM due_at AT TIME ZONE 'UTC') = 0
  AND EXTRACT(SECOND FROM due_at AT TIME ZONE 'UTC') = 0;
