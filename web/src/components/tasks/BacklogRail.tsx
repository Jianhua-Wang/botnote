import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
import { TaskCard } from "./TaskCard";
import { projectLookup } from "./utils";

export function BacklogRail({
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
  const backlog = tasksData?.backlog ?? [];

  if (collapsed) {
    return (
      <button
        className="shrink-0 w-8 border-l border-line bg-sidebar/50 hover:bg-sidebar flex flex-col items-center pt-2 gap-2 group"
        onClick={onToggle}
        title="Expand Backlog"
      >
        <Inbox size={14} className="text-muted group-hover:text-ink" />
        {backlog.length > 0 && (
          <div className="text-xxs text-muted bg-surface border border-line rounded-full w-5 h-5 flex items-center justify-center">
            {backlog.length}
          </div>
        )}
      </button>
    );
  }

  return (
    <aside className="shrink-0 w-72 border-l border-line bg-sidebar/30 flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between border-b border-line bg-sidebar">
        <div className="flex items-center gap-2 text-muted">
          <Inbox size={13} />
          <h2 className="text-xs font-medium">Backlog</h2>
          <span className="text-xxs text-faint">{backlog.length}</span>
        </div>
        <button
          onClick={onToggle}
          className="text-muted hover:text-ink text-xxs"
          title="Collapse"
        >
          →
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
        {backlog.length === 0 ? (
          <div className="text-xs text-muted text-center py-6">
            No undated tasks.
            <br />
            <span className="text-faint">
              Tasks without a due date land here.
            </span>
          </div>
        ) : (
          backlog.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              project={t.projectId ? projectMap.get(t.projectId) : undefined}
            />
          ))
        )}
      </div>
    </aside>
  );
}
