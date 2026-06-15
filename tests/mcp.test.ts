import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/rest/server.js";
import { EmbeddingService } from "../src/service/embedding.js";
import { createTestDb } from "./test_db.js";

const ROOT = path.resolve(import.meta.dirname, "..");

const { db: rawDb, pool } = createTestDb();
const embedding = new EmbeddingService(rawDb);

let server: FastifyInstance;
let baseUrl: string;
let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  await rawDb.execute(sql`TRUNCATE entities, edges, projects, tokens, sessions RESTART IDENTITY CASCADE`);

  server = await buildServer({ db: rawDb, embedding, logLevel: "warn" });
  await server.listen({ port: 0, host: "127.0.0.1" });
  const addr = server.server.address();
  if (typeof addr === "object" && addr !== null) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("could not derive REST baseUrl");
  }

  transport = new StdioClientTransport({
    command: "node",
    args: ["--import", "tsx", path.join(ROOT, "src/cli.ts"), "mcp"],
    env: { ...process.env, BOTNOTE_URL: baseUrl, NODE_OPTIONS: "--no-warnings" }
  });
  client = new Client({ name: "botnote-test", version: "0.0.1" });
  await client.connect(transport);
}, 30000);

afterAll(async () => {
  await client?.close();
  await server?.close();
  await pool.end();
}, 10000);

describe("botnote MCP", () => {
  it("lists current tools + workspace resource", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "create_project",
      "create_task",
      "get_entity",
      "get_entity_by_key",
      "get_project",
      "link",
      "list_projects",
      "opening_brief",
      "recent",
      "related",
      "remember",
      "search",
      "update_entity",
      "update_project"
    ]);
    const resources = await client.listResources();
    const resourceNames = resources.resources.map((r) => r.name);
    expect(resourceNames).toContain("workspace_overview");
  });

  it("annotates read/write/destructive correctly", async () => {
    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((t) => [t.name, t]));
    expect(byName.get("opening_brief")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("search")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("remember")?.annotations?.idempotentHint).toBe(true);
    expect(byName.get("update_entity")?.annotations?.destructiveHint).toBe(true);
    expect(byName.get("link")?.annotations?.idempotentHint).toBe(true);
    expect(byName.get("update_project")?.annotations?.destructiveHint).toBe(true);
  });

  it("create_project + remember + search round-trip", async () => {
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "MCP", name: "MCP Test", agentsMd: "## NEVER ship without tests" }
    });
    const createText = (createResp.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(createText).toMatch(/created project MCP/);
    const idMatch = createText.match(/id: ([0-9a-f-]{36})/);
    const projectId = idMatch?.[1];
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);

    const writeResp = await client.callTool({
      name: "remember",
      arguments: {
        projectId,
        title: "Adopt MCP 2025-03-26 annotations",
        body: "All tools must declare readOnlyHint / idempotentHint / destructiveHint",
        tags: ["mcp", "convention"],
        actorKind: "agent"
      }
    });
    const writeText = (writeResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(writeText).toMatch(/remembered note/);

    const searchResp = await client.callTool({
      name: "search",
      arguments: { query: "MCP annotations", projectId, limit: 5 }
    });
    const searchText = (searchResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(searchText).toMatch(/Adopt MCP 2025-03-26 annotations/);
    expect(searchText).toMatch(/embedding=off/);
  });

  it("opening_brief returns AGENTS.md + open tasks markdown", async () => {
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);

    // Re-use the project from prior test by re-creating (idempotent via key check)
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "MCP", name: "MCP Test", agentsMd: "## NEVER ship without tests" }
    });
    const text = (createResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const idMatch = text.match(/[0-9a-f-]{36}/);
    const projectId = idMatch?.[0];
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);

    await client.callTool({
      name: "create_task",
      arguments: {
        projectId,
        title: "Ship botnote v0",
        body: "M1 milestones in progress",
        actorKind: "agent",
        idempotencyKey: "mcp-task-1"
      }
    });
    const briefResp = await client.callTool({
      name: "opening_brief",
      arguments: { projectId }
    });
    const briefText = (briefResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(briefText).toMatch(/# Project: MCP/);
    expect(briefText).toMatch(/AGENTS.md/);
    expect(briefText).toMatch(/NEVER ship without tests/);
    expect(briefText).toMatch(/Ship botnote v0/);
  });

  it("write is idempotent on idempotencyKey via MCP", async () => {
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "IDP2", name: "Idempotency MCP" }
    });
    const projectId = (createResp.content as Array<{ text: string }>)[0]?.text.match(
      /[0-9a-f-]{36}/
    )?.[0];
    expect(projectId).toBeTruthy();

    const first = await client.callTool({
      name: "remember",
      arguments: {
        projectId,
        title: "Once",
        body: "first",
        actorKind: "agent",
        idempotencyKey: "mcp-note-1"
      }
    });
    const firstId = (first.content as Array<{ text: string }>)[0]?.text.match(
      /id: ([0-9a-f-]{36})/
    )?.[1];

    const second = await client.callTool({
      name: "remember",
      arguments: {
        projectId,
        title: "Different title",
        body: "different",
        actorKind: "agent",
        idempotencyKey: "mcp-note-1"
      }
    });
    const secondText = (second.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(secondText).toContain(firstId!);
  });

  it("reads workspace_overview resource", async () => {
    const result = await client.readResource({ uri: "botnote://workspace" });
    const contents = result.contents as Array<{ text: string }>;
    expect(contents[0]?.text).toMatch(/# botnote workspace/);
    expect(contents[0]?.text).toMatch(/## Projects/);
  });
});
