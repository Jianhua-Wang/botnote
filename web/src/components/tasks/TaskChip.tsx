import { Link } from "react-router-dom";
import type { Entity, Project } from "../../api/types";
import { PriorityIcon, StatusCircle } from "./icons";

export function TaskChip({ task, project }: { task: Entity; project?: Project }) {
  const href = project ? `/p/${project.key}/e/${task.id}` : "#";
  const overdue =
    task.dueAt &&
    new Date(task.dueAt).getTime() < Date.now() &&
    task.status !== "done" &&
    task.status !== "archived";

  return (
    <Link
      to={href}
      className={`group flex items-center gap-1 px-1 py-0.5 rounded text-xxs hover:bg-sidebarHover transition-colors ${
        overdue ? "bg-danger/5" : ""
      }`}
      title={task.title}
    >
      <StatusCircle status={task.status} size={10} />
      <span className={`truncate flex-1 min-w-0 ${task.status === "done" ? "line-through text-muted" : "text-ink2"}`}>
        {task.title}
      </span>
      {task.priority !== "none" && <PriorityIcon priority={task.priority} size={10} />}
    </Link>
  );
}
