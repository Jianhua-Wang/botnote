-- Content history: one row per content-changing update, holding the values
-- as they were BEFORE that update. actor_* name who made the change that
-- replaced this snapshot. Expand-only; 0.2.x code ignores the table.
CREATE TABLE IF NOT EXISTS entity_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  title text,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  priority text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'open',
  actor_kind text NOT NULL DEFAULT 'human',
  actor_token_id uuid REFERENCES tokens(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_revisions_entity_revision_idx
  ON entity_revisions (entity_id, revision DESC);
