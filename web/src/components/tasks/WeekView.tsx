import { format, isToday } from "date-fns";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import { useModals } from "../../state/modals";
import { TaskCard } from "./TaskCard";
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
      <div className="grid grid-cols-7 border-t border-line min-w-[840px]">
        {days.map((d) => {
          const tasks = byDay.get(dayKey(d)) ?? [];
          const today = isToday(d);
          return (
            <div key={d.toISOString()} className="border-r border-line bg-surface min-h-[480px]">
              <div
                className={`px-3 py-2 border-b border-line flex items-baseline gap-2 ${
                  today ? "bg-accent/5" : ""
                }`}
              >
                <div className="text-xxs uppercase tracking-wider text-muted">
                  {format(d, "EEE")}
                </div>
                <div
                  className={`text-sm font-semibold ${
                    today ? "text-accent" : "text-ink"
                  }`}
                >
                  {format(d, "d")}
                </div>
                {today && (
                  <span className="text-xxs uppercase tracking-wider text-accent ml-auto">
                    today
                  </span>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {tasks.length === 0 ? (
                  <button
                    className="text-xxs text-faint hover:text-accent w-full text-left px-1 py-1"
                    onClick={() => open({ kind: "quick-create" })}
                  >
                    + add task
                  </button>
                ) : (
                  tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      project={t.projectId ? projectMap.get(t.projectId) : undefined}
                      showTime
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
