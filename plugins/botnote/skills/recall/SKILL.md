---
name: recall
description: Search botnote for stored notes and tasks. Use when the user says "find", "search", "recall", "do you remember", or asks what was stored about a topic.
---

When the user asks to recall something:

1. Extract the search subject from their message. Strip filler words and keep the actual concept.

2. Call `mcp__botnote__search` with:
   - `query`: the cleaned search string.
   - `kind`: `"task"` if they asked for tasks/todos; `"note"` if they asked for notes/memory. Otherwise omit it.
   - `projectId`: include only if they specified a project.
   - `limit`: 10 by default; use 20 if they ask for all or more.

3. Render the top hits as a numbered markdown list. For each hit include:
   - score
   - `kind/id` using the first 8 characters of the UUID
   - title
   - one-line body excerpt

4. After the list, offer next actions in one short line: open by id, mark a task done, or refine the search.

If there are no hits, report `no matches for "<query>"` and suggest broadening the terms or checking a different project.
