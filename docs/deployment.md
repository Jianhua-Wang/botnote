# Deployment — botnote.net

How the public site at <https://botnote.net> is served, and how to ship new
code to it. The whole stack runs on this Mac (macOS / launchd); there is no
remote server.

> Secrets (daemon password, database URL) live **only** in the launchd plist
> `~/Library/LaunchAgents/com.botnote.daemon.plist`. Never copy their real
> values into this repo.

## Architecture

```
Internet
   │  https://botnote.net
   ▼
Cloudflare Tunnel  (cloudflared, tunnel "botnote" = 8e0fbf02-7774-428c-8bcf-806faac8c385)
   │  ingress: botnote.net → http://localhost:4280
   ▼
botnote daemon  (node dist/cli.js, port 4280)
   ├─ REST API           (Fastify)
   ├─ static web UI      (@fastify/static, served from web/dist)
   └─ migrations on boot (src/cli.ts → migrate())
   │
   ▼
Postgres  (127.0.0.1:55434, database "botnote")
```

The tunnel config is `~/.cloudflared/config.yml`. It also maps
`finance.botnote.net → localhost:8080`, which is a **separate** app (not
botnote). Anything else returns 404.

## Processes (launchd user agents)

All four are in `~/Library/LaunchAgents/`. Check state with
`launchctl list | grep -iE 'botnote|cloudflared'`.

| Label | What it runs | When |
|-------|--------------|------|
| `com.botnote.daemon` | `node /Users/jianhua/botnote/dist/cli.js` (port 4280) | RunAtLoad + KeepAlive |
| `com.cloudflared.botnote` | `cloudflared tunnel --config ~/.cloudflared/config.yml run botnote` | RunAtLoad + KeepAlive |
| `com.botnote.backup` | `/Users/jianhua/botnote-backups/backup.sh` | daily 03:00 |
| `com.botnote.logrotate` | `~/.cloudflared/rotate-logs.sh` | daily 03:05 |

### Daemon config (set as env in `com.botnote.daemon.plist`)

| Var | Value |
|-----|-------|
| `BOTNOTE_HOST` | `0.0.0.0` |
| `BOTNOTE_PORT` | `4280` |
| `BOTNOTE_REQUIRE_AUTH` | `1` |
| `BOTNOTE_PASSWORD` | *(secret — in plist)* |
| `DATABASE_URL` | `postgres://botnote:***@127.0.0.1:55434/botnote` *(password in plist)* |
| `NODE_ENV` | `production` |
| `WorkingDirectory` | `/Users/jianhua/botnote` |

Node binary: `/Users/jianhua/.hermes/node/bin/node`.
Daemon logs: `~/Library/Logs/botnote-daemon.log` (+ `.err.log`).
Tunnel logs: `~/.cloudflared/stderr.log`.

## Deploy a new version

Run from `/Users/jianhua/botnote` on the `main` branch.

```bash
cd /Users/jianhua/botnote
git checkout main && git pull          # or merge the feature branch

pnpm install                           # only if dependencies changed
pnpm build                             # clean + web build (web/dist) + server build (dist/cli.js)

# Restart the daemon — migrations in src/db/migrations run automatically on boot.
launchctl kickstart -k gui/$(id -u)/com.botnote.daemon

# Verify
curl -fsS http://localhost:4280/health && echo OK
# then load https://botnote.net in a browser
```

`pnpm build` = `pnpm clean && pnpm --dir web build && pnpm build:server`. The
web build runs `tsc -b`, so it **fails if any web source has type errors** —
make sure the working tree is type-clean (no half-finished WIP) before building.

The Cloudflare tunnel does **not** need restarting for a code deploy; it only
proxies to port 4280.

## Operations

```bash
# Status
launchctl list | grep -iE 'botnote|cloudflared'

# Restart daemon / tunnel
launchctl kickstart -k gui/$(id -u)/com.botnote.daemon
launchctl kickstart -k gui/$(id -u)/com.cloudflared.botnote

# Stop / start the daemon
launchctl bootout   gui/$(id -u)/com.botnote.daemon
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.botnote.daemon.plist

# Tail logs
tail -f ~/Library/Logs/botnote-daemon.log
tail -f ~/.cloudflared/stderr.log

# Reload after editing a plist
launchctl bootout   gui/$(id -u)/com.botnote.daemon
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.botnote.daemon.plist
```

## Database & backups

- Postgres listens on `127.0.0.1:55434`, database `botnote`.
- Schema is applied by the migration runner on every daemon start
  (`src/db/migrate.ts`, tracked in the `_migrations` table). Manual run:
  `pnpm db:migrate`.
- Nightly dump via `com.botnote.backup` → `/Users/jianhua/botnote-backups/`
  (logs: `launchd.out` / `launchd.err` there).
