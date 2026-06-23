-- botnote 0017 — recurring task rules.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  current_occurrence_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  rrule text NOT NULL,
  dtstart timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  all_day boolean NOT NULL DEFAULT true,
  anchor text NOT NULL DEFAULT 'scheduled',
  max_instances_ahead integer NOT NULL DEFAULT 1,
  generated_count integer NOT NULL DEFAULT 1,
  last_occurrence_at timestamptz,
  next_occurrence_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recurrence_rules_series_idx
  ON recurrence_rules(series_id);

CREATE INDEX IF NOT EXISTS recurrence_rules_current_occurrence_idx
  ON recurrence_rules(current_occurrence_id);

CREATE INDEX IF NOT EXISTS recurrence_rules_next_occurrence_idx
  ON recurrence_rules(next_occurrence_at)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS recurrence_rules_enabled_idx
  ON recurrence_rules(enabled, next_occurrence_at);

DROP TRIGGER IF EXISTS recurrence_rules_touch_updated_at ON recurrence_rules;
CREATE TRIGGER recurrence_rules_touch_updated_at
  BEFORE UPDATE ON recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION botnote_touch_updated_at();

CREATE TABLE IF NOT EXISTS recurrence_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurrence_at timestamptz NOT NULL,
  action text NOT NULL,
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurrence_exceptions_rule_occurrence_idx
  ON recurrence_exceptions(rule_id, occurrence_at);

CREATE INDEX IF NOT EXISTS recurrence_exceptions_entity_idx
  ON recurrence_exceptions(entity_id);
