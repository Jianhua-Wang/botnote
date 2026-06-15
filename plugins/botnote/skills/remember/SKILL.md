---
name: remember
description: Capture a free-form note into botnote. Use whenever the user says "remember X", "store this", "save this for later", or otherwise indicates something should be persisted.
---

When the user wants to remember something:

1. Call `mcp__botnote__remember` with:
   - `body`: the content to store. Markdown and multi-line text are allowed.
   - `title`: optional. Skip it when the body's first line is already a clear label. Provide it when the body is long-form.
   - `tags`: short kebab-case strings inferred from the content, usually 2-4 tags.
   - `projectId`: include only if the user explicitly mentioned a project or it is clear from the current context.
   - `pinned`: `true` only when the user says this should be pinned, always shown, or treated as must-read project context.
   - `parentId`: include when the note is a follow-up on a specific task.

2. Report back in one line:

```text
Remembered note/<id8>: <displayTitle>
```

Do not call `mcp__botnote__remember` multiple times for one piece of content. If the user dictates several distinct items in one message, ask whether they want one combined note or one note per item.
