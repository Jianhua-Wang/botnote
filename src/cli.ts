import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { BotnoteHttpClient } from "./mcp/http-client.js";
import { buildMcpServer } from "./mcp/server.js";
import { EmbeddingService } from "./service/embedding.js";
import { purgeExpired } from "./service/entities.js";
import { LOCK_KEYS, withAdvisoryLock } from "./service/locks.js";
import { materializeScheduledRecurrences } from "./service/recurrence.js";
import { resolveDefaultScope } from "./service/scope.js";
import { pruneExpiredSessions } from "./service/sessions.js";
import { DEFAULT_PORT, envValue, resolveBaseUrl } from "./config.js";
import { authConfigFromEnv, isLoopback } from "./rest/auth.js";
import { buildServer } from "./rest/server.js";
import { VERSION } from "./version.js";

const DEFAULT_RECURRENCE_MATERIALIZE_INTERVAL_MS = 5 * 60 * 1000;
// Trashed entities are hard-deleted after this many days. 0 disables auto-purge.
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const DAILY_MS = 24 * 60 * 60 * 1000;
const TRASH_PURGE_INTERVAL_MS = DAILY_MS;
const SESSION_PRUNE_INTERVAL_MS = DAILY_MS;

function endOfToday(): Date {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

async function runRest(): Promise<void> {
  const port = Number(envValue(process.env.BOTNOTE_PORT) ?? DEFAULT_PORT);
  const host = process.env.BOTNOTE_HOST ?? "127.0.0.1";
  const logLevel = process.env.BOTNOTE_LOG_LEVEL ?? "info";
  const recurrenceIntervalMs = Number(
    process.env.BOTNOTE_RECURRENCE_MATERIALIZE_INTERVAL_MS ??
      DEFAULT_RECURRENCE_MATERIALIZE_INTERVAL_MS
  );

  await migrate();

  const { db, pool } = createDb();
  const defaultScope = await resolveDefaultScope(db);
  const embedding = new EmbeddingService(db, { apiKey: process.env.OPENAI_API_KEY });
  await embedding.reloadConfig();

  const auth = authConfigFromEnv();
  const app = await buildServer({ db, embedding, logLevel, auth, defaultScope });
  await app.listen({ port, host });

  app.log.info(
    `botnote v${VERSION} listening on http://${host}:${port} (docs: /docs, embeddings ${embedding.isEnabled() ? "ON" : "OFF"})`
  );
  if (!auth.required && !isLoopback(host) && host !== "localhost") {
    app.log.warn(
      `listening on ${host} with auth disabled: anyone who can reach port ${port} can read and write everything. Set BOTNOTE_PASSWORD (and create an API token) or BOTNOTE_REQUIRE_AUTH=1.`
    );
  }

  // Background jobs take a database-wide advisory lock so several daemon
  // instances on one database (hosted mode) never run the same pass twice.
  const materializeRecurrences = async () => {
    try {
      const run = await withAdvisoryLock(pool, LOCK_KEYS.recurrenceMaterializer, () =>
        materializeScheduledRecurrences(db, endOfToday(), 500)
      );
      if (!run.acquired) {
        app.log.debug("recurrence materializer skipped: another instance holds the lock");
        return;
      }
      if (run.value.length > 0) {
        app.log.info(`materialized ${run.value.length} scheduled recurring task(s)`);
      }
    } catch (err) {
      app.log.error({ err }, "scheduled recurrence materializer failed");
    }
  };
  await materializeRecurrences();
  const recurrenceTimer =
    recurrenceIntervalMs > 0 ? setInterval(materializeRecurrences, recurrenceIntervalMs) : null;

  const trashRetentionDays = Number(
    process.env.BOTNOTE_TRASH_RETENTION_DAYS ?? DEFAULT_TRASH_RETENTION_DAYS
  );
  const purgeTrash = async () => {
    try {
      const run = await withAdvisoryLock(pool, LOCK_KEYS.trashPurge, () =>
        purgeExpired(db, trashRetentionDays)
      );
      if (!run.acquired) {
        app.log.debug("trash purge skipped: another instance holds the lock");
        return;
      }
      if (run.value > 0) {
        app.log.info(`purged ${run.value} trashed entit(ies) older than ${trashRetentionDays}d`);
      }
    } catch (err) {
      app.log.error({ err }, "trash purge failed");
    }
  };
  let trashTimer: NodeJS.Timeout | null = null;
  if (trashRetentionDays > 0) {
    await purgeTrash();
    trashTimer = setInterval(purgeTrash, TRASH_PURGE_INTERVAL_MS);
  }

  const pruneSessions = async () => {
    try {
      const run = await withAdvisoryLock(pool, LOCK_KEYS.sessionPrune, () =>
        pruneExpiredSessions(db)
      );
      if (!run.acquired) {
        app.log.debug("session prune skipped: another instance holds the lock");
        return;
      }
      if (run.value > 0) {
        app.log.info(`pruned ${run.value} expired session(s)`);
      }
    } catch (err) {
      app.log.error({ err }, "session prune failed");
    }
  };
  await pruneSessions();
  const sessionTimer = setInterval(pruneSessions, SESSION_PRUNE_INTERVAL_MS);

  const shutdown = async (sig: string) => {
    app.log.info(`shutting down on ${sig}`);
    if (recurrenceTimer) clearInterval(recurrenceTimer);
    if (trashTimer) clearInterval(trashTimer);
    clearInterval(sessionTimer);
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
  // daemon (loopback by default, a private network URL, a public instance...).
  // Every log line must go to stderr so we don't corrupt the MCP framed JSON
  // on stdout.
  const { baseUrl, explicit } = resolveBaseUrl();
  const client = new BotnoteHttpClient({
    baseUrl,
    token: envValue(process.env.BOTNOTE_TOKEN),
    version: VERSION
  });
  const server = buildMcpServer({ client, version: VERSION });
  const transport = new StdioServerTransport();

  // Exit diagnostics: clients report the server "dropping mid-session" but the
  // process itself never says why it went away. Every path out of the process
  // leaves one stderr line so the harness log shows whether the host closed
  // stdin, sent a signal, or the server crashed.
  const sayExit = (reason: string) => process.stderr.write(`botnote MCP exiting: ${reason}\n`);
  process.stdin.on("end", () => sayExit("stdin closed by host"));
  process.stdin.on("close", () => sayExit("stdin stream closed"));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      sayExit(`received ${sig}`);
      process.exit(0);
    });
  }
  process.on("uncaughtException", (err) => {
    sayExit(`uncaught exception: ${err?.stack ?? err}`);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    sayExit(`unhandled rejection: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
  });

  await server.connect(transport);
  process.stderr.write(
    `botnote MCP v${VERSION} ready (stdio) → ${baseUrl}${explicit ? "" : " (default; set BOTNOTE_URL for another daemon)"}\n`
  );
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
