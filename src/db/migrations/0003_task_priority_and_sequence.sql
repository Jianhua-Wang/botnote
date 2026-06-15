-- botnote 0003 — priority + per-project sequence id (DEMO-12 style).
-- Idempotent.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'none';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS sequence_id integer;

CREATE INDEX IF NOT EXISTS entities_project_seq_idx
  ON entities(project_id, sequence_id) WHERE sequence_id IS NOT NULL;

-- per-project sequence trigger. Assign sequence_id on INSERT when project_id
-- is set (workspace-wide entities stay null).
CREATE OR REPLACE FUNCTION botnote_set_sequence_id() RETURNS trigger AS $$
BEGIN
  IF NEW.sequence_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sequence_id), 0) + 1
      INTO NEW.sequence_id
      FROM entities
      WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_set_sequence_id ON entities;
CREATE TRIGGER entities_set_sequence_id
  BEFORE INSERT ON entities
  FOR EACH ROW EXECUTE FUNCTION botnote_set_sequence_id();

-- Backfill existing rows that have project_id but no sequence_id, ordered by created_at.
DO $$
DECLARE
  rec record;
  counters jsonb := '{}'::jsonb;
  next_n integer;
BEGIN
  FOR rec IN
    SELECT id, project_id FROM entities
    WHERE project_id IS NOT NULL AND sequence_id IS NULL
    ORDER BY project_id, created_at
  LOOP
    next_n := COALESCE((counters->>rec.project_id::text)::int, 0) + 1;
    counters := jsonb_set(counters, ARRAY[rec.project_id::text], to_jsonb(next_n));
    UPDATE entities SET sequence_id = next_n WHERE id = rec.id;
  END LOOP;
END $$;
