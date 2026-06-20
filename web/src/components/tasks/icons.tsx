import type { Priority } from "../../api/types";

export function StatusCircle({
  status,
  size = 14
}: {
  status: string;
  size?: number;
}) {
  const stroke = "currentColor";
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-statusDone shrink-0">
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path
          d="M4 7.4L6.2 9.5L10 5.5"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-statusInProgress shrink-0">
        <circle cx="7" cy="7" r="6" stroke={stroke} strokeWidth="1.4" fill="none" />
        <path d="M7 1 a6 6 0 0 1 0 12 z" fill="currentColor" />
      </svg>
    );
  }
  if (status === "rejected") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-statusRejected shrink-0">
        <circle cx="7" cy="7" r="6" stroke={stroke} strokeWidth="1.4" fill="none" />
        <path d="M4 4l6 6M10 4l-6 6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="text-statusOpen shrink-0">
      <circle cx="7" cy="7" r="6" stroke={stroke} strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-prioUrgent shrink-0">
        <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
        <path d="M7 4v3.5M7 9.5h.01" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (priority === "high") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-prioHigh shrink-0">
        <rect x="2" y="8" width="2.5" height="4" rx="0.5" fill="currentColor" />
        <rect x="5.75" y="5" width="2.5" height="7" rx="0.5" fill="currentColor" />
        <rect x="9.5" y="2" width="2.5" height="10" rx="0.5" fill="currentColor" />
      </svg>
    );
  }
  if (priority === "medium") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-prioMedium shrink-0">
        <rect x="2" y="8" width="2.5" height="4" rx="0.5" fill="currentColor" />
        <rect x="5.75" y="5" width="2.5" height="7" rx="0.5" fill="currentColor" />
        <rect x="9.5" y="2" width="2.5" height="10" rx="0.5" opacity="0.3" fill="currentColor" />
      </svg>
    );
  }
  if (priority === "low") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="text-prioLow shrink-0">
        <rect x="2" y="8" width="2.5" height="4" rx="0.5" fill="currentColor" />
        <rect x="5.75" y="5" width="2.5" height="7" rx="0.5" opacity="0.3" fill="currentColor" />
        <rect x="9.5" y="2" width="2.5" height="10" rx="0.5" opacity="0.3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="text-faint shrink-0">
      <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority"
};

export const STATUS_LABEL: Record<string, string> = {
  open: "Todo",
  in_progress: "In progress",
  done: "Done",
  rejected: "Cancelled"
};

export const TASK_STATUS_OPTIONS = [
  "open",
  "in_progress",
  "done",
  "rejected"
] as const;
