import { format } from "date-fns";
import { useState } from "react";
import { useUpdateEntity } from "../../api/hooks";
import type { Entity, Project } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { PriorityIcon } from "../tasks/icons";
import { StatusToggleButton } from "../tasks/StatusToggleButton";
import { useModals } from "../../state/modals";

const COLUMNS: Array<{ status: string; label: string; intent: string }> = [
  { status: "open", label: "Todo", intent: "text-statusOpen" },
  { status: "in_progress", label: "In Progress", intent: "text-statusInProgress" },
  { status: "done", label: "Done", intent: "text-statusDone" },
  { status: "rejected", label: "Cancelled", intent: "text-statusRejected" }
];

export function KanbanBoard({
  tasks,
  project
}: {
  tasks: Entity[];
  project: Project;
}) {
  const update = useUpdateEntity();
  const { open } = useModals();
  const byStatus: Record<string, Entity[]> = {};
  for (const c of COLUMNS) byStatus[c.status] = [];
  for (const t of tasks) {
    const key = COLUMNS.find((c) => c.status === t.status)?.status ?? "open";
    byStatus[key]!.push(t);
  }

  function handleDrop(toStatus: string, taskId: string) {
    update.mutate({ id: taskId, fields: { status: toStatus } });
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="h-full flex gap-3 p-3 min-w-max">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            label={col.label}
            intent={col.intent}
            tasks={byStatus[col.status] ?? []}
            project={project}
            onDropTask={(id) => handleDrop(col.status, id)}
            onAdd={() => open({ kind: "quick-create", projectId: project.id })}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({
  label,
  intent,
  tasks,
  project,
  onDropTask,
  onAdd
}: {
  label: string;
  intent: string;
  tasks: Entity[];
  project: Project;
  onDropTask: (id: string) => void;
  onAdd: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`w-72 shrink-0 flex flex-col rounded-md border ${
        over ? "border-accent bg-accentSoft/30" : "border-line bg-sidebar/40"
      } transition-colors`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) onDropTask(id);
      }}
    >
      <div className="px-3 h-9 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${intent}`}>{label}</span>
          <span className="text-xxs text-faint tabular-nums">{tasks.length}</span>
        </div>
        <button
          className="text-faint hover:text-accent text-xs"
          onClick={onAdd}
          title="Add task"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
        {tasks.length === 0 ? (
          <div className="text-xxs text-faint text-center py-4">No tasks</div>
        ) : (
          tasks.map((t) => <KanbanCard key={t.id} task={t} project={project} />)
        )}
      </div>
    </div>
  );
}

function KanbanCard({ task, project }: { task: Entity; project: Project }) {
  const drawer = useDrawer();
  const overdue =
    task.dueAt &&
    new Date(task.dueAt).getTime() < Date.now() &&
    task.status !== "done" &&
    task.status !== "in_progress";
  const idLabel = task.sequenceId ? `${project.key}-${task.sequenceId}` : null;
  const visibleDate = task.status === "done" ? (task.completedAt ?? task.updatedAt) : task.dueAt;
  const visibleDateLabel = task.status === "done" ? "Completed" : "Due";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => drawer.open(task.id)}
      className="group bg-surface border border-line rounded p-2 cursor-grab active:cursor-grabbing hover:border-accent transition-colors"
    >
      <div className="flex items-start gap-1.5">
        <StatusToggleButton task={task} size={13} className="mt-0.5" />
        <span
          className={`flex-1 min-w-0 text-sm leading-snug ${
            task.status === "done"
              ? "text-muted line-through"
              : task.status === "rejected"
                ? "text-muted"
              : isUntitled(task)
                ? "italic text-muted"
                : "text-ink"
          }`}
        >
          {displayTitle(task)}
        </span>
        <PriorityIcon priority={task.priority} size={11} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xxs text-muted">
        {idLabel && <span className="font-mono tabular-nums">{idLabel}</span>}
        {visibleDate && (
          <span
            className={`tabular-nums ${overdue ? "text-danger font-medium" : ""}`}
            title={`${visibleDateLabel} ${new Date(visibleDate).toLocaleString()}`}
          >
            {format(new Date(visibleDate), "MMM d")}
          </span>
        )}
        {task.tags.slice(0, 2).map((t) => (
          <span key={t} className="chip !h-4 !text-[10px]">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
