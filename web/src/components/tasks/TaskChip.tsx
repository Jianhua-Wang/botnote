import type { Entity, Project, VirtualOccurrence } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { PriorityIcon, RecurrenceIcon } from "./icons";
import { StatusPickerButton } from "./StatusPickerButton";
import { isRecurring, isTaskOverdue } from "./utils";

/**
 * GhostChip renders a dimmed, non-interactive preview of a future recurring
 * task occurrence that has not yet been materialized. It is intentionally
 * pointer-events-none and has no interactive affordances (no checkbox, no
 * click handler, no drag, no tabIndex) so users cannot interact with it.
 */
export function GhostChip({ virtual: v, project }: { virtual: VirtualOccurrence; project?: Project }) {
  const title = v.title && v.title.trim() ? v.title : "Untitled";
  return (
    <div
      aria-label={`Upcoming — will be created automatically: ${title}`}
      className="pointer-events-none w-full text-left flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded text-xs opacity-40 border border-dashed border-current"
    >
      <span
        className="w-[2px] self-stretch rounded-sm shrink-0"
        style={{ backgroundColor: project?.color ?? "#a8a8af" }}
      />
      <span className="truncate flex-1 min-w-0 text-ink2 italic">{title}</span>
      <RecurrenceIcon size={11} className="text-faint" />
    </div>
  );
}

/**
 * Renders a day's ghost occurrences: a single ghost keeps its own chip, but
 * several on the same day collapse into one "+N recurring" chip so recurring
 * series don't drown out the real tasks.
 */
export function GhostChips({
  virtuals,
  projectMap
}: {
  virtuals: VirtualOccurrence[];
  projectMap: Map<string, Project>;
}) {
  if (virtuals.length === 0) return null;
  if (virtuals.length === 1) {
    const v = virtuals[0]!;
    return <GhostChip virtual={v} project={v.projectId ? projectMap.get(v.projectId) : undefined} />;
  }
  const titles = virtuals
    .map((v) => (v.title && v.title.trim() ? v.title : "Untitled"))
    .join("\n");
  return (
    <div
      title={titles}
      aria-label={`${virtuals.length} upcoming recurring tasks: ${titles}`}
      className="w-full flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded text-xs opacity-40 border border-dashed border-current"
    >
      <RecurrenceIcon size={11} className="text-faint shrink-0" />
      <span className="truncate flex-1 min-w-0 text-ink2 italic">
        +{virtuals.length} recurring
      </span>
    </div>
  );
}

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
