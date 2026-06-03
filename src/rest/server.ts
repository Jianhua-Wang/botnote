import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from "fastify-type-provider-zod";
import type { Database } from "../db/client.js";
import type { EmbeddingService } from "../service/embedding.js";
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

export async function buildServer(opts: BuildServerOpts): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: opts.logLevel ?? "info" }
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
        { name: "entities", description: "Notes, tasks, decisions, comments, etc." },
        { name: "tasks", description: "Task calendar queries (range + backlog)." },
        { name: "search", description: "Hybrid retrieval." },
        { name: "brief", description: "Opening brief — agent context bundle." },
        { name: "actors", description: "Human / agent / system identities." }
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

  await registerRoutes(app, { db: opts.db, embedding: opts.embedding });

  const webDist = resolveWebDist(opts.webDist);
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false,
      decorateReply: true
    });
    app.setNotFoundHandler(async (req, reply) => {
      const url = req.url;
      if (
        url.startsWith("/v1") ||
        url.startsWith("/docs") ||
        url === "/health" ||
        url.startsWith("/health?")
      ) {
        return reply.code(404).send({ error: "not_found", path: url });
      }
      return reply.sendFile("index.html");
    });
    app.log.info(`web UI served from ${webDist}`);
  } else {
    app.log.warn("web/dist not found; UI not served (BOTNOTE_WEB_DIST or build required)");
  }

  return app;
}
