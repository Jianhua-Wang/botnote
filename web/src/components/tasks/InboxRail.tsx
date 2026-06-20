import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { useProjects, useTasksRange } from "../../api/hooks";
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
          inboxTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              project={t.projectId ? projectMap.get(t.projectId) : undefined}
              compact
            />
          ))
        )}
      </div>
    </aside>
  );
}
