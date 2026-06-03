import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { ensureActor } from "../service/actors.js";
import type { EmbeddingService } from "../service/embedding.js";
import { get, link, recent, update, write } from "../service/entities.js";
import { formatOpeningBrief, openingBrief } from "../service/opening_brief.js";
import {
  createProject,
  getAgentsMd,
  getProjectByKey,
  listProjects,
  setAgentsMd
} from "../service/projects.js";
import { search } from "../service/search.js";
import {
  ACTOR_KINDS,
  EDGE_KINDS,
  ENTITY_KINDS,
  type Entity
} from "../db/schema.js";

export interface McpServerContext {
  db: Database["db"];
  embedding: EmbeddingService;
  version?: string;
}

const VERSION = "0.0.1";

function summarizeEntity(e: Entity): string {
  const tagPart = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
  return `${e.kind}/${e.id.slice(0, 8)} · ${e.title}${tagPart}`;
}

export function buildMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer({
    name: "botnote",
    version: ctx.version ?? VERSION
  });

  server.registerTool(
    "opening_brief",
    {
      title: "Opening Brief",
      description:
        "Fetch the agent context bundle for a project: AGENTS.md + open tasks + pending decisions + recent activity. Call this first when starting work on a project. Returns markdown.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: {
        projectId: z.string().uuid().optional().describe("Optional project UUID; omit for workspace-wide brief.")
      }
    },
    async ({ projectId }) => {
      const brief = await openingBrief(ctx.db, { projectId: projectId ?? null, recentLimit: 10 });
      return { content: [{ type: "text", text: formatOpeningBrief(brief) }] };
    }
  );

  server.registerTool(
    "search",
    {
      title: "Hybrid Search",
      description:
        "Find entities (notes, tasks, decisions, memory, ...) by query. Uses BM25 + vector cosine + time decay merged via Reciprocal Rank Fusion. If OPENAI_API_KEY is set the query is embedded; otherwise BM25-only.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: {
        query: z.string().min(1).describe("Free-text search query."),
        projectId: z.string().uuid().optional(),
        kind: z.enum(ENTITY_KINDS).optional(),
        limit: z.number().int().min(1).max(50).default(10)
      }
    },
    async ({ query, projectId, kind, limit }) => {
      const queryEmbedding = await ctx.embedding.embedQuery(query);
      const hits = await search(
        ctx.db,
        {
          query,
          projectId: projectId ?? null,
          kind: kind ?? null,
          limit
        },
        queryEmbedding ? { queryEmbedding } : {}
      );
      const lines = hits.map(
        (h) =>
          `${(h.score).toFixed(4)} ${summarizeEntity(h.entity)}\n    ${h.entity.body.slice(0, 200).replace(/\n/g, " ")}`
      );
      return {
        content: [
          {
            type: "text",
            text: hits.length
              ? `${hits.length} hit(s). embedding=${queryEmbedding ? "on" : "off"}\n\n${lines.join("\n\n")}`
              : `no hits. embedding=${queryEmbedding ? "on" : "off"}`
          }
        ]
      };
    }
  );

  server.registerTool(
    "get",
    {
      title: "Get Entity",
      description: "Fetch a single entity (task/note/decision/...) by id.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: { id: z.string().uuid() }
    },
    async ({ id }) => {
      const entity = await get(ctx.db, id);
      if (!entity) return { isError: true, content: [{ type: "text", text: `entity ${id} not found` }] };
      return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
    }
  );

  server.registerTool(
    "write",
    {
      title: "Write Entity",
      description:
        "Create a new entity: task, note, decision, doc, comment, log, or memory. Pass idempotency_key to make the call safe to retry.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        kind: z.enum(ENTITY_KINDS),
        projectId: z.string().uuid().optional(),
        title: z.string().min(1).max(500),
        body: z.string().default(""),
        tags: z.array(z.string()).default([]),
        status: z.string().default("open"),
        parentId: z.string().uuid().optional(),
        actorKind: z.enum(ACTOR_KINDS).default("agent"),
        dueAt: z.string().datetime().optional().describe("ISO datetime (only meaningful for kind=task)."),
        idempotencyKey: z.string().min(1).max(200).optional()
      }
    },
    async (input) => {
      const entity = await write(ctx.db, {
        kind: input.kind,
        projectId: input.projectId ?? null,
        title: input.title,
        body: input.body,
        tags: input.tags,
        status: input.status,
        parentId: input.parentId ?? null,
        actorKind: input.actorKind,
        metadata: {},
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        idempotencyKey: input.idempotencyKey ?? null
      });
      if (ctx.embedding.isEnabled()) {
        ctx.embedding.enqueue(entity.id, `${entity.title}\n${entity.body}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `wrote ${summarizeEntity(entity)}\nid: ${entity.id}`
          }
        ]
      };
    }
  );

  server.registerTool(
    "update",
    {
      title: "Update Entity",
      description: "Update fields on an existing entity (title, body, tags, status, metadata).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      },
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        body: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
        dueAt: z.string().datetime().nullable().optional().describe("ISO datetime or null to clear.")
      }
    },
    async ({ id, dueAt, ...fields }) => {
      const definedFields: Record<string, unknown> = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      if (dueAt !== undefined) {
        definedFields.dueAt = dueAt === null ? null : new Date(dueAt);
      }
      const updated = await update(ctx.db, id, definedFields);
      if (
        ctx.embedding.isEnabled() &&
        (fields.body !== undefined || fields.title !== undefined)
      ) {
        ctx.embedding.enqueue(updated.id, `${updated.title}\n${updated.body}`);
      }
      return {
        content: [{ type: "text", text: `updated ${summarizeEntity(updated)}` }]
      };
    }
  );

  server.registerTool(
    "link",
    {
      title: "Link Entities",
      description: "Create a typed edge between two entities (blocks / references / supersedes / derives_from / replied_to / parent_of).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        fromId: z.string().uuid(),
        toId: z.string().uuid(),
        kind: z.enum(EDGE_KINDS)
      }
    },
    async (input) => {
      const result = await link(ctx.db, input);
      return {
        content: [
          {
            type: "text",
            text: result.created
              ? `linked ${input.fromId.slice(0, 8)} -[${input.kind}]-> ${input.toId.slice(0, 8)}`
              : `link already exists`
          }
        ]
      };
    }
  );

  server.registerTool(
    "recent",
    {
      title: "Recent Entities",
      description:
        "List entities ordered by most recent. Filter by project, kinds, and since (ISO date).",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: {
        projectId: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
        kinds: z.array(z.enum(ENTITY_KINDS)).optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }
    },
    async ({ projectId, since, kinds, limit }) => {
      const rows = await recent(ctx.db, {
        projectId: projectId ?? null,
        since: since ? new Date(since) : null,
        kinds: kinds ?? null,
        limit
      });
      return {
        content: [
          {
            type: "text",
            text: rows.length
              ? rows
                  .map(
                    (r) =>
                      `${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${summarizeEntity(r)}`
                  )
                  .join("\n")
              : "no recent entities"
          }
        ]
      };
    }
  );

  server.registerTool(
    "agents_md",
    {
      title: "Read AGENTS.md",
      description: "Read the project AGENTS.md content. This is the per-project convention file for agents working in this project.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: { projectId: z.string().uuid() }
    },
    async ({ projectId }) => {
      const content = await getAgentsMd(ctx.db, projectId);
      return {
        content: [
          { type: "text", text: content.trim() ? content : "_(no AGENTS.md set on this project)_" }
        ]
      };
    }
  );

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description:
        "Create a new project. Use a short uppercase key (e.g. 'BOT', 'PERS'). Optionally pass agents_md with conventions agents should follow when working here.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      },
      inputSchema: {
        key: z.string().min(1).max(20).regex(/^[A-Z][A-Z0-9_]*$/),
        name: z.string().min(1).max(200),
        agentsMd: z.string().default("")
      }
    },
    async ({ key, name, agentsMd }) => {
      const existing = await getProjectByKey(ctx.db, key);
      if (existing) {
        return {
          content: [
            {
              type: "text",
              text: `project ${key} already exists: ${existing.id}`
            }
          ]
        };
      }
      const p = await createProject(ctx.db, { key, name, agentsMd });
      return {
        content: [
          { type: "text", text: `created project ${p.key} · ${p.name}\nid: ${p.id}` }
        ]
      };
    }
  );

  server.registerTool(
    "set_agents_md",
    {
      title: "Set AGENTS.md",
      description: "Overwrite the AGENTS.md content for a project.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: { projectId: z.string().uuid(), agentsMd: z.string() }
    },
    async ({ projectId, agentsMd }) => {
      const p = await setAgentsMd(ctx.db, { projectId, agentsMd });
      return { content: [{ type: "text", text: `set AGENTS.md on ${p.key} (${agentsMd.length} chars)` }] };
    }
  );

  server.registerTool(
    "ensure_actor",
    {
      title: "Ensure Actor",
      description:
        "Get or create an actor identity (human / agent / system). Use this to attribute writes to a stable identity.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        name: z.string().min(1).max(200),
        kind: z.enum(ACTOR_KINDS),
        key: z.string().min(1).max(100).optional()
      }
    },
    async ({ name, kind, key }) => {
      const actor = await ensureActor(ctx.db, { name, kind, key });
      return { content: [{ type: "text", text: `actor ${actor.name} (${actor.kind}) · ${actor.id}` }] };
    }
  );

  // Resource: workspace overview (project index + recent)
  server.registerResource(
    "workspace_overview",
    "botnote://workspace",
    {
      title: "Workspace Overview",
      description: "List of all projects + most recent activity across the workspace.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const projects = await listProjects(ctx.db);
      const recentRows = await recent(ctx.db, {
        projectId: null,
        since: null,
        kinds: null,
        limit: 20
      });
      const lines: string[] = ["# botnote workspace", ""];
      lines.push("## Projects");
      for (const p of projects) {
        lines.push(`- ${p.key} — ${p.name} (id: ${p.id})`);
      }
      lines.push("");
      lines.push("## Recent (workspace-wide)");
      for (const r of recentRows) {
        lines.push(
          `- ${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${r.kind} · ${r.title}`
        );
      }
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: lines.join("\n") }] };
    }
  );

  return server;
}
