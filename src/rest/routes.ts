import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Entity, Token } from "../db/schema.js";
import {
  get,
  getByKey,
  link,
  listRelated,
  recent,
  remove,
  update,
  write
} from "../service/entities.js";
import { formatOpeningBrief, openingBrief } from "../service/opening_brief.js";
import {
  createProject,
  getProject,
  getProjectByKey,
  listProjects,
  updateProject
} from "../service/projects.js";
import { search } from "../service/search.js";
import {
  embeddingCoverage,
  getEmbeddingSettings,
  updateEmbeddingSettings
} from "../service/embedding_settings.js";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings
} from "../service/workspace_settings.js";
import {
  createSession,
  revokeSession,
  verifyMasterPassword
} from "../service/sessions.js";
import {
  createRecurrenceRule,
  getRecurrenceForTask,
  skipOccurrence,
  stopRecurrence,
  updateRecurrenceRule
} from "../service/recurrence.js";
import { tasksRange } from "../service/tasks.js";
import { createToken, listTokens, revokeToken } from "../service/tokens.js";
import {
  CreateNoteInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateTokenInput,
  EmbeddingBackfillInput,
  LinkInput,
  ListProjectsInput,
  OpeningBriefInput,
  RecentInput,
  RecurrenceInput,
  SearchInput,
  SkipOccurrenceInput,
  StopRecurrenceInput,
  TasksRangeInput,
  UpdateEmbeddingSettingsInput,
  UpdateInput,
  UpdateProjectInput,
  UpdateRecurrenceInput,
  UpdateWorkspaceSettingsInput,
  Uuid
} from "../service/types.js";
import { VERSION } from "../version.js";
import type { ServerContext } from "./server.js";

const IdParams = z.object({ id: Uuid });
const EntityIdRef = z.string().min(8).max(36).regex(/^[0-9a-fA-F-]+$/);
const EntityIdParams = z.object({ id: EntityIdRef });
const RuleIdParams = z.object({ id: Uuid });
const KeyParams = z.object({ key: z.string() });
const BooleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value === "true" || value === "1";
  return value;
}, z.boolean());
const ListProjectsQuery = z.object({
  includeArchived: BooleanQuery.default(false)
});
const KeySeqParams = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  seq: z.coerce.number().int().positive()
});
const OpeningBriefBody = OpeningBriefInput.omit({ projectId: true }).optional();
const LinkBody = LinkInput.omit({ fromId: true });

/**
 * Strip `bodyVec` and `bodyTsv` from an entity before sending it over the wire.
 * Both fields are internal-only: `bodyVec` is the 384-dim embedding used by
 * hybrid search, and `bodyTsv` is the tsvector used by BM25 — neither is
 * useful to REST consumers (web or agent) and both add significant token noise.
 */
function serializeEntity(e: Entity) {
  const { bodyVec: _bv, bodyTsv: _bt, ...rest } = e;
  return rest;
}

function serializeEntities(rows: Entity[]) {
  return rows.map(serializeEntity);
}

function publicToken(t: Token) {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    plaintext: t.plaintext,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt
  };
}

async function workspaceSettingsResponse(db: ServerContext["db"]) {
  const settings = await getWorkspaceSettings(db);
  return {
    timezone: settings.timezone,
    updatedAt: settings.updatedAt
  };
}

async function embeddingSettingsResponse(ctx: ServerContext) {
  const settings = await getEmbeddingSettings(ctx.db);
  const coverage = await embeddingCoverage(ctx.db);
  const runtime = ctx.embedding.runtimeStatus();
  return {
    enabled: settings.enabled,
    effectiveEnabled: runtime.enabled,
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    dimensions: settings.dimensions,
    apiKeyConfigured: runtime.apiKeyConfigured,
    settingsApiKeyConfigured: Boolean(settings.apiKey),
    apiKeySource: runtime.apiKeySource,
    apiKeyPreview: runtime.apiKeyPreview,
    statusReason: runtime.reason,
    pendingCount: ctx.embedding.pendingCount(),
    totalCount: coverage.totalCount,
    embeddedCount: coverage.embeddedCount,
    missingCount: coverage.missingCount,
    updatedAt: settings.updatedAt
  };
}

export async function registerRoutes(
  rawApp: FastifyInstance,
  ctx: ServerContext
): Promise<void> {
  const app = rawApp.withTypeProvider<ZodTypeProvider>();

  app.get("/health", async () => {
    const embedding = ctx.embedding.runtimeStatus();
    return {
      ok: true,
      version: VERSION,
      embedding: {
        enabled: embedding.enabled,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        reason: embedding.reason
      }
    };
  });

  // ----- settings -----

  app.get(
    "/v1/settings/embedding",
    {
      schema: {
        tags: ["settings"],
        summary: "Read embedding provider/model/key status and vector coverage"
      }
    },
    async () => embeddingSettingsResponse(ctx)
  );

  app.patch(
    "/v1/settings/embedding",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
      schema: {
        tags: ["settings"],
        summary: "Update embedding provider/model/key settings",
        body: UpdateEmbeddingSettingsInput
      }
    },
    async (req) => {
      const body = UpdateEmbeddingSettingsInput.parse(req.body);
      await updateEmbeddingSettings(ctx.db, body);
      await ctx.embedding.reloadConfig();
      return embeddingSettingsResponse(ctx);
    }
  );

  app.post(
    "/v1/settings/embedding/backfill",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: {
        tags: ["settings"],
        summary: "Queue missing embeddings for existing notes and tasks",
        body: EmbeddingBackfillInput.optional()
      }
    },
    async (req) => {
      const body = EmbeddingBackfillInput.parse(req.body ?? {});
      const coverage = await embeddingCoverage(ctx.db);
      const limit = body.limit ?? coverage.missingCount;
      const queued =
        limit > 0
          ? await ctx.embedding.enqueueMissing(limit)
          : { enqueued: 0, pendingCount: ctx.embedding.pendingCount() };
      return {
        ...queued,
        settings: await embeddingSettingsResponse(ctx)
      };
    }
  );

  app.get(
    "/v1/settings/workspace",
    {
      schema: {
        tags: ["settings"],
        summary: "Read workspace settings (timezone)"
      }
    },
    async () => workspaceSettingsResponse(ctx.db)
  );

  app.patch(
    "/v1/settings/workspace",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
      schema: {
        tags: ["settings"],
        summary: "Update workspace settings (timezone)",
        body: UpdateWorkspaceSettingsInput
      }
    },
    async (req) => {
      const body = UpdateWorkspaceSettingsInput.parse(req.body);
      await updateWorkspaceSettings(ctx.db, body);
      return workspaceSettingsResponse(ctx.db);
    }
  );

  // ----- projects -----

  app.post(
    "/v1/projects",
    { schema: { tags: ["projects"], summary: "Create a project", body: CreateProjectInput } },
    async (req) => createProject(ctx.db, CreateProjectInput.parse(req.body))
  );

  app.get(
    "/v1/projects",
    {
      schema: {
        tags: ["projects"],
        summary: "List non-archived projects",
        querystring: ListProjectsQuery
      }
    },
    async (req) => {
      const query = ListProjectsInput.parse(ListProjectsQuery.parse(req.query));
      return listProjects(ctx.db, query);
    }
  );

  app.get(
    "/v1/projects/:id",
    { schema: { tags: ["projects"], summary: "Fetch a project by id (includes AGENTS.md)", params: IdParams } },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const p = await getProject(ctx.db, id);
      if (!p) return reply.code(404).send({ error: "not_found" });
      return p;
    }
  );

  app.patch(
    "/v1/projects/:id",
    {
      schema: {
        tags: ["projects"],
        summary: "Update project (status, name, color, icon, agents_md)",
        params: IdParams,
        body: UpdateProjectInput
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const body = UpdateProjectInput.parse(req.body);
      return updateProject(ctx.db, id, body);
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

  app.post(
    "/v1/projects/:id/opening-brief",
    {
      schema: {
        tags: ["brief"],
        summary: "Opening brief for a project",
        description:
          "Returns the agent context bundle: AGENTS.md, pinned notes, open tasks, and recent activity. Also returns a markdown-formatted version.",
        params: IdParams,
        body: OpeningBriefBody
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const bodyOpts = OpeningBriefBody.parse(req.body);
      const input = OpeningBriefInput.parse({ projectId: id, recentLimit: bodyOpts?.recentLimit });
      const brief = await openingBrief(ctx.db, input);
      return {
        ...brief,
        pinnedNotes: serializeEntities(brief.pinnedNotes),
        openTasks: serializeEntities(brief.openTasks),
        recent: serializeEntities(brief.recent),
        markdown: formatOpeningBrief(brief)
      };
    }
  );

  // Workspace-or-project opening brief. The path-param variant above is kept
  // for clients that already integrate against it; the MCP HTTP client and
  // new plugin code uses this single entry point and passes projectId in the
  // body (or omits it for a workspace-wide brief).
  app.post(
    "/v1/opening-brief",
    {
      schema: {
        tags: ["brief"],
        summary: "Opening brief (project-scoped or workspace-wide)",
        body: OpeningBriefInput.partial().optional()
      }
    },
    async (req) => {
      const input = OpeningBriefInput.parse(req.body ?? {});
      const brief = await openingBrief(ctx.db, input);
      return {
        ...brief,
        pinnedNotes: serializeEntities(brief.pinnedNotes),
        openTasks: serializeEntities(brief.openTasks),
        recent: serializeEntities(brief.recent),
        markdown: formatOpeningBrief(brief)
      };
    }
  );

  // ----- entities (read) -----

  app.get(
    "/v1/entities/:id",
    { schema: { tags: ["entities"], summary: "Fetch an entity by id", params: EntityIdParams } },
    async (req, reply) => {
      const { id } = EntityIdParams.parse(req.params);
      const e = await get(ctx.db, id);
      if (!e) return reply.code(404).send({ error: "not_found" });
      return serializeEntity(e);
    }
  );

  app.get(
    "/v1/projects/by-key/:key/entities/by-seq/:seq",
    {
      schema: {
        tags: ["entities"],
        summary: "Fetch an entity by its human-readable identifier (e.g. DEMO-12)",
        params: KeySeqParams
      }
    },
    async (req, reply) => {
      const { key, seq } = KeySeqParams.parse(req.params);
      const e = await getByKey(ctx.db, key, seq);
      if (!e) return reply.code(404).send({ error: "not_found" });
      return serializeEntity(e);
    }
  );

  app.get(
    "/v1/entities/:id/related",
    {
      schema: {
        tags: ["entities"],
        summary: "List entities whose parent_id is this id (e.g. notes linked to a task)",
        params: EntityIdParams
      }
    },
    async (req) => {
      const { id } = EntityIdParams.parse(req.params);
      return serializeEntities(await listRelated(ctx.db, id));
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
    async (req) => serializeEntities(await recent(ctx.db, RecentInput.parse(req.body ?? {})))
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
      return {
        hits: hits.map((h) => ({ ...h, entity: serializeEntity(h.entity) })),
        embeddingUsed: queryEmbedding != null
      };
    }
  );

  app.post(
    "/v1/tasks/range",
    {
      schema: {
        tags: ["tasks"],
        summary: "Tasks in a date range + overdue + backlog (no due_at)",
        description:
          "Returns three buckets: scheduled (display date in [from, to)), overdue (unfinished due_at before from, or before now when from is omitted), backlog (no due_at, only when includeBacklog).",
        body: TasksRangeInput
      }
    },
    async (req) => {
      const result = await tasksRange(ctx.db, TasksRangeInput.parse(req.body));
      return {
        scheduled: serializeEntities(result.scheduled),
        overdue: serializeEntities(result.overdue),
        backlog: serializeEntities(result.backlog)
      };
    }
  );

  app.post(
    "/v1/tasks/:id/recurrence",
    {
      schema: {
        tags: ["recurrence"],
        summary: "Configure recurrence on a task",
        params: IdParams,
        body: RecurrenceInput
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const body = RecurrenceInput.parse(req.body);
      return createRecurrenceRule(ctx.db, id, body);
    }
  );

  app.get(
    "/v1/tasks/:id/recurrence",
    {
      schema: {
        tags: ["recurrence"],
        summary: "Read recurrence for a task",
        params: IdParams
      }
    },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const recurrence = await getRecurrenceForTask(ctx.db, id);
      if (!recurrence) {
        reply.code(404);
        return { error: "not_found", path: req.url };
      }
      return {
        ...recurrence,
        currentOccurrence: recurrence.currentOccurrence
          ? serializeEntity(recurrence.currentOccurrence)
          : null
      };
    }
  );

  app.patch(
    "/v1/recurrences/:id",
    {
      schema: {
        tags: ["recurrence"],
        summary: "Update a recurrence rule",
        params: RuleIdParams,
        body: UpdateRecurrenceInput
      }
    },
    async (req) => {
      const { id } = RuleIdParams.parse(req.params);
      const body = UpdateRecurrenceInput.parse(req.body);
      return updateRecurrenceRule(ctx.db, id, body);
    }
  );

  app.post(
    "/v1/tasks/:id/skip-occurrence",
    {
      schema: {
        tags: ["recurrence"],
        summary: "Skip the current recurring occurrence and create the next one",
        params: IdParams,
        body: SkipOccurrenceInput.optional()
      }
    },
    async (req) => {
      const { id } = IdParams.parse(req.params);
      const body = SkipOccurrenceInput.parse(req.body ?? {});
      const result = await skipOccurrence(ctx.db, id, body);
      return {
        ...result,
        skipped: serializeEntity(result.skipped),
        next: result.next ? serializeEntity(result.next) : null
      };
    }
  );

  app.post(
    "/v1/recurrences/:id/stop",
    {
      schema: {
        tags: ["recurrence"],
        summary: "Stop a recurrence series",
        params: RuleIdParams,
        body: StopRecurrenceInput.optional()
      }
    },
    async (req) => {
      const { id } = RuleIdParams.parse(req.params);
      const body = StopRecurrenceInput.parse(req.body ?? {});
      return stopRecurrence(ctx.db, id, body);
    }
  );

  // ----- entities (write) -----

  app.post(
    "/v1/tasks",
    {
      schema: {
        tags: ["entities"],
        summary: "Create a task",
        body: CreateTaskInput
      }
    },
    async (req) => {
      const body = CreateTaskInput.parse(req.body);
      const entity = await write(ctx.db, { ...body, kind: "task", pinned: false });
      if (ctx.embedding.isEnabled()) {
        ctx.embedding.enqueue(entity.id, `${entity.title ?? ""}\n${entity.body}`);
      }
      return serializeEntity(entity);
    }
  );

  app.post(
    "/v1/notes",
    {
      schema: {
        tags: ["entities"],
        summary: "Create a note (title optional; body's first line acts as the label)",
        body: CreateNoteInput
      }
    },
    async (req) => {
      const body = CreateNoteInput.parse(req.body);
      const entity = await write(ctx.db, {
        ...body,
        kind: "note",
        status: "open",
        priority: "none",
        dueAt: null
      });
      if (ctx.embedding.isEnabled()) {
        ctx.embedding.enqueue(entity.id, `${entity.title ?? ""}\n${entity.body}`);
      }
      return serializeEntity(entity);
    }
  );

  app.patch(
    "/v1/entities/:id",
    {
      schema: {
        tags: ["entities"],
        summary: "Update an entity (task or note)",
        params: EntityIdParams,
        body: UpdateInput
      }
    },
    async (req) => {
      const { id } = EntityIdParams.parse(req.params);
      const fields = UpdateInput.parse(req.body);
      const updated = await update(ctx.db, id, fields);
      if (
        ctx.embedding.isEnabled() &&
        (fields.body !== undefined || fields.title !== undefined)
      ) {
        ctx.embedding.enqueue(updated.id, `${updated.title ?? ""}\n${updated.body}`);
      }
      return serializeEntity(updated);
    }
  );

  app.delete(
    "/v1/entities/:id",
    {
      schema: {
        tags: ["entities"],
        summary: "Delete an entity",
        params: EntityIdParams
      }
    },
    async (req, reply) => {
      const { id } = EntityIdParams.parse(req.params);
      const ok = await remove(ctx.db, id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/entities/:id/links",
    {
      schema: {
        tags: ["entities"],
        summary: "Link this entity to another (blocks / references / parent_of)",
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

  // ----- auth (browser session cookie) -----

  const LoginBody = z.object({
    password: z.string().min(1).max(500)
  });

  app.post(
    "/v1/auth/login",
    {
      // Tight cap — this is the brute-force surface.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Master-password login. Sets httpOnly session cookie.",
        body: LoginBody
      }
    },
    async (req, reply) => {
      const { password } = LoginBody.parse(req.body);
      const ok = verifyMasterPassword(password);
      if (!ok) {
        // Add a small constant-time penalty so timing attacks against the
        // env-lookup branch aren't easier than the rate limit makes them.
        await new Promise((r) => setTimeout(r, 300));
        return reply.code(401).send({ error: "invalid_password" });
      }
      const ua = (req.headers["user-agent"] as string | undefined) ?? null;
      const { plaintext, session } = await createSession(ctx.db, { userAgent: ua });
      reply.setCookie("botnote_session", plaintext, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
      return { ok: true, expiresAt: session.expiresAt };
    }
  );

  app.post(
    "/v1/auth/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "Clear session cookie and revoke the server-side row."
      }
    },
    async (req, reply) => {
      const plaintext = req.cookies?.botnote_session;
      if (plaintext) await revokeSession(ctx.db, plaintext);
      reply.clearCookie("botnote_session", { path: "/" });
      return { ok: true };
    }
  );

  app.get(
    "/v1/auth/whoami",
    {
      schema: {
        tags: ["auth"],
        summary: "Confirm authentication state + how the caller got in."
      }
    },
    async (req) => {
      // If the request reached this handler, the auth gate already passed —
      // either via cookie, bearer, or trusted direct origin.
      const hasCookie = !!req.cookies?.botnote_session;
      const hasBearer = !!req.headers.authorization;
      const viaProxy =
        !!req.headers["cf-connecting-ip"] || !!req.headers["x-forwarded-for"];
      return {
        authenticated: true,
        via: hasCookie
          ? "cookie"
          : hasBearer
            ? "bearer"
            : viaProxy
              ? "unknown"
              : "trusted_origin"
      };
    }
  );

  // ----- tokens -----

  app.get(
    "/v1/tokens",
    { schema: { tags: ["tokens"], summary: "List API tokens (no hash; includes recoverable plaintext when available)" } },
    async () => (await listTokens(ctx.db)).map(publicToken)
  );

  // Token write endpoints get a much tighter cap (30/hour per IP). These are
  // low-frequency operations — bumping them limits the blast radius if a token
  // leaks or someone hammers the create endpoint.
  app.post(
    "/v1/tokens",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
      schema: {
        tags: ["tokens"],
        summary: "Create a new API token (plaintext remains available for copying)",
        body: CreateTokenInput
      }
    },
    async (req) => {
      const body = CreateTokenInput.parse(req.body);
      const { token, plaintext } = await createToken(ctx.db, body);
      return { ...publicToken(token), plaintext };
    }
  );

  app.delete(
    "/v1/tokens/:id",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
      schema: { tags: ["tokens"], summary: "Revoke an API token", params: IdParams }
    },
    async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const ok = await revokeToken(ctx.db, id);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    }
  );
}
