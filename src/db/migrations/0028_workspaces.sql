-- Workspaces: the tenant boundary shared by the single-user OSS build and the
-- hosted multi-user build (BOT-113, subtask 1 of BOT-101).
--
-- Schema only. Every tenant table gains workspace_id with a DEFAULT pointing
-- at the fixed default workspace, which backfills existing rows in the same
-- statement and keeps inserts from the previous release working. Service code
-- starts filtering by it in the next release (BOT-114); the old global unique
-- indexes stay until that release has shipped.

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_idx ON workspaces (slug);

DROP TRIGGER IF EXISTS workspaces_touch_updated_at ON workspaces;
CREATE TRIGGER workspaces_touch_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();

INSERT INTO workspaces (id, slug, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Default workspace')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE recurrence_rules
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE embedding_settings
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL
    DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES workspaces(id);

-- Tenant-scoped uniqueness. The global projects_key_idx and
-- entities_idempotency_idx remain for one release so the current code keeps
-- its guarantees; BOT-114 drops them once every query is scoped.
CREATE UNIQUE INDEX IF NOT EXISTS projects_ws_key_unique
  ON projects (workspace_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS entities_ws_idem_unique
  ON entities (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS entities_ws_kind_created_idx
  ON entities (workspace_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS recurrence_rules_ws_idx
  ON recurrence_rules (workspace_id, enabled, next_occurrence_at);
CREATE INDEX IF NOT EXISTS tokens_ws_idx ON tokens (workspace_id);
CREATE INDEX IF NOT EXISTS sessions_ws_idx ON sessions (workspace_id);
