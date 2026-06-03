import { format, isToday } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import type { Entity } from "../../api/types";
import { useModals } from "../../state/modals";
import { TaskCard } from "./TaskCard";
import { projectLookup, viewRange } from "./utils";

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
    includeDone: false
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const { open } = useModals();

  const overdue = tasksData?.overdue ?? [];
  const today = tasksData?.scheduled ?? [];
  const isCurrentDay = isToday(anchor);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {isCurrentDay && overdue.length > 0 && (
          <Section
            title={`Overdue · ${overdue.length}`}
            color="text-rose-700"
            tasks={overdue}
            projectMap={projectMap}
          />
        )}

        <Section
          title={isCurrentDay ? `Today · ${format(anchor, "EEE MMM d")}` : format(anchor, "EEEE · MMM d")}
          color="text-ink"
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
  color,
  tasks,
  projectMap,
  emptyAction
}: {
  title: string;
  color: string;
  tasks: Entity[];
  projectMap: Map<string, ReturnType<typeof projectLookup> extends Map<string, infer P> ? P : never>;
  emptyAction?: React.ReactNode;
}) {
  return (
    <section>
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {tasks.length === 0 ? (
          <CheckCircle2 size={14} className="opacity-50" />
        ) : (
          <Circle size={14} />
        )}
        <h2 className="text-xs uppercase tracking-wider font-semibold">{title}</h2>
      </div>
      {tasks.length === 0 ? (
        <div className="text-sm text-muted">Nothing here. {emptyAction}</div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              project={t.projectId ? projectMap.get(t.projectId) : undefined}
              showTime
            />
          ))}
        </div>
      )}
    </section>
  );
}
