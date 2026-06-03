---
description: Show today's botnote opening brief — workspace-wide pinned notes, open tasks, recent activity. Triggered by /today or the user asking "what's on my plate today" / "今天有什么".
---

When invoked:

1. Call `mcp__botnote__opening_brief` with **no** `projectId` (workspace-wide brief).

2. Render the returned `markdown` field verbatim — the daemon already formats sections (AGENTS.md, Pinned Notes, Open Tasks, Recent Activity).

3. After the brief, scan the rendered output and add a single line: if any project has 3+ open tasks or pinned must-read notes, suggest `/start-work <KEY>` for that project to get its deeper context.

4. Do not call any other tools unless the user follows up. The brief is the deliverable.
