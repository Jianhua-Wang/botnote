import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { ensureActor } from "../src/service/actors.js";
import { EmbeddingService } from "../src/service/embedding.js";
import { get, link, recent, setBodyVec, update, write } from "../src/service/entities.js";
import { formatOpeningBrief, openingBrief } from "../src/service/opening_brief.js";
import {
  createProject,
  getAgentsMd,
  getProjectByKey,
  setAgentsMd
} from "../src/service/projects.js";
import { search } from "../src/service/search.js";

const { db, pool } = createDb();

beforeAll(async () => {
  await db.execute(sql`SELECT 1`);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE entities, edges, actors, projects RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

describe("botnote service", () => {
  it("creates a project and looks it up by key", async () => {
    const p = await createProject(db, {
      key: "TEST",
      name: "Test Project",
      agentsMd: "## Rules\nALWAYS test."
    });
    expect(p.key).toBe("TEST");
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);

    const found = await getProjectByKey(db, "TEST");
    expect(found?.id).toBe(p.id);
  });

  it("write entity + get + update + recent", async () => {
    const p = await createProject(db, { key: "WORK", name: "Work" });
    const a = await ensureActor(db, { name: "Boss", kind: "human" });

    const t = await write(db, {
      kind: "task",
      projectId: p.id,
      title: "Build botnote v0",
      body: "Lightweight, agent-first.",
      tags: ["roadmap", "v0"],
      status: "open",
      actorId: a.id,
      actorKind: "human",
      metadata: {},
      idempotencyKey: null
    });
    expect(t.kind).toBe("task");

    const fetched = await get(db, t.id);
    expect(fetched?.title).toBe("Build botnote v0");

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

  it("ensureActor de-dupes by name and by key", async () => {
    const a1 = await ensureActor(db, { name: "codex", kind: "agent", key: "codex" });
    const a2 = await ensureActor(db, { name: "codex", kind: "agent", key: "codex" });
    expect(a2.id).toBe(a1.id);
    const a3 = await ensureActor(db, { name: "codex-alt", kind: "agent", key: "codex" });
    expect(a3.id).toBe(a1.id);
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
      kind: "comment",
      projectId: p.id,
      title: "Child comment",
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

  it("setAgentsMd + getAgentsMd round-trip", async () => {
    const p = await createProject(db, { key: "AGT", name: "Agt" });
    expect(await getAgentsMd(db, p.id)).toBe("");
    await setAgentsMd(db, { projectId: p.id, agentsMd: "## Be brief." });
    expect(await getAgentsMd(db, p.id)).toBe("## Be brief.");
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
    await write(db, {
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
      kind: "decision",
      projectId: p.id,
      title: "Use SQLite",
      body: "decided to use SQLite",
      tags: [],
      status: "open",
      actorKind: "human",
      metadata: {}
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
    expect(brief.pendingDecisions.length).toBe(1);
    expect(brief.recent.length).toBe(3);

    const formatted = formatOpeningBrief(brief);
    expect(formatted).toContain("# Project: OBR");
    expect(formatted).toContain("## Open Tasks");
    expect(formatted).toContain("## Pending Decisions");
  });
});
