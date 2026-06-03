import { format, isToday } from "date-fns";
import { Sunrise } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../api/hooks";
import type { Entity, Project } from "../api/types";
import { ProjectIcon } from "../components/ProjectIcon";
import { TaskRow } from "../components/tasks/TaskRow";
import { projectLookup } from "../components/tasks/utils";
import { useModals } from "../state/modals";

export function TodayPage() {
  const today = new Date();
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);

  const todayRange = useMemo(() => {
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    const to = new Date(today);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const { data, isLoading } = useTasksRange({
    from: todayRange.from,
    to: todayRange.to,
    includeBacklog: false,
    includeDone: false
  });

  const { open } = useModals();
  const overdue = data?.overdue ?? [];
  const scheduled = data?.scheduled ?? [];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <header className="flex items-baseline gap-3">
          <Sunrise size={18} className="text-accent" />
          <h1 className="text-lg font-semibold">Today</h1>
          <span className="text-xs text-muted">{format(today, "EEEE, MMM d")}</span>
        </header>

        {isLoading && <div className="text-sm text-muted">Loading…</div>}

        {!isLoading && (
          <>
            <Section
              title="Overdue"
              count={overdue.length}
              accent="text-danger"
              tasks={overdue}
              projectMap={projectMap}
            />
            <Section
              title={isToday(today) ? "Today" : format(today, "EEEE")}
              count={scheduled.length}
              accent="text-ink"
              tasks={scheduled}
              projectMap={projectMap}
              emptyAction={
                <button
                  className="text-accent text-xs hover:underline"
                  onClick={() => open({ kind: "quick-create" })}
                >
                  + add a task
                </button>
              }
            />
          </>
        )}
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
  projectMap: Map<string, Project>;
  emptyAction?: React.ReactNode;
}) {
  if (tasks.length === 0 && !emptyAction) return null;
  // Group by project.
  const groups = new Map<string | null, Entity[]>();
  for (const t of tasks) {
    const k = t.projectId ?? null;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className={`text-xs font-semibold ${accent}`}>{title}</h2>
        <span className="text-xxs text-faint tabular-nums">{count}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="text-xs text-muted py-1">{emptyAction ?? "Nothing here."}</div>
      ) : (
        <div className="border border-line rounded-md overflow-hidden bg-surface">
          {Array.from(groups.entries()).map(([projectId, items]) => {
            const project = projectId ? projectMap.get(projectId) : undefined;
            return (
              <div key={projectId ?? "_none"}>
                <div className="px-3 py-1 border-b border-lineSoft bg-sidebar/40 flex items-center gap-1.5 text-xxs">
                  {project ? (
                    <>
                      <ProjectIcon color={project.color} icon={project.icon} size={10} />
                      <span className="font-mono tabular-nums" style={{ color: project.color }}>
                        {project.key}
                      </span>
                      <span className="text-muted truncate">{project.name}</span>
                    </>
                  ) : (
                    <span className="text-faint">no project</span>
                  )}
                  <span className="text-faint ml-auto tabular-nums">{items.length}</span>
                </div>
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} project={project} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
