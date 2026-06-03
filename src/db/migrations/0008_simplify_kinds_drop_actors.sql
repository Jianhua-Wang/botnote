-- 0008: simplify entity kinds and drop the actors table.
--
-- Why: the original schema had 7 entity kinds (task, note, decision, doc,
-- comment, log, memory) and a separate `actors` table for writer identity.
-- In practice only task and note carry real semantic weight in the UI/agent
-- flows; the others are folded into note with the legacy kind preserved as a
-- tag so nothing is lost. Identity is now expressed by the existing
-- entities.actor_kind text column (human / agent / system) — the actors
-- lookup table never accumulated rows, so we drop it.

-- Fold legacy kinds into 'note'. The previous kind name is appended to tags
-- so we can still query e.g. tag='decision' or tag='memory' if needed.
UPDATE entities
SET tags = array_append(tags, kind), kind = 'note'
WHERE kind IN ('decision', 'doc', 'comment', 'log', 'memory');

-- Drop the FK first to avoid a dependency error, then the column, then the
-- table. None of these had any live rows referencing them.
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_actor_id_fkey;
ALTER TABLE entities DROP COLUMN IF EXISTS actor_id;
DROP TABLE IF EXISTS actors;
