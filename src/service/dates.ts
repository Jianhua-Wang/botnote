/**
 * Snap an exact-midnight-UTC due date to noon UTC. Date-only intents (e.g.
 * "due 2026-06-03") arriving as `2026-06-03T00:00:00Z` would render as the
 * previous calendar day in any UTC-negative timezone. Noon UTC stays on the
 * intended day across UTC-12..UTC+11. Anything with a non-zero time
 * component is left alone — that's a real datetime, not a calendar date.
 */
export function normalizeDueAt(value: Date | null | undefined): Date | null {
  if (value == null) return null;
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    const noon = new Date(value);
    noon.setUTCHours(12);
    return noon;
  }
  return value;
}
