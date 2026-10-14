import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_ID } from "../src/db/schema.js";
import { write } from "../src/service/entities.js";
import { createProject } from "../src/service/projects.js";
import { createToken } from "../src/service/tokens.js";
import { createTestDb } from "./test_db.js";

const { db, pool } = createTestDb();

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE recurrence_exceptions, recurrence_rules, entities, edges, projects, tokens, sessions
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});

async function workspaceIdsOf(table: string): Promise<string[]> {
  const res = await db.execute<{ workspace_id: string }>(
    sql.raw(`SELECT DISTINCT workspace_id::text AS workspace_id FROM ${table}`)
  );
  return res.rows.map((r) => r.workspace_id);
}

describe("workspaces schema (migration 0028)", () => {
  it("seeds the default workspace and is safe to re-run", async () => {
    const migration = readFileSync(
      new URL("../src/db/migrations/0028_workspaces.sql", import.meta.url),
      "utf8"
    );
    await db.execute(sql.raw(migration));

    const rows = await db.execute<{ id: string; slug: string }>(
      sql`SELECT id::text AS id, slug FROM workspaces ORDER BY created_at`
    );
    expect(rows.rows).toEqual([{ id: DEFAULT_WORKSPACE_ID, slug: "default" }]);
  });

  it("stamps every new row with the default workspace without code changes", async () => {
    const p = await createProject(db, { key: "WS", name: "Workspace" });
    await write(db, {
      kind: "task",
      projectId: p.id,
      title: "scoped",
      body: "",
      tags: [],
      status: "open",
      actorKind: "agent",
      metadata: {}
    });
    await createToken(db, { name: "ws-token" });

    for (const table of ["projects", "entities", "tokens", "embedding_settings", "workspace_settings"]) {
      const ids = await workspaceIdsOf(table);
      expect(ids.length, table).toBeLessThanOrEqual(1);
      if (ids.length === 1) expect(ids[0], table).toBe(DEFAULT_WORKSPACE_ID);
    }
    const seq = await db.execute<{ sequence_id: number }>(
      sql`SELECT sequence_id FROM entities WHERE title = 'scoped'`
    );
    expect(seq.rows[0]?.sequence_id).toBe(1);
  });

  it("enforces per-workspace project keys and idempotency keys", async () => {
    const other = "00000000-0000-4000-8000-000000000002";
    await db.execute(
      sql`INSERT INTO workspaces (id, slug, name) VALUES (${other}::uuid, 'other', 'Other') ON CONFLICT DO NOTHING`
    );
    await db.execute(sql`INSERT INTO projects (workspace_id, key, name) VALUES (${other}::uuid, 'DUP', 'one')`);
    await expect(
      db.execute(sql`INSERT INTO projects (workspace_id, key, name) VALUES (${other}::uuid, 'DUP', 'two')`)
    ).rejects.toThrow(/projects_ws_key_unique|projects_key_idx/);

    await db.execute(
      sql`INSERT INTO entities (workspace_id, kind, body, idempotency_key) VALUES (${other}::uuid, 'note', '', 'same-key')`
    );
    await expect(
      db.execute(
        sql`INSERT INTO entities (workspace_id, kind, body, idempotency_key) VALUES (${other}::uuid, 'note', '', 'same-key')`
      )
    ).rejects.toThrow(/entities_ws_idem_unique|entities_idempotency_idx/);

    await db.execute(sql`DELETE FROM entities WHERE workspace_id = ${other}::uuid`);
    await db.execute(sql`DELETE FROM projects WHERE workspace_id = ${other}::uuid`);
    await db.execute(sql`DELETE FROM workspaces WHERE id = ${other}::uuid`);
  });
});
