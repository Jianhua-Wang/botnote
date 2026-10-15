import type { EntityKind } from "../api/types";

/** UI names for entity kinds. The API and MCP keep `note` and `comment`. */
export const KIND_LABEL: Record<EntityKind, string> = {
  task: "task",
  note: "memory",
  comment: "worklog",
  feedback: "feedback"
};
