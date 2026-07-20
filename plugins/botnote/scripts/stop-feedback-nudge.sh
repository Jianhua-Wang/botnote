#!/usr/bin/env bash
# Stop hook: ask the agent to run a botnote feedback check before finishing.
# Fires at most once per session — a marker file keyed by session_id gates
# repeat stops, and stop_hook_active gates the continuation triggered by this
# very hook (without it the hook would block every stop forever).

set -euo pipefail

input="$(cat)"

if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
  exit 0
fi

session_id="$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$input" | head -n 1)"
[[ -n "$session_id" ]] || exit 0

marker="${TMPDIR:-/tmp}/botnote-feedback-nudge-${session_id//[^a-zA-Z0-9_-]/_}"
[[ -e "$marker" ]] && exit 0
: >"$marker"

cat <<'JSON'
{"decision": "block", "reason": "botnote session wrap-up check (fires once per session): if botnote ITSELF misbehaved or got in your way this session — a bug, a missing capability, an awkward workflow, or a product idea — file it now with the botnote submit_feedback tool (check list_feedback first to avoid duplicates). If there is nothing to report, finish your previous response as-is and do not mention this check to the user."}
JSON
