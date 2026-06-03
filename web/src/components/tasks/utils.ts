import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek
} from "date-fns";
import type { Entity, Project } from "../../api/types";

export type CalendarView = "day" | "week" | "month";

export function viewRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    return { from: startOfDay(anchor), to: endOfDay(anchor) };
  }
  if (view === "week") {
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 })
    };
  }
  // month — extend to full weeks for grid coverage
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  return {
    from: startOfWeek(monthStart, { weekStartsOn: 1 }),
    to: endOfWeek(monthEnd, { weekStartsOn: 1 })
  };
}

export function moveAnchor(view: CalendarView, anchor: Date, dir: -1 | 0 | 1): Date {
  if (dir === 0) return new Date();
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addWeeks(anchor, dir);
  return addMonths(anchor, dir);
}

export function rangeLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") return format(anchor, "EEEE · MMMM d, yyyy");
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "MMMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return format(anchor, "MMMM yyyy");
}

/**
 * Decide which calendar day a task should render on.
 *   - done            → its actual completion day (completedAt), so the
 *                       timeline reflects when work shipped, not when it was
 *                       originally planned for.
 *   - in_progress     → today, rolling — surfaces active work even when the
 *                       due date is in the past or far future.
 *   - everything else → the due date (the planned day).
 *
 * Done tasks missing completedAt (pre-migration rows or other oddities) fall
 * back to updatedAt; if even that's missing they fall through to dueAt.
 */
export function displayDate(t: Entity): Date | null {
  if (t.status === "in_progress") return new Date();
  if (t.status === "done") {
    if (t.completedAt) return new Date(t.completedAt);
    if (t.updatedAt) return new Date(t.updatedAt);
  }
  return t.dueAt ? new Date(t.dueAt) : null;
}

export function groupTasksByDay(
  tasks: Entity[]
): Map<string, Entity[]> {
  const m = new Map<string, Entity[]>();
  for (const t of tasks) {
    const d = displayDate(t);
    if (!d) continue;
    const key = format(d, "yyyy-MM-dd");
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(t);
  }
  return m;
}

export function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function daysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cur = startOfDay(from);
  const end = endOfDay(to);
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function projectLookup(projects?: Project[]): Map<string, Project> {
  const m = new Map<string, Project>();
  projects?.forEach((p) => m.set(p.id, p));
  return m;
}

export const TASK_COLORS: Record<string, string> = {
  open: "bg-blue-50 border-blue-200 text-blue-900",
  in_progress: "bg-amber-50 border-amber-200 text-amber-900",
  done: "bg-emerald-50 border-emerald-200 text-emerald-900 opacity-70",
  archived: "bg-slate-50 border-slate-200 text-slate-500 opacity-60",
  rejected: "bg-rose-50 border-rose-200 text-rose-900 opacity-70"
};

export function taskStyle(status: string): string {
  return TASK_COLORS[status] ?? TASK_COLORS.open!;
}

export { format, isSameDay, isToday };
