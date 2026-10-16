import { ArrowBendLeftUpIcon } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import type { EntityRef, SubtaskCounts } from "../../api/types";
import { useDrawer } from "../../hooks/useDrawer";

/**
 * Points a sub-task at its parent. "inline" is a compact key chip for one-line
 * rows; "line" is a full-width, truncated "↰ KEY · title" line for cards.
 */
export function ParentChip({
  parent,
  variant = "inline",
  className = ""
}: {
  parent: EntityRef;
  variant?: "inline" | "line";
  className?: string;
}) {
  const drawer = useDrawer();
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    drawer.open(parent.id);
  };
  const tooltip = `Sub-task of ${parent.ref} · ${parent.title}`;

  if (variant === "line") {
    return (
      <button
        type="button"
        onClick={open}
        title={tooltip}
        className={`group/parent flex max-w-full items-center gap-1 text-left text-xxs text-kumo-subtle transition-colors hover:text-kumo-link ${className}`}
      >
        <ArrowBendLeftUpIcon size={11} className="shrink-0 text-kumo-placeholder group-hover/parent:text-kumo-link" />
        <span className="shrink-0 font-mono tabular-nums">{parent.ref}</span>
        <span className="truncate">{parent.title}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title={tooltip}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border border-kumo-line px-1 font-mono text-xxs leading-4 tabular-nums text-kumo-subtle transition-colors hover:border-kumo-brand hover:text-kumo-link ${className}`}
    >
      <ArrowBendLeftUpIcon size={10} className="shrink-0" />
      {parent.ref}
    </button>
  );
}

/**
 * A small ring plus "closed/total": green for closed sub-tasks, amber for
 * in-progress ones. `ringOnly` drops the numbers for tight spots.
 */
export function SubtaskProgress({
  counts,
  ringOnly = false,
  className = ""
}: {
  counts: SubtaskCounts;
  ringOnly?: boolean;
  className?: string;
}) {
  const { total, closed, inProgress } = counts;
  const complete = closed === total;
  const pct = (n: number) => (n / total) * 100;
  const summary = [
    `${closed} of ${total} sub-tasks closed`,
    inProgress > 0 && `${inProgress} in progress`
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xxs tabular-nums ${
        complete ? "text-kumo-success" : "text-kumo-subtle"
      } ${className}`}
      title={summary}
      aria-label={summary}
    >
      <svg width={12} height={12} viewBox="0 0 14 14" className="-rotate-90 shrink-0" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2" className="stroke-kumo-line" />
        {inProgress > 0 && (
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            strokeWidth="2"
            pathLength={100}
            strokeDasharray={`${pct(inProgress)} 100`}
            strokeDashoffset={-pct(closed)}
            className="stroke-(--color-kumo-warning)"
          />
        )}
        {closed > 0 && (
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            strokeWidth="2"
            pathLength={100}
            strokeDasharray={`${pct(closed)} 100`}
            className="stroke-(--color-kumo-success)"
          />
        )}
      </svg>
      {!ringOnly && `${closed}/${total}`}
    </span>
  );
}
