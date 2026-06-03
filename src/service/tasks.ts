import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities, type Entity } from "../db/schema.js";
import type { TasksRangeInput } from "./types.js";

export interface TasksRangeResult {
  scheduled: Entity[];
  overdue: Entity[];
  backlog: Entity[];
}

export async function tasksRange(
  db: Database["db"],
  input: TasksRangeInput
): Promise<TasksRangeResult> {
  const now = new Date();
  const projectFilter = input.projectIds?.length
    ? inArray(entities.projectId, input.projectIds)
    : undefined;

  const baseConds = [eq(entities.kind, "task")];
  if (!input.includeDone) {
    baseConds.push(or(ne(entities.status, "done"), isNull(entities.status))!);
    baseConds.push(or(ne(entities.status, "archived"), isNull(entities.status))!);
  }
  if (projectFilter) baseConds.push(projectFilter);

  const scheduledConds = [...baseConds, isNotNull(entities.dueAt)];
  if (input.from) scheduledConds.push(gte(entities.dueAt, input.from));
  if (input.to) scheduledConds.push(lt(entities.dueAt, input.to));

  const scheduled = await db
    .select()
    .from(entities)
    .where(and(...scheduledConds))
    .orderBy(asc(entities.dueAt));

  const overdueConds = [
    ...baseConds,
    isNotNull(entities.dueAt),
    lt(entities.dueAt, now)
  ];
  const overdue = !input.includeDone
    ? await db
        .select()
        .from(entities)
        .where(and(...overdueConds))
        .orderBy(asc(entities.dueAt))
    : [];

  let backlog: Entity[] = [];
  if (input.includeBacklog) {
    backlog = await db
      .select()
      .from(entities)
      .where(and(...baseConds, isNull(entities.dueAt)))
      .orderBy(desc(entities.createdAt))
      .limit(200);
  }

  return { scheduled, overdue, backlog };
}
