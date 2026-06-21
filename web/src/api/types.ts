export type EntityKind = "task" | "note";
export const ENTITY_KINDS: EntityKind[] = ["task", "note"];

// Kinds the UI offers in QuickCreate. Mirrors the API surface — these are the
// only kinds the backend now accepts.
export const CREATABLE_KINDS: EntityKind[] = ["task", "note"];

export type ActorKind = "human" | "agent" | "system";
export const ACTOR_KINDS: ActorKind[] = ["human", "agent", "system"];

export type EdgeKind = "blocks" | "references" | "parent_of";

export interface Project {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string;
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
  title: string | null;
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
  completedAt: string | null;
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

export type EmbeddingProvider = "openai" | "openai_compatible";
export type EmbeddingApiKeySource = "settings" | "environment" | "injected" | null;
export type EmbeddingStatusReason =
  | "ready"
  | "disabled"
  | "missing_api_key"
  | "missing_base_url"
  | "injected"
  | "not_loaded";

export interface EmbeddingSettings {
  enabled: boolean;
  effectiveEnabled: boolean;
  provider: EmbeddingProvider;
  model: string;
  baseUrl: string | null;
  dimensions: number;
  apiKeyConfigured: boolean;
  settingsApiKeyConfigured: boolean;
  apiKeySource: EmbeddingApiKeySource;
  apiKeyPreview: string | null;
  statusReason: EmbeddingStatusReason;
  pendingCount: number;
  totalCount: number;
  embeddedCount: number;
  missingCount: number;
  updatedAt: string;
}

export interface UpdateEmbeddingSettingsInput {
  enabled?: boolean;
  provider?: EmbeddingProvider;
  model?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface EmbeddingBackfillResponse {
  enqueued: number;
  pendingCount: number;
  settings: EmbeddingSettings;
}

export interface OpeningBriefResponse {
  project: Project | null;
  agentsMd: string;
  pinnedNotes: Entity[];
  openTasks: Entity[];
  recent: Entity[];
  generatedAt: string;
  markdown: string;
}

export interface CreateTaskInput {
  projectId?: string | null;
  title: string;
  body?: string;
  tags?: string[];
  status?: string;
  parentId?: string | null;
  actorKind?: ActorKind;
  metadata?: Record<string, unknown>;
  dueAt?: string | null;
  priority?: Priority;
  idempotencyKey?: string | null;
}

export interface CreateNoteInput {
  projectId?: string | null;
  title?: string | null;
  body?: string;
  tags?: string[];
  parentId?: string | null;
  actorKind?: ActorKind;
  metadata?: Record<string, unknown>;
  pinned?: boolean;
  idempotencyKey?: string | null;
}

/** Convenience: the union the QuickCreate modal builds, with `kind` to route
 *  to /v1/tasks or /v1/notes. The client helper splits it for you. */
export type WriteEntityInput =
  | ({ kind: "task" } & CreateTaskInput)
  | ({ kind: "note" } & CreateNoteInput);

export interface UpdateEntityInput {
  title?: string | null;
  body?: string;
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
  dueAt?: string | null;
  priority?: Priority;
  pinned?: boolean;
}

export interface CreateProjectInput {
  key: string;
  name: string;
  color?: string;
  icon?: string;
  agentsMd?: string;
}

export interface UpdateProjectInput {
  name?: string;
  color?: string;
  icon?: string;
  agentsMd?: string;
}

export interface Token {
  id: string;
  name: string;
  prefix: string;
  plaintext: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedToken extends Token {
  /** Plaintext token. New tokens keep this available in Settings for copying. */
  plaintext: string;
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
