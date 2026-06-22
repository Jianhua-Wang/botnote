import { useUpdateEntity } from "../../api/hooks";
import type { Entity } from "../../api/types";
import { PopoverMenu } from "./PopoverMenu";
import { StatusCircle, STATUS_LABEL, TASK_STATUS_OPTIONS } from "./icons";

export function StatusPickerButton({
  task,
  size = 14,
  className = "",
  align = "start",
  onStatusChange
}: {
  task: Entity;
  size?: number;
  className?: string;
  align?: "start" | "end";
  onStatusChange?: (status: string) => void;
}) {
  const update = useUpdateEntity();

  return (
    <PopoverMenu
      align={align}
      trigger={
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
          disabled={update.isPending}
          title={`Change status (${STATUS_LABEL[task.status] ?? task.status})`}
          aria-label="Change status"
          aria-haspopup="menu"
        >
          <StatusCircle status={task.status} size={size} />
        </button>
      }
    >
      {(close) => (
        <>
          {TASK_STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              className="popover-item"
              role="menuitemradio"
              aria-checked={task.status === status}
              onClick={(e) => {
                e.stopPropagation();
                close();
                if (task.status === status) return;

                const previousStatus = task.status;
                onStatusChange?.(status);
                update.mutate(
                  { id: task.id, fields: { status } },
                  { onError: () => onStatusChange?.(previousStatus) }
                );
              }}
            >
              <StatusCircle status={status} size={12} />
              <span>{STATUS_LABEL[status] ?? status}</span>
              {task.status === status && <span className="ml-auto text-faint">✓</span>}
            </button>
          ))}
        </>
      )}
    </PopoverMenu>
  );
}
