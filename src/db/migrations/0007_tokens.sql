-- API tokens. token_hash stores sha256 of the plaintext token; prefix is the first
-- 8 chars of the plaintext (for display). Auth middleware enforcement is off by
-- default (botnote currently expects tailnet-only access); these endpoints exist
-- so the UI can grant/revoke tokens and Boss can enable enforcement later.
CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tokens_created_idx ON tokens(created_at DESC);
