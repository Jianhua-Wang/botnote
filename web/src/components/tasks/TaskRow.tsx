import { format } from "date-fns";
import { useUpdateEntity } from "../../api/hooks";
import type { Entity, Priority, Project } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";
import { useUndoableDelete } from "../../hooks/useUndoableDelete";
import { displayTitle, isUntitled } from "../../lib/entityTitle";
import { PriorityIcon, PRIORITY_LABEL, RecurrenceIcon } from "./icons";
import { PopoverMenu } from "./PopoverMenu";
import { StatusPickerButton } from "./StatusPickerButton";
import { isRecurring, isTaskOverdue } from "./utils";

const PRIORITY_OPTIONS: Priority[] = ["urgent", "high", "medium", "low", "none"];

export function TaskRow({
  task,
  project,
  showProject = true,
  compact = false
}: {
  task: Entity;
  project?: Project;
  showProject?: boolean;
  compact?: boolean;
}) {
  const drawer = useDrawer();
  const update = useUpdateEntity();
  const deleteWithUndo = useUndoableDelete();

  const idLabel = project && task.sequenceId ? `${project.key}-${task.sequenceId}` : null;
  const overdue = isTaskOverdue(task);
  const recurring = isRecurring(task);
  const visibleDate = task.status === "done" ? (task.completedAt ?? task.updatedAt) : task.dueAt;
  const visibleDateLabel = task.status === "done" ? "Completed" : "Due";

  return (
    <div
      className={`task-row group ${compact ? "!h-7 text-xs" : ""}`}
      onClick={() => drawer.open(task.id)}
    >
      <StatusPickerButton task={task} />

      {idLabel && !compact && (
        <span className="font-mono text-xxs text-faint tabular-nums shrink-0">{idLabel}</span>
      )}

      <span
        className={`flex-1 min-w-0 truncate ${
          task.status === "done"
            ? "text-muted line-through"
            : task.status === "rejected"
              ? "text-muted"
              : isUntitled(task)
                ? "text-muted italic"
                : "text-ink"
        }`}
      >
        {displayTitle(task)}
      </span>

      {/* Compact rows (inbox rail) give every pixel to the title. */}
      {!compact &&
        task.tags.slice(0, 2).map((t) => (
          <span key={t} className="chip shrink-0 hidden md:inline-flex">
            {t}
          </span>
        ))}

      {showProject && project && compact && (
        <span className="font-mono text-xxs text-faint shrink-0">{project.key}</span>
      )}

      {recurring && (
        <span className="shrink-0 text-faint" title="Recurring task">
          <RecurrenceIcon size={12} />
        </span>
      )}

      {visibleDate && (
        <span
          className={`text-xxs tabular-nums shrink-0 ${overdue ? "text-danger font-medium" : "text-muted"}`}
          title={`${visibleDateLabel} ${new Date(visibleDate).toLocaleString()}`}
        >
          {format(new Date(visibleDate), "MMM d")}
        </span>
      )}

      <PopoverMenu
        trigger={
          <button
            className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-line/40"
            onClick={(e) => e.stopPropagation()}
            title={PRIORITY_LABEL[task.priority]}
          >
            <PriorityIcon priority={task.priority} />
          </button>
        }
        align="end"
      >
        {(close) => (
          <>
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                className="popover-item"
                onClick={(e) => {
                  e.stopPropagation();
                  update.mutate({ id: task.id, fields: { priority: p } });
                  close();
                }}
              >
                <PriorityIcon priority={p} size={12} />
                <span>{PRIORITY_LABEL[p]}</span>
                {task.priority === p && <span className="ml-auto text-faint">✓</span>}
              </button>
            ))}
          </>
        )}
      </PopoverMenu>

      <button
        className="shrink-0 p-1 -m-1 rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          deleteWithUndo(task);
        }}
        title="Delete"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 8h4l.5-8M6 6.5v3.5M8 6.5v3.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
