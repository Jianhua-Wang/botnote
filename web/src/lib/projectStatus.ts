import type { ProjectStatus } from "../api/types";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  watching: "Watching",
  paused: "Paused",
  archived: "Archived"
};

export const PROJECT_STATUS_HELP: Record<ProjectStatus, string> = {
  planned: "Committed, not started",
  active: "Currently being built",
  watching: "Built, in maintenance",
  paused: "Intentionally on hold",
  archived: "Hidden from active work"
};

export const PROJECT_STATUS_GROUPS: ProjectStatus[] = [
  "planned",
  "active",
  "watching",
  "paused",
  "archived"
];
