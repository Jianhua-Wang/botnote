import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { edges, entities, projects, type Entity } from "../db/schema.js";
import type { LinkInput, RecentInput, UpdateInput, WriteInput } from "./types.js";

/**
 * Snap an exact-midnight-UTC due date to noon UTC. Date-only intents (e.g.
 * "due 2026-06-03") arriving as `2026-06-03T00:00:00Z` would render as the
 * previous calendar day in any UTC-negative timezone. Noon UTC stays on the
 * intended day across UTC-12..UTC+11. Anything with a non-zero time
 * component is left alone — that's a real datetime, not a calendar date.
 */
function normalizeDueAt(value: Date | null | undefined): Date | null {
  if (value == null) return null;
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    const noon = new Date(value);
    noon.setUTCHours(12);
    return noon;
  }
  return value;
}

export async function write(db: Database["db"], input: WriteInput): Promise<Entity> {
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(entities)
      .where(eq(entities.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing.length > 0) return existing[0]!;
  }

  const [row] = await db
    .insert(entities)
    .values({
      kind: input.kind,
      projectId: input.projectId ?? null,
      title: input.title ?? null,
      body: input.body,
      tags: input.tags,
      status: input.status,
      parentId: input.parentId ?? null,
      actorKind: input.actorKind,
      metadata: input.metadata,
      dueAt: normalizeDueAt(input.dueAt),
      priority: input.priority,
      pinned: input.pinned,
      // Mirror the PATCH path: a task created already-done gets a
      // completedAt stamp so the calendar renders it on the right day.
      completedAt: input.status === "done" ? new Date() : null,
      idempotencyKey: input.idempotencyKey ?? null
    })
    .returning();

  if (!row) throw new Error("entities insert returned no row");

  if (input.parentId) {
    await db
      .insert(edges)
      .values({ fromId: input.parentId, toId: row.id, kind: "parent_of" })
      .onConflictDoNothing();
  }
  return row;
}

export async function update(
  db: Database["db"],
  id: string,
  fields: UpdateInput
): Promise<Entity> {
  const set: Record<string, unknown> = { ...fields, updatedAt: new Date() };
  if (fields.dueAt !== undefined) {
    set.dueAt = normalizeDueAt(fields.dueAt);
  }
  // Maintain completedAt as a side effect of status transitions. We need the
  // prior status to know whether this is an entry into or exit from 'done',
  // so do a tiny read first — cheaper than a CASE expression on UPDATE and
  // keeps the SQL the same shape as other writes.
  if (fields.status !== undefined) {
    const prior = await db
      .select({ status: entities.status })
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);
    if (!prior[0]) throw new Error(`entity ${id} not found`);
    const wasDone = prior[0].status === "done";
    const isDone = fields.status === "done";
    if (isDone && !wasDone) set.completedAt = new Date();
    else if (!isDone && wasDone) set.completedAt = null;
  }
  const [row] = await db.update(entities).set(set).where(eq(entities.id, id)).returning();
  if (!row) throw new Error(`entity ${id} not found`);
  if (fields.parentId !== undefined && fields.parentId !== null) {
    await db
      .insert(edges)
      .values({ fromId: fields.parentId, toId: row.id, kind: "parent_of" })
      .onConflictDoNothing();
  }
  return row;
}

export async function listRelated(
  db: Database["db"],
  parentId: string
): Promise<Entity[]> {
  return db
    .select()
    .from(entities)
    .where(eq(entities.parentId, parentId))
    .orderBy(desc(entities.createdAt));
}

export async function get(db: Database["db"], id: string): Promise<Entity | null> {
  const rows = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an entity by its human-readable identifier — e.g. project key `DEMO`
 * + sequence id `12` resolves to the entity displayed as `DEMO-12`.
 */
export async function getByKey(
  db: Database["db"],
  projectKey: string,
  sequenceId: number
): Promise<Entity | null> {
  const rows = await db
    .select({ e: entities })
    .from(entities)
    .innerJoin(projects, eq(entities.projectId, projects.id))
    .where(and(eq(projects.key, projectKey), eq(entities.sequenceId, sequenceId)))
    .limit(1);
  return rows[0]?.e ?? null;
}

export async function remove(db: Database["db"], id: string): Promise<boolean> {
  const res = await db.delete(entities).where(eq(entities.id, id)).returning({ id: entities.id });
  return res.length > 0;
}

export async function recent(db: Database["db"], input: RecentInput): Promise<Entity[]> {
  const conds = [];
  if (input.projectId) conds.push(eq(entities.projectId, input.projectId));
  else if (input.projectId === null) conds.push(isNull(entities.projectId));
  if (input.since) conds.push(gte(entities.createdAt, input.since));
  if (input.kinds?.length) conds.push(inArray(entities.kind, input.kinds));
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select()
    .from(entities)
    .where(where)
    .orderBy(desc(entities.createdAt))
    .limit(input.limit);
}

export async function link(
  db: Database["db"],
  input: LinkInput
): Promise<{ fromId: string; toId: string; kind: string; created: boolean }> {
  const result = await db
    .insert(edges)
    .values({ fromId: input.fromId, toId: input.toId, kind: input.kind })
    .onConflictDoNothing()
    .returning();
  return {
    fromId: input.fromId,
    toId: input.toId,
    kind: input.kind,
    created: result.length > 0
  };
}

export async function listChildren(db: Database["db"], parentId: string): Promise<Entity[]> {
  const childIds = await db
    .select({ toId: edges.toId })
    .from(edges)
    .where(and(eq(edges.fromId, parentId), eq(edges.kind, "parent_of")));
  if (childIds.length === 0) return [];
  return db
    .select()
    .from(entities)
    .where(
      inArray(
        entities.id,
        childIds.map((c) => c.toId)
      )
    )
    .orderBy(desc(entities.createdAt));
}

export async function setBodyVec(
  db: Database["db"],
  id: string,
  vec: number[]
): Promise<void> {
  await db.execute(
    sql`UPDATE entities SET body_vec = ${`[${vec.join(",")}]`}::vector WHERE id = ${id}`
  );
}
