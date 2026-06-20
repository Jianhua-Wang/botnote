---
name: today
description: "Show today's botnote opening brief: workspace-wide pinned notes, open tasks, and recent activity. Triggered by /today or when the user asks what's on their plate today."
---

When invoked:

1. Call `mcp__botnote__opening_brief` with no `projectId`.

2. Render the returned `markdown` field verbatim. The daemon formats sections such as AGENTS.md, Pinned Notes, Open Tasks, and Recent Activity.

3. After the brief, add a single line if a project looks worth opening, suggesting `/start-work <KEY>` for deeper context.

4. If the user continues into project work, use recall/search for prior context and remember durable decisions, gotchas, and handoff notes as the work progresses.

5. Do not call other tools unless the user follows up. The brief is the deliverable.
