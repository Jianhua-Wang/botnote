import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import type { Database } from "../db/client.js";
import { entities, type Entity } from "../db/schema.js";
import { materializeScheduledRecurrences } from "./recurrence.js";
import type { TasksRangeInput } from "./types.js";

export interface TasksRangeResult {
  scheduled: Entity[];
  overdue: Entity[];
  backlog: Entity[];
}

function endOfToday(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

function materializationHorizon(input: TasksRangeInput, now: Date): Date {
  const todayEnd = endOfToday(now);
  if (!input.to) return todayEnd;
  const requestedEnd = new Date(input.to);
  if (Number.isNaN(requestedEnd.getTime())) return todayEnd;
  return requestedEnd.getTime() < todayEnd.getTime() ? requestedEnd : todayEnd;
}

/**
 * Tasks in a date range, split into scheduled / overdue / backlog buckets.
 *
 * Each task has a "display date" that decides where it lands on the calendar:
 *   - status='done'         → completedAt (when actually finished)
 *   - status='in_progress'  → today        (rolling — surfaces active work)
 *   - everything else       → dueAt        (when it's supposed to happen)
 *
 * `scheduled` returns any task whose display date falls inside [from, to).
 * Done tasks without a completedAt (legacy / weird state) fall back to updatedAt.
 * `overdue` is unfinished work before the requested range start (or before now
 * when no range start is supplied), so a task scheduled inside the active day
 * cannot also appear in the overdue alert.
 */
export async function tasksRange(
  db: Database["db"],
  input: TasksRangeInput
): Promise<TasksRangeResult> {
  const now = new Date();
  await materializeScheduledRecurrences(db, materializationHorizon(input, now));

  const projectFilter = input.projectIds?.length
    ? inArray(entities.projectId, input.projectIds)
    : undefined;
  const activeProjectFilter = projectFilter
    ? undefined
    : sql`(${entities.projectId} IS NULL OR ${entities.projectId} IN (
        SELECT id FROM projects WHERE status <> 'archived'
      ))`;

  // Base filter applied to every bucket: only tasks, optional project filter,
  // and the includeDone toggle.
  const baseConds: SQL[] = [eq(entities.kind, "task")];
  if (!input.includeDone) {
    baseConds.push(or(ne(entities.status, "done"), isNull(entities.status))!);
  }
  if (projectFilter) baseConds.push(projectFilter);
  if (activeProjectFilter) baseConds.push(activeProjectFilter);

  // Three independent passes, unioned in JS. Drizzle's `or` keeps the SQL
  // clear and the partial completed_at index keeps the done-pass cheap.
  const inRange = <T>(col: T): SQL[] => {
    const conds: SQL[] = [];
    if (input.from) conds.push(gte(col as never, input.from));
    if (input.to) conds.push(lt(col as never, input.to));
    return conds;
  };

  // (a) Non-done, non-in_progress tasks scheduled by dueAt.
  const dueByDueConds = [
    ...baseConds,
    isNotNull(entities.dueAt),
    or(ne(entities.status, "done"), isNull(entities.status))!,
    or(ne(entities.status, "in_progress"), isNull(entities.status))!,
    ...inRange(entities.dueAt)
  ];
  const dueByDue = await db
    .select()
    .from(entities)
    .where(and(...dueByDueConds))
    .orderBy(asc(entities.dueAt));

  // (b) Done tasks rendered on completedAt, with updatedAt as the legacy
  // fallback for rows completed before completed_at existed. Never place done
  // work by dueAt: completion history should reflect when work actually ended.
  let doneByCompleted: Entity[] = [];
  if (input.includeDone) {
    const doneByCompletedConds: SQL[] = [
      eq(entities.kind, "task"),
      eq(entities.status, "done"),
      isNotNull(entities.completedAt),
      ...inRange(entities.completedAt)
    ];
    if (projectFilter) doneByCompletedConds.push(projectFilter);
    if (activeProjectFilter) doneByCompletedConds.push(activeProjectFilter);
    const completedRows = await db
      .select()
      .from(entities)
      .where(and(...doneByCompletedConds))
      .orderBy(asc(entities.completedAt));

    const legacyDoneConds: SQL[] = [
      eq(entities.kind, "task"),
      eq(entities.status, "done"),
      isNull(entities.completedAt),
      ...inRange(entities.updatedAt)
    ];
    if (projectFilter) legacyDoneConds.push(projectFilter);
    if (activeProjectFilter) legacyDoneConds.push(activeProjectFilter);
    const legacyRows = await db
      .select()
      .from(entities)
      .where(and(...legacyDoneConds))
      .orderBy(asc(entities.updatedAt));

    doneByCompleted = [...completedRows, ...legacyRows];
  }

  // (c) in_progress tasks → today. Only relevant when "now" falls inside the
  // requested window; otherwise the day cell would never render them anyway.
  let inProgressToday: Entity[] = [];
  const todayInRange =
    (!input.from || now >= new Date(input.from)) &&
    (!input.to || now < new Date(input.to));
  if (todayInRange) {
    const ipConds: SQL[] = [eq(entities.kind, "task"), eq(entities.status, "in_progress")];
    if (projectFilter) ipConds.push(projectFilter);
    if (activeProjectFilter) ipConds.push(activeProjectFilter);
    inProgressToday = await db
      .select()
      .from(entities)
      .where(and(...ipConds))
      .orderBy(asc(entities.dueAt));
  }

  // Dedup by id — a status='done' task with a completedAt also matched (a) if
  // its dueAt landed in range; (b) wins because it's the canonical display.
  const scheduledMap = new Map<string, Entity>();
  for (const e of dueByDue) scheduledMap.set(e.id, e);
  for (const e of doneByCompleted) scheduledMap.set(e.id, e);
  for (const e of inProgressToday) scheduledMap.set(e.id, e);
  const scheduled = Array.from(scheduledMap.values());

  // Overdue = past-due work that still needs attention. Use the range start
  // when present so today's scheduled tasks do not double-surface as overdue
  // later in the same day.
  const overdueCutoff = input.from ?? now;
  const overdueConds: SQL[] = [
    eq(entities.kind, "task"),
    isNotNull(entities.dueAt),
    lt(entities.dueAt, overdueCutoff),
    or(ne(entities.status, "done"), isNull(entities.status))!,
    or(ne(entities.status, "in_progress"), isNull(entities.status))!,
    or(ne(entities.status, "rejected"), isNull(entities.status))!
  ];
  if (projectFilter) overdueConds.push(projectFilter);
  if (activeProjectFilter) overdueConds.push(activeProjectFilter);
  const overdue = await db
    .select()
    .from(entities)
    .where(and(...overdueConds))
    .orderBy(asc(entities.dueAt));

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
