import type { Entity, Project } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { PriorityIcon, StatusCircle } from "./icons";

export function TaskChip({ task, project }: { task: Entity; project?: Project }) {
  const drawer = useDrawer();
  const overdue =
    task.dueAt &&
    new Date(task.dueAt).getTime() < Date.now() &&
    task.status !== "done" &&
    task.status !== "in_progress";

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
      }}
      onClick={() => drawer.open(task.id)}
      className={`group w-full text-left flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded text-xs hover:bg-sidebarHover transition-colors cursor-grab active:cursor-grabbing ${
        overdue ? "bg-danger/5" : ""
      }`}
      title={project ? `${project.key} · ${displayTitle(task)}` : displayTitle(task)}
    >
      <span
        className="w-[2px] self-stretch rounded-sm shrink-0"
        style={{ backgroundColor: project?.color ?? "#a8a8af" }}
      />
      <StatusCircle status={task.status} size={11} />
      <span
        className={`truncate flex-1 min-w-0 ${
          task.status === "done"
            ? "line-through text-muted"
            : task.status === "rejected"
              ? "text-muted"
            : isUntitled(task)
              ? "italic text-muted"
              : "text-ink2"
        }`}
      >
        {displayTitle(task)}
      </span>
      {task.priority !== "none" && <PriorityIcon priority={task.priority} size={11} />}
    </button>
  );
}
