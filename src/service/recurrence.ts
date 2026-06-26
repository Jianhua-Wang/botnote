import { and, asc, eq, lte, or } from "drizzle-orm";
import rrulePkg from "rrule";
import type { Database } from "../db/client.js";
import {
  entities,
  recurrenceExceptions,
  recurrenceRules,
  type Entity,
  type RecurrenceRule
} from "../db/schema.js";
import { allDayDueAtInZone, normalizeDueAt } from "./dates.js";
import type { RecurrenceInput, StopRecurrenceInput, UpdateRecurrenceInput } from "./types.js";
import { getWorkspaceSettings } from "./workspace_settings.js";

// Content fields that can be scoped to "this occurrence only"
type BaselineFields = { title?: string | null; body?: string; tags?: string[]; priority?: string };
export type ContentFieldKey = "title" | "body" | "tags" | "priority";

const { RRule } = rrulePkg;

type WeekdayKey = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
type Frequency = NonNullable<RecurrenceInput["preset"]>;

const WEEKDAYS: Record<WeekdayKey, typeof RRule.MO> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU
};

const FREQUENCIES: Record<Frequency, number> = {
  hourly: RRule.HOURLY,
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY
};

interface RecurrenceMarker {
  ruleId: string;
  seriesId: string;
  role: "occurrence";
  occurrenceAt: string;
  occurrenceIndex: number;
}

interface RecurrenceMetadata {
  recurrence?: Partial<RecurrenceMarker>;
}

export interface RecurrenceDetails {
  rule: RecurrenceRule;
  currentOccurrence: Entity | null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function recurrenceMarker(e: Entity): Partial<RecurrenceMarker> | null {
  const metadata = metadataObject(e.metadata) as RecurrenceMetadata;
  if (!metadata.recurrence || typeof metadata.recurrence !== "object") return null;
  return metadata.recurrence;
}

function withRecurrenceMetadata(
  e: Entity,
  marker: RecurrenceMarker
): Record<string, unknown> {
  return {
    ...metadataObject(e.metadata),
    recurrence: marker
  };
}

function normalizeRRuleText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rruleLine = lines.find((line) => line.toUpperCase().startsWith("RRULE:")) ?? lines[0];
  if (!rruleLine) throw new Error("recurrence rule is empty");
  return rruleLine.replace(/^RRULE:/i, "");
}

function rruleLine(rule: InstanceType<typeof RRule>): string {
  const line = rule
    .toString()
    .split(/\r?\n/)
    .find((part) => part.startsWith("RRULE:"));
  if (!line) throw new Error("rrule did not produce an RRULE line");
  return line.slice("RRULE:".length);
}

function buildRRuleFromInput(input: RecurrenceInput, dtstart: Date): string {
  if (input.rrule) return normalizeRRuleText(input.rrule);
  if (!input.preset) throw new Error("recurrence preset is required");

  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: FREQUENCIES[input.preset],
    interval: input.interval,
    dtstart
  };
  if (input.byWeekday?.length) {
    options.byweekday = input.byWeekday.map((day) => WEEKDAYS[day]);
  }
  if (input.byMonthDay?.length) options.bymonthday = input.byMonthDay;
  if (input.bySetPos != null) options.bysetpos = input.bySetPos;
  if (input.byMonth?.length) options.bymonth = input.byMonth;
  if (input.until) options.until = input.until;
  if (input.count) options.count = input.count;

  return rruleLine(new RRule(options));
}

function buildRRule(rule: Pick<RecurrenceRule, "rrule" | "dtstart">, dtstart = rule.dtstart) {
  const parsed = RRule.parseString(rule.rrule);
  return new RRule({ ...parsed, dtstart });
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Normalize a computed occurrence date for storage.
 * - All-day rules: resolve the calendar day as seen in the rule's timezone,
 *   then snap to noon UTC (so the intended local calendar day is preserved
 *   across all UTC-offset clients).
 * - Timed rules: use normalizeDueAt (exact-midnight-UTC -> noon-UTC heuristic).
 */
function normalizeOccurrenceDueAt(
  rule: Pick<RecurrenceRule, "allDay" | "timezone">,
  date: Date
): Date {
  if (rule.allDay) {
    return allDayDueAtInZone(date, rule.timezone) ?? normalizeDueAt(date) ?? date;
  }
  return normalizeDueAt(date) ?? date;
}

function countLimit(rule: RecurrenceRule): number | null {
  return buildRRule(rule).options.count ?? null;
}

function computeNextOccurrenceAt(
  rule: RecurrenceRule,
  occurrence: Entity,
  completedAt: Date
): Date | null {
  const count = countLimit(rule);
  if (count != null && rule.generatedCount >= count) return null;

  const anchor = rule.anchor === "completion" ? "completion" : "scheduled";
  const dtstart = anchor === "completion" ? completedAt : rule.dtstart;
  const rrule = buildRRule(rule, dtstart);
  const scheduledBase = occurrence.dueAt ?? rule.dtstart;
  const cursor = anchor === "completion" ? completedAt : maxDate(scheduledBase, completedAt);
  const next = rrule.after(cursor, false);
  return next ? normalizeOccurrenceDueAt(rule, next) : null;
}

function computeNextScheduledAfter(rule: RecurrenceRule, after: Date): Date | null {
  const next = buildRRule(rule, rule.dtstart).after(after, false);
  return next ? normalizeOccurrenceDueAt(rule, next) : null;
}

async function fetchEntity(db: Database["db"], id: string): Promise<Entity> {
  const rows = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`entity ${id} not found`);
  return row;
}

export async function findRuleForTask(
  db: Database["db"],
  task: Entity,
  includeDisabled = true
): Promise<RecurrenceRule | null> {
  const marker = recurrenceMarker(task);
  const cond = marker?.ruleId
    ? eq(recurrenceRules.id, marker.ruleId)
    : or(eq(recurrenceRules.currentOccurrenceId, task.id), eq(recurrenceRules.seriesId, task.id))!;
  const where = includeDisabled ? cond : and(cond, eq(recurrenceRules.enabled, true));
  const rows = await db.select().from(recurrenceRules).where(where).limit(1);
  return rows[0] ?? null;
}

export async function getRecurrenceForTask(
  db: Database["db"],
  taskId: string
): Promise<RecurrenceDetails | null> {
  const task = await fetchEntity(db, taskId);
  const rule = await findRuleForTask(db, task);
  if (!rule) return null;
  const currentOccurrence = rule.currentOccurrenceId
    ? await fetchEntity(db, rule.currentOccurrenceId).catch(() => null)
    : null;
  return { rule, currentOccurrence };
}

export async function createRecurrenceRule(
  db: Database["db"],
  taskId: string,
  input: RecurrenceInput
): Promise<RecurrenceRule> {
  const task = await fetchEntity(db, taskId);
  if (task.kind !== "task") throw new Error("recurrence can only be attached to tasks");
  if (!task.dueAt) throw new Error("recurring tasks require a first due date");
  if (task.status === "done" || task.status === "rejected") {
    throw new Error("recurrence cannot be attached to a terminal task");
  }

  // Resolve timezone: explicit input wins; otherwise fall back to workspace tz.
  const timezone = input.timezone ?? (await getWorkspaceSettings(db)).timezone;

  const existingRule = await findRuleForTask(db, task);
  const seriesId = existingRule?.seriesId ?? recurrenceMarker(task)?.seriesId ?? task.id;
  const dtstart = input.dtstart ? normalizeDueAt(input.dtstart)! : task.dueAt;
  const rrule = buildRRuleFromInput(input, dtstart);
  const nextOccurrenceRaw = buildRRule({ rrule, dtstart }).after(dtstart, false);

  // Build a partial rule shape for normalizeOccurrenceDueAt before the DB row exists.
  const ruleShape = { allDay: input.allDay ?? true, timezone };
  const nextOccurrenceAt = nextOccurrenceRaw
    ? normalizeOccurrenceDueAt(ruleShape, nextOccurrenceRaw)
    : null;

  let rule: RecurrenceRule;
  if (existingRule) {
    const [updated] = await db
      .update(recurrenceRules)
      .set({
        currentOccurrenceId: task.id,
        enabled: true,
        rrule,
        dtstart,
        timezone,
        allDay: input.allDay,
        anchor: input.anchor,
        maxInstancesAhead: 1,
        nextOccurrenceAt,
        endedAt: null
      })
      .where(eq(recurrenceRules.id, existingRule.id))
      .returning();
    if (!updated) throw new Error(`recurrence rule ${existingRule.id} not found`);
    rule = updated;
  } else {
    const [inserted] = await db
      .insert(recurrenceRules)
      .values({
        seriesId,
        currentOccurrenceId: task.id,
        enabled: true,
        rrule,
        dtstart,
        timezone,
        allDay: input.allDay,
        anchor: input.anchor,
        maxInstancesAhead: 1,
        generatedCount: 1,
        lastOccurrenceAt: null,
        nextOccurrenceAt,
        endedAt: null
      })
      .returning();
    if (!inserted) throw new Error("recurrence rule insert returned no row");
    rule = inserted;
  }

  await db
    .update(entities)
    .set({
      metadata: withRecurrenceMetadata(task, {
        ruleId: rule.id,
        seriesId: rule.seriesId,
        role: "occurrence",
        occurrenceAt: (task.dueAt ?? rule.dtstart).toISOString(),
        occurrenceIndex: 1
      })
    })
    .where(eq(entities.id, task.id));

  return rule;
}

export async function updateRecurrenceRule(
  db: Database["db"],
  ruleId: string,
  input: UpdateRecurrenceInput
): Promise<RecurrenceRule> {
  const rows = await db.select().from(recurrenceRules).where(eq(recurrenceRules.id, ruleId)).limit(1);
  const current = rows[0];
  if (!current) throw new Error(`recurrence rule ${ruleId} not found`);
  const currentOccurrence = current.currentOccurrenceId
    ? await fetchEntity(db, current.currentOccurrenceId)
    : null;
  const dtstart = input.dtstart
    ? normalizeDueAt(input.dtstart)!
    : currentOccurrence?.dueAt ?? current.dtstart;
  const nextRRuleInput: RecurrenceInput = {
    rrule: input.rrule ?? current.rrule,
    preset: input.preset,
    interval: input.interval ?? 1,
    byWeekday: input.byWeekday,
    byMonthDay: input.byMonthDay,
    bySetPos: input.bySetPos,
    byMonth: input.byMonth,
    until: input.until,
    count: input.count,
    dtstart,
    timezone: input.timezone ?? current.timezone,
    allDay: input.allDay ?? current.allDay,
    anchor: input.anchor ?? (current.anchor === "completion" ? "completion" : "scheduled")
  };
  const rrule = input.rrule || input.preset ? buildRRuleFromInput(nextRRuleInput, dtstart) : current.rrule;
  const nextOccurrenceRaw = buildRRule({ rrule, dtstart }).after(dtstart, false);
  const resolvedAllDay = input.allDay ?? current.allDay;
  const resolvedTimezone = input.timezone ?? current.timezone;
  const ruleShape = { allDay: resolvedAllDay, timezone: resolvedTimezone };
  const nextOccurrenceAt = nextOccurrenceRaw
    ? normalizeOccurrenceDueAt(ruleShape, nextOccurrenceRaw)
    : null;

  const [updated] = await db
    .update(recurrenceRules)
    .set({
      enabled: input.enabled ?? current.enabled,
      rrule,
      dtstart,
      timezone: resolvedTimezone,
      allDay: resolvedAllDay,
      anchor: input.anchor ?? current.anchor,
      nextOccurrenceAt,
      endedAt: input.enabled === true ? null : current.endedAt
    })
    .where(eq(recurrenceRules.id, ruleId))
    .returning();
  if (!updated) throw new Error(`recurrence rule ${ruleId} not found`);
  return updated;
}

// ---------------------------------------------------------------------------
// Modified-exception helpers (scope='this' baseline management)
// ---------------------------------------------------------------------------

/**
 * Find the existing 'modified' exception row for a given entity.
 * Keyed by entityId (stable), not occurrenceAt.
 */
async function findModifiedExceptionForEntity(
  db: Database["db"],
  entityId: string
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const rows = await db
    .select({ id: recurrenceExceptions.id, metadata: recurrenceExceptions.metadata })
    .from(recurrenceExceptions)
    .where(
      and(
        eq(recurrenceExceptions.entityId, entityId),
        eq(recurrenceExceptions.action, "modified")
      )
    )
    .limit(1);
  if (!rows[0]) return null;
  const meta = rows[0].metadata;
  return {
    id: rows[0].id,
    metadata: (meta && typeof meta === "object" && !Array.isArray(meta))
      ? (meta as Record<string, unknown>)
      : {}
  };
}

/**
 * Upsert a 'modified' exception row recording the pre-edit (baseline) values
 * of content fields for this occurrence. Uses earliest-wins merge: only
 * adds a field to baseline if not already present.
 */
export async function upsertModifiedExceptionBaseline(
  db: Database["db"],
  rule: RecurrenceRule,
  occurrence: Entity,
  preEditValues: BaselineFields,
  changedFields: ContentFieldKey[]
): Promise<void> {
  const existing = await findModifiedExceptionForEntity(db, occurrence.id);

  if (existing) {
    const existingMeta = existing.metadata;
    const existingBaseline = (
      existingMeta.baseline && typeof existingMeta.baseline === "object" && !Array.isArray(existingMeta.baseline)
        ? existingMeta.baseline
        : {}
    ) as Record<string, unknown>;
    const existingChangedFields = Array.isArray(existingMeta.changedFields)
      ? (existingMeta.changedFields as string[])
      : [];

    // Merge: only add fields not already in baseline (earliest value wins)
    const mergedBaseline: Record<string, unknown> = { ...existingBaseline };
    const mergedChangedFields = new Set<string>(existingChangedFields);
    for (const field of changedFields) {
      if (!(field in mergedBaseline)) {
        mergedBaseline[field] = (preEditValues as Record<string, unknown>)[field] ?? null;
      }
      mergedChangedFields.add(field);
    }

    await db
      .update(recurrenceExceptions)
      .set({
        metadata: {
          scope: "this",
          baseline: mergedBaseline,
          changedFields: Array.from(mergedChangedFields),
          actorKind: "human"
        }
      })
      .where(eq(recurrenceExceptions.id, existing.id));
  } else {
    const baseline: Record<string, unknown> = {};
    for (const field of changedFields) {
      baseline[field] = (preEditValues as Record<string, unknown>)[field] ?? null;
    }
    await db.insert(recurrenceExceptions).values({
      ruleId: rule.id,
      occurrenceAt: occurrence.dueAt ?? rule.dtstart,
      action: "modified",
      entityId: occurrence.id,
      metadata: {
        scope: "this",
        baseline,
        changedFields,
        actorKind: "human"
      }
    });
  }
}

/**
 * Remove the given fields from an existing 'modified' exception's baseline.
 * If baseline becomes empty after removal, delete the row.
 */
export async function clearModifiedExceptionFields(
  db: Database["db"],
  _rule: RecurrenceRule,
  occurrence: Entity,
  changedFields: ContentFieldKey[]
): Promise<void> {
  const existing = await findModifiedExceptionForEntity(db, occurrence.id);
  if (!existing) return;

  const existingMeta = existing.metadata;
  const existingBaseline = (
    existingMeta.baseline && typeof existingMeta.baseline === "object" && !Array.isArray(existingMeta.baseline)
      ? existingMeta.baseline
      : {}
  ) as Record<string, unknown>;
  const existingChangedFields = Array.isArray(existingMeta.changedFields)
    ? (existingMeta.changedFields as string[])
    : [];

  const newBaseline: Record<string, unknown> = { ...existingBaseline };
  const newChangedFields = existingChangedFields.filter((f) => !changedFields.includes(f as ContentFieldKey));
  for (const field of changedFields) {
    delete newBaseline[field];
  }

  if (Object.keys(newBaseline).length === 0) {
    await db.delete(recurrenceExceptions).where(eq(recurrenceExceptions.id, existing.id));
  } else {
    await db
      .update(recurrenceExceptions)
      .set({
        metadata: {
          ...existingMeta,
          baseline: newBaseline,
          changedFields: newChangedFields
        }
      })
      .where(eq(recurrenceExceptions.id, existing.id));
  }
}

/**
 * Fetch the baseline stored in the 'modified' exception for the given template
 * occurrence. Returns null if no such exception exists.
 */
async function fetchBaselineForTemplate(
  db: Database["db"],
  _rule: RecurrenceRule,
  template: Entity
): Promise<BaselineFields | null> {
  const existing = await findModifiedExceptionForEntity(db, template.id);
  if (!existing) return null;
  const meta = existing.metadata;
  if (!meta.baseline || typeof meta.baseline !== "object" || Array.isArray(meta.baseline)) {
    return null;
  }
  return meta.baseline as BaselineFields;
}

async function insertNextOccurrence(
  db: Database["db"],
  rule: RecurrenceRule,
  occurrence: Entity,
  nextDueAt: Date,
  baseline?: BaselineFields
): Promise<Entity> {
  const occurrenceIndex = rule.generatedCount + 1;
  const idempotencyKey = `recurrence:${rule.id}:${nextDueAt.toISOString()}`;
  const metadata = {
    ...metadataObject(occurrence.metadata),
    recurrence: {
      ruleId: rule.id,
      seriesId: rule.seriesId,
      role: "occurrence",
      occurrenceAt: nextDueAt.toISOString(),
      occurrenceIndex
    } satisfies RecurrenceMarker
  };

  const values = {
    kind: "task",
    projectId: occurrence.projectId,
    title: baseline && "title" in baseline ? baseline.title : occurrence.title,
    body: baseline && "body" in baseline ? (baseline.body ?? "") : occurrence.body,
    tags: baseline && "tags" in baseline ? (baseline.tags ?? []) : occurrence.tags,
    status: "open",
    parentId: occurrence.parentId,
    actorKind: "system",
    metadata,
    dueAt: nextDueAt,
    priority: (baseline && "priority" in baseline ? baseline.priority : null) ?? occurrence.priority,
    pinned: false,
    completedAt: null,
    idempotencyKey
  };
  const inserted = await db
    .insert(entities)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const rows = await db.select().from(entities).where(eq(entities.idempotencyKey, idempotencyKey));
  const existing = rows[0];
  if (!existing) throw new Error("recurrence idempotent insert returned no row");
  return existing;
}

async function advanceRuleFromOccurrence(
  db: Database["db"],
  rule: RecurrenceRule,
  occurrence: Entity,
  completedAt: Date
): Promise<Entity | null> {
  if (!rule.enabled) return null;
  const nextDueAt = computeNextOccurrenceAt(rule, occurrence, completedAt);
  if (!nextDueAt) {
    await db
      .update(recurrenceRules)
      .set({
        enabled: false,
        currentOccurrenceId: null,
        lastOccurrenceAt: occurrence.dueAt ?? rule.dtstart,
        nextOccurrenceAt: null,
        endedAt: completedAt
      })
      .where(eq(recurrenceRules.id, rule.id));
    return null;
  }

  const baseline = await fetchBaselineForTemplate(db, rule, occurrence);
  const next = await insertNextOccurrence(db, rule, occurrence, nextDueAt, baseline ?? undefined);
  await db
    .update(recurrenceRules)
    .set({
      currentOccurrenceId: next.id,
      generatedCount: Math.max(rule.generatedCount + 1, rule.generatedCount),
      lastOccurrenceAt: occurrence.dueAt ?? rule.dtstart,
      nextOccurrenceAt: nextDueAt
    })
    .where(eq(recurrenceRules.id, rule.id));
  return next;
}

export async function materializeScheduledRecurrences(
  db: Database["db"],
  upTo: Date,
  limit = 100
): Promise<Entity[]> {
  const rows = await db
    .select()
    .from(recurrenceRules)
    .where(
      and(
        eq(recurrenceRules.enabled, true),
        eq(recurrenceRules.anchor, "scheduled"),
        lte(recurrenceRules.nextOccurrenceAt, upTo)
      )
    )
    .orderBy(asc(recurrenceRules.nextOccurrenceAt))
    .limit(limit);

  const created: Entity[] = [];
  for (const originalRule of rows) {
    let rule = originalRule;
    let template = await fetchEntity(db, rule.currentOccurrenceId ?? rule.seriesId).catch(() =>
      fetchEntity(db, rule.seriesId)
    );

    while (
      rule.enabled &&
      rule.nextOccurrenceAt &&
      rule.nextOccurrenceAt.getTime() <= upTo.getTime() &&
      created.length < limit
    ) {
      const count = countLimit(rule);
      if (count != null && rule.generatedCount >= count) {
        await db
          .update(recurrenceRules)
          .set({ nextOccurrenceAt: null })
          .where(eq(recurrenceRules.id, rule.id));
        break;
      }

      const nextDueAt = normalizeOccurrenceDueAt(rule, rule.nextOccurrenceAt!);
      const baseline = await fetchBaselineForTemplate(db, rule, template);
      const next = await insertNextOccurrence(db, rule, template, nextDueAt, baseline ?? undefined);
      created.push(next);

      const generatedCount = rule.generatedCount + 1;
      const following =
        count != null && generatedCount >= count
          ? null
          : computeNextScheduledAfter(rule, nextDueAt);
      const [updated] = await db
        .update(recurrenceRules)
        .set({
          currentOccurrenceId: next.id,
          generatedCount,
          lastOccurrenceAt: template.dueAt ?? rule.dtstart,
          nextOccurrenceAt: following
        })
        .where(eq(recurrenceRules.id, rule.id))
        .returning();
      if (!updated) break;
      rule = updated;
      template = next;
    }
  }

  return created;
}

export async function advanceRecurrenceOnCompletion(
  db: Database["db"],
  occurrence: Entity,
  completedAt = occurrence.completedAt ?? new Date()
): Promise<Entity | null> {
  if (occurrence.kind !== "task") return null;
  const rule = await findRuleForTask(db, occurrence, false);
  if (!rule) return null;
  if (rule.currentOccurrenceId && rule.currentOccurrenceId !== occurrence.id) return null;
  return advanceRuleFromOccurrence(db, rule, occurrence, completedAt);
}

export async function skipOccurrence(
  db: Database["db"],
  taskId: string,
  input: { reason?: string; actorKind?: string } = {}
): Promise<{ skipped: Entity; next: Entity | null; rule: RecurrenceRule }> {
  const task = await fetchEntity(db, taskId);
  if (task.kind !== "task") throw new Error("only tasks can be skipped");
  const rule = await findRuleForTask(db, task, false);
  if (!rule) throw new Error("task is not an active recurring occurrence");
  if (rule.currentOccurrenceId && rule.currentOccurrenceId !== task.id) {
    throw new Error("only the current recurring occurrence can be skipped");
  }

  await db.insert(recurrenceExceptions).values({
    ruleId: rule.id,
    occurrenceAt: task.dueAt ?? rule.dtstart,
    action: "skipped",
    entityId: task.id,
    metadata: { reason: input.reason ?? null, actorKind: input.actorKind ?? "human" }
  });

  const [skipped] = await db
    .update(entities)
    .set({
      status: "rejected",
      updatedAt: new Date(),
      metadata: {
        ...metadataObject(task.metadata),
        recurrence: recurrenceMarker(task),
        skippedAt: new Date().toISOString(),
        skipReason: input.reason ?? null
      }
    })
    .where(eq(entities.id, task.id))
    .returning();
  if (!skipped) throw new Error(`entity ${task.id} not found`);

  const next = await advanceRuleFromOccurrence(db, rule, skipped, new Date());
  return { skipped, next, rule };
}

export async function stopRecurrence(
  db: Database["db"],
  ruleId: string,
  _input: StopRecurrenceInput = {}
): Promise<RecurrenceRule> {
  const [updated] = await db
    .update(recurrenceRules)
    .set({
      enabled: false,
      nextOccurrenceAt: null,
      endedAt: new Date()
    })
    .where(eq(recurrenceRules.id, ruleId))
    .returning();
  if (!updated) throw new Error(`recurrence rule ${ruleId} not found`);
  return updated;
}
