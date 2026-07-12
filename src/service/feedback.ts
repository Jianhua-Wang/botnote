import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities, type Entity, type FeedbackCategory } from "../db/schema.js";
import { write } from "./entities.js";
import type { CreateFeedbackInput, ListFeedbackInput } from "./types.js";

/**
 * File product feedback about botnote itself. Feedback is a first-class
 * entity kind so it shows up in search/recent, but its lifecycle is a triage
 * queue: open (new) → in_progress (accepted) → done (shipped/resolved) or
 * rejected (won't fix). The category lives in metadata.category.
 */
export async function submitFeedback(
  db: Database["db"],
  input: CreateFeedbackInput
): Promise<Entity> {
  return write(db, {
    kind: "feedback",
    projectId: input.projectId ?? null,
    title: input.title,
    body: input.body,
    tags: [input.category],
    status: "open",
    actorKind: input.actorKind,
    metadata: {
      ...input.metadata,
      category: input.category,
      ...(input.tool ? { tool: input.tool } : {})
    },
    dueAt: null,
    priority: "none",
    pinned: false,
    idempotencyKey: input.idempotencyKey
  });
}

/** Feedback entries for triage, newest first, filterable by category/status. */
export async function listFeedback(
  db: Database["db"],
  input: ListFeedbackInput
): Promise<Entity[]> {
  const conds = [eq(entities.kind, "feedback")];
  if (input.status) conds.push(eq(entities.status, input.status));
  if (input.category) {
    conds.push(
      sql`${entities.metadata} ->> 'category' = ${input.category as FeedbackCategory}`
    );
  }
  return db
    .select()
    .from(entities)
    .where(and(...conds))
    .orderBy(desc(entities.createdAt))
    .limit(input.limit);
}
