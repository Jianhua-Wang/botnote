-- Workspace scoping is live in service code as of this release (BOT-114,
-- subtask 2 of BOT-101): every tenant-facing query filters by workspace_id and
-- every insert stamps it.
--
-- 1. The per-workspace unique indexes from 0028 (projects_ws_key_unique,
--    entities_ws_idem_unique) now carry the invariant, so the pre-workspace
--    global uniques are redundant and would wrongly reject the same project
--    key or idempotency key reused in a second workspace.
--
-- 2. workspace_settings and embedding_settings were singletons keyed by
--    id = 'default'. They become one row per workspace: the primary key moves
--    to workspace_id and `id` stays as a constant discriminator column. The
--    CHECK (id = 'default') is kept on purpose — it no longer limits the row
--    count once id is not unique, and keeping it means the N-1 code path
--    (INSERT id='default' ... ON CONFLICT DO NOTHING; SELECT WHERE id='default')
--    still runs unchanged against this schema.

DROP INDEX IF EXISTS projects_key_idx;
DROP INDEX IF EXISTS entities_idempotency_idx;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'workspace_settings_pkey'
               AND conrelid = 'workspace_settings'::regclass
               AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)') THEN
    ALTER TABLE workspace_settings DROP CONSTRAINT workspace_settings_pkey;
    ALTER TABLE workspace_settings ADD CONSTRAINT workspace_settings_pkey PRIMARY KEY (workspace_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'embedding_settings_pkey'
               AND conrelid = 'embedding_settings'::regclass
               AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)') THEN
    ALTER TABLE embedding_settings DROP CONSTRAINT embedding_settings_pkey;
    ALTER TABLE embedding_settings ADD CONSTRAINT embedding_settings_pkey PRIMARY KEY (workspace_id);
  END IF;
END $$;
