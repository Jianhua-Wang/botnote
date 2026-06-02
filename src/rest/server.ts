import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
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

  return app;
}
