import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { useUpdateEntity } from "../../api/hooks";
import type { Entity } from "../../api/types";
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

  const setStatus = (status: string) => {
    if (task.status === status) return;
    const previousStatus = task.status;
    onStatusChange?.(status);
    update.mutate(
      { id: task.id, fields: { status } },
      { onError: () => onStatusChange?.(previousStatus) }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            draggable={false}
            className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 -m-0.5 hover:bg-kumo-tint disabled:opacity-60 ${className}`}
            onClick={(e) => e.stopPropagation()}
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
          >
            <StatusCircle status={task.status} size={size} />
          </button>
        }
      />
      <DropdownMenu.Content align={align} onClick={(e) => e.stopPropagation()}>
        <DropdownMenu.RadioGroup value={task.status} onValueChange={(v) => setStatus(String(v))}>
          {TASK_STATUS_OPTIONS.map((status) => (
            <DropdownMenu.RadioItem key={status} value={status} closeOnClick className="gap-2">
              <StatusCircle status={status} size={12} />
              <span>{STATUS_LABEL[status] ?? status}</span>
              <DropdownMenu.RadioItemIndicator />
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
