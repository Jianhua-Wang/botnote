/**
 * Helpers for threading the recurrence edit scope ("this occurrence only" vs
 * "this and future") into an entity update payload.
 *
 * When a user edits a recurring occurrence's content fields, the chosen scope
 * must accompany the PATCH so the server can decide whether to isolate the edit
 * to the current occurrence (via a 'modified' recurrence exception) or let it
 * propagate to future occurrences. Non-content edits (status, dueAt, pinned…)
 * never carry a scope — they are not copied forward by the generation path.
 */

export type RecurrenceScope = "this" | "future";

/** Content fields whose edits can be scoped to a single occurrence. */
export const SCOPED_CONTENT_FIELDS = ["title", "body", "tags", "priority"] as const;

/**
 * Inject `recurrenceScope` into an update diff when the entity is a recurring
 * occurrence and at least one scoped content field is being changed. Returns the
 * diff unchanged otherwise.
 */
export function applyRecurrenceScope(
  diff: Record<string, unknown>,
  isRecurringOccurrence: boolean,
  scope: RecurrenceScope
): Record<string, unknown> {
  if (!isRecurringOccurrence) return diff;
  const hasContentChange = SCOPED_CONTENT_FIELDS.some((k) => k in diff);
  if (!hasContentChange) return diff;
  return { ...diff, recurrenceScope: scope };
}
