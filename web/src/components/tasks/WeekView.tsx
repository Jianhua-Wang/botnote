import { addDays, format, isSameWeek, isToday } from "date-fns";
import { useMemo } from "react";
import { useProjects, useTasksRange, useUpdateEntity } from "../../api/hooks";
import type { Entity, Project } from "../../api/types";
import { useModals } from "../../state/modals";
import { TaskChip } from "./TaskChip";
import { dayKey, daysBetween, groupTasksByDay, projectLookup, viewRange } from "./utils";

export function WeekView({
  anchor,
  projectIds
}: {
  anchor: Date;
  projectIds: string[] | null;
}) {
  const range = viewRange("week", anchor);
  // 8-day window: Mon-Sun of the anchor week + next Monday as a "peek" cell
  // so the bottom row also has 4 columns (matches the top row visually).
  const weekDays = daysBetween(range.from, range.to);
  const nextMonday = addDays(weekDays[weekDays.length - 1]!, 1);
  const days = [...weekDays, nextMonday];

  // Extend the query range by one day so next Monday's tasks come through.
  const queryTo = new Date(nextMonday);
  queryTo.setHours(23, 59, 59, 999);

  const { data: tasksData } = useTasksRange({
    from: range.from.toISOString(),
    to: queryTo.toISOString(),
    projectIds: projectIds ?? null,
    includeBacklog: false,
    // includeDone=true so each day cell can show "done/total" counts and the
    // chips list shows completed tasks (struck-through, à la Linear).
    includeDone: true
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const byDay = useMemo(() => groupTasksByDay(tasksData?.scheduled ?? []), [tasksData]);

  const topRow = days.slice(0, 4);
  const bottomRow = days.slice(4);

  return (
    <div className="h-full flex flex-col bg-bg">
      <DayRow days={topRow} byDay={byDay} projectMap={projectMap} anchor={anchor} />
      <DayRow days={bottomRow} byDay={byDay} projectMap={projectMap} anchor={anchor} />
    </div>
  );
}

function DayRow({
  days,
  byDay,
  projectMap,
  anchor
}: {
  days: Date[];
  byDay: Map<string, Entity[]>;
  projectMap: Map<string, Project>;
  anchor: Date;
}) {
  return (
    <div className="flex-1 min-h-0 flex border-b border-line last:border-b-0">
      {days.map((d) => {
        const tasks = byDay.get(dayKey(d)) ?? [];
        const outOfWeek = !isSameWeek(d, anchor, { weekStartsOn: 1 });
        return (
          <DayCell
            key={d.toISOString()}
            day={d}
            tasks={tasks}
            projectMap={projectMap}
            outOfWeek={outOfWeek}
          />
        );
      })}
    </div>
  );
}

function DayCell({
  day,
  tasks,
  projectMap,
  outOfWeek
}: {
  day: Date;
  tasks: Entity[];
  projectMap: Map<string, Project>;
  outOfWeek: boolean;
}) {
  const today = isToday(day);
  const { open } = useModals();
  const update = useUpdateEntity();

  // Exclude archived/rejected from both the chip list and the count — they're
  // soft-deleted and shouldn't clutter the day view.
  const active = tasks.filter((t) => t.status !== "archived" && t.status !== "rejected");
  const doneCount = active.filter((t) => t.status === "done").length;
  const totalCount = active.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task-id");
    if (!id) return;
    const due = new Date(day);
    due.setHours(12, 0, 0, 0);
    update.mutate({ id, fields: { dueAt: due.toISOString() } });
  }

  return (
    <div
      className={`flex-1 min-w-0 border-r border-lineSoft last:border-r-0 flex flex-col group/col ${
        today ? "bg-accentSoft/30" : outOfWeek ? "bg-sidebar/40" : "bg-surface"
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="px-3 py-1.5 flex items-baseline justify-between border-b border-lineSoft">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xxs uppercase tracking-wider text-muted">
            {format(day, "EEE")}
          </span>
          <span
            className={`text-sm tabular-nums font-semibold ${
              today ? "text-accent" : outOfWeek ? "text-muted" : "text-ink2"
            }`}
          >
            {format(day, "d")}
          </span>
          {totalCount > 0 && (
            <span
              className={`text-xxs tabular-nums ${
                allDone ? "text-statusDone font-medium" : "text-faint"
              }`}
              title={`${doneCount} done · ${totalCount} total`}
            >
              {doneCount}/{totalCount}
            </span>
          )}
          {outOfWeek && (
            <span className="text-xxs text-faint italic">next</span>
          )}
        </div>
        <button
          className="text-faint hover:text-accent text-xs opacity-0 group-hover/col:opacity-100"
          title="Add task"
          onClick={() => open({ kind: "quick-create" })}
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5 space-y-1">
        {active.length === 0 ? (
          <div className="text-xxs text-faint px-1 py-0.5">—</div>
        ) : (
          active.map((t) => (
            <TaskChip
              key={t.id}
              task={t}
              project={t.projectId ? projectMap.get(t.projectId) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
