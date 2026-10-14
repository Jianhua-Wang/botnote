-- Data invariants compared before and after a migration rehearsal.
-- Every row is "<metric>|<value>" so two runs can be diffed line by line.
-- Keep this expand-only too: add metrics, never rename existing ones.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'

SELECT 'table_count:' || t.name, (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || t.name, false, true, '')))[1]::text
FROM (VALUES ('projects'), ('entities'), ('edges'), ('recurrence_rules'), ('recurrence_exceptions'),
             ('tokens'), ('sessions'), ('embedding_settings'), ('workspace_settings')) AS t(name)
ORDER BY 1;

SELECT 'entities_by_kind_status:' || kind || ':' || COALESCE(status, '-'), count(*)
FROM entities GROUP BY kind, status ORDER BY 1;

SELECT 'entities_trashed', count(*) FROM entities WHERE deleted_at IS NOT NULL;
SELECT 'entities_with_parent', count(*) FROM entities WHERE parent_id IS NOT NULL;
SELECT 'entities_self_parent', count(*) FROM entities WHERE parent_id = id;
SELECT 'entities_with_vector', count(*) FROM entities WHERE body_vec IS NOT NULL;
SELECT 'entities_with_idempotency_key', count(*) FROM entities WHERE idempotency_key IS NOT NULL;
SELECT 'entities_distinct_idempotency_key', count(DISTINCT idempotency_key) FROM entities WHERE idempotency_key IS NOT NULL;

SELECT 'max_seq:' || p.key, COALESCE(max(e.sequence_id), 0)
FROM projects p LEFT JOIN entities e ON e.project_id = p.id
GROUP BY p.key ORDER BY 1;

SELECT 'seq_rows:' || p.key, count(e.sequence_id)
FROM projects p LEFT JOIN entities e ON e.project_id = p.id
GROUP BY p.key ORDER BY 1;

SELECT 'seq_duplicates', count(*) FROM (
  SELECT project_id, sequence_id FROM entities
  WHERE sequence_id IS NOT NULL GROUP BY project_id, sequence_id HAVING count(*) > 1
) d;

SELECT 'edges_by_kind:' || kind, count(*) FROM edges GROUP BY kind ORDER BY 1;
SELECT 'edges_self', count(*) FROM edges WHERE from_id = to_id;

SELECT 'recurrence_rules_active', count(*) FROM recurrence_rules WHERE enabled AND ended_at IS NULL;
SELECT 'recurrence_rules_by_anchor:' || anchor, count(*) FROM recurrence_rules GROUP BY anchor ORDER BY 1;
SELECT 'recurrence_generated_total', COALESCE(sum(generated_count), 0) FROM recurrence_rules;

SELECT 'oldest_entity', min(created_at)::text FROM entities;
SELECT 'newest_entity', max(created_at)::text FROM entities;
SELECT 'body_bytes_total', COALESCE(sum(octet_length(body)), 0) FROM entities;
