import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { edges, entities, type Entity } from "../db/schema.js";
import type { LinkInput, RecentInput, UpdateInput, WriteInput } from "./types.js";

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
      title: input.title,
      body: input.body,
      tags: input.tags,
      status: input.status,
      parentId: input.parentId ?? null,
      actorId: input.actorId ?? null,
      actorKind: input.actorKind,
      metadata: input.metadata,
      dueAt: input.dueAt ?? null,
      priority: input.priority,
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
  const [row] = await db.update(entities).set(fields).where(eq(entities.id, id)).returning();
  if (!row) throw new Error(`entity ${id} not found`);
  return row;
}

export async function get(db: Database["db"], id: string): Promise<Entity | null> {
  const rows = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
  return rows[0] ?? null;
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
