import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { EmbeddingService } from "./service/embedding.js";
import { buildServer } from "./rest/server.js";

const VERSION = "0.0.1";

async function main(): Promise<void> {
  const port = Number(process.env.BOTNOTE_PORT ?? 4280);
  const host = process.env.BOTNOTE_HOST ?? "127.0.0.1";
  const logLevel = process.env.BOTNOTE_LOG_LEVEL ?? "info";

  await migrate();

  const { db } = createDb();
  const embedding = new EmbeddingService(db, { apiKey: process.env.OPENAI_API_KEY });

  const app = await buildServer({ db, embedding, logLevel });
  await app.listen({ port, host });

  app.log.info(
    `botnote v${VERSION} listening on http://${host}:${port} (docs: /docs, embeddings ${embedding.isEnabled() ? "ON" : "OFF"})`
  );

  const shutdown = async (sig: string) => {
    app.log.info(`shutting down on ${sig}`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
