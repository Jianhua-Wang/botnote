-- Memory upgrade: access tracking + supersedes edges.
--
-- last_accessed_at / access_count are bumped on explicit entity reads
-- (GET /v1/entities/:id and by-key lookups) and feed a light boost into
-- hybrid search so frequently-recalled memories rank slightly higher.
--
-- The 'supersedes' edge kind (new note -> outdated note) needs no schema
-- change (edges.kind is text); search downweights entities that are the
-- target of a supersedes edge.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0;
