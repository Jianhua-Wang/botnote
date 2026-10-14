import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import type { Scope } from "./scope.js";

/** An unfinished task that `blocks` another one, as a resuming agent should see it. */
export interface Blocker {
  id: string;
  /** KEY-SEQ when the blocker belongs to a project, else kind/uuid-prefix. */
  ref: string;
  title: string;
  status: string | null;
}

export type WithBlockers<T> = T & { blockedBy: Blocker[] };

/**
 * Incoming `blocks` edges for the given tasks whose source is still unfinished.
 * Done, rejected, archived and deleted blockers no longer block anything.
 * Returns a map blocked task id → blockers, oldest edge first; tasks without
 * live blockers are absent from the map.
 */
export async function blockersFor(
  scope: Scope,
  db: Database["db"],
  taskIds: string[]
): Promise<Map<string, Blocker[]>> {
  const out = new Map<string, Blocker[]>();
  if (taskIds.length === 0) return out;

  const idList = sql.join(
    taskIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );
  const rows = await db.execute<{
    blocked_id: string;
    id: string;
    kind: string;
    title: string | null;
    body: string;
    status: string | null;
    sequence_id: number | null;
    project_key: string | null;
  }>(sql`
    SELECT e.to_id AS blocked_id, b.id, b.kind, b.title, b.body, b.status, b.sequence_id, p.key AS project_key
    FROM edges e
    JOIN entities b ON b.id = e.from_id
    LEFT JOIN projects p ON p.id = b.project_id
    WHERE e.kind = 'blocks'
      AND e.to_id IN (${idList})
      AND b.workspace_id = ${scope.workspaceId}::uuid
      AND b.deleted_at IS NULL
      AND (b.status IS NULL OR b.status NOT IN ('done', 'rejected', 'archived'))
    ORDER BY e.created_at ASC
  `);

  for (const r of rows.rows) {
    const ref =
      r.project_key && r.sequence_id != null
        ? `${r.project_key}-${r.sequence_id}`
        : `${r.kind}/${r.id.slice(0, 8)}`;
    const title =
      (r.title && r.title.trim()) ||
      r.body.split("\n").find((l) => l.trim())?.trim().slice(0, 60) ||
      "(untitled)";
    const list = out.get(r.blocked_id) ?? [];
    list.push({ id: r.id, ref, title, status: r.status });
    out.set(r.blocked_id, list);
  }
  return out;
}

/** Decorate task rows with an additive `blockedBy` array (empty when unblocked). */
export async function attachBlockers<T extends { id: string }>(
  scope: Scope,
  db: Database["db"],
  rows: T[]
): Promise<WithBlockers<T>[]> {
  const blockers = await blockersFor(
    scope,
    db,
    rows.map((r) => r.id)
  );
  return rows.map((r) => ({ ...r, blockedBy: blockers.get(r.id) ?? [] }));
}
