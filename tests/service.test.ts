import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EmbeddingService } from "../src/service/embedding.js";
import {
  embeddingCoverage,
  getEmbeddingSettings,
  updateEmbeddingSettings
} from "../src/service/embedding_settings.js";
import { get, link, recent, setBodyVec, update, write } from "../src/service/entities.js";
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
  skipOccurrence
} from "../src/service/recurrence.js";
import { search } from "../src/service/search.js";
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
    expect(formatted).toContain(`[${openTask.id}]`);
    expect(formatted).toContain(`task/${openTask.id}`);
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
});
