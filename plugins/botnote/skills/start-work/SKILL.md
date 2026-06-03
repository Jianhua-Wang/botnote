---
description: Load full context for a specific botnote project before working on it. Triggered by /start-work <KEY> or the user saying "let's work on <project>" / "切到 X 项目".
argument-hint: <project-key>
---

When invoked (the user will pass a project key like `BOT`, `OTHE`, `MCP2`):

1. Call `mcp__botnote__get_project` with `key: "<KEY>"` to resolve the project's UUID and confirm it exists.
   - If the project is not found, report `unknown project: <KEY>` and call `mcp__botnote__list_projects` to show what's available.

2. Call `mcp__botnote__opening_brief` with the resolved `projectId`.

3. Render the brief's `markdown` field verbatim. It includes:
   - AGENTS.md (the project's conventions — **follow these**)
   - Pinned notes (must-read context)
   - Open tasks
   - Recent activity

4. After the brief, ask the user what they want to do — do **not** auto-pick a task. Examples: "Continue where we left off?", "Work on a specific task?", "Just browsing?".

This skill is for **loading context**, not for committing to work. Wait for the user's direction.
