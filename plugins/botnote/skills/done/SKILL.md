---
name: done
description: Mark a botnote task as done and optionally capture closing notes. Use when the user says "done", "finished", "completed", or signals a piece of work is finished.
---

When the user signals something is finished:

1. Find the task if one is clearly available.
   - If they referenced an id like `DEMO-12`, call `mcp__botnote__get_entity_by_key`.
   - Otherwise call `mcp__botnote__search` with `kind: "task"` and a query made from the topic they described.
   - If the current conversation or loaded project context already contains one obvious task, use it even if search is weak.
   - 1 clear hit: proceed.
   - Multiple plausible hits: list them and ask which one.

2. If there is no clear existing task, treat this as a common one-off completion case. Users often say `done` after doing unplanned work, discovering and finishing a small new item, or completing something that was never captured.
   - Ask before writing: `I do not see a matching task. Should I create a completed task for "<short title>"?`
   - Infer `projectId` from the active project/context when obvious; otherwise ask for the project.
   - Use `mcp__botnote__create_task` with `status: "done"` when the user confirms.
   - Use an executable, specific title inferred from the completed work.
   - Do not create a task silently.

3. Mark an existing task done. Call `mcp__botnote__update_entity` with the task's `id` and `status: "done"`.
   - If the task is recurring, completing it may generate the next occurrence. When recurrence matters to the user's next step, call `mcp__botnote__get_recurrence` after completion and mention the next due date if one exists.

4. Capture a closing note only when it adds useful information. If the user described what was done in any detail, call `mcp__botnote__remember` with:
   - `body`: a 1-3 sentence summary of what was done and any gotchas worth remembering.
   - `parentId`: the task's UUID.
   - `tags`: tags from the task plus `done`.
   - `projectId`: same as the task.
   - Prefer capturing decisions, gotchas, and follow-up context that future agents would otherwise have to rediscover.

5. Confirm in one line:

```text
Marked task/<id8> done: <title>
```

If a note was captured, append:

```text
Attached note/<id8>
```

Do not auto-create a closing note when the user only said "done" with no extra detail.
