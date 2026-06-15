---
name: show-todo
description: Show Boss's current botnote task/context summary. Use when the user says "show-todo", "$show-todo", "今天有什么", or asks what's on their plate.
---

When Boss asks for today's todo/context:

1. Call `mcp__botnote__opening_brief` with no `projectId`.

2. Render the returned markdown verbatim. It includes workspace pinned notes, open tasks, and recent activity.

3. Add one concise Chinese line at the end if a specific project looks worth opening, for example:

```text
Boss, 要深入某个项目的话可以用 $start-work <KEY>。
```

Do not call Plane or Letheia. botnote is the task and memory source of truth.
