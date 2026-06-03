-- Allow title to be null (notes without a title use body-derived placeholder in UI).
ALTER TABLE entities ALTER COLUMN title DROP NOT NULL;

-- Index parent_id for fast lookups of related entities (e.g. notes linked to a task).
CREATE INDEX IF NOT EXISTS entities_parent_idx ON entities(parent_id) WHERE parent_id IS NOT NULL;
