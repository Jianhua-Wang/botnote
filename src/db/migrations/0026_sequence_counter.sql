-- Replace the MAX(sequence_id)+1 trigger with a per-project counter.
--
-- The old trigger read MAX(sequence_id) outside any lock, so two concurrent
-- inserts into one project could both become KEY-55. The counter lives on
-- projects.next_seq; the trigger's UPDATE takes the project's row lock, which
-- serializes writers. A partial unique index makes a duplicate impossible
-- rather than merely unlikely.
--
-- Expand-only: the previous release never reads next_seq, and the replaced
-- trigger keeps the same signature and guards.

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT project_id, sequence_id FROM entities
    WHERE sequence_id IS NOT NULL
    GROUP BY project_id, sequence_id HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'migration 0026 aborted: % duplicate (project_id, sequence_id) pair(s) exist; resolve them before adding the unique index',
      dup_count;
  END IF;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_seq integer NOT NULL DEFAULT 1;

UPDATE projects p
SET next_seq = COALESCE(
  (SELECT MAX(e.sequence_id) FROM entities e WHERE e.project_id = p.id), 0
) + 1;

CREATE OR REPLACE FUNCTION botnote_set_sequence_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_id IS NULL OR NEW.kind = 'comment' THEN
    RETURN NEW;
  END IF;

  IF NEW.sequence_id IS NULL THEN
    UPDATE projects
    SET next_seq = next_seq + 1
    WHERE id = NEW.project_id
    RETURNING next_seq - 1 INTO NEW.sequence_id;
  ELSE
    -- An explicit sequence id (imports, repairs) must never leave the
    -- counter behind it, or the next auto-assigned id would collide.
    UPDATE projects
    SET next_seq = GREATEST(next_seq, NEW.sequence_id + 1)
    WHERE id = NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE UNIQUE INDEX IF NOT EXISTS entities_project_seq_unique
  ON entities (project_id, sequence_id)
  WHERE sequence_id IS NOT NULL;
