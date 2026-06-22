import { useUpdateEntity } from "../../api/hooks";
import type { Entity } from "../../api/types";
import { StatusCircle, STATUS_LABEL } from "./icons";

export function nextToggleStatus(status: string): string {
  return status === "done" ? "open" : "done";
}

export function statusToggleLabel(status: string): string {
  return status === "done" ? "Reopen" : "Mark done";
}

export function StatusToggleButton({
  task,
  size = 14,
  className = ""
}: {
  task: Entity;
  size?: number;
  className?: string;
}) {
  const update = useUpdateEntity();
  const nextStatus = nextToggleStatus(task.status);
  const label = statusToggleLabel(task.status);

  return (
    <button
      type="button"
      draggable={false}
      className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 -m-0.5 hover:bg-line/40 disabled:opacity-60 ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        update.mutate({ id: task.id, fields: { status: nextStatus } });
      }}
      disabled={update.isPending}
      title={`${label} (${STATUS_LABEL[task.status] ?? task.status})`}
      aria-label={label}
    >
      <StatusCircle status={task.status} size={size} />
    </button>
  );
}
