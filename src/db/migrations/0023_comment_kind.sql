-- botnote 0023 — reintroduce the 'comment' entity kind as an append-only
-- worklog attached to a task (parent_id). Unlike the pre-0008 comment kind,
-- these have a concrete product role: agent/human progress notes that the
-- opening brief surfaces for in_progress tasks.
-- Idempotent.

-- Comments carry project_id (so project-scoped search/recent include them)
-- but must NOT consume a per-project sequence number — KEY-SEQ identifiers
-- are for addressable work items (tasks/notes), not log lines.
CREATE OR REPLACE FUNCTION botnote_set_sequence_id() RETURNS trigger AS $$
BEGIN
  IF NEW.sequence_id IS NULL AND NEW.project_id IS NOT NULL AND NEW.kind <> 'comment' THEN
    SELECT COALESCE(MAX(sequence_id), 0) + 1
      INTO NEW.sequence_id
      FROM entities
      WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fast "latest comment per task" lookups for the opening brief.
CREATE INDEX IF NOT EXISTS entities_comment_parent_created_idx
  ON entities(parent_id, created_at DESC) WHERE kind = 'comment';
