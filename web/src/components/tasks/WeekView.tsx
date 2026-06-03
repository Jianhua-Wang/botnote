import { format, isToday } from "date-fns";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
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
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="grid grid-cols-7 min-w-[840px]">
        {days.map((d) => {
          const tasks = byDay.get(dayKey(d)) ?? [];
          const today = isToday(d);
          return (
            <div
              key={d.toISOString()}
              className={`border-r border-lineSoft last:border-r-0 bg-surface min-h-[calc(100vh-160px)] group/col`}
            >
              <div
                className={`px-2.5 py-1.5 border-b border-lineSoft flex items-baseline justify-between ${
                  today ? "bg-accentSoft/40" : ""
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xxs uppercase tracking-wider text-muted">
                    {format(d, "EEE")}
                  </span>
                  <span
                    className={`text-xs tabular-nums font-medium ${
                      today ? "text-accent" : "text-ink2"
                    }`}
                  >
                    {format(d, "d")}
                  </span>
                </div>
                <button
                  className="text-faint hover:text-accent text-xxs opacity-0 group-hover/col:opacity-100"
                  title="Add task"
                  onClick={() => open({ kind: "quick-create" })}
                >
                  +
                </button>
              </div>
              <div className="p-1 space-y-0.5">
                {tasks.length === 0 ? (
                  <div className="px-1.5 py-1 text-xxs text-faint">—</div>
                ) : (
                  tasks.map((t) => (
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
        })}
      </div>
    </div>
  );
}
