/**
 * Hybrid-search latency benchmark.
 *
 * Seeds synthetic entities (default 10k) with random embeddings into the test
 * database, runs a mix of global / project-scoped / tiny-project searches and
 * reports p50 / p95 per mode plus recall on the tiny project. AGENTS.md sets
 * the budget: p50 < 50 ms at 10k entities.
 *
 *   BOTNOTE_TEST_DATABASE_URL=postgres://.../botnote_test pnpm bench:search
 *   pnpm bench:search -- --entities 20000 --queries 100 --keep
 */
import { sql } from "drizzle-orm";
import { createDb, createPool } from "../src/db/client.js";
import { entities, projects } from "../src/db/schema.js";
import { createProject } from "../src/service/projects.js";
import { DEFAULT_SCOPE } from "../src/service/scope.js";
import { search } from "../src/service/search.js";

const DIM = 384;
const PROJECT_COUNT = 20;
const TINY_ROWS = 5;
const KEY_PREFIX = "BNCH";
const WORDS = (
  "deploy migrate release rollback postgres index vector embedding latency recall " +
  "fastify route schema zod token session workspace project entity task note decision " +
  "calendar recurrence occurrence worklog comment feedback archive trash restore purge " +
  "docker launchd daemon health version plugin marketplace openai model dimension"
).split(" ");

function parseArgs(argv: string[]): { entityCount: number; queryCount: number; keep: boolean } {
  const out = { entityCount: 10_000, queryCount: 60, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--entities") out.entityCount = Number(argv[++i]);
    else if (a === "--queries") out.queryCount = Number(argv[++i]);
    else if (a === "--keep") out.keep = true;
  }
  return out;
}

function testDatabaseUrl(): string {
  const url = process.env.BOTNOTE_TEST_DATABASE_URL;
  if (!url) throw new Error("BOTNOTE_TEST_DATABASE_URL is required; refusing to seed a live database");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(`BOTNOTE_TEST_DATABASE_URL must point to a test database; got '${dbName}'`);
  }
  return url;
}

let seed = 42;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function unitVec(): number[] {
  const v = Array.from({ length: DIM }, () => rand() - 0.5);
  const norm = Math.sqrt(v.reduce((acc, c) => acc + c * c, 0));
  return v.map((c) => c / norm);
}
function sentence(words: number): string {
  return Array.from({ length: words }, () => pick(WORDS)).join(" ");
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function main(): Promise<void> {
  const { entityCount, queryCount, keep } = parseArgs(process.argv.slice(2));
  const { db, pool } = createDb(createPool(testDatabaseUrl()));
  const scope = DEFAULT_SCOPE;

  async function cleanup(): Promise<void> {
    await db.execute(sql`
      DELETE FROM entities WHERE project_id IN (
        SELECT id FROM projects WHERE key LIKE ${`${KEY_PREFIX}%`}
      )
    `);
    await db.execute(sql`DELETE FROM projects WHERE key LIKE ${`${KEY_PREFIX}%`}`);
  }

  try {
    await cleanup();
    const projectDefaults = { status: "active" as const, color: "#5e6ad2", icon: "circle", agentsMd: "" };
    const projectIds: string[] = [];
    for (let i = 0; i < PROJECT_COUNT; i++) {
      const p = await createProject(scope, db, {
        ...projectDefaults,
        key: `${KEY_PREFIX}${String(i).padStart(2, "0")}`,
        name: `Bench ${i}`
      });
      projectIds.push(p.id);
    }
    const tiny = await createProject(scope, db, {
      ...projectDefaults,
      key: `${KEY_PREFIX}TINY`,
      name: "Bench tiny"
    });

    const seedStart = performance.now();
    const kinds = ["note", "note", "note", "task", "decision", "memory"];
    const now = Date.now();
    const batch: (typeof entities.$inferInsert)[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      await db.insert(entities).values(batch.splice(0, batch.length));
    };
    for (let i = 0; i < entityCount; i++) {
      batch.push({
        workspaceId: scope.workspaceId,
        projectId: pick(projectIds),
        kind: pick(kinds),
        title: sentence(3),
        body: sentence(40),
        tags: ["bench"],
        status: "open",
        actorKind: "system",
        metadata: {},
        bodyVec: unitVec(),
        sequenceId: i + 1,
        createdAt: new Date(now - rand() * 730 * 86_400_000)
      });
      if (batch.length >= 500) await flush();
    }
    for (let i = 0; i < TINY_ROWS; i++) {
      batch.push({
        workspaceId: scope.workspaceId,
        projectId: tiny.id,
        kind: "note",
        title: `tiny ${i}`,
        body: sentence(20),
        tags: ["bench"],
        status: "open",
        actorKind: "system",
        metadata: {},
        bodyVec: unitVec(),
        sequenceId: i + 1
      });
    }
    await flush();
    await db.execute(sql`ANALYZE entities`);
    console.log(
      `seeded ${entityCount + TINY_ROWS} entities across ${PROJECT_COUNT + 1} projects in ${Math.round(performance.now() - seedStart)} ms`
    );

    const modes: Record<string, number[]> = { global: [], project: [], tiny: [] };
    let tinyRecallHits = 0;
    let tinyRuns = 0;
    await search(scope, db, { query: sentence(2), limit: 10 }, { queryEmbedding: unitVec() });

    for (let i = 0; i < queryCount; i++) {
      const query = sentence(2);
      const queryEmbedding = unitVec();
      const mode = i % 3 === 0 ? "global" : i % 3 === 1 ? "project" : "tiny";
      const projectId = mode === "global" ? null : mode === "project" ? pick(projectIds) : tiny.id;
      const start = performance.now();
      const hits = await search(scope, db, { query, projectId, limit: 10 }, { queryEmbedding });
      modes[mode]!.push(performance.now() - start);
      if (mode === "tiny") {
        tinyRuns++;
        tinyRecallHits += hits.filter((h) => h.entity.projectId === tiny.id && h.components.cosine).length;
      }
    }

    console.log("");
    console.log("mode      n     p50 ms   p95 ms   max ms");
    for (const [mode, samples] of Object.entries(modes)) {
      const sorted = [...samples].sort((a, b) => a - b);
      console.log(
        `${mode.padEnd(8)} ${String(sorted.length).padStart(3)}  ${percentile(sorted, 50).toFixed(1).padStart(8)} ${percentile(sorted, 95).toFixed(1).padStart(8)} ${(sorted.at(-1) ?? 0).toFixed(1).padStart(8)}`
      );
    }
    const recall = tinyRuns === 0 ? 1 : tinyRecallHits / (tinyRuns * TINY_ROWS);
    console.log(`\ntiny-project vector recall: ${(recall * 100).toFixed(0)}% (${TINY_ROWS} rows expected per query)`);

    const all = Object.values(modes).flat().sort((a, b) => a - b);
    const p50 = percentile(all, 50);
    console.log(`overall p50 ${p50.toFixed(1)} ms (budget 50 ms) → ${p50 < 50 ? "OK" : "OVER BUDGET"}`);
    if (recall < 1) process.exitCode = 1;
    if (p50 >= 50) process.exitCode = 1;
  } finally {
    if (!keep) await cleanup();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
