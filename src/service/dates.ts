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

/**
 * Resolve the calendar Y-M-D of `value` AS SEEN IN `timezone`, then return
 * noon UTC of that day. All-day recurrence occurrences must land on the
 * correct LOCAL calendar day (e.g. a UTC+0 rrule computed date at
 * 2026-06-23T00:00Z is still June 22nd in America/New_York) and then snap to
 * the noon-UTC date-only storage convention so the day stays stable across
 * all UTC-offset clients.
 *
 * Falls back to normalizeDueAt when the timezone is invalid or value is null.
 */
export function allDayDueAtInZone(
  value: Date | null | undefined,
  timezone: string
): Date | null {
  if (value == null) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(value);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (!y || !m || !d) return normalizeDueAt(value);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  } catch {
    return normalizeDueAt(value);
  }
}
