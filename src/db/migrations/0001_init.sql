-- botnote 0001 init schema
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  agents_md text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_key_idx ON projects(key);

CREATE TABLE IF NOT EXISTS actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS actors_name_idx ON actors(name);
CREATE UNIQUE INDEX IF NOT EXISTS actors_key_idx ON actors(key);

CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'open',
  actor_id uuid REFERENCES actors(id),
  actor_kind text NOT NULL DEFAULT 'human',
  idempotency_key text,
  parent_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  body_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) STORED,
  body_vec vector(384),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entities_project_created_idx
  ON entities(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entities_project_kind_created_idx
  ON entities(project_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS entities_actor_created_idx
  ON entities(actor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS entities_idempotency_idx
  ON entities(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS entities_body_tsv_idx
  ON entities USING GIN(body_tsv);
CREATE INDEX IF NOT EXISTS entities_body_vec_idx
  ON entities USING hnsw (body_vec vector_cosine_ops);
CREATE INDEX IF NOT EXISTS entities_tags_idx
  ON entities USING GIN(tags);

CREATE TABLE IF NOT EXISTS edges (
  from_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id, kind)
);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges(to_id, kind);
CREATE INDEX IF NOT EXISTS edges_from_idx ON edges(from_id, kind);

-- updated_at trigger
CREATE OR REPLACE FUNCTION botnote_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_touch_updated_at ON entities;
CREATE TRIGGER entities_touch_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();

DROP TRIGGER IF EXISTS projects_touch_updated_at ON projects;
CREATE TRIGGER projects_touch_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();
