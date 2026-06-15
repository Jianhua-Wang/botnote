-- Store newly generated API tokens so Settings can copy them after creation.
-- Existing tokens remain NULL because only their sha256 hashes were stored.
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS plaintext text;
