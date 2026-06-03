export type EntityKind =
  | "task"
  | "note"
  | "decision"
  | "doc"
  | "comment"
  | "log"
  | "memory";

export const ENTITY_KINDS: EntityKind[] = [
  "task",
  "note",
  "decision",
  "doc",
  "comment",
  "log",
  "memory"
];

export type ActorKind = "human" | "agent" | "system";
export const ACTOR_KINDS: ActorKind[] = ["human", "agent", "system"];

export type EdgeKind =
  | "blocks"
  | "references"
  | "supersedes"
  | "derives_from"
  | "replied_to"
  | "parent_of";

export interface Project {
  id: string;
  key: string;
  name: string;
  agentsMd: string;
  createdAt: string;
  updatedAt: string;
}

export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export const PRIORITY_LEVELS: Priority[] = ["urgent", "high", "medium", "low", "none"];

export interface Entity {
  id: string;
  projectId: string | null;
  kind: EntityKind;
  title: string;
  body: string;
  tags: string[];
  status: string;
  actorId: string | null;
  actorKind: ActorKind;
  idempotencyKey: string | null;
  parentId: string | null;
  bodyVec: number[] | null;
  metadata: Record<string, unknown>;
  dueAt: string | null;
  priority: Priority;
  sequenceId: number | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TasksRangeInput {
  from?: string | null;
  to?: string | null;
  projectIds?: string[] | null;
  includeBacklog?: boolean;
  includeDone?: boolean;
}

export interface TasksRangeResult {
  scheduled: Entity[];
  overdue: Entity[];
  backlog: Entity[];
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  key: string | null;
  createdAt: string;
}

export interface SearchHit {
  entity: Entity;
  score: number;
  components: {
    bm25?: number;
    cosine?: number;
    timeDecay?: number;
  };
}

export interface SearchResponse {
  hits: SearchHit[];
  embeddingUsed: boolean;
}

export interface OpeningBriefResponse {
  project: Project | null;
  agentsMd: string;
  pinnedNotes: Entity[];
  openTasks: Entity[];
  pendingDecisions: Entity[];
  recent: Entity[];
  generatedAt: string;
  markdown: string;
}

export interface WriteEntityInput {
  kind: EntityKind;
  projectId?: string | null;
  title: string;
  body?: string;
  tags?: string[];
  status?: string;
  parentId?: string | null;
  actorId?: string | null;
  actorKind?: ActorKind;
  metadata?: Record<string, unknown>;
  dueAt?: string | null;
  priority?: Priority;
  pinned?: boolean;
  idempotencyKey?: string | null;
}

export interface UpdateEntityInput {
  title?: string;
  body?: string;
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown>;
  dueAt?: string | null;
  priority?: Priority;
  pinned?: boolean;
}

export interface CreateProjectInput {
  key: string;
  name: string;
  agentsMd?: string;
}

export interface RecentInput {
  projectId?: string | null;
  since?: string | null;
  kinds?: EntityKind[] | null;
  limit?: number;
}

export interface SearchInput {
  query: string;
  projectId?: string | null;
  kind?: EntityKind | null;
  limit?: number;
}
