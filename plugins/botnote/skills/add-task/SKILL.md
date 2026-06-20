---
name: add-task
description: Capture a small botnote task without starting it. Use when the user says "add-task", "$add-task", or asks to capture an inbox item.
---

When the user wants to add a task:

1. Parse the task description. If it is missing, ask what should be captured.

2. Resolve the project.
   - If the user names a project key like `BOT` or `OPS`, call `mcp__botnote__get_project` with `key`.
   - If the user does not specify a project, call `mcp__botnote__list_projects` and infer the best project from the task text, active conversation, project keys/names, and recent context.
   - Suggest the best project first with a brief reason, then ask for confirmation. If confidence is low, show 2-3 candidates with the recommended one first.
   - Do not dump the full project list as the first response.
   - Do not invent a new project unless the user explicitly asks for one.

3. Keep task scope small.
   - A task should be a concrete work unit that can be completed in one focused session, usually under about one hour.
   - If the user asks for broad, multi-hour, multi-day, or multi-deliverable work, propose a split into smaller executable tasks before creating anything.
   - After the user agrees, create the small tasks one by one with distinct titles, tags, and due dates where appropriate.

4. Infer task fields.
   - `title`: concise executable verb phrase. Avoid vague names like `Handle stuff`.
   - `priority`: ASAP/blocker -> `urgent`; this week -> `high`; soon -> `medium`; backlog -> `low`; otherwise `none`.
   - `dueAt`: include only when the user mentions or clearly implies a date. For date-only intents, use noon UTC for that date.
   - Before setting `dueAt`, consider priority and visible daily workload from the opening brief, active context, or available task list. If that day already looks full enough, suggest a later date or leave `dueAt` empty and explain why.
   - `tags`: 2-4 short lowercase kebab-case tokens.

5. Call `mcp__botnote__create_task` with `status: "open"`, `actorKind: "agent"`, and the resolved fields.

6. Confirm in one concise line:

```text
Added {KEY-seq or task/id8}: "{title}" in {project} [{priority}, due {date or "-"}]
```

botnote is the task source of truth for this workflow.
