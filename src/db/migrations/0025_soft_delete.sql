-- Soft delete / trash bin. deleted_at marks an entity as trashed: hidden from
-- every read path (search, recent, tasks-range, briefs, comments, feedback)
-- but restorable until the retention purge hard-deletes it. Projects are not
-- part of the trash — they keep their own archive lifecycle.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: the trash view and the retention purge only ever scan
-- trashed rows, which stay a tiny fraction of the table.
CREATE INDEX IF NOT EXISTS entities_deleted_at_idx
  ON entities (deleted_at)
  WHERE deleted_at IS NOT NULL;
