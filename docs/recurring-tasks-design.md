# Recurring Tasks Design

Date: 2026-06-23
Status: draft
Task: BOT-44

## Summary

Botnote should support recurring tasks by keeping task occurrences as normal
`entities.kind = 'task'` rows and adding a small recurrence layer that knows how
to create the next occurrence. This preserves the current Today, Calendar,
Inbox, search, notes, completion history, and MCP behavior without introducing a
parallel virtual-task system.

The recommended model is:

- Use a recurrence rule table keyed to a series root task.
- Store recurrence rules as iCalendar RRULE strings plus botnote-specific
  scheduling metadata.
- Treat each occurrence as a real task entity.
- Generate only one active future occurrence by default.
- Generate the next occurrence when the current occurrence is completed or
  explicitly skipped.
- Use the existing `status`, `dueAt`, `completedAt`, `priority`, `tags`,
  `parentId`, and `metadata` fields for occurrence behavior.

This is close to Apple Reminders' mental model: repeating reminders are
configured from a dated reminder, custom repeats support common frequencies, and
future scheduled instances stay behind the current instance rather than flooding
the task list.

## Apple Reminders Reference Points

Apple Reminders supports date-only reminders, timed reminders, early reminders,
repeat schedules, and end-repeat dates. Its custom repeat editor supports
hourly, daily, weekly, monthly, and yearly frequencies; weekly rules can select
weekdays; monthly and yearly rules can use either exact dates or positional
patterns such as the last weekday or the third Thursday.

Apple also documents two important display behaviors:

- Scheduled reminders can appear in Calendar; all-day reminders are shown in
  the all-day area, while timed reminders appear at their scheduled time.
- Repeating reminders do not make every future instance fully actionable at
  once. Future instances are dimmed or hidden behind the current one, and the
  next repeat date appears when the current repeating reminder is completed.

Sources:

- https://support.apple.com/guide/reminders/add-dates-or-locations-to-reminders-remnd4b206fb/mac
- https://support.apple.com/guide/reminders/add-or-change-reminders-remndc729e28/mac
- https://support.apple.com/guide/iphone/use-reminders-iph14f1d32a5/ios
- https://support.apple.com/guide/reminders/remn2ff3b312/mac
- https://support.apple.com/guide/calendar/set-up-or-delete-a-repeating-event-icl1018/mac

## Goals

- Create recurring meetings, routines, check-ins, maintenance work, and long-run
  tasks without manually recreating them.
- Keep each actionable occurrence small and completeable like any other task.
- Preserve a real history of completed occurrences.
- Avoid cluttering Today and Calendar with many generated future rows.
- Support simple presets first and a custom editor for advanced schedules.
- Make agent/CLI creation explicit and safe.
- Keep REST and MCP behavior shared through the service layer.

## Non-goals

- Do not implement a full calendar event system with attendees, travel time, or
  availability.
- Do not implement location-based reminders in this iteration.
- Do not generate an unbounded set of future task rows.
- Do not replace `dueAt`; recurrence should build on the existing task date
  model.

## User Semantics

### Series

A recurring task series is the conceptual group: "weekly lab meeting", "review
finances every month", "stretch every 2 days", or "renew passport every 10
years".

The first task the user creates is both the first occurrence and the series
root. The root remains a normal task. This avoids hidden template rows and keeps
existing task links useful.

### Occurrence

Each occurrence is a normal `task` entity. It has its own:

- `dueAt`
- `status`
- `completedAt`
- body and notes
- priority and tags
- sequence id

The occurrence stores recurrence metadata pointing back to its series and rule.
Task views can render it without special casing, because it is still a normal
task.

### Completion

When a recurring occurrence is marked `done`, botnote should:

1. Mark the occurrence done and set `completedAt`.
2. Compute the next due date from the recurrence rule.
3. If the rule still has remaining occurrences, create one new open task for
   the next occurrence.
4. Link the new occurrence to the same recurrence rule and series.

This should happen in one service-layer transaction so the task cannot be marked
done without the next occurrence being considered.

### Skipping

Recurring tasks need an explicit "Skip occurrence" action. Skipping means "do
not complete this occurrence, but move the series forward." It should:

1. Mark the current occurrence as `rejected` or record a recurrence exception.
2. Create the next occurrence if the rule continues.

For the UI, "Cancel task" and "Skip this occurrence" should be separate actions
for recurring tasks. Cancel can mean just this task; Stop series disables future
generation.

### Ending

A recurrence rule can end by:

- explicit user action: Stop series
- an RRULE `UNTIL`
- an RRULE `COUNT`
- disabling the rule

When the series ends, existing occurrences remain as historical tasks.

## Schedule Modes

Botnote should support two repeat anchors.

### Scheduled Repeat

Default. The next due date is based on the scheduled due date of the current
occurrence, not on when the user completed it.

Example: a weekly meeting due every Monday. If this Monday's occurrence is
completed on Tuesday, the next occurrence should still be next Monday.

If a task is overdue by multiple intervals, botnote should create the first
future occurrence after completion time rather than creating several already
overdue catch-up tasks.

### Repeat After Completion

Advanced. The next due date is based on `completedAt`.

Example: "replace toothbrush every 3 months after I actually replace it." If
the task is completed late, the next one moves relative to the late completion.

Apple Reminders does not expose this as a first-class mode, but it is useful for
maintenance routines and long-term personal tasks. Botnote should include it as
an advanced option because the user explicitly mentioned long-running recurring
work.

## Recurrence Expression

Use an existing RRULE implementation rather than hand-rolling recurrence math.
The recurrence domain has too many edge cases: month length, positional weekday
rules, yearly rules, count/until endings, and timezone transitions.

Recommended dependency:

- `rrule`

Botnote should store the canonical recurrence as an RRULE string, plus metadata
that RRULE does not fully cover for botnote behavior.

Examples:

```text
FREQ=DAILY;INTERVAL=1
FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR
FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1,15
FREQ=MONTHLY;INTERVAL=1;BYDAY=FR;BYSETPOS=-1
FREQ=YEARLY;INTERVAL=1;BYMONTH=6;BYMONTHDAY=23
```

## Data Model

Keep `entities` as the single task/note table. Add recurrence metadata around
it; do not split tasks into a separate task table.

### `recurrence_rules`

```sql
CREATE TABLE recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  current_occurrence_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  rrule text NOT NULL,
  dtstart timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  all_day boolean NOT NULL DEFAULT true,
  anchor text NOT NULL DEFAULT 'scheduled',
  max_instances_ahead integer NOT NULL DEFAULT 1,
  generated_count integer NOT NULL DEFAULT 1,
  last_occurrence_at timestamptz,
  next_occurrence_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Constraints:

```sql
CREATE UNIQUE INDEX recurrence_rules_series_idx
  ON recurrence_rules(series_id);

CREATE INDEX recurrence_rules_current_occurrence_idx
  ON recurrence_rules(current_occurrence_id);

CREATE INDEX recurrence_rules_next_occurrence_idx
  ON recurrence_rules(next_occurrence_at)
  WHERE enabled = true;
```

`anchor` values:

- `scheduled`
- `completion`

`timezone` should be an IANA timezone. `all_day=true` means recurrence should be
computed as a local calendar date and converted to botnote's current date-only
storage convention at the boundary. Existing exact-midnight UTC normalization to
noon UTC should remain for date-only inputs.

### `recurrence_exceptions`

This can be added in the first implementation if small enough, or deferred until
editing support needs it.

```sql
CREATE TABLE recurrence_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurrence_at timestamptz NOT NULL,
  action text NOT NULL,
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`action` values:

- `skipped`
- `cancelled`
- `modified`

### Entity Metadata

Each generated occurrence should also carry a small metadata marker so API
responses are self-describing without joining:

```json
{
  "recurrence": {
    "ruleId": "uuid",
    "seriesId": "uuid",
    "role": "occurrence",
    "occurrenceAt": "2026-06-29T12:00:00.000Z",
    "occurrenceIndex": 3
  }
}
```

The series root can also be the first occurrence, so it can have the same
metadata. The recurrence rule remains the source of truth.

## Service API

Add a new service module, for example `src/service/recurrence.ts`.

Core operations:

- `createRecurrenceRule(db, taskId, input)`
- `updateRecurrenceRule(db, ruleId, input)`
- `getRecurrenceRuleForTask(db, taskId)`
- `completeOccurrence(db, taskId, actorKind)`
- `skipOccurrence(db, taskId, actorKind)`
- `stopRecurrence(db, ruleId)`
- `generateNextOccurrence(db, rule, currentOccurrence, reason)`

`entities.update()` currently owns status transitions. To keep recurrence logic
centralized, it should call into recurrence when a task transitions into `done`.
The call should happen inside a transaction. If that makes `entities.update()`
too large, introduce an application-level `completeTask()` service and route
task completion through it from REST, MCP, CLI, and UI.

For idempotency, generated occurrences should use deterministic keys:

```text
recurrence:<rule-id>:<occurrence-at-iso>
```

This prevents duplicate generation if a completion request is retried.

## REST API

Suggested endpoints:

```text
POST   /v1/tasks/:id/recurrence
GET    /v1/tasks/:id/recurrence
PATCH  /v1/recurrences/:id
POST   /v1/tasks/:id/skip-occurrence
POST   /v1/recurrences/:id/stop
```

The existing `PATCH /v1/entities/:id` can continue to accept `status: "done"`.
Internally, completing a recurring occurrence should generate the next
occurrence. A dedicated `POST /v1/tasks/:id/complete` endpoint would be cleaner
later, but it is not required for the first implementation.

Create recurrence input:

```ts
{
  rrule: string;
  dtstart?: string;
  timezone?: string;
  allDay?: boolean;
  anchor?: "scheduled" | "completion";
}
```

Preset inputs can be converted to RRULE server-side:

```ts
{
  preset: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  byWeekday?: string[];
  byMonthDay?: number[];
  bySetPos?: number;
  byMonth?: number[];
  endAt?: string | null;
  count?: number | null;
}
```

## MCP and Agent Behavior

Agents should create recurring tasks only when the user explicitly asks for a
repeat. They should not infer recurrence from vague wording like "later" or
"ongoing" unless the user states a cadence.

MCP additions:

- `configure_recurrence`
- `get_recurrence`
- `skip_occurrence`
- `stop_recurrence`

`create_task` can optionally accept a simple recurrence object, but a dedicated
tool is clearer and safer. It lets agents create the task first, confirm the
due date/project/title, then attach recurrence.

Tool descriptions should remind agents:

- A recurring task still needs a concrete first due date.
- Keep the task title as an executable occurrence, not as a broad project.
- Prefer `scheduled` anchor for meetings and calendar-like work.
- Prefer `completion` anchor for maintenance routines.

## CLI

Add flags to `botnote task`:

```text
botnote task "Attend weekly lab meeting" \
  --project BOT \
  --due 2026-06-29 \
  --repeat weekly \
  --on mon \
  --until 2026-12-31

botnote task "Replace toothbrush" \
  --project OTHE \
  --due 2026-07-01 \
  --repeat monthly \
  --interval 3 \
  --anchor completion
```

Add commands:

```text
botnote recurrence BOT-44
botnote skip BOT-44
botnote stop-recurrence BOT-44
```

## UI

### Quick Create

Keep the default compact. Add a collapsed Repeat control under Due:

- Repeat: None, Daily, Weekly, Monthly, Yearly, Custom
- End: Never, On date, After N occurrences
- Advanced: Repeat from scheduled date or completion date

Only show custom controls when Repeat is not None.

### Task Detail Drawer

Add a Recurrence row under Due:

- Not repeating
- Every day
- Every week on Mon
- Every 3 months after completion
- Custom...

For recurring occurrences, show actions:

- Complete occurrence
- Skip occurrence
- Edit recurrence
- Stop series

When editing a recurring occurrence, ask whether the change applies to:

- This occurrence only
- Future occurrences
- Entire series

The first implementation can support only "this occurrence" for task fields and
"entire series" for recurrence settings. "Future occurrences" can follow after
exceptions are in place.

### Today and Calendar

Only generated occurrences appear. Do not render virtual future ghosts in v1.
This keeps Today and Calendar predictable and reuses the current `tasksRange`
logic.

Later, Calendar can optionally preview future recurrences as dimmed virtual
items, but those should not be actionable until materialized.

## Recurrence Calculation Rules

1. Require a first due date before recurrence can be enabled.
2. Preserve all-day semantics by calculating in the rule timezone.
3. Store all generated occurrence due dates as real `dueAt` values.
4. For `scheduled` anchor, compute after the current occurrence's scheduled
   `dueAt`, then advance to the first occurrence after `now` if needed.
5. For `completion` anchor, compute after `completedAt`.
6. Never generate more than `max_instances_ahead` active occurrences in v1.
7. If the rule is exhausted, mark `enabled=false` and set `ended_at`.

## Query Behavior

Because occurrences are normal tasks:

- `tasksRange()` should continue to work with no virtual rows.
- Search sees recurring occurrences as individual completed/open work.
- Related notes can attach to the specific occurrence.
- Opening briefs can show the current active occurrence.
- Inbox remains "no due date"; recurring tasks require due dates and should not
  land there unless recurrence is disabled and dueAt is cleared.

## Tests

Service tests should cover:

- Creating a recurrence rule on a task with dueAt.
- Rejecting recurrence rule creation on a task without dueAt.
- Completing a weekly occurrence creates exactly one next occurrence.
- Retrying completion does not duplicate the generated occurrence.
- Scheduled anchor preserves cadence when completion is late.
- Completion anchor shifts cadence based on completion time.
- Count and until endings disable the rule.
- Skip occurrence creates the next occurrence without marking the skipped row
  done.
- Cancel/stop series disables future generation.
- `tasksRange()` sees generated occurrences as normal tasks.

E2E smoke should cover:

- REST create task -> configure recurrence -> complete -> next task appears.
- MCP configure recurrence -> complete via MCP update -> next task appears.

## Implementation Plan

1. Add migration `0017_recurrence_rules.sql` and Drizzle schema.
2. Add recurrence input schemas and service functions.
3. Add RRULE dependency and a small adapter for botnote date-only semantics.
4. Wire completion generation into the service layer.
5. Add REST endpoints.
6. Add MCP tools.
7. Add CLI flags and commands.
8. Add UI controls in Quick Create and Task Detail Drawer.
9. Add tests and update plugin skill instructions.

## Open Decisions

- Whether to add `POST /v1/tasks/:id/complete` now or keep using
  `PATCH /v1/entities/:id`.
- Whether exceptions ship in v1 or wait for "edit this occurrence only".
- Whether Calendar should preview future virtual occurrences in v1.
- Whether the default timezone should be server timezone, browser timezone, or
  a persisted user setting. The best long-term answer is a settings-level user
  timezone.
