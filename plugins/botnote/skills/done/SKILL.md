---
name: done
description: Mark a botnote task as done and optionally capture closing notes. Use when the user says "done", "完成了", "搞定了", "xxx 做好了", or signals a piece of work is finished.
---

When the user signals something is finished:

1. **Find the task**. If they referenced an id (like `BOT-12`), call `mcp__botnote__get_entity_by_key`. Otherwise call `mcp__botnote__search` with `kind: "task"` and a query made from the topic they described.
   - 0 hits: ask "botnote 里搜不到对应的 task — 是新工作吗？要新建并标完成吗？" (then `mcp__botnote__create_task` with `status: "done"`).
   - 1 clear hit: proceed.
   - Multiple plausible hits: list them and ask which.

2. **Mark done**. Call `mcp__botnote__update_entity` with the task's `id` and `status: "done"`.

3. **Capture a closing note (optional)**. If the user described what was done in any detail (more than just "搞定"), call `mcp__botnote__remember` with:
   - `body`: a 1-3 sentence summary of what was actually done + any gotchas worth remembering.
   - `parentId`: the task's UUID (so the note links to the task).
   - `tags`: tags from the task plus `"done"`.
   - `projectId`: same as the task.

4. **Confirm** in one line:
   ```
   ✓ Marked task/<id8> done · <title>
   ```
   If a note was captured, append:
   ```
   ✓ Note note/<id8> attached
   ```

Important: do not auto-create a closing note when the user only said "done" / "搞定" with no extra detail. The note has to add information beyond the task's existing body, or it's noise.
