/**
 * Tag pill that ellipsizes instead of overflowing its row. Tags are free-form,
 * so a long one ("screen-printing", "internal-linking") would otherwise push
 * the id/date out of a kanban card or wrap them mid-token. The full value stays
 * available as a tooltip.
 */
export function TagChip({ tag, className = "" }: { tag: string; className?: string }) {
  return (
    <span className={`chip shrink min-w-0 max-w-[8rem] ${className}`} title={tag}>
      <span className="truncate min-w-0">{tag}</span>
    </span>
  );
}
