import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import type { Entity, Project } from "../../api/types";
import { TaskRow } from "./TaskRow";
import { projectLookup } from "./utils";

export function InboxRail({
  projectIds,
  collapsed,
  onToggle
}: {
  projectIds: string[] | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { data: tasksData } = useTasksRange({
    projectIds: projectIds ?? null,
    includeBacklog: true,
    includeDone: false
  });
  const { data: projects } = useProjects();
  const projectMap = useMemo(() => projectLookup(projects), [projects]);
  const inboxTasks = (tasksData?.backlog ?? []).filter((t) => t.status !== "rejected");

  // Group by project so rows don't need per-row project keys.
  const groups = useMemo(() => {
    const byProject = new Map<string | null, Entity[]>();
    for (const t of inboxTasks) {
      const key = t.projectId ?? null;
      const list = byProject.get(key);
      if (list) list.push(t);
      else byProject.set(key, [t]);
    }
    const entries: { project: Project | undefined; tasks: Entity[] }[] = [];
    for (const [pid, tasks] of byProject) {
      entries.push({ project: pid ? projectMap.get(pid) : undefined, tasks });
    }
    entries.sort((a, b) => {
      if (!a.project) return 1;
      if (!b.project) return -1;
      return a.project.key.localeCompare(b.project.key);
    });
    return entries;
  }, [inboxTasks, projectMap]);

  if (collapsed) {
    return (
      <button
        className="shrink-0 w-8 border-l border-line bg-sidebar/50 hover:bg-sidebar flex flex-col items-center pt-2 gap-2 group"
        onClick={onToggle}
        title="Expand Inbox"
      >
        <Inbox size={14} className="text-muted group-hover:text-ink" />
        {inboxTasks.length > 0 && (
          <div className="text-xxs text-muted bg-surface border border-line rounded-full w-5 h-5 flex items-center justify-center">
            {inboxTasks.length}
          </div>
        )}
      </button>
    );
  }

  return (
    <aside className="shrink-0 w-72 border-l border-line bg-surface flex flex-col">
      <div className="px-3 h-9 flex items-center justify-between border-b border-lineSoft">
        <div className="flex items-center gap-2 text-muted">
          <Inbox size={12} />
          <h2 className="text-xs font-medium text-ink2">Inbox</h2>
          <span className="text-xxs text-faint tabular-nums">{inboxTasks.length}</span>
        </div>
        <button
          onClick={onToggle}
          className="btn-ghost btn !h-6 !w-6 !p-0"
          title="Collapse"
        >
          →
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {inboxTasks.length === 0 ? (
          <div className="text-xs text-muted text-center py-8 px-4">
            No tasks without due date.
            <div className="text-faint mt-1">Tasks without due date appear here.</div>
          </div>
        ) : (
          groups.map(({ project, tasks }) => (
            <div key={project?.id ?? "none"}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1 bg-surface border-b border-lineSoft">
                <span className="font-mono text-xxs text-faint tabular-nums">
                  {project?.key ?? "—"}
                </span>
                <span className="text-xxs text-muted truncate">
                  {project?.name ?? "No project"}
                </span>
                <span className="ml-auto text-xxs text-faint tabular-nums">{tasks.length}</span>
              </div>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} project={project} showProject={false} compact />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
