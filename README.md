# botnote

Notion for bots. A single binary that stores projects, tasks, notes, and agent memory — and exposes them to AI agents via MCP and REST.

## Why

Agents work best with one stable, queryable, write-friendly source of truth — not a stack of Notion + Jira + Slack + scratch files. botnote is that source of truth, scoped to one user, deployable in 60 seconds.

Three things only:

1. **Project management** — projects and tasks with status, priority, due dates, and stable identifiers.
2. **Note-taking** — free-form Markdown notes, tagged, searchable, and optionally pinned.
3. **Memory for agents** — hybrid retrieval (BM25 + vector + time decay), opening brief auto-bundles AGENTS.md + recent context.

## Design

- Storage: Postgres + pgvector + tsvector. Single dedicated docker container.
- Single multi-kind entity table — `task / note` discriminated by `kind` column.
- Search: hybrid retrieval — tsvector BM25 + pgvector cosine + time decay, merged via Reciprocal Rank Fusion (k=60).
- Embeddings: OpenAI `text-embedding-3-small` at 384 dimensions, written asynchronously. Falls back to BM25-only if no API key.
- API: MCP server (stdio) + REST API (Fastify on `:4280`) over a shared service layer.
- Every write records `actorKind` (human / agent / system); `idempotencyKey` is supported on writes.
- All MCP tools carry `2025-03-26` annotations: `readOnlyHint`, `idempotentHint`, `destructiveHint`, `openWorldHint`.

## Quick start

Requires: Node 20+, pnpm, Docker.

### CLI install

On client machines, install the portable CLI from npm:

```bash
npm i -g botnote
botnote login
```

`botnote login` stores the daemon URL and bearer token in
`~/.config/botnote/config.json`. Use `https://botnote.net` plus a token from
Settings -> API tokens on remote machines; use `http://127.0.0.1:4280` without
a token on the daemon host. New API tokens remain copyable from Settings; tokens
created before recoverable storage was added only show their prefix and should
be regenerated if the full value was lost.

Security note: newly-created API tokens are stored recoverably in the database
so Settings can copy them later. Treat the database and backups as
secret-bearing material, and revoke tokens if either is exposed.

The Claude Code and Codex plugins call `botnote mcp`, so installing the npm
package is enough for plugin runtime on machines that do not have a botnote
source checkout.

### Local daemon development

```bash
# 1. Spin up postgres (port 55434, pgvector extension)
docker compose up -d

# 2. Install deps
pnpm install

# 3. Apply schema
DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote pnpm db:migrate

# 4. Boot REST + Swagger UI
DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote pnpm dev
```

Then:

- REST API: <http://localhost:4280>
- Swagger UI: <http://localhost:4280/docs>
- OpenAPI JSON: <http://localhost:4280/docs/json>

Embeddings are optional. Set `OPENAI_API_KEY` to enable hybrid (BM25 + cosine) search; without it, search is BM25-only.

### Tests

Tests must run against a disposable database whose name contains `test`. The
helper refuses any other database name so local test runs do not touch a live
botnote instance.

```bash
docker compose up -d
docker exec botnote-postgres createdb -U botnote botnote_test || true

DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote_test pnpm db:migrate
BOTNOTE_TEST_DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote_test pnpm test
```

## REST endpoints

| method | path | summary |
|---|---|---|
| `POST` | `/v1/projects` | Create project |
| `GET` | `/v1/projects` | List projects |
| `GET` | `/v1/projects/:id` | Fetch project |
| `PATCH` | `/v1/projects/:id` | Update project |
| `GET` | `/v1/projects/by-key/:key` | Fetch by key |
| `POST` | `/v1/projects/:id/opening-brief` | Opening brief |
| `POST` | `/v1/opening-brief` | Workspace or project opening brief |
| `POST` | `/v1/tasks` | Create task |
| `POST` | `/v1/notes` | Create note |
| `GET` | `/v1/entities/:id` | Fetch entity |
| `PATCH` | `/v1/entities/:id` | Update entity |
| `DELETE` | `/v1/entities/:id` | Delete entity |
| `GET` | `/v1/entities/:id/related` | List related entities |
| `POST` | `/v1/entities/:id/links` | Link entity to another |
| `POST` | `/v1/recent` | Recent activity |
| `POST` | `/v1/search` | Hybrid search |
| `POST` | `/v1/tasks/range` | Scheduled, overdue, and backlog tasks |
| `GET` | `/v1/tokens` | List API tokens |
| `POST` | `/v1/tokens` | Create API token |
| `DELETE` | `/v1/tokens/:id` | Revoke API token |
| `GET` | `/health` | Health check |

Schemas: see `/docs` (Swagger UI) or `/docs/json` (OpenAPI 3).

### Example: create a project + write a task + search

```bash
A=http://localhost:4280

PID=$(curl -s -X POST $A/v1/projects \
  -H 'content-type: application/json' \
  -d '{"key":"DEMO","name":"Demo","agentsMd":"ALWAYS run tests"}' \
  | jq -r .id)

curl -s -X POST $A/v1/tasks \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\",\"title\":\"Ship botnote v1\",\"actorKind\":\"human\"}"

curl -s -X POST $A/v1/search \
  -H 'content-type: application/json' \
  -d "{\"query\":\"ship\",\"projectId\":\"$PID\"}"
```

## Plugin

The plugin bundles the MCP server, workflow skills/commands, and a curator
subagent. All workflows route through MCP, so no separate task or memory MCP
setup is required.

### Claude Code

```text
# In Claude Code
/plugin marketplace add jianhuawang/botnote
/plugin install botnote@botnote

# Claude Code will prompt for:
#   botnote_url    -> default http://127.0.0.1:4280 on daemon host
#                     or https://botnote.net on remote machines
#   botnote_token  -> bearer from Settings -> API tokens; skip on loopback
```

Slash commands:

```text
/botnote:today              # today + overdue
/botnote:remember "..."     # capture a note via MCP
/botnote:recall "..."       # hybrid search
/botnote:start-work DEMO    # pickup workflow on a project
/botnote:done               # mark current focus done
/botnote:add-task "..."     # capture a task without starting it
/botnote:show-todo          # workspace task/context summary
```

Plugin distribution lives at
[jianhuawang/botnote](https://github.com/jianhuawang/botnote). The MCP server
inside the plugin uses the URL + token from the install prompt and calls the
`botnote` CLI from PATH. Install the npm package first on non-dev machines.

### Codex

Add the plugin through `/settings -> plugin` in Codex, or add this marketplace
from the public repository without a full source checkout:

```bash
codex plugin marketplace add https://github.com/jianhuawang/botnote.git \
  --sparse .agents/plugins \
  --sparse plugins/botnote

codex plugin add botnote@botnote-plugins
```

For local plugin development, add this marketplace entry to
`.agents/plugins/marketplace.json` in the repo:

```json
{
  "name": "botnote-plugins",
  "interface": { "displayName": "botnote Plugins" },
  "plugins": [
    {
      "name": "botnote",
      "source": { "source": "local", "path": "./plugins/botnote" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

Then install/enable from the Codex plugin UI, or use:

```bash
codex plugin marketplace add .
codex plugin add botnote@botnote-plugins
```

For synced Codex settings, include this in `~/.codex/config.toml` or the
rendered config template:

```toml
[plugins."botnote@botnote-plugins"]
enabled = true

[marketplaces.botnote-plugins]
source_type = "local"
source = "/absolute/path/to/botnote"
```

The Codex plugin starts `./scripts/run-mcp.sh`. It defaults to
`BOTNOTE_URL=http://127.0.0.1:4280`, calls `botnote mcp` from PATH, and falls
back to `npx -y botnote mcp`. Set `BOTNOTE_URL` and `BOTNOTE_TOKEN` only when
using a remote daemon.

## MCP tools

botnote exposes the following tools + resources over stdio.

### Tools

| tool | annotations | what it does |
|---|---|---|
| `opening_brief` | `readOnly` | Project or workspace context bundle (AGENTS.md + pinned notes + open tasks + recent) |
| `search` | `readOnly` | Hybrid retrieval over tasks and notes |
| `recent` | `readOnly` | Recent activity, filterable |
| `list_projects` | `readOnly` | List all projects |
| `get_project` | `readOnly` | Fetch a project by UUID or key, including AGENTS.md |
| `create_project` | — | Create a project |
| `update_project` | `destructive idempotent` | Update project name, color, icon, or AGENTS.md |
| `get_entity` | `readOnly` | Fetch one task or note by UUID |
| `get_entity_by_key` | `readOnly` | Fetch one task or note by human-readable identifier, e.g. `DEMO-12` |
| `create_task` | `idempotent` | Create a structured task |
| `remember` | `idempotent` | Create a free-form note |
| `update_entity` | `destructive` | Mutate task or note fields |
| `related` | `readOnly` | List child notes/tasks for an entity |
| `link` | `idempotent` | Create typed edge between entities |

### Resource

- `botnote://workspace` — workspace overview: project index + most recent activity (text/markdown).

### Direct MCP fallback

Plugin install is preferred. For a raw MCP client, build/install the CLI and
run:

```json
{
  "mcpServers": {
    "botnote": {
      "command": "botnote",
      "args": ["mcp"],
      "env": {
        "BOTNOTE_URL": "http://127.0.0.1:4280"
      }
    }
  }
}
```

## Per-project AGENTS.md

The whole point of botnote's `agents_md` field is to push project-level conventions into agents' working context without per-session prompt engineering.

Recommended structure (< 200 lines, imperative tone):

```markdown
## Critical
- NEVER commit .env or credentials.
- ALWAYS run `pnpm typecheck` before commit.

## Stack
- Node 20 + TypeScript ESM, pnpm.
- Postgres + drizzle ORM.

## Layout
- src/db/, src/service/, src/rest/, src/mcp/

## Rules
- Idempotent writes via `idempotency_key`.
- No console.log outside cli.ts.
```

Each MCP tool call inside a project should be preceded by `opening_brief({ projectId })` so the agent has AGENTS.md + recent context loaded.

## Status

v0 / M1 — complete. See `AGENTS.md` for codebase conventions and the `BOT` project in botnote for ongoing work.

## License

MIT.
