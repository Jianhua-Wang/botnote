# AGENTS.md — botnote codebase

Imperative conventions for any agent working on the botnote codebase itself.
(This is NOT the per-project AGENTS.md that botnote stores for users — that
lives in the `projects.agents_md` column.)

## Critical

- NEVER commit `.env` or any file containing `OPENAI_API_KEY` or
  `DATABASE_URL` with real credentials.
- NEVER skip git hooks (`--no-verify`).
- ALWAYS run `pnpm typecheck` before committing.
- ALWAYS write idempotent migrations — `IF NOT EXISTS` on indexes,
  `CREATE OR REPLACE` on functions.

## Stack

- Node 20+, TypeScript ESM, pnpm
- Postgres 16 + pgvector + tsvector, accessed via drizzle-orm + node-postgres
- Fastify 5 for REST, `@modelcontextprotocol/sdk` for MCP
- zod for runtime validation
- vitest for tests

## Layout

```
src/
  db/         # drizzle schema + migrations + connection
  service/    # business logic — no transport, no IO besides db + openai
  rest/       # fastify routes — thin wrappers over service/
  mcp/        # MCP server — thin wrappers over service/
  cli.ts      # entry point: boots service + REST + MCP
```

REST and MCP MUST share the service layer. Do not duplicate business logic in
either transport.

## Schema rules

- `entities` is the single multi-kind table. Do not split per kind.
- Every write MUST set `actor` (agent | human | system).
- Every write MUST accept `idempotency_key`. Re-writes with the same key
  return the existing record unchanged.
- `body_tsv` is a generated column from `body`. Do not write it directly.
- `body_vec` is populated async via the embedding worker. NULL is a valid
  intermediate state.

## Search rules

- Hybrid retrieval default: RRF over BM25 + cosine + time decay.
- Single-query latency target: < 50ms at 10k entities.
- If `OPENAI_API_KEY` missing, fall back to BM25-only. Log a warning.
  Never throw on missing embedding.

## MCP rules

- All tools MUST set MCP 2025-03-26 annotations
  (`readOnlyHint`, `idempotentHint`, `destructiveHint`, `openWorldHint`).
- Tool descriptions are agent-facing. Keep them imperative, < 3 sentences.
- Expose `opening_brief` as both a tool AND a resource. The resource is
  what gets auto-injected when an MCP client opens a session.

## Testing

- Every service operation needs a unit test for happy path + idempotency.
- E2E smoke lives in `tests/e2e/`. Spawn the daemon against a throwaway
  Postgres schema, exercise both REST and MCP transports, assert behavior
  matches.

## Style

- No comments unless WHY is non-obvious. Names carry meaning.
- No commented-out code. Delete or commit.
- No `console.log` outside `cli.ts`. Use the fastify/MCP logger.
- Errors: throw typed errors from service/, transports translate to
  HTTP status / MCP error codes.
