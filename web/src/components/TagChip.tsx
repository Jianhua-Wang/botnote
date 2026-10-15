import { Badge } from "@cloudflare/kumo/components/badge";
import { cn } from "@cloudflare/kumo/utils";

/**
 * Tag pill that ellipsizes instead of overflowing its row. Tags are free-form,
 * so a long one ("screen-printing", "internal-linking") would otherwise push
 * the id/date out of a kanban card or wrap them mid-token. The full value stays
 * available as a tooltip.
 */
export function TagChip({ tag, className }: { tag: string; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("flex-initial shrink min-w-0 max-w-32 px-1.5 text-[11px]", className)}
    >
      <span className="truncate min-w-0" title={tag}>
        {tag}
      </span>
    </Badge>
  );
}
