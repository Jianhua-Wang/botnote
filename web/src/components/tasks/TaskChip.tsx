import { CaretDownIcon, CheckCircleIcon } from "@phosphor-icons/react";
import type { Entity, Project, VirtualOccurrence } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { ParentChip, SubtaskProgress } from "./hierarchy";
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
        style={{ backgroundColor: project?.color ?? "var(--text-color-kumo-placeholder)" }}
      />
      <span className="truncate flex-1 min-w-0 text-kumo-default italic">{title}</span>
      <RecurrenceIcon size={11} className="text-kumo-subtle" />
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
      <RecurrenceIcon size={11} className="text-kumo-subtle shrink-0" />
      <span className="truncate flex-1 min-w-0 text-kumo-default italic">
        +{virtuals.length} recurring
      </span>
    </div>
  );
}

/** Tooltip lines for a chip: its ref and title, then where it sits in the hierarchy. */
function chipTooltip(task: Entity, project?: Project): string {
  const ref = project && task.sequenceId ? `${project.key}-${task.sequenceId}` : project?.key;
  const lines = [ref ? `${ref} · ${displayTitle(task)}` : displayTitle(task)];
  if (task.parent) lines.push(`Sub-task of ${task.parent.ref} · ${task.parent.title}`);
  if (task.subtasks) lines.push(`${task.subtasks.closed} of ${task.subtasks.total} sub-tasks closed`);
  return lines.join("\n");
}

/**
 * A calendar task chip. The default chip carries status, priority and the
 * parent line for sub-tasks; `compact` keeps only the project bar, the title
 * and a sub-task ring, for month cells.
 */
export function TaskChip({
  task,
  project,
  compact = false
}: {
  task: Entity;
  project?: Project;
  compact?: boolean;
}) {
  const drawer = useDrawer();
  const overdue = isTaskOverdue(task);

  const title = (
    <span
      className={`truncate flex-1 min-w-0 ${
        task.status === "done"
          ? "line-through text-kumo-subtle"
          : task.status === "rejected"
            ? "text-kumo-subtle"
            : isUntitled(task)
              ? "italic text-kumo-subtle"
              : "text-kumo-default"
      }`}
    >
      {displayTitle(task)}
    </span>
  );

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
        if (e.target !== e.currentTarget) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        drawer.open(task.id);
      }}
      className={`group w-full text-left flex gap-1.5 pl-1 pr-1.5 rounded text-xs hover:bg-kumo-fill transition-colors cursor-grab active:cursor-grabbing ${
        compact ? "h-5 items-center" : "py-1"
      } ${overdue ? "bg-kumo-danger-tint" : ""}`}
      title={chipTooltip(task, project)}
    >
      <span
        className="w-[2px] self-stretch rounded-sm shrink-0"
        style={{ backgroundColor: project?.color ?? "var(--text-color-kumo-placeholder)" }}
      />
      {compact ? (
        <>
          {title}
          {task.subtasks && <SubtaskProgress counts={task.subtasks} ringOnly />}
        </>
      ) : (
        <div className="flex-1 min-w-0">
          {task.parent && <ParentChip parent={task.parent} variant="line" className="mb-0.5" />}
          <div className="flex items-center gap-1.5">
            <StatusPickerButton task={task} size={11} />
            {title}
            {task.subtasks && <SubtaskProgress counts={task.subtasks} />}
            {isRecurring(task) && <RecurrenceIcon size={11} className="text-kumo-subtle" />}
            {task.priority !== "none" && <PriorityIcon priority={task.priority} size={11} />}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Folds a day's closed tasks into one "N done" row; expanding it lists them
 * under the open ones.
 */
export function ClosedTasksToggle({
  tasks,
  expanded,
  onToggle
}: {
  tasks: Entity[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const rejected = tasks.filter((t) => t.status === "rejected").length;
  const done = tasks.length - rejected;
  const detail = [`${done} done`, rejected > 0 && `${rejected} cancelled`].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      title={detail}
      className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xxs text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default transition-colors"
    >
      <CheckCircleIcon size={12} weight="fill" className="shrink-0 text-kumo-success" />
      <span className="flex-1 text-left tabular-nums">
        {rejected > 0 ? `${tasks.length} closed` : `${done} done`}
      </span>
      <CaretDownIcon size={10} className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
    </button>
  );
}
