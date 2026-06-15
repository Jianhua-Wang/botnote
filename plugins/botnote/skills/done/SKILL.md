---
name: done
description: Mark a botnote task as done and optionally capture closing notes. Use when the user says "done", "finished", "completed", or signals a piece of work is finished.
---

When the user signals something is finished:

1. Find the task. If they referenced an id like `DEMO-12`, call `mcp__botnote__get_entity_by_key`. Otherwise call `mcp__botnote__search` with `kind: "task"` and a query made from the topic they described.
   - 0 hits: ask whether to create a new task and mark it done.
   - 1 clear hit: proceed.
   - Multiple plausible hits: list them and ask which one.

2. Mark done. Call `mcp__botnote__update_entity` with the task's `id` and `status: "done"`.

3. Capture a closing note only when it adds useful information. If the user described what was done in any detail, call `mcp__botnote__remember` with:
   - `body`: a 1-3 sentence summary of what was done and any gotchas worth remembering.
   - `parentId`: the task's UUID.
   - `tags`: tags from the task plus `done`.
   - `projectId`: same as the task.

4. Confirm in one line:

```text
Marked task/<id8> done: <title>
```

If a note was captured, append:

```text
Attached note/<id8>
```

Do not auto-create a closing note when the user only said "done" with no extra detail.
