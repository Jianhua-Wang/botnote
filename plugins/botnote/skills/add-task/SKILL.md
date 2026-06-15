---
name: add-task
description: Capture a botnote task without starting it. Use when the user says "add-task", "$add-task", or asks to capture a backlog item.
---

When the user wants to add a task:

1. Parse the task description. If it is missing, ask what should be captured.

2. Resolve the project.
   - If the user names a project key like `BOT` or `OPS`, call `mcp__botnote__get_project` with `key`.
   - If the project is unclear, call `mcp__botnote__list_projects` and ask the user to pick.
   - Do not invent a new project unless the user explicitly asks for one.

3. Infer task fields.
   - `title`: concise executable verb phrase. Avoid vague names like `Handle stuff`.
   - `priority`: ASAP/blocker -> `urgent`; this week -> `high`; soon -> `medium`; backlog -> `low`; otherwise `none`.
   - `dueAt`: include only when the user mentions a date. For date-only intents, use noon UTC for that date.
   - `tags`: 2-4 short lowercase kebab-case tokens.

4. Call `mcp__botnote__create_task` with `status: "open"`, `actorKind: "agent"`, and the resolved fields.

5. Confirm in one concise line:

```text
Added {KEY-seq or task/id8}: "{title}" in {project} [{priority}, due {date or "-"}]
```

botnote is the task source of truth for this workflow.
