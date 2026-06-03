import { format } from "date-fns";
import { Link } from "react-router-dom";
import type { Entity, Project } from "../../api/types";
import { taskStyle } from "./utils";

export function TaskCard({
  task,
  project,
  showTime = false
}: {
  task: Entity;
  project?: Project;
  showTime?: boolean;
}) {
  const href = project ? `/p/${project.key}/e/${task.id}` : "#";
  const overdue =
    task.dueAt &&
    new Date(task.dueAt).getTime() < Date.now() &&
    task.status !== "done" &&
    task.status !== "archived";

  return (
    <Link
      to={href}
      className={`block px-2 py-1.5 rounded border text-xs leading-tight ${taskStyle(
        task.status
      )} hover:shadow-sm hover:-translate-y-px transition-all overflow-hidden`}
      title={task.title}
    >
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="mt-0.5 cursor-pointer"
          checked={task.status === "done"}
          readOnly
          onClick={(e) => e.preventDefault()}
        />
        <div className="flex-1 min-w-0">
          <div className={`truncate ${task.status === "done" ? "line-through" : ""}`}>
            {task.title}
          </div>
          <div className="flex items-center gap-1.5 text-xxs opacity-70 mt-0.5">
            {project && <span className="font-mono">{project.key}</span>}
            {showTime && task.dueAt && <span>{format(new Date(task.dueAt), "HH:mm")}</span>}
            {overdue && <span className="text-rose-600 font-medium">overdue</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TaskChip({ task, project }: { task: Entity; project?: Project }) {
  const href = project ? `/p/${project.key}/e/${task.id}` : "#";
  return (
    <Link
      to={href}
      className={`block truncate px-1 py-0.5 rounded text-xxs ${taskStyle(
        task.status
      )} hover:opacity-80`}
      title={`${task.title}${project ? ` · ${project.key}` : ""}`}
    >
      <span className={task.status === "done" ? "line-through opacity-70" : ""}>
        {task.title}
      </span>
    </Link>
  );
}
