---
name: add-task
description: Capture a botnote task without starting it. Use when the user says "add-task", "$add-task", "加个任务", or asks to capture a backlog item.
---

When Boss wants to add a task:

1. Parse the task description. If it is missing, ask `Boss, 要记什么？`

2. Resolve the project.
   - If Boss names a project key like `BOT` or `OTHE`, call `mcp__botnote__get_project` with `key`.
   - If the project is unclear, call `mcp__botnote__list_projects` and ask Boss to pick.
   - Use `OTHE` only for obvious one-off / miscellaneous work.

3. Infer task fields.
   - `title`: concise executable verb phrase. Do not create vague names like `处理 xxx`.
   - `priority`: ASAP/紧急/blocker -> `urgent`; 本周/this week -> `high`; 近期/soon -> `medium`; backlog/待办 -> `low`; otherwise `none`.
   - `dueAt`: include only when Boss mentions a date. For date-only intents, use noon UTC for that date.
   - `tags`: 2-4 short lowercase kebab-case tokens.

4. Call `mcp__botnote__create_task` with `status: "open"`, `actorKind: "agent"`, and the resolved fields.

5. Confirm in one concise Chinese line:

```text
✓ 已加 {KEY-seq or task/id8} "{title}" → {project} [{priority}, due {date or "—"}]
```

Do not call Plane or Letheia. botnote is the task source of truth.
