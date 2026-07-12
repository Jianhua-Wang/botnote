import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { edges, entities, projects, type Entity, type EdgeKind } from "../db/schema.js";
import { normalizeDueAt } from "./dates.js";
import {
  advanceRecurrenceOnCompletion,
  clearModifiedExceptionFields,
  findRuleForTask,
  recurrenceMarker,
  upsertModifiedExceptionBaseline,
  type ContentFieldKey
} from "./recurrence.js";
import type {
  CreateCommentInput,
  GetLinksInput,
  LinkInput,
  ListTagsInput,
  RecentInput,
  UpdateInput,
  WriteInput
} from "./types.js";

function clientError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_RE = /^[0-9a-f-]{8,36}$/i;

function normalizeStatus(value: string): string {
  return value === "delayed" || value === "archived" ? "done" : value;
}

function activeProjectVisibility() {
  return sql`(${entities.projectId} IS NULL OR ${entities.projectId} IN (
    SELECT id FROM projects WHERE status <> 'archived'
  ))`;
}

export async function resolveEntityId(
  db: Database["db"],
  idOrPrefix: string
): Promise<string | null> {
  if (UUID_RE.test(idOrPrefix)) return idOrPrefix;
  if (!UUID_PREFIX_RE.test(idOrPrefix)) return null;

  const rows = (
    await db.execute<{ id: string }>(sql`
      SELECT id::text AS id
      FROM entities
      WHERE id::text LIKE ${`${idOrPrefix.toLowerCase()}%`}
      LIMIT 2
    `)
  ).rows;

  if (rows.length === 1) return rows[0]!.id;
  if (rows.length > 1) throw new Error(`entity id prefix ${idOrPrefix} is ambiguous`);
  return null;
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

  const status = normalizeStatus(input.status);
  const [row] = await db
    .insert(entities)
    .values({
      kind: input.kind,
      projectId: input.projectId ?? null,
      title: input.title ?? null,
      body: input.body,
      tags: input.tags,
      status,
      parentId: input.parentId ?? null,
      actorKind: input.actorKind,
      metadata: input.metadata,
      dueAt: normalizeDueAt(input.dueAt),
      priority: input.priority,
      pinned: input.pinned,
      // Mirror the PATCH path: a task created already-done gets a
      // completedAt stamp so the calendar renders it on the right day.
      completedAt: status === "done" ? new Date() : null,
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

/**
 * Append a comment (worklog entry) to a task or note. The comment inherits the
 * parent's projectId so project-scoped search/recent include it, but never
 * gets a KEY-SEQ number (the sequence trigger skips kind='comment').
 */
export async function addComment(
  db: Database["db"],
  parentIdOrPrefix: string,
  input: CreateCommentInput
): Promise<Entity> {
  const parent = await get(db, parentIdOrPrefix);
  if (!parent) throw clientError(`entity ${parentIdOrPrefix} not found`, 404);
  if (parent.kind === "comment") {
    throw clientError("comments cannot be nested; comment on the task itself", 400);
  }
  return write(db, {
    kind: "comment",
    projectId: parent.projectId,
    title: null,
    body: input.body,
    tags: [],
    status: "open",
    parentId: parent.id,
    actorKind: input.actorKind,
    metadata: input.metadata,
    dueAt: null,
    priority: "none",
    pinned: false,
    idempotencyKey: input.idempotencyKey
  });
}

/** Comments for one parent entity, oldest first (chronological worklog). */
export async function listComments(
  db: Database["db"],
  parentIdOrPrefix: string,
  limit = 50
): Promise<Entity[]> {
  const entityId = await resolveEntityId(db, parentIdOrPrefix);
  if (!entityId) return [];
  return db
    .select()
    .from(entities)
    .where(and(eq(entities.parentId, entityId), eq(entities.kind, "comment")))
    .orderBy(entities.createdAt)
    .limit(limit);
}

const CONTENT_FIELDS: ContentFieldKey[] = ["title", "body", "tags", "priority"];

export async function update(
  db: Database["db"],
  id: string,
  fields: UpdateInput
): Promise<Entity> {
  const entityId = await resolveEntityId(db, id);
  if (!entityId) throw new Error(`entity ${id} not found`);

  const normalizedFields: UpdateInput = { ...fields };
  if (fields.status !== undefined) {
    normalizedFields.status = normalizeStatus(fields.status) as NonNullable<UpdateInput["status"]>;
  }
  const set: Record<string, unknown> = { ...normalizedFields, updatedAt: new Date() };
  // recurrenceScope is not a DB column — remove it before the UPDATE
  delete set.recurrenceScope;
  // bodyAppend is handled via a SQL expression below — remove it from the plain set
  delete set.bodyAppend;
  if (fields.dueAt !== undefined) {
    set.dueAt = normalizeDueAt(fields.dueAt);
  }

  // Determine which content fields are being changed and capture pre-edit snapshot
  // if recurrenceScope is set (we need preEditSnapshot for this-only writes).
  const changedContentFields = CONTENT_FIELDS.filter(
    (f) => f in fields && fields[f] !== undefined
  );
  const needsSnapshot =
    fields.recurrenceScope !== undefined && changedContentFields.length > 0;

  // Maintain completedAt as a side effect of status transitions. We need the
  // prior status to know whether this is an entry into or exit from 'done',
  // so do a tiny read first — cheaper than a CASE expression on UPDATE and
  // keeps the SQL the same shape as other writes.
  let enteredDone = false;
  let preEditSnapshot: Partial<Record<ContentFieldKey, unknown>> | null = null;

  {
    const prior = await db
      .select({
        kind: entities.kind,
        status: entities.status,
        title: entities.title,
        body: entities.body,
        tags: entities.tags,
        priority: entities.priority
      })
      .from(entities)
      .where(eq(entities.id, entityId))
      .limit(1);
    if (!prior[0]) throw new Error(`entity ${id} not found`);
    if (prior[0].kind === "comment") {
      throw clientError("comments are append-only; add a new comment instead of editing", 400);
    }
    // Only touch completedAt when the status itself is changing — an unrelated
    // field update on an already-done task must not clear its completion stamp.
    if (normalizedFields.status !== undefined) {
      const wasDone = prior[0].status === "done";
      const isDone = normalizedFields.status === "done";
      enteredDone = isDone && !wasDone;
      if (isDone && !wasDone) set.completedAt = new Date();
      else if (!isDone && wasDone) set.completedAt = null;
    }
    if (needsSnapshot) {
      preEditSnapshot = {
        title: prior[0].title,
        body: prior[0].body,
        tags: prior[0].tags,
        priority: prior[0].priority
      };
    }
  }

  // Apply bodyAppend atomically: separate from existing content with a blank
  // line only when current body is non-empty; no read-back needed.
  if (fields.bodyAppend !== undefined) {
    set.body = sql`CASE WHEN ${entities.body} = '' THEN ${fields.bodyAppend} ELSE ${entities.body} || ${"\n\n"} || ${fields.bodyAppend} END`;
  }

  const [row] = await db.update(entities).set(set).where(eq(entities.id, entityId)).returning();
  if (!row) throw new Error(`entity ${id} not found`);
  if (fields.parentId !== undefined && fields.parentId !== null) {
    await db
      .insert(edges)
      .values({ fromId: fields.parentId, toId: row.id, kind: "parent_of" })
      .onConflictDoNothing();
  }

  // Handle recurrenceScope for recurring task occurrences
  if (
    fields.recurrenceScope !== undefined &&
    row.kind === "task" &&
    changedContentFields.length > 0
  ) {
    const marker = recurrenceMarker(row);
    if (marker?.role === "occurrence" && marker.ruleId) {
      const rule = await findRuleForTask(db, row);
      if (rule && preEditSnapshot) {
        const preEdit = preEditSnapshot as Record<string, unknown>;
        const preEditValues = Object.fromEntries(
          changedContentFields.map((f) => [f, preEdit[f]])
        ) as Record<ContentFieldKey, unknown>;

        if (fields.recurrenceScope === "this") {
          await upsertModifiedExceptionBaseline(
            db,
            rule,
            row,
            preEditValues as { title?: string | null; body?: string; tags?: string[]; priority?: string },
            changedContentFields
          );
        } else {
          // scope === 'future': clear any prior this-only baseline for those fields
          await clearModifiedExceptionFields(db, rule, row, changedContentFields);
        }
      }
    }
  }

  if (enteredDone && row.kind === "task") {
    await advanceRecurrenceOnCompletion(db, row);
  }
  return row;
}

export async function listRelated(
  db: Database["db"],
  parentId: string
): Promise<Entity[]> {
  const entityId = await resolveEntityId(db, parentId);
  if (!entityId) return [];

  return db
    .select()
    .from(entities)
    .where(eq(entities.parentId, entityId))
    .orderBy(desc(entities.createdAt));
}

export async function get(db: Database["db"], id: string): Promise<Entity | null> {
  const entityId = await resolveEntityId(db, id);
  if (!entityId) return null;

  const rows = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1);
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
  const entityId = await resolveEntityId(db, id);
  if (!entityId) return false;

  const res = await db
    .delete(entities)
    .where(eq(entities.id, entityId))
    .returning({ id: entities.id });
  return res.length > 0;
}

export async function recent(db: Database["db"], input: RecentInput): Promise<Entity[]> {
  const conds = [];
  if (input.projectId) conds.push(eq(entities.projectId, input.projectId));
  else if (input.projectId === null) conds.push(isNull(entities.projectId));
  else conds.push(activeProjectVisibility());
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

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Return distinct tags across entities.tags (unnested) with their occurrence
 * counts, ordered by count DESC then tag ASC.  Pass projectId to scope to one
 * project; omit (or pass null/undefined) for workspace-wide results.
 */
export async function listTags(
  db: Database["db"],
  input: ListTagsInput
): Promise<TagCount[]> {
  const projectFilter = input.projectId
    ? sql`AND project_id = ${input.projectId}::uuid`
    : sql``;

  const rows = await db.execute<{ tag: string; count: string }>(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM entities, unnest(tags) AS tag
    WHERE true ${projectFilter}
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);
  return rows.rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export interface LinkResult {
  kind: EdgeKind;
  direction: "outgoing" | "incoming";
  entity: Entity;
}

/**
 * Read graph edges for an entity by kind and/or direction.
 * direction='outgoing' → edges where fromId = id
 * direction='incoming' → edges where toId = id
 * direction='both'     → union of both directions (default)
 * Returns the OTHER endpoint entity alongside the edge kind and direction.
 */
export async function getLinks(
  db: Database["db"],
  input: GetLinksInput
): Promise<LinkResult[]> {
  const { id, kind, direction } = input;
  const results: LinkResult[] = [];

  if (direction === "outgoing" || direction === "both") {
    const kindCond = kind ? sql` AND e.kind = ${kind}` : sql``;
    const rows = await db.execute<{
      kind: string;
      to_id: string;
    }>(sql`
      SELECT e.kind, e.to_id
      FROM edges e
      WHERE e.from_id = ${id}::uuid${kindCond}
    `);
    if (rows.rows.length > 0) {
      const toIds = rows.rows.map((r) => r.to_id);
      const entityRows = await db
        .select()
        .from(entities)
        .where(inArray(entities.id, toIds));
      const entityById = new Map(entityRows.map((en) => [en.id, en]));
      for (const row of rows.rows) {
        const entity = entityById.get(row.to_id);
        if (entity) {
          results.push({ kind: row.kind as EdgeKind, direction: "outgoing", entity });
        }
      }
    }
  }

  if (direction === "incoming" || direction === "both") {
    const kindCond = kind ? sql` AND e.kind = ${kind}` : sql``;
    const rows = await db.execute<{
      kind: string;
      from_id: string;
    }>(sql`
      SELECT e.kind, e.from_id
      FROM edges e
      WHERE e.to_id = ${id}::uuid${kindCond}
    `);
    if (rows.rows.length > 0) {
      const fromIds = rows.rows.map((r) => r.from_id);
      const entityRows = await db
        .select()
        .from(entities)
        .where(inArray(entities.id, fromIds));
      const entityById = new Map(entityRows.map((en) => [en.id, en]));
      for (const row of rows.rows) {
        const entity = entityById.get(row.from_id);
        if (entity) {
          results.push({ kind: row.kind as EdgeKind, direction: "incoming", entity });
        }
      }
    }
  }

  return results;
}
