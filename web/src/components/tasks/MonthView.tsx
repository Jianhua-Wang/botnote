import { format, isSameMonth, isToday } from "date-fns";
import { useMemo, useState } from "react";
import { useProjects, useTasksRange, useUpdateEntity } from "../../api/hooks";
import type { Entity, Project } from "../../api/types";
import { useModals } from "../../state/modals";
import { TaskChip } from "./TaskChip";
import { compareByStatus, dayKey, daysBetween, groupTasksByDay, projectLookup, viewRange } from "./utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({
  anchor,
  projectIds
}: {
  anchor: Date;
  projectIds: string[] | null;
}) {
  const range = viewRange("month", anchor);
  const days = daysBetween(range.from, range.to);
  const { data: tasksData } = useTasksRange({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    projectIds: projectIds ?? null,
    includeBacklog: false,
    // includeDone=true so each cell can show its done/total count.
    includeDone: true
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const byDay = useMemo(() => groupTasksByDay(tasksData?.scheduled ?? []), [tasksData]);

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-lineSoft bg-sidebar/50">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1 text-xxs uppercase tracking-wider text-muted text-center"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6 bg-line/30 gap-px overflow-y-auto scrollbar-thin">
        {days.map((d) => {
          const tasks = byDay.get(dayKey(d)) ?? [];
          const outOfMonth = !isSameMonth(d, anchor);
          const today = isToday(d);
          return (
            <DayCell
              key={d.toISOString()}
              day={d}
              tasks={tasks}
              projectMap={projectMap}
              outOfMonth={outOfMonth}
              today={today}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  day,
  tasks,
  projectMap,
  outOfMonth,
  today
}: {
  day: Date;
  tasks: Entity[];
  projectMap: Map<string, Project>;
  outOfMonth: boolean;
  today: boolean;
}) {
  const { open } = useModals();
  const update = useUpdateEntity();
  const [hovered, setHovered] = useState(false);

  // Drop archived/rejected — they shouldn't clutter the calendar. Sort
  // in_progress -> open ("todo") -> done so the cell's top chips are the
  // most actionable.
  const active = tasks
    .filter((t) => t.status !== "archived" && t.status !== "rejected")
    .slice()
    .sort(compareByStatus);
  const doneCount = active.filter((t) => t.status === "done").length;
  const totalCount = active.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setHovered(false);
    const id = e.dataTransfer.getData("text/task-id");
    if (!id) return;
    const due = new Date(day);
    due.setHours(12, 0, 0, 0);
    update.mutate({ id, fields: { dueAt: due.toISOString() } });
  }

  return (
    <div
      className={`group bg-surface p-1 min-h-[112px] flex flex-col transition-colors ${
        outOfMonth ? "opacity-50" : ""
      } ${
        hovered
          ? "ring-2 ring-accent ring-inset bg-accentSoft/40"
          : today
            ? "ring-1 ring-accent ring-inset bg-accentSoft/30"
            : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!hovered) setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className={`text-xs tabular-nums ${
              today ? "font-semibold text-accent" : "text-muted"
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
        </div>
        <button
          className="text-xs text-faint hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => open({ kind: "quick-create" })}
          title="Add task"
        >
          +
        </button>
      </div>
      <div className="flex-1 space-y-0.5 min-h-0 overflow-hidden">
        {active.slice(0, 4).map((t) => (
          <TaskChip
            key={t.id}
            task={t}
            project={t.projectId ? projectMap.get(t.projectId) : undefined}
          />
        ))}
        {active.length > 4 && (
          <div className="text-xxs text-muted pl-1">+{active.length - 4}</div>
        )}
      </div>
    </div>
  );
}
