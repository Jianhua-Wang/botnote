---
description: Capture a free-form note into botnote. Use whenever the user says "remember X", "记下 X", "store this", "save this for later", or otherwise indicates something should be persisted.
---

When the user wants to remember something:

1. Call `mcp__botnote__remember` with:
   - `body`: the content to store (multi-line OK; markdown is preserved).
   - `title`: optional. Skip when the body's first line is already a clear label. Provide when the body is long-form.
   - `tags`: array of short kebab-case strings inferred from the content (e.g. `["postgres", "performance"]`). Max ~4.
   - `projectId`: include **only** if the user explicitly mentioned a project or you can infer it from the conversation's current working directory. Otherwise omit — workspace-scope notes are fine.
   - `pinned`: `true` only when the user said "pin this" / "always show me this" / "must-read for this project". Pinned notes appear in every opening brief — use sparingly.
   - `parentId`: include when the note is a follow-up on a specific task — pass the task's UUID.

2. Report back as one line: `✓ Remembered note/XXXXXXXX · <displayTitle>` (use the first 8 chars of the returned UUID).

Do not call `mcp__botnote__remember` multiple times for one piece of content. If the user dictates several distinct items in one message, ask whether they want one combined note or one per item.
