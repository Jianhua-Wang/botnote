# botnote

Notion for bots. A lightweight, agent-first store for projects, tasks, notes, and memory.

Single binary. Single Postgres database. One MCP server + one REST API over the same service layer.

## Status

v0 / M1 in progress. Not yet shipped.

## Design

- Storage: Postgres 16 + pgvector + tsvector
- ORM: drizzle
- API: MCP server (stdio) + REST (Fastify) — both expose the same 8 operations
- Search: hybrid retrieval — tsvector BM25 + pgvector cosine + time decay, merged via RRF
- Embeddings: OpenAI `text-embedding-3-small`, 384 dimensions
- Single entity table `entities` with `kind` discriminator: task | note | decision | doc | comment | log | memory

## Run

```bash
pnpm install
# Set OPENAI_API_KEY + DATABASE_URL
pnpm db:migrate
pnpm dev
```

## MCP tools

- `opening_brief(project_id?)` — auto-injected context
- `search(query, kind?, project_id?)` — hybrid retrieval
- `get(id)`
- `write(kind, project_id, title, body, ...)` — with `idempotency_key`
- `update(id, fields)`
- `link(from, to, kind)`
- `recent(project_id, since?, kinds?)`
- `agents_md(project_id)`

## License

Private. Personal use.
