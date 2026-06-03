import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ensureActor } from "../service/actors.js";
import { get, link, recent, remove, update, write } from "../service/entities.js";
import { formatOpeningBrief, openingBrief } from "../service/opening_brief.js";
import {
  createProject,
  getAgentsMd,
  getProject,
  getProjectByKey,
  listProjects,
  setAgentsMd
} from "../service/projects.js";
import { search } from "../service/search.js";
import { tasksRange } from "../service/tasks.js";
import {
  CreateProjectInput,
  EnsureActorInput,
  LinkInput,
  OpeningBriefInput,
  RecentInput,
  SearchInput,
  TasksRangeInput,
  UpdateInput,
  Uuid,
  WriteInput
} from "../service/types.js";
import type { ServerContext } from "./server.js";

const IdParams = z.object({ id: Uuid });
const KeyParams = z.object({ key: z.string() });
const SetAgentsMdBody = z.object({ agentsMd: z.string() });
const OpeningBriefBody = OpeningBriefInput.omit({ projectId: true }).optional();
const LinkBody = LinkInput.omit({ fromId: true });

export async function registerRoutes(
  rawApp: FastifyInstance,
  ctx: ServerContext
): Promise<void> {
  const app = rawApp.withTypeProvider<ZodTypeProvider>();

  app.get("/health", async () => ({ ok: true, version: "0.0.1" }));

  app.post(
    "/v1/projects",
    { schema: { tags: ["projects"], summary: "Create a project", body: CreateProjectInput } },
    async (req) => createProject(ctx.db, CreateProjectInput.parse(req.body))
  );

  app.get(
    "/v1/projects",
    { schema: { tags: ["projects"], summary: "List projects" } },
    async () => listProjects(ctx.db)
  );

  app.get(
    "/v1/projects/:id",
    { schema: { tags: ["projects"], summary: "Fetch a project by id", params: IdParams } },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const p = await getProject(ctx.db, id);
      if (!p) return reply.code(404).send({ error: "not_found" });
      return p;
    }
  );

  app.get(
    "/v1/projects/by-key/:key",
    { schema: { tags: ["projects"], summary: "Fetch a project by key", params: KeyParams } },
    async (req, reply) => {
      const { key } = KeyParams.parse(req.params);
      const p = await getProjectByKey(ctx.db, key);
      if (!p) return reply.code(404).send({ error: "not_found" });
      return p;
    }
  );

  app.get(
    "/v1/projects/:id/agents-md",
    { schema: { tags: ["projects"], summary: "Read project AGENTS.md", params: IdParams } },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      return { agentsMd: await getAgentsMd(ctx.db, id) };
    }
  );

  app.put(
    "/v1/projects/:id/agents-md",
    {
      schema: {
        tags: ["projects"],
        summary: "Write project AGENTS.md",
        params: IdParams,
        body: SetAgentsMdBody
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const { agentsMd } = SetAgentsMdBody.parse(req.body);
      return setAgentsMd(ctx.db, { projectId: id, agentsMd });
    }
  );

  app.post(
    "/v1/projects/:id/opening-brief",
    {
      schema: {
        tags: ["brief"],
        summary: "Opening brief for a project",
        description:
          "Returns the agent context bundle: AGENTS.md, open tasks, pending decisions, recent activity. Also returns a markdown-formatted version.",
        params: IdParams,
        body: OpeningBriefBody
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const bodyOpts = OpeningBriefBody.parse(req.body);
      const input = OpeningBriefInput.parse({ projectId: id, recentLimit: bodyOpts?.recentLimit });
      const brief = await openingBrief(ctx.db, input);
      return { ...brief, markdown: formatOpeningBrief(brief) };
    }
  );

  app.post(
    "/v1/entities",
    {
      schema: {
        tags: ["entities"],
        summary: "Write an entity (task/note/decision/doc/comment/log/memory)",
        body: WriteInput
      }
    },
    async (req) => {
      const body = WriteInput.parse(req.body);
      const entity = await write(ctx.db, body);
      if (ctx.embedding.isEnabled()) {
        ctx.embedding.enqueue(entity.id, `${entity.title}\n${entity.body}`);
      }
      return entity;
    }
  );

  app.get(
    "/v1/entities/:id",
    { schema: { tags: ["entities"], summary: "Fetch an entity by id", params: IdParams } },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const e = await get(ctx.db, id);
      if (!e) return reply.code(404).send({ error: "not_found" });
      return e;
    }
  );

  app.delete(
    "/v1/entities/:id",
    {
      schema: {
        tags: ["entities"],
        summary: "Delete an entity",
        params: IdParams
      }
    },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const ok = await remove(ctx.db, id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    }
  );

  app.patch(
    "/v1/entities/:id",
    {
      schema: {
        tags: ["entities"],
        summary: "Update an entity",
        params: IdParams,
        body: UpdateInput
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const fields = UpdateInput.parse(req.body);
      const updated = await update(ctx.db, id, fields);
      if (
        ctx.embedding.isEnabled() &&
        (fields.body !== undefined || fields.title !== undefined)
      ) {
        ctx.embedding.enqueue(updated.id, `${updated.title}\n${updated.body}`);
      }
      return updated;
    }
  );

  app.post(
    "/v1/entities/:id/links",
    {
      schema: {
        tags: ["entities"],
        summary: "Link this entity to another",
        params: IdParams,
        body: LinkBody
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const body = LinkBody.parse(req.body);
      return link(ctx.db, { fromId: id, toId: body.toId, kind: body.kind });
    }
  );

  app.post(
    "/v1/recent",
    {
      schema: {
        tags: ["entities"],
        summary: "Recent entities (filterable by project, kinds, since)",
        body: RecentInput.optional()
      }
    },
    async (req) => recent(ctx.db, RecentInput.parse(req.body ?? {}))
  );

  app.post(
    "/v1/search",
    {
      schema: {
        tags: ["search"],
        summary: "Hybrid retrieval (BM25 + cosine + time decay, RRF merged)",
        description:
          "If OPENAI_API_KEY is set, the query is embedded and cosine similarity is merged in via RRF. Otherwise BM25-only.",
        body: SearchInput
      }
    },
    async (req) => {
      const body = SearchInput.parse(req.body);
      const queryEmbedding = await ctx.embedding.embedQuery(body.query);
      const hits = await search(ctx.db, body, queryEmbedding ? { queryEmbedding } : {});
      return { hits, embeddingUsed: queryEmbedding != null };
    }
  );

  app.post(
    "/v1/actors",
    { schema: { tags: ["actors"], summary: "Get or create an actor", body: EnsureActorInput } },
    async (req) => ensureActor(ctx.db, EnsureActorInput.parse(req.body))
  );

  app.post(
    "/v1/tasks/range",
    {
      schema: {
        tags: ["tasks"],
        summary: "Tasks in a date range + overdue + backlog (no due_at)",
        description:
          "Returns three buckets: scheduled (due_at in [from, to)), overdue (due_at before now, only when not includeDone), backlog (no due_at, only when includeBacklog).",
        body: TasksRangeInput
      }
    },
    async (req) => tasksRange(ctx.db, TasksRangeInput.parse(req.body))
  );
}
