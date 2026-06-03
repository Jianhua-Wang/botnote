---
description: Search botnote for stored notes and tasks. Use when the user says "find", "search", "recall", "翻一下", "我之前说过", "what did I store about X".
---

When the user asks to recall something:

1. Extract the search subject from their message — strip filler words like "我之前关于" or "do you remember". The query should be the actual concept.

2. Call `mcp__botnote__search` with:
   - `query`: the cleaned search string.
   - `kind`: `"task"` if they said "task/todo/任务", `"note"` if they said "note/memory/笔记/记忆". Otherwise omit (search both).
   - `projectId`: include only if they specified a project.
   - `limit`: 10 by default; bump to 20 if they say "all of them" or "more".

3. Render the top hits as a numbered markdown list. For each:
   - score (`0.xxxx`)
   - `kind/id` (first 8 chars of UUID)
   - title (use the displayTitle from the result text — the MCP tool already does this)
   - one-line body excerpt (first 200 chars from result)

4. After the list, offer next actions in one short line: "Open by id, mark a task done, or refine the search?"

If 0 hits: report `no matches for "<query>"` and suggest the user broaden terms or check a different project.
