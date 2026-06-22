#!/usr/bin/env bash
# Wrapper that runs the botnote CLI in MCP stdio mode.
# Resolution order:
#   1. BOTNOTE_BIN env var (manual override, e.g. for dev checkouts)
#   2. `botnote` on PATH only when it matches this plugin version
#   3. `npx -y botnote@<plugin-version>` (normal plugin install path)
#   4. `botnote` on PATH as a last-resort offline fallback
#
# The MCP server itself is an HTTP client of the botnote daemon — it reads
# BOTNOTE_URL / BOTNOTE_TOKEN / BOTNOTE_CF_ACCESS_CLIENT_{ID,SECRET} from env.
# Those are populated by Claude Code from the plugin's userConfig at startup.

set -euo pipefail

plugin_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_version="$(node -e "const fs=require('fs'); const path=require('path'); for (const rel of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) { try { const c=JSON.parse(fs.readFileSync(path.join(process.argv[1], rel), 'utf8')); if (typeof c.version === 'string') { process.stdout.write(c.version); process.exit(0); } } catch {} }" "$plugin_root" 2>/dev/null || true)"

if [[ "${BOTNOTE_URL:-}" == '${user_config.botnote_url}' ]]; then
  unset BOTNOTE_URL
fi
if [[ "${BOTNOTE_TOKEN:-}" == '${user_config.botnote_token}' ]]; then
  unset BOTNOTE_TOKEN
fi

config_path="${XDG_CONFIG_HOME:-$HOME/.config}/botnote/config.json"
if [[ -f "$config_path" ]]; then
  if [[ -z "${BOTNOTE_URL:-}" ]]; then
    cfg_url="$(node -e "const fs=require('fs'); try { const c=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (typeof c.baseUrl === 'string') process.stdout.write(c.baseUrl); } catch {}" "$config_path" 2>/dev/null || true)"
    if [[ -n "$cfg_url" ]]; then
      export BOTNOTE_URL="$cfg_url"
    fi
  fi
  if [[ -z "${BOTNOTE_TOKEN:-}" ]]; then
    cfg_token="$(node -e "const fs=require('fs'); try { const c=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (typeof c.token === 'string') process.stdout.write(c.token); } catch {}" "$config_path" 2>/dev/null || true)"
    if [[ -n "$cfg_token" ]]; then
      export BOTNOTE_TOKEN="$cfg_token"
    fi
  fi
fi

export BOTNOTE_URL="${BOTNOTE_URL:-https://botnote.net}"

if [[ -n "${BOTNOTE_BIN:-}" && -x "$BOTNOTE_BIN" ]]; then
  exec "$BOTNOTE_BIN" mcp
fi

if command -v botnote >/dev/null 2>&1; then
  cli_version="$(botnote --version 2>/dev/null || botnote version 2>/dev/null || true)"
  if [[ -n "$plugin_version" && "$cli_version" == "$plugin_version" ]]; then
    exec botnote mcp
  fi
fi

if command -v npx >/dev/null 2>&1; then
  if [[ -n "$plugin_version" ]]; then
    if npx -y "botnote@$plugin_version" mcp; then
      exit 0
    fi
    echo "botnote plugin $plugin_version could not start via npx botnote@$plugin_version; trying PATH fallback" >&2
  else
    if npx -y botnote mcp; then
      exit 0
    fi
    echo "botnote plugin could not start via npx botnote; trying PATH fallback" >&2
  fi
fi

if command -v botnote >/dev/null 2>&1; then
  echo "botnote plugin $plugin_version falling back to PATH botnote $(botnote --version 2>/dev/null || true)" >&2
  exec botnote mcp
fi

echo "botnote plugin could not find BOTNOTE_BIN, npx, or botnote on PATH" >&2
exit 127
