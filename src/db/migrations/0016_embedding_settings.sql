-- botnote 0016 embedding settings
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS embedding_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  enabled boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL DEFAULT 'text-embedding-3-small',
  base_url text,
  api_key text,
  dimensions integer NOT NULL DEFAULT 384,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO embedding_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS embedding_settings_touch_updated_at ON embedding_settings;
CREATE TRIGGER embedding_settings_touch_updated_at
  BEFORE UPDATE ON embedding_settings
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();
