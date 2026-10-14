-- Write attribution (BOT-108): remember which API token wrote an entity so
-- the brief and the UI can say "written by <token name>" instead of the bare
-- actor_kind. Nullable and expand-only: rows written through a session
-- cookie, the trusted loopback path, or by N-1 code simply carry NULL.
-- Revoking a token keeps the rows and clears the reference.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS actor_token_id uuid REFERENCES tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entities_actor_token_idx
  ON entities (actor_token_id)
  WHERE actor_token_id IS NOT NULL;
