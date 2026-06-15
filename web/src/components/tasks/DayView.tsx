import { format, isToday } from "date-fns";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import type { Entity } from "../../api/types";
import { useModals } from "../../state/modals";
import { TaskRow } from "./TaskRow";
import { compareByStatus, projectLookup, viewRange } from "./utils";

export function DayView({
  anchor,
  projectIds
}: {
  anchor: Date;
  projectIds: string[] | null;
}) {
  const range = viewRange("day", anchor);
  const { data: tasksData } = useTasksRange({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    projectIds: projectIds ?? null,
    includeBacklog: false,
    // includeDone=true so the day's completed work shows up on its
    // completion day, which is the primary daily review surface.
    includeDone: true
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const { open } = useModals();

  const overdue = tasksData?.overdue ?? [];
  // Same in_progress -> open -> done order as the week/month cells, so the
  // day's Today section reads consistently.
  const today = (tasksData?.scheduled ?? []).slice().sort(compareByStatus);
  const isCurrentDay = isToday(anchor);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto py-4">
        {isCurrentDay && overdue.length > 0 && (
          <Section
            title={`Overdue`}
            count={overdue.length}
            accent="text-danger"
            tasks={overdue}
            projectMap={projectMap}
          />
        )}

        <Section
          title={isCurrentDay ? "Today" : format(anchor, "EEEE")}
          count={today.length}
          accent="text-ink"
          tasks={today}
          projectMap={projectMap}
          emptyAction={
            <button
              className="text-accent text-xs hover:underline"
              onClick={() => open({ kind: "quick-create" })}
            >
              + add a task for this day
            </button>
          }
        />
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  tasks,
  projectMap,
  emptyAction
}: {
  title: string;
  count: number;
  accent: string;
  tasks: Entity[];
  projectMap: Map<string, ReturnType<typeof projectLookup> extends Map<string, infer P> ? P : never>;
  emptyAction?: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="px-4 py-1.5 flex items-baseline gap-2 sticky top-0 bg-bg z-10">
        <h2 className={`text-xs font-semibold ${accent}`}>{title}</h2>
        <span className="text-xxs text-faint tabular-nums">{count}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-2 text-xs text-muted">{emptyAction ?? "Nothing here."}</div>
      ) : (
        <div className="bg-surface border-y border-lineSoft">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              project={t.projectId ? projectMap.get(t.projectId) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
