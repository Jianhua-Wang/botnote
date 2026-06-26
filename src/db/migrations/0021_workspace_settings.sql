-- botnote 0021 workspace settings
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS workspace_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspace_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS workspace_settings_touch_updated_at ON workspace_settings;
CREATE TRIGGER workspace_settings_touch_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();
