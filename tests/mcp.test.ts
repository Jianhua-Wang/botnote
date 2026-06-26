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
  await rawDb.execute(sql`
    TRUNCATE recurrence_exceptions, recurrence_rules, entities, edges, projects, tokens, sessions
    RESTART IDENTITY CASCADE
  `);

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

/**
 * Assert that no internal embedding/tsvector field names appear as JSON keys
 * in an MCP response. We check for the patterns `"bodyVec":` and `"body_vec":`
 * (with the leading quote and trailing colon) so we match JSON object keys
 * rather than incidental string values in body text.
 */
function assertNoInternalFields(text: string, label: string): void {
  const forbidden = ['"bodyVec":', '"bodyTsv":', '"body_vec":', '"body_tsv":'];
  for (const field of forbidden) {
    expect(text, `${label} should not contain JSON key ${field}`).not.toContain(field);
  }
}

describe("botnote MCP", () => {
  it("lists current tools + workspace resource", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "configure_recurrence",
      "create_project",
      "create_task",
      "get_entity",
      "get_entity_by_key",
      "get_project",
      "get_recurrence",
      "link",
      "list_projects",
      "opening_brief",
      "recent",
      "related",
      "remember",
      "search",
      "skip_occurrence",
      "stop_recurrence",
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
    expect(byName.get("configure_recurrence")?.annotations?.idempotentHint).toBe(true);
    expect(byName.get("get_recurrence")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("skip_occurrence")?.annotations?.destructiveHint).toBe(true);
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
    const noteId = searchText.match(/note\/([0-9a-f-]{36})/)?.[1];
    expect(noteId).toMatch(/^[0-9a-f-]{36}$/);

    const getResp = await client.callTool({
      name: "get_entity",
      arguments: { id: noteId }
    });
    const getText = (getResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(getText).toContain("Adopt MCP 2025-03-26 annotations");
    assertNoInternalFields(getText, "get_entity");

    const shortId = noteId!.slice(0, 8);
    const getByPrefixResp = await client.callTool({
      name: "get_entity",
      arguments: { id: shortId }
    });
    const getByPrefixText = (getByPrefixResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(getByPrefixText).toContain(noteId!);

    const updateByPrefixResp = await client.callTool({
      name: "update_entity",
      arguments: { id: shortId, title: "Adopt MCP annotations with short ids" }
    });
    const updateByPrefixText =
      (updateByPrefixResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(updateByPrefixText).toContain("Adopt MCP annotations with short ids");
  });

  it("archives and restores projects via MCP", async () => {
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "ARCM", name: "Archive MCP" }
    });
    const projectId = (createResp.content as Array<{ text: string }>)[0]?.text.match(
      /[0-9a-f-]{36}/
    )?.[0];
    expect(projectId).toBeTruthy();

    const archiveResp = await client.callTool({
      name: "update_project",
      arguments: { projectId, status: "archived" }
    });
    const archiveText = (archiveResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(archiveText).toContain("(archived)");

    const activeListResp = await client.callTool({ name: "list_projects", arguments: {} });
    const activeListText = (activeListResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(activeListText).not.toContain("ARCM");

    const allListResp = await client.callTool({
      name: "list_projects",
      arguments: { includeArchived: true }
    });
    const allListText = (allListResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(allListText).toContain("ARCM");
    expect(allListText).toContain("archived:");

    await client.callTool({
      name: "update_project",
      arguments: { projectId, status: "active" }
    });
    const restoredListResp = await client.callTool({ name: "list_projects", arguments: {} });
    const restoredListText =
      (restoredListResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(restoredListText).toContain("ARCM");
  });

  it("updates project status via MCP", async () => {
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "WAT", name: "Watching MCP", status: "planned" }
    });
    const projectId = (createResp.content as Array<{ text: string }>)[0]?.text.match(
      /[0-9a-f-]{36}/
    )?.[0];
    expect(projectId).toBeTruthy();

    const updateResp = await client.callTool({
      name: "update_project",
      arguments: { projectId, status: "watching" }
    });
    const updateText = (updateResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(updateText).toContain("watching");

    const listResp = await client.callTool({ name: "list_projects", arguments: {} });
    const listText = (listResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(listText).toContain("WAT");
    expect(listText).toContain("status: watching");

    const archiveResp = await client.callTool({
      name: "update_project",
      arguments: { projectId, status: "archived" }
    });
    const archiveText = (archiveResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(archiveText).toContain("archived");
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

    const taskResp = await client.callTool({
      name: "create_task",
      arguments: {
        projectId,
        title: "Ship botnote v0",
        body: "M1 milestones in progress",
        actorKind: "agent",
        idempotencyKey: "mcp-task-1"
      }
    });
    const taskText = (taskResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const taskId = taskText.match(/id: ([0-9a-f-]{36})/)?.[1];
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/);

    const briefResp = await client.callTool({
      name: "opening_brief",
      arguments: { projectId }
    });
    const briefText = (briefResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(briefText).toMatch(/# Project: MCP/);
    expect(briefText).toMatch(/AGENTS.md/);
    expect(briefText).toMatch(/NEVER ship without tests/);
    expect(briefText).toMatch(/Ship botnote v0/);
    expect(briefText).toContain(`[${taskId}]`);
    expect(briefText).toContain(`task/${taskId}`);
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

  it("configures and advances recurrence via MCP", async () => {
    const createResp = await client.callTool({
      name: "create_project",
      arguments: { key: "RMC", name: "Recurrence MCP" }
    });
    const projectId = (createResp.content as Array<{ text: string }>)[0]?.text.match(
      /[0-9a-f-]{36}/
    )?.[0];
    expect(projectId).toBeTruthy();

    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);
    const taskResp = await client.callTool({
      name: "create_task",
      arguments: {
        projectId,
        title: "Review recurring MCP task",
        actorKind: "agent",
        dueAt: dueAt.toISOString(),
        idempotencyKey: "mcp-recurring-task-1"
      }
    });
    const taskId = (taskResp.content as Array<{ text: string }>)[0]?.text.match(
      /id: ([0-9a-f-]{36})/
    )?.[1];
    expect(taskId).toBeTruthy();

    const configureResp = await client.callTool({
      name: "configure_recurrence",
      arguments: {
        taskId,
        preset: "daily",
        interval: 1,
        anchor: "scheduled",
        timezone: "UTC",
        allDay: true
      }
    });
    const configureText = (configureResp.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(configureText).toMatch(/configured recurrence/);

    await client.callTool({
      name: "update_entity",
      arguments: {
        id: taskId,
        status: "done"
      }
    });

    const recurrenceResp = await client.callTool({
      name: "get_recurrence",
      arguments: { taskId }
    });
    const recurrence = JSON.parse(
      (recurrenceResp.content as Array<{ text: string }>)[0]?.text ?? "{}"
    ) as { currentOccurrence?: { id?: string; dueAt?: string } };
    expect(recurrence.currentOccurrence?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recurrence.currentOccurrence?.id).not.toBe(taskId);
    expect(recurrence.currentOccurrence?.dueAt).toBe(
      new Date(dueAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
    );
  });

  it("reads workspace_overview resource", async () => {
    const result = await client.readResource({ uri: "botnote://workspace" });
    const contents = result.contents as Array<{ text: string }>;
    expect(contents[0]?.text).toMatch(/# botnote workspace/);
    expect(contents[0]?.text).toMatch(/## Projects/);
  });

  it("strips bodyVec and bodyTsv from all entity-returning tools", async () => {
    // Set up a project and entity to exercise every entity-returning tool.
    const cpResp = await client.callTool({
      name: "create_project",
      arguments: { key: "STRIP", name: "Strip Fields Test" }
    });
    const cpText = (cpResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const projectId = cpText.match(/id: ([0-9a-f-]{36})/)?.[1];
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);

    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    dueAt.setUTCHours(12, 0, 0, 0);

    // create_task — text format, just check the text response
    const taskResp = await client.callTool({
      name: "create_task",
      arguments: {
        projectId,
        title: "Strip test task",
        body: "checking that embedding fields are stripped from responses",
        actorKind: "agent",
        dueAt: dueAt.toISOString(),
        idempotencyKey: "strip-task-1"
      }
    });
    const taskText = (taskResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const taskId = taskText.match(/id: ([0-9a-f-]{36})/)?.[1];
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
    assertNoInternalFields(taskText, "create_task");

    // remember — text format
    const noteResp = await client.callTool({
      name: "remember",
      arguments: {
        projectId,
        title: "Strip test note",
        body: "also checking that tsvector fields are absent from responses",
        actorKind: "agent",
        idempotencyKey: "strip-note-1"
      }
    });
    const noteText = (noteResp.content as Array<{ text: string }>)[0]?.text ?? "";
    const noteId = noteText.match(/id: ([0-9a-f-]{36})/)?.[1];
    assertNoInternalFields(noteText, "remember");

    // get_entity — JSON format (main risk)
    const getResp = await client.callTool({ name: "get_entity", arguments: { id: taskId! } });
    const getEntityText = (getResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(getEntityText, "get_entity");

    // get_entity_by_key — JSON format
    const getByKeyResp = await client.callTool({
      name: "get_entity_by_key",
      arguments: { projectKey: "STRIP", sequenceId: 1 }
    });
    const getByKeyText = (getByKeyResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(getByKeyText, "get_entity_by_key");

    // update_entity — text format
    const updateResp = await client.callTool({
      name: "update_entity",
      arguments: { id: taskId!, body: "updated body text" }
    });
    const updateText = (updateResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(updateText, "update_entity");

    // related — text format (list of summarized entities)
    const relatedResp = await client.callTool({
      name: "related",
      arguments: { id: projectId! }
    });
    const relatedText = (relatedResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(relatedText, "related");

    // recent — text format
    const recentResp = await client.callTool({
      name: "recent",
      arguments: { projectId, limit: 5 }
    });
    const recentText = (recentResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(recentText, "recent");

    // search — text format
    const searchResp = await client.callTool({
      name: "search",
      arguments: { query: "strip test", projectId, limit: 5 }
    });
    const searchText = (searchResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(searchText, "search");

    // configure_recurrence + get_recurrence — JSON format for get_recurrence
    const configResp = await client.callTool({
      name: "configure_recurrence",
      arguments: {
        taskId: taskId!,
        preset: "daily",
        interval: 1,
        anchor: "scheduled",
        timezone: "UTC",
        allDay: true
      }
    });
    const configText = (configResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(configText, "configure_recurrence");

    const recurrenceResp = await client.callTool({
      name: "get_recurrence",
      arguments: { taskId: taskId! }
    });
    const recurrenceText = (recurrenceResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(recurrenceText, "get_recurrence (JSON with currentOccurrence)");

    // opening_brief — markdown format
    const briefResp = await client.callTool({
      name: "opening_brief",
      arguments: { projectId }
    });
    const briefText = (briefResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(briefText, "opening_brief");

    // skip_occurrence — text format with two entity summaries
    await client.callTool({
      name: "update_entity",
      arguments: { id: taskId!, status: "done" }
    });
    const skipResp = await client.callTool({
      name: "skip_occurrence",
      arguments: { taskId: taskId! }
    });
    const skipText = (skipResp.content as Array<{ text: string }>)[0]?.text ?? "";
    assertNoInternalFields(skipText, "skip_occurrence");
  });
});
