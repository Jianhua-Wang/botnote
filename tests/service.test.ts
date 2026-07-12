import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EmbeddingService } from "../src/service/embedding.js";
import {
  embeddingCoverage,
  getEmbeddingSettings,
  updateEmbeddingSettings
} from "../src/service/embedding_settings.js";
import {
  addComment,
  bumpAccess,
  get,
  getLinks,
  link,
  listComments,
  listTags,
  markSuperseded,
  recent,
  setBodyVec,
  update,
  write
} from "../src/service/entities.js";
import { formatOpeningBrief, openingBrief } from "../src/service/opening_brief.js";
import {
  createProject,
  getProjectByKey,
  listProjects,
  updateProject
} from "../src/service/projects.js";
import {
  createRecurrenceRule,
  getRecurrenceForTask,
  materializeScheduledRecurrences,
  skipOccurrence,
  splitRecurrence,
  stopRecurrence
} from "../src/service/recurrence.js";
import { eq, and } from "drizzle-orm";
import { entities, recurrenceExceptions, recurrenceRules } from "../src/db/schema.js";
import { listFeedback, submitFeedback } from "../src/service/feedback.js";
import { findSimilar, search } from "../src/service/search.js";
import { tasksRange } from "../src/service/tasks.js";
import { consumeToken, createToken, listTokens } from "../src/service/tokens.js";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings
} from "../src/service/workspace_settings.js";
import { allDayDueAtInZone } from "../src/service/dates.js";
import { createTestDb } from "./test_db.js";

const { db, pool } = createTestDb();

beforeAll(async () => {
  await db.execute(sql`SELECT 1`);
});

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE recurrence_exceptions, recurrence_rules, entities, edges, projects, tokens, sessions, embedding_settings, workspace_settings
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});

async function withEntitiesTouchDisabled(fn: () => Promise<void>): Promise<void> {
  await db.execute(sql`ALTER TABLE entities DISABLE TRIGGER entities_touch_updated_at`);
  try {
    await fn();
  } finally {
    await db.execute(sql`ALTER TABLE entities ENABLE TRIGGER entities_touch_updated_at`);
  }
}

describe("botnote service", () => {
  it("creates a project and looks it up by key", async () => {
    const p = await createProject(db, {
      key: "TEST",
      name: "Test Project",
      agentsMd: "## Rules\nALWAYS test."
    });
    expect(p.key).toBe("TEST");
    expect(p.status).toBe("active");
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);

    const found = await getProjectByKey(db, "TEST");
    expect(found?.id).toBe(p.id);
  });

  it("updates project status for active lifecycle states", async () => {
    const p = await createProject(db, {
      key: "STAT",
      name: "Status Project",
      status: "planned"
    });
    expect(p.status).toBe("planned");

    const updated = await updateProject(db, p.id, { status: "watching" });
    expect(updated.status).toBe("watching");

    const found = await getProjectByKey(db, "STAT");
    expect(found?.status).toBe("watching");

    const archived = await updateProject(db, p.id, { status: "archived" });
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).not.toBeNull();

    const restored = await updateProject(db, p.id, { status: "active" });
    expect(restored.status).toBe("active");
    expect(restored.archivedAt).toBeNull();
  });

  it("archives projects and hides their entities from workspace views by default", async () => {
    const active = await createProject(db, { key: "ACT", name: "Active" });
    const archived = await createProject(db, { key: "ARC", name: "Archived" });
    const dueAt = new Date("2026-06-25T12:00:00.000Z");

    await write(db, {
      kind: "task",
      projectId: active.id,
      title: "Visible active task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    const archivedTask = await write(db, {
      kind: "task",
      projectId: archived.id,
      title: "Hidden archived task",
      body: "archive-only needle",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    const archivedProject = await updateProject(db, archived.id, { status: "archived" });
    expect(archivedProject.status).toBe("archived");
    expect(archivedProject.archivedAt).not.toBeNull();

    expect((await listProjects(db)).map((p) => p.key)).toEqual(["ACT"]);
    expect((await listProjects(db, { includeArchived: true })).map((p) => p.key)).toEqual([
      "ACT",
      "ARC"
    ]);

    const recentRows = await recent(db, { limit: 10 });
    expect(recentRows.map((e) => e.id)).not.toContain(archivedTask.id);
    const archivedRecentRows = await recent(db, { projectId: archived.id, limit: 10 });
    expect(archivedRecentRows.map((e) => e.id)).toContain(archivedTask.id);

    expect((await search(db, { query: "archive-only needle", limit: 5 })).length).toBe(0);
    expect(
      (await search(db, { query: "archive-only needle", projectId: archived.id, limit: 5 }))[0]
        ?.entity.id
    ).toBe(archivedTask.id);

    const range = await tasksRange(db, {
      from: new Date("2026-06-25T00:00:00.000Z"),
      to: new Date("2026-06-26T00:00:00.000Z"),
      includeBacklog: false,
      includeDone: false
    });
    expect(range.scheduled.map((e) => e.id)).not.toContain(archivedTask.id);

    const archivedRange = await tasksRange(db, {
      from: new Date("2026-06-25T00:00:00.000Z"),
      to: new Date("2026-06-26T00:00:00.000Z"),
      projectIds: [archived.id],
      includeBacklog: false,
      includeDone: false
    });
    expect(archivedRange.scheduled.map((e) => e.id)).toContain(archivedTask.id);

    const restored = await updateProject(db, archived.id, { status: "active" });
    expect(restored.status).toBe("active");
    expect(restored.archivedAt).toBeNull();
    expect((await listProjects(db)).map((p) => p.key)).toEqual(["ACT", "ARC"]);
  });

  it("write entity + get + update + recent", async () => {
    const p = await createProject(db, { key: "WORK", name: "Work" });

    const t = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Build botnote v0",
      body: "Lightweight, agent-first.",
      tags: ["roadmap", "v0"],
      status: "open",
      actorKind: "human",
      metadata: {},
      idempotencyKey: null
    });
    expect(t.kind).toBe("task");

    const fetched = await get(db, t.id);
    expect(fetched?.title).toBe("Build botnote v0");

    const fetchedByPrefix = await get(db, t.id.slice(0, 8));
    expect(fetchedByPrefix?.id).toBe(t.id);

    const prefixUpdated = await update(db, t.id.slice(0, 8), { priority: "high" });
    expect(prefixUpdated.priority).toBe("high");

    const updated = await update(db, t.id, { status: "done" });
    expect(updated.status).toBe("done");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());

    const list = await recent(db, { projectId: p.id, limit: 10 });
    expect(list.length).toBe(1);
  });

  it("moves an entity between projects and to workspace scope", async () => {
    const source = await createProject(db, { key: "SRC", name: "Source" });
    const destination = await createProject(db, { key: "DST", name: "Destination" });
    const task = await write(db, {
      kind: "task",
      projectId: source.id,
      title: "Move this task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const moved = await update(db, task.id, { projectId: destination.id });
    expect(moved.projectId).toBe(destination.id);
    expect(await recent(db, { projectId: source.id, limit: 10 })).toEqual([]);
    expect((await recent(db, { projectId: destination.id, limit: 10 }))[0]?.id).toBe(task.id);

    const unscoped = await update(db, task.id, { projectId: null });
    expect(unscoped.projectId).toBeNull();
    expect((await recent(db, { projectId: null, limit: 10 }))[0]?.id).toBe(task.id);
  });

  it("write is idempotent on idempotency_key", async () => {
    const p = await createProject(db, { key: "IDP", name: "Idp" });
    const input = {
      kind: "note" as const,
      projectId: p.id,
      title: "First write",
      body: "x",
      tags: [],
      status: "open",
      actorKind: "agent" as const,
      metadata: {},
      idempotencyKey: "k-1"
    };
    const first = await write(db, input);
    const second = await write(db, {
      ...input,
      title: "Different title"
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("First write");
  });

  it("normalizes retired delayed and archived statuses to done", async () => {
    const p = await createProject(db, { key: "RET", name: "Retired statuses" });
    const delayed = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Normalize delayed task",
      body: "",
      tags: [],
      status: "delayed",
      actorKind: "human",
      metadata: {}
    });
    expect(delayed.status).toBe("done");
    expect(delayed.completedAt).not.toBeNull();

    const open = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Normalize archived update",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const archived = await update(db, open.id, { status: "archived" as never });
    expect(archived.status).toBe("done");
    expect(archived.completedAt).not.toBeNull();
  });

  it("tasksRange displays done tasks on completion day, not due day", async () => {
    const p = await createProject(db, { key: "CAL", name: "Calendar" });
    const dueAt = new Date("2026-06-01T12:00:00.000Z");
    const completedAt = new Date("2026-06-10T15:30:00.000Z");
    const legacyUpdatedAt = new Date("2026-06-11T09:00:00.000Z");

    const done = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Ship finished task",
      body: "",
      tags: [],
      status: "done",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await withEntitiesTouchDisabled(async () => {
      await db.execute(sql`
        UPDATE entities
        SET completed_at = ${completedAt}, updated_at = ${completedAt}
        WHERE id = ${done.id}
      `);
    });

    const legacyDone = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Legacy finished task",
      body: "",
      tags: [],
      status: "done",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await withEntitiesTouchDisabled(async () => {
      await db.execute(sql`
        UPDATE entities
        SET completed_at = NULL, updated_at = ${legacyUpdatedAt}
        WHERE id = ${legacyDone.id}
      `);
    });
    const overdueOpen = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Still needs attention",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    const dueDay = await tasksRange(db, {
      from: new Date("2026-06-01T00:00:00.000Z"),
      to: new Date("2026-06-02T00:00:00.000Z"),
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: true
    });
    expect(dueDay.scheduled.map((t) => t.id)).not.toContain(done.id);
    expect(dueDay.scheduled.map((t) => t.id)).not.toContain(legacyDone.id);

    const completionDay = await tasksRange(db, {
      from: new Date("2026-06-10T00:00:00.000Z"),
      to: new Date("2026-06-11T00:00:00.000Z"),
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: true
    });
    expect(completionDay.scheduled.map((t) => t.id)).toContain(done.id);
    expect(completionDay.scheduled.map((t) => t.id)).not.toContain(legacyDone.id);
    expect(completionDay.overdue.map((t) => t.id)).toContain(overdueOpen.id);

    const legacyCompletionDay = await tasksRange(db, {
      from: new Date("2026-06-11T00:00:00.000Z"),
      to: new Date("2026-06-12T00:00:00.000Z"),
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: true
    });
    expect(legacyCompletionDay.scheduled.map((t) => t.id)).toContain(legacyDone.id);
  });

  it("tasksRange does not duplicate in-range tasks into overdue", async () => {
    const p = await createProject(db, { key: "DUP", name: "No Duplicate" });
    const from = new Date(Date.now() - 2 * 60 * 1000);
    const dueAt = new Date(Date.now() - 60 * 1000);
    const to = new Date(Date.now() + 60 * 60 * 1000);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Show once in the active range",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    const range = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false
    });

    expect(range.scheduled.map((t) => t.id)).toContain(task.id);
    expect(range.overdue.map((t) => t.id)).not.toContain(task.id);
  });

  it("tasksRange keeps in-progress tasks on today and out of overdue", async () => {
    const p = await createProject(db, { key: "NOW", name: "Now" });
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Keep active work visible",
      body: "",
      tags: [],
      status: "in_progress",
      actorKind: "human",
      metadata: {},
      dueAt: new Date("2020-01-01T12:00:00.000Z")
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const today = await tasksRange(db, {
      from: todayStart,
      to: tomorrowStart,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false
    });
    expect(today.scheduled.map((t) => t.id)).toContain(task.id);
    expect(today.overdue.map((t) => t.id)).not.toContain(task.id);

    const yesterday = await tasksRange(db, {
      from: yesterdayStart,
      to: todayStart,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false
    });
    expect(yesterday.scheduled.map((t) => t.id)).not.toContain(task.id);
  });

  it("tasksRange includes cancelled tasks in inbox backlog", async () => {
    const p = await createProject(db, { key: "INBX", name: "Inbox" });
    const open = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Show undated task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const cancelled = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Show cancelled undated task",
      body: "",
      tags: [],
      status: "rejected",
      actorKind: "human",
      metadata: {}
    });

    const range = await tasksRange(db, {
      projectIds: [p.id],
      includeBacklog: true,
      includeDone: false
    });
    const ids = range.backlog.map((t) => t.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(cancelled.id);
  });

  it("creates a recurrence rule and generates the next scheduled occurrence on completion", async () => {
    const p = await createProject(db, { key: "REC", name: "Recurrence" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Review recurring task",
      body: "same body",
      tags: ["repeat"],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt,
      priority: "medium"
    });

    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });
    expect(rule.rrule).toContain("FREQ=DAILY");

    await update(db, task.id, { status: "done" });
    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.rule.currentOccurrenceId).not.toBe(task.id);
    expect(details?.currentOccurrence?.title).toBe(task.title);
    expect(details?.currentOccurrence?.status).toBe("open");
    expect(details?.currentOccurrence?.priority).toBe("medium");
    expect(details?.currentOccurrence?.dueAt?.toISOString()).toBe(
      new Date(dueAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
    );

    await update(db, task.id, { status: "done" });
    const afterRetry = await getRecurrenceForTask(db, task.id);
    expect(afterRetry?.rule.currentOccurrenceId).toBe(details?.rule.currentOccurrenceId);
  });

  it("tasksRange materializes scheduled recurrences through today", async () => {
    const p = await createProject(db, { key: "RMT", name: "Recurrence Materialize Today" });
    // Use UTC-based dates so allDayDueAtInZone(date, "UTC") produces predictable noon-UTC results
    // regardless of the test machine's local timezone.
    const todayStartUTC = new Date();
    todayStartUTC.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStartUTC);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const twoDaysAgo = new Date(todayStartUTC);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    twoDaysAgo.setUTCHours(12, 0, 0, 0);
    const todayStart = todayStartUTC;
    const todayDue = new Date(todayStartUTC);
    todayDue.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Publish daily recurring task",
      body: "",
      tags: ["repeat"],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: twoDaysAgo
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const range = await tasksRange(db, {
      from: todayStart,
      to: tomorrowStart,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false
    });

    const todayOccurrence = range.scheduled.find(
      (row) => row.title === task.title && row.dueAt?.getTime() === todayDue.getTime()
    );
    expect(todayOccurrence?.status).toBe("open");
    expect(range.overdue.filter((row) => row.title === task.title)).toHaveLength(2);

    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.id).toBe(todayOccurrence?.id);
    expect(details?.rule.generatedCount).toBe(3);
  });

  it("supports repeat-after-completion anchor", async () => {
    const p = await createProject(db, { key: "RAC", name: "Repeat After Completion" });
    const dueAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Replace maintenance item",
      body: "",
      tags: ["maintenance"],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 2,
      timezone: "UTC",
      allDay: true,
      anchor: "completion"
    });
    const before = Date.now();
    await update(db, task.id, { status: "done" });
    const after = Date.now();
    const details = await getRecurrenceForTask(db, task.id);
    const nextDue = details?.currentOccurrence?.dueAt?.getTime() ?? 0;

    // For all-day completion-anchor rules with timezone "UTC", the next occurrence is
    // snapped to noon UTC of the UTC calendar day that is 2 days after completion.
    // Compute the expected noon-UTC of (UTC day of "before" + 2 days).
    const twoDaysAfterBefore = new Date(before + 2 * 24 * 60 * 60 * 1000);
    twoDaysAfterBefore.setUTCHours(12, 0, 0, 0);
    const twoDaysAfterAfter = new Date(after + 2 * 24 * 60 * 60 * 1000);
    twoDaysAfterAfter.setUTCHours(12, 0, 0, 0);
    // The result is noon UTC of the day 2 days from now; allow ±1 day window for day-boundary edge cases.
    expect(nextDue).toBeGreaterThanOrEqual(twoDaysAfterBefore.getTime() - 24 * 60 * 60 * 1000);
    expect(nextDue).toBeLessThanOrEqual(twoDaysAfterAfter.getTime() + 24 * 60 * 60 * 1000);
    // Also verify the time is noon UTC (0 for hours other than 12 UTC means non-noon — reject that).
    expect(new Date(nextDue).getUTCHours()).toBe(12);
    expect(new Date(nextDue).getUTCMinutes()).toBe(0);
  });

  it("skips recurring occurrence and stops when count is exhausted", async () => {
    const p = await createProject(db, { key: "RSK", name: "Recurrence Skip" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Attend recurring meeting",
      body: "",
      tags: ["meeting"],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    await createRecurrenceRule(db, task.id, {
      preset: "weekly",
      interval: 1,
      count: 2,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });
    const skipped = await skipOccurrence(db, task.id, { actorKind: "human" });
    expect(skipped.skipped.status).toBe("rejected");
    expect(skipped.next?.status).toBe("open");

    await update(db, skipped.next!.id, { status: "done" });
    const details = await getRecurrenceForTask(db, skipped.next!.id);
    expect(details?.rule.enabled).toBe(false);
    expect(details?.rule.currentOccurrenceId).toBeNull();
  });

  it("rejects recurrence rules for tasks without due dates", async () => {
    const p = await createProject(db, { key: "RNO", name: "Recurrence No Due" });
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Needs a first due date",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    await expect(
      createRecurrenceRule(db, task.id, {
        preset: "weekly",
        interval: 1,
        timezone: "UTC",
        allDay: true,
        anchor: "scheduled"
      })
    ).rejects.toThrow("first due date");
  });

  it("link creates edge + listChildren via parentId", async () => {
    const p = await createProject(db, { key: "LNK", name: "Link" });
    const parent = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Parent task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const child = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Child note",
      body: "looks good",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      parentId: parent.id
    });

    const result = await link(db, {
      fromId: parent.id,
      toId: child.id,
      kind: "references"
    });
    expect(result.created).toBe(true);

    const dup = await link(db, {
      fromId: parent.id,
      toId: child.id,
      kind: "references"
    });
    expect(dup.created).toBe(false);
  });

  it("updateProject edits AGENTS.md", async () => {
    const p = await createProject(db, { key: "AGT", name: "Agt" });
    expect(p.agentsMd).toBe("");
    const updated = await updateProject(db, p.id, { agentsMd: "## Be brief." });
    expect(updated.agentsMd).toBe("## Be brief.");
  });

  it("search returns BM25 hit on tsvector match", async () => {
    const p = await createProject(db, { key: "SRC", name: "Src" });
    await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Postgres hybrid retrieval",
      body: "BM25 + cosine + time decay merged via RRF",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Coffee order",
      body: "Latte oat milk",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const hits = await search(db, { query: "RRF hybrid", projectId: p.id, limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entity.title).toBe("Postgres hybrid retrieval");
  });

  it("supersedes edge downweights the outdated entity in search", async () => {
    const p = await createProject(db, { key: "SUP", name: "Sup" });
    const noteInput = {
      kind: "note" as const,
      projectId: p.id,
      title: "Deploy requires manual cache flush",
      body: "Run scripts/flush-cache.sh after every deploy",
      tags: [],
      status: "open",
      actorKind: "human" as const,
      metadata: {}
    };
    const replacement = await write(db, noteInput);
    // The outdated note is created LAST so time decay would naturally rank it
    // first — only the supersedes penalty can flip the order.
    const outdated = await write(db, noteInput);
    await markSuperseded(db, replacement.id, outdated.id);

    const hits = await search(db, { query: "cache flush deploy", projectId: p.id, limit: 5 });
    const ids = hits.map((h) => h.entity.id);
    expect(ids.indexOf(replacement.id)).toBeLessThan(ids.indexOf(outdated.id));
    expect(hits.find((h) => h.entity.id === outdated.id)?.superseded).toBe(true);
    expect(hits.find((h) => h.entity.id === replacement.id)?.superseded).toBeUndefined();
  });

  it("markSuperseded rejects self-reference and missing targets", async () => {
    const p = await createProject(db, { key: "SUX", name: "Sux" });
    const note = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Lone note",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await expect(markSuperseded(db, note.id, note.id)).rejects.toThrow(/supersede itself/);
    await expect(
      markSuperseded(db, note.id, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(/not found/);
  });

  it("findSimilar surfaces near-duplicate notes and excludes the new note itself", async () => {
    const p = await createProject(db, { key: "DUP", name: "Dup" });
    const existing = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Staging DB password lives in 1Password",
      body: "Vault: infra / item: staging-postgres",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const fresh = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Staging DB password lives in 1Password",
      body: "Duplicate capture from another session",
      tags: [],
      status: "open",
      actorKind: "agent",
      metadata: {}
    });

    const similar = await findSimilar(db, {
      title: fresh.title,
      body: fresh.body,
      projectId: p.id,
      excludeId: fresh.id
    });
    expect(similar.map((h) => h.entity.id)).toContain(existing.id);
    expect(similar.map((h) => h.entity.id)).not.toContain(fresh.id);
  });

  it("submitFeedback stores categorized feedback and listFeedback filters it", async () => {
    const p = await createProject(db, { key: "FBK", name: "Fbk" });
    const bug = await submitFeedback(db, {
      category: "bug",
      title: "search drops KEY-SEQ refs from queries",
      body: "Searching for BOT-12 returns nothing even though the task exists.",
      projectId: p.id,
      tool: "search",
      actorKind: "agent",
      metadata: {},
      idempotencyKey: "fbk-1"
    });
    expect(bug.kind).toBe("feedback");
    expect(bug.status).toBe("open");
    expect((bug.metadata as { category?: string }).category).toBe("bug");
    expect((bug.metadata as { tool?: string }).tool).toBe("search");
    // Feedback with a project gets a KEY-SEQ ref like any addressable item.
    expect(bug.sequenceId).toBe(1);

    // Idempotent replay returns the same row.
    const replay = await submitFeedback(db, {
      category: "bug",
      title: "search drops KEY-SEQ refs from queries",
      body: "",
      actorKind: "agent",
      metadata: {},
      idempotencyKey: "fbk-1"
    });
    expect(replay.id).toBe(bug.id);

    await submitFeedback(db, {
      category: "idea",
      title: "opening brief could include a weekly summary",
      body: "",
      actorKind: "agent",
      metadata: {}
    });

    const bugs = await listFeedback(db, { category: "bug", limit: 20 });
    expect(bugs.map((f) => f.id)).toEqual([bug.id]);
    const all = await listFeedback(db, { limit: 20 });
    expect(all.length).toBe(2);
    const done = await listFeedback(db, { status: "done", limit: 20 });
    expect(done.length).toBe(0);
  });

  it("bumpAccess tracks reads and boosts frequently-recalled entities in search", async () => {
    const p = await createProject(db, { key: "ACC", name: "Acc" });
    const noteInput = {
      kind: "note" as const,
      projectId: p.id,
      title: "Redis eviction policy is allkeys-lru",
      body: "Set on the prod cluster; do not change without capacity review",
      tags: [],
      status: "open",
      actorKind: "human" as const,
      metadata: {}
    };
    const recalled = await write(db, noteInput);
    // Newer twin would win on time decay if access count did not matter.
    const untouched = await write(db, noteInput);

    for (let i = 0; i < 20; i += 1) await bumpAccess(db, recalled.id);
    const fetched = await get(db, recalled.id);
    expect(fetched?.accessCount).toBe(20);
    expect(fetched?.lastAccessedAt).not.toBeNull();

    const hits = await search(db, { query: "redis eviction policy", projectId: p.id, limit: 5 });
    const ids = hits.map((h) => h.entity.id);
    expect(ids.indexOf(recalled.id)).toBeLessThan(ids.indexOf(untouched.id));
    expect(hits.find((h) => h.entity.id === recalled.id)?.components.accessBoost).toBeGreaterThan(0);
  });

  it("embedding queue is no-op when disabled", async () => {
    const svc = new EmbeddingService(db);
    expect(svc.isEnabled()).toBe(false);
    svc.enqueue("fake-id", "some text");
    expect(svc.pendingCount()).toBe(0);
    expect(await svc.embedQuery("hello")).toBeNull();
  });

  it("embedding settings persist and reload the runtime", async () => {
    const initial = await getEmbeddingSettings(db);
    expect(initial.enabled).toBe(true);
    expect(initial.model).toBe("text-embedding-3-small");

    const svc = new EmbeddingService(db);
    const missing = await svc.reloadConfig();
    expect(missing.enabled).toBe(false);
    expect(missing.reason).toBe("missing_api_key");

    await updateEmbeddingSettings(db, {
      provider: "openai",
      model: "text-embedding-3-large",
      apiKey: "sk-test"
    });

    const ready = await svc.reloadConfig();
    expect(ready.enabled).toBe(true);
    expect(ready.model).toBe("text-embedding-3-large");
    expect(ready.apiKeySource).toBe("settings");
    expect(ready.apiKeyPreview).toBe("configured");
  });

  it("openai-compatible embedding settings require a base URL", async () => {
    await updateEmbeddingSettings(db, {
      provider: "openai_compatible",
      model: "custom-384",
      apiKey: "sk-compatible"
    });

    const svc = new EmbeddingService(db);
    const missingBaseUrl = await svc.reloadConfig();
    expect(missingBaseUrl.enabled).toBe(false);
    expect(missingBaseUrl.reason).toBe("missing_base_url");

    await updateEmbeddingSettings(db, {
      baseUrl: "https://embeddings.example.com/v1"
    });

    const ready = await svc.reloadConfig();
    expect(ready.enabled).toBe(true);
    expect(ready.provider).toBe("openai_compatible");
    expect(ready.baseUrl).toBe("https://embeddings.example.com/v1");
  });

  it("stores recoverable API token plaintext for Settings copy", async () => {
    const { plaintext } = await createToken(db, { name: "laptop" });
    expect(plaintext).toMatch(/^bn_[0-9a-f]{48}$/);

    const rows = await listTokens(db);
    expect(rows[0]?.name).toBe("laptop");
    expect(rows[0]?.prefix).toBe(plaintext.slice(0, 11));
    expect(rows[0]?.plaintext).toBe(plaintext);

    const consumed = await consumeToken(db, plaintext);
    expect(consumed?.id).toBe(rows[0]?.id);
  });

  it("embedding queue drains via injected embedFn + sets body_vec", async () => {
    const p = await createProject(db, { key: "EMB", name: "Emb" });
    const note = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Sample note",
      body: "embedding worker test",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const fakeVec = new Array(384).fill(0).map((_, i) => (i % 7) / 10);
    const svc = new EmbeddingService(db, {
      embedFn: async () => fakeVec,
      logger: () => undefined
    });
    expect(svc.isEnabled()).toBe(true);
    svc.enqueue(note.id, "embedding worker test");
    await svc.drain(5000);

    const fetched = await get(db, note.id);
    expect(fetched?.bodyVec).not.toBeNull();
    expect(fetched?.bodyVec?.length).toBe(384);
  });

  it("embedding backfill queues only entities without vectors", async () => {
    const p = await createProject(db, { key: "BFI", name: "Backfill" });
    const missing = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Needs embedding",
      body: "queue this one",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const alreadyEmbedded = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Already embedded",
      body: "skip this one",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await setBodyVec(db, alreadyEmbedded.id, new Array(384).fill(0.2));

    const before = await embeddingCoverage(db);
    expect(before.missingCount).toBe(1);
    expect(before.embeddedCount).toBe(1);

    const svc = new EmbeddingService(db, {
      embedFn: async () => new Array(384).fill(0.4),
      logger: () => undefined
    });
    const queued = await svc.enqueueMissing(10);
    expect(queued.enqueued).toBe(1);
    await svc.drain(5000);

    const fetchedMissing = await get(db, missing.id);
    const fetchedExisting = await get(db, alreadyEmbedded.id);
    expect(fetchedMissing?.bodyVec?.[0]).toBe(0.4);
    expect(fetchedExisting?.bodyVec?.[0]).toBe(0.2);
  });

  it("embedding queue retries on transient failure", async () => {
    const p = await createProject(db, { key: "RTY", name: "Rty" });
    const note = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Retry test",
      body: "x",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    let calls = 0;
    const fakeVec = new Array(384).fill(0.5);
    const svc = new EmbeddingService(db, {
      embedFn: async () => {
        calls++;
        if (calls < 2) throw new Error("transient");
        return fakeVec;
      },
      logger: () => undefined
    });
    svc.enqueue(note.id, "x");
    await svc.drain(5000);
    expect(calls).toBeGreaterThanOrEqual(2);
    const fetched = await get(db, note.id);
    expect(fetched?.bodyVec?.length).toBe(384);
  });

  it("hybrid search merges BM25 + cosine via RRF", async () => {
    const p = await createProject(db, { key: "HYB", name: "Hybrid" });

    const dim = 384;
    function vec(seed: number): number[] {
      const v = new Array(dim);
      let x = seed;
      for (let i = 0; i < dim; i++) {
        x = (x * 1664525 + 1013904223) >>> 0;
        v[i] = ((x / 0xffffffff) - 0.5) * 2;
      }
      let norm = 0;
      for (const c of v) norm += c * c;
      norm = Math.sqrt(norm);
      return v.map((c) => c / norm);
    }

    const target = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Esoteric subject zenith",
      body: "no normal keyword match here",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const noise = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Coffee order",
      body: "Latte oat milk",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const targetVec = vec(1);
    await setBodyVec(db, target.id, targetVec);
    await setBodyVec(db, noise.id, vec(99999));

    const hits = await search(
      db,
      { query: "unrelated query", projectId: p.id, limit: 5 },
      { queryEmbedding: targetVec }
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entity.id).toBe(target.id);
    expect(hits[0]?.components.cosine).toBeDefined();
  });

  it("openingBrief gathers project context", async () => {
    const p = await createProject(db, {
      key: "OBR",
      name: "OBR Project",
      agentsMd: "## NEVER push to main"
    });
    const openTask = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Open task A",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Pinned deployment note",
      body: "Production uses the npm package for plugin runtime.",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      pinned: true
    });
    await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Random thought",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const brief = await openingBrief(db, { projectId: p.id, recentLimit: 10 });
    expect(brief.project?.key).toBe("OBR");
    expect(brief.agentsMd).toContain("NEVER push");
    expect(brief.openTasks.length).toBe(1);
    expect(brief.pinnedNotes.length).toBe(1);
    expect(brief.recent.length).toBe(3);

    const formatted = formatOpeningBrief(brief);
    expect(formatted).toContain("# Project: OBR");
    expect(formatted).toContain("## Open Tasks");
    expect(formatted).toContain("## Pinned Notes");
    expect(formatted).toContain(`[OBR-${openTask.sequenceId}]`);
    expect(formatted).toMatch(/OBR-\d+ · Open task A/);
  });

  it("openingBrief surfaces in_progress tasks first and orders open tasks by urgency", async () => {
    const p = await createProject(db, { key: "OBR2", name: "OBR2 Project" });
    const base = {
      kind: "task" as const,
      projectId: p.id,
      body: "",
      tags: [],
      actorKind: "human" as const,
      metadata: {}
    };
    const backlog = await write(db, { ...base, title: "Backlog idea", status: "open" });
    const started = await write(db, { ...base, title: "Started yesterday", status: "in_progress" });
    const overdue = await write(db, {
      ...base,
      title: "Overdue chore",
      status: "open",
      dueAt: new Date("2026-01-05T12:00:00.000Z")
    });
    const urgent = await write(db, { ...base, title: "Urgent no date", status: "open", priority: "urgent" });
    await write(db, { ...base, title: "Already done", status: "done" });

    const brief = await openingBrief(db, { projectId: p.id, recentLimit: 10 });
    const ids = brief.openTasks.map((t) => t.id);
    expect(ids).toEqual([started.id, overdue.id, urgent.id, backlog.id]);

    const formatted = formatOpeningBrief(brief);
    expect(formatted).toContain("## In Progress (1)");
    expect(formatted).toContain("Started yesterday");
    expect(formatted).toContain("## Open Tasks (3)");
    expect(formatted).toContain("(OVERDUE 2026-01-05)");
    expect(formatted).toContain("!urgent");
  });

  it("addComment appends a worklog entry that inherits the project but no sequence id", async () => {
    const p = await createProject(db, { key: "CMT", name: "CMT Project" });
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task with worklog",
      body: "",
      tags: [],
      status: "in_progress",
      actorKind: "human",
      metadata: {}
    });

    const c1 = await addComment(db, task.id, {
      body: "Implemented the parser, tests green.",
      actorKind: "agent",
      metadata: {},
      idempotencyKey: "cmt-1"
    });
    expect(c1.kind).toBe("comment");
    expect(c1.parentId).toBe(task.id);
    expect(c1.projectId).toBe(p.id);
    expect(c1.sequenceId).toBeNull();

    // idempotent re-write returns the same row
    const again = await addComment(db, task.id, {
      body: "Implemented the parser, tests green.",
      actorKind: "agent",
      metadata: {},
      idempotencyKey: "cmt-1"
    });
    expect(again.id).toBe(c1.id);

    await addComment(db, task.id, {
      body: "Blocked on the flaky CI runner.",
      actorKind: "agent",
      metadata: {}
    });
    const all = await listComments(db, task.id);
    expect(all.map((c) => c.body)).toEqual([
      "Implemented the parser, tests green.",
      "Blocked on the flaky CI runner."
    ]);

    // append-only: comments reject updates, nesting is refused
    await expect(update(db, c1.id, { body: "rewritten" })).rejects.toThrow(/append-only/);
    await expect(
      addComment(db, c1.id, { body: "nested", actorKind: "agent", metadata: {} })
    ).rejects.toThrow(/nested/);
  });

  it("openingBrief surfaces the latest worklog comment for in_progress tasks", async () => {
    const p = await createProject(db, { key: "CMT2", name: "CMT2 Project" });
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Resumable task",
      body: "",
      tags: [],
      status: "in_progress",
      actorKind: "human",
      metadata: {}
    });
    await addComment(db, task.id, { body: "First log.", actorKind: "agent", metadata: {} });
    await addComment(db, task.id, {
      body: "Second log — stopped at the REST layer.",
      actorKind: "agent",
      metadata: {}
    });

    const brief = await openingBrief(db, { projectId: p.id, recentLimit: 10 });
    expect(brief.latestComments.length).toBe(1);
    expect(brief.latestComments[0]?.body).toContain("Second log");

    const formatted = formatOpeningBrief(brief);
    expect(formatted).toContain("↳ last log");
    expect(formatted).toContain("stopped at the REST layer");
  });

  it("formatOpeningBrief truncates oversized pinned notes with a fetch hint", async () => {
    const p = await createProject(db, { key: "OBR3", name: "OBR3 Project" });
    await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Huge pinned doc",
      body: "x".repeat(5000),
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      pinned: true
    });
    const brief = await openingBrief(db, { projectId: p.id, recentLimit: 5 });
    const formatted = formatOpeningBrief(brief);
    expect(formatted).toContain("truncated — fetch");
    // 2000-char per-note cap plus surrounding sections; the raw 5000-char body must not appear.
    expect(formatted).not.toContain("x".repeat(2001));
    expect(formatted).toContain("x".repeat(2000));
  });

  // ---------------------------------------------------------------------------
  // allDayDueAtInZone unit tests

  it("allDayDueAtInZone resolves UTC midnight to noon UTC (no-op equivalent to normalizeDueAt)", () => {
    const date = new Date("2026-06-23T00:00:00.000Z");
    const result = allDayDueAtInZone(date, "UTC");
    expect(result?.toISOString()).toBe("2026-06-23T12:00:00.000Z");
  });

  it("allDayDueAtInZone resolves a date at 02:00Z to the previous calendar day in America/New_York", () => {
    // 2026-06-23T02:00:00Z is 2026-06-22 22:00 EDT (UTC-4), so calendar day is June 22
    const date = new Date("2026-06-23T02:00:00.000Z");
    const result = allDayDueAtInZone(date, "America/New_York");
    // Should be noon UTC of June 22
    expect(result?.toISOString()).toBe("2026-06-22T12:00:00.000Z");
  });

  it("allDayDueAtInZone falls back to normalizeDueAt for an invalid timezone", () => {
    const date = new Date("2026-06-23T00:00:00.000Z");
    const result = allDayDueAtInZone(date, "Not/A_Timezone");
    // normalizeDueAt of midnight UTC => noon UTC
    expect(result?.toISOString()).toBe("2026-06-23T12:00:00.000Z");
  });

  it("allDayDueAtInZone returns null for null input", () => {
    expect(allDayDueAtInZone(null, "UTC")).toBeNull();
    expect(allDayDueAtInZone(undefined, "UTC")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // workspace settings service tests

  it("getWorkspaceSettings lazy-creates default row with UTC timezone", async () => {
    const settings = await getWorkspaceSettings(db);
    expect(settings.timezone).toBe("UTC");
    expect(settings.id).toBe("default");
  });

  it("getWorkspaceSettings is idempotent (lazy-create does not duplicate rows)", async () => {
    const first = await getWorkspaceSettings(db);
    const second = await getWorkspaceSettings(db);
    expect(first.id).toBe(second.id);
    expect(first.timezone).toBe(second.timezone);
  });

  it("updateWorkspaceSettings persists a valid IANA timezone", async () => {
    const updated = await updateWorkspaceSettings(db, { timezone: "America/New_York" });
    expect(updated.timezone).toBe("America/New_York");

    const fetched = await getWorkspaceSettings(db);
    expect(fetched.timezone).toBe("America/New_York");
  });

  it("updateWorkspaceSettings rejects an invalid timezone string", async () => {
    await expect(
      updateWorkspaceSettings(db, { timezone: "Not/Real_TZ" })
    ).rejects.toThrow("Invalid IANA timezone");
  });

  it("createRecurrenceRule with no input.timezone adopts the workspace timezone", async () => {
    await updateWorkspaceSettings(db, { timezone: "America/Chicago" });

    const p = await createProject(db, { key: "WSTZ", name: "Workspace TZ" });
    const dueAt = new Date("2026-06-23T12:00:00.000Z");
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Workspace TZ task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      allDay: true,
      anchor: "scheduled"
      // No timezone field — should adopt workspace tz
    });

    expect(rule.timezone).toBe("America/Chicago");
  });

  // -----------------------------------------------------------------------
  // BOT-54: recurrenceScope tests
  // -----------------------------------------------------------------------

  it("this-only title edit does not propagate to next occurrence", async () => {
    const p = await createProject(db, { key: "SC1", name: "Scope1" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Edit title with scope='this'
    await update(db, task.id, { title: "Changed title", recurrenceScope: "this" });

    // Complete to advance
    await update(db, task.id, { status: "done" });

    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.title).toBe("Original title");
  });

  it("going-forward edit propagates title to next occurrence", async () => {
    const p = await createProject(db, { key: "SC2", name: "Scope2" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Edit title with scope='future' (explicit)
    await update(db, task.id, { title: "New title", recurrenceScope: "future" });
    await update(db, task.id, { status: "done" });

    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.title).toBe("New title");
  });

  it("baseline merge: earliest-wins — two this-only title edits preserve original", async () => {
    const p = await createProject(db, { key: "SC3", name: "Scope3" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    await update(db, task.id, { title: "First change", recurrenceScope: "this" });
    await update(db, task.id, { title: "Second change", recurrenceScope: "this" });
    await update(db, task.id, { status: "done" });

    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.title).toBe("Original title");
  });

  it("mixed: this-only title + going-forward priority", async () => {
    const p = await createProject(db, { key: "SC4", name: "Scope4" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt,
      priority: "low"
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Edit title this-only, then priority going-forward (two separate calls)
    await update(db, task.id, { title: "Changed title", recurrenceScope: "this" });
    await update(db, task.id, { priority: "high", recurrenceScope: "future" });
    await update(db, task.id, { status: "done" });

    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.title).toBe("Original title");
    expect(details?.currentOccurrence?.priority).toBe("high");
  });

  it("exception row has correct shape for this-only body edit", async () => {
    const p = await createProject(db, { key: "SC5", name: "Scope5" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task",
      body: "original body",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    await update(db, task.id, { body: "changed body", recurrenceScope: "this" });

    const exceptions = await db
      .select()
      .from(recurrenceExceptions)
      .where(
        and(
          eq(recurrenceExceptions.entityId, task.id),
          eq(recurrenceExceptions.action, "modified")
        )
      )
      .limit(1);
    const ex = exceptions[0];
    expect(ex).toBeDefined();
    expect(ex!.action).toBe("modified");
    expect(ex!.ruleId).toBe(rule.id);
    expect(ex!.entityId).toBe(task.id);
    const meta = ex!.metadata as Record<string, unknown>;
    expect(meta.scope).toBe("this");
    const baseline = meta.baseline as Record<string, unknown>;
    expect(baseline.body).toBe("original body");
    expect(meta.changedFields).toContain("body");
  });

  it("going-forward edit clears prior this-only baseline for that field", async () => {
    const p = await createProject(db, { key: "SC6", name: "Scope6" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // First set a this-only baseline for title
    await update(db, task.id, { title: "This-only change", recurrenceScope: "this" });
    // Then override going-forward — should clear the baseline
    await update(db, task.id, { title: "Going-forward change", recurrenceScope: "future" });

    // No modified exception should exist for this field now
    const exceptions = await db
      .select()
      .from(recurrenceExceptions)
      .where(
        and(
          eq(recurrenceExceptions.entityId, task.id),
          eq(recurrenceExceptions.action, "modified")
        )
      );
    // Either row is deleted (empty baseline) or field not in baseline
    if (exceptions.length > 0) {
      const meta = exceptions[0]!.metadata as Record<string, unknown>;
      const baseline = (meta.baseline ?? {}) as Record<string, unknown>;
      expect("title" in baseline).toBe(false);
    }

    // Complete and verify next occurrence gets going-forward value
    await update(db, task.id, { status: "done" });
    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.currentOccurrence?.title).toBe("Going-forward change");
  });

  it("materializeScheduledRecurrences respects baseline for scheduled-anchor series", async () => {
    const p = await createProject(db, { key: "SC7", name: "Scope7" });
    const todayStartUTC = new Date();
    todayStartUTC.setUTCHours(0, 0, 0, 0);
    const twoDaysAgo = new Date(todayStartUTC);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    twoDaysAgo.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Series title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: twoDaysAgo
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Mark current occurrence as this-only title change
    await update(db, task.id, { title: "Occurrence-only title", recurrenceScope: "this" });

    // Materialize upcoming occurrences
    const upTo = new Date();
    upTo.setUTCDate(upTo.getUTCDate() + 1);
    const created = await materializeScheduledRecurrences(db, upTo);

    // Created occurrences should use the original series title (baseline restored)
    for (const occ of created) {
      if (occ.title !== "Occurrence-only title") {
        expect(occ.title).toBe("Series title");
      }
    }
    // At least one was created
    expect(created.length).toBeGreaterThan(0);
  });

  it("recurrenceScope is a no-op for non-recurring entities", async () => {
    const p = await createProject(db, { key: "SC8", name: "Scope8" });
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Plain task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    // Update with recurrenceScope should work fine and update the field
    const updated = await update(db, task.id, {
      title: "Updated title",
      recurrenceScope: "this"
    });
    expect(updated.title).toBe("Updated title");

    // No exception row created
    const exceptions = await db
      .select()
      .from(recurrenceExceptions)
      .where(eq(recurrenceExceptions.entityId, task.id));
    expect(exceptions).toHaveLength(0);
  });

  it("skip after this-only edit: next occurrence has original series field", async () => {
    const p = await createProject(db, { key: "SC9", name: "Scope9" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Edit title this-only, then skip
    await update(db, task.id, { title: "This-only title", recurrenceScope: "this" });
    const { next } = await skipOccurrence(db, task.id, { actorKind: "human" });

    expect(next?.title).toBe("Original title");
  });

  it("all-day recurrence under non-UTC workspace tz computes occurrence on correct local calendar day", async () => {
    // Set workspace to America/New_York (UTC-4 in summer).
    await updateWorkspaceSettings(db, { timezone: "America/New_York" });

    const p = await createProject(db, { key: "NYTK", name: "NY TZ Recurrence" });
    // dtstart noon UTC = noon UTC on June 23, which is June 23 08:00 EDT — calendar day June 23 in NY.
    const dueAt = new Date("2026-06-23T12:00:00.000Z");
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "NY daily task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });

    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      allDay: true,
      anchor: "scheduled"
    });

    // The next occurrence should be on June 24 local time in NY = noon UTC June 24
    expect(rule.nextOccurrenceAt?.toISOString()).toBe("2026-06-24T12:00:00.000Z");
  });

  // ---------------------------------------------------------------------------
  // BOT-53: Virtual occurrences (ghost cards) tests
  // ---------------------------------------------------------------------------

  it("virtualOccurrences is [] when includeVirtualRecurrences is false (hard boundary)", async () => {
    const p = await createProject(db, { key: "VRT0", name: "Virtual0" });
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Daily recurring",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 14);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false
      // includeVirtualRecurrences not set → defaults to false
    });
    expect(result.virtualOccurrences).toEqual([]);
  });

  it("daily rule fills window; materialized occurrence subtracted; virtuals have correct shape", async () => {
    const p = await createProject(db, { key: "VRT1", name: "Virtual1" });
    // Task due tomorrow (so window starts after now but rule is already set up)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Virtual daily",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Query: from now, to now+5 days
    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 5);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // Tomorrow's occurrence is the materialized real task (already in scheduled)
    const realIds = result.scheduled.map((e) => e.id);
    expect(realIds).toContain(task.id);

    // Virtuals should not include the materialized occurrence's dueAt
    const virtualDueTimes = result.virtualOccurrences.map((v) => v.dueAt);
    expect(virtualDueTimes).not.toContain(tomorrow.toISOString());

    // Each virtual has virtual=true, correct ruleId, seriesId, and noon-UTC dueAt
    for (const v of result.virtualOccurrences) {
      expect(v.virtual).toBe(true);
      expect(v.ruleId).toBe(rule.id);
      expect(v.seriesId).toBe(rule.seriesId);
      expect(v.id).toMatch(/^virtual:/);
      // All-day UTC → noon UTC
      const dueDate = new Date(v.dueAt);
      expect(dueDate.getUTCHours()).toBe(12);
      expect(dueDate.getUTCMinutes()).toBe(0);
    }

    // Virtuals should cover 2 days+: day-after-tomorrow through to (up to ~4 days)
    expect(result.virtualOccurrences.length).toBeGreaterThan(0);
  });

  it("virtual id format is virtual:<ruleId>:<iso>", async () => {
    const p = await createProject(db, { key: "VRT2", name: "Virtual2" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "ID check",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 5);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    for (const v of result.virtualOccurrences) {
      expect(v.id).toBe(`virtual:${rule.id}:${v.dueAt}`);
    }
  });

  it("skipped exception blocks corresponding virtual occurrence", async () => {
    const p = await createProject(db, { key: "VRT3", name: "Virtual3" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Skip test",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Insert a 'skipped' exception for the day-after-tomorrow occurrence.
    // The exception's occurrenceAt must match the RRule raw output date, which
    // for a UTC daily rule with dtstart=noon-UTC is also noon UTC.
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);
    // dayAfterTomorrow is already noon UTC (inherited from `tomorrow`)
    await db.insert(recurrenceExceptions).values({
      ruleId: rule.id,
      occurrenceAt: dayAfterTomorrow,
      action: "skipped",
      entityId: null,
      metadata: {}
    });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // The day-after-tomorrow virtual should be blocked by the exception
    const blockedDue = dayAfterTomorrow.toISOString();
    const found = result.virtualOccurrences.find((v) => v.dueAt === blockedDue);
    expect(found).toBeUndefined();
  });

  it("all-day + non-UTC timezone → dueAt is noon UTC of correct local calendar day", async () => {
    // Set workspace to America/New_York (UTC-4 summer)
    await updateWorkspaceSettings(db, { timezone: "America/New_York" });

    const p = await createProject(db, { key: "VRT4", name: "Virtual4" });
    // dueAt: noon UTC June 23 = 08:00 EDT = calendar day June 23 in NY
    const dueAt = new Date("2026-06-23T12:00:00.000Z");
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "NY tz virtual",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      allDay: true,
      anchor: "scheduled"
      // timezone inherited from workspace = America/New_York
    });

    // Query from now to 2026-06-30 (future window from today's perspective)
    const from = new Date();
    const to = new Date("2026-06-30T12:00:00.000Z");

    // If today > 2026-06-30, skip test (won't have future virtuals)
    if (from.getTime() >= to.getTime()) return;

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // Each virtual's dueAt should be noon UTC on the correct calendar day
    for (const v of result.virtualOccurrences) {
      const d = new Date(v.dueAt);
      expect(d.getUTCHours()).toBe(12);
      expect(d.getUTCMinutes()).toBe(0);
    }
  });

  it("COUNT-bounded rule → no virtuals beyond count", async () => {
    const p = await createProject(db, { key: "VRT5", name: "Virtual5" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Count bounded",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      count: 3,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Query 30 days
    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 30);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // With count=3 and 1 already materialized, at most 2 virtuals
    // The RRule with count=3 only generates 3 dates total (including dtstart)
    expect(result.virtualOccurrences.length).toBeLessThanOrEqual(2);
  });

  it("stopped/disabled rule → no virtuals", async () => {
    const p = await createProject(db, { key: "VRT6", name: "Virtual6" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Stopped rule",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Stop the rule
    await stopRecurrence(db, rule.id);

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    expect(result.virtualOccurrences).toHaveLength(0);
  });

  it("completion-anchor rule → no virtuals (anchor must be 'scheduled')", async () => {
    const p = await createProject(db, { key: "VRT7", name: "Virtual7" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Completion anchor task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "completion"
    });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    expect(result.virtualOccurrences).toHaveLength(0);
  });

  it("project filter restricts virtuals to matching projectId", async () => {
    const p1 = await createProject(db, { key: "VRP1", name: "Virtual P1" });
    const p2 = await createProject(db, { key: "VRP2", name: "Virtual P2" });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task1 = await write(db, {
      kind: "task",
      projectId: p1.id,
      title: "P1 daily",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task1.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const task2 = await write(db, {
      kind: "task",
      projectId: p2.id,
      title: "P2 daily",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task2.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 5);

    // Filter to p1 only
    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p1.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    for (const v of result.virtualOccurrences) {
      expect(v.projectId).toBe(p1.id);
    }
    expect(result.virtualOccurrences.length).toBeGreaterThan(0);
  });

  it("virtual dueAt is within [windowStart, to); window clamped to now", async () => {
    const p = await createProject(db, { key: "VRT8", name: "Virtual8" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Horizon test",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const from = new Date("2020-01-01T00:00:00.000Z"); // past
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 7);
    const now = Date.now();

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // All virtual dueAt must be >= now (no past ghosts, even though from is in past)
    for (const v of result.virtualOccurrences) {
      expect(new Date(v.dueAt).getTime()).toBeGreaterThanOrEqual(now - 60000); // 1-minute tolerance
      expect(new Date(v.dueAt).getTime()).toBeLessThan(to.getTime());
    }
  });

  it("CORRECTION 1: after going-forward title edit, virtual title reflects NEW title", async () => {
    const p = await createProject(db, { key: "VRC1", name: "VirtualCorr1" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // Going-forward title edit (no recurrenceScope = going-forward by default)
    await update(db, task.id, { title: "New series title", recurrenceScope: "future" });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 5);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // All virtuals should reflect the new title
    for (const v of result.virtualOccurrences) {
      expect(v.title).toBe("New series title");
    }
    expect(result.virtualOccurrences.length).toBeGreaterThan(0);
  });

  it("CORRECTION 1: after this-only title edit, virtual title reflects ORIGINAL (baseline) title", async () => {
    const p = await createProject(db, { key: "VRC2", name: "VirtualCorr2" });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Original title",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt: tomorrow
    });
    await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    // This-only edit: title on current occurrence should not propagate to virtuals
    await update(db, task.id, { title: "This-occurrence-only title", recurrenceScope: "this" });

    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 5);

    const result = await tasksRange(db, {
      from,
      to,
      projectIds: [p.id],
      includeBacklog: false,
      includeDone: false,
      includeVirtualRecurrences: true
    });

    // Virtuals should show original (baseline) title, not the this-only override
    for (const v of result.virtualOccurrences) {
      expect(v.title).toBe("Original title");
    }
    expect(result.virtualOccurrences.length).toBeGreaterThan(0);
  });

  it("splitRecurrence forks a scheduled series at the current occurrence", async () => {
    const p = await createProject(db, { key: "SPL", name: "Split Scheduled" });
    const dueAt = new Date();
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Series task",
      body: "series body",
      tags: ["series"],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt,
      priority: "high"
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const newRule = await splitRecurrence(db, rule.id, { preset: "weekly", interval: 1 });

    // Old rule is frozen with UNTIL at the fork; disabled but kept as history.
    const [oldRow] = await db
      .select()
      .from(recurrenceRules)
      .where(eq(recurrenceRules.id, rule.id));
    expect(oldRow.enabled).toBe(false);
    expect(oldRow.rrule).toContain("UNTIL=");
    expect(oldRow.endedAt).not.toBeNull();
    expect(oldRow.currentOccurrenceId).toBe(task.id);

    // New rule shares the series_id (UI continuity) but is a distinct row.
    expect(newRule.id).not.toBe(rule.id);
    expect(newRule.seriesId).toBe(rule.seriesId);
    expect(newRule.enabled).toBe(true);
    expect(newRule.rrule).toContain("FREQ=WEEKLY");
    expect(newRule.generatedCount).toBe(0);
    expect(newRule.currentOccurrenceId).toBe(task.id);
    // First new-cadence occurrence is strictly after the fork — no duplicate at it.
    expect(newRule.dtstart.getTime()).toBeGreaterThan(dueAt.getTime());
    expect(newRule.nextOccurrenceAt?.getTime()).toBe(newRule.dtstart.getTime());

    // Exactly one task carries the fork due date (the original current occurrence).
    const atFork = await db.select().from(entities).where(eq(entities.dueAt, dueAt));
    expect(atFork).toHaveLength(1);
    expect(atFork[0].id).toBe(task.id);

    // Materialize the new cadence forward.
    const upTo = new Date(dueAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const created = await materializeScheduledRecurrences(db, upTo);
    expect(created.length).toBeGreaterThan(0);
    const first = created[0];
    expect(first.dueAt?.getTime()).toBe(newRule.dtstart.getTime());
    expect(first.dueAt?.getTime()).not.toBe(dueAt.getTime());
    expect(first.title).toBe("Series task");
    expect(first.priority).toBe("high");
    const marker = (first.metadata as { recurrence?: Record<string, unknown> }).recurrence;
    expect(marker?.seriesId).toBe(rule.seriesId);
    expect(marker?.ruleId).toBe(newRule.id);

    // Re-running the materializer over the same window is idempotent (no dupes).
    const createdAgain = await materializeScheduledRecurrences(db, upTo);
    expect(createdAgain).toHaveLength(0);

    // The original occurrence still routes to the (disabled) old rule.
    const fromCurrent = await getRecurrenceForTask(db, task.id);
    expect(fromCurrent?.rule.id).toBe(rule.id);
  });

  it("splitRecurrence with completion anchor re-homes the current occurrence", async () => {
    const p = await createProject(db, { key: "SPC", name: "Split Completion" });
    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() - 1);
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Maintenance",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const newRule = await splitRecurrence(db, rule.id, {
      preset: "weekly",
      interval: 1,
      anchor: "completion"
    });
    expect(newRule.anchor).toBe("completion");
    expect(newRule.currentOccurrenceId).toBe(task.id);
    expect(newRule.nextOccurrenceAt).toBeNull();
    expect(newRule.generatedCount).toBe(rule.generatedCount);

    // Old rule is frozen and releases the current occurrence (it was re-homed).
    const [oldRow] = await db
      .select()
      .from(recurrenceRules)
      .where(eq(recurrenceRules.id, rule.id));
    expect(oldRow.enabled).toBe(false);
    expect(oldRow.currentOccurrenceId).toBeNull();

    // The current occurrence now routes to the new rule.
    const rehomed = await getRecurrenceForTask(db, task.id);
    expect(rehomed?.rule.id).toBe(newRule.id);

    // Completing it advances the NEW (weekly, completion) cadence.
    await update(db, task.id, { status: "done" });
    const details = await getRecurrenceForTask(db, task.id);
    expect(details?.rule.id).toBe(newRule.id);
    expect(details?.rule.currentOccurrenceId).not.toBe(task.id);
    expect(details?.currentOccurrence?.status).toBe("open");
    const nextDue = details?.currentOccurrence?.dueAt?.getTime() ?? 0;
    expect(nextDue).toBeGreaterThan(Date.now());
  });

  it("splitRecurrence rejects unknown and disabled rules", async () => {
    await expect(
      splitRecurrence(db, "00000000-0000-0000-0000-000000000000", { preset: "daily" })
    ).rejects.toThrow(/not found/);

    const p = await createProject(db, { key: "SPD", name: "Split Disabled" });
    const dueAt = new Date();
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Already stopped",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });
    await stopRecurrence(db, rule.id);
    await expect(splitRecurrence(db, rule.id, { preset: "weekly" })).rejects.toThrow(/active/);
  });

  // ---------------------------------------------------------------------------
  // listTags service tests

  it("listTags returns distinct tags ordered by count desc then tag asc", async () => {
    const p = await createProject(db, { key: "LTAG", name: "List Tags" });
    await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task 1",
      body: "",
      tags: ["alpha", "beta"],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task 2",
      body: "",
      tags: ["alpha", "gamma"],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const tags = await listTags(db, { projectId: p.id });
    // alpha appears twice, beta and gamma once
    expect(tags[0]?.tag).toBe("alpha");
    expect(tags[0]?.count).toBe(2);
    // beta and gamma both have count=1, sorted alphabetically
    const rest = tags.slice(1).map((t) => t.tag);
    expect(rest).toEqual(["beta", "gamma"]);
    expect(tags.slice(1).every((t) => t.count === 1)).toBe(true);
  });

  it("listTags scopes to projectId when provided", async () => {
    const p1 = await createProject(db, { key: "TLP1", name: "Tags Project 1" });
    const p2 = await createProject(db, { key: "TLP2", name: "Tags Project 2" });
    await write(db, {
      kind: "note",
      projectId: p1.id,
      title: "P1 note",
      body: "",
      tags: ["p1-only"],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await write(db, {
      kind: "note",
      projectId: p2.id,
      title: "P2 note",
      body: "",
      tags: ["p2-only"],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const tagsP1 = await listTags(db, { projectId: p1.id });
    expect(tagsP1.map((t) => t.tag)).toEqual(["p1-only"]);

    const tagsAll = await listTags(db, { projectId: null });
    const tagNames = tagsAll.map((t) => t.tag);
    expect(tagNames).toContain("p1-only");
    expect(tagNames).toContain("p2-only");
  });

  it("listTags returns empty array when no tags exist", async () => {
    const p = await createProject(db, { key: "TLZ", name: "Tags Zero" });
    await write(db, {
      kind: "task",
      projectId: p.id,
      title: "No tags task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const tags = await listTags(db, { projectId: p.id });
    expect(tags).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getLinks service tests

  it("getLinks returns outgoing edges correctly", async () => {
    const p = await createProject(db, { key: "GLO", name: "Get Links Outgoing" });
    const taskA = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task A",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const taskB = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Task B",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await link(db, { fromId: taskA.id, toId: taskB.id, kind: "blocks" });

    const outgoing = await getLinks(db, { id: taskA.id, kind: null, direction: "outgoing" });
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.kind).toBe("blocks");
    expect(outgoing[0]?.direction).toBe("outgoing");
    expect(outgoing[0]?.entity.id).toBe(taskB.id);

    const incoming = await getLinks(db, { id: taskA.id, kind: null, direction: "incoming" });
    expect(incoming).toHaveLength(0);
  });

  it("getLinks returns incoming edges correctly", async () => {
    const p = await createProject(db, { key: "GLI", name: "Get Links Incoming" });
    const taskA = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Blocker",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const taskB = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Blocked",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await link(db, { fromId: taskA.id, toId: taskB.id, kind: "references" });

    const incoming = await getLinks(db, { id: taskB.id, kind: null, direction: "incoming" });
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.kind).toBe("references");
    expect(incoming[0]?.direction).toBe("incoming");
    expect(incoming[0]?.entity.id).toBe(taskA.id);
  });

  it("getLinks returns both directions and supports kind filter", async () => {
    const p = await createProject(db, { key: "GLB", name: "Get Links Both" });
    const hub = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Hub task",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const child = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Child note",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    const ref = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Ref note",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });
    await link(db, { fromId: hub.id, toId: child.id, kind: "parent_of" });
    await link(db, { fromId: ref.id, toId: hub.id, kind: "references" });

    const both = await getLinks(db, { id: hub.id, kind: null, direction: "both" });
    expect(both.length).toBe(2);
    const directions = both.map((l) => l.direction).sort();
    expect(directions).toEqual(["incoming", "outgoing"]);

    // Filter by kind=parent_of → only outgoing
    const filtered = await getLinks(db, { id: hub.id, kind: "parent_of", direction: "both" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe("parent_of");
    expect(filtered[0]?.direction).toBe("outgoing");
  });

  it("splitRecurrence rolls back when the new cadence has no occurrence after the fork", async () => {
    const p = await createProject(db, { key: "SPN", name: "Split No Occurrence" });
    const dueAt = new Date();
    dueAt.setUTCHours(12, 0, 0, 0);
    const task = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Bounded split",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {},
      dueAt
    });
    const rule = await createRecurrenceRule(db, task.id, {
      preset: "daily",
      interval: 1,
      timezone: "UTC",
      allDay: true,
      anchor: "scheduled"
    });

    const beforeFork = new Date(dueAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    await expect(
      splitRecurrence(db, rule.id, { preset: "weekly", until: beforeFork })
    ).rejects.toThrow(/no occurrences after the fork/);

    // No half-split: the old rule is untouched and remains the only rule.
    const [oldRow] = await db
      .select()
      .from(recurrenceRules)
      .where(eq(recurrenceRules.id, rule.id));
    expect(oldRow.enabled).toBe(true);
    const rows = await db
      .select()
      .from(recurrenceRules)
      .where(eq(recurrenceRules.seriesId, rule.seriesId));
    expect(rows).toHaveLength(1);
  });

  it("update bodyAppend appends to non-empty body with blank line separator", async () => {
    const p = await createProject(db, { key: "BAP1", name: "BodyAppend Test 1" });
    const entity = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Append note",
      body: "initial content",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const updated = await update(db, entity.id, { bodyAppend: "second paragraph" });
    expect(updated.body).toBe("initial content\n\nsecond paragraph");
  });

  it("update bodyAppend appends to empty body without leading blank line", async () => {
    const p = await createProject(db, { key: "BAP2", name: "BodyAppend Test 2" });
    const entity = await write(db, {
      kind: "note",
      projectId: p.id,
      title: "Empty body note",
      body: "",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
    });

    const updated = await update(db, entity.id, { bodyAppend: "first content" });
    expect(updated.body).toBe("first content");
  });

  it("update rejects when both body and bodyAppend are provided", async () => {
    const { UpdateInput } = await import("../src/service/types.js");
    const result = UpdateInput.safeParse({ body: "full body", bodyAppend: "extra" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "";
      expect(msg).toContain("mutually exclusive");
    }
  });
});
