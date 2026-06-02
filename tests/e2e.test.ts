import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { buildServer } from "../src/rest/server.js";
import { EmbeddingService } from "../src/service/embedding.js";

const DB_URL = process.env.DATABASE_URL ?? "postgres://botnote:botnote@127.0.0.1:55434/botnote";
const ROOT = path.resolve(import.meta.dirname, "..");

const { db, pool } = createDb(undefined);
const embedding = new EmbeddingService(db);

let server: FastifyInstance;
let baseUrl: string;
let mcpClient: Client;
let mcpTransport: StdioClientTransport;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE entities, edges, actors, projects RESTART IDENTITY CASCADE`);

  server = await buildServer({ db, embedding, logLevel: "warn" });
  await server.listen({ port: 0, host: "127.0.0.1" });
  const addr = server.server.address();
  if (typeof addr === "object" && addr !== null) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("could not derive REST baseUrl");
  }

  mcpTransport = new StdioClientTransport({
    command: "node",
    args: ["--import", "tsx", path.join(ROOT, "src/mcp/cli.ts")],
    env: { ...process.env, DATABASE_URL: DB_URL, NODE_OPTIONS: "--no-warnings" }
  });
  mcpClient = new Client({ name: "e2e-test", version: "0.0.1" });
  await mcpClient.connect(mcpTransport);
}, 30000);

afterAll(async () => {
  await mcpClient?.close();
  await server?.close();
  await pool.end();
}, 15000);

describe("botnote E2E cross-transport", () => {
  it("REST write -> MCP read sees the same data", async () => {
    const projectResp = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "E2E",
        name: "Cross-transport",
        agentsMd: "ALWAYS write idempotency_key"
      })
    });
    expect(projectResp.ok).toBe(true);
    const project = (await projectResp.json()) as { id: string };

    await fetch(`${baseUrl}/v1/entities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "decision",
        projectId: project.id,
        title: "Use Reciprocal Rank Fusion for hybrid retrieval",
        body: "RRF with k=60 chosen to merge BM25 + cosine + time decay",
        tags: ["search", "design"],
        actorKind: "human"
      })
    });

    const briefResp = await mcpClient.callTool({
      name: "opening_brief",
      arguments: { projectId: project.id }
    });
    const briefText = (briefResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(briefText).toContain("Cross-transport");
    expect(briefText).toContain("ALWAYS write idempotency_key");
    expect(briefText).toContain("Use Reciprocal Rank Fusion");

    const searchResp = await mcpClient.callTool({
      name: "search",
      arguments: { query: "rank fusion", projectId: project.id, limit: 5 }
    });
    const searchText = (searchResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(searchText).toContain("Reciprocal Rank Fusion");
  });

  it("MCP write -> REST read sees the same data", async () => {
    const projectResp = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "MCP2", name: "MCP write side" })
    });
    const project = (await projectResp.json()) as { id: string };

    const writeResp = await mcpClient.callTool({
      name: "write",
      arguments: {
        kind: "note",
        projectId: project.id,
        title: "MCP-side note about AGENTS.md",
        body: "AGENTS.md is the universal agent conventions standard.",
        tags: ["agents-md"],
        actorKind: "agent"
      }
    });
    const writeText = (writeResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const idMatch = writeText.match(/id: ([0-9a-f-]{36})/);
    const entityId = idMatch?.[1];
    expect(entityId).toBeTruthy();

    const getResp = await fetch(`${baseUrl}/v1/entities/${entityId}`);
    expect(getResp.ok).toBe(true);
    const entity = (await getResp.json()) as { kind: string; title: string; tags: string[] };
    expect(entity.kind).toBe("note");
    expect(entity.title).toBe("MCP-side note about AGENTS.md");
    expect(entity.tags).toContain("agents-md");

    const searchResp = await fetch(`${baseUrl}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "AGENTS.md universal", projectId: project.id, limit: 5 })
    });
    const searchData = (await searchResp.json()) as {
      hits: Array<{ entity: { title: string } }>;
    };
    expect(searchData.hits.length).toBeGreaterThan(0);
    expect(searchData.hits[0]?.entity.title).toBe("MCP-side note about AGENTS.md");
  });

  it("AGENTS.md is reachable from MCP agents_md tool", async () => {
    const projectResp = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "DOC",
        name: "AGENTS test",
        agentsMd: "## NEVER push to main\n## ALWAYS run pnpm test before commit"
      })
    });
    const project = (await projectResp.json()) as { id: string };

    const mdResp = await mcpClient.callTool({
      name: "agents_md",
      arguments: { projectId: project.id }
    });
    const mdText = (mdResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(mdText).toContain("NEVER push to main");
    expect(mdText).toContain("pnpm test");
  });

  it("workspace_overview resource lists all projects E2E", async () => {
    const result = await mcpClient.readResource({ uri: "botnote://workspace" });
    const contents = result.contents as Array<{ text: string }>;
    const text = contents[0]?.text ?? "";
    expect(text).toContain("# botnote workspace");
    expect(text).toContain("E2E");
    expect(text).toContain("MCP2");
    expect(text).toContain("DOC");
  });
});
