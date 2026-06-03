import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from "fastify-type-provider-zod";
import type { Database } from "../db/client.js";
import type { EmbeddingService } from "../service/embedding.js";
import { consumeSession } from "../service/sessions.js";
import { consumeToken } from "../service/tokens.js";
import { registerRoutes } from "./routes.js";

export interface ServerContext {
  db: Database["db"];
  embedding: EmbeddingService;
}

export interface BuildServerOpts extends ServerContext {
  logLevel?: string;
  webDist?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveWebDist(explicit?: string): string | null {
  const envPath = process.env.BOTNOTE_WEB_DIST;
  const candidates = [
    explicit,
    envPath,
    path.resolve(__dirname, "../../web/dist"),
    path.resolve(__dirname, "../../../web/dist")
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}

/** Default CORS allowlist. Add public origins via BOTNOTE_CORS_ORIGINS
 *  (comma-separated). The tailnet + localhost entries stay for ops access. */
function defaultCorsOrigins(): string[] {
  const built: string[] = [
    "http://127.0.0.1:4280",
    "http://localhost:4280",
    "http://100.68.185.53:4280",
    "https://botnote.net"
  ];
  const extra = process.env.BOTNOTE_CORS_ORIGINS;
  if (extra) {
    for (const o of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!built.includes(o)) built.push(o);
    }
  }
  return built;
}

/** Read the caller's real IP. cf-connecting-ip is set by Cloudflare for every
 *  request that goes through CF Tunnel — without it, rate-limit would key on
 *  the tunnel's loopback address and the whole world would share one bucket. */
function clientIp(req: FastifyRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff) return xff.split(",")[0]!.trim();
  return req.ip;
}

export async function buildServer(opts: BuildServerOpts): Promise<FastifyInstance> {
  const isProduction = process.env.NODE_ENV === "production";

  const app = Fastify({
    logger: { level: opts.logLevel ?? "info" },
    // We're behind CF Tunnel (or tailscale serve). Trust the immediate proxy so
    // req.ip is sensible, but rely on clientIp() above for rate-limit keying.
    trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie, {
    // No global secret/sign — session cookies carry an opaque random token
    // that maps to a row in `sessions`; tamper-detection isn't useful since
    // we already validate every value against the DB.
    hook: "onRequest"
  });

  await app.register(cors, {
    origin: defaultCorsOrigins(),
    // credentials: true so cookies can be sent across origins (browser will
    // refuse to attach cookies on a fetch to a different origin otherwise).
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
    maxAge: 86400
  });

  await app.register(rateLimit, {
    // 1000 req/min per IP — generous enough that a Claude Code session burst
    // and the Web UI's 30s polling combined don't trip it; tight enough that a
    // leaked token can't quietly exfil thousands of entities per second.
    max: 1000,
    timeWindow: "1 minute",
    keyGenerator: (req: FastifyRequest) => clientIp(req),
    // /health is a probe; /assets/* are dozens of static files per page load.
    // Counting them would cap real API headroom for no benefit.
    allowList: (req: FastifyRequest) => {
      const u = req.url;
      return u === "/health" || u.startsWith("/health?") || u.startsWith("/assets/");
    },
    errorResponseBuilder: (_req, ctx) => ({
      error: "rate_limited",
      message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      retryAfter: Math.ceil(ctx.ttl / 1000)
    })
  });

  if (!isProduction) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "botnote",
          version: "0.0.1",
          description:
            "Notion for bots. A lightweight, agent-first project + notes + memory store."
        },
        servers: [
          {
            url: `http://localhost:${process.env.BOTNOTE_PORT ?? 4280}`,
            description: "local"
          }
        ],
        tags: [
          { name: "projects", description: "Project lifecycle and AGENTS.md." },
          { name: "entities", description: "Tasks and notes." },
          { name: "tasks", description: "Task calendar queries (range + backlog)." },
          { name: "search", description: "Hybrid retrieval." },
          { name: "brief", description: "Opening brief — agent context bundle." },
          { name: "tokens", description: "API token management." }
        ]
      },
      transform: jsonSchemaTransform
    });

    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: false
      }
    });
    app.log.info("swagger UI mounted at /docs (dev mode)");
  } else {
    app.log.info("swagger UI disabled (production)");
  }

  // ----- error handler -----
  // Strip Node stack traces from all responses. Zod validation errors return
  // field-level info but no schema dump; Fastify's own errors get a safe
  // summary.
  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & {
      statusCode?: number;
      code?: string;
      validation?: Array<{ instancePath?: string; schemaPath?: string; message?: string }>;
    };
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Request body or params failed validation.",
        details: err.validation!.map((v) => ({
          path: v.instancePath || v.schemaPath || "",
          message: v.message ?? ""
        }))
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, "response serialization failed");
      return reply.code(500).send({ error: "server_error" });
    }
    // fastify-rate-limit's errorResponseBuilder result lands here without a
    // statusCode prop, so it would otherwise fall through to the 500 bucket
    // and lose the retryAfter signal. Surface it explicitly.
    const errAny = err as Error & { error?: string; retryAfter?: number };
    if (errAny.error === "rate_limited") {
      return reply.code(429).send({
        error: "rate_limited",
        message: err.message,
        retryAfter: errAny.retryAfter
      });
    }
    const sc = err.statusCode;
    if (typeof sc === "number" && sc >= 400 && sc < 500) {
      return reply.code(sc).send({ error: err.code ?? "client_error", message: err.message });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "server_error" });
  });

  // ----- auth -----
  // Trust direct connections (tailnet IP, 127.0.0.1, the macmini-local Web UI)
  // and only enforce bearer tokens on requests that came through Cloudflare
  // Tunnel (or any reverse proxy that sets cf-connecting-ip / x-forwarded-for).
  // This lets Boss browse the local tailnet URL without a login flow while
  // keeping the public botnote.net surface fully token-gated.
  const requireAuth = process.env.BOTNOTE_REQUIRE_AUTH === "1";
  if (requireAuth) {
    // IMPORTANT: register at onRequest, not preHandler. fastify-type-provider-zod
    // runs schema validation at preValidation, which is BEFORE preHandler — so
    // a preHandler auth gate lets an unauthenticated POST get a 400 zod error
    // back, leaking the request schema. onRequest fires first; no body has been
    // parsed yet, but headers and cookies are all we need.
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/v1/")) return;
      // The login endpoint is the entry point — gating it would be a
      // chicken-and-egg loop. Logout is fine to leave open too (it's a noop
      // when no cookie is present).
      if (
        req.url.startsWith("/v1/auth/login") ||
        req.url.startsWith("/v1/auth/logout")
      ) {
        return;
      }
      const viaProxy =
        !!req.headers["cf-connecting-ip"] || !!req.headers["x-forwarded-for"];
      if (!viaProxy) return; // direct tailnet/localhost — trusted

      // Browser path: session cookie set by /v1/auth/login.
      const cookieToken = req.cookies?.botnote_session;
      if (cookieToken) {
        const session = await consumeSession(opts.db, cookieToken);
        if (session) return;
      }

      // CLI / MCP path: bearer token.
      const auth = req.headers.authorization;
      if (auth && auth.startsWith("Bearer ")) {
        const plaintext = auth.slice("Bearer ".length).trim();
        const tok = await consumeToken(opts.db, plaintext);
        if (tok) return;
      }

      return reply.code(401).send({ error: "unauthenticated" });
    });
    app.log.info("auth: required for /v1/* via reverse proxy (cookie or bearer; direct tailnet trusted)");
  } else {
    app.log.info("auth: disabled (set BOTNOTE_REQUIRE_AUTH=1 to enforce)");
  }

  await registerRoutes(app, { db: opts.db, embedding: opts.embedding });

  const webDist = resolveWebDist(opts.webDist);
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      // wildcard: true lets fastify-static answer for every file under root
      // (notably /assets/<hash>.js / .css). Without it, those paths fall
      // through to the not-found handler and the SPA fallback sends back
      // index.html — the browser then tries to parse HTML as a JS module and
      // the page renders blank.
      wildcard: true,
      decorateReply: true,
      cacheControl: true,
      maxAge: "1d",
      immutable: false
    });

    const indexHtmlPath = path.join(webDist, "index.html");
    // Re-read on each request. The file is ~700 bytes so the cost is trivial,
    // and this guarantees we never serve a stale HTML that points to an old
    // asset hash after `pnpm build` overwrites the bundle — that's how the
    // page goes blank when the daemon outlives the previous build.
    const readIndex = () => readFileSync(indexHtmlPath, "utf8");

    // Explicit `/` route wins over fastify-static's wildcard so the homepage
    // always serves fresh HTML with no-cache, sidestepping the long max-age
    // applied to /assets/*.
    app.get("/", async (_req, reply) => {
      reply.type("text/html; charset=utf-8");
      reply.header("cache-control", "no-cache");
      return readIndex();
    });
    app.setNotFoundHandler(async (req, reply) => {
      const url = req.url;
      if (
        url.startsWith("/v1") ||
        url.startsWith("/docs") ||
        url === "/health" ||
        url.startsWith("/health?") ||
        url.startsWith("/assets/")
      ) {
        return reply.code(404).send({ error: "not_found", path: url });
      }
      // SPA fallback for client-side routes (/today, /p/:key, etc.). Send the
      // file fresh from disk with no-cache so the browser never pins it to
      // an old asset hash after a redeploy.
      reply.type("text/html; charset=utf-8");
      reply.header("cache-control", "no-cache");
      return readIndex();
    });
    app.log.info(`web UI served from ${webDist}`);
  } else {
    app.log.warn("web/dist not found; UI not served (BOTNOTE_WEB_DIST or build required)");
  }

  return app;
}
