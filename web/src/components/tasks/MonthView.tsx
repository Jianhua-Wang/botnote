import { format, isSameMonth, isToday } from "date-fns";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import { useModals } from "../../state/modals";
import { TaskChip } from "./TaskCard";
import { dayKey, daysBetween, groupTasksByDay, projectLookup, viewRange } from "./utils";

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
    includeDone: false
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const byDay = useMemo(() => groupTasksByDay(tasksData?.scheduled ?? []), [tasksData]);
  const { open } = useModals();

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-y border-line bg-sidebar">
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
            <div
              key={d.toISOString()}
              className={`bg-surface p-1 min-h-[100px] ${
                outOfMonth ? "opacity-40" : ""
              } ${today ? "ring-2 ring-accent ring-inset" : ""}`}
            >
              <div className="flex items-center justify-between mb-1 px-1">
                <span
                  className={`text-xxs ${
                    today ? "font-semibold text-accent" : "text-muted"
                  }`}
                >
                  {format(d, "d")}
                </span>
                <button
                  className="text-xxs text-faint hover:text-accent opacity-0 hover:opacity-100 group-hover:opacity-100"
                  onClick={() => open({ kind: "quick-create" })}
                  title="Add task"
                >
                  +
                </button>
              </div>
              <div className="space-y-0.5">
                {tasks.slice(0, 4).map((t) => (
                  <TaskChip
                    key={t.id}
                    task={t}
                    project={t.projectId ? projectMap.get(t.projectId) : undefined}
                  />
                ))}
                {tasks.length > 4 && (
                  <div className="text-xxs text-muted pl-1">+{tasks.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
