import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  BotnoteHttpClient,
  type EntityDTO,
  type LinkKind
} from "./http-client.js";
import { VERSION } from "../version.js";

export interface McpServerContext {
  client: BotnoteHttpClient;
  version?: string;
}

// Inline kind constants so the MCP package can be packaged without pulling
// drizzle / the db schema module at runtime.
const ENTITY_KINDS = ["task", "note"] as const;
const ACTOR_KINDS = ["human", "agent", "system"] as const;
const TASK_STATUSES = [
  "open",
  "in_progress",
  "delayed",
  "done",
  "archived",
  "rejected"
] as const;
const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const EDGE_KINDS = ["blocks", "references", "parent_of"] as const;

function displayTitle(e: { title: string | null; body: string }): string {
  if (e.title && e.title.trim()) return e.title;
  const firstLine = e.body.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (firstLine) return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  return "(untitled)";
}

function summarizeEntity(e: EntityDTO): string {
  const tagPart = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
  return `${e.kind}/${e.id.slice(0, 8)} · ${displayTitle(e)}${tagPart}`;
}

const ProjectKey = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Z][A-Z0-9_]*$/);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const IconName = z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/);

export function buildMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer({
    name: "botnote",
    version: ctx.version ?? VERSION
  });
  const c = ctx.client;

  // ----- 1. opening_brief -----

  server.registerTool(
    "opening_brief",
    {
      title: "Opening Brief",
      description:
        "CALL THIS FIRST when starting work on a project. Fetch the agent context bundle: AGENTS.md + PINNED NOTES (full text, user-curated must-read context like deployment steps, important conventions) + open tasks + recent activity. Returns markdown.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z
          .string()
          .uuid()
          .optional()
          .describe("Optional project UUID; omit for workspace-wide brief.")
      }
    },
    async ({ projectId }) => {
      const brief = await c.openingBrief({ projectId: projectId ?? null, recentLimit: 10 });
      return { content: [{ type: "text", text: brief.markdown }] };
    }
  );

  // ----- 2. search -----

  server.registerTool(
    "search",
    {
      title: "Hybrid Search",
      description:
        "Find tasks and notes by free-text query. Uses BM25 + vector cosine + time decay merged via RRF. Pass kind='note' or kind='task' to narrow; omit to search both.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        query: z.string().min(1),
        projectId: z.string().uuid().optional(),
        kind: z.enum(ENTITY_KINDS).optional(),
        limit: z.number().int().min(1).max(50).default(10)
      }
    },
    async ({ query, projectId, kind, limit }) => {
      const { hits, embeddingUsed } = await c.search({
        query,
        projectId: projectId ?? null,
        kind,
        limit
      });
      const lines = hits.map(
        (h) =>
          `${h.score.toFixed(4)} ${summarizeEntity(h.entity)}\n    ${h.entity.body.slice(0, 200).replace(/\n/g, " ")}`
      );
      return {
        content: [
          {
            type: "text",
            text: hits.length
              ? `${hits.length} hit(s). embedding=${embeddingUsed ? "on" : "off"}\n\n${lines.join("\n\n")}`
              : `no hits. embedding=${embeddingUsed ? "on" : "off"}`
          }
        ]
      };
    }
  );

  // ----- 3. recent -----

  server.registerTool(
    "recent",
    {
      title: "Recent Entities",
      description:
        "List entities ordered by most recent. Filter by project, kinds, and since (ISO date).",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z.string().uuid().optional(),
        since: z.string().datetime().optional(),
        kinds: z.array(z.enum(ENTITY_KINDS)).optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }
    },
    async ({ projectId, since, kinds, limit }) => {
      const rows = await c.recent({
        projectId: projectId ?? null,
        since: since ?? null,
        kinds,
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
                      `${r.createdAt.slice(0, 16).replace("T", " ")} · ${summarizeEntity(r)}`
                  )
                  .join("\n")
              : "no recent entities"
          }
        ]
      };
    }
  );

  // ----- 4. list_projects -----

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description:
        "List every project in the workspace with its key, name, color and icon. Call this before creating tasks or notes if you don't already know the target project's UUID.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {}
    },
    async () => {
      const projects = await c.listProjects();
      const lines = projects.map(
        (p) => `${p.key.padEnd(10)} ${p.name}  (id: ${p.id}, icon: ${p.icon}, color: ${p.color})`
      );
      return {
        content: [{ type: "text", text: projects.length ? lines.join("\n") : "no projects" }]
      };
    }
  );

  // ----- 5. get_project -----

  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Fetch a single project, including its AGENTS.md. Accepts either the UUID or the human-readable key (e.g. 'BOT').",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z.string().uuid().optional(),
        key: ProjectKey.optional()
      }
    },
    async ({ projectId, key }) => {
      if (!projectId && !key) {
        return { isError: true, content: [{ type: "text", text: "pass projectId or key" }] };
      }
      try {
        const p = projectId
          ? await c.getProject(projectId)
          : await c.getProjectByKey(key!);
        return { content: [{ type: "text", text: JSON.stringify(p, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `project not found: ${msg}` }] };
      }
    }
  );

  // ----- 6. create_project -----

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description:
        "Create a new project. Call `list_projects` first to verify the project does not already exist or fit an existing bucket. Only create a new project when the work is large enough to deserve its own backlog.\n" +
        "\n" +
        "Conventions:\n" +
        "- `key`: short uppercase identifier, e.g. 'BOT', 'DOCS', 'OPS'. Unique across the workspace.\n" +
        "- `name`: human-readable.\n" +
        "- `color`: hex like '#5e6ad2' (Linear blue) by default. Pick a color that contrasts with the existing palette.\n" +
        "- `icon`: lowercase kebab name from lucide-react (e.g. 'rocket', 'brain', 'package', 'archive').\n" +
        "- `agentsMd`: write project-level conventions agents should follow (test commands, deploy steps, important gotchas). Surfaced in opening_brief.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      },
      inputSchema: {
        key: ProjectKey,
        name: z.string().min(1).max(200),
        color: HexColor.default("#5e6ad2"),
        icon: IconName.default("circle"),
        agentsMd: z.string().default("")
      }
    },
    async ({ key, name, color, icon, agentsMd }) => {
      try {
        const existing = await c.getProjectByKey(key);
        return {
          content: [{ type: "text", text: `project ${key} already exists: ${existing.id}` }]
        };
      } catch {
        // Not found → continue to create.
      }
      const p = await c.createProject({ key, name, color, icon, agentsMd });
      return { content: [{ type: "text", text: `created project ${p.key} · ${p.name}\nid: ${p.id}` }] };
    }
  );

  // ----- 7. update_project -----

  server.registerTool(
    "update_project",
    {
      title: "Update Project",
      description:
        "Update a project's name, color, icon, or AGENTS.md. Pass only the fields you want to change.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        color: HexColor.optional(),
        icon: IconName.optional(),
        agentsMd: z.string().optional()
      }
    },
    async ({ projectId, ...fields }) => {
      const defined: Record<string, unknown> = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      const p = await c.updateProject(projectId, defined);
      return { content: [{ type: "text", text: `updated project ${p.key} · ${p.name}` }] };
    }
  );

  // ----- 8. get_entity -----

  server.registerTool(
    "get_entity",
    {
      title: "Get Entity",
      description: "Fetch a single task or note by its UUID.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: { id: z.string().uuid() }
    },
    async ({ id }) => {
      try {
        const entity = await c.getEntity(id);
        return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: `entity ${id} not found` }] };
      }
    }
  );

  // ----- 9. get_entity_by_key -----

  server.registerTool(
    "get_entity_by_key",
    {
      title: "Get Entity by Identifier",
      description:
        "Fetch a task or note by its human-readable identifier (e.g. DEMO-12). Pass the project key and sequence number separately.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectKey: ProjectKey,
        sequenceId: z.number().int().positive()
      }
    },
    async ({ projectKey, sequenceId }) => {
      try {
        const entity = await c.getEntityByKey(projectKey, sequenceId);
        return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: `entity ${projectKey}-${sequenceId} not found` }]
        };
      }
    }
  );

  // ----- 10. create_task -----

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "Create a task — a structured work item with status, optional due date, priority, and tags. Use this for anything with a state machine (open/in_progress/done). For free-form notes call `remember`.\n" +
        "\n" +
        "Conventions (follow strictly):\n" +
        "- `projectId`: required. Call `list_projects` first if you don't already know the project's UUID. If user-supplied context doesn't pin a project, ask before creating.\n" +
        "- `title`: an executable verb phrase, NOT a vague topic ('Fix DEMO-12 null-pointer' ✓, 'Process demo stuff' ✗). Max ~100 chars.\n" +
        "- `priority`: infer from urgency cues — ASAP/blocker -> urgent; this week -> high; soon -> medium; backlog -> low; otherwise none.\n" +
        "- `status`: defaults to 'open'. Use 'in_progress' only if work has actually started in this turn.\n" +
        "- `dueAt`: include when the user mentions a date. Use an ISO datetime in UTC.\n" +
        "- `tags`: 2-4 short lowercase kebab-case tokens. Re-use existing tags when possible — search first if unsure.\n" +
        "- `parentId`: include when this task is a follow-up under another task or note.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z.string().uuid().optional(),
        title: z.string().min(1).max(500),
        body: z.string().default(""),
        tags: z.array(z.string()).default([]),
        status: z.enum(TASK_STATUSES).default("open"),
        parentId: z.string().uuid().optional().describe("Link this task under another entity."),
        actorKind: z.enum(ACTOR_KINDS).default("agent"),
        dueAt: z.string().datetime().optional().describe("ISO datetime."),
        priority: z.enum(PRIORITIES).default("none"),
        idempotencyKey: z.string().min(1).max(200).optional()
      }
    },
    async (input) => {
      const entity = await c.createTask({
        projectId: input.projectId ?? null,
        title: input.title,
        body: input.body,
        tags: input.tags,
        status: input.status,
        parentId: input.parentId ?? null,
        actorKind: input.actorKind,
        dueAt: input.dueAt ?? null,
        priority: input.priority,
        idempotencyKey: input.idempotencyKey
      });
      return { content: [{ type: "text", text: `created task ${summarizeEntity(entity)}\nid: ${entity.id}` }] };
    }
  );

  // ----- 11. remember (= create_note) -----

  server.registerTool(
    "remember",
    {
      title: "Remember (Create Note)",
      description:
        "Capture a free-form note. Title is optional (body's first line acts as label). Notes are botnote's memory layer, so err on the side of preserving useful context.\n" +
        "\n" +
        "Conventions:\n" +
        "- `body`: the substance. Multi-line + markdown OK. Include the WHY, not just the WHAT.\n" +
        "- `title`: skip if the first body line is descriptive. Provide when the body is long-form.\n" +
        "- `tags`: 2-4 short lowercase kebab-case tokens inferred from content. Re-use existing tags — recall similar memories first if unsure of vocabulary.\n" +
        "- `projectId`: pick the most specific project. If unclear, omit (workspace-scope is fine; better than wrong-project).\n" +
        "- `parentId`: pass a task's UUID when the note is a follow-up on a specific task — this surfaces the note when the task is opened.\n" +
        "- `pinned=true`: ONLY for must-read context (deployment steps, hidden gotchas, AGENTS-style conventions). Pinned notes appear in every future opening_brief — abuse them and the brief becomes noise.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        projectId: z.string().uuid().optional(),
        title: z.string().max(500).optional().describe("Optional; first body line is used as fallback."),
        body: z.string().default(""),
        tags: z.array(z.string()).default([]),
        parentId: z.string().uuid().optional().describe("Link this note under a task or other entity."),
        actorKind: z.enum(ACTOR_KINDS).default("agent"),
        pinned: z.boolean().default(false).describe("Pin to project opening brief (must-read context)."),
        idempotencyKey: z.string().min(1).max(200).optional()
      }
    },
    async (input) => {
      const entity = await c.remember({
        projectId: input.projectId ?? null,
        title: input.title ?? null,
        body: input.body,
        tags: input.tags,
        parentId: input.parentId ?? null,
        actorKind: input.actorKind,
        pinned: input.pinned,
        idempotencyKey: input.idempotencyKey
      });
      return { content: [{ type: "text", text: `remembered ${summarizeEntity(entity)}\nid: ${entity.id}` }] };
    }
  );

  // ----- 12. update_entity -----

  server.registerTool(
    "update_entity",
    {
      title: "Update Entity",
      description:
        "Update fields on an existing task or note. Pass ONLY the fields you want to change — omitted fields are left untouched.\n" +
        "\n" +
        "Common transitions:\n" +
        "- task completion: `status='done'`. Optionally `remember` a closing note with `parentId` set to this task.\n" +
        "- task soft-delete / give up: `status='archived'`. `status='rejected'` if the work was declined.\n" +
        "- start work: `status='in_progress'` ONLY when work actually begins in this turn (not just on every mention).\n" +
        "- re-parent: pass `parentId` (or `null` to detach).\n" +
        "- pin/unpin: `pinned: true/false`. Pinned notes drive opening_brief — use sparingly.\n" +
        "- title=null clears the title (notes only).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      },
      inputSchema: {
        id: z.string().uuid(),
        title: z
          .string()
          .max(500)
          .nullable()
          .optional()
          .describe("Pass null to clear the title (notes only)."),
        body: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
        parentId: z.string().uuid().nullable().optional().describe("Re-link or unlink (null) parent."),
        dueAt: z.string().datetime().nullable().optional().describe("ISO datetime or null to clear."),
        priority: z.enum(PRIORITIES).optional(),
        pinned: z.boolean().optional().describe("Pin or unpin from project opening brief.")
      }
    },
    async ({ id, ...fields }) => {
      const defined: Record<string, unknown> = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      const updated = await c.updateEntity(id, defined);
      return { content: [{ type: "text", text: `updated ${summarizeEntity(updated)}` }] };
    }
  );

  // ----- 13. related -----

  server.registerTool(
    "related",
    {
      title: "Related Entities",
      description:
        "List entities whose parent_id is the given id — typically notes linked under a task. Use this after opening a task to surface the relevant notes/context.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: { id: z.string().uuid() }
    },
    async ({ id }) => {
      const rows = await c.listRelated(id);
      return {
        content: [
          {
            type: "text",
            text: rows.length
              ? rows.map((r) => `- ${summarizeEntity(r)}`).join("\n")
              : "no related entities"
          }
        ]
      };
    }
  );

  // ----- 14. link -----

  server.registerTool(
    "link",
    {
      title: "Link Entities",
      description:
        "Create a typed edge between two entities. `blocks` = source blocks target, `references` = source references target (citation/see-also), `parent_of` = source is the parent (e.g. task is parent of a sub-note).",
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
    async ({ fromId, toId, kind }) => {
      const result = await c.link(fromId, { toId, kind: kind as LinkKind });
      return {
        content: [
          {
            type: "text",
            text: result.created
              ? `linked ${fromId.slice(0, 8)} -[${kind}]-> ${toId.slice(0, 8)}`
              : `link already exists`
          }
        ]
      };
    }
  );

  // ----- bonus resource: workspace overview -----

  server.registerResource(
    "workspace_overview",
    "botnote://workspace",
    {
      title: "Workspace Overview",
      description: "List of all projects + most recent activity across the workspace.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const projects = await c.listProjects();
      const recentRows = await c.recent({
        projectId: null,
        since: null,
        kinds: undefined,
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
          `- ${r.createdAt.slice(0, 16).replace("T", " ")} · ${r.kind} · ${displayTitle(r)}`
        );
      }
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: lines.join("\n") }] };
    }
  );

  return server;
}
