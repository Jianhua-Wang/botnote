---
name: start-work
description: Load full context for a specific botnote project before working on it. Triggered by /start-work <KEY> or when the user asks to work on a project.
argument-hint: <project-key>
---

When invoked with a project key:

1. Call `mcp__botnote__get_project` with `key: "<KEY>"` to resolve the project's UUID and confirm it exists.
   - If the project is not found, report `unknown project: <KEY>` and call `mcp__botnote__list_projects` to show available projects.

2. Call `mcp__botnote__opening_brief` with the resolved `projectId`.

3. Render the brief's `markdown` field verbatim. It includes:
   - AGENTS.md project conventions
   - pinned notes
   - open tasks
   - recent activity

4. After the brief, ask the user what they want to do. Do not auto-pick a task.

This skill loads context; it does not commit to work by itself.
