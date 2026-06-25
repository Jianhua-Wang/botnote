import type { Entity, Project } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { PriorityIcon, RecurrenceIcon } from "./icons";
import { StatusPickerButton } from "./StatusPickerButton";
import { isRecurring, isTaskOverdue } from "./utils";

export function TaskChip({ task, project }: { task: Entity; project?: Project }) {
  const drawer = useDrawer();
  const overdue = isTaskOverdue(task);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
      }}
      onClick={() => drawer.open(task.id)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        drawer.open(task.id);
      }}
      className={`group w-full text-left flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded text-xs hover:bg-sidebarHover transition-colors cursor-grab active:cursor-grabbing ${
        overdue ? "bg-danger/5" : ""
      }`}
      title={project ? `${project.key} · ${displayTitle(task)}` : displayTitle(task)}
    >
      <span
        className="w-[2px] self-stretch rounded-sm shrink-0"
        style={{ backgroundColor: project?.color ?? "#a8a8af" }}
      />
      <StatusPickerButton task={task} size={11} />
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
      {isRecurring(task) && <RecurrenceIcon size={11} className="text-faint" />}
      {task.priority !== "none" && <PriorityIcon priority={task.priority} size={11} />}
    </div>
  );
}
