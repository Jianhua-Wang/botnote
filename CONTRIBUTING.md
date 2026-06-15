# Contributing

Thanks for helping improve botnote.

## Development setup

```bash
pnpm install
docker compose up -d
DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote pnpm db:migrate
DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote pnpm dev
```

## Tests

Never run tests against a live botnote database. Tests require
`BOTNOTE_TEST_DATABASE_URL`, and the database name must contain `test`.

```bash
docker exec botnote-postgres createdb -U botnote botnote_test || true
DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote_test pnpm db:migrate
BOTNOTE_TEST_DATABASE_URL=postgres://botnote:botnote@127.0.0.1:55434/botnote_test pnpm test
```

Before opening a pull request, run:

```bash
pnpm typecheck
pnpm --dir web typecheck
pnpm build
```

## Code style

- Keep REST and MCP transports thin; shared behavior belongs in `src/service/`.
- Use idempotent migrations. Prefer `IF NOT EXISTS` and `CREATE OR REPLACE`
  where applicable.
- Do not commit `.env`, database URLs with real credentials, API keys, or
  generated local build output.
- Keep docs and code in English.
