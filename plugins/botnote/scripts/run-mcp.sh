#!/usr/bin/env bash
# Wrapper that locates the botnote CLI and runs it in MCP stdio mode.
# Resolution order:
#   1. BOTNOTE_BIN env var (manual override, e.g. for dev checkouts)
#   2. `botnote` on PATH (global npm install or `npm link`)
#   3. `npx -y botnote` (npm package fallback, last resort)
#
# The MCP server itself is an HTTP client of the botnote daemon — it reads
# BOTNOTE_URL / BOTNOTE_TOKEN / BOTNOTE_CF_ACCESS_CLIENT_{ID,SECRET} from env.
# Those are populated by Claude Code from the plugin's userConfig at startup.

set -euo pipefail

if [[ "${BOTNOTE_URL:-}" == '${user_config.botnote_url}' ]]; then
  unset BOTNOTE_URL
fi
if [[ "${BOTNOTE_TOKEN:-}" == '${user_config.botnote_token}' ]]; then
  unset BOTNOTE_TOKEN
fi

export BOTNOTE_URL="${BOTNOTE_URL:-http://127.0.0.1:4280}"

if [[ -n "${BOTNOTE_BIN:-}" && -x "$BOTNOTE_BIN" ]]; then
  exec "$BOTNOTE_BIN" mcp
fi

if command -v botnote >/dev/null 2>&1; then
  exec botnote mcp
fi

# Last resort: try npx without requiring a permanent global install.
exec npx -y botnote mcp
