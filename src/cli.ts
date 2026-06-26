import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { BotnoteHttpClient } from "./mcp/http-client.js";
import { buildMcpServer } from "./mcp/server.js";
import { EmbeddingService } from "./service/embedding.js";
import { materializeScheduledRecurrences } from "./service/recurrence.js";
import { buildServer } from "./rest/server.js";
import { VERSION } from "./version.js";

// Public botnote.net is the default so fresh remote installs (the common
// plugin-install case) work without extra config. The daemon host overrides
// via BOTNOTE_URL in its Codex / Claude Code config to skip the tunnel.
const DEFAULT_MCP_BASE_URL = "https://botnote.net";
const DEFAULT_RECURRENCE_MATERIALIZE_INTERVAL_MS = 5 * 60 * 1000;

function endOfToday(): Date {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

async function runRest(): Promise<void> {
  const port = Number(process.env.BOTNOTE_PORT ?? 4280);
  const host = process.env.BOTNOTE_HOST ?? "127.0.0.1";
  const logLevel = process.env.BOTNOTE_LOG_LEVEL ?? "info";
  const recurrenceIntervalMs = Number(
    process.env.BOTNOTE_RECURRENCE_MATERIALIZE_INTERVAL_MS ??
      DEFAULT_RECURRENCE_MATERIALIZE_INTERVAL_MS
  );

  await migrate();

  const { db } = createDb();
  const embedding = new EmbeddingService(db, { apiKey: process.env.OPENAI_API_KEY });
  await embedding.reloadConfig();

  const app = await buildServer({ db, embedding, logLevel });
  await app.listen({ port, host });

  app.log.info(
    `botnote v${VERSION} listening on http://${host}:${port} (docs: /docs, embeddings ${embedding.isEnabled() ? "ON" : "OFF"})`
  );

  const materializeRecurrences = async () => {
    try {
      const created = await materializeScheduledRecurrences(db, endOfToday(), 500);
      if (created.length > 0) {
        app.log.info(`materialized ${created.length} scheduled recurring task(s)`);
      }
    } catch (err) {
      app.log.error({ err }, "scheduled recurrence materializer failed");
    }
  };
  await materializeRecurrences();
  const recurrenceTimer =
    recurrenceIntervalMs > 0 ? setInterval(materializeRecurrences, recurrenceIntervalMs) : null;

  const shutdown = async (sig: string) => {
    app.log.info(`shutting down on ${sig}`);
    if (recurrenceTimer) clearInterval(recurrenceTimer);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function runMcp(): Promise<void> {
  // MCP stdio mode. The server is now an HTTP client of the botnote daemon
  // (no DB connection here), so this entry point is package-portable: it can
  // be installed via a Claude Code plugin on any machine and pointed at any
  // daemon (private network URL, https://botnote.net, ...).
  // Every log line must go to stderr so we don't corrupt the MCP framed JSON
  // on stdout.
  const baseUrl = process.env.BOTNOTE_URL ?? DEFAULT_MCP_BASE_URL;
  const client = new BotnoteHttpClient({
    baseUrl,
    token: process.env.BOTNOTE_TOKEN || undefined,
    version: VERSION
  });
  const server = buildMcpServer({ client, version: VERSION });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`botnote MCP v${VERSION} ready (stdio) → ${baseUrl}\n`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "rest";
  if (mode === "mcp") {
    await runMcp();
    return;
  }
  await runRest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
